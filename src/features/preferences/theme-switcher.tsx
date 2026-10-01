import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { setTheme } from "@/features/preferences/preferences-actions";
import type { Theme } from "@/lib/theme";

export const preferenceGroupClassName =
  "inline-flex items-center gap-0.5 rounded-lg border bg-background p-0.5";

export const preferenceOptionClassName =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-xs font-semibold text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background aria-pressed:bg-primary aria-pressed:text-primary-foreground motion-safe:transition-colors";

type ThemeChoice = Theme | "system";

const iconPaths: Record<ThemeChoice, ReactNode> = {
  system: (
    <>
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </>
  ),
  dark: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
};

const themeChoices: readonly ThemeChoice[] = ["system", "light", "dark"];

export interface ThemeSwitcherProps {
  readonly current: Theme | undefined;
}

export async function ThemeSwitcher({ current }: ThemeSwitcherProps) {
  const t = await getTranslations("appBar.theme");
  const selected: ThemeChoice = current ?? "system";

  return (
    <form action={setTheme}>
      <div role="group" aria-label={t("label")} className={preferenceGroupClassName}>
        {themeChoices.map((choice) => (
          <button
            key={choice}
            type="submit"
            name="theme"
            value={choice}
            aria-pressed={choice === selected}
            aria-label={t(choice)}
            title={t(choice)}
            className={preferenceOptionClassName}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
            >
              {iconPaths[choice]}
            </svg>
          </button>
        ))}
      </div>
    </form>
  );
}
