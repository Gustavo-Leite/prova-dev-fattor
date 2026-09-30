import type { Metadata } from "next";
import { Geist_Mono, Sora } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
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

  return (
    <html lang={locale} className={`${sora.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col desktop-tall:h-dvh" suppressHydrationWarning>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <footer className="shrink-0 border-t px-4 py-3 text-center text-xs text-muted-foreground">
          {t("disclaimer")}
        </footer>
      </body>
    </html>
  );
}
