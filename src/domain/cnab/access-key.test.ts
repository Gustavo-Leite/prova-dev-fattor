import { describe, expect, it } from "vitest";

import { hasValidCheckDigit, isAccessKeyFormatValid } from "@/domain/cnab/access-key";

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
