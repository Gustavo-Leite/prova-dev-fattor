import type { FieldPosition } from "@/domain/cnab/layout";
import { cnab444Layout } from "@/domain/cnab/layout";

export type DetailFieldReliability = "stable" | "observed";

export const detailFields = [
  { id: "recordType", position: cnab444Layout.recordType, reliability: "stable" },
  { id: "titleNumber", position: { start: 22, end: 32 }, reliability: "observed" },
  { id: "titleNumberDigit", position: { start: 33, end: 33 }, reliability: "observed" },
  { id: "controlNumber", position: { start: 34, end: 58 }, reliability: "observed" },
  { id: "titleKind", position: { start: 72, end: 96 }, reliability: "observed" },
  { id: "dueDate", position: { start: 97, end: 102 }, reliability: "observed" },
  { id: "amount", position: { start: 103, end: 115 }, reliability: "observed" },
  { id: "payerDocument", position: { start: 139, end: 152 }, reliability: "observed" },
  { id: "payerName", position: { start: 153, end: 247 }, reliability: "observed" },
  { id: "payerCity", position: { start: 248, end: 262 }, reliability: "observed" },
  { id: "payerPostalCode", position: { start: 263, end: 270 }, reliability: "observed" },
  { id: "payerState", position: { start: 279, end: 280 }, reliability: "observed" },
  {
    id: "invoiceAccessKey",
    position: cnab444Layout.detail.invoiceAccessKey,
    reliability: "stable",
  },
] as const satisfies readonly {
  readonly id: string;
  readonly position: FieldPosition;
  readonly reliability: DetailFieldReliability;
}[];

export type DetailField = (typeof detailFields)[number];

export type DetailFieldId = DetailField["id"];
