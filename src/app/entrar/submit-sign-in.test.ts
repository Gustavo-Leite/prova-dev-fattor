import { describe, expect, it, vi } from "vitest";

import { submitSignIn } from "@/app/entrar/submit-sign-in";
import type {
  Authenticator,
  SignInCredentials,
  SignInResult,
} from "@/application/session/authenticator";
import { maxEmailLength, maxPasswordLength } from "@/features/session/sign-in-fields";
import { maxSignInEmailLength, maxSignInPasswordLength } from "@/infra/env";
import { maxTokenLength } from "@/infra/fattor/fattor-api.contract";
import { maxSessionTokenLength } from "@/lib/session-cookie";

const password = "S3cret-Value!";

function authenticatorAnswering(result: SignInResult) {
  const signIn = vi.fn<(credentials: SignInCredentials) => Promise<SignInResult>>(() =>
    Promise.resolve(result),
  );
  const authenticator: Authenticator = { signIn };
  return { authenticator, signIn };
}

function formWith(fields: Readonly<Record<string, string>>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    formData.append(name, value);
  }
  return formData;
}

describe("submitSignIn", () => {
  it("signs in with the parsed credentials and hands back the token", async () => {
    const { authenticator, signIn } = authenticatorAnswering({
      kind: "signed-in",
      token: "T1",
      expiresInSeconds: 3600,
    });

    await expect(
      submitSignIn({ authenticator }, formWith({ email: " user@example.test ", password })),
    ).resolves.toEqual({ kind: "signed-in", token: "T1", expiresInSeconds: 3600 });
    expect(signIn).toHaveBeenCalledExactlyOnceWith({ email: "user@example.test", password });
  });

  it.each([1, 60, 119])(
    "refuses a session that would expire at once when the token lasts %d seconds",
    async (expiresInSeconds) => {
      const { authenticator } = authenticatorAnswering({
        kind: "signed-in",
        token: "T1",
        expiresInSeconds,
      });

      const outcome = await submitSignIn(
        { authenticator },
        formWith({ email: "user@example.test", password }),
      );

      expect(outcome).toEqual({
        kind: "form",
        state: { email: "user@example.test", formError: "unavailable" },
      });
      expect(JSON.stringify(outcome)).not.toContain(password);
    },
  );

  it.each([120, 3600])("signs in when the token lasts %d seconds", async (expiresInSeconds) => {
    const { authenticator } = authenticatorAnswering({
      kind: "signed-in",
      token: "T1",
      expiresInSeconds,
    });

    await expect(
      submitSignIn({ authenticator }, formWith({ email: "user@example.test", password })),
    ).resolves.toEqual({ kind: "signed-in", token: "T1", expiresInSeconds });
  });

  it("returns the field errors without calling the authenticator", async () => {
    const { authenticator, signIn } = authenticatorAnswering({ kind: "rejected" });

    await expect(
      submitSignIn({ authenticator }, formWith({ email: "user@localhost", password: "" })),
    ).resolves.toEqual({
      kind: "form",
      state: {
        email: "user@localhost",
        fieldErrors: { email: "invalid", password: "required" },
      },
    });
    expect(signIn).not.toHaveBeenCalled();
  });

  it.each(["rejected", "unavailable"] as const)(
    "keeps the email and reports %s credentials as a form error",
    async (kind) => {
      const { authenticator } = authenticatorAnswering({ kind });

      await expect(
        submitSignIn({ authenticator }, formWith({ email: "user@example.test", password })),
      ).resolves.toEqual({ kind: "form", state: { email: "user@example.test", formError: kind } });
    },
  );

  it.each([
    ["the credentials are rejected", { kind: "rejected" }],
    ["the service is unavailable", { kind: "unavailable" }],
  ] as const)("never echoes the password when %s", async (_description, result) => {
    const { authenticator } = authenticatorAnswering(result);

    const outcome = await submitSignIn(
      { authenticator },
      formWith({ email: "user@example.test", password }),
    );

    expect(JSON.stringify(outcome)).not.toContain(password);
  });

  it("never echoes the password when the input is invalid", async () => {
    const { authenticator } = authenticatorAnswering({ kind: "rejected" });

    const outcome = await submitSignIn(
      { authenticator },
      formWith({ email: "invalid", password: password.repeat(30) }),
    );

    expect(outcome).toMatchObject({
      kind: "form",
      state: { fieldErrors: { password: "tooLong" } },
    });
    expect(JSON.stringify(outcome)).not.toContain(password);
  });
});

describe("session token limits", () => {
  it("lets the session cookie hold any token the login accepts", () => {
    expect(maxSessionTokenLength).toBe(maxTokenLength);
  });
});

describe("sign-in credential limits", () => {
  it("lets the configured credential fit in the sign-in form", () => {
    expect(maxSignInEmailLength).toBe(maxEmailLength);
    expect(maxSignInPasswordLength).toBe(maxPasswordLength);
  });
});
