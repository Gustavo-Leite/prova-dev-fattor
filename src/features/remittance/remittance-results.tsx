"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { MouseEvent, RefObject } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { DialogHandle } from "@/components/ui/dialog";
import { createDialogHandle, DialogTrigger } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RemittanceMessage } from "@/features/remittance/describe-remittance-issue";
import { describeSubmitError } from "@/features/remittance/describe-remittance-issue";
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
import {
  requiresSignIn,
  summarizeRows,
  toneOf,
} from "@/features/remittance/remittance-check-state";
import { ReceivableDetailDialog } from "@/features/remittance/receivable-detail-dialog";
import { ResultsPagination } from "@/features/remittance/results-pagination";
import { ResultsToolbar } from "@/features/remittance/results-toolbar";
import type {
  PageSize,
  ResultsView,
  ResultsViewAction,
  RowSort,
  SortColumn,
  SortDirection,
} from "@/features/remittance/select-visible-rows";
import {
  defaultSort,
  nextSort,
  selectFilteredRows,
  selectVisibleRows,
} from "@/features/remittance/select-visible-rows";
import { signInPath } from "@/lib/routes";

export interface RemittanceResultsProps {
  readonly rows: readonly ReceivableRow[];
  readonly lines: readonly string[];
  readonly state: RemittanceCheckState;
  readonly view: ResultsView;
  readonly onViewChange: (action: ResultsViewAction) => void;
  readonly signInLink: RefObject<HTMLAnchorElement | null>;
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
  const [filtersShownOnMount, setFiltersShownOnMount] = useState<{
    readonly tones: ResultsView["tones"];
    readonly query: string;
    readonly phase: RemittanceCheckState["phase"];
  } | null>(() => ({ tones, query, phase: state.phase }));
  if (
    filtersShownOnMount !== null &&
    (tones !== filtersShownOnMount.tones ||
      query !== filtersShownOnMount.query ||
      state.phase !== filtersShownOnMount.phase)
  ) {
    setFiltersShownOnMount(null);
  }

  const summary = summarizeRows(rows);
  const isChecking = state.phase === "checking";
  const hasRows = state.phase !== "idle" && state.phase !== "requestFailed";
  const hasFilters = tones.size > 0 || query !== "";
  const hasChangedSinceMount = filtersShownOnMount === null;
  const visible = selectVisibleRows(rows, view);
  useEffect(() => {
    if (visible.pageIndex !== pageIndex) {
      onViewChange({ type: "pageChanged", pageIndex: visible.pageIndex });
    }
  }, [visible.pageIndex, pageIndex, onViewChange]);

  const translate = (message: RemittanceMessage) => t(message.key, message.values);
  const toneLabel = (tone: RowTone) =>
    tone === "pending" && !isChecking ? t("statuses.notChecked") : t(`statuses.${tone}`);
  const rowLabel = (row: ReceivableRow) =>
    row.state.kind === "failed" ? t(`failureReasons.${row.state.reason}`) : toneLabel(toneOf(row));

  const toggleTone = (tone: RowTone) => {
    onViewChange({ type: "toneToggled", tone });
  };
  const changeQuery = (next: string) => {
    onViewChange({ type: "queryChanged", query: next });
  };
  const clearFilters = () => {
    onViewChange({ type: "filtersCleared" });
  };
  const changeSort = (next: RowSort) => {
    onViewChange({ type: "sortChanged", sort: next });
  };
  const changePageSize = (next: PageSize) => {
    onViewChange({ type: "pageSizeChanged", pageSize: next });
  };
  const changePage = (next: number) => {
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
    hasRows && hasFilters && hasChangedSinceMount && !isChecking
      ? t("filters.matches", { count: visible.filteredCount })
      : "";

  const requestError =
    state.phase === "requestFailed" && state.error.code !== "ABORTED"
      ? describeSubmitError(state.error)
      : null;
  const needsSignIn = requiresSignIn(state);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <p role="status" className="sr-only">
        {filterAnnouncement}
      </p>

      {requestError && (
        <Alert variant="destructive">
          <AlertTitle>{translate(requestError.summary)}</AlertTitle>
          {requestError.details.length > 0 && (
            <AlertDescription>
              <ul className="list-disc pl-5">
                {requestError.details.map((detail, index) => (
                  <li key={`${detail.key}-${String(index)}`}>{translate(detail)}</li>
                ))}
              </ul>
            </AlertDescription>
          )}
          {needsSignIn && <SignInAgainLink ref={signInLink} />}
        </Alert>
      )}
      {state.phase === "failed" && (
        <Alert variant="destructive">
          <AlertTitle>{t("check.credentialsRejected")}</AlertTitle>
          <SignInAgainLink ref={signInLink} />
        </Alert>
      )}
      {state.phase === "interrupted" && (
        <Alert variant="destructive">
          <AlertTitle>{t("check.interrupted")}</AlertTitle>
        </Alert>
      )}

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

const sortOptions: readonly RowSort[] = [
  { column: "ordinal", direction: "asc" },
  { column: "ordinal", direction: "desc" },
  { column: "key", direction: "asc" },
  { column: "key", direction: "desc" },
  { column: "status", direction: "asc" },
  { column: "status", direction: "desc" },
];

function sortValue({ column, direction }: RowSort): `${SortColumn}-${SortDirection}` {
  return `${column}-${direction}`;
}

interface SortControlProps {
  readonly sort: RowSort;
  readonly onSort: (sort: RowSort) => void;
}

function SortSelect({ sort, onSort }: SortControlProps) {
  const t = useTranslations("remittance.sorting");
  const selectId = useId();
  return (
    <div className="flex items-center gap-2 text-sm md:hidden">
      <label htmlFor={selectId}>{t("sortBy")}</label>
      <select
        id={selectId}
        value={sortValue(sort)}
        className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onChange={(event) => {
          onSort(
            sortOptions.find((option) => sortValue(option) === event.target.value) ?? defaultSort,
          );
        }}
      >
        {sortOptions.map((option) => (
          <option key={sortValue(option)} value={sortValue(option)}>
            {t(`options.${sortValue(option)}`)}
          </option>
        ))}
      </select>
    </div>
  );
}

interface SortableHeadProps extends SortControlProps {
  readonly column: SortColumn;
  readonly label: string;
  readonly className?: string;
}

function SortableHead({ column, label, sort, onSort, className }: SortableHeadProps) {
  const direction = sort.column === column ? sort.direction : null;
  const ariaSort = { asc: "ascending", desc: "descending" } as const;
  return (
    <TableHead className={className} aria-sort={direction ? ariaSort[direction] : undefined}>
      <button
        type="button"
        className="-mx-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => {
          onSort(nextSort(sort, column));
        }}
      >
        {label}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={direction ? "size-4" : "size-4 text-muted-foreground"}
        >
          {direction !== "desc" && <path d="m7 10 5-5 5 5" />}
          {direction !== "asc" && <path d="m7 14 5 5 5-5" />}
        </svg>
      </button>
    </TableHead>
  );
}

const interactiveSelector = "a, button, input, label, select, textarea, [role='button']";

function openFromRow(event: MouseEvent<HTMLElement>, trigger: HTMLButtonElement | null) {
  const { target } = event;
  const interactive = target instanceof Element ? target.closest(interactiveSelector) : null;
  if (interactive && !interactive.hasAttribute("data-opens-detail")) {
    return;
  }
  if ((window.getSelection()?.toString() ?? "") !== "") {
    return;
  }
  trigger?.click();
}

interface RowViewProps {
  readonly row: ReceivableRow;
  readonly handle: DialogHandle<number>;
  readonly statusLabel: string;
  readonly isChecking: boolean;
}

interface RowStatusProps {
  readonly row: ReceivableRow;
  readonly label: string;
  readonly isChecking: boolean;
}

function RowStatus({ row, label, isChecking }: RowStatusProps) {
  if (isChecking && toneOf(row) === "pending") {
    return (
      <span className="inline-flex align-middle">
        <span
          aria-hidden="true"
          className="block h-5 w-20 rounded-full border border-border bg-muted motion-safe:animate-pulse"
        />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return <StatusBadge tone={toneOf(row)} label={label} />;
}

interface DetailTriggerProps {
  readonly row: ReceivableRow;
  readonly handle: DialogHandle<number>;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
}

function DetailTrigger({ row, handle, triggerRef }: DetailTriggerProps) {
  const t = useTranslations("remittance.detail");
  return (
    <DialogTrigger
      ref={triggerRef}
      handle={handle}
      payload={row.lineNumber}
      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none group-hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
      <span className="sr-only">{t("openLabel", { ordinal: row.ordinal })}</span>
    </DialogTrigger>
  );
}

interface SignInAgainLinkProps {
  readonly ref: RefObject<HTMLAnchorElement | null>;
}

function SignInAgainLink({ ref }: SignInAgainLinkProps) {
  const t = useTranslations("remittance.check");
  return (
    <AlertDescription>
      <Link
        ref={ref}
        href={signInPath}
        className="rounded-sm font-medium text-primary underline outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      >
        {t("signInAgain")}
      </Link>
    </AlertDescription>
  );
}

function InvalidCheckDigitHint() {
  const t = useTranslations("remittance.check");
  const hintId = useId();
  return (
    <Tooltip>
      <span id={hintId} className="sr-only">
        {t("invalidCheckDigitHint")}
      </span>
      <TooltipTrigger
        data-opens-detail=""
        aria-haspopup="dialog"
        aria-label={t("invalidCheckDigit")}
        aria-describedby={hintId}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-status-denied outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </TooltipTrigger>
      <TooltipContent>{t("invalidCheckDigitHint")}</TooltipContent>
    </Tooltip>
  );
}

function ResultTableRow({ row, handle, statusLabel, isChecking }: RowViewProps) {
  const t = useTranslations("remittance.check");
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <TableRow
      className="group cursor-pointer hover:bg-muted hover:shadow-[inset_3px_0_0_var(--ring)] has-focus-visible:bg-muted has-focus-visible:shadow-[inset_3px_0_0_var(--ring)]"
      onClick={(event) => {
        openFromRow(event, trigger.current);
      }}
    >
      <TableCell>
        <span className="font-medium tabular-nums">{row.ordinal}</span>
        <span className="block text-xs text-muted-foreground">
          {t("fileLine", { lineNumber: row.lineNumber })}
        </span>
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-2">
          <span className="font-mono text-xs">{row.invoiceAccessKey}</span>
          {!row.hasValidCheckDigit && <InvalidCheckDigitHint />}
        </span>
      </TableCell>
      <TableCell>
        <RowStatus row={row} label={statusLabel} isChecking={isChecking} />
      </TableCell>
      <TableCell className="text-right">
        <DetailTrigger row={row} handle={handle} triggerRef={trigger} />
      </TableCell>
    </TableRow>
  );
}

function ResultCard({ row, handle, statusLabel, isChecking }: RowViewProps) {
  const t = useTranslations("remittance.check");
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <li
      className="group flex cursor-pointer flex-col gap-2 rounded-lg border bg-card p-3 text-sm hover:border-ring hover:shadow-md has-focus-visible:border-ring motion-safe:transition motion-safe:hover:-translate-y-0.5"
      onClick={(event) => {
        openFromRow(event, trigger.current);
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{t("cardTitle", { ordinal: row.ordinal })}</span>
        <span className="flex items-center gap-1">
          <RowStatus row={row} label={statusLabel} isChecking={isChecking} />
          <DetailTrigger row={row} handle={handle} triggerRef={trigger} />
        </span>
      </div>
      <span className="inline-flex items-start gap-2">
        <span className="font-mono text-[0.6875rem] tracking-tight break-all text-muted-foreground">
          {row.invoiceAccessKey}
        </span>
        {!row.hasValidCheckDigit && <InvalidCheckDigitHint />}
      </span>
      <span className="text-xs text-muted-foreground">
        {t("fileLine", { lineNumber: row.lineNumber })}
      </span>
    </li>
  );
}
