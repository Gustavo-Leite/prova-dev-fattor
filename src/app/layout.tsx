import type { Metadata } from "next";
import { Geist_Mono, Sora } from "next/font/google";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

import { isTheme, themeCookieName } from "@/lib/theme";

import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    description: t("description"),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const t = await getTranslations("footer");
  const themeCookie = (await cookies()).get(themeCookieName)?.value;
  const theme = isTheme(themeCookie) ? themeCookie : undefined;

  return (
    <html
      lang={locale}
      data-theme={theme}
      className={`${sora.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col desktop-tall:h-dvh" suppressHydrationWarning>
        <div className="flex min-h-0 w-full flex-1 flex-col">
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
        </div>
        <footer className="shrink-0 border-t px-4 py-3 text-center text-xs text-muted-foreground">
          {t("disclaimer")}
        </footer>
      </body>
    </html>
  );
}
