"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { RefObject } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { RemittanceMessage } from "@/features/remittance/describe-remittance-issue";
import { describeSubmitError } from "@/features/remittance/describe-remittance-issue";
import type { RemittanceCheckState } from "@/features/remittance/remittance-check-state";
import { requiresSignIn } from "@/features/remittance/remittance-check-state";
import { useChangedSinceMount } from "@/features/remittance/use-changed-since-mount";
import { signInPath } from "@/lib/routes";

interface AlertSnapshot {
  readonly phase: RemittanceCheckState["phase"];
  readonly attempt: number | null;
}

function attemptOf(state: RemittanceCheckState): number | null {
  return state.phase === "idle" ? null : state.attempt;
}

function isSameAlert(mounted: AlertSnapshot, current: AlertSnapshot): boolean {
  return mounted.phase === current.phase && mounted.attempt === current.attempt;
}

export interface CheckAlertsProps {
  readonly state: RemittanceCheckState;
  readonly signInLink: RefObject<HTMLAnchorElement | null>;
}

export function CheckAlerts({ state, signInLink }: CheckAlertsProps) {
  const t = useTranslations("remittance");
  const hasAlertChanged = useChangedSinceMount<AlertSnapshot>(
    { phase: state.phase, attempt: attemptOf(state) },
    { isSame: isSameAlert },
  );
  const alertRole = hasAlertChanged ? "alert" : undefined;

  const translate = (message: RemittanceMessage) => t(message.key, message.values);
  const requestError =
    state.phase === "requestFailed" && state.error.code !== "ABORTED"
      ? describeSubmitError(state.error)
      : null;
  const needsSignIn = requiresSignIn(state);

  return (
    <>
      {requestError && (
        <Alert variant="destructive" role={alertRole}>
          <AlertTitle>{translate(requestError.summary)}</AlertTitle>
          {requestError.details.length > 0 && (
            <AlertDescription>
              <ul className="list-disc pl-5">
                {requestError.details.map((detail, index) => (
                  <li key={`${detail.key}-${String(index)}`}>{translate(detail)}</li>
                ))}
              </ul>
            </AlertDescription>
          )}
          {needsSignIn && <SignInAgainLink ref={signInLink} />}
        </Alert>
      )}
      {state.phase === "failed" && (
        <Alert variant="destructive" role={alertRole}>
          <AlertTitle>{t("check.credentialsRejected")}</AlertTitle>
          <SignInAgainLink ref={signInLink} />
        </Alert>
      )}
      {state.phase === "interrupted" && (
        <Alert variant="destructive" role={alertRole}>
          <AlertTitle>{t("check.interrupted")}</AlertTitle>
        </Alert>
      )}
    </>
  );
}

interface SignInAgainLinkProps {
  readonly ref: RefObject<HTMLAnchorElement | null>;
}

function SignInAgainLink({ ref }: SignInAgainLinkProps) {
  const t = useTranslations("remittance.check");
  return (
    <AlertDescription>
      <Link
        ref={ref}
        href={signInPath}
        className="rounded-sm font-medium text-primary underline outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      >
        {t("signInAgain")}
      </Link>
    </AlertDescription>
  );
}
