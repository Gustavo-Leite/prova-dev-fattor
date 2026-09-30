import { assert, describe, expect, it } from "vitest";

import {
  hasValidCheckDigit,
  isAccessKeyFormatValid,
  splitAccessKey,
} from "@/domain/cnab/access-key";

const officialManualExampleKey = "52060433009911002506550120000007800267301615";
const alphanumericIssuerKey = "35260912ABC34501DE35550010000001231123456784";
const sampleFileKeys = [
  "35240300000000000199550010000000011234567890",
  "35240300000000000199550010000000021234567891",
  "35240300000000000199550010000000091234567898",
  "35240300000000000199550010000000101234567899",
];

describe("isAccessKeyFormatValid", () => {
  it.each([officialManualExampleKey, alphanumericIssuerKey, ...sampleFileKeys])(
    "accepts %s",
    (key) => {
      expect(isAccessKeyFormatValid(key)).toBe(true);
    },
  );

  it.each([
    ["too short", "5206043300991100250655012000000780026730161"],
    ["too long", "520604330099110025065501200000078002673016150"],
    ["blank", " ".repeat(44)],
    ["letter outside the issuer id", "5A060433009911002506550120000007800267301615"],
    ["letter in the issuer check digits", "352609000000000001A5550010000001231123456784"],
    ["lowercase letter in the issuer id", "35260912abc34501DE35550010000001231123456784"],
    ["surrounding whitespace", " 5206043300991100250655012000000780026730161"],
  ])("rejects a key that is %s", (_reason, key) => {
    expect(isAccessKeyFormatValid(key)).toBe(false);
  });
});

describe("hasValidCheckDigit", () => {
  it("matches the example from the official taxpayer manual", () => {
    expect(hasValidCheckDigit(officialManualExampleKey)).toBe(true);
  });

  it("converts letters of an alphanumeric issuer id before the modulo 11", () => {
    expect(hasValidCheckDigit(alphanumericIssuerKey)).toBe(true);
  });

  it("reads the digit expected for remainders 0 and 1 as zero", () => {
    expect(hasValidCheckDigit("35240300000000000199550010000000011234567890")).toBe(true);
  });

  it("agrees with the sample file, where only three keys are valid", () => {
    expect(sampleFileKeys.map(hasValidCheckDigit)).toEqual([true, false, true, true]);
  });

  it("rejects a key whose last digit was changed", () => {
    expect(hasValidCheckDigit("52060433009911002506550120000007800267301616")).toBe(false);
  });

  it("rejects a key with an invalid format", () => {
    expect(hasValidCheckDigit("5206043300991100250655012000000780026730161")).toBe(false);
  });
});

describe("splitAccessKey", () => {
  function withPrefix(prefix: string): string {
    return prefix + officialManualExampleKey.slice(prefix.length);
  }

  it("splits the official example into the fields of the manual", () => {
    expect(splitAccessKey(officialManualExampleKey)).toEqual({
      fields: {
        stateCode: "52",
        yearMonth: "0604",
        issuerId: "33009911002506",
        model: "55",
        series: "012",
        number: "000000780",
        emissionType: "0",
        randomCode: "26730161",
        checkDigit: "5",
      },
      stateAbbreviation: "GO",
      issuedMonth: { year: 2006, month: 4 },
      expectedCheckDigit: 5,
    });
  });

  it("keeps the letters of an alphanumeric issuer id", () => {
    expect(splitAccessKey(alphanumericIssuerKey)?.fields.issuerId).toBe("12ABC34501DE35");
  });

  it("computes the digit that would make an invalid key valid", () => {
    const [, invalidKey = ""] = sampleFileKeys;
    const parts = splitAccessKey(invalidKey);
    assert(parts);
    expect(String(parts.expectedCheckDigit)).not.toBe(parts.fields.checkDigit);
    expect(hasValidCheckDigit(invalidKey.slice(0, -1) + String(parts.expectedCheckDigit))).toBe(
      true,
    );
  });

  it.each(["520600", "520613"])("leaves the month of a key starting %s unread", (prefix) => {
    expect(splitAccessKey(withPrefix(prefix))?.issuedMonth).toBeNull();
  });

  it("reads January and December", () => {
    expect(splitAccessKey(withPrefix("522401"))?.issuedMonth).toEqual({ year: 2024, month: 1 });
    expect(splitAccessKey(withPrefix("522412"))?.issuedMonth).toEqual({ year: 2024, month: 12 });
  });

  it("leaves an unknown state code without abbreviation", () => {
    const parts = splitAccessKey(withPrefix("99"));
    expect(parts?.fields.stateCode).toBe("99");
    expect(parts?.stateAbbreviation).toBeNull();
  });

  it("knows the 27 state codes of the IBGE table", () => {
    const codes = [11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 35];
    const moreCodes = [41, 42, 43, 50, 51, 52, 53];
    const abbreviations = [...codes, ...moreCodes].map(
      (code) => splitAccessKey(withPrefix(String(code)))?.stateAbbreviation,
    );
    expect(new Set(abbreviations).size).toBe(27);
    expect(abbreviations).not.toContain(null);
  });

  it("refuses a key with an invalid format", () => {
    expect(splitAccessKey("5206043300991100250655012000000780026730161")).toBeNull();
  });
});
