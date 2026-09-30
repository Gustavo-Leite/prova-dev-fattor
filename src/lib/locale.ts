export const supportedLocales = ["pt-BR", "en"] as const;

export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = "pt-BR";

export const localeCookieName = "NEXT_LOCALE";

export function isSupportedLocale(value: string | undefined): value is Locale {
  return supportedLocales.some((locale) => locale === value);
}

interface LanguageRange {
  tag: string;
  quality: number;
  position: number;
}

const qualityValuePattern = /^(0(\.\d{0,3})?|1(\.0{0,3})?)$/;

function parseQuality(parameters: readonly string[]): number {
  for (const parameter of parameters) {
    const [name = "", value = ""] = parameter.split("=");
    if (name.trim().toLowerCase() === "q") {
      const trimmed = value.trim();
      return qualityValuePattern.test(trimmed) ? Number(trimmed) : 0;
    }
  }
  return 1;
}

function parseLanguageRange(entry: string, position: number): LanguageRange {
  const [rawTag = "", ...parameters] = entry.split(";");
  return {
    tag: rawTag.trim().toLowerCase(),
    quality: parseQuality(parameters),
    position,
  };
}

function matchSupportedLocale(tag: string): Locale | undefined {
  const exactMatch = supportedLocales.find((locale) => locale.toLowerCase() === tag);
  if (exactMatch) {
    return exactMatch;
  }
  const language = tag.split("-")[0];
  return supportedLocales.find((locale) => locale.split("-")[0]?.toLowerCase() === language);
}

export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) {
    return defaultLocale;
  }
  const ranges = acceptLanguage
    .split(",")
    .map(parseLanguageRange)
    .filter((range) => range.tag !== "" && range.tag !== "*" && range.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.position - right.position);

  for (const range of ranges) {
    const locale = matchSupportedLocale(range.tag);
    if (locale) {
      return locale;
    }
  }
  return defaultLocale;
}
