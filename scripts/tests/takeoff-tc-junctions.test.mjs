// Wall junctions (T / L / X) from where traced walls start and finish. Plan: docs/takeoff/WALL_JUNCTIONS_PLAN.md
//   node scripts/tests/takeoff-tc-junctions.test.mjs
import assert from "node:assert/strict";
import { buildCalibration, CALCULATION_VERSION, computeWorkspace, methodFor, wallFramingDefaults, WALL_FRAMING_RULES, buildSupplierGroups } from "../../shared/takeoff/index.js";
import { blockCentresFor, blockCountFor, findJunctions, overrideKeyWallIds } from "../../shared/takeoff/engine/junctions.js";
import { cornerText, junctionText, wallFramingNotes, wallFramingText, wallFramingTotals } from "../../src/components/takeoff/measure/tools.js";

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
const calOf = (id, scale = 1) => ({ id, documentId: "d", pageIndex: 0, ...buildCalibration({ basisRotation: 0, horizontal: { ...H, knownMm: H.knownMm * scale }, vertical: { ...V, knownMm: V.knownMm * scale } }).calibration, status: "ready" });
function run(measurements, rules = {}, cals = [cal]) {
  const spec = wallFramingDefaults([]);
  spec.components.studs = { ...spec.components.studs, section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", stock: { maxMm: null, unavailableMm: [] } };
  spec.components.noggins = { ...spec.components.noggins, stock: { maxMm: null, unavailableMm: [] } };
  const mk = methodFor(spec);
  const mat = { id: "walls", name: "Walls", methodKey: mk.key, methodVersion: mk.version, spec, rules: { ...WALL_FRAMING_RULES, carriesRoof: true, ...rules } };
  const c = computeWorkspace({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [{ id: "d", status: "current" }], calibrations: cals,
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
  // the grid stud at 3,000 stands in the space between the pair: the pair replaces it (one regular stud fewer)
  const base = run([A()]).lay("a").totals.studs;
  assert.equal(la.totals.studs, base - 1);
  assert.ok(!la.ticks.some((x) => x.state !== "junction" && x.positionMm === 3000));
});
t("engine: junction studs print under JUNCT. BLK, apart from STUDS", () => {
  const { c } = run([A(), B()]);
  const groups = buildSupplierGroups([{ lines: c.scheduleLines.filter((l) => l.roles).map((l) => ({ unit: l.unit, quantity: l.quantity, stockLengthMm: l.item.stockLengthMm, roles: l.roles, product: l.product || null, hoop: l.hoop || null })) }]);
  const jb = groups.find((g) => g.heading === "JUNCT. BLK");
  assert.ok(jb, JSON.stringify(groups.map((g) => g.heading)));
  // the 2 junction studs and the junction blocks (one 1,800 length: 6 x 300) are both JUNCT. BLK; STUDS holds only the counted studs
  assert.equal(jb.rows.reduce((a, r) => a + (r.cuts || []).reduce((s, x) => s + x.count, 0) + (r.quantity || 0), 0), 3);
  assert.ok(jb.rows.some((r) => (r.cuts || []).some((x) => x.lengthMm === 1800)), JSON.stringify(jb.rows));
});
t("engine: a different height on the butting wall never changes the continuous wall's stud cut", () => {
  const { res } = run([A(), B(3300)]);
  const jd = res.demands.filter((d) => d.role === "junction stud");
  assert.ok(jd.every((d) => d.lengthMm === 2700));
});
t("engine: a junction stud within one stud width of a counted stud is merged, not doubled", () => {
  // butting wall at 600 centres' grid: station 600 -> studs would be 532.5 / 667.5; the stud at 600 serves both? 600 is within 45 of neither (67.5 away) so both added.
  // at 1130 the junction studs are 1062.5 / 1197.5; the grid stud at 1200 is 2.5 from 1197.5 and outside the space: merged
  const b = wall("b", [1130, 0], [1130, 3000], 2700, "Wall 2");
  const la = run([A(), b]).lay("a");
  assert.equal(la.totals.junctionStuds, 1);
  assert.equal(la.junctions[0].studs[1].state, "merged"); assert.equal(la.junctions[0].studs[1].mergedWithMm, 1200);
});
t("engine: a grid stud in the space between a junction pair is replaced by the pair; noggins run to the junction studs", () => {
  const la = run([A(), B()]).lay("a");
  assert.deepEqual(la.noggins.bays.filter((b) => !b.openingId && b.fromMm >= 2400 && b.toMm <= 3600).map((b) => [b.fromMm, b.toMm]), [[2400, 2932.5], [3067.5, 3600]]);
});
t("engine: a wall traced in two legs framed like one wall: same studs and noggin bays as the single wall", () => {
  const single = run([A(), B()]);
  const l1 = wall("a1", [0, 0], [3000, 0], 2700, "Wall 1"), l2 = wall("a2", [3000, 0], [6000, 0], 2700, "Wall 1b");
  const two = run([l1, l2, B()]);
  const noggins = (r) => r.res.demands.filter((d) => d.role === "noggin").length;
  assert.equal(noggins(two), noggins(single));
  assert.equal(two.res.demands.filter((d) => d.role === "stud" || d.role === "junction stud").length, single.res.demands.filter((d) => d.role === "stud" || d.role === "junction stud").length);
});
t("engine: an old override key naming just the butting end still removes a single junction", () => {
  const la = run([A(), B()], { junctionsOff: ["b:0"] }).lay("a");
  assert.ok(!la.totals.junctionStuds); assert.ok(la.junctions[0].off);
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
  const off = run([A(), B()], { junctionsOff: ["b:0@a"] });
  assert.ok(!off.lay("a").totals.junctionStuds); assert.equal(off.lay("a").junctions[0].off, true);
  assert.match(junctionText(off.lay("a").junctions[0]), /removed by hand/);
  const none = run([A(), B()], { junctionStuds: false });
  assert.ok(!none.lay("a").totals.junctionStuds); assert.equal(none.lay("a").junctions.length, 0);
});
t("engine: an L corner adds no junction studs; an X crossing says so in a note and adds nothing", () => {
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


// ── owner rules, 18 Nov 2026 ─────────────────────────────────────────────────────────────────────────────────
const sumOf = (r, ids, f) => ids.reduce((a, id) => a + (f(r.lay(id)) || 0), 0);
const posOf = (la, state) => la.ticks.filter((x) => x.state === state).map((x) => x.positionMm);

// A: junction blocks
t("blocks: 2 x ceil(height / 900) per junction: 6 at 2.4 and 2.7 m, 8 at 3.0 m", () => {
  assert.equal(blockCountFor(2400), 6); assert.equal(blockCountFor(2700), 6); assert.equal(blockCountFor(3000), 8); assert.equal(blockCountFor(3300), 8); assert.equal(blockCountFor(3600), 8);
  for (const [h, n] of [[2400, 6], [2700, 6], [3000, 8]]) {
    const r = run([wall("a", [0, 0], [6000, 0], h, "Wall 1"), B()]);
    const la = r.lay("a");
    assert.equal(la.totals.junctionBlocks, n, `height ${h}`);
    assert.equal(la.junctions[0].blocks.count, n); assert.equal(la.junctions[0].blocks.lengthMm, 300);
    // one length per junction, n x 300 mm: 1,800 / 1,800 / 2,400
    const bd = r.res.demands.filter((d) => d.role === "junction block");
    assert.equal(bd.length, 1); assert.equal(bd[0].lengthMm, n * 300);
    assert.match(bd[0].label, new RegExp(`${n} x 300`));
  }
  assert.ok(blockCentresFor(2700).every((c, i, all) => i === 0 || c - all[i - 1] <= 900 + 1e-6));
  assert.equal(blockCentresFor(3000).length, 4);
});
t("blocks: only on the continuous wall, between the junction studs, and not for a junction that is removed", () => {
  const r = run([A(), B()]);
  assert.ok(!r.lay("b").totals.junctionBlocks);
  const bk = r.lay("a").junctions[0].blocks;
  near(bk.xLeftMm, 3000 - 45); near(bk.xRightMm, 3000 + 45);          // the 90 mm space between the two junction studs
  assert.equal(r.lay("a").junctions[0].studs.length, 2);
  const off = run([A(), B()], { junctionsOff: ["b:0@a"] });
  assert.ok(!off.lay("a").totals.junctionBlocks); assert.equal(off.res.demands.filter((d) => d.role === "junction block").length, 0);
  assert.match(junctionText(r.lay("a").junctions[0]), /6 blocks \(3 pairs of 300 mm\)/);
});
t("blocks: print under JUNCT. BLK as a cut length rolled into a stock length, with the junction studs (6 x 0.3 = 1.8 m)", () => {
  const { c } = run([A(), B()]);
  const jb = buildSupplierGroups([{ lines: c.scheduleLines.filter((l) => l.roles).map((l) => ({ unit: l.unit, quantity: l.quantity, stockLengthMm: l.item.stockLengthMm, roles: l.roles, product: l.product || null, hoop: l.hoop || null })) }]).find((g) => g.heading === "JUNCT. BLK");
  const cuts = jb.rows.flatMap((r) => r.cuts || []);
  assert.deepEqual(cuts.map((x) => [x.count, x.lengthMm]).sort((p, q) => q[1] - p[1]), [[2, 2700], [1, 1800]]);
  assert.ok(jb.rows.some((r) => /1\/1\.8/.test(r.cutText)));
  assert.equal(jb.totalLm, 7.2);                                       // 2 x 2.7 + 1.8
});
t("blocks: a junction whose studs both fall in an opening has no blocks", () => {
  const opening = { id: "o1", kind: "opening", parentId: "a", documentId: null, pageIndex: null, calibrationId: null, points: null, inputs: { type: "window", label: "W1", xMm: 2500, sillMm: 900, widthMm: 1200, heightMm: 1200 } };
  assert.ok(!run([A(), B(), opening]).lay("a").totals.junctionBlocks);
});
t("blocks: shown on the elevation between the junction studs at their heights (rect elements in layout, one per pair)", () => {
  const bk = run([A(), B()]).lay("a").junctions[0].blocks;
  assert.equal(bk.centresMm.length, 3); assert.equal(bk.counted, true);
  assert.ok(bk.centresMm.every((c) => c - 150 >= 0 && c + 150 <= 2700));
});

// B: corners
const L1 = (h = 2700) => wall("a", [0, 0], [5000, 0], h, "Wall 1");       // ENDS at (5000, 0)
const L2 = (h = 2700) => wall("b", [5000, 0], [5000, 3000], h, "Wall 2");  // STARTS at (5000, 0)
t("corner: the wall that STARTS at the corner gets the second stud at 112.5; the wall that ENDS has its normal end stud only (3 in all)", () => {
  const r = run([L1(), L2()]);
  const base = (id, m) => run([m]).lay(id).totals.studs;
  assert.equal(r.lay("a").totals.studs, base("a", L1()));
  assert.equal(r.lay("b").totals.studs, base("b", L2()) + 1);
  assert.deepEqual(posOf(r.lay("b"), "corner"), [112.5]);
  assert.deepEqual(posOf(r.lay("a"), "corner"), []);
  assert.equal(r.lay("b").totals.cornerStuds, 1);
  assert.equal(r.res.demands.filter((d) => /corner stud/i.test(d.label)).length, 1);
  assert.equal(r.res.demands.filter((d) => /corner stud/i.test(d.label))[0].lengthMm, 2700);
  assert.equal(r.lay("b").corners[0].why, "starts"); assert.equal(r.lay("b").corners[0].hasStud, true); assert.equal(r.lay("a").corners[0].hasStud, false);
});
t("corner: the second stud prints under STUDS (a full stud at the wall's height), not JUNCT. BLK", () => {
  const { c } = run([L1(), L2()]);
  const groups = buildSupplierGroups([{ lines: c.scheduleLines.filter((l) => l.roles).map((l) => ({ unit: l.unit, quantity: l.quantity, stockLengthMm: l.item.stockLengthMm, roles: l.roles, product: l.product || null, hoop: l.hoop || null })) }]);
  assert.ok(!groups.find((g) => g.heading === "JUNCT. BLK"));
});
t("corner: wall traced the other way round (the other wall starts): the second stud moves with the direction", () => {
  const r = run([wall("a", [5000, 0], [0, 0], 2700, "Wall 1"), wall("b", [5000, 0], [5000, 3000], 2700, "Wall 2")]);   // both START at the corner: longer (a) takes it
  assert.deepEqual(posOf(r.lay("a"), "corner"), [112.5]); assert.deepEqual(posOf(r.lay("b"), "corner"), []);
  const r2 = run([wall("a", [0, 0], [5000, 0], 2700, "Wall 1"), wall("b", [5000, 3000], [5000, 0], 2700, "Wall 2")]);   // both END: the longer (a, 5,000) again
  assert.deepEqual(posOf(r2.lay("a"), "corner"), [5000 - 112.5]); assert.deepEqual(posOf(r2.lay("b"), "corner"), []);
});
t("corner: both walls START at it or both END at it: the LONGER wall gets the 2 studs (either way round)", () => {
  const start = (la, lb) => run([wall("a", [0, 0], [la, 0], 2700, "Wall 1"), wall("b", [0, 0], [0, lb], 2700, "Wall 2")]);
  assert.deepEqual(posOf(start(6000, 3000).lay("a"), "corner"), [112.5]); assert.deepEqual(posOf(start(6000, 3000).lay("b"), "corner"), []);
  assert.deepEqual(posOf(start(3000, 6000).lay("b"), "corner"), [112.5]); assert.deepEqual(posOf(start(3000, 6000).lay("a"), "corner"), []);
  const end = (la, lb) => run([wall("a", [6000 - la, 0], [6000, 0], 2700, "Wall 1"), wall("b", [6000, lb], [6000, 0], 2700, "Wall 2")]);
  assert.deepEqual(posOf(end(5000, 3000).lay("a"), "corner"), [5000 - 112.5]); assert.deepEqual(posOf(end(5000, 3000).lay("b"), "corner"), []);
  assert.deepEqual(posOf(end(3000, 5000).lay("b"), "corner"), [5000 - 112.5]); assert.deepEqual(posOf(end(3000, 5000).lay("a"), "corner"), []);
});
t("corner: the per-corner swap hands the second stud to the other wall, keyed by corner (not a wall)", () => {
  const first = run([L1(), L2()]);
  const id = first.lay("b").corners[0].id;
  assert.equal(id, first.lay("a").corners[0].id);
  const sw = run([L1(), L2()], { cornersSwapped: [id] });
  assert.deepEqual(posOf(sw.lay("a"), "corner"), [5000 - 112.5]); assert.deepEqual(posOf(sw.lay("b"), "corner"), []);
  assert.equal(sw.lay("a").corners[0].swapped, true);
  assert.match(cornerText(sw.lay("a").corners[0], "this wall"), /swapped by hand/);
  // a key for a wall that no longer exists matches nothing and changes nothing
  const stale = run([L1(), L2()], { cornersSwapped: ["corner:gone:0|gone2:1"] });
  assert.deepEqual(posOf(stale.lay("b"), "corner"), [112.5]);
});
t("corner: a collinear join is NOT a corner (no extra stud, not reported)", () => {
  const r = run([wall("a", [0, 0], [3000, 0], 2700, "Wall 1"), wall("b", [3000, 0], [6000, 0], 2700, "Wall 2")]);
  assert.equal(r.lay("a").corners.length, 0); assert.equal(r.lay("b").corners.length, 0);
  assert.equal(r.lay("a").junctionCorners, 0); assert.ok(!r.lay("b").totals.cornerStuds);
  assert.equal(r.lay("b").totals.studs, run([wall("b", [3000, 0], [6000, 0], 2700, "Wall 2")]).lay("b").totals.studs);
  const g = findJunctions([W("A", 0, 0, 3000, 0), W("B", 3000, 0, 6000, 0), W("C", 3000, 100, 3000, 300)], O);   // a join is never a corner; another wall's end near it is not either
  assert.equal(findJunctions([W("A", 0, 0, 3000, 0), W("B", 3000, 0, 6000, 0)], O).corners.length, 0);
  assert.ok(g.corners.every((c) => c.studWallId === null || c.wallIds.length === 2));
  assert.ok(!/corner/i.test(wallFramingNotes(r.res, "a", {}).join(" ")));       // no misleading "corner on this wall" note
});
t("corner: the angle test is the same 20 degrees; a 25 degree corner counts, a 15 degree join does not", () => {
  const ang = (deg) => findJunctions([W("A", 0, 0, 5000, 0), W("B", 5000, 0, 5000 + 3000 * Math.cos((deg * Math.PI) / 180), 3000 * Math.sin((deg * Math.PI) / 180))], O).corners.length;
  assert.equal(ang(25), 1); assert.equal(ang(15), 0); assert.equal(ang(90), 1);
});
t("corner: the second stud is merged into a stud already there, and is not counted inside an opening", () => {
  const opening = { id: "o1", kind: "opening", parentId: "b", documentId: null, pageIndex: null, calibrationId: null, points: null, inputs: { type: "window", label: "W1", xMm: 50, sillMm: 900, widthMm: 900, heightMm: 1200 } };
  const r = run([L1(), L2(), opening]);
  assert.ok(!posOf(r.lay("b"), "corner").length);
  assert.notEqual(r.lay("b").corners[0].state, "added");
});

// C: the review findings
t("C1: a wall traced in two collinear legs with a wall meeting the join is ONE wall: exactly 2 junction studs and no leg-end studs there", () => {
  const legs = [wall("a1", [0, 0], [3000, 0], 2700, "Wall 1"), wall("a2", [3000, 0], [6000, 0], 2700, "Wall 1b")];
  const T = wall("b", [3000, 0], [3000, 3000], 2700, "Wall 2");
  const r = run([...legs, T]);
  assert.equal(sumOf(r, ["a1", "a2"], (l) => l.totals.junctionStuds), 2);
  assert.deepEqual(posOf(r.lay("a1"), "junction"), [2932.5]); assert.deepEqual(posOf(r.lay("a2"), "junction"), [67.5]);
  assert.ok(!r.lay("a1").ticks.some((x) => x.state !== "junction" && x.positionMm > 2900), "no leg-end stud on leg 1 at the join");
  assert.ok(!r.lay("a2").ticks.some((x) => x.state !== "junction" && x.positionMm < 100), "no leg-end stud on leg 2 at the join");
  // the studs at the join: just the 2 junction studs (the same as one continuous wall would give)
  const without = run(legs);
  const withT = sumOf(r, ["a1", "a2"], (l) => l.ticks.filter((x) => x.state !== "removed").length);
  const bare = sumOf(without, ["a1", "a2"], (l) => l.ticks.filter((x) => x.state !== "removed").length);
  assert.equal(withT, bare - 2 + 2);                                   // the 2 join-end studs out, the 2 junction studs in
  // blocks are counted once for the one junction, not once per leg
  assert.equal(sumOf(r, ["a1", "a2"], (l) => l.totals.junctionBlocks), 6);
  assert.equal(r.res.demands.filter((d) => d.role === "junction block").length, 1);
  // and one switch turns the whole junction off
  const off = run([...legs, T], { junctionsOff: [r.lay("a1").junctions[0].id] });
  assert.equal(sumOf(off, ["a1", "a2"], (l) => l.totals.junctionStuds), 0);
  assert.equal(sumOf(off, ["a1", "a2"], (l) => l.ticks.filter((x) => x.state !== "removed").length), bare);   // leg-end studs are back
  assert.equal(r.lay("a1").junctions[0].id, r.lay("a2").junctions[0].id);
});
t("C1: the same holds when the butting wall's end is a little off the join", () => {
  const legs = [wall("a1", [0, 0], [3000, 0], 2700, "Wall 1"), wall("a2", [3000, 0], [6000, 0], 2700, "Wall 1b")];
  const r = run([...legs, wall("b", [3040, 0], [3040, 3000], 2700, "Wall 2")]);
  assert.equal(sumOf(r, ["a1", "a2"], (l) => l.totals.junctionStuds), 2);
});
t("C2: walls on one page under different calibrations of the same scale are compared in real mm", () => {
  const cal2 = calOf("cal2");
  const b = { ...B(), calibrationId: "cal2" };
  const r = run([A(), b], {}, [cal, cal2]);
  assert.equal(r.lay("a").totals.junctionStuds, 2);
});
t("C2: calibrations on a page that really disagree: the page is skipped with a note, not compared silently", () => {
  const cal3 = calOf("cal3", 2);
  const b = { ...B(), calibrationId: "cal3" };
  const r = run([A(), b], {}, [cal, cal3]);
  assert.ok(!r.lay("a").totals.junctionStuds);
  assert.ok(r.res.problems.some((p) => p.code === "junction_calibration_conflict" && p.blocking === false && /Page 1/.test(p.message)), JSON.stringify(r.res.problems.map((p) => p.code)));
});
t("C3: a blocked butting wall still gives the continuous wall its studs, and the continuous wall says which wall isn't counted", () => {
  const blocked = wall("b", [3000, 0], [3000, 3000], 0, "Wall 2");      // no height: blocked
  blocked.inputs.heightMm = null;
  const r = run([A(), blocked]);
  assert.equal(r.lay("a").totals.junctionStuds, 2);
  const note = r.res.problems.find((p) => p.code === "junction_wall_not_counted");
  assert.ok(note && note.blocking === false, JSON.stringify(r.res.problems.map((p) => p.code)));
  assert.match(note.message, /Wall 1: Wall 2 butts into it/);
  assert.ok(!run([A(), B()]).res.problems.some((p) => p.code === "junction_wall_not_counted"));
});
t("C5: removal is per junction (continuous wall + butting wall + end): one butting end between two walls turns off one, not both", () => {
  const two = [wall("a", [0, 0], [6000, 0], 2700, "Wall 1"), wall("c", [0, 60], [6000, 60], 2700, "Wall 3"), wall("b", [3000, 30], [3000, 3000], 2700, "Wall 2")];
  const base = run(two);
  assert.equal(base.lay("a").totals.junctionStuds, 2); assert.equal(base.lay("c").totals.junctionStuds, 2);
  const off = run(two, { junctionsOff: ["b:0@a"] });
  assert.ok(!off.lay("a").totals.junctionStuds); assert.equal(off.lay("c").totals.junctionStuds, 2);
  assert.deepEqual(overrideKeyWallIds("b:0@a"), ["b", "a"]);
  assert.deepEqual(overrideKeyWallIds("b:1@a1+a2"), ["b", "a1", "a2"]);
  assert.deepEqual(overrideKeyWallIds("corner:a:1|b:0"), ["a", "b"]);
  // a key for a wall that is gone matches nothing
  assert.equal(run(two, { junctionsOff: ["zz:0@yy"] }).lay("a").totals.junctionStuds, 2);
});
t("version: the calculation is stamped takeoff-calc@11 so saved orders offer an update", () => {
  assert.match(CALCULATION_VERSION, /^takeoff-calc@11$/);
});

console.log(`takeoff-tc-junctions: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
