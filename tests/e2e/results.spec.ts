import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  buildRemittance,
  fulfillStream,
  fullStream,
  interruptedStream,
  resultsSection,
  visibleRowFor,
  visibleRows,
} from "./remittance-stream";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const remittance = buildRemittance(30);

async function checkRemittance(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "remessa-30.rem",
    mimeType: "application/octet-stream",
    buffer: remittance.buffer,
  });
  await page.getByRole("button", { name: "Consultar situações" }).click();
}

function pagination(page: Page) {
  return resultsSection(page).getByRole("navigation", { name: "Páginas dos resultados" });
}

function nextPage(page: Page) {
  return pagination(page).getByRole("button", { name: "Próxima", exact: true });
}

function statusFilter(page: Page, name: RegExp) {
  return resultsSection(page)
    .getByRole("group", { name: "Filtrar por situação" })
    .getByRole("button", { name });
}

function searchBox(page: Page) {
  return resultsSection(page).getByRole("searchbox", { name: "Buscar pela chave de acesso" });
}

test.describe("results list (pt-BR)", () => {
  test.use({ locale: "pt-BR" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("pages through the results and keeps the focus on the controls", async ({ page }) => {
    await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
    await checkRemittance(page);

    await expect(pagination(page)).toContainText("1–25 de 30");
    await expect(pagination(page).getByRole("status")).toHaveText("Página 1 de 2");
    await expect(visibleRows(page)).toHaveCount(25);

    const next = nextPage(page);
    await next.click();
    await expect(pagination(page)).toContainText("26–30 de 30");
    await expect(visibleRows(page)).toHaveCount(5);
    await expect(next).toBeFocused();
    await expect(next).toHaveAttribute("aria-disabled", "true");

    await pagination(page).getByLabel("Títulos por página").selectOption("10");
    await expect(pagination(page)).toContainText("1–10 de 30");
    await expect(pagination(page).getByRole("status")).toHaveText("Página 1 de 3");
  });

  test("filters by status from the summary and returns to the first page", async ({ page }) => {
    await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
    await checkRemittance(page);
    await nextPage(page).click();

    const denied = statusFilter(page, /^Denegada: 3$/);
    await denied.click();

    await expect(denied).toHaveAttribute("aria-pressed", "true");
    await expect(visibleRows(page)).toHaveCount(3);
    await expect(pagination(page)).toContainText("1–3 de 3");
    await expect(nextPage(page)).toHaveAttribute("aria-disabled", "true");
    await expect(resultsSection(page).getByText("3 títulos encontrados.")).toBeAttached();

    await statusFilter(page, /^Cancelada: 6$/).click();
    await expect(visibleRows(page)).toHaveCount(9);

    await denied.click();
    await expect(denied).toHaveAttribute("aria-pressed", "false");
    await expect(visibleRows(page)).toHaveCount(6);
  });

  test("returns to the first page when a filter still spans several pages", async ({ page }) => {
    await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
    await checkRemittance(page);
    await pagination(page).getByLabel("Títulos por página").selectOption("10");
    const next = nextPage(page);
    await next.click();
    await next.click();
    await expect(pagination(page)).toContainText("21–30 de 30");

    await statusFilter(page, /^Autorizada: 15$/).click();
    await expect(pagination(page)).toContainText("1–10 de 15");

    await next.click();
    await expect(pagination(page)).toContainText("11–15 de 15");
    await searchBox(page).fill("0");
    await expect(pagination(page)).toContainText("1–10 de 15");
  });

  test("starts again at the first page when the check is repeated", async ({ page }) => {
    await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
    await checkRemittance(page);
    await pagination(page).getByLabel("Títulos por página").selectOption("10");
    await statusFilter(page, /^Autorizada: 15$/).click();
    await nextPage(page).click();
    await expect(pagination(page)).toContainText("11–15 de 15");

    await page.getByRole("button", { name: "Consultar de novo" }).click();

    await expect(page.getByRole("button", { name: "Consultar de novo" })).toBeVisible();
    await expect(pagination(page)).toContainText("1–10 de 15");
  });

  test("searches by any part of the key, ignoring separators", async ({ page }) => {
    await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
    await checkRemittance(page);
    const target = remittance.receivables[16]?.key ?? "";
    const spaced = target.replace(/(\d{4})(?=\d)/g, "$1 ");

    await searchBox(page).fill(spaced);

    await expect(visibleRows(page)).toHaveCount(1);
    await expect(visibleRowFor(page, target)).toBeVisible();

    await searchBox(page).fill("abc");
    await expect(resultsSection(page).getByText("A chave de acesso tem só números.")).toBeVisible();
    await expect(visibleRows(page)).toHaveCount(0);

    const clear = resultsSection(page).getByRole("button", { name: "Limpar filtros" });
    await clear.click();
    await expect(searchBox(page)).toHaveValue("");
    await expect(visibleRows(page)).toHaveCount(25);
    await expect(clear).toBeFocused();
    await expect(clear).toHaveAttribute("aria-disabled", "true");
  });

  test("keeps an active filter visible when its rows are resolved", async ({ page }) => {
    const bodies = [
      interruptedStream(remittance.receivables, 3),
      interruptedStream(remittance.receivables, 20),
      fullStream(remittance.receivables),
    ];
    let attempts = 0;
    await page.route("**/api/remittances", async (route) => {
      await fulfillStream(bodies[attempts++] ?? "")(route);
    });
    await checkRemittance(page);

    const notChecked = statusFilter(page, /^Não consultado: 27$/);
    await notChecked.click();
    await pagination(page).getByLabel("Títulos por página").selectOption("10");
    await nextPage(page).click();
    await nextPage(page).click();
    await expect(pagination(page)).toContainText("21–27 de 27");

    await page.getByRole("button", { name: "Tentar de novo" }).click();
    await expect(resultsSection(page).getByText("20 de 30 consultados")).toBeVisible();
    await expect(pagination(page)).toContainText("1–10 de 10");
    await expect(visibleRows(page)).toHaveCount(10);

    await page.getByRole("button", { name: "Tentar de novo" }).click();
    await expect(resultsSection(page).getByText("30 de 30 consultados")).toBeVisible();
    const emptied = statusFilter(page, /^Não consultado: 0$/);
    await expect(emptied).toHaveAttribute("aria-pressed", "true");
    await expect(
      resultsSection(page).getByText("Nenhum título corresponde aos filtros."),
    ).toBeVisible();
    await expect(pagination(page)).not.toContainText("de 0");

    await emptied.click();
    await expect(emptied).toHaveCount(0);
    await expect(searchBox(page)).toBeFocused();
    await expect(visibleRows(page)).toHaveCount(10);
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`results list in ${colorScheme} mode`, () => {
    test.use({ locale: "pt-BR" });

    test("has no WCAG 2.2 AA violations with a filter and pages", async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto("/");
      await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
      await checkRemittance(page);
      await statusFilter(page, /^Autorizada: 15$/).click();
      await searchBox(page).fill("0");
      await pagination(page).getByLabel("Títulos por página").selectOption("10");
      await expect(pagination(page).getByRole("status")).toHaveText("Página 1 de 2");

      const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();

      expect(results.violations).toEqual([]);
    });
  });
}
