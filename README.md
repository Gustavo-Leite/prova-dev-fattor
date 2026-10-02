# Consulta de Status CNAB 444

Solução da prova técnica de desenvolvimento da Fattor ([enunciado](_prova/README.md)): uma página
web que recebe um arquivo de remessa **CNAB 444**, valida o layout, extrai a **chave de acesso da
NF-e** de cada título e consulta a **situação** de cada nota na API da Fattor, exibindo os
resultados à medida que chegam.

**Deploy:** <https://prova-dev-fattor-livid.vercel.app>

Para entrar, use a credencial pública de demonstração, a mesma da
[documentação da API](https://symphony.fattorcredito.com.br/public/prova-dev/swagger):
`demo@prova.dev` / `demo123`. Depois, envie o arquivo [`_prova/meu_cnab.rem`](_prova/meu_cnab.rem).
O resultado esperado é 5 notas autorizadas, 2 canceladas, 2 rejeitadas e 1 denegada.

## Sumário

1. [O que foi entregue](#1-o-que-foi-entregue)
2. [Como rodar](#2-como-rodar)
3. [Testes e qualidade](#3-testes-e-qualidade)
4. [Documentação](#4-documentação)
5. [Decisões em destaque](#5-decisões-em-destaque)
6. [Limitações e próximos passos](#6-limitações-e-próximos-passos)
7. [Créditos](#7-créditos)

## 1. O que foi entregue

| Pedido do enunciado                     | Onde está                                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentar o CNAB 444                   | [`docs/cnab-444.md`](docs/cnab-444.md): o que é, estrutura, quais dados o arquivo contém e onde. A página `/cnab-444` mostra o layout com a linha da amostra destacada coluna a coluna                        |
| Login e consulta de status de cada item | [`docs/api.md`](docs/api.md): a API da Fattor, a rota da aplicação e o protocolo de resposta                                                                                                                  |
| Página com upload e lista               | Página `/`: upload do `.rem`, lista com **identificador** (chave da NF-e) e **situação** de cada título                                                                                                       |
| Documentação clara do layout            | [`docs/cnab-444.md`](docs/cnab-444.md), com posições, glossário e fontes                                                                                                                                      |
| Tratamento de erros                     | Sessão expirada (com link para entrar de novo, mantendo os itens já consultados), arquivo inválido (erro por linha), falha da API (item marcado como falha, com "consultar de novo"). Mensagens em pt-BR e en |
| Validação antes de chamar a API         | O mesmo parser roda no navegador (resposta imediata) e no servidor (fronteira de confiança): 444 colunas, tipos de registro, total do trailer e formato da chave                                              |
| Testes                                  | Unitários e de integração (Vitest + MSW) para o parser, o caso de uso e a API; E2E (Playwright + axe) da interface; smoke contra o deploy, com login real e consulta na API                                   |
| Acessibilidade e responsividade         | Navegação por teclado, foco gerenciado, anúncios para leitor de tela, contraste AA nos temas claro e escuro (axe no CI); tabela no desktop e cards no celular                                                 |
| Performance                             | Um único upload; o servidor consulta com concorrência limitada e transmite cada resultado assim que chega (NDJSON)                                                                                            |
| Deploy público                          | Vercel, link acima                                                                                                                                                                                            |
| README do fork                          | Este arquivo                                                                                                                                                                                                  |

Além do pedido: filtros e busca na lista, paginação, exportação em CSV, detalhe de cada título
com o "raio-X" da linha, tema claro/escuro e idioma pt-BR/en.

## 2. Como rodar

**Pré-requisitos:** [Node.js 24](https://nodejs.org) (versão em [`.nvmrc`](.nvmrc)),
[Bun 1.3.14](https://bun.sh) (versão em `packageManager` do [`package.json`](package.json)) e
`openssl` para gerar o segredo da sessão. O Bun é só o gerenciador de pacotes; o Next roda no
Node ([ADR 0001](docs/adr/0001-package-manager-and-runtime.md)).

```bash
git clone https://github.com/Gustavo-Leite/prova-dev-fattor.git
cd prova-dev-fattor
cp .env.example .env
```

Abra o `.env` e preencha `SESSION_SECRET` com um valor aleatório gerado por:

```bash
openssl rand -base64 32
```

O segredo precisa ter pelo menos 32 caracteres e não pode ser repetitivo; um valor escrito à mão
pode ser recusado. As outras variáveis já vêm preenchidas com a URL da API e a credencial pública de
demonstração. Todas são validadas ao iniciar: se faltar alguma ou for inválida, o servidor para
com uma mensagem dizendo qual.

```bash
bun install
bun dev
```

Acesse <http://localhost:3000>, entre com a credencial de demonstração e envie
`_prova/meu_cnab.rem`.

Para rodar a versão de produção: `bun run build` e depois `bun run start`.

## 3. Testes e qualidade

| Comando                | O que faz                                                         |
| ---------------------- | ----------------------------------------------------------------- |
| `bun run test`         | Testes unitários e de integração (Vitest; a API simulada com MSW) |
| `bun run test:e2e`     | Build de produção + testes E2E e de acessibilidade (Playwright)   |
| `bun run lint`         | ESLint, incluindo a regra de camadas                              |
| `bun run typecheck`    | TypeScript em modo estrito                                        |
| `bun run format:check` | Prettier                                                          |

Antes do primeiro `test:e2e` na sua máquina, instale o navegador com
`bunx playwright install chromium`. Os testes E2E não chamam a API da Fattor: a sessão é um
cookie selado de teste e as respostas de `/api/remittances` são simuladas no navegador, então
rodam sem rede e sem credencial real. O login e o caminho servidor → Fattor ficam com os testes
de integração e com o smoke. No CI,
eles rodam na imagem oficial do Playwright ([ADR 0009](docs/adr/0009-e2e-playwright-container.md)).

**Smoke do deploy.** O workflow `Deploy smoke` roda 4 testes contra a URL pública depois de cada
deploy de produção na Vercel. Também pode ser disparado manualmente na aba Actions. Ele confere:

- a página de login com os cabeçalhos de segurança e sem violações de acessibilidade;
- o redirecionamento sem sessão;
- a recusa do upload sem sessão;
- um login real com a consulta do `meu_cnab.rem`.

Para rodar na sua máquina:

```bash
SMOKE_BASE_URL=https://prova-dev-fattor-livid.vercel.app \
SMOKE_SIGN_IN_EMAIL=demo@prova.dev SMOKE_SIGN_IN_PASSWORD=demo123 \
bun run test:smoke
```

No GitHub, a URL fica na variável `SMOKE_BASE_URL` e a credencial nos secrets
`SMOKE_SIGN_IN_EMAIL` e `SMOKE_SIGN_IN_PASSWORD`. Elas ficam fora do `.env.example`, que o CI
copia para o `.env` do app. Se só o teste de login falhar, a causa pode ser a API da Fattor fora
do ar.

**CI:** todo PR para a `main` só entra com os jobs `quality`, `build-e2e` e `secrets` verdes
([ADR 0007](docs/adr/0007-quality-and-ci.md)); detalhes em
[`docs/architecture.md`](docs/architecture.md#5-ci-e-deploy).

## 4. Documentação

| Documento                                      | Conteúdo                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| [`docs/cnab-444.md`](docs/cnab-444.md)         | O formato CNAB 444, o layout de referência, o arquivo da prova e a chave da NF-e |
| [`docs/api.md`](docs/api.md)                   | A API da Fattor, a rota `POST /api/remittances`, o protocolo NDJSON e os limites |
| [`docs/architecture.md`](docs/architecture.md) | Como o código está organizado hoje: fluxo, camadas, segurança, testes e CI       |
| [`docs/adr/`](docs/adr/README.md)              | O porquê de cada decisão relevante, com as opções consideradas                   |

## 5. Decisões em destaque

- **Um servidor entre a página e a API (BFF).** A API da Fattor não envia cabeçalhos CORS, e o
  token não deve ficar ao alcance do JavaScript da página. O navegador envia o arquivo uma vez, e
  o servidor devolve os resultados em NDJSON, um por linha, à medida que cada consulta termina
  ([ADR 0011](docs/adr/0011-fattor-api-integration.md)).
- **A API de demonstração aceita qualquer e-mail e senha.** Por isso o app só libera a credencial
  configurada no ambiente, comparada em tempo constante. O token da Fattor fica num cookie
  `HttpOnly` assinado pelo servidor, para que um token obtido direto da API não abra a sessão
  ([ADR 0015](docs/adr/0015-user-session.md)).
- **Parser puro, só com as colunas estáveis.** O arquivo da prova só coincide com o layout de
  referência no tipo de registro, no tamanho de 444 colunas e na chave em 401–444. A extração usa
  só essas posições ([ADR 0010](docs/adr/0010-cnab-444-parser.md)).
- **Camadas verificadas por lint.** O domínio não importa nada de framework ou I/O, e a regra
  de lint falha no CI se alguém tentar ([ADR 0002](docs/adr/0002-layered-architecture.md)).
- **CSP com nonce por requisição.** Nenhum script inline sem nonce é executado
  ([ADR 0016](docs/adr/0016-nonce-content-security-policy.md)).

Sem Docker: a Vercel não roda container e o app não tem serviço próprio (banco, fila) para
empacotar; um container entraria se surgisse um backend próprio. A lista completa de decisões está no [índice de ADRs](docs/adr/README.md).

## 6. Limitações e próximos passos

- **Limite de requisições no upload.** O login tem uma regra de limite por IP no Firewall da
  Vercel, configurada no painel do projeto (fora do repositório). O upload não tem: o plano
  gratuito permitiu uma regra só. Cada envio já é limitado (sessão
  obrigatória, 128 KiB, 200 títulos, 5 consultas simultâneas), mas em produção eu adicionaria a
  mesma regra também em `/api/remittances`.
- **Logout sem revogação.** Sair apaga o cookie, mas o token continua válido na Fattor até expirar
  (no máximo 1 h), porque a API não tem rota de revogação.
- **Dependências.** Em produção, rever o [ADR 0007](docs/adr/0007-quality-and-ci.md) (hoje sem
  Dependabot) e ativá-lo para as actions e o Bun, com espera de 7 dias para versões novas; atualizar
  periodicamente a imagem do gitleaks, hoje fixada por digest.

## 7. Créditos

Projeto de avaliação técnica, sem vínculo oficial com a Fattor Crédito. A foto do prédio da tela
de login e o ícone do app vêm do site [fattorcredito.com.br](https://www.fattorcredito.com.br).
