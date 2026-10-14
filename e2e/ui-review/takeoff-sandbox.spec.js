// @ts-check
// Full-stack smoke against the LOCAL takeoff sandbox (real server code + real SQL + real PDF render).
// Runs only when the sandbox is up and loaded with the synthetic plan set:
//   npm run takeoff:sandbox -- --reset src/ui-review/fixtures/takeoff/synthetic-plan-set.pdf
//   TAKEOFF_SANDBOX_URL=http://localhost:5181 PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test --config=playwright.ui-review.config.js e2e/ui-review/takeoff-sandbox.spec.js
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const BASE = process.env.TAKEOFF_SANDBOX_URL;
const JOB = "5a4db0c5-0000-4000-8000-00000000a001";
const meta = JSON.parse(readFileSync(new URL("../../src/ui-review/fixtures/takeoff/synthetic-plan-set.json", import.meta.url), "utf8"));
const k = meta.pages[0].pdfUnitsPerMm, BX = 120, BY = 150;

test.skip(!BASE, "set TAKEOFF_SANDBOX_URL to run against the local sandbox");
test.use({ viewport: { width: 1280, height: 900 } });

async function screenOf(page, p) {
  return page.evaluate((pt) => { const el = document.querySelector("[data-takeoff-viewport]"); const s = el.takeoffViewport.toScreen(pt); const r = el.getBoundingClientRect(); return { x: r.left + s.x, y: r.top + s.y }; }, p);
}

test("sandbox: scale, draw a flashing, measure, export a REAL supplier PDF", async ({ page }) => {
  await page.goto(`${BASE}/carpentry/${JOB}/takeoff?reviewRole=admin`);
  const start = page.getByRole("button", { name: "Start a flashing takeoff" });
  if (await start.waitFor({ timeout: 8000 }).then(() => true, () => false)) await start.click();
  await expect(page.getByRole("heading", { name: /^(Takeoff|Flashings)$/ })).toBeVisible();

  // scale page 1
  await page.getByRole("button", { name: "Scale this page" }).click();
  await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0, null, { timeout: 30_000 });
  await page.getByRole("button", { name: "Scale the whole page" }).click();
  const tap = async (p) => { const s = await screenOf(page, p); await page.mouse.click(s.x, s.y); };
  await tap({ x: BX, y: BY - 40 }); await tap({ x: BX + 12000 * k, y: BY - 40 });
  await page.getByRole("textbox", { name: "Horizontal dimension" }).fill("12000"); await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await tap({ x: BX - 40, y: BY }); await tap({ x: BX - 40, y: BY + 8000 * k });
  await page.getByRole("textbox", { name: "Vertical dimension" }).fill("8000"); await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: /Next: check/ }).click();
  await tap({ x: BX, y: BY + 8000 * k + 30 }); await tap({ x: BX + 3000 * k, y: BY + 8000 * k + 30 });
  await page.getByRole("textbox", { name: "Printed check dimension" }).fill("3000"); await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Save scale" }).click();

  // no material yet → Done → Add flashing: tap it out on the empty grid (autosaves), choose the colour, Lengths
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Add flashing" }).click();
  await page.getByRole("button", { name: "New flashing" }).click();
  const dlg = page.getByRole("dialog", { name: /^Flashing/ });
  const gb = await dlg.locator("[data-takeoff-viewport]").boundingBox();
  for (const [fx, fy] of [[0.3, 0.8], [0.3, 0.35], [0.65, 0.35], [0.65, 0.5]]) await page.mouse.click(gb.x + gb.width * fx, gb.y + gb.height * fy);
  await expect(dlg.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
  await dlg.getByRole("button", { name: "Details" }).click();
  await page.getByLabel("Colour", { exact: true }).selectOption("Monument");
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Lengths" }).click();

  // measure the 4,312 eaves line (the plan re-opens for the Measure screen)
  await page.locator("[data-takeoff-viewport]").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await tap({ x: BX + 1000 * k, y: BY + 2000 * k }); await tap({ x: BX + 5312 * k, y: BY + 2000 * k });
  await expect(page.getByText(/Measured 4,312 \+ allowance 200 → order 4,600 mm/)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Done" }).click();

  // order + export (server renders the PDF with pdfkit)
  await page.getByRole("button", { name: /Review & export order/ }).click();
  await page.getByRole("button", { name: "New order" }).click();
  // what the supplier needs: when (or ASAP) and who to call — never invented, asked for
  await page.getByLabel("As soon as possible").check();
  await page.getByRole("textbox", { name: "Contact phone" }).fill("0400 000 000");
  await page.getByRole("button", { name: "Save order details" }).click();
  await expect(page.getByText(/^Ready: 1 piece/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Export supplier PDF" }).click();
  await expect(page.getByText(/is frozen\. Nothing has been sent\./)).toBeVisible({ timeout: 30_000 });
  const exportId = await page.evaluate(async (job) => {
    const ws = await (await fetch(`/api/takeoff/jobs/carpentry/${job}`)).json();
    const o = await (await fetch(`/api/takeoff/workspaces/${ws.workspaces[0].id}/orders`)).json();
    return o.orders.at(-1).exports.at(-1).id;
  }, JOB);
  const pdf = await page.evaluate(async (id) => { const r = await fetch(`/api/takeoff/exports/${id}/pdf`); const b = new Uint8Array(await r.arrayBuffer()); return { status: r.status, head: String.fromCharCode(...b.slice(0, 5)), size: b.length }; }, exportId);
  expect(pdf.status).toBe(200); expect(pdf.head).toBe("%PDF-"); expect(pdf.size).toBeGreaterThan(2000);
});
