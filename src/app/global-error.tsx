"use client";

import { ErrorFallback } from "@/components/error-fallback";
import globalErrorMessages from "@/i18n/messages/global-error.json";
import type { Locale } from "@/lib/locale";
import { defaultLocale, supportedLocales } from "@/lib/locale";
import { homePath } from "@/lib/routes";

import "./globals.css";

interface GlobalErrorMessages {
  title: string;
  description: string;
  retry: string;
  home: string;
  errorCode: string;
}

const messagesByLocale = globalErrorMessages satisfies Record<Locale, GlobalErrorMessages>;

interface GlobalErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

export default function GlobalError({ error, retry }: GlobalErrorProps) {
  const documentTitle = supportedLocales
    .map((locale) => messagesByLocale[locale].title)
    .join(" | ");

  return (
    <html lang={defaultLocale} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <title>{documentTitle}</title>
        <main className="flex flex-1 flex-col items-center justify-center gap-8 divide-y p-8">
          {supportedLocales.map((locale, index) => {
            const messages = messagesByLocale[locale];
            return (
              <section key={locale} lang={locale} className="pb-8 last:pb-0">
                <ErrorFallback
                  title={messages.title}
                  description={messages.description}
                  retryLabel={messages.retry}
                  homeLabel={messages.home}
                  homeHref={homePath}
                  errorCodeLabel={messages.errorCode}
                  digest={error.digest}
                  headingLevel={index === 0 ? 1 : 2}
                  onRetry={retry}
                />
              </section>
            );
          })}
        </main>
      </body>
    </html>
  );
}
