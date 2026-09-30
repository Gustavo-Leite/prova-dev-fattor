import { decodeRemittance } from "@/domain/cnab/decode-remittance";
import type { Cnab444Issue, Receivable } from "@/domain/cnab/parse-cnab-444";
import { parseCnab444 } from "@/domain/cnab/parse-cnab-444";

export type RemittanceRejection =
  | {
      readonly code: "INVALID_FILE";
      readonly errors: readonly Cnab444Issue[];
      readonly truncated: boolean;
    }
  | { readonly code: "TOO_MANY_RECEIVABLES"; readonly max: number; readonly actual: number };

export type RemittanceReading =
  | {
      readonly ok: true;
      readonly receivables: readonly Receivable[];
      readonly lines: readonly string[];
    }
  | { readonly ok: false; readonly rejection: RemittanceRejection };

export interface RemittanceReadingLimits {
  readonly maxReceivables: number;
}

export function readRemittance(
  bytes: Uint8Array,
  limits: RemittanceReadingLimits,
): RemittanceReading {
  if (!Number.isInteger(limits.maxReceivables) || limits.maxReceivables < 1) {
    throw new RangeError(`Invalid receivable limit: ${String(limits.maxReceivables)}`);
  }
  const parsed = parseCnab444(decodeRemittance(bytes));
  if (!parsed.ok) {
    return {
      ok: false,
      rejection: { code: "INVALID_FILE", errors: parsed.errors, truncated: parsed.truncated },
    };
  }
  const { receivables, lines } = parsed;
  if (receivables.length > limits.maxReceivables) {
    return {
      ok: false,
      rejection: {
        code: "TOO_MANY_RECEIVABLES",
        max: limits.maxReceivables,
        actual: receivables.length,
      },
    };
  }
  return { ok: true, receivables, lines };
}
