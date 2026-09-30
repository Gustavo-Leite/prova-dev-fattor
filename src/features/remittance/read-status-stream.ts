import type {
  ItemFailureReason,
  RemittanceStreamEvent,
} from "@/application/remittance/check-remittance";
import type { InvoiceStatus } from "@/domain/invoice/invoice-status";
import { invoiceStatuses } from "@/domain/invoice/invoice-status";

export type StatusStreamEvent = RemittanceStreamEvent | { readonly type: "interrupted" };

export interface ExpectedReceivables {
  readonly lineNumbers: ReadonlySet<number>;
}

const itemFailureReasons: readonly ItemFailureReason[] = [
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_UNAVAILABLE",
  "UPSTREAM_INVALID_RESPONSE",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInvoiceStatus(value: unknown): value is InvoiceStatus {
  return invoiceStatuses.some((status) => status === value);
}

function isItemFailureReason(value: unknown): value is ItemFailureReason {
  return itemFailureReasons.some((reason) => reason === value);
}

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return undefined;
  }
}

interface DecoderState {
  started: boolean;
  readonly seenLines: Set<number>;
}

function decodeEvent(
  raw: unknown,
  expected: ExpectedReceivables,
  state: DecoderState,
): RemittanceStreamEvent | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (raw.type === "started") {
    const { total } = raw;
    const isValid =
      !state.started && typeof total === "number" && total === expected.lineNumbers.size;
    if (isValid) {
      state.started = true;
    }
    return isValid ? { type: "started", total } : null;
  }
  if (!state.started) {
    return null;
  }
  if (raw.type === "completed") {
    return state.seenLines.size === expected.lineNumbers.size ? { type: "completed" } : null;
  }
  if (raw.type === "failed") {
    return raw.reason === "UPSTREAM_REJECTED_CREDENTIALS"
      ? { type: "failed", reason: raw.reason }
      : null;
  }
  if (raw.type !== "result") {
    return null;
  }
  const { lineNumber, invoiceAccessKey, hasValidCheckDigit } = raw;
  if (
    typeof lineNumber !== "number" ||
    !expected.lineNumbers.has(lineNumber) ||
    state.seenLines.has(lineNumber) ||
    typeof invoiceAccessKey !== "string" ||
    typeof hasValidCheckDigit !== "boolean"
  ) {
    return null;
  }
  const receivable = { lineNumber, invoiceAccessKey, hasValidCheckDigit };
  if (raw.outcome === "status" && isInvoiceStatus(raw.status)) {
    state.seenLines.add(lineNumber);
    return { type: "result", ...receivable, outcome: "status", status: raw.status };
  }
  if (raw.outcome === "failed" && isItemFailureReason(raw.reason)) {
    state.seenLines.add(lineNumber);
    return { type: "result", ...receivable, outcome: "failed", reason: raw.reason };
  }
  return null;
}

function* splitLines(buffer: { text: string }): Generator<string> {
  let newline = buffer.text.indexOf("\n");
  while (newline >= 0) {
    const line = buffer.text.slice(0, newline);
    buffer.text = buffer.text.slice(newline + 1);
    yield line;
    newline = buffer.text.indexOf("\n");
  }
}

export async function* readStatusStream(
  body: ReadableStream<Uint8Array>,
  expected: ExpectedReceivables,
  signal: AbortSignal,
): AsyncGenerator<StatusStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const state: DecoderState = { started: false, seenLines: new Set() };
  const buffer = { text: "" };

  const handle = (line: string): StatusStreamEvent | null => {
    if (line.trim() === "") {
      return null;
    }
    return decodeEvent(parseJson(line), expected, state) ?? { type: "interrupted" };
  };

  const waitForServerToClose = async (): Promise<void> => {
    if (buffer.text.trim() !== "") {
      return;
    }
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done || decoder.decode(next.value, { stream: true }).trim() !== "") {
          return;
        }
      }
    } catch {
      return;
    }
  };

  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        if (!signal.aborted) {
          yield { type: "interrupted" };
        }
        return;
      }
      if (chunk.done) {
        break;
      }
      buffer.text += decoder.decode(chunk.value, { stream: true });
      for (const line of splitLines(buffer)) {
        const event = handle(line);
        if (!event) {
          continue;
        }
        yield event;
        if (event.type === "interrupted") {
          return;
        }
        if (event.type === "completed" || event.type === "failed") {
          await waitForServerToClose();
          return;
        }
      }
    }
    const lastEvent = handle(buffer.text);
    if (lastEvent) {
      yield lastEvent;
      if (lastEvent.type !== "started" && lastEvent.type !== "result") {
        return;
      }
    }
    yield { type: "interrupted" };
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
