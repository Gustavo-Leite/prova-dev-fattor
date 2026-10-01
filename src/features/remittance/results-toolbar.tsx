"use client";

import { useTranslations } from "next-intl";
import { useId, useRef } from "react";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RowSummary, RowTone } from "@/features/remittance/remittance-check-state";
import { filterOptions } from "@/features/remittance/select-visible-rows";

export interface ResultsToolbarProps {
  readonly summary: RowSummary;
  readonly tones: ReadonlySet<RowTone>;
  readonly query: string;
  readonly hasFilters: boolean;
  readonly exportCount: number;
  readonly canExport: boolean;
  readonly toneLabel: (tone: RowTone) => string;
  readonly onToggleTone: (tone: RowTone) => void;
  readonly onQueryChange: (query: string) => void;
  readonly onClear: () => void;
  readonly onExport: () => void;
}

export function ResultsToolbar({
  summary,
  tones,
  query,
  hasFilters,
  exportCount,
  canExport,
  toneLabel,
  onToggleTone,
  onQueryChange,
  onClear,
  onExport,
}: ResultsToolbarProps) {
  const t = useTranslations("remittance");
  const searchId = useId();
  const hintId = useId();
  const filterLabelId = useId();
  const searchInput = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 md:rounded-none md:border-x-0 md:border-t-0 md:bg-transparent md:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={searchId} className="text-sm font-medium">
            {t("filters.searchLabel")}
          </label>
          <Input
            ref={searchInput}
            id={searchId}
            type="search"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={hintId}
            className="font-mono focus-visible:ring-offset-card"
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
            }}
          />
          <p id={hintId} className="text-xs text-muted-foreground">
            {t("filters.searchHint")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:mt-6">
          <Button
            variant="ghost"
            size="sm"
            className="focus-visible:ring-offset-card"
            disabled={!hasFilters}
            focusableWhenDisabled
            onClick={onClear}
          >
            {t("filters.clear")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="focus-visible:ring-offset-card"
            disabled={!canExport}
            focusableWhenDisabled
            onClick={onExport}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 15V3M7 10l5 5 5-5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            </svg>
            {t("export.button", { count: exportCount })}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span id={filterLabelId} className="text-sm font-medium">
          {t("filters.statusLabel")}
        </span>
        <div role="group" aria-labelledby={filterLabelId} className="flex flex-wrap gap-2">
          {filterOptions(summary, tones).map((tone) => (
            <Button
              key={tone}
              variant="outline"
              size="sm"
              aria-pressed={tones.has(tone)}
              className="group rounded-full bg-card hover:bg-muted focus-visible:ring-offset-card aria-pressed:border-foreground aria-pressed:bg-secondary aria-pressed:ring-2 aria-pressed:ring-foreground dark:bg-card dark:hover:bg-muted dark:aria-pressed:border-foreground dark:aria-pressed:bg-secondary"
              onClick={() => {
                const isLeaving = tones.has(tone) && summary[tone] === 0;
                onToggleTone(tone);
                if (isLeaving) {
                  searchInput.current?.focus();
                }
              }}
            >
              <span
                aria-hidden="true"
                className="flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border border-input group-aria-pressed:border-foreground group-aria-pressed:bg-foreground group-aria-pressed:text-card"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="hidden size-3 group-aria-pressed:block"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <StatusBadge
                tone={tone}
                label={t("check.summaryItem", { label: toneLabel(tone), count: summary[tone] })}
                className="border-0 px-0"
              />
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
