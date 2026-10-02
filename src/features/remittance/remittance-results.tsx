"use client";

import { useLocale, useTranslations } from "next-intl";
import type { RefObject } from "react";
import { useEffect, useState } from "react";

import { createDialogHandle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckAlerts } from "@/features/remittance/check-alerts";
import {
  csvDelimiterFor,
  downloadCsv,
  toCsv,
  toRemittanceCsvRecords,
} from "@/features/remittance/export-csv";
import type {
  ReceivableRow,
  RemittanceCheckState,
  RowTone,
} from "@/features/remittance/remittance-check-state";
import { summarizeRows, toneOf } from "@/features/remittance/remittance-check-state";
import { ReceivableDetailDialog } from "@/features/remittance/receivable-detail-dialog";
import { ResultCard, SortSelect } from "@/features/remittance/result-cards";
import { ResultsPagination } from "@/features/remittance/results-pagination";
import { ResultTableRow, SortableHead } from "@/features/remittance/results-table";
import { ResultsToolbar } from "@/features/remittance/results-toolbar";
import type {
  PageSize,
  ResultsView,
  ResultsViewAction,
  RowSort,
} from "@/features/remittance/select-visible-rows";
import { selectFilteredRows, selectVisibleRows } from "@/features/remittance/select-visible-rows";
import { useChangedSinceMount } from "@/features/remittance/use-changed-since-mount";

export interface RemittanceResultsProps {
  readonly rows: readonly ReceivableRow[];
  readonly lines: readonly string[];
  readonly state: RemittanceCheckState;
  readonly view: ResultsView;
  readonly onViewChange: (action: ResultsViewAction) => void;
  readonly signInLink: RefObject<HTMLAnchorElement | null>;
}

const searchAnnouncementDelayMs = 500;

interface PageAnnouncement {
  readonly page: number;
  readonly pageCount: number;
  readonly phase: RemittanceCheckState["phase"];
}

interface FiltersSnapshot {
  readonly tones: ResultsView["tones"];
  readonly query: string;
  readonly phase: RemittanceCheckState["phase"];
}

function isSameFilters(mounted: FiltersSnapshot, current: FiltersSnapshot): boolean {
  return (
    mounted.tones === current.tones &&
    mounted.query === current.query &&
    mounted.phase === current.phase
  );
}

export function RemittanceResults({
  rows,
  lines,
  state,
  view,
  onViewChange,
  signInLink,
}: RemittanceResultsProps) {
  const t = useTranslations("remittance");
  const locale = useLocale();
  const [detailHandle] = useState(() => createDialogHandle<number>());
  const { tones, query, sort, pageIndex, pageSize } = view;
  const hasChangedSinceMount = useChangedSinceMount<FiltersSnapshot>(
    { tones, query, phase: state.phase },
    { isSame: isSameFilters },
  );
  const [pageAnnouncement, setPageAnnouncement] = useState<PageAnnouncement | null>(null);
  if (pageAnnouncement !== null && pageAnnouncement.phase !== state.phase) {
    setPageAnnouncement(null);
  }
  const [settledQuery, setSettledQuery] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettledQuery(query);
    }, searchAnnouncementDelayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  const summary = summarizeRows(rows);
  const isChecking = state.phase === "checking";
  const hasRows = state.phase !== "idle" && state.phase !== "requestFailed";
  const hasFilters = tones.size > 0 || query !== "";
  const visible = selectVisibleRows(rows, view);
  useEffect(() => {
    if (visible.pageIndex !== pageIndex) {
      onViewChange({ type: "pageChanged", pageIndex: visible.pageIndex });
    }
  }, [visible.pageIndex, pageIndex, onViewChange]);

  const toneLabel = (tone: RowTone) =>
    tone === "pending" && !isChecking ? t("statuses.notChecked") : t(`statuses.${tone}`);
  const rowLabel = (row: ReceivableRow) =>
    row.state.kind === "failed" ? t(`failureReasons.${row.state.reason}`) : toneLabel(toneOf(row));

  const announcePage = (target: ResultsView) => {
    const landing = selectVisibleRows(rows, target);
    setPageAnnouncement({
      page: landing.pageIndex + 1,
      pageCount: landing.pageCount,
      phase: state.phase,
    });
  };
  const toggleTone = (tone: RowTone) => {
    setPageAnnouncement(null);
    onViewChange({ type: "toneToggled", tone });
  };
  const changeQuery = (next: string) => {
    setPageAnnouncement(null);
    onViewChange({ type: "queryChanged", query: next });
  };
  const clearFilters = () => {
    setPageAnnouncement(null);
    onViewChange({ type: "filtersCleared" });
  };
  const changeSort = (next: RowSort) => {
    if (pageAnnouncement !== null) {
      announcePage({ ...view, sort: next, pageIndex: 0 });
    }
    onViewChange({ type: "sortChanged", sort: next });
  };
  const changePageSize = (next: PageSize) => {
    announcePage({ ...view, pageSize: next, pageIndex: 0 });
    onViewChange({ type: "pageSizeChanged", pageSize: next });
  };
  const changePage = (next: number) => {
    announcePage({ ...view, pageIndex: next });
    onViewChange({ type: "pageChanged", pageIndex: next });
  };
  const exportRows = () => {
    const header = [
      t("check.ordinalColumn"),
      t("export.lineColumn"),
      t("check.keyColumn"),
      t("check.statusColumn"),
    ];
    const records = toRemittanceCsvRecords(
      selectFilteredRows(rows, { tones, query, sort }),
      rowLabel,
    );
    downloadCsv(
      t("export.fileName"),
      toCsv(header, records, { delimiter: csvDelimiterFor(locale) }),
    );
  };

  const filterAnnouncement =
    hasRows && hasFilters && hasChangedSinceMount && !isChecking && query === settledQuery
      ? t("filters.matches", { count: visible.filteredCount })
      : "";
  const listAnnouncement =
    pageAnnouncement === null
      ? filterAnnouncement
      : t("pagination.page", {
          page: pageAnnouncement.page,
          pageCount: pageAnnouncement.pageCount,
        });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <p role="status" className="sr-only">
        {listAnnouncement}
      </p>

      <CheckAlerts state={state} signInLink={signInLink} />

      {hasRows && (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-4 md:gap-0 md:rounded-lg md:border md:bg-card md:has-[[data-slot=table-container]:focus-visible]:outline-2 md:has-[[data-slot=table-container]:focus-visible]:outline-offset-2 md:has-[[data-slot=table-container]:focus-visible]:outline-ring">
            <ResultsToolbar
              summary={summary}
              tones={tones}
              query={query}
              hasFilters={hasFilters}
              exportCount={visible.filteredCount}
              canExport={!isChecking && visible.filteredCount > 0}
              toneLabel={toneLabel}
              onToggleTone={toggleTone}
              onQueryChange={changeQuery}
              onClear={clearFilters}
              onExport={exportRows}
            />

            {visible.filteredCount === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground md:m-4">
                {visible.hasInvalidQuery ? t("filters.invalidCharacters") : t("filters.noMatches")}
              </p>
            ) : (
              <>
                <div className="hidden min-h-48 flex-1 md:flex md:flex-col">
                  <Table
                    containerClassName="flex-1 overflow-auto focus-visible:outline-none"
                    containerProps={{
                      tabIndex: 0,
                      role: "region",
                      "aria-label": t("check.tableRegion"),
                    }}
                  >
                    <TableCaption className="sr-only">{t("check.tableCaption")}</TableCaption>
                    <TableHeader className="sticky top-0 z-20 bg-card shadow-[inset_0_-1px_0_var(--border)]">
                      <TableRow>
                        <SortableHead
                          column="ordinal"
                          label={t("check.ordinalColumn")}
                          sort={sort}
                          onSort={changeSort}
                          className="w-28"
                        />
                        <SortableHead
                          column="key"
                          label={t("check.keyColumn")}
                          sort={sort}
                          onSort={changeSort}
                        />
                        <SortableHead
                          column="status"
                          label={t("check.statusColumn")}
                          sort={sort}
                          onSort={changeSort}
                        />
                        <TableHead className="w-12">
                          <span className="sr-only">{t("detail.column")}</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.pageRows.map((row) => (
                        <ResultTableRow
                          key={row.lineNumber}
                          row={row}
                          handle={detailHandle}
                          statusLabel={rowLabel(row)}
                          isChecking={isChecking}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <SortSelect sort={sort} onSort={changeSort} />
                <ul className="flex flex-col gap-2 md:hidden">
                  {visible.pageRows.map((row) => (
                    <ResultCard
                      key={row.lineNumber}
                      row={row}
                      handle={detailHandle}
                      statusLabel={rowLabel(row)}
                      isChecking={isChecking}
                    />
                  ))}
                </ul>
              </>
            )}

            <ResultsPagination
              pageIndex={visible.pageIndex}
              pageCount={visible.pageCount}
              pageSize={pageSize}
              from={visible.from}
              to={visible.to}
              count={visible.filteredCount}
              onPageChange={changePage}
              onPageSizeChange={changePageSize}
            />
          </div>
          <ReceivableDetailDialog
            handle={detailHandle}
            rows={rows}
            lines={lines}
            statusLabel={rowLabel}
          />
        </>
      )}
    </div>
  );
}
