import { useTranslations } from "next-intl";

import type { FieldPosition } from "@/domain/cnab/layout";

export function usePositionLabel(): (position: FieldPosition) => string {
  const t = useTranslations("cnab");
  return ({ start, end }) =>
    start === end ? t("position", { start }) : t("positions", { start, end });
}
