export interface FieldPosition {
  readonly start: number;
  readonly end: number;
}

export const recordTypeCodes = {
  header: "0",
  detail: "1",
  trailer: "9",
} as const;

export type RecordTypeCode = (typeof recordTypeCodes)[keyof typeof recordTypeCodes];

export const cnab444Layout = {
  lineLength: 444,
  recordType: { start: 1, end: 1 },
  detail: {
    invoiceAccessKey: { start: 401, end: 444 },
  },
  trailer: {
    recordCount: { start: 393, end: 400 },
  },
} as const satisfies {
  lineLength: number;
  recordType: FieldPosition;
  detail: Record<string, FieldPosition>;
  trailer: Record<string, FieldPosition>;
};

export function readField(line: string, field: FieldPosition): string {
  return line.slice(field.start - 1, field.end);
}
