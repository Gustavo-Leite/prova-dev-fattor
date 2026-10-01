import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";

import { signOut } from "@/app/(app)/sign-out-action";
import { AppBar } from "@/features/preferences/app-bar";
import { getServerEnv } from "@/infra/env";
import { openSessionCookie, sessionCookieName } from "@/lib/session-cookie";
import { isTheme, themeCookieName } from "@/lib/theme";

import brandMark from "../icon.png";

export default async function AppShellLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get(themeCookieName)?.value;
  const theme = isTheme(themeCookie) ? themeCookie : undefined;
  const sessionToken = await openSessionCookie(
    cookieStore.get(sessionCookieName)?.value,
    getServerEnv().sessionSecret,
  );

  return (
    <>
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
        {children}
      </div>
    </>
  );
}
