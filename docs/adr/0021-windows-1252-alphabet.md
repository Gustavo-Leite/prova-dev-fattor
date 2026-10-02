# 0021. Alfabeto da remessa restrito ao windows-1252

- Status: Aceito
- Data: 2026-10-02
- Substitui: 0018 (parcialmente: caracteres aceitos e linhas finais de preenchimento); 0010
  (parcialmente: caracteres aceitos)
- Substituído por: —

## Contexto

Com o [ADR 0018](0018-utf8-bom-and-trailing-padding.md), um arquivo com BOM passou a ser lido como
UTF-8. O parser só recusava controles C0, C1 e U+FEFF, uma regra pensada para windows-1252, que não
produz outros caracteres invisíveis. A auditoria de segurança da revisão de qualidade provou que,
pelo caminho UTF-8, um arquivo válido em todo o resto passa com:

- controles bidi (U+202E, U+2066–2069): a linha aparece invertida no raio-X do detalhe;
- caracteres sem largura ou que se combinam com o anterior (U+200B, U+0301, U+3164, U+2028);
- um emoji no lugar de **dois** caracteres: a linha fica com 444 unidades UTF-16 e é aceita (o
  0018 só previa o caso de 445).

A chave consultada continua validada como 44 dígitos, mas a linha exibida pode enganar quem confere
o arquivo. O 0018 também descartava linhas finais só com espaço em branco no sentido de `\s`, que
inclui U+FEFF e NBSP: um BOM perdido no fim sumia em silêncio, contra a própria regra de recusá-lo.

## Opções consideradas

- **Lista de bloqueio por categoria (`\p{Cf}`)** — fecha bidi e largura zero, mas deixa passar
  acentos combinantes, separadores de linha, preenchimentos invisíveis e surrogates.
- **Lista de permissão: o alfabeto imprimível do windows-1252** — um arquivo UTF-8 com BOM só é
  aceito se pudesse ter sido escrito em windows-1252; os dois caminhos de decodificação aceitam o
  mesmo alfabeto.

## Decisão

Lista de permissão, mais preenchimento final só em ASCII.

- **Caracteres válidos num registro:** os que o windows-1252 decodifica dos bytes `0x20`–`0xFF`,
  exceto `0x7F`, os 5 bytes indefinidos (que viram C1) e o soft hyphen (`0xAD`, invisível fora de
  quebra de linha). O conjunto é montado uma vez com o mesmo `TextDecoder` e consultado por unidade
  UTF-16, em tempo linear. Todo o resto é `INVALID_CHARACTERS`.
- **Linhas finais descartadas:** só as que têm espaço, tab, NUL ou `0x1A`
  (`/^[ \t\u0000\u001a]*$/`). U+FEFF, NBSP ou CR numa linha final viram erro. NBSP continua válido
  dentro de um registro, por ser um byte windows-1252 legítimo.

## Consequências

- (+) Nenhum caractere invisível ou que entorte a exibição chega ao raio-X da linha.
- (+) Uma linha nunca é aceita com uma coluna ocupada por 2 unidades UTF-16.
- (−) Um arquivo UTF-8 com BOM e caracteres fora do windows-1252 (emoji, acento combinante) passa a
  ser recusado.
- (−) O soft hyphen passa a ser recusado também sem BOM, o que muda o comportamento do
  [ADR 0010](0010-cnab-444-parser.md) para esse byte.

## Evidências

- [`src/domain/cnab/parse-cnab-444.ts`](../../src/domain/cnab/parse-cnab-444.ts), com os testes ao
  lado: RLO, U+200B, U+2066, U+0301, U+3164, U+2028 e emoji em 2 colunas, com BOM; soft hyphen e
  `€` sem BOM; linha final com U+FEFF, NBSP ou CR; tab no preenchimento final e dentro de um
  registro.
- Commit `fix(cnab): accept only the windows-1252 printable alphabet`.
