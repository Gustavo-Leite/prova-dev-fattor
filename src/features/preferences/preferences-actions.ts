"use server";

import { cookies } from "next/headers";

import { isSupportedLocale, localeCookieName } from "@/lib/locale";
import { isTheme, themeCookieName } from "@/lib/theme";

const oneYearInSeconds = 60 * 60 * 24 * 365;

const systemTheme = "system";

function readField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

function preferenceCookieOptions() {
  return {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: oneYearInSeconds,
  } as const;
}

export async function setTheme(formData: FormData): Promise<void> {
  const theme = readField(formData, "theme");
  const cookieStore = await cookies();
  if (theme === systemTheme) {
    cookieStore.delete(themeCookieName);
    return;
  }
  if (isTheme(theme)) {
    cookieStore.set(themeCookieName, theme, preferenceCookieOptions());
  }
}

export async function setLocale(formData: FormData): Promise<void> {
  const locale = readField(formData, "locale");
  if (isSupportedLocale(locale)) {
    (await cookies()).set(localeCookieName, locale, preferenceCookieOptions());
  }
}
