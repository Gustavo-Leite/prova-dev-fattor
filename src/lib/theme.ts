export const themes = ["light", "dark"] as const;

export type Theme = (typeof themes)[number];

export const themeCookieName = "theme";

export function isTheme(value: string | undefined): value is Theme {
  return themes.some((theme) => theme === value);
}
