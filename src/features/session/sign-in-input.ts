import { z } from "zod";

import type { SignInCredentials } from "@/application/session/authenticator";
import type { SignInFieldErrors } from "@/features/session/sign-in-fields";
import {
  emailErrors,
  maxEmailLength,
  maxPasswordLength,
  passwordErrors,
  signInFieldNames,
} from "@/features/session/sign-in-fields";

export type SignInInput =
  | { readonly ok: true; readonly credentials: SignInCredentials }
  | { readonly ok: false; readonly fieldErrors: SignInFieldErrors };

const emailSchema = z
  .string({ error: "required" })
  .trim()
  .min(1, { error: "required", abort: true })
  .max(maxEmailLength, { error: "tooLong", abort: true })
  .pipe(z.email({ error: "invalid" }));

const passwordSchema = z
  .string({ error: "required" })
  .min(1, { error: "required", abort: true })
  .max(maxPasswordLength, { error: "tooLong" });

function firstError<Code extends string>(
  result: z.ZodSafeParseResult<string>,
  codes: readonly Code[],
  fallback: Code,
): Code | undefined {
  if (result.success) {
    return undefined;
  }
  const message = result.error.issues[0]?.message;
  return codes.find((code) => code === message) ?? fallback;
}

function readText(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

export function readSubmittedEmail(formData: FormData): string {
  return (readText(formData, signInFieldNames.email) ?? "").slice(0, maxEmailLength);
}

export function parseSignInInput(formData: FormData): SignInInput {
  const email = emailSchema.safeParse(readText(formData, signInFieldNames.email));
  const password = passwordSchema.safeParse(readText(formData, signInFieldNames.password));
  if (email.success && password.success) {
    return { ok: true, credentials: { email: email.data, password: password.data } };
  }
  const emailError = firstError(email, emailErrors, "invalid");
  const passwordError = firstError(password, passwordErrors, "required");
  return {
    ok: false,
    fieldErrors: {
      ...(emailError && { email: emailError }),
      ...(passwordError && { password: passwordError }),
    },
  };
}
