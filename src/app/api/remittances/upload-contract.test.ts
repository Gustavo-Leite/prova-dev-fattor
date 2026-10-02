import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { RemittanceCheckPolicy } from "@/application/remittance/check-remittance";
import { defaultRemittanceCheckPolicy } from "@/application/remittance/check-remittance";
import type { InvoiceStatusGateway } from "@/application/remittance/invoice-status-gateway";
import { createRemittanceUploadHandler } from "@/app/api/remittances/handle-remittance-upload";
import type { StatusStreamEvent } from "@/features/remittance/read-status-stream";
import { readStatusStream } from "@/features/remittance/read-status-stream";
import type { SubmitResult } from "@/features/remittance/submit-remittance";
import { submitRemittance } from "@/features/remittance/submit-remittance";

const sampleFilePath = path.join(import.meta.dirname, "../../../../_prova/meu_cnab.rem");
const sampleFile = new Uint8Array(readFileSync(sampleFilePath));
const appOrigin = "http://localhost";
const openedSessionPrefix = "opened:";
const validSessionCookie = `${openedSessionPrefix}user-session-token`;
const sampleLineNumbers = new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

function readSession(value: string | undefined): Promise<string | null> {
  return Promise.resolve(
    value?.startsWith(openedSessionPrefix) === true
      ? value.slice(openedSessionPrefix.length)
      : null,
  );
}

const authorizedGateway: InvoiceStatusGateway = {
  findStatus: () => Promise.resolve("authorized"),
};

interface ServerSetup {
  readonly maxUploadBytes?: number;
  readonly policy?: RemittanceCheckPolicy;
}

interface BrowserSetup {
  readonly sessionCookie?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly omitContentLength?: boolean;
  readonly replaceBody?: string;
}

interface ServerReply {
  readonly status: number;
  readonly body: unknown;
}

function connectToHandler(server: ServerSetup = {}, browser: BrowserSetup = {}) {
  const handleRemittanceUpload = createRemittanceUploadHandler({
    readSession,
    getGateway: () => authorizedGateway,
    ...server,
  });
  const replies: ServerReply[] = [];

  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input.toString(), appOrigin);
    const built = new Request(url, init);
    const body =
      browser.replaceBody === undefined
        ? new Uint8Array(await built.arrayBuffer())
        : new TextEncoder().encode(browser.replaceBody);
    const headers = new Headers(built.headers);
    headers.set("sec-fetch-site", "same-origin");
    if (browser.omitContentLength !== true) {
      headers.set("content-length", String(body.byteLength));
    }
    for (const [name, value] of Object.entries(browser.headers ?? {})) {
      headers.set(name, value);
    }
    const request = new Request(url, {
      method: built.method,
      body,
      headers,
      signal: built.signal,
    });
    const response = await handleRemittanceUpload(
      request,
      browser.sessionCookie ?? validSessionCookie,
    );
    replies.push({
      status: response.status,
      body: response.status === 200 ? undefined : await response.clone().json(),
    });
    return response;
  };

  return { fetch, replies };
}

function submit(
  fetch: typeof globalThis.fetch,
  content: Uint8Array<ArrayBuffer> | string = sampleFile,
): Promise<SubmitResult> {
  return submitRemittance(new File([content], "meu_cnab.rem"), {
    signal: new AbortController().signal,
    fetch,
  });
}

async function collect(events: AsyncIterable<StatusStreamEvent>): Promise<StatusStreamEvent[]> {
  const collected: StatusStreamEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

describe("remittance upload contract between the handler and the client", () => {
  it("delivers every status event of an accepted upload to the client", async () => {
    const connection = connectToHandler();

    const result = await submit(connection.fetch);

    expect(connection.replies).toEqual([{ status: 200, body: undefined }]);
    if (!result.ok) {
      throw new Error(`Upload rejected: ${result.error.code}`);
    }
    const events = await collect(
      readStatusStream(
        result.body,
        { lineNumbers: sampleLineNumbers },
        new AbortController().signal,
      ),
    );
    expect(events[0]).toEqual({ type: "started", total: sampleLineNumbers.size });
    expect(events.at(-1)).toEqual({ type: "completed" });
    const results = events.filter((event) => event.type === "result");
    expect(new Set(results.map((event) => event.lineNumber))).toEqual(sampleLineNumbers);
    expect(results).toHaveLength(sampleLineNumbers.size);
    for (const event of results) {
      expect(event).toMatchObject({ outcome: "status", status: "authorized" });
    }
  });

  it.each<{
    readonly name: string;
    readonly server?: ServerSetup;
    readonly browser?: BrowserSetup;
    readonly content?: string;
    readonly status: number;
    readonly code: string;
  }>([
    {
      name: "a cross-site request",
      browser: { headers: { "sec-fetch-site": "cross-site" } },
      status: 403,
      code: "CROSS_SITE_REQUEST",
    },
    {
      name: "a missing session",
      browser: { sessionCookie: "tampered" },
      status: 401,
      code: "SESSION_EXPIRED",
    },
    {
      name: "a request without content length",
      browser: { omitContentLength: true },
      status: 411,
      code: "LENGTH_REQUIRED",
    },
    {
      name: "a file over the upload limit",
      server: { maxUploadBytes: 100 },
      status: 413,
      code: "FILE_TOO_LARGE",
    },
    {
      name: "a malformed multipart body",
      browser: { replaceBody: "not multipart" },
      status: 400,
      code: "INVALID_REQUEST",
    },
    {
      name: "an invalid remittance file",
      content: "not a remittance\n",
      status: 422,
      code: "INVALID_FILE",
    },
    {
      name: "too many receivables",
      server: { policy: { ...defaultRemittanceCheckPolicy, maxReceivables: 5 } },
      status: 422,
      code: "TOO_MANY_RECEIVABLES",
    },
  ])("turns $name into the matching client error", async (scenario) => {
    const connection = connectToHandler(scenario.server, scenario.browser);

    const result = await submit(connection.fetch, scenario.content);

    expect(result.ok).toBe(false);
    const [reply] = connection.replies;
    expect(reply?.status).toBe(scenario.status);
    expect(reply?.body).toMatchObject({ code: scenario.code });
    expect(result).toEqual({ ok: false, error: reply?.body });
  });
});
