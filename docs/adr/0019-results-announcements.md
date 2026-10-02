# 0019. Anúncios da lista de resultados sem repetição

- Status: Aceito
- Data: 2026-10-02
- Substitui: 0012 (parcialmente: anúncio da página atual)
- Substituído por: —

## Contexto

Complementa o [0017](0017-keep-check-state-in-app-layout.md): o estado da consulta vive no
_provider_ do layout de `(app)`, e a lista de resultados é desmontada ao ir para `/cnab-444` e
remontada ao voltar. O upload e o anúncio da fase já não repetem o que o usuário deixou, mas a lista
ainda repetia três coisas:

- os alertas de "consulta interrompida", "sessão expirada", "credenciais recusadas" e erro de
  envio têm sempre `role="alert"`, que o leitor de tela lê de novo quando o elemento entra no DOM;
- a página atual ficava numa região `role="status"` dentro da paginação
  ([0012](0012-results-list.md)), anunciada a cada remontagem;
- o aviso "N títulos encontrados" mudava a cada tecla digitada na busca.

## Opções consideradas

- **Retrato só da `phase` nos alertas**: como no upload. Não basta: duas mudanças de fase podem
  cair no mesmo _render_ por causa do _batching_ do React (um novo _retry_ que vai de
  `interrupted` a `checking` e de volta a `interrupted`), e o retrato ficaria igual, sem anúncio.
- **Comparar só o `attempt`**: o _stream_ continua no _provider_ com a lista desmontada; sair
  durante `checking`, voltar e ver a consulta ser interrompida mantém o mesmo `attempt` e precisa
  ser anunciado.
- **Manter a região `status` na paginação**: simples, mas anuncia a página a cada remontagem e
  disputa com o aviso de filtros, duas regiões vivas para a mesma lista.
- **Debounce no filtro inteiro**: atrasaria a própria lista; só o texto lido precisa esperar.

## Decisão

A lista guarda retratos na montagem e só anuncia o que muda com ela montada, numa região única.

- **Alertas:** o retrato é `{ phase, attempt }`. O alerta fica sem `role` só enquanto a fase e o
  `attempt` atuais são iguais aos da montagem; qualquer mudança passa a usar `role="alert"` e não
  volta. O `attempt` garante que um novo _retry_ é anunciado mesmo quando a fase final é a mesma;
  a `phase` garante que "sai durante `checking`, volta e a consulta é interrompida" é anunciado.
- **Página atual:** a paginação perde o `role="status"`; o texto visível continua. "Página X de N"
  vai para a região única da lista só depois de `changePage` (Anterior/Próxima) ou
  `changePageSize`. O valor é um retrato tirado na ação: pode envelhecer durante a consulta (o
  ajuste automático da página não o atualiza) sem ser anunciado de novo, por decisão, para não
  anunciar a cada evento do _stream_ (mesma regra do 0012 para a contagem). Ele é apagado quando a
  fase da consulta muda.
- **Ordenação:** ordenar volta à primeira página. Se a região já mostrava uma página, ela passa a
  "Página 1 de N"; se não mostrava, ordenar não anuncia nada.
- **Última ação vale:** filtro, busca e "Limpar filtros" apagam o anúncio de página, e a região
  volta a mostrar a contagem filtrada (ou nada, sem filtros).
- **Busca:** o texto "N títulos encontrados" espera 500 ms sem digitação para aparecer; a lista e o
  filtro por situação continuam imediatos. O _timer_ é limpo a cada tecla e no desmonte. Durante a
  consulta nada é anunciado, como antes.

## Consequências

- (+) Voltar de `/cnab-444` não relê alertas, página nem contagem; o que muda depois é anunciado.
- (+) Uma só região viva para a lista: filtro, busca e página não disputam o leitor de tela.
- (−) O anúncio de página pode ficar desatualizado durante a consulta até a próxima ação do
  usuário; o texto visível da paginação continua correto.
- (−) O padrão de retrato na montagem se repete em três componentes; extraí-lo num _hook_ comum
  fica para outra mudança.

## Evidências

- [`src/features/remittance/remittance-results.tsx`](../../src/features/remittance/remittance-results.tsx)
  e [`results-pagination.tsx`](../../src/features/remittance/results-pagination.tsx).
- E2E [`tests/e2e/navigation.spec.ts`](../../tests/e2e/navigation.spec.ts): alerta de consulta
  interrompida sem `role="alert"` depois de ir e voltar; consulta presa em `checking`, ida e volta,
  e interrupção com `role="alert"`; região vazia ao voltar.
- E2E [`tests/e2e/results.spec.ts`](../../tests/e2e/results.spec.ts): Próxima e tamanho de página
  anunciados; paginação sem `role="status"`; filtro e busca depois da página anunciam a contagem;
  "Limpar filtros" e "Consultar de novo" apagam a página; ordenação sem e com página anunciada;
  _debounce_ da busca com `page.clock` (nada antes de 500 ms, a contagem depois).
- Commit `fix(a11y): stop repeating result announcements`.
