import "server-only";

import type { Authenticator, SignInResult } from "@/application/session/authenticator";
import { parseLoginResponse, toLoginRequestBody } from "@/infra/fattor/fattor-api.contract";

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

function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason as Error);
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

function discardBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

function declaresOversizedBody(response: Response): boolean {
  const declaredLength = Number(response.headers.get("content-length"));
  return Number.isFinite(declaredLength) && declaredLength > maxLoginResponseBytes;
}

async function readCappedText(response: Response, signal: AbortSignal): Promise<string | null> {
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = "";
  for (;;) {
    const chunk = await abortable(reader.read(), signal);
    if (chunk.done) {
      return text + decoder.decode();
    }
    receivedBytes += chunk.value.byteLength;
    if (receivedBytes > maxLoginResponseBytes) {
      void reader.cancel().catch(() => undefined);
      return null;
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

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
        if (!isSuccessStatus(response.status) || declaresOversizedBody(response)) {
          discardBody(response);
          return unavailable;
        }
        const text = await readCappedText(response, signal);
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
