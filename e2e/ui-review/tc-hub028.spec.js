// @ts-check
// Hub review HUB 028 — Walls (trace once, studs + plates + noggins together), UI Review Mode (mocked backend).
// Plan: docs/hub_review/WALLS_FRAMING_PLAN.md. Step 2 (material and registry): the review mock keeps a Walls item the
// way the REAL server does (scripts/tests/takeoff-api.test.mjs "HUB 028 step 2") — the normalised spec with its four
// parts (Long plates = 90 × 45 LVL), junk dropped — and refuses a measurement a Walls item can't read (walls only).
// Step 4 (entry and plan): Add walls goes straight to the plan with Line (no Timber card), the Line panel's Wall height,
// Stud centres and Double top plate, the Walls line (the real engine's figures: plan screen steps 1-6 and 9-13, Sam's
// round 2) and "Details: n to fix ›". Details › and the row's Setup open the Walls card (no Purpose chips, no company-product
// picker, "Trace walls").
// Step 5 (the Walls card and the wall pages): the card's needs and notes (lintels note first), Stud centres, Double top
// plate, its Walls line and the closed "Studs, plates, noggins" fold (each part's HUB 027 Size and grade list, filled
// with wallPartFill; Long plates (over 6.0 m) after Plates); each wall page's own Walls line and notes (LVL plates, its
// openings' lintels note), studs beside openings drawn as full studs, the framing detail in an opening's sheet; plan
// screen steps 7 (reload) and 8 (walls-products: saved products fill every part, the noggins' longest length too).
// The step 5 review: the card's Needs are the parts' only (a blocked wall's reason sits under its line); a wall page
// shows the parts' needs as one banner, its live result as the framing line, and "… aren't counted" (never "base studs
// only") for an opening with no detail; the fold shows a product's not-stocked lengths and refuses a 0 at the field.
// Step 6: Add walls on a takeoff with no plan opens its Walls list (Wall by numbers, no Trace on plan), as SOP 20-08 says.
//   UI_REVIEW_PORT=5196 npx playwright test --config=playwright.ui-review.config.js e2e/ui-review/tc-hub028.spec.js
import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { normaliseFamilySpec, wallFramingDefaults } from "../../shared/takeoff/index.js";

const SHOTS = "docs/takeoff/evidence/ui/tc-hub028";
mkdirSync(SHOTS, { recursive: true });
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.getAttribute("data-ui-review-ready") === "true", null, { timeout: 30_000 }).catch(() => {});
}
/** One save through the fake server's own commit endpoint (as the app sends it). */
const commit = (page, changes, key) => page.evaluate(async ({ changes, key }) => {
  const ws = await (await fetch("/api/takeoff/workspaces/ws-1")).json();
  const r = await fetch("/api/takeoff/workspaces/ws-1/commit", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedRevision: ws.snapshot.workspace.revision, idempotencyKey: key, changes }) });
  return { status: r.status, body: await r.json(), before: ws.snapshot.workspace.revision };
}, { changes, key });
const snapshot = (page) => page.evaluate(async () => (await (await fetch("/api/takeoff/workspaces/ws-1")).json()).snapshot);

test("HUB 028 step 2: the mock keeps a Walls item like the server (normalised parts) and refuses a measurement Walls can't read", async ({ page }) => {
  await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin");
  await ready(page);
  const spec = wallFramingDefaults([]);
  const sent = { ...spec, junk: "x", spareRate: 10, components: { ...spec.components, extra: { section: { depthMm: 1 } },
    noggins: { ...spec.components.noggins, treatment: " H2 ", stock: { maxMm: 5400, unavailableMm: [4800, 4850] } } } };
  const walls = { id: "mat-walls", name: "Walls", methodKey: "wall_framing", methodVersion: 1, spec: sent, rules: { centresMm: 600, doubleTopPlate: false }, profile: null };
  const ok = await commit(page, {
    materials: { upsert: [walls] },
    measurements: { upsert: [{ id: "w-1", kind: "wall", inputs: { kind: "rect", widthMm: 6000, heightMm: 2700, name: "Wall 1" } }] },
    contributions: { upsert: [{ id: "c-w-1", measurementId: "w-1", jobMaterialId: "mat-walls", role: "wall" }] } }, "hub028-s2-seed");
  expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  const kept = (await snapshot(page)).materials.find((m) => m.id === "mat-walls");
  expect(kept.spec).toEqual(normaliseFamilySpec(sent));
  expect(Object.keys(kept.spec.components)).toEqual(["studs", "plates", "longPlates", "noggins"]);
  expect(kept.spec.components.noggins.stock).toEqual({ maxMm: 5400, unavailableMm: [4800] });
  expect([kept.spec.components.longPlates.grade, kept.spec.components.longPlates.stock.maxMm, kept.spec.spareRate, kept.spec.junk]).toEqual(["LVL", 11000, 0, undefined]);
  expect(kept.rules).toEqual({ centresMm: 600, doubleTopPlate: false });
  // an entered length on Walls: the server's own message, and nothing saved
  const before = (await snapshot(page)).workspace.revision;
  const bad = await commit(page, {
    measurements: { upsert: [{ id: "m-len", kind: "manual", finishedLengthMm: 2400, quantity: 2 }] },
    contributions: { upsert: [{ id: "c-len", measurementId: "m-len", jobMaterialId: "mat-walls", role: "primary" }] } }, "hub028-s2-bad");
  expect(bad.status).toBe(400);
  expect(bad.body.error).toBe("Walls can't use a manual measurement — assign it to the right material.");
  const after = await snapshot(page);
  expect(after.workspace.revision).toBe(before);
  expect(after.measurements.some((m) => m.id === "m-len")).toBe(false);
  // a broken part is refused like the server's cleaner, naming the part
  const broken = await commit(page, { materials: { upsert: [{ ...walls, spec: { ...sent, components: { plates: { section: { depthMm: -90 } } } } }] } }, "hub028-s2-broken");
  expect(broken.status).toBe(400);
  expect(broken.body.error).toBe("Plates: section depth must be a positive number.");
  expect((await snapshot(page)).materials.find((m) => m.id === "mat-walls").spec).toEqual(normaliseFamilySpec(sent));
});

// ══ Step 4: entry and plan ═══════════════════════════════════════════════════════════════════════════════════════

const meta = JSON.parse(readFileSync(new URL("../../src/ui-review/fixtures/takeoff/synthetic-plan-set.json", import.meta.url), "utf8"));
const K = meta.pages[0].pdfUnitsPerMm;
/** A point on the review plan's page 1, in mm from its origin (fixtures/takeoff.js bx, by). */
const at = (xMm, yMm) => ({ x: 120 + xMm * K, y: 150 + yMm * K });
const TIMBER = "/carpentry/cjb-1/takeoff?reviewRole=admin&section=timber_cladding";
const WORKER = "/worker/takeoff/carpentry/cjb-1?section=timber_cladding";

// the plan's worked example, traced on the review plan: Wall 1 A → B 6,000 along, Wall 2 B → C 4,000 down; D1 820 wide
// at 1,000 on Wall 1; W1 1,800 wide at 1,200 from the corner on Wall 2 (sill 900, 1,200 high)
const A = at(2000, 3000), B = at(8000, 3000), C = at(8000, 7000);
const D1_ENDS = [at(3000, 3000), at(3820, 3000)];
const W1_ENDS = [at(8000, 4200), at(8000, 6000)];

const vp = (page) => page.locator("[data-takeoff-viewport]");
const sheet = (page) => page.locator("[data-takeoff-focus] section[aria-label]");
const panel = (page) => page.locator("[data-line-panel]");
const heightField = (page) => page.locator("[data-line-height]").getByLabel("Wall height");
const centresField = (page) => page.locator("[data-stud-centres]").getByLabel("Stud centres");
const doubleTop = (page) => page.getByRole("checkbox", { name: "Double top plate" });
const wallsLine = (page) => page.locator("[data-walls-line]");
const saved = (page) => expect(page.getByRole("status").filter({ hasText: /^Saved$/ }).first()).toBeVisible({ timeout: 15_000 });

async function viewerReady(page, before = 0) {
  await page.waitForFunction((n) => (window.__takeoffViewerStats?.renders || 0) > n, before, { timeout: 30_000 });
  await page.waitForTimeout(250);
}
/** The plan point's place on screen. */
const screenOf = (page, p) => page.evaluate((pt) => {
  const el = document.querySelector("[data-takeoff-viewport]");
  const s = el.takeoffViewport.toScreen(pt);
  const r = el.getBoundingClientRect();
  return { x: r.left + s.x, y: r.top + s.y };
}, p);
/**
 * Tap a plan point exactly: the plan is zoomed right in on it first (so the tap's own rounding is well under a
 * millimetre). The engine figures below are then the worked example's exactly. Every point then sits in the middle of
 * the screen, so each tap waits out the double-tap window (300 ms) first: two quick taps on one spot are a double-tap.
 */
async function tapAt(page, p, times = 1) {
  await page.evaluate((pt) => document.querySelector("[data-takeoff-viewport]").takeoffViewport.zoomOn(pt, 40), p);
  await page.waitForTimeout(450);
  const s = await screenOf(page, p);
  const b = await vp(page).boundingBox();
  expect(s.x > b.x && s.x < b.x + b.width && s.y > b.y && s.y < b.y + b.height, `point ${JSON.stringify(p)} on screen`).toBe(true);
  for (let i = 0; i < times; i++) await page.touchscreen.tap(s.x, s.y);
}
/** Trace A → B → C with Line and double-tap C (both walls in one save). */
async function traceL(page) {
  await tapAt(page, A);
  await tapAt(page, B);
  await tapAt(page, C, 2);
  await expect(page.locator("[data-run-card]")).toBeVisible();
}
async function setHeight(page, mm) { await heightField(page).fill(String(mm)); await heightField(page).press("Enter"); }
async function setCentres(page, mm) { await centresField(page).fill(String(mm)); await centresField(page).press("Enter"); }
/** + Window / + Door on the plan: sizes typed, then both ends tapped. */
async function addOpening(page, kind, ends, { heightMm, sillMm } = {}) {
  await panel(page).getByRole("button", { name: kind === "door" ? "+ Door" : "+ Window" }).click();
  const op = page.locator("[data-opening-panel]");
  await expect(op).toHaveAttribute("data-opening-panel", kind);
  if (heightMm != null) { const h = page.locator("[data-opening-height]").getByLabel("Height"); await h.fill(String(heightMm)); await h.press("Enter"); }
  if (sillMm != null) { const s = page.locator("[data-opening-sill]").getByLabel("Sill height"); await s.fill(String(sillMm)); await s.press("Enter"); }
  for (const p of ends) await tapAt(page, p);
  await expect(op.locator("[data-last-opening-label]")).toBeVisible();
  await op.getByRole("button", { name: "Trace more walls" }).click();
}
/** The Walls item as the (fake) server holds it: its material, walls and their contributions. */
const wallsState = (page) => page.evaluate(async () => {
  const s = (await (await fetch("/api/takeoff/workspaces/ws-1")).json()).snapshot;
  const mats = s.materials.filter((m) => m.methodKey === "wall_framing");
  const cons = s.contributions.filter((c) => mats.some((m) => m.id === c.jobMaterialId));
  const walls = s.measurements.filter((m) => cons.some((c) => c.measurementId === m.id));
  return { materials: mats, contributions: cons, walls, timber: s.materials.filter((m) => m.spec?.family === "timber").length };
});
/** Overview → Add walls (Timber group) → the plan. */
async function addWalls(page, path = TIMBER) {
  await page.goto(path);
  await ready(page);
  const before = await page.evaluate(() => window.__takeoffViewerStats?.renders || 0);
  await page.locator('[data-material-group="timber"]').getByRole("button", { name: "Add walls" }).click();
  await viewerReady(page, before);
}
/** Overview → Measure (the seeded Walls item is the section's first material). */
async function openMeasure(page, path) {
  await page.goto(path);
  await ready(page);
  const before = await page.evaluate(() => window.__takeoffViewerStats?.renders || 0);
  await page.getByRole("button", { name: /^Measure$/ }).click();
  await viewerReady(page, before);
}
/**
 * "Reload" in the mocked suite: leave the takeoff and come back inside the app, so it loads again from the mocked
 * server (a browser reload would re-seed the mock). The real server's reload is takeoff-api.test.mjs and the journey.
 */
async function reloadTakeoff(page, path) {
  await page.evaluate(() => { history.pushState({}, "", "/carpentry/cjb-1?reviewRole=admin"); dispatchEvent(new PopStateEvent("popstate")); });
  await page.waitForTimeout(300);
  await page.evaluate((u) => { history.pushState({}, "", u); dispatchEvent(new PopStateEvent("popstate")); }, path);
  await ready(page);
  await expect(page.getByRole("button", { name: /^Measure$/ })).toBeVisible();
}
/** Inside the sheet's visible area, without scrolling it. */
async function inSheetView(page, locator) {
  const sb = await sheet(page).boundingBox();
  const b = await locator.boundingBox();
  const scrolled = await sheet(page).evaluate((el) => el.scrollTop);
  return { inside: !!b && b.y >= sb.y && b.y + b.height <= sb.y + sb.height + 0.5, scrolled, b, sb };
}

/** The Walls card (Details › or the row's Setup): its needs name the parts; no Purpose chips, no company-product picker. */
async function expectWallsCard(page) {
  const win = page.locator("[data-takeoff-focus]");
  await expect(win.locator('[data-setup="walls"]')).toBeVisible();
  await expect(win.getByRole("heading", { name: "Walls", exact: true })).toBeVisible();
  await expect(win.getByText("Walls · this job only")).toBeVisible();
  await expect(win.locator("[data-needs]")).toContainText('Studs: enter the treatment (or "untreated").');
  await expect(win.locator("[data-needs]")).toContainText('Plates: enter the treatment (or "untreated").');
  await expect(win.locator("[data-needs]")).toContainText('Noggins: enter the treatment (or "untreated").');
  await expect(win.locator('[data-setup="timber"], [data-chips="purpose"]')).toHaveCount(0);
  await expect(win.getByLabel("Company products")).toHaveCount(0);
  await expect(win.getByRole("button", { name: "Measure members" })).toHaveCount(0);
  await expect(win.getByRole("button", { name: "Trace walls" })).toBeVisible();
}

const L_PLAIN = "Walls: 19 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 17 noggins (1 row)";
const L_450 = "Walls: 25 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 23 noggins (1 row)";
const L_OPENINGS = "Walls: 21 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 13 noggins (1 row)";
const L_DOUBLE = "Walls: 21 studs at 2,700 · bottom plate 10.00 m · top plate 2 × 10.00 m · 13 noggins (1 row)";

test.describe("HUB 028 step 4: Add walls, the Line panel and the Walls line — phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("screen 1-6: Add walls opens the plan with Line (no Timber card); one Walls item for the L; Stud centres with one Undo; + Door / + Window; Double top plate; a 2,800 wall reads the mixed form", async ({ page }) => {
    await addWalls(page);
    // 1. straight onto the plan: Line checked, no Rectangle, Area or Wall, no Timber card; the three settings in view
    await expect(page.getByRole("radio", { name: "Line", exact: true })).toHaveAttribute("aria-checked", "true");
    for (const name of ["Rectangle", "Area", "Wall", "Member"]) await expect(page.getByRole("radio", { name, exact: true })).toHaveCount(0);
    await expect(page.locator('[data-setup="timber"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Measure members" })).toHaveCount(0);
    await expect(panel(page).locator("[data-line-material]")).toHaveText("Walls");
    await expect(heightField(page)).toHaveValue("");                            // the first time it is empty
    await expect(centresField(page)).toHaveValue("600");
    await expect(doubleTop(page)).not.toBeChecked();
    for (const l of [heightField(page), centresField(page), doubleTop(page)]) await expect(l).toBeVisible();
    // the built-in parts have no treatment: the panel says how many need fixing, the needs themselves aren't listed here
    await expect(page.locator("[data-walls-details]")).toHaveText("Details: 3 to fix ›");
    await expect(panel(page)).not.toContainText("enter the treatment");
    await expect(wallsLine(page)).toHaveText("");                                // nothing traced yet
    await shot(page, "add-walls-line-panel-390x844");
    // 2. trace the L at 2,700: ONE Walls material (not three) with 2 walls, role wall
    await setHeight(page, 2700);
    await traceL(page);
    await saved(page);
    let s = await wallsState(page);
    expect(s.materials).toHaveLength(1);
    expect(s.timber, "one timber item, not Studs + Plates + Noggins").toBe(1);
    expect(s.materials[0]).toMatchObject({ name: "Walls", methodKey: "wall_framing", methodVersion: 1, rules: { centresMm: 600, doubleTopPlate: false } });
    expect(s.walls.map((w) => [w.kind, w.inputs.heightMm, w.inputs.seq])).toEqual([["wall", 2700, 1], ["wall", 2700, 2]]);
    expect(s.contributions.map((c) => c.role)).toEqual(["wall", "wall"]);
    await expect(wallsLine(page)).toHaveText(L_PLAIN);
    await expect(wallsLine(page)).toContainText("19 studs");
    await expect(wallsLine(page)).toContainText("17 noggins");
    // one "Details" on the panel (it opens the Walls card); the quantity / installation / procurement fold is "Status"
    await expect(panel(page).locator("summary")).toHaveText(["Status"]);
    await expect(panel(page).getByText(/^Details/)).toHaveText(["Details: 3 to fix ›"]);
    await shot(page, "walls-line-L-390x844");
    // 3. Stud centres 450 → 25 studs; ONE Undo → 600 and 19 studs
    await setCentres(page, 450);
    await expect(wallsLine(page)).toHaveText(L_450);
    await saved(page);
    expect((await wallsState(page)).materials[0].rules).toEqual({ centresMm: 450, doubleTopPlate: false });
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(centresField(page)).toHaveValue("600");
    await expect(wallsLine(page)).toHaveText(L_PLAIN);
    await saved(page);
    expect((await wallsState(page)).materials[0].rules).toEqual({ centresMm: 600, doubleTopPlate: false });
    // 4. + Door on Wall 1 and + Window on Wall 2 → the worked example's line (Sam's round 2 figures)
    await addOpening(page, "door", D1_ENDS, { heightMm: 2040 });
    await addOpening(page, "window", W1_ENDS, { heightMm: 1200, sillMm: 900 });
    await expect(wallsLine(page)).toHaveText(L_OPENINGS);
    await expect(wallsLine(page)).not.toContainText("confirm");
    await saved(page);
    const ops = (await snapshot(page)).measurements.filter((m) => m.kind === "opening" && s.walls.some((w) => w.id === m.parentId))
      .map((m) => [m.inputs.label, m.inputs.type, m.inputs.xMm, m.inputs.widthMm]).sort();
    expect(ops).toEqual([["D1", "door", 1000, 820], ["W1", "window", 1200, 1800]]);
    // 5. Double top plate: only the top plate changes
    await doubleTop(page).check();
    await expect(wallsLine(page)).toHaveText(L_DOUBLE);
    await saved(page);
    expect((await wallsState(page)).materials[0].rules).toEqual({ centresMm: 600, doubleTopPlate: true });
    // 6. a 3,000 wall at 2,800 (its own run): the mixed form, lowest height first, and (1–2 rows)
    await setHeight(page, 2800);
    await tapAt(page, at(2000, 5000));
    await tapAt(page, at(5000, 5000), 2);
    await expect(page.locator("[data-run-card] [data-run-label]")).toHaveText("Run 2 · 1 wall · 2,800");
    await expect(wallsLine(page)).toHaveText("Walls: 27 studs (21 at 2,700, 6 at 2,800) · bottom plate 13.00 m · top plate 2 × 13.00 m · 23 noggins (1–2 rows)");
    await saved(page);
    s = await wallsState(page);
    expect(s.walls.map((w) => w.inputs.heightMm).sort()).toEqual([2700, 2700, 2800]);
    await shot(page, "walls-line-mixed-390x844");
    // the longest line yet (three lines on the phone): + Window / + Door still sit in the visible sheet
    for (const name of ["+ Window", "+ Door"]) {
      const v = await inSheetView(page, page.locator("[data-run-card]").getByRole("button", { name }));
      expect(v.inside && v.scrolled === 0, `${name} in view ${JSON.stringify(v)}`).toBe(true);
    }
    // Details › opens this Walls item's card: the parts' needs, each naming its part; no Purpose chips and no
    // company-product picker (one tap there would turn Walls into Studs or replace its parts); Close comes back here
    const MIXED = "Walls: 27 studs (21 at 2,700, 6 at 2,800) · bottom plate 13.00 m · top plate 2 × 13.00 m · 23 noggins (1–2 rows)";
    await page.locator("[data-walls-details]").click();
    await expectWallsCard(page);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(panel(page).locator("[data-line-material]")).toHaveText("Walls");
    await expect(wallsLine(page)).toHaveText(MIXED);
    // … and its "Trace walls" also comes back here; a later Close on a card opened from the overview then goes back to
    // the overview, never to this plan (where the Details › card was opened from)
    await page.locator("[data-walls-details]").click();
    await page.getByRole("button", { name: "Trace walls" }).click();
    await expect(wallsLine(page)).toHaveText(MIXED);
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Timber and cladding" })).toBeVisible();
    const row = page.locator("[data-material-row]").filter({ hasText: /^Walls/ });
    await row.getByRole("button", { name: "Setup", exact: true }).click();
    await expectWallsCard(page);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Timber and cladding" })).toBeVisible();
    await expect(page.locator("[data-line-panel]")).toHaveCount(0);
    expect((await wallsState(page)).materials[0]).toMatchObject({ name: "Walls", methodKey: "wall_framing", spec: { purpose: "walls" } });
  });

  test("screen 9: at 390 × 844 no sideways scroll; Finish (tracing) and + Window / + Door (after Finish) sit in the visible sheet without scrolling it; the Worker app shows the same flow", async ({ page }) => {
    for (const path of [TIMBER, WORKER]) {
      await addWalls(page, path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${path}: no sideways scroll`).toBe(true);
      await setHeight(page, 2700);
      await tapAt(page, A);
      await tapAt(page, B);
      // a slow second tap on the last point (the likeliest slip on site): the "last point" note shows at the top
      await tapAt(page, B);
      await expect(page.getByText(/^That's the last point/)).toBeVisible();
      // while tracing: the Walls line and its settings hide, Finish is in view without scrolling the sheet
      await expect(wallsLine(page)).toHaveCount(0);
      await expect(page.locator("[data-walls-details], [data-walls-rules]")).toHaveCount(0);
      const fin = await inSheetView(page, panel(page).getByRole("button", { name: "Finish" }));
      expect(fin.inside && fin.scrolled === 0, `${path}: Finish in view ${JSON.stringify(fin)}`).toBe(true);
      if (path === TIMBER) await shot(page, "tracing-finish-390x844");
      await panel(page).getByRole("button", { name: "Finish" }).click();
      await expect(page.locator("[data-run-card]")).toBeVisible();
      await expect(wallsLine(page)).toHaveText("Walls: 11 studs at 2,700 · bottom plate 6.00 m · top plate 6.00 m · 10 noggins (1 row)");
      for (const name of ["+ Window", "+ Door"]) {
        const b = await inSheetView(page, page.locator("[data-run-card]").getByRole("button", { name }));
        expect(b.inside && b.scrolled === 0, `${path}: ${name} in view ${JSON.stringify(b)}`).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${path}: no sideways scroll after Finish`).toBe(true);
      if (path === TIMBER) await shot(page, "after-finish-390x844");
      await saved(page);
    }
  });

  test("a blocked wall is named on the Walls line with its reason in view: no Wall height (with the last-point note while tracing), overlapping openings", async ({ page }) => {
    await addWalls(page);
    // the worst case for room: no Wall height (its hint shows) and the "last point" note, yet Finish is in view
    await tapAt(page, A);
    await tapAt(page, B);
    await tapAt(page, B);
    await expect(page.getByText(/^That's the last point/)).toBeVisible();
    await expect(panel(page)).toContainText("No height yet.");
    const fin = await inSheetView(page, panel(page).getByRole("button", { name: "Finish" }));
    expect(fin.inside && fin.scrolled === 0, `Finish in view ${JSON.stringify(fin)}`).toBe(true);
    await shot(page, "tracing-no-height-banner-390x844");
    await panel(page).getByRole("button", { name: "Finish" }).click();
    await expect(wallsLine(page)).toHaveText("Walls: Wall 1 not counted");
    const why = panel(page).locator("[data-material-problems]");
    await expect(why).toHaveText("Wall 1: enter the Wall height.");
    let v = await inSheetView(page, why);
    expect(v.inside && v.scrolled === 0, `the reason in view ${JSON.stringify(v)}`).toBe(true);
    await saved(page);
    // overlapping windows on Wall 1 of a new L at 2,700: Wall 2 still reads, Wall 1 is named and its reason is in view
    // (one Undo brings the run back unfinished, as HUB 022 does; Discard drops it)
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await panel(page).getByRole("button", { name: "Discard" }).click();
    await expect(wallsLine(page)).toHaveText("");
    await setHeight(page, 2700);
    await traceL(page);
    await expect(wallsLine(page)).toHaveText(L_PLAIN);
    await addOpening(page, "window", [at(3000, 3000), at(4200, 3000)], { heightMm: 1200, sillMm: 900 });
    await addOpening(page, "window", [at(3600, 3000), at(4800, 3000)]);
    await expect(wallsLine(page)).toHaveText("Walls: 8 studs at 2,700 · bottom plate 4.00 m · top plate 4.00 m · 7 noggins (1 row) · Wall 1 not counted");
    await expect(why).toHaveText("Wall 1: Openings W1 and W2 overlap along the wall — frame them as one opening or with explicit members.");
    v = await inSheetView(page, why);
    expect(v.inside && v.scrolled === 0, `the reason in view ${JSON.stringify(v)}`).toBe(true);
    await expect(page.locator("[data-walls-details]")).toHaveText("Details: 3 to fix ›");   // the parts' needs only
    await shot(page, "walls-line-wall-not-counted-390x844");
    await saved(page);
  });

  test("screen 10: on a fresh walls seed, trace the L and set Stud centres to 450; loading it again brings back 450 and 25 studs", async ({ page }) => {
    const SEEDED = `${TIMBER}&takeoffSeed=walls`;
    await openMeasure(page, SEEDED);
    await expect(panel(page).locator("[data-line-material]")).toHaveText("Walls");
    await expect(heightField(page)).toHaveValue("");
    await setHeight(page, 2700);
    await traceL(page);
    await setCentres(page, 450);
    await expect(wallsLine(page)).toHaveText(L_450);
    await saved(page);
    await reloadTakeoff(page, SEEDED);
    const before = await page.evaluate(() => window.__takeoffViewerStats?.renders || 0);
    await page.getByRole("button", { name: /^Measure$/ }).click();
    await viewerReady(page, before);
    await expect(centresField(page)).toHaveValue("450");
    await expect(wallsLine(page)).toHaveText(L_450);
    await expect(heightField(page)).toHaveValue("2700");                        // its own walls' last height, after the reload too
    const s = await wallsState(page);
    expect([s.materials.map((m) => m.id), s.materials[0].rules, s.walls.length]).toEqual([["mat-walls"], { centresMm: 450, doubleTopPlate: false }, 2]);
  });

  test("screen 11: after a cladding wall at 2,745, Add walls starts with an empty Wall height (a cladding height never carries over); the cladding keeps its own", async ({ page }) => {
    await page.goto(`${TIMBER}&takeoffSeed=walls-after-cladding`);
    await ready(page);
    let before = await page.evaluate(() => window.__takeoffViewerStats?.renders || 0);
    await page.getByRole("button", { name: /^Measure$/ }).click();
    await viewerReady(page, before);
    await expect(panel(page).locator("[data-line-material]")).toHaveText("Axon 400 smooth");
    await expect(heightField(page)).toHaveValue("2745");                        // HUB 022: cladding's start is unchanged
    await reloadTakeoff(page, `${TIMBER}&takeoffSeed=walls-after-cladding`);
    before = await page.evaluate(() => window.__takeoffViewerStats?.renders || 0);
    await page.locator('[data-material-group="timber"]').getByRole("button", { name: "Add walls" }).click();
    await viewerReady(page, before);
    await expect(panel(page).locator("[data-line-material]")).toHaveText("Walls");
    await expect(heightField(page)).toHaveValue("");
    await expect(panel(page)).toContainText("No height yet. Type it first, or each wall will need one.");
  });

  test("Add walls with no plan on the takeoff: one Walls item and its Walls list, with Wall by numbers and no Trace on plan (SOP 20-08 Section 5D step 1)", async ({ page }) => {
    await page.goto(`${TIMBER}&takeoffSeed=no-plan`);
    await ready(page);
    await page.locator('[data-material-group="timber"]').getByRole("button", { name: "Add walls" }).click();
    const list = page.locator('section[aria-label="Walls"]');
    await expect(list).toBeVisible();
    await expect(list.getByRole("button", { name: "Wall by numbers" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Trace on plan" })).toHaveCount(0);   // onTrace is null with no plan
    await expect(page.locator("[data-line-panel]")).toHaveCount(0);
    await expect.poll(async () => (await wallsState(page)).materials.map((m) => m.name)).toEqual(["Walls"]);
    // the SOP says what the screen does (it used to say the list opens "with Trace on plan")
    const sop = readFileSync(new URL("../../docs/sops/20_takeoff/20-08_timber_takeoff.md", import.meta.url), "utf8");
    const step1 = sop.split("\n").find((l) => l.startsWith("1. On the takeoff overview, in the **Timber** part, tap **Add walls**"));
    expect(step1).toContain("If the takeoff has no plan yet, the Walls list opens instead. Add the walls there with **Wall by numbers**");
    expect(step1).not.toMatch(/Walls list opens with \*\*Trace on plan\*\*/);
  });

  test("screen 12-13 and Measure with…: Add walls is first in the Timber group and in Measure with…; a Walls row has no Add lengths and no Save as standard; Done goes back to the overview; Studs still opens the Wall tool", async ({ page }) => {
    // a Studs item on the mixed job (seeded through the fake server's own commit before the takeoff opens)
    const studs = { id: "mat-studs", name: "Studs 90 × 45", methodKey: "wall_frame", methodVersion: 1, rules: { centresMm: 600 }, profile: null,
      spec: { family: "timber", purpose: "studs", section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", stock: { kind: "grid", minMm: 1200, incrementMm: 300 } } };
    await page.goto("/carpentry/cjb-1?reviewRole=admin&takeoffSeed=mixed");
    await ready(page);
    expect((await commit(page, { materials: { upsert: [studs] } }, "hub028-s4-studs")).status).toBe(200);
    await page.evaluate((u) => { history.pushState({}, "", u); dispatchEvent(new PopStateEvent("popstate")); }, `${TIMBER}&takeoffSeed=mixed`);
    await ready(page);
    await expect(page.locator('[data-material-group="timber"] > div button')).toHaveText(["Add walls", "Add timber"]);
    // Measure with…: Add walls first; it makes the Walls item and comes straight back to the plan with it
    let before = await page.evaluate(() => window.__takeoffViewerStats?.renders || 0);
    await page.getByRole("button", { name: /^Measure$/ }).click();
    await viewerReady(page, before);
    await page.getByRole("button", { name: /^Material:/ }).click();
    const win = page.locator("[data-takeoff-focus]");
    await expect(win.locator(".grid button")).toHaveText(["Add walls", "Add timber", "Add cladding", "Add aluminium"]);
    before = await page.evaluate(() => window.__takeoffViewerStats?.renders || 0);
    await win.getByRole("button", { name: "Add walls" }).click();
    await viewerReady(page, before);
    await expect(page.getByRole("radio", { name: "Line", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(panel(page).locator("[data-line-material]")).toHaveText("Walls");
    await expect(heightField(page)).toHaveValue("");                            // the mixed job's walls are other materials'
    // 13 (+ Done): back to the overview, never the walls list
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Timber and cladding" })).toBeVisible();
    // 12. the Walls row: Setup, Walls and More › Remove only
    const row = page.locator("[data-material-row]").filter({ hasText: /^Walls/ });
    const t = row.locator("button[aria-expanded]").first();
    if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
    await expect(row.getByRole("button", { name: "Setup", exact: true })).toBeVisible();
    await expect(row.getByRole("button", { name: "Walls", exact: true })).toBeVisible();
    await expect(row.getByRole("button", { name: "Add lengths" })).toHaveCount(0);
    await row.getByRole("button", { name: "More", exact: true }).click();
    await expect(row.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
    await expect(row.getByRole("button", { name: "Save as standard" })).toHaveCount(0);
    // the other timber rows keep theirs
    const raf = page.locator("[data-material-row]").filter({ hasText: "Rafters 90 × 45" });
    await raf.locator("button[aria-expanded]").first().click();
    await expect(raf.getByRole("button", { name: "Add lengths" })).toBeVisible();
    await raf.getByRole("button", { name: "More", exact: true }).click();
    await expect(raf.getByRole("button", { name: "Save as standard" })).toBeVisible();
    // 13. Studs still opens the Wall tool
    before = await page.evaluate(() => window.__takeoffViewerStats?.renders || 0);
    await page.getByRole("button", { name: /^Measure$/ }).click();
    await viewerReady(page, before);
    before = await page.evaluate(() => window.__takeoffViewerStats?.renders || 0);
    await page.getByRole("button", { name: /^Material:/ }).click();
    await page.getByRole("button", { name: "Studs 90 × 45", exact: true }).click();
    await viewerReady(page, before);
    await expect(page.getByRole("radio", { name: "Wall", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("radio", { name: "Line", exact: true })).toHaveCount(0);
    await expect(page.locator("[data-walls-rules], [data-walls-summary]")).toHaveCount(0);
  });
});

// ══ Step 5: the Walls card and the wall pages ════════════════════════════════════════════════════════════════════

const MIXED = "Walls: 27 studs (21 at 2,700, 6 at 2,800) · bottom plate 13.00 m · top plate 2 × 13.00 m · 23 noggins (1–2 rows)";
const card = (page) => page.locator('[data-setup="walls"]');
const part = (page, k) => card(page).locator(`[data-wall-part="${k}"]`);
const fold = (page) => card(page).locator("[data-walls-parts]");
const isOpen = (loc) => loc.evaluate((el) => el.open);
/** A typed field on the card: type, then Enter (one change, one Undo step). */
async function enter(loc, v) { await loc.fill(String(v)); await loc.press("Enter"); }
/** Review walls (the Line panel or the run card) → the first wall of the item. */
async function reviewWalls(page) {
  await page.locator("[data-review-walls]").first().click();
  await expect(page.locator("[data-wall-nav]")).toBeVisible();
}
const wallPage = (page) => ({
  title: page.locator("[data-takeoff-focus] h1, [data-takeoff-focus] h2").first(),
  line: page.locator("[data-wall-framing] [data-wall-line-text]"),
  notes: page.locator("[data-wall-framing] [data-wall-line-notes] li"),
  studs: page.locator('[data-wall-elevation] [data-el-state="full"]'),
  removed: page.locator('[data-wall-elevation] [data-el-state="removed"]'),
});
const nextWall = (page) => page.locator("[data-wall-nav]").getByRole("button", { name: "Next wall ›" }).click();
/** The Walls item's parts as the (fake) server holds them: section, grade, treatment, supplier, code, longest length. */
const partsBrief = async (page) => Object.fromEntries(Object.entries((await wallsState(page)).materials[0].spec.components)
  .map(([k, p]) => [k, [p.section.depthMm, p.section.widthMm, p.grade, p.treatment, p.supplierName, p.productCode, p.stock.maxMm]]));

test.describe("HUB 028 step 5: the Walls card and the wall pages — phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("screen 7: reload brings back the same walls, settings and line; each wall page leads with its own Walls line and notes, side studs drawn as full studs; an opening's sheet takes a framing detail", async ({ page }) => {
    const SEEDED = `${TIMBER}&takeoffSeed=walls`;
    await openMeasure(page, SEEDED);
    await setHeight(page, 2700);
    await traceL(page);
    await addOpening(page, "door", D1_ENDS, { heightMm: 2040 });
    await addOpening(page, "window", W1_ENDS, { heightMm: 1200, sillMm: 900 });
    await doubleTop(page).check();
    await setHeight(page, 2800);
    await tapAt(page, at(2000, 5000));
    await tapAt(page, at(5000, 5000), 2);
    await expect(wallsLine(page)).toHaveText(MIXED);
    await saved(page);
    const before = await wallsState(page);
    // 7. reload: the same walls (points, heights, runs), openings, settings and line
    await reloadTakeoff(page, SEEDED);
    const n = await page.evaluate(() => window.__takeoffViewerStats?.renders || 0);
    await page.getByRole("button", { name: /^Measure$/ }).click();
    await viewerReady(page, n);
    await expect(wallsLine(page)).toHaveText(MIXED);
    await expect(centresField(page)).toHaveValue("600");
    await expect(doubleTop(page)).toBeChecked();
    await expect(heightField(page)).toHaveValue("2800");
    expect(await wallsState(page)).toEqual(before);
    expect(before.walls.map((w) => [w.inputs.name, w.inputs.heightMm, w.inputs.seq])).toEqual([["Wall 1", 2700, 1], ["Wall 2", 2700, 2], ["Wall 3", 2800, 1]]);
    // each wall page leads with its own line (the same figures the plan line adds up) and its own notes
    await reviewWalls(page);
    const w = wallPage(page);
    await expect(page.getByRole("heading", { name: "Wall 1", exact: true })).toBeVisible();
    await expect(w.line).toHaveText("13 studs at 2,700 · bottom plate 6.00 m · top plate 2 × 6.00 m · 9 noggins (1 row)");
    await expect(w.notes).toHaveText(["Lintels, jacks and trimmers at D1 aren't counted."]);
    // the parts' needs are ONE banner naming the parts ("Details: 3 to fix" counts the same 3), with one Setup; never
    // "Walls: Studs: …" once per need
    const problems = page.locator("[data-wall-problems]");
    await expect(problems.getByRole("alert")).toHaveCount(1);
    await expect(problems.getByRole("alert")).toContainText("Walls: 3 parts need setup (studs, plates and noggins).");
    await expect(problems.getByRole("button", { name: "Set up Walls" })).toHaveCount(1);
    await expect(problems).not.toContainText("Studs:");
    // the live result by the wall fields reads the framing line, never the parts added up as "pieces"
    await expect(page.locator("[data-wall-result]")).toContainText("· Walls: 13 studs at 2,700 · bottom plate 6.00 m · top plate 2 × 6.00 m · 9 noggins (1 row)");
    await expect(page.locator("[data-wall-result]")).not.toContainText("pieces");
    // the drawing: 13 full studs (the 4 beside D1 drawn like the rest), the 2 inside D1 removed
    await expect(w.studs).toHaveCount(13);
    await expect(w.removed).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no sideways scroll").toBe(true);
    await shot(page, "wall-page-wall1-390x844");
    // the item's lintels note isn't said again (for both walls) under More
    await page.locator("[data-wall-more] > summary").click();
    await expect(page.locator("[data-wall-more]")).toContainText("Setout aid");
    await expect(page.locator("[data-wall-more]")).not.toContainText("D1, W1");
    // … and never the Studs item's "base studs only; opening framing incomplete" (Walls says it in its one plain line)
    await expect(page.locator("[data-wall-more]")).not.toContainText("opening framing incomplete");
    await expect(page.locator("[data-wall-more]")).not.toContainText("base studs");
    // an opening's sheet keeps its framing detail on a Walls wall (studEntry matches wall_framing)
    await page.locator("[data-opening-row]").filter({ hasText: "D1" }).getByRole("button").click();
    const detail = page.locator("[data-framing-detail]");
    await expect(detail.getByRole("heading", { name: "Framing detail — Walls" })).toBeVisible();
    // no detail on a Walls opening is not a fault: the sheet says what isn't counted, plainly (no "Base studs only")
    await expect(detail.locator("[data-framing-state]")).toHaveAttribute("data-framing-state", "not-counted");
    await expect(detail.locator("[data-framing-state]")).toHaveText("Lintels, jacks and trimmers at D1 aren't counted.");
    await expect(detail).not.toContainText("Base studs only");
    await page.getByRole("button", { name: "Close panel" }).click();
    await nextWall(page);
    await expect(page.getByRole("heading", { name: "Wall 2", exact: true })).toBeVisible();
    await expect(w.line).toHaveText("8 studs at 2,700 · bottom plate 4.00 m · top plate 2 × 4.00 m · 4 noggins (1 row)");
    await expect(w.notes).toHaveText(["Lintels, jacks and trimmers at W1 aren't counted."]);
    await expect(w.studs).toHaveCount(8);
    await expect(w.removed).toHaveCount(2);
    // 6. the 2,800 wall's own page shows its 2 rows
    await nextWall(page);
    await expect(page.getByRole("heading", { name: "Wall 3", exact: true })).toBeVisible();
    await expect(w.line).toHaveText("6 studs at 2,800 · bottom plate 3.00 m · top plate 2 × 3.00 m · 10 noggins (2 rows)");
    await expect(w.notes).toHaveCount(0);
    // the banner's one Setup opens the Walls card, which lists the needs themselves
    await page.locator("[data-wall-problems]").getByRole("button", { name: "Set up Walls" }).click();
    await expectWallsCard(page);
  });

  test("the Walls card: needs and the lintels note at the top; Stud centres, Double top plate and its line; the closed fold edits each part (one Undo each, a pick never shows on another part); a 9,000 wall's page says its plates are LVL", async ({ page }) => {
    await openMeasure(page, `${TIMBER}&takeoffSeed=walls`);
    await setHeight(page, 2700);
    await traceL(page);
    await addOpening(page, "door", D1_ENDS, { heightMm: 2040 });
    await addOpening(page, "window", W1_ENDS, { heightMm: 1200, sillMm: 900 });
    await expect(wallsLine(page)).toHaveText(L_OPENINGS);
    // the built-in parts can't be ordered yet: the Status fold says so
    await panel(page).locator("summary", { hasText: "Status" }).click();
    await expect(panel(page).locator("[data-statuses]")).toContainText("needs product setup");
    await page.locator("[data-walls-details]").click();
    await expectWallsCard(page);
    // the needs, naming each part (the built-in plates and noggins rows carry no grade), then the notes, lintels first
    await expect(card(page).locator("[data-needs] li")).toHaveText(['Studs: enter the treatment (or "untreated").', "Plates: enter the grade or species.", 'Plates: enter the treatment (or "untreated").',
      "Noggins: enter the grade or species.", 'Noggins: enter the treatment (or "untreated").']);
    await expect(card(page).locator("[data-walls-notes] li")).toHaveText(["Lintels, jacks and trimmers at D1, W1 aren't counted.", "Studs: the longest length isn't set. Confirm it before ordering."]);
    await expect(card(page).getByLabel("Stud centres")).toHaveValue("600");
    await expect(card(page).getByRole("checkbox", { name: "Double top plate" })).not.toBeChecked();
    await expect(card(page).locator("[data-walls-card-line]")).toHaveText(L_OPENINGS);
    // no Purpose chips, offsets, plies, spares or Save as company product
    for (const label of ["Plies", "Start offset", "Spare %", "Spares"]) await expect(card(page).getByLabel(label)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /company product|Save as standard/i })).toHaveCount(0);
    // Details shows the fold closed
    expect(await isOpen(fold(page))).toBe(false);
    await expect(part(page, "studs")).toBeHidden();
    await saved(page);
    await shot(page, "walls-card-390x844");
    await fold(page).locator("summary").click();
    expect(await isOpen(fold(page))).toBe(true);
    await expect(fold(page).locator("legend")).toHaveText(["Studs", "Plates", "Long plates (over 6.0 m)", "Noggins"]);
    const sizes = (k) => part(page, k).getByLabel("Size and grade");
    await expect(sizes("studs")).toHaveValue("studs-90x45-mgp10");
    await expect(sizes("plates")).toHaveValue("plates-90x45");
    await expect(sizes("longPlates")).toHaveValue("longPlates-90x45-lvl");
    await expect(sizes("noggins")).toHaveValue("noggins-90x35");
    await expect(sizes("longPlates").locator("option:checked")).toHaveText("90 × 45 LVL");
    const longest = (k) => part(page, k).getByLabel("Longest length");
    expect(await Promise.all(["studs", "plates", "longPlates", "noggins"].map((k) => longest(k).inputValue()))).toEqual(["", "6000", "11000", "6000"]);
    // a typed treatment: one change, one Undo step
    await enter(part(page, "studs").getByLabel("Treatment (e.g. H3)"), "H2");
    await expect.poll(async () => (await partsBrief(page)).studs[3]).toBe("H2");
    await expect(card(page).locator("[data-needs]")).not.toContainText("Studs:");
    await card(page).getByRole("button", { name: "Undo" }).click();
    await expect.poll(async () => (await partsBrief(page)).studs[3]).toBe(null);
    await expect(card(page).locator("[data-needs]")).toContainText('Studs: enter the treatment (or "untreated").');
    await card(page).getByRole("button", { name: "Redo" }).click();
    await expect.poll(async () => (await partsBrief(page)).studs[3]).toBe("H2");
    // a pick on one part changes only that part, and its list shows the row picked (the others keep theirs)
    await sizes("studs").selectOption({ label: "120 × 45 MGP10" });
    await expect.poll(async () => (await partsBrief(page)).studs).toEqual([120, 45, "MGP10", "H2", null, null, null]);
    await expect(sizes("studs")).toHaveValue("studs-120x45-mgp10");
    await expect(sizes("plates")).toHaveValue("plates-90x45");
    await card(page).getByRole("button", { name: "Undo" }).click();
    await expect.poll(async () => (await partsBrief(page)).studs).toEqual([90, 45, "MGP10", "H2", null, null, null]);
    await expect(sizes("studs")).toHaveValue("studs-90x45-mgp10");
    // grade and treatment on plates and noggins: nothing left to fix
    for (const k of ["plates", "noggins"]) {
      await enter(part(page, k).getByLabel("Grade (e.g. MGP10)"), "MGP10");
      await enter(part(page, k).getByLabel("Treatment (e.g. H3)"), "H2");
    }
    await expect(card(page).locator("[data-needs]")).toHaveCount(0);
    await expect.poll(async () => partsBrief(page)).toEqual({ studs: [90, 45, "MGP10", "H2", null, null, null], plates: [90, 45, "MGP10", "H2", null, null, 6000],
      longPlates: [90, 45, "LVL", null, null, null, 11000], noggins: [90, 35, "MGP10", "H2", null, null, 6000] });
    // the noggins' longest length cleared: each noggin buys its own length, said in one plain note
    await enter(longest("noggins"), "");
    await expect(card(page).locator("[data-walls-notes]")).toContainText("Noggins: each is cut from its own 1,200 length. Set the noggins' longest length under Details to share lengths across walls.");
    await card(page).getByRole("button", { name: "Undo" }).click();
    await expect(longest("noggins")).toHaveValue("6000");
    await expect(card(page).locator("[data-walls-notes]")).not.toContainText("Noggins:");
    // Double top plate on the card: only the top plate changes
    await card(page).getByRole("checkbox", { name: "Double top plate" }).check();
    await expect(card(page).locator("[data-walls-card-line]")).toHaveText(L_DOUBLE);
    // at 390 × 844 with the fold open: no sideways scroll, every control at least 44 px
    const m = await page.evaluate(() => {
      const small = [];
      const el = document.querySelector('[data-setup="walls"]');
      for (const c of el.querySelectorAll("button, input:not([type=checkbox]), select, summary, label[data-walls-card-double]")) {
        const b = c.getBoundingClientRect();
        if (b.width && b.height && b.height < 43.5) small.push(`${c.tagName} ${(c.textContent || c.getAttribute("aria-label") || "").trim().slice(0, 30)} ${b.height}`);
      }
      const sc = el.closest(".overflow-y-auto");
      return { doc: document.documentElement.scrollWidth, sc: sc ? sc.scrollWidth - sc.clientWidth : 0, small };
    });
    expect(m.doc).toBeLessThanOrEqual(390);
    expect(m.sc).toBeLessThanOrEqual(0);
    expect(m.small).toEqual([]);
    await saved(page);
    await shot(page, "walls-card-fold-open-390x844");
    // Close comes back to the plan: nothing to fix, the line as the card left it
    const back = await page.evaluate(() => window.__takeoffViewerStats?.renders || 0);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await viewerReady(page, back);
    await expect(page.locator("[data-walls-details]")).toHaveText("Details ›");
    await expect(wallsLine(page)).toHaveText(L_DOUBLE);
    await expect(doubleTop(page)).toBeChecked();
    // round 3: a 9,000 wall (its own run). Its plates are one 90 × 45 LVL length each, so Long plates now need a treatment
    await tapAt(page, at(2000, 7600));
    await tapAt(page, at(11000, 7600), 2);
    await expect(page.locator("[data-walls-details]")).toHaveText("Details: 1 to fix ›");
    await saved(page);
    await page.locator("[data-run-card]").getByRole("button", { name: "Review walls" }).click();
    await nextWall(page);
    await nextWall(page);
    await expect(page.getByRole("heading", { name: "Wall 3", exact: true })).toBeVisible();
    await expect(wallPage(page).notes).toHaveText(["Plates: 90 × 45 LVL (over 6.0 m)"]);
    await expect(page.locator("[data-wall-problems]").getByRole("alert")).toHaveCount(1);
    await expect(page.locator("[data-wall-problems]").getByRole("alert")).toContainText("Walls: 1 part needs setup (long plates).");
    await expect(wallPage(page).line).toHaveText("16 studs at 2,700 · bottom plate 9.00 m · top plate 2 × 9.00 m · 15 noggins (1 row)");
  });

  test("screen 8: on walls-products the saved products fill every part (the noggins' longest length too): no needs, no share or longest-length note; Details shows the fold closed with each part's product", async ({ page }) => {
    await addWalls(page, `${TIMBER}&takeoffSeed=walls-products`);
    await expect(page.locator("[data-walls-details]")).toHaveText("Details ›");
    // each part exactly as its product is saved, its longest length too (noggins 5,400, not the 6,000 default)
    expect(await partsBrief(page)).toEqual({
      studs: [90, 45, "MGP10", "H2", "Yard A", "ST-9045", 6000], plates: [90, 45, "MGP10", "H2", "Yard A", "PL-9045", 6000],
      longPlates: [90, 45, "LVL", "H2", "Yard B", "LVL-9045", 11000], noggins: [90, 35, "MGP10", "H2", "Yard A", "NG-9035", 5400],
    });
    await setHeight(page, 2700);
    await traceL(page);
    await addOpening(page, "door", D1_ENDS, { heightMm: 2040 });
    await addOpening(page, "window", W1_ENDS, { heightMm: 1200, sillMm: 900 });
    await expect(wallsLine(page)).toHaveText(L_OPENINGS);
    await expect(page.locator("[data-walls-details]")).toHaveText("Details ›");
    await panel(page).locator("summary", { hasText: "Status" }).click();
    await expect(panel(page).locator("[data-statuses]")).not.toContainText("needs product setup");
    await saved(page);
    await page.locator("[data-walls-details]").click();
    await expect(card(page)).toBeVisible();
    await expect(card(page).locator("[data-needs]")).toHaveCount(0);
    // only the lintels note: no "missing product", no share note, no "longest length isn't set"
    await expect(card(page).locator("[data-walls-notes] li")).toHaveText(["Lintels, jacks and trimmers at D1, W1 aren't counted."]);
    expect(await isOpen(fold(page))).toBe(false);
    await fold(page).locator("summary").click();
    const ids = { studs: "pre-wf-studs", plates: "pre-wf-plates", longPlates: "pre-wf-lvl", noggins: "pre-wf-noggins" };
    for (const [k, id] of Object.entries(ids)) await expect(part(page, k).getByLabel("Size and grade"), k).toHaveValue(id);
    await expect(part(page, "longPlates").getByLabel("Size and grade").locator("option:checked")).toHaveText("LVL plates 90 × 45 — 90 × 45 · LVL · H2");
    // the LVL product is offered for Long plates only, the pine plate for Plates only
    await expect(part(page, "plates").locator('option[data-company-product="pre-wf-lvl"]')).toHaveCount(0);
    await expect(part(page, "longPlates").locator('option[data-company-product="pre-wf-plates"]')).toHaveCount(0);
    await expect(part(page, "noggins").getByLabel("Longest length")).toHaveValue("5400");
    await expect(card(page).locator("[data-wall-part-not-stocked]")).toHaveCount(0);
    await shot(page, "walls-products-card-390x844");
  });

  test("the Walls card's Needs are the parts' only (what Details › counts); why a wall isn't counted sits under its Walls line, as on the Line panel", async ({ page }) => {
    await addWalls(page, `${TIMBER}&takeoffSeed=walls-products`);
    // a wall with no Wall height: not counted, and Details › stays plain (nothing to fix on the parts)
    await tapAt(page, A);
    await tapAt(page, B, 2);
    await expect(wallsLine(page)).toHaveText("Walls: Wall 1 not counted");
    await expect(page.locator("[data-walls-details]")).toHaveText("Details ›");
    await saved(page);
    await page.locator("[data-walls-details]").click();
    await expect(card(page)).toBeVisible();
    await expect(card(page).locator("[data-needs]")).toHaveCount(0);
    await expect(card(page).locator("[data-walls-card-line]")).toHaveText("Walls: Wall 1 not counted");
    await expect(card(page).locator("[data-walls-card-problems] li")).toHaveText(["Wall 1: enter the Wall height."]);
  });

  test("the fold: a saved product's not-stocked lengths show under its Longest length (so Long plates (over 5.7 m) reads true); Long plates read plain when no plate can be LVL; a 0 is refused at the field", async ({ page }) => {
    await page.goto("/carpentry/cjb-1?reviewRole=admin");
    await ready(page);
    // a Walls item whose plates came from a product with 6,000 marked not stocked (seeded through the fake server's commit)
    const spec = wallFramingDefaults([]);
    const walls = { id: "mat-walls", name: "Walls", methodKey: "wall_framing", methodVersion: 1, profile: null, rules: { centresMm: 600, doubleTopPlate: false },
      spec: { ...spec, components: { ...spec.components, plates: { ...spec.components.plates, stock: { maxMm: 6000, unavailableMm: [6000] } } } } };
    expect((await commit(page, { materials: { upsert: [walls] } }, "hub028-s5-not-stocked")).status).toBe(200);
    await page.evaluate((u) => { history.pushState({}, "", u); dispatchEvent(new PopStateEvent("popstate")); }, TIMBER);
    await ready(page);
    const row = page.locator("[data-material-row]").filter({ hasText: /^Walls/ });
    const t = row.locator("button[aria-expanded]").first();
    if ((await t.getAttribute("aria-expanded")) !== "true") await t.click();
    await row.getByRole("button", { name: "Setup", exact: true }).click();
    await expect(card(page)).toBeVisible();
    await fold(page).locator("summary").click();
    await expect(fold(page).locator("legend")).toHaveText(["Studs", "Plates", "Long plates (over 5.7 m)", "Noggins"]);
    await expect(part(page, "plates").getByLabel("Longest length")).toHaveValue("6000");
    await expect(part(page, "plates").locator("[data-wall-part-not-stocked]")).toHaveText("Not stocked: 6,000 mm");
    await expect(card(page).locator("[data-wall-part-not-stocked]")).toHaveCount(1);
    // the longest lengths carry no help text that could contradict the card's note ("Studs: … Confirm it before ordering.")
    await expect(fold(page)).not.toContainText("Optional");
    // Plates' longest past the Long plates' 11,000: no plate can be LVL, so no "over" figure; one Undo brings it back
    await enter(part(page, "plates").getByLabel("Longest length"), 12000);
    await expect(fold(page).locator("legend")).toHaveText(["Studs", "Plates", "Long plates", "Noggins"]);
    await card(page).getByRole("button", { name: "Undo" }).click();
    await expect(fold(page).locator("legend").nth(2)).toHaveText("Long plates (over 5.7 m)");
    // a 0 (or a length the server can't keep) is refused at the field, with its reason there; the item keeps its values
    await enter(part(page, "studs").getByLabel("Section depth"), 0);
    await expect(part(page, "studs").getByRole("alert")).toHaveText("Enter a number greater than 0.");
    await enter(part(page, "noggins").getByLabel("Longest length"), 0);
    await expect(part(page, "noggins").getByRole("alert")).toHaveText("Enter a number greater than 0.");
    await enter(part(page, "plates").getByLabel("Longest length"), 2000000);
    await expect(part(page, "plates").getByRole("alert")).toHaveText("That's more than 1,000,000 mm — check the number.");
    await saved(page);
    const b = await partsBrief(page);
    expect([b.studs[0], b.noggins[6], b.plates[6]]).toEqual([90, 6000, 6000]);
    await expect(card(page).locator('[role="alert"]').filter({ hasText: "must be a positive number" })).toHaveCount(0);
  });
});
