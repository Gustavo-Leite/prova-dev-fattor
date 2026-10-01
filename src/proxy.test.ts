import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "@/proxy";

const nonceSource = /'nonce-([A-Za-z0-9+/=]+)'/;

function nonceOf(policy: string | null): string | undefined {
  return policy?.match(nonceSource)?.[1];
}

function forwardedPolicyOf(response: Response): string | null {
  return response.headers.get("x-middleware-request-content-security-policy");
}

describe("proxy matcher", () => {
  it.each(["/", "/cnab-444", "/api-reference", "/this-page-does-not-exist"])(
    "runs for %s",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
    },
  );

  it("runs for prefetch requests too", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: "/cnab-444",
        headers: { "next-router-prefetch": "1", purpose: "prefetch" },
      }),
    ).toBe(true);
  });

  it.each([
    "/api/remittances",
    "/_next/static/chunks/app.js",
    "/_next/image",
    "/favicon.ico",
    "/icon.png",
    "/apple-icon.png",
    "/robots.txt",
    "/sitemap.xml",
  ])("skips %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  });
});

describe("proxy", () => {
  it("sends the same nonce-based policy to the page and to the browser", () => {
    const response = proxy(new NextRequest("http://localhost/"));

    const policy = response.headers.get("content-security-policy");
    expect(nonceOf(policy)).toBeDefined();
    expect(policy).toContain(`script-src 'self' 'nonce-${nonceOf(policy) ?? ""}'`);
    expect(forwardedPolicyOf(response)).toBe(policy);
  });

  it("keeps the strict policy outside development", () => {
    const response = proxy(new NextRequest("http://localhost/"));

    expect(response.headers.get("content-security-policy")).not.toContain("'unsafe-eval'");
    expect(response.headers.get("content-security-policy")).toMatch(
      /style-src 'self' 'nonce-[^']+';/,
    );
  });

  it("forwards the client's own headers to the route", () => {
    const response = proxy(
      new NextRequest("http://localhost/", { headers: { cookie: "theme=dark" } }),
    );

    expect(response.headers.get("x-middleware-request-cookie")).toBe("theme=dark");
  });

  it("draws a new nonce for every request", () => {
    const first = proxy(new NextRequest("http://localhost/"));
    const second = proxy(new NextRequest("http://localhost/"));

    expect(nonceOf(first.headers.get("content-security-policy"))).not.toBe(
      nonceOf(second.headers.get("content-security-policy")),
    );
  });

  it("overwrites a policy sent by the client", () => {
    const forged = "script-src 'nonce-forged'";
    const response = proxy(
      new NextRequest("http://localhost/", {
        headers: { "content-security-policy": forged },
      }),
    );

    expect(forwardedPolicyOf(response)).not.toBe(forged);
    expect(nonceOf(forwardedPolicyOf(response))).not.toBe("forged");
    expect(forwardedPolicyOf(response)).toBe(response.headers.get("content-security-policy"));
  });

  it("continues to the route without a body of its own", () => {
    const response = proxy(new NextRequest("http://localhost/", { method: "POST" }));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.body).toBeNull();
  });
});
