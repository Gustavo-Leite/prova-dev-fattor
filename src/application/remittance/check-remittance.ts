import type {
  InvoiceStatusGateway,
  LookupFailureReason,
} from "@/application/remittance/invoice-status-gateway";
import { InvoiceStatusLookupError } from "@/application/remittance/invoice-status-gateway";
import type { Receivable } from "@/domain/cnab/parse-cnab-444";
import type { RemittanceRejection } from "@/domain/cnab/read-remittance";
import { readRemittance } from "@/domain/cnab/read-remittance";
import type { InvoiceStatus } from "@/domain/invoice/invoice-status";

export interface RemittanceCheckPolicy {
  readonly maxReceivables: number;
  readonly concurrency: number;
  readonly deadlineMs: number;
}

export const defaultRemittanceCheckPolicy: RemittanceCheckPolicy = {
  maxReceivables: 200,
  concurrency: 5,
  deadlineMs: 25_000,
};

export type ItemFailureReason = Exclude<LookupFailureReason, "UPSTREAM_REJECTED_CREDENTIALS">;

export type ReceivableCheck = Receivable &
  (
    | { readonly outcome: "status"; readonly status: InvoiceStatus }
    | { readonly outcome: "failed"; readonly reason: ItemFailureReason }
  );

export type RemittanceCheckEvent =
  | ({ readonly type: "result" } & ReceivableCheck)
  | { readonly type: "completed" }
  | { readonly type: "failed"; readonly reason: "UPSTREAM_REJECTED_CREDENTIALS" };

export type RemittanceStreamEvent =
  { readonly type: "started"; readonly total: number } | RemittanceCheckEvent;

export type RemittanceCheck =
  | { readonly ok: false; readonly rejection: RemittanceRejection }
  | {
      readonly ok: true;
      readonly total: number;
      readonly events: AsyncIterable<RemittanceCheckEvent>;
    };

type KeyOutcome =
  | { readonly kind: "status"; readonly status: InvoiceStatus }
  | { readonly kind: "failed"; readonly reason: ItemFailureReason }
  | { readonly kind: "fatal" };

const maxTimerDelayMs = 2_147_483_647;

function assertValidPolicy(policy: RemittanceCheckPolicy): void {
  const values = [policy.maxReceivables, policy.concurrency, policy.deadlineMs];
  const isValid =
    values.every((value) => Number.isInteger(value) && value > 0) &&
    policy.deadlineMs <= maxTimerDelayMs;
  if (!isValid) {
    throw new RangeError(`Invalid remittance check policy: ${JSON.stringify(policy)}`);
  }
}

function groupByKey(receivables: readonly Receivable[]): Map<string, Receivable[]> {
  const groups = new Map<string, Receivable[]>();
  for (const receivable of receivables) {
    const group = groups.get(receivable.invoiceAccessKey);
    if (group) {
      group.push(receivable);
    } else {
      groups.set(receivable.invoiceAccessKey, [receivable]);
    }
  }
  return groups;
}

function toResult(
  receivable: Receivable,
  outcome: Extract<KeyOutcome, { kind: "status" | "failed" }>,
): RemittanceCheckEvent {
  return outcome.kind === "status"
    ? { type: "result", ...receivable, outcome: "status", status: outcome.status }
    : { type: "result", ...receivable, outcome: "failed", reason: outcome.reason };
}

function rejectOnAbort(signal: AbortSignal): { promise: Promise<never>; dispose: () => void } {
  let dispose: () => void = () => undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    const onAbort = () => {
      reject(new Error("Lookup aborted"));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    dispose = () => {
      signal.removeEventListener("abort", onAbort);
    };
  });
  return { promise, dispose };
}

async function* runChecks(
  groups: Map<string, Receivable[]>,
  gateway: InvoiceStatusGateway,
  callerSignal: AbortSignal,
  policy: RemittanceCheckPolicy,
): AsyncGenerator<RemittanceCheckEvent> {
  const deadline = new AbortController();
  const deadlineTimer = setTimeout(() => {
    deadline.abort();
  }, policy.deadlineMs);
  const fatalStop = new AbortController();
  const lookupSignal = AbortSignal.any([callerSignal, deadline.signal, fatalStop.signal]);
  const keys = [...groups.keys()];
  const inFlight = new Map<string, Promise<{ key: string; outcome: KeyOutcome }>>();
  let nextIndex = 0;

  const classifyFailure = (error: unknown): KeyOutcome => {
    if (error instanceof InvoiceStatusLookupError) {
      if (error.reason === "UPSTREAM_REJECTED_CREDENTIALS") {
        return { kind: "fatal" };
      }
      if (!deadline.signal.aborted) {
        return { kind: "failed", reason: error.reason };
      }
    }
    if (deadline.signal.aborted) {
      return { kind: "failed", reason: "UPSTREAM_TIMEOUT" };
    }
    return { kind: "failed", reason: "UPSTREAM_UNAVAILABLE" };
  };

  const lookUp = async (key: string): Promise<{ key: string; outcome: KeyOutcome }> => {
    const abortion = rejectOnAbort(lookupSignal);
    try {
      const status = await Promise.race([gateway.findStatus(key, lookupSignal), abortion.promise]);
      return { key, outcome: { kind: "status", status } };
    } catch (error) {
      return { key, outcome: classifyFailure(error) };
    } finally {
      abortion.dispose();
    }
  };

  const schedule = () => {
    while (inFlight.size < policy.concurrency && !lookupSignal.aborted) {
      const key = keys[nextIndex];
      if (key === undefined) {
        return;
      }
      nextIndex++;
      inFlight.set(key, lookUp(key));
    }
  };

  try {
    schedule();
    while (inFlight.size > 0) {
      const { key, outcome } = await Promise.race(inFlight.values());
      inFlight.delete(key);
      if (outcome.kind === "fatal") {
        fatalStop.abort();
        yield { type: "failed", reason: "UPSTREAM_REJECTED_CREDENTIALS" };
        return;
      }
      for (const receivable of groups.get(key) ?? []) {
        yield toResult(receivable, outcome);
      }
      schedule();
    }
    for (const key of keys.slice(nextIndex)) {
      for (const receivable of groups.get(key) ?? []) {
        yield toResult(receivable, { kind: "failed", reason: "UPSTREAM_TIMEOUT" });
      }
    }
    yield { type: "completed" };
  } finally {
    clearTimeout(deadlineTimer);
    fatalStop.abort();
  }
}

async function* stopWhenAborted<T>(
  events: AsyncIterable<T>,
  signal: AbortSignal,
): AsyncGenerator<T> {
  for await (const event of events) {
    if (signal.aborted) {
      return;
    }
    yield event;
  }
}

export function checkRemittance(
  bytes: Uint8Array,
  gateway: InvoiceStatusGateway,
  options: { readonly signal: AbortSignal; readonly policy?: RemittanceCheckPolicy },
): RemittanceCheck {
  const policy = options.policy ?? defaultRemittanceCheckPolicy;
  assertValidPolicy(policy);
  const reading = readRemittance(bytes, { maxReceivables: policy.maxReceivables });
  if (!reading.ok) {
    return reading;
  }
  const { receivables } = reading;
  return {
    ok: true,
    total: receivables.length,
    events: stopWhenAborted(
      runChecks(groupByKey(receivables), gateway, options.signal, policy),
      options.signal,
    ),
  };
}
