import { readFileSync } from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { defaultRemittanceCheckPolicy } from "@/application/remittance/check-remittance";
import type { InvoiceStatusGateway } from "@/application/remittance/invoice-status-gateway";
import type { RemittanceUploadDependencies } from "@/app/api/remittances/handle-remittance-upload";
import {
  createRemittanceUploadHandler,
  maxUploadBytes,
  multipartOverheadBytes,
} from "@/app/api/remittances/handle-remittance-upload";
import { POST } from "@/app/api/remittances/route";
import { createFattorStatusGateway } from "@/infra/fattor/fattor-status-gateway";

const routeBaseUrl = "https://fattor.test/public/prova-dev";

vi.mock("@/infra/env", () => ({
  getServerEnv: () => ({ fattorApi: { baseUrl: "https://fattor.test/public/prova-dev" } }),
}));

vi.mock("@/infra/fattor/fattor-status-gateway", () => ({
  createFattorStatusGateway: vi.fn((): InvoiceStatusGateway => ({
    findStatus: () => Promise.resolve("authorized"),
  })),
}));

const sampleFilePath = path.join(import.meta.dirname, "../../../../_prova/meu_cnab.rem");
const endpoint = "http://localhost/api/remittances";
const sessionToken = "user-session-token";

function trackingGateway(
  findStatus: InvoiceStatusGateway["findStatus"] = () => Promise.resolve("authorized"),
) {
  const signals: AbortSignal[] = [];
  const tokens: string[] = [];
  const gateway: InvoiceStatusGateway = {
    findStatus(key, signal) {
      signals.push(signal);
      return findStatus(key, signal);
    },
  };
  return {
    getGateway: (token: string) => {
      tokens.push(token);
      return gateway;
    },
    signals,
    tokens,
    created: () => tokens.length,
  };
}

function uploadHandler(dependencies: RemittanceUploadDependencies) {
  const handleRemittanceUpload = createRemittanceUploadHandler(dependencies);
  return (request: Request) => handleRemittanceUpload(request, sessionToken);
}

async function uploadRequest(
  fileContent: Uint8Array<ArrayBuffer> | string | null,
  options: { headers?: Record<string, string>; signal?: AbortSignal; field?: string } = {},
): Promise<Request> {
  const form = new FormData();
  if (fileContent !== null) {
    const bytes =
      typeof fileContent === "string" ? new TextEncoder().encode(fileContent) : fileContent;
    form.set(options.field ?? "file", new File([bytes], "remessa.rem"));
  }
  const encoded = new Response(form);
  const body = new Uint8Array(await encoded.arrayBuffer());
  return new Request(endpoint, {
    method: "POST",
    body,
    signal: options.signal,
    headers: {
      "content-type": encoded.headers.get("content-type") ?? "",
      "content-length": String(body.byteLength),
      ...options.headers,
    },
  });
}

async function readLines(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as unknown);
}

const sampleFile = new Uint8Array(readFileSync(sampleFilePath));

describe("remittance upload limits documented in docs/api.md", () => {
  it("keeps the documented values", () => {
    expect(maxUploadBytes).toBe(131_072);
    expect(defaultRemittanceCheckPolicy).toEqual({
      maxReceivables: 200,
      concurrency: 5,
      deadlineMs: 25_000,
    });
  });
});

describe("remittance upload request checks", () => {
  it.each(["cross-site", "same-site"])("refuses a request sent from a %s page", async (site) => {
    const tracker = trackingGateway();
    const handler = uploadHandler(tracker);
    const response = await handler(
      await uploadRequest(sampleFile, { headers: { "sec-fetch-site": site } }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ code: "CROSS_SITE_REQUEST" });
    expect(tracker.created()).toBe(0);
  });

  it.each(["same-origin", "none"])("accepts a request whose fetch site is %s", async (site) => {
    const handler = uploadHandler(trackingGateway());
    const response = await handler(
      await uploadRequest(sampleFile, { headers: { "sec-fetch-site": site } }),
    );
    expect(response.status).toBe(200);
    await response.body?.cancel();
  });

  it.each([
    ["the opaque origin", "null", "localhost:3000"],
    ["another host", "https://evil.example", "localhost:3000"],
    ["another port", "http://localhost:4000", "localhost:3000"],
    ["something that is not a URL", "not a url", "localhost:3000"],
  ])("refuses a request whose Origin is %s", async (_description, origin, host) => {
    const tracker = trackingGateway();
    const request = await uploadRequest(sampleFile, { headers: { origin, host } });
    const response = await uploadHandler(tracker)(request);
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ code: "CROSS_SITE_REQUEST" });
    expect(request.bodyUsed).toBe(false);
    expect(tracker.created()).toBe(0);
  });

  it("refuses a cross-origin request before looking at the session", async () => {
    const response = await createRemittanceUploadHandler(trackingGateway())(
      await uploadRequest(sampleFile, {
        headers: { origin: "https://evil.example", host: "localhost:3000" },
      }),
      undefined,
    );
    expect(response.status).toBe(403);
  });

  it.each([
    ["one value", "app.example.com"],
    ["several values, using the first", "app.example.com, internal:3000"],
  ])(
    "compares the Origin with the forwarded host behind a proxy, given %s",
    async (_description, forwardedHost) => {
      const response = await uploadHandler(trackingGateway())(
        await uploadRequest(sampleFile, {
          headers: {
            origin: "https://app.example.com",
            host: "internal:3000",
            "x-forwarded-host": forwardedHost,
          },
        }),
      );
      expect(response.status).toBe(200);
      await response.body?.cancel();
    },
  );

  it("refuses an Origin that only matches the Host when a forwarded host is present", async () => {
    const response = await uploadHandler(trackingGateway())(
      await uploadRequest(sampleFile, {
        headers: {
          origin: "http://internal:3000",
          host: "internal:3000",
          "x-forwarded-host": "app.example.com",
        },
      }),
    );
    expect(response.status).toBe(403);
  });

  it.each([
    ["with the same host", { origin: "http://localhost:3000", host: "localhost:3000" }],
    ["from an IPv6 host", { origin: "http://[::1]:3000", host: "[::1]:3000" }],
    ["on the default port", { origin: "https://app.example.com", host: "app.example.com" }],
    ["whose Host is in uppercase", { origin: "http://localhost:3000", host: "LOCALHOST:3000" }],
    ["without an Origin", {}],
  ])("accepts a request %s", async (_description, headers) => {
    const response = await uploadHandler(trackingGateway())(
      await uploadRequest(sampleFile, { headers }),
    );
    expect(response.status).toBe(200);
    await response.body?.cancel();
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["malformed", "\n"],
  ])("asks to sign in again when the session cookie is %s", async (_description, token) => {
    const tracker = trackingGateway();
    const request = await uploadRequest(sampleFile);
    const response = await createRemittanceUploadHandler(tracker)(request, token);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ code: "SESSION_EXPIRED" });
    expect(request.bodyUsed).toBe(false);
    expect(tracker.created()).toBe(0);
  });

  it("checks the statuses with the token of the session cookie", async () => {
    const tracker = trackingGateway();
    const response = await createRemittanceUploadHandler(tracker)(
      await uploadRequest(sampleFile),
      "another-session-token",
    );
    expect(response.status).toBe(200);
    await response.text();
    expect(tracker.tokens).toEqual(["another-session-token"]);
  });

  it("wires the route to a gateway built with the session cookie and the API base URL", async () => {
    const request = await uploadRequest(sampleFile, {
      headers: { cookie: "session=route-session-token" },
    });
    const response = await POST(new NextRequest(request));
    expect(response.status).toBe(200);
    await response.text();
    expect(createFattorStatusGateway).toHaveBeenCalledWith({
      baseUrl: routeBaseUrl,
      token: "route-session-token",
    });
  });

  it.each([
    ["missing", null],
    ["not a number", "12abc"],
  ])("asks for the length when Content-Length is %s", async (_description, value) => {
    const request = await uploadRequest(sampleFile);
    const headers = new Headers(request.headers);
    if (value === null) {
      headers.delete("content-length");
    } else {
      headers.set("content-length", value);
    }
    const response = await uploadHandler(trackingGateway())(new Request(request, { headers }));
    expect(response.status).toBe(411);
    expect(await response.json()).toEqual({ code: "LENGTH_REQUIRED" });
  });

  it("refuses a declared length above the limit before reading the body", async () => {
    const request = new Request(endpoint, {
      method: "POST",
      body: "x",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        "content-length": String(maxUploadBytes + multipartOverheadBytes + 1),
      },
    });
    const response = await uploadHandler(trackingGateway())(request);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ code: "FILE_TOO_LARGE", maxBytes: maxUploadBytes });
    expect(request.bodyUsed).toBe(false);
  });

  it.each([
    [maxUploadBytes, 422],
    [maxUploadBytes + 1, 413],
  ])("with a %i byte file answers %i", async (size, status) => {
    const response = await uploadHandler(trackingGateway())(
      await uploadRequest(new Uint8Array(size).fill(0x30)),
    );
    expect(response.status).toBe(status);
  });

  it("refuses a body that is not multipart", async () => {
    const body = JSON.stringify({ file: "x" });
    const response = await uploadHandler(trackingGateway())(
      new Request(endpoint, {
        method: "POST",
        body,
        headers: { "content-type": "application/json", "content-length": String(body.length) },
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_REQUEST" });
  });

  it.each([
    ["without a file", null, "file"],
    ["with the file under another field", "0", "document"],
  ])("refuses a form %s", async (_description, content, field) => {
    const response = await uploadHandler(trackingGateway())(
      await uploadRequest(content, { field }),
    );
    expect(response.status).toBe(400);
  });

  it("refuses a form with more than one file", async () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(sampleFile)], "first.rem"));
    form.append("file", new File([new Uint8Array(sampleFile)], "second.rem"));
    const encoded = new Response(form);
    const body = new Uint8Array(await encoded.arrayBuffer());
    const tracker = trackingGateway();
    const response = await uploadHandler(tracker)(
      new Request(endpoint, {
        method: "POST",
        body,
        headers: {
          "content-type": encoded.headers.get("content-type") ?? "",
          "content-length": String(body.byteLength),
        },
      }),
    );
    expect(response.status).toBe(400);
    expect(tracker.signals).toHaveLength(0);
  });

  it("reads a body declared exactly at the limit plus the multipart margin", async () => {
    const request = await uploadRequest(sampleFile);
    const headers = new Headers(request.headers);
    headers.set("content-length", String(maxUploadBytes + multipartOverheadBytes));
    const body = new Uint8Array(await request.arrayBuffer());
    const response = await uploadHandler(trackingGateway())(
      new Request(endpoint, { method: "POST", body, headers }),
    );
    expect(response.status).not.toBe(413);
    await response.body?.cancel();
  });

  it("refuses a form whose file field is plain text", async () => {
    const form = new FormData();
    form.set("file", "0".repeat(444));
    const encoded = new Response(form);
    const body = new Uint8Array(await encoded.arrayBuffer());
    const response = await uploadHandler(trackingGateway())(
      new Request(endpoint, {
        method: "POST",
        body,
        headers: {
          "content-type": encoded.headers.get("content-type") ?? "",
          "content-length": String(body.byteLength),
        },
      }),
    );
    expect(response.status).toBe(400);
  });
});

describe("remittance upload validation", () => {
  it("answers 422 with the parser errors for an invalid file", async () => {
    const tracker = trackingGateway();
    const response = await uploadHandler(tracker)(await uploadRequest("not a remittance\n"));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "INVALID_FILE", truncated: false });
    expect(tracker.created()).toBe(1);
    expect(tracker.signals).toHaveLength(0);
  });

  it("answers 422 when the file has more receivables than allowed", async () => {
    const handler = uploadHandler({
      ...trackingGateway(),
      policy: { ...defaultRemittanceCheckPolicy, maxReceivables: 5 },
    });
    const response = await handler(await uploadRequest(sampleFile));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ code: "TOO_MANY_RECEIVABLES", max: 5, actual: 10 });
  });
});

describe("remittance upload streaming", () => {
  it("streams one line per receivable between started and completed", async () => {
    const response = await uploadHandler(trackingGateway())(await uploadRequest(sampleFile));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    const lines = await readLines(response);
    expect(lines[0]).toEqual({ type: "started", total: 10 });
    expect(lines.at(-1)).toEqual({ type: "completed" });
    expect(lines.slice(1, -1)).toHaveLength(10);
    expect(lines[1]).toMatchObject({
      type: "result",
      outcome: "status",
      status: "authorized",
      invoiceAccessKey: expect.stringMatching(/^\d{44}$/) as string,
    });
  });

  it("sends only the protocol fields, never the raw record lines", async () => {
    const response = await uploadHandler(trackingGateway())(await uploadRequest(sampleFile));

    const results = (await readLines(response)).slice(1, -1);

    for (const result of results) {
      expect(Object.keys(result as object).sort()).toEqual([
        "hasValidCheckDigit",
        "invoiceAccessKey",
        "lineNumber",
        "outcome",
        "status",
        "type",
      ]);
    }
  });

  it("stops the lookups when the client stops reading", async () => {
    const tracker = trackingGateway(
      (_key, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              reject(new Error("aborted"));
            },
            { once: true },
          );
        }),
    );
    const response = await uploadHandler(tracker)(await uploadRequest(sampleFile));
    const reader = response.body?.getReader();
    await reader?.read();
    const pendingRead = reader?.read();
    await new Promise((resolve) => setTimeout(resolve, 10));

    await reader?.cancel();
    await pendingRead;

    expect(tracker.signals.length).toBeGreaterThan(0);
    expect(tracker.signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("ends the stream without completing when the request is aborted", async () => {
    const controller = new AbortController();
    const tracker = trackingGateway(
      (_key, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              reject(new Error("aborted"));
            },
            { once: true },
          );
        }),
    );
    const response = await uploadHandler(tracker)(
      await uploadRequest(sampleFile, { signal: controller.signal }),
    );
    setTimeout(() => {
      controller.abort();
    }, 10);

    expect(await readLines(response)).toEqual([{ type: "started", total: 10 }]);
  });
});
