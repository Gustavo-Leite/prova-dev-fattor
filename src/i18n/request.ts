import { cookies, headers } from "next/headers";
import type { Messages } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import type { Locale } from "@/lib/locale";
import { isSupportedLocale, localeCookieName, negotiateLocale } from "@/lib/locale";

const messagesByLocale = {
  en: () => import("./messages/en.json"),
  "pt-BR": () => import("./messages/pt-BR.json"),
} satisfies Record<Locale, () => Promise<{ default: Messages }>>;

async function resolveLocale(): Promise<Locale> {
  const cookieLocale = (await cookies()).get(localeCookieName)?.value;
  if (isSupportedLocale(cookieLocale)) {
    return cookieLocale;
  }
  return negotiateLocale((await headers()).get("accept-language"));
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: (await messagesByLocale[locale]()).default,
  };
});
