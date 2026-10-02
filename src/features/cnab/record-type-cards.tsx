import { useTranslations } from "next-intl";

import type { FieldPosition } from "@/domain/cnab/layout";
import { cnab444Layout, recordTypeCodes } from "@/domain/cnab/layout";
import { usePositionLabel } from "@/features/cnab/use-position-label";

const sampleRecordCountDigits: FieldPosition = {
  start: cnab444Layout.trailer.recordCount.start,
  end: 398,
};

export function RecordTypeCards() {
  const t = useTranslations("cnab.layout.records");
  const positionLabel = usePositionLabel();
  const recordType = (code: string) =>
    t("recordType", { code, position: positionLabel(cnab444Layout.recordType) });

  const cards = [
    {
      id: "header",
      name: t("header.name"),
      recordType: recordType(recordTypeCodes.header),
      description: t("header.description"),
      fact: null,
    },
    {
      id: "detail",
      name: t("detail.name"),
      recordType: recordType(recordTypeCodes.detail),
      description: t("detail.description"),
      fact: t("detail.accessKey", {
        positions: positionLabel(cnab444Layout.detail.invoiceAccessKey),
      }),
    },
    {
      id: "trailer",
      name: t("trailer.name"),
      recordType: recordType(recordTypeCodes.trailer),
      description: t("trailer.description"),
      fact: t("trailer.recordCount", {
        positions: positionLabel(cnab444Layout.trailer.recordCount),
        samplePositions: positionLabel(sampleRecordCountDigits),
      }),
    },
  ];

  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {cards.map((card) => (
        <li key={card.id} className="flex flex-col gap-1 rounded-lg border bg-card p-4 text-sm">
          <h3 className="text-base font-semibold">{card.name}</h3>
          <p className="font-mono text-xs text-muted-foreground">{card.recordType}</p>
          <p>{card.description}</p>
          {card.fact && <p className="text-muted-foreground">{card.fact}</p>}
        </li>
      ))}
    </ul>
  );
}
