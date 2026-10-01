"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { submitSignIn } from "@/app/entrar/submit-sign-in";
import type { SignInFormState } from "@/features/session/sign-in-fields";
import { getServerEnv } from "@/infra/env";
import { createFattorAuthenticator } from "@/infra/fattor/fattor-authenticator";
import { createCredentialGatedAuthenticator } from "@/infra/session/credential-gated-authenticator";
import { homePath } from "@/lib/routes";
import {
  currentUnixSeconds,
  sealSessionToken,
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/session-cookie";

export async function signIn(
  _previousState: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const env = getServerEnv();
  const authenticator = createCredentialGatedAuthenticator(
    createFattorAuthenticator({ baseUrl: env.fattorApi.baseUrl }),
    env.signIn,
  );
  const outcome = await submitSignIn({ authenticator }, formData);
  if (outcome.kind === "form") {
    return outcome.state;
  }
  const options = sessionCookieOptions(outcome.expiresInSeconds, {
    secure: process.env.NODE_ENV === "production",
  });
  const expiresAtSeconds = currentUnixSeconds() + options.maxAge;
  (await cookies()).set(
    sessionCookieName,
    await sealSessionToken(outcome.token, env.sessionSecret, expiresAtSeconds),
    options,
  );
  redirect(homePath);
}
