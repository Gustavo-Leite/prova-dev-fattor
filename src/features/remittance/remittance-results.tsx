"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RemittanceMessage } from "@/features/remittance/describe-remittance-issue";
import { describeSubmitError } from "@/features/remittance/describe-remittance-issue";
import type {
  ReceivableRow,
  RemittanceCheckState,
  RowTone,
} from "@/features/remittance/remittance-check-state";
import { summarizeRows, toneOf } from "@/features/remittance/remittance-check-state";
import { ResultsPagination } from "@/features/remittance/results-pagination";
import { ResultsToolbar } from "@/features/remittance/results-toolbar";
import type { PageSize } from "@/features/remittance/select-visible-rows";
import { defaultPageSize, selectVisibleRows } from "@/features/remittance/select-visible-rows";

export interface RemittanceResultsProps {
  readonly rows: readonly ReceivableRow[];
  readonly state: RemittanceCheckState;
}

export function RemittanceResults({ rows, state }: RemittanceResultsProps) {
  const t = useTranslations("remittance");
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
    <div className="flex flex-col gap-4">
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
              <div className="hidden md:block">
                <Table>
                  <TableCaption className="sr-only">{t("check.tableCaption")}</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">{t("check.lineColumn")}</TableHead>
                      <TableHead>{t("check.keyColumn")}</TableHead>
                      <TableHead>{t("check.statusColumn")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.pageRows.map((row) => (
                      <TableRow key={row.lineNumber}>
                        <TableCell className="tabular-nums">{row.lineNumber}</TableCell>
                        <TableCell className="font-mono text-xs">{row.invoiceAccessKey}</TableCell>
                        <TableCell>
                          <StatusBadge tone={toneOf(row)} label={rowLabel(row)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ul className="flex flex-col gap-2 md:hidden">
                {visible.pageRows.map((row) => (
                  <li
                    key={row.lineNumber}
                    className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {t("check.lineLabel", { lineNumber: row.lineNumber })}
                      </span>
                      <StatusBadge tone={toneOf(row)} label={rowLabel(row)} />
                    </div>
                    <span className="font-mono text-[0.6875rem] tracking-tight break-all text-muted-foreground">
                      {row.invoiceAccessKey}
                    </span>
                  </li>
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
        </>
      )}
    </div>
  );
}
