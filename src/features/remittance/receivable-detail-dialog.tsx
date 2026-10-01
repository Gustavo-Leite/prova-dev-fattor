"use client";

import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/status-badge";
import type { DialogHandle } from "@/components/ui/dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { splitAccessKey } from "@/domain/cnab/access-key";
import type { FieldPosition } from "@/domain/cnab/layout";
import { cnab444Layout } from "@/domain/cnab/layout";
import { AccessKeyPartList } from "@/features/cnab/access-key-parts";
import { groupAccessKey } from "@/features/cnab/format-access-key";
import { LineXray } from "@/features/cnab/line-xray";
import type { ReceivableRow } from "@/features/remittance/remittance-check-state";
import { toneOf } from "@/features/remittance/remittance-check-state";

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
  const tSegments = useTranslations("cnab.segments");
  const parts = splitAccessKey(row.invoiceAccessKey);

  return (
    <>
      <DialogHeader className="pr-8">
        <DialogTitle>{t("title", { ordinal: row.ordinal })}</DialogTitle>
        <DialogDescription>{t("fileLine", { lineNumber: row.lineNumber })}</DialogDescription>
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
          <AccessKeyPartList parts={parts} />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="font-medium">{t("xrayHeading")}</h3>
        <LineXray
          line={line}
          label={t("xrayHeading")}
          caption={t("xrayCaption", { lineNumber: row.lineNumber })}
          segments={[
            { position: recordTypePosition, tone: "solid", label: tSegments("recordType") },
            { position: bankDataPosition, tone: "muted", label: tSegments("bankData") },
            { position: accessKeyPosition, tone: "underline", label: tSegments("accessKey") },
          ]}
        />
      </section>
    </>
  );
}
