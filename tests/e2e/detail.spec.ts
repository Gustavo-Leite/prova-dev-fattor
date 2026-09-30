import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { fulfillStream, fullStream, samplePath, sampleReceivables } from "./remittance-stream";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const firstKey = sampleReceivables[0]?.key ?? "";

async function checkSample(page: Page, submitLabel: string, againLabel: string) {
  await page.route("**/api/remittances", fulfillStream(fullStream()));
  await page.locator('input[type="file"]').setInputFiles(samplePath);
  await page.getByRole("button", { name: submitLabel }).click();
  await expect(page.getByRole("button", { name: againLabel })).toBeVisible();
}

function detailButton(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true }).filter({ visible: true });
}

test.describe("receivable detail (pt-BR)", () => {
  test.use({ locale: "pt-BR" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await checkSample(page, "Consultar situações", "Consultar de novo");
  });

  test("splits the access key and shows the raw record", async ({ page }) => {
    await detailButton(page, "Detalhes da linha 2").click();

    const dialog = page.getByRole("dialog", { name: "Linha 2" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Autorizada");
    await expect(dialog).toContainText("3524 0300 0000 0000 0199 5500 1000 0000 0112 3456 7890");
    await expect(dialog).toContainText("35 (SP)");
    await expect(dialog).toContainText("março de 2024");
    await expect(dialog).toContainText("00.000.000/0001-99");
    await expect(dialog).toContainText("0 (válido)");
    await expect(dialog).toContainText("posições 7–20");

    const record = dialog.locator("pre");
    const text = await record.textContent();
    expect(text).toHaveLength(444);
    expect(text?.startsWith("1")).toBe(true);
    expect(text?.endsWith(firstKey)).toBe(true);
    await expect(dialog).toContainText(
      "Dados do banco, mostrados sem interpretação posições 2–400",
    );
  });

  test("explains an invalid check digit", async ({ page }) => {
    await detailButton(page, "Detalhes da linha 3").click();

    await expect(page.getByRole("dialog", { name: "Linha 3" })).toContainText(
      /1 \(inválido; o esperado é \d\)/,
    );
  });

  test("closes with Escape and returns the focus to the button that opened it", async ({
    page,
  }) => {
    const opener = detailButton(page, "Detalhes da linha 5");
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Linha 5" })).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("closes with its close button", async ({ page }) => {
    await detailButton(page, "Detalhes da linha 2").click();
    await page.getByRole("button", { name: "Fechar" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("receivable detail during a check (pt-BR)", () => {
  test.use({ locale: "pt-BR" });

  test("follows the status of the line while the check runs", async ({ page }) => {
    let releaseResponse: () => void = () => undefined;
    const responseReleased = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await page.route("**/api/remittances", async (route) => {
      await responseReleased;
      await fulfillStream(fullStream())(route);
    });
    await page.goto("/");
    await page.locator('input[type="file"]').setInputFiles(samplePath);
    await page.getByRole("button", { name: "Consultar situações" }).click();

    await detailButton(page, "Detalhes da linha 2").click();
    const dialog = page.getByRole("dialog", { name: "Linha 2" });
    await expect(dialog).toContainText("Consultando…");

    releaseResponse();

    await expect(dialog).toContainText("Autorizada");
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`receivable detail in ${colorScheme} mode`, () => {
    test.use({ locale: "pt-BR" });

    test("has no WCAG 2.2 AA violations with the dialog open", async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto("/");
      await checkSample(page, "Consultar situações", "Consultar de novo");
      await detailButton(page, "Detalhes da linha 3").click();
      await expect(page.getByRole("dialog", { name: "Linha 3" })).toBeVisible();

      const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();

      expect(results.violations).toEqual([]);
    });
  });
}

test.describe("receivable detail (en)", () => {
  test.use({ locale: "en" });

  test("formats the month of issue in English", async ({ page }) => {
    await page.goto("/");
    await checkSample(page, "Check statuses", "Check again");
    await detailButton(page, "Details of line 2").click();

    await expect(page.getByRole("dialog", { name: "Line 2" })).toContainText("March 2024");
  });
});
