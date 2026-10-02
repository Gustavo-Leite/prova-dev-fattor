# 0015. Sessão por usuário com cookie selado

- Status: Aceito
- Data: 2026-10-02
- Substitui: 0006 (parcialmente: credenciais da API no ambiente) e 0011 (parcialmente: sessão
  compartilhada, relogin automático e a justificativa de CSRF do `Sec-Fetch-Site`)
- Substituído por: —

## Contexto

Até aqui o servidor fazia login na API da Fattor com credenciais do ambiente e renovava o token
sozinho ([ADR 0011](0011-fattor-api-integration.md)). O enunciado lista como diferencial o
tratamento de "token expirado" na página, que o relogin automático tornava invisível.

Fatos verificados contra a API de demonstração (01/10/2026):

- `POST /login` responde 200 com um token válido para **qualquer** e-mail e senha;
- esse token funciona em `GET /status/{chave}`; só um token forjado recebe 401;
- a API não oferece logout nem revogação.

## Opções consideradas

- **Manter credenciais do sistema com relogin** — o token expirado nunca chega à página.
- **Token no `localStorage`** — exposto a qualquer script injetado (XSS).
- **Sessão própria com o token guardado no servidor** — exige armazenamento (KV); não cabe numa
  função sem estado.
- **Token da Fattor num cookie `HttpOnly` selado pelo servidor** — sem estado no servidor, fora
  do alcance do JavaScript da página, e verificável a cada requisição.

## Decisão

O usuário entra em `/entrar`; o servidor libera só a credencial configurada, guarda o token da
Fattor num cookie `HttpOnly` selado com HMAC e exige esse selo em todas as rotas protegidas.

- **Tela de login** (`/entrar`, fora do route group `(app)`, sem a barra do app): Server Action
  com Zod; mensagem genérica para credencial recusada (sem enumeração); a senha nunca volta no
  estado do formulário; ajuda num Popover que abre no hover, no toque e no teclado.
- **Portão de credencial:** como a API de demo aceita qualquer credencial, um decorator de
  `Authenticator` compara e-mail (minúsculo) e senha com `SIGN_IN_EMAIL`/`SIGN_IN_PASSWORD` do
  ambiente antes de chamar a Fattor. A comparação é em tempo constante (SHA-256 dos dois lados e
  `timingSafeEqual`, sem curto-circuito). Sem hash da senha no ambiente: ela é pública no
  Swagger, e o hash só acrescentaria formato sem proteger nada. As credenciais de demo ficam no
  `.env.example`; em deploy, troca-se pela credencial desejada.
- **Cookie `session`:** `HttpOnly`, `Secure` em produção, `SameSite=Lax`, `Path=/`, `maxAge` =
  validade do token menos `min(60 s, metade)`, com teto de 24 h. O valor é
  `token.exp.HMAC-SHA256(exp.token, SESSION_SECRET)`:
  - o selo impede gravar à mão um token pedido direto à Fattor;
  - a expiração entra no selo porque o servidor não confia no `maxAge` guardado pelo navegador;
  - a separação é pelos dois últimos pontos (o token pode ser JWT) e a verificação usa
    `crypto.subtle.verify` (tempo constante);
  - `SESSION_SECRET` é obrigatório (32+ caracteres), vazio no `.env.example` e gerado com
    `openssl rand -base64 32`; trocá-lo encerra todas as sessões.
  - Não usamos cifragem (o guia do Next cifra a sessão com jose porque guarda dados gerados pelo
    app): aqui o conteúdo é um token opaco da Fattor e o cookie já é `HttpOnly`.
- **Onde a sessão é exigida:**
  - `proxy.ts` redireciona `/` sem selo válido para `/entrar` (checagem otimista; `/cnab-444` é
    pública);
  - `POST /api/remittances` checa `Sec-Fetch-Site` → `Origin` (mesma regra das Server Actions:
    primeiro valor de `x-forwarded-host` ou `host`; `null` ou inválido → 403) → sessão
    (401 `SESSION_EXPIRED`) → corpo. Agora existe sessão do usuário, então a checagem de
    `Origin` é a proteção contra CSRF que o ADR 0011 dizia não ser necessária;
  - o gateway da Fattor é criado por requisição com o token da sessão, sem cache nem relogin.
- **Sessão expirada na página:** um 401 da Fattor no meio da consulta encerra o stream com o
  evento `failed` (nome mantido: só o motivo `UPSTREAM_REJECTED_CREDENTIALS` o produz). A tela
  mostra "Sua sessão expirou." com o link "Entrar de novo", mantém os itens recebidos e esconde
  o botão de repetir; o foco vai ao link só se estava no botão que sumiu.
- **Sair:** Server Action apaga o cookie (mesmo `path` do set, `sessionCookiePath`) e volta para
  `/entrar`; o botão só aparece com selo válido e funciona sem JavaScript. Não há logout por GET.
- **Rotas compartilhadas:** `signInPath` e `homePath` em `src/lib/routes.ts`, usados pelo proxy,
  pelas actions e pela interface.

## Consequências

- (+) O "token expirado" passa a ser tratado na página, com caminho de volta.
- (+) Nenhuma credencial nem token chega ao JavaScript do navegador; o segredo do selo só existe
  no servidor (`server-only`, sem `NEXT_PUBLIC_`), verificado num build de produção.
- (+) Um token obtido fora do app não abre o app.
- (−) O portão protege o app, não a API: quem chamar a Fattor direto continua obtendo token.
- (−) Força bruta: a checagem é local e sem limite de tentativas; o limite por cliente fica para
  a borda do deploy (como no ADR 0011).
- (−) Logout não revoga o token na Fattor (a API não oferece isso); ele vale até expirar.
- (−) Depois de uma recusa da Fattor, o cookie local continua válido até o `exp`; o link leva a
  `/entrar`, e o novo login o substitui. Não há `returnTo` (evita redirecionamento aberto), então
  o arquivo selecionado se perde no novo login.
- (−) Sem prefixo `__Host-` no cookie: ele exige `Secure`, ligado só em produção, e o nome
  mudaria por ambiente. Mitigação: `HttpOnly`, `SameSite=Lax`, `Path=/` e o selo.
- (−) A página 404 e `/entrar` não têm a barra do app.
- (−) Premissa de deploy: `x-forwarded-host` só é confiável quando escrito por um proxy confiável
  (Vercel ou reverse proxy da etapa 6); um navegador não consegue defini-lo numa requisição
  cross-site.

## Evidências

- Login: [`src/app/entrar/`](../../src/app/entrar/),
  [`src/application/session/authenticator.ts`](../../src/application/session/authenticator.ts),
  [`src/infra/fattor/fattor-authenticator.ts`](../../src/infra/fattor/fattor-authenticator.ts),
  [`src/infra/session/credential-gated-authenticator.ts`](../../src/infra/session/credential-gated-authenticator.ts).
- Sessão: [`src/lib/session-cookie.ts`](../../src/lib/session-cookie.ts),
  [`src/proxy.ts`](../../src/proxy.ts),
  [`src/app/api/remittances/`](../../src/app/api/remittances/),
  [`src/app/(app)/sign-out-action.ts`](<../../src/app/(app)/sign-out-action.ts>),
  [`src/lib/routes.ts`](../../src/lib/routes.ts), [`src/infra/env.ts`](../../src/infra/env.ts).
- Testes: unidades de cada módulo acima e E2E em
  [`tests/e2e/login.spec.ts`](../../tests/e2e/login.spec.ts),
  [`session.spec.ts`](../../tests/e2e/session.spec.ts) e
  [`check.spec.ts`](../../tests/e2e/check.spec.ts). O sucesso do login real só é exercitado em
  teste unitário e manualmente (o E2E usa a API inalcançável); conferido no navegador com o build
  de produção.
- Commits: 19efbce, 60edf26, 5d9fdf3, cabf164, 2284b17, 9f406fc, 83bcd18, b3d467f.
- Documentação do Next.js: guias de autenticação, `proxy.ts`, `cookies` e `serverActions`.
