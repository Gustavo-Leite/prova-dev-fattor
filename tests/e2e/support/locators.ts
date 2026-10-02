import path from "node:path";

import type { Page } from "@playwright/test";

export const samplePath = path.join(__dirname, "../../../_prova/meu_cnab.rem");

export function fileInput(page: Page) {
  return page.locator('input[type="file"]');
}

export function uploadSection(page: Page) {
  return page.locator("section", { has: fileInput(page) });
}

export function uploadStatus(page: Page) {
  return uploadSection(page).getByRole("status");
}

export function uploadAlert(page: Page) {
  return uploadSection(page).getByRole("alert");
}

export async function chooseSample(page: Page) {
  await fileInput(page).setInputFiles(samplePath);
}

export async function chooseRemittance(
  page: Page,
  remittance: { readonly buffer: Buffer; readonly receivables: readonly unknown[] },
) {
  await fileInput(page).setInputFiles({
    name: `remessa-${remittance.receivables.length}.rem`,
    mimeType: "application/octet-stream",
    buffer: remittance.buffer,
  });
}

export function milestone(page: Page) {
  return page.getByRole("status").filter({ hasText: /^Consult/ });
}

export function resultsSection(page: Page) {
  return page.getByRole("region", { name: "Situação das notas" });
}

export function listAnnouncement(page: Page) {
  return resultsSection(page).getByRole("status");
}

export function pagination(page: Page) {
  return resultsSection(page).getByRole("navigation", { name: "Páginas dos resultados" });
}

export function statusFilters(page: Page) {
  return resultsSection(page).getByRole("group", { name: "Filtrar por situação" });
}

export function statusFilter(page: Page, name: RegExp) {
  return statusFilters(page).getByRole("button", { name });
}

export function visibleRowFor(page: Page, key: string) {
  return resultsSection(page).locator("tr, li").filter({ hasText: key }).filter({ visible: true });
}

export function visibleRows(page: Page) {
  return resultsSection(page)
    .locator("tbody tr, li")
    .filter({ hasText: /\d{44}/ })
    .filter({ visible: true });
}
