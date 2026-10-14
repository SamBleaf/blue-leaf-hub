// TC-R04 13 continuous flashing runs — run: node scripts/tests/takeoff-tc-flashpath.test.mjs
// Drives the REAL shared/takeoff/engine/flashingPath.js (fixtures FLASH-*, acceptance 1–10/12 computable parts,
// split/joint/zone rules, backwards-compatible reader) and the REAL src/components/takeoff/gestures.js double-tap
// recogniser with synthetic pointer events. The pre-existing gesture suite is run separately and must stay green.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCalibration, verifyCalibration, segmentLengthMm } from "../../shared/takeoff/calibration.js";
import { measuredRunResult, FLASHING_RULE_DEFAULTS } from "../../shared/takeoff/flashing.js";
import {
  pathStations, pointAtStation, slicePath, computeFlashingPath, splitAtLimit, addSplit, moveSplit, moveSplitToCorner,
  validateSplits, legalCapacityMm, appendVertex, finishPath, resolvePathTap, pathFromMeasurement, PATH_TOL_MM, SPLIT_HANDLE_TARGET_PX,
} from "../../shared/takeoff/engine/flashingPath.js";
import { createGestureTracker, DOUBLE_TAP_MS, DOUBLE_TAP_SLOP_PX } from "../../src/components/takeoff/gestures.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } }
const near = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, msg || `${a} ≉ ${b}`);

// ── calibrations ─────────────────────────────────────────────────────────────
// 1 PDF unit = 20 mm on both axes, verified (order-ready)
const cal = verifyCalibration(buildCalibration({ horizontal: { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, knownMm: 2000 }, vertical: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 100 }, knownMm: 2000 } }).calibration,
  { p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 }, expectedMm: 1000 });
// stretched drawing: Horizontal 20 mm/unit, Vertical 10 mm/unit, calibrated at 90° display rotation
const stretched = verifyCalibration(buildCalibration({ basisRotation: 90, mode: "separate",
  horizontal: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 100 }, knownMm: 2000 }, vertical: { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, knownMm: 1000 } }).calibration,
{ p1: { x: 0, y: 0 }, p2: { x: 0, y: 50 }, expectedMm: 1000 });
const unverified = buildCalibration({ horizontal: { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, knownMm: 2000 }, vertical: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 100 }, knownMm: 2000 } }).calibration;

const P = (...xy) => xy.map(([x, y]) => ({ x, y }));
const u = (mm) => mm / 20; // mm → PDF units under `cal`
/** Zigzag of four equal legs (right, up, right, up) totalling `mm`: corners, never a straight chord. */
const zigzag = (mm) => { const a = u(mm / 4); return P([0, 0], [a, 0], [a, a], [2 * a, a], [2 * a, 2 * a]); };
/** Legs 4000 / 4000 / 2000 = 10,000 mm (legal marker 8,800 lies inside the third segment). */
const run10k = P([0, 0], [200, 0], [200, 200], [300, 200]);
const path = (points, extra = {}) => computeFlashingPath({ runId: "r1", materialId: "m1", identity: { profile: "P1", colour: "Monument" }, points, calibration: cal, ...extra });
const codes = (res) => res.problems.map((p) => p.code);
const blocking = (res) => res.problems.filter((p) => p.blocking).map((p) => p.code);

// ── fixtures.json FLASH-* through production functions ─────────────────────
const fixtures = JSON.parse(readFileSync(new URL("../../docs/takeoff/TC-R04/fixtures.json", import.meta.url), "utf8")).cases.filter((c) => c.kind === "flashingPieces");
t("fixtures: all five FLASH-* cases present", () => assert.deepEqual(fixtures.map((f) => f.id).sort(), ["FLASH-corners-one-piece", "FLASH-exact-max", "FLASH-over-max", "FLASH-split-at-limit", "FLASH-split-earlier"]));
for (const f of fixtures) {
  t(`fixture ${f.id}: Σ ordered = ${f.expected} via computeFlashingPath on a cornered calibrated path`, () => {
    const total = f.input.tightPieces.reduce((a, b) => a + b, 0);
    const splitsMm = f.input.tightPieces.slice(0, -1).map((_, i) => f.input.tightPieces.slice(0, i + 1).reduce((a, b) => a + b, 0));
    const res = path(zigzag(total), { splitsMm, rules: { allowanceMm: f.input.allowance, incrementMm: f.input.increment } });
    near(res.tightTotalMm, total);
    assert.equal(res.pieces.length, f.input.tightPieces.length);
    res.pieces.forEach((pc, i) => near(pc.tightMm, f.input.tightPieces[i]));
    assert.equal(res.pieces.reduce((a, pc) => a + pc.orderMm, 0), f.expected);
    assert.equal(res.demands.reduce((a, d) => a + d.lengthMm * d.quantity, 0), f.expected);
    assert.equal(res.pieces.some((pc) => pc.overMax), f.id === "FLASH-over-max");
  });
}

// ── stations / interpolation ─────────────────────────────────────────────────
t("pathStations: per-segment calibrated lengths, vertex stations, total", () => {
  const st = pathStations(run10k, cal);
  st.segmentLengthsMm.forEach((l, i) => near(l, [4000, 4000, 2000][i]));
  st.cumulativeMm.forEach((s, i) => near(s, [0, 4000, 8000, 10000][i]));
  near(st.totalMm, 10000);
});
t("tight length uses the calibration's X/Y transform (stretched + rotated basis), never screen px", () => {
  // PDF (0,0)→(0,75)→(75,75): at basis 90° the first leg is Horizontal (20 mm/u), the second Vertical (10 mm/u)
  const pts = P([0, 0], [0, 75], [75, 75]);
  const st = pathStations(pts, stretched);
  near(st.segmentLengthsMm[0], 1500); near(st.segmentLengthsMm[1], 750);
  near(st.totalMm, segmentLengthMm(stretched, pts[0], pts[1]) + segmentLengthMm(stretched, pts[1], pts[2]));
  const res = computeFlashingPath({ points: pts, calibration: stretched });
  near(res.tightTotalMm, 2250); assert.equal(res.pieces[0].orderMm, 2500);
});
t("pointAtStation interpolates inside a segment by arc length (plan point + segment + t)", () => {
  const p = pointAtStation(run10k, cal, 8800);
  assert.equal(p.segmentIndex, 2); near(p.t, 0.4); near(p.x, 240); near(p.y, 200);
});
t("pointAtStation: ends, corners (outgoing segment t=0), duplicate points skipped, off-path throws", () => {
  assert.deepEqual(pointAtStation(run10k, cal, 0), { x: 0, y: 0, segmentIndex: 0, t: 0 });
  assert.deepEqual(pointAtStation(run10k, cal, 10000), { x: 300, y: 200, segmentIndex: 2, t: 1 });
  const c = pointAtStation(run10k, cal, 4000); assert.equal(c.segmentIndex, 1); assert.equal(c.t, 0);
  const dup = P([0, 0], [50, 0], [50, 0], [50, 50]);
  const d = pointAtStation(dup, cal, 1000); assert.equal(d.segmentIndex, 2); assert.equal(d.t, 0);
  assert.throws(() => pointAtStation(run10k, cal, 10000.1), /not on the path/);
  assert.throws(() => pointAtStation(run10k, cal, -1), /not on the path/);
});
t("slicePath returns interpolated ends plus the corners between", () => {
  const s = slicePath(run10k, cal, 2000, 9000);
  assert.deepEqual(s.map((p) => [Math.round(p.x * 1e6) / 1e6, Math.round(p.y * 1e6) / 1e6]), [[100, 0], [200, 0], [200, 200], [250, 200]]);
});

// ── acceptance 1: corners are one piece ─────────────────────────────────────
t("A1 four 750 mm legs → tight 3,000, ONE ordered 3,200; corners add no quantity or allowance", () => {
  const res = path(zigzag(3000));
  near(res.tightTotalMm, 3000);
  assert.equal(res.pieces.length, 1);
  assert.equal(res.pieces[0].orderMm, 3200);
  assert.equal(res.pieces[0].allowanceMm, 200);
  assert.equal(res.demands.length, 1, "never one quantity per plan segment");
  const d = res.demands[0];
  assert.equal(d.lengthMm, 3200); assert.equal(d.quantity, 1); assert.equal(d.unit, "piece"); assert.equal(d.kind, "linear");
  assert.equal(d.id, "m1:r1:flashing-piece:0"); assert.equal(d.materialId, "m1"); assert.deepEqual(d.identity, { profile: "P1", colour: "Monument" });
  assert.equal(d.provenance, "calculated"); assert.equal(d.noSplice, true);
  assert.deepEqual(res.status, { quantity: "calculated", installation: "unspecified", procurement: "ready" });
  assert.deepEqual(res.layout.vertexStationsMm.map(Math.round), [0, 750, 1500, 2250, 3000]);
  assert.ok(res.explain.some((l) => /750 \+ 750 \+ 750 \+ 750 = 3,000 mm tight/.test(l)));
  assert.ok(res.explain.some((l) => /tight 3,000 \+ allowance 200 → order 3,200 mm/.test(l)));
});
t("A1 demand ids are stable (same inputs → same ids; deterministic, never random)", () => {
  assert.deepEqual(path(zigzag(10000), { splitsMm: [5000] }).demands.map((d) => d.id), path(zigzag(10000), { splitsMm: [5000] }).demands.map((d) => d.id));
});

// ── acceptance 2: endpoint model ─────────────────────────────────────────────
t("A2 appendVertex never adds a point on top of the last one (no zero segment)", () => {
  let pts = [];
  ({ points: pts } = appendVertex(pts, { x: 0, y: 0 }, cal));
  ({ points: pts } = appendVertex(pts, { x: 10, y: 0 }, cal));
  const again = appendVertex(pts, { x: 10, y: 0 }, cal);
  assert.equal(again.added, false); assert.equal(again.points.length, 2);
  assert.equal(appendVertex(pts, { x: 10 + PATH_TOL_MM / 40, y: 0 }, cal).added, false, "within 0.001 mm = same point");
  assert.equal(appendVertex(pts, { x: 10.01, y: 0 }, cal).added, true, "0.2 mm away is a real point");
});
t("A2 finishPath: duplicate final point produces no zero segment; finishing on the last point leaves it unchanged", () => {
  const pts = P([0, 0], [50, 0], [50, 50]);
  const a = finishPath([...pts, { x: 50, y: 50 }], cal);
  assert.equal(a.finished, true); assert.deepEqual(a.points, pts);
  const b = finishPath(pts, cal);
  assert.deepEqual(b.points, pts);
  assert.ok(!codes(path(b.points)).includes("zero_length_segment"));
  assert.equal(finishPath(P([0, 0]), cal).finished, false);
  assert.equal(finishPath(P([0, 0], [0, 0]), cal).finished, false);
});
t("A2 a stored duplicate point is warned (non-blocking) and adds nothing", () => {
  const res = path(P([0, 0], [50, 0], [50, 0], [50, 50]));
  near(res.tightTotalMm, 2000);
  const z = res.problems.find((p) => p.code === "zero_length_segment");
  assert.ok(z && z.blocking === false);
});

// ── acceptance 4: sum of segments, retrace ──────────────────────────────────
t("A4 out-and-back sums both legs (not the 0 mm chord), warns on exact retrace, deletes nothing", () => {
  const pts = P([0, 0], [100, 0], [0, 0]);
  const before = JSON.stringify(pts);
  const res = path(pts);
  near(res.tightTotalMm, 4000);
  assert.equal(res.pieces[0].orderMm, 4200);
  const w = res.problems.find((p) => p.code === "path_retraced");
  assert.ok(w && w.blocking === false); near(w.refs[0].overlapMm, 2000);
  assert.equal(JSON.stringify(pts), before);
  assert.equal(res.status.procurement, "ready", "a warning does not block");
});
t("A4 angled path = calibrated hypot; L path = Σ legs not chord; self-crossing is summed, not a retrace", () => {
  near(path(P([0, 0], [30, 40])).tightTotalMm, 1000);
  near(path(P([0, 0], [100, 0], [100, 100])).tightTotalMm, 4000);
  const x = path(P([0, 0], [100, 100], [100, 0], [0, 100]));
  near(x.tightTotalMm, 2000 * Math.SQRT2 * 2 + 2000);
  assert.ok(!codes(x).includes("path_retraced"));
  assert.ok(!codes(path(P([0, 0], [50, 0], [100, 0]))).includes("path_retraced"), "collinear continuation is not a retrace");
  assert.ok(codes(path(P([0, 0], [100, 0], [100, 50], [50, 50], [50, 0], [80, 0]))).includes("path_retraced"), "non-adjacent overlap");
});

// ── acceptance 5: exact maximum ─────────────────────────────────────────────
t("A5 legal capacity = floor(M/R)·R − A = 8,800 (and M not a multiple of R)", () => {
  assert.equal(legalCapacityMm({}), 8800);
  assert.equal(legalCapacityMm({ orderCeilingMm: 9050 }), 8800);
  assert.equal(legalCapacityMm({ orderCeilingMm: 9000 }, { extraMm: 50 }), 8750);
  assert.equal(legalCapacityMm({}, { lengthKind: "finished" }), 9000);
  assert.equal(legalCapacityMm({ orderCeilingMm: null }), null, "unknown maximum is never invented");
});
t("A5 tight 8,800 → valid 9,000, no overflow", () => {
  const res = path(P([0, 0], [440, 0]));
  assert.equal(res.pieces[0].orderMm, 9000); assert.equal(res.pieces[0].overMax, false);
  assert.equal(res.overflow, null); assert.deepEqual(blocking(res), []); assert.equal(res.status.procurement, "ready");
});
t("A5 tight 8,801 → order 9,100, red overflow from the 8,800 legal marker, invalid", () => {
  const res = path(P([0, 0], [440.05, 0]));
  assert.equal(res.pieces[0].orderMm, 9100); assert.equal(res.pieces[0].overMax, true);
  assert.equal(res.overflow.fromMm, 8800); assert.equal(res.overflow.legalSplitMm, 8800); near(res.overflow.toMm, 8801); near(res.overflow.overflowMm, 1);
  near(res.overflow.point.x, 440); assert.equal(res.overflow.point.y, 0);
  assert.ok(blocking(res).includes("piece_over_max")); assert.equal(res.status.procurement, "draft");
  assert.deepEqual(res.demands[0].problems.map((p) => p.code), ["piece_over_max"]);
});
t("A5 a 0.04 mm real overrun is never hidden (order 9,100; explanation shows 8,800.04); float noise is not an overrun", () => {
  const res = path(P([0, 0], [440.002, 0]));
  assert.equal(res.pieces[0].orderMm, 9100); assert.equal(res.pieces[0].overMax, true);
  assert.ok(res.explain.some((l) => /tight 8,800\.04 \+ allowance 200 → order 9,100/.test(l)), res.explain.join("\n"));
  const noise = path(P([0, 0], [440 + 5e-11, 0]));
  assert.ok(noise.tightTotalMm > 8800); assert.equal(noise.pieces[0].orderMm, 9000); assert.equal(noise.overflow, null);
});

// ── acceptance 6: red-line split at limit ───────────────────────────────────
t("A6 tight 10,000 stays ONE flagged draft until the builder splits", () => {
  const res = path(run10k);
  assert.equal(res.pieces.length, 1); assert.equal(res.pieces[0].orderMm, 10200);
  assert.deepEqual(res.splitsMm, []); assert.equal(res.status.procurement, "draft");
  assert.equal(res.overflow.pieceIndex, 0); assert.equal(res.overflow.fromMm, 8800); assert.equal(res.overflow.legalSplitMm, 8800);
  assert.equal(res.overflow.point.segmentIndex, 2); near(res.overflow.point.t, 0.4); near(res.overflow.point.x, 240);
  assert.deepEqual(res.layout.overflowRuns[0].points.map((p) => [Math.round(p.x), p.y]), [[240, 200], [300, 200]]);
  assert.equal(res.layout.legalMarkers[0].stationMm, 8800);
});
t("A6 splitAtLimit → 8,800 + 1,200 → 9,000 + 1,400; whole path kept; undo = the previous splits array", () => {
  const draft = path(run10k);
  const undo = draft.splitsMm;
  const splitsMm = splitAtLimit(draft);
  assert.deepEqual(splitsMm, [8800]); assert.deepEqual(undo, [], "input array never mutated");
  const split = path(run10k, { splitsMm });
  assert.deepEqual(split.pieces.map((pc) => pc.orderMm), [9000, 1400]);
  split.pieces.forEach((pc, i) => near(pc.tightMm, [8800, 1200][i]));
  near(split.tightTotalMm, 10000); assert.equal(split.layout.vertexStationsMm.length, 4, "every corner retained");
  assert.equal(split.overflow, null); assert.equal(split.status.procurement, "ready");
  assert.equal(split.demands.length, 2); assert.deepEqual(split.demands.map((d) => d.id), ["m1:r1:flashing-piece:0", "m1:r1:flashing-piece:1"]);
  assert.ok(split.explain.some((l) => /2 pieces cover the full 10,000 mm measured; ordered 10,400 mm/.test(l)));
  const back = path(run10k, { splitsMm: undo });
  assert.equal(back.pieces.length, 1); assert.ok(back.overflow, "undo restores the flagged unsplit draft");
});
t("A6 the tap position is never used: a red-line tap resolves to split-at-limit, never a new vertex", () => {
  const res = path(run10k);
  const screen = res.layout.overflowRuns.map((r) => ({ pieceIndex: r.pieceIndex, points: r.points.map((p) => ({ x: p.x * 2, y: p.y * 2 })) }));
  const tap = resolvePathTap({ x: 560, y: 404 }, { overflowRuns: screen });
  assert.deepEqual(tap, { action: "split-at-limit", pieceIndex: 0 });
  assert.deepEqual(splitAtLimit(res, tap.pieceIndex), [8800], "split lands on the legal marker, not at the tap (station ~9,600)");
});
t("A6 splitAtLimit with nothing over the maximum is a no-op", () => {
  assert.deepEqual(splitAtLimit(path(zigzag(3000))), []);
});

// ── acceptance 7: earlier split ─────────────────────────────────────────────
t("A7 chosen earlier split at 5,000 → 5,200 + 5,200, exactly one allowance per piece", () => {
  const res = path(run10k, { splitsMm: [5000] });
  assert.deepEqual(res.pieces.map((pc) => pc.orderMm), [5200, 5200]);
  assert.deepEqual(res.pieces.map((pc) => pc.allowanceMm), [200, 200]);
  assert.equal(res.pieces.reduce((a, pc) => a + pc.orderMm, 0), 10000 + 2 * 200);
});
t("A7 moveSplit earlier / to a corner; moving beyond legal capacity is blocked, never applied", () => {
  const split = path(run10k, { splitsMm: [8800] });
  assert.deepEqual(moveSplit(split, 0, 5000).splitsMm, [5000]);
  const corner = moveSplitToCorner(split, 0, 1);
  assert.deepEqual(corner.splitsMm, [4000]); assert.deepEqual(corner.problems, []);
  const later = moveSplit(split, 0, 9000);
  assert.deepEqual(later.splitsMm, [8800]); assert.deepEqual(later.problems.map((p) => p.code), ["split_beyond_capacity"]);
  assert.deepEqual(later.legalRangeMm, { afterMm: 0, upToMm: 8800 });
  assert.deepEqual(moveSplit(split, 0, 10000).problems.map((p) => p.code), ["split_out_of_order"]);
  assert.throws(() => moveSplitToCorner(split, 0, 9), /corner does not exist/);
  assert.throws(() => moveSplit(split, 3, 100), /split does not exist/);
});
t("A7 moving a split earlier may lengthen the next piece past the maximum: allowed, shown red, never valid", () => {
  const split = path(run10k, { splitsMm: [8800] });
  const moved = path(run10k, { splitsMm: moveSplit(split, 0, 500).splitsMm });
  assert.equal(moved.overflow.pieceIndex, 1); assert.equal(moved.overflow.fromMm, 9300); assert.equal(moved.status.procurement, "draft");
});
t("A7 addSplit: builder-chosen station inserted in order; beyond capacity blocked", () => {
  const res = path(P([0, 0], [1000, 0]), { splitsMm: [8800] }); // 20,000 mm
  assert.deepEqual(addSplit(res, 4000).splitsMm, [4000, 8800]);
  assert.deepEqual(addSplit(res, 12000).splitsMm, [8800, 12000]);
  const tooFar = addSplit(res, 18000);
  assert.deepEqual(tooFar.splitsMm, [8800]); assert.deepEqual(tooFar.problems.map((p) => p.code), ["split_beyond_capacity"]);
  assert.equal(tooFar.legalRangeMm.upToMm, 17600);
});

// ── acceptance 8: more than two pieces ──────────────────────────────────────
t("A8 >2 pieces needed: residual overflow stays visible after the first split; one tap = one split, no hidden joins", () => {
  const pts = P([0, 0], [500, 0], [500, 500]); // 20,000 mm
  const first = splitAtLimit(path(pts));
  assert.deepEqual(first, [8800]);
  const after1 = path(pts, { splitsMm: first });
  assert.equal(after1.pieces.length, 2);
  assert.equal(after1.overflow.pieceIndex, 1); assert.equal(after1.overflow.fromMm, 17600); assert.equal(after1.overflow.legalSplitMm, 17600);
  assert.equal(after1.pieces[1].orderMm, 11400); assert.equal(after1.status.procurement, "draft");
  const second = splitAtLimit(after1);
  assert.deepEqual(second, [8800, 17600]);
  const after2 = path(pts, { splitsMm: second });
  assert.deepEqual(after2.pieces.map((pc) => pc.orderMm), [9000, 9000, 2600]); assert.equal(after2.overflow, null);
});

// ── acceptance 9: handling threshold ─────────────────────────────────────────
t("A9 6,000 handling threshold: amber advisory only, never a forced split", () => {
  const res = path(zigzag(6000));
  assert.equal(res.pieces[0].orderMm, 6200); assert.equal(res.pieces[0].handlingFlag, true); assert.equal(res.pieces[0].overMax, false);
  assert.equal(res.overflow, null); assert.deepEqual(res.splitsMm, []);
  const h = res.problems.find((p) => p.code === "handling_length");
  assert.ok(h && h.blocking === false); assert.equal(res.status.procurement, "ready");
  assert.equal(path(zigzag(5800)).pieces[0].handlingFlag, false, "threshold compares the finished 6,000 (not over)");
  assert.equal(FLASHING_RULE_DEFAULTS.handlingThresholdMm, 6000);
});

// ── acceptance 10: edits invalidate splits visibly ──────────────────────────
t("A10 corner moved before a split: station rebuilt from the approved plan location, then flagged beyond capacity with a suggestion", () => {
  const split = path(run10k, { splitsMm: [8800] });
  const anchors = split.layout.splits;
  near(anchors[0].x, 240); near(anchors[0].y, 200);
  const edited = P([-10, 0], [200, 0], [200, 200], [300, 200]); // start point moved: first leg 200 mm longer, split segment unchanged
  const res = path(edited, { splitsMm: [8800], splitAnchors: anchors });
  near(res.splitsMm[0], 9000, 1e-6, "rebuilt station"); assert.equal(res.splits[0].rebuilt, true);
  assert.equal(res.splits[0].code, "split_beyond_capacity"); near(res.splits[0].suggestedMm, 8800);
  near(res.layout.splits[0].x, 240, 1e-9, "approved cut location unchanged");
  assert.ok(blocking(res).includes("split_beyond_capacity")); assert.equal(res.status.procurement, "draft");
  const v = validateSplits({ points: edited, calibration: cal, splitsMm: [8800], splitAnchors: anchors });
  assert.equal(v.valid, false); assert.deepEqual(v.problems.map((p) => p.code), ["split_beyond_capacity"]);
});
t("A10 a split whose segment moved keeps its approved location and is flagged, not silently relocated", () => {
  const anchors = path(run10k, { splitsMm: [8800] }).layout.splits;
  const res = path(P([0, 0], [200, 0], [200, 210], [300, 210]), { splitsMm: [8800], splitAnchors: anchors });
  assert.equal(res.splits[0].code, "split_moved"); assert.equal(res.splitsMm[0], 8800);
  assert.deepEqual(res.layout.splits[0], { stationMm: 8800, x: anchors[0].x, y: anchors[0].y });
  assert.equal(res.status.procurement, "draft");
});
t("A10 a split beyond a shortened path is flagged out of range; the pieces still cover the whole path", () => {
  const res = path(P([0, 0], [200, 0], [200, 200]), { splitsMm: [8800] });
  assert.equal(res.splits[0].code, "split_out_of_range"); assert.equal(res.pieces.length, 1); near(res.pieces[0].tightMm, 8000);
  assert.ok(blocking(res).includes("split_out_of_range"));
});
t("A10 recalibration rebuilds stations from anchors; unchanged geometry keeps an anchored split valid", () => {
  const anchors = path(run10k, { splitsMm: [8800] }).layout.splits;
  assert.equal(validateSplits({ points: run10k, calibration: cal, splitsMm: [8800], splitAnchors: anchors }).valid, true);
  const cal25 = verifyCalibration(buildCalibration({ horizontal: { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, knownMm: 2500 }, vertical: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 100 }, knownMm: 2500 } }).calibration,
    { p1: { x: 0, y: 0 }, p2: { x: 40, y: 0 }, expectedMm: 1000 });
  const v = validateSplits({ points: run10k, calibration: cal25, splitsMm: [8800], splitAnchors: anchors });
  near(v.splitsMm[0], 11000); assert.equal(v.valid, false); assert.equal(v.splits[0].code, "split_beyond_capacity");
});
t("A10 dependency key changes with geometry, calibration, rules and splits", () => {
  const base = path(run10k, { splitsMm: [5000] }).dependencyKey;
  assert.equal(path(run10k, { splitsMm: [5000] }).dependencyKey, base);
  assert.notEqual(path(P([0, 0], [200, 0], [200, 200], [300.0001, 200]), { splitsMm: [5000] }).dependencyKey, base);
  assert.notEqual(path(run10k, { splitsMm: [5001] }).dependencyKey, base);
  assert.notEqual(path(run10k, { splitsMm: [5000], rules: { orderCeilingMm: 8000 } }).dependencyKey, base);
  assert.notEqual(computeFlashingPath({ runId: "r1", materialId: "m1", identity: { profile: "P1", colour: "Monument" }, points: run10k, calibration: { ...cal, sx: 21 }, splitsMm: [5000] }).dependencyKey, base);
});
t("A10 structurally invalid splits (out of order / non-finite) are flagged and skipped, never reordered", () => {
  const res = path(run10k, { splitsMm: [6000, 3000, Number.NaN] });
  assert.deepEqual(res.splits.map((s) => s.code), [null, "split_out_of_order", "split_invalid_value"]);
  assert.deepEqual(res.pieces.map((pc) => Math.round(pc.tightMm)), [6000, 4000]);
  assert.deepEqual(res.splitsMm.slice(0, 2), [6000, 3000]);
});

// ── acceptance 12: length kinds, unknown/invalid maximum ────────────────────
t("A12 finished / ordered-stock lengths bypass the allowance and rounding (no double +200)", () => {
  for (const lengthKind of ["finished", "orderedStock"]) {
    const res = path(P([0, 0], [250.01, 0]), { lengthKind });
    near(res.pieces[0].orderMm, 5000.2); assert.equal(res.pieces[0].allowanceMm, 0);
  }
  assert.throws(() => path(zigzag(3000), { lengthKind: "cut" }), /tight \(measured\), finished or ordered stock/);
});
t("A12 every demand carries lengthKind 'finished' so downstream never adds the allowance again", () => {
  const res = path(zigzag(3000));
  assert.equal(res.demands[0].lengthKind, "finished"); assert.equal(res.demands[0].lengthMm, 3200);
  assert.deepEqual(res.demands[0].stockPolicy, { kind: "grid", minMm: 100, incrementMm: 100, maxMm: 9000, sharePieces: false });
});
t("A12 overlength finished length is blocked (never procurement-ready); legal split at M", () => {
  const res = path(P([0, 0], [475, 0]), { lengthKind: "finished" });
  assert.equal(res.pieces[0].overMax, true); assert.equal(res.overflow.legalSplitMm, 9000);
  assert.notEqual(res.status.procurement, "ready");
});
t("A12 a legacy 2-point run reads as a polyline and orders exactly as the existing straight-run rule", () => {
  const m = { id: "old", kind: "run", points: P([0, 0], [215.6, 0]) };
  const p = pathFromMeasurement(m);
  assert.deepEqual(p.splitsMm, []); assert.equal(p.legacy, true); assert.equal(p.points.length, 2);
  const res = computeFlashingPath({ ...p, calibration: cal });
  assert.equal(res.pieces[0].orderMm, measuredRunResult(segmentLengthMm(cal, m.points[0], m.points[1]), {}).finishedLengthMm);
  assert.throws(() => pathFromMeasurement({ kind: "run", points: P([0, 0], [1, 0], [2, 0]) }), /exactly two points/);
  assert.throws(() => pathFromMeasurement({ kind: "count", points: [] }), /Unknown measurement type/);
});
t("A12 saved polyline splits round-trip through the reader (stations + plan locations kept separate from corners)", () => {
  const res = path(run10k, { splitsMm: [8800] });
  const saved = { id: "r1", kind: "polyline", points: run10k, splits: res.layout.splits, lengthKind: "tight" };
  const back = pathFromMeasurement(JSON.parse(JSON.stringify(saved)));
  const again = computeFlashingPath({ ...back, calibration: cal });
  assert.deepEqual(again.splits.map((s) => s.code), [null]); near(again.splitsMm[0], 8800);
  assert.deepEqual(again.pieces.map((pc) => pc.orderMm), [9000, 1400]);
});
t("unknown hard maximum: setup required (missing-product), drawing continues, nothing invented", () => {
  const res = path(run10k, { rules: { orderCeilingMm: null } });
  assert.ok(blocking(res).includes("max_unknown")); assert.equal(res.status.procurement, "missing-product");
  assert.equal(res.pieces[0].orderMm, 10200); assert.equal(res.pieces[0].overMax, null); assert.equal(res.overflow, null);
  assert.ok(res.explain.some((l) => /not set up/.test(l)));
});
t("nonpositive tight capacity is an invalid product configuration", () => {
  const res = path(zigzag(3000), { rules: { orderCeilingMm: 150 } });
  assert.ok(blocking(res).includes("capacity_invalid")); assert.equal(res.status.procurement, "missing-product");
  assert.equal(res.pieces[0].overMax, true); assert.equal(res.overflow.legalSplitMm, null);
  assert.ok(codes(res).includes("no_legal_split"));
});
t("calibration: missing → incomplete with no pieces; unverified → estimate + blocked", () => {
  const none = computeFlashingPath({ points: run10k, calibration: null, splitsMm: [5000] });
  assert.ok(codes(none).includes("calibration_missing")); assert.equal(none.status.quantity, "incomplete");
  assert.deepEqual(none.pieces, []); assert.deepEqual(none.demands, []); assert.equal(none.splits[0].ok, false);
  const est = computeFlashingPath({ points: zigzag(3000), calibration: unverified });
  assert.equal(est.status.quantity, "estimate"); assert.ok(blocking(est).includes("calibration_not_ready"));
});
t("in-progress path: live lengths, no demands (no premature order line)", () => {
  const res = path(zigzag(3000), { complete: false });
  assert.equal(res.pieces[0].orderMm, 3200); assert.deepEqual(res.demands, []);
  assert.equal(res.status.quantity, "incomplete"); assert.ok(blocking(res).includes("path_in_progress"));
  assert.ok(codes(path(P([0, 0]))).includes("path_incomplete"));
});
t("region: a path leaving the calibration region is blocked", () => {
  const res = computeFlashingPath({ points: run10k, calibration: { ...cal, region: { x0: 0, y0: 0, x1: 250, y1: 250 } } });
  assert.ok(blocking(res).includes("outside_region"));
});

// ── joints and allowances ────────────────────────────────────────────────────
t("additional joint lap recalculates legal capacity before allocation (marker earlier than the red start)", () => {
  const jointDetail = { lapMm: 100, carriedBy: "before", includedInAllowance: false };
  const res = path(run10k, { jointDetail });
  assert.equal(res.overflow.fromMm, 8800); assert.equal(res.overflow.legalSplitMm, 8700);
  const split = path(run10k, { jointDetail, splitsMm: splitAtLimit(res) });
  assert.deepEqual(split.splitsMm, [8700]);
  assert.deepEqual(split.pieces.map((pc) => pc.orderMm), [9000, 1500]);
  assert.deepEqual(split.pieces.map((pc) => pc.extraMm), [100, 0]);
  assert.equal(split.status.installation, "project-detail-supplied"); assert.equal(split.status.procurement, "ready");
  const after = path(run10k, { jointDetail: { ...jointDetail, carriedBy: "after" }, splitsMm: [8800] });
  assert.deepEqual(after.pieces.map((pc) => pc.orderMm), [9000, 1500]);
});
t("a lap included in the 200 mm is never added twice; an included lap over 200 mm is flagged", () => {
  const inc = path(run10k, { splitsMm: [8800], jointDetail: { lapMm: 150, carriedBy: "before", includedInAllowance: true } });
  assert.deepEqual(inc.pieces.map((pc) => pc.orderMm), [9000, 1400]);
  const over = path(run10k, { splitsMm: [5000], jointDetail: { lapMm: 300, carriedBy: "before", includedInAllowance: true } });
  assert.ok(blocking(over).includes("allowance_overcommitted"));
  assert.throws(() => path(run10k, { jointDetail: { lapMm: 50, includedInAllowance: false } }), /never inferred/);
  assert.throws(() => path(run10k, { jointDetail: { lapMm: 50, carriedBy: "before" } }), /included in the measured allowance or additional/);
});
t("explicit end details apply to the first/last piece only", () => {
  const res = path(zigzag(3000), { endDetails: { start: { mm: 50, kind: "return", includedInAllowance: false }, end: { mm: 40, includedInAllowance: false } } });
  assert.equal(res.pieces[0].extraMm, 90); assert.equal(res.pieces[0].orderMm, 3300);
  const split = path(zigzag(3000), { splitsMm: [1500], endDetails: { end: { mm: 40, includedInAllowance: false } } });
  assert.deepEqual(split.pieces.map((pc) => pc.extraMm), [0, 40]);
});
t("project no-joint zone: legal split moves EARLIER to a legal station; a split inside the zone is blocked/flagged", () => {
  const noJointZones = [{ fromMm: 8500, toMm: 9500 }];
  const res = path(run10k, { noJointZones });
  assert.equal(res.overflow.fromMm, 8800); assert.equal(res.overflow.legalSplitMm, 8500);
  assert.deepEqual(splitAtLimit(res), [8500]);
  assert.deepEqual(moveSplit(path(run10k, { noJointZones, splitsMm: [8500] }), 0, 9000).problems.map((p) => p.code), ["split_in_no_joint_zone"]);
  const flagged = path(run10k, { noJointZones, splitsMm: [9000] });
  assert.equal(flagged.splits[0].code, "split_in_no_joint_zone"); assert.equal(flagged.splits[0].suggestedMm, 8500);
  const none = path(run10k, { noJointZones: [{ fromMm: 0, toMm: 9500 }] });
  assert.equal(none.overflow.legalSplitMm, null); assert.ok(codes(none).includes("no_legal_split"));
  assert.deepEqual(splitAtLimit(none), []);
});

// ── hit testing ──────────────────────────────────────────────────────────────
t("hit testing priority: split handle (≥ 44 px) → vertex → red line → add point", () => {
  const targets = { splitHandles: [{ x: 100, y: 100 }], vertices: [{ x: 110, y: 100, index: 3 }], overflowRuns: [{ pieceIndex: 1, points: [{ x: 0, y: 100 }, { x: 300, y: 100 }] }] };
  assert.deepEqual(resolvePathTap({ x: 105, y: 100 }, targets), { action: "split-handle", index: 0 });
  assert.deepEqual(resolvePathTap({ x: 100, y: 121 }, targets, { handleTargetPx: 10 }), { action: "split-handle", index: 0 }, "44 px minimum target");
  assert.deepEqual(resolvePathTap({ x: 130, y: 100 }, targets), { action: "vertex", index: 3 });
  assert.deepEqual(resolvePathTap({ x: 250, y: 115 }, targets), { action: "split-at-limit", pieceIndex: 1 });
  assert.deepEqual(resolvePathTap({ x: 250, y: 160 }, targets), { action: "add-point" });
  assert.equal(SPLIT_HANDLE_TARGET_PX, 44);
});
t("double-tapping the last point of an overlength path finishes it (vertex outranks the red line)", () => {
  assert.deepEqual(resolvePathTap({ x: 298, y: 101 }, { vertices: [{ x: 300, y: 100 }], overflowRuns: [{ pieceIndex: 0, points: [{ x: 200, y: 100 }, { x: 300, y: 100 }] }] }), { action: "vertex", index: 0 });
});

// ── gestures: opt-in double-tap recogniser ───────────────────────────────────
let now = 1000;
globalThis.performance = { now: () => now };
function fakeEl() {
  const l = {};
  return { l, addEventListener: (k, f) => { l[k] = f; }, removeEventListener: (k) => { delete l[k]; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }), setPointerCapture() {} };
}
const ev = (id, x, y, extra = {}) => ({ pointerId: id, clientX: x, clientY: y, pointerType: "touch", button: 0, preventDefault() {}, target: { closest: () => null }, ...extra });
function gsetup(withDouble = true, options) {
  const el = fakeEl();
  const log = { taps: [], doubles: [], pans: 0, pinches: 0 };
  const tr = createGestureTracker({
    mode: () => "tap",
    onTap: (p) => log.taps.push(p),
    onPan: () => { log.pans++; },
    onPinch: () => { log.pinches++; },
    ...(withDouble ? { onDoubleTap: (p, e, info) => log.doubles.push({ p, info }) } : {}),
  }, options);
  tr.attach(el);
  const f = (k, e) => el.l[k](e);
  // real browser order: every pointerup on a captured pointer is followed by lostpointercapture
  const tap = (x, y, holdMs = 60, extra = {}) => { f("pointerdown", ev(1, x, y, extra)); now += holdMs; f("pointerup", ev(1, x, y, extra)); f("lostpointercapture", ev(1, x, y, extra)); };
  return { tr, log, f, tap };
}
t(`gestures: defaults are ${DOUBLE_TAP_MS} ms / ${DOUBLE_TAP_SLOP_PX} px`, () => { assert.equal(DOUBLE_TAP_MS, 300); assert.equal(DOUBLE_TAP_SLOP_PX, 24); });
t("gestures: a single tap fires onTap immediately (on pointer-up)", () => {
  const { log, tap } = gsetup();
  tap(100, 100);
  assert.equal(log.taps.length, 1); assert.equal(log.doubles.length, 0);
});
t("gestures: double tap → first onTap (feedback) then ONE onDoubleTap, never a second onTap", () => {
  const { log, tap } = gsetup();
  tap(100, 100); now += 150; tap(110, 105);
  assert.equal(log.taps.length, 1); assert.equal(log.doubles.length, 1);
  assert.deepEqual(log.doubles[0].info.first, { x: 100, y: 100 }); assert.equal(log.doubles[0].info.intervalMs, 150);
});
t("gestures: a third quick tap starts fresh (tap, double, tap)", () => {
  const { log, tap } = gsetup();
  tap(100, 100); now += 100; tap(100, 100); now += 100; tap(100, 100);
  assert.equal(log.taps.length, 2); assert.equal(log.doubles.length, 1);
});
t("gestures: slow second tap (> 300 ms after the first lifts) = two taps", () => {
  const { log, tap } = gsetup();
  tap(100, 100); now += 301; tap(100, 100);
  assert.equal(log.taps.length, 2); assert.equal(log.doubles.length, 0);
});
t("gestures: far second tap (> 24 px) = two taps", () => {
  const { log, tap } = gsetup();
  tap(100, 100); now += 100; tap(125, 100);
  assert.equal(log.taps.length, 2); assert.equal(log.doubles.length, 0);
});
t("gestures: the lostpointercapture trailing a tap's pointerup does not break the pair; reset() does", () => {
  const { log, f, tr } = gsetup();
  f("pointerdown", ev(1, 100, 100)); now += 60; f("pointerup", ev(1, 100, 100)); f("lostpointercapture", ev(1, 100, 100));
  now += 100; f("pointerdown", ev(1, 100, 100)); now += 60; f("pointerup", ev(1, 100, 100));
  assert.equal(log.doubles.length, 1);
  now += 100; f("pointerdown", ev(1, 100, 100)); now += 60; f("pointerup", ev(1, 100, 100));
  tr.reset(); now += 50; f("pointerdown", ev(1, 100, 100)); now += 60; f("pointerup", ev(1, 100, 100));
  assert.equal(log.doubles.length, 1); assert.equal(log.taps.length, 3);
});
t("gestures: a slow (> 600 ms) second press is not a tap and breaks the pair", () => {
  const { log, tap } = gsetup();
  tap(100, 100); now += 50; tap(100, 100, 700); now += 50; tap(100, 100);
  assert.equal(log.taps.length, 2); assert.equal(log.doubles.length, 0);
});
t("gestures: thresholds are tunable via options", () => {
  const { log, tap } = gsetup(true, { doubleTapMs: 500, doubleTapSlopPx: 40 });
  tap(100, 100); now += 450; tap(135, 100);
  assert.equal(log.doubles.length, 1);
});
t("gestures: a pinch as the second gesture produces no tap and no double tap", () => {
  const { log, f, tap } = gsetup();
  tap(100, 100); now += 50;
  f("pointerdown", ev(1, 100, 100)); f("pointerdown", ev(2, 200, 100)); f("pointermove", ev(2, 240, 100));
  f("pointerup", ev(1, 100, 100)); f("pointerup", ev(2, 240, 100));
  assert.equal(log.taps.length, 1); assert.equal(log.doubles.length, 0); assert.ok(log.pinches > 0);
  now += 50; tap(100, 100);
  assert.equal(log.doubles.length, 0, "a pinch in between breaks the pair"); assert.equal(log.taps.length, 2);
});
t("gestures: pointercancel on the second press → no tap, no double tap, pairing reset", () => {
  const { log, f, tap, tr } = gsetup();
  tap(100, 100); now += 50;
  f("pointerdown", ev(1, 100, 100)); f("pointercancel", ev(1, 100, 100));
  assert.equal(tr.state, "idle"); assert.equal(log.taps.length, 1); assert.equal(log.doubles.length, 0);
  now += 50; tap(100, 100);
  assert.equal(log.doubles.length, 0); assert.equal(log.taps.length, 2);
});
t("gestures: a pan (drag > 8 px) as the second press → no tap, no double tap", () => {
  const { log, f, tap } = gsetup();
  tap(100, 100); now += 50;
  f("pointerdown", ev(1, 100, 100)); f("pointermove", ev(1, 112, 100)); f("pointerup", ev(1, 112, 100));
  assert.equal(log.taps.length, 1); assert.equal(log.doubles.length, 0); assert.ok(log.pans > 0);
});
t("gestures: synthetic mouse after a touch tap is ignored (no duplicate endpoint)", () => {
  const { log, tap, tr } = gsetup();
  tap(100, 100); now += 20;
  tap(100, 100, 10, { pointerType: "mouse" });
  assert.equal(log.taps.length, 1); assert.equal(log.doubles.length, 0); assert.equal(tr.pointerCount, 0);
  now += 3000; tap(100, 100, 10, { pointerType: "mouse" });
  assert.equal(log.taps.length, 2, "a real mouse click later still works");
});
t("gestures: desktop double-click (mouse) is recognised by the same recogniser", () => {
  const { log, tap } = gsetup();
  tap(100, 100, 60, { pointerType: "mouse" }); now += 120; tap(101, 100, 60, { pointerType: "mouse" });
  assert.equal(log.taps.length, 1); assert.equal(log.doubles.length, 1);
});
t("gestures: WITHOUT onDoubleTap two quick taps stay two onTaps and mouse after touch is untouched (unchanged behaviour)", () => {
  const { log, tap } = gsetup(false);
  tap(100, 100); now += 100; tap(100, 100); now += 20; tap(100, 100, 10, { pointerType: "mouse" });
  assert.equal(log.taps.length, 3); assert.equal(log.doubles.length, 0);
});
t("A2/A3 end-to-end: tracker + model — double-tap adds the endpoint once and finishes; double-tap on the last point adds nothing", () => {
  let pts = P([0, 0], [50, 0]);
  let finished = false;
  const toPdf = (p) => ({ x: p.x / 2, y: p.y / 2 });
  const el = fakeEl();
  const tr = createGestureTracker({
    mode: () => "tap",
    onTap: (p) => {
      const hit = resolvePathTap(p, { vertices: pts.map((q) => ({ x: q.x * 2, y: q.y * 2 })) });
      if (hit.action === "add-point") pts = appendVertex(pts, toPdf(p), cal).points;
    },
    onDoubleTap: () => { const r = finishPath(pts, cal); pts = r.points; finished = r.finished; },
  });
  tr.attach(el);
  const f = (k, e) => el.l[k](e);
  const tap = (x, y) => { f("pointerdown", ev(1, x, y)); now += 60; f("pointerup", ev(1, x, y)); f("lostpointercapture", ev(1, x, y)); };
  tap(100, 100); now += 120; tap(104, 102);
  assert.equal(finished, true); assert.equal(pts.length, 3, "one endpoint"); assert.deepEqual(pts[2], { x: 50, y: 50 });
  finished = false; now += 1000;
  tap(100, 100); now += 120; tap(100, 100); // double-tap the existing last point
  assert.equal(finished, true); assert.equal(pts.length, 3, "no duplicate, no zero segment");
  assert.ok(!codes(path(pts)).includes("zero_length_segment"));
});

console.log(`takeoff-tc-flashpath: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
