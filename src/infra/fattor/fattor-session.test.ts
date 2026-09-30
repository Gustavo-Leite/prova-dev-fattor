import { describe, expect, it } from "vitest";

import type { FattorLogin } from "@/infra/fattor/fattor-api.contract";
import { createFattorSession } from "@/infra/fattor/fattor-session";

function scriptedLogin(logins: readonly FattorLogin[]) {
  let calls = 0;
  const login = () => {
    const next = logins[Math.min(calls, logins.length - 1)];
    calls++;
    return next ? Promise.resolve(next) : Promise.reject(new Error("no login scripted"));
  };
  return { login, calls: () => calls };
}

const hour = { token: "T1", expiresInSeconds: 3600 };

describe("createFattorSession", () => {
  it("reuses the token until the expiry margin", async () => {
    let now = 0;
    const script = scriptedLogin([hour, { token: "T2", expiresInSeconds: 3600 }]);
    const session = createFattorSession({ login: script.login, now: () => now });

    expect(await session.getToken()).toBe("T1");
    now = 3_600_000 - 60_001;
    expect(await session.getToken()).toBe("T1");
    now = 3_600_000 - 60_000;
    expect(await session.getToken()).toBe("T2");
    expect(script.calls()).toBe(2);
  });

  it("uses half the lifetime as margin for short-lived tokens", async () => {
    let now = 0;
    const script = scriptedLogin([{ token: "T1", expiresInSeconds: 60 }, hour]);
    const session = createFattorSession({ login: script.login, now: () => now });

    await session.getToken();
    now = 29_999;
    expect(await session.getToken()).toBe("T1");
    now = 30_000;
    expect(script.calls()).toBe(1);
    await session.getToken();
    expect(script.calls()).toBe(2);
  });

  it("shares one login among concurrent callers", async () => {
    const script = scriptedLogin([hour]);
    const session = createFattorSession({ login: script.login });

    const tokens = await Promise.all(Array.from({ length: 5 }, () => session.getToken()));

    expect(tokens).toEqual(["T1", "T1", "T1", "T1", "T1"]);
    expect(script.calls()).toBe(1);
  });

  it("only drops the cached token when it is the one that was rejected", async () => {
    const script = scriptedLogin([hour, { token: "T2", expiresInSeconds: 3600 }]);
    const session = createFattorSession({ login: script.login });

    await session.getToken();
    session.invalidate("T1");
    expect(await session.getToken()).toBe("T2");
    session.invalidate("T1");
    expect(await session.getToken()).toBe("T2");
    expect(script.calls()).toBe(2);
  });

  it("recovers from a login that throws before returning a promise", async () => {
    let attempts = 0;
    const session = createFattorSession({
      login: () => {
        attempts++;
        if (attempts === 1) {
          throw new Error("synchronous failure");
        }
        return Promise.resolve(hour);
      },
    });

    await expect(session.getToken()).rejects.toThrow("synchronous failure");
    expect(await session.getToken()).toBe("T1");
  });

  it("does not cache a failed login", async () => {
    let attempts = 0;
    const session = createFattorSession({
      login: () => {
        attempts++;
        return attempts === 1 ? Promise.reject(new Error("down")) : Promise.resolve(hour);
      },
    });

    await expect(session.getToken()).rejects.toThrow("down");
    expect(await session.getToken()).toBe("T1");
  });
});
