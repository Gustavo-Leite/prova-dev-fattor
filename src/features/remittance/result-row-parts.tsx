"use client";

import { useTranslations } from "next-intl";
import type { MouseEvent, RefObject } from "react";
import { useId } from "react";

import { StatusBadge } from "@/components/status-badge";
import type { DialogHandle } from "@/components/ui/dialog";
import { DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReceivableRow } from "@/features/remittance/remittance-check-state";
import { toneOf } from "@/features/remittance/remittance-check-state";

export interface RowViewProps {
  readonly row: ReceivableRow;
  readonly handle: DialogHandle<number>;
  readonly statusLabel: string;
  readonly isChecking: boolean;
}

const interactiveSelector = "a, button, input, label, select, textarea, [role='button']";

export function openFromRow(event: MouseEvent<HTMLElement>, trigger: HTMLButtonElement | null) {
  const { target } = event;
  const interactive = target instanceof Element ? target.closest(interactiveSelector) : null;
  if (interactive && !interactive.hasAttribute("data-opens-detail")) {
    return;
  }
  if ((window.getSelection()?.toString() ?? "") !== "") {
    return;
  }
  trigger?.click();
}

interface RowStatusProps {
  readonly row: ReceivableRow;
  readonly label: string;
  readonly isChecking: boolean;
}

export function RowStatus({ row, label, isChecking }: RowStatusProps) {
  if (isChecking && toneOf(row) === "pending") {
    return (
      <span className="inline-flex align-middle">
        <span
          aria-hidden="true"
          data-slot="status-skeleton"
          className="block h-5 w-20 rounded-full border border-border bg-muted motion-safe:animate-pulse"
        />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return <StatusBadge tone={toneOf(row)} label={label} />;
}

interface DetailTriggerProps {
  readonly row: ReceivableRow;
  readonly handle: DialogHandle<number>;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
}

export function DetailTrigger({ row, handle, triggerRef }: DetailTriggerProps) {
  const t = useTranslations("remittance.detail");
  return (
    <DialogTrigger
      ref={triggerRef}
      handle={handle}
      payload={row.lineNumber}
      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none group-hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
      <span className="sr-only">{t("openLabel", { ordinal: row.ordinal })}</span>
    </DialogTrigger>
  );
}

export function InvalidCheckDigitHint() {
  const t = useTranslations("remittance.check");
  const hintId = useId();
  return (
    <Tooltip>
      <span id={hintId} className="sr-only">
        {t("invalidCheckDigitHint")}
      </span>
      <TooltipTrigger
        data-opens-detail=""
        aria-haspopup="dialog"
        aria-label={t("invalidCheckDigit")}
        aria-describedby={hintId}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-status-denied outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </TooltipTrigger>
      <TooltipContent>{t("invalidCheckDigitHint")}</TooltipContent>
    </Tooltip>
  );
}
