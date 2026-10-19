// @ts-check
// TC-R04 measure tools — continuous flashing runs (13), repeated timber members (02 §2, 03 T1), wall tracing (02 §3)
// and phone quality (02). UI Review Mode: mocked backend, real shared/takeoff maths.
//   UI_REVIEW_PORT=5191 npx playwright test --config=playwright.ui-review.config.js e2e/ui-review/tc-measure.spec.js
//
// Exact-number acceptance (13 #1, #6, #7) uses the review fixture's ?takeoffSeed=mixed runs, whose geometry is exact
// (6,000 + 4,000 with a split at 8,800; four 750 legs). Runs DRAWN by tapping land on whole/fractional CSS px, so
// their checks allow the tap tolerance but always prove one allowance per piece (never one per corner).
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { explainableMm, memberThicknessMm, nextWallInputs, stockForStation, timberOrderSummary, withOverride, toolsFor } from "../../src/components/takeoff/measure/tools.js";
import { straightLegs } from "../../src/components/takeoff/measure/geometry.js";

const meta = JSON.parse(readFileSync(new URL("../../src/ui-review/fixtures/takeoff/synthetic-plan-set.json", import.meta.url), "utf8"));
const k = meta.pages[0].pdfUnitsPerMm;
const BX = 120, BY = 150;
const at = (xMm, yMm) => ({ x: BX + xMm * k, y: BY + yMm * k });
const HUB = "/carpentry/cjb-1/takeoff?reviewRole=admin";
const MIXED = `${HUB}&takeoffSeed=mixed`;
const orderOf = (tight) => Math.ceil((tight + 200) / 100) * 100;

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.getAttribute("data-ui-review-ready") === "true", null, { timeout: 30_000 }).catch(() => {});
}
async function openMeasure(page, path = HUB) {
  await page.goto(path);
  await ready(page);
  await page.getByRole("button", { name: /^Measure$/ }).click();
  await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0, null, { timeout: 30_000 });
}
async function chooseMaterial(page, name) {
  const renders = await page.evaluate(() => window.__takeoffViewerStats?.renders || 0);
  await page.getByRole("button", { name: /^Material:/ }).click();
  await page.getByRole("button", { name, exact: true }).click();
  // the re-opened viewer has loaded its page and fitted it (a fresh render) before anything is tapped
  await page.waitForFunction((n) => (window.__takeoffViewerStats?.renders || 0) > n, renders, { timeout: 30_000 });
  await page.waitForTimeout(250);
}
async function screenOf(page, p) {
  return page.evaluate((pt) => {
    const el = document.querySelector("[data-takeoff-viewport]");
    const s = el.takeoffViewport.toScreen(pt);
    const r = el.getBoundingClientRect();
    return { x: r.left + s.x, y: r.top + s.y };
  }, p);
}
async function zoomOn(page, p, factor) {
  await page.evaluate(([pt, f]) => document.querySelector("[data-takeoff-viewport]").takeoffViewport.zoomOn(pt, f), [p, factor]);
  await page.waitForTimeout(250);
}
/** Screen position of a PDF point, panning (never zooming) it into view first when the sheet has grown over it. */
async function inView(page, p) {
  let s = await screenOf(page, p);
  let b = await page.locator("[data-takeoff-viewport]").boundingBox();
  const inside = (q) => q.x > b.x + 12 && q.x < b.x + b.width - 12 && q.y > b.y + 12 && q.y < b.y + b.height - 12;
  for (let i = 0; i < 3 && !inside(s); i++) {
    await zoomOn(page, p, 1);
    s = await screenOf(page, p);
    b = await page.locator("[data-takeoff-viewport]").boundingBox();
  }
  expect(inside(s), `point ${JSON.stringify(p)} on screen at ${JSON.stringify(s)} in ${JSON.stringify(b)}`).toBe(true);
  return s;
}
const tapPdf = async (page, p) => { const s = await inView(page, p); await page.touchscreen.tap(s.x, s.y); };
const doubleTapPdf = async (page, p) => { const s = await inView(page, p); await page.touchscreen.tap(s.x, s.y); await page.touchscreen.tap(s.x, s.y); };
/**
 * Tap the (first) red overflow polyline inside `scope`, `f` of the way along its longest leg — any red point means
 * "split at the limit"; the split always goes to the legal marker. (Near the run's last point the 44 px point target
 * wins, by design: double-tapping the last point finishes instead of splitting.)
 */
async function tapRed(page, scope, f = 0.35, zoom = 1) {
  const pts = await scope.locator("[data-overflow-run]").first().getAttribute("points");
  const xy = pts.trim().split(/\s+/).map((s) => s.split(",").map(Number));
  let best = null; // overlay px = viewport-relative
  for (let i = 1; i < xy.length; i++) { const L = Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]); if (!best || L > best.L) best = { L, x: xy[i - 1][0] + f * (xy[i][0] - xy[i - 1][0]), y: xy[i - 1][1] + f * (xy[i][1] - xy[i - 1][1]) }; }
  const pdf = await page.evaluate((q) => document.querySelector("[data-takeoff-viewport]").takeoffViewport.toPdf(q), { x: best.x, y: best.y });
  if (zoom !== 1) await zoomOn(page, pdf, zoom);
  await tapPdf(page, pdf);
}
const sheet = (page) => page.locator("[data-takeoff-focus] section[aria-label]");
/** A scriptable visualViewport: window.__keyboard(px) shrinks it from the bottom like an on-screen keyboard. */
function fakeKeyboard() {
  const vv = new EventTarget();
  let h = window.innerHeight;
  Object.defineProperties(vv, { height: { get: () => h }, width: { get: () => window.innerWidth }, offsetTop: { get: () => 0 }, offsetLeft: { get: () => 0 }, scale: { get: () => 1 } });
  Object.defineProperty(window, "visualViewport", { configurable: true, get: () => vv });
  window.__keyboard = (px) => { h = window.innerHeight - px; vv.dispatchEvent(new Event("resize")); };
}
// review evidence (kept next to the other TC-R04 screens)
const shot = (page, name) => page.screenshot({ path: `docs/takeoff/evidence/ui/tc-measure/${name}.png` });
const reviewState = (page) => page.evaluate(() => window.__takeoffReviewState());
const saved = (page) => expect(page.getByRole("status").filter({ hasText: /^Saved$/ }).first()).toBeVisible({ timeout: 15_000 });

test.describe("continuous flashing runs (TC-R04 13) — phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("13#1/#2 tap corners → live tight + ONE order length; double-tap the last point finishes with no duplicate endpoint", async ({ page }) => {
    await openMeasure(page);
    const before = (await reviewState(page)).measurements;
    const P = [at(1000, 4500), at(1750, 4500), at(1750, 3750), at(2500, 3750), at(2500, 3000)];
    await zoomOn(page, at(1750, 3750), 12);
    await expect(page.getByText("Tap the start of a straight run.")).toBeVisible();
    for (const p of P) await tapPdf(page, p);
    const draft = page.locator("[data-path-draft]");
    await expect(draft).toHaveAttribute("data-points", "5");
    const tight = Number(await draft.getAttribute("data-tight"));
    expect(Math.abs(tight - 3000)).toBeLessThan(30);                         // sum of the legs, not the 2,121 chord (tap tolerance)
    await expect(draft).toHaveAttribute("data-order", String(orderOf(tight))); // ONE allowance — corners add none
    // the shown sum always explains the rounding (display rounding never hides a real overrun)
    const line = await sheet(page).getByText(/Measured [\d,.]+ \+ allowance 200 → order [\d,]+ mm/).innerText();
    const [, shownTight, shownOrder] = /Measured ([\d,.]+) \+ allowance 200 → order ([\d,]+) mm/.exec(line);
    expect(orderOf(Number(shownTight.replace(/,/g, "")))).toBe(Number(shownOrder.replace(/,/g, "")));
    await expect(sheet(page).getByText(/4 legs — corners are cut\/folded on site/)).toBeVisible();
    expect(await page.locator("[data-path-draft][data-unfinished]").count()).toBe(1);
    // double-tap the existing last point: finishes unchanged — no 6th point, no zero-length leg
    await page.waitForTimeout(400); // (a quicker tap would pair with the single tap that placed P4)
    await doubleTapPdf(page, P[4]);
    await expect(page.locator("[data-path-draft]")).toHaveCount(0);
    const run = page.locator('[data-kind="polyline"]:not([data-unfinished])');
    await expect(run).toHaveCount(1);
    await expect(run).toHaveAttribute("data-points", "5");
    await expect(run).toHaveAttribute("data-pieces", "1");
    await expect(page.locator("[data-finished-run]")).toContainText("Finished — one run");
    await expect(page.locator("[data-finished-run] [data-statuses]")).toContainText("Quantity:");
    await saved(page);
    expect((await reviewState(page)).measurements).toBe(before + 1);
    await shot(page, "path-finished-390x844");
  });

  test("13#2 a double-tap at a NEW spot adds that endpoint once, then finishes", async ({ page }) => {
    await openMeasure(page);
    await zoomOn(page, at(2000, 4000), 6);
    await tapPdf(page, at(1000, 4500)); await tapPdf(page, at(2500, 4500));
    await doubleTapPdf(page, at(2500, 3300));
    await expect(page.locator("[data-path-draft]")).toHaveCount(0);
    await expect(page.locator('[data-kind="polyline"]:not([data-unfinished])')).toHaveAttribute("data-points", "3");
  });

  test("13 tap the end, then double-tap it (three quick taps): finishes ONCE — the trailing tap starts no phantom new run", async ({ page }) => {
    await openMeasure(page);
    const n0 = (await reviewState(page)).measurements;
    await zoomOn(page, at(2000, 4500), 4);
    await tapPdf(page, at(1000, 4500)); await tapPdf(page, at(2500, 4500));
    const s = await inView(page, at(2500, 3800));
    await page.touchscreen.tap(s.x, s.y); await page.touchscreen.tap(s.x, s.y); await page.touchscreen.tap(s.x, s.y);
    await page.waitForTimeout(500);
    await expect(page.locator("[data-path-draft]")).toHaveCount(0);           // no 1-point run left at the end
    await expect(page.locator('[data-kind="polyline"]:not([data-unfinished])')).toHaveAttribute("data-points", "3");
    await saved(page);
    expect((await reviewState(page)).measurements).toBe(n0 + 1);
    // a deliberate new start a moment later still works
    await page.waitForTimeout(500);
    await tapPdf(page, at(1000, 3500));
    await expect(page.locator("[data-path-draft]")).toHaveAttribute("data-points", "1");
  });

  test("13#5/#6 overlength run stays ONE flagged draft; one tap on the red part splits at the legal 8,800 marker (never the tap point); Undo restores", async ({ page }) => {
    await openMeasure(page);
    await zoomOn(page, at(3500, 5600), 3.4);
    await tapPdf(page, at(500, 7600)); await tapPdf(page, at(6500, 7600)); await tapPdf(page, at(6500, 3650)); // ≈ 9,950 tight → 10,200
    const draft = page.locator("[data-path-draft]");
    await expect(draft).toHaveAttribute("data-pieces", "1");
    await expect(draft.locator("[data-overflow-run]")).toHaveCount(1);
    await expect(draft.locator("[data-legal-marker]")).toHaveAttribute("data-station", "8800");
    await expect(sheet(page).locator("[data-overflow-text]")).toContainText("over the 9,000 mm maximum");
    await shot(page, "overflow-red-390x844");
    await tapRed(page, draft);
    await expect(draft).toHaveAttribute("data-points", "3");                   // the red tap added no vertex
    await expect(draft).toHaveAttribute("data-pieces", "2");
    await expect(draft).toHaveAttribute("data-splits", "8800");               // the legal marker, not where the finger was
    await expect(draft).toHaveAttribute("data-order", "9000+1400");
    await expect(draft.locator("[data-overflow-run]")).toHaveCount(0);
    await expect(page.getByText(/Split at the limit \(8,800 mm along the run\)\. Pieces now 9,000 \+ 1,400 mm/)).toBeVisible();
    await shot(page, "split-at-limit-390x844");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(draft).toHaveAttribute("data-pieces", "1");                   // back to the flagged, unsplit draft
    await expect(draft.locator("[data-overflow-run]")).toHaveCount(1);
    await expect(draft).toHaveAttribute("data-points", "3");
    // double-tap to stop it anyway: kept whole + flagged (not order-ready) until split
    await page.waitForTimeout(400);
    await doubleTapPdf(page, at(6500, 3650));
    const run = page.locator('[data-kind="polyline"]:not([data-unfinished])');
    await expect(run.locator("[data-overflow-run]")).toHaveCount(1);
    // no run in progress: a tap on a finished run's red part is ONE "Split at limit"
    await tapRed(page, run);
    await expect(run).toHaveAttribute("data-order", "9000+1400");
    await expect(page.locator("[data-selected-run]")).toBeVisible();
  });

  test("13 hit priority: a tap on the red overflow right beside an EARLIER corner splits at the limit — never a retrace leg back to that corner", async ({ page }) => {
    await openMeasure(page);
    await zoomOn(page, at(5000, 6000), 1.3);
    // 8,000 + 1,500 + 1,500 + 1,500 = 12,500: the overflow (from 8,800) runs through two corners
    for (const p of [at(0, 7000), at(8000, 7000), at(8000, 5500), at(9500, 5500), at(9500, 4000)]) { await tapPdf(page, p); await page.waitForTimeout(350); }
    const draft = page.locator("[data-path-draft]");
    await expect(draft).toHaveAttribute("data-points", "5");
    await expect(draft.locator("[data-overflow-run]")).toHaveCount(1);
    const tight = Number(await draft.getAttribute("data-tight"));
    const c = await screenOf(page, at(8000, 5500)), t = await inView(page, at(8250, 5500));
    expect(Math.hypot(c.x - t.x, c.y - t.y)).toBeLessThan(22);                  // inside the corner's 44 px target
    await page.touchscreen.tap(t.x, t.y);
    await expect(draft).toHaveAttribute("data-splits", "8800");
    await expect(draft).toHaveAttribute("data-points", "5");                   // no vertex added
    expect(Math.abs(Number(await draft.getAttribute("data-tight")) - tight)).toBeLessThan(1e-6);
    await expect(draft).toHaveAttribute("data-pieces", "2");
  });

  test("13#8 more than two pieces needed: the residual overflow stays red after the first split; each tap is one split", async ({ page }) => {
    await openMeasure(page);
    await tapPdf(page, at(0, 7000)); await tapPdf(page, at(11000, 7000)); await tapPdf(page, at(11000, -500)); // ≈ 18,500
    const draft = page.locator("[data-path-draft]");
    await tapRed(page, draft);
    await expect(draft).toHaveAttribute("data-pieces", "2");
    await expect(draft.locator("[data-overflow-run]")).toHaveCount(1);         // piece 2 still over 9,000 — visible, no hidden join
    await tapRed(page, draft, 0.35, 6);                                         // the short residual: zoom in to tap it
    await expect(draft).toHaveAttribute("data-pieces", "3");
    await expect(draft.locator("[data-overflow-run]")).toHaveCount(0);
    await expect(draft).toHaveAttribute("data-splits", "8800,17600");
  });

  test("13 Undo removes the latest vertex while drawing (back to the start point); Redo puts it back; no Apply needed", async ({ page }) => {
    await openMeasure(page);
    await zoomOn(page, at(2500, 4500), 4);
    await tapPdf(page, at(1000, 4500)); await tapPdf(page, at(2500, 4500)); await tapPdf(page, at(2500, 3800));
    const draft = page.locator("[data-path-draft]");
    await expect(draft).toHaveAttribute("data-points", "3");
    const undo = page.getByRole("button", { name: "Undo" });
    await undo.click();
    await expect(draft).toHaveAttribute("data-points", "2");
    await undo.click();
    await expect(draft).toHaveAttribute("data-points", "1");                  // just the start point (no line, no length)
    await expect(page.getByText(/Tap the finish of this run/)).toBeVisible();
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(draft).toHaveAttribute("data-points", "2");
    await expect(page.getByRole("button", { name: /^(Apply|Save)$/ })).toHaveCount(0);
  });

  test("13#9 amber handling advisory above 6,000 never forces a split", async ({ page }) => {
    await openMeasure(page);
    await zoomOn(page, at(3500, 4000), 1.6);
    await tapPdf(page, at(500, 4000)); await tapPdf(page, at(7000, 4000));
    const draft = page.locator("[data-path-draft]");
    await expect(sheet(page).locator("[data-handling-text]")).toContainText("longer than the 6,000 mm handling length. Advisory only");
    await expect(draft.locator("[data-overflow-run]")).toHaveCount(0);
    await expect(draft).toHaveAttribute("data-pieces", "1");
    await expect(page.getByRole("button", { name: /Split at limit/ })).toHaveCount(0);
  });

  test("13#4 out-and-back sums both legs (not the chord) and warns about the exact retrace without deleting geometry", async ({ page }) => {
    await openMeasure(page);
    await zoomOn(page, at(2500, 5000), 3);
    await tapPdf(page, at(1000, 5000)); await tapPdf(page, at(4000, 5000));
    await tapPdf(page, at(1000, 5000));                                        // back onto the first point: snaps exactly
    const draft = page.locator("[data-path-draft]");
    await expect(draft).toHaveAttribute("data-points", "3");
    expect(Math.abs(Number(await draft.getAttribute("data-tight")) - 6000)).toBeLessThan(40);
    await expect(sheet(page).locator('[data-path-problem="path_retraced"]')).toContainText("both passes are measured and summed");
  });

  test("13#3 pan, pinch, a cancelled touch and drags while drawing add no vertex", async ({ page }) => {
    await openMeasure(page);
    const box = await page.locator("[data-takeoff-viewport]").boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.touchscreen.tap(cx, cy);
    const draft = page.locator("[data-path-draft]");
    await expect(draft).toHaveAttribute("data-points", "1");
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
    await touch("touchStart", [[cx + 60, cy]]); for (let i = 1; i <= 6; i++) await touch("touchMove", [[cx + 60 + i * 7, cy + i * 3]]); await touch("touchEnd", []);
    await touch("touchStart", [[cx - 40, cy + 40], [cx + 40, cy + 40]]);
    for (let i = 1; i <= 5; i++) await touch("touchMove", [[cx - 40 - i * 8, cy + 40], [cx + 40 + i * 8, cy + 40]]);
    await touch("touchEnd", []);
    await touch("touchStart", [[cx + 30, cy - 50]]); await touch("touchCancel", []);
    await page.waitForTimeout(400);
    await expect(page.locator("[data-path-draft]")).toHaveAttribute("data-points", "1");
    await page.touchscreen.tap(cx - 80, cy - 60);
    await expect(page.locator("[data-path-draft]")).toHaveAttribute("data-points", "2");
  });

  test("Count keeps every tap: two quick taps close together are two marks (double-tap is off in Count)", async ({ page }) => {
    await openMeasure(page);
    await page.getByRole("radio", { name: "Count" }).click();
    const f = page.getByLabel("Finished length (no allowance added)");
    await f.fill("2400"); await f.press("Enter");
    const box = await page.locator("[data-takeoff-viewport]").boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 3;
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x + 12, y);                                     // < 300 ms, < 24 px
    await expect(page.getByText(/Counted 2 × 2,400 mm/)).toBeVisible();
  });

  test("13 recovery: an unfinished run survives a reload and is in no order until finished", async ({ page }) => {
    await openMeasure(page);
    await expect(page.getByText("4 run(s) on this page.")).toBeVisible();
    await zoomOn(page, at(2000, 5000), 4);
    await tapPdf(page, at(1000, 5000)); await tapPdf(page, at(2500, 5000)); await tapPdf(page, at(2500, 5800));
    await expect(page.getByText("4 run(s) on this page.")).toBeVisible();      // drawing: no material assignment yet
    await page.waitForTimeout(700);
    await page.reload();
    await ready(page);
    if (await page.getByRole("button", { name: "Restore" }).isVisible().catch(() => false)) await page.getByRole("button", { name: "Restore" }).click();
    await page.getByRole("button", { name: /^Measure$/ }).click();
    await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0);
    const draft = page.locator("[data-path-draft]");
    await expect(draft).toHaveAttribute("data-points", "3");
    await expect(page.getByText(/Still drawing — tap the next corner/)).toBeVisible();
    await expect(page.getByText("4 run(s) on this page.")).toBeVisible();
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(page.getByText("5 run(s) on this page.")).toBeVisible();
    await expect(page.locator("[data-path-draft]")).toHaveCount(0);
  });

  test("leaving with Done finishes a valid run (never left half-assigned)", async ({ page }) => {
    await openMeasure(page);
    await tapPdf(page, at(1000, 5000)); await tapPdf(page, at(6000, 5000));
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: /^Measure$/ }).click();
    await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0);
    await expect(page.getByText("5 run(s) on this page.")).toBeVisible();
    await expect(page.locator("[data-path-draft]")).toHaveCount(0);
  });

  test("existing 2-point runs still select + drag as before", async ({ page }) => {
    await openMeasure(page);
    await page.getByRole("radio", { name: "Select" }).click();
    await tapPdf(page, at(3000, 2000)); // middle of the seeded 4,312 eaves run
    await expect(sheet(page).getByText(/Measured 4,312/)).toBeVisible();
    const h = page.locator('[data-handle-id$=":1"]').first();
    const hb = await h.boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + 30, hb.y + hb.height / 2, { steps: 5 }); await page.mouse.up();
    await expect(sheet(page).getByText(/Measured 4,312/)).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(sheet(page).getByText(/Measured 4,312/)).toBeVisible();
  });
});

test.describe("finished runs — select, edit, splits (exact geometry: review seed)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("13#1/#6/#7 exact: four 750 legs → 3,000 tight → ONE 3,200; 10,000 split at 8,800 → 9,000 + 1,400; move split to 5,000 → 5,200 + 5,200", async ({ page }) => {
    await openMeasure(page, MIXED);
    const four = page.locator('[data-measurement-id="m-pl2"]');
    await expect(four, "review seed ?takeoffSeed=mixed provides m-pl2").toHaveCount(1);
    expect(Math.abs(Number(await four.getAttribute("data-tight")) - 3000)).toBeLessThan(1e-6);
    await expect(four).toHaveAttribute("data-order", "3200");
    await expect(four).toHaveAttribute("data-points", "5");
    const ten = page.locator('[data-measurement-id="m-pl1"]');
    await expect(ten).toHaveAttribute("data-order", "9000+1400");
    await expect(ten).toHaveAttribute("data-splits", "8800");
    await page.getByRole("radio", { name: "Select" }).click();
    await zoomOn(page, at(4500, 6000), 1.8);
    await tapPdf(page, at(3000, 7600));
    await expect(page.locator("[data-selected-run]")).toBeVisible();
    await expect(page.locator("[data-selected-run] [data-statuses]")).toBeHidden(); // HUB 006: in Details, not on the panel
    await expect(page.locator("[data-selected-run] [data-statuses]")).toHaveCount(1);
    await page.getByRole("button", { name: /^Split 1 — 8,800 mm along the run/ }).click();
    const f = page.getByLabel("Split 1 position (mm along the run)");
    await f.fill("5000"); await f.press("Enter");
    await expect(ten).toHaveAttribute("data-order", "5200+5200");              // each piece exactly one allowance
    // past the legal capacity is blocked (no change)
    await f.fill("9500"); await f.press("Enter");
    await expect(page.getByText(/longer than the maximum — the split can go up to 8,800 mm/)).toBeVisible();
    await expect(ten).toHaveAttribute("data-order", "5200+5200");
    // to a corner (6,000) — no automatic corner preference, only on request
    await page.getByLabel("Move to a corner").selectOption({ label: "Corner 1 — 6,000 mm" }); // PH-21: corners count from 1 along the run
    await expect(ten).toHaveAttribute("data-order", "6200+4200");
    // remove → whole 10,000 flagged red; one tap on red → 8,800; Undo → flagged again
    await page.getByRole("button", { name: "Remove split 1" }).click();
    await expect(ten).toHaveAttribute("data-order", "10200");
    await expect(ten.locator("[data-overflow-run]")).toHaveCount(1);
    await zoomOn(page, at(6500, 4400), 2.4);
    await tapRed(page, ten);
    await expect(ten).toHaveAttribute("data-order", "9000+1400");
    await expect(ten).toHaveAttribute("data-points", "3");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(ten).toHaveAttribute("data-order", "10200");
    await shot(page, "select-run-390x844");
  });

  test("13#10 corner drag updates the total; a split whose cut location left the run is flagged with Recalculate (never moved silently); insert a point", async ({ page }) => {
    await openMeasure(page, MIXED);
    const ten = page.locator('[data-measurement-id="m-pl1"]');
    await expect(ten).toHaveAttribute("data-splits", "8800");
    await page.getByRole("radio", { name: "Select" }).click();
    await zoomOn(page, at(4500, 6000), 1.8);
    await tapPdf(page, at(3000, 7600));
    // + on a leg inserts a point at its middle (length unchanged)
    const plus = page.locator("[data-insert-marker]").first();
    const pb = await plus.boundingBox();
    await page.touchscreen.tap(pb.x + pb.width / 2, pb.y + pb.height / 2);
    await expect(ten).toHaveAttribute("data-points", "4");
    expect(Math.abs(Number(await ten.getAttribute("data-tight")) - 10000)).toBeLessThan(1e-6);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(ten).toHaveAttribute("data-points", "3");
    // drag the corner (point 2) sideways: both legs change, the 8,800 cut location is no longer on the run
    const h = page.locator('[data-handle-id="m-pl1:1"]');
    const hb = await h.boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + 40, hb.y + hb.height / 2, { steps: 6 }); await page.mouse.up();
    const tight = Number(await ten.getAttribute("data-tight"));
    expect(tight).toBeGreaterThan(10050);
    await expect(ten.locator("[data-split-marker][data-invalid]")).toHaveCount(1);
    await expect(page.locator("[data-split-row='0']")).toContainText(/approved cut location is no longer on the path/);
    await shot(page, "split-flagged-390x844");
    await page.getByRole("button", { name: "Recalculate" }).click();
    await expect(ten.locator("[data-split-marker][data-invalid]")).toHaveCount(0);
    await expect(ten).toHaveAttribute("data-splits", "8800");
  });
});

test.describe("split handles", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("13 a split handle drags along the run: earlier is allowed, past the maximum is blocked, near a corner it snaps to it", async ({ page }) => {
    await openMeasure(page, MIXED);
    const ten = page.locator('[data-measurement-id="m-pl1"]');
    await page.getByRole("radio", { name: "Select" }).click();
    await zoomOn(page, at(5500, 6000), 2);
    await tapPdf(page, at(3000, 7600));
    const drag = async (dx, dy, to = null) => {
      const hb = await page.locator('[data-handle-id="split:0"]').boundingBox();
      const from = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 };
      const end = to || { x: from.x + dx, y: from.y + dy };
      await page.mouse.move(from.x, from.y); await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
    };
    const split = async () => Number(await ten.getAttribute("data-splits"));
    // leg 2 runs down the screen from the corner (6,000) to the end (10,000): up = earlier along the run
    await drag(0, -20);
    const earlier = await split();
    expect(earlier).toBeLessThan(8800);
    expect(earlier).toBeGreaterThan(7000);
    await drag(0, 40);                                                          // past 8,800 (still on the run) → blocked, unchanged
    await expect(page.getByText(/longer than the maximum — the split can go up to 8,800 mm/)).toBeVisible();
    expect(await split()).toBe(earlier);
    const corner = await screenOf(page, at(6500, 7600));
    await drag(0, 0, { x: corner.x + 4, y: corner.y + 5 });                     // within 14 px of the corner → exactly on it
    await expect(ten).toHaveAttribute("data-splits", "6000");
    await expect(ten).toHaveAttribute("data-order", "6200+4200");
  });
});

test.describe("timber runs + counts (linear stock)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("trim Run: a corner is a JOINT — each straight leg is its own piece (an extra tap along a straight leg merges); Count is available", async ({ page }) => {
    await openMeasure(page, MIXED);
    await chooseMaterial(page, "Trimmers");
    await expect(page.getByRole("radio", { name: "Run" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("radio", { name: "Count" })).toBeVisible();
    const before = await page.locator('[data-kind="polyline"][data-measurement-id]').count();
    const n0 = (await reviewState(page)).measurements;
    await zoomOn(page, at(3000, 3000), 3);
    // L-shaped path with an extra tap part-way along the first (straight) leg: 2,500 + 1,500 → TWO pieces, never one
    // 4,000 member bent round the corner (03 T5 "measured path segments"), never three
    await tapPdf(page, at(1500, 2000)); await tapPdf(page, at(2700, 2000)); await tapPdf(page, at(4000, 2000)); await tapPdf(page, at(4000, 3500));
    await expect(sheet(page).getByText(/^Run [\d,.]+ mm · tap each corner/)).toBeVisible();
    await expect(sheet(page).getByText("This run makes 2 pieces.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    const runs = page.locator('[data-kind="polyline"][data-measurement-id]');
    await expect(runs).toHaveCount(before + 2);
    await expect(page.locator('[data-kind="polyline"][data-measurement-id][data-points="2"]:not([data-order])')).toHaveCount(2); // straight, not a flashing
    await expect(sheet(page).getByText(/2 straight pieces added — each corner is a joint/)).toBeVisible();
    await expect(sheet(page).locator("[data-statuses]")).toBeHidden(); // HUB 006: collapsed under Details
    await expect(sheet(page).locator("[data-statuses]")).toHaveCount(1);
    await saved(page);
    expect((await reviewState(page)).measurements).toBe(n0 + 2);
    // their labels are the two leg lengths (taps land on whole CSS px: allow the tap tolerance)
    const labels = (await page.locator('[data-kind="polyline"][data-measurement-id][data-points="2"] text').allTextContents()).map((t) => Number(t.replace(/,/g, "")));
    expect(labels.some((l) => Math.abs(l - 2500) < 40) && labels.some((l) => Math.abs(l - 1500) < 40), JSON.stringify(labels)).toBe(true);
    // one Undo removes both pieces and reopens the drawing
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(runs).toHaveCount(before);
    await expect(page.locator("[data-path-draft]")).toHaveAttribute("data-points", "4");
    // a selected timber piece is straight: no "+" corner insertion
    await page.getByRole("button", { name: "Redo" }).click();
    await page.getByRole("radio", { name: "Select" }).click();
    await tapPdf(page, at(2200, 2000));
    await expect(sheet(page).getByText(/A straight piece — a corner is a joint/)).toBeVisible();
    await expect(page.locator("[data-insert-marker]")).toHaveCount(0);
    // Count for timber asks for a CUT length (stock-graded), not a flashing "finished length"
    await page.getByRole("radio", { name: "Count" }).click();
    await expect(page.getByLabel("Cut length of each piece")).toBeVisible();
    await expect(page.getByLabel("Finished length (no allowance added)")).toHaveCount(0);
  });
});

test.describe("repeated timber members (02 §2, 03 T1)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("member line + distribution run are distinct tools; ticks with count; tap a tick → remove / put back / override length / duplicate (honest)", async ({ page }) => {
    await openMeasure(page, MIXED);
    await chooseMaterial(page, "Rafters 90 × 45");
    await expect(page.getByRole("radio", { name: "Member" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Distribution" })).toBeVisible();
    // the seeded 10,000 run: 18 rafters at 600 centres
    const seeded = page.locator('[data-measurement-id="m-dist"]');
    await expect(seeded).toHaveAttribute("data-ticks", "18");
    // a NEW distribution run (≈ 5,700 → 10 bays → 11 rafters)
    await page.getByRole("radio", { name: "Distribution" }).click();
    await zoomOn(page, at(2850, 5000), 2.2);
    await tapPdf(page, at(0, 5000)); await tapPdf(page, at(5700, 5000));
    const dist = page.locator('[data-kind="distribution"]').filter({ hasNot: page.locator("[data-tick-preview]") }).last();
    await expect(dist).toHaveAttribute("data-ticks", "11");
    await expect(dist.locator("text").filter({ hasText: "11 rafters" })).toBeVisible();
    // a NEW member line replaces the seeded one (one member line per material)
    await page.getByRole("radio", { name: "Member" }).click();
    await expect(page.getByLabel("Roof pitch")).toHaveValue("30");
    await tapPdf(page, at(6200, 3000)); await tapPdf(page, at(6200, 6500));
    await expect(page.locator('[data-kind="member"]')).toHaveCount(1);
    await expect(page.getByText(/The new member line replaces the previous one/)).toBeVisible();
    await shot(page, "timber-ticks-390x844");
    // tap the 3rd tick in Select
    await page.getByRole("radio", { name: "Select" }).click();
    const tick = dist.locator("[data-tick]").nth(2);
    const tb = await tick.boundingBox();
    await page.touchscreen.tap(tb.x + tb.width / 2, tb.y + tb.height / 2);
    await expect(page.locator("[data-tick-panel]")).toContainText("Rafter at 1,200 mm along the run");
    await page.getByRole("button", { name: "Remove rafter" }).click();
    await expect(dist.locator("[data-tick][data-removed]")).toHaveCount(1);
    await expect(dist.locator("text").filter({ hasText: "10 rafters" })).toBeVisible();
    await page.getByRole("button", { name: "Put it back" }).click();
    await expect(dist.locator("text").filter({ hasText: "11 rafters" })).toBeVisible();
    const len = page.getByLabel("Length for this rafter only");
    await len.fill("5000"); await len.press("Enter");
    await expect(dist.locator("[data-tick][data-overridden]")).toHaveCount(1);
    await expect(page.locator("[data-tick-panel]")).toContainText("Needs 5,000 mm (length changed for this one)");
    await page.getByRole("button", { name: "Duplicate" }).click();
    // the engine adapter in this build ignores duplicates: the screen says so instead of pretending
    await expect(page.locator("[data-tick-panel]")).toContainText(/doesn.t count duplicates yet|2 pieces here/);
  });
});

test.describe("repeated timber members — the run's own settings", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("at ordinary zoom every tap on the run lands on a tick — the tick panel leads to the WHOLE run (offsets, ends, equal bays); offset changes flag stale member changes", async ({ page }) => {
    await openMeasure(page, MIXED);
    await chooseMaterial(page, "Rafters 90 × 45");
    await page.getByRole("radio", { name: "Select" }).click();
    const dist = page.locator('[data-measurement-id="m-dist"]');
    await expect(dist).toHaveAttribute("data-ticks", "18");
    // a tap half-way between two ticks still selects a tick (they're closer together than a finger here)
    await tapPdf(page, at(4950, 7000));
    await expect(page.locator("[data-tick-panel]")).toBeVisible();
    await page.getByRole("button", { name: "Remove rafter" }).click();
    await expect(dist.locator("[data-tick][data-removed]")).toHaveCount(1);
    await page.getByRole("button", { name: /^‹ Whole run — 17 rafters: spacing, ends, offsets$/ }).click();
    const panel = page.locator("[data-distribution-panel]");
    await expect(panel).toContainText("17 rafters at 600 mm centres");
    const so = page.getByLabel("Start offset");
    await so.fill("300"); await so.press("Enter");
    // the removed member's station no longer exists: flagged for review, never silently re-applied elsewhere
    await expect(panel).toContainText("1 member change no longer matches a station");
    await expect(panel).toContainText("18 rafters");
    await page.getByRole("button", { name: "Clear them" }).click();
    await expect(panel.getByText(/no longer match/)).toHaveCount(0);
    const stations = () => dist.locator("[data-tick]").evaluateAll((els) => els.map((e) => e.getAttribute("data-station-id")).join("|"));
    const fixed = await stations();
    await page.getByLabel(/Equal bays on every run of this material/).check();
    await expect.poll(stations).not.toBe(fixed);                               // equal bays respace the members
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(stations).toBe(fixed);
    // offsets longer than the run: the engine's reason is shown here — not "set the member line" (it IS set)
    const eo = page.getByLabel("End offset");
    await eo.fill("9800"); await eo.press("Enter");
    await expect(panel).toContainText("No members counted — see why below.");
    await expect(panel).not.toContainText("Members appear once the member line");
    await expect(sheet(page).locator("[data-material-problems]")).toContainText("longer than the run");
    await expect(sheet(page).locator("[data-statuses]")).toContainText("Quantity: incomplete");
  });
});

test.describe("wall run on the floor plan (02 §3)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("Wall tool: an L-shaped wall run → one wall per straight leg (role wall, 'Wall N', 'Wall N+1', last height); the first elevation opens", async ({ page }) => {
    await openMeasure(page, MIXED);
    await chooseMaterial(page, "Axon cladding");
    await expect(page.getByRole("radio", { name: "Wall", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/Height 3,000 mm \(last used here\)/)).toBeVisible();
    const before = (await reviewState(page)).measurements;
    await zoomOn(page, at(4000, 2500), 2);
    await tapPdf(page, at(1500, 1000)); await tapPdf(page, at(6500, 1000));
    await expect(page.getByText(/Wall 3: [\d,.]+ mm along the plan/)).toBeVisible();
    await tapPdf(page, at(6500, 4000));
    await expect(page.getByText(/Wall 3 \+ 1 more: [\d,.]+ mm along the plan/)).toBeVisible();
    await page.waitForTimeout(400);
    await doubleTapPdf(page, at(6500, 4000));                                  // double-tap the last point: finish
    // the measure screen hands over to the generated elevation of the FIRST wall (WallsScreen); the corner made a second wall
    await expect(page.locator("section[aria-label='Trace walls']")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Wall 3" })).toBeVisible();
    await saved(page);
    expect((await reviewState(page)).measurements).toBe(before + 2);
    // back on the plan both walls are drawn and named (leave the walls screens by their header back buttons)
    for (let i = 0; i < 3 && await page.locator("[data-takeoff-focus]").count(); i++) await page.locator("[data-takeoff-focus] header button").first().click();
    const renders = await page.evaluate(() => window.__takeoffViewerStats?.renders || 0);
    await page.getByRole("button", { name: /^Measure$/ }).click();
    await page.waitForFunction((n) => (window.__takeoffViewerStats?.renders || 0) > n, renders);
    await page.waitForTimeout(250);
    await expect(page.locator('[data-kind="wall"] text').filter({ hasText: /^Wall 3 · 5,0\d\d$|^Wall 3 · 4,9\d\d$/ })).toBeVisible();
    await expect(page.locator('[data-kind="wall"] text').filter({ hasText: /^Wall 4 · (3,0|2,9)\d\d$/ })).toBeVisible();
    await expect(page.locator('[data-kind="wall"][data-points="2"]')).toHaveCount(2);
    await tapPdf(page, at(1500, 5000));
    await expect(page.getByText(/^Wall 5: /)).toBeVisible();
  });
});

test.describe("schedule \"Show on plan\" (highlightIds)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const openSchedule = async (page) => {
    await page.goto(MIXED);
    await ready(page);
    await page.getByRole("button", { name: "Open schedule" }).tap();
  };
  const fitScale = (page) => page.evaluate(() => document.querySelector("[data-takeoff-viewport]").takeoffViewport.view().scale);
  /** Every highlighted measurement's drawn line lies inside the plan viewport (geometry bbox of its polyline / line). */
  async function allInView(page, ids) {
    const boxes = await page.evaluate((list) => {
      const vp = document.querySelector("[data-takeoff-viewport]").getBoundingClientRect();
      return { vp: { x: vp.left, y: vp.top, w: vp.width, h: vp.height }, items: list.map((id) => {
        const g = document.querySelector(`[data-measurement-id="${id}"]`);
        const el = g && g.querySelector("polyline, line");
        if (!el) return { id, missing: true };
        const r = el.getBoundingClientRect();
        return { id, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
      }) };
    }, ids);
    for (const b of boxes.items) {
      expect(b.missing, `${b.id} drawn`).toBeUndefined();
      const { vp } = boxes;
      expect(b.x0 >= vp.x - 1 && b.x1 <= vp.x + vp.w + 1 && b.y0 >= vp.y - 1 && b.y1 <= vp.y + vp.h + 1, `${JSON.stringify(b)} in ${JSON.stringify(vp)}`).toBe(true);
    }
  }

  test("a flashing line's run opens selected + highlighted and the plan frames it (zoomed in on the small run)", async ({ page }) => {
    await openSchedule(page);
    await page.getByRole("button", { name: /1 ×\s*3,200 mm/ }).first().tap();
    await page.getByRole("button", { name: "Show on plan" }).tap();
    await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0, null, { timeout: 30_000 });
    await expect(page.locator('[data-highlighted] [data-measurement-id="m-pl2"]')).toHaveCount(1);
    await expect(page.getByRole("radio", { name: "Select" })).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("[data-selected-run]")).toBeVisible();              // its run panel: pieces, statuses, splits
    await expect(page.locator("[data-highlight-note]")).toContainText("this measurement is highlighted on the plan");
    await page.waitForTimeout(300);
    await allInView(page, ["m-pl2"]);
    // framed: a 1.5 m × 1.5 m run is shown much larger than the whole-page fit
    const framed = await fitScale(page);
    await page.getByRole("button", { name: "Fit page" }).click();
    await page.waitForTimeout(200);
    expect(framed).toBeGreaterThan((await fitScale(page)) * 2);
    await page.getByRole("button", { name: "Show again" }).click();
    await page.waitForTimeout(200);
    expect(Math.abs((await fitScale(page)) - framed)).toBeLessThan(1e-6);
    await shot(page, "show-on-plan-flashing-390x844");
    // changing tool (or the next tap on the plan) ends the highlight
    await page.getByRole("radio", { name: "Pan" }).click();
    await expect(page.locator("[data-highlighted]")).toHaveCount(0);
  });

  test("a rafter line highlights its distribution run AND member line; both framed", async ({ page }) => {
    await openSchedule(page);
    const raf = page.locator('[data-generic-group="mat-raf"]');
    await raf.locator("button[aria-expanded]").first().tap();
    await raf.getByRole("button", { name: "Show on plan" }).tap();
    await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0, null, { timeout: 30_000 });
    await expect(page.locator('[data-highlighted] [data-measurement-id="m-dist"]')).toHaveCount(1);
    await expect(page.locator('[data-highlighted] [data-measurement-id="m-mem"]')).toHaveCount(1);
    await expect(page.locator("[data-highlight-note]")).toContainText("these 2 measurements are highlighted");
    await expect(page.getByRole("radio", { name: "Member" })).toBeVisible();      // the rafter material's tools
    await page.waitForTimeout(300);
    await allInView(page, ["m-dist", "m-mem"]);
  });
});

test.describe("phone quality (02)", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("375 px: no horizontal scroll, 44 px tool targets, for flashing, timber and wall tools", async ({ page }) => {
    await openMeasure(page, MIXED);
    for (const name of [null, "Rafters 90 × 45", "Axon cladding"]) {
      if (name) await chooseMaterial(page, name);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      for (const r of await page.getByRole("radio").all()) expect((await r.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
  });

  test("the on-screen keyboard never covers the active number field", async ({ page }) => {
    await page.addInitScript(fakeKeyboard);
    await openMeasure(page);
    await page.getByRole("radio", { name: "Count" }).click();
    const f = page.getByLabel("Finished length (no allowance added)");
    await f.focus();
    await page.evaluate(() => window.__keyboard(330));
    await page.waitForTimeout(500);
    const b = await f.boundingBox();
    expect(b.y + b.height).toBeLessThanOrEqual(812 - 330);
    await expect(page.locator("[data-keyboard-spacer]")).toHaveCount(1);
    await page.evaluate(() => window.__keyboard(0));
    await expect(page.locator("[data-keyboard-spacer]")).toHaveCount(0);
  });

  test("every control in the measure window is at least 44 × 44 px at 375 (header Undo / Redo / Fit, split rows, tick panel)", async ({ page }) => {
    await openMeasure(page, MIXED);
    const small = () => page.evaluate(() => [...document.querySelectorAll("[data-takeoff-focus] button, [data-takeoff-focus] select, [data-takeoff-focus] summary, [data-takeoff-focus] input")]
      .filter((e) => e.offsetParent && e.getBoundingClientRect().width > 0)
      .map((e) => { const t = e.type === "checkbox" ? e.closest("label") : e; const r = t.getBoundingClientRect(); return { t: (e.innerText || e.getAttribute("aria-label") || e.type || e.tagName).slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter((x) => x.w < 44 || x.h < 44));
    expect(await small()).toEqual([]);
    await page.getByRole("radio", { name: "Select" }).click();
    await zoomOn(page, at(4500, 6000), 1.8);
    await tapPdf(page, at(3000, 7600));
    await page.getByRole("button", { name: /^Split 1 — 8,800 mm along the run/ }).click();
    await page.locator("details summary").first().click();
    expect(await small()).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await chooseMaterial(page, "Rafters 90 × 45");
    await page.getByRole("radio", { name: "Select" }).click();
    await tapPdf(page, at(4950, 7000));
    await expect(page.locator("[data-tick-panel]")).toBeVisible();
    expect(await small()).toEqual([]);
    await page.getByRole("button", { name: /^‹ Whole run/ }).click();
    expect(await small()).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});

test.describe("phone quality (02) — keyboard deep in the sheet", () => {
  test.use({ hasTouch: true });

  test("portrait 390×844: a split position field low in the sheet stays above the keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(fakeKeyboard);
    await openMeasure(page, MIXED);
    await page.getByRole("radio", { name: "Select" }).click();
    await zoomOn(page, at(4500, 6000), 1.8);
    await tapPdf(page, at(3000, 7600));
    await page.getByRole("button", { name: /^Split 1 — 8,800 mm along the run/ }).click();
    const f = page.getByLabel("Split 1 position (mm along the run)");
    await f.focus();
    await page.evaluate(() => window.__keyboard(330));
    await page.waitForTimeout(700);
    const b = await f.boundingBox();
    expect(b.y + b.height).toBeLessThanOrEqual(844 - 330);
    expect(b.y).toBeGreaterThan(52);                                            // not pushed under the header either
  });

  test("landscape 844×390 (side panel): the tick length field stays above the keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.addInitScript(fakeKeyboard);
    await openMeasure(page, MIXED);
    await chooseMaterial(page, "Rafters 90 × 45");
    await page.getByRole("radio", { name: "Select" }).click();
    const tick = page.locator('[data-measurement-id="m-dist"] [data-tick]').nth(4);
    const tb = await tick.boundingBox();
    await page.touchscreen.tap(tb.x + tb.width / 2, tb.y + tb.height / 2);
    const f = page.getByLabel("Length for this rafter only");
    await f.focus();
    await page.evaluate(() => window.__keyboard(200));
    await page.waitForTimeout(700);
    const b = await f.boundingBox();
    expect(b.y + b.height, "field bottom above the keyboard top").toBeLessThanOrEqual(390 - 200);
    expect(b.y).toBeGreaterThanOrEqual(0);
    await shot(page, "keyboard-landscape-844x390");
  });
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 860 } });
  test("13#11 double-click finishes the run with one endpoint (mouse)", async ({ page }) => {
    await openMeasure(page);
    const pts = [at(1000, 5000), at(4000, 5000), at(4000, 6500)];
    for (const p of pts) { const s = await screenOf(page, p); await page.mouse.click(s.x, s.y); }
    const end = await screenOf(page, at(6000, 6500));
    await page.mouse.dblclick(end.x, end.y);
    const run = page.locator('[data-kind="polyline"]:not([data-unfinished])');
    await expect(run).toHaveAttribute("data-points", "4");
    await expect(page.locator("[data-path-draft]")).toHaveCount(0);
  });

  test("Alt+Arrow typed in a number field moves the caret only — never the selected split; outside a field it still nudges", async ({ page }) => {
    await openMeasure(page, MIXED);
    const ten = page.locator('[data-measurement-id="m-pl1"]');
    await page.getByRole("radio", { name: "Select" }).click();
    const s = await screenOf(page, at(3000, 7600));
    await page.mouse.click(s.x, s.y);
    const row = page.getByRole("button", { name: /^Split 1 — 8,800 mm along the run/ });
    await row.click();
    const f = page.getByLabel("Split 1 position (mm along the run)");
    await f.click();
    await page.keyboard.press("Alt+ArrowUp"); await page.keyboard.press("Shift+Alt+ArrowUp"); await page.keyboard.press("Alt+ArrowLeft");
    await page.waitForTimeout(300);
    await expect(ten).toHaveAttribute("data-splits", "8800");
    await expect(f).toHaveValue("8800");
    // the keyboard nudge itself still works for the selected split handle (focus outside any field)
    await page.getByRole("button", { name: /^Split 1 — / }).focus();
    await page.keyboard.press("Shift+Alt+ArrowUp");
    await expect.poll(async () => Number(await ten.getAttribute("data-splits"))).toBeLessThan(8800);
  });

  test("13 click the end, then double-click it: one finish, no phantom new run (mouse)", async ({ page }) => {
    await openMeasure(page);
    for (const p of [at(1000, 5000), at(4000, 5000)]) { const q = await screenOf(page, p); await page.mouse.click(q.x, q.y); }
    const end = await screenOf(page, at(4000, 6500));
    await page.mouse.click(end.x, end.y);
    await page.mouse.dblclick(end.x, end.y);
    await page.waitForTimeout(500);
    await expect(page.locator("[data-path-draft]")).toHaveCount(0);
    await expect(page.locator('[data-kind="polyline"]:not([data-unfinished])')).toHaveAttribute("data-points", "3");
  });
});

// ── adversarial phone review (PH-xx): each reproduced on the phone, fixed, and kept fixed here ──────────────────
test.describe("adversarial phone findings — measure", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const vpView = (page) => page.evaluate(() => document.querySelector("[data-takeoff-viewport]").takeoffViewport.view());
  /** Screen offset of a PDF point from the centre of the plan viewport. */
  async function offCentre(page, p) {
    const s = await screenOf(page, p);
    const b = await page.locator("[data-takeoff-viewport]").boundingBox();
    return { dx: s.x - (b.x + b.width / 2), dy: s.y - (b.y + b.height / 2) };
  }

  test("PH-01 clearing the roof pitch means 'not entered' — never 0°: the engine asks for it and nothing is ready to order; Undo puts 30° back", async ({ page }) => {
    await openMeasure(page, MIXED);
    await chooseMaterial(page, "Rafters 90 × 45");
    await page.getByRole("radio", { name: "Member" }).click();
    const pitch = page.getByLabel("Roof pitch");
    const panel = page.locator("[data-member-panel]");
    await expect(pitch).toHaveValue("30");
    await expect(panel).toContainText("true at 30°");
    await pitch.fill(""); await pitch.press("Enter");
    await expect(pitch).toHaveValue("");
    await expect(panel).not.toContainText("at 0°");
    await expect(panel).toContainText("Enter the pitch");
    await expect(sheet(page).locator("[data-material-problems]")).toContainText("Pitch is required");
    await expect(sheet(page).locator("[data-statuses]")).toContainText("Quantity: incomplete");
    await expect(sheet(page).locator("[data-statuses]")).toContainText("Procurement: draft — not ready to order");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(pitch).toHaveValue("30");
    await expect(panel).toContainText("true at 30°");
  });

  test("PH-01 a cleared required number (min 0) stays a draft on blur — it is never saved as 0", async ({ page }) => {
    await openMeasure(page, MIXED);
    await chooseMaterial(page, "Rafters 90 × 45");
    await page.getByRole("radio", { name: "Select" }).click();
    const dist = page.locator('[data-measurement-id="m-dist"]');
    await tapPdf(page, at(4950, 7000));
    await page.getByRole("button", { name: /^‹ Whole run/ }).click();
    const eo = page.getByLabel("End offset");
    await eo.fill("1000"); await eo.press("Enter");
    await expect(dist).toHaveAttribute("data-ticks", "16");                    // 9,000 usable → 16 rafters
    await eo.fill(""); await eo.blur();
    await expect(page.getByText("Enter a value.")).toBeVisible();
    await expect(dist).toHaveAttribute("data-ticks", "16");                    // not re-laid out with a 0 offset (18)
    await expect(eo).toHaveValue("");                                          // the draft is kept for the user to finish
    await eo.fill("500"); await eo.blur();
    await expect(page.getByText("Enter a value.")).toHaveCount(0);
    await expect(dist).toHaveAttribute("data-ticks", "17");
  });

  test("PH-06 the run panel shows the last gap and warns when the last two members are closer than the member is thick", async ({ page }) => {
    await openMeasure(page, MIXED);
    await chooseMaterial(page, "Rafters 90 × 45");
    await page.getByRole("radio", { name: "Select" }).click();
    await tapPdf(page, at(4950, 7000));
    await page.getByRole("button", { name: /^‹ Whole run/ }).click();
    const panel = page.locator("[data-distribution-panel]");
    await expect(panel.locator("[data-final-bay]")).toContainText("Last gap 400 mm");
    await expect(panel.locator("[data-final-bay-warning]")).toHaveCount(0);
    const eo = page.getByLabel("End offset");
    await eo.fill("370"); await eo.press("Enter");                             // 9,630 usable: …9,600 then 9,630
    await expect(panel.locator("[data-final-bay-warning]")).toContainText("last two rafters are only 30 mm apart");
    await page.getByLabel("Member at the end").uncheck();
    await expect(panel.locator("[data-final-bay-warning]")).toHaveCount(0);
  });

  test("PH-06 a run traced to a multiple of the centres ends once (no extra member from sub-0.001 mm tracing noise); its full last gap is shown", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openMeasure(page, MIXED);
    await chooseMaterial(page, "Rafters 90 × 45");
    await page.getByRole("radio", { name: "Distribution" }).click();
    await tapPdf(page, at(500, 1720)); await tapPdf(page, at(7700, 1720));
    const dist = page.locator('[data-kind="distribution"]').filter({ hasNot: page.locator("[data-tick-preview]") }).last();
    await expect(dist).not.toHaveAttribute("data-ticks", "0");
    await page.getByRole("radio", { name: "Select" }).click();
    const t = dist.locator("[data-tick]").nth(1);
    const tb = await t.boundingBox();
    await page.touchscreen.tap(tb.x + tb.width / 2, tb.y + tb.height / 2);
    await page.getByRole("button", { name: /^‹ Whole run/ }).click();
    const panel = page.locator("[data-distribution-panel]");
    // 03 T1: tracing noise far below 0.001 mm is not a bay — an exact multiple ends ONCE (7,200 / 600 → 13, not 14)
    await expect(dist).toHaveAttribute("data-ticks", "13");
    await expect(panel).toContainText("13 rafters at 600 mm centres");
    await expect(panel.locator("[data-final-bay]")).toContainText("Last gap 600 mm");
    await expect(panel.locator("[data-final-bay-warning]")).toHaveCount(0);
  });

  test("PH-10 changing material keeps the plan zoom and the spot you were working on; Fit still fits the page", async ({ page }) => {
    await openMeasure(page, MIXED);
    const fit = (await vpView(page)).scale;
    const P = at(8750, 5500);
    await zoomOn(page, P, 6);
    const zoomed = (await vpView(page)).scale;
    expect(zoomed).toBeGreaterThan(fit * 5);
    await page.getByRole("radio", { name: "Select" }).click();
    for (const name of ["Barge flashing", "Rafters 90 × 45", "Apron flashing"]) {
      await chooseMaterial(page, name);
      expect(Math.abs((await vpView(page)).scale - zoomed), `${name}: zoom kept`).toBeLessThan(1e-6);
      const o = await offCentre(page, P);
      expect(Math.hypot(o.dx, o.dy), `${name}: still centred on the barge/apron area`).toBeLessThan(3);
    }
    await page.getByRole("button", { name: "Fit page" }).click();
    await page.waitForTimeout(200);
    expect(Math.abs((await vpView(page)).scale - fit)).toBeLessThan(1e-6);
  });

  test("PH-19 after a member or distribution line the sheet shows the count, the stock length and what each needs; a tick shows its stock", async ({ page }) => {
    await openMeasure(page, MIXED);
    await chooseMaterial(page, "Rafters 90 × 45");
    await page.getByRole("radio", { name: "Distribution" }).click();
    const result = sheet(page).locator("[data-timber-result]");
    // seeded: 18 rafters, member 4,500 in plan at 30° → 5,196.15 mm each → 5,400 mm stock
    await expect(result).toContainText("18 rafters → 18 × 5,400 mm stock (each needs 5,196.15 mm)");
    await zoomOn(page, at(2850, 5000), 2.2);
    await tapPdf(page, at(0, 5000)); await tapPdf(page, at(5700, 5000));
    await expect(result).toContainText("29 rafters → 29 × 5,400 mm stock (each needs 5,196.15 mm)");
    await page.getByRole("radio", { name: "Member" }).click();
    await expect(result).toContainText("29 rafters → 29 × 5,400 mm stock");
    await page.getByRole("radio", { name: "Select" }).click();
    const tick = page.locator('[data-measurement-id="m-dist"] [data-tick]').nth(4);
    const tb = await tick.boundingBox();
    await page.touchscreen.tap(tb.x + tb.width / 2, tb.y + tb.height / 2);
    await expect(page.locator("[data-tick-panel]")).toContainText(/Needs 5,196\.15 mm · 1 piece here · from 5,400 mm stock/);
  });

  test("PH-21 'Move to a corner' numbers the corners 1, 2, 3 along the run", async ({ page }) => {
    await openMeasure(page, MIXED);
    await page.getByRole("radio", { name: "Select" }).click();
    await zoomOn(page, at(8750, 5750), 4);
    await tapPdf(page, at(8400, 5000));                                         // first leg of m-pl2 (four 750 legs)
    await expect(page.locator("[data-selected-run]")).toBeVisible();
    await page.getByRole("button", { name: "Add a split by distance…" }).click();
    const add = page.getByLabel("Add a split at (mm along the run)");
    await add.fill("1000"); await add.press("Enter");
    const row = page.locator("[data-split-row='0'] button").first();
    if ((await row.getAttribute("aria-expanded")) !== "true") await row.click();
    await expect(page.locator("[data-split-row='0'] select option")).toHaveText(["Corner…", "Corner 1 — 750 mm", "Corner 2 — 1,500 mm", "Corner 3 — 2,250 mm"]);
    await page.getByLabel("Move to a corner").selectOption({ label: "Corner 1 — 750 mm" });
    await expect(page.locator('[data-measurement-id="m-pl2"]')).toHaveAttribute("data-splits", "750");
  });
});

test("pure helpers: wall naming + last height, member overrides, tools per material", () => {
  expect(nextWallInputs([])).toEqual({ kind: "rect", name: "Wall 1" });
  const walls = [{ kind: "wall", inputs: { name: "Wall 1", heightMm: 2400 } }, { kind: "wall", inputs: { name: "Wall 2" } }, { kind: "wall", archived: true, inputs: { name: "Wall 9", heightMm: 9 } }];
  expect(nextWallInputs(walls)).toEqual({ kind: "rect", heightMm: 2400, name: "Wall 3" });
  let o = withOverride([], "d:@1200", { removed: true });
  expect(o).toEqual([{ station: "d:@1200", removed: true }]);
  o = withOverride(o, "d:@1200", { removed: false });
  expect(o).toEqual([]);
  o = withOverride(o, "d:@0", { lengthMm: 5000 });
  o = withOverride(o, "d:@0", { duplicate: 1 });
  expect(o).toEqual([{ station: "d:@0", lengthMm: 5000, duplicate: 1 }]);
  expect(withOverride(o, "d:@0", { removed: true })).toEqual([{ station: "d:@0", removed: true }]);
  const R = { allowanceMm: 200, incrementMm: 100 };
  expect(explainableMm(8800.04, { ...R, orderMm: 9100 })).toBe("8,800.04");   // 13: never "8,800 + 200 → 9,100"
  expect(explainableMm(3000, { ...R, orderMm: 3200 })).toBe("3,000");
  expect(explainableMm(4312.3, { ...R, orderMm: 4600 })).toBe("4,312.3");
  const keys = (spec, methodKey) => toolsFor({ spec, methodKey }).map((t) => t.k);
  expect(keys({}, "flashing_runs")).toEqual(["run", "count", "select", "pan"]);
  expect(keys({ family: "timber", purpose: "rafters" }, "repeated_members")).toEqual(["member", "distribution", "select", "pan"]);
  // an entered cut length needs no member line
  expect(toolsFor({ spec: { family: "timber", purpose: "joists" }, methodKey: "repeated_members", rules: { lengthSource: "entered" } }).map((t) => t.k)).toEqual(["distribution", "select", "pan"]);
  // a plan corner is a joint for walls / timber / aluminium: legs split at corners, near-collinear taps merge, a reversal is a corner
  const P = (x, y) => ({ x, y });
  expect(straightLegs([P(0, 0), P(50, 0.5), P(100, 0), P(100, 80)])).toEqual([[P(0, 0), P(100, 0)], [P(100, 0), P(100, 80)]]);
  expect(straightLegs([P(0, 0), P(100, 0), P(100, 0), P(40, 0)])).toEqual([[P(0, 0), P(100, 0)], [P(100, 0), P(40, 0)]]);
  expect(straightLegs([P(0, 0)])).toEqual([]);
  expect(keys({ family: "timber", purpose: "studs" }, "wall_frame")).toEqual(["wall", "select", "pan"]);
  expect(keys({ family: "timber", purpose: "plates" }, "linear_stock")).toEqual(["wall", "run", "count", "select", "pan"]);
  expect(keys({ family: "timber", purpose: "trim" }, "linear_stock")).toEqual(["run", "count", "select", "pan"]);
  expect(keys({ family: "cladding" }, "sheet_layout")).toEqual(["wall", "select", "pan"]);
  // PH-06 / PH-19: the timber review reads the engine result as-is (never recalculated)
  expect(memberThicknessMm({ spec: { section: { depthMm: 90, widthMm: 45 } } })).toBe(45);
  expect(memberThicknessMm({ spec: { section: { depthMm: 45, widthMm: 90 } } })).toBe(45);
  expect(memberThicknessMm({ spec: {} })).toBeNull();
  const tick = (at, extra = {}) => ({ stationId: `d:@${at}`, positionMm: at, lengthNeededMm: 5196.152, duplicates: 0, removed: false, ...extra });
  const cut = (at) => ({ demandId: `mat:rafter:d:@${at}:p1`, lengthMm: 5196.152 });
  const res = {
    problems: [], layouts: [{ kind: "repeated", ticks: [tick(0), tick(600, { duplicates: 1 }), tick(1200, { removed: true }), tick(1800, { lengthNeededMm: 4000 })] }],
    allocation: { groups: [{ bars: [{ source: "new", stockLengthMm: 5400, cuts: [cut(0)] }, { source: "new", stockLengthMm: 5400, cuts: [cut(600)] }, { source: "new", stockLengthMm: 5400, cuts: [cut(600)] },
      { source: "offcut", offcutLabel: "OC-1", stockLengthMm: 4200, cuts: [cut(1800)] }] }] },
  };
  expect(timberOrderSummary(res)).toEqual({ members: 4, stock: [[5400, 3]], fromOffcuts: 1, needs: [4000, 5196.15] });
  expect(timberOrderSummary({ ...res, problems: [{ code: "invalid_input", message: "Pitch is required.", blocking: true }] })).toBeNull();
  expect(stockForStation(res, "d:@600")).toEqual({ stockMm: 5400 });
  expect(stockForStation(res, "d:@1800")).toEqual({ offcut: "OC-1" });
  expect(stockForStation(res, "d:@60")).toBeNull();                         // "@60" never matches "@600"
});
