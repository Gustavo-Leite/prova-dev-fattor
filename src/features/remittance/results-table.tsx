"use client";

import { useTranslations } from "next-intl";
import { useRef } from "react";

import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import type { RowViewProps } from "@/features/remittance/result-row-parts";
import {
  DetailTrigger,
  InvalidCheckDigitHint,
  openFromRow,
  RowStatus,
} from "@/features/remittance/result-row-parts";
import type { RowSort, SortColumn } from "@/features/remittance/select-visible-rows";
import { nextSort } from "@/features/remittance/select-visible-rows";

export interface SortControlProps {
  readonly sort: RowSort;
  readonly onSort: (sort: RowSort) => void;
}

interface SortableHeadProps extends SortControlProps {
  readonly column: SortColumn;
  readonly label: string;
  readonly className?: string;
}

export function SortableHead({ column, label, sort, onSort, className }: SortableHeadProps) {
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

export function ResultTableRow({ row, handle, statusLabel, isChecking }: RowViewProps) {
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
