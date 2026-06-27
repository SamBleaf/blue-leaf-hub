// UI Review — render-verified screenshot capture (desktop / tablet / mobile). Review-only.
//
//   npm run test:ui-review     (or: npx playwright test --config=playwright.ui-review.config.js)
//
// Serves the app with VITE_UI_REVIEW_MODE=true (see config webServer) → every view renders from
// local fixtures, no credentials. For each route it: waits for html[data-ui-review-ready="true"],
// fails the route if visible text contains a known loading/error phrase, captures console errors,
// always saves a screenshot (even on failure), and writes a per-route result JSON for the reports.
import { test, expect } from "@playwright/test";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync, writeFileSync } from "fs";
import { ROUTES, VIEWPORTS } from "./routes.mjs";

const EXPORT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "ui-review", "export-2026-06-27");
const SHOTS = join(EXPORT, "screenshots");
const RESULTS = join(EXPORT, "raw", "results");

// Phrases that mean the page is NOT genuinely rendered.
const FORBIDDEN = [
  "Loading session", "Preparing your home journey", "No project linked yet",
  "Something went wrong", "Failed to load", "Unauthorized", "Sign in required", "Missing project",
];
// undefined / null as standalone visible tokens (word-boundary to avoid false positives).
const TOKEN_FORBIDDEN = [/(^|\s)undefined(\s|$|[.,!])/, /(^|\s)null(\s|$|[.,!])/];

mkdirSync(RESULTS, { recursive: true });

for (const vp of VIEWPORTS) {
  test.describe(`@${vp.name}`, () => {
    for (const r of ROUTES) {
      test(`${vp.name} · ${r.name}`, async ({ page }) => {
        const consoleErrors = [];
        page.on("console", (m) => {
          const t = m.type();
          if (t === "error" || t === "warning") consoleErrors.push(`[${t}] ${m.text()}`);
        });
        page.on("pageerror", (e) => consoleErrors.push(`[pageerror] ${e.message}`));

        await page.setViewportSize({ width: vp.width, height: vp.height });
        const url = `${r.path}${r.path.includes("?") ? "&" : "?"}reviewRole=${r.role}`;
        const result = {
          name: r.name, area: r.area, role: r.role, path: r.path, viewport: vp.name, url,
          status: "pass", reason: "", blockers: [], consoleErrors: [],
          screenshot: `screenshots/${vp.name}/${r.name}.png`,
        };

        let readyOk = true;
        try {
          await page.goto(url, { waitUntil: "domcontentloaded" });
          await page.waitForSelector('html[data-ui-review-ready="true"]', { timeout: 12_000 });
        } catch {
          readyOk = false;
        }
        await page.waitForTimeout(350); // settle paint

        const bodyText = (await page.locator("body").innerText().catch(() => "")) || "";
        const blockers = FORBIDDEN.filter((s) => bodyText.includes(s));
        for (const rx of TOKEN_FORBIDDEN) if (rx.test(bodyText)) blockers.push(rx.source.includes("undefined") ? "undefined" : "null");

        // Always capture evidence, even on failure.
        await page.screenshot({ path: join(SHOTS, vp.name, `${r.name}.png`), fullPage: true }).catch(() => {});

        result.consoleErrors = consoleErrors.slice(0, 40);
        if (!readyOk) { result.status = "fail"; result.reason = "ready marker not set within 12s (stuck loading or crashed)"; }
        else if (blockers.length) { result.status = "fail"; result.blockers = blockers; result.reason = `forbidden text: ${blockers.join(", ")}`; }
        else if (bodyText.trim().length < 20) { result.status = "fail"; result.reason = "near-empty body"; }

        writeFileSync(join(RESULTS, `${vp.name}__${r.name}.json`), JSON.stringify(result, null, 2));

        expect(result.status, `${url} — ${result.reason || "ok"}`).toBe("pass");
      });
    }
  });
}
