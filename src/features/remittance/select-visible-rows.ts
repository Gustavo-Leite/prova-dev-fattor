import type {
  ReceivableRow,
  RowSummary,
  RowTone,
} from "@/features/remittance/remittance-check-state";
import { toneOf } from "@/features/remittance/remittance-check-state";

export const pageSizes = [10, 25, 50] as const;

export type PageSize = (typeof pageSizes)[number];

export const defaultPageSize: PageSize = 25;

const summaryOrder: readonly RowTone[] = [
  "authorized",
  "cancelled",
  "rejected",
  "denied",
  "not_found",
  "failed",
  "pending",
];

type NormalizedQuery =
  | { readonly kind: "any" }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "invalid" };

const keySeparators = /[\s./-]/g;
const asciiKeyCharacters = /^[0-9A-Za-z]+$/;

export function normalizeQuery(input: string): NormalizedQuery {
  const compact = input.replace(keySeparators, "");
  if (compact === "") {
    return { kind: "any" };
  }
  return asciiKeyCharacters.test(compact)
    ? { kind: "text", text: compact.toUpperCase() }
    : { kind: "invalid" };
}

export type SortColumn = "ordinal" | "key" | "status";

export type SortDirection = "asc" | "desc";

export interface RowSort {
  readonly column: SortColumn;
  readonly direction: SortDirection;
}

export const defaultSort: RowSort = { column: "ordinal", direction: "asc" };

export function nextSort(current: RowSort, column: SortColumn): RowSort {
  if (current.column !== column) {
    return { column, direction: "asc" };
  }
  if (current.direction === "asc") {
    return { column, direction: "desc" };
  }
  return defaultSort;
}

export interface RowFilter {
  readonly tones: ReadonlySet<RowTone>;
  readonly query: string;
  readonly sort: RowSort;
}

export interface RowSelection extends RowFilter {
  readonly pageIndex: number;
  readonly pageSize: number;
}

export interface ResultsView extends RowFilter {
  readonly pageIndex: number;
  readonly pageSize: PageSize;
}

export type ResultsViewAction =
  | { readonly type: "toneToggled"; readonly tone: RowTone }
  | { readonly type: "queryChanged"; readonly query: string }
  | { readonly type: "filtersCleared" }
  | { readonly type: "sortChanged"; readonly sort: RowSort }
  | { readonly type: "pageChanged"; readonly pageIndex: number }
  | { readonly type: "pageSizeChanged"; readonly pageSize: PageSize }
  | { readonly type: "reset" };

export function createResultsView(): ResultsView {
  return {
    tones: new Set(),
    query: "",
    sort: defaultSort,
    pageIndex: 0,
    pageSize: defaultPageSize,
  };
}

function toggleTone(tones: ReadonlySet<RowTone>, tone: RowTone): ReadonlySet<RowTone> {
  const next = new Set(tones);
  if (!next.delete(tone)) {
    next.add(tone);
  }
  return next;
}

export function resultsViewReducer(view: ResultsView, action: ResultsViewAction): ResultsView {
  switch (action.type) {
    case "toneToggled":
      return { ...view, tones: toggleTone(view.tones, action.tone), pageIndex: 0 };
    case "queryChanged":
      return { ...view, query: action.query, pageIndex: 0 };
    case "filtersCleared":
      return { ...view, tones: new Set(), query: "", pageIndex: 0 };
    case "sortChanged":
      return { ...view, sort: action.sort, pageIndex: 0 };
    case "pageChanged":
      return action.pageIndex === view.pageIndex ? view : { ...view, pageIndex: action.pageIndex };
    case "pageSizeChanged":
      return { ...view, pageSize: action.pageSize, pageIndex: 0 };
    case "reset":
      return createResultsView();
  }
}

interface VisibleRows {
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
    case "text":
      return row.invoiceAccessKey.includes(query.text);
    case "invalid":
      return false;
  }
}

const toneRank = new Map(summaryOrder.map((tone, index) => [tone, index]));

function compareBy(column: SortColumn, left: ReceivableRow, right: ReceivableRow): number {
  switch (column) {
    case "ordinal":
      return left.ordinal - right.ordinal;
    case "key":
      if (left.invoiceAccessKey === right.invoiceAccessKey) {
        return 0;
      }
      return left.invoiceAccessKey < right.invoiceAccessKey ? -1 : 1;
    case "status":
      return (toneRank.get(toneOf(left)) ?? 0) - (toneRank.get(toneOf(right)) ?? 0);
  }
}

function sortRows(rows: readonly ReceivableRow[], sort: RowSort): ReceivableRow[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort(
    (left, right) => sign * compareBy(sort.column, left, right) || left.ordinal - right.ordinal,
  );
}

export function selectFilteredRows(
  rows: readonly ReceivableRow[],
  filter: RowFilter,
): ReceivableRow[] {
  const query = normalizeQuery(filter.query);
  return sortRows(
    rows.filter(
      (row) =>
        (filter.tones.size === 0 || filter.tones.has(toneOf(row))) && matchesQuery(row, query),
    ),
    filter.sort,
  );
}

export function selectVisibleRows(
  rows: readonly ReceivableRow[],
  selection: RowSelection,
): VisibleRows {
  const filtered = selectFilteredRows(rows, selection);
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
    hasInvalidQuery: normalizeQuery(selection.query).kind === "invalid",
  };
}

export function filterOptions(summary: RowSummary, tones: ReadonlySet<RowTone>): RowTone[] {
  return summaryOrder.filter((tone) => summary[tone] > 0 || tones.has(tone));
}
