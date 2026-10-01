"use client";

import { useTranslations } from "next-intl";
import type { MouseEvent, RefObject } from "react";
import { useId, useRef, useState } from "react";

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
import type {
  ReceivableRow,
  RemittanceCheckState,
  RowTone,
} from "@/features/remittance/remittance-check-state";
import { summarizeRows, toneOf } from "@/features/remittance/remittance-check-state";
import { ReceivableDetailDialog } from "@/features/remittance/receivable-detail-dialog";
import { ResultsPagination } from "@/features/remittance/results-pagination";
import { ResultsToolbar } from "@/features/remittance/results-toolbar";
import type { PageSize } from "@/features/remittance/select-visible-rows";
import { defaultPageSize, selectVisibleRows } from "@/features/remittance/select-visible-rows";

export interface RemittanceResultsProps {
  readonly rows: readonly ReceivableRow[];
  readonly lines: readonly string[];
  readonly state: RemittanceCheckState;
}

export function RemittanceResults({ rows, lines, state }: RemittanceResultsProps) {
  const t = useTranslations("remittance");
  const [detailHandle] = useState(() => createDialogHandle<number>());
  const [tones, setTones] = useState<ReadonlySet<RowTone>>(() => new Set());
  const [query, setQuery] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(defaultPageSize);

  const summary = summarizeRows(rows);
  const total = rows.length;
  const isChecking = state.phase === "checking";
  const hasRows = state.phase !== "idle" && state.phase !== "requestFailed";
  const hasFilters = tones.size > 0 || query !== "";
  const visible = selectVisibleRows(rows, { tones, query, pageIndex, pageSize });
  if (visible.pageIndex !== pageIndex) {
    setPageIndex(visible.pageIndex);
  }

  const translate = (message: RemittanceMessage) => t(message.key, message.values);
  const toneLabel = (tone: RowTone) =>
    tone === "pending" && !isChecking ? t("statuses.notChecked") : t(`statuses.${tone}`);
  const rowLabel = (row: ReceivableRow) =>
    row.state.kind === "failed" ? t(`failureReasons.${row.state.reason}`) : toneLabel(toneOf(row));

  const toggleTone = (tone: RowTone) => {
    setTones((current) => {
      const next = new Set(current);
      if (!next.delete(tone)) {
        next.add(tone);
      }
      return next;
    });
    setPageIndex(0);
  };
  const changeQuery = (next: string) => {
    setQuery(next);
    setPageIndex(0);
  };
  const clearFilters = () => {
    setTones(new Set());
    setQuery("");
    setPageIndex(0);
  };
  const changePageSize = (next: PageSize) => {
    setPageSize(next);
    setPageIndex(0);
  };

  const announcement = {
    idle: "",
    requestFailed: "",
    checking: t("check.started", { total }),
    completed: t("check.completed", { total, failed: summary.failed }),
    failed: "",
    interrupted: "",
  }[state.phase];

  const filterAnnouncement =
    hasRows && hasFilters && !isChecking
      ? t("filters.matches", { count: visible.filteredCount })
      : "";

  const requestError =
    state.phase === "requestFailed" && state.error.code !== "ABORTED"
      ? describeSubmitError(state.error)
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <p role="status" className="sr-only">
        {announcement}
      </p>
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
        </Alert>
      )}
      {state.phase === "failed" && (
        <Alert variant="destructive">
          <AlertTitle>{t("check.credentialsRejected")}</AlertTitle>
        </Alert>
      )}
      {state.phase === "interrupted" && (
        <Alert variant="destructive">
          <AlertTitle>{t("check.interrupted")}</AlertTitle>
        </Alert>
      )}

      {hasRows && (
        <>
          <p className="text-sm text-muted-foreground">
            {t("check.progress", { done: total - summary.pending, total })}
          </p>
          <ResultsToolbar
            summary={summary}
            tones={tones}
            query={query}
            hasFilters={hasFilters}
            toneLabel={toneLabel}
            onToggleTone={toggleTone}
            onQueryChange={changeQuery}
            onClear={clearFilters}
          />

          {visible.filteredCount === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {visible.hasInvalidQuery ? t("filters.digitsOnly") : t("filters.noMatches")}
            </p>
          ) : (
            <>
              <div className="hidden min-h-48 flex-1 md:flex md:flex-col">
                <Table
                  containerClassName="flex-1 overflow-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  containerProps={{
                    tabIndex: 0,
                    role: "region",
                    "aria-label": t("check.tableRegion"),
                  }}
                >
                  <TableCaption className="sr-only">{t("check.tableCaption")}</TableCaption>
                  <TableHeader className="sticky top-0 z-20 bg-background shadow-[inset_0_-1px_0_var(--border)]">
                    <TableRow>
                      <TableHead className="w-28">{t("check.ordinalColumn")}</TableHead>
                      <TableHead>{t("check.keyColumn")}</TableHead>
                      <TableHead>{t("check.statusColumn")}</TableHead>
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
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ul className="flex flex-col gap-2 md:hidden">
                {visible.pageRows.map((row) => (
                  <ResultCard
                    key={row.lineNumber}
                    row={row}
                    handle={detailHandle}
                    statusLabel={rowLabel(row)}
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
            onPageChange={setPageIndex}
            onPageSizeChange={changePageSize}
          />
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

function ResultTableRow({ row, handle, statusLabel }: RowViewProps) {
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
        <StatusBadge tone={toneOf(row)} label={statusLabel} />
      </TableCell>
      <TableCell className="text-right">
        <DetailTrigger row={row} handle={handle} triggerRef={trigger} />
      </TableCell>
    </TableRow>
  );
}

function ResultCard({ row, handle, statusLabel }: RowViewProps) {
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
          <StatusBadge tone={toneOf(row)} label={statusLabel} />
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
