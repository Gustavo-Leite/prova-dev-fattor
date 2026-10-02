import { describe, expect, it, vi } from "vitest";

import {
  abortable,
  discardBody,
  isSuccessStatus,
  parseJson,
  readCappedText,
} from "@/infra/fattor/upstream-response";

const encoder = new TextEncoder();

interface TrackedStream {
  readonly stream: ReadableStream<Uint8Array>;
  readonly wasCancelled: () => boolean;
}

function trackedStream(chunks: readonly Uint8Array[], close = true): TrackedStream {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      if (close) {
        controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, wasCancelled: () => cancelled };
}

function neverEndingSignal(): AbortSignal {
  return new AbortController().signal;
}

describe("isSuccessStatus", () => {
  it.each([
    [199, false],
    [200, true],
    [204, true],
    [299, true],
    [300, false],
    [404, false],
  ] as const)("treats %i as success: %s", (status, expected) => {
    expect(isSuccessStatus(status)).toBe(expected);
  });
});

describe("parseJson", () => {
  it("parses valid JSON", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns undefined for invalid JSON", () => {
    expect(parseJson("{not json")).toBeUndefined();
  });
});

describe("abortable", () => {
  it("resolves with the promise value while the signal stays open", async () => {
    await expect(abortable(Promise.resolve("value"), neverEndingSignal())).resolves.toBe("value");
  });

  it("propagates the promise rejection", async () => {
    const failure = new Error("boom");
    await expect(abortable(Promise.reject(failure), neverEndingSignal())).rejects.toBe(failure);
  });

  it("rejects at once when the signal is already aborted", async () => {
    const reason = new Error("already aborted");
    await expect(
      abortable(new Promise<never>(() => undefined), AbortSignal.abort(reason)),
    ).rejects.toBe(reason);
  });

  it("rejects when the signal aborts before the promise settles", async () => {
    const controller = new AbortController();
    const reason = new Error("aborted later");
    const pending = abortable(new Promise<never>(() => undefined), controller.signal);
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
  });

  it("removes its abort listener once the promise settles", async () => {
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, "addEventListener");
    const removed = vi.spyOn(controller.signal, "removeEventListener");

    await expect(abortable(Promise.resolve("value"), controller.signal)).resolves.toBe("value");

    const listener = added.mock.calls[0]?.[1];
    expect(listener).toBeDefined();
    await vi.waitFor(() => {
      expect(removed).toHaveBeenCalledWith("abort", listener);
    });
  });
});

describe("discardBody", () => {
  it("cancels the response body", () => {
    const tracked = trackedStream([encoder.encode("ignored")], false);
    discardBody(new Response(tracked.stream));
    expect(tracked.wasCancelled()).toBe(true);
  });

  it("tolerates a response without body", () => {
    expect(() => {
      discardBody(new Response(null, { status: 204 }));
    }).not.toThrow();
  });
});

describe("readCappedText", () => {
  const maxBytes = 8;

  it("returns an empty string when there is no body", async () => {
    await expect(
      readCappedText(new Response(null, { status: 204 }), neverEndingSignal(), maxBytes),
    ).resolves.toBe("");
  });

  it("returns the body when it fits under the cap", async () => {
    await expect(
      readCappedText(new Response("short"), neverEndingSignal(), maxBytes),
    ).resolves.toBe("short");
  });

  it("accepts a body exactly at the cap", async () => {
    const tracked = trackedStream([encoder.encode("1234"), encoder.encode("5678")]);
    await expect(
      readCappedText(new Response(tracked.stream), neverEndingSignal(), maxBytes),
    ).resolves.toBe("12345678");
  });

  it("refuses a declared content-length above the cap without reading it", async () => {
    const tracked = trackedStream([encoder.encode("123456789")], false);
    const response = new Response(tracked.stream, { headers: { "content-length": "9" } });
    await expect(readCappedText(response, neverEndingSignal(), maxBytes)).resolves.toBeNull();
    expect(tracked.wasCancelled()).toBe(true);
  });

  it("accepts a declared content-length equal to the cap", async () => {
    const response = new Response("12345678", { headers: { "content-length": "8" } });
    await expect(readCappedText(response, neverEndingSignal(), maxBytes)).resolves.toBe("12345678");
  });

  it.each([
    ["is missing", undefined],
    ["is not a number", "unknown"],
  ] as const)(
    "falls back to the streamed cap when content-length %s",
    async (_description, contentLength) => {
      const headers = new Headers();
      if (contentLength !== undefined) {
        headers.set("content-length", contentLength);
      }
      const fitting = trackedStream([encoder.encode("1234")]);
      const oversized = trackedStream([encoder.encode("12345"), encoder.encode("6789")], false);

      await expect(
        readCappedText(new Response(fitting.stream, { headers }), neverEndingSignal(), maxBytes),
      ).resolves.toBe("1234");
      await expect(
        readCappedText(new Response(oversized.stream, { headers }), neverEndingSignal(), maxBytes),
      ).resolves.toBeNull();
      expect(oversized.wasCancelled()).toBe(true);
    },
  );

  it("stops reading a streamed body once it passes the cap", async () => {
    const tracked = trackedStream([encoder.encode("12345"), encoder.encode("6789")], false);
    await expect(
      readCappedText(new Response(tracked.stream), neverEndingSignal(), maxBytes),
    ).resolves.toBeNull();
    expect(tracked.wasCancelled()).toBe(true);
  });

  it("decodes multi-byte characters split across chunks", async () => {
    const bytes = encoder.encode("éé");
    const tracked = trackedStream([bytes.slice(0, 1), bytes.slice(1)]);
    await expect(
      readCappedText(new Response(tracked.stream), neverEndingSignal(), maxBytes),
    ).resolves.toBe("éé");
  });

  it("rejects when the signal aborts while waiting for the body", async () => {
    const controller = new AbortController();
    const reason = new Error("timed out");
    const tracked = trackedStream([], false);
    const pending = readCappedText(new Response(tracked.stream), controller.signal, maxBytes);
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
  });
});
