import { describe, expect, it, vi } from "vitest";

import type {
  Authenticator,
  SignInCredentials,
  SignInResult,
} from "@/application/session/authenticator";
import { createCredentialGatedAuthenticator } from "@/infra/session/credential-gated-authenticator";

const expected: SignInCredentials = {
  email: "operator@example.test",
  password: "test-password",
};

const signedIn: SignInResult = { kind: "signed-in", token: "T1", expiresInSeconds: 3600 };

function fakeInner(result: SignInResult = signedIn) {
  const signIn = vi.fn<Authenticator["signIn"]>(() => Promise.resolve(result));
  return { inner: { signIn } satisfies Authenticator, signIn };
}

describe("createCredentialGatedAuthenticator", () => {
  it("delegates the configured credentials once and returns the inner result", async () => {
    const { inner, signIn } = fakeInner();
    const authenticator = createCredentialGatedAuthenticator(inner, expected);

    await expect(authenticator.signIn(expected)).resolves.toEqual(signedIn);
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledWith(expected);
  });

  it.each([
    ["a wrong email", { email: "other@example.test", password: expected.password }],
    ["a wrong password", { email: expected.email, password: "wrong-password" }],
    ["a wrong email and password", { email: "other@example.test", password: "wrong-password" }],
    ["a password in another case", { email: expected.email, password: "TEST-PASSWORD" }],
  ])("rejects %s without calling the inner authenticator", async (_case, credentials) => {
    const { inner, signIn } = fakeInner();
    const authenticator = createCredentialGatedAuthenticator(inner, expected);

    await expect(authenticator.signIn(credentials)).resolves.toEqual({ kind: "rejected" });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("accepts the configured email in another case", async () => {
    const { inner, signIn } = fakeInner();
    const authenticator = createCredentialGatedAuthenticator(inner, expected);
    const credentials = { email: "Operator@Example.TEST", password: expected.password };

    await expect(authenticator.signIn(credentials)).resolves.toEqual(signedIn);
    expect(signIn).toHaveBeenCalledWith(credentials);
  });

  it("accepts a lowercase email when the configured one has uppercase letters", async () => {
    const { inner, signIn } = fakeInner();
    const authenticator = createCredentialGatedAuthenticator(inner, {
      email: "Operator@Example.Test",
      password: expected.password,
    });

    await expect(authenticator.signIn(expected)).resolves.toEqual(signedIn);
    expect(signIn).toHaveBeenCalledWith(expected);
  });

  it.each(["", "x", "x".repeat(1024)])(
    "rejects a password of another length without throwing (%#)",
    async (password) => {
      const { inner } = fakeInner();
      const authenticator = createCredentialGatedAuthenticator(inner, expected);

      await expect(authenticator.signIn({ email: expected.email, password })).resolves.toEqual({
        kind: "rejected",
      });
    },
  );

  it("passes an unavailable result from the inner authenticator through", async () => {
    const { inner } = fakeInner({ kind: "unavailable" });
    const authenticator = createCredentialGatedAuthenticator(inner, expected);

    await expect(authenticator.signIn(expected)).resolves.toEqual({ kind: "unavailable" });
  });
});
