import { readFileSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import type { Page, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";

const samplePath = path.join(__dirname, "../../_prova/meu_cnab.rem");
const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const sampleReceivables = readFileSync(samplePath, "latin1")
  .split("\n")
  .map((line, index) => ({ lineNumber: index + 1, key: line.slice(400, 444), type: line[0] }))
  .filter((line) => line.type === "1");

const statusByLine: Readonly<Record<number, string>> = {
  2: "authorized",
  3: "cancelled",
  4: "authorized",
  5: "rejected",
  6: "authorized",
  7: "denied",
  8: "authorized",
  9: "cancelled",
  10: "rejected",
  11: "authorized",
};

type StreamLine = Record<string, unknown>;

function resultLine(lineNumber: number, override: StreamLine = {}): StreamLine {
  const receivable = sampleReceivables.find((item) => item.lineNumber === lineNumber);
  return {
    type: "result",
    lineNumber,
    invoiceAccessKey: receivable?.key ?? "",
    hasValidCheckDigit: [2, 10, 11].includes(lineNumber),
    outcome: "status",
    status: statusByLine[lineNumber],
    ...override,
  };
}

function ndjson(lines: readonly StreamLine[]): string {
  return lines.map((line) => `${JSON.stringify(line)}\n`).join("");
}

function fullStream(overrides: Readonly<Record<number, StreamLine>> = {}): string {
  return ndjson([
    { type: "started", total: sampleReceivables.length },
    ...sampleReceivables.map(({ lineNumber }) => resultLine(lineNumber, overrides[lineNumber])),
    { type: "completed" },
  ]);
}

function fulfillStream(body: string) {
  return (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/x-ndjson; charset=utf-8", body });
}

async function chooseSample(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(samplePath);
  await expect(page.getByRole("button", { name: "Consultar situações" })).toBeVisible();
}

function resultsSection(page: Page) {
  return page.getByRole("region", { name: "Situação das notas" });
}

function visibleRowFor(page: Page, key: string) {
  return resultsSection(page).locator("tr, li").filter({ hasText: key }).filter({ visible: true });
}

test.describe("status check (pt-BR)", () => {
  test.use({ locale: "pt-BR" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("lists the status of every receivable with a summary", async ({ page }) => {
    await page.route("**/api/remittances", fulfillStream(fullStream()));
    await chooseSample(page);

    await page.getByRole("button", { name: "Consultar situações" }).click();

    const results = resultsSection(page);
    await expect(results.getByRole("status")).toHaveText(
      "Consulta concluída: 10 títulos consultados.",
    );
    const summary = results.getByRole("list", { name: "Resumo por situação" });
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

    await page.getByRole("button", { name: "Consultar situações" }).focus();
    await page.keyboard.press("Enter");

    const checking = page.getByRole("button", { name: "Consultando…" });
    await expect(checking).toBeFocused();
    await expect(checking).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Consultar de novo" })).toBeVisible();
    expect(attempts).toBe(1);
  });

  test("shows an item that failed without stopping the others", async ({ page }) => {
    await page.route(
      "**/api/remittances",
      fulfillStream(fullStream({ 4: { outcome: "failed", reason: "UPSTREAM_TIMEOUT" } })),
    );
    await chooseSample(page);
    await page.getByRole("button", { name: "Consultar situações" }).click();

    await expect(visibleRowFor(page, sampleReceivables[2]?.key ?? "")).toContainText(
      "Falhou: sem resposta a tempo",
    );
    await expect(
      resultsSection(page).getByRole("list", { name: "Resumo por situação" }),
    ).toContainText("Falhou: 1");
    await expect(resultsSection(page).getByRole("status")).toHaveText(
      "Consulta concluída: 10 títulos consultados, 1 com falha.",
    );
  });

  test("explains a rejection of the server credentials", async ({ page }) => {
    await page.route(
      "**/api/remittances",
      fulfillStream(
        ndjson([
          { type: "started", total: 10 },
          resultLine(2),
          { type: "failed", reason: "UPSTREAM_REJECTED_CREDENTIALS" },
        ]),
      ),
    );
    await chooseSample(page);
    await page.getByRole("button", { name: "Consultar situações" }).click();

    await expect(resultsSection(page).getByRole("alert")).toContainText(
      "A API da Fattor recusou as credenciais do servidor",
    );
    await expect(page.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
  });

  test("retries an interrupted check until it completes", async ({ page }) => {
    let attempts = 0;
    await page.route("**/api/remittances", async (route) => {
      attempts++;
      const body =
        attempts === 1
          ? ndjson([{ type: "started", total: 10 }, resultLine(2), resultLine(3)])
          : fullStream();
      await fulfillStream(body)(route);
    });
    await chooseSample(page);
    await page.getByRole("button", { name: "Consultar situações" }).click();

    await expect(resultsSection(page).getByRole("alert")).toContainText(
      "A consulta foi interrompida antes do fim.",
    );
    await expect(resultsSection(page).getByText("2 de 10 consultados")).toBeVisible();
    await expect(
      resultsSection(page).getByRole("list", { name: "Resumo por situação" }),
    ).toContainText("Não consultado: 8");
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
    await page.getByRole("button", { name: "Consultar situações" }).click();

    await expect(resultsSection(page).getByRole("alert")).toContainText(
      "O arquivo tem 10 títulos; o limite é 5 por envio.",
    );
  });

  test("explains a network failure", async ({ page }) => {
    await page.route("**/api/remittances", (route) => route.abort("connectionreset"));
    await chooseSample(page);
    await page.getByRole("button", { name: "Consultar situações" }).click();

    await expect(resultsSection(page).getByRole("alert")).toContainText(
      "Não foi possível falar com o servidor.",
    );
  });

  test("drops the current check when another file is chosen", async ({ page }) => {
    let markStaleResponseSent: () => void = () => undefined;
    const staleResponseSent = new Promise<void>((resolve) => {
      markStaleResponseSent = resolve;
    });
    await page.route("**/api/remittances", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await fulfillStream(fullStream())(route).catch(() => undefined);
      markStaleResponseSent();
    });
    const failedRequests: string[] = [];
    page.on("requestfailed", (request) => failedRequests.push(request.url()));
    await chooseSample(page);
    await page.getByRole("button", { name: "Consultar situações" }).click();
    await expect(page.getByRole("button", { name: "Consultando…" })).toBeVisible();

    await chooseSample(page);

    await expect(page.getByRole("button", { name: "Consultar situações" })).toBeVisible();
    await expect
      .poll(() => failedRequests)
      .toContainEqual(expect.stringContaining("/api/remittances"));
    await staleResponseSent;
    await expect(resultsSection(page).getByRole("alert")).toHaveCount(0);
    await expect(resultsSection(page).getByText("de 10 consultados")).toHaveCount(0);
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
        fulfillStream(fullStream({ 4: { outcome: "failed", reason: "UPSTREAM_UNAVAILABLE" } })),
      );
      await chooseSample(page);
      await page.getByRole("button", { name: "Consultar situações" }).click();
      await expect(page.getByRole("button", { name: "Consultar de novo" })).toBeVisible();

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
    await page.getByRole("button", { name: "Check statuses" }).click();

    await expect(page.getByRole("region", { name: "Invoice statuses" })).toContainText(
      "Authorized: 5",
    );
  });
});
