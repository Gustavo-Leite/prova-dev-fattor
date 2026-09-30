import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { maxUploadBytes } from "@/app/api/remittances/handle-remittance-upload";
import { defaultRemittanceCheckPolicy } from "@/application/remittance/check-remittance";
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
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8 desktop-tall:overflow-y-auto">
      <header className="flex shrink-0 flex-col gap-1">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <RemittanceChecker limits={uploadLimits} />
    </main>
  );
}
