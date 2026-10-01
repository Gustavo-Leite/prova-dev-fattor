import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Content-Security-Policy",
    value: "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  },
];

const apiContentSecurityPolicy = {
  key: "Content-Security-Policy",
  value: "default-src 'none'; frame-ancestors 'none'",
};

const nextConfig: NextConfig = {
  poweredByHeader: false,
  headers() {
    return Promise.resolve([
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [apiContentSecurityPolicy] },
    ]);
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
