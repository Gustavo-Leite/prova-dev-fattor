# 0006. Ambiente do servidor

- Status: Aceito
- Data: 2026-09-30
- Substitui: —
- Substituído por: —

## Contexto

O backend autentica na API de status com credenciais. Um valor padrão escrito no código
(`process.env.X || "senha"`) vaza a credencial e mascara uma configuração ausente. A API não envia
cabeçalhos CORS, então as chamadas acontecem no servidor, que é onde as credenciais precisam ficar.

## Opções consideradas

- **Ler `process.env` onde for usado** — simples; erros de configuração aparecem só na primeira
  requisição e sem mensagem clara.
- **Validar ao importar o módulo** — falha cedo; quebra o `next build` em qualquer ambiente sem as
  variáveis (um build de imagem, um clone novo).
- **Validar na inicialização do servidor** — falha cedo sem afetar o build.

## Decisão

As variáveis do servidor são validadas com Zod quando o servidor inicia, sem nenhum valor padrão, e
o processo encerra com código 1 se estiverem inválidas.

- A URL da API aceita apenas HTTPS, sem credenciais, query ou fragmento, e é normalizada.
- A mensagem de erro diz qual variável falhou e o motivo, com uma instrução geral de correção,
  nunca o valor.
- A validação roda no `register()` de `instrumentation.ts`, só no runtime Node.
- Os módulos com segredo importam `server-only`: importá-los no cliente quebra o build.
- As credenciais de demonstração, públicas na documentação da API, ficam apenas no `.env.example`.

## Consequências

- (+) Configuração errada é detectada ao subir, com mensagem acionável.
- (+) Credenciais nunca entram no bundle do navegador.
- (−) Rodar o projeto exige copiar o `.env.example` para `.env`.

## Evidências

- [`src/infra/env.ts`](../../src/infra/env.ts), [`src/infra/startup.ts`](../../src/infra/startup.ts),
  [`src/instrumentation.ts`](../../src/instrumentation.ts), [`.env.example`](../../.env.example).
- Commit `4081e5e`.
- Documentação: Next.js — `instrumentation.ts` e variáveis de ambiente.
