import { describe, expect, it } from "vitest";

import {
  maxSessionSeconds,
  maxSessionTokenLength,
  readSessionToken,
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/session-cookie";

describe("readSessionToken", () => {
  it.each([
    ["an opaque token", "abc.DEF-123_~"],
    ["the longest token allowed", "t".repeat(4000)],
    ["printable ASCII punctuation", "!#$%&'()*+,-./:;<=>?@[]^`{|}"],
  ])("accepts %s", (_description, value) => {
    expect(readSessionToken(value)).toBe(value);
  });

  it.each([
    ["a missing cookie", undefined],
    ["an empty cookie", ""],
    ["a line feed", "\n"],
    ["a carriage return", "token\rvalue"],
    ["a space", "token value"],
    ["a tab", "token\tvalue"],
    ["a non-ASCII character", "tokené"],
    ["a DEL character", "token\u007f"],
    ["a token above the limit", "t".repeat(4001)],
  ])("rejects %s", (_description, value) => {
    expect(readSessionToken(value)).toBeNull();
  });

  it("allows tokens as long as the login response does", () => {
    expect(maxSessionTokenLength).toBe(4000);
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
