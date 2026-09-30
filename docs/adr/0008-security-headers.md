# 0008. Cabeçalhos de segurança HTTP

- Status: Aceito
- Data: 2026-09-30
- Substitui: —
- Substituído por: —

## Contexto

A auditoria de segurança da fundação encontrou respostas sem cabeçalhos de proteção. A próxima
etapa traz upload de arquivo: sem proteção contra enquadramento, um site malicioso pode carregar a
aplicação num `<iframe>` e induzir cliques. Uma política de scripts (CSP com _nonce_) exige
scripts de cliente reais para ser validada, e eles ainda não existem.

## Opções consideradas

- **Cabeçalhos estáticos agora, CSP de scripts depois** — cobre enquadramento, _sniffing_,
  _referrer_ e APIs do navegador sem risco de quebrar a aplicação.
- **CSP completa com _nonce_ agora** — mais proteção; desenhada sem nenhum script de cliente para
  validar.
- **Adiar tudo** — deixa aberto um achado que custa poucas linhas.

## Decisão

Todas as rotas enviam cabeçalhos estáticos de segurança, com uma CSP limitada às diretivas que não
dependem de scripts.

- `Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin` e `Permissions-Policy` sem câmera, microfone,
  geolocalização nem _topics_.
- HSTS não é emitido pela aplicação: é responsabilidade de quem termina o TLS (a borda do deploy).
- Quando houver scripts de cliente, uma CSP com _nonce_ emitida pelo `proxy.ts` substituirá a
  parte de CSP deste ADR, reunindo todas as diretivas numa política única.

## Consequências

- (+) Enquadramento, injeção de `<base>`, envio de formulário para outra origem e _MIME sniffing_
  bloqueados desde já.
- (−) Scripts ainda sem restrição de origem até a CSP com _nonce_.
- (−) O HSTS precisa ser conferido no deploy público.

## Evidências

- [`next.config.ts`](../../next.config.ts),
  [`tests/e2e/security-headers.spec.ts`](../../tests/e2e/security-headers.spec.ts).
- Documentação do Next.js: `headers` no `next.config` e o guia de Content Security Policy.
