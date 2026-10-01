export const sessionCookieName = "session";

const maxExpiryMarginSeconds = 60;

export const maxSessionSeconds = 24 * 60 * 60;

export const maxSessionTokenLength = 4000;

const sessionTokenPattern = /^[\x21-\x7E]+$/;

export function readSessionToken(value: string | undefined): string | null {
  if (value === undefined || value.length > maxSessionTokenLength) {
    return null;
  }
  return sessionTokenPattern.test(value) ? value : null;
}

export interface SessionCookieOptions {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: "lax";
  readonly path: "/";
  readonly maxAge: number;
}

export function sessionCookieOptions(
  expiresInSeconds: number,
  { secure }: { readonly secure: boolean },
): SessionCookieOptions {
  const lifetime = Number.isFinite(expiresInSeconds) ? expiresInSeconds : 0;
  const margin = Math.min(maxExpiryMarginSeconds, lifetime / 2);
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.min(maxSessionSeconds, Math.max(0, Math.floor(lifetime - margin))),
  };
}
