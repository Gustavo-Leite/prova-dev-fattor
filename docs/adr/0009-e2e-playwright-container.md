# 0009. E2E na imagem oficial do Playwright

- Status: Aceito
- Data: 2026-09-30
- Substitui: —
- Substituído por: —

Complementa o [0007](0007-quality-and-ci.md): o que bloqueia um merge não muda; muda como o job
`build-e2e` obtém o navegador.

## Contexto

O `build-e2e` instalava o Chromium com `playwright install --with-deps` a cada execução. Nos logs do
CI, o download do navegador leva ~9 s, mas as dependências do sistema (bibliotecas gráficas e fontes,
32 MB via apt) variam com o espelho do Ubuntu: 28 s numa execução e 158 s em outra (237 kB/s).
Build e testes levam ~22 s. O tempo do check obrigatório dependia de um espelho externo.

## Opções consideradas

- **Cache do navegador** — economiza ~9 s; o apt, que é a parte lenta, continua.
- **Sem `--with-deps`, usando as bibliotecas do runner** — o log mostra que faltam bibliotecas e
  fontes; quebraria sem aviso numa atualização do runner.
- **Chrome pré-instalado no runner (`channel: "chrome"`)** — sem instalação, mas a versão muda com
  o runner e deixa de ser a mesma do ambiente local; contraria a fixação de versões do 0007.
- **Job inteiro em `container:` com a imagem do Playwright** — a imagem não tem `unzip`, que o
  `setup-bun` usa para extrair o Bun; resolver isso traria o apt de volta ou um instalador próprio.
- **Só os testes na imagem do Playwright, via `docker run`** — sem apt e sem download do navegador.

## Decisão

Os testes E2E rodam na imagem oficial `mcr.microsoft.com/playwright`, na mesma versão do
`@playwright/test` e fixada por digest; o restante do job continua no runner.

- No runner: checkout, Node (`.nvmrc`), Bun (`packageManager`) e `bun install`, como no job
  `quality`.
- Na imagem: `bun run test:e2e` (build de produção e testes) com o Node 24 e o Chromium da imagem.
  O workspace e o binário do Bun são montados; só a variável `CI` entra no contêiner.
- Mesmo padrão do job `secrets` (gitleaks por `docker run` com digest).
- Atualizar o `@playwright/test` exige atualizar o digest da imagem. Se ficarem diferentes, o
  Playwright falha com mensagem explícita pedindo a atualização da imagem.

## Consequências

- (+) Sem apt e sem download do navegador: o tempo do job deixa de depender do espelho do Ubuntu.
- (+) CI e ambiente local usam a mesma versão do Chromium.
- (+) Substitui a consequência do 0007 "o E2E soma o download do navegador a cada execução".
- (−) A imagem tem ~1 GB comprimida e é baixada a cada execução.
- (−) Mais um artefato fixado por digest para atualizar manualmente.

## Evidências

- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
- Antes: etapa de instalação com 28 s e 158 s (log do apt: `Fetched 32.1 MB in 2min 16s`).
- Local: download da imagem em 27 s; build e 33 testes dentro da imagem em 17 s.
- Documentação do Playwright: "Continuous Integration" e "Docker".
