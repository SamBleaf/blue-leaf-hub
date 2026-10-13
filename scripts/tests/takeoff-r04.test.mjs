// R04 correction regressions — the reviewer's reproduced defects (review-r04/reproduce.mjs asserted the BAD
// behaviour; these assert the desired behaviour) plus the A05/A06/A09 arithmetic, against production functions.
//   node scripts/tests/takeoff-r04.test.mjs
import assert from "node:assert/strict";
import {
  starterProfile, computeWorkspace, materialProblems, materialSpecKey, buildCalibration, verifyCalibration,
  orderLineState, reconcileStaleLine, normaliseSpec, describeSpec, specProblems, colourOptions, thicknessOptions, PALETTES,
} from "../../shared/takeoff/index.js";
import { buildExportSnapshot } from "../../server/lib/takeoff/takeoffService.mjs";
import { rebaseRecord } from "../../src/components/takeoff/changeset.js";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

const spec = { product: "Flashing", finish: "COLORBOND", bmt: 0.55, colour: "Monument" };
const mat = (id, s = spec) => ({ id, name: id, methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec: { ...s }, profile: starterProfile() });
// 1 PDF unit = 20 mm on both axes
const cal = verifyCalibration(buildCalibration({ horizontal: { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, knownMm: 2000 }, vertical: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 100 }, knownMm: 2000 } }).calibration,
  { p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 }, expectedMm: 1000 });
const wsBase = (over = {}) => ({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [{ id: "d", status: "current" }],
  calibrations: [{ ...cal, id: "cal", documentId: "d", pageIndex: 0, calibrationRevision: 1 }], materials: [mat("m1")], measurements: [], contributions: [], ...over });
const run = (id, mm) => ({ id, kind: "run", documentId: "d", pageIndex: 0, calibrationId: "cal", points: [{ x: 0, y: 0 }, { x: mm / 20, y: 0 }] });
const signed = (ws, cid) => computeWorkspace(ws).contributions.find((c) => c.contributionId === cid).sourceSignature;
const sched = (ws) => computeWorkspace(ws).scheduleLines.map((l) => `${l.quantity}×${l.finishedLengthMm}`).sort();

// ── F01 / A08: order line identity ───────────────────────────────────────────
function f01() {
  const ws = wsBase({ calibrations: [], documents: [], materials: [mat("m1"), mat("m2")],
    measurements: [{ id: "a", kind: "manual", quantity: 1, finishedLengthMm: 4600 }, { id: "b", kind: "manual", quantity: 1, finishedLengthMm: 4600 }],
    contributions: [{ id: "ca", measurementId: "a", jobMaterialId: "m1" }, { id: "cb", measurementId: "b", jobMaterialId: "m2" }] });
  const original = computeWorkspace(ws).scheduleLines[0];
  const lines = [{ bucketKey: original.bucketKey, specKey: original.specKey, jobMaterialId: "m1", finishedLengthMm: 4600, quantity: 1 }];
  return { ws, lines, original };
}
const exp = (ws, lines) => buildExportSnapshot({ wsSnapshot: ws, order: { orderRef: "FO-T", revision: 1, delivery: { method: "pickup", pickupBranch: "Synthetic branch", asap: true, contactPhone: "0400 000 000" } }, lines, supplier: { id: "s", name: "Synthetic supplier" }, company: { name: "Test", phone: "08 0000 0000" }, jobLabel: "Synthetic", rendererVersion: "t" });

t("F01 colour change on the line's material → line stale, order-ready blocked, PDF never prints the new colour against the old bucket", () => {
  const { ws, lines } = f01();
  assert.deepEqual(exp(ws, lines).problems, []);
  ws.materials[0].spec.colour = "Surfmist";
  const st = orderLineState(lines[0], computeWorkspace(ws), ws.materials);
  assert.equal(st.stale, true); assert.equal(st.problem, "line_stale_material");
  assert.ok(st.suggestion && st.suggestion.specKey === materialSpecKey(ws.materials[0]), "offers the bucket m1 now supplies");
  const out = exp(ws, lines);
  assert.ok(out.problems.some((p) => /material changed/.test(p)));
  for (const g of out.snapshot.groups) for (const l of g.lines) assert.ok(l.bucketKey.toLowerCase().includes(g.spec.colour.toLowerCase()), "printed spec = bucket spec");
  assert.equal(out.snapshot.groups[0].spec.colour, "Monument");
});
for (const [label, change] of [
  ["profile", (m) => { m.profile = { ...m.profile, segments: m.profile.segments.map((s, i) => (i ? s : { ...s, lengthMm: s.lengthMm + 5 })) }; }],
  ["BMT", (m) => { m.spec.bmt = 0.42; }],
  ["finish", (m) => { m.spec.finish = "COLORBOND Ultra"; }],
  ["perforation", (m) => { m.spec.construction = "perforated"; m.spec.perforation = { pattern: "round", holeSizeMm: 3, pitchMm: 6 }; }],
  ["coated face", (m) => { m.profile = { ...m.profile, coatedFace: m.profile.coatedFace === "left" ? "right" : "left" }; }],
]) {
  t(`F01 ${label} change also makes the saved line stale`, () => {
    const { ws, lines } = f01();
    change(ws.materials[0]);
    assert.equal(orderLineState(lines[0], computeWorkspace(ws), ws.materials).stale, true);
    assert.ok(exp(ws, lines).problems.length > 0);
  });
}
t("F01 source quantity drop below the line quantity → stale (quantity)", () => {
  const { ws, lines } = f01();
  lines[0].quantity = 2;
  ws.measurements[1].finishedLengthMm = 4500; // only m1's piece is left in the 4,600 bucket
  const st = orderLineState(lines[0], computeWorkspace(ws), ws.materials);
  assert.equal(st.problem, "line_stale_quantity");
});
t("F01 removed length → stale (missing), no PDF group invented", () => {
  const { ws, lines } = f01();
  ws.measurements[0].finishedLengthMm = 4700; ws.measurements[1].finishedLengthMm = 4700;
  const st = orderLineState(lines[0], computeWorkspace(ws), ws.materials);
  assert.equal(st.problem, "line_stale_missing");
  assert.equal(exp(ws, lines).snapshot.groups.length, 0);
});

t("R2 'Update to current material' on a 2-piece line shared by two identical flashings keeps BOTH pieces (1 old colour + 1 new)", () => {
  const { ws, original } = f01();
  const lines = [{ bucketKey: original.bucketKey, specKey: original.specKey, jobMaterialId: "m1", finishedLengthMm: 4600, quantity: 2 }];
  ws.materials[0].spec.colour = "Surfmist";
  const comp = computeWorkspace(ws);
  const st = orderLineState(lines[0], comp, ws.materials);
  const r = reconcileStaleLine({ [original.bucketKey]: 2 }, { [original.bucketKey]: "m1" }, { line: lines[0], ...st });
  assert.equal(Object.values(r.qty).reduce((a, b) => a + b, 0), 2, "no piece dropped");
  assert.equal(r.qty[original.bucketKey], 1); assert.equal(r.chosen[original.bucketKey], "m2");
  assert.equal(r.qty[st.suggestion.bucketKey], 1); assert.equal(r.chosen[st.suggestion.bucketKey], "m1");
});

// ── F04 / F06 / A07: material model ──────────────────────────────────────────
t("F04 unpainted ZINCALUME needs no colour; blank colour is not a problem; prints natural", () => {
  const z = mat("z", { product: "Flashing", finish: "ZINCALUME", bmt: 0.5, colour: "" });
  assert.deepEqual(materialProblems(z), []);
  assert.equal(normaliseSpec(z.spec).colourApplicable, false);
  assert.match(describeSpec(z.spec).line, /natural/);
});
t("F04 legacy 'N/A' colour on an unpainted finish maps to not-applicable; painted finish still needs a colour", () => {
  assert.equal(normaliseSpec({ finish: "Galvanised", bmt: 0.55, colour: "N/A" }).colour, null);
  assert.ok(materialProblems(mat("c", { product: "Flashing", finish: "COLORBOND", bmt: 0.55, colour: "" })).includes("material_incomplete"));
});
t("F06 solid and perforated never share a key; different hole sizes / zones never merge", () => {
  const solid = mat("s"), perf = mat("p", { ...spec, construction: "perforated", perforation: { pattern: "round", holeSizeMm: 3, pitchMm: 5 } });
  assert.notEqual(materialSpecKey(solid), materialSpecKey(perf));
  const perf2 = mat("p2", { ...perf.spec, perforation: { pattern: "round", holeSizeMm: 2.38, pitchMm: 5 } });
  assert.notEqual(materialSpecKey(perf), materialSpecKey(perf2));
  const legId = String(perf.profile.segments[0].id);
  const perf3 = mat("p3", { ...perf.spec, perforation: { ...perf.spec.perforation, extent: "selected_legs", legIds: [legId] } });
  assert.notEqual(materialSpecKey(perf), materialSpecKey(perf3));
});
t("F06 perforated needs a code or a full pattern + extent before ordering; 'perforated' alone is not order-ready", () => {
  assert.ok(specProblems({ ...spec, construction: "perforated" }).includes("perforation_incomplete"));
  assert.deepEqual(specProblems({ ...spec, construction: "perforated", perforation: { supplierProductCode: "PERF-1" } }), []);
  assert.ok(specProblems({ ...spec, construction: "perforated", perforation: { pattern: "round", holeSizeMm: 6, pitchMm: 5 } }).includes("perforation_incomplete"), "pitch must exceed hole");
  const p = starterProfile();
  assert.ok(specProblems({ ...spec, construction: "perforated", perforation: { pattern: "round", holeSizeMm: 3, pitchMm: 6, extent: "selected_legs", legIds: ["nope"] } }, p).includes("perforation_incomplete"));
  assert.match(describeSpec({ ...spec, construction: "perforated", perforation: { pattern: "round", holeSizeMm: 3, pitchMm: 6 } }, p).perforation, /round holes 3 mm @ 6 mm pitch · all legs/);
});
t("F06 invalid numbers rejected (never NaN/0 saved)", () => {
  assert.throws(() => normaliseSpec({ ...spec, construction: "perforated", perforation: { holeSizeMm: "abc" } }));
  assert.throws(() => normaliseSpec({ ...spec, bmt: -1 }));
});
t("02 dropdowns: sourced palettes (Bluegum in Classic, no Mangrove), unpainted has no palette, 0.55 is the company default", () => {
  assert.ok(PALETTES.classic.includes("Bluegum") && !PALETTES.classic.includes("Mangrove") && PALETTES.classic.length === 22);
  assert.equal(colourOptions("zincalume"), null);
  assert.equal(colourOptions("colorbond_matt").length, 6);
  assert.equal(thicknessOptions("colorbond")[0].value, 0.55);
  assert.match(thicknessOptions("colorbond")[0].note, /confirm/i);
});

t("R12 'Other / custom' needs a real description AND an explicit painted/unpainted answer; never prints 'natural' by default", () => {
  assert.ok(specProblems({ product: "Flashing", finishId: "other", finish: "Other / custom", bmt: 0.55, colour: "" }).includes("material_incomplete"));
  assert.ok(specProblems({ product: "Flashing", finish: "Other", bmt: 0.55, colour: "" }).includes("material_incomplete"), "R03 'Other' + blank colour stays incomplete");
  assert.ok(specProblems({ product: "Flashing", finishId: "other", finish: "Copper", bmt: 0.55 }).includes("material_incomplete"), "painted/unpainted not answered");
  assert.deepEqual(specProblems({ product: "Flashing", finishId: "other", finish: "Copper", bmt: 0.55, colourApplicable: false }), []);
  assert.match(describeSpec({ product: "Flashing", finishId: "other", finish: "Copper", bmt: 0.55 }).line, /painted or unpainted\?/);
});
t("R31 placeholder colour 'N/A' / 'none' on a painted finish is not a colour", () => {
  for (const c of ["N/A", "none", "n/a"]) assert.ok(specProblems({ ...spec, colour: c }).includes("material_incomplete"));
});
t("R27 perforated legs are keyed by leg POSITION: same ids on different physical legs never merge", () => {
  const a = mat("pa", { ...spec, construction: "perforated", perforation: { pattern: "round", holeSizeMm: 3, pitchMm: 6, extent: "selected_legs", legIds: ["x"] } });
  const b = mat("pb", { ...a.spec });
  a.profile = { ...a.profile, segments: a.profile.segments.map((sg, i) => ({ ...sg, id: i === 0 ? "x" : `a${i}` })) };
  b.profile = { ...b.profile, segments: b.profile.segments.map((sg, i) => ({ ...sg, id: i === 1 ? "x" : `b${i}` })) };
  assert.notEqual(materialSpecKey(a), materialSpecKey(b));
});
t("R29 open area outside 0–100 % is rejected", () => {
  for (const v of [-5, 0, 250]) assert.throws(() => normaliseSpec({ ...spec, construction: "perforated", perforation: { openAreaPct: v } }));
});

// ── F05 / F07 / A06: splits ──────────────────────────────────────────────────
const splitWs = (mm) => wsBase({ measurements: [run("r", mm)], contributions: [{ id: "k", measurementId: "r", jobMaterialId: "m1" }] });
t("A06 6,980 → 7,200 stays one flagged piece until split; 3,700 + 3,700 − 200 lap = 7,200", () => {
  const ws = splitWs(6980);
  const c = computeWorkspace(ws).contributions[0];
  assert.equal(c.result.finishedLengthMm, 7200); assert.equal(c.pieces.length, 1); assert.equal(c.pieces[0].handlingFlag, true);
  ws.contributions[0].split = { pieces: [3700, 3700], laps: [200], sourceFinishedMm: 7200, sourceSignature: signed(ws, "k") };
  const s = computeWorkspace(ws).contributions[0];
  assert.equal(s.split.valid, true); assert.equal(s.split.stale, false); assert.equal(s.split.coverageMm, 7200);
  assert.deepEqual(sched(ws), ["2×3700"]);
});
t("F05 source 6,980 → 6,990 (same 7,200 finished) makes the split stale", () => {
  const ws = splitWs(6980);
  ws.contributions[0].split = { pieces: [3700, 3700], laps: [200], sourceFinishedMm: 7200, sourceSignature: signed(ws, "k") };
  ws.measurements[0] = run("r", 6990);
  const c = computeWorkspace(ws).contributions[0];
  assert.equal(c.result.finishedLengthMm, 7200);
  assert.equal(c.split.stale, true);
  assert.ok(computeWorkspace(ws).scheduleLines.every((l) => l.problems.includes("split_stale")));
});
t("F05 a re-scale (new calibration) or a rule change that rounds the same also makes it stale", () => {
  const ws = splitWs(6980);
  ws.contributions[0].split = { pieces: [3700, 3700], laps: [200], sourceFinishedMm: 7200, sourceSignature: signed(ws, "k") };
  // a re-scale is a NEW calibration (immutable rows); the run reviewed onto it → stale even at the same scale
  const wsCal = structuredClone(ws); wsCal.calibrations.push({ ...wsCal.calibrations[0], id: "cal2", calibrationRevision: 2 }); wsCal.measurements[0].calibrationId = "cal2";
  assert.equal(computeWorkspace(wsCal).contributions[0].result.finishedLengthMm, 7200);
  assert.equal(computeWorkspace(wsCal).contributions[0].split.stale, true);
  const wsRule = structuredClone(ws); wsRule.materials[0].rules = { handlingThresholdMm: 6500 };
  assert.equal(computeWorkspace(wsRule).contributions[0].result.finishedLengthMm, 7200);
  assert.equal(computeWorkspace(wsRule).contributions[0].split.stale, true);
});
t("F07 manual 7,200 × 3: split ONE original → 2 × 7,200 + 2 × 3,700, no +200, no double count; remove split → 3 × 7,200", () => {
  const ws = wsBase({ measurements: [{ id: "m", kind: "manual", quantity: 3, finishedLengthMm: 7200 }], contributions: [{ id: "k", measurementId: "m", jobMaterialId: "m1" }] });
  assert.deepEqual(sched(ws), ["3×7200"]);
  ws.contributions[0].split = { pieces: [3700, 3700], laps: [200], sourceFinishedMm: 7200, originals: 1, sourceSignature: signed(ws, "k") };
  const c = computeWorkspace(ws).contributions[0];
  assert.equal(c.split.stale, false); assert.equal(c.split.valid, true);
  assert.deepEqual(sched(ws), ["2×3700", "2×7200"]);
  delete ws.contributions[0].split;
  assert.deepEqual(sched(ws), ["3×7200"]);
});
t("F07 count split: 2 of 3 counted 7,200s → 1 × 7,200 + 4 × 3,700; more originals than exist is invalid", () => {
  const ws = wsBase({ measurements: [{ id: "c", kind: "count", documentId: "d", pageIndex: 0, finishedLengthMm: 7200, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] }], contributions: [{ id: "k", measurementId: "c", jobMaterialId: "m1" }] });
  ws.contributions[0].split = { pieces: [3700, 3700], laps: [200], sourceFinishedMm: 7200, originals: 2, sourceSignature: signed(ws, "k") };
  assert.deepEqual(sched(ws), ["1×7200", "4×3700"]);
  ws.contributions[0].split.originals = 4;
  assert.equal(computeWorkspace(ws).contributions[0].split.valid, false);
});
t("A06 boundaries: exactly 6,000 not flagged; 9,100 blocks order-ready until split", () => {
  const ws = wsBase({ measurements: [{ id: "a", kind: "manual", quantity: 1, finishedLengthMm: 6000 }, { id: "b", kind: "manual", quantity: 1, finishedLengthMm: 9100 }],
    contributions: [{ id: "ka", measurementId: "a", jobMaterialId: "m1" }, { id: "kb", measurementId: "b", jobMaterialId: "m1" }] });
  const out = computeWorkspace(ws);
  assert.equal(out.scheduleLines.find((l) => l.finishedLengthMm === 6000).handlingFlag, false);
  assert.ok(out.scheduleLines.find((l) => l.finishedLengthMm === 9100).problems.includes("ceiling_exceeded"));
  assert.equal(out.orderReady, false);
});

t("R1 a split count cut below its split originals keeps the pieces WHOLE and flagged — nothing vanishes, not order-ready", () => {
  const ws = wsBase({ measurements: [{ id: "c", kind: "count", documentId: "d", pageIndex: 0, finishedLengthMm: 7200, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] }], contributions: [{ id: "k", measurementId: "c", jobMaterialId: "m1" }] });
  ws.contributions[0].split = { pieces: [3700, 3700], laps: [200], sourceFinishedMm: 7200, originals: 3, sourceSignature: signed(ws, "k") };
  assert.deepEqual(sched(ws), ["6×3700"]);
  ws.measurements[0].points.pop(); // one count mark deleted: 2 left, split was of 3
  const out = computeWorkspace(ws);
  assert.deepEqual(sched(ws), ["2×7200"]);
  assert.ok(out.scheduleLines[0].problems.includes("split_invalid"));
  assert.equal(out.orderReady, false);
});
t("R1 a measurement with no pieces (invalid run) is listed as unplaced and blocks ordering", () => {
  const ws = wsBase({ measurements: [run("a", 4321), { id: "bad", kind: "run", documentId: "d", pageIndex: 0, calibrationId: "missing", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }],
    contributions: [{ id: "ka", measurementId: "a", jobMaterialId: "m1" }, { id: "kb", measurementId: "bad", jobMaterialId: "m1" }] });
  const out = computeWorkspace(ws);
  assert.equal(out.unplaced.length, 1); assert.equal(out.orderReady, false);
});
t("R11 a split made in the same batch as its calibration is not stale (signature uses the calibration id)", () => {
  const ws = splitWs(6980);
  const sig = signed(ws, "k");
  ws.calibrations[0].calibrationRevision = 7; // revision assigned later by the database
  ws.contributions[0].split = { pieces: [3700, 3700], laps: [200], sourceFinishedMm: 7200, sourceSignature: sig };
  assert.equal(computeWorkspace(ws).contributions[0].split.stale, false);
});

t("R14 conflict rebase keeps ONLY the fields I changed: a colleague's profile edit survives my colour change", () => {
  const base = mat("m1");
  const theirs = { ...base, profile: { ...base.profile, segments: base.profile.segments.map((sg, i) => (i ? sg : { ...sg, lengthMm: 140 })) } };
  const mine = { ...base, spec: { ...base.spec, colour: "Surfmist" } };
  const out = rebaseRecord(mine, base, theirs);
  assert.equal(out.spec.colour, "Surfmist");
  assert.equal(out.profile.segments[0].lengthMm, 140);
  const mineBmt = { ...base, spec: { ...base.spec, bmt: 0.42 } }, theirsColour = { ...base, spec: { ...base.spec, colour: "Basalt" } };
  const merged = rebaseRecord(mineBmt, base, theirsColour);
  assert.equal(merged.spec.bmt, 0.42); assert.equal(merged.spec.colour, "Basalt");
});

// ── A05 arithmetic ───────────────────────────────────────────────────────────
t("A05 measured 4,321 → 4,600; 4,400 → 4,600 (no extra 100 at the boundary); two 4,321 runs → 2 × 4,600", () => {
  const ws = wsBase({ measurements: [run("a", 4321), run("b", 4321), run("c", 4400)], contributions: ["a", "b", "c"].map((id) => ({ id: `k${id}`, measurementId: id, jobMaterialId: "m1" })) });
  assert.deepEqual(sched(ws), ["3×4600"]);
});
t("A05 manual 4,321 × 2 stays 4,321 (no +200, no rounding); count 3 × 4,600 → 3 × 4,600; different lengths stay separate rows", () => {
  const ws = wsBase({ measurements: [{ id: "m", kind: "manual", quantity: 2, finishedLengthMm: 4321 }, { id: "c", kind: "count", documentId: "d", pageIndex: 0, finishedLengthMm: 4600, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] }],
    contributions: [{ id: "km", measurementId: "m", jobMaterialId: "m1" }, { id: "kc", measurementId: "c", jobMaterialId: "m1" }] });
  assert.deepEqual(sched(ws), ["2×4321", "3×4600"]);
});

// ── A09 plan-to-order arithmetic ─────────────────────────────────────────────
t("A09 2 × 4,321 runs + 6,980 run split 3,700/3,700 lap 200 + manual 2 × 3,000 → 6 pieces, 22,600 mm; second colour isolated", () => {
  const ws = wsBase({ materials: [mat("m1"), mat("m2", { ...spec, colour: "Surfmist" })],
    measurements: [run("a", 4321), run("b", 4321), run("l", 6980), { id: "m", kind: "manual", quantity: 2, finishedLengthMm: 3000 }, run("x", 4321)],
    contributions: [{ id: "ka", measurementId: "a", jobMaterialId: "m1" }, { id: "kb", measurementId: "b", jobMaterialId: "m1" }, { id: "kl", measurementId: "l", jobMaterialId: "m1" },
      { id: "km", measurementId: "m", jobMaterialId: "m1" }, { id: "kx", measurementId: "x", jobMaterialId: "m2" }] });
  ws.contributions[2].split = { pieces: [3700, 3700], laps: [200], sourceFinishedMm: 7200, sourceSignature: signed(ws, "kl") };
  const lines = computeWorkspace(ws).scheduleLines;
  const mono = lines.filter((l) => l.specKey === materialSpecKey(ws.materials[0]));
  assert.deepEqual(mono.map((l) => `${l.quantity}×${l.finishedLengthMm}`).sort(), ["2×3000", "2×3700", "2×4600"]);
  assert.equal(mono.reduce((a, l) => a + l.quantity, 0), 6);
  assert.equal(mono.reduce((a, l) => a + l.quantity * l.finishedLengthMm, 0), 22600);
  assert.ok(!mono.some((l) => l.finishedLengthMm === 7200), "original 7,200 not also counted");
  const surf = lines.filter((l) => l.specKey === materialSpecKey(ws.materials[1]));
  assert.deepEqual(surf.map((l) => `${l.quantity}×${l.finishedLengthMm}`), ["1×4600"]);
});

console.log(`takeoff-r04: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
