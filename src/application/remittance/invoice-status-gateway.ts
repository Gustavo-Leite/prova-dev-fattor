import type { InvoiceStatus } from "@/domain/invoice/invoice-status";

export type LookupFailureReason =
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_REJECTED_CREDENTIALS"
  | "UPSTREAM_INVALID_RESPONSE";

export class InvoiceStatusLookupError extends Error {
  override readonly name = "InvoiceStatusLookupError";

  constructor(
    readonly reason: LookupFailureReason,
    options?: ErrorOptions,
  ) {
    super(reason, options);
  }
}

export interface InvoiceStatusGateway {
  findStatus(invoiceAccessKey: string, signal: AbortSignal): Promise<InvoiceStatus>;
}
