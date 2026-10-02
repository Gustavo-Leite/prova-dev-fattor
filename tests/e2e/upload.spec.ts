import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { fulfillStream, fullStream } from "./remittance-stream";
import { wcagViolations } from "./support/a11y";
import { chooseSample, fileInput, uploadAlert, uploadStatus } from "./support/locators";

type HeldReadWindow = Window & { __releaseRead?: () => void };

async function uploadBuffer(page: Page, name: string, content: string | Buffer) {
  await fileInput(page).setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: typeof content === "string" ? Buffer.from(content) : content,
  });
}

async function dropFiles(page: Page, files: readonly { name: string; content: string }[]) {
  await page.evaluate((specs) => {
    const dropzone = document.querySelector("main label");
    if (!dropzone) {
      throw new Error("dropzone not found");
    }
    const transfer = new DataTransfer();
    for (const spec of specs) {
      transfer.items.add(new File([spec.content], spec.name));
    }
    for (const type of ["dragover", "drop"]) {
      dropzone.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }),
      );
    }
  }, files);
}

async function isDragCancelled(page: Page, payload: "file" | "text") {
  return page.evaluate((kind) => {
    const transfer = new DataTransfer();
    if (kind === "file") {
      transfer.items.add(new File(["x"], "a.rem"));
    } else {
      transfer.setData("text/plain", "x");
    }
    return ["dragover", "drop"].map(
      (type) =>
        !window.dispatchEvent(new DragEvent(type, { cancelable: true, dataTransfer: transfer })),
    );
  }, payload);
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/remittances", fulfillStream(fullStream()));
});

test.describe("remittance upload (pt-BR)", () => {
  test.use({ locale: "pt-BR" });

  test.describe("from a loaded page", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
    });

    test("accepts the challenge file and reports its receivables", async ({ page }) => {
      await chooseSample(page);

      const status = uploadStatus(page);
      await expect(status).toContainText("10 títulos lidos em meu_cnab.rem.");
      await expect(status).toContainText("7 chaves têm dígito verificador inválido");
      await expect(uploadAlert(page)).toHaveCount(0);
      await expect(page.getByText("Anexar outro arquivo")).toBeVisible();
    });

    test("lists the layout problems of an invalid file", async ({ page }) => {
      let requests = 0;
      await page.route("**/api/remittances", async (route) => {
        requests++;
        await fulfillStream(fullStream())(route);
      });

      await uploadBuffer(page, "errado.rem", "not a remittance\n");

      const alert = uploadAlert(page);
      await expect(alert).toContainText("O arquivo não segue o layout CNAB 444.");
      await expect(alert).toContainText("Arquivo: errado.rem");
      await expect(alert).toContainText("Linha 1: tem 16 caracteres; o esperado são 444.");
      await expect(uploadStatus(page)).toBeEmpty();
      await expect(fileInput(page)).toHaveAttribute("aria-invalid", "true");

      await chooseSample(page);
      await expect(page.getByRole("button", { name: "Consultar de novo" })).toBeVisible();
      expect(requests).toBe(1);
    });

    test("refuses a file above the size limit", async ({ page }) => {
      await uploadBuffer(page, "grande.rem", Buffer.alloc(128 * 1024 + 1, "0"));

      await expect(uploadAlert(page)).toContainText("O arquivo passa de 128 KB.");
    });

    test("replaces a rejection when a valid file is chosen next", async ({ page }) => {
      await uploadBuffer(page, "errado.rem", "not a remittance\n");
      await expect(uploadAlert(page)).toBeVisible();

      await chooseSample(page);

      await expect(uploadAlert(page)).toHaveCount(0);
      await expect(uploadStatus(page)).toContainText("10 títulos lidos");
      await expect(fileInput(page)).toHaveAttribute("aria-invalid", "false");
    });

    test("accepts a file dropped on the dropzone", async ({ page }) => {
      await dropFiles(page, [{ name: "vazio.rem", content: "" }]);

      await expect(uploadAlert(page)).toContainText("O arquivo está vazio.");
    });

    test("refuses more than one dropped file", async ({ page }) => {
      await dropFiles(page, [
        { name: "a.rem", content: "x" },
        { name: "b.rem", content: "y" },
      ]);

      await expect(uploadAlert(page)).toContainText("Envie um arquivo por vez.");
    });

    test("keeps the browser from opening a dropped file but lets text drops through", async ({
      page,
    }) => {
      await expect.poll(() => isDragCancelled(page, "file")).toEqual([true, true]);

      expect(await isDragCancelled(page, "text")).toEqual([false, false]);
    });

    test("can be reached from the keyboard with a visible focus", async ({ page }) => {
      await page.getByRole("banner").getByRole("button").last().focus();
      await page.keyboard.press("Tab");
      await expect(fileInput(page)).toBeFocused();

      const dropzone = page.locator("label", { has: fileInput(page) });
      const outlineStyle = await dropzone.evaluate(
        (element) => getComputedStyle(element).outlineStyle,
      );
      expect(outlineStyle).not.toBe("none");
    });
  });

  test("keeps reading a file when an empty drop arrives meanwhile", async ({ page }) => {
    await page.addInitScript(() => {
      const readReleased = new Promise<void>((resolve) => {
        Object.assign(window, { __releaseRead: resolve });
      });
      File.prototype.arrayBuffer = function heldArrayBuffer(this: File) {
        return readReleased.then(() => new Response(this).arrayBuffer());
      };
    });
    await page.goto("/");

    await chooseSample(page);
    try {
      await expect(uploadStatus(page)).toContainText("Lendo meu_cnab.rem");
      await dropFiles(page, []);
    } finally {
      await page.evaluate(() => {
        (window as HeldReadWindow).__releaseRead?.();
      });
    }

    await expect(uploadStatus(page)).toContainText("10 títulos lidos");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`in ${colorScheme} mode`, () => {
      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await page.goto("/");
      });

      test("has no WCAG 2.2 AA violations after a rejection", async ({ page }) => {
        await uploadBuffer(page, "errado.rem", "not a remittance\n");
        await expect(uploadAlert(page)).toBeVisible();

        expect(await wcagViolations(page)).toEqual([]);
      });

      test("has no WCAG 2.2 AA violations after a valid file", async ({ page }) => {
        await page.route("**/api/remittances", fulfillStream(fullStream()));
        await chooseSample(page);
        await expect(uploadStatus(page)).toContainText("10 títulos");
        await expect(page.getByRole("button", { name: "Consultar de novo" })).toBeVisible();

        expect(await wcagViolations(page)).toEqual([]);
      });
    });
  }
});

test.describe("remittance upload (en)", () => {
  test.use({ locale: "en" });

  test("reports the receivables in English", async ({ page }) => {
    await page.goto("/");
    await chooseSample(page);

    await expect(uploadStatus(page)).toContainText("10 receivables read from meu_cnab.rem.");
  });
});
