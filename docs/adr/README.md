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
| [0006](0006-server-environment.md)              | Ambiente do servidor validado na inicialização, sem valores padrão          | Aceito |
| [0007](0007-quality-and-ci.md)                  | O que bloqueia um merge: testes, lint, E2E com axe e varredura de segredos  | Aceito |
| [0008](0008-security-headers.md)                | Cabeçalhos de segurança HTTP; CSP de scripts com nonce quando houver UI     | Aceito |
| [0009](0009-e2e-playwright-container.md)        | E2E na imagem oficial do Playwright, sem apt nem download do navegador      | Aceito |
| [0010](0010-cnab-444-parser.md)                 | Parser CNAB 444 puro, só com colunas estáveis e erros tipados               | Aceito |

Cada ADR segue o mesmo formato: Contexto, Opções consideradas, Decisão (a primeira linha resume a
decisão), Consequências e Evidências (arquivos que aplicam a regra e o commit em que ela entrou).
