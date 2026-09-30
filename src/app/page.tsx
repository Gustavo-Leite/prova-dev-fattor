import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("title"),
  };
}

export default async function Home() {
  const t = await getTranslations("home");

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <h1 className="text-center text-2xl font-semibold">{t("title")}</h1>
    </main>
  );
}
