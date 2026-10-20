// @ts-check
// Wall-by-wall plan step 5: review at the end (Sam, 21 Oct 2026: "replace the previous/next buttons to go wall to wall
// … the next wall button is only at the end when you're reviewing"; "review all walls at the end, or by clicking on them
// in takeoff via the select tool"; answer 3: chips and notes fold away on the wall screens). UI Review Mode: mocked
// backend computing with the REAL computeWorkspace. Phone viewport 390 × 844, touch.
//   acceptance 11  Review walls (run card, Line panel, window and door panel, the walls list) opens the first wall of the
//                  cladding in run order; ‹ Previous wall / Next wall › step wall to wall (runs by run number, walls in
//                  tap order, then the cladding's other walls) with "n of N"; the last wall's Review order › opens the
//                  Timber and cladding order; each wall's one-line quantities add up to the order
//   Select         a wall → Open elevation opens its page with the same wall-to-wall buttons; tapping a sheet shows
//                  its details with no stepping through the parts
//   More           status chips, provenance and notes fold under More on the walls list, the rows and each wall page;
//                  what blocks the order stays out with its fix
//   review round   the view kept while stepping stays with that step; Select on another cladding's wall opens it under
//                  that cladding; a problem with the cladding itself shows on every wall with Setup; Review order › waits
//                  for something to order; the buttons step aside under an opening's sheet; a 1 mm strip still taps
// The ordering and the "add up to the order" rule through the real engine: scripts/tests/takeoff-tc-review.test.mjs.
//   UI_REVIEW_PORT=5196 npx playwright test --config=playwright.ui-review.config.js e2e/ui-review/tc-review.spec.js
import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { productGroups, specFromGroup } from "../../shared/takeoff/products/index.js";
import { methodFor } from "../../shared/takeoff/index.js";

const SHOTS = "docs/takeoff/evidence/ui/tc-review";
mkdirSync(SHOTS, { recursive: true });
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const meta = JSON.parse(readFileSync(new URL("../../src/ui-review/fixtures/takeoff/synthetic-plan-set.json", import.meta.url), "utf8"));
const k = meta.pages[0].pdfUnitsPerMm;
const at = (xMm, yMm) => ({ x: 120 + xMm * k, y: 150 + yMm * k });
const MIXED = "/carpentry/cjb-1/takeoff?reviewRole=admin&section=timber_cladding&takeoffSeed=mixed";

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.getAttribute("data-ui-review-ready") === "true", null, { timeout: 30_000 }).catch(() => {});
}
async function openMeasure(page) {
  await page.goto(MIXED);
  await ready(page);
  await page.getByRole("button", { name: /^Measure$/ }).click();
  await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0, null, { timeout: 30_000 });
}
async function chooseMaterial(page, name) {
  const renders = await page.evaluate(() => window.__takeoffViewerStats?.renders || 0);
  await page.getByRole("button", { name: /^Material:/ }).click();
  await page.getByRole("button", { name, exact: true }).click();
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
async function inView(page, p) {
  let s = await screenOf(page, p);
  let b = await page.locator("[data-takeoff-viewport]").boundingBox();
  const inside = (q) => q.x > b.x + 12 && q.x < b.x + b.width - 12 && q.y > b.y + 12 && q.y < b.y + b.height - 12;
  for (let i = 0; i < 3 && !inside(s); i++) {
    await zoomOn(page, p, 1);
    s = await screenOf(page, p);
    b = await page.locator("[data-takeoff-viewport]").boundingBox();
  }
  expect(inside(s), `point ${JSON.stringify(p)} on screen`).toBe(true);
  return s;
}
const tapPdf = async (page, p) => { const s = await inView(page, p); await page.touchscreen.tap(s.x, s.y); };
const doubleTapPdf = async (page, p) => { const s = await inView(page, p); await page.touchscreen.tap(s.x, s.y); await page.touchscreen.tap(s.x, s.y); };
const saved = (page) => expect(page.getByRole("status").filter({ hasText: /^Saved$/ }).first()).toBeVisible({ timeout: 15_000 });
const computed = (page) => page.evaluate(async () => (await (await fetch("/api/takeoff/workspaces/ws-1")).json()).computed);
const heightField = (page) => page.locator("[data-line-height]").getByLabel("Wall height");
const runCard = (page) => page.locator("[data-run-card]");
const nav = (page) => page.locator("[data-wall-nav]");
const count = (page) => page.locator("[data-wall-nav-count]");
const line = (page, id = "mat-axon") => page.locator(`[data-wall-line="${id}"] [data-wall-line-text]`);
async function clickBox(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no box");
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
/** The plan's check job on the fixture: four connected Axon walls (Wall 3–6) at 2,700, finished by double-tapping the start. */
async function traceFour(page) {
  await openMeasure(page);
  await chooseMaterial(page, "Axon cladding");
  await heightField(page).fill("2700"); await heightField(page).press("Enter");
  await zoomOn(page, at(4000, 2500), 2);
  for (const q of [at(1500, 1000), at(6500, 1000), at(6500, 4000), at(1500, 4000)]) await tapPdf(page, q);
  await page.waitForTimeout(400);
  await doubleTapPdf(page, at(1500, 1000));
  await expect(runCard(page).locator("[data-run-label]")).toHaveText("Run 1 · 4 walls · 2,700");
  await saved(page);
}
const sheetsIn = (text) => Number(/^(\d+) sheets?\b/.exec(text)?.[1] ?? NaN);

test("step 5 / acceptance 11: 4 walls, 3 windows and a door; Review walls → ‹ › wall to wall in run order (then the cladding's other wall) → Review order › on the last; the walls add up to the order", async ({ page }) => {
  await traceFour(page);
  // the run card: Undo, + Window, + Door and Review walls
  await expect(runCard(page).getByRole("button", { name: "Review walls" })).toBeVisible();
  await runCard(page).getByRole("button", { name: "+ Window" }).click();
  const opH = page.locator("[data-opening-height]").getByLabel("Height");
  const opSill = page.locator("[data-opening-sill]").getByLabel("Sill height");
  await opH.fill("1200"); await opH.press("Enter");
  await opSill.fill("900"); await opSill.press("Enter");
  // three windows the same size: two taps each (Wall 3, Wall 4, Wall 5)
  await tapPdf(page, at(2500, 1000)); await tapPdf(page, at(3700, 1000));
  await tapPdf(page, at(6500, 1500)); await tapPdf(page, at(6500, 2700));
  await tapPdf(page, at(3800, 4000)); await tapPdf(page, at(5000, 4000));
  await expect(page.locator("[data-plan-opening]")).toHaveCount(3);
  // the door on Wall 6
  await page.locator("[data-opening-panel]").getByRole("button", { name: "+ Door" }).click();
  await opH.fill("2100"); await opH.press("Enter");
  await tapPdf(page, at(1500, 2000)); await tapPdf(page, at(1500, 2900));
  await expect(page.locator("[data-plan-opening]")).toHaveCount(4);
  await saved(page);
  await page.screenshot({ path: `${SHOTS}/door-panel-review-walls-390x844.png` });
  // the walls are done: Review walls (from the window and door panel) opens the first wall of the run
  await page.locator("[data-opening-panel]").getByRole("button", { name: "Review walls" }).click();
  await expect(page.getByRole("dialog", { name: "Wall 3" })).toBeVisible();
  await expect(count(page)).toHaveText("1 of 5");
  await expect(nav(page).getByRole("button", { name: "‹ Previous wall" })).toBeDisabled();
  await expect(nav(page).getByRole("button", { name: "Review order ›" })).toHaveCount(0);
  // the wall's cladding quantities in one short line, at the top (no scrolling)
  await expect(line(page)).toHaveText(/^\d+ sheets?( · \d+ pieces? from other walls)? · \d+ batten pieces · [\d.]+ m foam tape$/);
  await expect(page.locator("[data-wall-lines]")).toBeInViewport();
  await page.screenshot({ path: `${SHOTS}/wall-3-review-390x844.png` });
  const lines = { "Wall 3": await line(page).textContent() };
  // › three times through the run in tap order, then the cladding's other wall (North wall, by numbers)
  for (const [name, n] of [["Wall 4", 2], ["Wall 5", 3], ["Wall 6", 4], ["North wall", 5]]) {
    await nav(page).getByRole("button", { name: "Next wall ›" }).click();
    await expect(page.getByRole("dialog", { name })).toBeVisible();
    await expect(count(page)).toHaveText(`${n} of 5`);
    lines[name] = await line(page).textContent();
  }
  // the last wall: no Next wall ›, Review order › instead
  await expect(nav(page).getByRole("button", { name: "Next wall ›" })).toHaveCount(0);
  await expect(nav(page).getByRole("button", { name: "Review order ›" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/last-wall-review-order-390x844.png` });
  // ‹ Previous wall goes back one, in the same order
  await nav(page).getByRole("button", { name: "‹ Previous wall" }).click();
  await expect(page.getByRole("dialog", { name: "Wall 6" })).toBeVisible();
  await expect(count(page)).toHaveText("4 of 5");
  await expect(page.locator("[data-opening-row]")).toContainText("Door");
  await nav(page).getByRole("button", { name: "Next wall ›" }).click();
  await expect(count(page)).toHaveText("5 of 5");
  // the walls add up to the order: Σ the walls' sheets = the schedule's sheets before spares
  const c = await computed(page);
  const sheetLines = c.scheduleLines.filter((l) => l.jobMaterialIds.includes("mat-axon") && l.unit === "sheet" && !l.follower);
  const before = sheetLines.reduce((a, l) => a + l.quantity - (l.spareQuantity || 0), 0);
  const spares = sheetLines.reduce((a, l) => a + (l.spareQuantity || 0), 0);
  const walls = Object.values(lines).map(sheetsIn);
  for (const n of walls) expect(n).toBeGreaterThan(0);
  expect(walls.reduce((a, b) => a + b, 0), JSON.stringify(lines)).toBe(before);
  // … and the foam tape: Σ the walls' metres is the tape the order rounds into rolls (once for the job)
  const tapeLine = c.scheduleLines.find((l) => l.jobMaterialIds.includes("mat-axon") && l.follower === "tape");
  const tapeM = Number(/^([\d.]+) m behind the vertical sheet joins/.exec(tapeLine.item.note)[1]);
  const wallTape = Object.values(lines).map((t) => Number(/ ([\d.]+) m foam tape/.exec(t)?.[1] ?? 0)).reduce((a, b) => a + b, 0);
  expect(Math.abs(wallTape - tapeM), `${wallTape} m on the walls, ${tapeM} m on the order`).toBeLessThan(0.05 * Object.keys(lines).length);
  // Review order › → the Timber and cladding order (the Review & export path), the sheets there = the walls + spares
  await nav(page).getByRole("button", { name: "Review order ›" }).click();
  await expect(page.getByRole("dialog", { name: "Orders" })).toBeVisible();
  await page.getByRole("button", { name: "New order" }).click();
  await expect(page.getByText(/Draft FO-/)).toBeVisible();
  const og = page.locator('[data-order-group="mat-axon"]');
  const ordered = await og.getByLabel(/Order quantity.*\(sheets?\)/).evaluateAll((els) => els.map((e) => Number(e.value)));
  expect(ordered.reduce((a, b) => a + b, 0)).toBe(before + spares);
  await page.screenshot({ path: `${SHOTS}/order-after-review-390x844.png`, fullPage: true });
});

test("step 5: Select a wall on the plan → Open elevation → the same wall-to-wall buttons; a tapped sheet shows its details with no ‹ Previous / Next ›; the view is kept from wall to wall; Review walls from the Line panel and the walls list", async ({ page }) => {
  await traceFour(page);
  // Select → Wall 4 → Open elevation
  await page.getByRole("radio", { name: "Select" }).click();
  await tapPdf(page, at(6500, 2500));
  await expect(page.locator("[data-selected-wall]")).toContainText("Wall 4");
  await page.locator("[data-selected-wall]").getByRole("button", { name: "Open elevation" }).click();
  await expect(page.getByRole("dialog", { name: "Wall 4" })).toBeVisible();
  await expect(count(page)).toHaveText("2 of 5");
  // tap a sheet: its details, and no stepping through the parts of the wall
  await clickBox(page, page.locator('[data-wall-elevation] [data-el-kind="rect"]').first());
  await expect(page.locator("[data-element-info]")).toContainText("Stock");
  await expect(page.getByRole("button", { name: /Next element|Previous element/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^‹ Previous$|^Next ›$/ })).toHaveCount(0);
  // the wall-to-wall buttons are still there, and go to the next wall in the run
  await nav(page).getByRole("button", { name: "Next wall ›" }).click();
  await expect(page.getByRole("dialog", { name: "Wall 5" })).toBeVisible();
  await expect(page.locator("[data-element-info]")).toHaveCount(0);
  // the view you are on stays from wall to wall (Supports here)
  await page.getByRole("radio", { name: "Supports" }).click();
  await nav(page).getByRole("button", { name: "Next wall ›" }).click();
  await expect(page.getByRole("dialog", { name: "Wall 6" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Supports" })).toHaveAttribute("aria-checked", "true");
  // 44 px targets, no sideways scroll at 390
  for (const b of await nav(page).getByRole("button").all()) { const r = await b.boundingBox(); expect(r.height).toBeGreaterThanOrEqual(44); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  // ‹ Walls → the list's Review walls starts at the first wall again, on its own view
  await page.getByRole("button", { name: "‹ Walls" }).click();
  await page.getByRole("region", { name: "Walls" }).getByRole("button", { name: "Review walls" }).click();
  await expect(page.getByRole("dialog", { name: "Wall 3" })).toBeVisible();
  await expect(count(page)).toHaveText("1 of 5");
  await expect(page.getByRole("radio", { name: "Cladding" })).toHaveAttribute("aria-checked", "true");
  // a wall this cladding doesn't use (East wall, on the shiplap) has no wall-to-wall buttons until Use here
  await page.getByRole("button", { name: "‹ Walls" }).click();
  const others = page.locator("[data-other-walls]");
  if ((await others.getAttribute("open")) === null) await others.locator("summary").click();
  await others.getByRole("button", { name: "Open East wall" }).click();
  await expect(nav(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Use Axon cladding on this wall" }).click();
  await expect(count(page)).toHaveText("6 of 6");
  await expect(nav(page).getByRole("button", { name: "Review order ›" })).toBeVisible();
  // back on the plan: with no run card (Select, then Line) the Line panel still offers Review walls
  await page.getByRole("button", { name: "‹ Walls" }).click();
  await page.getByRole("button", { name: "Trace on plan" }).click();
  await page.waitForFunction(() => (window.__takeoffViewerStats?.renders || 0) > 0, null, { timeout: 30_000 });
  await expect(runCard(page)).toHaveCount(0);
  await page.locator("[data-line-panel]").getByRole("button", { name: "Review walls" }).click();
  await expect(page.getByRole("dialog", { name: "Wall 3" })).toBeVisible();
});

test("step 5 / Sam's answer 3: status chips, where a wall came from and the notes fold under More on the walls list, the rows and each wall; what blocks the order stays out with its fix", async ({ page }) => {
  await page.goto(MIXED);
  await ready(page);
  const row = page.locator("[data-material-row]").filter({ hasText: "Axon cladding" });
  if ((await row.locator("button[aria-expanded]").first().getAttribute("aria-expanded")) !== "true") await row.locator("button[aria-expanded]").first().click();
  await row.locator("[data-material-actions]").getByRole("button", { name: "Setup", exact: true }).click();
  await page.getByRole("button", { name: "Walls", exact: true }).click();
  await expect(page.getByRole("region", { name: "Walls" })).toBeVisible();
  // the material card: name and Setup; its three statuses and the installation note are under More
  const status = page.getByRole("region", { name: "Material status" });
  await expect(status.getByRole("button", { name: "Setup" })).toBeVisible();
  for (const g of ["quantity", "installation", "procurement"]) await expect(status.locator(`[data-status="${g}"]`)).toBeHidden();
  await expect(status.getByText("The app has not verified installation")).toBeHidden();
  await status.locator("[data-status-more] summary").click();
  for (const g of ["quantity", "installation", "procurement"]) await expect(status.locator(`[data-status="${g}"]`)).toBeVisible();
  await expect(status.getByText("The app has not verified installation")).toBeVisible();
  await expect(status.locator("[data-notes]")).toContainText("battens come from Cavity battens (set up by hand)");   // a note, not blocking
  // the wall rows: name and size; Entered, the materials and the quantities are under the list's More
  const north = page.locator("[data-wall-row]").filter({ hasText: "North wall" });
  await expect(north).toContainText("Rectangle · 4,800 mm long · 2,700 high · 1 opening");
  const chip = (text) => north.locator("span.rounded-full").filter({ hasText: new RegExp(`^${text}$`) });
  await expect(chip("Entered")).toBeHidden();
  await expect(chip("Axon cladding")).toBeHidden();
  await expect(chip("4 sheets")).toBeHidden();
  const more = page.getByRole("region", { name: "Walls" }).getByRole("button", { name: "More" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(chip("Entered")).toBeVisible();
  await expect(chip("Axon cladding")).toBeVisible();
  await expect(chip("4 sheets")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/walls-list-more-390x844.png` });
  await more.click();
  await expect(chip("Entered")).toBeHidden();
  // a wall that blocks the order: its row says so without More, and its page shows the problem with its fix
  await page.getByRole("button", { name: "Wall by numbers" }).click();
  const add = page.getByRole("region", { name: "Wall by numbers" });
  await add.getByLabel("Wall name").fill("Tall");
  await add.getByLabel("Wall length").fill("4000"); await add.getByLabel("Wall length").press("Enter");
  await page.getByLabel("Wall height").fill("4200"); await page.getByLabel("Wall height").press("Enter");
  const problems = page.locator("[data-wall-problems]");
  await expect(problems).toBeVisible();
  await expect(problems).toContainText("tallest listed sheet");
  await expect(problems.getByRole("button", { name: /^Use a 10 mm joint with an H-flashing$/ })).toBeVisible();
  await expect(line(page)).toHaveText("needs attention, see below");
  const wallMore = page.locator("[data-wall-more]");
  await expect(wallMore.locator('[data-status="quantity"]')).toBeHidden();
  await page.getByRole("button", { name: "‹ Walls" }).click();
  await expect(page.locator("[data-wall-row]").filter({ hasText: "Tall" }).locator("[data-wall-blocked]")).toBeVisible();
  // a wall page: where it came from, the statuses and the note are under More; the short line is at the top
  await page.getByRole("button", { name: "Open North wall" }).click();
  await expect(line(page)).toHaveText(/^4 sheets · [\d.]+ m foam tape$/);   // no automatic battens: Cavity battens are set up by hand here
  await expect(wallMore.locator("[data-provenance]")).toBeHidden();
  await expect(wallMore.locator('[data-wall-status="mat-axon"] [data-status="quantity"]')).toBeHidden();
  await expect(wallMore.locator("[data-wall-notes]")).toBeHidden();
  await page.screenshot({ path: `${SHOTS}/wall-more-closed-390x844.png` });
  await wallMore.locator("summary").click();
  await expect(wallMore.locator("[data-provenance]")).toHaveText("Entered");
  await expect(wallMore.locator('[data-wall-status="mat-axon"] [data-status="quantity"]')).toBeVisible();
  await expect(wallMore.locator('[data-wall-status="mat-bat"]')).toBeVisible();   // every material on the wall
  await expect(wallMore.locator("[data-wall-notes]")).toContainText("battens come from Cavity battens (set up by hand)");
  await wallMore.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/wall-more-open-390x844.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

// ── review round (wall-by-wall step 5): the reviewers' findings ─────────────────────────────────────────────────────

/** Axon cladding (mixed seed) → Walls. */
async function mixedWalls(page) {
  await page.goto(MIXED);
  await ready(page);
  const row = page.locator("[data-material-row]").filter({ hasText: "Axon cladding" });
  if ((await row.locator("button[aria-expanded]").first().getAttribute("aria-expanded")) !== "true") await row.locator("button[aria-expanded]").first().click();
  await row.locator("[data-material-actions]").getByRole("button", { name: "Walls", exact: true }).click();
  await expect(page.getByRole("region", { name: "Walls" })).toBeVisible();
}
async function wallByNumbers(page, name, length, height) {
  await page.getByRole("button", { name: "Wall by numbers" }).click();
  const add = page.getByRole("region", { name: "Wall by numbers" });
  await add.getByLabel("Wall name").fill(name);
  await add.getByLabel("Wall length").fill(String(length)); await add.getByLabel("Wall length").press("Enter");
  await expect(page.getByRole("dialog", { name })).toBeVisible();
  if (height) { await page.getByLabel("Wall height").fill(String(height)); await page.getByLabel("Wall height").press("Enter"); }
}
/** Seed job materials + walls through the review backend's own commit endpoint, then open the Timber and cladding takeoff. */
async function seeded(page, changes) {
  await page.goto("/carpentry/cjb-1?reviewRole=admin");
  await ready(page);
  const res = await page.evaluate(async (ch) => {
    const ws = await (await fetch("/api/takeoff/workspaces/ws-1")).json();
    const r = await fetch("/api/takeoff/workspaces/ws-1/commit", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision: ws.snapshot.workspace.revision, idempotencyKey: `tc-review-${Math.random()}`, changes: ch }) });
    return r.json();
  }, { calibrations: { insert: [] }, materials: { upsert: [], archive: [] }, measurements: { upsert: [], archive: [] }, contributions: { upsert: [], archive: [] }, ...changes });
  expect(res.ok, JSON.stringify(res)).toBe(true);
  await page.evaluate(() => { window.history.pushState({}, "", "/carpentry/cjb-1/takeoff?reviewRole=admin&section=timber_cladding"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await ready(page);
}
/** Axon 400 smooth from the real catalogue; noLengths = a product whose stock lengths are missing (a problem with the MATERIAL, no wall named). */
function axon400({ noLengths = false } = {}) {
  const spec = specFromGroup(productGroups({ family: "cladding" }).find((g) => g.name === "Axon 400 smooth"));
  if (noLengths) spec.product = { ...spec.product, lengthsMm: [], skus: [] };
  const m = methodFor(spec);
  return { id: "mat-a400", name: "Axon 400 smooth", methodKey: m.key, methodVersion: m.version, spec, rules: {}, profile: null };
}
const wallRec = (id, name, widthMm, heightMm) => ({ id, kind: "wall", documentId: null, pageIndex: null, calibrationId: null, points: null, parentId: null, label: null, inputs: { kind: "rect", widthMm, heightMm, name } });

test("step 5 review: the view kept while stepping wall to wall stays with that step — a new wall by numbers (or one from the list) opens on its own view", async ({ page }) => {
  await mixedWalls(page);
  await wallByNumbers(page, "Second", 3000, 2700);
  await page.getByRole("button", { name: "‹ Walls" }).click();
  await page.getByRole("region", { name: "Walls" }).getByRole("button", { name: "Review walls" }).click();
  await expect(page.getByRole("dialog", { name: "North wall" })).toBeVisible();
  await expect(count(page)).toHaveText("1 of 2");
  await page.getByRole("radio", { name: "Supports" }).click();
  await nav(page).getByRole("button", { name: "Next wall ›" }).click();
  await expect(page.getByRole("dialog", { name: "Second" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Supports" })).toHaveAttribute("aria-checked", "true");   // kept while stepping
  // ‹ Walls, then a new wall by numbers: the cladding's own first view, not the one last stepped on
  await page.getByRole("button", { name: "‹ Walls" }).click();
  await wallByNumbers(page, "Third", 2400, 2700);
  await expect(page.getByRole("radio", { name: "Cladding" })).toHaveAttribute("aria-checked", "true");
  // and a wall opened from the list after stepping
  await page.getByRole("button", { name: "‹ Walls" }).click();
  await page.getByRole("button", { name: "Open Second" }).click();
  await expect(page.getByRole("radio", { name: "Cladding" })).toHaveAttribute("aria-checked", "true");
});

test("step 5 review: Select → Open elevation on a wall of another cladding opens it under that cladding, with its wall-to-wall buttons and no offer to add the wrong cladding", async ({ page }) => {
  await traceFour(page);   // Axon cladding: Wall 3–6
  await chooseMaterial(page, "Shiplap (random lengths)");
  await page.getByRole("radio", { name: "Select" }).click();
  await tapPdf(page, at(6500, 2500));
  await expect(page.locator("[data-selected-wall]")).toContainText("Wall 4");
  await page.locator("[data-selected-wall]").getByRole("button", { name: "Open elevation" }).click();
  const dlg = page.getByRole("dialog", { name: "Wall 4" });
  await expect(dlg).toBeVisible();
  await expect(dlg.locator("header")).toContainText("Axon cladding ·");
  await expect(count(page)).toHaveText("2 of 5");
  await expect(page.locator("[data-use-here]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Use Shiplap/ })).toHaveCount(0);
});

test("step 5 review: a problem with the cladding itself (no stock lengths) shows on every wall page with its Setup; the short line says so; Review order › waits until there is something to order", async ({ page }) => {
  const mat = axon400({ noLengths: true });
  await seeded(page, { materials: { upsert: [mat], archive: [] }, measurements: { upsert: [wallRec("rw-1", "Front", 4800, 2700), wallRec("rw-2", "Side", 3000, 2700)], archive: [] },
    contributions: { upsert: [{ id: "rc-1", measurementId: "rw-1", jobMaterialId: mat.id, role: "wall" }, { id: "rc-2", measurementId: "rw-2", jobMaterialId: mat.id, role: "wall" }], archive: [] } });
  const row = page.locator("[data-material-row]").filter({ hasText: "Axon 400 smooth" });
  if ((await row.locator("button[aria-expanded]").first().getAttribute("aria-expanded")) !== "true") await row.locator("button[aria-expanded]").first().click();
  // the overview's own rule: nothing to order, so Review & export order is greyed
  await expect(page.getByRole("button", { name: /Review & export order|^Orders$/ })).toBeDisabled();
  await row.locator("[data-material-actions]").getByRole("button", { name: "Walls", exact: true }).click();
  await page.getByRole("region", { name: "Walls" }).getByRole("button", { name: "Review walls" }).click();
  for (const [name, n] of [["Front", "1 of 2"], ["Side", "2 of 2"]]) {
    await expect(page.getByRole("dialog", { name })).toBeVisible();
    await expect(count(page)).toHaveText(n);
    const problems = page.locator("[data-wall-problems]");
    await expect(problems).toBeVisible();
    await expect(problems).toContainText("Axon 400 smooth: Enter the stock length(s) or sheet height(s).");
    await expect(problems.getByRole("button", { name: "Set up Axon 400 smooth" }).first()).toBeVisible();
    await expect(line(page, mat.id)).toHaveText("needs attention, see below");
    if (n === "1 of 2") await nav(page).getByRole("button", { name: "Next wall ›" }).click();
  }
  // the last wall: Review order › is there but greyed, and says why
  await expect(nav(page).getByRole("button", { name: "Review order ›" })).toBeDisabled();
  await expect(page.locator("[data-wall-nav-note]")).toHaveText("Nothing to order yet");
  await page.screenshot({ path: `${SHOTS}/material-problem-on-wall-390x844.png` });
  // the fix is one tap away: Setup opens the cladding's setup
  await page.locator("[data-wall-problems]").getByRole("button", { name: "Set up Axon 400 smooth" }).first().click();
  await expect(page.getByRole("button", { name: "Walls", exact: true })).toBeVisible();
});

test("step 5 review: once a blocked wall is fixed there is something to order and Review order › opens the order", async ({ page }) => {
  const mat = axon400();
  await seeded(page, { materials: { upsert: [mat], archive: [] }, measurements: { upsert: [wallRec("rw-t", "Tall", 4000, 4200)], archive: [] },
    contributions: { upsert: [{ id: "rc-t", measurementId: "rw-t", jobMaterialId: mat.id, role: "wall" }], archive: [] } });
  const row = page.locator("[data-material-row]").filter({ hasText: "Axon 400 smooth" });
  if ((await row.locator("button[aria-expanded]").first().getAttribute("aria-expanded")) !== "true") await row.locator("button[aria-expanded]").first().click();
  await row.locator("[data-material-actions]").getByRole("button", { name: "Walls", exact: true }).click();
  await page.getByRole("region", { name: "Walls" }).getByRole("button", { name: "Review walls" }).click();
  await expect(count(page)).toHaveText("1 of 1");
  const order = nav(page).getByRole("button", { name: "Review order ›" });
  await expect(order).toBeDisabled();   // no lines yet: an order here would be an empty draft (and an order number used up)
  await expect(page.locator("[data-wall-nav-note]")).toHaveText("Nothing to order yet");
  await page.locator("[data-wall-problems]").getByRole("button", { name: /^Use a 10 mm joint with an H-flashing$/ }).click();
  await expect(page.locator("[data-wall-problems]")).toHaveCount(0);
  await expect(order).toBeEnabled();
  await expect(page.locator("[data-wall-nav-note]")).toHaveCount(0);
  await order.click();
  await expect(page.getByRole("dialog", { name: "Orders" })).toBeVisible();
});

test("step 5 review: on a short phone the wall-to-wall buttons step aside while an opening is edited, so the whole wall shows above the sheet; a tapped sheet keeps them", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });   // an iPhone in Safari with its bars showing
  await mixedWalls(page);
  await page.getByRole("region", { name: "Walls" }).getByRole("button", { name: "Review walls" }).click();
  await expect(page.getByRole("dialog", { name: "North wall" })).toBeVisible();
  await expect(nav(page)).toBeVisible();
  await page.locator("[data-opening-row]").filter({ hasText: "W1" }).getByRole("button").click();
  const sheet = page.getByRole("region", { name: "Opening W1" });
  await expect(sheet).toBeVisible();
  await expect(nav(page)).toHaveCount(0);
  await page.waitForTimeout(300);   // the drawing is scrolled to the top of the page
  const svg = await page.locator("[data-wall-elevation]").first().boundingBox();
  const sb = await sheet.boundingBox();
  expect(svg.y + svg.height, `drawing ${svg.y}–${svg.y + svg.height}, sheet from ${sb.y}`).toBeLessThanOrEqual(sb.y + 1);
  await page.screenshot({ path: `${SHOTS}/opening-sheet-no-footer-390x664.png` });
  await sheet.getByRole("button", { name: "Close panel" }).click();
  await expect(nav(page)).toBeVisible();
  // a tapped sheet's small panel keeps the buttons (and leaves the home-bar room to them)
  await clickBox(page, page.locator('[data-wall-elevation] [data-el-kind="rect"]').first());
  await expect(page.locator("[data-element-info]")).toBeVisible();
  await expect(nav(page)).toBeVisible();
  expect(await page.locator("[data-element-info]").evaluate((el) => el.closest("section").style.paddingBottom)).toBe("1rem");
});

test("step 5 review: a 1 mm cut strip is still opened by tapping it (no stepping through the sheets any more)", async ({ page }) => {
  await mixedWalls(page);
  await page.getByRole("button", { name: "Open North wall" }).click();
  await page.getByLabel("Wall length").fill("4801"); await page.getByLabel("Wall length").press("Enter");
  await expect(page.locator("[data-sheet-summary]")).toContainText("5 strips (1 cut: 1 mm wide) × 1 course → 5 sheets");
  const strip = page.locator('[data-el-id="c4r0"] rect').first();
  await strip.scrollIntoViewIfNeeded();
  const b = await strip.boundingBox();
  expect(b.width).toBeLessThan(2);   // far thinner than a finger
  // a finger lands a few px off: 3 px to the left is over its wide neighbour, and the thin strip still wins
  await page.mouse.click(b.x + b.width / 2 - 3, b.y + b.height / 2);
  await expect(page.locator('[data-element-info="c4r0"]')).toBeVisible();
  await expect(page.locator('[data-element-info="c4r0"]')).toContainText("Cut size");
  // its wide neighbour is still its own tap
  const n = await page.locator('[data-el-id="c3r0"] rect').first().boundingBox();
  await page.mouse.click(n.x + n.width / 2, n.y + n.height / 2);
  await expect(page.locator('[data-element-info="c3r0"]')).toBeVisible();
});
