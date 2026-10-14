// @ts-check
// TC-R04 REAL-STACK journeys (J1 timber, J2 cladding, aluminium 11, flashing paths 13, J5 order + PDFs) against an
// ISOLATED local takeoff sandbox — real server code, real Postgres (migrations 206 + 207), real PDF renderer.
// Nothing is mocked on the takeoff path; nothing leaves this Mac.
//
//   # start an isolated sandbox (never the owner's default one) — reset it before EACH project run
//   TAKEOFF_SANDBOX_DB=blh_takeoff_tc_evidence TAKEOFF_SANDBOX_HOME=<scratch>/tc-sandbox \
//   TAKEOFF_SANDBOX_API_PORT=8798 TAKEOFF_SANDBOX_WEB_PORT=5188 \
//     npm run takeoff:sandbox -- --reset src/ui-review/fixtures/takeoff/synthetic-plan-set.pdf
//   TAKEOFF_SANDBOX_URL=http://localhost:5188 PLAYWRIGHT_BROWSERS_PATH=0 \
//     npx playwright test --config=playwright.tc-evidence.config.js --project=desktop-chromium
//   (stop + --reset the sandbox, then the same with --project=iphone13-webkit)
//
// Projects: desktop Chromium 1440 × 900 as the director (Hub route); WebKit "iPhone 13" with touch as the
// leading hand (Worker PWA route). Emulation, not a physical iPhone. Video on.
import process from "node:process";
import { defineConfig, devices } from "@playwright/test";

const OUT = process.env.TC_EVIDENCE_DIR || "docs/takeoff/evidence/tc-journeys";

export default defineConfig({
  testDir: "e2e/ui-review",
  testMatch: ["tc-journeys-sandbox.spec.js"],
  workers: 1,
  retries: 0,
  timeout: 600_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["json", { outputFile: process.env.TC_EVIDENCE_JSON || `${OUT}/_artifacts/playwright-results.json` }]],
  use: { video: "on", trace: "off", actionTimeout: 20_000 },
  projects: [
    { name: "desktop-chromium", outputDir: `${OUT}/_artifacts/desktop-chromium`, use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
    { name: "iphone13-webkit", outputDir: `${OUT}/_artifacts/iphone13-webkit`, use: { ...devices["iPhone 13"] } },
  ],
});
