import type {
  ReceivableRow,
  RowSummary,
  RowTone,
} from "@/features/remittance/remittance-check-state";
import { toneOf } from "@/features/remittance/remittance-check-state";

export const pageSizes = [10, 25, 50] as const;

export type PageSize = (typeof pageSizes)[number];

export const defaultPageSize: PageSize = 25;

export const summaryOrder: readonly RowTone[] = [
  "authorized",
  "cancelled",
  "rejected",
  "denied",
  "not_found",
  "failed",
  "pending",
];

export type NormalizedQuery =
  | { readonly kind: "any" }
  | { readonly kind: "digits"; readonly digits: string }
  | { readonly kind: "invalid" };

const keySeparators = /[\s./-]/g;

export function normalizeQuery(input: string): NormalizedQuery {
  const digits = input.replace(keySeparators, "");
  if (digits === "") {
    return { kind: "any" };
  }
  return /^\d+$/.test(digits) ? { kind: "digits", digits } : { kind: "invalid" };
}

export interface RowSelection {
  readonly tones: ReadonlySet<RowTone>;
  readonly query: string;
  readonly pageIndex: number;
  readonly pageSize: number;
}

export interface VisibleRows {
  readonly pageRows: readonly ReceivableRow[];
  readonly filteredCount: number;
  readonly pageCount: number;
  readonly pageIndex: number;
  readonly from: number;
  readonly to: number;
  readonly hasInvalidQuery: boolean;
}

function matchesQuery(row: ReceivableRow, query: NormalizedQuery): boolean {
  switch (query.kind) {
    case "any":
      return true;
    case "digits":
      return row.invoiceAccessKey.includes(query.digits);
    case "invalid":
      return false;
  }
}

export function selectVisibleRows(
  rows: readonly ReceivableRow[],
  selection: RowSelection,
): VisibleRows {
  const query = normalizeQuery(selection.query);
  const filtered = rows.filter(
    (row) =>
      (selection.tones.size === 0 || selection.tones.has(toneOf(row))) && matchesQuery(row, query),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / selection.pageSize));
  const pageIndex = Math.min(Math.max(selection.pageIndex, 0), pageCount - 1);
  const start = pageIndex * selection.pageSize;
  const pageRows = filtered.slice(start, start + selection.pageSize);
  return {
    pageRows,
    filteredCount: filtered.length,
    pageCount,
    pageIndex,
    from: pageRows.length === 0 ? 0 : start + 1,
    to: start + pageRows.length,
    hasInvalidQuery: query.kind === "invalid",
  };
}

export function filterOptions(summary: RowSummary, tones: ReadonlySet<RowTone>): RowTone[] {
  return summaryOrder.filter((tone) => summary[tone] > 0 || tones.has(tone));
}
