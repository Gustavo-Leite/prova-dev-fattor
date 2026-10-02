# 0020. Cabeçalhos de isolamento entre origens: COOP e CORP `same-origin`

- Status: Aceito
- Data: 2026-10-02
- Substitui: —
- Substituído por: —

## Contexto

Complementa o [0008](0008-security-headers.md): os cabeçalhos de segurança já impedem o
enquadramento (`X-Frame-Options` e `frame-ancestors`), mas não isolam a janela da aplicação de uma
página de outra origem que a abra com `window.open`. Sem isso, a página que abriu guarda uma
referência à janela e pode trocar a URL dela por uma página falsa de login (_tabnabbing_ reverso)
ou medir propriedades como `window.length` para inferir o estado do usuário (XS-Leaks). Também
nada impede outro site de carregar os recursos da aplicação como `<img>` ou `<script>`.

## Opções consideradas

- **Não enviar nada** — mantém as duas brechas acima.
- **`same-site`** — quase não muda nada: `vercel.app` está na _Public Suffix List_, então cada
  projeto é um site próprio, e as outras origens do mesmo site são só subdomínios nossos.
- **`same-origin`** — a janela de outra origem perde a referência (`window.opener` e o retorno do
  `window.open` ficam isolados) e os recursos só são carregados pela própria origem.
- **COEP (`require-corp`)** — completaria o isolamento entre origens, mas exigiria CORP ou CORS de
  todo recurso de terceiros, sem ganho real: a aplicação não usa `SharedArrayBuffer` nem
  temporizadores de alta precisão. Fica de fora.

## Decisão

`Cross-Origin-Opener-Policy: same-origin` e `Cross-Origin-Resource-Policy: same-origin` em todas as
respostas.

Os dois entram na lista `securityHeaders` do `next.config.ts`, a mesma do 0008, e valem para
páginas, API, 404 de _asset_ e arquivos estáticos.

## Consequências

- (+) Uma página de outra origem que abra a aplicação não consegue navegá-la nem inspecioná-la.
- (+) Outros sites não podem embutir as imagens e os demais recursos da aplicação.
- (+) O link para o Swagger da API abre outra origem com `noopener`, que já não mantinha
  referência; nada muda.
- (−) Se um dia a aplicação precisar de recursos embutidos por outra origem ou de uma janela
  auxiliar de outra origem (um _popup_ de OAuth, por exemplo), a política terá de ser revista.

## Evidências

- [`next.config.ts`](../../next.config.ts).
- E2E [`tests/e2e/security-headers.spec.ts`](../../tests/e2e/security-headers.spec.ts): os dois
  cabeçalhos em `/`, `/cnab-444`, 404 de página, `/api/remittances`, 404 de _asset_ e
  `/favicon.ico`.
- Commit `fix(security): bound the session expiry and add isolation headers`.
