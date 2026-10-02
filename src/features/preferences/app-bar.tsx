import type { StaticImageData } from "next/image";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { PreferenceControls } from "@/features/preferences/preference-controls";
import type { Locale } from "@/lib/locale";
import { homePath } from "@/lib/routes";
import type { Theme } from "@/lib/theme";

export interface AppBarProps {
  readonly locale: Locale;
  readonly theme: Theme | undefined;
  readonly logo: StaticImageData;
  readonly signOutAction?: () => Promise<void>;
}

export async function AppBar({ locale, theme, logo, signOutAction }: AppBarProps) {
  const t = await getTranslations("appBar");

  return (
    <header className="shrink-0 border-b bg-card">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2 sm:flex sm:px-6 lg:px-8">
        <Link
          href={homePath}
          className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 rounded-md text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <Image
            src={logo}
            alt=""
            width={28}
            height={28}
            priority
            className="size-7 shrink-0 rounded-md p-0.5 dark:bg-white"
          />
          <span className="truncate">{t("name")}</span>
        </Link>
        <div className="col-span-2 row-start-2 flex items-center justify-between gap-2 sm:flex-1">
          <AppNav
            label={t("nav.label")}
            links={[
              { href: homePath, label: t("nav.check") },
              { href: "/cnab-444", label: t("nav.layout") },
            ]}
          />
          {signOutAction === undefined ? null : (
            <form action={signOutAction} className="shrink-0">
              <Button type="submit" variant="ghost" className="text-xs font-semibold">
                {t("signOut")}
              </Button>
            </form>
          )}
        </div>
        <PreferenceControls locale={locale} theme={theme} className="col-start-2 row-start-1" />
      </div>
    </header>
  );
}
