import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildContentSecurityPolicy } from "@/lib/content-security-policy";
import { readSessionToken, sessionCookieName } from "@/lib/session-cookie";

const contentSecurityPolicyHeader = "Content-Security-Policy";

const protectedPaths: readonly string[] = ["/"];

const signInPath = "/entrar";

function hasSession(request: NextRequest): boolean {
  return readSessionToken(request.cookies.get(sessionCookieName)?.value) !== null;
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const policy = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
  });

  if (protectedPaths.includes(request.nextUrl.pathname) && !hasSession(request)) {
    const redirect = NextResponse.redirect(new URL(signInPath, request.url), 307);
    redirect.headers.set(contentSecurityPolicyHeader, policy);
    return redirect;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(contentSecurityPolicyHeader, policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(contentSecurityPolicyHeader, policy);
  return response;
}

export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|.*\\.(?:ico|png|svg|jpg|jpeg|gif|webp|avif|txt|xml|webmanifest)$).*)",
  ],
};
