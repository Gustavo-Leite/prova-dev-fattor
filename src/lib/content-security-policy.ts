export interface ContentSecurityPolicyOptions {
  readonly nonce: string;
  readonly isDevelopment: boolean;
}

export function buildContentSecurityPolicy({
  nonce,
  isDevelopment,
}: ContentSecurityPolicyOptions): string {
  const nonceSource = `'nonce-${nonce}'`;
  const scriptSources = ["'self'", nonceSource, "'strict-dynamic'"];
  if (isDevelopment) {
    scriptSources.push("'unsafe-eval'");
  }
  const styleSources = isDevelopment ? ["'self'", "'unsafe-inline'"] : ["'self'", nonceSource];

  const directives: readonly (readonly [string, readonly string[]])[] = [
    ["default-src", ["'self'"]],
    ["script-src", scriptSources],
    ["style-src", styleSources],
    ["style-src-attr", ["'unsafe-inline'"]],
    ["img-src", ["'self'"]],
    ["font-src", ["'self'"]],
    ["connect-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];

  return directives.map(([name, sources]) => `${name} ${sources.join(" ")}`).join("; ");
}
