import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { cnab444Layout } from "@/domain/cnab/layout";
import { sampleDetailLine } from "@/features/cnab/sample-detail-line";

const sampleLines = readFileSync(
  path.join(import.meta.dirname, "../../../_prova/meu_cnab.rem"),
  "latin1",
).split(/\r?\n/);

describe("sampleDetailLine", () => {
  it("is the first detail record of the challenge file, byte for byte", () => {
    expect(sampleDetailLine).toBe(sampleLines[1]);
  });

  it("has the length of a CNAB 444 line", () => {
    expect(sampleDetailLine).toHaveLength(cnab444Layout.lineLength);
  });
});
