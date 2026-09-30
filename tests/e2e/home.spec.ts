import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("home page", () => {
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

    await expect(page).toHaveTitle("CNAB 444 Status Checker");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("CNAB 444 Status Checker");
    await expect(page.getByRole("contentinfo")).toContainText(
      "not an official Fattor Crédito product",
    );
    expect(runtimeErrors).toEqual([]);
  });

  test("does not overflow horizontally", async ({ page }) => {
    await page.goto("/");

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );

    expect(overflows).toBe(false);
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
