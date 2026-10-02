# Architecture Decision Records

Um ADR registra **por que** uma decisão foi tomada, no momento em que foi tomada — contexto,
opções consideradas e consequências. ADRs não são editados depois de aceitos: uma mudança de
rumo vira um novo ADR com `Substitui: 000N`, e o anterior passa a `Substituído por: 000M`. O
**que existe hoje** (camadas, fluxos, como rodar) ficará em `docs/architecture.md` e no README do
projeto, que apontarão para os ADRs.

| ADR                                             | Decisão                                                                     | Status |
| ----------------------------------------------- | --------------------------------------------------------------------------- | ------ |
| [0001](0001-package-manager-and-runtime.md)     | Bun como gerenciador de pacotes, Node.js 24 como runtime                    | Aceito |
| [0002](0002-layered-architecture.md)            | Camadas com dependências apontando para dentro, verificadas por lint        | Aceito |
| [0003](0003-dependency-policy.md)               | Como uma dependência entra e é fixada no projeto                            | Aceito |
| [0004](0004-ui-foundation.md)                   | shadcn/ui sobre Base UI com tokens da marca validados em contraste          | Aceito |
| [0005](0005-internationalization.md)            | next-intl sem prefixo de URL, idioma do cookie ou do navegador              | Aceito |
| [0006](0006-server-environment.md)              | Ambiente do servidor validado na inicialização, sem valores padrão          | Substituído parcialmente por 0015 |
| [0007](0007-quality-and-ci.md)                  | O que bloqueia um merge: testes, lint, E2E com axe e varredura de segredos  | Aceito |
| [0008](0008-security-headers.md)                | Cabeçalhos de segurança HTTP; CSP de scripts com nonce quando houver UI     | Substituído parcialmente por 0016 |
| [0009](0009-e2e-playwright-container.md)        | E2E na imagem oficial do Playwright, sem apt nem download do navegador      | Aceito |
| [0010](0010-cnab-444-parser.md)                 | Parser CNAB 444 puro, só com colunas estáveis e erros tipados               | Substituído parcialmente por 0018 |
| [0011](0011-fattor-api-integration.md)          | BFF com upload único e resultados em NDJSON; sessão, limites e prazo        | Substituído parcialmente por 0015 |
| [0012](0012-results-list.md) | Filtros, busca e paginação por função pura, sem biblioteca de tabela | Substituído parcialmente por 0019 |
| [0013](0013-theme-and-language-switchers.md) | Tema e idioma em cookie aplicado no servidor, via Server Actions | Aceito |
| [0014](0014-cnab-444-layout-page.md) | Página do layout CNAB 444; posições observadas só para exibição | Aceito |
| [0015](0015-user-session.md) | Sessão por usuário: portão de credencial e cookie `HttpOnly` selado | Aceito |
| [0016](0016-nonce-content-security-policy.md) | CSP com nonce por requisição no proxy; fonte única da política | Aceito |
| [0017](0017-keep-check-state-in-app-layout.md) | Estado da consulta no layout de `(app)`, sem storage do navegador | Aceito |
| [0018](0018-utf8-bom-and-trailing-padding.md) | BOM UTF-8 lido como UTF-8, com recuo para windows-1252; fim do arquivo tolerante | Aceito |
| [0019](0019-results-announcements.md) | Anúncios da lista sem repetição: retrato na montagem e região única | Aceito |
| [0020](0020-cross-origin-isolation-headers.md) | COOP e CORP `same-origin` contra _tabnabbing_ reverso e XS-Leaks | Aceito |

Cada ADR segue o mesmo formato: Contexto, Opções consideradas, Decisão (a primeira linha resume a
decisão), Consequências e Evidências (arquivos que aplicam a regra e o commit em que ela entrou).
