import { expect, test } from "@playwright/test";

const expectedHeaders = {
  "content-security-policy":
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
};

const routes = [
  { path: "/", status: 200 },
  { path: "/this-page-does-not-exist", status: 404 },
  { path: "/favicon.ico", status: 200 },
];

test.describe("security headers", () => {
  test.skip(({ isMobile }) => isMobile, "HTTP contract does not depend on the device");

  for (const { path, status } of routes) {
    test(`are sent for ${path}`, async ({ request }) => {
      const response = await request.get(path);

      expect(response.status()).toBe(status);
      const headers = response.headers();
      for (const [name, value] of Object.entries(expectedHeaders)) {
        expect(headers[name], name).toBe(value);
      }
      expect(headers["x-powered-by"]).toBeUndefined();
      expect(headers["strict-transport-security"]).toBeUndefined();
    });
  }
});
