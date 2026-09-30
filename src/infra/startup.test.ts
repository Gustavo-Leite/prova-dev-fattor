import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as EnvModule from "@/infra/env";

const validEnv = {
  FATTOR_API_BASE_URL: "https://api.example.com/public/prova-dev",
  FATTOR_API_EMAIL: "demo@example.com",
  FATTOR_API_PASSWORD: "top-secret-value",
};

describe("assertServerEnvOnStartup", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const name of Object.keys(validEnv)) {
      vi.stubEnv(name, undefined);
    }
  });

  afterEach(() => {
    vi.doUnmock("@/infra/env");
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("exits with code 1 and explains the problem when the env is invalid", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { assertServerEnvOnStartup } = await import("@/infra/startup");

    assertServerEnvOnStartup();

    expect(exit).toHaveBeenCalledWith(1);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("FATTOR_API_BASE_URL"));
  });

  it("does nothing when the env is valid", async () => {
    for (const [name, value] of Object.entries(validEnv)) {
      vi.stubEnv(name, value);
    }
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const { assertServerEnvOnStartup } = await import("@/infra/startup");

    assertServerEnvOnStartup();

    expect(exit).not.toHaveBeenCalled();
  });

  it("rethrows unexpected errors instead of exiting", async () => {
    const unexpected = new Error("unexpected failure");
    vi.doMock("@/infra/env", async (importOriginal) => ({
      ...(await importOriginal<typeof EnvModule>()),
      getServerEnv: () => {
        throw unexpected;
      },
    }));
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const { assertServerEnvOnStartup } = await import("@/infra/startup");

    expect(() => {
      assertServerEnvOnStartup();
    }).toThrow(unexpected);
    expect(exit).not.toHaveBeenCalled();
  });
});
