"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useReducer, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Receivable } from "@/domain/cnab/parse-cnab-444";
import { readStatusStream } from "@/features/remittance/read-status-stream";
import {
  deriveRows,
  initialCheckState,
  remittanceCheckReducer,
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

  const handleReady = useCallback(
    (file: File, receivables: readonly Receivable[], lines: readonly string[]) => {
      setSelection({ file, receivables, lines });
    },
    [],
  );

  const check = async (current: Selection) => {
    cancelInFlight();
    const controller = new AbortController();
    inFlight.current = controller;
    const attempt = ++latestAttempt.current;
    dispatch({ type: "submitted", attempt });

    const submission = await submitRemittance(current.file, { signal: controller.signal });
    if (!submission.ok) {
      dispatch({ type: "requestFailed", attempt, error: submission.error });
      return;
    }
    const expected = {
      lineNumbers: new Set(current.receivables.map((receivable) => receivable.lineNumber)),
    };
    for await (const event of readStatusStream(submission.body, expected, controller.signal)) {
      dispatch({ type: "received", attempt, event });
    }
  };

  const isChecking = state.phase === "checking";
  const actionLabel = {
    idle: t("check.submit"),
    checking: t("check.checking"),
    completed: t("check.again"),
    failed: t("check.retry"),
    interrupted: t("check.retry"),
    requestFailed: t("check.retry"),
  }[state.phase];

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <RemittanceUpload limits={limits} onReady={handleReady} onReset={handleReset} />

      {selection && (
        <section aria-labelledby={headingId} className="flex w-full flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id={headingId} className="text-lg font-semibold">
              {t("check.heading")}
            </h2>
            <Button
              disabled={isChecking}
              focusableWhenDisabled
              onClick={() => {
                void check(selection);
              }}
            >
              {actionLabel}
            </Button>
          </div>
          <RemittanceResults
            rows={deriveRows(selection.receivables, state)}
            lines={selection.lines}
            state={state}
          />
        </section>
      )}
    </div>
  );
}
