"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useReducer, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Receivable } from "@/domain/cnab/parse-cnab-444";
import { readStatusStream } from "@/features/remittance/read-status-stream";
import type { RemittanceCheckAction } from "@/features/remittance/remittance-check-state";
import {
  deriveRows,
  initialCheckState,
  remittanceCheckReducer,
  requiresSignIn,
  summarizeRows,
} from "@/features/remittance/remittance-check-state";
import { RemittanceResults } from "@/features/remittance/remittance-results";
import { RemittanceUpload } from "@/features/remittance/remittance-upload";
import { submitRemittance } from "@/features/remittance/submit-remittance";
import type { RemittanceUploadLimits } from "@/features/remittance/validate-remittance-file";

interface Selection {
  readonly file: File;
  readonly receivables: readonly Receivable[];
  readonly lines: readonly string[];
}

export interface RemittanceCheckerProps {
  readonly limits: RemittanceUploadLimits;
}

export function RemittanceChecker({ limits }: RemittanceCheckerProps) {
  const t = useTranslations("remittance");
  const headingId = useId();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [state, dispatch] = useReducer(remittanceCheckReducer, initialCheckState);
  const latestAttempt = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const actionButton = useRef<HTMLButtonElement>(null);
  const signInLink = useRef<HTMLAnchorElement>(null);
  const actionButtonHadFocus = useRef(false);

  const update = useCallback((action: RemittanceCheckAction) => {
    actionButtonHadFocus.current =
      actionButton.current !== null && document.activeElement === actionButton.current;
    dispatch(action);
  }, []);

  const needsSignIn = requiresSignIn(state);
  useEffect(() => {
    if (needsSignIn && actionButtonHadFocus.current) {
      signInLink.current?.focus();
    }
  }, [needsSignIn]);

  const cancelInFlight = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
  }, []);

  useEffect(() => cancelInFlight, [cancelInFlight]);

  const handleReset = useCallback(() => {
    cancelInFlight();
    dispatch({ type: "reset" });
    setSelection(null);
  }, [cancelInFlight]);

  const check = useCallback(
    async (current: Selection) => {
      const controller = new AbortController();
      inFlight.current = controller;
      const attempt = ++latestAttempt.current;
      update({ type: "submitted", attempt });

      const submission = await submitRemittance(current.file, { signal: controller.signal });
      if (!submission.ok) {
        update({ type: "requestFailed", attempt, error: submission.error });
        return;
      }
      const expected = {
        lineNumbers: new Set(current.receivables.map((receivable) => receivable.lineNumber)),
      };
      for await (const event of readStatusStream(submission.body, expected, controller.signal)) {
        update({ type: "received", attempt, event });
      }
    },
    [update],
  );

  const handleReady = useCallback(
    (file: File, receivables: readonly Receivable[], lines: readonly string[]) => {
      const current = { file, receivables, lines };
      setSelection(current);
      void check(current);
    },
    [check],
  );

  const isChecking = state.phase === "checking";
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
  const announcement = {
    idle: "",
    requestFailed: "",
    checking: t("check.started", { total: rows.length }),
    completed: t("check.completed", { total: rows.length, failed: summary.failed }),
    failed: "",
    interrupted: "",
  }[state.phase];

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <RemittanceUpload limits={limits} onReady={handleReady} onReset={handleReset} />
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
                  void check(selection);
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
            signInLink={signInLink}
          />
        </section>
      )}
    </div>
  );
}
