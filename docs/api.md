# API: consulta de status das notas

Como a aplicação consulta a situação de cada nota fiscal do arquivo CNAB 444: a API externa da
Fattor, a rota que a página chama e o protocolo de resposta. As decisões estão no
[ADR 0011](adr/0011-fattor-api-integration.md).

## 1. Visão geral

```
Navegador ──POST /api/remittances (arquivo)──► Servidor Next.js ──login + GET /status/{chave}──► API Fattor
          ◄──────── NDJSON, uma linha por item ──                 ◄──────────── JSON ──────────
```

A página não chama a API da Fattor diretamente:

- a API não envia cabeçalhos CORS, então o navegador não pode lê-la;
- as credenciais precisam ficar no servidor.

O servidor (BFF, _backend for frontend_) recebe o arquivo, valida, consulta a API e devolve os
resultados aos poucos.

## 2. API externa (Fattor)

Documentada em OpenAPI (`/public/prova-dev/openapi`). URL base e credenciais vêm do ambiente
(`FATTOR_API_BASE_URL`, `FATTOR_API_EMAIL`, `FATTOR_API_PASSWORD`; ver `.env.example`).

| Chamada               | Uso                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------ |
| `POST /login`         | `{ email, password }` → `{ token, expires_in, type: "Bearer" }`                      |
| `GET /status/{chave}` | `Authorization: Bearer <token>` → `{ chave_nfe, situacao, … }`; 401 sem token válido |

Mapeamento da situação para o domínio (código em inglês):

| `situacao` (API) | `status` (aplicação) |
| ---------------- | -------------------- |
| `autorizada`     | `authorized`         |
| `cancelada`      | `cancelled`          |
| `rejeitada`      | `rejected`           |
| `denegada`       | `denied`             |
| `nao_encontrada` | `not_found`          |

### Como o servidor usa a API

- **Token:** reaproveitado até 60 s antes de expirar (ou metade da validade, se for curta).
  Consultas simultâneas compartilham um único login.
- **401 numa consulta:** o servidor faz login de novo uma vez e repete. Um segundo 401 significa
  credenciais rejeitadas.
- **Login recusado (400, 401 ou 403):** credenciais rejeitadas; a verificação do arquivo inteiro é
  interrompida (evita uma tentativa de login por item).
- **Tempo limite:** 5 s por tentativa, contando o corpo da resposta; o login inteiro tem no máximo
  10 s.
- **Novas tentativas:** até 2, com espera exponencial e variação aleatória, em falha de rede,
  tempo limite, 5xx e 429 (respeitando `Retry-After`, até 5 s). Outros 4xx não são repetidos.
  Vale para o login e para as consultas.
- **Redirecionamentos não são seguidos:** uma resposta 3xx é tratada como indisponibilidade, para
  que credenciais e token nunca sejam enviados a outro endereço.
- **Resposta validada:** corpo fora do contrato ou `chave_nfe` diferente da chave consultada é
  resposta inválida.

## 3. Rota da aplicação: `POST /api/remittances`

Corpo `multipart/form-data` com o arquivo no campo `file`. O arquivo é decodificado e validado
pelo parser (ver [cnab-444.md](cnab-444.md)).

### Respostas

| HTTP | Corpo                                                             | Quando                                                                                                                                     |
| ---- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 200  | NDJSON (abaixo)                                                   | Arquivo válido; a consulta começa                                                                                                          |
| 400  | `{ "code": "INVALID_REQUEST" }`                                   | Corpo não é multipart ou o campo `file` não tem exatamente um arquivo                                                                      |
| 403  | `{ "code": "CROSS_SITE_REQUEST" }`                                | Disparada por outra origem (`Sec-Fetch-Site` diferente de `same-origin`/`none`)                                                            |
| 411  | `{ "code": "LENGTH_REQUIRED" }`                                   | Sem `Content-Length` numérico                                                                                                              |
| 413  | `{ "code": "FILE_TOO_LARGE", "maxBytes": 131072 }`                | `Content-Length` acima de 144 KiB (128 KiB + 16 KiB de margem do multipart; recusado sem ler o corpo) ou arquivo acima de 128 KiB          |
| 422  | `{ "code": "INVALID_FILE", "errors": [...], "truncated": false }` | Arquivo fora do layout; `errors` traz os códigos do parser (com a linha, quando se aplica), no máximo 50; `truncated` indica se havia mais |
| 422  | `{ "code": "TOO_MANY_RECEIVABLES", "max": 200, "actual": 250 }`   | Mais itens do que o permitido                                                                                                              |

Todas as respostas listadas acima têm `Cache-Control: no-store`. As mensagens para o usuário vêm dos códigos,
traduzidos pela interface.

### Protocolo NDJSON (resposta 200)

`Content-Type: application/x-ndjson; charset=utf-8`: um objeto JSON por linha, enviados à medida
que as consultas terminam.

| Evento      | Campos                                                                                | Quando                                        |
| ----------- | ------------------------------------------------------------------------------------- | --------------------------------------------- |
| `started`   | `total`                                                                               | Primeira linha: quantos itens virão           |
| `result`    | `lineNumber`, `invoiceAccessKey`, `hasValidCheckDigit`, `outcome: "status"`, `status` | Situação consultada com sucesso               |
| `result`    | `lineNumber`, `invoiceAccessKey`, `hasValidCheckDigit`, `outcome: "failed"`, `reason` | Falha só deste item                           |
| `completed` | —                                                                                     | Última linha: todos os itens foram informados |
| `failed`    | `reason: "UPSTREAM_REJECTED_CREDENTIALS"`                                             | Última linha: consulta interrompida           |

- `reason` de um item: `UPSTREAM_TIMEOUT`, `UPSTREAM_UNAVAILABLE` ou `UPSTREAM_INVALID_RESPONSE`.
- Os resultados chegam na ordem em que terminam; `lineNumber` é a linha no arquivo, para ordenar.
- Uma chave repetida em várias linhas é consultada uma vez e informada em cada linha.
- Com `completed`, há exatamente um `result` por item. Com `failed`, a consulta parou antes.
- Se o cliente desconectar, a consulta é interrompida e nada mais é enviado.
- Se a transmissão terminar sem `completed` nem `failed` (conexão perdida, limite de duração da
  plataforma), ela foi interrompida: o cliente deve tratar como falha.

### Limites

| Limite                  | Valor   | Motivo                                                      |
| ----------------------- | ------- | ----------------------------------------------------------- |
| Tamanho do arquivo      | 128 KiB | Não ler corpos grandes; comporta ~290 linhas de 444 bytes   |
| Itens por arquivo       | 200     | Limita chamadas à API por envio (o arquivo da prova tem 10) |
| Consultas simultâneas   | 5       | Não sobrecarregar a API                                     |
| Prazo total da consulta | 25 s    | Itens não concluídos viram `UPSTREAM_TIMEOUT`               |
| Duração máxima da rota  | 30 s    | `maxDuration`, acima do prazo                               |

### Exemplo

```bash
curl -N -F "file=@_prova/meu_cnab.rem" http://localhost:3000/api/remittances
```

```
{"type":"started","total":10}
{"type":"result","lineNumber":2,"invoiceAccessKey":"3524…7890","hasValidCheckDigit":true,"outcome":"status","status":"authorized"}
…
{"type":"completed"}
```

Com o arquivo da prova, a API responde 5 `authorized`, 2 `cancelled`, 2 `rejected` e 1 `denied`.
