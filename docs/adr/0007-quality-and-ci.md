# 0007. Qualidade e integração contínua

- Status: Aceito
- Data: 2026-09-30
- Substitui: —
- Substituído por: —

## Contexto

A `main` só recebe código por pull request. Verificações locais podem ser puladas e só olham os
arquivos alterados; a garantia precisa estar no CI. Este ADR responde a uma pergunta: **o que
bloqueia um merge**.

## Opções consideradas

- **Só testes unitários** — cobrem o parser e a API, que são o pedido do desafio; não provam que a
  página funciona nem que é acessível.
- **Unitários e E2E enxuto** — prova o entregável no navegador com custo controlado.
- **Um job sequencial ou vários workflows** — um job é lento e esconde a falha; vários workflows
  multiplicam os checks exigidos sem ganho.

## Decisão

Um merge exige três checks: `quality` (formatação, lint, tipos e testes unitários), `build-e2e`
(build de produção e testes E2E com axe) e `secrets` (varredura de segredos no histórico).

- Vitest para unidades; Playwright só com Chromium (desktop e celular) contra o build de produção,
  com axe WCAG 2.2 AA nos temas claro e escuro.
- Localmente, Husky, lint-staged e commitlint dão retorno rápido; não substituem o CI.
- Actions fixadas por SHA, token sem persistência, permissão só de leitura.
- gitleaks (CLI, licença MIT) em container fixado por digest, no histórico completo.
- Sem Dependabot: o projeto tem vida curta e PRs automáticos sem merge fariam o repositório parecer
  abandonado; em vez disso, os alertas de vulnerabilidade do GitHub devem ser ativados nas
  configurações do repositório.
- Checks obrigatórios não dependem da API externa real.

## Consequências

- (+) Fluxo principal, acessibilidade e segredos verificados antes de todo merge.
- (−) O E2E soma um build e o download do navegador a cada execução.
- (−) Actions e a imagem do gitleaks são atualizadas manualmente.

## Evidências

- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml),
  [`playwright.config.ts`](../../playwright.config.ts), [`vitest.config.mts`](../../vitest.config.mts),
  [`lint-staged.config.mjs`](../../lint-staged.config.mjs).
- Commits `1f0f433`, `b0268df`, `ec0029c` e `ce50231`.
