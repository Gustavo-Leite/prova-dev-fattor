import type { FattorSituacao } from "@/infra/fattor/fattor-api.contract";

export type UpstreamStatusValue = FattorSituacao;

export function statusResponseBody(situacao: UpstreamStatusValue, chaveNfe: string) {
  return {
    status: "ativo",
    usuario: "demo@example.test",
    ambiente: "prova-dev",
    versao: "1.0.0",
    ultima_consulta: "2026-09-30T12:00:00.000Z",
    chave_nfe: chaveNfe,
    situacao,
  };
}

export function unknownStatusResponseBody() {
  return { situacao: "desconhecida" };
}
