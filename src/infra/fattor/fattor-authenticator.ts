import "server-only";

import type { Authenticator, SignInResult } from "@/application/session/authenticator";
import { parseLoginResponse, toLoginRequestBody } from "@/infra/fattor/fattor-api.contract";
import {
  discardBody,
  isSuccessStatus,
  parseJson,
  readCappedText,
} from "@/infra/fattor/upstream-response";

export interface FattorAuthenticatorConfig {
  readonly baseUrl: string;
}

export interface FattorAuthenticatorOptions {
  readonly timeoutMs?: number;
}

const defaultTimeoutMs = 10_000;

export const maxLoginResponseBytes = 16 * 1024;

const rejectedCredentialStatuses = new Set([400, 401, 403]);

const unavailable: SignInResult = { kind: "unavailable" };

export function createFattorAuthenticator(
  config: FattorAuthenticatorConfig,
  options: FattorAuthenticatorOptions = {},
): Authenticator {
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;

  return {
    async signIn(credentials) {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const response = await fetch(`${config.baseUrl}/login`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: toLoginRequestBody(credentials),
          redirect: "manual",
          signal,
        });
        if (rejectedCredentialStatuses.has(response.status)) {
          discardBody(response);
          return { kind: "rejected" };
        }
        if (!isSuccessStatus(response.status)) {
          discardBody(response);
          return unavailable;
        }
        const text = await readCappedText(response, signal, maxLoginResponseBytes);
        if (text === null) {
          return unavailable;
        }
        const login = parseLoginResponse(parseJson(text));
        return login
          ? { kind: "signed-in", token: login.token, expiresInSeconds: login.expiresInSeconds }
          : unavailable;
      } catch {
        return unavailable;
      }
    },
  };
}
