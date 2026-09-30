"use client";

import { useTranslations } from "next-intl";
import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Receivable } from "@/domain/cnab/parse-cnab-444";
import type { RemittanceMessage } from "@/features/remittance/describe-remittance-issue";
import {
  describeRemittanceRejection,
  toKilobytes,
} from "@/features/remittance/describe-remittance-issue";
import type {
  RemittanceFileRejection,
  RemittanceUploadLimits,
} from "@/features/remittance/validate-remittance-file";
import { validateRemittanceFile } from "@/features/remittance/validate-remittance-file";
import { cn } from "@/lib/utils";

type UploadState =
  | { readonly phase: "idle" }
  | { readonly phase: "reading"; readonly fileName: string }
  | {
      readonly phase: "ready";
      readonly fileName: string;
      readonly receivables: readonly Receivable[];
    }
  | {
      readonly phase: "rejected";
      readonly attempt: number;
      readonly fileName: string | null;
      readonly rejection: RemittanceFileRejection;
    };

export interface RemittanceUploadProps {
  readonly limits: RemittanceUploadLimits;
  readonly onReady?: (file: File, receivables: readonly Receivable[]) => void;
  readonly onReset?: () => void;
}

function preventBrowserFileOpen(event: globalThis.DragEvent) {
  event.preventDefault();
}

export function RemittanceUpload({ limits, onReady, onReset }: RemittanceUploadProps) {
  const t = useTranslations("remittance");
  const headingId = useId();
  const inputId = useId();
  const hintId = useId();
  const alertId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const latestSelection = useRef(0);
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const [isDragging, setIsDragging] = useState(false);

  const translate = (message: RemittanceMessage) => t(message.key, message.values);

  const accept = useCallback(
    async (files: readonly File[]) => {
      const [file] = files;
      if (!file) {
        return;
      }
      const selection = ++latestSelection.current;
      onReset?.();
      if (files.length > 1) {
        setState({
          phase: "rejected",
          attempt: selection,
          fileName: null,
          rejection: { code: "MULTIPLE_FILES" },
        });
        return;
      }
      setState({ phase: "reading", fileName: file.name });
      const validation = await validateRemittanceFile(file, limits);
      if (selection !== latestSelection.current) {
        return;
      }
      if (!validation.ok) {
        setState({
          phase: "rejected",
          attempt: selection,
          fileName: file.name,
          rejection: validation.rejection,
        });
        return;
      }
      setState({ phase: "ready", fileName: file.name, receivables: validation.receivables });
      onReady?.(file, validation.receivables);
    },
    [limits, onReady, onReset],
  );

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
  const isRejected = state.phase === "rejected";
  const rejection = isRejected ? describeRemittanceRejection(state.rejection) : null;
  const invalidCheckDigits =
    state.phase === "ready"
      ? state.receivables.filter((receivable) => !receivable.hasValidCheckDigit).length
      : 0;

  return (
    <section aria-labelledby={headingId} className="flex w-full flex-col gap-4">
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
          hasFile ? "px-4 py-4" : "px-6 py-12",
          isDragging && "border-primary bg-accent",
        )}
      >
        <span className="font-medium">
          {hasFile ? t("upload.chooseAnother") : t("upload.instructions")}
        </span>
        <span id={hintId} className="text-sm text-muted-foreground">
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

      <div role="status" className="min-h-6 text-sm">
        {state.phase === "reading" && t("upload.reading", { fileName: state.fileName })}
        {state.phase === "ready" && (
          <div className="flex flex-col gap-1">
            <p className="font-medium">
              {t("upload.ready", { count: state.receivables.length, fileName: state.fileName })}
            </p>
            {invalidCheckDigits > 0 && (
              <p className="text-muted-foreground">
                {t("upload.invalidCheckDigits", { count: invalidCheckDigits })}
              </p>
            )}
          </div>
        )}
      </div>

      {state.phase === "rejected" && rejection && (
        <Alert key={state.attempt} id={alertId} variant="destructive">
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
