import { describe, expect, it } from "vitest";

import { settleMountSnapshot } from "@/features/remittance/use-changed-since-mount";

describe("settleMountSnapshot", () => {
  it("keeps the same snapshot while the value matches the one shown on mount", () => {
    const snapshot = { value: "completed" };
    expect(settleMountSnapshot(snapshot, "completed")).toBe(snapshot);
  });

  it("drops the snapshot once the value differs", () => {
    expect(settleMountSnapshot({ value: "checking" }, "interrupted")).toBeNull();
  });

  it("stays changed even when the value returns to the one shown on mount", () => {
    const changed = settleMountSnapshot({ value: "interrupted" }, "checking");
    expect(settleMountSnapshot(changed, "interrupted")).toBeNull();
  });

  it("treats a null value on mount as a value, not as a change", () => {
    const snapshot = { value: null };
    expect(settleMountSnapshot(snapshot, null)).toBe(snapshot);
    expect(settleMountSnapshot(snapshot, 1)).toBeNull();
  });

  it("compares with the given equality instead of identity", () => {
    const sameAttempt = (
      mounted: { readonly phase: string; readonly attempt: number },
      current: { readonly phase: string; readonly attempt: number },
    ) => mounted.phase === current.phase && mounted.attempt === current.attempt;
    const snapshot = { value: { phase: "interrupted", attempt: 2 } };

    expect(settleMountSnapshot(snapshot, { phase: "interrupted", attempt: 2 }, sameAttempt)).toBe(
      snapshot,
    );
    expect(
      settleMountSnapshot(snapshot, { phase: "interrupted", attempt: 3 }, sameAttempt),
    ).toBeNull();
    expect(
      settleMountSnapshot(snapshot, { phase: "checking", attempt: 2 }, sameAttempt),
    ).toBeNull();
  });

  it("uses identity by default, so a new object with the same fields is a change", () => {
    expect(
      settleMountSnapshot({ value: { phase: "completed" } }, { phase: "completed" }),
    ).toBeNull();
  });
});
