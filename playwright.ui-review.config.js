// @ts-check
// UI Review — self-contained Playwright config (review-only).
//
// Serves the app with VITE_UI_REVIEW_MODE=true on a dedicated port so all data is mocked
// client-side. No globalSetup / Supabase seeding / API credentials — unlike the main
// playwright.config.js. Run:  npx playwright test --config=playwright.ui-review.config.js
import process from "node:process";
import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.UI_REVIEW_PORT || "5180";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: join(__dir, "e2e/ui-review"),
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: join(__dir, "docs/ui-review/export-2026-06-27/raw/test-artifacts"),
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: join(__dir, "docs/ui-review/export-2026-06-27/raw/playwright-html") }],
    ["json", { outputFile: join(__dir, "docs/ui-review/export-2026-06-27/raw/playwright-results.json") }],
  ],
  use: {
    baseURL: BASE_URL,
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  webServer: {
    command: `VITE_UI_REVIEW_MODE=true npx vite --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: { VITE_UI_REVIEW_MODE: "true" },
  },
});
