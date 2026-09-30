import type { Locale as IntlLocale, Messages } from "next-intl";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { Locale } from "@/lib/locale";

import en from "./messages/en.json";
import ptBR from "./messages/pt-BR.json";

function collectEntries(value: unknown, prefix = ""): [string, unknown][] {
  if (typeof value !== "object" || value === null) {
    return [[prefix, value]];
  }
  return Object.entries(value).flatMap(([key, nested]) =>
    collectEntries(nested, prefix ? `${prefix}.${key}` : key),
  );
}

const catalogs = { en, "pt-BR": ptBR };

describe("message catalogs", () => {
  it("define exactly the same keys in every locale", () => {
    const keysByLocale = Object.values(catalogs).map((catalog) =>
      collectEntries(catalog)
        .map(([key]) => key)
        .sort(),
    );

    for (const keys of keysByLocale) {
      expect(keys).toEqual(keysByLocale[0]);
    }
  });

  it.each(Object.entries(catalogs))("has only non-empty strings in %s", (_locale, catalog) => {
    for (const [key, value] of collectEntries(catalog)) {
      expect(typeof value, key).toBe("string");
      expect(String(value).trim(), key).not.toBe("");
    }
  });
});

describe("next-intl type augmentation", () => {
  it("types messages from the English catalog", () => {
    expectTypeOf<Messages>().toEqualTypeOf<typeof en>();
  });

  it("types locales from the supported locales", () => {
    expectTypeOf<IntlLocale>().toEqualTypeOf<Locale>();
  });
});
