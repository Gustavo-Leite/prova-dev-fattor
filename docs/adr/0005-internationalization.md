# 0005. Internacionalização

- Status: Aceito
- Data: 2026-09-30
- Substitui: —
- Substituído por: —

## Contexto

A aplicação é de página única e será avaliada por uma banca brasileira, mas precisa atender
visitantes em inglês. Texto de interface escrito direto no JSX se espalha e não é traduzível; o
idioma declarado no `<html>` precisa corresponder ao conteúdo (WCAG 3.1.1).

## Opções consideradas

- **next-intl com prefixo na URL (`/pt-BR`, `/en`)** — bom para SEO; URL mais complexa sem ganho
  para uma ferramenta de página única.
- **next-intl sem prefixo** — URL simples; o idioma vem da requisição e a página fica dinâmica.
- **Dicionário próprio** — sem dependência; reimplementa formatação, plurais e tipagem.

## Decisão

Os textos vêm de catálogos do next-intl, e o idioma é o do cookie `NEXT_LOCALE` quando válido,
senão o negociado pelo `Accept-Language`, com pt-BR como padrão.

- Padrão pt-BR: a banca avaliadora é brasileira e prévias de link não enviam `Accept-Language`.
- Negociação por função pura e testada (pesos `q` conforme a RFC 9110).
- `src/i18n` é uma camada: configuração, catálogos e tipos juntos. A negociação fica em `lib`,
  porque o futuro seletor de idioma (em `components`) precisa importá-la.
- As chaves são tipadas: faltar uma tradução é erro de compilação.
- O lint reprova texto literal no JSX e em atributos visíveis (`aria-label`, `alt`, `placeholder`,
  `title`); `alt=""` de imagem decorativa é permitido.
- A página 404 também é traduzida, com título próprio.

## Consequências

- (+) Nenhum texto de interface fora dos catálogos, com verificação automática.
- (−) A página deixa de ser estática; as respostas saem marcadas como privadas e sem cache.
- (−) O next-intl traz binários nativos do extrator opcional, que não usamos; a imagem de produção
  deve usar o build `standalone` para não carregá-los.
- (−) Ternários aninhados em atributos escapam do lint.

## Evidências

- [`src/i18n/`](../../src/i18n), [`src/lib/locale.ts`](../../src/lib/locale.ts),
  [`src/app/not-found.tsx`](../../src/app/not-found.tsx),
  [`eslint.config.mjs`](../../eslint.config.mjs).
- Commit `bf28928`.
- Documentação: next-intl — App Router sem roteamento por idioma; RFC 9110 §12.4.2.
