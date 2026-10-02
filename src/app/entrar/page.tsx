import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import { signIn } from "@/app/entrar/sign-in-action";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PreferenceControls } from "@/features/preferences/preference-controls";
import { SignInForm } from "@/features/session/sign-in-form";
import { SignInHero } from "@/features/session/sign-in-hero";
import { isTheme, themeCookieName } from "@/lib/theme";

import brandMark from "../icon.png";

const apiDocumentationUrl = "https://symphony.fattorcredito.com.br/public/prova-dev/swagger";

const helpOpenDelayMs = 150;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("signIn");
  return {
    title: t("metadataTitle"),
  };
}

function HelpIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      <path d="M7.5 8a4.5 4.5 0 1 1 6.3 4.1c-1.1.5-1.8 1.5-1.8 2.7v.7" />
      <path d="M12 20.5h.01" />
    </svg>
  );
}

export default async function SignIn() {
  const t = await getTranslations("signIn");
  const locale = await getLocale();
  const themeCookie = (await cookies()).get(themeCookieName)?.value;
  const theme = isTheme(themeCookie) ? themeCookie : undefined;

  return (
    <main className="flex min-h-0 w-full flex-1 flex-col lg:flex-row">
      <SignInHero logo={brandMark} />
      <div
        className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-4 sm:px-6 lg:w-1/2 lg:px-12 lg:py-6 desktop-tall:scrollbar-gutter-stable desktop-tall:overflow-y-auto"
        data-slot="sign-in-scroller"
      >
        <PreferenceControls locale={locale} theme={theme} className="self-end" />
        <div className="flex flex-1 flex-col items-center justify-center pb-6">
          <div className="flex w-full max-w-sm flex-col gap-7 rounded-xl border bg-card p-6 shadow-sm sm:p-8">
            <header className="flex flex-col gap-3">
              <span aria-hidden="true" className="h-1 w-10 rounded-full bg-brand-gold" />
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
                <Popover>
                  <PopoverTrigger
                    openOnHover
                    delay={helpOpenDelayMs}
                    aria-label={t("help.label")}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-input bg-muted text-foreground outline-none hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card data-popup-open:border-primary data-popup-open:text-primary motion-safe:transition-colors"
                  >
                    <HelpIcon />
                  </PopoverTrigger>
                  <PopoverContent align="start" aria-label={t("help.label")}>
                    <PopoverDescription>{t("help.content")}</PopoverDescription>
                  </PopoverContent>
                </Popover>
              </div>
            </header>
            <SignInForm action={signIn} />
            <p className="text-sm">
              <a
                href={apiDocumentationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm font-medium text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                {t("demoCredentialsLink")}
                <span className="sr-only">{t("opensInNewTab")}</span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="ml-1 inline size-3.5 align-[-0.125em]"
                >
                  <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                </svg>
              </a>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
