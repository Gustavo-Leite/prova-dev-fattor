import { LanguageSwitcher } from "@/features/preferences/language-switcher";
import { ThemeSwitcher } from "@/features/preferences/theme-switcher";
import type { Locale } from "@/lib/locale";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export interface PreferenceControlsProps {
  readonly locale: Locale;
  readonly theme: Theme | undefined;
  readonly className?: string;
}

export function PreferenceControls({ locale, theme, className }: PreferenceControlsProps) {
  return (
    <div className={cn("flex shrink-0 items-center gap-2", className)}>
      <ThemeSwitcher current={theme} />
      <LanguageSwitcher current={locale} />
    </div>
  );
}
