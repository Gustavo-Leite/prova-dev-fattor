import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

function mainNavigation(page: Page, name: string) {
  return page.getByRole("navigation", { name });
}

test.describe("cnab 444 layout page (pt-BR)", () => {
  test.use({ locale: "pt-BR" });

  test("is reached from the app bar and marks the current page", async ({ page }) => {
    await page.goto("/");
    const navigation = mainNavigation(page, "Principal");
    await expect(navigation.getByRole("link", { name: "Consultar" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await navigation.getByRole("link", { name: "Layout CNAB 444" }).click();

    await expect(page).toHaveURL(/\/cnab-444$/);
    await expect(page).toHaveTitle("Layout do CNAB 444");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Layout do CNAB 444");
    await expect(navigation.getByRole("link", { name: "Layout CNAB 444" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(navigation.getByRole("link", { name: "Consultar" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  test("lists the detail fields with their reliability", async ({ page }) => {
    await page.goto("/cnab-444");
    const table = page.getByRole("table", { name: "Campos do primeiro detalhe da amostra" });

    await expect(table.getByRole("row", { name: /^Tipo de registro/ })).toContainText("Estável");
    await expect(table.getByRole("row", { name: /^Chave de acesso da NF-e/ })).toContainText(
      "posições 401–444",
    );
    await expect(table.getByRole("row", { name: /^Chave de acesso da NF-e/ })).toContainText(
      "Estável",
    );
    const dueDate = table.getByRole("row", { name: /^Vencimento/ });
    await expect(dueDate).toContainText("150425");
    await expect(dueDate).toContainText("15 de abril de 2025");
    await expect(dueDate).toContainText("Observado na amostra");
    await expect(table.getByRole("row", { name: /^Valor do título/ })).toContainText(/R\$\s150,00/);
    await expect(table.getByRole("row", { name: /^Número de controle/ })).toContainText(
      "CONTROLE1",
    );
  });

  test("shows the sample line without segments overflowing", async ({ page }) => {
    await page.goto("/cnab-444");
    const record = page.getByRole("img", {
      name: "Linha de detalhe da amostra com os campos destacados",
    });

    const text = await record.textContent();
    expect(text).toHaveLength(444);
    const overflowingSegments = await record.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return [...element.querySelectorAll("span")]
        .flatMap((segment) => [...segment.getClientRects()])
        .filter((fragment) => fragment.right > box.right + 0.5 || fragment.left < box.left - 0.5)
        .length;
    });
    expect(overflowingSegments).toBe(0);
  });

  test("keeps the navigation still when switching pages on a desktop", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "the desktop shell scrolls only inside the page content");
    await page.setViewportSize({ width: 1440, height: 900 });
    const navigation = mainNavigation(page, "Principal");
    const navigationLeft = async () =>
      (await navigation.getByRole("link", { name: "Consultar" }).boundingBox())?.x;

    await page.goto("/");
    const homeLeft = await navigationLeft();
    await navigation.getByRole("link", { name: "Layout CNAB 444" }).click();
    await expect(page).toHaveURL(/\/cnab-444$/);

    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
      ),
    ).toBe(0);
    expect(await navigationLeft()).toBe(homeLeft);
  });

  test("does not overflow horizontally at 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/cnab-444");

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );

    expect(overflows).toBe(false);
    await expect(
      page.getByRole("region", { name: "Tabela de campos do detalhe, com rolagem horizontal" }),
    ).toBeVisible();
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`cnab 444 layout page in ${colorScheme} mode`, () => {
    test.use({ locale: "pt-BR" });

    test("has no WCAG 2.2 AA violations", async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/cnab-444");

      const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();

      expect(results.violations).toEqual([]);
    });
  });
}

test.describe("cnab 444 layout page (en)", () => {
  test.use({ locale: "en" });

  test("shows the labels and decoded values in English", async ({ page }) => {
    await page.goto("/cnab-444");

    await expect(page).toHaveTitle("CNAB 444 layout");
    await expect(
      mainNavigation(page, "Main").getByRole("link", { name: "CNAB 444 layout" }),
    ).toHaveAttribute("aria-current", "page");
    const table = page.getByRole("table", { name: "Fields of the first sample detail" });
    const dueDate = table.getByRole("row", { name: /^Due date/ });
    await expect(dueDate).toContainText("April 15, 2025");
    await expect(dueDate).toContainText("Observed in the sample");
    await expect(table.getByRole("row", { name: /^Amount/ })).toContainText("R$150.00");
    await expect(page.getByRole("heading", { level: 2, name: "Access key anatomy" })).toBeVisible();
  });
});
