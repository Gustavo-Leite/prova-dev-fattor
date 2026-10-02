# Arquitetura

Como o código está organizado **hoje**. O porquê de cada escolha está nos
[ADRs](adr/README.md), linkados em cada seção; este documento não repete as justificativas.

## 1. Fluxo de uma consulta

```
Navegador                              Servidor Next.js (Vercel)                     API Fattor
─────────                              ───────────────────────────────               ──────────
/entrar ── Server Action ──────────►   portão: só a credencial do env
                                       POST /login ──────────────────────────────►   token (1 h)
        ◄── cookie `session` HttpOnly  token.exp.HMAC(SESSION_SECRET)

/  upload do .rem
   valida no navegador (mesmo parser) → erros por linha, sem chamar o servidor
   │
   └── POST /api/remittances ───────►  confere Sec-Fetch-Site/Origin e o selo do cookie
                                       valida de novo (fronteira de confiança)
                                       checkRemittance(): 5 consultas simultâneas ─► GET /status/{chave}
        ◄── NDJSON, 1 linha por item ─ prazo total de 25 s, novas tentativas em 5xx/429
lista progressiva (filtros, busca, paginação, CSV)
```

- O navegador nunca fala com a API da Fattor: ela não envia CORS e o token não sai do cookie
  `HttpOnly` ([ADR 0011](adr/0011-fattor-api-integration.md), [`docs/api.md`](api.md)).
- 401 da Fattor no meio da consulta encerra o stream com "sessão expirada"; a página mantém os
  itens já recebidos e oferece entrar de novo, sem relogin automático
  ([ADR 0015](adr/0015-user-session.md)).
- O estado da consulta vive num provider do layout `(app)`: sobrevive entre `/` e `/cnab-444` e
  some ao sair do grupo ou recarregar, sem storage do navegador
  ([ADR 0017](adr/0017-keep-check-state-in-app-layout.md)).

## 2. Camadas

As dependências apontam para dentro. A regra é verificada pelo `eslint-plugin-boundaries`
([`eslint.config.mjs`](../eslint.config.mjs)) e quebra o lint, não depende de revisão
([ADR 0002](adr/0002-layered-architecture.md)). O desenho é simplificado; a tabela é a regra
exata.

```
app ──► features ──► components ──► lib
 │         │
 │         └──► domain ◄── application ◄── infra
 └──► (pode usar todas)
```

| Pasta                    | Responsabilidade                                                                                                                                          | Pode importar                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `src/domain/`            | Regras puras: layout CNAB 444, decodificação, parser e validações, chave da NF-e (DV módulo 11), situações da nota. Sem React, Next nem módulos do Node   | só `domain`                                           |
| `src/application/`       | Casos de uso e portas: `checkRemittance` (concorrência, prazo, eventos do stream), `InvoiceStatusGateway`, `Authenticator`                                | `domain`                                              |
| `src/infra/`             | Adaptadores: cliente da API Fattor (contratos Zod em `*.contract.ts`, tempo limite, novas tentativas, corpo limitado), portão de credencial, env validado | `domain`, `application`                               |
| `src/features/`          | UI por funcionalidade: `remittance` (upload e lista), `cnab` (página do layout), `session` (login), `preferences` (tema e idioma)                         | `domain`, `components`, `lib`; tipos de `application` |
| `src/components/`        | Componentes compartilhados (`StatusBadge`, `AppNav`, `ErrorFallback`) e os do shadcn em `ui/`                                                             | `components`, `lib`; tipos de `domain`                |
| `src/lib/`               | Utilitários sem regra de negócio: cookie de sessão selado, CSP, rotas, tema, idioma                                                                       | só `lib`                                              |
| `src/i18n/`              | Configuração do next-intl e catálogos `messages/{pt-BR,en}.json`                                                                                          | `i18n`, `lib`                                         |
| `src/app/`               | Rotas finas: páginas, Server Actions, `api/remittances` (HTTP ↔ caso de uso), páginas de erro                                                             | todas                                                 |
| `src/proxy.ts`           | Nonce da CSP por requisição e redirecionamento de `/` para `/entrar` sem sessão                                                                           | fora da regra (arquivo de entrada do Next)            |
| `src/instrumentation.ts` | Valida o ambiente na subida do servidor e encerra o processo se faltar algo ou for inválido                                                               | fora da regra (arquivo de entrada do Next)            |

Por que isso importa:

- **Reaproveitamento:** o parser e o caso de uso rodam em qualquer lugar (outra UI, CLI, job)
  sem mudança. O mesmo parser valida no navegador e no servidor.
- **Testabilidade:** o domínio é testado sem mocks; o caso de uso, com um gateway falso; o
  adaptador, com MSW.
- **Evolução:** outro layout CNAB é outra tabela de campos; outra API de status é outro adaptador.
- **Layout declarativo:** `domain/cnab/layout.ts` é a única fonte das posições que o parser usa,
  e só tem as colunas estáveis ([ADR 0010](adr/0010-cnab-444-parser.md)).

**Componentes do shadcn.** Ficam em `src/components/ui/` como gerados
([ADR 0004](adr/0004-ui-foundation.md)), com uma exceção: o `cva` do botão foi extraído para
`button-variants.ts`, para as páginas de erro usarem o estilo sem carregar o Base UI. Um `bunx shadcn add button --overwrite` recria o `cva` dentro de
`button.tsx`; depois dele, refazer a extração.

## 3. Segurança

| Ameaça                                                      | Defesa                                                                                                                                 | ADR                                                                                          |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Entrar com qualquer credencial (a API de demo aceita todas) | Portão: só a credencial de `SIGN_IN_EMAIL`/`SIGN_IN_PASSWORD`, comparada em tempo constante                                            | [0015](adr/0015-user-session.md)                                                             |
| Token obtido direto da API gravado no cookie                | Cookie `token.exp.HMAC-SHA256(SESSION_SECRET)`; `exp` no selo, com teto de 24 h                                                        | [0015](adr/0015-user-session.md)                                                             |
| Roubo do token por script                                   | Cookie `HttpOnly`, `Secure` em produção, `SameSite=Lax`; CSP com nonce por requisição                                                  | [0015](adr/0015-user-session.md), [0016](adr/0016-nonce-content-security-policy.md)          |
| Requisição forjada de outro site                            | A rota de upload confere `Sec-Fetch-Site` e `Origin` antes de ler o corpo; Server Actions com a mesma regra do Next                    | [0011](adr/0011-fattor-api-integration.md), [0015](adr/0015-user-session.md)                 |
| Clickjacking, _tabnabbing_ reverso, XS-Leaks                | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, COOP e CORP `same-origin`; HSTS emitido pela borda da Vercel                        | [0008](adr/0008-security-headers.md), [0020](adr/0020-cross-origin-isolation-headers.md)     |
| Arquivo malicioso ou grande demais                          | 128 KiB e 200 títulos por envio; decodificação estrita; só o alfabeto imprimível do windows-1252; tudo em tempo linear                 | [0018](adr/0018-utf8-bom-and-trailing-padding.md), [0021](adr/0021-windows-1252-alphabet.md) |
| Resposta da API inesperada ou enorme                        | Contratos Zod, corpo limitado a 16 KiB, redirecionamentos não seguidos, tempo limite por tentativa                                     | [0011](adr/0011-fattor-api-integration.md)                                                   |
| Força bruta no login                                        | Mensagem genérica de erro; regra de limite por IP em `POST /entrar` no Firewall da Vercel, configurada no painel (fora do repositório) | risco aceito no [0015](adr/0015-user-session.md); a regra veio no deploy                     |
| Abuso do upload                                             | Sessão obrigatória e os limites acima; sem regra de limite por IP (o plano gratuito da Vercel permitiu uma regra só, usada no login)   | lacuna registrada no [0011](adr/0011-fattor-api-integration.md); risco aceito                |
| Segredo no repositório ou exposto ao navegador              | Env só no servidor (`server-only`, sem `NEXT_PUBLIC_`), validado com Zod e sem valor padrão; gitleaks no CI                            | [0006](adr/0006-server-environment.md), [0007](adr/0007-quality-and-ci.md)                   |

## 4. Testes

| Nível                 | Ferramenta                      | Cobre                                                                                                    |
| --------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Unitário e integração | Vitest + MSW, ao lado do código | Parser e decodificação, caso de uso, adaptadores da API, sessão, rota de upload, componentes e catálogos |
| E2E e acessibilidade  | Playwright + axe, `tests/e2e/`  | A interface em desktop e celular, temas claro e escuro, sem JavaScript, cabeçalhos de segurança          |
| Smoke do deploy       | Playwright, `tests/smoke/`      | A URL pública, com login real e consulta na API da Fattor                                                |

Os E2E sobem o build de produção com uma API da Fattor inalcançável; a sessão é um cookie selado
de teste e as respostas de `/api/remittances` são simuladas no navegador. O login com sucesso e o
caminho servidor → Fattor ficam com os testes de integração (MSW) e com o smoke.

## 5. CI e deploy

| Workflow                                                    | Quando                                       | Jobs                                                                                                         |
| ----------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [`ci.yml`](../.github/workflows/ci.yml)                     | PR e push na `main`                          | `quality` (format, lint, tipos, testes), `build-e2e` (build de produção + E2E com axe), `secrets` (gitleaks) |
| [`deploy-smoke.yml`](../.github/workflows/deploy-smoke.yml) | Deploy de produção concluído, ou manualmente | `smoke` contra `vars.SMOKE_BASE_URL`, com a credencial em secrets; sem trace nem artifact                    |

A `main` só recebe merge por PR com os três jobs do `ci.yml` verdes
([ADR 0007](adr/0007-quality-and-ci.md)). O deploy é feito pela integração da Vercel com o GitHub:
cada push na `main` gera um deploy de produção. A região das funções é configurada no painel do
projeto (São Paulo, `gru1`, perto da API), fora do repositório.
