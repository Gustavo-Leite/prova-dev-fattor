# 0004. Fundação da interface

- Status: Aceito
- Data: 2026-09-30
- Substitui: —
- Substituído por: —

## Contexto

A interface precisa de componentes acessíveis (dialog, tooltip, tabela, paginação), identidade
alinhada à empresa avaliadora e contraste adequado nos temas claro e escuro. O shadcn/ui passou a
oferecer duas bases de componentes e a usar um motor próprio de mesclagem de classes.

## Opções consideradas

- **shadcn/ui sobre Radix** — maduro; desenvolvimento desacelerado desde 2025.
- **shadcn/ui sobre Base UI** — padrão atual do shadcn, mantido ativamente, versão estável.
- **Biblioteca de componentes fechada** — pronta; difícil de adaptar à marca e mais peso.

## Decisão

A interface usa shadcn/ui sobre Base UI, com tokens de cor da marca validados no contraste WCAG AA
e componentes adicionados só quando forem usados.

- Paleta: azul-marinho e dourado da marca; o dourado original só em decoração, e uma versão
  escurecida para texto. Todo par de texto passa 4.5:1 e bordas de controles e foco passam 3:1,
  medidos contra todas as superfícies.
- Tema escuro em um único bloco de tokens, seguindo o sistema do usuário.
- `cn` (motor do shadcn) importado só por `@/lib/utils`; o lint proíbe o import direto, e um teste
  fixa o comportamento com os tokens do projeto.
- Tipografia Sora (a mesma da marca) e Geist Mono para chaves e valores.
- Favicon da empresa, com aviso no rodapé de que é um projeto de avaliação, não um produto oficial.

## Consequências

- (+) Acessibilidade de contraste garantida por cálculo e verificada pelo axe nos testes E2E.
- (+) Trocar o motor de classes afeta um arquivo.
- (−) Componentes gerados pelo shadcn precisarão de ajuste (ex.: foco em opacidade total).

## Evidências

- [`src/app/globals.css`](../../src/app/globals.css), [`components.json`](../../components.json),
  [`src/lib/utils.ts`](../../src/lib/utils.ts), [`src/lib/utils.test.ts`](../../src/lib/utils.test.ts).
- Commits `49fcca7` (fundação e tokens) e `1f0f433` (teste do `cn`).
- Documentação: WCAG 2.2 (1.4.3 e 1.4.11); shadcn/ui — instalação com Next.js.
