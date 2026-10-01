import { describe, expect, it } from "vitest";

import {
  csvByteOrderMark,
  csvDelimiterFor,
  toCsv,
  toRemittanceCsvRecords,
} from "@/features/remittance/export-csv";
import type { ReceivableRow } from "@/features/remittance/remittance-check-state";

function body(csv: string): string {
  return csv.slice(csvByteOrderMark.length);
}

describe("toCsv", () => {
  it("starts with a byte order mark so spreadsheets read UTF-8", () => {
    const csv = toCsv(["Situação"], [], { delimiter: ";" });
    expect(csv.codePointAt(0)).toBe(0xfeff);
    expect(body(csv)).toBe("Situação");
  });

  it("separates records with CRLF and has no trailing line break", () => {
    const csv = toCsv(["a", "b"], [["c", "d"]], { delimiter: "," });
    expect(body(csv)).toBe("a,b\r\nc,d");
  });

  it("joins cells with the requested delimiter", () => {
    expect(body(toCsv(["a", "b"], [], { delimiter: ";" }))).toBe("a;b");
    expect(body(toCsv(["a", "b"], [], { delimiter: "," }))).toBe("a,b");
  });

  it("quotes cells with the delimiter and doubles inner quotes", () => {
    const csv = toCsv(["x"], [["Falhou; tente"], ['diz "oi"'], ["a,b"]], { delimiter: ";" });
    expect(body(csv)).toBe('x\r\n"Falhou; tente"\r\n"diz ""oi"""\r\na,b');
  });

  it("quotes a comma only when it is the delimiter", () => {
    expect(body(toCsv(["a,b"], [], { delimiter: "," }))).toBe('"a,b"');
  });

  it("quotes cells with line breaks", () => {
    const csv = toCsv(["x"], [["one\ntwo"], ["one\rtwo"]], { delimiter: "," });
    expect(body(csv)).toBe('x\r\n"one\ntwo"\r\n"one\rtwo"');
  });

  it.each(["=SUM(A1)", "+1", "-1", "@cmd", "\tx"])("neutralizes the formula in text %j", (text) => {
    expect(body(toCsv(["x"], [[text]], { delimiter: ";" }))).toBe(`x\r\n'${text}`);
  });

  it("neutralizes a formula that also needs quotes", () => {
    expect(body(toCsv(["x"], [["\rx"]], { delimiter: ";" }))).toBe(`x\r\n"'\rx"`);
    expect(body(toCsv(["x"], [["=1;2"]], { delimiter: ";" }))).toBe(`x\r\n"'=1;2"`);
  });

  it("leaves text alone when the trigger is not the first character", () => {
    expect(body(toCsv(["x"], [["a=b"], ["1-2"], ["x@y"]], { delimiter: ";" }))).toBe(
      "x\r\na=b\r\n1-2\r\nx@y",
    );
  });

  it("keeps numbers as they are, even negative ones", () => {
    expect(body(toCsv(["n"], [[-1], [42]], { delimiter: "," }))).toBe("n\r\n-1\r\n42");
  });

  it("protects the header too", () => {
    expect(body(toCsv(["=x"], [], { delimiter: "," }))).toBe("'=x");
  });
});

describe("csvDelimiterFor", () => {
  it("uses a semicolon in Portuguese, where the comma is the decimal separator", () => {
    expect(csvDelimiterFor("pt-BR")).toBe(";");
  });

  it("uses a comma in English", () => {
    expect(csvDelimiterFor("en")).toBe(",");
  });
});

describe("toRemittanceCsvRecords", () => {
  const key = "35240312345678000190550010000000011000000014";
  const rows: ReceivableRow[] = [
    {
      lineNumber: 2,
      ordinal: 1,
      invoiceAccessKey: key,
      hasValidCheckDigit: true,
      state: { kind: "status", status: "denied" },
    },
    {
      lineNumber: 3,
      ordinal: 2,
      invoiceAccessKey: key,
      hasValidCheckDigit: true,
      state: { kind: "pending" },
    },
  ];

  it("maps each row to ordinal, file line, grouped key and status label", () => {
    const records = toRemittanceCsvRecords(rows, (row) =>
      row.state.kind === "pending" ? "Não consultado" : "Denegada",
    );
    expect(records).toEqual([
      [1, 2, "3524 0312 3456 7800 0190 5500 1000 0000 0110 0000 0014", "Denegada"],
      [2, 3, "3524 0312 3456 7800 0190 5500 1000 0000 0110 0000 0014", "Não consultado"],
    ]);
  });

  it("writes the grouped key as plain text, in 11 groups and without protection", () => {
    const csv = toCsv(
      ["Nº", "Linha", "Chave", "Situação"],
      toRemittanceCsvRecords(rows.slice(0, 1), () => "Denegada"),
      { delimiter: ";" },
    );
    const [, record = ""] = body(csv).split("\r\n");
    const [ordinal, line, groupedKey = "", status] = record.split(";");
    expect([ordinal, line, status]).toEqual(["1", "2", "Denegada"]);
    expect(groupedKey.split(" ")).toHaveLength(11);
    expect(groupedKey.replaceAll(" ", "")).toBe(key);
    expect(groupedKey.startsWith("'")).toBe(false);
  });
});
