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
const statusUrl = `${baseUrl}/status/:key`;
const sessionToken = "user-session-token";
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

function statusAnswering(respond: (attempt: number) => Response | Promise<Response>) {
  let attempts = 0;
  const authorizations: (string | null)[] = [];
  const keys: unknown[] = [];
  const handler = http.get(statusUrl, ({ request, params }) => {
    authorizations.push(request.headers.get("authorization"));
    keys.push(params.key);
    attempts++;
    return respond(attempts);
  });
  return { handler, attempts: () => attempts, authorizations, keys };
}

function gateway(options: FattorGatewayOptions = fastRetries) {
  return createFattorStatusGateway({ baseUrl, token: sessionToken }, options);
}

function lookUp(options?: FattorGatewayOptions, signal = new AbortController().signal) {
  return gateway(options).findStatus(key, signal);
}

describe("createFattorStatusGateway lookups", () => {
  it("sends the session token as a bearer token and asks for the key", async () => {
    const status = statusAnswering(() => statusJson("cancelada"));
    server.use(status.handler);

    await expect(lookUp()).resolves.toBe("cancelled");
    expect(status.authorizations).toEqual([`Bearer ${sessionToken}`]);
    expect(status.keys).toEqual([key]);
  });

  it.each([
    ["autorizada", "authorized"],
    ["cancelada", "cancelled"],
    ["rejeitada", "rejected"],
    ["denegada", "denied"],
    ["nao_encontrada", "not_found"],
  ] as const)("maps the upstream value %s to %s", async (upstreamValue, status) => {
    server.use(statusAnswering(() => statusJson(upstreamValue)).handler);
    await expect(lookUp()).resolves.toBe(status);
  });
});

describe("createFattorStatusGateway authentication", () => {
  it("reports rejected credentials when the token is refused, without trying again", async () => {
    const status = statusAnswering(() => new HttpResponse(null, { status: 401 }));
    server.use(status.handler);

    await expect(lookUp()).rejects.toMatchObject({ reason: "UPSTREAM_REJECTED_CREDENTIALS" });
    expect(status.attempts()).toBe(1);
  });
});

describe("createFattorStatusGateway failures", () => {
  it("retries server errors and succeeds when the server recovers", async () => {
    const status = statusAnswering((attempt) =>
      attempt < 3
        ? new HttpResponse(null, { status: attempt === 1 ? 500 : 502 })
        : statusJson("autorizada"),
    );
    server.use(status.handler);

    await expect(lookUp()).resolves.toBe("authorized");
    expect(status.attempts()).toBe(3);
  });

  it("reports the service as unavailable after the last retry", async () => {
    const status = statusAnswering(() => new HttpResponse(null, { status: 500 }));
    server.use(status.handler);

    await expect(lookUp()).rejects.toMatchObject({ reason: "UPSTREAM_UNAVAILABLE" });
    expect(status.attempts()).toBe(3);
  });

  it("waits as long as Retry-After asks, within the maximum delay", async () => {
    const status = statusAnswering((attempt) =>
      attempt === 1
        ? new HttpResponse(null, { status: 429, headers: { "retry-after": "1" } })
        : statusJson("autorizada"),
    );
    server.use(status.handler);
    const startedAt = performance.now();

    await expect(lookUp({ ...fastRetries, maxRetryDelayMs: 40 })).resolves.toBe("authorized");
    const elapsed = performance.now() - startedAt;
    expect(elapsed).toBeGreaterThanOrEqual(35);
    expect(elapsed).toBeLessThan(500);
    expect(status.attempts()).toBe(2);
  });

  it("doubles the wait between retries", async () => {
    const status = statusAnswering((attempt) =>
      attempt < 3 ? new HttpResponse(null, { status: 503 }) : statusJson("autorizada"),
    );
    server.use(status.handler);
    const startedAt = performance.now();

    await expect(lookUp({ retryBaseDelayMs: 25, random: () => 1 })).resolves.toBe("authorized");
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(70);
  });

  it("does not retry other client errors", async () => {
    const status = statusAnswering(() => new HttpResponse(null, { status: 404 }));
    server.use(status.handler);

    await expect(lookUp()).rejects.toMatchObject({ reason: "UPSTREAM_UNAVAILABLE" });
    expect(status.attempts()).toBe(1);
  });

  it("reports a timeout when the server does not answer in time", async () => {
    server.use(
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
    server.use(statusAnswering(() => HttpResponse.error()).handler);
    await expect(lookUp({ ...fastRetries, retries: 0 })).rejects.toMatchObject({
      reason: "UPSTREAM_UNAVAILABLE",
    });
  });

  it.each([
    ["a body that is not JSON", () => new HttpResponse("oops", { status: 200 })],
    ["a body outside the contract", () => HttpResponse.json(unknownStatusResponseBody())],
    ["the status of another key", () => statusJson("autorizada", `9${key.slice(1)}`)],
  ])("reports %s as an invalid response", async (_description, respond) => {
    server.use(statusAnswering(respond).handler);
    await expect(lookUp()).rejects.toMatchObject({ reason: "UPSTREAM_INVALID_RESPONSE" });
  });

  it("stops waiting for a retry as soon as the caller aborts", async () => {
    server.use(statusAnswering(() => new HttpResponse(null, { status: 503 })).handler);
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

  it("times out when the status body stalls, then recovers", async () => {
    server.use(
      http.get(
        statusUrl,
        () =>
          new HttpResponse(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('{"situ'));
              },
            }),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const shared = gateway({ ...fastRetries, timeoutMs: 50, retries: 0 });
    const signal = new AbortController().signal;

    await expect(shared.findStatus(key, signal)).rejects.toMatchObject({
      reason: "UPSTREAM_TIMEOUT",
    });
    server.resetHandlers(statusAnswering(() => statusJson("autorizada")).handler);
    await expect(shared.findStatus(key, signal)).resolves.toBe("authorized");
  });

  it("does not follow a redirect, so the token never reaches another host", async () => {
    const authorizationsReceivedElsewhere: (string | undefined)[] = [];
    const elsewhere = await listenLocally((request, response) => {
      authorizationsReceivedElsewhere.push(request.headers.authorization);
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify(statusResponseBody("autorizada", key)));
    });
    const upstream = await listenLocally((request, response) => {
      response.writeHead(307, { location: `${elsewhere.origin}${request.url ?? "/"}` }).end();
    });
    server.use(
      http.all(`${upstream.origin}/*`, () => passthrough()),
      http.all(`${elsewhere.origin}/*`, () => passthrough()),
    );

    try {
      const realHttpGateway = createFattorStatusGateway(
        { baseUrl: upstream.origin, token: sessionToken },
        fastRetries,
      );
      await expect(
        realHttpGateway.findStatus(key, new AbortController().signal),
      ).rejects.toMatchObject({ reason: "UPSTREAM_UNAVAILABLE" });
      expect(authorizationsReceivedElsewhere).toEqual([]);
    } finally {
      await Promise.all([upstream.close(), elsewhere.close()]);
    }
  });

  it.each([
    ["negative", "-5"],
    ["a date in the past", "Wed, 01 Jan 2020 00:00:00 GMT"],
  ])("retries at once when Retry-After is %s", async (_description, header) => {
    const status = statusAnswering((attempt) =>
      attempt === 1
        ? new HttpResponse(null, { status: 503, headers: { "retry-after": header } })
        : statusJson("autorizada"),
    );
    server.use(status.handler);
    const startedAt = performance.now();

    await expect(lookUp()).resolves.toBe("authorized");
    expect(performance.now() - startedAt).toBeLessThan(300);
  });

  it("stops a request in progress as soon as the caller aborts", async () => {
    server.use(
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
