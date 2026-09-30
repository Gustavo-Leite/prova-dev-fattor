import { describe, expect, it } from "vitest";

import {
  formatIssuerId,
  groupAccessKey,
  withoutLeadingZeros,
} from "@/features/remittance/format-access-key";

describe("formatIssuerId", () => {
  it("masks a numeric CNPJ", () => {
    expect(formatIssuerId("33009911002506")).toBe("33.009.911/0025-06");
  });

  it("masks an alphanumeric CNPJ the same way", () => {
    expect(formatIssuerId("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
  });

  it("leaves a value of another length untouched", () => {
    expect(formatIssuerId("1234")).toBe("1234");
  });
});

describe("withoutLeadingZeros", () => {
  it.each([
    ["000000780", "780"],
    ["012", "12"],
    ["100", "100"],
    ["000", "0"],
  ])("turns %s into %s", (value, expected) => {
    expect(withoutLeadingZeros(value)).toBe(expected);
  });
});

describe("groupAccessKey", () => {
  it("groups the 44 characters in blocks of four", () => {
    expect(groupAccessKey("52060433009911002506550120000007800267301615")).toBe(
      "5206 0433 0099 1100 2506 5501 2000 0007 8002 6730 1615",
    );
  });
});
