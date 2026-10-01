# 0012. Filtros, busca e paginação da lista de resultados

- Status: Aceito
- Data: 2026-09-30
- Substitui: —
- Substituído por: —

## Contexto

A lista mostra identificador e situação de cada título enquanto o stream NDJSON chega
([ADR 0011](0011-fattor-api-integration.md)). O usuário precisa achar os títulos de uma situação,
achar uma chave e navegar por arquivos com até 200 títulos (limite do servidor). O plano inicial
previa o TanStack Table para isso. As linhas mudam a cada evento do stream, e a mesma seleção
alimenta a tabela (desktop), os cards (mobile) e, depois, a exportação CSV.

## Opções consideradas

- **TanStack Table v8** — padrão de tabela do shadcn, com ordenação e colunas prontas. Com
  `eslint-plugin-react-hooks` 7 (via `eslint-config-next`), `useReactTable` gera o aviso
  `incompatible-library`, e o lint não aceita avisos. O `pageIndex` volta a 0 a cada evento se
  `autoResetPageIndex` não for desligado, e as linhas precisam de `useMemo`.
- **TanStack Table v9** — versão principal recente, com uma dependência a mais e API diferente da
  documentação do shadcn.
- **Função pura própria** — filtra, busca e pagina em poucas linhas, sem dependência; ordenação e
  colunas configuráveis teriam de ser escritas à mão (nenhuma das duas é pedida).

## Decisão

A lista usa uma função pura, `selectVisibleRows(linhas, { situações, busca, página, tamanho })`, que
devolve as linhas da página, o total filtrado, o número de páginas e a faixa "x–y de n". O TanStack
Table sai do stack.

- **Página ajustada no cálculo:** se o total filtrado encolhe durante o stream, a página exibida
  passa a ser a última válida, e o estado é corrigido no próprio render (sem efeito); assim a página
  não salta de volta quando o total cresce de novo. Mudar filtro, busca ou tamanho volta à primeira
  página.
- **Situações no próprio resumo:** os contadores viram botões de alternância (`aria-pressed`) num
  grupo "Filtrar por situação", com várias situações ao mesmo tempo. Uma situação selecionada
  continua visível mesmo com zero títulos, para o filtro nunca ficar ativo sem controle na tela.
- **Busca só pela chave:** espaços, pontos, traços e barras são ignorados; entrada vazia (ou só
  com esses separadores) não filtra; qualquer outro caractere dá zero resultados com a mensagem
  "a chave tem só números". Não há busca pelo número da linha, pois "1" casaria de forma ambígua
  com as chaves.
- **Leitor de tela:** a contagem filtrada é anunciada só fora da consulta em andamento, para não
  anunciar a cada evento do stream. A página atual ("Página 2 de 3") fica numa região `status`;
  com um filtro de situação ativo durante a consulta, ela é anunciada quando o número de páginas
  muda, o que é raro e informativo, e evita ligar e desligar a região.
- **Foco nunca se perde:** a paginação fica sempre montada, com botões desabilitados mas focáveis;
  o estado vazio troca só a lista. Desmarcar uma situação com zero títulos (que some do grupo) leva
  o foco para a busca.

## Consequências

- (+) Nenhuma dependência nova nem exceção de lint; as regras estão todas em testes unitários.
- (+) A exportação CSV poderá reutilizar a mesma seleção.
- (−) Ordenação por coluna, se pedida, precisará ser implementada.
- (−) O estado dos filtros não vai para a URL: recarregar a página perde o arquivo de qualquer
  forma.

## Evidências

- [`src/features/remittance/select-visible-rows.ts`](../../src/features/remittance/select-visible-rows.ts)
  e testes; [`results-toolbar.tsx`](../../src/features/remittance/results-toolbar.tsx),
  [`results-pagination.tsx`](../../src/features/remittance/results-pagination.tsx).
- E2E [`tests/e2e/results.spec.ts`](../../tests/e2e/results.spec.ts), com uma remessa sintética de
  30 títulos e axe nos temas claro e escuro.
