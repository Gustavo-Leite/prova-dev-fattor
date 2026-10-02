import { afterEach, describe, expect, it, vi } from "vitest";

import {
  InvalidServerEnvError,
  maxSignInPasswordLength,
  maxSignInEmailLength,
  minSessionSecretDistinctCharacters,
  minSessionSecretLength,
  parseServerEnv,
} from "@/infra/env";

const validSource = {
  FATTOR_API_BASE_URL: "https://api.example.com/public/prova-dev",
  SIGN_IN_EMAIL: "operator@example.test",
  SIGN_IN_PASSWORD: "test-password",
  SESSION_SECRET: "env-test-session-secret-env-test-session",
};

describe("parseServerEnv", () => {
  it("maps valid variables to the server env shape", () => {
    expect(parseServerEnv(validSource)).toEqual({
      sessionSecret: "env-test-session-secret-env-test-session",
      fattorApi: {
        baseUrl: "https://api.example.com/public/prova-dev",
      },
      signIn: {
        email: "operator@example.test",
        password: "test-password",
      },
    });
  });

  it("trims and lowercases the sign-in email", () => {
    const env = parseServerEnv({ ...validSource, SIGN_IN_EMAIL: "  Operator@Example.TEST " });

    expect(env.signIn.email).toBe("operator@example.test");
  });

  it("keeps the sign-in password exactly as given", () => {
    const env = parseServerEnv({ ...validSource, SIGN_IN_PASSWORD: " Mixed Case " });

    expect(env.signIn.password).toBe(" Mixed Case ");
  });

  it.each(["not-an-email", "user@", "@example.test", ""])(
    "rejects the sign-in email %j",
    (email) => {
      expect(() => parseServerEnv({ ...validSource, SIGN_IN_EMAIL: email })).toThrow(
        "SIGN_IN_EMAIL",
      );
    },
  );

  it("rejects an empty sign-in password", () => {
    expect(() => parseServerEnv({ ...validSource, SIGN_IN_PASSWORD: "" })).toThrow(
      "SIGN_IN_PASSWORD",
    );
  });

  it("never includes the sign-in password in the error message", () => {
    const source = { ...validSource, SIGN_IN_EMAIL: "invalid" };

    let thrown: unknown;
    try {
      parseServerEnv(source);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidServerEnvError);
    expect(String(thrown)).not.toContain(validSource.SIGN_IN_PASSWORD);
  });

  it("accepts a sign-in email at the limit and rejects a longer one", () => {
    const emailOfLength = (length: number) => {
      const fixed = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.`;
      return `${fixed}${"d".repeat(length - fixed.length - ".test".length)}.test`;
    };
    const atLimit = emailOfLength(maxSignInEmailLength);
    const overLimit = emailOfLength(maxSignInEmailLength + 1);

    expect(atLimit).toHaveLength(maxSignInEmailLength);
    expect(parseServerEnv({ ...validSource, SIGN_IN_EMAIL: atLimit }).signIn.email).toBe(atLimit);
    expect(() => parseServerEnv({ ...validSource, SIGN_IN_EMAIL: overLimit })).toThrow(
      "SIGN_IN_EMAIL",
    );
  });

  it("accepts a sign-in password at the limit and rejects a longer one", () => {
    const atLimit = "p".repeat(maxSignInPasswordLength);

    expect(parseServerEnv({ ...validSource, SIGN_IN_PASSWORD: atLimit }).signIn.password).toBe(
      atLimit,
    );
    expect(() => parseServerEnv({ ...validSource, SIGN_IN_PASSWORD: `${atLimit}p` })).toThrow(
      "SIGN_IN_PASSWORD",
    );
  });

  it("accepts a session secret at the minimum length and rejects a shorter one", () => {
    const atMinimum = "abcdefgh".repeat(minSessionSecretLength / 8);

    expect(minSessionSecretLength).toBe(32);
    expect(parseServerEnv({ ...validSource, SESSION_SECRET: atMinimum }).sessionSecret).toBe(
      atMinimum,
    );
    expect(() => parseServerEnv({ ...validSource, SESSION_SECRET: atMinimum.slice(1) })).toThrow(
      "SESSION_SECRET",
    );
  });

  it("rejects a long session secret with too few distinct characters", () => {
    const repetitive = "abcdefg".repeat(10);
    const varied = "abcdefgh".repeat(10);

    expect(minSessionSecretDistinctCharacters).toBe(8);
    expect(() => parseServerEnv({ ...validSource, SESSION_SECRET: repetitive })).toThrow(
      "SESSION_SECRET",
    );
    expect(() => parseServerEnv({ ...validSource, SESSION_SECRET: "a".repeat(64) })).toThrow(
      "SESSION_SECRET",
    );
    expect(parseServerEnv({ ...validSource, SESSION_SECRET: varied }).sessionSecret).toBe(varied);
  });

  it("rejects the empty session secret copied from .env.example", () => {
    expect(() => parseServerEnv({ ...validSource, SESSION_SECRET: "" })).toThrow(
      InvalidServerEnvError,
    );
  });

  it("never includes the session secret in the error message", () => {
    const shortSecret = "short-session-secret";
    const source = { ...validSource, SESSION_SECRET: shortSecret };

    let thrown: unknown;
    try {
      parseServerEnv(source);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidServerEnvError);
    expect(String(thrown)).toContain("SESSION_SECRET");
    expect(String(thrown)).not.toContain(shortSecret);
  });

  it("removes trailing slashes from the base URL", () => {
    const env = parseServerEnv({
      ...validSource,
      FATTOR_API_BASE_URL: "https://api.example.com/public/prova-dev//",
    });

    expect(env.fattorApi.baseUrl).toBe("https://api.example.com/public/prova-dev");
  });

  it.each(Object.keys(validSource))("names %s when it is missing", (name) => {
    const source: Record<string, string | undefined> = { ...validSource, [name]: undefined };

    expect(() => parseServerEnv(source)).toThrow(InvalidServerEnvError);
    expect(() => parseServerEnv(source)).toThrow(name);
  });

  it("rejects an empty environment", () => {
    expect(() => parseServerEnv({})).toThrow(InvalidServerEnvError);
  });

  it("rejects a base URL that is not HTTPS", () => {
    expect(() =>
      parseServerEnv({ ...validSource, FATTOR_API_BASE_URL: "http://api.example.com" }),
    ).toThrow("FATTOR_API_BASE_URL");
  });

  it.each([
    ["credentials", "https://user:pass@api.example.com/public"],
    ["a username", "https://user@api.example.com/public"],
    ["a query string", "https://api.example.com/public?page=1"],
    ["a fragment", "https://api.example.com/public#top"],
  ])("rejects a base URL with %s", (_case, baseUrl) => {
    expect(() => parseServerEnv({ ...validSource, FATTOR_API_BASE_URL: baseUrl })).toThrow(
      "FATTOR_API_BASE_URL",
    );
  });

  it("never echoes credentials embedded in the base URL", () => {
    const source = {
      ...validSource,
      FATTOR_API_BASE_URL: "https://user:leaked-pass@api.example.com",
    };

    expect(() => parseServerEnv(source)).toThrow(InvalidServerEnvError);
    try {
      parseServerEnv(source);
    } catch (error) {
      expect(String(error)).not.toContain("leaked-pass");
    }
  });

  it("normalizes the base URL to origin and path", () => {
    const env = parseServerEnv({ ...validSource, FATTOR_API_BASE_URL: "https:api.example.com/p/" });

    expect(env.fattorApi.baseUrl).toBe("https://api.example.com/p");
  });

  it("never includes variable values in the error message", () => {
    const secret = "leaked-secret-value";
    const source = { ...validSource, FATTOR_API_BASE_URL: `http://${secret}.example.com` };

    expect(() => parseServerEnv(source)).toThrow(InvalidServerEnvError);
    try {
      parseServerEnv(source);
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it("tells how to fix the problem", () => {
    expect(() => parseServerEnv({})).toThrow("Copy .env.example to .env");
  });
});

describe("getServerEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("parses process.env once and reuses the result", async () => {
    for (const [name, value] of Object.entries(validSource)) {
      vi.stubEnv(name, value);
    }
    const { getServerEnv } = await import("@/infra/env");

    const first = getServerEnv();
    vi.stubEnv("FATTOR_API_BASE_URL", "https://changed.example.com");

    expect(getServerEnv()).toBe(first);
    expect(first.fattorApi.baseUrl).toBe("https://api.example.com/public/prova-dev");
  });
});
