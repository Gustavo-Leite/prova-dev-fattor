"use client";

import { useTranslations } from "next-intl";

import { ErrorFallback } from "@/components/error-fallback";
import { homePath } from "@/lib/routes";

interface ErrorPageProps {
  error: Error & { digest?: string };
  retry: () => void;
}

export default function ErrorPage({ error, retry }: ErrorPageProps) {
  const t = useTranslations("errorPage");

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-8">
      <title>{t("title")}</title>
      <ErrorFallback
        title={t("title")}
        description={t("description")}
        retryLabel={t("retry")}
        homeLabel={t("home")}
        homeHref={homePath}
        errorCodeLabel={t("errorCode")}
        digest={error.digest}
        onRetry={retry}
      />
    </main>
  );
}
