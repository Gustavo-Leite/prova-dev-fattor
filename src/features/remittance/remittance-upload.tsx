"use client";

import { useTranslations } from "next-intl";
import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { RemittanceMessage } from "@/features/remittance/describe-remittance-issue";
import {
  describeRemittanceRejection,
  toKilobytes,
} from "@/features/remittance/describe-remittance-issue";
import { useRemittanceCheck } from "@/features/remittance/remittance-check-provider";
import { useChangedSinceMount } from "@/features/remittance/use-changed-since-mount";
import type { RemittanceUploadLimits } from "@/features/remittance/validate-remittance-file";
import { cn } from "@/lib/utils";

export interface RemittanceUploadProps {
  readonly limits: RemittanceUploadLimits;
}

function preventBrowserFileOpen(event: globalThis.DragEvent) {
  if (event.dataTransfer?.types.includes("Files")) {
    event.preventDefault();
  }
}

export function RemittanceUpload({ limits }: RemittanceUploadProps) {
  const t = useTranslations("remittance");
  const headingId = useId();
  const inputId = useId();
  const hintId = useId();
  const alertId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadState: state, selection, attach } = useRemittanceCheck();
  const [rejectionShownOnMount] = useState(() =>
    state.phase === "rejected" ? state.attempt : null,
  );
  const hasUploadPhaseChanged = useChangedSinceMount(state.phase, {
    changedOnMount: state.phase === "idle",
  });
  const isStatusQuiet = !hasUploadPhaseChanged;
  const [isDragging, setIsDragging] = useState(false);

  const translate = (message: RemittanceMessage) => t(message.key, message.values);

  const accept = useCallback((files: readonly File[]) => attach(files, limits), [attach, limits]);

  useEffect(() => {
    const input = inputRef.current;
    const pickedBeforeHydration = Array.from(input?.files ?? []);
    if (input && pickedBeforeHydration.length > 0) {
      input.value = "";
      void accept(pickedBeforeHydration);
    }
  }, [accept]);

  useEffect(() => {
    window.addEventListener("dragover", preventBrowserFileOpen);
    window.addEventListener("drop", preventBrowserFileOpen);
    return () => {
      window.removeEventListener("dragover", preventBrowserFileOpen);
      window.removeEventListener("drop", preventBrowserFileOpen);
    };
  }, []);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    void accept(files);
  };

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    const { relatedTarget } = event;
    if (!(relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget))) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void accept(Array.from(event.dataTransfer.files));
  };

  const hasFile = state.phase !== "idle";
  const isCompact = state.phase === "ready";
  const isRejected = state.phase === "rejected";
  const rejection = isRejected ? describeRemittanceRejection(state.rejection) : null;
  const receivables = selection?.receivables ?? [];
  const invalidCheckDigits = receivables.filter(
    (receivable) => !receivable.hasValidCheckDigit,
  ).length;
  const statusContent = (
    <>
      {state.phase === "reading" && t("upload.reading", { fileName: state.fileName })}
      {state.phase === "ready" && (
        <div className="flex flex-col gap-1">
          <p className="font-medium">
            {t("upload.ready", { count: receivables.length, fileName: state.fileName })}
          </p>
          {invalidCheckDigits > 0 && (
            <p className="text-muted-foreground">
              {t("upload.invalidCheckDigits", { count: invalidCheckDigits })}
            </p>
          )}
        </div>
      )}
    </>
  );

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex w-full shrink-0 flex-col",
        isCompact
          ? "gap-2 sm:flex-row-reverse sm:items-center sm:justify-between sm:gap-4"
          : "gap-4",
      )}
    >
      <h2 id={headingId} className="sr-only">
        {t("upload.heading")}
      </h2>
      <label
        htmlFor={inputId}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-input bg-card text-center hover:bg-accent motion-safe:transition-colors",
          "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
          isCompact ? "px-3 py-1.5 sm:shrink-0" : hasFile ? "px-4 py-4" : "px-6 py-12",
          isDragging && "border-primary bg-accent",
        )}
      >
        <span className="font-medium">
          {hasFile ? t("upload.attachAnother") : t("upload.instructions")}
        </span>
        <span id={hintId} className={cn("text-sm text-muted-foreground", isCompact && "sr-only")}>
          {t("upload.hint", {
            maxKilobytes: toKilobytes(limits.maxUploadBytes),
            maxReceivables: limits.maxReceivables,
          })}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".rem,.txt,text/plain"
          aria-describedby={isRejected ? `${hintId} ${alertId}` : hintId}
          aria-invalid={isRejected}
          className="sr-only"
          onChange={handleChange}
        />
      </label>

      <div role="status" className={isStatusQuiet ? "sr-only" : "min-h-6 text-sm"}>
        {!isStatusQuiet && statusContent}
      </div>
      {isStatusQuiet && <div className="min-h-6 text-sm">{statusContent}</div>}

      {state.phase === "rejected" && rejection && (
        <Alert
          key={state.attempt}
          id={alertId}
          variant="destructive"
          role={state.attempt === rejectionShownOnMount ? undefined : "alert"}
        >
          <AlertTitle>{translate(rejection.summary)}</AlertTitle>
          <AlertDescription>
            {state.fileName !== null && (
              <p>{t("upload.rejectedFile", { fileName: state.fileName })}</p>
            )}
            {rejection.details.length > 0 && (
              <ul className="list-disc pl-5">
                {rejection.details.map((detail, index) => (
                  <li key={`${detail.key}-${String(index)}`}>{translate(detail)}</li>
                ))}
              </ul>
            )}
            {rejection.truncated && <p>{t("upload.truncated")}</p>}
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
