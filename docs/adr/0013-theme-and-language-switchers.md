# 0013. Tema e idioma escolhidos pelo usuário, salvos em cookie e aplicados no servidor

- Status: Aceito
- Data: 2026-10-01
- Substitui: —
- Substituído por: —

## Contexto

O tema seguia só `prefers-color-scheme` e o idioma só o cookie `NEXT_LOCALE` ou o
`Accept-Language` ([ADR 0005](0005-internationalization.md)), sem controle na tela. A CSP de
scripts deve poder usar nonce ([ADR 0008](0008-security-headers.md)), então a solução não pode
depender de script inline. Os tokens de cor já passam no contraste AA nos dois temas
([ADR 0004](0004-ui-foundation.md)).

## Opções consideradas

- **`next-themes`** — padrão do shadcn, mas aplica o tema com um script inline antes da hidratação
  (exige nonce ou `unsafe-inline`) e acrescenta uma dependência para algo que o servidor já
  resolve com um cookie.
- **`localStorage` + script inline próprio** — mesmo problema de CSP; sem o script, a página pisca
  no tema errado.
- **Cookie lido pelo servidor** — o HTML já sai com o tema certo, sem script e sem flash.

## Decisão

O tema fica no cookie `theme` (`light` ou `dark`); sem cookie, segue o sistema. O `RootLayout` lê o
cookie e só renderiza `<html data-theme>` quando ele existe.

- **Três estados:** sistema (padrão), claro e escuro. Escolher "sistema" apaga o cookie.
- **Variante `dark` do Tailwind:** aplica-se com `prefers-color-scheme: dark` quando a raiz não tem
  `data-theme="light"`, ou sempre que há `data-theme="dark"`. O `:not` é ancorado em `:root`; sem
  isso, qualquer elemento sem o atributo casaria. `color-scheme` acompanha a variante.
- **Server Actions com formulário:** `setTheme` e `setLocale` validam o valor (valor inválido não
  grava nada) e gravam o cookie com `path=/`, `SameSite=Lax`, `HttpOnly`, `Secure` em produção e
  validade de um ano. Gravar cookie numa Server Action já re-renderiza a página; sem JavaScript, o
  formulário faz POST e a página volta com a escolha aplicada.
- **Barra superior:** um `<header>` com o nome do app e dois grupos de botões com `aria-pressed`.
  Os de tema são ícones com nome acessível do catálogo; os de idioma mostram "PT"/"EN" e têm o
  nome completo em texto oculto com `lang`, para o nome acessível conter o texto visível
  (WCAG 2.5.3).

## Consequências

- (+) Sem dependência, sem script inline, sem flash; compatível com CSP por nonce.
- (+) Os tokens de cor e o contraste não mudam; só muda quando o tema escuro se aplica.
- (−) `cookies()` torna o layout dinâmico, o que ele já era por causa do next-intl.
- (−) O cookie de tema não acompanha o usuário entre navegadores, como qualquer preferência local.
- (−) Com `Secure` em produção, um build de produção servido por HTTP simples fora de `localhost`
  (ex.: Docker num IP da rede local) não grava o cookie e os botões não têm efeito; o deploy
  público é HTTPS.

## Evidências

- [`src/lib/theme.ts`](../../src/lib/theme.ts),
  [`src/features/preferences/preferences-actions.ts`](../../src/features/preferences/preferences-actions.ts)
  e testes; [`src/app/layout.tsx`](../../src/app/layout.tsx),
  [`src/app/globals.css`](../../src/app/globals.css).
- E2E [`tests/e2e/preferences.spec.ts`](../../tests/e2e/preferences.spec.ts): persistência,
  HTML do servidor, tema do sistema, troca de idioma, teclado e axe com os temas forçados.
