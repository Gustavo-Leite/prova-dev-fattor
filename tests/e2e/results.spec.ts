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

async function chooseRemittance(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "remessa-30.rem",
    mimeType: "application/octet-stream",
    buffer: remittance.buffer,
  });
}

async function checkRemittance(page: Page) {
  await chooseRemittance(page);
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
    const filterLabel = resultsSection(page).getByText("Filtrar por situação", { exact: true });
    expect((await filterLabel.boundingBox())?.width ?? 0).toBeGreaterThan(40);
    await expect(denied.locator("svg")).toBeVisible();
    await expect(statusFilter(page, /^Autorizada: 15$/).locator("svg")).toBeHidden();
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

test.describe("results list sorting (pt-BR)", () => {
  test.use({ locale: "pt-BR" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
    await checkRemittance(page);
    await expect(pagination(page)).toContainText("1–25 de 30");
  });

  function firstRow(page: Page) {
    return visibleRows(page).first();
  }

  test("sorts by clicking the column headers", async ({ page, isMobile }) => {
    test.skip(isMobile, "phones sort with a select");
    const header = (name: string) =>
      resultsSection(page).getByRole("columnheader", { name, exact: true });
    const sortButton = (name: string) => header(name).getByRole("button");

    await expect(header("Nº")).toHaveAttribute("aria-sort", "ascending");
    await expect(firstRow(page)).toContainText("linha 2 do arquivo");

    await sortButton("Nº").click();
    await expect(header("Nº")).toHaveAttribute("aria-sort", "descending");
    await expect(firstRow(page)).toContainText("linha 31 do arquivo");

    await pagination(page).getByLabel("Títulos por página").selectOption("10");
    await nextPage(page).click();
    await sortButton("Situação").click();
    await expect(header("Situação")).toHaveAttribute("aria-sort", "ascending");
    await expect(header("Nº")).not.toHaveAttribute("aria-sort");
    await expect(pagination(page)).toContainText("1–10 de 30");
    await expect(firstRow(page)).toContainText("Autorizada");

    await sortButton("Situação").click();
    await expect(firstRow(page)).toContainText("Denegada");
    await sortButton("Situação").click();
    await expect(header("Nº")).toHaveAttribute("aria-sort", "ascending");
    await expect(firstRow(page)).toContainText("linha 2 do arquivo");
  });

  test("sorts with a select on phones", async ({ page, isMobile }) => {
    test.skip(!isMobile, "desktops sort from the column headers");
    const select = resultsSection(page).getByLabel("Ordenar por");

    await select.selectOption({ label: "Situação (autorizadas por último)" });
    await expect(firstRow(page)).toContainText("Denegada");

    await select.selectOption({ label: "Nº (do último ao primeiro)" });
    await expect(firstRow(page)).toContainText("linha 31 do arquivo");
  });
});

test.describe("results list layout on desktop (pt-BR)", () => {
  test.use({ locale: "pt-BR" });
  test.skip(({ isMobile }) => isMobile, "the page keeps its natural scroll on phones");

  function pageOverflow(page: Page) {
    return page.evaluate(
      () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
  }

  test("keeps the page still and scrolls only the table", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
    await checkRemittance(page);
    await expect(pagination(page)).toContainText("1–25 de 30");

    expect(await pageOverflow(page)).toBe(0);
    const region = resultsSection(page).getByRole("region", { name: "Lista de títulos" });
    const regionBox = await region.boundingBox();
    await region.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const headerBox = await region.getByRole("columnheader").first().boundingBox();
    expect(Math.abs((headerBox?.y ?? 0) - (regionBox?.y ?? 0))).toBeLessThan(2);
    await expect(pagination(page)).toBeInViewport();
  });

  test("shrinks the file picker once the file is ready", async ({ page }) => {
    await page.goto("/");
    const picker = page.locator("label").filter({ has: page.locator('input[type="file"]') });
    expect((await picker.boundingBox())?.height ?? 0).toBeGreaterThan(100);

    await chooseRemittance(page);

    await expect
      .poll(async () => (await picker.boundingBox())?.height ?? Number.POSITIVE_INFINITY)
      .toBeLessThan(48);
    await expect(picker).toContainText("Escolher outro arquivo");
  });

  test("keeps a long file error readable", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    const shortLines = Array.from({ length: 60 }, () => "1").join("\n");
    await page.locator('input[type="file"]').setInputFiles({
      name: "quebrado.rem",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(`${shortLines}\n`, "latin1"),
    });

    const alert = page.getByRole("alert").filter({ hasText: "quebrado.rem" });
    await alert.hover();
    await page.mouse.wheel(0, 5000);

    const lastDetail = alert.getByRole("listitem").last();
    const footer = page.getByRole("contentinfo");
    await expect(lastDetail).toBeInViewport();
    await expect(footer).toBeInViewport();
    const detailBox = await lastDetail.boundingBox();
    const footerBox = await footer.boundingBox();
    expect((detailBox?.y ?? 0) + (detailBox?.height ?? 0)).toBeLessThanOrEqual(footerBox?.y ?? 0);
  });

  test("keeps room for the table when an alert is shown", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await page.goto("/");
    await page.route(
      "**/api/remittances",
      fulfillStream(interruptedStream(remittance.receivables, 20)),
    );
    await checkRemittance(page);
    await expect(resultsSection(page).getByRole("alert")).toBeVisible();

    const region = resultsSection(page).getByRole("region", { name: "Lista de títulos" });
    const regionBox = await region.boundingBox();
    const paginationBox = await pagination(page).boundingBox();
    expect(regionBox?.height ?? 0).toBeGreaterThanOrEqual(190);
    expect((regionBox?.y ?? 0) + (regionBox?.height ?? 0)).toBeLessThanOrEqual(
      paginationBox?.y ?? 0,
    );
  });

  test("lets a short window scroll the whole page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await page.goto("/");
    await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
    await checkRemittance(page);
    await expect(pagination(page)).toContainText("1–25 de 30");

    expect(await pageOverflow(page)).toBeGreaterThan(0);
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
