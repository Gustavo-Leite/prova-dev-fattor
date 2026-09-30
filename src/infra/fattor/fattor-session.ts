import type { FattorLogin } from "@/infra/fattor/fattor-api.contract";

export interface FattorSession {
  getToken(): Promise<string>;
  invalidate(rejectedToken: string): void;
}

export interface FattorSessionOptions {
  readonly login: () => Promise<FattorLogin>;
  readonly now?: () => number;
  readonly expiryMarginMs?: number;
}

const defaultExpiryMarginMs = 60_000;

export function createFattorSession(options: FattorSessionOptions): FattorSession {
  const now = options.now ?? Date.now;
  const expiryMarginMs = options.expiryMarginMs ?? defaultExpiryMarginMs;
  let cached: { token: string; expiresAt: number } | undefined;
  let pendingLogin: Promise<string> | undefined;

  const startLogin = (): Promise<string> => {
    const attempt = Promise.resolve()
      .then(options.login)
      .then(({ token, expiresInSeconds }) => {
        const lifetimeMs = expiresInSeconds * 1000;
        cached = {
          token,
          expiresAt: now() + lifetimeMs - Math.min(expiryMarginMs, lifetimeMs / 2),
        };
        return token;
      });
    const release = () => {
      if (pendingLogin === attempt) {
        pendingLogin = undefined;
      }
    };
    void attempt.then(release, release);
    return attempt;
  };

  return {
    getToken() {
      if (cached && now() < cached.expiresAt) {
        return Promise.resolve(cached.token);
      }
      pendingLogin ??= startLogin();
      return pendingLogin;
    },
    invalidate(rejectedToken) {
      if (cached?.token === rejectedToken) {
        cached = undefined;
      }
    },
  };
}
