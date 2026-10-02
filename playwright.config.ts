import { createHmac } from "node:crypto";

import { defineConfig, devices } from "@playwright/test";

import { maxSessionSeconds } from "./src/lib/session-cookie";

const e2eSessionSecret = "e2e-session-secret-e2e-session-secret";
export const e2eSessionToken = "e2e-session";

export function sealE2eSession(expiry: string): string {
  const signature = createHmac("sha256", e2eSessionSecret)
    .update(`${expiry}.${e2eSessionToken}`)
    .digest("base64url");
  return `${e2eSessionToken}.${expiry}.${signature}`;
}

const e2eSealedSession = sealE2eSession(
  String(Math.floor(Date.now() / 1000) + maxSessionSeconds / 2),
);

const port = 3100;
const baseURL = `http://localhost:${port}`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    storageState: {
      cookies: [
        {
          name: "session",
          value: e2eSealedSession,
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
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `bun run build && bun run start --port ${port}`,
    env: {
      FATTOR_API_BASE_URL: "https://127.0.0.1:9/public/prova-dev",
      SIGN_IN_EMAIL: "e2e@example.test",
      SIGN_IN_PASSWORD: "e2e-password",
      SESSION_SECRET: e2eSessionSecret,
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
