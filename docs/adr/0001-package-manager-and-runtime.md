# 0001. Gerenciador de pacotes e runtime

- Status: Aceito
- Data: 2026-09-29
- Substitui: —
- Substituído por: —

## Contexto

O desafio deixa a stack livre; a vaga cita Bun como diferencial. Em setembro de 2026 o Bun 1.4
acabara de ser reescrito de Zig para Rust, com mudanças incompatíveis; o runtime Bun na Vercel
estava em beta e havia falha de build conhecida do Next.js
16.3 com o runtime Bun nesse ambiente.

## Opções consideradas

- **Bun como gerenciador e como runtime** — instalação e execução mais rápidas; expõe o projeto a
  um runtime recém-reescrito e ainda em beta no deploy.
- **Bun só como gerenciador, Node.js como runtime** — instalação rápida e lockfile do Bun; execução
  no runtime mais estável do ecossistema Next.js.
- **npm ou pnpm** — maduros; não mostram o diferencial pedido pela vaga.

## Decisão

Bun 1.3.14 gerencia pacotes e scripts; o código roda em Node.js 24 LTS em desenvolvimento, build,
CI e produção.

- A versão do Bun fica fixada em `packageManager`; a do Node, em `.nvmrc` e `engines`.
- Nunca usar `bun --bun`: os scripts executam os binários com Node.
- Foi escolhida a última versão da linha 1.3, anterior à reescrita.

## Consequências

- (+) Instalação rápida sem apostar a estabilidade da aplicação num runtime novo.
- (+) Trocar para o runtime Bun no futuro é uma mudança de configuração, não de código.
- (−) Dois executáveis no ambiente (Bun e Node), inclusive no CI e, futuramente, na imagem Docker.

## Evidências

- [`package.json`](../../package.json) (`packageManager`, `engines`), [`.nvmrc`](../../.nvmrc).
- Commit `185a966` (scaffold com Bun).
- Documentação: [Bun 1.4](https://bun.com/blog/bun-v1.4);
  [Vercel — Bun runtime](https://vercel.com/docs/functions/runtimes/bun).
