// Takeoff calculation tests — run: node scripts/tests/takeoff-calc.test.mjs
// Expected values come from the INDEPENDENT case file docs/takeoff/R03/calculation-cases.json
// and are asserted against the PRODUCTION functions in shared/takeoff (no copied maths).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  measuredFinishedLength, measuredRunResult, manualPieceResult, lengthFlags, evaluateSplit,
  memberCount, memberPositions, getMethod, buildCalibration, verifyCalibration, segmentLengthMm,
  CALIBRATION_STATUS, computeWorkspace, orderStatus, allocate, contributionPiecesForBucket,
  totalLinearMetres, ceilToIncrement, TakeoffValidationError, pointsWithinCalibration, starterProfile, setIncludedAngle,
  verificationReusesReference, rescaleCandidates,
} from "../../shared/takeoff/index.js";

const cases = JSON.parse(readFileSync(new URL("../../docs/takeoff/R03/calculation-cases.json", import.meta.url), "utf8"));
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}
const throwsValidation = (fn) => assert.throws(fn, (e) => e instanceof TakeoffValidationError);

// ── measured flashing (case file) ─────────────────────────────────────────────
for (const c of cases.measuredFlashing) t(`measured ${c.raw} → ${c.finished}`, () => assert.equal(measuredFinishedLength(c.raw), c.finished));
t("measured explanation text", () => {
  const r = measuredRunResult(4312);
  assert.equal(r.allowanceMm, 200); assert.equal(r.finishedLengthMm, 4600);
});
t("float noise on a boundary does not bump an increment", () => assert.equal(measuredFinishedLength(4300.0000000004), 4500));
t("genuinely above a boundary still rounds up", () => assert.equal(measuredFinishedLength(4300.01), 4600));
t("allowance is a rule parameter", () => assert.equal(measuredFinishedLength(4312, { allowanceMm: 0, incrementMm: 100 }), 4400));
t("measured rejects zero/negative/NaN/∞", () => { for (const v of [0, -5, NaN, Infinity, "4312"]) throwsValidation(() => measuredFinishedLength(v)); });

// ── manual flashing ───────────────────────────────────────────────────────────
for (const c of cases.manualFlashing) t(`manual ${c.length}×${c.quantity}`, () => {
  const r = manualPieceResult(c.length, c.quantity);
  assert.equal(r.finishedLengthMm, c.finished);
  assert.equal(r.allowanceMm, 0);
  assert.equal(totalLinearMetres([r]), c.totalLm);
});
t("manual rejects fractional / zero quantities", () => { for (const q of [0, 1.5, -1, NaN]) throwsValidation(() => manualPieceResult(4312, q)); });
t("manual supplier increment validates, never rounds", () => {
  const r = manualPieceResult(4312, 1, undefined, { supplierIncrementMm: 100 });
  assert.equal(r.finishedLengthMm, 4312); assert.equal(r.incrementMismatch, true);
});

// ── thresholds ────────────────────────────────────────────────────────────────
for (const c of cases.thresholds) t(`thresholds ${c.finished}`, () => {
  const f = lengthFlags(c.finished);
  assert.equal(f.handlingFlag, c.handlingFlag); assert.equal(f.ceilingExceeded, c.ceilingExceeded);
});
t("ceiling is separately configurable", () => assert.equal(lengthFlags(9001, { orderCeilingMm: 12000 }).ceilingExceeded, false));

// ── split ─────────────────────────────────────────────────────────────────────
for (const c of cases.split) t(`split ${c.pieces.join("+")} lap ${c.laps}`, () => {
  const r = evaluateSplit({ requiredFinishedMm: c.requiredFinished, pieces: c.pieces, laps: c.laps });
  assert.equal(r.coverageMm, c.coverage); assert.equal(r.valid, c.valid);
});
t("split source raw 7000 → finished 7200 (allowance once)", () => assert.equal(measuredFinishedLength(7000), 7200));
t("split children round UP then coverage recomputed", () => {
  const r = evaluateSplit({ requiredFinishedMm: 7200, pieces: [3650, 3650], laps: [200] });
  assert.deepEqual(r.children.map((c) => c.finishedLengthMm), [3700, 3700]); assert.equal(r.coverageMm, 7200);
});
t("split needs a lap per joint (no universal lap)", () => throwsValidation(() => evaluateSplit({ requiredFinishedMm: 7200, pieces: [3700, 3700], laps: [] })));
t("split piece over ceiling invalid", () => assert.equal(evaluateSplit({ requiredFinishedMm: 9500, pieces: [9100, 600], laps: [100] }).valid, false));
t("split overcoverage displayed", () => assert.equal(evaluateSplit({ requiredFinishedMm: 7200, pieces: [4000, 3700], laps: [200] }).overcoverageMm, 300));

// ── later-material contracts ──────────────────────────────────────────────────
for (const c of cases.repeatedMembers) t(`members run ${c.run} @ ${c.centres}`, () => assert.equal(memberCount(c.run, c.centres), c.count));
t("member positions end AT the run end", () => {
  const p = memberPositions(6100, 600);
  assert.equal(p.length, 12); assert.equal(p[p.length - 1], 6100); assert.equal(p[p.length - 2], 6000);
  assert.equal(Math.max(...p), 6100);
});
t("zero-length distribution invalid", () => throwsValidation(() => memberCount(0, 600)));
const members = getMethod("repeated_members", 1);
for (const c of cases.memberLength) t(`member length ${c.input} ${c.inputType}`, () => {
  const r = members.calculate({ runMm: 6000, memberLengthMm: c.input, lengthKind: c.inputType }, { centresMm: 600, pitchDeg: c.pitchDegrees, incrementMm: c.stockIncrement });
  if (c.trueLengthApprox) assert.ok(Math.abs(r.trueLengthMm - c.trueLengthApprox) < 1e-6);
  assert.equal(r.stockLengthMm, c.orderLength);
});
t("explicit stock list: none fits → unavailable (no clamp)", () => {
  const r = members.calculate({ runMm: 6000, memberLengthMm: 7300, lengthKind: "true", stockLengthsMm: [4800, 6000, 7200] }, { centresMm: 600 });
  assert.equal(r.available, false); assert.equal(r.stockLengthMm, null);
});
const wall = getMethod("sheet_wall", 1);
for (const c of cases.sheetWall) t(`sheet wall ${c.wallLength}/${c.effectiveCover}`, () => {
  const r = wall.calculate({ wallLengthMm: c.wallLength, wallHeightMm: c.wallHeight }, { effectiveCoverMm: c.effectiveCover, maxSheetHeightMm: c.sheetHeight });
  assert.equal(r.sheets, c.count);
});
t("sheet wall taller than sheet, no joint rule → needs_rule", () => {
  const r = wall.calculate({ wallLengthMm: 6100, wallHeightMm: 3000 }, { effectiveCoverMm: 1200, maxSheetHeightMm: 2750 });
  assert.equal(r.status, "needs_rule"); assert.equal(r.sheets, null);
});
const a2l = getMethod("area_to_linear", 1);
for (const c of cases.areaToLinear) t(`area ${c.areaM2}m² / ${c.effectiveCoverMm}mm`, () => {
  const r = a2l.calculate({ netAreaM2: c.areaM2, nominalWidthM: 0.1 }, { effectiveCoverM: c.effectiveCoverMm / 1000, wastePct: c.wastePercent });
  assert.equal(r.baseLinearM, c.linearMetres);
});
t("area_to_linear requires effective cover (nominal width never substitutes)", () => throwsValidation(() => a2l.calculate({ netAreaM2: 27, nominalWidthM: 0.1 }, {})));
t("contract methods are not production", () => { for (const k of ["repeated_members", "sheet_wall", "area_to_linear"]) assert.equal(getMethod(k, 1).status, "contract"); });
t("unknown method rejected", () => throwsValidation(() => getMethod("eval_me", 1)));

// ── calibration ───────────────────────────────────────────────────────────────
const H = (sx) => ({ p1: { x: 0, y: 0 }, p2: { x: 1000 / sx, y: 0 }, knownMm: 1000 });
const V = (sy) => ({ p1: { x: 0, y: 0 }, p2: { x: 0, y: 1000 / sy }, knownMm: 1000 });
t("sx=sy=20 → uniform 20; (300,400) → 10000", () => {
  const r = buildCalibration({ horizontal: H(20), vertical: V(20) });
  assert.equal(r.ok, true); assert.equal(r.calibration.mode, "uniform");
  assert.ok(Math.abs(r.calibration.sx - 20) < 1e-9);
  assert.ok(Math.abs(segmentLengthMm(r.calibration, { x: 0, y: 0 }, { x: 300, y: 400 }) - 10000) < 1e-6);
});
for (const c of cases.separateAxisCalibration) t(`separate ${c.sx}/${c.sy}`, () => {
  const r = buildCalibration({ horizontal: H(c.sx), vertical: V(c.sy), mode: "separate" });
  assert.equal(r.ok, true);
  assert.ok(Math.abs(segmentLengthMm(r.calibration, { x: 0, y: 0 }, { x: c.dx, y: c.dy }) - c.lengthApprox) < 1e-6);
});
t("axis mismatch > 0.5% cannot silently save as normal", () => {
  const r = buildCalibration({ horizontal: H(20), vertical: V(20.2) });
  assert.equal(r.ok, false); assert.equal(r.reason, "axis_mismatch");
});
t("mismatch exactly 0.5% allowed as uniform", () => {
  const sy = 20 * (1 + 0.005 / (1 - 0.0025)); // abs(sx-sy)/mean = 0.005
  const r = buildCalibration({ horizontal: H(20), vertical: V(sy) });
  assert.equal(r.ok, true);
});
t("third-dimension check > 0.5% → needs_review", () => {
  const cal = buildCalibration({ horizontal: H(20), vertical: V(20) }).calibration;
  const bad = verifyCalibration(cal, { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, expectedMm: 1950 });
  assert.equal(bad.status, CALIBRATION_STATUS.NEEDS_REVIEW);
  const good = verifyCalibration(cal, { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, expectedMm: 2005 });
  assert.equal(good.status, CALIBRATION_STATUS.READY);
});
t("calibration rejects coincident points / bad lengths", () => {
  throwsValidation(() => buildCalibration({ horizontal: { p1: { x: 1, y: 1 }, p2: { x: 1, y: 5 }, knownMm: 1000 }, vertical: V(20) }));
  throwsValidation(() => buildCalibration({ horizontal: { ...H(20), knownMm: 0 }, vertical: V(20) }));
  throwsValidation(() => buildCalibration({ horizontal: { ...H(20), knownMm: NaN }, vertical: V(20) }));
});
t("vertical-axis secondary coordinate ignored (axis-projected)", () => {
  const r = buildCalibration({ horizontal: { p1: { x: 0, y: 0 }, p2: { x: 50, y: 3 }, knownMm: 1000 }, vertical: V(20) });
  assert.ok(Math.abs(r.calibration.measuredSx - 20) < 1e-9);
});
t("region scope: points outside region rejected", () => {
  const cal = buildCalibration({ horizontal: H(20), vertical: V(20), region: { x0: 0, y0: 0, x1: 100, y1: 100 } }).calibration;
  assert.equal(pointsWithinCalibration(cal, [{ x: 10, y: 10 }, { x: 90, y: 50 }]), true);
  assert.equal(pointsWithinCalibration(cal, [{ x: 10, y: 10 }, { x: 150, y: 50 }]), false);
});

// ── workspace / schedule / allocation ─────────────────────────────────────────
const profile = starterProfile();
const spec = { product: "Flashing", finish: "COLORBOND", bmt: 0.55, colour: "Monument" };
function ws(extra = {}) {
  const cal = verifyCalibration(buildCalibration({ horizontal: H(20), vertical: V(20) }).calibration, { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, expectedMm: 2000 });
  return {
    documents: [{ id: "d1", status: "current" }],
    calibrations: [{ id: "c1", ...cal }],
    materials: [{ id: "m1", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec, profile }],
    measurements: [
      { id: "r1", kind: "run", documentId: "d1", calibrationId: "c1", points: [{ x: 0, y: 0 }, { x: 4312 / 20, y: 0 }] },
      { id: "r2", kind: "run", documentId: "d1", calibrationId: "c1", points: [{ x: 0, y: 0 }, { x: 4312 / 20, y: 0 }] },
      { id: "n1", kind: "manual", finishedLengthMm: 4312, quantity: 3 },
    ],
    contributions: [
      { id: "k1", measurementId: "r1", jobMaterialId: "m1" },
      { id: "k2", measurementId: "r2", jobMaterialId: "m1" },
      { id: "k3", measurementId: "n1", jobMaterialId: "m1" },
    ],
    ...extra,
  };
}
t("allowance once per separately drawn run; equal runs still each get allowance", () => {
  const out = computeWorkspace(ws());
  const l4600 = out.scheduleLines.find((l) => l.finishedLengthMm === 4600);
  assert.equal(l4600.quantity, 2); assert.deepEqual(l4600.contributionIds.sort(), ["k1", "k2"]);
  const l4312 = out.scheduleLines.find((l) => l.finishedLengthMm === 4312);
  assert.equal(l4312.quantity, 3);
  assert.equal(out.scheduleLines.length, 2); // never merged into one LM line
  assert.equal(out.totalLm, Number(((4600 * 2 + 4312 * 3) / 1000).toFixed(3)));
  assert.equal(out.orderReady, true);
});
t("split replaces the original contribution, not adds to it", () => {
  const w = ws();
  w.measurements[0].points = [{ x: 0, y: 0 }, { x: 7000 / 20, y: 0 }];
  w.contributions[0].split = { pieces: [3700, 3700], laps: [200], sourceFinishedMm: 7200 };
  const out = computeWorkspace(w);
  assert.equal(out.scheduleLines.find((l) => l.finishedLengthMm === 7200), undefined);
  assert.equal(out.scheduleLines.find((l) => l.finishedLengthMm === 3700).quantity, 2);
  delete w.contributions[0].split; // undo restores the original once
  const back = computeWorkspace(w);
  assert.equal(back.scheduleLines.find((l) => l.finishedLengthMm === 7200).quantity, 1);
  assert.equal(back.scheduleLines.find((l) => l.finishedLengthMm === 3700), undefined);
});
t("editing source invalidates split until reviewed", () => {
  const w = ws();
  w.measurements[0].points = [{ x: 0, y: 0 }, { x: 7100 / 20, y: 0 }]; // now 7300 finished
  w.contributions[0].split = { pieces: [3700, 3700], laps: [200], sourceFinishedMm: 7200 };
  const c = computeWorkspace(w).contributions.find((x) => x.contributionId === "k1");
  assert.ok(c.problems.includes("split_stale"));
});
t("ceiling exceeded blocks order-ready", () => {
  const w = ws(); w.measurements[0].points = [{ x: 0, y: 0 }, { x: 8801 / 20, y: 0 }];
  const out = computeWorkspace(w);
  assert.equal(out.orderReady, false);
  assert.ok(out.scheduleLines.find((l) => l.finishedLengthMm === 9100).problems.includes("ceiling_exceeded"));
});
t("superseded plan / unverified scale block readiness", () => {
  const w = ws(); w.documents[0].status = "superseded";
  assert.equal(computeWorkspace(w).orderReady, false);
  const w2 = ws(); w2.calibrations[0].status = "needs_review";
  assert.ok(computeWorkspace(w2).contributions[0].problems.includes("calibration_not_ready"));
});
t("two different shapes with equal girth never merge", () => {
  const w = ws();
  w.materials.push({ id: "m2", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec, profile: setIncludedAngle(profile, 0, 135) });
  w.contributions[1].jobMaterialId = "m2";
  const lines = computeWorkspace(w).scheduleLines.filter((l) => l.finishedLengthMm === 4600);
  assert.equal(lines.length, 2);
});
t("identical spec across two job materials groups", () => {
  const w = ws();
  w.materials.push({ id: "m2", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec: { ...spec }, profile: JSON.parse(JSON.stringify(profile)) });
  w.contributions[1].jobMaterialId = "m2";
  assert.equal(computeWorkspace(w).scheduleLines.find((l) => l.finishedLengthMm === 4600).quantity, 2);
});
t("required 10, placed 6 → remaining 4; export changes nothing; over-allocation rejected", () => {
  const w = ws({ measurements: [{ id: "n1", kind: "manual", finishedLengthMm: 4600, quantity: 10 }], contributions: [{ id: "k1", measurementId: "n1", jobMaterialId: "m1" }] });
  const out = computeWorkspace(w);
  const line = out.scheduleLines[0];
  const placed = allocate(line, 6, contributionPiecesForBucket(out, line), []);
  let st = orderStatus(out.scheduleLines, placed).get(line.bucketKey);
  assert.deepEqual([st.required, st.ordered, st.remaining], [10, 6, 4]);
  // an export alone is not a commitment → recomputing with the same commitments is unchanged
  st = orderStatus(out.scheduleLines, placed).get(line.bucketKey);
  assert.equal(st.remaining, 4);
  throwsValidation(() => allocate(line, 5, contributionPiecesForBucket(out, line), placed));
  const more = allocate(line, 4, contributionPiecesForBucket(out, line), placed);
  assert.equal(orderStatus(out.scheduleLines, [...placed, ...more]).get(line.bucketKey).remaining, 0);
  // cancelling the first placement reverses its commitment
  assert.equal(orderStatus(out.scheduleLines, more).get(line.bucketKey).remaining, 6);
});
t("requirement falls below committed → surplus shown separately", () => {
  const w = ws({ measurements: [{ id: "n1", kind: "manual", finishedLengthMm: 4600, quantity: 3 }], contributions: [{ id: "k1", measurementId: "n1", jobMaterialId: "m1" }] });
  const out = computeWorkspace(w);
  const st = orderStatus(out.scheduleLines, [{ bucketKey: out.scheduleLines[0].bucketKey, contributionId: "k1", quantity: 5 }]).get(out.scheduleLines[0].bucketKey);
  assert.equal(st.surplus, 2); assert.equal(st.remaining, 0);
});
t("review #4: two profile-less items with the same spec never merge", () => {
  const w = ws({
    materials: [
      { id: "m-lh", name: "Stop end LH", methodKey: "finished_piece_count", methodVersion: 1, rules: {}, spec, profile: null },
      { id: "m-rh", name: "Stop end RH", methodKey: "finished_piece_count", methodVersion: 1, rules: {}, spec, profile: null },
    ],
    measurements: [{ id: "a", kind: "manual", finishedLengthMm: 300, quantity: 4 }, { id: "b", kind: "manual", finishedLengthMm: 300, quantity: 6 }],
    contributions: [{ id: "k1", measurementId: "a", jobMaterialId: "m-lh" }, { id: "k2", measurementId: "b", jobMaterialId: "m-rh" }],
  });
  const lines = computeWorkspace(w).scheduleLines;
  assert.equal(lines.length, 2); assert.deepEqual(lines.map((l) => l.quantity).sort(), [4, 6]);
});
t("review #15: run on an older scale revision is flagged until reviewed", () => {
  const w = ws();
  w.calibrations.push({ ...w.calibrations[0], id: "c2", calibrationRevision: 2, documentId: "d1", pageIndex: 0 });
  w.calibrations[0] = { ...w.calibrations[0], documentId: "d1", pageIndex: 0, calibrationRevision: 1 };
  const c = computeWorkspace(w).contributions.find((x) => x.contributionId === "k1");
  assert.ok(c.problems.includes("calibration_superseded"));
  const cands = rescaleCandidates(w);
  assert.equal(cands.length, 2); assert.equal(cands[0].to.id, "c2"); assert.equal(cands[0].after.finishedLengthMm, 4600);
});
t("review #15: a check that re-uses the horizontal reference is not independent", () => {
  const cal = buildCalibration({ horizontal: H(20), vertical: V(20) }).calibration;
  assert.equal(verificationReusesReference(cal, { p1: H(20).p2, p2: H(20).p1, expectedMm: 1000 }), true);
  assert.equal(verificationReusesReference(cal, { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, expectedMm: 2000 }), false);
});
t("ceilToIncrement exact boundaries", () => {
  assert.equal(ceilToIncrement(6000, 600), 6000); assert.equal(ceilToIncrement(6000.5, 600), 6600);
});

console.log(`takeoff-calc: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
