import type { Authenticator } from "@/application/session/authenticator";
import type { SignInFormState } from "@/features/session/sign-in-fields";
import { parseSignInInput, readSubmittedEmail } from "@/features/session/sign-in-input";
import { effectiveSessionSeconds, minSessionSeconds } from "@/lib/session-cookie";

export interface SubmitSignInDependencies {
  readonly authenticator: Authenticator;
}

export type SubmitSignInOutcome =
  | { readonly kind: "signed-in"; readonly token: string; readonly expiresInSeconds: number }
  | { readonly kind: "form"; readonly state: SignInFormState };

export async function submitSignIn(
  { authenticator }: SubmitSignInDependencies,
  formData: FormData,
): Promise<SubmitSignInOutcome> {
  const email = readSubmittedEmail(formData);
  const input = parseSignInInput(formData);
  if (!input.ok) {
    return { kind: "form", state: { email, fieldErrors: input.fieldErrors } };
  }
  const result = await authenticator.signIn(input.credentials);
  if (result.kind === "signed-in") {
    if (effectiveSessionSeconds(result.expiresInSeconds) < minSessionSeconds) {
      return { kind: "form", state: { email, formError: "unavailable" } };
    }
    return {
      kind: "signed-in",
      token: result.token,
      expiresInSeconds: result.expiresInSeconds,
    };
  }
  return { kind: "form", state: { email, formError: result.kind } };
}
