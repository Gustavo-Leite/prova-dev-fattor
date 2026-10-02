# 0017. Estado da consulta no layout do grupo `(app)`

- Status: Aceito
- Data: 2026-10-01
- Substitui: —
- Substituído por: —

## Contexto

O estado da consulta (arquivo lido, resultados, filtros, página) vivia nos componentes da página
`/`. Ao anexar o `.rem`, abrir o layout em `/cnab-444` e voltar, a página era desmontada e tudo
sumia. O pedido: os dados persistem entre `/` e `/cnab-444` e são limpos ao ir para `/entrar` ou
qualquer outra rota.

As duas páginas estão no grupo `(app)`, que tem um layout próprio. No Next 16, um layout
compartilhado não é desmontado ao navegar entre as páginas que ele envolve.

## Opções consideradas

- **Estado num _provider_ cliente montado no layout de `(app)`**: sobrevive entre as páginas do
  grupo; sair do grupo (`/entrar`, _logout_) desmonta o layout e limpa o estado sem código extra.
  A 404 (`src/app/not-found.tsx`, fora do grupo) só é alcançada por carga completa do documento,
  porque nenhum link do app aponta para uma rota inexistente; essa carga já começa vazia.
- **`cacheComponents` com `<Activity>`**: o Next esconde a página em vez de desmontá-la e preserva
  estado e DOM. Mas preserva também fora do grupo (um `/entrar` e a volta manteriam os dados,
  contra o pedido), muda a renderização do app inteiro (é configuração global) e exigiria
  revisar cada componente que hoje conta com o desmonte.
- **`localStorage`/`sessionStorage`**: sobrevive até a um _reload_, mas o `.rem` traz CPF/CNPJ e
  nomes de pagadores (dado pessoal gravado no disco do navegador) e o _storage_ tem cota.

## Decisão

Um `RemittanceCheckProvider` (`"use client"`) envolve `children` no layout de `(app)`, que segue
como Server Component. O _provider_ guarda só dados, nunca texto traduzido nem DOM.

- Expõe o estado da consulta (o _reducer_ existente), a seleção (arquivo e linhas lidas), o
  estado do upload (`idle`, `reading`, `rejected`, `ready`), a visualização (`view`: tons, busca,
  ordenação, página e tamanho de página), e as ações `attach`, `check` e `dispatchView`. O
  `reset` é interno: só um novo arquivo (`attach`) limpa a consulta.
- A `view` é um _reducer_ puro em `select-visible-rows.ts` (`ResultsView` estende `RowFilter`),
  com testes de unidade, no lugar de cinco `useState` de `remittance-results.tsx`. A dependência
  entre `select-visible-rows.ts` e `remittance-check-state.ts` segue num sentido só.
- O _stream_ e o `AbortController` ficam no _provider_: a consulta continua com `/` desmontada e
  só é abortada por uma nova consulta, um novo arquivo ou o desmonte do _provider_. O contador de
  seleção também fica nele: o `reset` interno e o desmonte o incrementam, e uma leitura antiga não
  grava estado depois.
- Foco e anúncios continuam locais nos componentes. O que o usuário deixou é o que ele vê ao
  voltar, sem anúncio novo. Cada região viva guarda um retrato do estado na montagem e só se
  preenche quando ele muda com o componente montado: a fase da consulta; a fase do upload (o
  "N títulos lidos" volta como texto fora do `role="status"`); tons, busca e fase para o aviso
  "N encontrados" (um novo _retry_ depois de voltar é anunciado normalmente).
  Uma rejeição que já estava no estado quando o upload montou volta como texto estático, sem
  `role="alert"` (que seria lido de novo ao entrar no DOM); um arquivo novo rejeitado volta a usar
  o alerta. O link "Entrar de novo" só recebe foco se o botão da consulta tinha o foco no clique e
  o foco se perdeu (`body`).

## Consequências

- (+) Ir e voltar entre `/` e `/cnab-444`, pela navegação ou pelo histórico, mantém arquivo,
  resultados, filtro, busca, ordenação e página.
- (+) Sair do grupo limpa tudo sem _listener_ nem chave especial; nenhum dado pessoal vai para o
  disco do navegador.
- (+) A consulta em andamento termina mesmo com o usuário em `/cnab-444`.
- (−) Um _reload_ perde tudo (aceito: o arquivo continua com o usuário).
- (−) O ajuste da página fora do intervalo virou um _effect_ na lista (antes era ajuste no
  _render_): o estado agora é do _provider_, e atualizar outro componente durante o _render_ é
  proibido no React. A tela já mostra a página ajustada no mesmo _render_; só o valor guardado é
  atualizado depois.
- (−) O _stream_ continua consumindo a rede enquanto o usuário está em `/cnab-444`.
- (−) A decisão pressupõe `cacheComponents` desligado. Ligá-lo exige rever o _provider_: o
  `<Activity>` roda os _cleanups_ ao esconder a rota, e o _cleanup_ do _provider_ abortaria o
  _stream_.

## Evidências

- [`src/features/remittance/remittance-check-provider.tsx`](../../src/features/remittance/remittance-check-provider.tsx),
  montado em [`src/app/(app)/layout.tsx`](<../../src/app/(app)/layout.tsx>).
- [`src/features/remittance/select-visible-rows.ts`](../../src/features/remittance/select-visible-rows.ts)
  e testes (`resultsViewReducer`).
- E2E [`tests/e2e/navigation.spec.ts`](../../tests/e2e/navigation.spec.ts): ida e volta pela
  navegação e pelo histórico, consulta concluída fora da página (uma só requisição), _view_
  zerada ao anexar outro arquivo, rejeição sem alerta novo, troca de idioma, saída por "Entrar de
  novo" e volta no mesmo documento, abort da consulta no _logout_ e _reload_.
- Documentação do Next.js: "Layouts and Pages" (layouts preservam estado na navegação) e
  "Preserving UI state" (`cacheComponents` e `<Activity>`).
