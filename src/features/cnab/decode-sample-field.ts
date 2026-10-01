import type { Locale } from "@/lib/locale";

const dueDatePattern = /^(\d{2})(\d{2})(\d{2})$/;
const amountPattern = /^\d{13}$/;
const firstCenturyYear = 2000;
const centsPerUnit = 100;

export function decodeDueDate(raw: string, locale: Locale): string | null {
  const match = dueDatePattern.exec(raw);
  if (!match) {
    return null;
  }
  const [day, month, year] = match.slice(1).map(Number);
  if (day === undefined || month === undefined || year === undefined) {
    return null;
  }
  const date = new Date(Date.UTC(firstCenturyYear + year, month - 1, day));
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) {
    return null;
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(date);
}

export function decodeAmount(raw: string, locale: Locale): string | null {
  if (!amountPattern.test(raw)) {
    return null;
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(
    Number(raw) / centsPerUnit,
  );
}
