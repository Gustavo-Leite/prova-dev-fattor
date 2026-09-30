import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, expect, it } from "vitest";

import { decodeRemittance } from "@/domain/cnab/decode-remittance";
import { maxReportedIssues, parseCnab444 } from "@/domain/cnab/parse-cnab-444";

const sampleFilePath = path.join(import.meta.dirname, "../../../_prova/meu_cnab.rem");

const lineLength = 444;
const validKey = "35240300000000000199550010000000011234567890";
const keyWithInvalidCheckDigit = "35240300000000000199550010000000021234567891";
const alphanumericIssuerKey = "35260912ABC34501DE35550010000001231123456784";

function placeAt(line: string, start: number, value: string): string {
  return line.slice(0, start - 1) + value + line.slice(start - 1 + value.length);
}

function record(type: string): string {
  return type.padEnd(lineLength, " ");
}

function header(): string {
  return placeAt(record("0"), 5, "REMESSA");
}

function detail(key = validKey): string {
  return placeAt(record("1"), 401, key);
}

function trailer(recordCount: number, start = 393): string {
  return placeAt(record("9"), start, String(recordCount).padStart(6, "0"));
}

function remittance(details: string[]): string[] {
  return [header(), ...details, trailer(details.length + 2)];
}

function toFile(lines: string[], lineBreak = "\n"): string {
  return lines.join(lineBreak) + lineBreak;
}

describe("parseCnab444 with the sample file", () => {
  const result = parseCnab444(decodeRemittance(readFileSync(sampleFilePath)));

  it("extracts one receivable per detail record, in file order", () => {
    assert(result.ok);
    expect(result.receivables.map((receivable) => receivable.lineNumber)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(result.receivables[0]?.invoiceAccessKey).toBe(validKey);
    expect(result.receivables[9]?.invoiceAccessKey).toBe(
      "35240300000000000199550010000000101234567899",
    );
  });

  it("reads the key from columns 401–444 even on the shifted detail record", () => {
    assert(result.ok);
    expect(result.receivables[1]?.invoiceAccessKey).toBe(keyWithInvalidCheckDigit);
  });

  it("flags the check digit per receivable instead of rejecting the file", () => {
    assert(result.ok);
    expect(
      result.receivables
        .filter((receivable) => receivable.hasValidCheckDigit)
        .map((receivable) => receivable.lineNumber),
    ).toEqual([2, 10, 11]);
  });
});

describe("parseCnab444 input normalization", () => {
  const validLines = remittance([detail()]);

  it.each([
    ["LF", toFile(validLines)],
    ["CRLF", toFile(validLines, "\r\n")],
    ["mixed line breaks", `${validLines.slice(0, 2).join("\r\n")}\n${validLines[2] ?? ""}\r\n`],
    ["no final line break", validLines.join("\n")],
    ["empty lines after the trailer", `${toFile(validLines)}\n\r\n`],
    ["whitespace-only lines after the trailer", `${toFile(validLines)}   \n \r\n`],
  ])("accepts a file with %s", (_description, content) => {
    expect(parseCnab444(content)).toEqual({
      ok: true,
      receivables: [{ lineNumber: 2, invoiceAccessKey: validKey, hasValidCheckDigit: true }],
    });
  });

  it.each([
    ["no content", ""],
    ["only a line break", "\n"],
    ["only whitespace", "   \r\n  "],
  ])("reports an empty file for %s", (_description, content) => {
    expect(parseCnab444(content)).toEqual({
      ok: false,
      errors: [{ code: "EMPTY_FILE" }],
      truncated: false,
    });
  });

  it("accepts accented characters outside the key", () => {
    const withAccents = placeAt(detail(), 153, "JOSÉ DA CONCEIÇÃO");
    expect(parseCnab444(toFile(remittance([withAccents]))).ok).toBe(true);
  });
});

describe("parseCnab444 structure errors", () => {
  it("reports every line of a CNAB 400 file with its actual length", () => {
    const cnab400 = remittance([detail()]).map((line) => line.slice(0, 400));
    expect(parseCnab444(toFile(cnab400))).toEqual({
      ok: false,
      errors: [1, 2, 3].map((lineNumber) => ({
        code: "INVALID_LINE_LENGTH",
        lineNumber,
        expected: lineLength,
        actual: 400,
      })),
      truncated: false,
    });
  });

  it("reports a short line and keeps reading the others", () => {
    const lines = remittance([detail().slice(0, 300), detail()]);
    expect(parseCnab444(toFile(lines))).toEqual({
      ok: false,
      errors: [{ code: "INVALID_LINE_LENGTH", lineNumber: 2, expected: lineLength, actual: 300 }],
      truncated: false,
    });
  });

  it("reports a blank line in the middle of the file", () => {
    const lines = remittance([detail(), "", detail()]);
    expect(parseCnab444(toFile(lines))).toEqual({
      ok: false,
      errors: [
        { code: "INVALID_LINE_LENGTH", lineNumber: 3, expected: lineLength, actual: 0 },
        { code: "UNEXPECTED_RECORD_TYPE", lineNumber: 3, expected: "1", actual: "" },
      ],
      truncated: false,
    });
  });

  it("reports lines separated only by carriage returns as one invalid line", () => {
    expect(parseCnab444(remittance([detail()]).join("\r"))).toEqual({
      ok: false,
      errors: [
        { code: "INVALID_CHARACTERS", lineNumber: 1 },
        {
          code: "INVALID_LINE_LENGTH",
          lineNumber: 1,
          expected: lineLength,
          actual: lineLength * 3 + 2,
        },
        { code: "MISSING_DETAIL_RECORDS" },
      ],
      truncated: false,
    });
  });

  it.each([
    ["a null character", "\u0000"],
    ["a tab", "\t"],
    ["a delete character", "\u007F"],
    ["a C1 control character", "\u0085"],
  ])("reports a line containing %s", (_description, character) => {
    const lines = remittance([placeAt(detail(), 200, character)]);
    expect(parseCnab444(toFile(lines))).toEqual({
      ok: false,
      errors: [{ code: "INVALID_CHARACTERS", lineNumber: 2 }],
      truncated: false,
    });
  });

  it("reports a file that does not start with a header", () => {
    const lines = [detail(), detail(), trailer(3)];
    expect(parseCnab444(toFile(lines))).toEqual({
      ok: false,
      errors: [{ code: "UNEXPECTED_RECORD_TYPE", lineNumber: 1, expected: "0", actual: "1" }],
      truncated: false,
    });
  });

  it("reports a file that does not end with a trailer", () => {
    const lines = [header(), detail(), detail()];
    expect(parseCnab444(toFile(lines))).toEqual({
      ok: false,
      errors: [{ code: "UNEXPECTED_RECORD_TYPE", lineNumber: 3, expected: "9", actual: "1" }],
      truncated: false,
    });
  });

  it("reports an unsupported record type between header and trailer", () => {
    const lines = remittance([detail(), record("2")]);
    expect(parseCnab444(toFile(lines))).toEqual({
      ok: false,
      errors: [{ code: "UNEXPECTED_RECORD_TYPE", lineNumber: 3, expected: "1", actual: "2" }],
      truncated: false,
    });
  });

  it("reports a file with a header and a trailer but no detail records", () => {
    expect(parseCnab444(toFile([header(), trailer(2)]))).toEqual({
      ok: false,
      errors: [{ code: "MISSING_DETAIL_RECORDS" }],
      truncated: false,
    });
  });

  it("reports a file with a single line", () => {
    expect(parseCnab444(toFile([header()]))).toEqual({
      ok: false,
      errors: [{ code: "MISSING_DETAIL_RECORDS" }],
      truncated: false,
    });
  });
});

describe("parseCnab444 trailer record count", () => {
  it.each([
    ["the sample file position (393–398)", 393],
    ["the reference layout position (395–400)", 395],
  ])("accepts the count at %s", (_description, start) => {
    const lines = [header(), detail(), trailer(3, start)];
    expect(parseCnab444(toFile(lines)).ok).toBe(true);
  });

  it("reports a count that does not match the number of lines", () => {
    const lines = [header(), detail(), trailer(5)];
    expect(parseCnab444(toFile(lines))).toEqual({
      ok: false,
      errors: [{ code: "RECORD_COUNT_MISMATCH", lineNumber: 3, declared: 5, actual: 3 }],
      truncated: false,
    });
  });

  it.each([
    ["blank", record("9")],
    ["not numeric", placeAt(record("9"), 393, "00001A")],
    ["split by spaces", placeAt(record("9"), 393, "0 0003")],
  ])("reports a count that is %s", (_description, trailerLine) => {
    expect(parseCnab444(toFile([header(), detail(), trailerLine]))).toEqual({
      ok: false,
      errors: [{ code: "INVALID_RECORD_COUNT", lineNumber: 3 }],
      truncated: false,
    });
  });

  it("does not read the count from a trailer with the wrong length", () => {
    const lines = [header(), detail(), trailer(99).slice(0, 420)];
    expect(parseCnab444(toFile(lines))).toEqual({
      ok: false,
      errors: [{ code: "INVALID_LINE_LENGTH", lineNumber: 3, expected: lineLength, actual: 420 }],
      truncated: false,
    });
  });

  it("rejects the layout variant with the key at 395–438 through the trailer", () => {
    const variantDetail = placeAt(placeAt(record("1"), 395, validKey), 439, "000002");
    const variantTrailer = placeAt(record("9"), 439, "000003");
    expect(parseCnab444(toFile([header(), variantDetail, variantTrailer]))).toEqual({
      ok: false,
      errors: [{ code: "INVALID_RECORD_COUNT", lineNumber: 3 }],
      truncated: false,
    });
  });
});

describe("parseCnab444 invoice access keys", () => {
  it.each([
    ["blank, as in a CNAB 400 line padded to 444", " ".repeat(44)],
    ["with a letter outside the issuer id", `A${validKey.slice(1)}`],
    ["shifted by one column", ` ${validKey.slice(0, 43)}`],
  ])("reports a key that is %s", (_description, key) => {
    expect(parseCnab444(toFile(remittance([detail(key)])))).toEqual({
      ok: false,
      errors: [{ code: "INVALID_ACCESS_KEY_FORMAT", lineNumber: 2 }],
      truncated: false,
    });
  });

  it("accepts a key issued by an alphanumeric CNPJ", () => {
    expect(parseCnab444(toFile(remittance([detail(alphanumericIssuerKey)])))).toEqual({
      ok: true,
      receivables: [
        { lineNumber: 2, invoiceAccessKey: alphanumericIssuerKey, hasValidCheckDigit: true },
      ],
    });
  });

  it("keeps repeated keys, since one invoice can back several installments", () => {
    const result = parseCnab444(toFile(remittance([detail(), detail()])));
    assert(result.ok);
    expect(result.receivables.map((receivable) => receivable.invoiceAccessKey)).toEqual([
      validKey,
      validKey,
    ]);
  });
});

describe("parseCnab444 error collection", () => {
  it("collects errors from different lines in line order", () => {
    const lines = [detail(), detail(" ".repeat(44)), trailer(9)];
    expect(parseCnab444(toFile(lines))).toEqual({
      ok: false,
      errors: [
        { code: "UNEXPECTED_RECORD_TYPE", lineNumber: 1, expected: "0", actual: "1" },
        { code: "INVALID_ACCESS_KEY_FORMAT", lineNumber: 2 },
        { code: "RECORD_COUNT_MISMATCH", lineNumber: 3, declared: 9, actual: 3 },
      ],
      truncated: false,
    });
  });

  it.each([
    [maxReportedIssues, false],
    [maxReportedIssues + 1, true],
  ])(
    "reports the earliest errors when there are %i of them (truncated: %s)",
    (count, truncated) => {
      const shortLines = Array.from({ length: count }, () => "1");
      const result = parseCnab444(toFile(remittance(shortLines)));
      assert(!result.ok);
      expect(result.errors).toHaveLength(maxReportedIssues);
      expect(result.truncated).toBe(truncated);
      expect(result.errors[0]).toEqual({
        code: "INVALID_LINE_LENGTH",
        lineNumber: 2,
        expected: lineLength,
        actual: 1,
      });
    },
  );
});
