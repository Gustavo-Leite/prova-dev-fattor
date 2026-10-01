import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, expect, it } from "vitest";

import { cnab444Layout } from "@/domain/cnab/layout";
import { readRemittance } from "@/domain/cnab/read-remittance";

const sampleFile = new Uint8Array(
  readFileSync(path.join(import.meta.dirname, "../../../_prova/meu_cnab.rem")),
);

describe("readRemittance", () => {
  it("returns the receivables of a valid file", () => {
    const reading = readRemittance(sampleFile, { maxReceivables: 200 });
    assert(reading.ok);
    expect(reading.receivables).toHaveLength(10);
  });

  it("counts one column per byte, even for bytes that UTF-8 would merge", () => {
    const withLatin1Bytes = sampleFile.slice();
    const firstDetailOffset = cnab444Layout.lineLength + 1;
    const payerNameColumn = 153;
    withLatin1Bytes.set([0xc3, 0xa7], firstDetailOffset + payerNameColumn - 1);

    const reading = readRemittance(withLatin1Bytes, { maxReceivables: 200 });
    assert(reading.ok);
    expect(reading.receivables).toHaveLength(10);
  });

  it("rejects a file the parser does not accept, keeping the parser errors", () => {
    expect(readRemittance(new TextEncoder().encode("oops\n"), { maxReceivables: 200 })).toEqual({
      ok: false,
      rejection: {
        code: "INVALID_FILE",
        errors: [
          { code: "INVALID_LINE_LENGTH", lineNumber: 1, expected: 444, actual: 4 },
          { code: "UNEXPECTED_RECORD_TYPE", lineNumber: 1, expected: "0", actual: "o" },
          { code: "MISSING_DETAIL_RECORDS" },
        ],
        truncated: false,
      },
    });
  });

  it.each([
    [10, true],
    [9, false],
  ])("with a limit of %i receivables, accepts the 10 of the sample: %s", (max, accepted) => {
    const reading = readRemittance(sampleFile, { maxReceivables: max });
    if (accepted) {
      expect(reading.ok).toBe(true);
    } else {
      expect(reading).toEqual({
        ok: false,
        rejection: { code: "TOO_MANY_RECEIVABLES", max, actual: 10 },
      });
    }
  });

  it.each([0, -1, 1.5, Number.NaN])("refuses the invalid limit %s", (max) => {
    expect(() => readRemittance(sampleFile, { maxReceivables: max })).toThrow(RangeError);
  });
});
