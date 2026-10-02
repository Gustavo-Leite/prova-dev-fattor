import { defineConfig, devices } from "@playwright/test";

function requireHttpsUrl(value: string | undefined): string {
  if (!value || !URL.canParse(value) || new URL(value).protocol !== "https:") {
    throw new Error("SMOKE_BASE_URL must be the https URL of the deploy to smoke test.");
  }
  return value;
}

export default defineConfig({
  testDir: "./tests/smoke",
  forbidOnly: Boolean(process.env.CI),
  retries: 1,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: requireHttpsUrl(process.env.SMOKE_BASE_URL),
    locale: "pt-BR",
    storageState: { cookies: [], origins: [] },
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
});
