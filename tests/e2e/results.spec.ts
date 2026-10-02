import { readFileSync } from "node:fs";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { buildRemittance, fulfillStream, fullStream, interruptedStream } from "./remittance-stream";
import { wcagViolations } from "./support/a11y";
import {
  chooseRemittance,
  fileInput,
  listAnnouncement,
  pagination,
  resultsSection,
  statusFilter,
  visibleRowFor,
  visibleRows,
} from "./support/locators";

const remittance = buildRemittance(30);

function nextPage(page: Page) {
  return pagination(page).getByRole("button", { name: "Próxima", exact: true });
}

function exportButton(page: Page, name: string) {
  return resultsSection(page).getByRole("button", { name, exact: true });
}

async function downloadCsv(page: Page, buttonName: string) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: buttonName, exact: true }).click(),
  ]);
  const content = readFileSync(await download.path(), "utf8");
  return {
    fileName: download.suggestedFilename(),
    content,
    lines: content.slice(1).split("\r\n"),
  };
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
    await chooseRemittance(page, remittance);

    await expect(pagination(page)).toContainText("1–25 de 30");
    await expect(pagination(page)).toContainText("Página 1 de 2");
    await expect(pagination(page).getByRole("status")).toHaveCount(0);
    await expect(listAnnouncement(page)).toBeEmpty();
    await expect(visibleRows(page)).toHaveCount(25);

    const next = nextPage(page);
    await next.click();
    await expect(pagination(page)).toContainText("26–30 de 30");
    await expect(listAnnouncement(page)).toHaveText("Página 2 de 2");
    await expect(visibleRows(page)).toHaveCount(5);
    await expect(next).toBeFocused();
    await expect(next).toHaveAttribute("aria-disabled", "true");

    await pagination(page).getByLabel("Títulos por página").selectOption("10");
    await expect(pagination(page)).toContainText("1–10 de 30");
    await expect(pagination(page)).toContainText("Página 1 de 3");
    await expect(listAnnouncement(page)).toHaveText("Página 1 de 3");
  });

  test("filters by status from the summary and returns to the first page", async ({ page }) => {
    await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
    await chooseRemittance(page, remittance);
    await nextPage(page).click();
    await expect(listAnnouncement(page)).toHaveText("Página 2 de 2");

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
    await expect(listAnnouncement(page)).toHaveText("3 títulos encontrados.");

    await statusFilter(page, /^Cancelada: 6$/).click();
    await expect(visibleRows(page)).toHaveCount(9);

    await denied.click();
    await expect(denied).toHaveAttribute("aria-pressed", "false");
    await expect(visibleRows(page)).toHaveCount(6);
  });

  test("returns to the first page when a filter still spans several pages", async ({ page }) => {
    await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
    await chooseRemittance(page, remittance);
    await pagination(page).getByLabel("Títulos por página").selectOption("10");
    const next = nextPage(page);
    await next.click();
    await next.click();
    await expect(pagination(page)).toContainText("21–30 de 30");

    await statusFilter(page, /^Autorizada: 15$/).click();
    await expect(pagination(page)).toContainText("1–10 de 15");

    await next.click();
    await expect(pagination(page)).toContainText("11–15 de 15");
    await expect(listAnnouncement(page)).toHaveText("Página 2 de 2");
    await searchBox(page).fill("0");
    await expect(pagination(page)).toContainText("1–10 de 15");
    await expect(listAnnouncement(page)).toHaveText("15 títulos encontrados.");
  });

  test("drops the page announcement when the filters are cleared", async ({ page }) => {
    await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
    await chooseRemittance(page, remittance);
    await statusFilter(page, /^Autorizada: 15$/).click();
    await pagination(page).getByLabel("Títulos por página").selectOption("10");
    await nextPage(page).click();
    await expect(listAnnouncement(page)).toHaveText("Página 2 de 2");

    await resultsSection(page).getByRole("button", { name: "Limpar filtros" }).click();

    await expect(pagination(page)).toContainText("1–10 de 30");
    await expect(listAnnouncement(page)).toBeEmpty();
  });

  test("starts again at the first page when the check is repeated", async ({ page }) => {
    let requests = 0;
    let releaseRepeat: () => void = () => undefined;
    const repeatReleased = new Promise<void>((resolve) => {
      releaseRepeat = resolve;
    });
    await page.route("**/api/remittances", async (route) => {
      requests++;
      if (requests > 1) {
        await repeatReleased;
      }
      await fulfillStream(fullStream(remittance.receivables))(route);
    });

    try {
      await chooseRemittance(page, remittance);
      await pagination(page).getByLabel("Títulos por página").selectOption("10");
      await statusFilter(page, /^Autorizada: 15$/).click();
      await nextPage(page).click();
      await expect(pagination(page)).toContainText("11–15 de 15");
      await expect(listAnnouncement(page)).toHaveText("Página 2 de 2");

      await page.getByRole("button", { name: "Consultar de novo" }).click();

      await expect(resultsSection(page).getByText("0 de 30 consultados")).toBeVisible();
      await expect(listAnnouncement(page)).toBeEmpty();

      releaseRepeat();

      await expect(page.getByRole("button", { name: "Consultar de novo" })).toBeVisible();
      await expect(pagination(page)).toContainText("1–10 de 15");
      await expect(listAnnouncement(page)).toHaveText("15 títulos encontrados.");
    } finally {
      releaseRepeat();
    }
  });

  test("searches by any part of the key, ignoring separators", async ({ page }) => {
    await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
    await chooseRemittance(page, remittance);
    const target = remittance.receivables[16]?.key ?? "";
    const spaced = target.replace(/(\d{4})(?=\d)/g, "$1 ");

    await searchBox(page).fill(spaced);

    await expect(visibleRows(page)).toHaveCount(1);
    await expect(visibleRowFor(page, target)).toBeVisible();
    await expect(listAnnouncement(page)).toHaveText("1 título encontrado.");

    await searchBox(page).fill("ab*c");
    await expect(
      resultsSection(page).getByText("A chave de acesso tem só números e letras."),
    ).toBeVisible();
    await expect(visibleRows(page)).toHaveCount(0);

    const clear = resultsSection(page).getByRole("button", { name: "Limpar filtros" });
    await clear.click();
    await expect(searchBox(page)).toHaveValue("");
    await expect(visibleRows(page)).toHaveCount(25);
    await expect(clear).toBeFocused();
    await expect(clear).toHaveAttribute("aria-disabled", "true");
  });

  test("exports the filtered rows of every page as CSV", async ({ page }) => {
    await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
    await chooseRemittance(page, remittance);
    await expect(pagination(page)).toContainText("1–25 de 30");

    const everything = await downloadCsv(page, "Exportar 30 títulos (CSV)");
    expect(everything.lines).toHaveLength(31);

    await statusFilter(page, /^Denegada: 3$/).click();
    const { fileName, content, lines } = await downloadCsv(page, "Exportar 3 títulos (CSV)");

    expect(fileName).toBe("situacoes-remessa.csv");
    expect(content.codePointAt(0)).toBe(0xfeff);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("Nº;Linha do arquivo;Chave de acesso da NF-e;Situação");
    const firstDenied = remittance.receivables.find((item) => item.lineNumber === 7)?.key ?? "";
    const groupedKey = firstDenied.replace(/(\d{4})(?=\d)/g, "$1 ");
    expect(groupedKey.split(" ")).toHaveLength(11);
    expect(lines[1]).toBe(`6;7;${groupedKey};Denegada`);
  });

  test("keeps the export disabled while the check runs", async ({ page }) => {
    let releaseResponse: () => void = () => undefined;
    const responseReleased = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await page.route("**/api/remittances", async (route) => {
      await responseReleased;
      await fulfillStream(fullStream(remittance.receivables))(route);
    });
    await chooseRemittance(page, remittance);

    const button = exportButton(page, "Exportar 30 títulos (CSV)");
    await expect(button).toHaveAttribute("aria-disabled", "true");

    releaseResponse();

    await expect(resultsSection(page).getByText("30 de 30 consultados")).toBeVisible();
    await expect(button).not.toHaveAttribute("aria-disabled", "true");

    await searchBox(page).fill("ZZZZ");
    await expect(exportButton(page, "Exportar 0 títulos (CSV)")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
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
    await chooseRemittance(page, remittance);

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

test.describe("results search announcement (pt-BR)", () => {
  test.use({ locale: "pt-BR" });

  test("announces the search count only after the typing settles", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-02T09:00:00Z") });
    await page.goto("/");
    await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
    await chooseRemittance(page, remittance);
    await expect(pagination(page)).toContainText("1–25 de 30");
    await page.clock.pauseAt(new Date("2026-10-02T10:00:00Z"));
    const target = remittance.receivables[16]?.key ?? "";

    await searchBox(page).pressSequentially(target);

    await expect(visibleRows(page)).toHaveCount(1);
    await expect(listAnnouncement(page)).toBeEmpty();

    await page.clock.runFor(500);

    await expect(listAnnouncement(page)).toHaveText("1 título encontrado.");
  });
});

test.describe("results list sorting (pt-BR)", () => {
  test.use({ locale: "pt-BR" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
    await chooseRemittance(page, remittance);
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

  test("heads each table row with the receivable number", async ({ page, isMobile }) => {
    test.skip(isMobile, "phones list the results as cards");
    const rowHeaders = resultsSection(page).getByRole("rowheader");

    await expect(rowHeaders).toHaveCount(25);
    const firstHeader = firstRow(page).getByRole("rowheader");
    await expect(firstHeader).toHaveAttribute("scope", "row");
    await expect(firstHeader).toContainText("1");
    await expect(firstHeader).toContainText("linha 2 do arquivo");
  });

  test("announces the first page after sorting only once a page was announced", async ({
    page,
    isMobile,
  }) => {
    const sortBy = async (column: string, option: string) => {
      await (isMobile
        ? resultsSection(page).getByLabel("Ordenar por").selectOption({ label: option })
        : resultsSection(page)
            .getByRole("columnheader", { name: column, exact: true })
            .getByRole("button")
            .click());
    };

    await sortBy("Nº", "Nº (do último ao primeiro)");
    await expect(firstRow(page)).toContainText("linha 31 do arquivo");
    await expect(listAnnouncement(page)).toBeEmpty();

    await nextPage(page).click();
    await expect(listAnnouncement(page)).toHaveText("Página 2 de 2");

    await sortBy("Nº", "Nº (ordem do arquivo)");
    await expect(firstRow(page)).toContainText("linha 2 do arquivo");
    await expect(pagination(page)).toContainText("1–25 de 30");
    await expect(listAnnouncement(page)).toHaveText("Página 1 de 2");
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
    return page.evaluate(() => {
      const scroller = document.querySelector('[data-slot="page-scroller"]');
      const documentOverflow =
        document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrollerOverflow = scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
      return Math.max(documentOverflow, scrollerOverflow);
    });
  }

  test("keeps the page still and scrolls only the table", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
    await chooseRemittance(page, remittance);
    await expect(pagination(page)).toContainText("1–25 de 30");

    expect(await pageOverflow(page)).toBe(0);
    const region = resultsSection(page).getByRole("region", { name: "Lista de títulos" });
    await expect(region).toHaveCSS("scrollbar-width", "thin");
    const regionBox = await region.boundingBox();
    await region.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const headerBox = await region.getByRole("columnheader").first().boundingBox();
    expect(Math.abs((headerBox?.y ?? 0) - (regionBox?.y ?? 0))).toBeLessThan(2);
    await expect(pagination(page)).toBeInViewport();

    await statusFilter(page, /^Denegada: 3$/).focus();
    await page.keyboard.press("Tab");
    await expect(region).toBeFocused();
    const card = region.locator("xpath=ancestor::div[contains(@class, 'md:bg-card')][1]");
    await expect(card).toHaveCSS("outline-style", "solid");
  });

  test("shrinks the file picker once the file is ready", async ({ page }) => {
    await page.goto("/");
    await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
    const picker = page.locator("label").filter({ has: fileInput(page) });
    expect((await picker.boundingBox())?.height ?? 0).toBeGreaterThan(100);

    await chooseRemittance(page, remittance);

    await expect
      .poll(async () => (await picker.boundingBox())?.height ?? Number.POSITIVE_INFINITY)
      .toBeLessThan(48);
    await expect(picker).toContainText("Anexar outro arquivo");
  });

  test("keeps a long file error readable", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    const shortLines = Array.from({ length: 60 }, () => "1").join("\n");
    await fileInput(page).setInputFiles({
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
    await chooseRemittance(page, remittance);
    await expect(resultsSection(page).getByRole("alert")).toBeVisible();
    await expect(page.getByRole("main")).toHaveCSS("overflow-y", "visible");
    await expect(page.locator('[data-slot="page-scroller"]')).toHaveCSS("overflow-y", "auto");

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
    await chooseRemittance(page, remittance);
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
      await chooseRemittance(page, remittance);
      await statusFilter(page, /^Autorizada: 15$/).click();
      await searchBox(page).fill("0");
      await pagination(page).getByLabel("Títulos por página").selectOption("10");
      await expect(pagination(page)).toContainText("Página 1 de 2");

      expect(await wcagViolations(page)).toEqual([]);
    });
  });
}

test.describe("results export (en)", () => {
  test.use({ locale: "en" });

  test("uses English labels and a comma as the delimiter", async ({ page }) => {
    await page.goto("/");
    await page.route("**/api/remittances", fulfillStream(fullStream(remittance.receivables)));
    await chooseRemittance(page, remittance);

    const { fileName, lines } = await downloadCsv(page, "Export 30 receivables (CSV)");

    expect(fileName).toBe("remittance-status.csv");
    expect(lines[0]).toBe("No.,File line,NF-e access key,Status");
    expect(lines).toHaveLength(31);
  });
});
