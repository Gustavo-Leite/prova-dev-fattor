import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import { signOut } from "@/app/(app)/sign-out-action";
import { AppBar } from "@/features/preferences/app-bar";
import { RemittanceCheckProvider } from "@/features/remittance/remittance-check-provider";
import { getServerEnv } from "@/infra/env";
import { openSessionCookie, sessionCookieName } from "@/lib/session-cookie";
import { isTheme, themeCookieName } from "@/lib/theme";

import brandMark from "../icon.png";

export default async function AppShellLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const t = await getTranslations("appBar");
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get(themeCookieName)?.value;
  const theme = isTheme(themeCookie) ? themeCookie : undefined;
  const sessionToken = await openSessionCookie(
    cookieStore.get(sessionCookieName)?.value,
    getServerEnv().sessionSecret,
  );

  return (
    <>
      <a
        href="#main"
        className="sr-only rounded-md bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-md outline-none focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {t("skipToContent")}
      </a>
      <AppBar
        locale={locale}
        theme={theme}
        logo={brandMark}
        signOutAction={sessionToken === null ? undefined : signOut}
      />
      <div
        data-slot="page-scroller"
        className="flex w-full flex-1 flex-col desktop-tall:scrollbar-gutter-stable desktop-tall:overflow-y-auto"
      >
        <RemittanceCheckProvider>{children}</RemittanceCheckProvider>
      </div>
    </>
  );
}
