import { describe, expect, it } from "vitest";

import type {
  ReceivableRow,
  RowState,
  RowTone,
} from "@/features/remittance/remittance-check-state";
import { summarizeRows } from "@/features/remittance/remittance-check-state";
import type { RowSelection, RowSort } from "@/features/remittance/select-visible-rows";
import {
  defaultSort,
  filterOptions,
  nextSort,
  normalizeQuery,
  selectFilteredRows,
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

const everything: RowSelection = {
  tones: new Set(),
  query: "",
  sort: defaultSort,
  pageIndex: 0,
  pageSize: 25,
};

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

describe("sorting", () => {
  const rejected: RowState = { kind: "status", status: "rejected" };
  const mixed = [
    row(2, cancelled),
    row(3),
    row(4, authorized),
    row(5, timedOut),
    row(6, cancelled),
    row(7, rejected),
  ];

  function sorted(sort: RowSort, rows = mixed) {
    return lines(selectVisibleRows(rows, { ...everything, sort }).pageRows);
  }

  it("keeps the file order by default", () => {
    expect(sorted(defaultSort)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it("reverses the file order", () => {
    expect(sorted({ column: "ordinal", direction: "desc" })).toEqual([7, 6, 5, 4, 3, 2]);
  });

  it("orders statuses by meaning, with failed and pending last, ties in file order", () => {
    expect(sorted({ column: "status", direction: "asc" })).toEqual([4, 2, 6, 7, 5, 3]);
  });

  it("keeps ties in file order when the status order is reversed", () => {
    expect(sorted({ column: "status", direction: "desc" })).toEqual([3, 5, 7, 2, 6, 4]);
  });

  it("orders keys as text and keeps equal keys in file order", () => {
    const sameKey = { ...row(8, authorized), invoiceAccessKey: row(3).invoiceAccessKey };
    const rows = [row(4), sameKey, row(3), row(2)];
    expect(sorted({ column: "key", direction: "asc" }, rows)).toEqual([2, 3, 8, 4]);
    expect(sorted({ column: "key", direction: "desc" }, rows)).toEqual([4, 3, 8, 2]);
  });

  it("sorts before slicing the page", () => {
    const visible = selectVisibleRows(manyRows(23), {
      ...everything,
      sort: { column: "ordinal", direction: "desc" },
      pageSize: 10,
      pageIndex: 1,
    });
    expect(lines(visible.pageRows)).toEqual([14, 13, 12, 11, 10, 9, 8, 7, 6, 5]);
  });
});

describe("selectFilteredRows", () => {
  it("returns every filtered row in order, across all pages", () => {
    const rows = manyRows(30, authorized).map((item, index) =>
      index % 3 === 0 ? { ...item, state: cancelled } : item,
    );
    const filtered = selectFilteredRows(rows, {
      tones: new Set<RowTone>(["authorized"]),
      query: "",
      sort: { column: "ordinal", direction: "desc" },
    });
    expect(filtered).toHaveLength(20);
    expect(lines(filtered).slice(0, 3)).toEqual([31, 30, 28]);
  });

  it("returns nothing for a search with letters", () => {
    expect(selectFilteredRows(manyRows(3), { ...everything, query: "abc" })).toEqual([]);
  });

  it("agrees with the count of the paginated selection", () => {
    const rows = manyRows(23);
    const selection = { ...everything, query: "1", pageSize: 10 };
    expect(selectFilteredRows(rows, selection)).toHaveLength(
      selectVisibleRows(rows, selection).filteredCount,
    );
  });
});

describe("nextSort", () => {
  it("starts a new column ascending", () => {
    expect(nextSort(defaultSort, "status")).toEqual({ column: "status", direction: "asc" });
  });

  it("cycles a column from ascending to descending and back to the file order", () => {
    const ascending = nextSort(defaultSort, "key");
    const descending = nextSort(ascending, "key");
    expect(descending).toEqual({ column: "key", direction: "desc" });
    expect(nextSort(descending, "key")).toEqual(defaultSort);
  });

  it("toggles the number column between both directions", () => {
    const descending = nextSort(defaultSort, "ordinal");
    expect(descending).toEqual({ column: "ordinal", direction: "desc" });
    expect(nextSort(descending, "ordinal")).toEqual(defaultSort);
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
