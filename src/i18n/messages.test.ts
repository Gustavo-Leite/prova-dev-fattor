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

function argumentNames(message: unknown): string[] {
  const names = [...String(message).matchAll(/\{\s*(\w+)\s*[,}]/g)].flatMap(
    (match) => match[1] ?? [],
  );
  return [...new Set(names)].sort();
}

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

  it("use the same ICU arguments in every locale", () => {
    const portugueseByKey = new Map(collectEntries(ptBR));

    for (const [key, message] of collectEntries(en)) {
      expect(argumentNames(portugueseByKey.get(key)), key).toEqual(argumentNames(message));
    }
  });

  it("tells apart messages that use different ICU arguments", () => {
    expect(argumentNames("{count, plural, one {# item} other {# items}}")).not.toEqual(
      argumentNames("{total, plural, one {# item} other {# itens}}"),
    );
    expect(
      argumentNames("Line {lineNumber}: {actual, plural, =0 {is empty} other {# chars}}"),
    ).toEqual(["actual", "lineNumber"]);
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
