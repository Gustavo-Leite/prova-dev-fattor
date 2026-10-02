import { expect, test } from "@playwright/test";

import { wcagViolations } from "../e2e/support/a11y";
import { chooseSample, milestone, statusFilters } from "../e2e/support/locators";

const signInPath = "/entrar";

function configuredCredentials() {
  const email = process.env.SMOKE_SIGN_IN_EMAIL;
  const password = process.env.SMOKE_SIGN_IN_PASSWORD;
  return email && password ? { email, password } : null;
}

test("serves the sign-in page with the security headers and no WCAG violations", async ({
  page,
}) => {
  const response = await page.goto(signInPath);

  expect(response?.status()).toBe(200);
  const headers = response?.headers() ?? {};
  expect(headers["strict-transport-security"]).toMatch(/max-age=\d+/);
  expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+'/);
  expect(headers["x-frame-options"]).toBe("DENY");
  await expect(page).toHaveTitle("Entrar · Consulta de Status CNAB 444");
  expect(await wcagViolations(page)).toEqual([]);
});

test("sends a visitor without a session to the sign-in page", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(new RegExp(`${signInPath}$`));
});

test("refuses a remittance upload without a session", async ({ request }) => {
  const response = await request.post("/api/remittances");

  expect(response.status()).toBe(401);
});

test("signs in and checks the status of every receivable in the sample file", async ({
  page,
  baseURL,
}) => {
  const credentials = configuredCredentials();
  if (credentials === null) {
    if (process.env.CI) {
      throw new Error("SMOKE_SIGN_IN_EMAIL and SMOKE_SIGN_IN_PASSWORD are required in CI");
    }
    test.skip(true, "set SMOKE_SIGN_IN_EMAIL and SMOKE_SIGN_IN_PASSWORD to run it");
    return;
  }

  await page.goto(signInPath);
  await page.getByLabel("E-mail", { exact: true }).fill(credentials.email);
  await page.getByLabel("Senha", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(new URL("/", baseURL).href);

  await chooseSample(page);

  await expect(milestone(page)).toHaveText("Consulta concluída: 10 títulos consultados.", {
    timeout: 30_000,
  });
  const summary = statusFilters(page);
  await expect(summary).toContainText("Autorizada: 5");
  await expect(summary).toContainText("Cancelada: 2");
  await expect(summary).toContainText("Rejeitada: 2");
  await expect(summary).toContainText("Denegada: 1");
});
