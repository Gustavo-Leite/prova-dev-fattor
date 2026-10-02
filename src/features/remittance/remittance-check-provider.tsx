"use client";

import type { ReactNode } from "react";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import type { Receivable } from "@/domain/cnab/parse-cnab-444";
import { readStatusStream } from "@/features/remittance/read-status-stream";
import type { RemittanceCheckState } from "@/features/remittance/remittance-check-state";
import {
  initialCheckState,
  remittanceCheckReducer,
} from "@/features/remittance/remittance-check-state";
import type { ResultsView, ResultsViewAction } from "@/features/remittance/select-visible-rows";
import { createResultsView, resultsViewReducer } from "@/features/remittance/select-visible-rows";
import { submitRemittance } from "@/features/remittance/submit-remittance";
import type {
  RemittanceFileRejection,
  RemittanceUploadLimits,
} from "@/features/remittance/validate-remittance-file";
import { validateRemittanceFile } from "@/features/remittance/validate-remittance-file";

export interface RemittanceSelection {
  readonly file: File;
  readonly receivables: readonly Receivable[];
  readonly lines: readonly string[];
}

export type UploadState =
  | { readonly phase: "idle" }
  | { readonly phase: "reading"; readonly fileName: string }
  | { readonly phase: "ready"; readonly fileName: string }
  | {
      readonly phase: "rejected";
      readonly attempt: number;
      readonly fileName: string | null;
      readonly rejection: RemittanceFileRejection;
    };

export interface RemittanceCheck {
  readonly state: RemittanceCheckState;
  readonly selection: RemittanceSelection | null;
  readonly uploadState: UploadState;
  readonly view: ResultsView;
  readonly attach: (files: readonly File[], limits: RemittanceUploadLimits) => Promise<void>;
  readonly check: () => void;
  readonly dispatchView: (action: ResultsViewAction) => void;
}

const idleUpload: UploadState = { phase: "idle" };

const RemittanceCheckContext = createContext<RemittanceCheck | null>(null);

export interface RemittanceCheckProviderProps {
  readonly children: ReactNode;
}

export function RemittanceCheckProvider({ children }: RemittanceCheckProviderProps) {
  const [state, dispatch] = useReducer(remittanceCheckReducer, initialCheckState);
  const [view, dispatchView] = useReducer(resultsViewReducer, undefined, createResultsView);
  const [selection, setSelection] = useState<RemittanceSelection | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>(idleUpload);
  const currentSelection = useRef<RemittanceSelection | null>(null);
  const latestSelection = useRef(0);
  const latestAttempt = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  const abandon = useCallback(() => {
    latestSelection.current++;
    inFlight.current?.abort();
    inFlight.current = null;
  }, []);

  useEffect(() => abandon, [abandon]);

  const reset = useCallback(() => {
    abandon();
    dispatch({ type: "reset" });
    dispatchView({ type: "reset" });
    currentSelection.current = null;
    setSelection(null);
    setUploadState(idleUpload);
  }, [abandon]);

  const run = useCallback(async (current: RemittanceSelection) => {
    inFlight.current?.abort();
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
  }, []);

  const check = useCallback(() => {
    const current = currentSelection.current;
    if (current) {
      void run(current);
    }
  }, [run]);

  const attach = useCallback(
    async (files: readonly File[], limits: RemittanceUploadLimits) => {
      const [file] = files;
      if (!file) {
        return;
      }
      reset();
      const attempt = latestSelection.current;
      if (files.length > 1) {
        setUploadState({
          phase: "rejected",
          attempt,
          fileName: null,
          rejection: { code: "MULTIPLE_FILES" },
        });
        return;
      }
      setUploadState({ phase: "reading", fileName: file.name });
      const validation = await validateRemittanceFile(file, limits);
      if (attempt !== latestSelection.current) {
        return;
      }
      if (!validation.ok) {
        setUploadState({
          phase: "rejected",
          attempt,
          fileName: file.name,
          rejection: validation.rejection,
        });
        return;
      }
      const current = { file, receivables: validation.receivables, lines: validation.lines };
      setUploadState({ phase: "ready", fileName: file.name });
      currentSelection.current = current;
      setSelection(current);
      void run(current);
    },
    [reset, run],
  );

  const value = useMemo(
    () => ({ state, selection, uploadState, view, attach, check, dispatchView }),
    [state, selection, uploadState, view, attach, check],
  );

  return <RemittanceCheckContext value={value}>{children}</RemittanceCheckContext>;
}

export function useRemittanceCheck(): RemittanceCheck {
  const value = use(RemittanceCheckContext);
  if (value === null) {
    throw new Error("useRemittanceCheck must be used inside RemittanceCheckProvider");
  }
  return value;
}
