"use client";

import { useFormatter, useTranslations } from "next-intl";

import { StatusBadge } from "@/components/status-badge";
import type { DialogHandle } from "@/components/ui/dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AccessKeyField, AccessKeyParts } from "@/domain/cnab/access-key";
import { accessKeyLayout, splitAccessKey } from "@/domain/cnab/access-key";
import type { FieldPosition } from "@/domain/cnab/layout";
import { cnab444Layout, readField } from "@/domain/cnab/layout";
import {
  formatIssuerId,
  groupAccessKey,
  withoutLeadingZeros,
} from "@/features/remittance/format-access-key";
import type { ReceivableRow } from "@/features/remittance/remittance-check-state";
import { toneOf } from "@/features/remittance/remittance-check-state";

const accessKeyFields = Object.keys(accessKeyLayout) as AccessKeyField[];

const recordTypePosition = cnab444Layout.recordType;
const accessKeyPosition = cnab444Layout.detail.invoiceAccessKey;
const bankDataPosition: FieldPosition = {
  start: recordTypePosition.end + 1,
  end: accessKeyPosition.start - 1,
};

export interface ReceivableDetailDialogProps {
  readonly handle: DialogHandle<number>;
  readonly rows: readonly ReceivableRow[];
  readonly lines: readonly string[];
  readonly statusLabel: (row: ReceivableRow) => string;
}

export function ReceivableDetailDialog({
  handle,
  rows,
  lines,
  statusLabel,
}: ReceivableDetailDialogProps) {
  const t = useTranslations("remittance.detail");

  return (
    <Dialog handle={handle}>
      {({ payload }) => {
        const row = rows.find((candidate) => candidate.lineNumber === payload);
        return (
          <DialogContent closeLabel={t("close")} className="sm:max-w-2xl">
            {row ? (
              <ReceivableDetail
                row={row}
                line={lines[row.lineNumber - 1] ?? ""}
                statusLabel={statusLabel(row)}
              />
            ) : (
              <DialogTitle>{t("unavailable")}</DialogTitle>
            )}
          </DialogContent>
        );
      }}
    </Dialog>
  );
}

interface ReceivableDetailProps {
  readonly row: ReceivableRow;
  readonly line: string;
  readonly statusLabel: string;
}

function ReceivableDetail({ row, line, statusLabel }: ReceivableDetailProps) {
  const t = useTranslations("remittance.detail");
  const parts = splitAccessKey(row.invoiceAccessKey);

  const positionLabel = ({ start, end }: FieldPosition) =>
    start === end ? t("position", { start }) : t("positions", { start, end });

  return (
    <>
      <DialogHeader className="pr-8">
        <DialogTitle>{t("title", { lineNumber: row.lineNumber })}</DialogTitle>
        <div>
          <StatusBadge tone={toneOf(row)} label={statusLabel} />
        </div>
      </DialogHeader>

      <section className="flex flex-col gap-1">
        <h3 className="font-medium">{t("keyHeading")}</h3>
        <p className="font-mono text-xs">{groupAccessKey(row.invoiceAccessKey)}</p>
      </section>

      {parts && (
        <section className="flex flex-col gap-2">
          <h3 className="font-medium">{t("partsHeading")}</h3>
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {accessKeyFields.map((field) => (
              <div key={field} className="flex flex-col">
                <dt className="text-muted-foreground">
                  {t(`fields.${field}`)}{" "}
                  <span className="text-xs">{positionLabel(accessKeyLayout[field])}</span>
                </dt>
                <dd className="font-medium tabular-nums">
                  <AccessKeyFieldValue field={field} parts={parts} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <figure className="flex flex-col gap-2">
        <h3 className="font-medium">{t("xrayHeading")}</h3>
        <pre
          role="img"
          aria-label={t("xrayHeading")}
          className="rounded-lg border p-2 font-mono text-[0.6875rem] leading-5 break-all whitespace-pre-wrap"
        >
          <span className="bg-primary text-primary-foreground">
            {readField(line, recordTypePosition)}
          </span>
          <span className="bg-muted text-muted-foreground">
            {readField(line, bankDataPosition)}
          </span>
          <span className="font-semibold text-foreground underline decoration-ring decoration-2 underline-offset-4">
            {readField(line, accessKeyPosition)}
          </span>
        </pre>
        <figcaption className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>{t("xrayCaption", { lineNumber: row.lineNumber })}</span>
          <ul className="flex flex-col gap-1">
            <XrayLegendItem swatch="size-3 rounded-sm bg-primary" label={t("xrayRecordType")}>
              {positionLabel(recordTypePosition)}
            </XrayLegendItem>
            <XrayLegendItem
              swatch="size-3 rounded-sm border border-input bg-muted"
              label={t("xrayBankData")}
            >
              {positionLabel(bankDataPosition)}
            </XrayLegendItem>
            <XrayLegendItem swatch="h-0.5 w-3 bg-ring" label={t("xrayKey")}>
              {positionLabel(accessKeyPosition)}
            </XrayLegendItem>
          </ul>
        </figcaption>
      </figure>
    </>
  );
}

interface XrayLegendItemProps {
  readonly swatch: string;
  readonly label: string;
  readonly children: string;
}

function XrayLegendItem({ swatch, label, children }: XrayLegendItemProps) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden="true" className={`shrink-0 ${swatch}`} />
      <span>
        {label} <span className="tabular-nums">{children}</span>
      </span>
    </li>
  );
}

interface AccessKeyFieldValueProps {
  readonly field: AccessKeyField;
  readonly parts: AccessKeyParts;
}

function AccessKeyFieldValue({ field, parts }: AccessKeyFieldValueProps) {
  const t = useTranslations("remittance.detail");
  const format = useFormatter();
  const value = parts.fields[field];

  switch (field) {
    case "stateCode":
      return parts.stateAbbreviation
        ? t("state", { code: value, abbreviation: parts.stateAbbreviation })
        : value;
    case "yearMonth":
      return parts.issuedMonth
        ? format.dateTime(
            new Date(Date.UTC(parts.issuedMonth.year, parts.issuedMonth.month - 1, 1)),
            { year: "numeric", month: "long", timeZone: "UTC" },
          )
        : value;
    case "issuerId":
      return formatIssuerId(value);
    case "series":
    case "number":
      return withoutLeadingZeros(value);
    case "checkDigit":
      return String(parts.expectedCheckDigit) === value
        ? t("checkDigitValid", { digit: value })
        : t("checkDigitInvalid", { digit: value, expected: parts.expectedCheckDigit });
    default:
      return value;
  }
}
