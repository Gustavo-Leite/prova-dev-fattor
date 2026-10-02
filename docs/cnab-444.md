# CNAB 444

Este documento explica o formato CNAB 444, descreve a estrutura do arquivo de exemplo da prova
(`_prova/meu_cnab.rem`) e aponta onde está cada dado — em especial o identificador usado para
consultar a situação na API.

**Convenção de posições:** colunas contadas a partir de 1, intervalos inclusivos (`401–444` são as
colunas 401 a 444, 44 caracteres). Tipos: **N** numérico (alinhado à direita, zeros à esquerda) e
**A** alfanumérico (alinhado à esquerda, brancos à direita).

## 1. O que é

**CNAB** é o nome dado aos layouts de arquivos-texto posicionais que empresas trocam com bancos
(remessa: empresa → banco; retorno: banco → empresa). Cada linha é um registro de tamanho fixo, e
cada campo ocupa sempre as mesmas colunas.

| Formato  | Tamanho da linha | Quem define                                        | Uso típico                                         |
| -------- | ---------------- | -------------------------------------------------- | -------------------------------------------------- |
| CNAB 240 | 240              | FEBRABAN (padrão único)                            | Cobrança, pagamentos, extrato; arquivo com lotes   |
| CNAB 400 | 400              | Cada banco publica o seu (Bradesco é a base usual) | Cobrança de títulos (formato mais antigo)          |
| CNAB 444 | 444              | Convenção de mercado, sem norma FEBRABAN           | Cessão de recebíveis a FIDCs, securitizadoras etc. |

O **CNAB 444** é o CNAB 400 de cobrança acrescido de **44 posições com a chave de acesso da NF-e**
que lastreia cada título. Quem compra recebíveis (fundos de direitos creditórios, securitizadoras,
factorings) precisa ligar cada duplicata à nota fiscal que a originou; a chave de 44 dígitos faz
essa ligação sem alterar o restante do layout que os sistemas já produziam.

Não existe uma versão oficial única. As fontes mostram pelo menos duas variantes:

- **A — "CNAB 400 + 44":** as 400 primeiras colunas seguem o CNAB 400 Bradesco (sequencial do
  registro em 395–400) e a chave vem em **401–444**. Descrita em orientação do Bradesco reproduzida
  no fórum do Projeto ACBr e na documentação de ERPs (TOTVS).
- **B — layout nativo de 444:** manuais de administradores de FIDC põem a chave em 395–438 e o
  sequencial em 439–444.

O arquivo da prova segue a **variante A** quanto à chave (401–444).

## 2. Estrutura do arquivo da prova

| Característica | Valor                                    |
| -------------- | ---------------------------------------- |
| Codificação    | ASCII                                    |
| Linhas         | 12, todas com exatamente 444 caracteres  |
| Fim de linha   | LF (`\n`), inclusive após a última linha |
| Linha 1        | Header (tipo `0`)                        |
| Linhas 2–11    | 10 detalhes (tipo `1`), um por título    |
| Linha 12       | Trailer (tipo `9`)                       |

O manual Bradesco pede CR+LF ao fim de cada registro; o arquivo da prova usa só LF. Um leitor
robusto aceita os dois.

## 3. Layout de referência (variante A)

Resumo dos campos principais do CNAB 400 Bradesco, que a variante A mantém nas colunas 1–400.
Campos de uso bancário (multa, desconto, instruções, débito automático) foram omitidos; a lista
completa está no manual citado em [Fontes](#8-fontes).

**Header (tipo 0)**

| Posição | Tam. | Tipo | Conteúdo                          |
| ------- | ---- | ---- | --------------------------------- |
| 001     | 1    | N    | `0` — identificação do registro   |
| 002     | 1    | N    | `1` — arquivo de remessa          |
| 003–009 | 7    | A    | `REMESSA`                         |
| 010–011 | 2    | N    | `01` — código do serviço          |
| 012–026 | 15   | A    | `COBRANCA`                        |
| 027–046 | 20   | N    | Código da empresa                 |
| 047–076 | 30   | A    | Nome da empresa                   |
| 077–079 | 3    | N    | Número do banco                   |
| 080–094 | 15   | A    | Nome do banco                     |
| 095–100 | 6    | N    | Data de gravação (DDMMAA)         |
| 111–117 | 7    | N    | Número sequencial da remessa      |
| 395–400 | 6    | N    | Sequencial do registro (`000001`) |

**Detalhe (tipo 1)**

| Posição | Tam. | Tipo | Conteúdo                                             |
| ------- | ---- | ---- | ---------------------------------------------------- |
| 001     | 1    | N    | `1` — identificação do registro                      |
| 038–062 | 25   | A    | Número de controle do participante (uso da empresa)  |
| 071–082 | 12   | N    | Nosso número + dígito verificador                    |
| 109–110 | 2    | N    | Ocorrência (`01` = remessa)                          |
| 111–120 | 10   | A    | Número do documento ("seu número")                   |
| 121–126 | 6    | N    | Vencimento (DDMMAA)                                  |
| 127–139 | 13   | N    | Valor do título (2 casas decimais implícitas)        |
| 148–149 | 2    | N    | Espécie (`01` = duplicata, `99` = outros…)           |
| 150     | 1    | A    | `N`                                                  |
| 151–156 | 6    | N    | Data de emissão (DDMMAA)                             |
| 219–220 | 2    | N    | Tipo de inscrição do pagador (`01` CPF, `02` CNPJ)   |
| 221–234 | 14   | N    | CPF/CNPJ do pagador                                  |
| 235–274 | 40   | A    | Nome do pagador                                      |
| 275–314 | 40   | A    | Endereço do pagador                                  |
| 327–334 | 8    | N    | CEP                                                  |
| 335–394 | 60   | A    | Beneficiário final (sacador/avalista) ou 2ª mensagem |
| 395–400 | 6    | N    | Sequencial do registro                               |
| 401–444 | 44   | A    | **Chave de acesso da NF-e** (ver §6)                 |

**Trailer (tipo 9)**

| Posição | Tam. | Tipo | Conteúdo                      |
| ------- | ---- | ---- | ----------------------------- |
| 001     | 1    | N    | `9`                           |
| 002–394 | 393  | A    | Brancos                       |
| 395–400 | 6    | N    | Sequencial do último registro |

A chave é numérica nas notas atuais, mas pode ter letras quando o emitente tem CNPJ alfanumérico
(§6); por isso aparece como **A**. Valores monetários não têm ponto nem vírgula: as duas últimas posições são os centavos
(`0000000015000` = R$ 150,00). Datas DDMMAA têm ano com dois dígitos.

## 4. Layout observado no arquivo da prova

O layout abaixo foi levantado analisando coluna a coluna as 12 linhas de `_prova/meu_cnab.rem`:
trechos não brancos, colunas que variam entre os detalhes e decodificação dos valores. Onde o
significado não pode ser confirmado, a tabela diz "não identificado". O fim de um campo de texto é
inferido pelo início do campo seguinte.

**Header (linha 1)**

| Posição | Conteúdo no arquivo          | Interpretação                                        |
| ------- | ---------------------------- | ---------------------------------------------------- |
| 001     | `0`                          | Tipo de registro: header                             |
| 002–004 | `341`                        | Não identificado (`341` é o código do Itaú)          |
| 005–011 | `REMESSA`                    | Literal                                              |
| 020–021 | `01`                         | Código do serviço                                    |
| 022–029 | `COBRANCA`                   | Literal                                              |
| 033–046 | `00000000000000`             | Provável CNPJ/código da empresa, zerado              |
| 047–072 | `PROVA DEV CNAB 444 AMOSTRA` | Nome da empresa (mesma coluna inicial da referência) |
| 077–079 | `001`                        | Número do banco (`001` = Banco do Brasil)            |
| 084–093 | `0000000000`                 | Não identificado                                     |
| 095–107 | `PROVA TECNICA`              | Texto livre                                          |
| 125–130 | `120326`                     | Data de gravação: 12/03/2026                         |
| 137–143 | `0000001`                    | Número sequencial da remessa                         |

**Detalhe (linhas 2–11; posições do detalhe 1)**

| Posição | Conteúdo no detalhe 1 | Interpretação                                                       |
| ------- | --------------------- | ------------------------------------------------------------------- |
| 001     | `1`                   | Tipo de registro: detalhe                                           |
| 002–020 | `0000001000010000000` | Não identificado (igual em todos os detalhes)                       |
| 022–032 | `10000000001`         | Número do título: `1` + ordem com 10 dígitos (1 a 10)               |
| 033     | `P`                   | Dígito do número anterior; sequência sintética (`P`, `10`, `9`…`2`) |
| 034–058 | `CONTROLE1`           | Número de controle do participante                                  |
| 059–068 | `0000000005`          | Não identificado (igual em todos os detalhes)                       |
| 072–096 | `DUPLICATA MERCANTIL` | Espécie do título, por extenso                                      |
| 097–102 | `150425`              | Vencimento: 15/04/2025                                              |
| 103–115 | `0000000015000`       | Valor do título: R$ 150,00                                          |
| 116–120 | `00099`               | Não identificado (igual em todos os detalhes)                       |
| 124     | `N`                   | Identificação `N`                                                   |
| 139–152 | `00000000000000`      | CPF/CNPJ do pagador, zerado                                         |
| 153–…   | `PAGADOR FAKE 1`      | Nome do pagador                                                     |
| 248–262 | `SAO PAULO`           | Cidade do pagador                                                   |
| 263–270 | `01310100`            | CEP                                                                 |
| 279–280 | `SP`                  | UF                                                                  |
| 281–400 | brancos               | —                                                                   |
| 401–444 | `352403…1234567890`   | **Chave de acesso da NF-e**                                         |

**Trailer (linha 12)**

| Posição | Conteúdo | Interpretação                                         |
| ------- | -------- | ----------------------------------------------------- |
| 001     | `9`      | Tipo de registro: trailer                             |
| 393–398 | `000012` | Sequencial do último registro (= total de linhas, 12) |

### Divergências em relação à referência

- **No detalhe, só três pontos coincidem com a referência:** o tipo de registro na coluna 1, o
  tamanho de 444 e a chave NF-e em 401–444. Os demais campos existem, mas em outras colunas
  (vencimento em 097–102 em vez de 121–126; valor em 103–115 em vez de 127–139; espécie por extenso
  em vez de código; pagador a partir de 139 em vez de 219).
- **No header**, coincidem também o início do nome da empresa (047) e o número do banco (077–079);
  os literais `REMESSA`, `01` e `COBRANCA` existem, mas em 005–011, 020–021 e 022–029 (referência:
  003–009, 010–011 e 012–026).
- **Detalhes e header não têm sequencial de registro** (395–400 em branco). Só o trailer traz um
  sequencial, e em 393–398, não em 395–400.
- **O detalhe 2 está deslocado:** o dígito da coluna 033 tem dois caracteres (`10`), o que empurra
  todos os campos seguintes uma coluna para a direita (`CONTROLE2` começa em 035, o vencimento em
  098). O deslocamento é absorvido pelos brancos antes de 401, e a chave continua em 401–444.

Como o CNAB 444 não tem norma única, um arquivo com layout próprio é plausível. A consequência
prática: **a extração do identificador deve depender só do que é estável** — tipo de registro,
tamanho da linha e colunas 401–444 (mais o total do trailer, para conferir que o arquivo está
completo). Os demais campos servem para exibição e conferência, nunca para localizar a chave.

## 5. Quais dados o arquivo contém e onde

| Dado                           | Onde                        | Exemplo (detalhe 1)                            |
| ------------------------------ | --------------------------- | ---------------------------------------------- |
| **Identificador (chave NF-e)** | Detalhe, 401–444            | `35240300000000000199550010000000011234567890` |
| Número do título               | Detalhe, 022–032            | `10000000001`                                  |
| Número de controle             | Detalhe, a partir de 034    | `CONTROLE1`                                    |
| Espécie                        | Detalhe, 072–096            | `DUPLICATA MERCANTIL`                          |
| Vencimento                     | Detalhe, 097–102 (DDMMAA)   | 15/04/2025                                     |
| Valor                          | Detalhe, 103–115 (centavos) | R$ 150,00                                      |
| CPF/CNPJ do pagador            | Detalhe, 139–152            | zerado                                         |
| Pagador                        | Detalhe, a partir de 153    | `PAGADOR FAKE 1`, São Paulo/SP, CEP 01310-100  |
| Empresa e data da remessa      | Header, 047–072 e 125–130   | `PROVA DEV CNAB 444 AMOSTRA`, 12/03/2026       |
| Número sequencial da remessa   | Header, 137–143             | `0000001`                                      |
| Total de registros             | Trailer, 393–398            | `000012`                                       |

Os 10 títulos do arquivo (no detalhe 2, o dígito ocupa 033–034 e os campos seguintes, até a UF em
280–281, estão deslocados em +1):

| Detalhe | Controle     | Vencimento | Valor (R$) | Nº da NF-e na chave | DV da chave |
| ------- | ------------ | ---------- | ---------- | ------------------- | ----------- |
| 1       | `CONTROLE1`  | 15/04/2025 | 150,00     | 1                   | válido      |
| 2       | `CONTROLE2`  | 20/05/2025 | 283,50     | 2                   | inválido    |
| 3       | `CONTROLE3`  | 10/06/2025 | 420,00     | 3                   | inválido    |
| 4       | `CONTROLE4`  | 05/07/2025 | 55,75      | 4                   | inválido    |
| 5       | `CONTROLE5`  | 22/08/2025 | 990,00     | 5                   | inválido    |
| 6       | `CONTROLE6`  | 18/09/2025 | 123,40     | 6                   | inválido    |
| 7       | `CONTROLE7`  | 12/10/2025 | 87,60      | 7                   | inválido    |
| 8       | `CONTROLE8`  | 30/11/2025 | 445,00     | 8                   | inválido    |
| 9       | `CONTROLE9`  | 20/01/2026 | 332,00     | 9                   | válido      |
| 10      | `CONTROLE10` | 15/02/2026 | 187,50     | 10                  | válido      |

Total: R$ 3.074,75.

## 6. Chave de acesso da NF-e

A chave tem 44 caracteres
([MOC 7.0, §2.2.6](https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-visao-geral.pdf)):

| Posição na chave | Tam. | Campo                        | Detalhe 1        |
| ---------------- | ---- | ---------------------------- | ---------------- |
| 01–02            | 2    | UF do emitente (código IBGE) | `35` (SP)        |
| 03–06            | 4    | Ano e mês de emissão (AAMM)  | `2403` (03/2024) |
| 07–20            | 14   | CNPJ (ou CPF) do emitente    | `00000000000199` |
| 21–22            | 2    | Modelo                       | `55` (NF-e)      |
| 23–25            | 3    | Série                        | `001`            |
| 26–34            | 9    | Número da nota               | `000000001`      |
| 35               | 1    | Tipo de emissão              | `1` (normal)     |
| 36–43            | 8    | Código numérico              | `23456789`       |
| 44               | 1    | Dígito verificador           | `0`              |

**Dígito verificador (módulo 11):** multiplicam-se os 43 primeiros caracteres pelos pesos 2 a 9,
da direita para a esquerda, reiniciando em 2; soma-se e calcula-se o resto da divisão por 11. Se o
resto for 0 ou 1, o dígito é 0; senão, é 11 − resto.

- No arquivo da prova, **só 3 das 10 chaves têm dígito válido** (detalhes 1, 9 e 10), e a API
  responde normalmente para todas (verificado em 29/09/2026). O CNPJ das chaves também é fictício
  (seus dígitos verificadores não conferem). Por isso o dígito é apenas informado em cada título,
  sem rejeitá-lo.
- **CNPJ alfanumérico:** a partir de julho de 2026 (produção em 06/07/2026, segundo a NT
  2025.001 v1.00), o CNPJ pode ter letras nas 12 primeiras posições
  (colunas 07–18 da chave). Nesse caso, o dígito verificador converte cada caractere pelo código
  ASCII − 48 antes do módulo 11
  ([NT Conjunta 2025.001](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=5ZkvIZt10mQ%3D)).
  Validar a chave como "44 dígitos" rejeitaria notas legítimas emitidas por esses CNPJs.

### O que a extração usa

Resumo das restrições de que a leitura do arquivo depende. As regras exatas e os códigos de erro
estão em [`src/domain/cnab/`](../src/domain/cnab/) (`decode-remittance.ts` e `parse-cnab-444.ts`)
e nos testes; as decisões, nos ADRs [0010](adr/0010-cnab-444-parser.md) e
[0018](adr/0018-utf8-bom-and-trailing-padding.md).

- sem BOM, o arquivo é lido byte a byte (windows-1252), então 1 byte = 1 coluna;
- com BOM UTF-8 (`EF BB BF`), o resto é lido como UTF-8, então 1 caractere = 1 coluna (`É` ocupa
  2 bytes e 1 coluna); se não for UTF-8 válido, volta a ser lido como windows-1252. Só o alfabeto
  imprimível do windows-1252 é aceito: um emoji, um acento combinante ou um caractere invisível
  é erro, mesmo que a linha fique com 444 colunas
  ([ADR 0021](adr/0021-windows-1252-alphabet.md));
- toda linha tem 444 colunas (LF ou CR+LF). No fim do arquivo, depois do trailer, são ignorados:
  um CR solto, o caractere de fim de arquivo do DOS (`0x1A`), NULs de preenchimento e linhas só com
  espaço, tab, `0x1A` ou NUL. Esses caracteres no meio do arquivo continuam
  sendo erro, assim como um segundo BOM (U+FEFF);
- a primeira linha é header (`0`), a última é trailer (`9`) e as intermediárias são detalhes
  (`1`);
- o trailer informa o total de registros (393–398 neste arquivo; 395–400 na referência; lido em
  393–400), conferido com o número de linhas;
- o identificador de cada detalhe está em 401–444, com 44 caracteres no formato da chave;
- o dígito verificador da chave é informado em cada recebível (`hasValidCheckDigit`), sem
  rejeitar o arquivo;
- só o alfabeto imprimível do windows-1252 é aceito numa linha (sem controles, sem soft hyphen
  nem caracteres invisíveis de UTF-8, [ADR 0021](adr/0021-windows-1252-alphabet.md)); acentos
  fora da chave são aceitos.

## 7. Glossário

Termos do negócio e os nomes usados no código (o código é todo em inglês).

| Termo                         | No código            | Significado                                               |
| ----------------------------- | -------------------- | --------------------------------------------------------- |
| Arquivo de remessa            | remittance           | Arquivo CNAB enviado pela empresa (`.rem`)                |
| Registro                      | record               | Uma linha do arquivo: header, detalhe ou trailer          |
| Tipo de registro              | `recordType`         | Coluna 1: `0` header, `1` detalhe, `9` trailer            |
| Título / recebível            | `Receivable`         | O que cada detalhe representa: uma duplicata a receber    |
| Chave de acesso da NF-e       | `invoiceAccessKey`   | Identificador de 44 caracteres consultado na API          |
| Dígito verificador da chave   | `hasValidCheckDigit` | Resultado do módulo 11 sobre a chave                      |
| Total de registros do trailer | `recordCount`        | Quantidade de linhas declarada no trailer                 |
| Situação                      | `status`             | Resposta da API para a chave (autorizada, cancelada etc.) |

## 8. Fontes

- Bradesco —
  [Layout de Arquivo Cobrança CNAB 400 (manual 4008.524.0121)](https://assets.bradesco/content/dam/portal-bradesco/assets/pessoajuridica/pdf/4008-524-0121-layout-cobranca-versao-portugues.pdf).
- FEBRABAN —
  [Layout Padrão CNAB 240](https://cmsarquivos.febraban.org.br/Arquivos/documentos/PDF/Layout%20padrao%20CNAB240%20V%2010%2011%20-%2021_08_2023.pdf).
- FIDD/Fromtis —
  [FIDC CNAB 444 – Remessa](https://developer.fiddgroup.com/Fromtis/CNAB444_REMESSA_FIDD.pdf)
  (variante B).
- Grafeno —
  [CNAB 444 – Remessa v2.9](https://8949671.fs1.hubspotusercontent-na1.net/hubfs/8949671/Layouts%20-%20Grafeno/Grafeno%20CNAB%20444%20-%20Remessa_v2_9.pdf)
  (variante B).
- TOTVS —
  [Chave NF-e no arquivo remessa CNAB 444 (coluna 401, tamanho 44)](https://centraldeatendimento.totvs.com/hc/pt-br/articles/360028130111-WINT-Como-inserir-a-instru%C3%A7%C3%A3o-da-chave-NF-e-no-arquivo-remessa-CNAB-444-na-rotina-1521).
- Projeto ACBr —
  [Remessa Bradesco com 444 posições](https://www.projetoacbr.com.br/forum/topic/39337-remessa-bradesco-com-444-posi%C3%A7%C3%B5es-chave-nfe/)
  (fonte secundária).
- CONFAZ —
  [Manual de Orientação do Contribuinte 7.0 – Visão Geral](https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-visao-geral.pdf).
- Portal da NF-e —
  [Nota Técnica Conjunta 2025.001 (CNPJ alfanumérico)](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=5ZkvIZt10mQ%3D).
