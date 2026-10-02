import { hasValidCheckDigit, isAccessKeyFormatValid } from "@/domain/cnab/access-key";
import type { RecordTypeCode } from "@/domain/cnab/layout";
import { cnab444Layout, readField, recordTypeCodes } from "@/domain/cnab/layout";

export interface Receivable {
  readonly lineNumber: number;
  readonly invoiceAccessKey: string;
  readonly hasValidCheckDigit: boolean;
}

export type Cnab444Issue =
  | { readonly code: "EMPTY_FILE" }
  | { readonly code: "INVALID_CHARACTERS"; readonly lineNumber: number }
  | {
      readonly code: "INVALID_LINE_LENGTH";
      readonly lineNumber: number;
      readonly expected: number;
      readonly actual: number;
    }
  | {
      readonly code: "UNEXPECTED_RECORD_TYPE";
      readonly lineNumber: number;
      readonly expected: RecordTypeCode;
      readonly actual: string;
    }
  | { readonly code: "MISSING_DETAIL_RECORDS" }
  | { readonly code: "INVALID_RECORD_COUNT"; readonly lineNumber: number }
  | {
      readonly code: "RECORD_COUNT_MISMATCH";
      readonly lineNumber: number;
      readonly declared: number;
      readonly actual: number;
    }
  | { readonly code: "INVALID_ACCESS_KEY_FORMAT"; readonly lineNumber: number };

export type Cnab444ParseResult =
  | {
      readonly ok: true;
      readonly receivables: readonly Receivable[];
      readonly lines: readonly string[];
    }
  | { readonly ok: false; readonly errors: readonly Cnab444Issue[]; readonly truncated: boolean };

export const maxReportedIssues = 50;

const lineBreakPattern = /\r?\n/;
const paddingLinePattern = /^[ \t\u0000\u001a]*$/;
const recordCountPattern = /^\d{1,8}$/;
const minimumLineCount = 3;
const endOfFileFillerCodes: ReadonlySet<number> = new Set([0x0a, 0x0d, 0x00, 0x1a]);
const softHyphenCode = 0xad;

function isDeleteOrC1Code(code: number): boolean {
  return code >= 0x7f && code <= 0x9f;
}

const printableWindows1252Codes: ReadonlySet<number> = new Set(
  Array.from(
    new TextDecoder("windows-1252").decode(
      Uint8Array.from({ length: 0x100 - 0x20 }, (_, index) => 0x20 + index),
    ),
    (character) => character.charCodeAt(0),
  ).filter((code) => !isDeleteOrC1Code(code) && code !== softHyphenCode),
);

function isEndOfFileFiller(code: number): boolean {
  return endOfFileFillerCodes.has(code);
}

function withoutTrailingEndOfFileFiller(content: string): string {
  let end = content.length;
  while (end > 0 && isEndOfFileFiller(content.charCodeAt(end - 1))) {
    end--;
  }
  return content.slice(0, end);
}

function isPaddingLine(line: string | undefined): boolean {
  return line !== undefined && paddingLinePattern.test(line);
}

function splitLines(content: string): string[] {
  const lines = withoutTrailingEndOfFileFiller(content).split(lineBreakPattern);
  while (isPaddingLine(lines.at(-1))) {
    lines.pop();
  }
  return lines;
}

function isInvalidCharacter(code: number): boolean {
  return !printableWindows1252Codes.has(code);
}

function hasInvalidCharacters(line: string): boolean {
  for (let index = 0; index < line.length; index++) {
    if (isInvalidCharacter(line.charCodeAt(index))) {
      return true;
    }
  }
  return false;
}

function expectedRecordType(index: number, lineCount: number): RecordTypeCode {
  if (index === 0) {
    return recordTypeCodes.header;
  }
  if (index === lineCount - 1) {
    return recordTypeCodes.trailer;
  }
  return recordTypeCodes.detail;
}

function readDetail(line: string, lineNumber: number): Receivable | Cnab444Issue {
  const invoiceAccessKey = readField(line, cnab444Layout.detail.invoiceAccessKey);
  if (!isAccessKeyFormatValid(invoiceAccessKey)) {
    return { code: "INVALID_ACCESS_KEY_FORMAT", lineNumber };
  }
  return { lineNumber, invoiceAccessKey, hasValidCheckDigit: hasValidCheckDigit(invoiceAccessKey) };
}

function checkTrailer(line: string, lineNumber: number, lineCount: number): Cnab444Issue | null {
  const recordCount = readField(line, cnab444Layout.trailer.recordCount).trim();
  if (!recordCountPattern.test(recordCount)) {
    return { code: "INVALID_RECORD_COUNT", lineNumber };
  }
  const declared = Number(recordCount);
  return declared === lineCount
    ? null
    : { code: "RECORD_COUNT_MISMATCH", lineNumber, declared, actual: lineCount };
}

function checkLine(
  line: string,
  index: number,
  lineCount: number,
): { issues: Cnab444Issue[]; receivable: Receivable | null } {
  const lineNumber = index + 1;
  const issues: Cnab444Issue[] = [];

  if (hasInvalidCharacters(line)) {
    issues.push({ code: "INVALID_CHARACTERS", lineNumber });
  }
  const hasExpectedLength = line.length === cnab444Layout.lineLength;
  if (!hasExpectedLength) {
    issues.push({
      code: "INVALID_LINE_LENGTH",
      lineNumber,
      expected: cnab444Layout.lineLength,
      actual: line.length,
    });
  }
  const expected = expectedRecordType(index, lineCount);
  const actual = readField(line, cnab444Layout.recordType);
  if (actual !== expected) {
    issues.push({ code: "UNEXPECTED_RECORD_TYPE", lineNumber, expected, actual });
    return { issues, receivable: null };
  }
  if (!hasExpectedLength) {
    return { issues, receivable: null };
  }

  if (expected === recordTypeCodes.detail) {
    const detail = readDetail(line, lineNumber);
    if ("code" in detail) {
      issues.push(detail);
      return { issues, receivable: null };
    }
    return { issues, receivable: detail };
  }
  if (expected === recordTypeCodes.trailer) {
    const trailerIssue = checkTrailer(line, lineNumber, lineCount);
    if (trailerIssue) {
      issues.push(trailerIssue);
    }
  }
  return { issues, receivable: null };
}

export function parseCnab444(content: string): Cnab444ParseResult {
  const lines = splitLines(content);
  if (lines.length === 0) {
    return { ok: false, errors: [{ code: "EMPTY_FILE" }], truncated: false };
  }

  const errors: Cnab444Issue[] = [];
  const receivables: Receivable[] = [];

  for (const [index, line] of lines.entries()) {
    const { issues, receivable } = checkLine(line, index, lines.length);
    errors.push(...issues);
    if (receivable) {
      receivables.push(receivable);
    }
  }
  if (lines.length < minimumLineCount) {
    errors.push({ code: "MISSING_DETAIL_RECORDS" });
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors: errors.slice(0, maxReportedIssues),
      truncated: errors.length > maxReportedIssues,
    };
  }
  return { ok: true, receivables, lines };
}
