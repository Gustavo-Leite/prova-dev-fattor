import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { fulfillStream, fullStream, sampleReceivables } from "./remittance-stream";
import { wcagViolations } from "./support/a11y";
import { chooseSample } from "./support/locators";

const firstKey = sampleReceivables[0]?.key ?? "";

async function checkSample(page: Page, againLabel: string) {
  await page.route("**/api/remittances", fulfillStream(fullStream()));
  await chooseSample(page);
  await expect(page.getByRole("button", { name: againLabel })).toBeVisible();
}

function detailButton(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true }).filter({ visible: true });
}

function visibleText(page: Page, text: string) {
  return page.getByText(text, { exact: true }).filter({ visible: true });
}

function invalidDigitWarning(page: Page) {
  return page
    .getByRole("button", { name: "Dígito verificador inválido" })
    .filter({ visible: true })
    .first();
}

function afterTwoFrames(page: Page) {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

test.describe("receivable detail (pt-BR)", () => {
  test.use({ locale: "pt-BR" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await checkSample(page, "Consultar de novo");
  });

  test("splits the access key and shows the raw record", async ({ page }) => {
    await detailButton(page, "Detalhes do título 1").click();

    const dialog = page.getByRole("dialog", { name: "Título 1" });
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
    const overflowingSegments = await record.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return [...element.querySelectorAll("span")]
        .flatMap((segment) => [...segment.getClientRects()])
        .filter((fragment) => fragment.right > box.right + 0.5 || fragment.left < box.left - 0.5)
        .length;
    });
    expect(overflowingSegments).toBe(0);
    await expect(dialog).toContainText(
      "Dados do banco, mostrados sem interpretação posições 2–400",
    );
  });

  test("explains an invalid check digit", async ({ page }) => {
    await detailButton(page, "Detalhes do título 2").click();

    await expect(page.getByRole("dialog", { name: "Título 2" })).toContainText(
      /1 \(inválido; o esperado é \d\)/,
    );
  });

  test("closes with Escape and returns the focus to the button that opened it", async ({
    page,
  }) => {
    const opener = detailButton(page, "Detalhes do título 4");
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Título 4" })).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("closes with its close button", async ({ page }) => {
    await detailButton(page, "Detalhes do título 1").click();
    await page.getByRole("button", { name: "Fechar" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("opens from a click anywhere on the row", async ({ page }) => {
    await visibleText(page, sampleReceivables[2]?.key ?? "").click();

    await expect(page.getByRole("dialog", { name: "Título 3" })).toBeVisible();
  });

  test("lets the key be selected without opening the detail", async ({ page }) => {
    const key = visibleText(page, sampleReceivables[2]?.key ?? "");
    const box = await key.boundingBox();
    const middle = (box?.y ?? 0) + (box?.height ?? 0) / 2;
    await page.mouse.move((box?.x ?? 0) + 2, middle);
    await page.mouse.down();
    await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) - 2, middle, { steps: 5 });
    await page.mouse.up();

    expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).not.toBe("");
    await afterTwoFrames(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("explains an invalid check digit on hover and keyboard focus", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "tooltips do not open on touch; the tap opens the detail instead");
    const warning = invalidDigitWarning(page);
    const hint = page.locator("[data-slot=tooltip-content]");

    await detailButton(page, "Detalhes do título 1").focus();
    await page.keyboard.press("Tab");
    await expect(warning).toBeFocused();
    await expect(hint).toContainText("O dígito verificador desta chave não confere");
    await page.keyboard.press("Escape");
    await page.mouse.move(0, 0);
    await expect(hint).toBeHidden();

    await warning.hover();
    await expect(hint).toBeVisible();
    await hint.click();
    await afterTwoFrames(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("opens the detail, which explains the digit, from the warning", async ({ page }) => {
    const warning = invalidDigitWarning(page);
    await expect(warning).toHaveAccessibleDescription(/não confere; a consulta é feita/);

    await warning.click();

    await expect(page.getByRole("dialog", { name: "Título 2" })).toContainText(
      /inválido; o esperado é \d/,
    );
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
    await chooseSample(page);

    await detailButton(page, "Detalhes do título 1").click();
    const dialog = page.getByRole("dialog", { name: "Título 1" });
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
      await checkSample(page, "Consultar de novo");
      await detailButton(page, "Detalhes do título 2").click();
      await expect(page.getByRole("dialog", { name: "Título 2" })).toBeVisible();

      expect(await wcagViolations(page)).toEqual([]);
    });
  });
}

test.describe("receivable detail (en)", () => {
  test.use({ locale: "en" });

  test("formats the month of issue in English", async ({ page }) => {
    await page.goto("/");
    await checkSample(page, "Check again");
    await detailButton(page, "Details of receivable 1").click();

    await expect(page.getByRole("dialog", { name: "Receivable 1" })).toContainText("March 2024");
  });
});
