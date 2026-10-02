"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useRemittanceCheck } from "@/features/remittance/remittance-check-provider";
import {
  deriveRows,
  requiresSignIn,
  summarizeRows,
} from "@/features/remittance/remittance-check-state";
import { RemittanceResults } from "@/features/remittance/remittance-results";
import { RemittanceUpload } from "@/features/remittance/remittance-upload";
import { useChangedSinceMount } from "@/features/remittance/use-changed-since-mount";
import type { RemittanceUploadLimits } from "@/features/remittance/validate-remittance-file";

export interface RemittanceCheckerProps {
  readonly limits: RemittanceUploadLimits;
}

function hasLostFocus(): boolean {
  return document.activeElement === null || document.activeElement === document.body;
}

export function RemittanceChecker({ limits }: RemittanceCheckerProps) {
  const t = useTranslations("remittance");
  const headingId = useId();
  const { state, selection, view, dispatchView, check } = useRemittanceCheck();
  const actionButton = useRef<HTMLButtonElement>(null);
  const signInLink = useRef<HTMLAnchorElement>(null);
  const actionButtonHadFocus = useRef(false);
  const hasPhaseChanged = useChangedSinceMount(state.phase);

  useEffect(() => {
    actionButtonHadFocus.current = false;
  }, [selection]);

  const isChecking = state.phase === "checking";
  useEffect(() => {
    if (!isChecking) {
      return;
    }
    const forgetActionFocus = (event: Event) => {
      const { target } = event;
      if (!(target instanceof Node && actionButton.current?.contains(target))) {
        actionButtonHadFocus.current = false;
      }
    };
    document.addEventListener("pointerdown", forgetActionFocus, true);
    document.addEventListener("focusin", forgetActionFocus, true);
    return () => {
      document.removeEventListener("pointerdown", forgetActionFocus, true);
      document.removeEventListener("focusin", forgetActionFocus, true);
    };
  }, [isChecking]);

  const needsSignIn = requiresSignIn(state);
  useEffect(() => {
    if (needsSignIn && actionButtonHadFocus.current && hasLostFocus()) {
      signInLink.current?.focus();
    }
  }, [needsSignIn]);

  const actionLabel = {
    idle: t("check.checking"),
    checking: t("check.checking"),
    completed: t("check.again"),
    failed: t("check.retry"),
    interrupted: t("check.retry"),
    requestFailed: t("check.retry"),
  }[state.phase];

  const rows = selection ? deriveRows(selection.receivables, state) : [];
  const summary = summarizeRows(rows);
  const hasRows = state.phase !== "idle" && state.phase !== "requestFailed";
  const announcement = hasPhaseChanged
    ? {
        idle: "",
        requestFailed: "",
        checking: t("check.started", { total: rows.length }),
        completed: t("check.completed", { total: rows.length, failed: summary.failed }),
        failed: "",
        interrupted: "",
      }[state.phase]
    : "";

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <RemittanceUpload limits={limits} />
      <p role="status" className="sr-only">
        {announcement}
      </p>

      {selection && (
        <section aria-labelledby={headingId} className="flex min-h-0 w-full flex-1 flex-col gap-4">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id={headingId} className="text-lg font-semibold">
                {t("check.heading")}
              </h2>
              {hasRows && (
                <p className="text-sm text-muted-foreground">
                  {t("check.progress", { done: rows.length - summary.pending, total: rows.length })}
                </p>
              )}
            </div>
            {!needsSignIn && (
              <Button
                ref={actionButton}
                disabled={isChecking || state.phase === "idle"}
                focusableWhenDisabled
                onClick={() => {
                  actionButtonHadFocus.current = document.activeElement === actionButton.current;
                  check();
                }}
              >
                {actionLabel}
              </Button>
            )}
          </div>
          <RemittanceResults
            rows={rows}
            lines={selection.lines}
            state={state}
            view={view}
            onViewChange={dispatchView}
            signInLink={signInLink}
          />
        </section>
      )}
    </div>
  );
}
