import { createHmac } from "node:crypto";

import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { config, proxy } from "@/proxy";

const { proxySessionSecret } = vi.hoisted(() => ({
  proxySessionSecret: "proxy-test-secret-proxy-test-secret",
}));

vi.mock("@/infra/env", () => ({
  getServerEnv: () => ({ sessionSecret: proxySessionSecret }),
}));

const nonceSource = /'nonce-([A-Za-z0-9+/=]+)'/;
const sessionToken = "user-session-token";

const validExpiry = Math.floor(Date.now() / 1000) + 3600;
const pastExpiry = 1_000_000_000;

function sealWith(secret: string, { token = sessionToken, expiry = validExpiry } = {}): string {
  const signature = createHmac("sha256", secret)
    .update(`${String(expiry)}.${token}`)
    .digest("base64url");
  return `${token}.${String(expiry)}.${signature}`;
}

const sessionCookie = `session=${sealWith(proxySessionSecret)}`;

function nonceOf(policy: string | null): string | undefined {
  return policy?.match(nonceSource)?.[1];
}

function forwardedPolicyOf(response: Response): string | null {
  return response.headers.get("x-middleware-request-content-security-policy");
}

function signedInRequest(
  url = "http://localhost/",
  { headers = {}, method }: { headers?: Record<string, string>; method?: string } = {},
): NextRequest {
  return new NextRequest(url, { method, headers: { cookie: sessionCookie, ...headers } });
}

function requestWithSession(value: string): NextRequest {
  return new NextRequest("http://localhost/", { headers: { cookie: `session=${value}` } });
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
  it("sends the same nonce-based policy to the page and to the browser", async () => {
    const response = await proxy(signedInRequest());

    const policy = response.headers.get("content-security-policy");
    expect(nonceOf(policy)).toBeDefined();
    expect(policy).toContain(`script-src 'self' 'nonce-${nonceOf(policy) ?? ""}'`);
    expect(forwardedPolicyOf(response)).toBe(policy);
  });

  it("keeps the strict policy outside development", async () => {
    const response = await proxy(signedInRequest());

    expect(response.headers.get("content-security-policy")).not.toContain("'unsafe-eval'");
    expect(response.headers.get("content-security-policy")).toMatch(
      /style-src 'self' 'nonce-[^']+';/,
    );
  });

  it("forwards the client's own headers to the route", async () => {
    const response = await proxy(
      new NextRequest("http://localhost/", {
        headers: { cookie: `theme=dark; ${sessionCookie}` },
      }),
    );

    expect(response.headers.get("x-middleware-request-cookie")).toBe(
      `theme=dark; ${sessionCookie}`,
    );
  });

  it("draws a new nonce for every request", async () => {
    const first = await proxy(signedInRequest());
    const second = await proxy(signedInRequest());

    expect(nonceOf(first.headers.get("content-security-policy"))).not.toBe(
      nonceOf(second.headers.get("content-security-policy")),
    );
  });

  it("overwrites a policy sent by the client", async () => {
    const forged = "script-src 'nonce-forged'";
    const response = await proxy(
      signedInRequest("http://localhost/", { headers: { "content-security-policy": forged } }),
    );

    expect(forwardedPolicyOf(response)).not.toBe(forged);
    expect(nonceOf(forwardedPolicyOf(response))).not.toBe("forged");
    expect(forwardedPolicyOf(response)).toBe(response.headers.get("content-security-policy"));
  });

  it("continues to the route without a body of its own", async () => {
    const response = await proxy(signedInRequest("http://localhost/", { method: "POST" }));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.body).toBeNull();
  });
});

describe("proxy session guard", () => {
  it.each([
    ["without a session cookie", new NextRequest("http://localhost/")],
    ["with a malformed session cookie", requestWithSession("a b")],
    ["with an empty session cookie", requestWithSession("")],
    ["with a raw token that was never sealed", requestWithSession(sessionToken)],
    [
      "with a token sealed with another secret",
      requestWithSession(sealWith("another-secret-another-secret-another")),
    ],
    [
      "with a seal moved to another token",
      requestWithSession(sealWith(proxySessionSecret).replace(sessionToken, "forged-token")),
    ],
    [
      "with an expired seal",
      requestWithSession(sealWith(proxySessionSecret, { expiry: pastExpiry })),
    ],
    [
      "with a forged signature",
      requestWithSession(`${sessionToken}.${String(validExpiry)}.${"A".repeat(43)}`),
    ],
  ])("sends the home page to the sign-in page %s", async (_description, request) => {
    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/entrar");
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });

  it("redirects a prefetch of the home page without a session", async () => {
    const response = await proxy(
      new NextRequest("http://localhost/", {
        headers: { rsc: "1", "next-router-prefetch": "1" },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/entrar");
  });

  it("keeps the content security policy on the redirect", async () => {
    const response = await proxy(new NextRequest("http://localhost/"));

    expect(nonceOf(response.headers.get("content-security-policy"))).toBeDefined();
  });

  it("opens the home page with a sealed session cookie", async () => {
    const response = await proxy(signedInRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each(["/cnab-444", "/entrar", "/login", "/this-page-does-not-exist"])(
    "lets %s through without a session",
    async (path) => {
      const response = await proxy(new NextRequest(new URL(path, "http://localhost")));

      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it("guards the home page even with a query string", async () => {
    const response = await proxy(new NextRequest("http://localhost/?file=x"));

    expect(response.headers.get("location")).toBe("http://localhost/entrar");
  });
});
