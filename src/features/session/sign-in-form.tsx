"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SignInFormState } from "@/features/session/sign-in-fields";
import {
  maxEmailLength,
  maxPasswordLength,
  signInFieldNames,
} from "@/features/session/sign-in-fields";
import { cn } from "@/lib/utils";

export type SignInAction = (
  previousState: SignInFormState,
  formData: FormData,
) => Promise<SignInFormState>;

export interface SignInFormProps {
  readonly action: SignInAction;
}

const initialState: SignInFormState = { email: "" };

const fieldErrorClassName = "text-sm text-destructive";

const cardFocusOffset = "focus-visible:ring-offset-card";

function subscribeToNothing() {
  return () => undefined;
}

function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

function EyeIcon({ crossed }: { readonly crossed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="m3 3 18 18" />}
    </svg>
  );
}

export function SignInForm({ action }: SignInFormProps) {
  const t = useTranslations("signIn");
  const emailId = useId();
  const emailErrorId = useId();
  const passwordId = useId();
  const passwordErrorId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const isHydrated = useIsHydrated();

  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;

  useEffect(() => {
    if (state.fieldErrors?.email) {
      emailRef.current?.focus();
    } else if (state.fieldErrors?.password) {
      passwordRef.current?.focus();
    }
  }, [state]);

  return (
    <form
      action={formAction}
      onSubmit={() => {
        setIsPasswordVisible(false);
      }}
      className="flex flex-col gap-4"
    >
      {!pending && state.formError && (
        <Alert variant="destructive">
          <AlertDescription>{t(`formErrors.${state.formError}`)}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={emailId} className="text-sm font-medium">
          {t("email.label")}
        </label>
        <Input
          ref={emailRef}
          id={emailId}
          name={signInFieldNames.email}
          type="email"
          autoComplete="email"
          spellCheck={false}
          required
          maxLength={maxEmailLength}
          className={cardFocusOffset}
          defaultValue={state.email}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? emailErrorId : undefined}
        />
        {emailError && (
          <p id={emailErrorId} className={fieldErrorClassName}>
            {t(`email.errors.${emailError}`, { max: maxEmailLength })}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={passwordId} className="text-sm font-medium">
          {t("password.label")}
        </label>
        <div className="relative">
          <Input
            ref={passwordRef}
            id={passwordId}
            name={signInFieldNames.password}
            type={isPasswordVisible ? "text" : "password"}
            autoComplete="current-password"
            spellCheck={false}
            required
            maxLength={maxPasswordLength}
            className={cn(isHydrated && "pr-9", cardFocusOffset)}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? passwordErrorId : undefined}
          />
          {isHydrated && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={cn("absolute inset-y-0 right-0.5 my-auto", cardFocusOffset)}
              aria-pressed={isPasswordVisible}
              aria-controls={passwordId}
              aria-label={t("password.toggleVisibility")}
              onClick={() => {
                setIsPasswordVisible((visible) => !visible);
              }}
            >
              <EyeIcon crossed={isPasswordVisible} />
            </Button>
          )}
        </div>
        {passwordError && (
          <p id={passwordErrorId} className={fieldErrorClassName}>
            {t(`password.errors.${passwordError}`, { max: maxPasswordLength })}
          </p>
        )}
      </div>

      <Button type="submit" className={cardFocusOffset} disabled={pending} focusableWhenDisabled>
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
