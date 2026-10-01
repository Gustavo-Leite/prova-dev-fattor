import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale, setTheme } from "@/features/preferences/preferences-actions";

const cookieStore = vi.hoisted(() => ({
  set: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(cookieStore),
}));

const oneYearInSeconds = 31_536_000;

function formWith(name: string, value: string | Blob): FormData {
  const formData = new FormData();
  formData.append(name, value);
  return formData;
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  vi.unstubAllEnvs();
  cookieStore.set.mockReset();
  cookieStore.delete.mockReset();
});

describe("setTheme", () => {
  it.each(["light", "dark"])("stores %s in a hardened cookie", async (theme) => {
    await setTheme(formWith("theme", theme));

    expect(cookieStore.set).toHaveBeenCalledExactlyOnceWith("theme", theme, {
      path: "/",
      sameSite: "lax",
      secure: true,
      httpOnly: true,
      maxAge: oneYearInSeconds,
    });
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("deletes the cookie to follow the system again", async () => {
    await setTheme(formWith("theme", "system"));

    expect(cookieStore.delete).toHaveBeenCalledExactlyOnceWith("theme");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it.each(["", "Dark", "blue", "light; path=/admin"])(
    "writes nothing for the invalid value %j",
    async (theme) => {
      await setTheme(formWith("theme", theme));

      expect(cookieStore.set).not.toHaveBeenCalled();
      expect(cookieStore.delete).not.toHaveBeenCalled();
    },
  );

  it("writes nothing when the field is missing or is a file", async () => {
    await setTheme(new FormData());
    await setTheme(formWith("theme", new Blob(["dark"])));

    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("allows the cookie over plain HTTP outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await setTheme(formWith("theme", "dark"));

    expect(cookieStore.set).toHaveBeenCalledWith(
      "theme",
      "dark",
      expect.objectContaining({ secure: false }),
    );
  });
});

describe("setLocale", () => {
  it.each(["pt-BR", "en"])("stores %s in a hardened cookie", async (locale) => {
    await setLocale(formWith("locale", locale));

    expect(cookieStore.set).toHaveBeenCalledExactlyOnceWith("NEXT_LOCALE", locale, {
      path: "/",
      sameSite: "lax",
      secure: true,
      httpOnly: true,
      maxAge: oneYearInSeconds,
    });
  });

  it.each(["", "fr", "pt-br", "system"])(
    "writes nothing for the invalid value %j",
    async (locale) => {
      await setLocale(formWith("locale", locale));

      expect(cookieStore.set).not.toHaveBeenCalled();
      expect(cookieStore.delete).not.toHaveBeenCalled();
    },
  );

  it("writes nothing when the field is missing", async () => {
    await setLocale(new FormData());

    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
