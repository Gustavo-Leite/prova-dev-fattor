import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import type { Authenticator, SignInCredentials } from "@/application/session/authenticator";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function createCredentialGatedAuthenticator(
  inner: Authenticator,
  expected: SignInCredentials,
): Authenticator {
  const expectedEmailDigest = sha256(expected.email.toLowerCase());
  const expectedPasswordDigest = sha256(expected.password);

  return {
    async signIn(credentials) {
      const emailMatches = timingSafeEqual(
        sha256(credentials.email.toLowerCase()),
        expectedEmailDigest,
      );
      const passwordMatches = timingSafeEqual(sha256(credentials.password), expectedPasswordDigest);
      if (!(emailMatches && passwordMatches)) {
        return { kind: "rejected" };
      }
      return inner.signIn(credentials);
    },
  };
}
