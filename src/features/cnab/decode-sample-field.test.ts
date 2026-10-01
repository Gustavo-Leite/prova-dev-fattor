import { describe, expect, it } from "vitest";

import { decodeAmount, decodeDueDate } from "@/features/cnab/decode-sample-field";

function withPlainSpaces(text: string | null): string | null {
  return text?.replace(/\s/g, " ") ?? null;
}

describe("decodeDueDate", () => {
  it("formats DDMMYY as a long date in each locale", () => {
    expect(decodeDueDate("150425", "pt-BR")).toBe("15 de abril de 2025");
    expect(decodeDueDate("150425", "en")).toBe("April 15, 2025");
  });

  it.each(["", "15042", "1504255", "15A425", "320425", "150025", "151325", "290225"])(
    "rejects %j",
    (raw) => {
      expect(decodeDueDate(raw, "pt-BR")).toBeNull();
    },
  );
});

describe("decodeAmount", () => {
  it("reads 13 digits with two implied decimals as reais", () => {
    expect(withPlainSpaces(decodeAmount("0000000015000", "pt-BR"))).toBe("R$ 150,00");
    expect(decodeAmount("0000000015000", "en")).toBe("R$150.00");
    expect(withPlainSpaces(decodeAmount("0000012345678", "pt-BR"))).toBe("R$ 123.456,78");
  });

  it.each(["", "000000001500", "00000000150000", "00000000150,0", " 000000015000"])(
    "rejects %j",
    (raw) => {
      expect(decodeAmount(raw, "en")).toBeNull();
    },
  );
});
