import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  currentUnixSeconds,
  effectiveSessionSeconds,
  maxSessionSeconds,
  maxSessionTokenLength,
  minSessionSeconds,
  openSessionCookie,
  sealSessionToken,
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/session-cookie";

const sealSecret = "unit-test-seal-secret-unit-test-seal";
const otherSealSecret = "other-test-seal-secret-other-test-seal";
const now = 1_900_000_000;
const expiresAt = now + 3540;

function signatureOf(token: string, expiry: number | string = expiresAt): string {
  return createHmac("sha256", sealSecret)
    .update(`${String(expiry)}.${token}`)
    .digest("base64url");
}

function manuallySealed(token: string, expiry: number | string = expiresAt): string {
  return `${token}.${String(expiry)}.${signatureOf(token, expiry)}`;
}

function openAtNow(value: string | undefined, secret = sealSecret): Promise<string | null> {
  return openSessionCookie(value, secret, now);
}

const base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function withUnusedBitSet(signature: string): string {
  const lastIndex = base64UrlAlphabet.indexOf(signature.slice(-1));
  return `${signature.slice(0, -1)}${base64UrlAlphabet.charAt(lastIndex + 1)}`;
}

function withFirstSignatureCharacterChanged(sealed: string): string {
  const signatureStart = sealed.lastIndexOf(".") + 1;
  const replacement = sealed.charAt(signatureStart) === "A" ? "B" : "A";
  return `${sealed.slice(0, signatureStart)}${replacement}${sealed.slice(signatureStart + 1)}`;
}

describe("session token format", () => {
  it.each([
    ["an opaque token", "abc-DEF_123~"],
    ["a JWT with dots", "a.b.c"],
    ["the longest token allowed", "t".repeat(maxSessionTokenLength)],
    ["printable ASCII punctuation", "!#$%&'()*+,-./:;<=>?@[]^`{|}"],
  ])("seals and opens %s", async (_description, token) => {
    const sealed = await sealSessionToken(token, sealSecret, expiresAt);

    expect(await openAtNow(sealed)).toBe(token);
  });

  it.each([
    ["an empty token", ""],
    ["a line feed", "\n"],
    ["a carriage return", "token\rvalue"],
    ["a space", "token value"],
    ["a tab", "token\tvalue"],
    ["a non-ASCII character", "tokené"],
    ["a DEL character", "token\u007f"],
    ["a token above the limit", "t".repeat(maxSessionTokenLength + 1)],
  ])("neither seals nor opens %s", async (_description, token) => {
    await expect(sealSessionToken(token, sealSecret, expiresAt)).rejects.toThrow(TypeError);
    expect(await openAtNow(manuallySealed(token))).toBeNull();
  });

  it("allows tokens as long as the login response does", () => {
    expect(maxSessionTokenLength).toBe(4000);
  });
});

describe("sealSessionToken", () => {
  it("appends the expiry and the HMAC-SHA256 of expiry and token in base64url", async () => {
    const sealed = await sealSessionToken("opaque-token", sealSecret, expiresAt);

    expect(sealed).toBe(manuallySealed("opaque-token"));
    expect(sealed).toMatch(/^opaque-token\.\d+\.[A-Za-z0-9_-]{43}$/);
  });

  it.each([
    ["zero", 0],
    ["a negative number", -1],
    ["a fraction", expiresAt + 0.5],
    ["not a number", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
    ["more than eleven digits", 100_000_000_000],
  ])("refuses an expiry that is %s", async (_description, expiry) => {
    await expect(sealSessionToken("opaque-token", sealSecret, expiry)).rejects.toThrow(TypeError);
  });

  it("fits the longest token in a browser cookie", async () => {
    const sealed = await sealSessionToken(
      "t".repeat(maxSessionTokenLength),
      sealSecret,
      99_999_999_999,
    );

    expect(`${sessionCookieName}=${sealed}`.length).toBeLessThanOrEqual(4096);
  });
});

describe("openSessionCookie", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses a session at or after its expiry", async () => {
    const sealed = await sealSessionToken("opaque-token", sealSecret, expiresAt);

    expect(await openSessionCookie(sealed, sealSecret, expiresAt - 1)).toBe("opaque-token");
    expect(await openSessionCookie(sealed, sealSecret, expiresAt)).toBeNull();
    expect(await openSessionCookie(sealed, sealSecret, expiresAt + 1)).toBeNull();
  });

  it("refuses an expiry beyond the longest session ever issued", async () => {
    const sealedAtLimit = await sealSessionToken(
      "opaque-token",
      sealSecret,
      now + maxSessionSeconds,
    );
    const sealedBeyondLimit = await sealSessionToken(
      "opaque-token",
      sealSecret,
      now + maxSessionSeconds + 1,
    );

    expect(await openSessionCookie(sealedAtLimit, sealSecret, now)).toBe("opaque-token");
    expect(await openSessionCookie(sealedBeyondLimit, sealSecret, now)).toBeNull();
  });

  it("compares the expiry with the current time by default", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now * 1000);
    const sealed = await sealSessionToken("opaque-token", sealSecret, currentUnixSeconds() + 60);

    expect(await openSessionCookie(sealed, sealSecret)).toBe("opaque-token");
    vi.setSystemTime((now + 60) * 1000);
    expect(await openSessionCookie(sealed, sealSecret)).toBeNull();
  });

  it("refuses a tampered token", async () => {
    const sealed = await sealSessionToken("a.b.c", sealSecret, expiresAt);

    expect(await openAtNow(sealed.replace("a.b.c", "a.b.d"))).toBeNull();
  });

  it("refuses an extended expiry", async () => {
    const sealed = await sealSessionToken("opaque-token", sealSecret, expiresAt);

    expect(await openAtNow(sealed.replace(`.${String(expiresAt)}.`, ".99999999999."))).toBeNull();
  });

  it.each([
    ["letters", "abc"],
    ["a sign", "+1900003540"],
    ["a leading zero", `0${String(expiresAt)}`],
    ["a fraction", "1900003540.5"],
    ["an exponent", "2e9"],
    ["more than eleven digits", "100000000000"],
    ["nothing", ""],
  ])("refuses an expiry with %s even when the signature matches", async (_description, expiry) => {
    expect(await openAtNow(manuallySealed("opaque-token", expiry))).toBeNull();
  });

  it("refuses a tampered signature", async () => {
    const sealed = await sealSessionToken("opaque-token", sealSecret, expiresAt);

    expect(await openAtNow(withFirstSignatureCharacterChanged(sealed))).toBeNull();
  });

  it("refuses a value sealed with another secret", async () => {
    const sealed = await sealSessionToken("opaque-token", otherSealSecret, expiresAt);

    expect(await openAtNow(sealed)).toBeNull();
  });

  it("refuses a raw token without a seal", async () => {
    expect(await openAtNow("opaque-token")).toBeNull();
  });

  it("refuses a token sealed without an expiry", async () => {
    const legacySignature = createHmac("sha256", sealSecret)
      .update("opaque-token")
      .digest("base64url");

    expect(await openAtNow(`opaque-token.${legacySignature}`)).toBeNull();
  });

  it("refuses a JWT whose last parts are not a seal", async () => {
    expect(await openAtNow("header.payload.signature")).toBeNull();
  });

  it.each([
    ["a character outside base64url", (signature: string) => `${signature.slice(0, -1)}+`],
    ["padding", (signature: string) => `${signature.slice(0, -1)}=`],
    ["a short signature", (signature: string) => signature.slice(0, -1)],
    ["a long signature", (signature: string) => `${signature}A`],
    ["unused bits set in the last character", withUnusedBitSet],
  ])("refuses a signature with %s", async (_description, tamper) => {
    const signature = signatureOf("opaque-token");

    expect(await openAtNow(`opaque-token.${String(expiresAt)}.${tamper(signature)}`)).toBeNull();
  });

  it.each([
    ["a missing cookie", undefined],
    ["an empty cookie", ""],
    ["a lone dot", "."],
    ["two dots", ".."],
  ])("refuses %s", async (_description, value) => {
    expect(await openAtNow(value)).toBeNull();
  });
});

describe("effectiveSessionSeconds", () => {
  it("requires a session to last at least a minute", () => {
    expect(minSessionSeconds).toBe(60);
  });

  it.each([
    [0, 0],
    [1, 0],
    [60, 30],
    [119, 59],
    [120, 60],
    [121, 61],
    [3600, 3540],
    [86_460, 86_400],
    [86_461, 86_400],
    [-10, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])("keeps a token issued for %d seconds for %d seconds", (expiresIn, seconds) => {
    expect(effectiveSessionSeconds(expiresIn)).toBe(seconds);
  });

  it("sets the cookie lifetime from the effective session", () => {
    expect(sessionCookieOptions(119, { secure: true }).maxAge).toBe(effectiveSessionSeconds(119));
  });
});

describe("sessionCookieOptions", () => {
  it("hardens the cookie and keeps it on every path", () => {
    expect(sessionCookieOptions(3600, { secure: true })).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 3540,
    });
  });

  it("lets development run over plain HTTP", () => {
    expect(sessionCookieOptions(3600, { secure: false }).secure).toBe(false);
  });

  it.each([
    [3600, 3540],
    [100, 50],
    [101, 50],
    [1, 0],
    [0, 0],
    [-10, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [86_460, 86_400],
    [86_461, 86_400],
    [31_536_000, 86_400],
  ])("expires a token issued for %d seconds after %d seconds", (expiresIn, maxAge) => {
    expect(sessionCookieOptions(expiresIn, { secure: true }).maxAge).toBe(maxAge);
  });

  it("never keeps a session for more than a day", () => {
    expect(maxSessionSeconds).toBe(86_400);
    expect(sessionCookieOptions(86_459, { secure: true }).maxAge).toBe(86_399);
  });

  it("names the cookie session", () => {
    expect(sessionCookieName).toBe("session");
  });
});
