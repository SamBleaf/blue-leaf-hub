// @ts-check
// TC-R04 walls — wall list, wall-by-numbers, openings, generated elevation (Cladding | Supports | Accessories)
// in UI Review Mode (SYNTHETIC fixtures, the REAL shared/takeoff engine via computeWorkspace).
//   UI_REVIEW_PORT=5192 npx playwright test --config=playwright.ui-review.config.js e2e/ui-review/tc-walls.spec.js
// Phone viewport (390 × 844, touch). Evidence screenshots → docs/takeoff/evidence/ui/tc-walls-*.png
import { test, expect, webkit, devices } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { productGroups, specFromGroup } from "../../shared/takeoff/products/index.js";
import { methodFor } from "../../shared/takeoff/index.js";

const SHOTS = "docs/takeoff/evidence/ui";
mkdirSync(SHOTS, { recursive: true });

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.getAttribute("data-ui-review-ready") === "true", null, { timeout: 30_000 }).catch(() => {});
}

// Job materials are seeded through the fake server's OWN commit endpoint (the same path the app saves through),
// so these journeys don't depend on another screen's setup form. Specs come from the real catalogue/method code.
const axonGroup = productGroups({ family: "cladding" }).find((g) => g.name === "Axon 400 smooth");
const axonSpec = specFromGroup(axonGroup);
const studSpec = { family: "timber", purpose: "studs", section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", stock: { kind: "grid", minMm: 1200, incrementMm: 600 } };
const group = (family, name, widthMm) => productGroups({ family }).find((g) => g.name === name && (widthMm == null || g.widthMm === widthMm));
const mat = (id, name, spec, rules = {}) => ({ id, name, methodKey: methodFor(spec).key, methodVersion: methodFor(spec).version, spec, rules, profile: null });
const MATERIALS = {
  axon: mat("mat-axon", "Axon 400 smooth", axonSpec),
  studs: mat("mat-studs", "Studs 90 × 45", studSpec, { centresMm: 600 }),
  linea: mat("mat-linea", "Linea 150", specFromGroup(group("cladding", "Linea", 150))),
  matrix: mat("mat-matrix", "Matrix 1190", specFromGroup(group("cladding", "Matrix", 1190))),
  // adhesive joint: synthetic test value — the real one comes from the system document (never defaulted)
  walsc: mat("mat-walsc", "Walsc EWS 50", specFromGroup(group("aac", "External Wall System 50")), { adhesiveJointMm: 2 }),
  batten: mat("mat-batten", "Cavity batten 70 × 19", { family: "batten", orientation: "vertical", product: { name: "Cavity batten 70 × 19", widthMm: 70, thicknessMm: 19, effectiveCoverMm: 70, lengthMm: 3000, lengthsMm: [3000] } }, { maxSpacingMm: 600 }),
  pine: mat("mat-pine", "Pine shiplap (random)", { family: "timber-cladding", layout: "course", orientation: "horizontal", supply: "random", orderIncrementM: 0.3, product: { name: "Pine shiplap", widthMm: 140, thicknessMm: 19, effectiveCoverMm: 120 } }),
  // scope per group exactly as FamilySetup's accessory card stores it (no recipe yet → nothing calculated)
  acc: mat("mat-acc", "Axon accessories", { family: "accessory", product: { name: "Hardie external corner" } }, { scope: { starter: "include", corners: "by-others", tape: "exclude" } }),
};
const PLAN_K = JSON.parse(readFileSync("src/ui-review/fixtures/takeoff/synthetic-plan-set.json", "utf8")).pages[0].pdfUnitsPerMm;
const planPt = (x, y) => ({ x: 120 + x * PLAN_K, y: 150 + y * PLAN_K }); // the review plan's origin (fixtures/takeoff.js bx, by)

/**
 * Seed a job material (+ optional walls) into the review takeoff, open the takeoff, then
 * overview → the material's Setup → its Walls / Measure members button (TakeoffApp) → WallsScreen.
 */
async function openWalls(page, key = "axon", { walls = [], also = [], extraMaterials = [], extraMeasurements = [], extraContributions = [] } = {}) {
  const m0 = MATERIALS[key];
  const mats = [m0, ...also.map((k) => MATERIALS[k]), ...extraMaterials];
  await page.goto("/carpentry/cjb-1?reviewRole=admin");
  await ready(page);
  const measurements = [...walls.map((w, i) => ({ id: `seed-wall-${i + 1}`, kind: "wall", documentId: null, pageIndex: null, calibrationId: null, points: null, parentId: null, label: null,
    inputs: { kind: "rect", widthMm: w.length, heightMm: w.height, name: w.name } })), ...extraMeasurements];
  const contributions = [...mats.flatMap((mt) => measurements.filter((m) => m.kind === "wall" && m.id.startsWith("seed-wall-")).map((m, i) => ({ id: `seed-con-${mt.id}-${i + 1}`, measurementId: m.id, jobMaterialId: mt.id, role: "wall" }))),
    ...extraContributions];
  const res = await page.evaluate(async (changes) => {
    const ws = await (await fetch("/api/takeoff/workspaces/ws-1")).json();
    const r = await fetch("/api/takeoff/workspaces/ws-1/commit", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision: ws.snapshot.workspace.revision, idempotencyKey: "tc-walls-seed", changes }) });
    return r.json();
  }, { calibrations: { insert: [] }, materials: { upsert: mats, archive: [] }, measurements: { upsert: measurements, archive: [] }, contributions: { upsert: contributions, archive: [] } });
  expect(res.ok, JSON.stringify(res)).toBe(true);
  await page.evaluate(() => { window.history.pushState({}, "", "/carpentry/cjb-1/takeoff?reviewRole=admin"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await ready(page);
  const row = page.getByRole("listitem").filter({ hasText: m0.name });
  await row.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("button", { name: key === "studs" ? "Measure members" : "Walls", exact: true }).click();
  await expect(page.getByRole("dialog", { name: m0.name })).toBeVisible();
  await expect(page.getByRole("region", { name: "Walls" })).toBeVisible();
}

/** List → Wall by numbers → (editor) height. */
async function addWall(page, { name, length, height }) {
  await page.getByRole("button", { name: "Wall by numbers" }).click();
  const sheet = page.getByRole("region", { name: "Wall by numbers" });
  if (name) await sheet.getByLabel("Wall name").fill(name);
  await sheet.getByLabel("Wall length").fill(String(length));
  await sheet.getByLabel("Wall length").press("Enter");
  const h = page.getByLabel("Wall height");
  await expect(h).toBeFocused(); // the editor opens with the missing height ready to type
  if (height != null) { await h.fill(String(height)); await h.press("Enter"); }
}

const elevation = (page) => page.locator("[data-wall-elevation]");
/** The device-recovery write is asynchronous (IndexedDB): wait until it holds an unsynced edit before reloading. */
async function recoveryWritten(page) {
  await expect.poll(() => page.evaluate(() => new Promise((res) => {
    const req = indexedDB.open("blh-takeoff-recovery");
    req.onsuccess = () => { try { const t = req.result.transaction("drafts", "readonly").objectStore("drafts").count(); t.onsuccess = () => res(t.result); t.onerror = () => res(0); } catch { res(0); } };
    req.onerror = () => res(0);
  }))).toBeGreaterThan(0);
}

const cells = (page, state) => page.locator(`[data-wall-elevation] [data-el-kind="rect"]${state ? `[data-el-state="${state}"]` : ""}`);

/** Click the centre of an SVG element's bounding box. */
async function clickBox(page, locator, dx = 0, dy = 0) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no box");
  await page.mouse.click(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy);
}

/** Add an opening: tap its approximate position on the elevation, then type width and height. */
async function addOpeningByTap(page, { fx, fy, width, height }) {
  await page.getByRole("button", { name: "Add opening" }).click();
  await expect(page.getByText("Tap the elevation where the opening is")).toBeVisible();
  await page.waitForTimeout(150); // the drawing scrolls into view first
  const box = await elevation(page).boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  const sheet = page.getByRole("region", { name: "New opening" });
  await expect(sheet.getByLabel("Width")).toBeFocused();
  await sheet.getByLabel("Width").fill(String(width));
  await sheet.getByLabel("Width").press("Enter");
  await sheet.getByLabel("Height", { exact: true }).fill(String(height));
  await sheet.getByLabel("Height", { exact: true }).press("Enter");
  await expect(page.getByRole("region", { name: /^Opening W/ })).toBeVisible();
}

async function noHorizontalScroll(page) {
  const r = await page.evaluate(() => {
    const focus = document.querySelector("[data-takeoff-focus]");
    const scrollers = [...(focus?.querySelectorAll(".overflow-y-auto") || [])];
    return { doc: document.documentElement.scrollWidth, vw: window.innerWidth, focus: focus ? focus.scrollWidth - focus.clientWidth : 0, inner: scrollers.map((s) => s.scrollWidth - s.clientWidth) };
  });
  expect(r.doc).toBeLessThanOrEqual(r.vw);
  expect(r.focus).toBeLessThanOrEqual(0);
  for (const d of r.inner) expect(d).toBeLessThanOrEqual(0);
}

test.describe("TC walls — phone journeys", () => {
  test("wall by numbers → generated elevation with sheet cells, areas and per-wall quantities", async ({ page }) => {
    await openWalls(page, "axon");
    // material status: three statuses + Setup, with no wall yet
    const status = page.getByRole("region", { name: "Material status" });
    await expect(status.locator('[data-status="quantity"]')).toBeVisible();
    await expect(status.locator('[data-status="installation"]')).toBeVisible();
    await expect(status.locator('[data-status="procurement"]')).toBeVisible();
    await expect(status.getByRole("button", { name: "Setup" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Trace on plan" })).toBeVisible();

    await addWall(page, { name: "North", length: 6000, height: 2700 });
    await expect(page.getByRole("dialog", { name: "North" })).toBeVisible();
    await expect(page.locator("[data-provenance]")).toHaveText("Entered");
    await expect(elevation(page)).toBeVisible();
    // 6000 / 1200 effective cover = 5 strips, one course; every cell occupied; datum at the wall start
    await expect(cells(page, "occupied")).toHaveCount(5);
    await expect(cells(page)).toHaveCount(5);
    await expect(page.locator('[data-guide="datum"]')).toHaveCount(1);
    await expect(page.locator('[data-area="gross"]')).toHaveText("16.20 m²");
    await expect(page.locator('[data-area="openings"]')).toHaveText("0.00 m²");
    await expect(page.locator('[data-area="net"]')).toHaveText("16.20 m²");
    const qty = page.getByRole("region", { name: "Quantities on this wall" });
    await expect(qty).toContainText("5 sheets");
    await expect(qty).toContainText("2,750 × 1,200 mm"); // shortest listed sheet ≥ 2,700
    await expect(qty.locator('[data-status="quantity"]')).toHaveAttribute("data-value", "calculated");
    await expect(qty.locator('[data-status="installation"]')).not.toHaveAttribute("data-value", "supported-by-selected-rule"); // never claimed
    // scaled to fit the phone width — no horizontal page scroll
    const box = await elevation(page).boundingBox();
    expect(box.width).toBeLessThanOrEqual(390 - 16);
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${SHOTS}/tc-walls-elevation-390x844.png` });

    // back to the list: the wall shows its shape, the material using it and its sheet count
    await page.getByRole("button", { name: "‹ Walls" }).click();
    const row = page.locator("[data-wall-row]").first();
    await expect(row).toContainText("North");
    await expect(row).toContainText("Rectangle · 6,000 mm long · 2,700 high");
    await expect(row).toContainText("Axon 400 smooth");
    await expect(row).toContainText("5 sheets");
  });

  test("gable: tap a cell → stock selection + cut size; invalid apex stays a draft; views switch one at a time", async ({ page }) => {
    await openWalls(page, "axon");
    await addWall(page, { name: "Gable end", length: 6000, height: 2400 });
    // make it a gable: 2,400 eaves, apex 3,000 in the middle → the outer strips' tops are cut along the rake
    await page.getByRole("button", { name: "Gable", exact: true }).click();
    await page.getByLabel("Apex height").fill("3000"); await page.getByLabel("Apex height").press("Enter");
    await page.getByRole("button", { name: /^Centre/ }).click();
    await expect(page.locator('[data-area="gross"]')).toHaveText("16.20 m²"); // 6 × 2.4 + ½ × 6 × 0.6
    // tap the middle strip
    await clickBox(page, page.locator('[data-el-id="c2r0"] rect').first());
    const info = page.locator("[data-element-info]");
    await expect(info).toContainText("Stock");
    await expect(info).toContainText("3,000 × 1,200 mm sheet"); // strip 3 reaches the apex: 3,000 → 3,000 listed
    await expect(info).toContainText("Cut size");
    await expect(info).toContainText("1,200 × 3,000 mm");
    await page.getByRole("button", { name: "Next element" }).click();
    await expect(page.locator("[data-element-info]")).toHaveAttribute("data-element-info", "c3r0");
    await page.screenshot({ path: `${SHOTS}/tc-walls-gable-cell-390x844.png` });

    // an invalid apex (below the eaves) stays a draft in its field with a message — nothing applied
    await page.getByRole("button", { name: "Close panel" }).click();
    await page.getByLabel("Apex height").fill("2000"); await page.getByLabel("Apex height").press("Enter");
    await expect(page.getByText("The apex must be higher than the eaves.")).toBeVisible();
    await expect(page.getByLabel("Apex height")).toHaveValue("2000");
    await expect(page.locator('[data-area="gross"]')).toHaveText("16.20 m²");

    // Supports and Accessories: one view at a time
    await page.getByRole("radio", { name: "Supports" }).click();
    await expect(page.getByRole("radio", { name: "Supports" })).toHaveAttribute("aria-checked", "true");
    await expect(cells(page)).toHaveCount(0);
    await expect(page.locator("[data-supports-empty]")).toContainText("source-pending");
    await page.getByRole("radio", { name: "Accessories" }).click();
    await expect(page.locator('[data-el-state="edge"]')).not.toHaveCount(0); // base (a horizontal line has no box height)
    await expect(page.locator('[data-el-state="end"]')).toHaveCount(2);
    await expect(page.getByRole("region", { name: "Elevation" }).getByLabel("Accessory routes")).toContainText("Base (less doors)");
    await page.screenshot({ path: `${SHOTS}/tc-walls-accessories-390x844.png` });
  });

  test("sloping top: each strip takes the shortest listed sheet for its highest point", async ({ page }) => {
    await openWalls(page, "axon");
    await addWall(page, { name: "Rake", length: 6000, height: 2400 });
    await page.getByRole("button", { name: "Sloping top", exact: true }).click();
    await expect(page.getByLabel("Height at start")).toHaveValue("2400"); // carried from the entered height
    await page.getByLabel("Height at end").fill("3000");
    await page.getByLabel("Height at end").press("Enter");
    await expect(page.locator('[data-area="gross"]')).toHaveText("16.20 m²"); // 6 × (2.4 + 3.0) / 2
    await clickBox(page, page.locator('[data-el-id="c0r0"] rect').first());
    await expect(page.locator("[data-element-info]")).toContainText("2,750 × 1,200 mm sheet"); // strip 1 tops out at 2,520
    await page.getByRole("button", { name: "Next element" }).click();
    await page.getByRole("button", { name: "Next element" }).click();
    await page.getByRole("button", { name: "Next element" }).click();
    await page.getByRole("button", { name: "Next element" }).click();
    await expect(page.locator("[data-element-info]")).toHaveAttribute("data-element-info", "c4r0");
    await expect(page.locator("[data-element-info]")).toContainText("3,000 × 1,200 mm sheet"); // strip 5 reaches 3,000
    const qty = page.getByRole("region", { name: "Quantities on this wall" });
    await expect(qty).toContainText("2,750 × 1,200 mm");
    await expect(qty).toContainText("3,000 × 1,200 mm");
  });

  test("add an opening by tapping the elevation, drag it (10 mm snap), numbers stay authoritative, undo", async ({ page }) => {
    await openWalls(page, "axon");
    await addWall(page, { name: "North", length: 6000, height: 2700 });
    await addOpeningByTap(page, { fx: 0.3, fy: 0.5, width: 1200, height: 1200 });
    const op = page.locator("[data-opening-id]");
    await expect(op).toHaveCount(1);
    await expect(page.locator('[data-area="openings"]')).toHaveText("1.44 m²");
    await expect(page.locator('[data-area="net"]')).toHaveText("14.76 m²");
    const sheet = page.getByRole("region", { name: "Opening W1" });
    await expect(sheet.locator("[data-opening-edges]")).toContainText("Edges: head 1,200 · sill 1,200 · jambs 2 × 1,200 mm");
    const x0 = Number(await op.getAttribute("data-x-mm"));
    const s0 = Number(await op.getAttribute("data-sill-mm"));
    expect(x0 % 10).toBe(0); expect(s0 % 10).toBe(0);
    await expect(sheet.getByLabel("Offset from wall start")).toHaveValue(String(x0));

    // drag the selected opening right/up: the numbers follow, snapped to 10 mm
    const b = await op.locator("rect").first().boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(b.x + b.width / 2 + i * 7, b.y + b.height / 2 - i * 2);
    await page.mouse.up();
    await expect.poll(async () => Number(await op.getAttribute("data-x-mm"))).toBeGreaterThan(x0);
    const x1 = Number(await op.getAttribute("data-x-mm"));
    const s1 = Number(await op.getAttribute("data-sill-mm"));
    expect(x1 % 10).toBe(0); expect(s1 % 10).toBe(0);
    expect(s1).toBeGreaterThanOrEqual(s0);
    await expect(sheet.getByLabel("Offset from wall start")).toHaveValue(String(x1));

    // typed numbers win
    await sheet.getByLabel("Offset from wall start").fill("1000");
    await sheet.getByLabel("Offset from wall start").press("Enter");
    await expect(op).toHaveAttribute("data-x-mm", "1000");
    // undo → back to the dragged position; undo again → before the drag; redo → dragged again
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(op).toHaveAttribute("data-x-mm", String(x1));
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(op).toHaveAttribute("data-x-mm", String(x0));
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(op).toHaveAttribute("data-x-mm", String(x1));
    await page.screenshot({ path: `${SHOTS}/tc-walls-opening-drag-390x844.png` });

    // the opening's edges are tappable in the Accessories view
    await page.getByRole("button", { name: "Close panel" }).click();
    await page.getByRole("radio", { name: "Accessories" }).click();
    const head = page.locator(`[data-el-id$=":head"] line`);
    await clickBox(page, head);
    await expect(page.locator("[data-element-info]")).toContainText("1,200 mm");
    await expect(page.getByRole("region", { name: "W1 head" })).toBeVisible();

    // remove the opening (undoable)
    await page.getByRole("button", { name: "Close panel" }).click();
    await page.getByRole("button", { name: /^W1/ }).click();
    await page.getByRole("button", { name: "Remove opening" }).click();
    await expect(op).toHaveCount(0);
    await expect(page.locator('[data-area="openings"]')).toHaveText("0.00 m²");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(op).toHaveCount(1);
    // a second finger never drags: two-finger touch on the selected opening leaves it where it is
    await page.getByRole("radio", { name: "Cladding" }).click();
    await page.getByRole("button", { name: /^W1/ }).click();
    const before = await op.getAttribute("data-x-mm");
    const ob = await op.locator("rect").first().boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
    const cx = ob.x + ob.width / 2, cy = ob.y + ob.height / 2;
    await touch("touchStart", [[cx, cy], [cx + 30, cy]]);
    for (let i = 1; i <= 5; i++) await touch("touchMove", [[cx + i * 8, cy], [cx + 30 + i * 12, cy]]);
    await touch("touchEnd", []);
    await page.waitForTimeout(200);
    await expect(op).toHaveAttribute("data-x-mm", before);
  });

  test("taller than the tallest listed sheet → blocking problem in place → explicit joint row; empty cells use no sheet", async ({ page }) => {
    await openWalls(page, "axon");
    await addWall(page, { name: "Tall", length: 6000, height: 3500 });
    const problems = page.locator("[data-wall-problems]");
    await expect(problems).toContainText("tallest listed sheet is 3,000 mm");
    await expect(cells(page, "blocked")).toHaveCount(5);
    await expect(page.getByRole("region", { name: "Material status" })).toHaveCount(0); // editor, not list
    await clickBox(page, page.locator('[data-el-id="c0r0"] rect').first());
    await expect(page.locator("[data-element-info]")).toContainText("None fits — needs 3,500 mm");
    await page.getByRole("button", { name: "Close panel" }).click();
    await problems.getByRole("button", { name: "Add a joint row" }).click();
    const form = page.locator("[data-joint-row-form]");
    await expect(form.getByLabel("Joint height")).toHaveValue("3000"); // suggested from the tallest listed sheet
    await expect(form.getByLabel("Joint gap")).toHaveValue(""); // never defaulted
    await form.getByLabel("Joint gap").fill("10");
    await form.getByLabel("Joint gap").press("Enter");
    await expect(cells(page, "blocked")).toHaveCount(5); // PH-07: no detail yet → still a draft
    await form.getByLabel("Detail reference (drawing / guide)").fill("H02"); await form.getByLabel("Detail reference (drawing / guide)").press("Enter");
    await expect(problems).not.toContainText("tallest listed sheet");
    await expect(cells(page, "blocked")).toHaveCount(0);
    await expect(cells(page, "occupied")).toHaveCount(10); // two courses of 5
    await expect(page.locator('[data-el-state="joint"]')).toHaveCount(1);
    const qty = page.getByRole("region", { name: "Quantities on this wall" });
    await expect(qty).toContainText("3,000 × 1,200 mm"); // course 1: 0–3,000
    await expect(qty).toContainText("2,450 × 1,200 mm"); // course 2: 3,010–3,500 → shortest listed
    await expect(qty).toContainText("Horizontal joint strips");
    // an opening covering strip 1's whole upper course: that cell is EMPTY (hatched) and consumes no sheet
    await page.getByRole("button", { name: "Close panel" }).click();
    await page.getByRole("button", { name: "Add opening" }).click();
    const sheet = page.getByRole("region", { name: "New opening" });
    await sheet.getByLabel("Offset from wall start").fill("0"); await sheet.getByLabel("Offset from wall start").press("Enter");
    await sheet.getByLabel("Sill height").fill("3000"); await sheet.getByLabel("Sill height").press("Enter");
    await sheet.getByLabel("Width").fill("1200"); await sheet.getByLabel("Width").press("Enter");
    await sheet.getByLabel("Height", { exact: true }).fill("500"); await sheet.getByLabel("Height", { exact: true }).press("Enter");
    await expect(cells(page, "empty")).toHaveCount(1);
    await expect(page.locator('[data-el-id="c0r1"]')).toHaveAttribute("data-el-state", "empty");
    await expect(cells(page, "occupied")).toHaveCount(9);
    await page.screenshot({ path: `${SHOTS}/tc-walls-joint-row-390x844.png` });
    // undo the opening, then the joint row → blocked again
    await page.getByRole("button", { name: "Close panel" }).click();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(cells(page, "empty")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(cells(page, "blocked")).toHaveCount(5);
  });

  test("datum moved numerically previews the quantity change", async ({ page }) => {
    await openWalls(page, "axon");
    await addWall(page, { name: "North", length: 6000, height: 2700 });
    const setout = page.getByRole("region", { name: "Sheet setout" });
    await setout.getByLabel(/Setout starts at/).fill("600");
    await setout.getByLabel(/Setout starts at/).press("Enter");
    await expect(setout.locator("[data-datum-change]")).toHaveText("Sheets on this wall: 5 → 6");
    await expect(cells(page, "cut")).toHaveCount(2); // a 600 start strip and a 600 end strip
  });

  test("list: attach / detach the material, remove a wall with its openings (undoable)", async ({ page }) => {
    await openWalls(page, "axon");
    await addWall(page, { name: "North", length: 6000, height: 2700 });
    await addOpeningByTap(page, { fx: 0.5, fy: 0.5, width: 900, height: 900 });
    await page.getByRole("button", { name: "Close panel" }).click();
    await page.getByRole("button", { name: "‹ Walls" }).click();
    await addWall(page, { name: "South", length: 4800, height: 2700 });
    await page.getByRole("button", { name: "‹ Walls" }).click();
    await expect(page.locator("[data-wall-row]")).toHaveCount(2);

    await page.getByRole("button", { name: "Stop using Axon 400 smooth on South" }).click();
    const south = page.locator("[data-wall-row]").nth(1);
    await expect(south.getByRole("button", { name: "Use Axon 400 smooth on South" })).toHaveAttribute("aria-pressed", "false");
    await expect(south).not.toContainText("sheets");
    await south.getByRole("button", { name: "Use Axon 400 smooth on South" }).click();
    await expect(south).toContainText("4 sheets");

    await page.getByRole("button", { name: "Remove North" }).click();
    await expect(page.locator("[data-wall-row]")).toHaveCount(1);
    await expect(page.getByText("Removed North and its 1 opening.")).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).first().click();
    await expect(page.locator("[data-wall-row]")).toHaveCount(2);
    await page.getByRole("button", { name: "Open North" }).click();
    await expect(page.locator("[data-opening-id]")).toHaveCount(1);
    await expect(page.locator('[data-area="openings"]')).toHaveText("0.81 m²");
  });

  test("20 walls stay usable: only the selected wall renders an elevation", async ({ page }) => {
    const walls = Array.from({ length: 20 }, (_, i) => ({ name: `W-${String(i + 1).padStart(2, "0")}`, length: 3100 + i * 100, height: 2400 }));
    await openWalls(page, "axon", { walls });
    await expect(page.locator("[data-wall-row]")).toHaveCount(20);
    await expect(elevation(page)).toHaveCount(0); // the list never renders elevations
    await noHorizontalScroll(page);
    await page.screenshot({ path: `${SHOTS}/tc-walls-list-20-390x844.png` });
    // a 21st by numbers still works with 20 in the takeoff
    await addWall(page, { name: "Extra", length: 2400, height: 2400 });
    await expect(elevation(page)).toHaveCount(1);
    await page.getByRole("button", { name: "‹ Walls" }).click();
    await expect(page.locator("[data-wall-row]")).toHaveCount(21);
    const t0 = Date.now();
    await page.getByRole("button", { name: "Open W-13" }).click();
    await expect(elevation(page)).toHaveCount(1); // only the selected wall
    await expect(cells(page)).toHaveCount(4); // 4,300 / 1,200 → 3 full strips + 1 cut strip
    await expect(cells(page, "cut")).toHaveCount(1);
    expect(Date.now() - t0).toBeLessThan(5000);
    await page.getByLabel("Wall height").fill("2600");
    await page.getByLabel("Wall height").press("Enter");
    await expect(page.locator('[data-area="gross"]')).toHaveText("11.18 m²");
    await noHorizontalScroll(page);
    await page.getByRole("button", { name: "‹ Walls" }).click();
    await expect(page.locator("[data-wall-row]").filter({ hasText: "W-13" })).toContainText("2,600 high");
  });

  test("studs (T4): stud ticks in the Supports view, studs inside an opening removed", async ({ page }) => {
    await openWalls(page, "studs");
    await addWall(page, { name: "Frame A", length: 3600, height: 2400 });
    await expect(page.getByRole("radio", { name: "Supports" })).toHaveAttribute("aria-checked", "true");
    const studs = page.locator('[data-wall-elevation] [data-el-kind="line"]');
    await expect(studs).toHaveCount(7); // 0, 600 … 3,600
    await expect(page.locator('[data-el-state="full"]')).toHaveCount(7);
    // opening 1,000–2,200: studs at 1,200 and 1,800 are strictly inside → removed
    await page.getByRole("button", { name: "Add opening" }).click();
    const sheet = page.getByRole("region", { name: "New opening" });
    await sheet.getByLabel("Offset from wall start").fill("1000"); await sheet.getByLabel("Offset from wall start").press("Enter");
    await sheet.getByLabel("Sill height").fill("900"); await sheet.getByLabel("Sill height").press("Enter");
    await sheet.getByLabel("Width").fill("1200"); await sheet.getByLabel("Width").press("Enter");
    await sheet.getByLabel("Height", { exact: true }).fill("1200"); await sheet.getByLabel("Height", { exact: true }).press("Enter");
    await expect(page.locator("[data-opening-id]")).toHaveAttribute("data-x-mm", "1000");
    await expect(page.locator('[data-el-state="removed"]')).toHaveCount(2);
    await expect(page.locator('[data-el-state="full"]')).toHaveCount(5);
    await expect(page.getByRole("region", { name: "Elevation" })).toContainText("base studs only; opening framing incomplete");
    await expect(page.locator("[data-wall-problems]")).toContainText("W1: base studs only");
    await page.getByRole("button", { name: "Close panel" }).click();
    await clickBox(page, page.locator('[data-el-state="full"] line').first());
    await expect(page.locator("[data-element-info]")).toContainText("Cut length");
    await expect(page.locator("[data-element-info]")).toContainText("2,400 mm");
    await page.screenshot({ path: `${SHOTS}/tc-walls-studs-390x844.png` });
  });
});

test.describe("TC walls — every layout family on one wall", () => {
  test("courses, Matrix grid, AAC panels, battens and random-length timber draw from the real engine layouts", async ({ page }) => {
    await openWalls(page, "axon", { walls: [{ name: "Mixed", length: 6000, height: 2700 }], also: ["linea", "matrix", "walsc", "batten", "pine"] });
    await expect(page.locator("[data-wall-row]").first()).toContainText("Cavity batten 70 × 19");
    await page.getByRole("button", { name: "Open Mixed" }).click();
    const show = page.getByRole("group", { name: "Show" });
    // Linea 150 courses: 6,000 runs are longer than the 4,200 board and no joint rule is selected → needs layout (blocked)
    await show.getByRole("button", { name: "Linea 150" }).click();
    await expect(cells(page, "blocked").first()).toBeAttached();
    await expect(page.locator("[data-wall-problems]")).toContainText("no permitted joint position");
    await clickBox(page, cells(page, "blocked").first().locator("rect").first());
    await expect(page.locator("[data-element-info]")).toContainText("Run");
    await page.getByRole("button", { name: "Close panel" }).click();
    // Matrix: panel cells + expressed joints; the cut boundary strips are flagged for review
    await show.getByRole("button", { name: "Matrix 1190" }).click();
    await expect(cells(page, "occupied").first()).toBeAttached();
    await expect(cells(page, "cut").first()).toBeAttached();
    await expect(page.locator('[data-wall-elevation] [data-el-state="joint"]').first()).toBeAttached();
    await expect(page.locator('[data-el-id="c0r2"]')).toHaveAttribute("data-el-state", "cut"); // 2,400–2,700: a 300 strip of a 1,190 panel
    await clickBox(page, page.locator('[data-el-id="c0r2"] rect').first(), 0, -4);
    await expect(page.locator("[data-element-info]")).toContainText("1,190 × 300 mm");
    await expect(page.getByRole("region", { name: /^Panel column/ })).toContainText("minimum-piece");
    await page.getByRole("button", { name: "Close panel" }).click();
    // AAC: whole panels per column
    await show.getByRole("button", { name: "Walsc EWS 50" }).click();
    await expect(cells(page).first()).toBeAttached();
    await clickBox(page, cells(page).first().locator("rect").first());
    await expect(page.locator("[data-element-info]")).toContainText("600 ×");
    await page.getByRole("button", { name: "Close panel" }).click();
    // random-length timber: an honest area estimate, no board layout drawn
    await show.getByRole("button", { name: "Pine shiplap (random)" }).click();
    await expect(cells(page)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Elevation" })).toContainText("Area estimate (random lengths)");
    await expect(page.getByRole("region", { name: "Quantities on this wall" })).toContainText("LM (estimate)");
    // Supports: the batten layer's lines (vertical, ≤ 600 apart over 6,000 → 11 stations), tap → stock
    await page.getByRole("radio", { name: "Supports" }).click();
    await expect(page.locator('[data-wall-elevation] [data-el-state="support"]')).toHaveCount(11);
    await clickBox(page, page.locator('[data-wall-elevation] [data-el-state="support"] line').nth(3));
    await expect(page.locator("[data-element-info]")).toContainText("Cut from a 3,000 mm length");
    await page.getByRole("button", { name: "Close panel" }).click();
    // Accessories: Matrix joints appear alongside the base and wall ends
    await page.getByRole("radio", { name: "Accessories" }).click();
    await expect(page.locator('[data-wall-elevation] [data-el-state="joint"]').first()).toBeAttached();
    await expect(page.getByLabel("Accessory routes")).not.toContainText("Joints0 mm");
    await page.screenshot({ path: `${SHOTS}/tc-walls-mixed-accessories-390x844.png` });
    await noHorizontalScroll(page);
  });
});

test.describe("TC walls — 375 px phone", () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  test("375 × 667: list, editor and opening sheet fit without horizontal scroll; targets ≥ 44 px", async ({ page }) => {
    await openWalls(page, "axon");
    await noHorizontalScroll(page);
    await addWall(page, { name: "Small phone", length: 7200, height: 2700 });
    await expect(elevation(page)).toBeVisible();
    expect((await elevation(page).boundingBox()).width).toBeLessThanOrEqual(375 - 16);
    await noHorizontalScroll(page);
    await addOpeningByTap(page, { fx: 0.5, fy: 0.5, width: 1800, height: 2100 });
    await noHorizontalScroll(page);
    // every visible button / field in the focused window is at least 44 px tall
    const small = await page.evaluate(() => [...document.querySelectorAll("[data-takeoff-focus] button, [data-takeoff-focus] input")]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5; })
      .map((el) => `${el.tagName} ${el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30)} ${Math.round(el.getBoundingClientRect().height)}`));
    expect(small).toEqual([]);
    await page.screenshot({ path: `${SHOTS}/tc-walls-opening-375x667.png` });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Adversarial review (TC-R04 02 §3–4, 04 C0/C1, J2, UX02/UX04) — each test pins a defect found and fixed.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

function consoleErrors(page) {
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push(e.message));
  return errs;
}

/** The J5 mixed job (?takeoffSeed=mixed): Axon cladding + cavity battens on "North wall" 4,800 × 2,700 with W1 900 × 900. */
async function openMixedWalls(page, name = "Axon cladding") {
  await page.goto("/carpentry/cjb-1/takeoff?reviewRole=admin&takeoffSeed=mixed");
  await ready(page);
  await page.getByRole("listitem").filter({ hasText: name }).first().getByRole("button", { name: "Walls", exact: true }).click();
  await expect(page.getByRole("region", { name: "Walls" })).toBeVisible();
}

async function addOpeningByNumbers(page, { x, sill, width, height }) {
  await page.getByRole("button", { name: "Add opening" }).click();
  const sheet = page.getByRole("region", { name: "New opening" });
  for (const [label, v] of [["Offset from wall start", x], ["Sill height", sill], ["Width", width], ["Height", height]]) {
    const f = sheet.getByLabel(label, { exact: true });
    await f.fill(String(v)); await f.press("Enter");
  }
  await expect(page.getByRole("region", { name: /^Opening / })).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();
}

const hidePage = (page) => page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
});

test.describe("TC walls — adversarial review regressions", () => {
  test("J2 end to end: 4,800 × 2,700 Axon + 900 × 900 window → 4 sheets, net 12.15 m²; 4,801 → 5 (the 1 mm cut strip is named); undo/redo; an offline reload keeps it", async ({ page }) => {
    await openMixedWalls(page);
    await expect(page.locator("[data-wall-row]").filter({ hasText: "North wall" })).toContainText("4 sheets");
    await page.getByRole("button", { name: "Open North wall" }).click();
    await expect(page.locator('[data-area="gross"]')).toHaveText("12.96 m²");
    await expect(page.locator('[data-area="net"]')).toHaveText("12.15 m²");
    await expect(cells(page, "empty")).toHaveCount(0); // the window is inside one cell: that sheet is still consumed
    await expect(page.locator("[data-sheet-summary]")).toContainText("4 strips × 1 course → 4 sheets");
    const axon = page.locator('[data-wall-qty="mat-axon"]');
    await expect(axon).toContainText("4 sheets");
    await expect(page.locator("[data-wall-result]")).toHaveText("Net 12.15 m² of 12.96 m² · Axon cladding: 4 sheets");
    // offline from here: the edit is kept on this device and must survive a reload
    await page.evaluate(() => { window.__takeoffReviewOffline = true; });
    await page.getByLabel("Wall length").fill("4801"); await page.getByLabel("Wall length").press("Enter");
    await expect(axon).toContainText("5 sheets");
    await expect(page.locator("[data-sheet-summary]")).toContainText("5 strips (1 cut: 1 mm wide) × 1 course → 5 sheets");
    await expect(page.locator("[data-wall-result]")).toContainText("Axon cladding: 5 sheets");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(axon).toContainText("4 sheets");
    await expect(page.getByLabel("Wall length")).toHaveValue("4800");
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(axon).toContainText("5 sheets");
    await expect(page.getByText(/No connection — your changes are kept/)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/tc-walls-j2-4801-390x844.png` });
    await recoveryWritten(page);
    await page.reload();
    await ready(page);
    await page.getByRole("button", { name: "Restore" }).click();
    await page.getByRole("listitem").filter({ hasText: "Axon cladding" }).first().getByRole("button", { name: "Walls", exact: true }).click();
    await expect(page.locator("[data-wall-row]").filter({ hasText: "North wall" })).toContainText("5 sheets");
    await page.getByRole("button", { name: "Open North wall" }).click();
    await expect(page.getByLabel("Wall length")).toHaveValue("4801");
    await expect(page.locator('[data-area="net"]')).toHaveText("12.15 m²");
  });

  test("UX04: an incomplete wall (length only) survives a reload; reopening it focuses the missing height", async ({ page }) => {
    await openMixedWalls(page);
    await page.evaluate(() => { window.__takeoffReviewOffline = true; });
    await page.getByRole("button", { name: "Wall by numbers" }).click();
    const sheet = page.getByRole("region", { name: "Wall by numbers" });
    await sheet.getByLabel("Wall name").fill("Draft rake");
    await sheet.getByRole("button", { name: "Sloping top" }).click();
    await sheet.getByLabel("Wall length").fill("3600"); await sheet.getByLabel("Wall length").press("Enter");
    await expect(page.getByLabel("Height at start")).toBeFocused();
    await page.getByLabel("Height at start").fill("2400"); await page.getByLabel("Height at start").press("Enter");
    await expect(page.locator("[data-elevation-pending]")).toBeVisible(); // still a draft: no end height
    await page.waitForTimeout(300);
    await recoveryWritten(page);
    await page.reload();
    await ready(page);
    await page.getByRole("button", { name: "Restore" }).click();
    await page.getByRole("listitem").filter({ hasText: "Axon cladding" }).first().getByRole("button", { name: "Walls", exact: true }).click();
    const row = page.locator("[data-wall-row]").filter({ hasText: "Draft rake" });
    await expect(row).toContainText("Sloping top · 3,600 mm long");
    await expect(row).toContainText("Heights needed");
    await page.getByRole("button", { name: "Open Draft rake" }).click();
    await expect(page.getByLabel("Height at start")).toHaveValue("2400");
    await expect(page.getByLabel("Height at end")).toBeFocused();
  });

  test("a typed number is committed when the app is hidden (no Enter, no blur) and is back after a reload", async ({ page }) => {
    await openMixedWalls(page);
    await page.getByRole("button", { name: "Open North wall" }).click();
    await page.evaluate(() => { window.__takeoffReviewOffline = true; });
    await page.getByLabel("Wall height").fill("2900"); // typed only
    await expect(page.locator('[data-area="gross"]')).toHaveText("12.96 m²");
    await hidePage(page); // app switch / phone locked
    await expect(page.locator('[data-area="gross"]')).toHaveText("13.92 m²");
    await page.waitForTimeout(300);
    await recoveryWritten(page);
    await page.reload();
    await ready(page);
    await page.getByRole("button", { name: "Restore" }).click();
    await page.getByRole("listitem").filter({ hasText: "Axon cladding" }).first().getByRole("button", { name: "Walls", exact: true }).click();
    await page.getByRole("button", { name: "Open North wall" }).click();
    await expect(page.getByLabel("Wall height")).toHaveValue("2900");
  });

  test("Undo with an invalid field draft only clears that field; an unfinished new opening is cancelled before any earlier edit", async ({ page }) => {
    const errs = consoleErrors(page);
    await openWalls(page, "axon");
    await addWall(page, { name: "North", length: 6000, height: 2700 });
    await page.getByLabel("Wall height").fill("3000"); await page.getByLabel("Wall height").press("Enter");
    await expect(page.locator('[data-area="gross"]')).toHaveText("18.00 m²");
    await page.getByLabel("Wall length").fill("-5"); await page.getByLabel("Wall length").press("Enter");
    await expect(page.getByLabel("Wall length")).toHaveAttribute("aria-invalid", "true");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByLabel("Wall length")).toHaveValue("6000");
    await expect(page.getByLabel("Wall length")).toHaveAttribute("aria-invalid", "false");
    await expect(page.getByLabel("Wall height")).toHaveValue("3000"); // the earlier valid edit is kept
    await expect(page.locator('[data-area="gross"]')).toHaveText("18.00 m²");
    // an unfinished new opening (position tapped, width typed, no height yet) is what Undo cancels
    await page.getByRole("button", { name: "Add opening" }).click();
    await page.waitForTimeout(150);
    const box = await elevation(page).boundingBox();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    const sheet = page.getByRole("region", { name: "New opening" });
    await sheet.getByLabel("Width").fill("900"); await sheet.getByLabel("Width").press("Enter");
    await expect(page.locator("[data-draft-opening]")).toHaveCount(1);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator("[data-draft-opening]")).toHaveCount(0);
    await expect(page.getByLabel("Wall height")).toHaveValue("3000");
    // then Undo is the real history again
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByLabel("Wall height")).toHaveValue("2700");
    expect(errs).toEqual([]);
  });

  test("the datum preview is never stale: it goes when something else changes the count, and with the datum's own undo", async ({ page }) => {
    await openWalls(page, "axon");
    await addWall(page, { name: "North", length: 6000, height: 2700 });
    const setout = page.getByRole("region", { name: "Sheet setout" });
    await setout.getByLabel(/Setout starts at/).fill("600"); await setout.getByLabel(/Setout starts at/).press("Enter");
    await expect(setout.locator("[data-datum-change]")).toHaveText("Sheets on this wall: 5 → 6");
    await page.getByLabel("Wall length").fill("7200"); await page.getByLabel("Wall length").press("Enter");
    await expect(page.locator('[data-wall-qty="mat-axon"]')).toContainText("7 sheets");
    await expect(setout.locator("[data-datum-change]")).toHaveCount(0); // "5 → 7" would blame the datum
    await page.getByRole("button", { name: "Undo" }).click(); // length back: the datum is again the only change
    await expect(setout.locator("[data-datum-change]")).toHaveText("Sheets on this wall: 5 → 6");
    await page.getByRole("button", { name: "Undo" }).click(); // datum back to the wall start
    await expect(setout.getByLabel(/Setout starts at/)).toHaveValue("0");
    await expect(setout.locator("[data-datum-change]")).toHaveCount(0);
  });

  test("a joint row is a material rule: it applies only to walls it falls inside — the others are named and keep one course (never blocked)", async ({ page }) => {
    const errs = consoleErrors(page);
    await openWalls(page, "axon", { walls: [{ name: "Low", length: 4800, height: 2700 }] });
    await addWall(page, { name: "Tall", length: 2400, height: 3500 });
    await page.locator("[data-wall-problems]").getByRole("button", { name: "Add a joint row" }).click();
    const form = page.locator("[data-joint-row-form]");
    await expect(form.getByLabel("Joint height")).toHaveValue("3000");
    await expect(form.locator("[data-joint-row-misfit]")).toContainText("Low (2,700 mm) is not tall enough for a joint at 3,000 mm — the joint row doesn't apply there, so it keeps a single course");
    await form.getByLabel("Joint gap").fill("10"); await form.getByLabel("Joint gap").press("Enter");
    await form.getByLabel("Detail reference (drawing / guide)").fill("H02"); await form.getByLabel("Detail reference (drawing / guide)").press("Enter");
    await expect(cells(page, "occupied")).toHaveCount(4); // Tall: 2 strips × 2 courses
    await page.getByRole("button", { name: "Close panel" }).click();
    await page.getByRole("button", { name: "‹ Walls" }).click();
    await expect(page.locator("[data-wall-row]").filter({ hasText: "Low" }).locator("[data-wall-blocked]")).toHaveCount(0);
    await expect(page.locator("[data-wall-row]").filter({ hasText: "Tall" }).locator("[data-wall-blocked]")).toHaveCount(0);
    await page.getByRole("button", { name: "Open Low" }).click();
    await expect(cells(page, "occupied")).toHaveCount(4); // Low: 4 strips × ONE course (2,700 sheets), unaffected
    await expect(page.locator('[data-wall-qty="mat-axon"]')).toContainText("4");
    await page.screenshot({ path: `${SHOTS}/tc-walls-joint-row-misfit-390x844.png` });
    expect(errs).toEqual([]);
  });

  test("C0 openings: overlap deducted once, the part past the wall edge hatched and not deducted, an opening off the wall blocks in place; a tapped opening is kept on the wall", async ({ page }) => {
    const errs = consoleErrors(page);
    await openWalls(page, "axon");
    await addWall(page, { name: "North", length: 6000, height: 2700 });
    await addOpeningByNumbers(page, { x: 1000, sill: 900, width: 1200, height: 1200 });
    await addOpeningByNumbers(page, { x: 1600, sill: 1500, width: 1200, height: 1200 }); // overlaps W1 by 600 × 600
    await expect(page.locator('[data-area="openings"]')).toHaveText("2.52 m²"); // 1.44 + 1.44 − 0.36, never twice
    await addOpeningByNumbers(page, { x: 5500, sill: 1000, width: 1000, height: 1000 }); // half past the wall end
    await expect(page.locator('[data-area="openings"]')).toHaveText("3.02 m²");
    await expect(page.locator("[data-opening-row]").filter({ hasText: "W3" })).toContainText("Extends past the wall edge");
    await expect(page.locator('[data-opening-id][data-issue="clipped"]')).toHaveCount(1);
    await expect(page.locator("[data-off-wall]")).toHaveCount(1);
    await expect(page.locator("[data-off-wall-legend]")).toBeVisible();
    await addOpeningByNumbers(page, { x: 7000, sill: 1000, width: 500, height: 500 }); // wholly off the wall
    await expect(page.locator('[data-opening-id][data-issue="outside"]')).toHaveCount(1);
    await expect(page.locator("[data-wall-problems]")).toContainText("Opening W4 is entirely outside the wall");
    await expect(page.locator("[data-layout-empty]")).toContainText("fix the problems below first");
    await expect(page.locator('[data-area="openings"]')).toHaveText("3.02 m²");
    await page.getByRole("region", { name: "Elevation" }).screenshot({ path: `${SHOTS}/tc-walls-openings-union-clip-390x844.png` });
    // removing it brings the sheet layout back
    await page.getByRole("button", { name: /^W4/ }).click();
    await page.getByRole("button", { name: "Remove opening" }).click();
    await expect(page.locator("[data-layout-empty]")).toHaveCount(0);
    await expect(page.locator("[data-wall-problems]")).toHaveCount(0);
    await expect(cells(page).first()).toBeAttached();
    // a tap right at the wall end centres a new 1,200 wide window there — but keeps it on the wall
    await page.getByRole("button", { name: "Add opening" }).click();
    await page.waitForTimeout(150);
    const b = await elevation(page).locator(":scope > polygon").first().boundingBox();
    await page.mouse.click(b.x + b.width - 3, b.y + b.height * 0.25);
    const sheet = page.getByRole("region", { name: "New opening" });
    await sheet.getByLabel("Width").fill("1200"); await sheet.getByLabel("Width").press("Enter");
    await sheet.getByLabel("Height", { exact: true }).fill("600"); await sheet.getByLabel("Height", { exact: true }).press("Enter");
    await expect(page.getByRole("region", { name: "Opening W4" }).getByLabel("Offset from wall start")).toHaveValue("4800");
    await expect(page.locator("[data-opening-row]").filter({ hasText: "W4" })).not.toContainText("Extends past");
    expect(errs).toEqual([]);
  });

  test("traced wall: 'Derived from plan + entered heights', traced length read-only, the missing height focused, live result", async ({ page }) => {
    const traced = { id: "seed-traced-1", kind: "wall", documentId: "doc-plan-c", pageIndex: 0, calibrationId: "cal-1", points: [planPt(0, 1000), planPt(4000, 1000)], parentId: null, label: null, inputs: { kind: "rect", name: "Traced T" } };
    await openWalls(page, "axon", { extraMeasurements: [traced], extraContributions: [{ id: "seed-con-traced", measurementId: traced.id, jobMaterialId: "mat-axon", role: "wall" }] });
    const row = page.locator("[data-wall-row]").filter({ hasText: "Traced T" });
    await expect(row).toContainText("From plan");
    await expect(row).toContainText("4,000 mm long");
    await expect(row).toContainText("Heights needed");
    await page.getByRole("button", { name: "Open Traced T" }).click();
    await expect(page.getByRole("dialog", { name: "Traced T" })).toContainText("Derived from plan + entered heights");
    await expect(page.locator("[data-traced-length]")).toHaveText("4,000 mm");
    await expect(page.getByLabel("Wall length")).toHaveCount(0); // read-only: retrace to change it
    await expect(page.getByLabel("Wall height")).toBeFocused();
    await page.getByLabel("Wall height").fill("2700"); await page.getByLabel("Wall height").press("Enter");
    await expect(page.locator("[data-provenance]")).toHaveText("Derived from plan + entered heights");
    await expect(page.locator("[data-wall-result]")).toHaveText("Net 10.80 m² of 10.80 m² · Axon 400 smooth: 4 sheets");
  });

  test("problems go to the right wall ('North' never takes 'North wall: …'); a material with no wall reads 'Nothing measured yet', never Calculated", async ({ page }) => {
    await openWalls(page, "axon");
    const q = page.getByRole("region", { name: "Material status" }).locator('[data-status="quantity"]');
    await expect(q).toHaveAttribute("data-value", "nothing");
    await expect(q).toHaveText("Nothing measured yet");
    await addWall(page, { name: "North", length: 4800, height: 2700 });
    await page.getByRole("button", { name: "‹ Walls" }).click();
    await addWall(page, { name: "North wall", length: 4800, height: 3500 }); // taller than any listed sheet
    await page.getByRole("button", { name: "‹ Walls" }).click();
    const rows = page.locator("[data-wall-row]");
    await expect(rows.nth(1)).toContainText("North wall");
    await expect(rows.nth(1).locator("[data-wall-blocked]")).toBeVisible();
    await expect(rows.nth(0).locator("[data-wall-blocked]")).toHaveCount(0);
    await page.getByRole("button", { name: "Open North", exact: true }).click();
    await expect(page.locator("[data-wall-problems]")).toHaveCount(0);
    await expect(page.locator("[data-wall-result]")).toContainText("Axon 400 smooth: 4 sheets");
  });

  test("supports name openings by their label, never an internal id; the opening sheet is honest about flashing links", async ({ page }) => {
    await openMixedWalls(page, "Cavity battens");
    await page.getByRole("button", { name: "Open North wall" }).click();
    await expect(page.getByRole("radio", { name: "Supports" })).toHaveAttribute("aria-checked", "true");
    await clickBox(page, page.locator('[data-wall-elevation] [data-el-state="support"] line').first());
    const titles = [];
    const info = page.locator("section").filter({ has: page.locator("[data-element-info]") });
    for (let i = 0; i < 12; i++) {
      titles.push(await info.getAttribute("aria-label"));
      await page.getByRole("button", { name: "Next element" }).click();
    }
    expect(titles.some((t) => /— (above|below) W1/.test(t))).toBe(true);
    expect(titles.filter((t) => /m-w1/.test(t))).toEqual([]);
    await page.getByRole("button", { name: "Close panel" }).click();
    await page.getByRole("button", { name: /^W1/ }).click();
    await expect(page.getByRole("region", { name: "Opening W1" })).toContainText("no reviewed flashing template is linked");
  });

  test("an accessory material on the wall shows its selected scopes (Include / By others / Exclude / Not decided)", async ({ page }) => {
    await openWalls(page, "axon", { walls: [{ name: "North", length: 4800, height: 2700 }], also: ["acc"] });
    await page.getByRole("button", { name: "Open North" }).click();
    await page.getByRole("radio", { name: "Accessories" }).click();
    const sc = page.locator('[data-accessory-scopes="mat-acc"]');
    await expect(sc.locator('[data-scope="starter"]')).toHaveText("Include");
    await expect(sc.locator('[data-scope="corners"]')).toHaveText("By others");
    await expect(sc.locator('[data-scope="tape"]')).toHaveText("Exclude");
    await expect(sc.locator('[data-scope="sealant"]')).toHaveText("Not decided");
    await expect(sc).toContainText("“Not decided” is not the same as excluded");
    await expect(page.locator('[data-wall-qty="mat-acc"]')).toBeVisible();
    await expect(page.locator('[data-wall-qty="mat-acc"] [data-status="installation"]')).not.toHaveAttribute("data-value", "supported-by-selected-rule");
  });

  test("course setout (Linea) is editable: at or below the base, the guide moves and the board count change is shown", async ({ page }) => {
    await openWalls(page, "linea", { walls: [{ name: "Short", length: 3600, height: 2700 }] });
    await page.getByRole("button", { name: "Open Short" }).click();
    const setout = page.getByRole("region", { name: "Course setout" });
    const field = setout.getByLabel(/First course starts at/);
    await expect(field).toHaveValue("0");
    const y0 = (await page.locator('[data-guide="datum"] line').boundingBox()).y;
    await field.fill("-75"); await field.press("Enter");
    await expect(setout.locator("[data-datum-change]")).toContainText(/Course boards on this wall: \d+ → \d+/);
    await expect.poll(async () => (await page.locator('[data-guide="datum"] line').boundingBox()).y).toBeGreaterThan(y0);
    await field.fill("50"); await field.press("Enter"); // courses stack UP from the datum: never above the base
    await expect(setout.getByRole("alert")).toContainText("more than 0");
    await expect(setout.locator("[data-datum-change]")).toBeVisible(); // the -75 still applies
  });

  test("zoomed drawing keeps the user's own pan through re-renders; a real one-finger touch drags the selected opening and never scrolls the page", async ({ page }) => {
    await openWalls(page, "axon");
    await addWall(page, { name: "North", length: 6000, height: 2700 });
    await addOpeningByNumbers(page, { x: 5000, sill: 1000, width: 100, height: 100 }); // small → zoom offered
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zoom in drawing" }).click();
    await expect(elevation(page)).toHaveAttribute("data-zoom", "8");
    const box = page.locator("[data-elevation-box]");
    await page.getByRole("button", { name: /^W1/ }).click(); // a NEW selection is brought into view once
    await expect.poll(() => box.evaluate((b) => b.scrollLeft)).toBeGreaterThan(0);
    await box.evaluate((b) => { b.scrollLeft = 0; }); // the user pans back to the wall start
    const sheet = page.getByRole("region", { name: "Opening W1" });
    await sheet.getByLabel("Label").fill("W1a"); await sheet.getByLabel("Label").press("Enter"); // an unrelated re-render
    await expect(page.getByRole("region", { name: "Opening W1a" })).toBeVisible();
    await page.waitForTimeout(800); // autosave status changes re-render too
    expect(await box.evaluate((b) => b.scrollLeft)).toBe(0);

    // real touch: one finger on the selected opening drags it; the page itself does not scroll
    await page.getByRole("button", { name: "Close panel" }).click();
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Zoom out drawing" }).click();
    await addOpeningByNumbers(page, { x: 1000, sill: 900, width: 1200, height: 1200 });
    await page.locator("[data-opening-row]").nth(1).getByRole("button").click(); // select the new one (the drawing scrolls into view)
    const op = page.locator("[data-opening-id]").nth(1);
    const x0 = Number(await op.getAttribute("data-x-mm"));
    const scroller = page.locator("[data-takeoff-focus] .overflow-y-auto").first();
    let top0 = -1;
    await expect.poll(async () => { const t = await scroller.evaluate((e) => e.scrollTop); const same = t === top0; top0 = t; return same; }).toBe(true);
    const r = await op.locator("rect").first().boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    await touch("touchStart", [[cx, cy]]);
    for (let i = 1; i <= 8; i++) { await touch("touchMove", [[cx + i * 5, cy - i * 6]]); await page.waitForTimeout(16); }
    await touch("touchEnd", []);
    await expect.poll(async () => Number(await op.getAttribute("data-x-mm"))).toBeGreaterThan(x0);
    expect(await scroller.evaluate((e) => e.scrollTop)).toBe(top0);
  });
});

test.describe("TC walls — review additions at 375 px", () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  test("375 × 667 mixed job: sheet summary + offcuts, zoomed drawing, supports and accessories fit with no sideways scroll; targets ≥ 44 px; removing a shared wall says which materials lost it", async ({ page }) => {
    const errs = consoleErrors(page);
    await openMixedWalls(page);
    await page.getByRole("button", { name: "Open North wall" }).click();
    await page.getByLabel("Wall length").fill("4801"); await page.getByLabel("Wall length").press("Enter");
    await page.locator("[data-offcuts] summary").click();
    await expect(page.locator("[data-offcuts]")).toContainText("Strip 5: 1,199 × 2,700 mm"); // the cover ripped off the 1 mm strip
    await noHorizontalScroll(page);
    for (let i = 0; i < 4; i++) {
      const plus = page.getByRole("button", { name: "Zoom in drawing" });
      if (await plus.isDisabled()) break;
      await plus.click();
    }
    await expect(elevation(page)).not.toHaveAttribute("data-zoom", "1");
    await noHorizontalScroll(page); // the zoomed drawing scrolls inside its own box only
    for (const view of ["Supports", "Accessories"]) {
      await page.getByRole("radio", { name: view }).click();
      await noHorizontalScroll(page);
    }
    const small = await page.evaluate(() => [...document.querySelectorAll("[data-takeoff-focus] button, [data-takeoff-focus] input, [data-takeoff-focus] summary")]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 43.5 || r.width < 43.5); })
      .map((el) => `${el.tagName} ${el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30)}`));
    expect(small).toEqual([]);
    await page.screenshot({ path: `${SHOTS}/tc-walls-mixed-375x667.png` });
    // the wall is shared: removing it here also removes it from the battens and the window angle (W1) — said, and undoable
    await page.getByRole("button", { name: "Remove wall" }).click();
    await expect(page.getByText(/Removed North wall and its 1 opening\. Also gone from Cavity battens, Window angle 50 × 50 × 3\./)).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).first().click();
    await expect(page.locator("[data-wall-row]").filter({ hasText: "North wall" })).toContainText("Cavity battens");
    expect(errs).toEqual([]);
  });
});

/** A simulated on-screen keyboard: visualViewport shrinks by `kb` px ~20 ms after an input takes focus (as a phone's does). */
function simulateKeyboard(page, kb) {
  return page.addInitScript((KB) => {
    const vv = new EventTarget();
    let h = window.innerHeight;
    Object.defineProperty(vv, "height", { get: () => h });
    Object.defineProperty(vv, "offsetTop", { get: () => 0 });
    Object.defineProperty(vv, "width", { get: () => window.innerWidth });
    Object.defineProperty(vv, "scale", { get: () => 1 });
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => vv });
    const upd = () => {
      const el = document.activeElement;
      const nh = window.innerHeight - (el && /^(INPUT|TEXTAREA)$/.test(el.tagName) ? KB : 0);
      if (nh !== h) { h = nh; vv.dispatchEvent(new Event("resize")); }
    };
    document.addEventListener("focusin", () => setTimeout(upd, 20));
    document.addEventListener("focusout", () => setTimeout(upd, 20));
    window.__kbTop = () => window.innerHeight - KB;
  }, kb);
}
/** The element sits between the window header and the (simulated) keyboard's top edge. */
const kbInView = (locator) => expect.poll(async () => {
  const r = await locator.evaluate((el) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, kb: window.__kbTop() }; });
  return r.top >= 52 && r.bottom <= r.kb;
}, { timeout: 5000 }).toBe(true);

test.describe("TC walls — on-screen keyboard (simulated visualViewport)", () => {
  test("a 336 px keyboard never covers the focused field — nor the live result line under the wall fields", async ({ page }) => {
    await simulateKeyboard(page, 336);
    const inView = kbInView;
    await openMixedWalls(page);
    await page.getByRole("button", { name: "Open North wall" }).click();
    await page.getByLabel("Wall height").focus();
    await inView(page.getByLabel("Wall height"));
    await inView(page.locator("[data-wall-result]"));
    await page.screenshot({ path: `${SHOTS}/tc-walls-keyboard-height-390x844.png` });
    await page.getByLabel("Wall height").blur();
    await page.getByRole("button", { name: /^W1/ }).click();
    const op = page.getByRole("region", { name: "Opening W1" });
    await op.getByLabel("Offset from wall start").focus();
    await inView(op.getByLabel("Offset from wall start"));
    await inView(page.locator("[data-opening-id]").first()); // the drawing it moves stays visible above
    await op.getByLabel("Offset from wall start").blur();
    await page.getByRole("button", { name: "Close panel" }).click();
    await page.getByRole("button", { name: "Add a joint row" }).click();
    const gap = page.locator("[data-joint-row-form]").getByLabel("Joint gap");
    await gap.focus();
    await inView(gap);
    await gap.blur();
    await page.getByRole("button", { name: "Close panel" }).click();
    const datum = page.getByRole("region", { name: "Sheet setout" }).getByLabel(/Setout starts at/);
    await datum.focus();
    await inView(datum);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Phone adversarial review, round 2 (PH-07, PH-09, PH-14, F09, F14, F17) — each test failed before its fix.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

test.describe("TC walls — phone review round 2", () => {
  test("PH-09 WebKit (iPhone 13): the keyboard never covers the FIRST field focused in the opening sheet, the joint gap or the datum", async ({ baseURL }) => {
    const browser = await webkit.launch();
    try {
      const context = await browser.newContext({ ...devices["iPhone 13"], baseURL });
      const page = await context.newPage();
      await simulateKeyboard(page, 300);
      await openMixedWalls(page);
      await page.getByRole("button", { name: "Open North wall" }).click();
      await page.getByRole("button", { name: /^W1/ }).click();
      const op = page.getByRole("region", { name: "Opening W1" });
      // the first focus in a freshly opened sheet: the scroll must run AFTER the keyboard room exists
      await op.getByLabel("Offset from wall start").focus();
      await kbInView(op.getByLabel("Offset from wall start"));
      await op.getByLabel("Offset from wall start").blur();
      await page.getByRole("button", { name: "Close panel" }).click();
      await page.getByRole("button", { name: "Add a joint row" }).click();
      const gap = page.locator("[data-joint-row-form]").getByLabel("Joint gap");
      await gap.focus();
      await kbInView(gap);
      await gap.blur();
      await page.getByRole("button", { name: "Close panel" }).click();
      const datum = page.getByRole("region", { name: "Sheet setout" }).getByLabel(/Setout starts at/);
      await datum.focus();
      await kbInView(datum);
      await page.screenshot({ path: `${SHOTS}/tc-walls-keyboard-webkit-iphone13.png` });
    } finally {
      await browser.close();
    }
  });

  test("PH-07 a joint row from the wall editor stays a draft until height, gap AND detail reference are entered (the Setup card's rule)", async ({ page }) => {
    await openWalls(page, "axon");
    await addWall(page, { name: "Tall", length: 6000, height: 3500 });
    await expect(cells(page, "blocked")).toHaveCount(5);
    await page.locator("[data-wall-problems]").getByRole("button", { name: "Add a joint row" }).click();
    const form = page.locator("[data-joint-row-form]");
    await form.getByLabel("Joint gap").fill("10"); await form.getByLabel("Joint gap").press("Enter");
    // height + gap but no detail: NOT a layout — kept as a draft, still blocked
    await expect(form.locator("[data-joint-row-draft]")).toContainText("Kept as a draft until");
    await expect(cells(page, "blocked")).toHaveCount(5);
    await expect(page.locator('[data-el-state="joint"]')).toHaveCount(0);
    // the draft survives closing the sheet (stored with the material, never read by the engine)
    await page.getByRole("button", { name: "Close panel" }).click();
    const setout = page.getByRole("region", { name: "Sheet setout" });
    await expect(setout.locator("[data-joint-row-draft]")).toContainText("not applied");
    await setout.getByRole("button", { name: "Edit joint row" }).click();
    await expect(form.getByLabel("Joint gap")).toHaveValue("10");
    await expect(form.getByLabel("Joint height")).toHaveValue("3000");
    // the detail completes it → applied at once
    await form.getByLabel("Detail reference (drawing / guide)").fill("H02 horizontal joint");
    await form.getByLabel("Detail reference (drawing / guide)").press("Enter");
    await expect(cells(page, "blocked")).toHaveCount(0);
    await expect(cells(page, "occupied")).toHaveCount(10);
    await expect(form.locator("[data-joint-row-draft]")).toHaveCount(0);
    await page.getByRole("button", { name: "Close panel" }).click();
    await expect(setout).toContainText("Joint row at 3,000 mm (gap 10 mm, H02 horizontal joint)");
    // the fake server holds exactly what Setup would: jointRows complete, no draft left behind
    await expect.poll(() => page.evaluate(async () => {
      const ws = await (await fetch("/api/takeoff/workspaces/ws-1")).json();
      const m = ws.snapshot.materials.find((x) => x.id === "mat-axon");
      return JSON.stringify([m.rules.jointRows || null, m.rules.jointRowsDraft || null]);
    })).toBe(JSON.stringify([{ atMm: [3000], gapMm: 10, detailRef: "H02 horizontal joint" }, null]));
    // undo → back to the draft (blocked again), the draft intact
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(cells(page, "blocked")).toHaveCount(5);
    await expect(setout.locator("[data-joint-row-draft]")).toBeVisible();
  });

  test("PH-14 wall by numbers: a shape tapped after typing the length is kept; tapping the name keeps the sheet open; leaving the sheet adds the wall", async ({ page }) => {
    await openWalls(page, "axon");
    await page.getByRole("button", { name: "Wall by numbers" }).click();
    let sheet = page.getByRole("region", { name: "Wall by numbers" });
    await sheet.getByLabel("Wall length").fill("6000"); // typed — no Enter
    const gable = sheet.getByRole("button", { name: "Gable", exact: true });
    const gb = await gable.boundingBox();
    await page.touchscreen.tap(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await expect(page.getByRole("dialog", { name: "Wall 1" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Gable", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Eaves height")).toBeFocused();
    await expect(page.getByLabel("Wall length")).toHaveValue("6000");
    await page.getByRole("button", { name: "‹ Walls" }).click();
    // type the length, then go back to the name: the sheet stays open, the name is used
    await page.getByRole("button", { name: "Wall by numbers" }).click();
    sheet = page.getByRole("region", { name: "Wall by numbers" });
    await sheet.getByLabel("Wall length").fill("4800");
    const nb = await sheet.getByLabel("Wall name").boundingBox();
    await page.touchscreen.tap(nb.x + nb.width / 2, nb.y + nb.height / 2);
    await page.waitForTimeout(600);
    await expect(sheet).toBeVisible();
    await expect(page.locator("[data-wall-row]")).toHaveCount(1);
    await sheet.getByLabel("Wall name").fill("Side");
    await sheet.getByLabel("Wall name").press("Enter");
    await expect(page.getByRole("dialog", { name: "Side" })).toBeVisible();
    await expect(page.getByLabel("Wall length")).toHaveValue("4800");
    await expect(page.getByRole("button", { name: "Rectangle", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "‹ Walls" }).click();
    // typing a length and then tapping outside the sheet still adds the wall (auto-apply, nothing to confirm)
    await page.getByRole("button", { name: "Wall by numbers" }).click();
    sheet = page.getByRole("region", { name: "Wall by numbers" });
    await sheet.getByLabel("Wall length").fill("3000");
    const title = await page.getByRole("region", { name: "Material status" }).locator("h2").boundingBox();
    await page.touchscreen.tap(title.x + 10, title.y + title.height / 2);
    await expect(page.getByRole("dialog", { name: "Wall 3" })).toBeVisible();
    await expect(page.getByLabel("Wall length")).toHaveValue("3000");
  });

  test("F14 a datum set on one wall moves only that wall; aligning every wall is an explicit choice with a job-wide preview", async ({ page }) => {
    await openWalls(page, "axon", { walls: [{ name: "Alpha", length: 2400, height: 2700 }, { name: "Bravo", length: 3600, height: 2700 }] });
    const row = (n) => page.locator("[data-wall-row]").filter({ hasText: n });
    await expect(row("Alpha")).toContainText("2 sheets");
    await expect(row("Bravo")).toContainText("3 sheets");
    await page.getByRole("button", { name: "Open Alpha" }).click();
    const setout = page.getByRole("region", { name: "Sheet setout" });
    await expect(setout).toContainText("This wall only");
    await setout.getByLabel(/Setout starts at/).fill("600"); await setout.getByLabel(/Setout starts at/).press("Enter");
    await expect(setout.locator("[data-datum-change]")).toHaveText("Sheets on this wall: 2 → 3");
    await page.getByRole("button", { name: "‹ Walls" }).click();
    await expect(row("Alpha")).toContainText("3 sheets");
    await expect(row("Bravo")).toContainText("3 sheets"); // untouched — before the fix it silently became 4
    await page.getByRole("button", { name: "Open Bravo" }).click();
    await expect(page.getByRole("region", { name: "Sheet setout" }).getByLabel(/Setout starts at/)).toHaveValue("0");
    await page.getByRole("button", { name: "‹ Walls" }).click();
    // explicit "align all": the preview is job-wide
    await page.getByRole("button", { name: "Open Alpha" }).click();
    await setout.getByRole("button", { name: "Use this setout on every wall" }).click();
    await expect(setout.locator("[data-datum-all-change]")).toHaveText("Sheets on all 2 walls using Axon 400 smooth: 6 → 7");
    await page.getByRole("button", { name: "‹ Walls" }).click();
    await expect(row("Bravo")).toContainText("4 sheets");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(row("Bravo")).toContainText("3 sheets");
    await expect(row("Alpha")).toContainText("3 sheets");
  });

  test("F17 a traced elevation outline is labelled 'Traced elevation outline' — never 'Derived from plan + entered heights'", async ({ page }) => {
    const pts = [planPt(0, 3700), planPt(4000, 3700), planPt(4000, 1000), planPt(0, 1600)];
    const outline = { id: "seed-outline-1", kind: "wall", documentId: "doc-plan-c", pageIndex: 0, calibrationId: "cal-1", points: pts, parentId: null, label: null,
      inputs: { kind: "polygon", name: "Outline O", polygon: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 2700 }, { x: 0, y: 2100 }] } };
    await openWalls(page, "axon", { extraMeasurements: [outline], extraContributions: [{ id: "seed-con-outline", measurementId: outline.id, jobMaterialId: "mat-axon", role: "wall" }] });
    await expect(page.locator("[data-wall-row]").filter({ hasText: "Outline O" })).toContainText("Traced outline");
    await page.getByRole("button", { name: "Open Outline O" }).click();
    const dlg = page.getByRole("dialog", { name: "Outline O" });
    await expect(dlg).toContainText("Traced elevation outline");
    await expect(page.locator("[data-provenance]")).toHaveText("Traced elevation outline");
    await expect(dlg).not.toContainText("Derived from plan + entered heights");
  });

  test("F09 studs: an opening's framing detail is entered in its sheet (auto-applied, undoable) and clears 'opening framing incomplete'", async ({ page }) => {
    const errs = consoleErrors(page);
    await openWalls(page, "studs");
    await addWall(page, { name: "Frame A", length: 3600, height: 2400 });
    await addOpeningByNumbers(page, { x: 1000, sill: 900, width: 1200, height: 1200 });
    await expect(page.locator("[data-wall-problems]")).toContainText("W1: base studs only");
    await page.getByRole("button", { name: /^W1/ }).click();
    const fd = page.locator("[data-framing-detail]");
    await expect(fd).toContainText("its framing detail");
    await fd.getByRole("button", { name: "Explicit quantities" }).click();
    const below = fd.getByRole("group", { name: "Below the sill" });
    await below.getByRole("button", { name: "Pieces required" }).click();
    await fd.getByLabel("Below-sill deduction").fill("45"); await fd.getByLabel("Below-sill deduction").press("Enter");
    const above = fd.getByRole("group", { name: "Above the head" });
    await above.getByRole("button", { name: "Pieces required" }).click();
    await fd.getByLabel("Above-head deduction").fill("190"); await fd.getByLabel("Above-head deduction").press("Enter");
    // members: kings at the stud length, jacks to the head, a lintel 90 longer than the opening
    const addMember = async (role, qty, lengthChoice, extra) => {
      await fd.getByRole("button", { name: "Add a member" }).click();
      const r = fd.locator("[data-member-row]").last();
      await r.getByLabel("Member", { exact: true }).selectOption({ label: role });
      await r.getByLabel("Quantity", { exact: true }).fill(String(qty)); await r.getByLabel("Quantity", { exact: true }).press("Enter");
      await r.getByLabel("Length from", { exact: true }).selectOption({ label: lengthChoice });
      if (extra) { await r.getByLabel(extra[0]).fill(String(extra[1])); await r.getByLabel(extra[0]).press("Enter"); }
      await expect(r.locator("[data-member-state]")).toHaveAttribute("data-member-state", "applied");
    };
    await addMember("King stud", 2, "Stud length");
    await expect(fd.locator("[data-framing-state]")).toHaveAttribute("data-framing-state", "complete");
    await addMember("Jack stud", 2, "Head level");
    await addMember("Lintel", 1, "Opening width", ["Adjust", 90]);
    await expect(page.locator("[data-wall-problems]")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Elevation" })).toContainText("studs with explicit opening framing");
    const qty = page.getByRole("region", { name: "Quantities on this wall" });
    await expect(qty).toContainText("Lintel");
    await expect(qty).toContainText("King");
    await expect(qty.locator('[data-status="quantity"]')).not.toHaveAttribute("data-value", "incomplete");
    await noHorizontalScroll(page);
    const small = await page.evaluate(() => [...document.querySelectorAll("[data-framing-detail] button, [data-framing-detail] input, [data-framing-detail] select")]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 43.5 || r.width < 43.5); }).map((el) => el.outerHTML.slice(0, 80)));
    expect(small).toEqual([]);
    await page.screenshot({ path: `${SHOTS}/tc-walls-opening-framing-390x844.png` });
    // undo takes back the last change only (the lintel's adjustment) — still complete
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(fd.locator("[data-member-row]").last().getByLabel("Adjust")).toHaveValue("0");
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(fd.locator("[data-member-row]").last().getByLabel("Adjust")).toHaveValue("90");
    // close + reopen: the stored detail comes back as entered
    await page.getByRole("button", { name: "Close panel" }).click();
    await page.getByRole("button", { name: /^W1/ }).click();
    await expect(fd.getByRole("button", { name: "Explicit quantities" })).toHaveAttribute("aria-pressed", "true");
    await expect(fd.locator("[data-member-row]")).toHaveCount(3);
    await expect(fd.getByLabel("Below-sill deduction")).toHaveValue("45");
    // the engine never claims a design check
    await expect(fd).toContainText("not checked as a design");
    // what is saved is exactly the server's opening.inputs.detail contract (explicit members, same section as the studs)
    await expect.poll(() => page.evaluate(async () => {
      const ws = await (await fetch("/api/takeoff/workspaces/ws-1")).json();
      const o = ws.snapshot.measurements.find((m) => m.kind === "opening" && m.inputs?.label === "W1" && !m.archived);
      return JSON.stringify(o?.inputs?.detail || null);
    })).toBe(JSON.stringify({ source: "explicit", belowSill: { required: true, deductionMm: 45 }, aboveHead: { required: true, deductionMm: 190 }, members: [
      { id: "m1", role: "king", quantity: 2, lengthFrom: "stud", addMm: 0, sameAsStud: true },
      { id: "m2", role: "jack", quantity: 2, lengthFrom: "headLevel", addMm: 0, sameAsStud: true },
      { id: "m3", role: "lintel", quantity: 1, lengthFrom: "openingWidth", addMm: 90, sameAsStud: true }] }));
    expect(errs).toEqual([]);
  });
});
