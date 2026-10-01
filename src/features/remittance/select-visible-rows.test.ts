import { describe, expect, it } from "vitest";

import type {
  ReceivableRow,
  RowState,
  RowTone,
} from "@/features/remittance/remittance-check-state";
import { summarizeRows } from "@/features/remittance/remittance-check-state";
import type { RowSelection } from "@/features/remittance/select-visible-rows";
import {
  filterOptions,
  normalizeQuery,
  selectVisibleRows,
} from "@/features/remittance/select-visible-rows";

function row(lineNumber: number, state: RowState = { kind: "pending" }): ReceivableRow {
  return {
    lineNumber,
    ordinal: lineNumber - 1,
    invoiceAccessKey: `3524${String(lineNumber).padStart(40, "0")}`,
    hasValidCheckDigit: true,
    state,
  };
}

const authorized: RowState = { kind: "status", status: "authorized" };
const cancelled: RowState = { kind: "status", status: "cancelled" };
const timedOut: RowState = { kind: "failed", reason: "UPSTREAM_TIMEOUT" };

const everything: RowSelection = { tones: new Set(), query: "", pageIndex: 0, pageSize: 25 };

function lines(rows: readonly ReceivableRow[]) {
  return rows.map((item) => item.lineNumber);
}

function manyRows(count: number, state?: RowState) {
  return Array.from({ length: count }, (_, index) => row(index + 2, state));
}

describe("normalizeQuery", () => {
  it.each(["", "   ", "\t", "...", " - / "])("treats %j as no filter", (input) => {
    expect(normalizeQuery(input)).toEqual({ kind: "any" });
  });

  it("keeps only the digits of a key typed with separators", () => {
    expect(normalizeQuery(" 3524 0300.0000-0001/99 ")).toEqual({
      kind: "digits",
      digits: "352403000000000199",
    });
  });

  it.each(["abc", "35a24", "35,24"])("rejects %j because keys only have digits", (input) => {
    expect(normalizeQuery(input)).toEqual({ kind: "invalid" });
  });
});

describe("selectVisibleRows", () => {
  const rows = [row(2, authorized), row(3, cancelled), row(4, timedOut), row(5)];

  it("shows every row without filters", () => {
    const visible = selectVisibleRows(rows, everything);
    expect(lines(visible.pageRows)).toEqual([2, 3, 4, 5]);
    expect(visible).toMatchObject({ filteredCount: 4, pageCount: 1, pageIndex: 0, from: 1, to: 4 });
  });

  it("keeps the rows of any selected status", () => {
    const tones = new Set<RowTone>(["cancelled", "failed"]);
    expect(lines(selectVisibleRows(rows, { ...everything, tones }).pageRows)).toEqual([3, 4]);
  });

  it("filters rows still being checked", () => {
    const tones = new Set<RowTone>(["pending"]);
    expect(lines(selectVisibleRows(rows, { ...everything, tones }).pageRows)).toEqual([5]);
  });

  it("finds a key by any part of its digits", () => {
    const query = "0 000 0004";
    expect(lines(selectVisibleRows(rows, { ...everything, query }).pageRows)).toEqual([4]);
  });

  it("combines status and search", () => {
    const visible = selectVisibleRows(rows, {
      ...everything,
      tones: new Set<RowTone>(["authorized"]),
      query: "0004",
    });
    expect(visible.pageRows).toEqual([]);
    expect(visible).toMatchObject({ filteredCount: 0, pageCount: 1, from: 0, to: 0 });
  });

  it("shows nothing for a search with letters and says why", () => {
    const visible = selectVisibleRows(rows, { ...everything, query: "abc" });
    expect(visible.pageRows).toEqual([]);
    expect(visible.hasInvalidQuery).toBe(true);
    expect(selectVisibleRows(rows, everything).hasInvalidQuery).toBe(false);
  });

  it("slices the requested page and reports its range", () => {
    const visible = selectVisibleRows(manyRows(23), { ...everything, pageSize: 10, pageIndex: 2 });
    expect(lines(visible.pageRows)).toEqual([22, 23, 24]);
    expect(visible).toMatchObject({
      filteredCount: 23,
      pageCount: 3,
      pageIndex: 2,
      from: 21,
      to: 23,
    });
  });

  it("fills a full middle page", () => {
    const visible = selectVisibleRows(manyRows(23), { ...everything, pageSize: 10, pageIndex: 1 });
    expect(visible).toMatchObject({ from: 11, to: 20 });
    expect(visible.pageRows).toHaveLength(10);
  });

  it("falls back to the last page when the filtered rows shrink", () => {
    const pending = new Set<RowTone>(["pending"]);
    const selection = { ...everything, tones: pending, pageSize: 10, pageIndex: 2 };
    const before = selectVisibleRows(manyRows(25), selection);
    expect(before.pageIndex).toBe(2);

    const resolved = manyRows(25).map((item, index) =>
      index < 12 ? { ...item, state: authorized } : item,
    );
    const after = selectVisibleRows(resolved, selection);
    expect(after.pageIndex).toBe(1);
    expect(lines(after.pageRows)).toEqual([24, 25, 26]);
  });

  it("falls back to the first page when nothing matches or the index is negative", () => {
    expect(selectVisibleRows([], { ...everything, pageIndex: 4 }).pageIndex).toBe(0);
    expect(selectVisibleRows(rows, { ...everything, pageIndex: -1 }).pageIndex).toBe(0);
  });
});

describe("filterOptions", () => {
  it("lists the statuses present, in a fixed order", () => {
    const summary = summarizeRows([
      row(2, timedOut),
      row(3),
      row(4, cancelled),
      row(5, authorized),
    ]);
    expect(filterOptions(summary, new Set())).toEqual([
      "authorized",
      "cancelled",
      "failed",
      "pending",
    ]);
  });

  it("keeps a selected status visible after its count drops to zero", () => {
    const summary = summarizeRows([row(2, authorized)]);
    expect(filterOptions(summary, new Set<RowTone>(["pending"]))).toEqual([
      "authorized",
      "pending",
    ]);
  });
});
