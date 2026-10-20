// Wall-by-wall plan step 5 (Sam, 21 Oct 2026): "review all walls at the end, or by clicking on them in takeoff via the
// select tool". Pure rules from the measure helpers plus the REAL engine (computeWorkspace):
//   reviewWalls        the order ‹ Previous wall / Next wall › step through — the material's runs by run number, each
//                      run's walls in tap order (seq), then its other walls in takeoff order; nobody else's walls
//   wallCladdingTotals each wall's cladding quantities in one short line (sheets, battens, foam tape, H-flashing),
//                      before spares. Acceptance 11: added up over the walls they ARE the order (before its spares),
//                      with sheets shared across walls counted once, on the wall they are ordered on (HUB 016b)
//   orderedId          walls and runs get time-ordered ids: walls saved together (one save time) come back from the
//                      server in the order they were made (it sorts by save time, then id — takeoff-api.test.mjs)
// The screens are in e2e/ui-review/tc-review.spec.js. Nothing new is stored.
//   node scripts/tests/takeoff-tc-review.test.mjs
import assert from "node:assert/strict";
import { reviewWalls, wallCladdingText, wallCladdingTotals, wallTagOn } from "../../src/components/takeoff/measure/tools.js";
import { computeWorkspace, methodFor } from "../../shared/takeoff/index.js";
import { productGroups, specFromGroup } from "../../shared/takeoff/products/index.js";
import { orderedId } from "../../src/lib/orderedId.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } }

const R1 = "11111111-1111-4111-8111-111111111111", R2 = "22222222-2222-4222-8222-222222222222";
const wall = (id, inputs, extra = {}) => ({ id, kind: "wall", inputs, ...extra });
const con = (id, measurementId, jobMaterialId, extra = {}) => ({ id, measurementId, jobMaterialId, role: "wall", ...extra });
const ids = (list) => list.map((w) => w.id);

t("review order: the runs by run number, each run's walls in tap order, then the other walls in takeoff order", () => {
  // Run 1 is traced first (its walls come back from the server in no set order); a wall by numbers sits between
  // the runs; Run 2 comes after it; an older traced wall has no run
  const ms = [
    wall("a3", { name: "Wall 3", runId: R1, seq: 3 }), wall("a1", { name: "Wall 1", runId: R1, seq: 1 }), wall("a2", { name: "Wall 2", runId: R1, seq: 2 }),
    wall("n", { name: "North" }),
    wall("b2", { name: "Wall 5", runId: R2, seq: 2 }), wall("b1", { name: "Wall 4", runId: R2, seq: 1 }),
    wall("old", { name: "Old" }, { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }),
  ];
  const cs = ms.map((m) => con(`c-${m.id}`, m.id, "clad"));
  assert.deepEqual(ids(reviewWalls(ms, cs, "clad")), ["a1", "a2", "a3", "b1", "b2", "n", "old"]);
});

t("review order: only this material's live walls — other materials' walls, archived walls and archived contributions are left out; openings are never walls", () => {
  const ms = [
    wall("a1", { name: "Wall 1", runId: R1, seq: 1 }), wall("a2", { name: "Wall 2", runId: R1, seq: 2 }), wall("a3", { name: "Wall 3", runId: R1, seq: 3 }),
    wall("x", { name: "Gone" }, { archived: true }), wall("s", { name: "Shiplap wall" }), wall("e", { name: "East" }),
    { id: "w1", kind: "opening", parentId: "a1", inputs: { label: "W1" } },
  ];
  const cs = [con("1", "a1", "clad"), con("2", "a2", "other"), con("3", "a3", "clad"), con("4", "x", "clad"), con("5", "s", "other"), con("6", "e", "clad", { archived: true }),
    con("7", "e", "other"), { id: "8", measurementId: "w1", jobMaterialId: "clad", role: "opening" }];
  // Wall 2 of the run is on another material: the run still comes first, without it
  assert.deepEqual(ids(reviewWalls(ms, cs, "clad")), ["a1", "a3"]);
  assert.deepEqual(ids(reviewWalls(ms, cs, "other")), ["a2", "s", "e"]);
  assert.deepEqual(reviewWalls(ms, cs, null), []);
  assert.deepEqual(reviewWalls(ms, cs, "nobody"), []);
  assert.deepEqual(reviewWalls(null, null, "clad"), []);
});

t("review order: a material on two runs and a wall by numbers (a follower such as battens put on the cladding's walls)", () => {
  const ms = [wall("b1", { name: "Wall 4", runId: R2, seq: 1 }), wall("a1", { name: "Wall 1", runId: R1, seq: 1 }), wall("n", { name: "North" }), wall("a2", { name: "Wall 2", runId: R1, seq: 2 })];
  // Run 2's wall arrives first, so it is Run 1 (runs are numbered in takeoff order): it is reviewed first
  const cs = ms.map((m) => con(`c-${m.id}`, m.id, "bat"));
  assert.deepEqual(ids(reviewWalls(ms, cs, "bat")), ["b1", "a1", "a2", "n"]);
});

t("the short line: sheets, panels, boards or LM, pieces from other walls, battens, foam tape and H-flashing, in plain words", () => {
  assert.equal(wallCladdingText(null), "");
  assert.equal(wallCladdingText({ sheets: 5, panels: 0, boards: 0, lm: 0, borrowed: 0, battens: 18, battenMm: 36600, tapeMm: 8100, hFlashingMm: 0 }),
    "5 sheets · 18 batten pieces · 8.1 m foam tape");
  assert.equal(wallCladdingText({ sheets: 1, panels: 0, boards: 0, lm: 0, borrowed: 1, battens: 1, battenMm: 3000, tapeMm: 7180, hFlashingMm: 2950 }),
    "1 sheet · 1 piece from other walls · 1 batten piece · 7.2 m foam tape · 2.95 m H-flashing");
  assert.equal(wallCladdingText({ sheets: 0, panels: 0, boards: 42, lm: 0, borrowed: 0, battens: 9, battenMm: 24000, tapeMm: 0, hFlashingMm: 0 }), "42 boards · 9 batten pieces");
  assert.equal(wallCladdingText({ sheets: 0, panels: 6, boards: 0, lm: 0, borrowed: 0, battens: 0, battenMm: 0, tapeMm: 0, hFlashingMm: 0 }), "6 panels");
  assert.equal(wallCladdingText({ sheets: 0, panels: 0, boards: 0, lm: 57.04, borrowed: 0, battens: 7, battenMm: 19000, tapeMm: 0, hFlashingMm: 0 }), "57.0 LM (estimate) · 7 batten pieces");
});

// ── the engine: a 4-wall Axon run (two windows, a door), a gable with an H joint, a wall by numbers ──────────────
const group = (name) => productGroups({ family: "cladding" }).find((g) => g.name === name);
const fam = (spec) => { const m = methodFor(spec); return { spec, methodKey: m.key, methodVersion: m.version }; };
const JOINT = { atMm: [], gapMm: 10, detailRef: "H-flashing" };
const axon = (id, spareRate, rules = {}) => ({ id, name: "Axon 400 smooth", ...fam({ ...specFromGroup(group("Axon 400 smooth")), assemblyId: "axon-vertical", spareRate }), rules: { route: "cavity", jointRows: JOINT, ...rules } });
const rect = (id, widthMm, heightMm, name, run) => wall(id, { kind: "rect", widthMm, heightMm, name, ...(run ? { runId: R1, seq: run } : {}) });
const op = (id, parentId, xMm, sillMm, widthMm, heightMm, label, type = "window") => ({ id, kind: "opening", parentId, inputs: { xMm, sillMm, widthMm, heightMm, label, type } });
const JOB = [
  // the run arrives out of tap order, as walls saved together do
  rect("w3", 6000, 2700, "Wall 3", 3), rect("w1", 6000, 2700, "Wall 1", 1), rect("w2", 4000, 2700, "Wall 2", 2), rect("w4", 4000, 3600, "Wall 4", 4),
  wall("g", { kind: "gable", widthMm: 6000, eavesHeightMm: 2400, apexXMm: 3000, apexHeightMm: 3600, name: "Gable" }),
  rect("n", 2800, 2400, "North"),
  op("o1", "w1", 1000, 900, 1200, 1200, "W1"), op("o2", "w1", 3800, 900, 1200, 1200, "W2"), op("o3", "w2", 1500, 0, 900, 2100, "D1", "door"), op("o4", "w3", 2400, 900, 1200, 1200, "W1"),
];
function job(spareRate = 10, rules = {}) {
  const snap = { workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [], materials: [axon("clad", spareRate, rules)],
    measurements: JOB, contributions: JOB.filter((m) => m.kind === "wall").map((m) => con(`c-${m.id}`, m.id, "clad")) };
  return { snap, c: computeWorkspace(snap) };
}
const lines = (c) => c.scheduleLines.filter((l) => l.jobMaterialIds.includes("clad"));
const beforeSpares = (l) => l.quantity - (l.spareQuantity || 0);
const perWall = (snap, c) => reviewWalls(snap.measurements, snap.contributions, "clad")
  .map((w) => ({ w, t: wallCladdingTotals(c.materialResults.clad, w.id, wallTagOn(snap.measurements, snap.contributions, "clad", w.id)) }));
const sum = (rows, k) => rows.reduce((a, r) => a + (r.t?.[k] || 0), 0);

t("acceptance 11: Review walls steps the run in tap order, then the gable and the wall by numbers", () => {
  const { snap } = job();
  assert.deepEqual(reviewWalls(snap.measurements, snap.contributions, "clad").map((w) => w.inputs.name), ["Wall 1", "Wall 2", "Wall 3", "Wall 4", "Gable", "North"]);
});

t("acceptance 11: the walls' sheets add up to the order's sheets before spares — a sheet shared across walls is counted once, on the wall it is ordered on", () => {
  const { snap, c } = job();
  const rows = perWall(snap, c);
  for (const r of rows) assert.ok(r.t, `${r.w.inputs.name} has quantities`);
  const sheetLines = lines(c).filter((l) => l.unit === "sheet" && !l.follower);
  assert.ok(sheetLines.length >= 1);
  const ordered = sheetLines.reduce((a, l) => a + beforeSpares(l), 0);
  assert.equal(sum(rows, "sheets"), ordered, "Σ walls = the order before spares");
  // the spares are on top: 10 % of the sheets, rounded up once for the material
  assert.equal(sheetLines.reduce((a, l) => a + (l.spareQuantity || 0), 0), Math.ceil(ordered * 0.1 - 1e-9));
  // and with sharing off, each wall's own plan still adds up
  const own = job(10, { shareSheetsAcrossWalls: false });
  const ownRows = perWall(own.snap, own.c);
  assert.equal(sum(ownRows, "sheets"), lines(own.c).filter((l) => l.unit === "sheet" && !l.follower).reduce((a, l) => a + beforeSpares(l), 0));
  assert.ok(sum(ownRows, "borrowed") === 0, "no pieces from other walls when each wall is planned on its own");
});

t("acceptance 11: the walls' foam tape is the order's tape (metres before the job's rolls), their H-flashing the order's cuts, their batten pieces the battens cut", () => {
  const { snap, c } = job(0);
  const rows = perWall(snap, c);
  const res = c.materialResults.clad;
  const tapeLine = lines(c).find((l) => l.follower === "tape");
  assert.ok(tapeLine, "a tape line");
  const tapeM = Number(/^([\d.]+) m behind the vertical sheet joins/.exec(tapeLine.item.note)?.[1]);
  assert.ok(tapeM > 0);
  assert.ok(Math.abs(sum(rows, "tapeMm") / 1000 - tapeM) < 0.006, `Σ walls ${sum(rows, "tapeMm")} mm = ${tapeM} m on the order`);
  assert.equal(tapeLine.quantity, Math.ceil(sum(rows, "tapeMm") / 25000 - 1e-9), "rolls rounded once for the job");
  // H-flashing: Wall 4 (3,600 high) and the gable have an H joint; the order buys whole 3,000 lengths of exactly those cuts
  const hDemands = res.demands.filter((d) => d.follower === "hflashing");
  assert.equal(sum(rows, "hFlashingMm"), hDemands.reduce((a, d) => a + d.lengthMm * d.quantity, 0));
  assert.ok(rows.find((r) => r.w.inputs.name === "Wall 4").t.hFlashingMm > 0 && rows.find((r) => r.w.inputs.name === "Gable").t.hFlashingMm > 0);
  assert.equal(rows.find((r) => r.w.inputs.name === "Wall 1").t.hFlashingMm, 0, "2,700 fits one sheet: no H joint");
  const hLine = lines(c).find((l) => l.follower === "hflashing");
  assert.ok(hLine.quantity * 3000 >= sum(rows, "hFlashingMm"), "whole lengths cover every cut");
  // battens: every piece cut is on exactly one wall
  const bDemands = res.demands.filter((d) => d.follower === "battens");
  assert.equal(sum(rows, "battens"), bDemands.reduce((a, d) => a + d.quantity, 0));
  assert.ok(Math.abs(sum(rows, "battenMm") - bDemands.reduce((a, d) => a + d.lengthMm * d.quantity, 0)) < 1e-6);
  const bLine = lines(c).find((l) => l.follower === "battens");
  assert.ok(bLine.quantity <= sum(rows, "battens"), "the order buys whole battens, offcuts shared: never more than the pieces cut");
});

t("each wall's line reads its own numbers (the same as the layout's own followers)", () => {
  const { snap, c } = job(0);
  for (const { w, t: tot } of perWall(snap, c)) {
    const L = c.materialResults.clad.layouts.find((x) => x.wallMeasurementId === w.id || x.wallId === w.id);
    assert.equal(tot.battens, L.followers.battens.lines.length, `${w.inputs.name} battens`);
    assert.equal(tot.tapeMm, L.followers.tape.totalMm, `${w.inputs.name} tape`);
    const text = wallCladdingText(tot);
    assert.match(text, /^\d+ sheets?( · \d+ pieces? from other walls)? · \d+ batten pieces · [\d.]+ m foam tape( · [\d.]+ m H-flashing)?$/, `${w.inputs.name}: ${text}`);
  }
  // Wall 1: 6,000 × 2,700 with W1 and W2 — the step-4 check job's North wall: 27 batten pieces, 8.4 m of tape
  const byName = Object.fromEntries(perWall(snap, c).map((r) => [r.w.inputs.name, r.t]));
  assert.equal(byName["Wall 1"].battens, 27);
  assert.equal(byName["Wall 1"].tapeMm, 8400);
  assert.equal(wallCladdingText(byName["Wall 1"]), "5 sheets · 27 batten pieces · 8.4 m foam tape");
  // the gable: its own H joint between the rakes (1,525 → 4,475 at 3,000 / 3,010) and 12.46 m of tape
  assert.equal(byName.Gable.hFlashingMm, 2950);
  assert.match(wallCladdingText(byName.Gable), / · 12\.5 m foam tape · 2\.95 m H-flashing$/);
});

t("a wall with nothing laid out has no line (no height yet, or too tall with no joint)", () => {
  const snap = { workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [],
    materials: [axon("clad", 0, { jointRows: undefined })], measurements: [rect("a", 4000, null, "No height"), rect("b", 4000, 3600, "Too tall")],
    contributions: [con("1", "a", "clad"), con("2", "b", "clad")] };
  const c = computeWorkspace(snap);
  assert.equal(wallCladdingTotals(c.materialResults.clad, "a", "No height"), null);
  assert.equal(wallCladdingTotals(c.materialResults.clad, "b", "Too tall"), null);
  assert.equal(wallCladdingTotals(null, "a"), null);
});

t("orderedId: valid UUIDs, every one sorts after the one before (same millisecond too), so Run 1 stays Run 1 after a save", () => {
  const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;   // the server's own check (takeoffAccess.mjs)
  const made = Array.from({ length: 5000 }, () => orderedId());   // thousands inside a few milliseconds
  for (const id of made) assert.match(id, UUID_RX);
  assert.equal(new Set(made).size, made.length, "no repeats");
  for (let i = 1; i < made.length; i++) assert.ok(made[i - 1] < made[i], `${made[i - 1]} before ${made[i]}`);
  // version 7 layout: the first 48 bits are the time it was made
  const ms = parseInt(made[0].replace(/-/g, "").slice(0, 12), 16);
  assert.ok(Math.abs(ms - Date.now()) < 60_000, "starts with the time it was made");
  assert.equal(made[0][14], "7");
  // two runs traced one after the other and saved together come back Run 1, Run 2 when sorted the server's way
  const run1 = orderedId(), w1 = [orderedId(), orderedId()], run2 = orderedId(), w2 = [orderedId()];
  const saved = [
    wall(w2[0], { name: "Wall 3", runId: run2, seq: 1 }), wall(w1[1], { name: "Wall 2", runId: run1, seq: 2 }), wall(w1[0], { name: "Wall 1", runId: run1, seq: 1 }),
  ].sort((a, b) => (a.id < b.id ? -1 : 1));   // one save time: the id decides (takeoffService.mjs loadSnapshot)
  assert.deepEqual(ids(reviewWalls(saved, saved.map((m) => con(`c-${m.id}`, m.id, "clad")), "clad")), [...w1, ...w2]);
});

console.log(`takeoff-tc-review: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
