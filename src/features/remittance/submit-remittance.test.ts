import { describe, expect, it } from "vitest";

import { remittancesEndpoint, submitRemittance } from "@/features/remittance/submit-remittance";

const file = new File(["remittance"], "meu_cnab.rem");

function respondWith(response: Response | (() => Promise<Response>)) {
  const requests: Request[] = [];
  const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    requests.push(new Request(new URL(url, "http://localhost"), init));
    return typeof response === "function" ? response() : Promise.resolve(response);
  };
  return { fetch, requests };
}

function submit(fetch: typeof globalThis.fetch, signal = new AbortController().signal) {
  return submitRemittance(file, { signal, fetch });
}

describe("submitRemittance", () => {
  it("posts the file as multipart and returns the stream on success", async () => {
    const api = respondWith(new Response("{}\n", { status: 200 }));

    const result = await submit(api.fetch);

    expect(result.ok).toBe(true);
    const [request] = api.requests;
    expect(request?.method).toBe("POST");
    expect(new URL(request?.url ?? "").pathname).toBe(remittancesEndpoint);
    const sent = (await request?.formData())?.get("file");
    expect(sent).toBeInstanceOf(File);
    expect((sent as File).name).toBe("meu_cnab.rem");
  });

  it.each([
    [400, { code: "INVALID_REQUEST" }],
    [401, { code: "SESSION_EXPIRED" }],
    [403, { code: "CROSS_SITE_REQUEST" }],
    [411, { code: "LENGTH_REQUIRED" }],
    [413, { code: "FILE_TOO_LARGE", maxBytes: 131_072 }],
    [422, { code: "TOO_MANY_RECEIVABLES", max: 200, actual: 250 }],
    [
      422,
      {
        code: "INVALID_FILE",
        errors: [
          { code: "INVALID_LINE_LENGTH", lineNumber: 1, expected: 444, actual: 4 },
          { code: "UNEXPECTED_RECORD_TYPE", lineNumber: 1, expected: "0", actual: "x" },
          { code: "MISSING_DETAIL_RECORDS" },
        ],
        truncated: false,
      },
    ],
  ])("maps a %i response to its code", async (status, body) => {
    const result = await submit(respondWith(Response.json(body, { status })).fetch);
    expect(result).toEqual({ ok: false, error: body });
  });

  it.each([
    ["a body that is not JSON", new Response("<html>", { status: 502 }), 502],
    ["an unknown code", Response.json({ code: "TEAPOT" }, { status: 418 }), 418],
    [
      "an issue outside the parser contract",
      Response.json(
        { code: "INVALID_FILE", errors: [{ code: "SOMETHING_ELSE" }], truncated: false },
        { status: 422 },
      ),
      422,
    ],
    [
      "an issue missing its line",
      Response.json(
        { code: "INVALID_FILE", errors: [{ code: "INVALID_CHARACTERS" }], truncated: false },
        { status: 422 },
      ),
      422,
    ],
    [
      "a record type the parser never expects",
      Response.json(
        {
          code: "INVALID_FILE",
          errors: [{ code: "UNEXPECTED_RECORD_TYPE", lineNumber: 1, expected: "5", actual: "x" }],
          truncated: false,
        },
        { status: 422 },
      ),
      422,
    ],
    [
      "a limit that is not a number",
      Response.json({ code: "FILE_TOO_LARGE", maxBytes: "big" }, { status: 413 }),
      413,
    ],
  ])("reports %s as an unexpected response", async (_description, response, status) => {
    const result = await submit(respondWith(response).fetch);
    expect(result).toEqual({ ok: false, error: { code: "UNEXPECTED_RESPONSE", status } });
  });

  it.each([
    ["a network failure", new TypeError("Failed to fetch")],
    ["a file that can no longer be read", new DOMException("gone", "NotReadableError")],
  ])("reports %s as a network error", async (_description, error) => {
    const result = await submit(respondWith(() => Promise.reject(error)).fetch);
    expect(result).toEqual({ ok: false, error: { code: "NETWORK_ERROR" } });
  });

  it("reports an abort during the request as aborted, not as a network error", async () => {
    const controller = new AbortController();
    const api = respondWith(() => {
      controller.abort();
      return Promise.reject(new DOMException("aborted", "AbortError"));
    });
    expect(await submit(api.fetch, controller.signal)).toEqual({
      ok: false,
      error: { code: "ABORTED" },
    });
  });

  it("reports an abort while reading an error body as aborted", async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      pull() {
        controller.abort();
        throw new DOMException("aborted", "AbortError");
      },
    });
    const api = respondWith(new Response(body, { status: 422 }));
    expect(await submit(api.fetch, controller.signal)).toEqual({
      ok: false,
      error: { code: "ABORTED" },
    });
  });
});
