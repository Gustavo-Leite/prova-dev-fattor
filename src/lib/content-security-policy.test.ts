import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy } from "@/lib/content-security-policy";

const nonce = "bm9uY2UtdmFsdWU=";

function directivesOf(policy: string): Map<string, string> {
  return new Map(
    policy.split("; ").map((directive) => {
      const [name = "", ...sources] = directive.split(" ");
      return [name, sources.join(" ")];
    }),
  );
}

describe("buildContentSecurityPolicy", () => {
  it("builds the production policy with the nonce on scripts and styles", () => {
    expect(buildContentSecurityPolicy({ nonce, isDevelopment: false })).toBe(
      "default-src 'self'; " +
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; ` +
        `style-src 'self' 'nonce-${nonce}'; ` +
        "style-src-attr 'unsafe-inline'; " +
        "img-src 'self'; " +
        "font-src 'self'; " +
        "connect-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "frame-ancestors 'none'",
    );
  });

  it("builds the development policy with eval and inline styles", () => {
    const directives = directivesOf(buildContentSecurityPolicy({ nonce, isDevelopment: true }));

    expect(directives.get("script-src")).toBe(
      `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`,
    );
    expect(directives.get("style-src")).toBe("'self' 'unsafe-inline'");
    expect(directives.get("style-src-attr")).toBe("'unsafe-inline'");
  });

  it("keeps eval out of production", () => {
    expect(buildContentSecurityPolicy({ nonce, isDevelopment: false })).not.toContain(
      "'unsafe-eval'",
    );
  });

  it("never upgrades insecure requests, so plain HTTP hosts keep working", () => {
    for (const isDevelopment of [false, true]) {
      expect(buildContentSecurityPolicy({ nonce, isDevelopment })).not.toContain(
        "upgrade-insecure-requests",
      );
    }
  });

  it("shares the non-script directives between both modes", () => {
    const production = directivesOf(buildContentSecurityPolicy({ nonce, isDevelopment: false }));
    const development = directivesOf(buildContentSecurityPolicy({ nonce, isDevelopment: true }));

    for (const name of production.keys()) {
      if (name !== "script-src" && name !== "style-src") {
        expect(development.get(name), name).toBe(production.get(name));
      }
    }
    expect([...development.keys()]).toEqual([...production.keys()]);
  });
});
