import { describe, expect, it } from "vitest";

import type { Receivable } from "@/domain/cnab/parse-cnab-444";
import type { StatusStreamEvent } from "@/features/remittance/read-status-stream";
import type { RemittanceCheckAction } from "@/features/remittance/remittance-check-state";
import {
  deriveRows,
  initialCheckState,
  remittanceCheckReducer,
  summarizeRows,
} from "@/features/remittance/remittance-check-state";

const receivables: readonly Receivable[] = [2, 3, 4].map((lineNumber) => ({
  lineNumber,
  invoiceAccessKey: `key-${String(lineNumber)}`,
  hasValidCheckDigit: lineNumber !== 3,
}));

const submitted = (attempt = 1): RemittanceCheckAction => ({ type: "submitted", attempt });

const received = (event: StatusStreamEvent, attempt = 1): RemittanceCheckAction => ({
  type: "received",
  attempt,
  event,
});

function result(lineNumber: number, status: "authorized" | "cancelled", attempt = 1) {
  return received(
    {
      type: "result",
      lineNumber,
      invoiceAccessKey: `key-${String(lineNumber)}`,
      hasValidCheckDigit: true,
      outcome: "status",
      status,
    },
    attempt,
  );
}

function run(...actions: RemittanceCheckAction[]) {
  return actions.reduce(remittanceCheckReducer, initialCheckState);
}

describe("remittanceCheckReducer", () => {
  it("starts checking with no results", () => {
    expect(run(submitted())).toEqual({ phase: "checking", attempt: 1, results: new Map() });
  });

  it("records results by line and completes", () => {
    const state = run(
      submitted(),
      received({ type: "started", total: 3 }),
      result(2, "authorized"),
      result(4, "cancelled"),
      received({ type: "completed" }),
    );
    expect(state.phase).toBe("completed");
    expect("results" in state && [...state.results.keys()]).toEqual([2, 4]);
  });

  it.each([
    ["failed", { type: "failed", reason: "UPSTREAM_REJECTED_CREDENTIALS" }],
    ["interrupted", { type: "interrupted" }],
  ] as const)("keeps the partial results when the stream ends as %s", (phase, event) => {
    const state = run(submitted(), result(2, "authorized"), received(event));
    expect(state.phase).toBe(phase);
    expect("results" in state && state.results.size).toBe(1);
  });

  it("starts a retry without the results of the previous attempt", () => {
    const state = run(
      submitted(1),
      result(2, "authorized", 1),
      received({ type: "interrupted" }, 1),
      submitted(2),
    );
    expect(state).toEqual({ phase: "checking", attempt: 2, results: new Map() });
  });

  it("ignores late events and failures from a previous attempt", () => {
    const state = run(
      submitted(1),
      submitted(2),
      result(2, "authorized", 1),
      received({ type: "interrupted" }, 1),
      { type: "requestFailed", attempt: 1, error: { code: "ABORTED" } },
      result(3, "cancelled", 2),
    );
    expect(state.phase).toBe("checking");
    expect("results" in state && [...state.results.keys()]).toEqual([3]);
  });

  it("ignores events that arrive after the check ended", () => {
    const state = run(submitted(), received({ type: "completed" }), result(2, "authorized"));
    expect("results" in state && state.results.size).toBe(0);
  });

  it("ignores events when no check is running", () => {
    expect(run(result(2, "authorized"))).toEqual(initialCheckState);
  });

  it("records a request failure of the current attempt and resets", () => {
    const failed = run(submitted(), {
      type: "requestFailed",
      attempt: 1,
      error: { code: "NETWORK_ERROR" },
    });
    expect(failed).toEqual({
      phase: "requestFailed",
      attempt: 1,
      error: { code: "NETWORK_ERROR" },
    });
    expect(remittanceCheckReducer(failed, { type: "reset" })).toEqual(initialCheckState);
  });
});

describe("deriveRows and summarizeRows", () => {
  it("keeps the file order and marks rows without a result as pending", () => {
    const state = run(
      submitted(),
      result(4, "cancelled"),
      received({
        type: "result",
        lineNumber: 3,
        invoiceAccessKey: "key-3",
        hasValidCheckDigit: false,
        outcome: "failed",
        reason: "UPSTREAM_TIMEOUT",
      }),
    );
    const rows = deriveRows(receivables, state);

    expect(rows.map((row) => [row.ordinal, row.lineNumber, row.state])).toEqual([
      [1, 2, { kind: "pending" }],
      [2, 3, { kind: "failed", reason: "UPSTREAM_TIMEOUT" }],
      [3, 4, { kind: "status", status: "cancelled" }],
    ]);
    expect(rows[1]?.hasValidCheckDigit).toBe(false);
    expect(summarizeRows(rows)).toEqual({
      authorized: 0,
      cancelled: 1,
      rejected: 0,
      denied: 0,
      not_found: 0,
      failed: 1,
      pending: 1,
    });
  });

  it("shows every row as pending before the check starts", () => {
    expect(summarizeRows(deriveRows(receivables, initialCheckState)).pending).toBe(3);
  });
});
