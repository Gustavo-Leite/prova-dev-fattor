import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const apiDocumentationUrl = "https://symphony.fattorcredito.com.br/public/prova-dev/swagger";

test.use({ storageState: { cookies: [], origins: [] } });

const copy = {
  title: "Entrar",
  invalidEmail: "Informe um e-mail válido, como nome@empresa.com.br.",
  missingEmail: "Informe o e-mail.",
  missingPassword: "Informe a senha.",
  rejected: "E-mail ou senha incorretos.",
  unavailable: "Não foi possível entrar agora. Tente de novo em instantes.",
  helpLabel: "Sobre as credenciais",
  helpContent:
    "Use o e-mail e a senha liberados para este app. Na demonstração, são as credenciais públicas da documentação da API.",
  tagline: "Consulte a situação das notas da sua remessa CNAB 444.",
} as const;

const signInPath = "/entrar";

const configuredCredentials = {
  email: "e2e@example.test",
  password: "e2e-password",
} as const;

function emailField(page: Page) {
  return page.getByLabel("E-mail", { exact: true });
}

function passwordField(page: Page) {
  return page.getByLabel("Senha", { exact: true });
}

function passwordToggle(page: Page) {
  return page.getByRole("button", { name: "Mostrar senha" });
}

function submitButton(page: Page) {
  return page.getByRole("button", { name: "Entrar", exact: true });
}

function unavailableAlert(page: Page) {
  return page.getByRole("alert").filter({ hasText: copy.unavailable });
}

function rejectedAlert(page: Page) {
  return page.getByRole("alert").filter({ hasText: copy.rejected });
}

function helpTrigger(page: Page) {
  return page.getByRole("button", { name: copy.helpLabel });
}

function helpContent(page: Page) {
  return page.getByRole("dialog", { name: copy.helpLabel });
}

function formScroller(page: Page) {
  return page.locator('[data-slot="sign-in-scroller"]');
}

function heroPhoto(page: Page) {
  return page.locator('[data-slot="sign-in-hero"] img').first();
}

async function openHydrated(page: Page) {
  await page.goto(signInPath);
  await expect(passwordToggle(page)).toBeVisible();
}

async function expectNoAxeViolations(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(wcagTags).analyze()).violations).toEqual([]);
}

async function skipBrowserValidation(page: Page) {
  await page
    .locator("form")
    .filter({ has: emailField(page) })
    .evaluate((form) => {
      (form as HTMLFormElement).noValidate = true;
    });
}

async function submit(page: Page, email: string, password: string) {
  await emailField(page).fill(email);
  await passwordField(page).fill(password);
  await submitButton(page).click();
}

test.describe("sign-in page (pt-BR)", () => {
  test.use({ locale: "pt-BR" });

  test("opens with a title, a heading and the link to the demo credentials", async ({ page }) => {
    await openHydrated(page);

    await expect(page).toHaveTitle(copy.title);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.title);
    await expect(
      page.getByRole("link", { name: "Ver as credenciais de demonstração na documentação da API" }),
    ).toHaveAttribute("href", apiDocumentationUrl);
    await expect(emailField(page)).toHaveAttribute("autocomplete", "email");
    await expect(emailField(page)).toHaveAttribute("maxlength", "254");
    await expect(passwordField(page)).toHaveAttribute("autocomplete", "current-password");
    await expect(passwordField(page)).toHaveAttribute("maxlength", "256");
  });

  test("stands on its own, without the main navigation", async ({ page }) => {
    await openHydrated(page);

    await expect(page.getByRole("navigation", { name: "Principal" })).toHaveCount(0);
    await expect(page.getByText(copy.tagline)).toBeVisible();
  });

  test("loads the hero photo and shows it", async ({ page }) => {
    await openHydrated(page);
    const photo = heroPhoto(page);

    await expect(photo).toBeVisible();
    await expect(photo).toHaveAttribute("alt", "");
    await expect(photo).toHaveAttribute("fetchpriority", "high");
    await expect(photo).toHaveAttribute("loading", "eager");
    await expect
      .poll(() => photo.evaluate((image) => (image as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  });

  test("opens the credentials help on click and closes it with Escape", async ({ page }) => {
    await openHydrated(page);
    await expect(helpContent(page)).toHaveCount(0);

    await helpTrigger(page).click();

    await expect(helpContent(page)).toBeVisible();
    await expect(helpContent(page)).toHaveText(copy.helpContent);
    await expect(helpTrigger(page)).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");

    await expect(helpContent(page)).toBeHidden();
    await expect(helpTrigger(page)).toBeFocused();
  });

  test("opens the credentials help on tap and closes it on a tap outside", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "desktops are covered by the click and hover tests");
    await openHydrated(page);

    await helpTrigger(page).tap();

    await expect(helpContent(page)).toBeVisible();
    await expect(helpTrigger(page)).toHaveAttribute("aria-expanded", "true");

    await page.getByText(copy.tagline).tap();

    await expect(helpContent(page)).toBeHidden();
  });

  test("scrolls only the form column on a short desktop", async ({ page, isMobile }) => {
    test.skip(isMobile, "phones keep the natural page scroll");
    await page.setViewportSize({ width: 1280, height: 640 });
    await openHydrated(page);

    await submitButton(page).scrollIntoViewIfNeeded();

    await expect(submitButton(page)).toBeInViewport();
    expect(
      await page.evaluate(() => ({
        documentScrolls:
          document.documentElement.scrollHeight > document.documentElement.clientHeight,
        windowScrollY: window.scrollY,
      })),
    ).toEqual({ documentScrolls: false, windowScrollY: 0 });
    await expect(formScroller(page)).toHaveCSS("overflow-y", "auto");
  });

  test("opens the credentials help on hover", async ({ page, isMobile }) => {
    test.skip(isMobile, "phones have no hover; the tap opens the help");
    await openHydrated(page);

    await helpTrigger(page).hover();

    await expect(helpContent(page)).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(helpContent(page)).toBeHidden();
  });

  test("switches the theme and the language", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openHydrated(page);
    const themeGroup = page.getByRole("group", { name: "Tema" });

    await themeGroup.getByRole("button", { name: "Tema escuro" }).click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(themeGroup.getByRole("button", { name: "Tema escuro" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page
      .getByRole("group", { name: "Idioma" })
      .getByRole("button", { name: /English/ })
      .click();

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
    await expect(page).toHaveURL(/\/entrar$/);
  });

  test("shows the server error for an email the browser accepts and focuses it", async ({
    page,
  }) => {
    await openHydrated(page);

    await submit(page, "user@localhost", "any-password");

    await expect(emailField(page)).toHaveAttribute("aria-invalid", "true");
    await expect(emailField(page)).toHaveAccessibleDescription(copy.invalidEmail);
    await expect(emailField(page)).toHaveValue("user@localhost");
    await expect(emailField(page)).toBeFocused();
    await expect(passwordField(page)).not.toHaveAttribute("aria-invalid");
  });

  test("shows the server errors for empty fields", async ({ page }) => {
    await openHydrated(page);
    await skipBrowserValidation(page);

    await submitButton(page).click();

    await expect(emailField(page)).toHaveAccessibleDescription(copy.missingEmail);
    await expect(passwordField(page)).toHaveAccessibleDescription(copy.missingPassword);
    await expect(passwordField(page)).toHaveAttribute("aria-invalid", "true");
    await expect(emailField(page)).toBeFocused();
  });

  test("focuses the password when it is the only field missing", async ({ page }) => {
    await openHydrated(page);
    await skipBrowserValidation(page);

    await submit(page, "user@example.com", "");

    await expect(passwordField(page)).toHaveAccessibleDescription(copy.missingPassword);
    await expect(passwordField(page)).toBeFocused();
    await expect(emailField(page)).not.toHaveAttribute("aria-invalid");
  });

  test("shows and hides the password", async ({ page }) => {
    await openHydrated(page);
    await passwordField(page).fill("any-password");
    const toggle = passwordToggle(page);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(toggle).toHaveAttribute(
      "aria-controls",
      (await passwordField(page).getAttribute("id")) ?? "missing-id",
    );

    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(passwordField(page)).toHaveAttribute("type", "text");
    await expect(passwordField(page)).toHaveValue("any-password");

    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(passwordField(page)).toHaveAttribute("type", "password");
  });

  test("hides the password again when the form is submitted", async ({ page }) => {
    await openHydrated(page);
    await emailField(page).fill(configuredCredentials.email);
    await passwordField(page).fill(configuredCredentials.password);
    await passwordToggle(page).click();
    await expect(passwordField(page)).toHaveAttribute("type", "text");

    await submitButton(page).click();

    await expect(unavailableAlert(page)).toBeVisible();
    await expect(passwordField(page)).toHaveAttribute("type", "password");
    await expect(passwordToggle(page)).toHaveAttribute("aria-pressed", "false");
  });

  test("keeps the email and clears the password when the API is unreachable", async ({ page }) => {
    await openHydrated(page);

    await submit(page, configuredCredentials.email, configuredCredentials.password);

    await expect(unavailableAlert(page)).toBeVisible();
    await expect(emailField(page)).toHaveValue(configuredCredentials.email);
    await expect(passwordField(page)).toHaveValue("");
    await expect(submitButton(page)).not.toHaveAttribute("aria-disabled", "true");
    await expect(page).toHaveURL(/\/entrar$/);
  });

  test("rejects a credential other than the configured one", async ({ page }) => {
    await openHydrated(page);

    await submit(page, "user@example.com", "any-password");

    await expect(rejectedAlert(page)).toBeVisible();
    await expect(unavailableAlert(page)).toHaveCount(0);
    await expect(emailField(page)).toHaveValue("user@example.com");
    await expect(passwordField(page)).toHaveValue("");
    await expect(page).toHaveURL(/\/entrar$/);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openHydrated(page);

      await expectNoAxeViolations(page);

      await helpTrigger(page).click();
      await expect(helpContent(page)).toBeVisible();

      await expectNoAxeViolations(page);

      await page.keyboard.press("Escape");
      await expect(helpContent(page)).toBeHidden();
      await submit(page, "user@localhost", "any-password");
      await expect(emailField(page)).toHaveAttribute("aria-invalid", "true");

      await expectNoAxeViolations(page);

      await submit(page, "user@example.com", "any-password");
      await expect(rejectedAlert(page)).toBeVisible();

      await expectNoAxeViolations(page);

      await submit(page, configuredCredentials.email, configuredCredentials.password);
      await expect(unavailableAlert(page)).toBeVisible();

      await expectNoAxeViolations(page);
    });
  }

  test("does not overflow horizontally at 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await openHydrated(page);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );

    expect(overflows).toBe(false);
    await expect(heroPhoto(page)).toBeVisible();
    await expect(submitButton(page)).toBeInViewport();
  });
});

test.describe("former sign-in address", () => {
  test("answers 404 at /login", async ({ page }) => {
    const response = await page.goto("/login");

    expect(response?.status()).toBe(404);
  });
});

test.describe("sign-in page without JavaScript", () => {
  test.use({ locale: "pt-BR", javaScriptEnabled: false });

  test("submits the form and reports the unreachable API", async ({ page }) => {
    await page.goto(signInPath);
    await expect(passwordToggle(page)).toHaveCount(0);

    await submit(page, configuredCredentials.email, configuredCredentials.password);

    await expect(unavailableAlert(page)).toBeVisible();
    await expect(emailField(page)).toHaveValue(configuredCredentials.email);
    await expect(passwordField(page)).toHaveValue("");
    await expect(passwordToggle(page)).toHaveCount(0);
  });
});
