import type { Receivable } from "@/domain/cnab/parse-cnab-444";
import type { RemittanceRejection } from "@/domain/cnab/read-remittance";
import { readRemittance } from "@/domain/cnab/read-remittance";
import type { FileTooLargeError } from "@/features/remittance/upload-error";

export interface RemittanceUploadLimits {
  readonly maxUploadBytes: number;
  readonly maxReceivables: number;
}

export type RemittanceFileRejection =
  | RemittanceRejection
  | FileTooLargeError
  | { readonly code: "MULTIPLE_FILES" }
  | { readonly code: "UNREADABLE_FILE" };

export type RemittanceFileValidation =
  | {
      readonly ok: true;
      readonly receivables: readonly Receivable[];
      readonly lines: readonly string[];
    }
  | { readonly ok: false; readonly rejection: RemittanceFileRejection };

export async function validateRemittanceFile(
  file: Pick<Blob, "size" | "arrayBuffer">,
  limits: RemittanceUploadLimits,
): Promise<RemittanceFileValidation> {
  if (file.size > limits.maxUploadBytes) {
    return { ok: false, rejection: { code: "FILE_TOO_LARGE", maxBytes: limits.maxUploadBytes } };
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, rejection: { code: "UNREADABLE_FILE" } };
  }
  return readRemittance(bytes, { maxReceivables: limits.maxReceivables });
}
