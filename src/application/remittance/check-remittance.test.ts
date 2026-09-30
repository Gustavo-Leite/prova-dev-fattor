import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, expect, it, vi } from "vitest";

import type {
  RemittanceCheck,
  RemittanceCheckEvent,
} from "@/application/remittance/check-remittance";
import {
  checkRemittance,
  defaultRemittanceCheckPolicy,
} from "@/application/remittance/check-remittance";
import type { InvoiceStatusGateway } from "@/application/remittance/invoice-status-gateway";
import { InvoiceStatusLookupError } from "@/application/remittance/invoice-status-gateway";
import type { InvoiceStatus } from "@/domain/invoice/invoice-status";

const sampleFilePath = path.join(import.meta.dirname, "../../../_prova/meu_cnab.rem");
const lineLength = 444;

type Behaviour = (signal: AbortSignal) => Promise<InvoiceStatus>;

function keyFor(invoiceNumber: number): string {
  return `3524030000000000019955001${String(invoiceNumber).padStart(9, "0")}1234567890`;
}

function recordLine(type: string, fields: readonly (readonly [number, string])[] = []): string {
  let line = type.padEnd(lineLength, " ");
  for (const [start, value] of fields) {
    line = line.slice(0, start - 1) + value + line.slice(start - 1 + value.length);
  }
  return line;
}

function remittanceBytes(keys: readonly string[]): Uint8Array {
  const lines = [
    recordLine("0"),
    ...keys.map((key) => recordLine("1", [[401, key]])),
    recordLine("9", [[393, String(keys.length + 2).padStart(6, "0")]]),
  ];
  return new TextEncoder().encode(`${lines.join("\n")}\n`);
}

function resolveAfter(delayMs: number, status: InvoiceStatus): Behaviour {
  return (signal) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve(status);
      }, delayMs);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("aborted"));
        },
        { once: true },
      );
    });
}

const pendingUntilAbort: Behaviour = (signal) =>
  new Promise((_resolve, reject) => {
    signal.addEventListener(
      "abort",
      () => {
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });

function rejectWith(error: unknown): Behaviour {
  return () => Promise.reject(error instanceof Error ? error : new Error(String(error)));
}

function fakeGateway(
  behaviours: Readonly<Record<string, Behaviour>> = {},
  fallback: Behaviour = resolveAfter(0, "authorized"),
) {
  const calls: { key: string; signal: AbortSignal }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const gateway: InvoiceStatusGateway = {
    async findStatus(key, signal) {
      calls.push({ key, signal });
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        return await (behaviours[key] ?? fallback)(signal);
      } finally {
        inFlight--;
      }
    },
  };
  return { gateway, calls, maxInFlight: () => maxInFlight };
}

async function collect(check: RemittanceCheck): Promise<RemittanceCheckEvent[]> {
  assert(check.ok);
  const events: RemittanceCheckEvent[] = [];
  for await (const event of check.events) {
    events.push(event);
  }
  return events;
}

function run(
  keys: readonly string[],
  gateway: InvoiceStatusGateway,
  policy: Partial<typeof defaultRemittanceCheckPolicy> = {},
  signal: AbortSignal = new AbortController().signal,
): RemittanceCheck {
  return checkRemittance(remittanceBytes(keys), gateway, {
    signal,
    policy: { ...defaultRemittanceCheckPolicy, ...policy },
  });
}

describe("checkRemittance file validation", () => {
  it("rejects a file the parser does not accept, with the parser errors", () => {
    const { gateway, calls } = fakeGateway();
    const check = checkRemittance(new TextEncoder().encode("not a remittance\n"), gateway, {
      signal: new AbortController().signal,
    });
    assert(!check.ok);
    expect(check.rejection).toMatchObject({ code: "INVALID_FILE", truncated: false });
    expect(calls).toHaveLength(0);
  });

  it.each([
    [defaultRemittanceCheckPolicy.maxReceivables, true],
    [defaultRemittanceCheckPolicy.maxReceivables + 1, false],
  ])("with %i receivables, accepts the file: %s", (count, accepted) => {
    const keys = Array.from({ length: count }, (_, index) => keyFor(index + 1));
    const check = checkRemittance(remittanceBytes(keys), fakeGateway().gateway, {
      signal: new AbortController().signal,
    });
    if (accepted) {
      assert(check.ok);
      expect(check.total).toBe(count);
    } else {
      expect(check).toEqual({
        ok: false,
        rejection: {
          code: "TOO_MANY_RECEIVABLES",
          max: defaultRemittanceCheckPolicy.maxReceivables,
          actual: count,
        },
      });
    }
  });
});

describe("checkRemittance lookups", () => {
  it("checks every receivable of the sample file and then completes", async () => {
    const { gateway } = fakeGateway();
    const check = checkRemittance(readFileSync(sampleFilePath), gateway, {
      signal: new AbortController().signal,
    });
    assert(check.ok);
    expect(check.total).toBe(10);
    const events = await collect(check);
    expect(events).toHaveLength(11);
    expect(events.at(-1)).toEqual({ type: "completed" });
    expect(
      events.filter((event) => event.type === "result" && event.outcome === "status"),
    ).toHaveLength(10);
  });

  it("emits results in completion order, carrying the receivable data", async () => {
    const { gateway } = fakeGateway({
      [keyFor(1)]: resolveAfter(40, "authorized"),
      [keyFor(2)]: resolveAfter(5, "cancelled"),
    });
    const events = await collect(run([keyFor(1), keyFor(2)], gateway));
    expect(events).toEqual([
      {
        type: "result",
        lineNumber: 3,
        invoiceAccessKey: keyFor(2),
        hasValidCheckDigit: expect.any(Boolean) as boolean,
        outcome: "status",
        status: "cancelled",
      },
      {
        type: "result",
        lineNumber: 2,
        invoiceAccessKey: keyFor(1),
        hasValidCheckDigit: expect.any(Boolean) as boolean,
        outcome: "status",
        status: "authorized",
      },
      { type: "completed" },
    ]);
  });

  it("looks up a repeated key once and reports it for every receivable", async () => {
    const { gateway, calls } = fakeGateway();
    const events = await collect(run([keyFor(1), keyFor(2), keyFor(1)], gateway));
    expect(calls.map((call) => call.key)).toEqual([keyFor(1), keyFor(2)]);
    expect(
      events.flatMap((event) => (event.type === "result" ? [event.lineNumber] : [])).sort(),
    ).toEqual([2, 3, 4]);
  });

  it("never has more lookups in flight than the concurrency limit", async () => {
    const tracker = fakeGateway({}, resolveAfter(10, "authorized"));
    const keys = Array.from({ length: 7 }, (_, index) => keyFor(index + 1));
    const events = await collect(run(keys, tracker.gateway, { concurrency: 2 }));
    expect(tracker.maxInFlight()).toBe(2);
    expect(events.filter((event) => event.type === "result")).toHaveLength(7);
  });
});

describe("checkRemittance failures", () => {
  it.each(["UPSTREAM_TIMEOUT", "UPSTREAM_UNAVAILABLE", "UPSTREAM_INVALID_RESPONSE"] as const)(
    "reports %s on the item and keeps checking the others",
    async (reason) => {
      const { gateway } = fakeGateway({
        [keyFor(1)]: rejectWith(new InvoiceStatusLookupError(reason)),
      });
      const events = await collect(run([keyFor(1), keyFor(2)], gateway));
      expect(events).toContainEqual(
        expect.objectContaining({ lineNumber: 2, outcome: "failed", reason }),
      );
      expect(events).toContainEqual(expect.objectContaining({ lineNumber: 3, outcome: "status" }));
      expect(events.at(-1)).toEqual({ type: "completed" });
    },
  );

  it("reports an unexpected error as unavailable, without its message", async () => {
    const { gateway } = fakeGateway({ [keyFor(1)]: rejectWith(new Error("socket hang up")) });
    const events = await collect(run([keyFor(1)], gateway));
    expect(events[0]).toEqual({
      type: "result",
      lineNumber: 2,
      invoiceAccessKey: keyFor(1),
      hasValidCheckDigit: expect.any(Boolean) as boolean,
      outcome: "failed",
      reason: "UPSTREAM_UNAVAILABLE",
    });
  });

  it("stops everything when the credentials are rejected", async () => {
    const { gateway, calls } = fakeGateway(
      { [keyFor(1)]: rejectWith(new InvoiceStatusLookupError("UPSTREAM_REJECTED_CREDENTIALS")) },
      pendingUntilAbort,
    );
    const keys = Array.from({ length: 10 }, (_, index) => keyFor(index + 1));
    const check = run(keys, gateway, { concurrency: 3 });
    assert(check.ok);
    const events: RemittanceCheckEvent[] = [];
    let abortedWhenReported = false;
    for await (const event of check.events) {
      events.push(event);
      abortedWhenReported = calls.every((call) => call.signal.aborted);
    }
    expect(events).toEqual([{ type: "failed", reason: "UPSTREAM_REJECTED_CREDENTIALS" }]);
    expect(calls).toHaveLength(3);
    expect(abortedWhenReported).toBe(true);
  });

  it("stops silently when the caller aborts", async () => {
    const controller = new AbortController();
    const { gateway } = fakeGateway({ [keyFor(1)]: resolveAfter(0, "denied") }, pendingUntilAbort);
    const check = run([keyFor(1), keyFor(2), keyFor(3)], gateway, {}, controller.signal);
    assert(check.ok);
    const events: RemittanceCheckEvent[] = [];
    for await (const event of check.events) {
      events.push(event);
      controller.abort();
    }
    expect(events).toEqual([expect.objectContaining({ lineNumber: 2, status: "denied" })]);
  });

  it("times out every unfinished item at the deadline and aborts the ones in flight", async () => {
    const { gateway, calls } = fakeGateway(
      { [keyFor(1)]: resolveAfter(0, "authorized") },
      pendingUntilAbort,
    );
    const keys = [keyFor(1), keyFor(2), keyFor(3), keyFor(4)];
    const events = await collect(run(keys, gateway, { concurrency: 2, deadlineMs: 50 }));
    expect(events.filter((event) => event.type === "result")).toEqual([
      expect.objectContaining({ lineNumber: 2, outcome: "status" }),
      expect.objectContaining({ lineNumber: 3, outcome: "failed", reason: "UPSTREAM_TIMEOUT" }),
      expect.objectContaining({ lineNumber: 4, outcome: "failed", reason: "UPSTREAM_TIMEOUT" }),
      expect.objectContaining({ lineNumber: 5, outcome: "failed", reason: "UPSTREAM_TIMEOUT" }),
    ]);
    expect(events.at(-1)).toEqual({ type: "completed" });
    expect(calls.slice(1).every((call) => call.signal.aborted)).toBe(true);
  });

  it("enforces the deadline even when the gateway ignores the signal", async () => {
    const { gateway } = fakeGateway({}, () => new Promise<InvoiceStatus>(() => undefined));
    const events = await collect(run([keyFor(1), keyFor(2)], gateway, { deadlineMs: 30 }));
    expect(events).toEqual([
      expect.objectContaining({ lineNumber: 2, reason: "UPSTREAM_TIMEOUT" }),
      expect.objectContaining({ lineNumber: 3, reason: "UPSTREAM_TIMEOUT" }),
      { type: "completed" },
    ]);
  });

  it("reports a failed lookup on every receivable that shares the key", async () => {
    const { gateway } = fakeGateway({
      [keyFor(1)]: rejectWith(new InvoiceStatusLookupError("UPSTREAM_INVALID_RESPONSE")),
    });
    const events = await collect(run([keyFor(1), keyFor(1)], gateway));
    expect(events).toEqual([
      expect.objectContaining({ lineNumber: 2, reason: "UPSTREAM_INVALID_RESPONSE" }),
      expect.objectContaining({ lineNumber: 3, reason: "UPSTREAM_INVALID_RESPONSE" }),
      { type: "completed" },
    ]);
  });
});

describe("checkRemittance cancellation", () => {
  it("emits nothing when the caller has already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { gateway, calls } = fakeGateway();
    const events = await collect(run([keyFor(1), keyFor(2)], gateway, {}, controller.signal));
    expect(events).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("emits nothing after the caller aborts, even with fast lookups", async () => {
    const controller = new AbortController();
    const { gateway } = fakeGateway();
    const check = run(
      [keyFor(1), keyFor(2), keyFor(3)],
      gateway,
      { concurrency: 1 },
      controller.signal,
    );
    assert(check.ok);
    const events: RemittanceCheckEvent[] = [];
    for await (const event of check.events) {
      events.push(event);
      controller.abort();
    }
    expect(events).toEqual([expect.objectContaining({ lineNumber: 2, outcome: "status" })]);
  });

  it("emits nothing more after an abort during the timeouts reported at the deadline", async () => {
    const controller = new AbortController();
    const { gateway } = fakeGateway({}, () => new Promise<InvoiceStatus>(() => undefined));
    const keys = [keyFor(1), keyFor(2), keyFor(3), keyFor(4)];
    const check = run(keys, gateway, { concurrency: 1, deadlineMs: 10 }, controller.signal);
    assert(check.ok);
    const events: RemittanceCheckEvent[] = [];
    for await (const event of check.events) {
      events.push(event);
      if (events.length === 2) {
        controller.abort();
      }
    }
    expect(events).toHaveLength(2);
    expect(events).not.toContainEqual({ type: "completed" });
  });

  it("emits nothing more after an abort among receivables that share a key", async () => {
    const controller = new AbortController();
    const { gateway } = fakeGateway();
    const check = run([keyFor(1), keyFor(1), keyFor(1)], gateway, {}, controller.signal);
    assert(check.ok);
    const events: RemittanceCheckEvent[] = [];
    for await (const event of check.events) {
      events.push(event);
      controller.abort();
    }
    expect(events).toEqual([expect.objectContaining({ lineNumber: 2 })]);
  });

  it("aborts the lookups in flight when the consumer stops reading", async () => {
    const { gateway, calls } = fakeGateway(
      { [keyFor(1)]: resolveAfter(0, "authorized") },
      pendingUntilAbort,
    );
    const check = run([keyFor(1), keyFor(2), keyFor(3)], gateway);
    assert(check.ok);
    for await (const event of check.events) {
      expect(event.type).toBe("result");
      break;
    }
    expect(calls.slice(1).map((call) => call.signal.aborted)).toEqual([true, true]);
  });

  it("leaves no timer behind once the check completes", async () => {
    vi.useFakeTimers();
    try {
      const { gateway } = fakeGateway({}, () => Promise.resolve("authorized"));
      const events = await collect(run([keyFor(1), keyFor(2)], gateway));
      expect(events.at(-1)).toEqual({ type: "completed" });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["no concurrency", { concurrency: 0 }],
    ["a fractional limit", { maxReceivables: 1.5 }],
    ["a negative deadline", { deadlineMs: -1 }],
    ["a deadline beyond the timer range", { deadlineMs: 2 ** 31 }],
  ])("refuses a policy with %s", (_description, policy) => {
    expect(() => run([keyFor(1)], fakeGateway().gateway, policy)).toThrow(RangeError);
  });
});
