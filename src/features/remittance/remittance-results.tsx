"use client";

import { useTranslations } from "next-intl";

import type { StatusBadgeTone } from "@/components/status-badge";
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
} from "@/features/remittance/remittance-check-state";
import { summarizeRows } from "@/features/remittance/remittance-check-state";

const summaryOrder: readonly StatusBadgeTone[] = [
  "authorized",
  "cancelled",
  "rejected",
  "denied",
  "not_found",
  "failed",
  "pending",
];

export interface RemittanceResultsProps {
  readonly rows: readonly ReceivableRow[];
  readonly state: RemittanceCheckState;
}

function toneOf(row: ReceivableRow): StatusBadgeTone {
  return row.state.kind === "status" ? row.state.status : row.state.kind;
}

export function RemittanceResults({ rows, state }: RemittanceResultsProps) {
  const t = useTranslations("remittance");
  const summary = summarizeRows(rows);
  const total = rows.length;
  const isChecking = state.phase === "checking";
  const hasRows = state.phase !== "idle" && state.phase !== "requestFailed";

  const translate = (message: RemittanceMessage) => t(message.key, message.values);
  const toneLabel = (tone: StatusBadgeTone) =>
    tone === "pending" && !isChecking ? t("statuses.notChecked") : t(`statuses.${tone}`);
  const rowLabel = (row: ReceivableRow) =>
    row.state.kind === "failed" ? t(`failureReasons.${row.state.reason}`) : toneLabel(toneOf(row));

  const announcement = {
    idle: "",
    requestFailed: "",
    checking: t("check.started", { total }),
    completed: t("check.completed", { total, failed: summary.failed }),
    failed: "",
    interrupted: "",
  }[state.phase];

  const requestError =
    state.phase === "requestFailed" && state.error.code !== "ABORTED"
      ? describeSubmitError(state.error)
      : null;

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="sr-only">
        {announcement}
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
          <ul aria-label={t("check.summaryLabel")} className="flex flex-wrap gap-2">
            {summaryOrder
              .filter((tone) => summary[tone] > 0)
              .map((tone) => (
                <li key={tone}>
                  <StatusBadge
                    tone={tone}
                    label={t("check.summaryItem", {
                      label: toneLabel(tone),
                      count: summary[tone],
                    })}
                  />
                </li>
              ))}
          </ul>

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
                {rows.map((row) => (
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
            {rows.map((row) => (
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
    </div>
  );
}
