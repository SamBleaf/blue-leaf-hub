// @ts-check
// Takeoff evidence runs against the LOCAL sandbox (npm run takeoff:sandbox) — real server code + real
// SQL — and against UI Review Mode for viewer geometry, on Chromium AND WebKit (Safari engine, iPhone
// emulation with touch). Records video. This is emulation, not a physical iPhone.
//   TAKEOFF_SANDBOX_URL=http://localhost:5181 PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test --config=playwright.takeoff-evidence.config.js
import process from "node:process";
import { defineConfig, devices } from "@playwright/test";

const OUT = process.env.TAKEOFF_EVIDENCE_DIR || "docs/takeoff/evidence/workflow";

export default defineConfig({
  testDir: "e2e/ui-review",
  testMatch: ["takeoff-capture.spec.js"],
  workers: 1,
  timeout: 240_000,
  // per-project artifact folders, so running one project does not wipe the other's recording
  reporter: [["list"], ["json", { outputFile: process.env.TAKEOFF_EVIDENCE_JSON || `${OUT}/_artifacts/playwright-results.json` }]],
  use: { video: "on", trace: "off" },
  projects: [
    { name: "desktop-chromium", outputDir: `${OUT}/_artifacts/desktop-chromium`, use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
    { name: "iphone13-webkit", outputDir: `${OUT}/_artifacts/iphone13-webkit`, use: { ...devices["iPhone 13"] } },
  ],
});
