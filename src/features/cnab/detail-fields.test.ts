import { describe, expect, it } from "vitest";

import { cnab444Layout, readField } from "@/domain/cnab/layout";
import type { DetailFieldId } from "@/features/cnab/detail-fields";
import { detailFields } from "@/features/cnab/detail-fields";
import { sampleDetailLine } from "@/features/cnab/sample-detail-line";

function sampleValue(id: DetailFieldId): string | undefined {
  const field = detailFields.find((candidate) => candidate.id === id);
  return field && readField(sampleDetailLine, field.position).trimEnd();
}

describe("detailFields", () => {
  it("are sorted, do not overlap and stay inside the line", () => {
    let previousEnd = 0;
    for (const { position } of detailFields) {
      expect(position.start).toBeGreaterThan(previousEnd);
      expect(position.end).toBeGreaterThanOrEqual(position.start);
      previousEnd = position.end;
    }
    expect(previousEnd).toBeLessThanOrEqual(cnab444Layout.lineLength);
  });

  it("have unique ids", () => {
    const ids = detailFields.map((field) => field.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reuse the domain layout for the stable columns", () => {
    const stable = detailFields.filter((field) => field.reliability === "stable");
    expect(stable.map((field) => field.id)).toEqual(["recordType", "invoiceAccessKey"]);
    expect(stable[0]?.position).toBe(cnab444Layout.recordType);
    expect(stable[1]?.position).toBe(cnab444Layout.detail.invoiceAccessKey);
  });

  it.each<[DetailFieldId, string]>([
    ["recordType", "1"],
    ["titleNumber", "10000000001"],
    ["titleNumberDigit", "P"],
    ["controlNumber", "CONTROLE1"],
    ["titleKind", "DUPLICATA MERCANTIL"],
    ["dueDate", "150425"],
    ["amount", "0000000015000"],
    ["payerDocument", "00000000000000"],
    ["payerName", "PAGADOR FAKE 1"],
    ["payerCity", "SAO PAULO"],
    ["payerPostalCode", "01310100"],
    ["payerState", "SP"],
    ["invoiceAccessKey", "35240300000000000199550010000000011234567890"],
  ])("read %s from the sample detail", (id, expected) => {
    expect(sampleValue(id)).toBe(expected);
  });
});
