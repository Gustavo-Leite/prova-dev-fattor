import type { RequestListener } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { delay, http, HttpResponse, passthrough } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { InvoiceStatusLookupError } from "@/application/remittance/invoice-status-gateway";
import type { UpstreamStatusValue } from "@/infra/fattor/fattor-api.fixture.contract";
import {
  statusResponseBody,
  unknownStatusResponseBody,
} from "@/infra/fattor/fattor-api.fixture.contract";
import type { FattorGatewayOptions } from "@/infra/fattor/fattor-status-gateway";
import { createFattorStatusGateway } from "@/infra/fattor/fattor-status-gateway";

const baseUrl = "https://fattor.test/public/prova-dev";
const loginUrl = `${baseUrl}/login`;
const statusUrl = `${baseUrl}/status/:key`;
const credentials = { email: "demo@example.test", password: "test-password" };
const key = "35240300000000000199550010000000011234567890";
const fastRetries: FattorGatewayOptions = { retryBaseDelayMs: 1, random: () => 0 };

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

async function listenLocally(handler: RequestListener) {
  const localServer = createServer(handler);
  await new Promise<void>((resolve) => {
    localServer.listen(0, "127.0.0.1", resolve);
  });
  const { port } = localServer.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    close: () =>
      new Promise<void>((resolve) => {
        localServer.closeAllConnections();
        localServer.close(() => {
          resolve();
        });
      }),
  };
}

function statusJson(value: UpstreamStatusValue, invoiceAccessKey = key) {
  return HttpResponse.json(statusResponseBody(value, invoiceAccessKey));
}

function loginIssuing(...tokens: string[]) {
  let calls = 0;
  const handler = http.post(loginUrl, () => {
    const token = tokens[Math.min(calls, tokens.length - 1)] ?? "T1";
    calls++;
    return HttpResponse.json({ token, expires_in: 3600, type: "Bearer" });
  });
  return { handler, calls: () => calls };
}

function statusAnswering(
  respond: (token: string, attempt: number) => Response | Promise<Response>,
) {
  let attempts = 0;
  const tokens: string[] = [];
  const handler = http.get(statusUrl, ({ request }) => {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    tokens.push(token);
    attempts++;
    return respond(token, attempts);
  });
  return { handler, attempts: () => attempts, tokens };
}

function gateway(options: FattorGatewayOptions = fastRetries) {
  return createFattorStatusGateway({ baseUrl, ...credentials }, options);
}

function lookUp(options?: FattorGatewayOptions, signal = new AbortController().signal) {
  return gateway(options).findStatus(key, signal);
}

describe("createFattorStatusGateway lookups", () => {
  it("logs in with the configured credentials and sends the token and the key", async () => {
    let loginBody: unknown;
    let requestedKey: unknown;
    server.use(
      http.post(loginUrl, async ({ request }) => {
        loginBody = await request.json();
        return HttpResponse.json({ token: "T1", expires_in: 3600 });
      }),
      http.get(statusUrl, ({ request, params }) => {
        requestedKey = params.key;
        return request.headers.get("authorization") === "Bearer T1"
          ? statusJson("cancelada")
          : new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(lookUp()).resolves.toBe("cancelled");
    expect(loginBody).toEqual(credentials);
    expect(requestedKey).toBe(key);
  });

  it.each([
    ["autorizada", "authorized"],
    ["cancelada", "cancelled"],
    ["rejeitada", "rejected"],
    ["denegada", "denied"],
    ["nao_encontrada", "not_found"],
  ] as const)("maps the upstream value %s to %s", async (upstreamValue, status) => {
    server.use(
      loginIssuing("T1").handler,
      statusAnswering(() => statusJson(upstreamValue)).handler,
    );
    await expect(lookUp()).resolves.toBe(status);
  });

  it("reuses the token across lookups and logs in once for concurrent ones", async () => {
    const login = loginIssuing("T1");
    server.use(login.handler, statusAnswering(() => statusJson("autorizada")).handler);
    const shared = gateway();
    const signal = new AbortController().signal;

    await Promise.all(Array.from({ length: 5 }, () => shared.findStatus(key, signal)));
    await shared.findStatus(key, signal);

    expect(login.calls()).toBe(1);
  });
});

describe("createFattorStatusGateway authentication", () => {
  it("logs in again once when the token is rejected", async () => {
    const login = loginIssuing("T1", "T2");
    const status = statusAnswering((token) =>
      token === "T2" ? statusJson("autorizada") : new HttpResponse(null, { status: 401 }),
    );
    server.use(login.handler, status.handler);

    await expect(lookUp()).resolves.toBe("authorized");
    expect(login.calls()).toBe(2);
    expect(status.tokens).toEqual(["T1", "T2"]);
  });

  it("gives up when the new token is rejected too", async () => {
    const login = loginIssuing("T1", "T2", "T3");
    server.use(
      login.handler,
      statusAnswering(() => new HttpResponse(null, { status: 401 })).handler,
    );

    await expect(lookUp()).rejects.toMatchObject({ reason: "UPSTREAM_REJECTED_CREDENTIALS" });
    expect(login.calls()).toBe(2);
  });

  it("logs in once when concurrent lookups are rejected with the same token", async () => {
    const login = loginIssuing("T1", "T2", "T3");
    const status = statusAnswering((token) =>
      token === "T1" ? new HttpResponse(null, { status: 401 }) : statusJson("autorizada"),
    );
    server.use(login.handler, status.handler);
    const shared = gateway();
    const signal = new AbortController().signal;

    const results = await Promise.all(
      Array.from({ length: 5 }, () => shared.findStatus(key, signal)),
    );

    expect(results).toEqual(Array.from({ length: 5 }, () => "authorized"));
    expect(login.calls()).toBe(2);
    expect(status.tokens.filter((token) => token === "T2")).toHaveLength(5);
  });

  it.each([400, 401, 403])(
    "reports rejected credentials when the login answers %i",
    async (code) => {
      server.use(http.post(loginUrl, () => HttpResponse.json({ error: "x" }, { status: code })));
      await expect(lookUp()).rejects.toMatchObject({ reason: "UPSTREAM_REJECTED_CREDENTIALS" });
    },
  );

  it("retries a login that fails on the server side", async () => {
    let attempts = 0;
    server.use(
      http.post(loginUrl, () => {
        attempts++;
        return attempts === 1
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({ token: "T1", expires_in: 3600 });
      }),
      statusAnswering(() => statusJson("denegada")).handler,
    );

    await expect(lookUp()).resolves.toBe("denied");
    expect(attempts).toBe(2);
  });

  it("reports the service as unavailable when the login keeps failing", async () => {
    let attempts = 0;
    server.use(
      http.post(loginUrl, () => {
        attempts++;
        return new HttpResponse(null, { status: 500 });
      }),
    );
    await expect(lookUp()).rejects.toMatchObject({ reason: "UPSTREAM_UNAVAILABLE" });
    expect(attempts).toBe(3);
  });

  it("reports the service as unavailable when the login answers another client error", async () => {
    server.use(http.post(loginUrl, () => HttpResponse.json({ error: "x" }, { status: 404 })));
    await expect(lookUp()).rejects.toMatchObject({ reason: "UPSTREAM_UNAVAILABLE" });
  });

  it.each([
    ["an empty token", { token: "", expires_in: 3600 }],
    ["no expiry", { token: "T1" }],
    ["a negative expiry", { token: "T1", expires_in: -1 }],
  ])("reports a login response with %s as invalid", async (_description, body) => {
    server.use(http.post(loginUrl, () => HttpResponse.json(body)));
    await expect(lookUp()).rejects.toMatchObject({ reason: "UPSTREAM_INVALID_RESPONSE" });
  });

  it("logs in again when the token reaches the expiry informed by the login", async () => {
    let now = 0;
    let logins = 0;
    server.use(
      http.post(loginUrl, () => {
        logins++;
        return HttpResponse.json({ token: `T${String(logins)}`, expires_in: 120 });
      }),
      statusAnswering(() => statusJson("autorizada")).handler,
    );
    const shared = gateway({ ...fastRetries, now: () => now });
    const signal = new AbortController().signal;

    await shared.findStatus(key, signal);
    now = 59_000;
    await shared.findStatus(key, signal);
    expect(logins).toBe(1);
    now = 61_000;
    await shared.findStatus(key, signal);
    expect(logins).toBe(2);
  });
});

describe("createFattorStatusGateway failures", () => {
  it("retries server errors and succeeds when the server recovers", async () => {
    const status = statusAnswering((_token, attempt) =>
      attempt < 3
        ? new HttpResponse(null, { status: attempt === 1 ? 500 : 502 })
        : statusJson("autorizada"),
    );
    server.use(loginIssuing("T1").handler, status.handler);

    await expect(lookUp()).resolves.toBe("authorized");
    expect(status.attempts()).toBe(3);
  });

  it("reports the service as unavailable after the last retry", async () => {
    const status = statusAnswering(() => new HttpResponse(null, { status: 500 }));
    server.use(loginIssuing("T1").handler, status.handler);

    await expect(lookUp()).rejects.toMatchObject({ reason: "UPSTREAM_UNAVAILABLE" });
    expect(status.attempts()).toBe(3);
  });

  it("waits as long as Retry-After asks, within the maximum delay", async () => {
    const status = statusAnswering((_token, attempt) =>
      attempt === 1
        ? new HttpResponse(null, { status: 429, headers: { "retry-after": "1" } })
        : statusJson("autorizada"),
    );
    server.use(loginIssuing("T1").handler, status.handler);
    const startedAt = performance.now();

    await expect(lookUp({ ...fastRetries, maxRetryDelayMs: 40 })).resolves.toBe("authorized");
    const elapsed = performance.now() - startedAt;
    expect(elapsed).toBeGreaterThanOrEqual(35);
    expect(elapsed).toBeLessThan(500);
    expect(status.attempts()).toBe(2);
  });

  it("doubles the wait between retries", async () => {
    const status = statusAnswering((_token, attempt) =>
      attempt < 3 ? new HttpResponse(null, { status: 503 }) : statusJson("autorizada"),
    );
    server.use(loginIssuing("T1").handler, status.handler);
    const startedAt = performance.now();

    await expect(lookUp({ retryBaseDelayMs: 25, random: () => 1 })).resolves.toBe("authorized");
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(70);
  });

  it("does not retry other client errors", async () => {
    const status = statusAnswering(() => new HttpResponse(null, { status: 404 }));
    server.use(loginIssuing("T1").handler, status.handler);

    await expect(lookUp()).rejects.toMatchObject({ reason: "UPSTREAM_UNAVAILABLE" });
    expect(status.attempts()).toBe(1);
  });

  it("reports a timeout when the server does not answer in time", async () => {
    server.use(
      loginIssuing("T1").handler,
      statusAnswering(async () => {
        await delay(500);
        return statusJson("autorizada");
      }).handler,
    );
    await expect(lookUp({ ...fastRetries, timeoutMs: 30, retries: 0 })).rejects.toMatchObject({
      reason: "UPSTREAM_TIMEOUT",
    });
  });

  it("reports a network failure as unavailable", async () => {
    server.use(loginIssuing("T1").handler, statusAnswering(() => HttpResponse.error()).handler);
    await expect(lookUp({ ...fastRetries, retries: 0 })).rejects.toMatchObject({
      reason: "UPSTREAM_UNAVAILABLE",
    });
  });

  it.each([
    ["a body that is not JSON", () => new HttpResponse("oops", { status: 200 })],
    ["a body outside the contract", () => HttpResponse.json(unknownStatusResponseBody())],
    ["the status of another key", () => statusJson("autorizada", `9${key.slice(1)}`)],
  ])("reports %s as an invalid response", async (_description, respond) => {
    server.use(loginIssuing("T1").handler, statusAnswering(respond).handler);
    await expect(lookUp()).rejects.toMatchObject({ reason: "UPSTREAM_INVALID_RESPONSE" });
  });

  it("stops waiting for a retry as soon as the caller aborts", async () => {
    server.use(
      loginIssuing("T1").handler,
      statusAnswering(() => new HttpResponse(null, { status: 503 })).handler,
    );
    const controller = new AbortController();
    const startedAt = performance.now();
    const pending = lookUp({ retryBaseDelayMs: 10_000, random: () => 1 }, controller.signal);
    setTimeout(() => {
      controller.abort();
    }, 20);

    const error: unknown = await pending.catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(InvoiceStatusLookupError);
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });

  it.each([
    ["the login", "login"],
    ["the status", "status"],
  ] as const)("times out when %s body stalls, then recovers", async (_description, stalled) => {
    const stalledBody = () =>
      new HttpResponse(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"tok'));
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    server.use(
      stalled === "login" ? http.post(loginUrl, stalledBody) : loginIssuing("T1").handler,
      stalled === "status"
        ? http.get(statusUrl, stalledBody)
        : statusAnswering(() => statusJson("autorizada")).handler,
    );
    const shared = gateway({ ...fastRetries, timeoutMs: 50, retries: 0 });
    const signal = new AbortController().signal;

    await expect(shared.findStatus(key, signal)).rejects.toMatchObject({
      reason: "UPSTREAM_TIMEOUT",
    });
    server.resetHandlers(
      loginIssuing("T1").handler,
      statusAnswering(() => statusJson("autorizada")).handler,
    );
    await expect(shared.findStatus(key, signal)).resolves.toBe("authorized");
  });

  it("bounds the total time spent logging in", async () => {
    server.use(
      http.post(loginUrl, async () => {
        await delay(500);
        return HttpResponse.json({ token: "T1", expires_in: 3600 });
      }),
    );
    const startedAt = performance.now();
    await expect(
      lookUp({ ...fastRetries, timeoutMs: 1_000, loginTimeoutMs: 40 }),
    ).rejects.toMatchObject({ reason: "UPSTREAM_TIMEOUT" });
    expect(performance.now() - startedAt).toBeLessThan(400);
  });

  it("does not follow a redirect, so credentials never reach another host", async () => {
    const bodiesReceivedElsewhere: string[] = [];
    const elsewhere = await listenLocally((request, response) => {
      let body = "";
      request.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      request.on("end", () => {
        bodiesReceivedElsewhere.push(body);
        response
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ token: "EVIL", expires_in: 3600 }));
      });
    });
    const upstream = await listenLocally((_request, response) => {
      response.writeHead(307, { location: `${elsewhere.origin}/login` }).end();
    });
    server.use(
      http.all(`${upstream.origin}/*`, () => passthrough()),
      http.all(`${elsewhere.origin}/*`, () => passthrough()),
    );

    try {
      const realHttpGateway = createFattorStatusGateway(
        { baseUrl: upstream.origin, ...credentials },
        fastRetries,
      );
      await expect(
        realHttpGateway.findStatus(key, new AbortController().signal),
      ).rejects.toMatchObject({ reason: "UPSTREAM_UNAVAILABLE" });
      expect(bodiesReceivedElsewhere).toEqual([]);
    } finally {
      await Promise.all([upstream.close(), elsewhere.close()]);
    }
  });

  it.each([
    ["negative", "-5"],
    ["a date in the past", "Wed, 01 Jan 2020 00:00:00 GMT"],
  ])("retries at once when Retry-After is %s", async (_description, header) => {
    const status = statusAnswering((_token, attempt) =>
      attempt === 1
        ? new HttpResponse(null, { status: 503, headers: { "retry-after": header } })
        : statusJson("autorizada"),
    );
    server.use(loginIssuing("T1").handler, status.handler);
    const startedAt = performance.now();

    await expect(lookUp()).resolves.toBe("authorized");
    expect(performance.now() - startedAt).toBeLessThan(300);
  });

  it("stops waiting for a shared login when the caller aborts, without cancelling it", async () => {
    server.use(
      http.post(loginUrl, async () => {
        await delay(100);
        return HttpResponse.json({ token: "T1", expires_in: 3600 });
      }),
      statusAnswering(() => statusJson("autorizada")).handler,
    );
    const shared = gateway();
    const controller = new AbortController();
    const aborted = shared.findStatus(key, controller.signal);
    const patient = shared.findStatus(key, new AbortController().signal);
    const startedAt = performance.now();
    setTimeout(() => {
      controller.abort();
    }, 10);

    const error: unknown = await aborted.catch((caught: unknown) => caught);
    expect(performance.now() - startedAt).toBeLessThan(80);
    expect(error).not.toBeInstanceOf(InvoiceStatusLookupError);
    await expect(patient).resolves.toBe("authorized");
  });

  it("stops a request in progress as soon as the caller aborts", async () => {
    server.use(
      loginIssuing("T1").handler,
      statusAnswering(async () => {
        await delay(2_000);
        return statusJson("autorizada");
      }).handler,
    );
    const controller = new AbortController();
    const startedAt = performance.now();
    const pending = lookUp({ ...fastRetries, retries: 0 }, controller.signal);
    setTimeout(() => {
      controller.abort();
    }, 20);

    const error: unknown = await pending.catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(InvoiceStatusLookupError);
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });
});
