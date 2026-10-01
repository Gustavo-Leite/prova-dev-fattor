import { readFileSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { e2eSessionToken, sealE2eSession } from "../../playwright.config";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

function signOutButton(page: Page) {
  return page.getByRole("button", { name: "Sair", exact: true });
}

async function sessionCookies(context: BrowserContext) {
  return (await context.cookies()).filter((cookie) => cookie.name === "session");
}

async function signOutAndExpectSignedOut(page: Page, context: BrowserContext) {
  await page.goto("/");
  expect(await sessionCookies(context)).toHaveLength(1);

  await signOutButton(page).click();

  await expect(page).toHaveURL(/\/entrar$/);
  expect(await sessionCookies(context)).toEqual([]);

  await page.goto("/");

  await expect(page).toHaveURL(/\/entrar$/);
}

const sampleFile = {
  name: "meu_cnab.rem",
  mimeType: "text/plain",
  buffer: readFileSync(path.join(__dirname, "../../_prova/meu_cnab.rem")),
};

test.describe("without a session", () => {
  test.use({ storageState: { cookies: [], origins: [] }, locale: "pt-BR" });

  test("sends the home page to the sign-in page", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/entrar$/);
  });

  test("keeps the CNAB 444 layout page public", async ({ page }) => {
    const response = await page.goto("/cnab-444");

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/cnab-444$/);
  });

  test("offers no sign out on the CNAB 444 layout page", async ({ page }) => {
    await page.goto("/cnab-444");

    await expect(page.getByRole("navigation", { name: "Principal" })).toBeVisible();
    await expect(signOutButton(page)).toHaveCount(0);
  });

  test("refuses an upload before reading the file", async ({ request }) => {
    const response = await request.post("/api/remittances", {
      multipart: { file: sampleFile },
    });

    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(await response.json()).toEqual({ code: "SESSION_EXPIRED" });
  });
});

test.describe("with a raw token that was never sealed", () => {
  test.use({
    storageState: {
      cookies: [
        {
          name: "session",
          value: e2eSessionToken,
          domain: "localhost",
          path: "/",
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
          expires: -1,
        },
      ],
      origins: [],
    },
  });

  test("sends the home page to the sign-in page", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/entrar$/);
  });

  test("refuses an upload", async ({ context }) => {
    const response = await context.request.post("/api/remittances", {
      multipart: { file: sampleFile },
    });

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ code: "SESSION_EXPIRED" });
  });
});

test.describe("with a session", () => {
  test("refuses an upload sent from another origin", async ({ context }) => {
    const response = await context.request.post("/api/remittances", {
      headers: { origin: "https://evil.example" },
      multipart: { file: sampleFile },
    });

    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({ code: "CROSS_SITE_REQUEST" });
  });

  test("starts checking the uploaded file", async ({ context }) => {
    const response = await context.request.post("/api/remittances", {
      multipart: { file: sampleFile },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/x-ndjson; charset=utf-8");
    const [firstLine] = (await response.text()).split("\n");
    expect(JSON.parse(firstLine ?? "")).toEqual({ type: "started", total: 10 });
  });
});

const unusableSessionCookies = {
  tampered: `x.1.${"A".repeat(43)}`,
  expired: sealE2eSession("1000000000"),
} as const;

for (const [kind, value] of Object.entries(unusableSessionCookies)) {
  test.describe(`with a ${kind} session cookie`, () => {
    test.use({
      locale: "pt-BR",
      storageState: {
        cookies: [
          {
            name: "session",
            value,
            domain: "localhost",
            path: "/",
            httpOnly: true,
            secure: false,
            sameSite: "Lax",
            expires: -1,
          },
        ],
        origins: [],
      },
    });

    test("offers no sign out on the CNAB 444 layout page", async ({ page }) => {
      await page.goto("/cnab-444");

      await expect(page.getByRole("navigation", { name: "Principal" })).toBeVisible();
      await expect(signOutButton(page)).toHaveCount(0);
    });
  });
}

test.describe("signing out", () => {
  test.use({ locale: "pt-BR" });

  test("ends the session and sends the user to the sign-in page", async ({ page, context }) => {
    await signOutAndExpectSignedOut(page, context);
  });

  test("keeps the sign out reachable at 360px without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/");

    await expect(signOutButton(page)).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no WCAG 2.2 AA violations with the sign out in ${colorScheme} mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/");
      await expect(signOutButton(page)).toBeVisible();

      expect((await new AxeBuilder({ page }).withTags(wcagTags).analyze()).violations).toEqual([]);
    });
  }
});

test.describe("signing out without JavaScript", () => {
  test.use({ locale: "pt-BR", javaScriptEnabled: false });

  test("ends the session through the plain form", async ({ page, context }) => {
    await signOutAndExpectSignedOut(page, context);
  });
});
