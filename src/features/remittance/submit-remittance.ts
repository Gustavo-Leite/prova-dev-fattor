import { recordTypeCodes } from "@/domain/cnab/layout";
import type { Cnab444Issue } from "@/domain/cnab/parse-cnab-444";
import type { RemittanceRejection } from "@/domain/cnab/read-remittance";

export const remittancesEndpoint = "/api/remittances";

export type SubmitError =
  | { readonly code: "ABORTED" }
  | { readonly code: "NETWORK_ERROR" }
  | { readonly code: "UNEXPECTED_RESPONSE"; readonly status: number }
  | { readonly code: "INVALID_REQUEST" }
  | { readonly code: "CROSS_SITE_REQUEST" }
  | { readonly code: "SESSION_EXPIRED" }
  | { readonly code: "LENGTH_REQUIRED" }
  | { readonly code: "FILE_TOO_LARGE"; readonly maxBytes: number }
  | RemittanceRejection;

export type SubmitResult =
  | { readonly ok: true; readonly body: ReadableStream<Uint8Array> }
  | { readonly ok: false; readonly error: SubmitError };

export interface SubmitOptions {
  readonly signal: AbortSignal;
  readonly fetch?: typeof fetch;
}

type Guard = (value: Record<string, unknown>) => boolean;

const isInteger = (value: unknown): value is number => Number.isInteger(value);

const hasLine: Guard = (value) => isInteger(value.lineNumber);

const issueGuards: Readonly<Record<Cnab444Issue["code"], Guard>> = {
  EMPTY_FILE: () => true,
  MISSING_DETAIL_RECORDS: () => true,
  INVALID_CHARACTERS: hasLine,
  INVALID_RECORD_COUNT: hasLine,
  INVALID_ACCESS_KEY_FORMAT: hasLine,
  INVALID_LINE_LENGTH: (value) =>
    hasLine(value) && isInteger(value.expected) && isInteger(value.actual),
  UNEXPECTED_RECORD_TYPE: (value) =>
    hasLine(value) &&
    Object.values(recordTypeCodes).some((code) => code === value.expected) &&
    typeof value.actual === "string",
  RECORD_COUNT_MISMATCH: (value) =>
    hasLine(value) && isInteger(value.declared) && isInteger(value.actual),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIssueCode(code: unknown): code is Cnab444Issue["code"] {
  return typeof code === "string" && Object.hasOwn(issueGuards, code);
}

function isCnab444Issue(value: unknown): value is Cnab444Issue {
  return isRecord(value) && isIssueCode(value.code) && issueGuards[value.code](value);
}

function toIssues(value: unknown): Cnab444Issue[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const items: unknown[] = value;
  return items.every(isCnab444Issue) ? items : null;
}

function toSubmitError(status: number, payload: unknown): SubmitError {
  const unexpected = { code: "UNEXPECTED_RESPONSE", status } as const;
  if (!isRecord(payload)) {
    return unexpected;
  }
  switch (payload.code) {
    case "INVALID_REQUEST":
    case "CROSS_SITE_REQUEST":
    case "SESSION_EXPIRED":
    case "LENGTH_REQUIRED":
      return { code: payload.code };
    case "FILE_TOO_LARGE":
      return isInteger(payload.maxBytes)
        ? { code: "FILE_TOO_LARGE", maxBytes: payload.maxBytes }
        : unexpected;
    case "TOO_MANY_RECEIVABLES":
      return isInteger(payload.max) && isInteger(payload.actual)
        ? { code: "TOO_MANY_RECEIVABLES", max: payload.max, actual: payload.actual }
        : unexpected;
    case "INVALID_FILE": {
      const errors = toIssues(payload.errors);
      return errors && typeof payload.truncated === "boolean"
        ? { code: "INVALID_FILE", errors, truncated: payload.truncated }
        : unexpected;
    }
    default:
      return unexpected;
  }
}

export async function submitRemittance(file: File, options: SubmitOptions): Promise<SubmitResult> {
  const send = options.fetch ?? globalThis.fetch;
  const form = new FormData();
  form.set("file", file);
  try {
    const response = await send(remittancesEndpoint, {
      method: "POST",
      body: form,
      signal: options.signal,
    });
    if (response.status === 200 && response.body) {
      return { ok: true, body: response.body };
    }
    const payload: unknown = await response.json().catch((error: unknown) => {
      if (options.signal.aborted) {
        throw error;
      }
      return undefined;
    });
    return { ok: false, error: toSubmitError(response.status, payload) };
  } catch {
    return { ok: false, error: { code: options.signal.aborted ? "ABORTED" : "NETWORK_ERROR" } };
  }
}
