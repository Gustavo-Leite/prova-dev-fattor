import { readFileSync } from "node:fs";

import type { Route } from "@playwright/test";

import { samplePath } from "./support/locators";

const sampleLines = readFileSync(samplePath, "latin1").split("\n");

export interface StreamReceivable {
  readonly lineNumber: number;
  readonly key: string;
}

function receivablesOf(lines: readonly string[]): StreamReceivable[] {
  return lines
    .map((line, index) => ({ lineNumber: index + 1, key: line.slice(400, 444), type: line[0] }))
    .filter((line) => line.type === "1")
    .map(({ lineNumber, key }) => ({ lineNumber, key }));
}

export const sampleReceivables = receivablesOf(sampleLines);

const detailLines = sampleLines.filter((line) => line.startsWith("1"));
const headerLine = sampleLines[0] ?? "";
const trailerLine = sampleLines.find((line) => line.startsWith("9")) ?? "";

export function buildRemittance(detailCount: number) {
  const details = Array.from({ length: detailCount }, (_, index) => {
    const base = detailLines[index % detailLines.length] ?? "";
    return `${base.slice(0, 440)}${String(index + 1).padStart(4, "0")}`;
  });
  const recordCount = String(detailCount + 2).padStart(8, "0");
  const trailer = `${trailerLine.slice(0, 392)}${recordCount}${trailerLine.slice(400)}`;
  const lines = [headerLine, ...details, trailer];
  return {
    buffer: Buffer.from(`${lines.join("\n")}\n`, "latin1"),
    receivables: receivablesOf(lines),
  };
}

const sampleStatuses = [
  "authorized",
  "cancelled",
  "authorized",
  "rejected",
  "authorized",
  "denied",
  "authorized",
  "cancelled",
  "rejected",
  "authorized",
];

export type StreamLine = Record<string, unknown>;

export function resultLine(receivable: StreamReceivable, override: StreamLine = {}): StreamLine {
  return {
    type: "result",
    lineNumber: receivable.lineNumber,
    invoiceAccessKey: receivable.key,
    hasValidCheckDigit: [2, 10, 11].includes(receivable.lineNumber),
    outcome: "status",
    status: sampleStatuses[(receivable.lineNumber - 2) % sampleStatuses.length],
    ...override,
  };
}

export function sampleResult(lineNumber: number, override: StreamLine = {}): StreamLine {
  const receivable = sampleReceivables.find((item) => item.lineNumber === lineNumber);
  return resultLine(receivable ?? { lineNumber, key: "" }, override);
}

export function ndjson(lines: readonly StreamLine[]): string {
  return lines.map((line) => `${JSON.stringify(line)}\n`).join("");
}

export function fullStream(
  receivables: readonly StreamReceivable[] = sampleReceivables,
  overrides: Readonly<Record<number, StreamLine>> = {},
): string {
  return ndjson([
    { type: "started", total: receivables.length },
    ...receivables.map((receivable) => resultLine(receivable, overrides[receivable.lineNumber])),
    { type: "completed" },
  ]);
}

export function interruptedStream(
  receivables: readonly StreamReceivable[],
  resolvedCount: number,
): string {
  return ndjson([
    { type: "started", total: receivables.length },
    ...receivables.slice(0, resolvedCount).map((receivable) => resultLine(receivable)),
  ]);
}

export function fulfillStream(body: string) {
  return (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/x-ndjson; charset=utf-8", body });
}
