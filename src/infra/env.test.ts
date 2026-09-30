import { afterEach, describe, expect, it, vi } from "vitest";

import { InvalidServerEnvError, parseServerEnv } from "@/infra/env";

const validSource = {
  FATTOR_API_BASE_URL: "https://api.example.com/public/prova-dev",
  FATTOR_API_EMAIL: "demo@example.com",
  FATTOR_API_PASSWORD: "top-secret-value",
};

describe("parseServerEnv", () => {
  it("maps valid variables to the server env shape", () => {
    expect(parseServerEnv(validSource)).toEqual({
      fattorApi: {
        baseUrl: "https://api.example.com/public/prova-dev",
        email: "demo@example.com",
        password: "top-secret-value",
      },
    });
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

  it("rejects an invalid email", () => {
    expect(() => parseServerEnv({ ...validSource, FATTOR_API_EMAIL: "not-an-email" })).toThrow(
      "FATTOR_API_EMAIL",
    );
  });

  it("rejects an empty password", () => {
    expect(() => parseServerEnv({ ...validSource, FATTOR_API_PASSWORD: "" })).toThrow(
      "FATTOR_API_PASSWORD",
    );
  });

  it("never includes variable values in the error message", () => {
    const secret = "leaked-secret-value";
    const source = { ...validSource, FATTOR_API_EMAIL: secret, FATTOR_API_PASSWORD: secret };

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
    vi.stubEnv("FATTOR_API_EMAIL", "changed@example.com");

    expect(getServerEnv()).toBe(first);
    expect(first.fattorApi.email).toBe("demo@example.com");
  });
});
