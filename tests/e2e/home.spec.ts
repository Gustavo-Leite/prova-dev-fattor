import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const copyByLocale = {
  en: {
    title: "CNAB 444 Status Checker",
    disclaimer: "not an official Fattor Crédito product",
  },
  "pt-BR": {
    title: "Consulta de Status CNAB 444",
    disclaimer: "não é um produto oficial da Fattor Crédito",
  },
} as const;

for (const [locale, copy] of Object.entries(copyByLocale)) {
  test.describe(`home page (${locale} browser)`, () => {
    test.use({ locale });

    test("renders the page shell without runtime errors", async ({ page }) => {
      const runtimeErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          runtimeErrors.push(message.text());
        }
      });
      page.on("pageerror", (error) => {
        runtimeErrors.push(error.message);
      });

      await page.goto("/");

      await expect(page).toHaveTitle(copy.title);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.title);
      await expect(page.getByRole("contentinfo")).toContainText(copy.disclaimer);
      expect(runtimeErrors).toEqual([]);
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto("/");

        const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();

        expect(results.violations).toEqual([]);
      });
    }
  });
}

test.describe("home page layout", () => {
  test("does not overflow horizontally", async ({ page }) => {
    await page.goto("/");

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );

    expect(overflows).toBe(false);
  });
});

test.describe("locale cookie", () => {
  test.use({ locale: "en-US" });

  test("overrides the browser language", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "NEXT_LOCALE", value: "pt-BR", url: baseURL ?? "/" }]);

    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copyByLocale["pt-BR"].title);
  });

  test("is ignored when it holds an unsupported locale", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "NEXT_LOCALE", value: "fr", url: baseURL ?? "/" }]);

    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});
