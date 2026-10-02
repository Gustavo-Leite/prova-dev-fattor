export const sessionCookieName = "session";

export const sessionCookiePath = "/";

const maxExpiryMarginSeconds = 60;

export const minSessionSeconds = 60;

export const maxSessionSeconds = 24 * 60 * 60;

export const maxSessionTokenLength = 4000;

const sessionTokenPattern = /^[\x21-\x7E]+$/;

function isSessionToken(value: string): boolean {
  return value.length <= maxSessionTokenLength && sessionTokenPattern.test(value);
}

export function currentUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

const sealAlgorithm = { name: "HMAC", hash: "SHA-256" } as const;
const sealSeparator = ".";
const sealExpiryPattern = /^[1-9]\d{0,10}$/;
const sealSignaturePattern = /^[A-Za-z0-9_-]{43}$/;
const textEncoder = new TextEncoder();
const sealKeys = new Map<string, Promise<CryptoKey>>();

function sealKeyFor(secret: string): Promise<CryptoKey> {
  const cachedKey = sealKeys.get(secret);
  if (cachedKey !== undefined) {
    return cachedKey;
  }
  const key = crypto.subtle.importKey("raw", textEncoder.encode(secret), sealAlgorithm, false, [
    "sign",
    "verify",
  ]);
  sealKeys.set(secret, key);
  void key.catch(() => sealKeys.delete(secret));
  return key;
}

function sealedContent(expiry: string, token: string): Uint8Array<ArrayBuffer> {
  return textEncoder.encode(`${expiry}${sealSeparator}${token}`);
}

export async function sealSessionToken(
  token: string,
  secret: string,
  expiresAtSeconds: number,
): Promise<string> {
  if (!isSessionToken(token)) {
    throw new TypeError("The session token must be visible ASCII within the length limit.");
  }
  const expiry = String(expiresAtSeconds);
  if (!Number.isSafeInteger(expiresAtSeconds) || !sealExpiryPattern.test(expiry)) {
    throw new TypeError("The session expiry must be a positive whole number of Unix seconds.");
  }
  const signature = await crypto.subtle.sign(
    sealAlgorithm.name,
    await sealKeyFor(secret),
    sealedContent(expiry, token),
  );
  return [token, expiry, Buffer.from(signature).toString("base64url")].join(sealSeparator);
}

export async function openSessionCookie(
  value: string | undefined,
  secret: string,
  nowSeconds = currentUnixSeconds(),
): Promise<string | null> {
  if (value === undefined) {
    return null;
  }
  const signatureSeparator = value.lastIndexOf(sealSeparator);
  const expirySeparator = value.lastIndexOf(sealSeparator, signatureSeparator - 1);
  if (signatureSeparator <= 0 || expirySeparator === -1) {
    return null;
  }
  const token = value.slice(0, expirySeparator);
  const expiry = value.slice(expirySeparator + 1, signatureSeparator);
  const signature = value.slice(signatureSeparator + 1);
  if (
    !isSessionToken(token) ||
    !sealExpiryPattern.test(expiry) ||
    Number(expiry) <= nowSeconds ||
    Number(expiry) > nowSeconds + maxSessionSeconds ||
    !sealSignaturePattern.test(signature)
  ) {
    return null;
  }
  const signatureBytes = Buffer.from(signature, "base64url");
  if (signatureBytes.toString("base64url") !== signature) {
    return null;
  }
  const isAuthentic = await crypto.subtle.verify(
    sealAlgorithm.name,
    await sealKeyFor(secret),
    new Uint8Array(signatureBytes),
    sealedContent(expiry, token),
  );
  return isAuthentic ? token : null;
}

export interface SessionCookieOptions {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: "lax";
  readonly path: typeof sessionCookiePath;
  readonly maxAge: number;
}

export function effectiveSessionSeconds(expiresInSeconds: number): number {
  const lifetime = Number.isFinite(expiresInSeconds) ? expiresInSeconds : 0;
  const margin = Math.min(maxExpiryMarginSeconds, lifetime / 2);
  return Math.min(maxSessionSeconds, Math.max(0, Math.floor(lifetime - margin)));
}

export function sessionCookieOptions(
  expiresInSeconds: number,
  { secure }: { readonly secure: boolean },
): SessionCookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: sessionCookiePath,
    maxAge: effectiveSessionSeconds(expiresInSeconds),
  };
}
