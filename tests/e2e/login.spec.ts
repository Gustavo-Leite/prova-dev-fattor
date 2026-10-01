import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const apiDocumentationUrl = "https://symphony.fattorcredito.com.br/public/prova-dev/swagger";

const copy = {
  title: "Entrar",
  invalidEmail: "Informe um e-mail válido, como nome@empresa.com.br.",
  missingEmail: "Informe o e-mail.",
  missingPassword: "Informe a senha.",
  unavailable: "Não foi possível entrar agora. Tente de novo em instantes.",
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

async function openHydrated(page: Page) {
  await page.goto("/login");
  await expect(passwordToggle(page)).toBeVisible();
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

test.describe("login page (pt-BR)", () => {
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
    await emailField(page).fill("user@example.com");
    await passwordField(page).fill("any-password");
    await passwordToggle(page).click();
    await expect(passwordField(page)).toHaveAttribute("type", "text");

    await submitButton(page).click();

    await expect(unavailableAlert(page)).toBeVisible();
    await expect(passwordField(page)).toHaveAttribute("type", "password");
    await expect(passwordToggle(page)).toHaveAttribute("aria-pressed", "false");
  });

  test("keeps the email and clears the password when the API is unreachable", async ({ page }) => {
    await openHydrated(page);

    await submit(page, "user@example.com", "any-password");

    await expect(unavailableAlert(page)).toBeVisible();
    await expect(emailField(page)).toHaveValue("user@example.com");
    await expect(passwordField(page)).toHaveValue("");
    await expect(submitButton(page)).not.toHaveAttribute("aria-disabled", "true");
    await expect(page).toHaveURL(/\/login$/);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no WCAG 2.2 AA violations in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await openHydrated(page);

      expect((await new AxeBuilder({ page }).withTags(wcagTags).analyze()).violations).toEqual([]);

      await submit(page, "user@localhost", "any-password");
      await expect(emailField(page)).toHaveAttribute("aria-invalid", "true");

      expect((await new AxeBuilder({ page }).withTags(wcagTags).analyze()).violations).toEqual([]);

      await submit(page, "user@example.com", "any-password");
      await expect(unavailableAlert(page)).toBeVisible();

      expect((await new AxeBuilder({ page }).withTags(wcagTags).analyze()).violations).toEqual([]);
    });
  }

  test("does not overflow horizontally at 360px", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await openHydrated(page);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );

    expect(overflows).toBe(false);
    await expect(submitButton(page)).toBeInViewport();
  });
});

test.describe("login page without JavaScript", () => {
  test.use({ locale: "pt-BR", javaScriptEnabled: false });

  test("submits the form and reports the unreachable API", async ({ page }) => {
    await page.goto("/login");
    await expect(passwordToggle(page)).toHaveCount(0);

    await submit(page, "user@example.com", "any-password");

    await expect(unavailableAlert(page)).toBeVisible();
    await expect(emailField(page)).toHaveValue("user@example.com");
    await expect(passwordField(page)).toHaveValue("");
    await expect(passwordToggle(page)).toHaveCount(0);
  });
});
