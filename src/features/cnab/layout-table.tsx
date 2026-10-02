import { useLocale, useTranslations } from "next-intl";

import { readField } from "@/domain/cnab/layout";
import { decodeAmount, decodeDueDate } from "@/features/cnab/decode-sample-field";
import type { DetailFieldId } from "@/features/cnab/detail-fields";
import { detailFields } from "@/features/cnab/detail-fields";
import { groupAccessKey } from "@/features/cnab/format-access-key";
import { sampleDetailLine } from "@/features/cnab/sample-detail-line";
import { usePositionLabel } from "@/features/cnab/use-position-label";
import type { Locale } from "@/lib/locale";

function decodedValue(id: DetailFieldId, raw: string, locale: Locale): string | null {
  switch (id) {
    case "dueDate":
      return decodeDueDate(raw, locale);
    case "amount":
      return decodeAmount(raw, locale);
    case "invoiceAccessKey":
      return groupAccessKey(raw);
    default:
      return null;
  }
}

export function LayoutTable() {
  const t = useTranslations("cnab.layout");
  const locale = useLocale();
  const positionLabel = usePositionLabel();

  return (
    <div
      role="region"
      tabIndex={0}
      aria-label={t("table.scrollLabel")}
      className="overflow-x-auto rounded-lg border outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table className="w-full min-w-2xl text-left text-sm">
        <caption className="sr-only">{t("table.caption")}</caption>
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              {t("table.columns.field")}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t("table.columns.positions")}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t("table.columns.raw")}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t("table.columns.decoded")}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t("table.columns.reliability")}
            </th>
          </tr>
        </thead>
        <tbody>
          {detailFields.map((field) => {
            const raw = readField(sampleDetailLine, field.position).trimEnd();
            const decoded =
              field.id === "recordType"
                ? t("table.detailRecord")
                : decodedValue(field.id, raw, locale);
            return (
              <tr key={field.id} className="border-t align-top">
                <th scope="row" className="px-3 py-2 font-medium">
                  {t(`fields.${field.id}`)}
                </th>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                  {positionLabel(field.position)}
                </td>
                <td className="px-3 py-2">
                  <code className="font-mono text-xs break-all">{raw}</code>
                </td>
                <td className="px-3 py-2 tabular-nums">{decoded ?? t("table.notDecoded")}</td>
                <td className="px-3 py-2">
                  {field.reliability === "stable" ? (
                    <span className="font-semibold">{t("table.reliability.stable")}</span>
                  ) : (
                    <span className="text-muted-foreground">{t("table.reliability.observed")}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
