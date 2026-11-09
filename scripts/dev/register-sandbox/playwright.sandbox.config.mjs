// Playwright config for the R05 walkthrough. LOOPBACK SANDBOX ONLY. The repo's own playwright.config targets production.
// Run: PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test --config scripts/dev/register-sandbox/playwright.sandbox.config.mjs
import { defineConfig, devices } from "@playwright/test";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const BASE = "http://localhost:5184";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("Refusing: loopback sandbox only.");
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: join(here, "../../tests/walkthrough"),
  outputDir: join(homedir(), "blh-register-evidence", "r05", "p7", "output"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240000,
  reporter: [["list"]],
  use: { baseURL: BASE, trace: "off", screenshot: "off", video: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "phone", use: { ...devices["Pixel 5"], viewport: { width: 375, height: 812 }, hasTouch: true } },
  ],
});
