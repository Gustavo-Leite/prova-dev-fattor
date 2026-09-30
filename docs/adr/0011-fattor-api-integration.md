# 0011. Integração com a API da Fattor via BFF

- Status: Aceito
- Data: 2026-09-30
- Substitui: —
- Substituído por: —

## Contexto

A situação de cada nota vem de uma API externa que exige login, não envia CORS e responde item a
item. Um arquivo pode ter dezenas de notas; a página precisa mostrar os resultados sem esperar o
último, sem expor credenciais e sem transformar o servidor num multiplicador de chamadas à API.

## Opções consideradas

- **Navegador chama a API direto** — impossível sem CORS e exporia as credenciais.
- **Proxy genérico para a API** — cada item vira uma requisição do navegador, e o proxy aceitaria
  qualquer chamada; vira um relay aberto.
- **Uma rota que recebe o arquivo e devolve tudo no fim** — simples; a tela fica parada até a
  última consulta.
- **Uma rota que recebe o arquivo e transmite um resultado por linha (NDJSON)** — progresso
  visível com um único POST; SSE exigiria GET e WebSocket seria infraestrutura demais.

## Decisão

`POST /api/remittances` recebe o arquivo, valida no servidor e transmite um evento NDJSON por item,
consultando a API com sessão compartilhada, concorrência e prazo limitados.

- **Camadas:** caso de uso `checkRemittance` (aplicação) com a porta `InvoiceStatusGateway`;
  adaptador `createFattorStatusGateway` (infra, `server-only`); a rota só traduz HTTP.
- **Sessão:** token em cache com margem, login único para chamadas simultâneas, descarte só do
  token que foi recusado (evita logins em cascata após vários 401 ao mesmo tempo).
- **Credencial recusada é fatal:** interrompe tudo e encerra com o evento `failed`, em vez de
  tentar um login por item.
- **Limites:** 200 itens e 128 KiB por arquivo, 5 consultas simultâneas, prazo total de 25 s
  (contado a partir do início da transmissão) e `maxDuration` de 30 s. O tamanho é verificado pelo
  `Content-Length` antes de ler o corpo.
- **Resiliência:** 5 s por tentativa incluindo o corpo, 2 novas tentativas com espera exponencial e
  variação aleatória, `Retry-After` com teto, login limitado a 10 s, redirecionamentos não
  seguidos.
- **Cancelamento:** cliente desconectado interrompe as consultas em andamento.
- **`Sec-Fetch-Site`:** recusa envios disparados por outra origem. Não é proteção contra
  CSRF (não há sessão do usuário) nem impede chamadas diretas; evita que terceiros usem os
  navegadores dos visitantes para gastar a cota da API. A proteção real são os limites.
- **Testes:** caso de uso com gateway falso; adaptador com MSW e dois servidores HTTP locais (o
  redirecionamento só é provado com `fetch` real). Em cada camada, defeitos foram injetados um a um
  numa cópia do código para confirmar que algum teste falha (teste de mutação manual).

## Consequências

- (+) Um upload, resultados progressivos, credenciais só no servidor, custo por envio limitado.
- (+) Trocar a API é trocar o adaptador; o caso de uso e a rota não mudam.
- (−) Sem limite por cliente (_rate limit_): numa função sem estado ele não seria confiável; fica
  para a borda do deploy, se necessário.
- (−) Arquivos com mais de 200 itens precisam ser divididos.

## Evidências

- [`src/application/remittance/`](../../src/application/remittance/),
  [`src/infra/fattor/`](../../src/infra/fattor/),
  [`src/app/api/remittances/`](../../src/app/api/remittances/) e testes.
- [docs/api.md](../api.md) — contrato da rota e da API externa.
- Teste manual com o build de produção e a API real: arquivo da prova → 5 `authorized`,
  2 `cancelled`, 2 `rejected`, 1 `denied` em 1,3 s.
