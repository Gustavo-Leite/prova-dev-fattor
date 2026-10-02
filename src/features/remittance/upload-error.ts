import type { RemittanceRejection } from "@/domain/cnab/read-remittance";

export interface FileTooLargeError {
  readonly code: "FILE_TOO_LARGE";
  readonly maxBytes: number;
}

export type RemittanceUploadError =
  | { readonly code: "CROSS_SITE_REQUEST" }
  | { readonly code: "SESSION_EXPIRED" }
  | { readonly code: "LENGTH_REQUIRED" }
  | { readonly code: "INVALID_REQUEST" }
  | FileTooLargeError
  | RemittanceRejection;
