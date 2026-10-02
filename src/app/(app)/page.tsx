import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import {
  defaultRemittanceCheckPolicy,
  maxUploadBytes,
} from "@/application/remittance/check-remittance";
import { RemittanceChecker } from "@/features/remittance/remittance-checker";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("title"),
  };
}

const uploadLimits = {
  maxUploadBytes,
  maxReceivables: defaultRemittanceCheckPolicy.maxReceivables,
};

export default async function Home() {
  const t = await getTranslations("home");

  return (
    <main className="relative mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
      <header className="flex shrink-0 flex-col gap-0.5 lg:flex-row lg:items-baseline lg:gap-3">
        <h1 className="text-lg font-semibold sm:text-xl">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <RemittanceChecker limits={uploadLimits} />
    </main>
  );
}
