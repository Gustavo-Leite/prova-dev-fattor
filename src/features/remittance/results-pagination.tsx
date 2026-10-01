"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import type { PageSize } from "@/features/remittance/select-visible-rows";
import { defaultPageSize, pageSizes } from "@/features/remittance/select-visible-rows";

export interface ResultsPaginationProps {
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly pageSize: PageSize;
  readonly from: number;
  readonly to: number;
  readonly count: number;
  readonly onPageChange: (pageIndex: number) => void;
  readonly onPageSizeChange: (pageSize: PageSize) => void;
}

function toPageSize(value: string): PageSize {
  return pageSizes.find((size) => String(size) === value) ?? defaultPageSize;
}

export function ResultsPagination({
  pageIndex,
  pageCount,
  pageSize,
  from,
  to,
  count,
  onPageChange,
  onPageSizeChange,
}: ResultsPaginationProps) {
  const t = useTranslations("remittance.pagination");
  const pageSizeId = useId();

  return (
    <nav
      aria-label={t("label")}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-sm md:mt-auto md:rounded-t-none md:rounded-b-[calc(var(--radius)-1px)] md:border-x-0 md:border-b-0 md:bg-muted/40 md:px-4"
    >
      <p className="text-muted-foreground tabular-nums">
        {count > 0 ? t("range", { from, to, count }) : ""}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor={pageSizeId}>{t("pageSize")}</label>
          <select
            id={pageSizeId}
            value={pageSize}
            className="h-8 rounded-lg border border-input bg-card px-2 tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            onChange={(event) => {
              onPageSizeChange(toPageSize(event.target.value));
            }}
          >
            {pageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="bg-card focus-visible:ring-offset-card dark:bg-card"
            disabled={pageIndex === 0}
            focusableWhenDisabled
            onClick={() => {
              onPageChange(pageIndex - 1);
            }}
          >
            {t("previous")}
          </Button>
          <span role="status" className="whitespace-nowrap tabular-nums">
            {t("page", { page: pageIndex + 1, pageCount })}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="bg-card focus-visible:ring-offset-card dark:bg-card"
            disabled={pageIndex >= pageCount - 1}
            focusableWhenDisabled
            onClick={() => {
              onPageChange(pageIndex + 1);
            }}
          >
            {t("next")}
          </Button>
        </div>
      </div>
    </nav>
  );
}
