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
- o token da sessão precisa ficar fora do alcance do JavaScript da página.

O servidor (BFF, _backend for frontend_) recebe o arquivo, valida, consulta a API e devolve os
resultados aos poucos.

## 2. API externa (Fattor)

Documentada em OpenAPI (`/public/prova-dev/openapi`). A URL base vem do ambiente
(`FATTOR_API_BASE_URL`; ver `.env.example`). O login é feito por cada usuário na página `/entrar`:
o servidor chama `POST /login` e guarda o token num cookie `session` HttpOnly, que o JavaScript
da página não lê. O servidor não guarda token da API.

A API de demonstração responde `200` com um token válido para **qualquer** e-mail e senha. Por
isso o servidor só libera a credencial configurada em `SIGN_IN_EMAIL` e `SIGN_IN_PASSWORD`
(obrigatórias; o `.env.example` traz as credenciais públicas de demonstração do Swagger). O e-mail
é comparado sem diferenciar maiúsculas; a senha, exatamente e em tempo constante. Qualquer outra
credencial é recusada sem chamar a API.

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

- **Token:** o do cookie `session`, enviado em cada consulta. O cookie expira 60 s antes do token
  (ou na metade da validade, se for curta) e dura no máximo 24 h.
- **401 numa consulta:** a sessão foi recusada; a verificação do arquivo inteiro é interrompida,
  sem nova tentativa nem novo login. O usuário entra de novo na página `/entrar`.
- **Login recusado (credencial diferente da configurada, ou API respondendo 400, 401 ou 403):** a
  página `/entrar` informa e-mail ou senha incorretos.
- **Tempo limite:** 5 s por tentativa de consulta, contando o corpo da resposta; o login tem no
  máximo 10 s.
- **Novas tentativas:** até 2 por consulta, com espera exponencial e variação aleatória, em falha
  de rede, tempo limite, 5xx e 429 (respeitando `Retry-After`, até 5 s). Outros 4xx não são
  repetidos. O login não é repetido.
- **Redirecionamentos não são seguidos:** uma resposta 3xx é tratada como indisponibilidade, para
  que credenciais e token nunca sejam enviados a outro endereço.
- **Rotas protegidas:** sem um cookie `session` bem formado, a página `/` redireciona para
  `/entrar`; `/cnab-444` continua pública.
- **Resposta validada:** corpo fora do contrato ou `chave_nfe` diferente da chave consultada é
  resposta inválida.

## 3. Rota da aplicação: `POST /api/remittances`

Corpo `multipart/form-data` com o arquivo no campo `file`. O arquivo é decodificado e validado
pelo parser (ver [cnab-444.md](cnab-444.md)). A rota exige o cookie `session` gravado pelo login;
a origem e a sessão são conferidas antes de ler o corpo.

### Respostas

| HTTP | Corpo                                                             | Quando                                                                                                                                                                                              |
| ---- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 200  | NDJSON (abaixo)                                                   | Arquivo válido; a consulta começa                                                                                                                                                                   |
| 400  | `{ "code": "INVALID_REQUEST" }`                                   | Corpo não é multipart ou o campo `file` não tem exatamente um arquivo                                                                                                                               |
| 401  | `{ "code": "SESSION_EXPIRED" }`                                   | Sem cookie `session` ou com um valor mal formado                                                                                                                                                    |
| 403  | `{ "code": "CROSS_SITE_REQUEST" }`                                | Disparada por outra origem (`Sec-Fetch-Site` diferente de `same-origin`/`none`, ou `Origin` com host diferente do primeiro valor de `X-Forwarded-Host` ou de `Host`, ou `Origin: null` ou inválido) |
| 411  | `{ "code": "LENGTH_REQUIRED" }`                                   | Sem `Content-Length` numérico                                                                                                                                                                       |
| 413  | `{ "code": "FILE_TOO_LARGE", "maxBytes": 131072 }`                | `Content-Length` acima de 144 KiB (128 KiB + 16 KiB de margem do multipart; recusado sem ler o corpo) ou arquivo acima de 128 KiB                                                                   |
| 422  | `{ "code": "INVALID_FILE", "errors": [...], "truncated": false }` | Arquivo fora do layout; `errors` traz os códigos do parser (com a linha, quando se aplica), no máximo 50; `truncated` indica se havia mais                                                          |
| 422  | `{ "code": "TOO_MANY_RECEIVABLES", "max": 200, "actual": 250 }`   | Mais itens do que o permitido                                                                                                                                                                       |

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
| `failed`    | `reason: "UPSTREAM_REJECTED_CREDENTIALS"`                                             | Última linha: a API recusou a sessão          |

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
curl -N -b "session=<token>" -F "file=@_prova/meu_cnab.rem" http://localhost:3000/api/remittances
```

```
{"type":"started","total":10}
{"type":"result","lineNumber":2,"invoiceAccessKey":"3524…7890","hasValidCheckDigit":true,"outcome":"status","status":"authorized"}
…
{"type":"completed"}
```

Com o arquivo da prova, a API responde 5 `authorized`, 2 `cancelled`, 2 `rejected` e 1 `denied`.
