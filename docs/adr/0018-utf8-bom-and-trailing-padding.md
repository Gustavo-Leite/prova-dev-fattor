# 0018. BOM UTF-8 e fim do arquivo tolerante

- Status: Substituído parcialmente por 0021
- Data: 2026-10-02
- Substitui: 0010 (parcialmente: decodificação e fim do arquivo)
- Substituído por: 0021 (parcialmente: caracteres aceitos e linhas finais de preenchimento)

## Contexto

O [ADR 0010](0010-cnab-444-parser.md) decidiu remover o BOM UTF-8 e decodificar o resto como
windows-1252 (1 byte = 1 coluna), e aceitar só LF, CR+LF e linhas em branco depois do trailer. A
revisão de qualidade provou dois defeitos com o arquivo real da prova (`_prova/meu_cnab.rem`)
contra o código anterior:

- **BOM ignorado na decodificação:** o mesmo arquivo salvo em UTF-8 com BOM e "JOSÉ" no nome do
  pagador (linha 2) é recusado com `INVALID_LINE_LENGTH` (linha 2, 445 colunas). O BOM diz que o
  arquivo é UTF-8, mas o `É` (2 bytes) vira `Ã‰` (2 colunas).
- **Fim do arquivo frágil:** um arquivo bom é recusado quando termina com:
  - um CR solto: `INVALID_CHARACTERS` e `INVALID_LINE_LENGTH` (445) no trailer;
  - o caractere de fim de arquivo do DOS (`0x1A`) ou NULs de preenchimento depois do trailer: a
    linha 13 vira um registro inválido e o trailer passa a ser lido como detalhe
    (`UNEXPECTED_RECORD_TYPE`).

Editores, sistemas legados e transferências por blocos produzem esses fins de arquivo; nenhum
deles muda o conteúdo dos registros.

## Opções consideradas

- **(i) Manter a recusa e criar um erro de encoding** — o usuário receberia uma mensagem mais
  clara, mas continuaria tendo que reconverter um arquivo que o BOM já identifica sem ambiguidade.
- **(ii) Com BOM, decodificar como UTF-8 estrito (`fatal`), com recuo para windows-1252** — o BOM
  declara a codificação; se os bytes não forem UTF-8 válido, o comportamento é o de hoje (BOM
  removido, resto em windows-1252).
- **Tentar UTF-8 também sem BOM** — rejeitada por ser ambígua: uma sequência como `C3 89` é `É` em
  UTF-8 e `Ã‰` em windows-1252, e as duas leituras são texto plausível. O resultado dependeria de
  adivinhação, e um arquivo windows-1252 poderia ter as colunas deslocadas sem erro.

## Decisão

Opção (ii), mais um fim de arquivo tolerante.

- **Decodificação:** sem BOM, nada muda (windows-1252, 1 byte = 1 coluna). Com BOM UTF-8
  (`EF BB BF`), o resto é decodificado com
  `TextDecoder("utf-8", { fatal: true, ignoreBOM: true })`; se lançar, é decodificado como
  windows-1252, sem o BOM. Só o primeiro BOM é removido: com `ignoreBOM: true`, o decoder não
  engole um segundo BOM em silêncio, que fica no texto como U+FEFF e é recusado como
  `INVALID_CHARACTERS` (um arquivo com BOM duplicado foi gerado errado e a mensagem não pode
  apontar um caractere invisível sem explicar o problema).
- **Fim do arquivo:** antes de separar as linhas, CR, LF, NUL e `0x1A` finais são removidos
  (espaço e tab não, porque podem fazer parte das 444 colunas do trailer). A remoção é um laço
  linear a partir do fim, não uma regex: `/[\r\n\u0000\u001a]+$/u` é quadrática (ReDoS) e levou
  9,3 s com 128 KB de `"\r\0"` seguidos de `"X"`, travando o servidor e a aba do navegador.
  Depois, as linhas finais só com espaço em branco, NUL ou `0x1A` são descartadas (espaço em
  branco no sentido de `\s`, o mesmo de `trim`), como já eram as linhas em branco.
- `0x1A` ou NUL no meio do arquivo continuam `INVALID_CHARACTERS`; um arquivo separado só por CR
  continua recusado.
- Um arquivo que só tem esses caracteres de preenchimento é `EMPTY_FILE`.

## Consequências

- (+) Arquivos UTF-8 com BOM e acentos, e arquivos com padding no fim, são lidos sem o usuário
  reconverter nada.
- (+) O mesmo `decodeRemittance` roda no navegador e no servidor; os dois continuam chegando ao
  mesmo resultado.
- (−) Num arquivo UTF-8 com BOM, a validação conta caracteres, não bytes: um arquivo aceito aqui
  pode ser recusado por um banco que conta 444 bytes por linha.
- (−) Um caractere fora do BMP (um emoji, por exemplo) ocupa 2 unidades UTF-16 e a linha é recusada
  por tamanho (445). É a recusa segura: a chave nunca é lida deslocada.
- (−) Um arquivo UTF-8 sem BOM com acentos continua recusado por tamanho, como no ADR 0010.

## Evidências

- [`src/domain/cnab/decode-remittance.ts`](../../src/domain/cnab/decode-remittance.ts) e
  [`src/domain/cnab/parse-cnab-444.ts`](../../src/domain/cnab/parse-cnab-444.ts), com os testes ao
  lado: o arquivo da prova recodificado em UTF-8 com BOM, em Latin-1 sem BOM, com UTF-8 inválido
  depois do BOM, com um emoji e com BOM duplicado; os fins com CR solto, `0x1A`, NULs e linhas de
  preenchimento; `0x1A` no meio do arquivo; e a regressão de ReDoS (128 KB de `"\r\0"` seguidos de
  `"X"`, recusados em menos de 500 ms).
- Commit `fix(cnab): read files with a UTF-8 BOM or trailing padding`.
- [Encoding Standard do WHATWG](https://encoding.spec.whatwg.org/) (`TextDecoder`, modo `fatal`,
  BOM e windows-1252).
