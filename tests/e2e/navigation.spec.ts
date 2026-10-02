import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  buildRemittance,
  fulfillStream,
  fullStream,
  ndjson,
  resultsSection,
  samplePath,
  sampleResult,
  visibleRows,
} from "./remittance-stream";

const remittance = buildRemittance(30);

function fileInput(page: Page) {
  return page.locator('input[type="file"]');
}

function uploadSection(page: Page) {
  return page.locator("section", { has: fileInput(page) });
}

function uploadStatus(page: Page) {
  return uploadSection(page).getByRole("status");
}

function uploadAlert(page: Page) {
  return uploadSection(page).getByRole("alert");
}

function milestone(page: Page) {
  return page.getByRole("status").filter({ hasText: /^Consult/ });
}

function filledAnnouncements(page: Page) {
  return page.getByRole("status").filter({ hasText: /^Consult|encontrad/ });
}

function pagination(page: Page) {
  return resultsSection(page).getByRole("navigation", { name: "Páginas dos resultados" });
}

function statusFilter(page: Page, name: RegExp) {
  return resultsSection(page)
    .getByRole("group", { name: "Filtrar por situação" })
    .getByRole("button", { name });
}

function navLink(page: Page, name: string) {
  return page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name, exact: true });
}

async function chooseRemittance(page: Page) {
  await fileInput(page).setInputFiles({
    name: "remessa-30.rem",
    mimeType: "application/octet-stream",
    buffer: remittance.buffer,
  });
}

async function markDocument(page: Page) {
  await page.evaluate(() => {
    Object.assign(window, { e2eSameDocument: true });
  });
}

async function expectSameDocument(page: Page) {
  expect(await page.evaluate(() => "e2eSameDocument" in window)).toBe(true);
}

async function goToLayoutPage(page: Page) {
  await navLink(page, "Layout CNAB 444").click();
  await expect(page).toHaveURL(/\/cnab-444$/);
  await expect(fileInput(page)).toHaveCount(0);
}

async function goHome(page: Page) {
  await navLink(page, "Consultar").click();
  await expect(page).toHaveURL("/");
}

async function checkAndNarrow(page: Page) {
  await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
  await page.goto("/");
  await markDocument(page);
  await chooseRemittance(page);
  await expect(milestone(page)).toHaveText("Consulta concluída: 30 títulos consultados.");

  await pagination(page).getByLabel("Títulos por página").selectOption("10");
  await statusFilter(page, /^Autorizada: 15$/).click();
  await pagination(page).getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(pagination(page)).toContainText("11–15 de 15");
}

async function expectNarrowedViewKept(page: Page) {
  await expectSameDocument(page);
  await expect(uploadSection(page).getByText("30 títulos lidos em remessa-30.rem.")).toBeVisible();
  await expect(uploadStatus(page)).toBeEmpty();
  await expect(statusFilter(page, /^Autorizada: 15$/)).toHaveAttribute("aria-pressed", "true");
  await expect(pagination(page)).toContainText("11–15 de 15");
  await expect(pagination(page).getByRole("status")).toHaveText("Página 2 de 2");
  await expect(pagination(page).getByLabel("Títulos por página")).toHaveValue("10");
  await expect(visibleRows(page)).toHaveCount(5);
  await expect(filledAnnouncements(page)).toHaveCount(0);
  await expect(page.locator("main :focus")).toHaveCount(0);
}

test.describe("check kept across the app pages (pt-BR)", () => {
  test.use({ locale: "pt-BR" });

  test("keeps the results, filter, page and file after a round trip through the nav", async ({
    page,
  }) => {
    await checkAndNarrow(page);

    await goToLayoutPage(page);
    await goHome(page);

    await expectNarrowedViewKept(page);
  });

  test("keeps the same view when coming back with the browser history", async ({ page }) => {
    await checkAndNarrow(page);

    await goToLayoutPage(page);
    await page.goBack();
    await expect(page).toHaveURL("/");

    await expectNarrowedViewKept(page);
  });

  test("resets the view when another file is attached", async ({ page }) => {
    await checkAndNarrow(page);

    await fileInput(page).setInputFiles({
      name: "outra-remessa.rem",
      mimeType: "application/octet-stream",
      buffer: remittance.buffer,
    });

    await expect(milestone(page)).toHaveText("Consulta concluída: 30 títulos consultados.");
    await expect(pagination(page)).toContainText("1–25 de 30");
    await expect(pagination(page).getByRole("status")).toHaveText("Página 1 de 2");
    await expect(pagination(page).getByLabel("Títulos por página")).toHaveValue("25");
    await expect(
      resultsSection(page)
        .getByRole("group", { name: "Filtrar por situação" })
        .getByRole("button", { pressed: true }),
    ).toHaveCount(0);
  });

  test("finishes a check that was still running while the user was away", async ({ page }) => {
    let requests = 0;
    let releaseResponse: () => void = () => undefined;
    const responseReleased = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await page.route("**/api/remittances", async (route) => {
      requests++;
      await responseReleased;
      await fulfillStream(fullStream())(route);
    });

    try {
      await page.goto("/");
      await markDocument(page);
      await fileInput(page).setInputFiles(samplePath);
      await expect(milestone(page)).toHaveText("Consultando 10 títulos na API da Fattor.");

      await goToLayoutPage(page);
      const response = page.waitForResponse("**/api/remittances");
      releaseResponse();
      await (await response).finished();
      await goHome(page);

      await expectSameDocument(page);
      await expect(visibleRows(page)).toHaveCount(10);
      await expect(statusFilter(page, /^Autorizada: 5$/)).toBeVisible();
      await expect(resultsSection(page).getByText("Consultando…")).toHaveCount(0);
      await expect(
        resultsSection(page).getByRole("button", { name: "Consultar de novo" }),
      ).toBeVisible();
      expect(requests).toBe(1);
    } finally {
      releaseResponse();
    }
  });

  test("keeps a rejected file on screen without raising the alert again", async ({ page }) => {
    await page.goto("/");
    await fileInput(page).setInputFiles({
      name: "errado.rem",
      mimeType: "text/plain",
      buffer: Buffer.from("not a remittance\n"),
    });
    await expect(uploadAlert(page)).toContainText("O arquivo não segue o layout CNAB 444.");

    await goToLayoutPage(page);
    await goHome(page);

    await expect(
      uploadSection(page).getByText("O arquivo não segue o layout CNAB 444."),
    ).toBeVisible();
    await expect(uploadSection(page)).toContainText("Arquivo: errado.rem");
    await expect(uploadAlert(page)).toHaveCount(0);
    await expect(fileInput(page)).toHaveAttribute("aria-invalid", "true");

    await fileInput(page).setInputFiles({
      name: "errado.rem",
      mimeType: "text/plain",
      buffer: Buffer.from("not a remittance\n"),
    });
    await expect(uploadAlert(page)).toContainText("O arquivo não segue o layout CNAB 444.");
  });

  test("shows the kept results in the new language after switching it", async ({ page }) => {
    await page.route("**/api/remittances", fulfillStream(fullStream()));
    await page.goto("/");
    await fileInput(page).setInputFiles(samplePath);
    await expect(milestone(page)).toHaveText("Consulta concluída: 10 títulos consultados.");
    await statusFilter(page, /^Cancelada: 2$/).click();

    await page.getByRole("group", { name: "Idioma" }).getByRole("button", { name: /EN/ }).click();

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const results = page.getByRole("region", { name: "Invoice statuses" });
    await expect(
      results.getByRole("group", { name: "Filter by status" }).getByRole("button", {
        name: /^Cancelled: 2$/,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      results
        .locator("tbody tr, li")
        .filter({ hasText: /\d{44}/ })
        .filter({ visible: true }),
    ).toHaveCount(2);
    await expect(uploadStatus(page)).toContainText("10 receivables read from meu_cnab.rem.");
  });
});

test.describe("check cleared outside the app pages (pt-BR)", () => {
  test.use({ locale: "pt-BR" });

  test("starts empty after leaving for the sign-in page and coming back in the same document", async ({
    page,
  }) => {
    await page.route(
      "**/api/remittances",
      fulfillStream(
        ndjson([
          { type: "started", total: 10 },
          sampleResult(2),
          { type: "failed", reason: "UPSTREAM_REJECTED_CREDENTIALS" },
        ]),
      ),
    );
    await page.goto("/");
    await markDocument(page);
    await fileInput(page).setInputFiles(samplePath);
    await expect(resultsSection(page)).toBeVisible();
    await expect(uploadSection(page)).toContainText("10 títulos lidos em meu_cnab.rem.");

    await resultsSection(page).getByRole("link", { name: "Entrar de novo" }).click();
    await expect(page).toHaveURL(/\/entrar$/);
    await page.goBack();
    await expect(page).toHaveURL("/");

    await expectSameDocument(page);
    await expect(fileInput(page)).toBeAttached();
    await expect(uploadStatus(page)).toBeEmpty();
    await expect(resultsSection(page)).toHaveCount(0);
    await expect(page.getByText("Anexar outro arquivo")).toHaveCount(0);
  });

  test("aborts a running check when the user signs out", async ({ page }) => {
    let releaseResponse: () => void = () => undefined;
    const responseReleased = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await page.route("**/api/remittances", async (route) => {
      await responseReleased;
      await fulfillStream(fullStream())(route).catch(() => undefined);
    });

    try {
      await page.goto("/");
      await markDocument(page);
      await fileInput(page).setInputFiles(samplePath);
      await expect(milestone(page)).toHaveText("Consultando 10 títulos na API da Fattor.");

      const aborted = page.waitForEvent("requestfailed", (request) =>
        request.url().endsWith("/api/remittances"),
      );
      await page.getByRole("button", { name: "Sair", exact: true }).click();
      await expect(page).toHaveURL(/\/entrar$/);

      await aborted;
      await expectSameDocument(page);
    } finally {
      releaseResponse();
    }
  });

  test("starts empty after a reload", async ({ page }) => {
    await page.route("**/api/remittances", fulfillStream(fullStream()));
    await page.goto("/");
    await fileInput(page).setInputFiles(samplePath);
    await expect(milestone(page)).toHaveText("Consulta concluída: 10 títulos consultados.");

    await page.reload();

    await expect(uploadStatus(page)).toBeEmpty();
    await expect(resultsSection(page)).toHaveCount(0);
  });
});
