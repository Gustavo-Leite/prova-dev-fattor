import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const assertServerEnvOnStartup = vi.fn();

describe("register", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/infra/startup", () => ({ assertServerEnvOnStartup }));
  });

  afterEach(() => {
    vi.doUnmock("@/infra/startup");
    vi.unstubAllEnvs();
    assertServerEnvOnStartup.mockReset();
  });

  it("validates the server env in the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const { register } = await import("@/instrumentation");

    await register();

    expect(assertServerEnvOnStartup).toHaveBeenCalledOnce();
  });

  it("skips the validation in the Edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const { register } = await import("@/instrumentation");

    await register();

    expect(assertServerEnvOnStartup).not.toHaveBeenCalled();
  });
});
