import { describe, expect, it } from "vitest";

import { decodeRemittance } from "@/domain/cnab/decode-remittance";

function bytesOf(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

describe("decodeRemittance", () => {
  it("maps every byte to exactly one character", () => {
    const allBytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    expect(decodeRemittance(allBytes)).toHaveLength(256);
  });

  it("keeps a multibyte UTF-8 sequence as separate columns", () => {
    expect(decodeRemittance(bytesOf(0x53, 0xc3, 0xa7))).toBe("SÃ§");
  });

  it("decodes accented Latin-1 text as windows-1252", () => {
    expect(decodeRemittance(bytesOf(0x4a, 0x4f, 0x53, 0xc9, 0x80))).toBe("JOSÉ€");
  });

  it("turns bytes undefined in windows-1252 into control characters", () => {
    expect(decodeRemittance(bytesOf(0x81, 0x8d, 0x8f, 0x90, 0x9d))).toBe(
      "\u0081\u008d\u008f\u0090\u009d",
    );
  });

  it("removes a UTF-8 byte order mark at the start", () => {
    expect(decodeRemittance(bytesOf(0xef, 0xbb, 0xbf, 0x30, 0x0a))).toBe("0\n");
  });

  it("keeps the byte order mark bytes anywhere else", () => {
    expect(decodeRemittance(bytesOf(0x30, 0xef, 0xbb, 0xbf))).toBe("0ï»¿");
  });

  it("keeps a partial byte order mark at the start", () => {
    expect(decodeRemittance(bytesOf(0xef, 0xbb, 0x30))).toBe("ï»0");
  });

  it("decodes an empty file as an empty string", () => {
    expect(decodeRemittance(new Uint8Array())).toBe("");
  });
});
