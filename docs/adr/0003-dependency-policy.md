# 0003. Política de dependências

- Status: Aceito
- Data: 2026-09-30
- Substitui: —
- Substituído por: —

## Contexto

Ataques à cadeia de suprimentos costumam vir de versões recém-publicadas ou de scripts de
instalação. Ao mesmo tempo, versões antigas acumulam vulnerabilidades: o Next.js 16.3.6 corrigiu
uma execução remota de código no `next/og` que afetava as versões 16.2.0 a 16.3.5. Este ADR
responde a uma pergunta:
**como uma dependência entra e é fixada no projeto**.

## Opções consideradas

- **Faixas de versão (`^`) e instalação livre** — atualização automática; builds diferentes podem
  instalar código diferente.
- **Versões exatas com lockfile e regras de entrada** — builds reprodutíveis e controle do que
  entra; exige atualização deliberada.

## Decisão

Toda dependência entra com versão exata, publicada há pelo menos 7 dias, sem scripts de instalação
e declarada no `package.json` de quem a importa.

- `exact = true` e `minimumReleaseAge = 604800` no Bun; o `bun.lock` é instalado congelado no CI.
- `trustedDependencies: []`: nenhum script de ciclo de vida de dependência é executado.
- `import/no-extraneous-dependencies` reprova imports de pacotes não declarados (inclusive os que
  chegam como dependência de outra) e de dependências de desenvolvimento fora dos testes.
- Versão maior recém-lançada espera amadurecer: Vitest 4.1 em vez do 5.0 (4 semanas de vida).
- Correção de segurança define o piso: Next.js 16.3.6.

## Consequências

- (+) Builds reprodutíveis e superfície de ataque menor na instalação.
- (+) Uma dependência "fantasma" (como o `zod` v3 trazido por outro pacote) não entra no código.
- (−) Atualizações são manuais; uma correção urgente exige ação consciente.

## Evidências

- [`bunfig.toml`](../../bunfig.toml), [`package.json`](../../package.json),
  [`eslint.config.mjs`](../../eslint.config.mjs).
- Commits `185a966` (versões exatas e idade mínima), `49fcca7` (dependências não declaradas) e
  `1f0f433` (Vitest 4).
