import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { signIn } from "@/app/login/sign-in-action";
import { SignInForm } from "@/features/session/sign-in-form";

const apiDocumentationUrl = "https://symphony.fattorcredito.com.br/public/prova-dev/swagger";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("signIn");
  return {
    title: t("metadataTitle"),
  };
}

export default async function Login() {
  const t = await getTranslations("signIn");

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 shrink-0 flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-lg border bg-card p-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold sm:text-xl">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </header>
        <SignInForm action={signIn} />
        <p className="text-sm">
          <a
            href={apiDocumentationUrl}
            className="rounded-sm font-medium text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            {t("demoCredentialsLink")}
          </a>
        </p>
      </div>
    </main>
  );
}
