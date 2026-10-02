import { useFormatter, useTranslations } from "next-intl";

import type { AccessKeyField, AccessKeyParts } from "@/domain/cnab/access-key";
import { accessKeyLayout } from "@/domain/cnab/access-key";
import { formatIssuerId, withoutLeadingZeros } from "@/features/cnab/format-access-key";
import { usePositionLabel } from "@/features/cnab/use-position-label";

const accessKeyFields = Object.keys(accessKeyLayout) as AccessKeyField[];

export interface AccessKeyPartListProps {
  readonly parts: AccessKeyParts;
}

export function AccessKeyPartList({ parts }: AccessKeyPartListProps) {
  const t = useTranslations("cnab");
  const positionLabel = usePositionLabel();

  return (
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
  );
}

interface AccessKeyFieldValueProps {
  readonly field: AccessKeyField;
  readonly parts: AccessKeyParts;
}

function AccessKeyFieldValue({ field, parts }: AccessKeyFieldValueProps) {
  const t = useTranslations("cnab");
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
