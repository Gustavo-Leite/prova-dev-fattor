# 0014. Página do layout CNAB 444 com posições observadas só para exibição

- Status: Aceito
- Data: 2026-10-01
- Substitui: —
- Substituído por: —

## Contexto

A entrega 1 do desafio é documentar o CNAB 444: o que é, a estrutura e quais dados estão onde. O
documento [`docs/cnab-444.md`](../cnab-444.md) cobre isso, mas fica fora da aplicação. O parser
([ADR 0010](0010-cnab-444-parser.md)) lê só colunas estáveis (tipo de registro, chave em 401–444 e
total do trailer) e deixou em aberto como exibir vencimento ou valor, cujas posições só foram
observadas na amostra: no detalhe 2, todos os campos a partir do número de controle estão uma
coluna à direita.

## Opções consideradas

- **Só o link para o documento** — nada de código, mas quem avalia a página não vê o layout.
- **Extrair os campos observados no parser** — mostraria vencimento e valor de cada título, mas
  com valores errados sempre que uma linha estiver deslocada, como o detalhe 2.
- **Página didática sobre uma linha fixa da amostra** — mostra os campos e onde estão, marcando
  quais posições são garantidas e quais foram só observadas, sem tocar na extração.

## Decisão

Uma rota `/cnab-444` mostra o layout sobre o primeiro detalhe da amostra; as posições observadas
servem só para exibição, sinalizadas como tal, e nunca para extração.

- **Linha embutida com teste de paridade:** `sample-detail-line.ts` monta a linha 2 de
  `_prova/meu_cnab.rem`; um teste compara byte a byte com o arquivo. A página não lê arquivo em
  tempo de execução.
- **Campos com confiabilidade:** `detail-fields.ts` lista cada campo com posição e `stable` ou
  `observed`. Os estáveis apontam para os mesmos objetos de `cnab444Layout`, então uma mudança no
  domínio aparece na página; um teste confere ordem, sobreposição e os valores lidos da amostra.
- **Decodificação pura:** vencimento (DDMMAA) e valor (13 dígitos, 2 decimais) viram data e moeda
  com `Intl`, no idioma da página, em funções testadas em pt-BR e en.
- **Reuso:** o raio-x da linha é o `LineXray` do detalhe do título, com um tom `observed`
  (contorno) e trechos em branco sem destaque; a anatomia da chave usa `splitAccessKey` e
  `AccessKeyPartList`. Todo texto vem do catálogo `cnab.layout`; posições entram como parâmetros.
- **Pasta única `features/cnab`:** os componentes do layout ficam junto do raio-x e da chave,
  em vez de uma pasta por página. A separação entre `features/remittance` e `features/cnab` não é
  verificada por lint; aceita por ora.

## Consequências

- (+) A entrega 1 fica visível na aplicação, com a mesma fonte de posições do parser.
- (+) Fecha o ponto aberto do ADR 0010: campos não confiáveis aparecem só sobre a amostra e com o
  aviso de que a posição não é garantida.
- (−) A página descreve uma linha da amostra; outro arquivo com layout diferente não muda o que
  ela mostra.
- (−) As posições observadas ficam em `detail-fields.ts`, mantidas à mão junto com o documento.
- (−) Os cartões e a tabela são componentes de cliente só para reaproveitar o rótulo de posições
  do raio-x (`usePositionLabel`); não têm estado. O custo é cerca de 1 KB, já que os catálogos
  vão ao cliente de qualquer forma.

## Evidências

- [`src/app/cnab-444/page.tsx`](../../src/app/cnab-444/page.tsx) e
  [`src/features/cnab/`](../../src/features/cnab/) (`detail-fields`, `sample-detail-line`,
  `decode-sample-field` e testes).
- E2E [`tests/e2e/cnab-layout.spec.ts`](../../tests/e2e/cnab-layout.spec.ts): navegação, tabela,
  raio-x sem transbordo, 360 px sem rolagem horizontal e axe nos dois temas.
