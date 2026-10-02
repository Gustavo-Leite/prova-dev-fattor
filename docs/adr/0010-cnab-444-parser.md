# 0010. Parser do CNAB 444

- Status: Substituído parcialmente por 0018
- Data: 2026-09-30
- Substitui: —
- Substituído por: 0018 (parcialmente: decodificação e fim do arquivo)

## Contexto

O arquivo da prova só coincide com o layout de referência em três pontos: tipo de registro na
coluna 1, 444 colunas e chave NF-e em 401–444 ([cnab-444.md §4](../cnab-444.md)). Um detalhe tem
os campos do meio deslocados uma coluna, e o CNAB 444 não tem norma única. O parser precisa extrair
as chaves com segurança, explicar ao usuário tudo o que está errado num arquivo inválido e dar o
mesmo resultado no navegador (validação imediata) e no servidor (fronteira de confiança).

## Opções consideradas

- **Lançar exceção no primeiro erro** — simples; o usuário corrige um problema por vez e todo
  chamador precisa de `try/catch`.
- **Schema Zod por linha** — adiciona dependência ao domínio e não se encaixa em campos
  posicionais.
- **Motor genérico para vários layouts** — nenhum outro layout é pedido.
- **Funções puras: decodificação e leitura separadas, com resultado em união discriminada** —
  sucesso com os recebíveis ou falha com a lista de problemas, sem exceções.

## Decisão

O domínio tem duas funções puras e sem dependências: `decodeRemittance(bytes)` transforma o
arquivo em texto e `parseCnab444(texto)` lê só as colunas estáveis, devolvendo
`{ ok: true, receivables }` ou `{ ok: false, errors, truncated }`.

- **Decodificação única:** CNAB conta posições em bytes. Todo chamador usa `decodeRemittance`, que
  remove a marca de ordem de bytes (BOM) UTF-8 e decodifica como windows-1252 (1 byte = 1 coluna).
  Assim navegador e servidor chegam ao mesmo resultado.
- **Layout declarativo reduzido:** só os campos usados — tipo de registro, chave (401–444) e total
  do trailer. Campos do meio (vencimento, valor, pagador) não são extraídos: as posições não são
  confiáveis e o desafio pede identificador e situação.
- **Total do trailer em 393–400, sem espaços nas pontas:** aceita o arquivo da prova (393–398) e o
  layout de referência (395–400).
- **Chave:** formato da NT 2025.001, com letras permitidas no CNPJ. O dígito verificador vira a
  propriedade `hasValidCheckDigit` de cada recebível, não um erro: 7 das 10 chaves da prova têm
  dígito inválido e a API responde para todas.
- **Caracteres:** só caracteres de controle são erro, incluindo os 5 bytes sem definição no
  windows-1252. Acentos fora da chave são aceitos; a chave já é validada pelo formato.
- **Erros:** um tipo por código, com os parâmetros que a interface traduz. Todos são coletados, em
  ordem de linha; a resposta traz os 50 primeiros e `truncated` indica se havia mais.
- **Chaves repetidas são mantidas:** uma nota com várias parcelas gera vários títulos com a mesma
  chave; evitar consultas repetidas é papel da camada de aplicação.
- Aceita LF e CR+LF e linhas em branco depois do trailer.

## Consequências

- (+) A mesma decodificação e a mesma leitura valem no navegador e no servidor; o usuário vê todos
  os problemas de uma vez.
- (+) Arquivos no layout de referência e no layout da prova são aceitos.
- (−) Um arquivo da variante com a chave em 395–438 é rejeitado pelo total do trailer (393–400 em
  branco), não pelo formato da chave: as colunas 401–444 dessa variante podem passar no formato.
  Se essa variante trouxer um total em 393–400, a chave extraída estará errada.
- (−) Um arquivo salvo em UTF-8 com acentos tem linhas mais longas que 444 bytes e é rejeitado por
  tamanho, o que pode confundir o usuário; uma mensagem específica só será criada se o caso aparecer
  nos testes da interface.
- (−) Exibir vencimento ou valor exigirá decidir como lidar com posições não confiáveis.

## Evidências

- [`src/domain/cnab/`](../../src/domain/cnab/) — `layout.ts`, `access-key.ts`,
  `decode-remittance.ts`, `parse-cnab-444.ts` e testes, incluindo o arquivo real da prova.
- [NT Conjunta 2025.001](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=5ZkvIZt10mQ%3D),
  [MOC 7.0, §2.2.6](https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-visao-geral.pdf)
  e o [Encoding Standard do WHATWG](https://encoding.spec.whatwg.org/) (windows-1252).
