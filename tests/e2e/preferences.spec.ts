import type { BrowserContext, Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { wcagViolations } from "./support/a11y";

const backgroundByTheme = {
  light: "rgb(246, 248, 250)",
  dark: "rgb(11, 26, 43)",
} as const;

type Theme = keyof typeof backgroundByTheme;

const opposite: Record<Theme, Theme> = { light: "dark", dark: "light" };

function brandLink(page: Page) {
  return page
    .getByRole("banner")
    .getByRole("link", { name: /^(Status CNAB 444|CNAB 444 Status)$/ });
}

function themeGroup(page: Page) {
  return page.getByRole("group", { name: "Tema" });
}

function languageGroup(page: Page) {
  return page.getByRole("group", { name: /^(Idioma|Language)$/ });
}

async function forceTheme(context: BrowserContext, baseURL: string | undefined, theme: Theme) {
  await context.addCookies([{ name: "theme", value: theme, url: baseURL ?? "/" }]);
}

async function tabUntilFocused(page: Page, target: Locator, maxPresses = 10) {
  for (let presses = 0; presses < maxPresses; presses++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) {
      return;
    }
  }
  await expect(target).toBeFocused();
}

async function bodyBackground(page: Page) {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

test.describe("theme switcher", () => {
  test.use({ locale: "pt-BR" });

  test("persists the choice and renders it on the server", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");

    await themeGroup(page).getByRole("button", { name: "Tema escuro" }).click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(themeGroup(page).getByRole("button", { name: "Tema escuro" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await bodyBackground(page)).toBe(backgroundByTheme.dark);

    const response = await page.request.get("/");
    expect(await response.text()).toMatch(/<html[^>]*\sdata-theme="dark"/);
  });

  test("returns to the system theme", async ({ page, context, baseURL }) => {
    await forceTheme(context, baseURL, "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");

    await themeGroup(page).getByRole("button", { name: "Seguir o tema do sistema" }).click();

    await expect(
      themeGroup(page).getByRole("button", { name: "Seguir o tema do sistema" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme");
    expect(await bodyBackground(page)).toBe(backgroundByTheme.light);
    expect((await context.cookies()).some((cookie) => cookie.name === "theme")).toBe(false);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`follows a ${colorScheme} system preference by default`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/");

      await expect(page.locator("html")).not.toHaveAttribute("data-theme");
      await expect(
        themeGroup(page).getByRole("button", { name: "Seguir o tema do sistema" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(await bodyBackground(page)).toBe(backgroundByTheme[colorScheme]);
    });
  }

  for (const theme of ["light", "dark"] as const) {
    test(`forces the ${theme} theme over the opposite system preference`, async ({
      page,
      context,
      baseURL,
    }) => {
      await forceTheme(context, baseURL, theme);
      await page.emulateMedia({ colorScheme: opposite[theme] });
      await page.goto("/");

      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(await bodyBackground(page)).toBe(backgroundByTheme[theme]);
    });

    test(`has no WCAG 2.2 AA violations with the ${theme} theme forced`, async ({
      page,
      context,
      baseURL,
    }) => {
      await forceTheme(context, baseURL, theme);
      await page.emulateMedia({ colorScheme: opposite[theme] });
      await page.goto("/");

      expect(await wcagViolations(page)).toEqual([]);
    });
  }

  test("ignores an invalid theme cookie", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "theme", value: "blue", url: baseURL ?? "/" }]);
    await page.goto("/");

    await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  });

  test("is operable with the keyboard", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");

    const dark = themeGroup(page).getByRole("button", { name: "Tema escuro" });
    await tabUntilFocused(page, dark);

    await page.keyboard.press("Enter");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(dark).toHaveAttribute("aria-pressed", "true");
    await expect(dark).toBeFocused();
  });
});

test.describe("theme switcher without JavaScript", () => {
  test.use({ locale: "pt-BR", javaScriptEnabled: false });

  test("submits the form and renders the chosen theme", async ({ page }) => {
    await page.goto("/");

    await themeGroup(page).getByRole("button", { name: "Tema escuro" }).click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});

test.describe("language switcher", () => {
  test.use({ locale: "en-US" });

  test("switches the interface language", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await languageGroup(page).getByRole("button", { name: /PT/ }).click();

    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Consulta de Status CNAB 444");
    await expect(languageGroup(page).getByRole("button", { name: /PT/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  });

  test("shows the brand mark as a decoration of the home link", async ({ page }) => {
    await page.goto("/");

    const homeLink = brandLink(page);
    await expect(homeLink).toBeVisible();
    await expect(homeLink.locator("img")).toBeVisible();
    await expect(homeLink.locator("img")).toHaveAttribute("alt", "");
  });

  test("keeps the brand mark the same size in both themes", async ({ page }) => {
    const mark = brandLink(page).locator("img");
    const innerSize = () =>
      mark.evaluate((element) => {
        const style = getComputedStyle(element);
        return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      });

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const lightSize = await innerSize();
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    expect(await innerSize()).toBe(lightSize);
  });

  test("names each language with its visible code", async ({ page }) => {
    await page.goto("/");

    await expect(
      languageGroup(page).getByRole("button", { name: /^PT\s+Português$/ }),
    ).toBeVisible();
    await expect(languageGroup(page).getByRole("button", { name: /^EN\s+English$/ })).toBeVisible();
    await expect(languageGroup(page).getByRole("button", { name: /EN/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("is operable with the keyboard", async ({ page }) => {
    await page.goto("/");

    const portuguese = languageGroup(page).getByRole("button", { name: /PT/ });
    await tabUntilFocused(page, portuguese);
    await page.keyboard.press("Space");

    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  });
});
