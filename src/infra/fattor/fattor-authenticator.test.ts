import type { RequestListener } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { delay, http, HttpResponse, passthrough } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { maxTokenLength } from "@/infra/fattor/fattor-api.contract";
import type { FattorAuthenticatorOptions } from "@/infra/fattor/fattor-authenticator";
import {
  createFattorAuthenticator,
  maxLoginResponseBytes,
} from "@/infra/fattor/fattor-authenticator";

const baseUrl = "https://fattor.test/public/prova-dev";
const loginUrl = `${baseUrl}/login`;
const credentials = { email: "user@example.test", password: "test-password" };
const encoder = new TextEncoder();
const validLogin = JSON.stringify({ token: "T1", expires_in: 3600 });

function paddedLogin(totalBytes: number): Uint8Array {
  const skeleton = JSON.stringify({ token: "T1", expires_in: 3600, padding: "" });
  return encoder.encode(
    JSON.stringify({
      token: "T1",
      expires_in: 3600,
      padding: "x".repeat(totalBytes - skeleton.length),
    }),
  );
}

function streamOfBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  const chunkSize = 4096;
  return new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
        controller.enqueue(bytes.slice(offset, offset + chunkSize));
      }
      controller.close();
    },
  });
}

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

function loginAnswering(respond: () => Response | Promise<Response>) {
  let calls = 0;
  const handler = http.post(loginUrl, () => {
    calls++;
    return respond();
  });
  return { handler, calls: () => calls };
}

function signIn(options?: FattorAuthenticatorOptions) {
  return createFattorAuthenticator({ baseUrl }, options).signIn(credentials);
}

describe("createFattorAuthenticator", () => {
  it("posts the credentials as JSON and returns the issued token", async () => {
    let body: unknown;
    let contentType: string | null = null;
    server.use(
      http.post(loginUrl, async ({ request }) => {
        body = await request.json();
        contentType = request.headers.get("content-type");
        return HttpResponse.json({ token: "T1", expires_in: 3600, type: "Bearer" });
      }),
    );

    await expect(signIn()).resolves.toEqual({
      kind: "signed-in",
      token: "T1",
      expiresInSeconds: 3600,
    });
    expect(body).toEqual(credentials);
    expect(contentType).toBe("application/json");
  });

  it.each([400, 401, 403])("reports the credentials as rejected on %i", async (status) => {
    server.use(loginAnswering(() => HttpResponse.json({ message: "invalid" }, { status })).handler);

    await expect(signIn()).resolves.toEqual({ kind: "rejected" });
  });

  it.each([404, 429, 500, 502, 503])("reports the service as unavailable on %i", async (status) => {
    server.use(loginAnswering(() => new HttpResponse(null, { status })).handler);

    await expect(signIn()).resolves.toEqual({ kind: "unavailable" });
  });

  it("does not retry, so the user resubmitting is the only retry", async () => {
    const login = loginAnswering(() => new HttpResponse(null, { status: 503 }));
    server.use(login.handler);

    await expect(signIn()).resolves.toEqual({ kind: "unavailable" });
    expect(login.calls()).toBe(1);
  });

  it.each([
    ["a body that is not JSON", () => new HttpResponse("oops", { status: 200 })],
    ["a body without a token", () => HttpResponse.json({ expires_in: 3600 })],
    ["an expiry that is not positive", () => HttpResponse.json({ token: "T1", expires_in: 0 })],
  ])("reports %s as unavailable", async (_description, respond) => {
    server.use(loginAnswering(respond).handler);

    await expect(signIn()).resolves.toEqual({ kind: "unavailable" });
  });

  it.each([300, 302])("treats a %i carrying a valid login as unavailable", async (status) => {
    server.use(
      loginAnswering(() => HttpResponse.json({ token: "T1", expires_in: 3600 }, { status }))
        .handler,
    );

    await expect(signIn()).resolves.toEqual({ kind: "unavailable" });
  });

  it("accepts a token at the maximum length and refuses a longer one", async () => {
    server.use(
      loginAnswering(() =>
        HttpResponse.json({ token: "t".repeat(maxTokenLength), expires_in: 3600 }),
      ).handler,
    );
    await expect(signIn()).resolves.toMatchObject({ kind: "signed-in" });

    server.resetHandlers(
      loginAnswering(() =>
        HttpResponse.json({ token: "t".repeat(maxTokenLength + 1), expires_in: 3600 }),
      ).handler,
    );
    await expect(signIn()).resolves.toEqual({ kind: "unavailable" });
  });

  it("refuses a body declared larger than the limit without reading it", async () => {
    server.use(
      loginAnswering(
        () =>
          new HttpResponse(
            new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(validLogin));
              },
            }),
            {
              headers: {
                "content-type": "application/json",
                "content-length": String(maxLoginResponseBytes + 1),
              },
            },
          ),
      ).handler,
    );
    const startedAt = performance.now();

    await expect(signIn({ timeoutMs: 5_000 })).resolves.toEqual({ kind: "unavailable" });
    expect(performance.now() - startedAt).toBeLessThan(400);
  });

  it.each([
    [
      "at the limit",
      maxLoginResponseBytes,
      { kind: "signed-in", token: "T1", expiresInSeconds: 3600 },
    ],
    ["past the limit", maxLoginResponseBytes + 1, { kind: "unavailable" }],
  ] as const)("reads an undeclared body %s", async (_description, totalBytes, expected) => {
    server.use(
      loginAnswering(() => new HttpResponse(streamOfBytes(paddedLogin(totalBytes)))).handler,
    );

    await expect(signIn()).resolves.toEqual(expected);
  });

  it("reports a network failure as unavailable", async () => {
    server.use(loginAnswering(() => HttpResponse.error()).handler);

    await expect(signIn()).resolves.toEqual({ kind: "unavailable" });
  });

  it("gives up when the server does not answer in time", async () => {
    server.use(
      loginAnswering(async () => {
        await delay(500);
        return HttpResponse.json({ token: "T1", expires_in: 3600 });
      }).handler,
    );
    const startedAt = performance.now();

    await expect(signIn({ timeoutMs: 30 })).resolves.toEqual({ kind: "unavailable" });
    expect(performance.now() - startedAt).toBeLessThan(400);
  });

  it("gives up when the body stalls, bounding the read by the same timeout", async () => {
    server.use(
      loginAnswering(
        () =>
          new HttpResponse(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('{"tok'));
              },
            }),
            { headers: { "content-type": "application/json" } },
          ),
      ).handler,
    );
    const startedAt = performance.now();

    await expect(signIn({ timeoutMs: 50 })).resolves.toEqual({ kind: "unavailable" });
    expect(performance.now() - startedAt).toBeLessThan(400);
  });

  it("does not follow a redirect, so the credentials never reach another host", async () => {
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
      await expect(
        createFattorAuthenticator({ baseUrl: upstream.origin }).signIn(credentials),
      ).resolves.toEqual({ kind: "unavailable" });
      expect(bodiesReceivedElsewhere).toEqual([]);
    } finally {
      await Promise.all([upstream.close(), elsewhere.close()]);
    }
  });
});
