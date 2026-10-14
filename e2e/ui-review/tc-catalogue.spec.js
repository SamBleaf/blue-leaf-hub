// @ts-check
// TC-R04 catalogue area — setup cards (FamilySetup), the company catalogue editor (CatalogueEditor) and company
// presets by family (MaterialPicker) in UI Review Mode: SYNTHETIC data, mocked backend
// (src/ui-review/fixtures/takeoff.js applies commits and computes with the real computeWorkspace).
//
//   UI_REVIEW_PORT=5195 npx playwright test --config=playwright.ui-review.config.js e2e/ui-review/tc-catalogue.spec.js
//
// Gates covered: UX03 (product/orientation change re-selects cover + assembly and flags old parameters),
// CL05 (AAC: Walsc first, one system, adhesive joint required, missing fixing row explicit), CAT01 (new
// product on an existing method, no code), CAT02 (company template copied twice stays independent; a newer
// company version is reviewed — diff + quantity impact — before an explicit job update), plus timber-cladding
// cover, sheet joint rows, support battens, the accessory recipe (accessory_routes@1: routes, scope, reviewed
// yields / entered quantities, never a default), undo/redo, 375 px layout, keyboard.
//
// CatalogueEditor, FamilyPresetPicker and PresetUpdateReview are not mounted by TakeoffApp yet (glue is outside
// this area), and TakeoffApp doesn't pass the engine `result` to the setup cards yet, so those tests mount the
// real modules from the Vite dev server into the running app page — same React instance, same fake API, the
// real computeWorkspace — instead of skipping.
import { test, expect, chromium } from "@playwright/test";
import { existsSync } from "node:fs";

// Bundled Chromium when installed; otherwise this machine's Google Chrome (same engine) — never a skip.
const channel = existsSync(chromium.executablePath()) ? undefined : "chrome";
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, ...(channel ? { channel } : {}) });

const TAKEOFF = "/carpentry/cjb-1/takeoff?reviewRole=admin";
const P = {
  matrix1190: "James Hardie|Matrix|1190|8#403811",
  matrix2990: "James Hardie|Matrix|1190|8#404169",
  axon133: "James Hardie|Axon 133 smooth|1200|9",
  stria325: "James Hardie|Stria smooth|325|14",
  linea150: "James Hardie|Linea|150|16",
  walsc: "Walsc|External Wall System 50|600|50",
  hebel50: "Hebel|PowerPanel50|600|50",
  cavityBatten: "James Hardie|Hardie Cavity Batten|70|19",
};

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.getAttribute("data-ui-review-ready") === "true", null, { timeout: 30_000 }).catch(() => {});
}
async function openTakeoff(page) {
  await page.goto(TAKEOFF);
  await ready(page);
  await expect(page.getByRole("button", { name: "Add cladding" })).toBeVisible();
}
async function addCladding(page) {
  await openTakeoff(page);
  await page.getByRole("button", { name: "Add cladding" }).click();
  await expect(page.locator('[data-setup="cladding"]')).toBeVisible();
}
const card = (page) => page.locator('[data-setup="cladding"]');
const family = (page, name) => page.locator('[data-chips="family"]').getByRole("button", { name, exact: true }).click();
async function pick(page, key) {
  const change = page.getByRole("button", { name: "Change product" });
  if (await change.isVisible().catch(() => false)) await change.click();
  await page.locator(`[data-product-option="${key}"]`).click();
  await expect(page.locator(`[data-chosen-product="${key}"]`)).toBeVisible();
}
async function enter(locator, value) {
  await locator.fill(String(value));
  await locator.press("Enter");
}
/** The fake server's current snapshot (what autosave actually committed). */
async function server(page) {
  return page.evaluate(async () => (await (await fetch("/api/takeoff/workspaces/ws-1")).json()));
}
const EMPTY = { spec: { product: {} }, rules: {}, methodKey: null };
/** The (single) non-flashing material as the server holds it; an empty shape until autosave has landed. */
async function genericMaterial(page) {
  const s = await server(page);
  const m = s.snapshot.materials.find((x) => x.spec?.family && x.spec.family !== "flashing");
  return m ? { ...m, spec: { ...m.spec, product: m.spec.product || {} }, rules: m.rules || {} } : EMPTY;
}
/** Evidence screenshot into this test's Playwright output folder (TC_SHOTS=<dir> to collect them elsewhere). */
const shot = (page, name) => page.screenshot({ path: process.env.TC_SHOTS ? `${process.env.TC_SHOTS}/${name}.png` : test.info().outputPath(`${name}.png`) });
const noText = (page, sel, text) => expect(page.locator(sel, { hasText: text })).toHaveCount(0);

/** Mount a real component module into the running app (same React instance) on a phone-sized overlay. */
async function mount(page, kind, init = {}) {
  await page.evaluate(async ({ kind, init }) => {
    const path = kind === "editor" ? "/src/components/takeoff/CatalogueEditor.jsx" : kind === "setup" ? "/src/components/takeoff/FamilySetup.jsx" : "/src/components/takeoff/MaterialPicker.jsx"; // presets + update
    const src = await (await fetch(path)).text();
    const reactUrl = /["'](\/node_modules\/\.vite\/deps\/react\.js\?v=[^"']+)["']/.exec(src)?.[1];
    if (!reactUrl) throw new Error("React module URL not found in the transformed module");
    const React = (await import(reactUrl)).default;
    const dom = await import(reactUrl.replace("/react.js", "/react-dom_client.js"));
    const createRoot = dom.createRoot || dom.default?.createRoot;
    const mod = await import(path);
    const { createStaffTakeoffApi } = await import("/src/lib/takeoffApi.js");
    window.__tc = { changes: [], saved: null, cancelled: false, used: [], edited: null, created: null, updated: null, kept: false };
    window.__tcRoot?.unmount();
    document.getElementById("tc-harness")?.remove();
    const host = document.createElement("div");
    host.id = "tc-harness";
    host.style.cssText = "position:fixed;inset:0;z-index:2147483000;overflow:auto;background:#F8F9FA;padding:12px";
    document.body.appendChild(host);
    const root = createRoot(host);
    window.__tcRoot = root;
    if (kind === "editor") {
      const Harness = () => {
        const [v, setV] = React.useState(init.value || null);
        return React.createElement(mod.default, {
          value: v, canEditStandards: init.canEditStandards !== false,
          onChange: (x) => { window.__tc.changes.push(x); setV(x); },
          onSave: (x) => { window.__tc.saved = JSON.parse(JSON.stringify(x)); },
          onCancel: () => { window.__tc.cancelled = true; },
        });
      };
      root.render(React.createElement(Harness));
    } else if (kind === "setup") {
      // CladdingSetup with the engine's materialResults entry for one wall — the `result` glue TakeoffApp will pass.
      // init.material = a full job material, or init.family + init.groupId = a researched catalogue product.
      const T = await import("/shared/takeoff/index.js");
      const PR = await import("/shared/takeoff/products/index.js");
      let first = init.material;
      if (!first) {
        const g = PR.productGroups({ family: init.family }).find((x) => x.id === init.groupId);
        first = { id: "mat-h", name: g.name, methodKey: init.methodKey, methodVersion: init.methodVersion, spec: PR.specFromGroup(g), rules: init.rules || {} };
      }
      // init.wallMm = null → nothing measured yet (no wall linked)
      const wall = init.wallMm ? { id: "w-h", kind: "wall", inputs: { kind: "rect", widthMm: init.wallMm[0], heightMm: init.wallMm[1], name: "W1" } } : null;
      const openings = wall ? (init.openings || []).map((o, i) => ({ id: `o-h${i}`, kind: "opening", parentId: wall.id, inputs: o })) : [];
      const others = init.others || []; // e.g. cladding on the same wall (its joints feed accessory joint routes)
      // the `result` (materialResults entry) and `lines` (this material's schedule lines) glue TakeoffApp will pass
      const compute = (m) => {
        const ws = T.computeWorkspace({ workspace: { id: "ws-h", revision: 1 }, documents: [], calibrations: [], measurements: wall ? [wall, ...openings] : [], materials: [...others, m],
          contributions: wall ? [...others, m].map((x, i) => ({ id: `c-h${i}`, measurementId: wall.id, jobMaterialId: x.id, role: "wall" })) : [] });
        return { result: ws.materialResults[m.id], lines: ws.scheduleLines.filter((l) => l.jobMaterialIds.includes(m.id)) };
      };
      const Harness = () => {
        const [m, setM] = React.useState(first);
        const out = React.useMemo(() => compute(m), [m]);
        window.__tc.result = out.result;
        window.__tc.material = m;
        window.__tc.setValue = setM; // a newer version arriving from outside (server normalisation, recovery)
        return React.createElement(mod.CladdingSetup, { value: m, result: out.result, lines: out.lines, onChange: (x) => { window.__tc.changes.push(x); setM({ ...m, ...x }); } });
      };
      root.render(React.createElement(Harness));
    } else if (kind === "update") {
      // PresetUpdateReview against this job's own snapshot (ws.view in TakeoffApp) plus one extra wall for the copy
      const snap = (await (await fetch("/api/takeoff/workspaces/ws-1")).json()).snapshot;
      const preset = (await (await fetch("/api/takeoff/presets")).json()).presets.find((p) => p.id === init.presetId);
      const wall = { id: "w-u", kind: "wall", inputs: { kind: "rect", widthMm: 4800, heightMm: 2700, name: "Update wall" } };
      const snapshot = { ...snap, measurements: [...snap.measurements, wall], materials: [...snap.materials, init.material],
        contributions: [...snap.contributions, { id: "c-u", measurementId: wall.id, jobMaterialId: init.material.id, role: "wall" }] };
      root.render(React.createElement(mod.PresetUpdateReview, { material: init.material, preset, snapshot,
        onUpdate: (rec) => { window.__tc.updated = JSON.parse(JSON.stringify(rec)); }, onKeep: () => { window.__tc.kept = true; } }));
    } else {
      const api = createStaffTakeoffApi();
      root.render(React.createElement(mod.FamilyPresetPicker, {
        api, families: init.families, canEditStandards: true,
        onUse: (rec) => { window.__tc.used.push(rec); },
        onEdit: (p) => { window.__tc.edited = p; },
        onNew: (f) => { window.__tc.created = f; },
      }));
    }
  }, { kind, init });
  await expect(page.locator("#tc-harness")).toBeVisible();
}
async function unmount(page) {
  await page.evaluate(() => { window.__tcRoot?.unmount(); window.__tcRoot = null; document.getElementById("tc-harness")?.remove(); });
}
async function postPreset(page, body) {
  return page.evaluate(async (b) => (await (await fetch("/api/takeoff/presets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json()), body);
}
/** Leave the takeoff and come back inside the SPA (keeps the in-page fake server's state). */
async function reopenTakeoff(page) {
  await page.evaluate(() => { window.history.pushState({}, "", "/home?reviewRole=admin"); window.dispatchEvent(new PopStateEvent("popstate", { state: {} })); });
  await page.waitForTimeout(300);
  await page.evaluate((p) => { window.history.pushState({}, "", p); window.dispatchEvent(new PopStateEvent("popstate", { state: {} })); }, TAKEOFF);
  await expect(page.getByRole("button", { name: "Add cladding" })).toBeVisible({ timeout: 30_000 });
}

// ── UX03 ─────────────────────────────────────────────────────────────────────────────────────────────────────
test("UX03: a Matrix joint gap and strip are flagged — never carried onto Axon — and offered back for another Matrix", async ({ page }) => {
  await addCladding(page);
  await pick(page, P.matrix1190);
  const gap = page.getByLabel("Expressed joint gap");
  await expect(gap).toHaveValue("10"); // sourced H10 assembly parameter
  await expect(card(page)).toContainText("sourced assembly parameter (H10)");
  await enter(gap, 12);
  await page.locator("[data-advanced] summary").click();
  await enter(page.getByLabel("Minimum cut strip (from the system detail)"), 150);
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.spec.product.gapMm, m.rules.minStripMm]; }).toEqual([12, 150]);

  await pick(page, P.axon133);
  const flags = page.locator("[data-carried]");
  await expect(flags).toBeVisible();
  const gapFlag = flags.locator('[data-carried-param="productGapMm"]');
  await expect(gapFlag).toContainText("Joint gap 12 mm");
  await expect(gapFlag).toContainText("doesn't apply to Axon 133 smooth");
  await expect(gapFlag.getByRole("button", { name: /^Use / })).toHaveCount(0);
  await expect(flags.locator('[data-carried-param="minStripMm"]')).toContainText("Minimum cut strip 150 mm");
  await expect(page.locator("[data-product-facts]")).toContainText("effective cover 1,200 mm");
  await expect(page.locator('[data-assembly="axon-vertical"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Expressed joint gap")).toHaveCount(0);
  await shot(page, "ux03-matrix-to-axon-flags");
  // what was actually saved: new cover + assembly; the old gap/strip are NOT active parameters
  await expect.poll(async () => {
    const m = await genericMaterial(page);
    return { cover: m.spec.product.effectiveCoverMm, gap: m.spec.product.gapMm ?? null, assembly: m.spec.assemblyId, strip: m.rules.minStripMm ?? null, method: m.methodKey, carried: Object.keys(m.rules.carried || {}).sort() };
  }).toEqual({ cover: 1200, gap: null, assembly: "axon-vertical", strip: null, method: "sheet_layout", carried: ["minStripMm", "productGapMm"] });

  // another Matrix size: its own sourced 10 mm applies; the old 12 mm is offered, not applied
  await pick(page, P.matrix2990);
  await expect(page.getByLabel("Expressed joint gap")).toHaveValue("10");
  const offer = page.locator('[data-carried-param="productGapMm"]');
  await expect(offer).toContainText("confirm it for");
  await offer.getByRole("button", { name: /^Use 12 mm/ }).click();
  await expect(page.getByLabel("Expressed joint gap")).toHaveValue("12");
  await expect(page.locator('[data-carried-param="productGapMm"]')).toHaveCount(0);
  await page.locator('[data-carried-param="minStripMm"]').getByRole("button", { name: "Discard" }).click();
  await expect(page.locator("[data-carried]")).toHaveCount(0);
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.spec.product.gapMm, m.spec.product.sku, m.rules.carried ?? null, m.rules.minStripMm ?? null]; }).toEqual([12, "404169", null, null]);
});

test("UX03: changing a course product's orientation re-selects its assembly; Linea is horizontal-only", async ({ page }) => {
  await addCladding(page);
  await pick(page, P.stria325);
  const orient = page.locator('[data-chips="orientation"]');
  await expect(orient.getByRole("button", { name: "Vertical boards" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-assembly="stria-smooth-vertical"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-assembly="stria-smooth-horizontal"]')).toHaveCount(0);
  await orient.getByRole("button", { name: "Horizontal courses" }).click();
  await expect(page.locator('[data-assembly="stria-smooth-horizontal"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-assembly="stria-smooth-vertical"]')).toHaveCount(0);
  await expect(page.locator('[data-assembly="stria-smooth-horizontal"]')).toContainText("Candidate — not reviewed");
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.spec.orientation, m.spec.assemblyId, m.spec.product.effectiveCoverMm]; }).toEqual(["horizontal", "stria-smooth-horizontal", 300]);

  await pick(page, P.linea150);
  await expect(page.locator("[data-product-facts]")).toContainText("effective cover 120 mm");
  await expect(orient.getByRole("button", { name: "Vertical boards" })).toBeDisabled();
  await expect(card(page)).toContainText("listed for horizontal installation only");
  await expect(page.locator('[data-assembly="linea-horizontal"]')).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.spec.orientation, m.spec.assemblyId, m.spec.product.effectiveCoverMm, m.spec.product.sourceRefs]; })
    .toEqual(["horizontal", "linea-horizontal", 120, ["H03"]]);
  await page.locator('[data-assembly-picker] [data-source-refs] summary').click();
  await expect(page.locator("[data-assembly-picker]")).toContainText("H04 — Linea installation guide (Nov 2025)");
});

test("Assembly fixing route: Direct fix / Cavity is chosen, never assumed; supports guidance follows it; a product change flags it", async ({ page }) => {
  await addCladding(page);
  await pick(page, P.axon133);
  const route = page.locator('[data-chips="route"]');
  for (const b of ["Direct fix", "Cavity"]) await expect(route.getByRole("button", { name: b })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('[data-component="Supports"]')).toContainText("Choose direct fix or cavity");
  await route.getByRole("button", { name: "Cavity" }).click();
  await expect(page.locator('[data-component="Supports"]')).toContainText("Cavity: add a Support battens material");
  await expect.poll(async () => (await genericMaterial(page)).rules.route ?? null).toBe("cavity");
  await pick(page, P.linea150);
  await expect(page.locator('[data-carried-param="route"]')).toContainText("Fixing route cavity was set for Axon 133 smooth");
  await expect(route.getByRole("button", { name: "Cavity" })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.rules.route ?? null, m.rules.carried?.route?.value ?? null]; }).toEqual([null, "cavity"]);
  await page.locator('[data-carried-param="route"]').getByRole("button", { name: /^Use cavity/ }).click();
  await expect(route.getByRole("button", { name: "Cavity" })).toHaveAttribute("aria-pressed", "true");
});

// ── CL05 ─────────────────────────────────────────────────────────────────────────────────────────────────────
test("CL05: AAC lists Walsc first, stays one system, needs the adhesive joint entered and shows the missing fixing row", async ({ page }) => {
  await addCladding(page);
  await family(page, "AAC (Walsc first)");
  const options = page.locator("[data-product-option]");
  await expect(options.first()).toHaveAttribute("data-product-option", P.walsc);
  await expect(options.first()).toContainText("Company preference");
  await expect(page.locator("[data-needs]")).toContainText("Choose the product.");
  await expect.poll(async () => (await genericMaterial(page)).spec.family).toBe("aac");

  await pick(page, P.walsc);
  await expect(page.locator("[data-aac-system]")).toContainText("One system per material: Walsc External Wall System 50");
  await expect(page.locator("[data-aac-system]")).toContainText("never mixed");
  const adhesive = page.getByLabel("Approved adhesive joint (system value)");
  await expect(adhesive).toHaveValue(""); // never defaulted
  await expect(page.locator("[data-needs]")).toContainText("approved adhesive joint");
  await expect(page.locator('[data-component="Fixings"]')).toContainText("No reviewed fixing row is active for Walsc External Wall System 50 — fixings are unresolved (not zero).");
  await expect(page.locator('[data-component="Rails"]')).toContainText("isn't seeded");
  await expect(page.locator('[data-assembly="walsc50"]')).toContainText("0 reviewed rule rows · automatic fixings off");
  await expect(page.locator('[data-status="installation"]')).toHaveAttribute("data-value", "source-pending");
  await shot(page, "cl05-walsc-needs");
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.spec.product.manufacturer, m.methodKey, m.rules.adhesiveJointMm ?? null, m.spec.assemblyId]; })
    .toEqual(["Walsc", "aac_panel_layout", null, "walsc50"]);

  await enter(adhesive, 3);
  await noText(page, "[data-needs]", "adhesive joint");
  await expect.poll(async () => (await genericMaterial(page)).rules.adhesiveJointMm).toBe(3);

  // a different AAC system: the old system value is flagged, NOT reused; products never mix
  await pick(page, P.hebel50);
  await expect(page.getByLabel("Approved adhesive joint (system value)")).toHaveValue("");
  const flag = page.locator('[data-carried-param="adhesiveJointMm"]');
  await expect(flag).toContainText("Adhesive joint 3 mm");
  await expect(flag).toContainText("was set for Walsc External Wall System 50");
  await expect(flag).toContainText("confirm it for Hebel PowerPanel50");
  await expect(page.locator("[data-needs]")).toContainText("approved adhesive joint");
  await expect.poll(async () => {
    const m = await genericMaterial(page);
    return { mf: m.spec.product.manufacturer, lengths: m.spec.product.lengthsMm, skus: (m.spec.product.skus || []).map((k) => k.sku), adhesive: m.rules.adhesiveJointMm ?? null, carried: m.rules.carried?.adhesiveJointMm?.value ?? null, assembly: m.spec.assemblyId };
  }).toEqual({ mf: "Hebel", lengths: [2400, 2550, 2700, 2850, 3000], skus: ["99939", "133805", "162758", "162756", "162760"], adhesive: null, carried: 3, assembly: "hebel50" });
  await shot(page, "cl05-walsc-to-hebel-flag");
  await flag.getByRole("button", { name: /^Use 3 mm/ }).click();
  await expect(page.getByLabel("Approved adhesive joint (system value)")).toHaveValue("3");
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.rules.adhesiveJointMm, m.rules.carried ?? null]; }).toEqual([3, null]);
});

test("CL05 + statuses: on a real wall the card shows the engine's three statuses, the adhesive-joint block and the unresolved fixing row", async ({ page }) => {
  await openTakeoff(page);
  await mount(page, "setup", { family: "aac", groupId: P.walsc, methodKey: "aac_panel_layout", methodVersion: 1, wallMm: [4800, 2700] });
  const h = page.locator("#tc-harness");
  await expect(h.locator('[data-status="quantity"]')).toHaveAttribute("data-value", "incomplete");
  await expect(h.locator("[data-engine-problems]")).toContainText("Enter the system's approved adhesive/joint width");
  await enter(h.getByLabel("Approved adhesive joint (system value)"), 3);
  await expect(h.locator('[data-status="quantity"]')).toHaveAttribute("data-value", "calculated");
  await expect(h.locator("[data-engine-problems]")).toContainText("no reviewed fixing row is active for Walsc External Wall System 50 — fixings are unresolved (not zero)");
  // the installation status is whatever the engine says — the card never upgrades it
  const engine = await page.evaluate(() => window.__tc.result.status);
  await expect(h.locator('[data-status="installation"]')).toHaveAttribute("data-value", engine.installation);
  expect(engine.installation).not.toBe("supported-by-selected-rule");
  await shot(page, "cl05-engine-statuses");
});

// ── timber cladding cover (12) ──────────────────────────────────────────────────────────────────────────────
test("Timber cladding: cover chips 70/90/120/140 + other, no default, and a supplier change requires the cover again", async ({ page }) => {
  await addCladding(page);
  await family(page, "Timber cladding");
  const cover = page.locator('[data-chips="cover"]');
  for (const c of ["70 mm", "90 mm", "120 mm", "140 mm"]) await expect(cover.getByRole("button", { name: c, exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-needs]")).toContainText("Effective cover is needed");
  await cover.getByRole("button", { name: "90 mm", exact: true }).click();
  await enter(page.getByLabel("Species / profile"), "Spotted gum shiplap");
  await enter(page.getByLabel("Supplier", { exact: true }), "Supplier A");
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.spec.product.effectiveCoverMm, m.spec.supplierName, m.methodKey]; }).toEqual([90, "Supplier A", "area_to_linear"]);
  await noText(page, "[data-needs]", "Effective cover");

  await enter(page.getByLabel("Supplier", { exact: true }), "Supplier B");
  const flag = page.locator('[data-carried-param="coverMm"]');
  await expect(flag).toContainText("Effective cover 90 mm was set for Spotted gum shiplap from Supplier A");
  await expect(cover.getByRole("button", { name: "90 mm", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-needs]")).toContainText("Effective cover is needed");
  await expect.poll(async () => (await genericMaterial(page)).spec.product.effectiveCoverMm ?? null).toBeNull();
  await shot(page, "timber-cover-supplier-change");
  await flag.getByRole("button", { name: /^Use 90 mm/ }).click();
  await expect.poll(async () => (await genericMaterial(page)).spec.product.effectiveCoverMm).toBe(90);

  await enter(page.getByLabel("Other effective cover"), 135);
  await expect(cover.getByRole("button", { name: "90 mm", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await genericMaterial(page)).spec.product.effectiveCoverMm).toBe(135);
  await page.locator('[data-chips="supply"]').getByRole("button", { name: "Fixed lengths (boards)" }).click();
  await expect.poll(async () => (await genericMaterial(page)).methodKey).toBe("course_layout");
});

// ── sheet joint rows (advanced) ────────────────────────────────────────────────────────────────────────────
test("Sheet joint rows: a draft until positions + gap + detail are all entered; removing clears them", async ({ page }) => {
  await addCladding(page);
  await pick(page, P.axon133);
  await page.locator("[data-advanced] summary").click();
  const rows = page.locator("[data-joint-rows]");
  await enter(rows.getByLabel("Joint height(s) above the clad base"), "2400");
  await enter(rows.getByLabel("Joint gap (from the detail)"), 10);
  await expect(rows).toContainText("Kept as a draft");
  await expect.poll(async () => (await genericMaterial(page)).rules.jointRows ?? null).toBeNull();
  await enter(rows.getByLabel("Joint detail reference"), "H02 horizontal joint detail");
  await expect(rows).toContainText("Applied");
  await expect.poll(async () => (await genericMaterial(page)).rules.jointRows).toEqual({ atMm: [2400], gapMm: 10, detailRef: "H02 horizontal joint detail" });
  await rows.getByRole("button", { name: "Remove joint rows" }).click();
  await expect.poll(async () => (await genericMaterial(page)).rules.jointRows ?? null).toBeNull();
});

// ── support battens ────────────────────────────────────────────────────────────────────────────────────────
test("Support battens: max spacing is required and never defaulted; offsets / existing saved; orientation change flags spacing", async ({ page }) => {
  await addCladding(page);
  await family(page, "Support battens");
  await expect(page.locator('[data-setup="batten"]')).toBeVisible();
  const spacing = page.getByLabel("Maximum support spacing");
  await expect(spacing).toHaveValue("");
  await expect(page.locator("[data-needs]")).toContainText("maximum support spacing");
  await noText(page, "[data-needs]", "Effective cover");
  await pick(page, P.cavityBatten);
  await expect(page.locator('[data-component="Fixings"]')).toContainText("Fixings not quantified — detail required.");
  await enter(spacing, 600);
  await enter(page.getByLabel(/Spacing authority/), "H02 Table 1 N2 — SM");
  await enter(page.getByLabel("Start offset"), 50);
  await page.getByLabel("These supports already exist (layout only — not purchased)").check();
  await expect(page.locator("[data-needs]")).toHaveCount(0);
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.methodKey, m.rules.maxSpacingMm, m.rules.spacingRef, m.rules.startOffsetMm, m.rules.existing, m.spec.product.name]; })
    .toEqual(["support_grid", 600, "H02 Table 1 N2 — SM", 50, true, "Hardie Cavity Batten"]);
  await page.locator('[data-chips="orientation"]').getByRole("button", { name: "Horizontal battens" }).click();
  await expect(page.locator('[data-carried-param="maxSpacingMm"]')).toContainText("Max support spacing 600 mm was set for Hardie Cavity Batten (vertical)");
  await expect(page.getByLabel("Maximum support spacing")).toHaveValue("");
  await expect.poll(async () => (await genericMaterial(page)).rules.maxSpacingMm ?? null).toBeNull();
  await shot(page, "batten-orientation-flag");
});

// ── accessories: the accessory_routes@1 recipe ─────────────────────────────────────────────────────────────
const addItem = (page, label) => page.locator("[data-accessory-recipe]").getByLabel("Add an item").selectOption({ label });
const item = (page, id) => page.locator(`[data-accessory-group="${id}"]`);

test("Accessories: items follow real routes with Include / By others / Exclude; consumables need a reviewed yield — never a default", async ({ page }) => {
  await addCladding(page);
  await family(page, "Accessories");
  const acc = page.locator('[data-setup="accessory"]');
  await expect(acc).toContainText("Source-pending — manual quantities.");
  await expect(page.locator("[data-needs]")).toContainText("Add the accessory items this set includes.");
  await enter(acc.getByLabel("Accessory set (e.g. system or supplier pack)"), "Axon accessories");

  // a starter runs along the base; it needs its exact product and stock lengths
  await addItem(page, "Starter / base trim");
  const st = item(page, "starter");
  await expect(st.locator('[data-chips="routes-starter"]').getByRole("button", { name: "Base", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(st.locator("[data-group-needs]")).toContainText("Enter the stock length(s).");
  await enter(st.getByLabel("Item (exact product)"), "Hardie base trim");
  await enter(st.getByLabel("Stock length(s)"), "3000, 5400");
  await st.getByLabel("Leave out door openings (per the detail)").check();
  await expect(st.locator("[data-group-needs]")).toHaveCount(0);

  // mesh: no coverage is assumed; the yield is used only once checked against its source
  await addItem(page, "Mesh");
  const mesh = item(page, "mesh");
  await expect(mesh.locator("[data-group-needs]")).toContainText("no default usage is assumed");
  const checked = mesh.getByLabel("I've checked this yield against that source");
  await expect(checked).toBeDisabled();
  await enter(mesh.getByLabel("Item (exact product)"), "Render mesh 1 × 50 m");
  await mesh.getByLabel("Bought as").selectOption("roll");
  await enter(mesh.getByLabel("Each roll covers"), 45);
  await enter(mesh.getByLabel("Yield source (document, edition, page / table)"), "Supplier TDS-77 p2");
  await checked.check();
  await expect(mesh.locator("[data-group-needs]")).toHaveCount(0);

  // membrane by others: recorded as omitted, with its reason
  await addItem(page, "Membrane / wrap");
  const mem = item(page, "membrane");
  await mem.locator('[data-chips="scope-membrane"]').getByRole("button", { name: "By others" }).click();
  await expect(mem.locator("[data-group-needs]")).toContainText("Record why it's by others.");
  await enter(mem.getByLabel("Why it's by others"), "Wrap by the framer");
  await expect(mem).toContainText("Recorded as omitted on the order review — not as zero.");

  // corner trims: an entered quantity with its authority (corners can't be tagged on walls yet)
  await addItem(page, "Other item (entered quantity)");
  const man = item(page, "manual");
  await expect(acc.locator("[data-accessory-recipe]")).toContainText("corners can't be tagged on walls yet");
  await enter(man.getByLabel("Item (exact product)"), "External corner 3000");
  await enter(man.getByLabel("Quantity per wall"), 2);
  await man.getByLabel("Unit").selectOption("piece");
  await enter(man.getByLabel("Quantity from (detail, schedule or reviewer)"), "BL-DET-07 corner schedule");
  await expect(page.locator("[data-needs]")).toHaveCount(0);
  await shot(page, "accessory-recipe");

  await expect.poll(async () => { const m = await genericMaterial(page); return [m.methodKey, m.rules.recipe]; }).toEqual(["accessory_routes", { groups: [
    { id: "starter", kind: "starter", scope: { status: "include" }, routes: ["base"], label: "Hardie base trim", stockPolicy: { kind: "list", lengthsMm: [3000, 5400] }, excludeDoors: true },
    { id: "mesh", kind: "mesh", scope: { status: "include" }, basis: "net-area", label: "Render mesh 1 × 50 m", yield: { unit: "roll", reviewed: true, per: 45, ref: "Supplier TDS-77 p2" } },
    { id: "membrane", kind: "membrane", scope: { status: "by-others", reason: "Wrap by the framer" }, mode: "estimate", openingPolicy: "none" },
    { id: "manual", kind: "manual", scope: { status: "include" }, label: "External corner 3000", manualQuantity: { quantity: 2, unit: "piece", authority: "BL-DET-07 corner schedule" } },
  ] }]);
  // changing the yield un-checks it (it must be checked again)
  await enter(mesh.getByLabel("Each roll covers"), 50);
  await expect(checked).not.toBeChecked();
  await expect.poll(async () => (await genericMaterial(page)).rules.recipe?.groups?.[1]?.yield).toEqual({ unit: "roll", reviewed: false, per: 50, ref: "Supplier TDS-77 p2" });

  // UX03: the recipe doesn't apply to fibre cement — flagged, not applied — and is offered back for accessories
  await family(page, "Fibre cement");
  await expect(page.locator('[data-carried-param="recipe"]')).toContainText("doesn't apply");
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.methodKey, m.rules.recipe ?? null, (m.rules.carried?.recipe?.value?.groups || []).length]; }).toEqual(["sheet_layout", null, 4]);
  await family(page, "Accessories");
  await page.locator('[data-carried-param="recipe"]').getByRole("button", { name: /^Use \(4 items\)/ }).click();
  await expect.poll(async () => { const m = await genericMaterial(page); return [(m.rules.recipe?.groups || []).length, m.rules.carried ?? null]; }).toEqual([4, null]);
});

test("Accessories on a real wall: per-item engine state; unresolved until a reviewed yield; scope reason; project detail", async ({ page }) => {
  await openTakeoff(page);
  const material = { id: "mat-acc", name: "Axon accessories", methodKey: "accessory_routes", methodVersion: 1,
    spec: { family: "accessory", product: { name: "Axon accessories" } },
    rules: { recipe: { groups: [
      { id: "starter", kind: "starter", label: "Base trim", routes: ["base"], scope: { status: "include" }, stockPolicy: { kind: "list", lengthsMm: [5400] } },
      { id: "mesh", kind: "mesh", label: "Render mesh", basis: "net-area", scope: { status: "include" } },
      { id: "tape", kind: "tape", label: "Window tape", routes: [], scope: { status: "exclude" } },
    ] } } };
  await mount(page, "setup", { material, wallMm: [4800, 2700], openings: [{ xMm: 1500, sillMm: 900, widthMm: 900, heightMm: 900, label: "W1", type: "window" }] });
  const h = page.locator("#tc-harness");
  await expect(h.locator('[data-accessory-group="starter"] button[aria-expanded]')).toContainText("Calculated");
  await expect(h.locator('[data-accessory-group="mesh"] button[aria-expanded]')).toContainText("Unresolved");
  await expect(h.locator('[data-accessory-group="tape"] button[aria-expanded]')).toContainText("Not ordered");
  await expect(h.locator('[data-status="quantity"]')).toHaveAttribute("data-value", "incomplete");
  // nothing is quantified for the mesh, and nothing is zero: no mesh demand exists
  expect(await page.evaluate(() => window.__tc.result.demands.filter((d) => d.role === "mesh").length)).toBe(0);
  expect(await page.evaluate(() => window.__tc.result.demands.filter((d) => d.role === "starter").map((d) => d.lengthMm))).toEqual([4800]);
  await h.locator('[data-accessory-group="mesh"] button[aria-expanded]').click();
  await expect(h.locator('[data-accessory-group="mesh"] [data-group-problems]')).toContainText("no default usage is assumed");
  const mesh = h.locator('[data-accessory-group="mesh"]');
  await mesh.getByLabel("Bought as").selectOption("roll");
  await enter(mesh.getByLabel("Each roll covers"), 10);
  await enter(mesh.getByLabel("Yield source (document, edition, page / table)"), "TDS-77 p2");
  await expect(h.locator('[data-accessory-group="mesh"] button[aria-expanded]')).toContainText("Unresolved"); // not yet checked
  await mesh.getByLabel("I've checked this yield against that source").check();
  await expect(h.locator('[data-accessory-group="mesh"] button[aria-expanded]')).toContainText("Calculated");
  // net area = 4.8 × 2.7 − 0.9 × 0.9 = 12.15 m² → 1.215 rolls (rounded once for the job on the schedule)
  expect(await page.evaluate(() => window.__tc.result.demands.filter((d) => d.role === "mesh").map((d) => Math.round(d.quantity * 1000) / 1000))).toEqual([1.215]);
  // the excluded tape still needs its reason (an omission is recorded, never silent)
  await expect(h.locator("[data-engine-problems]")).toContainText("tape is marked exclude — record the reason.");
  await h.locator('[data-accessory-group="tape"] button[aria-expanded]').click();
  await enter(h.locator('[data-accessory-group="tape"]').getByLabel("Why it's excluded"), "Windows pre-taped");
  await expect(h.getByText("record the reason")).toHaveCount(0); // (with nothing left open the problems list is gone entirely)
  // installation is whatever the engine says: unspecified without a detail, project detail once one is recorded
  await expect(h.locator('[data-status="installation"]')).toHaveAttribute("data-value", "unspecified");
  await enter(h.getByLabel("Project detail that specifies this set (optional)"), "BL-DET-07 rev B");
  await expect(h.locator('[data-status="installation"]')).toHaveAttribute("data-value", "project-detail-supplied");
  expect(await page.evaluate(() => window.__tc.result.status.installation)).toBe("project-detail-supplied");
  const overflow = await page.evaluate(() => { const el = document.getElementById("tc-harness"); return el.scrollWidth - el.clientWidth; });
  expect(overflow).toBeLessThanOrEqual(0);
  await shot(page, "accessory-engine-states");
});

test("Accessories: sealant volume needs bead size + count; cartridges need the product's own size and usable fraction", async ({ page }) => {
  await addCladding(page);
  await family(page, "Accessories");
  await addItem(page, "Sealant");
  const g = item(page, "sealant");
  await expect(g.locator("[data-group-needs]")).toContainText("Add the bead routes.");
  await g.getByRole("button", { name: "Add a bead route" }).click();
  const r = g.locator('[data-sealant-route="0"]');
  await r.getByLabel("Along").selectOption("opening-perimeter");
  await enter(r.getByLabel("Beads"), 1);
  await r.locator('[data-chips="bead-sealant-0"]').getByRole("button", { name: "W × D" }).click();
  await enter(r.getByLabel("Joint width"), 10);
  await enter(r.getByLabel("Joint depth"), 6);
  await expect(g.locator("[data-group-needs]")).not.toContainText("bead count and bead size");
  await expect(g.locator("[data-group-needs]")).toContainText("Cartridge size and usable fraction");
  await enter(g.getByLabel("Cartridge size"), 600);
  await enter(g.getByLabel("Usable per cartridge"), 90);
  await expect.poll(async () => { const s = (await genericMaterial(page)).rules.recipe?.groups?.[0] || {}; return [s.routes, s.cartridgeMl, s.applicationYield]; })
    .toEqual([[{ id: "r1", source: "opening-perimeter", crossSection: { shape: "rect", widthMm: 10, depthMm: 6 }, beadCount: 1 }], 600, 0.9]);
  // 375 px: the open item still fits, every control ≥ 44 px
  await page.setViewportSize({ width: 375, height: 812 });
  const m = await page.evaluate(() => {
    const small = [];
    for (const el of document.querySelectorAll('[data-setup="accessory"] button, [data-setup="accessory"] input:not([type=checkbox]), [data-setup="accessory"] select')) {
      const b = el.getBoundingClientRect();
      if (b.width && b.height && b.height < 43.5) small.push(`${el.tagName} ${(el.textContent || "").trim().slice(0, 30)} ${b.height}`);
    }
    const sc = document.querySelector('[data-setup="cladding"]').closest(".overflow-y-auto");
    return { doc: document.documentElement.scrollWidth, sc: sc ? sc.scrollWidth - sc.clientWidth : 0, small };
  });
  expect(m.doc).toBeLessThanOrEqual(375);
  expect(m.sc).toBeLessThanOrEqual(0);
  expect(m.small).toEqual([]);
});

// ── timber + aluminium cards (same auto-apply / undo plumbing) ─────────────────────────────────────────────
test("Timber setup: purpose, section, centres and pitch auto-apply; stock is the 1200 + 600 grid; size stays a manual selection", async ({ page }) => {
  await openTakeoff(page);
  await page.getByRole("button", { name: "Add timber" }).click();
  const t = page.locator('[data-setup="timber"]');
  await expect(t).toBeVisible();
  await expect(t).toContainText("1200 mm, then every 600 mm");
  await expect(t).toContainText("The app does not check structural adequacy.");
  await enter(t.getByLabel("Section depth"), 90);
  await enter(t.getByLabel("Section width"), 45);
  await enter(t.getByLabel("Pitch"), 27);
  await enter(t.getByLabel("Grade (e.g. MGP10)"), "MGP10"); // text applies on Enter / blur — one change, not one per key (PH-03)
  await enter(t.getByLabel("Treatment (e.g. H3)"), "H3");
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.methodKey, m.spec.section, m.rules.pitchDeg, m.rules.centresMm, m.spec.grade, m.spec.treatment]; })
    .toEqual(["repeated_members", { depthMm: 90, widthMm: 45 }, 27, 600, "MGP10", "H3"]);
  // unavailable lengths may only REMOVE grid lengths — an off-grid entry is refused and nothing is saved
  const unavailable = t.getByLabel("Grid lengths this supplier doesn't stock (optional)");
  await enter(unavailable, "6500");
  await expect(t).toContainText("Only grid lengths (1200, 1800, 2400 …) can be marked unavailable");
  await enter(unavailable, "6600");
  await expect.poll(async () => (await genericMaterial(page)).spec.stock.unavailableMm).toEqual([6600]);
  await t.locator('[data-chips="purpose"]').getByRole("button", { name: "Studs" }).click();
  await expect.poll(async () => (await genericMaterial(page)).methodKey).toBe("wall_frame");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await genericMaterial(page)).methodKey).toBe("repeated_members");
  // the app passes the engine result: nothing measured yet reads "Not measured yet" (never Calculated / Incomplete)
  await expect(t.locator('[data-status="quantity"]')).toHaveAttribute("data-value", "pending");
  await expect(t.locator('[data-status="quantity"]')).toContainText("Not measured yet");
});

test("Aluminium setup: kerf must be confirmed before ordering; edits auto-apply", async ({ page }) => {
  await openTakeoff(page);
  await page.getByRole("button", { name: "Add aluminium" }).click();
  const a = page.locator('[data-setup="aluminium"]');
  await expect(a).toBeVisible();
  await expect(a.locator("[data-needs]")).toContainText("Confirm the saw kerf");
  await enter(a.getByLabel("Saw kerf", { exact: true }), 3);
  await a.getByLabel("The saw kerf above is confirmed for this job").check();
  await expect(a.locator("[data-needs]")).toHaveCount(0);
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.spec.kerfMm, m.spec.kerfConfirmed, m.spec.stockLengthMm, m.methodKey]; }).toEqual([3, true, 6500, "linear_stock"]);
});

// ── undo / redo ────────────────────────────────────────────────────────────────────────────────────────────
test("Undo / redo in the setup card restores the previous product and its saved state", async ({ page }) => {
  await addCladding(page);
  await pick(page, P.axon133);
  await pick(page, P.linea150);
  await expect.poll(async () => (await genericMaterial(page)).spec.product.name).toBe("Linea");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(`[data-chosen-product="${P.axon133}"]`)).toBeVisible();
  await expect.poll(async () => (await genericMaterial(page)).spec.product.name).toBe("Axon 133 smooth");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.locator(`[data-chosen-product="${P.linea150}"]`)).toBeVisible();
  await expect.poll(async () => (await genericMaterial(page)).spec.assemblyId).toBe("linea-horizontal");
});

// ── phone quality ──────────────────────────────────────────────────────────────────────────────────────────
test("Phone 375 px: no horizontal scroll and every control in the card is at least 44 px tall", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await addCladding(page);
  await pick(page, P.axon133);
  await page.locator("[data-advanced] summary").click();
  for (const fam of [null, "AAC (Walsc first)", "Rendex foam", "Timber cladding", "Support battens", "Accessories"]) {
    if (fam) await family(page, fam);
    if (fam === "AAC (Walsc first)") await pick(page, P.walsc);
    if (fam === "Rendex foam") {
      // its own family: no AAC rails / adhesive, coating and exact product required, nothing assumed
      await expect(page.locator("[data-components]")).not.toContainText("Rails");
      await expect(page.locator("[data-components]")).not.toContainText("Adhesive");
      await expect(page.locator("[data-needs]")).toContainText("factory-coated or applicator-coated");
      await expect(page.locator("[data-needs]")).toContainText("Enter the exact Rendex product / system name.");
      await expect(page.getByLabel("Sheet width")).toHaveValue("");
    }
    const m = await page.evaluate(() => {
      const scroller = document.querySelector('[data-setup="cladding"]').closest(".overflow-y-auto");
      const small = [];
      for (const el of document.querySelectorAll('[data-setup="cladding"] button, [data-setup="cladding"] input:not([type=checkbox]), [data-setup="cladding"] summary, [data-setup="cladding"] a')) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && r.height < 43.5) small.push(`${el.tagName} ${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)} ${r.height}`);
      }
      return { doc: document.documentElement.scrollWidth, scroller: scroller ? scroller.scrollWidth - scroller.clientWidth : 0, small };
    });
    expect(m.doc, `page width with ${fam || "fibre cement"}`).toBeLessThanOrEqual(375);
    expect(m.scroller, `card overflow with ${fam || "fibre cement"}`).toBeLessThanOrEqual(0);
    expect(m.small, `small targets with ${fam || "fibre cement"}`).toEqual([]);
  }
  await shot(page, "phone-375-accessories");
});

test("Keyboard: the focused numeric field stays visible when the on-screen keyboard shrinks the viewport", async ({ page }) => {
  await addCladding(page);
  await pick(page, P.axon133);
  await page.locator("[data-advanced] summary").click();
  const field = page.getByLabel("Sheet height allowance (each cut)");
  await field.evaluate((el) => el.scrollIntoView({ block: "end" })); // the field sits low on the screen …
  await field.focus({ preventScroll: true });
  const before = await field.boundingBox();
  expect(before.y, "precondition: the field starts below where the keyboard will reach").toBeGreaterThan(420);
  await page.setViewportSize({ width: 390, height: 420 }); // … then the keyboard opens
  await expect.poll(async () => {
    const b = await field.boundingBox();
    return b ? b.y >= 0 && b.y + b.height <= 420 : false;
  }, { timeout: 5000 }).toBe(true);
  await shot(page, "keyboard-field-visible");
});

// ── CAT01: catalogue editor ────────────────────────────────────────────────────────────────────────────────
test("CAT01: a new company product on an existing method — Product | Ordering | Installation, review per group, no formula fields", async ({ page }) => {
  await openTakeoff(page);
  await mount(page, "editor");
  const ed = page.locator("[data-catalogue-editor]");
  await ed.getByLabel("Product name (as the crew will see it)").fill("Spotted gum shiplap 135 — Supplier A");
  await ed.locator('[data-chips="family"]').getByRole("button", { name: "Timber cladding" }).click();
  await ed.locator('[data-chips="method"]').getByRole("button", { name: "Random lengths (LM)" }).click();
  await expect(ed.locator("[data-method-choice]")).toContainText("area_to_linear@2");
  await expect(ed.locator("[data-method-choice]")).toContainText("There are no formula fields");
  // Product tab
  await ed.getByLabel("Species / profile").fill("Spotted gum shiplap");
  await enter(ed.getByLabel("Nominal width"), 135);
  await enter(ed.getByLabel("Thickness"), 19);
  await ed.locator('[data-chips="cover"]').getByRole("button", { name: "120 mm", exact: true }).click();
  await ed.getByLabel("Other reference (e.g. supplier data sheet code)").fill("SUPA-DS-135");
  await ed.getByRole("button", { name: "Add", exact: true }).click();
  await ed.locator('[data-chips="review-product"]').getByRole("button", { name: "Transcription checked" }).click();
  // reviewed state without evidence cannot be saved
  await ed.getByRole("button", { name: "Save company version" }).click();
  await expect(page.locator("[data-editor-errors]")).toContainText("Product review: add the source reference");
  expect(await page.evaluate(() => window.__tc.saved)).toBeNull();
  await enter(ed.getByLabel("Checked by"), "S. Morris");
  await ed.getByLabel("Date checked").fill("2026-10-14");
  // Ordering tab
  await ed.getByRole("tab", { name: "Ordering" }).click();
  await ed.getByLabel("Supplier", { exact: true }).fill("Supplier A");
  await ed.getByLabel("Supplier code").fill("SG135");
  await enter(ed.getByLabel("Supplier ordering increment"), 0.3);
  await enter(ed.getByLabel("Spares"), 5);
  // Installation tab
  await ed.getByRole("tab", { name: "Installation" }).click();
  await ed.locator('[data-chips="orientation"]').getByRole("button", { name: "Horizontal" }).click();
  await ed.getByRole("button", { name: /Mortlock Trendplank/ }).click();
  await ed.getByRole("button", { name: "Duplicate as a company version" }).click();
  await enter(ed.getByLabel("Company assembly name"), "Spotted gum on 20 mm cavity");
  await enter(ed.getByLabel("Detail / drawing reference"), "BL-DET-07");
  await expect(ed.locator("[data-installation-state]")).toContainText("Source-pending");
  for (const tab of ["Product", "Ordering", "Installation"]) {
    await ed.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
    const overflow = await page.evaluate(() => { const h = document.getElementById("tc-harness"); return h.scrollWidth - h.clientWidth; });
    expect(overflow, `${tab} tab overflow at 390 px`).toBeLessThanOrEqual(0);
  }
  await shot(page, "cat01-editor-installation");
  await ed.getByRole("button", { name: "Save company version" }).click();
  const saved = await page.evaluate(() => window.__tc.saved);
  expect(saved).not.toBeNull();
  expect(saved.methodKey).toBe("area_to_linear");
  expect(saved.methodVersion).toBe(2);
  expect(saved.spec).toMatchObject({ family: "timber-cladding", supply: "random", orientation: "horizontal", supplierName: "Supplier A", productCode: "SG135", orderIncrementM: 0.3, spareRate: 5, assemblyId: "trendplank" });
  expect(saved.spec.product).toMatchObject({ name: "Spotted gum shiplap", widthMm: 135, thicknessMm: 19, effectiveCoverMm: 120, sourceRefs: ["SUPA-DS-135"] });
  expect(saved.rules.review.product).toMatchObject({ state: "checked", by: "S. Morris", at: "2026-10-14" });
  expect(saved.rules.assembly).toEqual({ baseId: "trendplank", label: "Spotted gum on 20 mm cavity", detailRef: "BL-DET-07" });
  // no code / formula anywhere in what is stored
  const keys = [];
  const walk = (o) => { if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { keys.push(k.toLowerCase()); walk(v); } };
  walk(saved);
  expect(keys.filter((k) => ["formula", "expression", "expr", "eval", "script", "code", "fn", "function"].includes(k))).toEqual([]);
  // works without code: the saved content, used on a job wall, calculates with the existing method (net area ÷ cover)
  const calc = await page.evaluate(async (c) => {
    const T = await import("/shared/takeoff/index.js");
    const m = { id: "mat-new", ...JSON.parse(JSON.stringify(c)) };
    const ws = T.computeWorkspace({ workspace: { id: "x", revision: 1 }, documents: [], calibrations: [], materials: [m],
      measurements: [{ id: "w", kind: "wall", inputs: { kind: "rect", widthMm: 4800, heightMm: 2500, name: "W1" } }],
      contributions: [{ id: "c", measurementId: "w", jobMaterialId: m.id, role: "wall" }] });
    const lines = ws.scheduleLines.filter((l) => l.jobMaterialIds.includes(m.id));
    return { lines: lines.map((l) => [l.unit, l.quantity]), explain: ws.materialResults[m.id].explain.join(" ") };
  }, saved);
  // 12 m² ÷ 0.120 m = 100 LM, + 5 % = 105 LM (whole LM after the 0.3 m increment)
  expect(calc.lines).toEqual([["lm", 105]]);
  expect(calc.explain).toContain("100");
  // the server accepts it as an ordinary preset; it then lists under its own family, not under flashing
  const r = await postPreset(page, { content: saved });
  expect(r.ok).toBe(true);
  await unmount(page);
  await mount(page, "presets", { families: ["timber-cladding"] });
  const list = page.locator('[data-preset-family="timber-cladding"]');
  await expect(list).toContainText("Spotted gum shiplap 135 — Supplier A");
  await expect(list).toContainText("cover 120");
  await expect(list).toContainText("Supplier A");
  await expect(list).toContainText("Product: Transcription checked");
  await expect(list).toContainText("Installation: Source-pending");
  await expect(list).toContainText("Sources: SUPA-DS-135");
  await shot(page, "cat01-family-presets");
  await unmount(page);
  await page.getByRole("button", { name: "Add flashing" }).first().click();
  const flashing = page.locator("[data-flashing-picker]");
  await expect(flashing).toContainText("Apron flashing");
  await expect(flashing).not.toContainText("Spotted gum");
  await expect(flashing).toContainText("Timber, cladding and aluminium products are under Add timber");
});

test("CAT01: office staff only — the editor is read-only without edit-standards permission", async ({ page }) => {
  await openTakeoff(page);
  await mount(page, "editor", { canEditStandards: false, value: { name: "Axon 133 smooth — company", methodKey: "sheet_layout", methodVersion: 2, spec: { family: "cladding", layout: "sheet", product: { name: "Axon 133 smooth", manufacturer: "James Hardie", widthMm: 1200, thicknessMm: 9, effectiveCoverMm: 1200, lengthsMm: [2450] } }, rules: {} } });
  const ed = page.locator('[data-catalogue-editor="read-only"]');
  await expect(ed).toContainText("Only office staff can change company standards");
  await expect(ed.getByRole("button", { name: "Save company version" })).toHaveCount(0);
});

test("CAT01: 'New company product' from a family entry point starts from that family's own defaults (aluminium 6500 bars, kerf unconfirmed)", async ({ page }) => {
  await openTakeoff(page);
  await mount(page, "editor", { value: { spec: { family: "aluminium" } } });
  const ed = page.locator("[data-catalogue-editor]");
  await expect(ed.locator('[data-chips="family"]').getByRole("button", { name: "Aluminium profile" })).toHaveAttribute("aria-pressed", "true");
  await expect(ed.locator("[data-method-choice]")).toContainText("linear_stock@1");
  await ed.getByRole("tab", { name: "Ordering" }).click();
  await expect(ed.getByLabel("Stock length")).toHaveValue("6500");
  await expect(ed.getByLabel("Saw kerf", { exact: true })).toHaveValue("");
  await ed.getByRole("tab", { name: /^Product/ }).click();
  await ed.getByLabel("Product name (as the crew will see it)").fill("Window angle 50 × 50 × 3 mill");
  await ed.getByRole("button", { name: "Save company version" }).click();
  const saved = await page.evaluate(() => window.__tc.saved);
  expect(saved).toMatchObject({ name: "Window angle 50 × 50 × 3 mill", methodKey: "linear_stock", methodVersion: 1, spec: { family: "aluminium", stockLengthMm: 6500, kerfConfirmed: false } });
});

// ── CAT02 ──────────────────────────────────────────────────────────────────────────────────────────────────
test("CAT02: a company template copied twice stays independent — editing one copy changes neither the other nor the template", async ({ page }) => {
  await openTakeoff(page);
  const content = { name: "Axon 133 smooth — company", methodKey: "sheet_layout", methodVersion: 2,
    spec: { family: "cladding", layout: "sheet", orientation: "vertical", assemblyId: "axon-vertical", spareRate: 0, supplierName: "Supplier A",
      product: { id: "James Hardie|Axon 133 smooth|1200|9", manufacturer: "James Hardie", name: "Axon 133 smooth", widthMm: 1200, thicknessMm: 9, effectiveCoverMm: 1200, lengthsMm: [2450, 2750, 3000], skus: [{ sku: "403931", lengthMm: 2450 }], sourceRefs: ["H01"] } },
    rules: { review: { product: { state: "checked", ref: "H01", by: "S. Morris", at: "2026-10-14" } } } };
  const created = await postPreset(page, { content });
  const presetId = created.preset.presetId;

  await mount(page, "presets", { families: ["cladding", "aac", "foam", "timber-cladding", "batten", "accessory"] });
  const row = page.locator(`[data-preset="${presetId}"]`);
  await row.getByRole("button", { name: "Use on this job" }).click();
  await row.getByRole("button", { name: "Use on this job" }).click();
  // the two job records are snapshots: deep copies, own ids, pinned to the exact revision
  const check = await page.evaluate(async (pid) => {
    const [a, b] = window.__tc.used;
    const before = JSON.parse(JSON.stringify([a, b]));
    a.spec.spareRate = 99; a.spec.product.lengthsMm.push(9999); a.rules.review.product.state = "candidate";
    const presets = (await (await fetch("/api/takeoff/presets")).json()).presets;
    const p = presets.find((x) => x.id === pid);
    return { before, distinctIds: a.id !== b.id, bSpare: b.spec.spareRate, bLengths: b.spec.product.lengthsMm, bReview: b.rules.review.product.state, pSpare: p.spec.spareRate, pLengths: p.spec.product.lengthsMm, pReview: p.rules.review.product.state };
  }, presetId);
  expect(check.distinctIds).toBe(true);
  expect([check.bSpare, check.bLengths, check.bReview]).toEqual([0, [2450, 2750, 3000], "checked"]);
  expect([check.pSpare, check.pLengths, check.pReview]).toEqual([0, [2450, 2750, 3000], "checked"]);
  for (const r of check.before) expect(r.fromPreset).toEqual({ presetId, revision: 1 });
  await unmount(page);

  // put both copies on the job exactly as TakeoffApp's glue will (ws.edit with the records) — via the API
  const ids = await page.evaluate(async (recs) => {
    const ws = await (await fetch("/api/takeoff/workspaces/ws-1")).json();
    const r = await fetch("/api/takeoff/workspaces/ws-1/commit", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision: ws.snapshot.workspace.revision, changes: { materials: { upsert: recs, archive: [] } } }) });
    if (!(await r.json()).ok) throw new Error("commit failed");
    return recs.map((x) => x.id);
  }, check.before);
  await reopenTakeoff(page);
  const items = page.locator("li", { hasText: "Axon 133 smooth — company" });
  await expect(items).toHaveCount(2);
  await items.first().getByRole("button", { name: "Setup" }).click();
  await expect(card(page)).toBeVisible();
  await enter(page.getByLabel("Spares"), 7);
  const read = async () => page.evaluate(async (mids) => {
    const s = (await (await fetch("/api/takeoff/workspaces/ws-1")).json()).snapshot;
    const presets = (await (await fetch("/api/takeoff/presets")).json()).presets;
    return { mats: mids.map((id) => { const m = s.materials.find((x) => x.id === id); return [m.spec.spareRate, m.fromPresetRevision]; }), preset: presets.map((p) => [p.name, p.revision, p.spec.spareRate]).find((x) => x[0] === "Axon 133 smooth — company") };
  }, ids);
  await expect.poll(async () => { const r = await read(); return r.mats.map((x) => x[0]).sort(); }).toEqual([0, 7]);
  expect((await read()).preset).toEqual(["Axon 133 smooth — company", 1, 0]);

  // a new company version never rewrites the job copies — the job is offered an explicit update instead
  await postPreset(page, { presetId, expectedRevision: 1, content: { ...content, spec: { ...content.spec, spareRate: 10 } } });
  const after = await read();
  expect(after.preset).toEqual(["Axon 133 smooth — company", 2, 10]);
  expect(after.mats.map((x) => x[0]).sort()).toEqual([0, 7]);
  expect(after.mats.map((x) => x[1])).toEqual([1, 1]);
  await page.getByRole("button", { name: "Close" }).click();
  await reopenTakeoff(page);
  await expect(page.locator("li", { hasText: "Axon 133 smooth — company" }).filter({ hasText: "The company standard was updated (rev 2). This job still uses rev 1." })).toHaveCount(2);
  await shot(page, "cat02-two-copies-independent");
});

test("CAT01: a company accessory set — items, routes and reviewed yields in Installation; no project detail or job flags in company data", async ({ page }) => {
  await openTakeoff(page);
  await mount(page, "editor", { value: { spec: { family: "accessory" } } });
  const ed = page.locator("[data-catalogue-editor]");
  await ed.getByLabel("Product name (as the crew will see it)").fill("Axon accessories — Supplier A");
  await expect(ed.locator("[data-method-choice]")).toContainText("accessory_routes@1");
  await ed.getByLabel("Accessory set").fill("Axon accessory set");
  await ed.getByRole("tab", { name: "Installation" }).click();
  await expect(ed.getByLabel("Project detail that specifies this set (optional)")).toHaveCount(0); // a project detail belongs to one job
  await ed.locator("[data-editor-recipe]").getByLabel("Add an item").selectOption({ label: "Joint strip / backing" });
  const js = ed.locator('[data-accessory-group="joint-strip"]');
  await expect(js).toContainText("Follows the actual joints of the cladding laid out on the same wall");
  await enter(js.getByLabel("Item (exact product)"), "Hardie joint strip");
  await js.locator('[data-chips="joint-orient-joint-strip"]').getByRole("button", { name: "Horizontal" }).click();
  await enter(js.getByLabel("Stock length(s)"), "3000");
  await ed.getByRole("button", { name: "Save company version" }).click();
  const saved = await page.evaluate(() => window.__tc.saved);
  expect(saved).toMatchObject({ methodKey: "accessory_routes", methodVersion: 1, spec: { family: "accessory", product: { name: "Axon accessory set" } } });
  expect(saved.rules.recipe).toEqual({ groups: [{ id: "joint-strip", kind: "joint-strip", scope: { status: "include" }, label: "Hardie joint strip", orientation: "horizontal", stockPolicy: { kind: "list", lengthsMm: [3000] } }] });
  expect(saved.rules.carried).toBeUndefined();
  // no "width / thickness" demanded of an accessory set — those live on each item
  await expect(page.locator("#tc-harness")).not.toContainText("Product width and thickness are needed");
});

test("Catalogue versioning: a newer company version is reviewed on THIS job — field diff, job-entered values, quantity impact — and only an explicit tap updates", async ({ page }) => {
  await openTakeoff(page);
  const content = { name: "Axon 133 — company", methodKey: "sheet_layout", methodVersion: 2,
    spec: { family: "cladding", layout: "sheet", orientation: "vertical", assemblyId: "axon-vertical", spareRate: 0, supplierName: "Supplier A",
      product: { id: "James Hardie|Axon 133 smooth|1200|9", manufacturer: "James Hardie", name: "Axon 133 smooth", widthMm: 1200, thicknessMm: 9, effectiveCoverMm: 1200, lengthsMm: [2450, 2750, 3000], sourceRefs: ["H01"] } },
    rules: {} };
  const created = await postPreset(page, { content });
  const presetId = created.preset.presetId;
  await postPreset(page, { presetId, expectedRevision: 1, content: { ...content, spec: { ...content.spec, spareRate: 10, product: { ...content.spec.product, lengthsMm: [3000] } } } });
  // this job's copy of rev 1, with a value entered on the job (a sheet height allowance)
  const material = { id: "mat-copy", name: content.name, methodKey: "sheet_layout", methodVersion: 2, spec: JSON.parse(JSON.stringify(content.spec)), rules: { heightAllowanceMm: 20 }, profile: null, fromPresetId: presetId, fromPresetRevision: 1 };
  await mount(page, "update", { presetId, material });
  const r = page.locator(`[data-preset-update="${presetId}"]`);
  await expect(r).toContainText("This job still uses its own copy of rev 1");
  await expect(r.locator('[data-diff-path="spec.spareRate"]')).toContainText("Spares (%)");
  await expect(r.locator('[data-diff-path="spec.spareRate"]')).toContainText("10");
  await expect(r.locator('[data-diff-path="spec.product.lengthsMm"]')).toContainText("2450, 2750, 3000");
  await expect(r.locator('[data-diff-path="rules.heightAllowanceMm"]')).toContainText("not set");
  await expect(r).toContainText("Updating removes a value entered on this job (sheet height allowance (mm))");
  // quantity impact on this job: the 2700 mm wall moves from 2750 sheets to 3000 sheets
  await expect(r.locator('[data-impact="before"]')).toContainText("2,750");
  await expect(r.locator('[data-impact="after"]')).toContainText("3,000");
  await expect(r.locator('[data-impact="after"]')).not.toContainText("2,750");
  await expect(r.locator("[data-preset-impact]")).toContainText("orders already exported or placed never change");
  await shot(page, "preset-update-review");
  expect(await page.evaluate(() => window.__tc.updated)).toBeNull(); // nothing changes until the tap
  await r.getByRole("button", { name: "Keep this job's copy" }).click();
  expect(await page.evaluate(() => window.__tc.kept)).toBe(true);
  await r.getByRole("button", { name: "Update this job's copy to rev 2" }).click();
  const rec = await page.evaluate(() => window.__tc.updated);
  expect(rec).toMatchObject({ id: "mat-copy", fromPreset: { presetId, revision: 2 }, fromPresetRevision: 2, spec: { spareRate: 10, product: { lengthsMm: [3000] } } });
  expect(rec.rules.heightAllowanceMm).toBeUndefined();
  const overflow = await page.evaluate(() => { const el = document.getElementById("tc-harness"); return el.scrollWidth - el.clientWidth; });
  expect(overflow, "review fits at 390 px").toBeLessThanOrEqual(0);
});

test("Company products list job-condition values they bring (support spacing) so they're checked on the job, not silently trusted", async ({ page }) => {
  await openTakeoff(page);
  const content = { name: "Cavity batten N2 — company", methodKey: "support_grid", methodVersion: 1,
    spec: { family: "batten", orientation: "vertical", product: { id: "James Hardie|Hardie Cavity Batten|70|19", manufacturer: "James Hardie", name: "Hardie Cavity Batten", widthMm: 70, thicknessMm: 19, lengthsMm: [2450, 2700, 3000], sourceRefs: ["H02"] } },
    rules: { maxSpacingMm: 600, spacingRef: "H02 Table 1 N2" } };
  const created = await postPreset(page, { content });
  await mount(page, "presets", { families: ["cladding", "aac", "foam", "timber-cladding", "batten", "accessory"] });
  const row = page.locator(`[data-preset="${created.preset.presetId}"]`);
  await expect(row.locator("[data-condition-notes]")).toContainText("max support spacing 600 mm (H02 Table 1 N2) — check it suits this job's wind class and substrate");
  await row.getByRole("button", { name: "Use on this job" }).click();
  const rec = await page.evaluate(() => window.__tc.used[0]);
  expect(rec.rules).toEqual({ maxSpacingMm: 600, spacingRef: "H02 Table 1 N2" });
  expect(rec.fromPreset).toEqual({ presetId: created.preset.presetId, revision: 1 });
});

// ── adversarial review regressions (R1–R8) ───────────────────────────────────────────────────────────────────
const editorAssemblies = (ed) => ed.locator("[data-editor-assembly] [data-assembly]").evaluateAll((els) => els.map((e) => e.getAttribute("data-assembly")));
const pressedAssembly = (ed) => ed.locator('[data-editor-assembly] [data-assembly][aria-pressed="true"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-assembly")));
const edTab = (ed, name) => ed.getByRole("tab", { name: new RegExp(`^${name}`) }).click();
async function startFrom(ed, key) {
  const sum = ed.locator("summary", { hasText: "Start from a researched product" });
  if (!(await ed.locator("[data-product-picker]").isVisible())) await sum.click();
  const change = ed.getByRole("button", { name: "Change product" });
  if (await change.isVisible().catch(() => false)) await change.click();
  await ed.locator(`[data-product-option="${key}"]`).click();
  await expect(ed.locator(`[data-chosen-product="${key}"]`)).toBeVisible();
}

test("R1: clearing a value means 'not entered' — never 0 (adhesive joint, trim overlap, kerf); a kerf change must be confirmed again", async ({ page }) => {
  await addCladding(page);
  await family(page, "AAC (Walsc first)");
  await pick(page, P.walsc);
  const adhesive = page.getByLabel("Approved adhesive joint (system value)");
  await enter(adhesive, 3);
  await expect.poll(async () => (await genericMaterial(page)).rules.adhesiveJointMm ?? null).toBe(3);
  await enter(adhesive, "");
  await expect.poll(async () => (await genericMaterial(page)).rules.adhesiveJointMm ?? null).toBeNull(); // was silently 0 mm
  await expect(adhesive).toHaveValue("");
  await expect(page.locator("[data-needs]")).toContainText("approved adhesive joint");

  // a trim's joint overlap: blank = no joint allowed, 0 = butt joints allowed — clearing it must not allow joints
  await family(page, "Accessories");
  await addItem(page, "Starter / base trim");
  const overlap = item(page, "starter").getByLabel("Joint overlap", { exact: true });
  await enter(overlap, 50);
  await expect.poll(async () => (await genericMaterial(page)).rules.recipe?.groups?.[0]?.jointOverlapMm ?? null).toBe(50);
  await enter(overlap, "");
  await expect.poll(async () => { const g = (await genericMaterial(page)).rules.recipe?.groups?.[0] || {}; return "jointOverlapMm" in g ? g.jointOverlapMm : "absent"; }).toBe("absent");
  await page.getByRole("button", { name: "Close" }).first().click();

  // kerf: a confirmed kerf that is changed (or cleared) is no longer confirmed; nothing to confirm while it's blank
  await page.getByRole("button", { name: "Add aluminium" }).click();
  const a = page.locator('[data-setup="aluminium"]');
  const kerf = a.getByLabel("Saw kerf", { exact: true });
  const confirmed = a.getByLabel("The saw kerf above is confirmed for this job");
  await expect(confirmed).toBeDisabled();
  await enter(kerf, 3);
  await confirmed.check();
  await expect.poll(async () => { const m = (await server(page)).snapshot.materials.find((x) => x.spec?.family === "aluminium"); return [m?.spec?.kerfMm, m?.spec?.kerfConfirmed]; }).toEqual([3, true]);
  await enter(kerf, 2);
  await expect(confirmed).not.toBeChecked();
  await expect(a.locator("[data-needs]")).toContainText("Confirm the saw kerf");
  await enter(kerf, "");
  await expect.poll(async () => { const m = (await server(page)).snapshot.materials.find((x) => x.spec?.family === "aluminium"); return [m?.spec?.kerfMm ?? null, m?.spec?.kerfConfirmed]; }).toEqual([null, false]);
  await expect(confirmed).toBeDisabled();
});

test("R2 (CL05 / 12): the catalogue editor lists only this product's own assemblies — AAC brands never mixed, foam never gets fibre-cement or AAC assemblies", async ({ page }) => {
  await openTakeoff(page);
  await mount(page, "editor");
  const ed = page.locator("[data-catalogue-editor]");
  await ed.locator('[data-chips="family"]').getByRole("button", { name: "AAC panel" }).click();
  await edTab(ed, "Installation");
  expect(await editorAssemblies(ed)).toEqual(["walsc50"]); // manufacturer Walsc (company preference) — no Hebel systems
  await edTab(ed, "Product");
  await startFrom(ed, P.hebel50);
  await edTab(ed, "Installation");
  expect(await editorAssemblies(ed)).toEqual(["hebel50"]);
  expect(await pressedAssembly(ed)).toEqual(["hebel50"]);

  await ed.locator('[data-chips="family"]').getByRole("button", { name: "Rendex foam" }).click();
  await edTab(ed, "Installation");
  expect(await editorAssemblies(ed)).toEqual(["rendex-eps"]); // was offered Axon's assembly too

  await ed.locator('[data-chips="family"]').getByRole("button", { name: "Fibre cement" }).click();
  await edTab(ed, "Installation");
  await expect(ed.locator("[data-no-assembly]")).toBeVisible(); // a product with no manufacturer isn't matched to anyone's assembly
  await edTab(ed, "Product");
  await ed.getByLabel("Manufacturer", { exact: true }).fill("James Hardie");
  await edTab(ed, "Installation");
  expect(await editorAssemblies(ed)).toEqual(["axon-vertical"]); // Rendex EPS (same sheet method) is not offered
  await ed.locator('[data-chips="method"]').getByRole("button", { name: "Courses / boards" }).click();
  const course = await editorAssemblies(ed);
  expect(course.length).toBeGreaterThan(0);
  expect(course.filter((id) => /pentarch|trendplank|rendex|hebel|walsc/.test(id))).toEqual([]); // timber boards' assemblies aren't fibre cement's
});

test("R3 (UX03 in the catalogue editor): product / orientation / kind changes re-select the assembly and flag old values — none are saved silently", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openTakeoff(page);
  await mount(page, "editor");
  const ed = page.locator("[data-catalogue-editor]");
  await ed.getByLabel("Product name (as the crew will see it)").fill("AAC — company");
  await ed.locator('[data-chips="family"]').getByRole("button", { name: "AAC panel" }).click();
  await startFrom(ed, P.walsc);
  await edTab(ed, "Installation");
  await enter(ed.getByLabel("Approved adhesive joint (system value)"), 3);
  await edTab(ed, "Product");
  await startFrom(ed, P.hebel50);
  await edTab(ed, "Installation");
  await expect(ed.getByLabel("Approved adhesive joint (system value)")).toHaveValue(""); // was silently kept at 3 mm
  const flag = ed.locator('[data-carried-param="adhesiveJointMm"]');
  await expect(flag).toContainText("Adhesive joint 3 mm");
  await expect(flag).toContainText("was set for Walsc External Wall System 50");
  await expect(ed.locator("[data-carried]")).toContainText("not saved with the company product");
  await shot(page, "r3-editor-carried-flag-375");
  const m = await page.evaluate(() => { const h = document.getElementById("tc-harness"); const small = []; for (const el of h.querySelectorAll("button, input:not([type=checkbox]), select, summary")) { const r = el.getBoundingClientRect(); if (r.width && r.height && r.height < 43.5) small.push(`${el.tagName} ${(el.textContent || "").trim().slice(0, 30)} ${r.height}`); } return { over: h.scrollWidth - h.clientWidth, small }; });
  expect(m.over, "editor fits 375 px").toBeLessThanOrEqual(0);
  expect(m.small).toEqual([]);
  await flag.getByRole("button", { name: /^Use 3 mm/ }).click();
  await expect(ed.getByLabel("Approved adhesive joint (system value)")).toHaveValue("3");

  // Rendex never takes the AAC joint: flagged as not applying, no adhesive field
  await ed.locator('[data-chips="family"]').getByRole("button", { name: "Rendex foam" }).click();
  await edTab(ed, "Installation");
  await expect(ed.getByLabel("Approved adhesive joint (system value)")).toHaveCount(0);
  await expect(ed.locator('[data-carried-param="adhesiveJointMm"]')).toContainText("doesn't apply");
  await expect(ed.locator('[data-carried-param="adhesiveJointMm"]').getByRole("button", { name: /^Use / })).toHaveCount(0);

  // Stria: the product's assembly follows its orientation; a company version of the old assembly is flagged
  await ed.locator('[data-chips="family"]').getByRole("button", { name: "Fibre cement" }).click();
  await edTab(ed, "Product");
  await startFrom(ed, P.stria325);
  await edTab(ed, "Installation");
  await expect(ed.locator('[data-chips="orientation"]').getByRole("button", { name: "Vertical" })).toHaveAttribute("aria-pressed", "true");
  expect(await pressedAssembly(ed)).toEqual(["stria-smooth-vertical"]); // was stria-smooth-horizontal on a vertical product
  await ed.getByRole("button", { name: "Duplicate as a company version" }).click();
  await enter(ed.getByLabel("Company assembly name"), "Stria V on 20 mm battens");
  await ed.locator('[data-chips="orientation"]').getByRole("button", { name: "Horizontal" }).click();
  expect(await pressedAssembly(ed)).toEqual(["stria-smooth-horizontal"]); // was kept at the vertical assembly
  await expect(ed.locator('[data-carried-param="assembly"]')).toContainText("Stria V on 20 mm battens");
  await expect(ed.locator("[data-company-assembly]")).toHaveCount(0);
  await ed.getByRole("button", { name: "Save company version" }).click();
  const saved = await page.evaluate(() => window.__tc.saved);
  expect(saved.spec).toMatchObject({ family: "cladding", layout: "course", orientation: "horizontal", assemblyId: "stria-smooth-horizontal" });
  expect([saved.rules.carried, saved.rules.assembly, saved.rules.adhesiveJointMm]).toEqual([undefined, undefined, undefined]);
});

test("R4: job-only site facts (a project detail, existing supports) never become company data; older products that carry them are flagged", async ({ page }) => {
  await openTakeoff(page);
  // "Save as standard" from a job accessory set that recorded its own project detail
  const job = { name: "Axon accessories — job 12", methodKey: "accessory_routes", methodVersion: 1, spec: { family: "accessory", product: { name: "Axon accessories" } },
    rules: { recipe: { authority: { kind: "project-detail", ref: "BL-DET-07 rev B" }, groups: [{ id: "starter", kind: "starter", label: "Base trim", routes: ["base"], scope: { status: "include" }, stockPolicy: { kind: "list", lengthsMm: [3000] } }] } } };
  await mount(page, "editor", { value: job });
  const ed = page.locator("[data-catalogue-editor]");
  await expect(ed.locator("[data-job-only]")).toContainText("project detail BL-DET-07 rev B");
  await ed.getByRole("button", { name: "Save company version" }).click();
  let saved = await page.evaluate(() => window.__tc.saved);
  expect(saved.rules.recipe).toEqual({ groups: job.rules.recipe.groups });
  // a batten layer the job marked as already existing
  const bat = { name: "Cavity battens — job 12", methodKey: "support_grid", methodVersion: 1, spec: { family: "batten", orientation: "vertical", product: { name: "Hardie Cavity Batten", widthMm: 70, thicknessMm: 19, lengthsMm: [3000] } },
    rules: { maxSpacingMm: 600, spacingRef: "H02 Table 1 N2", existing: true } };
  await mount(page, "editor", { value: bat });
  await expect(page.locator("[data-job-only]")).toContainText("supports marked as already existing");
  await page.getByRole("button", { name: "Save company version" }).click();
  saved = await page.evaluate(() => window.__tc.saved);
  expect(saved.rules).toEqual({ maxSpacingMm: 600, spacingRef: "H02 Table 1 N2" });
  await unmount(page);
  // an older company product saved straight from a job still carries them: the picker says so before it's used
  const created = await postPreset(page, { content: bat });
  await mount(page, "presets", { families: ["batten"] });
  await expect(page.locator(`[data-preset="${created.preset.presetId}"] [data-condition-notes]`)).toContainText("supports marked as already existing (not purchased) — that was another job's site");
});

test("R5: the setup card shows what the order holds now — never 'Calculated' for nothing measured; cover 120 → 90 shows 200 → 267 LM", async ({ page }) => {
  await openTakeoff(page);
  const axon = { id: "mat-ax", name: "Axon", methodKey: "sheet_layout", methodVersion: 2, spec: { family: "cladding", layout: "sheet", orientation: "vertical", assemblyId: "axon-vertical",
    product: { id: P.axon133, manufacturer: "James Hardie", name: "Axon 133 smooth", widthMm: 1200, thicknessMm: 9, effectiveCoverMm: 1200, lengthsMm: [2450, 2750, 3000], sourceRefs: ["H01"] } }, rules: {} };
  await mount(page, "setup", { material: axon, wallMm: null });
  const h = page.locator("#tc-harness");
  expect(await page.evaluate(() => window.__tc.result.status.quantity)).toBe("incomplete"); // what the engine says for an empty takeoff (never "calculated") …
  await expect(h.locator('[data-status="quantity"]')).toHaveAttribute("data-value", "pending"); // … the card doesn't repeat it
  await expect(h.locator('[data-status="quantity"]')).toContainText("Not measured yet");
  await expect(h.locator("[data-quantity-preview]")).toContainText("Nothing yet");

  // 24 m² of random-length boards (12): the effect of a cover change is visible in the card
  const tc = { id: "mat-tc", name: "Shiplap", methodKey: "area_to_linear", methodVersion: 2, spec: { family: "timber-cladding", layout: "course", orientation: "horizontal", supply: "random", orderIncrementM: 1, supplierName: "Supplier A",
    product: { name: "Spotted gum shiplap", widthMm: 135, thicknessMm: 19, effectiveCoverMm: 120, lengthsMm: [1800, 5400] } }, rules: {} };
  await mount(page, "setup", { material: tc, wallMm: [6000, 4000] });
  const pv = h.locator("[data-quantity-preview]");
  await expect(pv.locator('[data-preview-line="lm"]')).toContainText("200 LM");
  await expect(pv.locator("[data-preview-working]")).toContainText("24 m² ÷ 0.12 m effective cover = 200 LM");
  await h.locator('[data-chips="cover"]').getByRole("button", { name: "90 mm", exact: true }).click();
  await expect(pv.locator('[data-preview-line="lm"]')).toContainText("267 LM");
  await expect(pv.locator("[data-preview-working]")).toContainText("24 m² ÷ 0.09 m effective cover = 266.667 LM"); // no second lap deduction
  await expect(pv.locator("[data-preview-was]")).toContainText("Changed from: 200 LM");
  expect(await page.evaluate(() => window.__tc.material.spec.product.effectiveCoverMm)).toBe(90);
  await shot(page, "r5-cover-120-to-90");
});

test("R6: random-length timber cladding needs no stock length (LM is ordered by total) — the random mix is recorded, never counted as boards", async ({ page }) => {
  await addCladding(page);
  await family(page, "Timber cladding");
  await page.locator('[data-chips="cover"]').getByRole("button", { name: "120 mm", exact: true }).click();
  await enter(page.getByLabel("Species / profile"), "Spotted gum shiplap");
  await enter(page.getByLabel("Supplier", { exact: true }), "Supplier A");
  await enter(page.getByLabel("Nominal width"), 135);
  await enter(page.getByLabel("Thickness"), 19);
  await enter(page.getByLabel("Supplier ordering increment"), 0.3);
  // every need is met once cover, size, supplier and increment are in: the random mix is optional information (02 §6)
  await expect(page.locator("[data-needs]")).toHaveCount(0);
  await enter(page.getByLabel("Lengths in the supplier's random mix"), "1800, 5400");
  await expect(page.locator("[data-needs]")).toHaveCount(0);
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.methodKey, m.spec.supply, m.spec.product.lengthsMm, m.spec.product.lengthMm ?? null]; }).toEqual(["area_to_linear", "random", [1800, 5400], null]);
});

test("R7: the job card never shows another brand's assembly as this product's — custom products match their own manufacturer; an unlisted one is flagged with Clear", async ({ page }) => {
  await openTakeoff(page);
  // a company AAC product the catalogue doesn't list (custom Walsc thickness) that was saved with a Hebel assembly
  const aac = { id: "mat-aac", name: "Walsc 75 — company", methodKey: "aac_panel_layout", methodVersion: 1, spec: { family: "aac", assemblyId: "hebel50",
    product: { manufacturer: "Walsc", name: "External Wall System 75", widthMm: 600, thicknessMm: 75, lengthsMm: [3000], sourceRefs: [] } }, rules: { adhesiveJointMm: 3 } };
  await mount(page, "setup", { material: aac, wallMm: [4800, 2700] });
  const h = page.locator("#tc-harness");
  const ids = await h.locator("[data-assembly-picker] [data-assembly]").evaluateAll((els) => els.map((e) => e.getAttribute("data-assembly")));
  expect(ids).toEqual(["walsc50"]);
  await expect(h.locator("[data-assembly-unlisted]")).toContainText("Hebel PowerPanel50 system is selected but isn't listed for this product");
  await h.locator("[data-assembly-unlisted]").getByRole("button", { name: "Clear this assembly" }).click();
  await expect(h.locator("[data-assembly-unlisted]")).toHaveCount(0);
  expect(await page.evaluate(() => window.__tc.material.spec.assemblyId)).toBeNull();

  // a company assembly version follows the assembly it was made from: a different assembly flags it, never keeps it
  const stria = { id: "mat-st", name: "Stria — company", methodKey: "course_layout", methodVersion: 1, spec: { family: "cladding", layout: "course", orientation: "vertical", assemblyId: "stria-smooth-vertical",
    product: { id: P.stria325, manufacturer: "James Hardie", name: "Stria smooth", widthMm: 325, thicknessMm: 14, effectiveCoverMm: 300, lengthsMm: [4200], sourceRefs: ["H05"] } },
    rules: { assembly: { baseId: "stria-smooth-vertical", label: "Stria V on 20 mm battens", detailRef: "BL-DET-09" },
      review: { installation: { state: "reviewed", ref: "H07 p.9 table 2", by: "S. Morris", at: "2026-10-14" } } } };
  await mount(page, "setup", { material: stria, wallMm: [4800, 2700] });
  await expect(h.locator("[data-assembly-picker]")).toContainText("Company version: Stria V on 20 mm battens");
  // a reviewed installation SOURCE transcription is labelled as such; the installation status stays the engine's
  await expect(h.locator("[data-review-summary]")).toContainText("Installation source: Reviewed");
  const inst = await page.evaluate(() => window.__tc.result.status.installation);
  await expect(h.locator('[data-status="installation"]')).toHaveAttribute("data-value", inst);
  expect(inst).not.toBe("supported-by-selected-rule");
  await h.locator('[data-chips="orientation"]').getByRole("button", { name: "Horizontal courses" }).click();
  await expect(h.locator('[data-assembly="stria-smooth-horizontal"]')).toHaveAttribute("aria-pressed", "true");
  await expect(h.locator('[data-carried-param="assembly"]')).toContainText("Company assembly version “Stria V on 20 mm battens”");
  await expect(h.locator("[data-assembly-picker]")).not.toContainText("Company version:");
  expect(await page.evaluate(() => [window.__tc.material.rules.assembly ?? null, window.__tc.material.rules.carried?.assembly?.value?.baseId])).toEqual([null, "stria-smooth-vertical"]);
});

/** Console errors / React warnings raised while a test runs (ignores network noise from the mocked backend). */
function watchConsole(page) {
  const seen = [];
  page.on("console", (m) => { if (m.type() === "error" || (m.type() === "warning" && /React|Warning:/.test(m.text()))) seen.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => seen.push(`pageerror: ${e.message}`));
  return seen;
}

test("R8: an unsaved company product survives a reload on this device — Restore or Discard; Cancel clears it", async ({ page }) => {
  const errors = watchConsole(page);
  await openTakeoff(page);
  const preset = { id: "pre-cav", revision: 3, name: "Cavity batten — company", methodKey: "support_grid", methodVersion: 1,
    spec: { family: "batten", orientation: "vertical", product: { name: "Hardie Cavity Batten", widthMm: 70, thicknessMm: 19, lengthsMm: [3000] } }, rules: {} };
  await mount(page, "editor", { value: preset });
  let ed = page.locator("[data-catalogue-editor]");
  await expect(ed.locator("[data-draft-recovery]")).toHaveCount(0);
  await edTab(ed, "Installation");
  await enter(ed.getByLabel("Maximum support spacing"), 450);
  await enter(ed.getByLabel("Spacing authority"), "BL-DET-11 batten layout");
  await page.reload(); // the phone drops the page mid-edit
  await ready(page);
  await expect(page.getByRole("button", { name: "Add cladding" })).toBeVisible();
  await mount(page, "editor", { value: preset });
  ed = page.locator("[data-catalogue-editor]");
  await expect(ed.locator("[data-draft-recovery]")).toContainText("Unsaved changes to this product");
  await shot(page, "r8-editor-draft-recovery");
  await ed.getByRole("button", { name: "Restore" }).click();
  await edTab(ed, "Installation");
  await expect(ed.getByLabel("Maximum support spacing")).toHaveValue("450");
  await expect(ed.getByLabel("Spacing authority")).toHaveValue("BL-DET-11 batten layout");
  await ed.getByRole("button", { name: "Cancel" }).click();
  await mount(page, "editor", { value: preset });
  await expect(page.locator("[data-draft-recovery]")).toHaveCount(0); // cancelled — nothing offered again
  // another product's draft is never offered here
  await edTab(page.locator("[data-catalogue-editor]"), "Installation");
  await enter(page.getByLabel("Maximum support spacing"), 500);
  await mount(page, "editor", { value: { ...preset, id: "pre-other" } });
  await expect(page.locator("[data-draft-recovery]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("R9: catalogue editor on a phone — the keyboard never hides the field behind the Save bar; a timber supplier change asks for that supplier's cover", async ({ page }) => {
  const errors = watchConsole(page);
  await openTakeoff(page);
  await mount(page, "editor", { value: { spec: { family: "timber-cladding" } } });
  const ed = page.locator("[data-catalogue-editor]");
  await ed.getByLabel("Product name (as the crew will see it)").fill("Shiplap 135 — company");
  await enter(ed.getByLabel("Species / profile"), "Spotted gum shiplap");
  await ed.locator('[data-chips="cover"]').getByRole("button", { name: "120 mm", exact: true }).click();
  await edTab(ed, "Ordering");
  await enter(ed.getByLabel("Supplier", { exact: true }), "Supplier A");
  await expect(ed.locator("[data-carried]")).toHaveCount(0); // first supplier: nothing to flag
  await enter(ed.getByLabel("Supplier", { exact: true }), "Supplier B");
  await expect(ed.locator('[data-carried-param="coverMm"]')).toContainText("Effective cover 120 mm was set for Spotted gum shiplap from Supplier A");
  expect(await page.evaluate(() => window.__tc.changes.at(-1).spec.product.effectiveCoverMm ?? null)).toBeNull();
  await expect(ed).toContainText("Jobs can measure with this, but can't order until");
  await expect(ed).toContainText("Effective cover is needed");
  await expect(ed).not.toContainText("Enter the lengths in the supplier's random mix."); // random LM needs no stock length
  await expect(ed.locator('[data-status="quantity"]')).not.toHaveAttribute("data-value", "calculated"); // a product definition has measured nothing

  // keyboard: a field low on the screen stays above the on-screen keyboard AND the sticky Save bar
  const field = ed.getByLabel("Spares");
  await field.evaluate((el) => el.scrollIntoView({ block: "end" }));
  await field.focus({ preventScroll: true });
  await page.setViewportSize({ width: 390, height: 420 });
  await expect.poll(async () => {
    const f = await field.boundingBox();
    const bar = await ed.locator("[data-sticky-footer]").boundingBox();
    return !!f && !!bar && f.y >= 0 && f.y + f.height <= Math.min(420, bar.y);
  }, { timeout: 5000 }).toBe(true);
  await shot(page, "r9-editor-keyboard");
  expect(errors).toEqual([]);
});

test("R10 (05 B5): accessory groups the set has no item for are never silently omitted — Not decided until By others / Exclude (with reason) or an entered item", async ({ page }) => {
  await addCladding(page);
  await family(page, "Accessories");
  await enter(page.getByLabel("Accessory set (e.g. system or supplier pack)"), "Axon accessories");
  await addItem(page, "Starter / base trim");
  await addItem(page, "Membrane / wrap");
  const other = page.locator("[data-other-groups]");
  const keys = await other.locator("[data-other-group]").evaluateAll((els) => els.map((e) => [e.getAttribute("data-other-group"), e.getAttribute("data-value")]));
  expect(keys).toEqual([["corners", "unresolved"], ["joints", "unresolved"], ["openings", "unresolved"], ["tape", "unresolved"], ["sealant", "unresolved"], ["fixings", "unresolved"], ["mesh", "unresolved"]]);
  await expect(other).toContainText("\"Not decided\" is not the same as excluded");
  const tape = other.locator('[data-other-group="tape"]');
  await tape.getByRole("button", { name: "Exclude" }).click();
  await expect(tape).toContainText("Record why");
  await enter(tape.getByLabel("Why it's excluded"), "Windows arrive pre-taped");
  await expect(tape).not.toContainText("Record why");
  const corners = other.locator('[data-other-group="corners"]');
  await expect(corners.getByRole("button", { name: "Entered item above" })).toBeDisabled(); // nothing entered covers it yet
  await addItem(page, "Other item (entered quantity)");
  await corners.getByRole("button", { name: "Entered item above" }).click();
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.rules.scope ?? null, m.rules.scopeReasons ?? null]; })
    .toEqual([{ tape: "exclude", corners: "include" }, { tape: "Windows arrive pre-taped" }]);
  // adding a tape item takes tape out of this list (the item has its own scope)
  await addItem(page, "Tape");
  await expect(other.locator('[data-other-group="tape"]')).toHaveCount(0);
  await shot(page, "r10-other-accessory-groups");
  // UX03: the decisions travel with the set — flagged on another family, restored with their reasons
  await family(page, "Fibre cement");
  await expect(page.locator('[data-carried-param="scope"]')).toContainText("Accessory group decisions (2 groups)");
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.rules.scope ?? null, m.rules.scopeReasons ?? null]; }).toEqual([null, null]);
  await family(page, "Accessories");
  await page.locator('[data-carried-param="scope"]').getByRole("button", { name: /^Use / }).click();
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.rules.scope ?? null, m.rules.scopeReasons ?? null]; })
    .toEqual([{ tape: "exclude", corners: "include" }, { tape: "Windows arrive pre-taped" }]);
});

test("R11: company products and the update review fit 375 px with 44 px targets; an accessory diff reads as items, not array indexes", async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await openTakeoff(page);
  const content = { name: "Axon accessories — company set with a long name to wrap", methodKey: "accessory_routes", methodVersion: 1, spec: { family: "accessory", product: { name: "Axon accessories" }, supplierName: "Supplier A" },
    rules: { recipe: { groups: [{ id: "starter", kind: "starter", label: "Base trim", routes: ["base"], scope: { status: "include" }, stockPolicy: { kind: "list", lengthsMm: [3000] } }] } } };
  const created = await postPreset(page, { content });
  const presetId = created.preset.presetId;
  await postPreset(page, { presetId, expectedRevision: 1, content: { ...content, rules: { recipe: { groups: [{ ...content.rules.recipe.groups[0], label: "Hardie base trim 3000", stockPolicy: { kind: "list", lengthsMm: [3000, 5400] } }] } } } });
  const measure = () => page.evaluate(() => {
    const h = document.getElementById("tc-harness");
    const small = [];
    for (const el of h.querySelectorAll("button, input:not([type=checkbox]), select, summary, a")) { const r = el.getBoundingClientRect(); if (r.width && r.height && r.height < 43.5) small.push(`${el.tagName} ${(el.textContent || "").trim().slice(0, 30)} ${r.height}`); }
    return { over: h.scrollWidth - h.clientWidth, small };
  });
  await mount(page, "presets", { families: ["cladding", "aac", "foam", "timber-cladding", "batten", "accessory"] });
  await expect(page.locator(`[data-preset="${presetId}"]`)).toContainText("rev 2");
  expect(await measure()).toEqual({ over: 0, small: [] });
  const material = { id: "mat-acc-copy", name: content.name, methodKey: "accessory_routes", methodVersion: 1, spec: JSON.parse(JSON.stringify(content.spec)), rules: JSON.parse(JSON.stringify(content.rules)), profile: null, fromPresetId: presetId, fromPresetRevision: 1 };
  await mount(page, "update", { presetId, material });
  const r = page.locator(`[data-preset-update="${presetId}"]`);
  await expect(r.locator("[data-preset-diff]")).toContainText("accessory item 1 › label");
  await expect(r.locator("[data-preset-diff]")).not.toContainText("groups › 0");
  expect(await measure()).toEqual({ over: 0, small: [] });
  await shot(page, "r11-update-review-375");
  expect(errors).toEqual([]);
});

test("R12 (02 §2): pitch is asked only for projected rafters — joists / battens measured on plan are their length; a cleared pitch is not 0°", async ({ page }) => {
  await openTakeoff(page);
  await page.getByRole("button", { name: "Add timber" }).click();
  const t = page.locator('[data-setup="timber"]');
  await enter(t.getByLabel("Pitch"), 27);
  await expect.poll(async () => (await genericMaterial(page)).rules.pitchDeg).toBe(27);
  await enter(t.getByLabel("Pitch"), "");
  await expect.poll(async () => (await genericMaterial(page)).rules.pitchDeg ?? null).toBeNull(); // was silently 0°
  await t.locator('[data-chips="purpose"]').getByRole("button", { name: "Joists" }).click();
  await expect(t.getByLabel("Pitch")).toHaveCount(0);
  await expect(t.locator('[data-chips="length-source"]').getByRole("button", { name: "Measure length" })).toHaveAttribute("aria-pressed", "true");
  await expect(t.locator('[data-chips="length-source"]').getByRole("button", { name: "Measure projection" })).toHaveCount(0);
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.spec.purpose, m.rules.lengthSource]; }).toEqual(["joists", "true"]);
  await t.locator('[data-chips="purpose"]').getByRole("button", { name: "Rafters" }).click();
  await t.locator('[data-chips="length-source"]').getByRole("button", { name: "Measure projection" }).click();
  await expect(t.getByLabel("Pitch")).toBeVisible();
});

test("R13 (CAT01 on a job): a company product the researched catalogue doesn't list shows as the chosen product with its facts and sources — and calculates", async ({ page }) => {
  await openTakeoff(page);
  const mat = { id: "mat-acme", name: "Acme FC sheet — company", methodKey: "sheet_layout", methodVersion: 2, fromPresetId: "pre-acme", fromPresetRevision: 1,
    spec: { family: "cladding", layout: "sheet", orientation: "vertical", product: { manufacturer: "Acme", name: "FC sheet 1200", widthMm: 1200, thicknessMm: 9, effectiveCoverMm: 1200, lengthsMm: [2400, 2700], sourceRefs: ["ACME-DS-1"] } }, rules: {} };
  await mount(page, "setup", { material: mat, wallMm: [4800, 2700] });
  const h = page.locator("#tc-harness");
  await expect(h.locator('[data-chosen-product="custom"]')).toContainText("Acme FC sheet 1200");
  await expect(h.locator('[data-chosen-product="custom"]')).toContainText("Company / entered product");
  await expect(h.locator("[data-product-option]")).toHaveCount(0); // not an open "choose a product" list
  await expect(h.locator('[data-product-facts="custom"]')).toContainText("1,200 wide · 9 thick · effective cover 1,200 mm · 2,400 / 2,700 long");
  await expect(h.locator('[data-product-facts="custom"]')).toContainText("Not in the researched catalogue");
  await expect(h.locator('[data-product-facts="custom"] [data-source-refs]')).toHaveAttribute("data-source-refs", "ACME-DS-1");
  await expect(h.locator('[data-assembly-picker]')).toContainText("No candidate assembly for this product"); // Acme isn't any researched assembly's maker
  await expect(h.locator('[data-quantity-preview] [data-preview-line="sheet"]')).toContainText("4 sheets");
  // it can still be swapped for a researched product
  await h.getByRole("button", { name: "Change product" }).click();
  await expect(h.locator(`[data-product-option="${P.axon133}"]`)).toBeVisible();
});

test("R14: an unfinished sheet joint-row entry is a recoverable draft — it survives leaving and reopening the card, and is never applied until complete", async ({ page }) => {
  await addCladding(page);
  await pick(page, P.axon133);
  await page.locator("[data-advanced] summary").click();
  let rows = page.locator("[data-joint-rows]");
  await enter(rows.getByLabel("Joint height(s) above the clad base"), "2400");
  await enter(rows.getByLabel("Joint gap (from the detail)"), 10);
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.rules.jointRows ?? null, m.rules.jointRowsDraft ?? null]; }).toEqual([null, { atMm: [2400], gapMm: 10 }]);
  await page.getByRole("button", { name: "Close" }).first().click();
  await reopenTakeoff(page); // leave the takeoff entirely and come back
  await page.locator("li", { hasText: "Axon 133 smooth" }).getByRole("button", { name: "Setup" }).click();
  await page.locator("[data-advanced] summary").click();
  rows = page.locator("[data-joint-rows]");
  await expect(rows.getByLabel("Joint height(s) above the clad base")).toHaveValue("2400");
  await expect(rows.getByLabel("Joint gap (from the detail)")).toHaveValue("10");
  await expect(rows).toContainText("Kept as a draft");
  await enter(rows.getByLabel("Joint detail reference"), "H02 horizontal joint detail");
  await expect(rows).toContainText("Applied");
  await expect.poll(async () => { const m = await genericMaterial(page); return [m.rules.jointRows ?? null, m.rules.jointRowsDraft ?? null]; })
    .toEqual([{ atMm: [2400], gapMm: 10, detailRef: "H02 horizontal joint detail" }, null]);
});

// ── adversarial review (TC-R04 phone UI): setup cards ────────────────────────────────────────────────────────
const MIXED = "/carpentry/cjb-1/takeoff?reviewRole=admin&takeoffSeed=mixed";
/** The mixed-procurement seed (rafters measured on plan, Axon + battens on a wall …), with one material's setup card open. */
async function openMixedSetup(page, name) {
  await page.goto(MIXED);
  await ready(page);
  await page.locator("li").filter({ hasText: name }).first().getByRole("button", { name: "Setup" }).click();
}
async function materialById(page, id) {
  const s = await server(page);
  return s.snapshot.materials.find((m) => m.id === id) || null;
}
async function hideApp(page) {
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
}
async function showApp(page) {
  await page.evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event("visibilitychange")); });
}

test("PH-03: text fields apply once on Enter / blur (one undo step); a cleared Name stays a draft and is never saved empty", async ({ page }) => {
  await openTakeoff(page);
  await page.getByRole("button", { name: "Add timber" }).click();
  const t = page.locator('[data-setup="timber"]');
  await expect.poll(async () => (await genericMaterial(page)).name).toBe("Timber");
  const grade = t.getByLabel("Grade (e.g. MGP10)");
  await grade.pressSequentially("MGP10", { delay: 80 });
  await expect(t.locator("[data-undo-bar]")).toContainText("Not saved yet");
  await page.waitForTimeout(900); // longer than the autosave debounce
  expect((await genericMaterial(page)).spec.grade ?? null, "nothing is applied while typing").toBeNull();
  await grade.press("Enter");
  await expect.poll(async () => (await genericMaterial(page)).spec.grade).toBe("MGP10");
  await expect(t.locator("[data-undo-bar]")).not.toContainText("Not saved yet");
  await t.getByRole("button", { name: "Undo" }).click();
  await expect(grade).toHaveValue("");
  await expect(t.getByRole("button", { name: "Undo" }), "the whole word was ONE undo step").toBeDisabled();
  await expect.poll(async () => (await genericMaterial(page)).spec.grade ?? null).toBeNull();

  const name = t.getByLabel("Name", { exact: true });
  await name.fill("");
  await name.blur();
  await expect(t.getByRole("alert").filter({ hasText: "Give the material a name." })).toBeVisible();
  await page.waitForTimeout(900);
  expect((await genericMaterial(page)).name, "an empty name is never sent").toBe("Timber");
  await name.fill("Rafters 90 x 45");
  await name.press("Enter");
  await expect.poll(async () => (await genericMaterial(page)).name).toBe("Rafters 90 x 45");
  await expect(t.getByRole("alert").filter({ hasText: "Give the material a name." })).toHaveCount(0);
});

test("PH-03: a newer value arriving from outside never overwrites the field being typed in", async ({ page }) => {
  await openTakeoff(page);
  await mount(page, "setup", { family: "cladding", groupId: P.axon133, methodKey: "sheet_layout", methodVersion: 2, wallMm: null });
  const h = page.locator("#tc-harness");
  const name = h.getByLabel("Name", { exact: true });
  await name.fill("North wall Axon");
  await page.evaluate(() => window.__tc.setValue((m) => ({ ...m, name: "Axon 133 smooth (server copy)" })));
  await page.waitForTimeout(200);
  await expect(name).toHaveValue("North wall Axon");
  await name.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__tc.material.name)).toBe("North wall Axon");
  // an untouched field does take the outside value
  await page.evaluate(() => window.__tc.setValue((m) => ({ ...m, spec: { ...m.spec, supplierName: "Supplier B" } })));
  await expect(h.getByLabel("Supplier", { exact: true })).toHaveValue("Supplier B");
});

test("PH-04: a number typed but not yet applied is applied when the app is hidden; until then the card says it isn't saved", async ({ page }) => {
  await openTakeoff(page);
  await page.getByRole("button", { name: "Add timber" }).click();
  const t = page.locator('[data-setup="timber"]');
  await expect.poll(async () => (await genericMaterial(page)).name).toBe("Timber");
  await t.getByLabel("Pitch").fill("22.5"); // no Enter, no blur
  await expect(t.locator("[data-undo-bar]")).toContainText("Not saved yet");
  await hideApp(page); // app switch / phone locks
  await expect.poll(async () => (await genericMaterial(page)).rules.pitchDeg ?? null).toBe(22.5);
  await showApp(page);
  await expect(t.locator("[data-undo-bar]")).not.toContainText("Not saved yet");
});

test("PH-11: the fixing route is an installation condition; the assembly's other conditions are entered in plain words until none is still needed", async ({ page }) => {
  await openTakeoff(page);
  await mount(page, "setup", { family: "cladding", groupId: P.axon133, methodKey: "sheet_layout", methodVersion: 2, wallMm: [4800, 2700] });
  const h = page.locator("#tc-harness");
  const missing = () => page.evaluate(() => window.__tc.result.problems.find((p) => p.code === "installation_selectors_missing")?.refs?.[0]?.missing || []);
  expect(await missing()).toContain("direct-or-cavity");
  // the calculation's list is shown in plain words, never as internal keys
  await expect(h.locator("[data-engine-problems]")).toContainText("Installation conditions still needed: wind class");
  await expect(h).not.toContainText("direct-or-cavity");
  await expect(h).not.toContainText("on-or-off-stud");
  await h.locator('[data-chips="route"]').getByRole("button", { name: "Direct fix" }).click();
  await expect.poll(missing).not.toContain("direct-or-cavity");
  const cond = h.locator("[data-install-conditions]");
  await expect(cond).toContainText("4 still needed");
  await cond.locator("summary").click();
  await cond.getByLabel("Wind class").selectOption("N2");
  await enter(cond.getByLabel("Substrate (what it fixes to)"), "Timber frame");
  await cond.locator('[data-chips="cond-on-or-off-stud"]').getByRole("button", { name: "On studs" }).click();
  await enter(cond.getByLabel("Fastener type"), "Nails");
  await expect.poll(missing).toEqual([]);
  await expect(cond).toContainText("All entered");
  expect(await page.evaluate(() => window.__tc.material.rules.installConditions))
    .toEqual({ "direct-or-cavity": "direct", wind: "N2", substrate: "Timber frame", "on-or-off-stud": "on-stud", "fixing-family": "Nails" });
  // entering conditions never verifies anything: no reviewed rule row exists, installation stays source-pending
  await expect(h.locator('[data-status="installation"]')).toHaveAttribute("data-value", "source-pending");
  // the route condition follows the route: Cavity → cavity; a product change takes the route (and the conditions) away, flagged
  await h.locator('[data-chips="route"]').getByRole("button", { name: "Cavity" }).click();
  await expect.poll(() => page.evaluate(() => window.__tc.material.rules.installConditions["direct-or-cavity"])).toBe("cavity");
  await pick(page, P.linea150);
  await expect.poll(() => page.evaluate(() => window.__tc.material.rules.installConditions ?? null)).toBeNull();
  await expect(h.locator('[data-carried-param="installConditions"]')).toContainText("Installation conditions");
  await shot(page, "ph11-install-conditions");
});

test("PH-12: a measured material blocked by a missing value says 'No quantity yet — see why below'; projected rafters without a pitch ask for it", async ({ page }) => {
  await openMixedSetup(page, "Rafters 90 × 45");
  const t = page.locator('[data-setup="timber"]');
  const pv = t.locator("[data-quantity-preview]");
  await expect(pv).toContainText("18 pieces");
  await enter(t.getByLabel("Pitch"), "");
  await expect(pv).toContainText("No quantity yet — see why below.");
  await expect(pv).not.toContainText("add this material to walls");
  await expect(t.locator("[data-needs]")).toContainText("Enter the roof pitch");
  await expect(t.locator("[data-engine-problems]")).toContainText("itch");
});

test("PH-02: support battens can reach an order — fixings from a rule, or By others / Exclude with a reason; the Needs row lists what's left", async ({ page }) => {
  await openMixedSetup(page, "Cavity battens");
  const b = page.locator('[data-setup="batten"]');
  const fx = b.locator("[data-support-fixings]");
  await expect(b.locator("[data-needs]")).toContainText("Support fixings");
  await expect(b.locator("[data-engine-problems]")).toContainText("fixings not quantified");
  await fx.locator('[data-chips="fixing-scope"]').getByRole("button", { name: "By others" }).click();
  await expect(b.locator("[data-needs]")).toContainText("Record why the support fixings are by others.");
  await enter(fx.getByLabel("Why they're by others"), "Framer supplies and fixes them");
  await expect(b.locator("[data-needs]")).toHaveCount(0);
  await expect(b.locator("[data-engine-problems]", { hasText: "fixings not quantified" })).toHaveCount(0);
  await expect(b.locator('[data-status="procurement"]')).toHaveAttribute("data-value", "ready");
  await expect.poll(async () => (await materialById(page, "mat-bat")).rules.fixingScope).toEqual({ status: "by-others", reason: "Framer supplies and fixes them" });
  // or from a reviewed rule: fastener + pattern + reference → a fixings quantity
  await fx.locator('[data-chips="fixing-scope"]').getByRole("button", { name: "From a rule" }).click();
  await expect(b.locator("[data-needs]")).toContainText("Support fixings");
  await enter(fx.getByLabel("Fastener material"), "Galvanised steel");
  await enter(fx.getByLabel("Corrosion class"), "C3");
  await enter(fx.getByLabel("Fastener length"), 65);
  await enter(fx.getByLabel("Head"), "Bugle");
  await enter(fx.getByLabel("Fixes into"), "Timber stud");
  await fx.locator('[data-chips="fixing-mode"]').getByRole("button", { name: "Spacing along each batten" }).click();
  await enter(fx.getByLabel("Fixing spacing"), 600);
  await enter(fx.getByLabel("First fixing from the batten end"), 50);
  await enter(fx.getByLabel("Last fixing from the batten end"), 50);
  await enter(fx.getByLabel("Rule reference (guide / table / row or detail)"), "H02 Table 2 — SM");
  await expect(b.locator("[data-needs]")).toHaveCount(0);
  await expect(b.locator("[data-engine-problems]", { hasText: "fixings not quantified" })).toHaveCount(0);
  await expect(b.locator("[data-quantity-preview] [data-preview-line]")).toHaveCount(2); // battens + fixings
  await expect.poll(async () => { const m = await materialById(page, "mat-bat"); return [m.rules.fixingScope ?? null, m.rules.fixing]; }).toEqual([null, {
    identity: { material: "Galvanised steel", corrosionClass: "C3", lengthMm: 65, head: "Bugle", substrate: "Timber stud" }, mode: "pitch", pitchMm: 600, edgeStartMm: 50, edgeEndMm: 50, ruleRef: "H02 Table 2 — SM" }]);
  await shot(page, "ph02-batten-fixings");
});

test("F10: a board joint rule — over supports at given centres, or between supports for end-matched boards — lets long runs be laid out", async ({ page }) => {
  await openTakeoff(page);
  await mount(page, "setup", { family: "cladding", groupId: "James Hardie|Linea|180|16", methodKey: "course_layout", methodVersion: 1, wallMm: [6000, 2700] });
  const h = page.locator("#tc-harness");
  await expect(h.locator('[data-status="quantity"]')).toHaveAttribute("data-value", "incomplete");
  const j = h.locator("[data-board-joints]");
  await expect(j).toHaveAttribute("open", ""); // opened: runs are longer than the longest board
  await expect(j.locator('[data-chips="joint-mode"]').getByRole("button", { name: "Between supports (end-matched)" })).toBeDisabled(); // Linea isn't end-matched
  await j.locator('[data-chips="joint-mode"]').getByRole("button", { name: "Over supports" }).click();
  await enter(j.getByLabel("Support centres"), 600);
  await expect(j).toContainText("Kept as a draft");
  await expect.poll(() => page.evaluate(() => [window.__tc.material.rules.joints ?? null, window.__tc.material.rules.jointsDraft ?? null])).toEqual([null, { mode: "on-support", centresMm: 600 }]);
  await enter(j.getByLabel("Joint detail reference"), "H04 joint detail");
  await expect(j).toContainText("Applied");
  await expect.poll(() => page.evaluate(() => [window.__tc.material.rules.joints ?? null, window.__tc.material.rules.jointsDraft ?? null]))
    .toEqual([{ orientation: "horizontal", mode: "on-support", centresMm: 600, detailRef: "H04 joint detail" }, null]);
  await expect(h.locator('[data-status="quantity"]')).toHaveAttribute("data-value", "calculated");
  await expect(h.locator('[data-quantity-preview] [data-preview-line="piece"]')).toContainText("36 pieces");
  await shot(page, "f10-board-joints");
  // end-matched timber boards may join between supports
  const tc = { id: "mat-tc", name: "Spotted gum", methodKey: "course_layout", methodVersion: 1, rules: {},
    spec: { family: "timber-cladding", layout: "course", orientation: "horizontal", supply: "fixed", endCondition: "end-matched", product: { name: "Spotted gum", widthMm: 140, thicknessMm: 19, effectiveCoverMm: 120, lengthsMm: [5400], lengthMm: 5400 } } };
  await mount(page, "setup", { material: tc, wallMm: [8000, 2700] });
  const j2 = page.locator("#tc-harness [data-board-joints]");
  await j2.locator('[data-chips="joint-mode"]').getByRole("button", { name: "Between supports (end-matched)" }).click();
  await enter(j2.getByLabel("Shortest piece allowed"), 450);
  await enter(j2.getByLabel("Joint detail reference"), "T01 end-matched joints");
  await expect.poll(() => page.evaluate(() => window.__tc.material.rules.joints ?? null)).toEqual({ orientation: "horizontal", mode: "off-support", minPieceMm: 450, detailRef: "T01 end-matched joints" });
  await expect(page.locator('#tc-harness [data-status="quantity"]')).toHaveAttribute("data-value", "calculated");
});

test("QO-13: non-square Matrix panels ask for portrait or landscape (only what the product lists) and then lay out", async ({ page }) => {
  await openTakeoff(page);
  await mount(page, "setup", { family: "cladding", groupId: "James Hardie|Matrix|590|8", methodKey: "panel_grid", methodVersion: 1, wallMm: [2390, 2990] });
  const h = page.locator("#tc-harness");
  await expect(h.locator("[data-needs]")).toContainText("Choose portrait or landscape panels.");
  const o = h.locator('[data-chips="panel-orientation"]');
  await expect(o.getByRole("button", { name: /^Landscape/ })).toBeDisabled();
  await expect(h).toContainText("isn't listed for landscape installation");
  await o.getByRole("button", { name: /^Portrait/ }).click();
  await expect.poll(() => page.evaluate(() => window.__tc.material.rules.panelOrientation)).toBe("portrait");
  await expect(h.locator('[data-status="quantity"]')).toHaveAttribute("data-value", "calculated");
  await expect(h.locator('[data-quantity-preview] [data-preview-line="sheet"]')).toContainText("8 sheets");
  await expect(h.locator("[data-needs]")).toHaveCount(0);
  // a square panel lays out the same either way — nothing to choose
  await pick(page, P.matrix1190);
  await expect(h.locator('[data-chips="panel-orientation"]')).toHaveCount(0);
  await expect(h).toContainText("Square panel");
});

test("F18: spares are added on top of the layout count and shown per order line — the help text says so", async ({ page }) => {
  await openTakeoff(page);
  await mount(page, "setup", { family: "cladding", groupId: P.axon133, methodKey: "sheet_layout", methodVersion: 2, wallMm: [4800, 2700] });
  const h = page.locator("#tc-harness");
  await expect(h.locator('[data-quantity-preview] [data-preview-line="sheet"]')).toContainText("4 sheets");
  await enter(h.getByLabel("Spares"), 10);
  await expect(h.locator('[data-quantity-preview] [data-preview-line="sheet"]')).toContainText("5 sheets");
  await expect(h.locator('[data-quantity-preview] [data-preview-line="sheet"]')).toContainText("incl. 1 spare");
  await expect(h).toContainText("Added on top of the layout count");
  await expect(h).not.toContainText("doesn't add spares yet");
  await mount(page, "editor", { value: null });
  await page.locator("#tc-harness").getByRole("tab", { name: "Ordering" }).click();
  await expect(page.locator("#tc-harness")).toContainText("Added on top of each job's layout count");
  await expect(page.locator("#tc-harness")).not.toContainText("don't add spares yet");
});

test("PH-18: an aluminium profile whose only gap is the saw kerf reads 'Kerf not confirmed' — not 'Missing product'", async ({ page }) => {
  await openTakeoff(page);
  await page.getByRole("button", { name: "Add aluminium" }).click();
  const a = page.locator('[data-setup="aluminium"]');
  await expect(a.locator('[data-status="procurement"]')).toContainText("Kerf not confirmed");
  await expect(a.locator('[data-status="procurement"]')).not.toContainText("Missing product");
  await enter(a.getByLabel("Saw kerf", { exact: true }), 3);
  await a.getByLabel("The saw kerf above is confirmed for this job").check();
  await expect(a.locator('[data-status="procurement"]')).not.toContainText("Kerf not confirmed");
});

test("Phone 375 px: installation conditions, board joints, panel orientation and support fixings fit with 44 px targets", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openTakeoff(page);
  const check = async (what) => {
    const m = await page.evaluate(() => {
      const host = document.getElementById("tc-harness");
      const small = [];
      for (const el of host.querySelectorAll("button, input:not([type=checkbox]), select, summary, a")) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && r.height < 43.5) small.push(`${el.tagName} ${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)} ${r.height}`);
      }
      return { doc: document.documentElement.scrollWidth, host: host.scrollWidth - host.clientWidth, small };
    });
    expect(m.doc, `page width — ${what}`).toBeLessThanOrEqual(375);
    expect(m.host, `overflow — ${what}`).toBeLessThanOrEqual(0);
    expect(m.small, `small targets — ${what}`).toEqual([]);
  };
  await mount(page, "setup", { family: "cladding", groupId: P.axon133, methodKey: "sheet_layout", methodVersion: 2, wallMm: [4800, 2700] });
  await page.locator("#tc-harness [data-install-conditions] summary").click();
  await check("installation conditions");
  await page.locator("#tc-harness [data-engine-problems] summary").click().catch(() => {});
  await check("calculation notes");
  await mount(page, "setup", { family: "cladding", groupId: "James Hardie|Linea|180|16", methodKey: "course_layout", methodVersion: 1, wallMm: [6000, 2700] });
  await page.locator('#tc-harness [data-chips="joint-mode"]').getByRole("button", { name: "Over supports" }).click();
  await check("board joints");
  await mount(page, "setup", { family: "cladding", groupId: "James Hardie|Matrix|590|8", methodKey: "panel_grid", methodVersion: 1, wallMm: [2390, 2990] });
  await check("panel orientation");
  await mount(page, "setup", { family: "batten", groupId: P.cavityBatten, methodKey: "support_grid", methodVersion: 1, wallMm: [4800, 2700], rules: { maxSpacingMm: 600 } });
  await page.locator('#tc-harness [data-chips="fixing-mode"]').getByRole("button", { name: "Spacing along each batten" }).click();
  await check("support fixings");
  await shot(page, "phone-375-support-fixings");
});
