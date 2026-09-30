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
const recordCountPattern = /^\d{1,8}$/;
const minimumLineCount = 3;

function splitLines(content: string): string[] {
  const lines = content.split(lineBreakPattern);
  while (lines.at(-1)?.trim() === "") {
    lines.pop();
  }
  return lines;
}

function isControlCharacter(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

function hasControlCharacters(line: string): boolean {
  for (let index = 0; index < line.length; index++) {
    if (isControlCharacter(line.charCodeAt(index))) {
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

  if (hasControlCharacters(line)) {
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
  if (content.trim() === "") {
    return { ok: false, errors: [{ code: "EMPTY_FILE" }], truncated: false };
  }

  const lines = splitLines(content);
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
