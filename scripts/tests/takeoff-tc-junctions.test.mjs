// Wall junctions (T / L / X) from where traced walls start and finish. Plan: docs/takeoff/WALL_JUNCTIONS_PLAN.md
//   node scripts/tests/takeoff-tc-junctions.test.mjs
import assert from "node:assert/strict";
import { buildCalibration, computeWorkspace, methodFor, wallFramingDefaults, WALL_FRAMING_RULES, buildSupplierGroups } from "../../shared/takeoff/index.js";
import { findJunctions } from "../../shared/takeoff/engine/junctions.js";
import { junctionText, wallFramingText, wallFramingTotals } from "../../src/components/takeoff/measure/tools.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 3).join("\n    ")}`); } }
const near = (a, b, eps = 0.11, what = "") => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} ≈ ${b}`);
const O = { thicknessMm: 90, studWidthMm: 45 };
const W = (id, ax, ay, bx, by) => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by } });

// ── pure geometry ────────────────────────────────────────────────────────────────────────────────────────────
t("T: the end of a wall on another's run, studs against the butting wall's two faces", () => {
  const r = findJunctions([W("A", 0, 0, 6000, 0), W("B", 3000, 0, 3000, 4000)], O);
  assert.equal(r.junctions.length, 1);
  const j = r.junctions[0];
  assert.equal(j.continuousId, "A"); assert.equal(j.buttingId, "B"); assert.equal(j.id, "B:0@A");
  near(j.stationMm, 3000); near(j.halfSpanMm, 45);
  near(j.studsAtMm[0], 3000 - 67.5); near(j.studsAtMm[1], 3000 + 67.5);   // stud faces on the butting wall's faces
  assert.equal(r.corners.length, 0);
});
t("walls traced in either direction find the same junction", () => {
  const a = findJunctions([W("A", 0, 0, 6000, 0), W("B", 3000, 0, 3000, 4000)], O).junctions[0];
  const b = findJunctions([W("A", 6000, 0, 0, 0), W("B", 3000, 4000, 3000, 0)], O).junctions[0];
  assert.equal(b.id, "B:1@A"); assert.equal(b.continuousId, "A");
  near(b.stationMm, 3000);                                  // stations run from THAT wall's own first point
  near(b.studsAtMm[0], 3000 - 67.5); near(b.studsAtMm[1], 3000 + 67.5);
  near(a.stationMm, 3000);
});
t("tolerance: an end traced to the wall's face (45 off the centreline) meets; 200 off does not", () => {
  assert.equal(findJunctions([W("A", 0, 0, 6000, 0), W("B", 3000, 45, 3000, 4000)], O).junctions.length, 1);
  assert.equal(findJunctions([W("A", 0, 0, 6000, 0), W("B", 3000, 200, 3000, 4000)], O).junctions.length, 0);
  assert.equal(findJunctions([W("A", 0, 0, 6000, 0), W("B", 3000, 200, 3000, 4000)], { ...O, toleranceMm: 250 }).junctions.length, 1);
});
t("angled wall: the faces spread along the continuous wall by thickness / 2 / sin(angle)", () => {
  const r = findJunctions([W("A", 0, 0, 6000, 0), W("B", 3000, 0, 3000 + 2000, 2000)], O);   // 45 degrees
  const j = r.junctions[0];
  near(j.angleDeg, 45); near(j.halfSpanMm, 45 / Math.sin(Math.PI / 4), 0.2);
  near(j.studsAtMm[1] - j.stationMm, j.halfSpanMm + 22.5, 0.2);
});
t("near-parallel walls are not a junction", () => {
  assert.equal(findJunctions([W("A", 0, 0, 6000, 0), W("B", 3000, 0, 5000, 300)], O).junctions.length, 0);
});
t("L corner (ends meeting ends): reported, never a T", () => {
  const r = findJunctions([W("A", 0, 0, 5000, 0), W("B", 5000, 0, 5000, 4000)], O);
  assert.equal(r.junctions.length, 0); assert.equal(r.corners.length, 1); assert.deepEqual(r.corners[0].wallIds.sort(), ["A", "B"]);
});
t("a wall end within the tolerance of the other wall's END is a corner, not a T", () => {
  const r = findJunctions([W("A", 0, 0, 5000, 0), W("B", 4950, 30, 4950, 4000)], O);
  assert.equal(r.junctions.length, 0); assert.equal(r.corners.length, 1);
});
t("continuous wall traced in two collinear legs: a T on their join gives studs on both legs", () => {
  const r = findJunctions([W("A1", 0, 0, 3000, 0), W("A2", 3000, 0, 6000, 0), W("B", 3000, 0, 3000, 4000)], O);
  assert.equal(r.junctions.length, 2); assert.equal(r.corners.length, 0);
  const a1 = r.junctions.find((j) => j.continuousId === "A1"), a2 = r.junctions.find((j) => j.continuousId === "A2");
  assert.ok(a1.split && a2.split);
  near(a1.studsAtMm[0], 3000 - 67.5);          // the left stud is on leg 1 (the right one falls past its end)
  near(a2.studsAtMm[1] , 67.5);                // the right stud is on leg 2
});
t("X crossing is flagged, never a T", () => {
  const r = findJunctions([W("A", 0, 0, 6000, 0), W("B", 3000, -2000, 3000, 2000)], O);
  assert.equal(r.junctions.length, 0); assert.equal(r.crossings.length, 1);
});
t("a wall butting at each end (between two walls) gives a junction at both", () => {
  const r = findJunctions([W("A", 0, 0, 0, 5000), W("C", 4000, 0, 4000, 5000), W("B", 0, 2500, 4000, 2500)], O);
  assert.equal(r.junctions.length, 2); assert.deepEqual(r.junctions.map((j) => j.continuousId).sort(), ["A", "C"]);
});
t("different calibration groups are never compared (caller groups by page and scale)", () => {
  assert.equal(findJunctions([W("A", 0, 0, 6000, 0)], O).junctions.length, 0);
});

// ── through the real engine ──────────────────────────────────────────────────────────────────────────────────
const k = 0.05, X0 = 100, Y0 = 100;
const H = { p1: { x: X0, y: Y0 - 40 }, p2: { x: X0 + 12000 * k, y: Y0 - 40 }, knownMm: 12000 };
const V = { p1: { x: X0 - 40, y: Y0 }, p2: { x: X0 - 40, y: Y0 + 8000 * k }, knownMm: 8000 };
const cal = { id: "cal", documentId: "d", pageIndex: 0, ...buildCalibration({ basisRotation: 0, horizontal: H, vertical: V }).calibration, status: "ready" };
const at = (x, y) => ({ x: X0 + x * k, y: Y0 + y * k });
const wall = (id, a, b, h, name) => ({ id, kind: "wall", documentId: "d", pageIndex: 0, calibrationId: "cal", points: [at(...a), at(...b)], inputs: { kind: "rect", heightMm: h, name } });
function run(measurements, rules = {}) {
  const spec = wallFramingDefaults([]);
  spec.components.studs = { ...spec.components.studs, section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", stock: { maxMm: null, unavailableMm: [] } };
  spec.components.noggins = { ...spec.components.noggins, stock: { maxMm: null, unavailableMm: [] } };
  const mk = methodFor(spec);
  const mat = { id: "walls", name: "Walls", methodKey: mk.key, methodVersion: mk.version, spec, rules: { ...WALL_FRAMING_RULES, carriesRoof: true, ...rules } };
  const c = computeWorkspace({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [{ id: "d", status: "current" }], calibrations: [cal],
    materials: [mat], measurements, contributions: measurements.map((m, i) => ({ id: `c${i}`, measurementId: m.id, jobMaterialId: "walls", role: "wall" })) });
  const res = c.materialResults.walls;
  const lay = (id) => res.layouts.find((l) => l.wallMeasurementId === id);
  return { c, res, lay };
}
const A = () => wall("a", [0, 0], [6000, 0], 2700, "Wall 1");
const B = (h = 2700) => wall("b", [3000, 0], [3000, 3000], h, "Wall 2");

t("engine: a T adds two junction studs to the continuous wall only, as their own ticks and demands", () => {
  const { res, lay } = run([A(), B()]);
  const la = lay("a"), lb = lay("b");
  assert.equal(la.totals.junctionStuds, 2); assert.ok(!lb.totals.junctionStuds);
  const jt = la.ticks.filter((x) => x.state === "junction");
  assert.deepEqual(jt.map((x) => x.positionMm), [2932.5, 3067.5]);
  const jd = res.demands.filter((d) => d.role === "junction stud");
  assert.equal(jd.length, 2); assert.ok(jd.every((d) => d.lengthMm === 2700));
  assert.equal(la.junctions[0].buttingLabel, "Wall 2");
  // regular studs unchanged: same count with and without the junction
  const base = run([A()]).lay("a").totals.studs;
  assert.equal(la.totals.studs, base);
});
t("engine: junction studs print under JUNCT. BLK, apart from STUDS", () => {
  const { c } = run([A(), B()]);
  const groups = buildSupplierGroups([{ lines: c.scheduleLines.filter((l) => l.roles).map((l) => ({ unit: l.unit, quantity: l.quantity, stockLengthMm: l.item.stockLengthMm, roles: l.roles, product: l.product || null, hoop: l.hoop || null })) }]);
  const jb = groups.find((g) => g.heading === "JUNCT. BLK");
  assert.ok(jb, JSON.stringify(groups.map((g) => g.heading)));
  assert.equal(jb.rows.reduce((a, r) => a + (r.cuts || []).reduce((s, x) => s + x.count, 0) + (r.quantity || 0), 0), 2);
});
t("engine: a different height on the butting wall never changes the continuous wall's stud cut", () => {
  const { res } = run([A(), B(3300)]);
  const jd = res.demands.filter((d) => d.role === "junction stud");
  assert.ok(jd.every((d) => d.lengthMm === 2700));
});
t("engine: a junction stud within one stud width of a counted stud is merged, not doubled", () => {
  // butting wall at 600 centres' grid: station 600 -> studs would be 532.5 / 667.5; the stud at 600 serves both? 600 is within 45 of neither (67.5 away) so both added.
  // at 1170 the faces are 1102.5 / 1237.5; the grid stud at 1200 is 37.5 from 1237.5: merged
  const b = wall("b", [1170, 0], [1170, 3000], 2700, "Wall 2");
  const la = run([A(), b]).lay("a");
  assert.equal(la.totals.junctionStuds, 1);
  assert.equal(la.junctions[0].studs[1].state, "merged"); assert.equal(la.junctions[0].studs[1].mergedWithMm, 1200);
});
t("engine: a junction stud inside an opening is not counted", () => {
  const a = A();
  const opening = { id: "o1", kind: "opening", parentId: "a", documentId: null, pageIndex: null, calibrationId: null, points: null, inputs: { type: "window", label: "W1", xMm: 2500, sillMm: 900, widthMm: 1200, heightMm: 1200 } };
  const run2 = run([a, B(), opening]);
  const la = run2.lay("a");
  assert.ok(!la.totals.junctionStuds);
  assert.ok(la.junctions[0].studs.every((s) => s.state === "inOpening"));
});
t("engine: moving the butting wall moves the junction studs (nothing stored)", () => {
  const b = wall("b", [4200, 0], [4200, 3000], 2700, "Wall 2");
  const la = run([A(), b]).lay("a");
  assert.deepEqual(la.ticks.filter((x) => x.state === "junction").map((x) => x.positionMm).sort((p, q) => p - q), [4132.5, 4267.5]);
  near(la.junctions[0].stationMm, 4200);
});
t("engine: manual removal per junction, and the switch for the whole item", () => {
  const off = run([A(), B()], { junctionsOff: ["b:0"] });
  assert.ok(!off.lay("a").totals.junctionStuds); assert.equal(off.lay("a").junctions[0].off, true);
  assert.match(junctionText(off.lay("a").junctions[0]), /removed by hand/);
  const none = run([A(), B()], { junctionStuds: false });
  assert.ok(!none.lay("a").totals.junctionStuds); assert.equal(none.lay("a").junctions.length, 0);
});
t("engine: an L corner adds nothing; an X crossing says so in a note and adds nothing", () => {
  const l = run([A(), wall("b", [6000, 0], [6000, 3000], 2700, "Wall 2")]);
  assert.ok(!l.lay("a").totals.junctionStuds); assert.ok(!l.lay("b").totals.junctionStuds); assert.equal(l.lay("a").junctionCorners, 1);
  const x = run([A(), wall("b", [3000, -1500], [3000, 1500], 2700, "Wall 2")]);
  assert.ok(!x.lay("a").totals.junctionStuds);
  assert.ok(x.res.problems.some((p) => p.code === "wall_crossing" && p.blocking === false));
});
t("engine: the Walls line says junction studs apart from the counted studs", () => {
  const { res } = run([A(), B()]);
  assert.match(wallFramingText(wallFramingTotals(res)), /studs at 2,700 \+ 2 junction studs/);
  const none = run([A()]);
  assert.doesNotMatch(wallFramingText(wallFramingTotals(none.res)), /junction/);
});
t("engine: walls with no plan points (typed) never form junctions", () => {
  const typed = (id, w) => ({ id, kind: "wall", inputs: { kind: "rect", widthMm: w, heightMm: 2700, name: id } });
  assert.ok(!run([typed("a", 6000), typed("b", 3000)]).lay("a").totals.junctionStuds);
});

console.log(`takeoff-tc-junctions: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
