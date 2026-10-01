import { getTranslations } from "next-intl/server";

import { setLocale } from "@/features/preferences/preferences-actions";
import {
  preferenceGroupClassName,
  preferenceOptionClassName,
} from "@/features/preferences/theme-switcher";
import type { Locale } from "@/lib/locale";
import { supportedLocales } from "@/lib/locale";

export interface LanguageSwitcherProps {
  readonly current: Locale;
}

export async function LanguageSwitcher({ current }: LanguageSwitcherProps) {
  const t = await getTranslations("appBar.language");

  return (
    <form action={setLocale}>
      <div role="group" aria-label={t("label")} className={preferenceGroupClassName}>
        {supportedLocales.map((locale) => (
          <button
            key={locale}
            type="submit"
            name="locale"
            value={locale}
            aria-pressed={locale === current}
            className={preferenceOptionClassName}
          >
            {t(`shortNames.${locale}`)}{" "}
            <span className="sr-only" lang={locale}>
              {t(`names.${locale}`)}
            </span>
          </button>
        ))}
      </div>
    </form>
  );
}
