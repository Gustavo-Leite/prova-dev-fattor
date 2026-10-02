"use client";

import { useTranslations } from "next-intl";
import { useId, useRef } from "react";

import type { RowViewProps } from "@/features/remittance/result-row-parts";
import {
  DetailTrigger,
  InvalidCheckDigitHint,
  openFromRow,
  RowStatus,
} from "@/features/remittance/result-row-parts";
import type { SortControlProps } from "@/features/remittance/results-table";
import type { RowSort, SortColumn, SortDirection } from "@/features/remittance/select-visible-rows";
import { defaultSort } from "@/features/remittance/select-visible-rows";

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

export function SortSelect({ sort, onSort }: SortControlProps) {
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

export function ResultCard({ row, handle, statusLabel, isChecking }: RowViewProps) {
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
