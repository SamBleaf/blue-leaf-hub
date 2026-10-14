// TC-R04 13 continuous flashing runs — ADVERSARIAL verification. run: node scripts/tests/takeoff-tc-flashpath-adv.test.mjs
// Tries to break the REAL shared/takeoff/engine/flashingPath.js and the REAL double-tap recogniser in
// src/components/takeoff/gestures.js: fixtures re-derived through the split ACTIONS (not hand-computed stations),
// stretched/rotated calibrations, capacity ⇔ maximum invariants over a rule grid, every "never" rule of 13, boundary and
// malformed inputs, and the regressions found in review (each test below names the defect it pins).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCalibration, verifyCalibration, segmentLengthMm } from "../../shared/takeoff/calibration.js";
import { measuredRunResult } from "../../shared/takeoff/flashing.js";
import {
  pathStations, pointAtStation, slicePath, computeFlashingPath, splitAtLimit, addSplit, moveSplit, moveSplitToCorner,
  validateSplits, legalCapacityMm, appendVertex, finishPath, resolvePathTap, pathFromMeasurement, PATH_TOL_MM,
} from "../../shared/takeoff/engine/flashingPath.js";
import { allocateLinear } from "../../shared/takeoff/engine/allocator.js";
import { createGestureTracker } from "../../src/components/takeoff/gestures.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } }
const near = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, msg || `${a} ≉ ${b}`);

// 1 PDF unit = 20 mm, verified
const cal = verifyCalibration(buildCalibration({ horizontal: { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, knownMm: 2000 }, vertical: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 100 }, knownMm: 2000 } }).calibration,
  { p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 }, expectedMm: 1000 });
// stretched + rotated: Horizontal (PDF y at 90°) 20 mm/unit, Vertical (PDF x) 10 mm/unit
const stretched = verifyCalibration(buildCalibration({ basisRotation: 90, mode: "separate",
  horizontal: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 100 }, knownMm: 2000 }, vertical: { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, knownMm: 1000 } }).calibration,
{ p1: { x: 0, y: 0 }, p2: { x: 0, y: 50 }, expectedMm: 1000 });
const P = (...xy) => xy.map(([x, y]) => ({ x, y }));
const run10k = P([0, 0], [200, 0], [200, 200], [300, 200]); // legs 4000 / 4000 / 2000
/** A 3,000 mm straight run (orders 3,200). */
const zigzagless3200 = () => P([0, 0], [150, 0]);
const path = (points, extra = {}) => computeFlashingPath({ runId: "r1", materialId: "m1", identity: { profile: "P1" }, points, calibration: cal, ...extra });
const codes = (res) => res.problems.map((p) => p.code);
const blocking = (res) => res.problems.filter((p) => p.blocking).map((p) => p.code);
/** Calibrated arc length from the path start to station-point `pt` on segment `k` (independent of the module). */
const arcTo = (pts, c, pt) => {
  let s = 0;
  for (let i = 0; i < pt.segmentIndex; i++) s += segmentLengthMm(c, pts[i], pts[i + 1]);
  return s + segmentLengthMm(c, pts[pt.segmentIndex], pt);
};

// ── fixtures re-derived through the split ACTIONS on a stretched, rotated, cornered path ──────────────────────────
const fx = Object.fromEntries(JSON.parse(readFileSync(new URL("../../docs/takeoff/TC-R04/fixtures.json", import.meta.url), "utf8")).cases
  .filter((c) => c.kind === "flashingPieces").map((c) => [c.id, c]));
/** A path of `mm` under `stretched`: an L whose first leg is Vertical (10 mm/u) and second Horizontal (20 mm/u). */
const stretchedL = (mm) => P([0, 0], [mm / 2 / 10, 0], [mm / 2 / 10, mm / 2 / 20]);
const rulesOf = (f) => ({ allowanceMm: f.input.allowance, incrementMm: f.input.increment });
const spath = (mm, extra = {}) => computeFlashingPath({ runId: "s", materialId: "m", points: stretchedL(mm), calibration: stretched, ...extra });
t("fixtures: FLASH-corners/exact/over through computeFlashingPath on a stretched rotated L", () => {
  for (const id of ["FLASH-corners-one-piece", "FLASH-exact-max", "FLASH-over-max"]) {
    const f = fx[id];
    const res = spath(f.input.tightPieces[0], { rules: rulesOf(f) });
    near(res.tightTotalMm, f.input.tightPieces[0], 1e-6, id);
    assert.equal(res.pieces.length, 1, id);
    assert.equal(res.demands.reduce((a, d) => a + d.lengthMm * d.quantity, 0), f.expected, id);
    assert.equal(res.pieces[0].overMax, id === "FLASH-over-max", id);
    assert.equal(res.status.procurement === "ready", id !== "FLASH-over-max", id);
  }
});
t("fixture FLASH-split-at-limit: the split comes from splitAtLimit (one tap), not a precomputed station", () => {
  const f = fx["FLASH-split-at-limit"];
  const total = f.input.tightPieces.reduce((a, b) => a + b, 0);
  const draft = spath(total, { rules: rulesOf(f) });
  assert.equal(draft.pieces.length, 1, "stays one flagged piece until the builder taps");
  const splitsMm = splitAtLimit(draft);
  assert.equal(splitsMm.length, 1, "one tap = one split");
  const res = spath(total, { rules: rulesOf(f), splitsMm });
  res.pieces.forEach((pc, i) => near(pc.tightMm, f.input.tightPieces[i]));
  assert.equal(res.demands.reduce((a, d) => a + d.lengthMm, 0), f.expected);
  assert.equal(res.status.procurement, "ready");
});
t("fixture FLASH-split-earlier: a builder-chosen split via addSplit / moveSplit", () => {
  const f = fx["FLASH-split-earlier"];
  const draft = spath(10000, { rules: rulesOf(f) });
  const added = addSplit(draft, 5000);
  assert.deepEqual(added.problems, []);
  const res = spath(10000, { rules: rulesOf(f), splitsMm: added.splitsMm });
  assert.equal(res.demands.reduce((a, d) => a + d.lengthMm, 0), f.expected);
  const viaMove = spath(10000, { rules: rulesOf(f), splitsMm: moveSplit(spath(10000, { rules: rulesOf(f), splitsMm: splitAtLimit(draft) }), 0, 5000).splitsMm });
  assert.deepEqual(viaMove.pieces.map((pc) => pc.orderMm), [5200, 5200]);
});

// ── geometry: arc length, never chord / screen px ───────────────────────────
t("legal marker under a stretched rotated calibration lies at calibrated ARC length 8,800 (diagonal + corners)", () => {
  // diagonal first leg mixes both axes; marker must be by calibrated arc length, not PDF distance
  const pts = P([0, 0], [300, 200], [300, 400], [500, 400]);
  const res = computeFlashingPath({ runId: "d", materialId: "m", points: pts, calibration: stretched });
  assert.ok(res.tightTotalMm > 8800, `need an overlength path, got ${res.tightTotalMm}`);
  const m = res.overflow.point;
  near(arcTo(pts, stretched, m), 8800, 1e-6);
  const p = pointAtStation(pts, stretched, 5000);
  near(arcTo(pts, stretched, p), 5000, 1e-6);
  // the red overflow starts exactly at capacity and ends at the path end
  const red = res.layout.overflowRuns[0].points;
  near(arcTo(pts, stretched, { ...red[0], segmentIndex: m.segmentIndex }), 8800, 1e-6);
  assert.deepEqual(red[red.length - 1], pts[pts.length - 1]);
});
t("tight length is Σ calibrated legs: a closed square orders its perimeter, never the 0 mm chord", () => {
  const res = path(P([0, 0], [50, 0], [50, 50], [0, 50], [0, 0]));
  near(res.tightTotalMm, 4000); assert.equal(res.pieces[0].orderMm, 4200);
  assert.ok(!codes(res).includes("path_retraced"), "a closed loop is not a retrace");
});
t("N corners never add allowances or pieces: 40 legs of 75 mm → ONE 3,200", () => {
  const pts = [{ x: 0, y: 0 }];
  for (let i = 1; i <= 40; i++) pts.push({ x: Math.ceil(i / 2) * 3.75, y: Math.floor(i / 2) * 3.75 });
  const res = path(pts);
  near(res.tightTotalMm, 3000, 1e-6); assert.equal(res.pieces.length, 1); assert.equal(res.demands.length, 1);
  assert.equal(res.demands[0].lengthMm, 3200);
});

// ── capacity ⇔ maximum invariants over a rule grid (formula is never re-implemented here) ───────────────────────
t("for every rule set: tight ≤ legalCapacityMm ⇔ ordered ≤ M; capacity + 1 µm-noise stays legal, +0.01 mm overflows", () => {
  const grid = [];
  for (const allowanceMm of [0, 150, 200, 250]) for (const incrementMm of [50, 100, 300]) for (const orderCeilingMm of [3000, 6000, 8975, 9000, 9050]) grid.push({ allowanceMm, incrementMm, orderCeilingMm });
  for (const rules of grid) {
    const cap = legalCapacityMm(rules);
    if (cap <= 0) continue;
    const at = path(P([0, 0], [cap / 20, 0]), { rules });
    assert.equal(at.pieces[0].overMax, false, `${JSON.stringify(rules)} at capacity ${cap}`);
    assert.ok(at.pieces[0].orderMm <= rules.orderCeilingMm);
    const over = path(P([0, 0], [(cap + 0.01) / 20, 0]), { rules });
    assert.equal(over.pieces[0].overMax, true, `${JSON.stringify(rules)} at ${cap + 0.01}`);
    near(over.overflow.fromMm, cap, 1e-9); assert.equal(over.overflow.legalSplitMm, over.overflow.fromMm);
  }
});
t("every piece carries exactly ONE allowance: A ≤ order − tight < A + R, Σ tight = whole path (3+ pieces)", () => {
  const res = path(P([0, 0], [500, 0], [500, 500], [800, 500]), { splitsMm: [3333.3, 7000.01, 15999.99, 24000] });
  assert.equal(res.pieces.length, 5);
  for (const pc of res.pieces) { assert.ok(pc.orderMm - pc.tightMm >= 200 - 1e-9 && pc.orderMm - pc.tightMm < 300, `${pc.tightMm} → ${pc.orderMm}`); assert.equal(pc.orderMm % 100, 0); }
  near(res.pieces.reduce((a, pc) => a + pc.tightMm, 0), res.tightTotalMm, 1e-6);
  assert.equal(res.demands.length, 5, "one demand per explicit piece, never per plan segment (3 segments)");
});

// ── "never" rules ─────────────────────────────────────────────────────────────
t("NEVER split automatically: a 50,000 mm path stays ONE flagged piece with one legal marker", () => {
  const res = path(P([0, 0], [1250, 0], [1250, 1250]));
  assert.equal(res.pieces.length, 1); assert.deepEqual(res.splitsMm, []); assert.equal(res.layout.legalMarkers.length, 1);
  assert.equal(res.status.procurement, "draft");
});
t("NEVER prefer a corner: the legal split stays mid-segment even 1 mm past a corner", () => {
  // corner at 8,799 mm (439.95 u), legal capacity 8,800 → marker 1 mm into the next leg, not snapped back
  const res = path(P([0, 0], [439.95, 0], [439.95, 100]));
  assert.equal(res.overflow.legalSplitMm, 8800); assert.equal(res.overflow.point.segmentIndex, 1); near(res.overflow.point.y, 0.05);
  assert.deepEqual(splitAtLimit(res), [8800]);
});
t("NEVER invent a maximum: orderCeilingMm null → no capacity, no red, no legal marker, never 'ready'; drawing continues", () => {
  const res = path(P([0, 0], [1250, 0]), { rules: { orderCeilingMm: null } });
  assert.equal(legalCapacityMm({ orderCeilingMm: null }), null);
  assert.equal(res.overflow, null); assert.deepEqual(res.layout.overflowRuns, []); assert.deepEqual(res.layout.legalMarkers, []);
  assert.equal(res.pieces[0].orderMm, 25200); assert.equal(res.status.procurement, "missing-product");
  assert.deepEqual(splitAtLimit(res), []);
  assert.deepEqual(addSplit(res, 20000).problems, [], "the builder may still split by choice");
  assert.equal(path(P([0, 0], [100, 0]), { rules: { orderCeilingMm: null } }).status.procurement, "missing-product", "even a short run");
});
t("NEVER let the handling threshold split or block: 8,800 tight (order 9,000) is amber but ready", () => {
  const res = path(P([0, 0], [440, 0]));
  assert.equal(res.pieces[0].handlingFlag, true); assert.equal(res.status.procurement, "ready"); assert.deepEqual(res.splitsMm, []);
  assert.equal(res.problems.find((p) => p.code === "handling_length").blocking, false);
});
t("NEVER mutate caller input (points, splits, anchors, rules)", () => {
  const pts = P([0, 0], [200, 0], [200, 200], [300, 200]);
  const splitsMm = [9000, 3000];
  const rules = { orderCeilingMm: 9000 };
  const anchors = [{ stationMm: 9000, x: 250, y: 200 }];
  const snap = JSON.stringify({ pts, splitsMm, rules, anchors });
  const res = path(pts, { splitsMm, rules, splitAnchors: anchors });
  addSplit(res, 5000); moveSplit(res, 1, 2000); splitAtLimit(res); validateSplits({ points: pts, calibration: cal, splitsMm, splitAnchors: anchors });
  appendVertex(pts, { x: 5, y: 5 }, cal); finishPath(pts, cal);
  assert.equal(JSON.stringify({ pts, splitsMm, rules, anchors }), snap);
});
t("NEVER coerce a split: strings / null are invalid values, flagged and skipped", () => {
  const res = path(run10k, { splitsMm: ["5000", null, 7000] });
  assert.deepEqual(res.splits.map((s) => s.code), ["split_invalid_value", "split_invalid_value", null]);
  assert.deepEqual(res.pieces.map((pc) => Math.round(pc.tightMm)), [7000, 3000]);
});
t("NEVER export an invalid state as ready: over-max, bad split, unverified scale, in-progress, outside region", () => {
  const unverified = buildCalibration({ horizontal: { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, knownMm: 2000 }, vertical: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 100 }, knownMm: 2000 } }).calibration;
  const cases = [path(run10k), path(run10k, { splitsMm: [9500] }), computeFlashingPath({ runId: "r", materialId: "m", points: run10k, calibration: unverified, splitsMm: [5000] }),
    path(P([0, 0], [10, 0]), { complete: false }), computeFlashingPath({ runId: "r", materialId: "m", points: run10k, calibration: { ...cal, region: { x0: 0, y0: 0, x1: 10, y1: 10 } }, splitsMm: [5000] })];
  for (const res of cases) assert.notEqual(res.status.procurement, "ready", codes(res).join(","));
});

// ── regressions found by this review ─────────────────────────────────────────
t("DEFECT 1: the module's own layout.splits (incl. a split never placed on the path) can be fed back as splitAnchors", () => {
  const shortened = path(P([0, 0], [200, 0], [200, 200]), { splitsMm: [8800] }); // split beyond the 8,000 mm end, no anchor
  assert.deepEqual(shortened.layout.splits, [{ stationMm: 8800, x: null, y: null }]);
  const again = path(P([0, 0], [200, 0], [200, 200]), { splitsMm: [8800], splitAnchors: shortened.layout.splits });
  assert.equal(again.splits[0].code, "split_out_of_range");
  assert.throws(() => path(run10k, { splitsMm: [8800], splitAnchors: [{ stationMm: 8800, x: 240, y: null }] }), /saved split location is invalid/, "half a location is corrupt");
});
t("DEFECT 2: addSplit refuses a split on top of an existing one (no duplicate, no 0 mm piece)", () => {
  const res = path(run10k, { splitsMm: [5000] });
  const dup = addSplit(res, 5000);
  assert.deepEqual(dup.splitsMm, [5000]); assert.deepEqual(dup.problems.map((p) => p.code), ["split_out_of_order"]);
  assert.deepEqual(addSplit(res, 5000 + PATH_TOL_MM / 2).splitsMm, [5000], "within 0.001 mm is the same station");
  assert.deepEqual(addSplit(res, 5000.01).splitsMm, [5000, 5000.01], "a real 0.01 mm offset is the builder's choice");
});
t("DEFECT 3: an overflow caused by an additional END detail still has a legal split (at the red start), not 'no legal split'", () => {
  const endDetails = { end: { mm: 100, kind: "return", includedInAllowance: false } };
  const res = path(P([0, 0], [437.5, 0]), { endDetails }); // 8,750 + 100 + 200 → 9,100
  assert.equal(res.pieces[0].overMax, true); assert.equal(res.overflow.fromMm, 8700);
  assert.equal(res.overflow.legalSplitMm, 8700); assert.ok(!codes(res).includes("no_legal_split"));
  const split = path(P([0, 0], [437.5, 0]), { endDetails, splitsMm: splitAtLimit(res) });
  assert.deepEqual(split.pieces.map((pc) => pc.orderMm), [8900, 400]); assert.deepEqual(split.pieces.map((pc) => pc.extraMm), [0, 100]);
  assert.equal(split.status.procurement, "ready");
  // a lap carried before the joint that is larger than the end detail still limits the left piece
  const lapped = path(P([0, 0], [437.5, 0]), { endDetails, jointDetail: { lapMm: 150, carriedBy: "before", includedInAllowance: false } });
  assert.equal(lapped.overflow.legalSplitMm, 8650);
  assert.equal(path(P([0, 0], [437.5, 0]), { endDetails, jointDetail: { lapMm: 150, carriedBy: "before", includedInAllowance: false }, splitsMm: splitAtLimit(lapped) }).status.procurement, "ready");
});
t("DEFECT 4: demands need their parent run id and job material — never 'flashing-piece:0' ids shared across runs", () => {
  const noRun = computeFlashingPath({ materialId: "m", points: run10k, calibration: cal, splitsMm: [5000] });
  assert.deepEqual(noRun.demands, []); assert.ok(blocking(noRun).includes("run_id_missing")); assert.equal(noRun.status.procurement, "draft");
  assert.equal(noRun.pieces.length, 2, "lengths still shown live");
  const noMat = computeFlashingPath({ runId: "r", points: run10k, calibration: cal, splitsMm: [5000] });
  assert.deepEqual(noMat.demands, []); assert.ok(blocking(noMat).includes("material_missing")); assert.equal(noMat.status.procurement, "missing-product");
  const a = path(run10k, { runId: "a", splitsMm: [5000] }).demands.map((d) => d.id);
  const b = path(run10k, { runId: "b", splitsMm: [5000] }).demands.map((d) => d.id);
  assert.ok(a.every((id) => !b.includes(id)), "two runs never share a demand id");
  assert.deepEqual(a, ["m1:a:flashing-piece:0", "m1:a:flashing-piece:1"]);
  const other = computeFlashingPath({ runId: "a", materialId: "m2", points: run10k, calibration: cal, splitsMm: [5000] }).demands.map((d) => d.id);
  assert.ok(a.every((id) => !other.includes(id)), "one run feeding two flashing materials never repeats an id");
  assert.deepEqual(path(run10k, { splitsMm: [5000] }).demands.map((d) => d.sourceRefs[0].measurementId), ["r1", "r1"]);
});
t("DEFECT 5: a split within 0.001 mm of a path end is the end — flagged, never a phantom 300 mm piece", () => {
  for (const s of [10000 - 0.0005, 0.0005]) {
    const res = path(run10k, { splitsMm: [s] });
    assert.equal(res.splits[0].code, "split_out_of_range", String(s)); assert.equal(res.pieces.length, 1);
  }
  const twin = path(run10k, { splitsMm: [5000, 5000.0005] });
  assert.equal(twin.splits[1].code, "split_out_of_order"); assert.equal(twin.pieces.length, 2);
  assert.deepEqual(moveSplit(path(run10k, { splitsMm: [5000] }), 0, 9999.9995).problems.map((p) => p.code), ["split_out_of_order"]);
});
t("DEFECT 6: finishing never takes the double-tap's own position (one endpoint, coalesced with the first tap)", () => {
  const pts = P([0, 0], [50, 0], [50, 50]); // the first tap already placed (50, 50)
  const second = { x: 51.2, y: 50.6 };      // second tap lifts ~10 px away
  const res = finishPath(pts, cal, second);
  assert.deepEqual(res.points, pts); assert.equal(res.finished, true);
  near(path(res.points).tightTotalMm, 2000);
});
t("DEFECT 9: the reader takes the server's stored form (inputs.splitsMm + inputs.splitAnchors) — saved splits never vanish", () => {
  const saved = path(run10k, { splitsMm: [8800] });
  const m = { id: "r1", kind: "polyline", points: run10k, inputs: { splitsMm: [8800], splitAnchors: saved.layout.splits } };
  const back = pathFromMeasurement(JSON.parse(JSON.stringify(m)));
  assert.deepEqual(back.splitsMm, [8800]); assert.equal(back.splitAnchors.length, 1);
  assert.deepEqual(computeFlashingPath({ ...back, materialId: "m", calibration: cal }).pieces.map((pc) => pc.orderMm), [9000, 1400]);
  assert.deepEqual(pathFromMeasurement({ id: "x", kind: "polyline", points: run10k, inputs: { splitsMm: [5000] } }).splitsMm, [5000], "anchors optional");
  assert.throws(() => pathFromMeasurement({ ...m, splits: saved.layout.splits }), /stores its splits twice/);
  assert.throws(() => pathFromMeasurement({ ...m, inputs: { splitsMm: 8800 } }), /must be a list/);
  assert.deepEqual(pathFromMeasurement({ id: "y", kind: "polyline", points: run10k, inputs: { role: "primary" } }).splitsMm, [], "no splits stored");
});
t("DEFECT 10: a split flagged 'moved' after a geometry edit can be re-approved by placing it again — even at the same station", () => {
  const anchors = path(run10k, { splitsMm: [8800] }).layout.splits;
  const edited = P([0, 0], [200, 0], [200, 210], [300, 210]); // the split's segment moved: approved location off the path
  const flagged = path(edited, { splitsMm: [8800], splitAnchors: anchors });
  assert.equal(flagged.splits[0].code, "split_moved");
  const mv = moveSplit(flagged, 0, 8800);
  assert.deepEqual(mv.problems, []); assert.deepEqual(mv.splitsMm, [8800]); assert.deepEqual(mv.splitAnchors, [], "the old approval is dropped");
  const resolved = path(edited, { splitsMm: mv.splitsMm, splitAnchors: mv.splitAnchors });
  assert.equal(resolved.splits[0].ok, true); assert.equal(resolved.status.procurement, "ready");
  near(resolved.layout.splits[0].y, 210, 1e-9, "new approved location is on the edited path");
  // a blocked move keeps every approval
  assert.deepEqual(moveSplit(flagged, 0, 9500).splitAnchors, anchors.map((a) => ({ ...a })));
  // addSplit carries the current approvals forward
  const two = path(run10k, { splitsMm: [8800] });
  assert.deepEqual(addSplit(two, 3000).splitAnchors, two.layout.splits);
});

t("DEFECT 11: demands go through the REAL shared allocator — no duplicate ids across materials, one group per product, exact lengths, overlength refused", () => {
  const a = path(run10k, { splitsMm: [8800], identity: { profile: "P1" } });
  const b = path(run10k, { materialId: "m2", splitsMm: [8800], identity: { profile: "P2" } }); // the same run feeds a second flashing
  const res = allocateLinear([...a.demands, ...b.demands, ...path(zigzagless3200(), { runId: "r2" }).demands]);
  assert.deepEqual(res.rejected, []); assert.deepEqual(res.problems.map((p) => p.code), [], "no identity-split noise for different piece lengths");
  assert.equal(res.groups.length, 2, "one group per product identity");
  const bought = res.groups.flatMap((g) => g.purchase.flatMap((p) => Array(p.quantity).fill(p.stockLengthMm))).sort((x, y) => x - y);
  assert.deepEqual(bought, [1400, 1400, 3200, 9000, 9000], "each piece bought at exactly its ordered length — never re-rounded or pooled");
  const over = allocateLinear(path(run10k).demands);
  assert.equal(over.groups[0].procurement, "unavailable-stock", "a 10,200 piece is refused by the allocator too (no clamp, no splice)");
  const fin = path(P([0, 0], [250.01, 0]), { lengthKind: "finished" });
  assert.deepEqual(fin.demands[0].stockPolicy, { kind: "fixed", lengthMm: fin.pieces[0].orderMm, sharePieces: false });
  near(allocateLinear(fin.demands).groups[0].purchase[0].stockLengthMm, 5000.2, 1e-9, "finished length never rounded");
});

// ── joints, ends, zones ──────────────────────────────────────────────────────
t("lap carried AFTER the joint: the first piece keeps full 8,800 capacity, the next piece loses the lap", () => {
  const pts = P([0, 0], [1000, 0]); // 20,000
  const jointDetail = { lapMm: 100, carriedBy: "after", includedInAllowance: false };
  const s1 = splitAtLimit(path(pts, { jointDetail }));
  assert.deepEqual(s1, [8800]);
  const after1 = path(pts, { jointDetail, splitsMm: s1 });
  assert.equal(after1.overflow.fromMm, 17500); assert.equal(after1.overflow.legalSplitMm, 17500);
  const after2 = path(pts, { jointDetail, splitsMm: splitAtLimit(after1) });
  assert.deepEqual(after2.pieces.map((pc) => pc.orderMm), [9000, 9000, 2800]); assert.equal(after2.status.procurement, "ready");
});
t("an included lap within the 200 mm never changes the order; additional laps on 3 pieces each count once", () => {
  const pts = P([0, 0], [1000, 0]);
  const inc = path(pts, { splitsMm: [6000, 13000], jointDetail: { lapMm: 200, carriedBy: "before", includedInAllowance: true } });
  assert.deepEqual(inc.pieces.map((pc) => pc.orderMm), [6200, 7200, 7200]); assert.ok(!codes(inc).includes("allowance_overcommitted"));
  const add = path(pts, { splitsMm: [6000, 13000], jointDetail: { lapMm: 50, carriedBy: "before", includedInAllowance: false } });
  assert.deepEqual(add.pieces.map((pc) => pc.extraMm), [50, 50, 0]); assert.deepEqual(add.pieces.map((pc) => pc.orderMm), [6300, 7300, 7200]);
});
t("no-joint zones: overlapping zones push the marker before both; zone start itself is a legal joint", () => {
  const res = path(run10k, { noJointZones: [{ fromMm: 8600, toMm: 9000 }, { fromMm: 8200, toMm: 8700 }] });
  assert.equal(res.overflow.legalSplitMm, 8200);
  assert.equal(path(run10k, { noJointZones: [{ fromMm: 8800, toMm: 9500 }] }).overflow.legalSplitMm, 8800);
  assert.throws(() => path(run10k, { noJointZones: [{ fromMm: 9000, toMm: 9000 }] }), /later end/);
  assert.equal(addSplit(path(run10k, { noJointZones: [{ fromMm: 4000, toMm: 6000 }] }), 5000).problems[0].code, "split_in_no_joint_zone");
});
t("malformed joint/end/rules input throws (never guessed); capacity rejects negative extras and cut lengths", () => {
  assert.throws(() => path(run10k, { jointDetail: { lapMm: -1, carriedBy: "before", includedInAllowance: false } }), /0 or more/);
  assert.throws(() => path(run10k, { endDetails: { start: { mm: 10 } } }), /included in the measured allowance or additional/);
  assert.throws(() => path(run10k, { rules: { incrementMm: 0 } }), /greater than 0/);
  assert.throws(() => path(run10k, { rules: { orderCeilingMm: undefined } }), /Order ceiling/, "undefined is not 'unknown'");
  assert.throws(() => legalCapacityMm({}, { extraMm: -5 }), /0 or more/);
  assert.throws(() => legalCapacityMm({}, { lengthKind: "cut" }), /tight \(measured\), finished or ordered stock/);
  assert.throws(() => path(run10k, { splitsMm: 5000 }), /must be a list/);
});

// ── stations, anchors, edits ─────────────────────────────────────────────────
t("anchor on a retraced path resolves to the pass nearest its saved station", () => {
  const pts = P([0, 0], [300, 0], [100, 0]); // 6,000 out + 4,000 back over the same line
  const res = path(pts, { splitsMm: [8000], splitAnchors: [{ stationMm: 8000, x: 200, y: 0 }] });
  near(res.splitsMm[0], 8000, 1e-9); assert.equal(res.splits[0].rebuilt, false);
  const first = path(pts, { splitsMm: [4000], splitAnchors: [{ stationMm: 4000, x: 200, y: 0 }] });
  near(first.splitsMm[0], 4000, 1e-9);
  assert.ok(codes(res).includes("path_retraced"));
});
t("anchors survive a stretched-calibration change: station rebuilt by calibrated arc length", () => {
  const pts = P([0, 0], [400, 0], [400, 200]);
  const base = computeFlashingPath({ runId: "r", materialId: "m", points: pts, calibration: cal, splitsMm: [6000] });
  const res = computeFlashingPath({ runId: "r", materialId: "m", points: pts, calibration: stretched, splitsMm: [6000], splitAnchors: base.layout.splits });
  // (300,0) under `stretched`: PDF x is Vertical at 10 mm/u → 3,000 mm along the first leg
  near(res.splitsMm[0], 3000, 1e-6); assert.equal(res.splits[0].rebuilt, true); assert.equal(res.splits[0].ok, true);
});
t("a split rebuilt behind an earlier split is flagged out of order, never re-sorted", () => {
  const res = path(run10k, { splitsMm: [6000, 7000], splitAnchors: [{ stationMm: 7000, x: 100, y: 0 }] });
  assert.equal(res.splits[1].code, "split_out_of_order"); near(res.splits[1].stationMm, 2000);
  assert.deepEqual(res.pieces.map((pc) => Math.round(pc.tightMm)), [6000, 4000]);
});
t("pointAtStation/slicePath boundaries: µm float noise clamps, a real 0.001 mm overshoot throws; reversed slice throws", () => {
  assert.equal(pointAtStation(run10k, cal, 10000 + 5e-7).t, 1);
  assert.throws(() => pointAtStation(run10k, cal, 10000.001), /not on the path/);
  assert.throws(() => pointAtStation(run10k, cal, Number.NaN), /not on the path/);
  assert.throws(() => slicePath(run10k, cal, 5000, 5000), /start before its end/);
  assert.throws(() => pathStations([{ x: 0, y: Number.POSITIVE_INFINITY }], cal), /outside the page/);
});
t("moveSplitToCorner onto a corner beyond capacity is blocked; onto the path ends is blocked", () => {
  const pts = P([0, 0], [500, 0], [500, 500]); // corner at 10,000
  const res = path(pts, { splitsMm: [8800] });
  assert.deepEqual(moveSplitToCorner(res, 0, 1).problems.map((p) => p.code), ["split_beyond_capacity"]);
  assert.deepEqual(moveSplitToCorner(res, 0, 0).problems.map((p) => p.code), ["split_out_of_order"]);
  assert.deepEqual(moveSplitToCorner(res, 0, 2).problems.map((p) => p.code), ["split_out_of_order"]);
});
t("dependency key changes with allowance, joint detail, zones, length kind and calibration status", () => {
  const k = (extra) => path(run10k, { splitsMm: [5000], ...extra }).dependencyKey;
  const base = k({});
  for (const extra of [{ rules: { allowanceMm: 150 } }, { jointDetail: { lapMm: 10, carriedBy: "before", includedInAllowance: true } },
    { noJointZones: [{ fromMm: 1, toMm: 2 }] }, { lengthKind: "finished" }]) assert.notEqual(k(extra), base, JSON.stringify(extra));
  assert.notEqual(computeFlashingPath({ runId: "r1", materialId: "m1", identity: { profile: "P1" }, points: run10k, calibration: { ...cal, status: "needs_review" }, splitsMm: [5000] }).dependencyKey, base);
});
t("legacy 2-point runs equal the existing straight-run rule for awkward lengths (incl. 4,312 → 4,600)", () => {
  for (const mm of [1, 99.99, 100, 4312, 5800.0004, 8800, 8800.01, 12345.678]) {
    const p = pathFromMeasurement({ id: "old", kind: "run", points: P([0, 0], [mm / 20, 0]) });
    const res = computeFlashingPath({ ...p, materialId: "m", calibration: cal });
    assert.equal(res.pieces[0].orderMm, measuredRunResult(segmentLengthMm(cal, p.points[0], p.points[1]), {}).finishedLengthMm, String(mm));
  }
});

// ── hit testing ──────────────────────────────────────────────────────────────
t("hit testing: a split handle beats a CLOSER vertex and the red line; 44 px minimum even if asked smaller", () => {
  const targets = { splitHandles: [{ x: 100, y: 100, index: 2 }], vertices: [{ x: 104, y: 100 }], overflowRuns: [{ pieceIndex: 0, points: [{ x: 0, y: 103 }, { x: 300, y: 103 }] }] };
  assert.deepEqual(resolvePathTap({ x: 103, y: 102 }, targets), { action: "split-handle", index: 2 });
  assert.deepEqual(resolvePathTap({ x: 100, y: 122 }, { splitHandles: [{ x: 100, y: 100 }] }, { handleTargetPx: 4 }), { action: "split-handle", index: 0 });
  assert.deepEqual(resolvePathTap({ x: 100, y: 122.5 }, { splitHandles: [{ x: 100, y: 100 }] }, { handleTargetPx: 4 }), { action: "add-point" });
  assert.deepEqual(resolvePathTap({ x: 150, y: 120 }, targets), { action: "split-at-limit", pieceIndex: 0 });
  const r = resolvePathTap({ x: 150, y: 103 }, targets);
  assert.equal(r.action, "split-at-limit"); assert.ok(!("x" in r) && !("stationMm" in r), "the red-line action carries no tap position");
});

// ── gestures ─────────────────────────────────────────────────────────────────
let now = 5000;
globalThis.performance = { now: () => now };
function fakeEl() {
  const l = {};
  return { l, addEventListener: (k, f) => { l[k] = f; }, removeEventListener: (k) => { delete l[k]; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }), setPointerCapture() {} };
}
const ev = (id, x, y, extra = {}) => ({ pointerId: id, clientX: x, clientY: y, pointerType: "touch", button: 0, preventDefault() {}, target: { closest: () => null }, ...extra });
function gsetup(handlersExtra = {}, options) {
  const el = fakeEl();
  const log = { taps: [], doubles: [] };
  const tr = createGestureTracker({ mode: () => "tap", onTap: (p) => log.taps.push(p), onDoubleTap: (p, e, info) => log.doubles.push({ p, info }), ...handlersExtra }, options);
  let detach = tr.attach(el);
  const f = (k, e) => el.l[k]?.(e);
  let id = 10;
  const tap = (x, y, holdMs = 50, extra = {}) => { const pid = id++; f("pointerdown", ev(pid, x, y, extra)); now += holdMs; f("pointerup", ev(pid, x, y, extra)); f("lostpointercapture", ev(pid, x, y, extra)); };
  return { tr, el, log, f, tap, reattach: () => { detach(); detach = tr.attach(el); } };
}
t("gestures boundaries: exactly 300 ms / 24 px pair; 300.5 ms or 24.1 px do not (fresh pointer ids per touch)", () => {
  let g = gsetup(); g.tap(100, 100); now += 300; g.tap(124, 100);
  assert.equal(g.log.doubles.length, 1); assert.equal(g.log.taps.length, 1);
  g = gsetup(); g.tap(100, 100); now += 300.5; g.tap(100, 100);
  assert.equal(g.log.doubles.length, 0); assert.equal(g.log.taps.length, 2);
  g = gsetup(); g.tap(100, 100); now += 100; g.tap(100, 124.1);
  assert.equal(g.log.doubles.length, 0); assert.equal(g.log.taps.length, 2);
});
t("DEFECT 7: detaching (page navigation / unmount) drops a pending pair — no phantom double-tap after re-attach", () => {
  const g = gsetup();
  g.tap(100, 100); g.reattach(); now += 50; g.tap(100, 100);
  assert.equal(g.log.doubles.length, 0); assert.equal(g.log.taps.length, 2);
});
t("DEFECT 8: onDoubleTap read per tap (getter) — while off every tap is onTap and no pair carries over", () => {
  let on = true;
  const log = { taps: 0, doubles: 0 };
  const el = fakeEl();
  const tr = createGestureTracker({ mode: () => "tap", onTap: () => log.taps++, get onDoubleTap() { return on ? () => log.doubles++ : undefined; } });
  tr.attach(el);
  let pid = 1;
  const tap = (x) => { const id = pid++; el.l.pointerdown(ev(id, x, 100)); now += 40; el.l.pointerup(ev(id, x, 100)); el.l.lostpointercapture(ev(id, x, 100)); };
  tap(100); on = false; now += 60; tap(100); now += 60; tap(100);
  assert.deepEqual(log, { taps: 3, doubles: 0 }, "off: quick taps are all taps");
  on = true; now += 60; tap(100);
  assert.deepEqual(log, { taps: 4, doubles: 0 }, "turning it back on never pairs with a tap from before");
  now += 60; tap(100);
  assert.deepEqual(log, { taps: 4, doubles: 1 });
});
t("gestures: two-finger tap, a lost capture mid-press, and pan mode never tap or double-tap", () => {
  let g = gsetup(); g.tap(100, 100); now += 30;
  g.f("pointerdown", ev(1, 100, 100)); g.f("pointerdown", ev(2, 140, 100)); now += 30; g.f("pointerup", ev(1, 100, 100)); g.f("pointerup", ev(2, 140, 100));
  now += 30; g.tap(100, 100);
  assert.equal(g.log.doubles.length, 0); assert.equal(g.log.taps.length, 2);
  g = gsetup(); g.tap(100, 100); now += 30;
  g.f("pointerdown", ev(3, 100, 100)); g.f("lostpointercapture", ev(3, 100, 100)); g.f("pointerup", ev(3, 100, 100));
  assert.equal(g.log.doubles.length, 0); assert.equal(g.log.taps.length, 1);
  g = gsetup({ mode: () => "pan" }); g.tap(100, 100); now += 50; g.tap(100, 100);
  assert.equal(g.log.doubles.length + g.log.taps.length, 0);
});
t("gestures: touch then pen / mouse never pair; synthetic mouse after the DOUBLE tap is swallowed too", () => {
  let g = gsetup(); g.tap(100, 100); now += 50; g.tap(100, 100, 50, { pointerType: "pen" });
  assert.equal(g.log.doubles.length, 0); assert.equal(g.log.taps.length, 2);
  g = gsetup(); g.tap(100, 100); now += 50; g.tap(100, 100); now += 30; g.tap(100, 100, 10, { pointerType: "mouse" }); g.tap(101, 100, 10, { pointerType: "mouse" });
  assert.equal(g.log.doubles.length, 1); assert.equal(g.log.taps.length, 1);
});
t("gestures: precise placement (hold) is never half of a double tap", () => {
  const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
  let fire = null;
  globalThis.setTimeout = (fn) => { fire = fn; return 1; }; globalThis.clearTimeout = () => {};
  try {
    const g = gsetup({ onPrecise: () => {} });
    g.tap(100, 100); now += 50;                         // tap 1 (quick)
    g.f("pointerdown", ev(50, 100, 100)); fire();       // the hold timer fires → precise
    assert.equal(g.tr.state, "precise");
    g.f("pointerup", ev(50, 100, 100)); g.f("lostpointercapture", ev(50, 100, 100));
    now += 50; g.tap(100, 100);                         // within 300 ms of tap 1 — must not pair with it
    assert.equal(g.log.doubles.length, 0); assert.equal(g.log.taps.length, 3);
  } finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; }
});
t("A2/A3 end-to-end: double-tap with the second tap 10 px away → ONE endpoint at the first tap, even if the consumer passes the second position", () => {
  let pts = P([0, 0], [50, 0]);
  let finished = 0;
  const toPdf = (p) => ({ x: p.x / 2, y: p.y / 2 });
  const el = fakeEl();
  const tr = createGestureTracker({
    mode: () => "tap",
    onTap: (p) => { if (resolvePathTap(p, { vertices: pts.map((q) => ({ x: q.x * 2, y: q.y * 2 })) }).action === "add-point") pts = appendVertex(pts, toPdf(p), cal).points; },
    // a consumer that (wrongly) hands over the double-tap position still gets one endpoint
    onDoubleTap: (p) => { const r = finishPath(pts, cal, toPdf(p)); pts = r.points; finished += r.finished ? 1 : 0; },
  });
  tr.attach(el);
  let pid = 100;
  const tap = (x, y) => { const id = pid++; el.l.pointerdown(ev(id, x, y)); now += 40; el.l.pointerup(ev(id, x, y)); el.l.lostpointercapture(ev(id, x, y)); };
  tap(100, 100); now += 120; tap(108, 104);
  assert.equal(finished, 1); assert.deepEqual(pts, P([0, 0], [50, 0], [50, 50]));
  near(path(pts).tightTotalMm, 2000);
});

console.log(`takeoff-tc-flashpath-adv: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
