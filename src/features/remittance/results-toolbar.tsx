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
  readonly toneLabel: (tone: RowTone) => string;
  readonly onToggleTone: (tone: RowTone) => void;
  readonly onQueryChange: (query: string) => void;
  readonly onClear: () => void;
}

export function ResultsToolbar({
  summary,
  tones,
  query,
  hasFilters,
  toneLabel,
  onToggleTone,
  onQueryChange,
  onClear,
}: ResultsToolbarProps) {
  const t = useTranslations("remittance");
  const searchId = useId();
  const hintId = useId();
  const searchInput = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={t("filters.statusLabel")} className="flex flex-wrap gap-2">
        {filterOptions(summary, tones).map((tone) => (
          <Button
            key={tone}
            variant="outline"
            size="sm"
            aria-pressed={tones.has(tone)}
            className="rounded-full bg-background hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-secondary aria-pressed:ring-2 aria-pressed:ring-foreground dark:bg-background dark:hover:bg-muted dark:aria-pressed:border-foreground dark:aria-pressed:bg-secondary"
            onClick={() => {
              const isLeaving = tones.has(tone) && summary[tone] === 0;
              onToggleTone(tone);
              if (isLeaving) {
                searchInput.current?.focus();
              }
            }}
          >
            <StatusBadge
              tone={tone}
              label={t("check.summaryItem", { label: toneLabel(tone), count: summary[tone] })}
              className="border-0 px-0"
            />
          </Button>
        ))}
      </div>
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
            className="font-mono"
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
            }}
          />
          <p id={hintId} className="text-xs text-muted-foreground">
            {t("filters.searchHint")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="sm:mt-6"
          disabled={!hasFilters}
          focusableWhenDisabled
          onClick={onClear}
        >
          {t("filters.clear")}
        </Button>
      </div>
    </div>
  );
}
