// @ts-check
import { defineConfig, devices } from "@playwright/test";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: join(__dir, ".env") });

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5174";
const API_PORT = process.env.PORT_API || "8787";

export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: false, // shared Supabase state — serialise by default
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "e2e/report/html" }],
    ["json", { outputFile: "e2e/report/results.json" }],
  ],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  globalSetup: join(__dir, "e2e/global-setup.mjs"),
  globalTeardown: join(__dir, "e2e/global-teardown.mjs"),
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [
        "**/security/**",
        "**/smoke/api-*.spec.js",
        ...(process.env.CI ? ["**/visual/**"] : []),
      ],
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: /visual\/.*|client-portal\/.*|auth\/.*mobile.*/,
      // Snapshot baselines are OS-specific; skip mobile project in CI (Linux ≠ macOS).
      ...(process.env.CI ? { testIgnore: ["**/*"] } : {}),
    },
    {
      name: "chromium-tablet",
      use: { ...devices["iPad Pro 11"] },
      testMatch: /visual\/.*tablet.*/,
      ...(process.env.CI ? { testIgnore: ["**/*"] } : {}),
    },
    {
      name: "api-security",
      testMatch: /security\/.*|smoke\/api-.*/,
      use: { baseURL: `http://127.0.0.1:${API_PORT}` },
    },
  ],
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
