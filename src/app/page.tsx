import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { maxUploadBytes } from "@/app/api/remittances/handle-remittance-upload";
import { defaultRemittanceCheckPolicy } from "@/application/remittance/check-remittance";
import { RemittanceUpload } from "@/features/remittance/remittance-upload";

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
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-8 sm:px-8 sm:py-12">
      <header className="flex max-w-2xl flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </header>
      <RemittanceUpload limits={uploadLimits} />
    </main>
  );
}
