import type { ItemFailureReason, ReceivableCheck } from "@/application/remittance/check-remittance";
import type { Receivable } from "@/domain/cnab/parse-cnab-444";
import type { InvoiceStatus } from "@/domain/invoice/invoice-status";
import type { StatusStreamEvent } from "@/features/remittance/read-status-stream";
import type { SubmitError } from "@/features/remittance/submit-remittance";

type Results = ReadonlyMap<number, ReceivableCheck>;

type AttemptPhase = "checking" | "completed" | "failed" | "interrupted";

interface AttemptState {
  readonly phase: AttemptPhase;
  readonly attempt: number;
  readonly results: Results;
}

export type RemittanceCheckState =
  | { readonly phase: "idle" }
  | AttemptState
  | { readonly phase: "requestFailed"; readonly attempt: number; readonly error: SubmitError };

export type RemittanceCheckAction =
  | { readonly type: "submitted"; readonly attempt: number }
  | { readonly type: "received"; readonly attempt: number; readonly event: StatusStreamEvent }
  | { readonly type: "requestFailed"; readonly attempt: number; readonly error: SubmitError }
  | { readonly type: "reset" };

export const initialCheckState: RemittanceCheckState = { phase: "idle" };

function toReceivableCheck(event: Extract<StatusStreamEvent, { type: "result" }>): ReceivableCheck {
  const receivable = {
    lineNumber: event.lineNumber,
    invoiceAccessKey: event.invoiceAccessKey,
    hasValidCheckDigit: event.hasValidCheckDigit,
  };
  return event.outcome === "status"
    ? { ...receivable, outcome: "status", status: event.status }
    : { ...receivable, outcome: "failed", reason: event.reason };
}

function applyEvent(state: AttemptState, event: StatusStreamEvent): RemittanceCheckState {
  switch (event.type) {
    case "started":
      return state;
    case "result": {
      const check = toReceivableCheck(event);
      return { ...state, results: new Map(state.results).set(check.lineNumber, check) };
    }
    case "completed":
      return { ...state, phase: "completed" };
    case "failed":
      return { ...state, phase: "failed" };
    case "interrupted":
      return { ...state, phase: "interrupted" };
  }
}

export function remittanceCheckReducer(
  state: RemittanceCheckState,
  action: RemittanceCheckAction,
): RemittanceCheckState {
  switch (action.type) {
    case "reset":
      return initialCheckState;
    case "submitted":
      return { phase: "checking", attempt: action.attempt, results: new Map() };
    case "requestFailed":
      return state.phase === "checking" && state.attempt === action.attempt
        ? { phase: "requestFailed", attempt: action.attempt, error: action.error }
        : state;
    case "received":
      return state.phase === "checking" && state.attempt === action.attempt
        ? applyEvent(state, action.event)
        : state;
  }
}

export type RowState =
  | { readonly kind: "pending" }
  | { readonly kind: "status"; readonly status: InvoiceStatus }
  | { readonly kind: "failed"; readonly reason: ItemFailureReason };

export interface ReceivableRow extends Receivable {
  readonly ordinal: number;
  readonly state: RowState;
}

export function deriveRows(
  receivables: readonly Receivable[],
  state: RemittanceCheckState,
): ReceivableRow[] {
  const results: Results = "results" in state ? state.results : new Map();
  return receivables.map((receivable, index): ReceivableRow => {
    const base = { ...receivable, ordinal: index + 1 };
    const check = results.get(receivable.lineNumber);
    if (!check) {
      return { ...base, state: { kind: "pending" } };
    }
    return check.outcome === "status"
      ? { ...base, state: { kind: "status", status: check.status } }
      : { ...base, state: { kind: "failed", reason: check.reason } };
  });
}

export type RowTone = InvoiceStatus | "failed" | "pending";

export function toneOf(row: ReceivableRow): RowTone {
  return row.state.kind === "status" ? row.state.status : row.state.kind;
}

export type RowSummary = Readonly<Record<RowTone, number>>;

export function summarizeRows(rows: readonly ReceivableRow[]): RowSummary {
  const summary = {
    authorized: 0,
    cancelled: 0,
    rejected: 0,
    denied: 0,
    not_found: 0,
    failed: 0,
    pending: 0,
  };
  for (const row of rows) {
    summary[toneOf(row)]++;
  }
  return summary;
}
