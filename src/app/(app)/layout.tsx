import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";

import { AppBar } from "@/features/preferences/app-bar";
import { isTheme, themeCookieName } from "@/lib/theme";

import brandMark from "../icon.png";

export default async function AppShellLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const themeCookie = (await cookies()).get(themeCookieName)?.value;
  const theme = isTheme(themeCookie) ? themeCookie : undefined;

  return (
    <>
      <AppBar locale={locale} theme={theme} logo={brandMark} />
      <div
        data-slot="page-scroller"
        className="flex w-full flex-1 flex-col desktop-tall:scrollbar-gutter-stable desktop-tall:overflow-y-auto"
      >
        {children}
      </div>
    </>
  );
}
