import { z } from "zod";

import type { InvoiceStatus } from "@/domain/invoice/invoice-status";

export const maxTokenLength = 4000;

const loginResponseSchema = z.object({
  token: z.string().min(1).max(maxTokenLength),
  expires_in: z.number().int().positive(),
});

const situacaoSchema = z.enum([
  "autorizada",
  "cancelada",
  "rejeitada",
  "denegada",
  "nao_encontrada",
]);

const statusResponseSchema = z.object({
  chave_nfe: z.string(),
  situacao: situacaoSchema,
});

const statusBySituacao = {
  autorizada: "authorized",
  cancelada: "cancelled",
  rejeitada: "rejected",
  denegada: "denied",
  nao_encontrada: "not_found",
} as const satisfies Record<z.infer<typeof situacaoSchema>, InvoiceStatus>;

export interface FattorCredentials {
  readonly email: string;
  readonly password: string;
}

export interface FattorLogin {
  readonly token: string;
  readonly expiresInSeconds: number;
}

export interface FattorInvoiceStatus {
  readonly invoiceAccessKey: string;
  readonly status: InvoiceStatus;
}

export function toLoginRequestBody(credentials: FattorCredentials): string {
  return JSON.stringify({ email: credentials.email, password: credentials.password });
}

export function parseLoginResponse(body: unknown): FattorLogin | null {
  const result = loginResponseSchema.safeParse(body);
  return result.success
    ? { token: result.data.token, expiresInSeconds: result.data.expires_in }
    : null;
}

export function parseStatusResponse(body: unknown): FattorInvoiceStatus | null {
  const result = statusResponseSchema.safeParse(body);
  return result.success
    ? {
        invoiceAccessKey: result.data.chave_nfe,
        status: statusBySituacao[result.data.situacao],
      }
    : null;
}
