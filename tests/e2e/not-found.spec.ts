import { expect, test } from "@playwright/test";

import { wcagViolations } from "./support/a11y";

const missingPath = "/this-page-does-not-exist";

const copyByLocale = {
  en: { title: "Page not found", backHome: "Back to home" },
  "pt-BR": { title: "Página não encontrada", backHome: "Voltar ao início" },
} as const;

for (const [locale, copy] of Object.entries(copyByLocale)) {
  test.describe(`not found page (${locale} browser)`, () => {
    test.use({ locale });

    test("answers 404 with translated content and a way back home", async ({ page }) => {
      const response = await page.goto(missingPath);

      expect(response?.status()).toBe(404);
      await expect(page).toHaveTitle(copy.title);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.title);

      await page.getByRole("link", { name: copy.backHome }).click();

      await expect(page).toHaveURL("/");
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(missingPath);

        expect(await wcagViolations(page)).toEqual([]);
      });
    }
  });
}
