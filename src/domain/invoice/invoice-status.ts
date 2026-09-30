export const invoiceStatuses = [
  "authorized",
  "cancelled",
  "rejected",
  "denied",
  "not_found",
] as const;

export type InvoiceStatus = (typeof invoiceStatuses)[number];
