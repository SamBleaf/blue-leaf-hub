// Hub review HUB 022 — Line, height and runs (wall-by-wall plan, phase 1). Pure rules from the measure helpers:
// which materials get Line, the height in force at each tap (earlier walls never change; a straight wall splits where
// the height changes), the run's walls (runId + seq, tap order), the run label, the wall list's items, the last height
// and the corner shared by two walls; acceptance 4 (one wall's height changes that wall only) through the real engine.
// The screens are in e2e/ui-review/tc-measure.spec.js + tc-walls.spec.js; the real
// server keeping runId + seq is in scripts/tests/takeoff-api.test.mjs.
import assert from "node:assert/strict";
import { lastWallHeight, lineWallInputs, loadDraft, nextWallInputs, runIdOf, runLabel, saveDraft, toolsFor, upgradeDraft, wallListItems, wallRuns, wallTopMm } from "../../src/components/takeoff/measure/tools.js";
import { runLegs, sharedCorners, straightLegs } from "../../src/components/takeoff/measure/geometry.js";
import { computeWorkspace } from "../../shared/takeoff/index.js";
import { productGroups, specFromGroup } from "../../shared/takeoff/products/index.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } }
const P = (x, y) => ({ x, y });
const R1 = "11111111-1111-4111-8111-111111111111", R2 = "22222222-2222-4222-8222-222222222222";
const wall = (id, inputs, extra = {}) => ({ id, kind: "wall", documentId: "d", pageIndex: 0, points: [P(0, 0), P(1, 0)], inputs, ...extra });

t("Line on every cladding-type wall material; timber studs, plates and noggins keep Wall", () => {
  const keys = (spec, methodKey = "sheet_layout") => toolsFor({ spec, methodKey }).map((x) => x.k);
  for (const family of ["cladding", "aac", "foam", "timber-cladding", "batten", "accessory"]) assert.deepEqual(keys({ family }), ["line", "select", "pan"], family);
  assert.equal(toolsFor({ spec: { family: "cladding" }, methodKey: "sheet_layout" })[0].label, "Line");
  assert.deepEqual(keys({ family: "timber", purpose: "studs" }, "wall_frame"), ["wall", "select", "pan"]);
  assert.deepEqual(keys({ family: "timber", purpose: "plates" }, "linear_stock"), ["wall", "run", "count", "select", "pan"]);
  assert.deepEqual(keys({ family: "timber", purpose: "noggins" }, "linear_stock"), ["wall", "count", "select", "pan"]);
  assert.deepEqual(keys({}, "flashing_runs"), ["run", "count", "select", "pan"]);
});

t("acceptance 3: 2,700 for the start and two corners, then 3,600 for two more → walls 1–2 at 2,700, walls 3–4 at 3,600", () => {
  const pts = [P(0, 0), P(100, 0), P(100, 80), P(0, 80), P(0, 0)];
  const legs = runLegs(pts, [2700, 2700, 2700, 3600, 3600]);
  assert.deepEqual(legs.map((l) => l.heightMm), [2700, 2700, 3600, 3600]);
  assert.deepEqual(legs.map((l) => [l.a, l.b]), straightLegs(pts), "same corners as before — only the heights are new");
});

t("changing the height mid-run never changes an earlier wall (the run traced so far is a prefix of the finished run)", () => {
  const pts = [P(0, 0), P(100, 0), P(100, 80)];
  const before = runLegs(pts, [3000, 3000, 3000]);
  const after = runLegs([...pts, P(0, 80)], [3000, 3000, 3000, 3600]);
  assert.deepEqual(after.slice(0, before.length), before);
  assert.equal(after[2].heightMm, 3600);
});

t("a straight wall splits where the height changes; taps along it at the same height stay ONE wall", () => {
  const pts = [P(0, 0), P(60, 0), P(100, 0)];
  assert.deepEqual(runLegs(pts, [2700, 2700, 2700]).map((l) => [l.a.x, l.b.x, l.heightMm]), [[0, 100, 2700]]);
  assert.deepEqual(runLegs(pts, [2700, 2700, 3600]).map((l) => [l.a.x, l.b.x, l.heightMm]), [[0, 60, 2700], [60, 100, 3600]]);
  // the start point's own height is never used: only a change between two walls splits
  assert.deepEqual(runLegs(pts, [9999, 2700, 2700]).map((l) => l.heightMm), [2700]);
  // no height yet: the walls are made without one (they show "Heights needed")
  assert.deepEqual(runLegs(pts, null).map((l) => l.heightMm), [null]);
  assert.deepEqual(runLegs(pts, [null, 0, -5]).map((l) => l.heightMm), [null]);
});

t("duplicate taps are skipped with their heights; fewer than two points is no wall", () => {
  assert.deepEqual(runLegs([P(0, 0), P(0, 0), P(50, 0), P(50, 0), P(50, 40)], [1, 2700, 2700, 3000, 3000]).map((l) => l.heightMm), [2700, 3000]);
  assert.deepEqual(runLegs([P(0, 0)], [2700]), []);
  assert.deepEqual(runLegs([], []), []);
});

t("each wall of a run: 'Wall N', its height, its runId and its place (seq) — older walls keep naming by count", () => {
  const known = [wall("a", { kind: "rect", name: "Wall 1", heightMm: 2400 }), wall("b", { kind: "rect", name: "Wall 2" })];
  assert.deepEqual(lineWallInputs(known, { heightMm: 3000, runId: R1, seq: 1 }), { kind: "rect", heightMm: 3000, name: "Wall 3", runId: R1, seq: 1 });
  assert.deepEqual(lineWallInputs(known, { heightMm: null, runId: R1, seq: 2 }), { kind: "rect", name: "Wall 3", runId: R1, seq: 2 });
  assert.equal(runIdOf(wall("c", { runId: R1 })), R1);
  assert.equal(runIdOf(wall("c", { runId: "" })), null);
  assert.equal(runIdOf(wall("c", {})), null);
});

t("runs come back in tap order whatever order the walls arrive in; runs are numbered in takeoff order", () => {
  const ms = [
    wall("old", { kind: "rect", name: "North", heightMm: 2400 }),
    wall("r1-3", { kind: "rect", heightMm: 2700, runId: R1, seq: 3 }), wall("r1-1", { kind: "rect", heightMm: 2700, runId: R1, seq: 1 }),
    wall("r1-2", { kind: "rect", heightMm: 2700, runId: R1, seq: 2 }), wall("r1-4", { kind: "rect", heightMm: 2700, runId: R1, seq: 4 }),
    wall("r2-2", { kind: "rect", heightMm: 3600, runId: R2, seq: 2 }), wall("r2-1", { kind: "rect", heightMm: 2700, runId: R2, seq: 1 }),
    wall("gone", { kind: "rect", heightMm: 9000, runId: R2, seq: 3 }, { archived: true }),
    { id: "o", kind: "opening", inputs: { runId: R2, seq: 9 } },
  ];
  const runs = wallRuns(ms);
  assert.deepEqual([...runs.keys()], [R1, R2]);
  assert.deepEqual(runs.get(R1).walls.map((w) => w.id), ["r1-1", "r1-2", "r1-3", "r1-4"]);
  assert.deepEqual(runs.get(R2).walls.map((w) => w.id), ["r2-1", "r2-2"], "archived walls and openings are never in a run");
  assert.equal(runLabel(runs.get(R1)), "Run 1 · 4 walls · 2,700");
  assert.equal(runLabel(runs.get(R2)), "Run 2 · 2 walls · 2,700 / 3,600");
  assert.equal(runLabel({ n: 3, walls: [wall("x", { kind: "rect" })] }), "Run 3 · 1 wall · no height yet");
  // review fix: a wall with no height is never hidden behind the others' heights
  assert.equal(runLabel({ n: 1, walls: [wall("x", { kind: "rect" }), wall("y", { kind: "rect", heightMm: 2700 })] }), "Run 1 · 2 walls · 2,700 · 1 needs a height");
  assert.equal(runLabel({ n: 1, walls: [wall("x", { kind: "rect" }), wall("z", { kind: "rect" }), wall("y", { kind: "rect", heightMm: 2700 })] }), "Run 1 · 3 walls · 2,700 · 2 need a height");
  assert.equal(runLabel({ n: 1, walls: [wall("x", { kind: "gable", eavesHeightMm: 2400 }), wall("y", { kind: "rect", heightMm: 2700 })] }), "Run 1 · 2 walls · 2,700 · 1 needs a height", "a gable with no apex yet");
  // the last height used: inside a run it's the wall tapped last, never whichever came back last
  assert.equal(lastWallHeight(ms.slice(0, 5)), 2700);
  assert.equal(lastWallHeight(ms), 3600);
  assert.equal(lastWallHeight([...ms.slice(0, 5), wall("r1-0", { kind: "rect", heightMm: 2000, runId: R1, seq: 0 })]), 2700);
  assert.equal(nextWallInputs(ms).heightMm, 3600);
  assert.equal(lastWallHeight([]), null);
});

t("the wall list: a run is ONE item (its walls in tap order); older walls and one-wall runs stand on their own", () => {
  const ms = [
    wall("old", { kind: "rect", name: "North" }),
    wall("r1-2", { kind: "rect", runId: R1, seq: 2 }), wall("r1-1", { kind: "rect", runId: R1, seq: 1 }),
    wall("solo", { kind: "rect", runId: R2, seq: 1 }), wall("typed", { kind: "rect", name: "By numbers" }),
  ];
  const items = wallListItems(ms, wallRuns(ms));
  assert.deepEqual(items.map((it) => (it.run ? `run:${it.walls.map((w) => w.id).join(",")}` : it.wall.id)), ["old", "run:r1-1,r1-2", "solo", "typed"]);
  // only the walls in THIS list count (walls on other materials are listed apart)
  const mineOnly = wallListItems([ms[0], ms[1], ms[3]], wallRuns(ms));
  assert.deepEqual(mineOnly.map((it) => (it.run ? "run" : it.wall.id)), ["old", "r1-2", "solo"]);
});

t("wallTopMm: rectangle height, sloping top high end, gable apex", () => {
  assert.equal(wallTopMm({ kind: "rect", heightMm: 2700 }), 2700);
  assert.equal(wallTopMm({ kind: "rake", startHeightMm: 2400, endHeightMm: 3000 }), 3000);
  assert.equal(wallTopMm({ kind: "gable", eavesHeightMm: 2700, apexHeightMm: 4200 }), 4200);
  assert.equal(wallTopMm({ kind: "polygon" }), null);
  assert.equal(wallTopMm({}), null);
});

t("a corner shared by two walls is found on both; outlines and other pages never link", () => {
  const a = { id: "a", kind: "wall", documentId: "d", pageIndex: 0, points: [P(0, 0), P(100, 0)], inputs: { kind: "rect" } };
  const b = { id: "b", kind: "wall", documentId: "d", pageIndex: 0, points: [P(100, 0), P(100, 80)], inputs: { kind: "rect" } };
  const c = { id: "c", kind: "wall", documentId: "d", pageIndex: 1, points: [P(100, 0), P(200, 0)], inputs: { kind: "rect" } };
  const outline = { id: "o", kind: "wall", documentId: "d", pageIndex: 0, points: [P(100, 0), P(150, 50), P(100, 90)], inputs: { kind: "polygon" } };
  const line = { id: "l", kind: "polyline", documentId: "d", pageIndex: 0, points: [P(100, 0), P(130, 0)] };
  const all = [a, b, c, outline, line];
  assert.deepEqual(sharedCorners(all, a, 1), [{ id: "b", index: 0 }]);
  assert.deepEqual(sharedCorners(all, b, 0), [{ id: "a", index: 1 }]);
  assert.deepEqual(sharedCorners(all, a, 0), [], "a free end moves alone");
  assert.deepEqual(sharedCorners(all, outline, 0), [], "a traced elevation outline is never linked");
  assert.deepEqual(sharedCorners([...all, { ...b, id: "gone", archived: true }], a, 1), [{ id: "b", index: 0 }]);
});

t("the unfinished run keeps the height of every tap and the height in the box on this device", () => {
  const store = new Map();
  globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  try {
    assert.equal(saveDraft("k", { tool: "line", points: [P(1, 2), P(3, 4)], heights: [2700, 3600], heightMm: 3600 }), true);
    assert.deepEqual(loadDraft("k"), { tool: "line", points: [P(1, 2), P(3, 4)], splitsMm: [], measurementId: null, heights: [2700, 3600], heightMm: 3600 });
    store.set("k", JSON.stringify({ tool: "line", points: [P(1, 2), P(3, 4)], heights: [2700, "x"], heightMm: -1 }));
    assert.deepEqual(loadDraft("k").heights, [2700, null], "a broken height is dropped, never guessed");
    assert.equal(loadDraft("k").heightMm, null);
    saveDraft("k", { tool: "run", points: [P(1, 2)] });
    assert.equal("heights" in loadDraft("k"), false, "other tools are unchanged");
  } finally { delete globalThis.window; }
});

t("review fix: a cladding drawing kept by the older Wall tool carries on as a Line run (heights the Wall tool would have used)", () => {
  const old = { tool: "wall", points: [P(1, 2), P(3, 4), P(5, 6)], splitsMm: [], measurementId: null };
  const line = ["line", "select", "pan"], timber = ["wall", "select", "pan"];
  assert.deepEqual(upgradeDraft(old, line, 3000), { ...old, tool: "line", heights: [3000, 3000, 3000], heightMm: 3000 });
  assert.deepEqual(upgradeDraft(old, line, null), { ...old, tool: "line", heights: [null, null, null], heightMm: null }, "no height on the takeoff yet: Heights needed");
  assert.equal(upgradeDraft(old, timber, 3000), old, "timber still has Wall: unchanged");
  const run = { tool: "run", points: [P(1, 2)], splitsMm: [], measurementId: null };
  assert.equal(upgradeDraft(run, line, 3000), run, "other tools are unchanged");
  assert.equal(upgradeDraft(null, line, 3000), null);
});

// ── acceptance 4 through the REAL engine (computeWorkspace): one wall to 3,600 changes that wall only ─────────────
const axonGroup = productGroups({ family: "cladding" }).find((x) => x.name === "Axon 400 smooth");
const axonSpec = { ...specFromGroup(axonGroup), assemblyId: "axon-vertical", spareRate: 0 };
const JOINT = { atMm: [], gapMm: 10, detailRef: "H-flashing" };   // Blue Leaf's joint rule: a joint is placed when a wall is taller than a sheet
function runWorkspace(heights, { withRun = true } = {}) {
  const lengths = [6000, 4000, 6000, 4000];
  return computeWorkspace({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [],
    materials: [{ id: "clad", name: "Axon 400 smooth", methodKey: "sheet_layout", methodVersion: 2, spec: axonSpec, rules: { route: "cavity", jointRows: JOINT } }],
    measurements: lengths.map((w, i) => ({ id: `w${i + 1}`, kind: "wall", inputs: { kind: "rect", widthMm: w, heightMm: heights[i], name: `Wall ${i + 1}`, ...(withRun ? { runId: R1, seq: i + 1 } : {}) } })),
    contributions: lengths.map((_, i) => ({ id: `c${i + 1}`, measurementId: `w${i + 1}`, jobMaterialId: "clad", role: "wall" })) });
}
const sheetsOrdered = (c) => c.scheduleLines.filter((l) => l.unit === "sheet").reduce((n, l) => n + l.quantity, 0);
const layoutOf = (c, id) => c.materialResults.clad.layouts.find((L) => L.wallMeasurementId === id || L.wallId === id);
const cellShape = (L) => L.cells.map((cl) => [cl.id, cl.rect.x0, cl.rect.x1, cl.rect.y0, cl.rect.y1, cl.occupied, cl.cutWidthMm, cl.cutLengthMm]);

t("the run fields change nothing in the calculation (a traced run = the same walls entered one by one)", () => {
  const a = runWorkspace([2700, 2700, 2700, 2700]), b = runWorkspace([2700, 2700, 2700, 2700], { withRun: false });
  assert.deepEqual(a.scheduleLines.map((l) => [l.unit, l.quantity, l.finishedLengthMm]), b.scheduleLines.map((l) => [l.unit, l.quantity, l.finishedLengthMm]));
  assert.equal(sheetsOrdered(a), 18, "6 + 4 + 6 + 4 m at 2,700 on 1,200 cover: 5 + 4 + 5 + 4 strips = 18 sheets (the plan's check job)");
});

t("acceptance 4: wall 1 to 3,600 gets its own joint (H-flashing) and sheets; walls 2–4 keep their layout exactly", () => {
  const before = runWorkspace([2700, 2700, 2700, 2700]), after = runWorkspace([3600, 2700, 2700, 2700]);
  const w1a = layoutOf(after, "w1");
  assert.equal(w1a.joints.length, 1, "taller than the 3,000 sheet → one horizontal joint");
  assert.equal(w1a.joints[0].detailRef, "H-flashing");
  assert.notDeepEqual(cellShape(w1a), cellShape(layoutOf(before, "w1")));
  for (const id of ["w2", "w3", "w4"]) {
    assert.deepEqual(cellShape(layoutOf(after, id)), cellShape(layoutOf(before, id)), `${id}: same cells, same cut sizes`);
    assert.equal(layoutOf(after, id).joints.length, 0, `${id}: no joint`);
  }
  assert.ok(sheetsOrdered(after) > sheetsOrdered(before), `${sheetsOrdered(before)} → ${sheetsOrdered(after)} sheets`);
});

console.log(`takeoff-tc-hub022: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
