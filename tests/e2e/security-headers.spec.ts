import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { fulfillStream, fullStream, samplePath } from "./remittance-stream";

const staticHeaders = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
};

const productionPolicy =
  /^default-src 'self'; script-src 'self' 'nonce-([A-Za-z0-9+/=]+)' 'strict-dynamic'; style-src 'self' 'nonce-\1'; style-src-attr 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'$/;

const apiPolicy = /^default-src 'none'; frame-ancestors 'none'$/;

const basePolicy =
  /^object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'$/;

const routes = [
  { path: "/", status: 200, policy: productionPolicy },
  { path: "/cnab-444", status: 200, policy: productionPolicy },
  { path: "/this-page-does-not-exist", status: 404, policy: productionPolicy },
  { path: "/api/remittances", status: 405, policy: apiPolicy },
  { path: "/this-file-does-not-exist.png", status: 404, policy: basePolicy },
  { path: "/favicon.ico", status: 200, policy: basePolicy },
];

function nonceOf(policy: string | undefined): string | undefined {
  return policy?.match(productionPolicy)?.[1];
}

test.describe("security headers", () => {
  test.skip(({ isMobile }) => isMobile, "HTTP contract does not depend on the device");

  for (const { path, status, policy } of routes) {
    test(`are sent for ${path}`, async ({ request }) => {
      const response = await request.get(path);

      expect(response.status()).toBe(status);
      const headers = response.headers();
      for (const [name, value] of Object.entries(staticHeaders)) {
        expect(headers[name], name).toBe(value);
      }
      expect(headers["content-security-policy"]).toMatch(policy);
      expect(headers["x-powered-by"]).toBeUndefined();
      expect(headers["strict-transport-security"]).toBeUndefined();
    });
  }

  test("draw a new nonce for every document", async ({ request }) => {
    const first = await request.get("/");
    const second = await request.get("/");

    const firstNonce = nonceOf(first.headers()["content-security-policy"]);
    const secondNonce = nonceOf(second.headers()["content-security-policy"]);
    expect(firstNonce).toBeDefined();
    expect(secondNonce).toBeDefined();
    expect(firstNonce).not.toBe(secondNonce);
  });
});

interface ViolationLog {
  cspViolations: string[];
}

async function watchPolicyViolations(page: Page) {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Content Security Policy")) {
      consoleErrors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    const log = window as unknown as ViolationLog;
    log.cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      log.cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });

  return async () => {
    const violations = await page.evaluate(() => (window as unknown as ViolationLog).cspViolations);
    return [...violations, ...consoleErrors];
  };
}

test.describe("content security policy in the browser", () => {
  test.use({ locale: "pt-BR" });

  test("is not violated across the main flows", async ({ page }) => {
    const readViolations = await watchPolicyViolations(page);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");

    await page
      .getByRole("group", { name: "Tema" })
      .getByRole("button", { name: "Tema escuro" })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.route("**/api/remittances", fulfillStream(fullStream()));
    await page.locator('input[type="file"]').setInputFiles(samplePath);
    await expect(page.getByRole("button", { name: "Consultar de novo" })).toBeVisible();

    await page
      .getByRole("button", { name: "Detalhes do título 1", exact: true })
      .filter({ visible: true })
      .click();
    await expect(page.getByRole("dialog", { name: "Título 1" })).toBeVisible();

    expect(await readViolations()).toEqual([]);

    await page.goto("/cnab-444");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Layout do CNAB 444");

    expect(await readViolations()).toEqual([]);
  });
});
