import { describe, expect, it } from "vitest";

import type { StatusStreamEvent } from "@/features/remittance/read-status-stream";
import { readStatusStream } from "@/features/remittance/read-status-stream";

const key = "35240300000000000199550010000000011234567890";
const expected = { lineNumbers: new Set([2, 3]) };

const started = { type: "started", total: 2 };
const authorized = {
  type: "result",
  lineNumber: 2,
  invoiceAccessKey: key,
  hasValidCheckDigit: true,
  outcome: "status",
  status: "authorized",
};
const timedOut = {
  type: "result",
  lineNumber: 3,
  invoiceAccessKey: key,
  hasValidCheckDigit: false,
  outcome: "failed",
  reason: "UPSTREAM_TIMEOUT",
};
const completed = { type: "completed" };
const interrupted = { type: "interrupted" };

function toLines(...events: unknown[]): string {
  return events.map((event) => `${JSON.stringify(event)}\n`).join("");
}

interface SourceOptions {
  readonly error?: unknown;
  readonly keepOpen?: boolean;
  readonly signal?: AbortSignal;
}

function streamOfBytes(chunks: readonly Uint8Array[], options: SourceOptions = {}) {
  let cancelled = false;
  let next = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[next++];
        if (chunk) {
          controller.enqueue(chunk);
        } else if (options.keepOpen === true) {
          return new Promise<void>(() => undefined);
        } else if (options.error === undefined) {
          controller.close();
        } else {
          controller.error(options.error);
        }
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, cancelled: () => cancelled };
}

async function collectBytes(chunks: readonly Uint8Array[], options: SourceOptions = {}) {
  const source = streamOfBytes(chunks, options);
  const events: StatusStreamEvent[] = [];
  const signal = options.signal ?? new AbortController().signal;
  for await (const event of readStatusStream(source.stream, expected, signal)) {
    events.push(event);
  }
  return { events, cancelled: source.cancelled };
}

function collect(chunks: readonly string[], options?: SourceOptions) {
  const encoder = new TextEncoder();
  return collectBytes(
    chunks.map((chunk) => encoder.encode(chunk)),
    options,
  );
}

describe("readStatusStream", () => {
  it("yields every event of a complete stream", async () => {
    const { events } = await collect([toLines(started, authorized, timedOut, completed)]);
    expect(events).toEqual([started, authorized, timedOut, completed]);
  });

  it("joins lines split across chunks and accepts CRLF", async () => {
    const text = toLines(started, authorized, timedOut, completed).replaceAll("\n", "\r\n");
    const chunks = [text.slice(0, 7), text.slice(7, 40), text.slice(40, 41), text.slice(41)];
    const { events } = await collect(chunks);
    expect(events).toEqual([started, authorized, timedOut, completed]);
  });

  it("decodes a multibyte character split between chunks", async () => {
    const accented = { ...authorized, invoiceAccessKey: "chave-é" };
    const bytes = new TextEncoder().encode(toLines(started, accented, timedOut, completed));
    const splitInsideAccent = bytes.indexOf(0xc3) + 1;
    const { events } = await collectBytes([
      bytes.slice(0, splitInsideAccent),
      bytes.slice(splitInsideAccent),
    ]);
    expect(events).toEqual([started, accented, timedOut, completed]);
  });

  it("reads a last line that has no line break", async () => {
    const { events } = await collect([
      toLines(started, authorized, timedOut),
      JSON.stringify(completed),
    ]);
    expect(events).toEqual([started, authorized, timedOut, completed]);
  });

  it("skips blank lines", async () => {
    const { events } = await collect([
      `\n${toLines(started)}\n\n${toLines(authorized, timedOut)}\r\n${toLines(completed)}`,
    ]);
    expect(events).toEqual([started, authorized, timedOut, completed]);
  });

  it("reports a stream that ends without completing as interrupted", async () => {
    const { events } = await collect([toLines(started, authorized)]);
    expect(events).toEqual([started, authorized, interrupted]);
  });

  it("stops at the fatal credentials failure", async () => {
    const failed = { type: "failed", reason: "UPSTREAM_REJECTED_CREDENTIALS" };
    const { events } = await collect([toLines(started, failed, authorized)]);
    expect(events).toEqual([started, failed]);
  });

  it("ignores anything sent after the stream completed", async () => {
    const { events, cancelled } = await collect(
      [toLines(started, authorized, timedOut, completed, authorized)],
      { keepOpen: true },
    );
    expect(events).toEqual([started, authorized, timedOut, completed]);
    expect(cancelled()).toBe(true);
  });

  it.each([
    ["a line that is not JSON", ["{oops\n", toLines(started, authorized, timedOut, completed)]],
    ["null", [toLines(started, null, authorized, timedOut, completed)]],
    ["an array", [toLines(started, [], authorized, timedOut, completed)]],
    ["a string", [toLines(started, "x", authorized, timedOut, completed)]],
    ["a result before started", [toLines(authorized, timedOut, completed)]],
    ["a second started", [toLines(started, started, authorized, timedOut, completed)]],
    [
      "a total that differs from the file",
      [toLines({ type: "started", total: 3 }, authorized, timedOut, completed)],
    ],
    ["a completion that misses results", [toLines(started, authorized, completed)]],
    [
      "an unknown status",
      [toLines(started, { ...authorized, status: "paid" }, timedOut, completed)],
    ],
    [
      "an unknown failure reason",
      [toLines(started, authorized, { ...timedOut, reason: "BOOM" }, completed)],
    ],
    [
      "a line number not in the file",
      [toLines(started, { ...timedOut, lineNumber: 9 }, authorized, completed)],
    ],
    [
      "a line number sent as text",
      [toLines(started, { ...authorized, lineNumber: "2" }, timedOut, completed)],
    ],
    ["the same line twice", [toLines(started, authorized, authorized, timedOut, completed)]],
    [
      "a key that is not a string",
      [toLines(started, { ...authorized, invoiceAccessKey: 1 }, timedOut, completed)],
    ],
    [
      "a check digit flag that is not a boolean",
      [toLines(started, { ...authorized, hasValidCheckDigit: "yes" }, timedOut, completed)],
    ],
    [
      "another fatal reason",
      [
        toLines(
          started,
          { type: "failed", reason: "UPSTREAM_TIMEOUT" },
          authorized,
          timedOut,
          completed,
        ),
      ],
    ],
    [
      "an unknown event type",
      [toLines(started, { type: "progress" }, authorized, timedOut, completed)],
    ],
  ])("turns %s into an interruption and stops", async (_description, chunks) => {
    const { events, cancelled } = await collect(chunks, { keepOpen: true });
    expect(events.at(-1)).toEqual(interrupted);
    expect(events).not.toContainEqual(completed);
    expect(cancelled()).toBe(true);
  });

  it("lets the server close a completed stream instead of cancelling it", async () => {
    const { events, cancelled } = await collect([
      toLines(started, authorized, timedOut),
      toLines(completed),
    ]);
    expect(events.at(-1)).toEqual(completed);
    expect(cancelled()).toBe(false);
  });

  it("waits through empty chunks for the server to close a completed stream", async () => {
    const { events, cancelled } = await collectBytes([
      new TextEncoder().encode(toLines(started, authorized, timedOut, completed)),
      new Uint8Array(),
      new TextEncoder().encode("\n"),
    ]);
    expect(events.at(-1)).toEqual(completed);
    expect(cancelled()).toBe(false);
  });

  it("cancels a completed stream that keeps sending data", async () => {
    const { events, cancelled } = await collect(
      [toLines(started, authorized, timedOut, completed), toLines(authorized)],
      { keepOpen: true },
    );
    expect(events.at(-1)).toEqual(completed);
    expect(cancelled()).toBe(true);
  });

  it("cancels the source when the consumer stops reading", async () => {
    const source = streamOfBytes([new TextEncoder().encode(toLines(started, authorized))], {
      keepOpen: true,
    });
    for await (const event of readStatusStream(
      source.stream,
      expected,
      new AbortController().signal,
    )) {
      expect(event).toEqual(started);
      break;
    }
    expect(source.cancelled()).toBe(true);
  });

  it("reports a connection that breaks as interrupted", async () => {
    const { events } = await collect([toLines(started)], { error: new TypeError("reset") });
    expect(events).toEqual([started, interrupted]);
  });

  it("ends silently when the read fails because the caller aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("user picked another file"));
    const { events } = await collect([toLines(started)], {
      error: new Error("user picked another file"),
      signal: controller.signal,
    });
    expect(events).toEqual([started]);
  });
});
