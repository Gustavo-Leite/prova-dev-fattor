import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { splitAccessKey } from "@/domain/cnab/access-key";
import { cnab444Layout, readField } from "@/domain/cnab/layout";
import { AccessKeyPartList } from "@/features/cnab/access-key-parts";
import type { DetailField } from "@/features/cnab/detail-fields";
import { detailFields } from "@/features/cnab/detail-fields";
import { groupAccessKey } from "@/features/cnab/format-access-key";
import { LayoutTable } from "@/features/cnab/layout-table";
import type { LineXraySegment, LineXraySegmentTone } from "@/features/cnab/line-xray";
import { LineXray } from "@/features/cnab/line-xray";
import { RecordTypeCards } from "@/features/cnab/record-type-cards";
import { sampleDetailLine } from "@/features/cnab/sample-detail-line";

const layoutDocumentationUrl =
  "https://github.com/Gustavo-Leite/prova-dev-fattor/blob/main/docs/cnab-444.md";

const sampleAccessKey = readField(sampleDetailLine, cnab444Layout.detail.invoiceAccessKey);

const sectionTitleClassName = "text-base font-semibold sm:text-lg";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cnab.layout");
  return {
    title: t("metadataTitle"),
  };
}

function toneOf(field: DetailField): LineXraySegmentTone {
  if (field.reliability === "observed") {
    return "observed";
  }
  return field.id === "recordType" ? "solid" : "underline";
}

export default async function Cnab444Layout() {
  const t = await getTranslations("cnab.layout");
  const tCnab = await getTranslations("cnab");
  const accessKeyParts = splitAccessKey(sampleAccessKey);
  const segments: LineXraySegment[] = detailFields.map((field) => ({
    position: field.position,
    tone: toneOf(field),
    label: t(`fields.${field.id}`),
  }));

  return (
    <main className="relative mx-auto flex w-full max-w-7xl flex-1 shrink-0 flex-col gap-8 px-4 py-4 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold sm:text-xl">{t("title")}</h1>
        <p className="max-w-prose text-sm">
          {t("intro", {
            length: cnab444Layout.lineLength,
            keyPositions: tCnab("positions", cnab444Layout.detail.invoiceAccessKey),
          })}
        </p>
        <p className="text-sm">
          <a
            href={layoutDocumentationUrl}
            className="rounded-sm font-medium text-primary underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("docLink")}
          </a>
        </p>
      </header>

      <section aria-labelledby="record-types" className="flex flex-col gap-3">
        <h2 id="record-types" className={sectionTitleClassName}>
          {t("records.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("records.description")}</p>
        <RecordTypeCards />
      </section>

      <section aria-labelledby="sample-detail" className="flex flex-col gap-3">
        <h2 id="sample-detail" className={sectionTitleClassName}>
          {t("xray.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("xray.description")}</p>
        <LineXray
          line={sampleDetailLine}
          segments={segments}
          label={t("xray.label")}
          caption={t("xray.caption")}
        />
      </section>

      <section aria-labelledby="detail-fields" className="flex flex-col gap-3">
        <h2 id="detail-fields" className={sectionTitleClassName}>
          {t("table.title")}
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">{t("table.observedNote")}</p>
        <LayoutTable />
      </section>

      {accessKeyParts && (
        <section aria-labelledby="access-key" className="flex flex-col gap-3">
          <h2 id="access-key" className={sectionTitleClassName}>
            {t("accessKey.title")}
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">{t("accessKey.description")}</p>
          <p className="font-mono text-sm break-all tabular-nums">
            {groupAccessKey(sampleAccessKey)}
          </p>
          <div className="text-sm">
            <AccessKeyPartList parts={accessKeyParts} />
          </div>
        </section>
      )}
    </main>
  );
}
