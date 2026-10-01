# 0016. CSP com _nonce_ por requisição emitida pelo `proxy.ts`

- Status: Aceito
- Data: 2026-10-01
- Substitui: 0008 (parcialmente: a parte de CSP)
- Substituído por: —

## Contexto

O [ADR 0008](0008-security-headers.md) emitiu uma CSP estática sem restrição de scripts e
adiou a política com _nonce_ até existirem scripts de cliente. Hoje há upload, lista, diálogo,
troca de tema por Server Action e a página do layout: dá para validar a política de verdade.

## Opções consideradas

- **Manter a CSP estática** — não protege contra injeção de script.
- **CSP com _hash_ ou `'unsafe-inline'`** — o Next injeta scripts inline diferentes por página;
  _hash_ não acompanha, e `'unsafe-inline'` anula o ganho.
- **_Nonce_ por requisição no `proxy.ts`** — caminho do guia de CSP do Next 16; o Next lê o
  _nonce_ do cabeçalho da requisição e o aplica aos próprios scripts e estilos.

## Decisão

O `proxy.ts` gera um _nonce_ por requisição e envia a mesma CSP na requisição (para o Next
renderizar) e na resposta; é a fonte única de CSP, removida do `next.config.ts`.

- Produção: `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'nonce-…'; style-src-attr 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`.
- `style-src-attr 'unsafe-inline'`: o `next/image` renderiza `style="color:transparent"` no SSR
  (`next/dist/shared/lib/get-img-props.js`), e com _nonce_ em `style-src` o `'unsafe-inline'`
  dali seria ignorado. Libera só atributos `style`, não `<style>` nem scripts; com
  `img-src 'self'`, um `style` injetado não consegue vazar dados por `url()` de outra origem.
  Navegador sem `style-src-attr` cai em `style-src` e bloqueia esse `style`: o efeito é só
  visual (o texto alternativo aparece enquanto a imagem carrega).
- Desenvolvimento, como no guia do Next: `'unsafe-eval'` em `script-src` (pilhas de erro do
  React) e `style-src 'self' 'unsafe-inline'`. O resto é igual.
- Sem `upgrade-insecure-requests`: tudo é `'self'` e quebraria o HTTP puro local e no Docker;
  HTTPS é da borda (ADR 0008). Sem cabeçalho `x-nonce`: nada no código o lê.
- O valor que o cliente mandar em `Content-Security-Policy` é sempre sobrescrito; o corpo da
  requisição não é tocado.
- _Nonce_ de 128 bits aleatórios (`crypto.getRandomValues`), o mínimo recomendado pela CSP 3.
- _Matcher_ sem `missing`/`has`: exclui `api/`, `_next/static`, `_next/image` e arquivos
  estáticos por extensão. Pré-carregamentos passam pelo proxy: o _nonce_ custa pouco, e a
  sessão de login planejada (ADR 0015, próxima etapa) vai compor este proxy sem poder ser
  contornada por cabeçalho.
- `api/` fica fora: quando o proxy casa com um POST, o Next lê o corpo inteiro (até 10 MB em
  memória) antes da rota rodar, o que anularia a recusa antecipada por `Content-Length` do
  upload (128 KB). As rotas de API recebem uma CSP estática pelo `next.config.ts`:
  `default-src 'none'; frame-ancestors 'none'` (respondem JSON/NDJSON, nunca HTML).

## Consequências

- (+) Script injetado sem o _nonce_ é bloqueado; o _nonce_ muda a cada requisição.
- (+) Um único lugar define a CSP das páginas; o `next.config.ts` mantém os demais cabeçalhos e
  a CSP estática da API.
- (−) Toda página fica dinâmica (já era, por tema e idioma em cookie).
- (−) Caminhos excluídos do _matcher_ por extensão não recebem a CSP com _nonce_. Recebem a
  CSP-base do `next.config.ts` (`object-src 'none'; base-uri 'self'; form-action 'self';
frame-ancestors 'none'`), sem `script-src`, porque a 404 em HTML de um caminho como
  `/x.png` tem scripts inline sem _nonce_. Nas páginas, o proxy substitui esse valor (um único
  cabeçalho, verificado no build de produção); na API, a regra posterior vence.
- (−) O guia cita `unstable_doesProxyMatch`, mas o Next 16.3.6 instalado só exporta
  `unstable_doesMiddlewareMatch`; o teste usa o nome do pacote e precisa mudar quando ele mudar.
  Os testes do proxy também leem cabeçalhos internos (`x-middleware-request-*`,
  `x-middleware-next`), que não são API pública: acompanham as atualizações do Next.
- (−) O E2E roda só em Chromium (desktop e Pixel 7). WebKit não foi verificado nesta máquina, e
  `style-src-attr` é CSP nível 3.

## Evidências

- [`src/proxy.ts`](../../src/proxy.ts),
  [`src/lib/content-security-policy.ts`](../../src/lib/content-security-policy.ts) (função pura
  testada nos dois modos) e testes do _matcher_.
- E2E [`tests/e2e/security-headers.spec.ts`](../../tests/e2e/security-headers.spec.ts): política
  com _nonce_, _nonce_ novo a cada documento, CSP estática na API, CSP-base nos caminhos fora do
  _matcher_ e zero violações no fluxo
  principal (tema, upload, diálogo, layout).
- Documentação do Next.js: guia de Content Security Policy e `proxy.ts`.
