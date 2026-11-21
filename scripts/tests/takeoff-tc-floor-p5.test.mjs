// Floor frame, Phase 5 (floor_framing@1): Pryda spec guide rules (Sam, 21 Nov 2026). Plan: docs/takeoff/FLOOR_FRAMING_PLAN.md
//   node scripts/tests/takeoff-tc-floor-p5.test.mjs
// Source: Pryda "Specification Guide for Floor and Rafter Truss Systems" (April 2012), pages cited in shared/takeoff/engine/floor/*.js
import assert from "node:assert/strict";
import { buildCalibration, CALCULATION_VERSION, computeWorkspace, methodFor, buildSupplierGroups, floorFramingDefaults, FLOOR_FRAMING_RULES } from "../../shared/takeoff/index.js";
import { computeFloorFraming } from "../../shared/takeoff/engine/floor/framing.js";
import { layoutFloor, STRONGBACK_SPAN_RULE, strongbackSizeForDepth, TRIMMER_DEFAULT_SIZE, TRIMMER_SIZE_CHIPS, TRUSS_DEPTH_DEFAULT_MM } from "../../shared/takeoff/engine/floor/geometry.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 6).join("\n    ")}`); } }
const near = (a, b, eps = 0.01, what = "") => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} ≈ ${b}`);
const rect = (w, h, x = 0, y = 0) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const go = (outline, rules = {}, extra = {}) => computeFloorFraming({ materialId: "m", n: floorFramingDefaults(), rules: { ...FLOOR_FRAMING_RULES, ...rules }, outline, voids: [], wets: [], ...extra });
const fix = (r, key) => (r.layout.fixings || []).find((f) => f.key === key);
const codes = (r) => r.problems.map((p) => p.code);
const sumLen = (r, role) => r.demands.filter((d) => d.role === role).reduce((a, d) => a + d.lengthMm * d.quantity, 0);

// 1 ── strongback rows: three rows only OVER 6.0 m (Pryda p27)
t("1 strongback rows: 6.0 m spans one row, 6.2 m spans three; the rule is 3500 / 6000", () => {
  assert.deepEqual(STRONGBACK_SPAN_RULE, { noneMaxMm: 3500, oneMaxMm: 6000 });
  const rows = (span) => layoutFloor({ outline: rect(9000, span), rules: { centresMm: 600 } }).totals.strongbackRows;
  assert.equal(rows(6000), 1); assert.equal(rows(6200), 3); assert.equal(rows(3500), 0); assert.equal(rows(3600), 1);
});

// 2 ── truss depth 400 default; strongback 140x35 (Pryda Table 9)
t("2 truss depth defaults to 400 and the default strongback is 140 x 35; Table 9 sizes by depth", () => {
  assert.equal(TRUSS_DEPTH_DEFAULT_MM, 400);
  assert.equal(layoutFloor({ outline: rect(6000, 4200), rules: {} }).totals.trussDepthMm, 400);
  assert.deepEqual(floorFramingDefaults().components.strongback.section, { depthMm: 140, widthMm: 35 });
  assert.deepEqual([200, 250, 300, 355, 400].map(strongbackSizeForDepth), ["90x35", "120x35", "140x35", "140x35", "140x35"]);
  const r = go(rect(6000, 4200));
  assert.ok(r.demands.filter((d) => d.role === "floor strongback").every((d) => /140/.test(JSON.stringify(d.identity))), "strongbacks are 140 x 35");
  assert.ok(!codes(r).includes("floor_strongback_size_table"));
});
t("2 a chosen strongback size is kept (no Table 9 note when set by hand, a note when the saved size disagrees with the depth)", () => {
  const spec = floorFramingDefaults(); spec.components.strongback.section = { depthMm: 120, widthMm: 35 };
  const old = computeFloorFraming({ materialId: "m", n: spec, rules: { ...FLOOR_FRAMING_RULES }, outline: rect(6000, 4200), voids: [], wets: [] });
  assert.ok(old.demands.filter((d) => d.role === "floor strongback").every((d) => /120/.test(JSON.stringify(d.identity))), "saved 120 x 35 is still 120 x 35");
  assert.ok(codes(old).includes("floor_strongback_size_table") && old.problems.every((p) => p.code !== "floor_strongback_size_table" || p.blocking === false));
  const set = computeFloorFraming({ materialId: "m", n: spec, rules: { ...FLOOR_FRAMING_RULES, strongbackSizeSet: true }, outline: rect(6000, 4200), voids: [], wets: [] });
  assert.ok(!codes(set).includes("floor_strongback_size_table"));
});

// 3 ── stair beams
const stairVoid = (id = "v1") => ({ id, name: "Stair void 1", stair: true, points: rect(1000, 2400, 2500, 900) });
t("3 stair beams: default 400x63, chips 400x45 / 400x63, saved size kept, labelled stair beam", () => {
  assert.equal(TRIMMER_DEFAULT_SIZE, "400x63"); assert.deepEqual([...TRIMMER_SIZE_CHIPS], ["400x45", "400x63"]);
  const r = go(rect(6000, 4200), {}, { voids: [stairVoid()] });
  assert.ok(r.layout.trimmers.length === 4 && r.layout.trimmers.every((x) => x.size === "400x63"));
  const d = r.demands.find((x) => x.role === "floor trimmer");
  assert.match(d.label, /stair beam \(400x63\)/);
  const r2 = go(rect(6000, 4200), { trimmerSizes: { v1: "400x45" } }, { voids: [stairVoid()] });
  assert.ok(r2.layout.trimmers.every((x) => x.size === "400x45"));
  const r3 = go(rect(6000, 4200), { trimmerSizes: { v1: "445x63" } }, { voids: [stairVoid()] });   // a size saved before P5 is kept
  assert.ok(r3.layout.trimmers.every((x) => x.size === "445x63"));
});

// 4 ── strongback join lap: two truss spaces per join (Pryda p27)
t("4 a join laps two truss spaces: 9.0 x 4.2 at 600 -> each 9.0 m run becomes 9.0 + 1.2 = 10.2 m (6.0 + 4.2 pieces)", () => {
  // hand check: stock 6000, lap 2 x 600 = 1200; joins = ceil((9000 - 6000) / (6000 - 1200)) = 1; total 10200 = 6000 + 4200
  const r = go(rect(9000, 4200), { centresMm: 600 });
  assert.equal(r.layout.totals.strongbackJoins, 3);          // two end strongbacks + one mid row
  near(r.layout.totals.strongbackLapLm, 3.6);
  assert.equal(sumLen(r, "floor strongback"), 3 * 10200);
  assert.ok(r.demands.filter((d) => d.role === "floor strongback").every((d) => d.lengthMm === 6000 || d.lengthMm === 4200));
  const p = r.problems.find((x) => x.code === "floor_strongback_joined");
  assert.ok(p && /lapped two truss spaces \(1200 mm\)/.test(p.message) && !/No lap/.test(p.message));
  assert.ok(r.explain.some((x) => /Strongback joins: 3, each overlapped two truss spaces \(1200 mm\) = 3.6 lm extra/.test(x)));
  assert.equal(go(rect(6000, 4200)).layout.totals.strongbackJoins, 0);   // no join, no lap
});

// 5 ── fixings (worked examples hand-checked)
t("5a 6.0 x 4.2 at 450, no beams: 15 trusses, 30 wall-plate ends -> 60 skew + 60 end strongback + 15 x 3 mid-span = 165 nails; no brackets", () => {
  const r = go(rect(6000, 4200));
  assert.equal(r.layout.totals.trussCount, 15);
  assert.deepEqual([r.layout.trussEnds.plateEnds, r.layout.trussEnds.beamEnds, r.layout.trussEnds.stairBeamEnds], [30, 0, 0]);
  assert.equal(fix(r, "nail75").quantity, 60 + 60 + 45);
  assert.match(fix(r, "nail75").note, /60 skew nails.*60 end strongback.*45 mid-span strongbacks \(3 × 15 truss crossings at 400 deep/);
  assert.equal(fix(r, "bracket"), undefined); assert.equal(fix(r, "nail35"), undefined);
});
t("5b a beam on edge A: 15 brackets, 15 x (18 + 3) = 315 connector nails; the other edge keeps 15 plate ends -> 30 + 30 + 45 = 105 nails", () => {
  const r = go(rect(6000, 4200), { beams: { e0: "445x63" } });
  assert.deepEqual([r.layout.trussEnds.plateEnds, r.layout.trussEnds.beamEnds], [15, 15]);
  assert.equal(fix(r, "bracket").quantity, 15); assert.match(fix(r, "bracket").product, /FB94152/);
  assert.equal(fix(r, "nail35").quantity, 315); assert.match(fix(r, "nail35").note, /18 into the carrying beam \+ 3 into the truss/);
  assert.equal(fix(r, "nail75").quantity, 105);
  assert.equal(fix(r, "brace").quantity, 2);
});
t("5c a stair void interrupts 2 truss lines: 4 truss ends at the stair beams get brackets (4 x 21 = 84 nails); 13 crossings x 3 + 60 + 60 = 159 framing nails", () => {
  const r = go(rect(6000, 4200), {}, { voids: [stairVoid()] });
  assert.equal(r.layout.totals.trussCount, 17);
  assert.equal(r.layout.trussEnds.stairBeamEnds, 4); assert.equal(r.layout.trussEnds.plateEnds, 30);
  assert.equal(fix(r, "bracket").quantity, 4); assert.equal(fix(r, "nail35").quantity, 84);
  assert.equal(r.layout.totals.midCrossings, 13);
  assert.equal(fix(r, "nail75").quantity, 60 + 60 + 39);
});
t("5d mid-span nails by truss depth: 200 deep is 2 per crossing, 250 and over 3 (Table 9)", () => {
  assert.equal(fix(go(rect(6000, 4200), { trussDepthMm: 200 }), "nail75").quantity, 60 + 60 + 30);
  assert.equal(fix(go(rect(6000, 4200), { trussDepthMm: 250 }), "nail75").quantity, 60 + 60 + 45);
});

// 6 ── strap braces
t("6 end bracing: 2 strap braces per edge with an end strongback (two edges = 4), cut from a coil", () => {
  const r = go(rect(6000, 4200));
  assert.equal(fix(r, "brace").quantity, 4);
  assert.match(fix(r, "brace").product, /SB103 30 x 1\.0/); assert.match(fix(r, "brace").note, /cut from a coil, one diagonal at each end bay; 2\/3\.15 x 35 nails each end \(Pryda p29\)/);
  assert.equal(fix(go(rect(6000, 4200), { beams: { e0: "445x63", e2: "445x63" } }), "brace"), undefined);
});

// 7 ── long span note
t("7 a longest truss over 6,000 gives the non-blocking check-with-supplier note", () => {
  const n = (span) => go(rect(9000, span)).problems.find((p) => p.code === "floor_long_span");
  assert.equal(n(6000), undefined);
  const p = n(6200);
  assert.ok(p && p.blocking === false && p.message === "Spans over 6 m: check the truss depth and chords with the supplier.");
});

// 8 ── no ceiling under: lateral ties
t("8 no ceiling: rows = ceil(span / 3000) - 1 (min 1 over 3 m): 3000 -> 0, 3200 -> 1, 6000 -> 1, 6200 -> 2; off by default", () => {
  const rows = (span, on = true) => layoutFloor({ outline: rect(9000, span), rules: { centresMm: 600, noCeiling: on } }).totals.tieRows;
  assert.deepEqual([3000, 3200, 6000, 6200].map((s) => rows(s)), [0, 1, 1, 2]);
  assert.equal(rows(6200, false), 0);
  assert.equal(go(rect(6000, 4200)).demands.filter((d) => d.role === "floor tie").length, 0);
});
t("8 no ceiling: 9.0 x 6.2 at 600 -> 2 rows of 90 x 35 ties, 18 lm laid, 10.2 m each with the join lap", () => {
  const r = go(rect(9000, 6200), { centresMm: 600, noCeiling: true });
  near(r.layout.totals.tieLm, 18);
  assert.equal(sumLen(r, "floor tie"), 2 * 10200);
  assert.ok(r.demands.filter((d) => d.role === "floor tie").every((d) => /90/.test(JSON.stringify(d.identity)) && /35/.test(JSON.stringify(d.identity))));
  assert.ok(r.explain.some((x) => /No ceiling under: 2 rows of 90 x 35 lateral ties at 3,000 max centres = 18 lm/.test(x)));
});

// order level: headings, wet-area note
const k = 0.05, X0 = 100, Y0 = 100;
const cal = { id: "cal", documentId: "d", pageIndex: 0, ...buildCalibration({ basisRotation: 0, horizontal: { p1: { x: X0, y: Y0 - 40 }, p2: { x: X0 + 12000 * k, y: Y0 - 40 }, knownMm: 12000 }, vertical: { p1: { x: X0 - 40, y: Y0 }, p2: { x: X0 - 40, y: Y0 + 8000 * k }, knownMm: 8000 } }).calibration, status: "ready" };
const at = (p) => ({ x: X0 + p.x * k, y: Y0 + p.y * k });
const area = (id, pts, inputs) => ({ id, kind: "area", documentId: "d", pageIndex: 0, calibrationId: "cal", points: pts.map(at), inputs });
function order(measurements, rules = {}) {
  const spec = floorFramingDefaults(), mk = methodFor(spec);
  const mat = { id: "floor", name: "Floor", methodKey: mk.key, methodVersion: mk.version, spec, rules: { ...FLOOR_FRAMING_RULES, ...rules } };
  const c = computeWorkspace({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [{ id: "d", status: "current" }], calibrations: [cal],
    materials: [mat], measurements, contributions: measurements.map((m, i) => ({ id: `c${i}`, measurementId: m.id, jobMaterialId: "floor", role: "primary" })) });
  const groups = buildSupplierGroups([{ lines: c.scheduleLines.filter((l) => l.roles).map((l) => ({ unit: l.unit, quantity: l.quantity, stockLengthMm: l.item.stockLengthMm, roles: l.roles, product: l.product || null, description: l.item.description, acc: l.item?.acc || null, note: l.item?.note || null, problem: l.problems.length > 0 })) }]);
  return { c, groups, res: c.materialResults.floor };
}
const floorM = area("f1", rect(6000, 4200), { role: "floor", kind: "rect" });
t("order: FLOOR FIXINGS heading after the flooring groups, one row per product with its basis note, counts as EA", () => {
  const { groups, res } = order([floorM], { beams: { e0: "445x63" } });
  assert.equal(res.status.quantity, "calculated", JSON.stringify(res.problems.filter((p) => p.blocking)));
  assert.deepEqual(groups.map((g) => g.heading), ["FLOOR TRUSSES", "STRONGBACKS", "BEAMS", "FLOORING", "FLOORING ACCESSORIES", "FLOOR FIXINGS"]);
  const g = groups.find((x) => x.heading === "FLOOR FIXINGS");
  assert.deepEqual(g.rows.map((r) => [r.unit, r.quantity]).sort(), [["EA", 105], ["EA", 15], ["EA", 2], ["EA", 315]].sort());
  assert.ok(g.rows.every((r) => r.accessory && r.note));
});
t("order: wet areas add a note on the FLOOR TRUSSES heading, no quantity change", () => {
  const wet = area("w1", rect(2400, 1800, 600, 600), { role: "wet", kind: "rect", name: "Bathroom" });
  const a = order([floorM, wet]), b = order([floorM]);
  const g = a.groups.find((x) => x.heading === "FLOOR TRUSSES");
  assert.equal(g.note, "Wet areas: set-down trusses 355 deep (45 mm set-down) — Bathroom");
  assert.equal(b.groups.find((x) => x.heading === "FLOOR TRUSSES").note, undefined);
  assert.deepEqual(a.groups.find((x) => x.heading === "FLOOR TRUSSES").rows, b.groups.find((x) => x.heading === "FLOOR TRUSSES").rows);
});
t("version: takeoff-calc@14", () => { assert.match(CALCULATION_VERSION, /^takeoff-calc@14$/); });

console.log(`takeoff-tc-floor-p5: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
