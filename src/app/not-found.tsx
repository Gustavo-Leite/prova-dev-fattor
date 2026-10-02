import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { homePath } from "@/lib/routes";

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <title>{t("title")}</title>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
      <Link href={homePath} className="text-brand-gold-text underline underline-offset-4">
        {t("backHome")}
      </Link>
    </main>
  );
}
