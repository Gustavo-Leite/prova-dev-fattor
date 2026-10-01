import { groupAccessKey } from "@/features/cnab/format-access-key";
import type { ReceivableRow } from "@/features/remittance/remittance-check-state";
import type { Locale } from "@/lib/locale";

export type CsvCell = string | number;

export type CsvRecord = readonly CsvCell[];

export type CsvDelimiter = ";" | ",";

export interface CsvOptions {
  readonly delimiter: CsvDelimiter;
}

export const csvByteOrderMark = String.fromCodePoint(0xfeff);
const lineBreak = "\r\n";
const formulaTrigger = /^[=+\-@\t\r]/;
const needsQuotes = /["\r\n]/;
const objectUrlLifetimeMs = 10_000;

function neutralizeFormula(text: string): string {
  return formulaTrigger.test(text) ? `'${text}` : text;
}

function quote(text: string, delimiter: CsvDelimiter): string {
  return text.includes(delimiter) || needsQuotes.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

function toField(cell: CsvCell, delimiter: CsvDelimiter): string {
  const text = typeof cell === "number" ? String(cell) : neutralizeFormula(cell);
  return quote(text, delimiter);
}

export function toCsv(
  header: readonly string[],
  records: readonly CsvRecord[],
  { delimiter }: CsvOptions,
): string {
  const lines = [header, ...records].map((record) =>
    record.map((cell) => toField(cell, delimiter)).join(delimiter),
  );
  return `${csvByteOrderMark}${lines.join(lineBreak)}`;
}

const delimiterByLocale: Readonly<Record<Locale, CsvDelimiter>> = {
  "pt-BR": ";",
  en: ",",
};

export function csvDelimiterFor(locale: Locale): CsvDelimiter {
  return delimiterByLocale[locale];
}

export function toRemittanceCsvRecords(
  rows: readonly ReceivableRow[],
  statusLabel: (row: ReceivableRow) => string,
): CsvRecord[] {
  return rows.map((row) => [
    row.ordinal,
    row.lineNumber,
    groupAccessKey(row.invoiceAccessKey),
    statusLabel(row),
  ]);
}

export function downloadCsv(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, objectUrlLifetimeMs);
}
