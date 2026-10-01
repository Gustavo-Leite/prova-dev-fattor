import { describe, expect, it } from "vitest";

import { maxSessionSeconds, sessionCookieName, sessionCookieOptions } from "@/lib/session-cookie";

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
