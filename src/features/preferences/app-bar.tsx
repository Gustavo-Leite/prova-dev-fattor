import type { StaticImageData } from "next/image";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "@/features/preferences/language-switcher";
import { ThemeSwitcher } from "@/features/preferences/theme-switcher";
import type { Locale } from "@/lib/locale";
import type { Theme } from "@/lib/theme";

export interface AppBarProps {
  readonly locale: Locale;
  readonly theme: Theme | undefined;
  readonly logo: StaticImageData;
}

export async function AppBar({ locale, theme, logo }: AppBarProps) {
  const t = await getTranslations("appBar");

  return (
    <header className="shrink-0 border-b bg-card">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 rounded-md text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <Image
            src={logo}
            alt=""
            width={28}
            height={28}
            priority
            className="size-7 shrink-0 rounded-md dark:bg-white dark:p-0.5"
          />
          <span className="truncate">{t("name")}</span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeSwitcher current={theme} />
          <LanguageSwitcher current={locale} />
        </div>
      </div>
    </header>
  );
}
