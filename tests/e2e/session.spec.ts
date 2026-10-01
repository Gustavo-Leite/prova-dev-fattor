import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

const sampleFile = {
  name: "meu_cnab.rem",
  mimeType: "text/plain",
  buffer: readFileSync(path.join(__dirname, "../../_prova/meu_cnab.rem")),
};

test.describe("without a session", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sends the home page to the login page", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/login$/);
  });

  test("keeps the CNAB 444 layout page public", async ({ page }) => {
    const response = await page.goto("/cnab-444");

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/cnab-444$/);
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
