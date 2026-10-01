"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { submitSignIn } from "@/app/login/submit-sign-in";
import type { SignInFormState } from "@/features/session/sign-in-fields";
import { getServerEnv } from "@/infra/env";
import { createFattorAuthenticator } from "@/infra/fattor/fattor-authenticator";
import { sessionCookieName, sessionCookieOptions } from "@/lib/session-cookie";

export async function signIn(
  _previousState: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const authenticator = createFattorAuthenticator({ baseUrl: getServerEnv().fattorApi.baseUrl });
  const outcome = await submitSignIn({ authenticator }, formData);
  if (outcome.kind === "form") {
    return outcome.state;
  }
  (await cookies()).set(
    sessionCookieName,
    outcome.token,
    sessionCookieOptions(outcome.expiresInSeconds, {
      secure: process.env.NODE_ENV === "production",
    }),
  );
  redirect("/");
}
