# 0002. Arquitetura em camadas verificada por lint

- Status: Aceito
- Data: 2026-09-30
- Substitui: —
- Substituído por: —

## Contexto

O núcleo do problema (ler um CNAB 444 e consultar a situação de cada nota) não depende de
framework. Queremos reaproveitar o parser e o caso de uso fora da interface, testá-los sem mocks
de infraestrutura e impedir que código com segredos chegue ao navegador. Convenções de pasta sem
verificação se degradam com o tempo.

## Opções consideradas

- **Pastas por tipo sem regras** — simples; nada impede um componente de importar o cliente da
  API com credenciais.
- **`no-restricted-imports` do ESLint** — sem dependência nova; só compara o texto do import, então
  um caminho relativo como `../../infra/env` escapa.
- **`eslint-plugin-boundaries`** — resolve o caminho real de cada import (alias ou relativo) e
  classifica os arquivos por camada.

## Decisão

O código fica em camadas cujas dependências apontam para dentro, e o `eslint-plugin-boundaries`
reprova qualquer import que viole essa direção.

- `domain` não importa outras camadas, React, Next.js nem módulos do Node.
- `application` depende de `domain`; `infra` implementa os adapters; `app` é a raiz de composição.
- `features` e `components` nunca importam `infra`. `features` pode importar `domain` e só tipos
  (`import type`) de `application`; `components` pode importar só tipos de `domain`.
- Arquivos fora de qualquer camada não podem ser alvo de import, exceto a partir de `app` e dos
  testes.
- Os caminhos da configuração são ancorados no diretório do projeto, para o resultado ser o mesmo
  no terminal, no editor e no CI.

## Consequências

- (+) A regra de arquitetura falha no lint, não na revisão humana.
- (+) Uma pasta nova precisa ser declarada como camada para ser usada, o que força a decisão.
- (−) Configuração de lint mais extensa, que precisa de testes de prova ao mudar.

## Evidências

- [`eslint.config.mjs`](../../eslint.config.mjs) (elementos e políticas do `boundaries`).
- Commits `ab8895f` (regras de camadas), `8feeb92` (caminhos ancorados na raiz do projeto) e
  `bf28928` (camada `i18n`).
