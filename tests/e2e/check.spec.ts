import AxeBuilder from "@axe-core/playwright";
import type { Page, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  fulfillStream,
  fullStream,
  interruptedStream,
  ndjson,
  resultsSection,
  samplePath,
  sampleReceivables,
  sampleResult,
  visibleRowFor,
} from "./remittance-stream";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function chooseSample(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(samplePath);
}

function milestone(page: Page) {
  return page.getByRole("status").filter({ hasText: /^Consult/ });
}

function statusFilters(page: Page) {
  return resultsSection(page).getByRole("group", { name: "Filtrar por situação" });
}

function repeatButton(page: Page) {
  return resultsSection(page).getByRole("button", {
    name: /^(Consultar de novo|Tentar de novo|Consultando…)$/,
  });
}

function signInLink(page: Page) {
  return resultsSection(page).getByRole("alert").getByRole("link", { name: "Entrar de novo" });
}

const credentialsRejectedStream = ndjson([
  { type: "started", total: 10 },
  sampleResult(2),
  sampleResult(3),
  { type: "failed", reason: "UPSTREAM_REJECTED_CREDENTIALS" },
]);

function fulfillSessionExpired(route: Route) {
  return route.fulfill({ status: 401, json: { code: "SESSION_EXPIRED" } });
}

test.describe("status check (pt-BR)", () => {
  test.use({ locale: "pt-BR" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("checks the statuses as soon as a valid file is attached", async ({ page }) => {
    let requests = 0;
    await page.route("**/api/remittances", async (route) => {
      requests++;
      await fulfillStream(fullStream())(route);
    });

    await chooseSample(page);

    await expect(milestone(page)).toHaveText("Consulta concluída: 10 títulos consultados.");
    expect(requests).toBe(1);
  });

  test("shows a quiet skeleton while a line waits for its status", async ({ page }) => {
    let releaseResponse: () => void = () => undefined;
    const responseReleased = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await page.route("**/api/remittances", async (route) => {
      await responseReleased;
      await fulfillStream(fullStream())(route);
    });

    await chooseSample(page);

    const row = visibleRowFor(page, sampleReceivables[0]?.key ?? "");
    const skeleton = row.locator('[aria-hidden="true"][class*="animate-pulse"]');
    await expect(skeleton).toBeVisible();
    await expect(row).toContainText("Consultando…");

    releaseResponse();

    await expect(row).toContainText("Autorizada");
    await expect(skeleton).toHaveCount(0);
  });

  test("announces the check in a live region that exists before the file", async ({ page }) => {
    await page.route("**/api/remittances", fulfillStream(fullStream()));
    await page.evaluate(() => {
      for (const region of document.querySelectorAll("main [role=status]")) {
        region.setAttribute("data-mounted-before-attach", "");
      }
    });

    await chooseSample(page);

    await expect(page.locator("[data-mounted-before-attach]", { hasText: /^Consult/ })).toHaveText(
      "Consulta concluída: 10 títulos consultados.",
    );
  });

  test("lists the status of every receivable with a summary", async ({ page }) => {
    await page.route("**/api/remittances", fulfillStream(fullStream()));

    await chooseSample(page);

    const results = resultsSection(page);
    await expect(milestone(page)).toHaveText("Consulta concluída: 10 títulos consultados.");
    const summary = statusFilters(page);
    await expect(summary).toContainText("Autorizada: 5");
    await expect(summary).toContainText("Cancelada: 2");
    await expect(summary).toContainText("Rejeitada: 2");
    await expect(summary).toContainText("Denegada: 1");
    await expect(visibleRowFor(page, sampleReceivables[5]?.key ?? "")).toContainText("Denegada");
    await expect(results.getByText("10 de 10 consultados")).toBeVisible();
    await expect(page.getByRole("button", { name: "Consultar de novo" })).toBeVisible();
  });

  test("keeps the focus on the button while checking", async ({ page }) => {
    let attempts = 0;
    await page.route("**/api/remittances", async (route) => {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 300));
      await fulfillStream(fullStream())(route);
    });
    await chooseSample(page);
    const again = page.getByRole("button", { name: "Consultar de novo" });
    await expect(again).toBeVisible();

    await again.focus();
    await page.keyboard.press("Enter");

    const checking = page.getByRole("button", { name: "Consultando…", exact: true });
    await expect(checking).toBeFocused();
    await expect(checking).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Enter");
    await expect(again).toBeVisible();
    expect(attempts).toBe(2);
  });

  test("shows an item that failed without stopping the others", async ({ page }) => {
    await page.route(
      "**/api/remittances",
      fulfillStream(
        fullStream(sampleReceivables, { 4: { outcome: "failed", reason: "UPSTREAM_TIMEOUT" } }),
      ),
    );
    await chooseSample(page);

    await expect(visibleRowFor(page, sampleReceivables[2]?.key ?? "")).toContainText(
      "Falhou: sem resposta a tempo",
    );
    await expect(statusFilters(page)).toContainText("Falhou: 1");
    await expect(milestone(page)).toHaveText(
      "Consulta concluída: 10 títulos consultados, 1 com falha.",
    );
  });

  test("offers to sign in again when the Fattor API rejects the session", async ({ page }) => {
    await page.route("**/api/remittances", fulfillStream(credentialsRejectedStream));
    await chooseSample(page);

    const alert = resultsSection(page).getByRole("alert");
    await expect(
      alert.getByText("A API da Fattor recusou a sessão, então a consulta foi interrompida.", {
        exact: true,
      }),
    ).toBeVisible();
    const signInAgain = alert.getByRole("link", { name: "Entrar de novo" });
    await expect(signInAgain).toHaveAttribute("href", "/entrar");
    await expect(resultsSection(page).getByText("2 de 10 consultados")).toBeVisible();
    await expect(visibleRowFor(page, sampleReceivables[0]?.key ?? "")).toContainText("Autorizada");
    await expect(visibleRowFor(page, sampleReceivables[1]?.key ?? "")).toContainText("Cancelada");
    await expect(repeatButton(page)).toHaveCount(0);

    await signInAgain.click();

    await expect(page).toHaveURL(/\/entrar$/);
  });

  test("moves the focus from the check button to the sign-in link", async ({ page }) => {
    let attempts = 0;
    await page.route("**/api/remittances", async (route) => {
      attempts++;
      await fulfillStream(attempts === 1 ? fullStream() : credentialsRejectedStream)(route);
    });
    await chooseSample(page);
    const again = page.getByRole("button", { name: "Consultar de novo" });
    await expect(again).toBeVisible();

    await again.focus();
    await page.keyboard.press("Enter");

    await expect(signInLink(page)).toBeFocused();
    await expect(repeatButton(page)).toHaveCount(0);
    expect(attempts).toBe(2);
  });

  test("moves the focus from the retry button to the sign-in link", async ({ page }) => {
    let attempts = 0;
    await page.route("**/api/remittances", async (route) => {
      attempts++;
      if (attempts === 1) {
        await fulfillStream(interruptedStream(sampleReceivables, 2))(route);
        return;
      }
      await fulfillSessionExpired(route);
    });
    await chooseSample(page);
    const retry = page.getByRole("button", { name: "Tentar de novo" });
    await expect(retry).toBeVisible();

    await retry.focus();
    await page.keyboard.press("Enter");

    await expect(signInLink(page)).toBeFocused();
    expect(attempts).toBe(2);
  });

  test("leaves the focus alone when the first upload finds the session expired", async ({
    page,
  }) => {
    await page.route("**/api/remittances", fulfillSessionExpired);
    await chooseSample(page);

    await expect(signInLink(page)).toBeVisible();
    await expect(signInLink(page)).not.toBeFocused();
  });

  test("leaves the focus alone when it moved away from the check button", async ({ page }) => {
    let releaseSecondCheck: () => void = () => undefined;
    const secondCheckReleased = new Promise<void>((resolve) => {
      releaseSecondCheck = resolve;
    });
    let attempts = 0;
    await page.route("**/api/remittances", async (route) => {
      attempts++;
      if (attempts === 1) {
        await fulfillStream(fullStream())(route);
        return;
      }
      await secondCheckReleased;
      await fulfillStream(credentialsRejectedStream)(route);
    });
    await chooseSample(page);
    const again = page.getByRole("button", { name: "Consultar de novo" });
    await expect(again).toBeVisible();
    await again.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Consultando…", exact: true })).toBeFocused();

    await resultsSection(page).getByRole("heading", { name: "Situação das notas" }).click();
    await expect
      .poll(() => page.evaluate(() => document.activeElement === document.body))
      .toBe(true);
    releaseSecondCheck();

    await expect(signInLink(page)).toBeVisible();
    await expect(signInLink(page)).not.toBeFocused();
  });

  test("offers to sign in again when the session has expired", async ({ page }) => {
    await page.route("**/api/remittances", fulfillSessionExpired);
    await chooseSample(page);

    const alert = resultsSection(page).getByRole("alert");
    await expect(alert.getByText("Sua sessão expirou.", { exact: true })).toBeVisible();
    const signInAgain = alert.getByRole("link", { name: "Entrar de novo" });
    await expect(signInAgain).toHaveAttribute("href", "/entrar");
    await expect(repeatButton(page)).toHaveCount(0);

    await signInAgain.click();

    await expect(page).toHaveURL(/\/entrar$/);
  });

  test("retries an interrupted check until it completes", async ({ page }) => {
    let attempts = 0;
    await page.route("**/api/remittances", async (route) => {
      attempts++;
      const body =
        attempts === 1
          ? ndjson([{ type: "started", total: 10 }, sampleResult(2), sampleResult(3)])
          : fullStream();
      await fulfillStream(body)(route);
    });
    await chooseSample(page);

    await expect(resultsSection(page).getByRole("alert")).toContainText(
      "A consulta foi interrompida antes do fim.",
    );
    await expect(resultsSection(page).getByText("2 de 10 consultados")).toBeVisible();
    await expect(statusFilters(page)).toContainText("Não consultado: 8");
    await expect(visibleRowFor(page, sampleReceivables[9]?.key ?? "")).toContainText(
      "Não consultado",
    );

    await page.getByRole("button", { name: "Tentar de novo" }).click();

    await expect(resultsSection(page).getByRole("alert")).toHaveCount(0);
    await expect(resultsSection(page).getByText("10 de 10 consultados")).toBeVisible();
  });

  test("shows the parser errors the server returns", async ({ page }) => {
    await page.route("**/api/remittances", (route) =>
      route.fulfill({
        status: 422,
        json: { code: "TOO_MANY_RECEIVABLES", max: 5, actual: 10 },
      }),
    );
    await chooseSample(page);

    await expect(resultsSection(page).getByRole("alert")).toContainText(
      "O arquivo tem 10 títulos; o limite é 5 por envio.",
    );
  });

  test("explains a network failure", async ({ page }) => {
    await page.route("**/api/remittances", (route) => route.abort("connectionreset"));
    await chooseSample(page);

    await expect(resultsSection(page).getByRole("alert")).toContainText(
      "Não foi possível falar com o servidor.",
    );
    await expect(resultsSection(page).getByRole("alert").getByRole("link")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
  });

  test("explains that the Fattor API is unreachable", async ({ page }) => {
    await chooseSample(page);

    await expect(milestone(page)).toHaveText(
      "Consulta concluída: 10 títulos consultados, 10 com falha.",
    );
    await expect(visibleRowFor(page, sampleReceivables[0]?.key ?? "")).toContainText(
      "Falhou: API indisponível",
    );
  });

  test("drops the current check when another file is chosen", async ({ page }) => {
    let markStaleResponseSent: () => void = () => undefined;
    const staleResponseSent = new Promise<void>((resolve) => {
      markStaleResponseSent = resolve;
    });
    let requests = 0;
    await page.route("**/api/remittances", async (route) => {
      requests++;
      if (requests > 1) {
        await fulfillStream(
          fullStream(sampleReceivables, { 4: { outcome: "failed", reason: "UPSTREAM_TIMEOUT" } }),
        )(route);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      await fulfillStream(fullStream())(route).catch(() => undefined);
      markStaleResponseSent();
    });
    const failedRequests: string[] = [];
    page.on("requestfailed", (request) => failedRequests.push(request.url()));
    await chooseSample(page);
    await expect(page.getByRole("button", { name: "Consultando…", exact: true })).toBeVisible();

    await chooseSample(page);

    const finished = "Consulta concluída: 10 títulos consultados, 1 com falha.";
    await expect(milestone(page)).toHaveText(finished);
    await expect
      .poll(() => failedRequests)
      .toContainEqual(expect.stringContaining("/api/remittances"));
    await staleResponseSent;
    await expect(milestone(page)).toHaveText(finished);
    await expect(statusFilters(page)).toContainText("Falhou: 1");
    await expect(resultsSection(page).getByRole("alert")).toHaveCount(0);
    expect(requests).toBe(2);
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`status check in ${colorScheme} mode`, () => {
    test.use({ locale: "pt-BR" });

    test("has no WCAG 2.2 AA violations with results and a failure", async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto("/");
      await page.route(
        "**/api/remittances",
        fulfillStream(
          fullStream(sampleReceivables, {
            4: { outcome: "failed", reason: "UPSTREAM_UNAVAILABLE" },
          }),
        ),
      );
      await chooseSample(page);
      await expect(page.getByRole("button", { name: "Consultar de novo" })).toBeVisible();

      const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();

      expect(results.violations).toEqual([]);
    });

    test("has no WCAG 2.2 AA violations when asking to sign in again", async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto("/");
      await page.route("**/api/remittances", fulfillSessionExpired);
      await chooseSample(page);
      await expect(page.getByRole("link", { name: "Entrar de novo" })).toBeVisible();

      const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();

      expect(results.violations).toEqual([]);
    });
  });
}

test.describe("status check (en)", () => {
  test.use({ locale: "en" });

  test("labels the statuses in English", async ({ page }) => {
    await page.goto("/");
    await page.route("**/api/remittances", fulfillStream(fullStream()));
    await page.locator('input[type="file"]').setInputFiles(samplePath);

    await expect(page.getByRole("region", { name: "Invoice statuses" })).toContainText(
      "Authorized: 5",
    );
  });
});
