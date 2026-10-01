import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getServerEnv } from "@/infra/env";
import { buildContentSecurityPolicy } from "@/lib/content-security-policy";
import { openSessionCookie, sessionCookieName } from "@/lib/session-cookie";

const contentSecurityPolicyHeader = "Content-Security-Policy";

const protectedPaths: readonly string[] = ["/"];

const signInPath = "/entrar";

async function hasSession(request: NextRequest): Promise<boolean> {
  const token = await openSessionCookie(
    request.cookies.get(sessionCookieName)?.value,
    getServerEnv().sessionSecret,
  );
  return token !== null;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const policy = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
  });

  if (protectedPaths.includes(request.nextUrl.pathname) && !(await hasSession(request))) {
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
