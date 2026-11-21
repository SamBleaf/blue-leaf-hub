// Walls bulk edits (Sam, 21 Nov 2026): split a wall on the plan, wet areas -> 450 centres, and the engine framing a split wall as one.
//   node scripts/tests/takeoff-tc-wall-split.test.mjs
import assert from "node:assert/strict";
import { buildCalibration, computeWorkspace, methodFor, wallFramingDefaults, WALL_FRAMING_RULES } from "../../shared/takeoff/index.js";
import { pointAtStation, runSeqAfterSplit, splitProblem, splitWall, wallObstacles, wallStationAt, wetAreaWalls, wetCentresChanges, withWetCentres, WET_AREA_RULE } from "../../shared/takeoff/wallEdits.js";
import { wallSplitJoins } from "../../shared/takeoff/engine/dispatch.js";
import { joinWalls } from "../../shared/takeoff/wallEdits.js";
import { cleanCentreZones, withWetZones, zonedStations } from "../../shared/takeoff/centreZones.js";
import { cleanMeasurementInputs } from "../../server/lib/takeoff/takeoffService.mjs";
import { bulkCentresChanges, bulkDoubleTopChanges, bulkSelectTap, withHandCentres } from "../../src/components/takeoff/measure/tools.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 4).join("\n    ")}`); } }
const near = (a, b, eps = 0.6, what = "") => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} ≈ ${b}`);

// a page at 1:20 (0.05 pt per mm)
const k = 0.05, X0 = 100, Y0 = 100;
const H = { p1: { x: X0, y: Y0 - 40 }, p2: { x: X0 + 12000 * k, y: Y0 - 40 }, knownMm: 12000 };
const V = { p1: { x: X0 - 40, y: Y0 }, p2: { x: X0 - 40, y: Y0 + 8000 * k }, knownMm: 8000 };
const cal = { id: "cal", documentId: "d", pageIndex: 0, ...buildCalibration({ basisRotation: 0, horizontal: H, vertical: V }).calibration, status: "ready" };
const at = (x, y) => ({ x: X0 + x * k, y: Y0 + y * k });
const wall = (id, a, b, inputs = {}) => ({ id, kind: "wall", documentId: "d", pageIndex: 0, calibrationId: "cal", points: [at(...a), at(...b)], inputs: { kind: "rect", heightMm: 2400, name: id, ...inputs } });
const opening = (id, wallId, xMm, widthMm, label = "W1") => ({ id, kind: "opening", parentId: wallId, documentId: null, pageIndex: null, calibrationId: null, points: null, inputs: { xMm, widthMm, sillMm: 900, heightMm: 1200, label, type: "window" } });
let seq = 0;
const ids = () => `n${++seq}`;

// ── along a wall ─────────────────────────────────────────────────────────────────────────────────────────────
t("station of a tap: projected square onto the wall, clamped to its ends; and back to a plan point", () => {
  const w = wall("a", [0, 0], [6000, 0]);
  const s = wallStationAt(w.points, cal, at(2500, 40));
  near(s.stationMm, 2500); near(s.offMm, 40); near(s.lengthMm, 6000);
  near(wallStationAt(w.points, cal, at(-500, 0)).stationMm, 0);
  const p = pointAtStation(w.points, cal, 1500);
  near(p.x, at(1500, 0).x, 1e-9); near(p.y, at(1500, 0).y, 1e-9);
});

// ── split geometry ───────────────────────────────────────────────────────────────────────────────────────────
t("split: two collinear pieces, the first keeps the id, the second is a new wall with every setting and the next name", () => {
  const w = wall("a", [0, 0], [6000, 0], { studCentresMm: 450, doubleTopPlate: true, runId: "r", seq: 2 });
  const r = splitWall({ wall: w, cal, stationsMm: [2000], newId: () => "b", names: ["Wall 9"] });
  assert.ok(r.ok, r.error);
  assert.equal(r.pieces.length, 2);
  const [p, q] = r.pieces;
  assert.equal(p.id, "a"); assert.equal(q.id, "b");
  assert.equal(q.inputs.name, "Wall 9"); assert.equal(p.inputs.name, "a");
  assert.equal(p.inputs.splitOf, "a"); assert.equal(q.inputs.splitOf, "a");
  assert.equal(q.inputs.studCentresMm, 450); assert.equal(q.inputs.doubleTopPlate, true); assert.equal(q.inputs.heightMm, 2400);
  near(p.lengthMm + q.lengthMm, 6000, 1e-6);
  assert.deepEqual(p.points[1], q.points[0], "they share the split point");
  near(p.points[1].x, at(2000, 0).x, 1e-9);
});
t("split again: the group id stays the first wall's", () => {
  const w = wall("b", [2000, 0], [6000, 0], { splitOf: "a" });
  const r = splitWall({ wall: w, cal, stationsMm: [1000], newId: () => "c", names: ["Wall 3"] });
  assert.equal(r.pieces[1].inputs.splitOf, "a");
});
t("openings go to the piece that holds them, offset from that piece's start; one across the point refuses the split", () => {
  const w = wall("a", [0, 0], [6000, 0]);
  const o1 = opening("o1", "a", 500, 900, "W1"), o2 = opening("o2", "a", 3500, 1200, "D1");
  const r = splitWall({ wall: w, openings: [o1, o2], cal, stationsMm: [2000], newId: () => "b", names: ["Wall 2"] });
  assert.ok(r.ok);
  assert.equal(r.openings.length, 1, "only the moved opening changes");
  assert.equal(r.openings[0].next.parentId, "b"); near(r.openings[0].next.inputs.xMm, 1500);
  const bad = splitWall({ wall: w, openings: [o1, o2], cal, stationsMm: [4000], newId: () => "b", names: ["Wall 2"] });
  assert.equal(bad.ok, false); assert.match(bad.error, /D1 crosses that point/);
  // exactly at an opening's edge is fine
  assert.ok(splitWall({ wall: w, openings: [o2], cal, stationsMm: [3500], newId: () => "b", names: ["Wall 2"] }).ok);
});
t("too close to an end, or a bracing mark across the point: plain refusals", () => {
  assert.match(splitProblem(200, 6000, []), /too close to the end/);
  assert.match(splitProblem(5900, 6000, []), /too close to the end/);
  const inp = { bracing: [{ id: "m1", type: "ply", xMm: 1000 }] };
  assert.match(splitProblem(1500, 6000, wallObstacles(inp)), /brace sheet crosses/);
  assert.equal(splitProblem(2300, 6000, wallObstacles(inp)), null);
});
t("bracing marks move with their piece; ply whole wall is laid out again on each piece", () => {
  const w = wall("a", [0, 0], [6000, 0], { bracing: [{ id: "m1", type: "ply", xMm: 0 }, { id: "m2", type: "cross", xMm: 3000, spanMm: 2400 }] });
  const r = splitWall({ wall: w, cal, stationsMm: [2000], newId: () => "b", names: ["Wall 2"] });
  assert.deepEqual(r.pieces[0].inputs.bracing.map((m) => m.id), ["m1"]);
  assert.deepEqual(r.pieces[1].inputs.bracing.map((m) => [m.id, m.xMm]), [["m2", 1000]]);
  let n = 0;
  const whole = splitWall({ wall: wall("a", [0, 0], [6000, 0], { bracing: [{ id: "w1", type: "ply", xMm: 0, whole: true }] }), cal, stationsMm: [2400], newId: () => `x${++n}`, names: ["Wall 2"] });
  assert.equal(whole.pieces[0].inputs.bracing.length, 2); assert.equal(whole.pieces[1].inputs.bracing.length, 3);
  assert.ok(whole.pieces.every((p) => p.inputs.bracing.every((m) => m.whole)));
});
t("several split points at once: three pieces in order", () => {
  const r = splitWall({ wall: wall("a", [0, 0], [6000, 0]), cal, stationsMm: [4000, 2000], newId: ids, names: ["Wall 2", "Wall 3"] });
  assert.deepEqual(r.pieces.map((p) => Math.round(p.lengthMm)), [2000, 2000, 2000]);
  assert.deepEqual(r.pieces.map((p) => p.inputs.name), ["a", "Wall 2", "Wall 3"]);
});
t("a run's tap order: the new piece comes straight after, later walls move up", () => {
  const run = [wall("a", [0, 0], [1, 0], { runId: "r", seq: 1 }), wall("b", [0, 0], [1, 0], { runId: "r", seq: 2 }), wall("c", [0, 0], [1, 0], { runId: "r", seq: 3 })];
  const r = runSeqAfterSplit(run, run[1], 1);
  assert.deepEqual(r.seqs, [3]);
  assert.deepEqual(r.bumped.map((b) => [b.next.id, b.next.inputs.seq]), [["c", 4]]);
  assert.deepEqual(runSeqAfterSplit(run, wall("z", [0, 0], [1, 0]), 1), { seqs: [], bumped: [] });
});

// ── wet areas ────────────────────────────────────────────────────────────────────────────────────────────────
// a 2,400 x 3,000 bathroom with its corner at (3000, 0); walls on their centrelines
const bath = { id: "wet1", points: [{ x: 3000, y: 0 }, { x: 5400, y: 0 }, { x: 5400, y: 3000 }, { x: 3000, y: 3000 }] };
const W = (id, ax, ay, bx, by, obstacles) => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, ...(obstacles ? { obstacles } : {}) });
const plan = (walls, areas = [bath]) => new Map(wetAreaWalls({ walls, areas }).map((r) => [r.id, r]));
t("wet areas: walls on the room's edge are wet; a wall that only butts the room isn't; a wall inside it is", () => {
  const p = plan([
    W("left", 3000, 0, 3000, 3000), W("top", 3000, 0, 5400, 0),              // on the edge
    W("near", 3080, 0, 3080, 3000),                                           // 80 mm in (traced to a face): still on the band
    W("butt", 5400, 1500, 8000, 1500),                                        // starts on the room's edge, runs away
    W("inside", 4200, 0, 4200, 3000),                                         // a partition inside the room
    W("far", 0, 5000, 2000, 5000),                                            // nowhere near
  ]);
  assert.equal(p.get("left").status, "whole"); assert.equal(p.get("top").status, "whole"); assert.equal(p.get("near").status, "whole");
  assert.equal(p.get("butt").status, "none"); assert.equal(p.get("inside").status, "whole"); assert.equal(p.get("far").status, "none");
});
t("wet areas: a long wall only partly along the room is split at the room's corner", () => {
  const r = plan([W("hall", 0, 0, 9000, 0)]).get("hall");
  assert.equal(r.status, "partial");
  assert.deepEqual(r.splitsMm, [3000, 5400]);
  assert.deepEqual(r.pieces.map((p) => p.wet), [false, true, false]);
});
t("wet areas: a dry end shorter than 300 mm goes to 450 with the rest (no sliver walls)", () => {
  const r = plan([W("w", 2800, 0, 5400, 0)]).get("w");
  assert.equal(r.status, "whole");
});
t("wet areas: a split never cuts an opening — it moves to the opening's edge so the opening is on the wet piece", () => {
  const r = plan([W("hall", 0, 0, 9000, 0, [{ x0: 2600, x1: 3400 }])]).get("hall");
  assert.deepEqual(r.splitsMm, [2600, 5400]);
});
t("wet areas: overlap under 300 mm along the band doesn't count", () => {
  // runs 250 mm into the band past the room's corner (beyond the corner the band reaches 150 mm)
  const r = plan([W("w", 5450, -100, 7000, -100)]).get("w");
  assert.equal(r.status, "none");
});
t("what Set to 450 does: follows-item → set; hand-set other value → asked; already 450 → left; wet-set no longer wet → back", () => {
  const p = [{ id: "a", status: "whole" }, { id: "b", status: "whole" }, { id: "c", status: "whole" }, { id: "d", status: "none" }, { id: "e", status: "partial", wetMm: [[0, 2000]] }, { id: "f", status: "whole" }];
  const inp = new Map([["a", {}], ["b", { studCentresMm: 600 }], ["c", { studCentresMm: 450 }], ["d", { studCentresMm: 450, studCentresFrom: "wet" }], ["e", {}], ["f", { studCentresMm: 300, studCentresFrom: "wet" }]]);
  const ch = wetCentresChanges(p, inp);
  assert.deepEqual(ch, { set: ["a", "f"], hand: ["b"], revert: ["d"], zone: [{ id: "e", wetMm: [[0, 2000]] }], clearZones: [], already: ["c"] });
  assert.deepEqual(withWetCentres({ name: "x" }, true), { name: "x", studCentresMm: WET_AREA_RULE.centresMm, studCentresFrom: "wet" });
  assert.deepEqual(withWetCentres({ name: "x", studCentresMm: 450, studCentresFrom: "wet" }, false), { name: "x" });
});
t("a hand edit clears the wet mark; back to the item's centres keeps an explicit value only when the wet areas had set it", () => {
  assert.deepEqual(withHandCentres({ studCentresMm: 450, studCentresFrom: "wet" }, 600, 600), { studCentresMm: 600 });
  assert.deepEqual(withHandCentres({ studCentresMm: 450 }, 600, 600), {});
  assert.deepEqual(withHandCentres({}, 450, 600), { studCentresMm: 450 });
});

// ── bulk (multi-select) ──────────────────────────────────────────────────────────────────────────────────────
t("multi-select taps: a second wall adds, a selected one comes off, back to one = a single selection", () => {
  assert.deepEqual(bulkSelectTap({ selected: "a", multi: [] }, "b"), { selected: null, multi: ["a", "b"] });
  assert.deepEqual(bulkSelectTap({ selected: null, multi: ["a", "b"] }, "c"), { selected: null, multi: ["a", "b", "c"] });
  assert.deepEqual(bulkSelectTap({ selected: null, multi: ["a", "b", "c"] }, "b"), { selected: null, multi: ["a", "c"] });
  assert.deepEqual(bulkSelectTap({ selected: null, multi: ["a", "c"] }, "c"), { selected: "a", multi: [] });
  assert.deepEqual(bulkSelectTap({ selected: "a", multi: [] }, "a"), { selected: "a", multi: [] }, "tapping the one selected wall keeps it");
});
t("bulk centres / double top: only the walls that change, as before → next pairs", () => {
  const mat = { rules: { centresMm: 600, doubleTopPlate: false } };
  const ws = [wall("a", [0, 0], [1, 0]), wall("b", [0, 0], [1, 0], { studCentresMm: 450 }), wall("c", [0, 0], [1, 0], { studCentresMm: 450, studCentresFrom: "wet" })];
  const ch = bulkCentresChanges(ws, mat, 450);
  assert.deepEqual(ch.map((c) => [c.next.id, c.next.inputs.studCentresMm, c.next.inputs.studCentresFrom]), [["a", 450, undefined], ["c", 450, undefined]]);
  const back = bulkCentresChanges(ws, mat, 600);
  assert.deepEqual(back.map((c) => [c.next.id, c.next.inputs.studCentresMm]), [["b", undefined], ["c", 600]]);
  const dt = bulkDoubleTopChanges(ws, mat, true);
  assert.equal(dt.length, 3); assert.ok(dt.every((c) => c.next.inputs.doubleTopPlate === true));
});

// ── server keeps the new keys ────────────────────────────────────────────────────────────────────────────────
t("server: splitOf (a uuid) and studCentresFrom 'wet' are kept; junk dropped; the mark needs centres", () => {
  const u = "123e4567-e89b-42d3-a456-426614174000";
  const a = cleanMeasurementInputs("wall", { kind: "rect", heightMm: 2400, studCentresMm: 450, studCentresFrom: "wet", splitOf: u }, 6000);
  assert.equal(a.splitOf, u); assert.equal(a.studCentresFrom, "wet");
  const b = cleanMeasurementInputs("wall", { kind: "rect", heightMm: 2400, studCentresFrom: "wet", splitOf: "nope" }, 6000);
  assert.equal(b.splitOf, undefined); assert.equal(b.studCentresFrom, undefined);
});

// ── through the real engine ──────────────────────────────────────────────────────────────────────────────────
function run(measurements, rules = {}) {
  const spec = wallFramingDefaults([]);
  spec.components.studs = { ...spec.components.studs, section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", stock: { maxMm: null, unavailableMm: [] } };
  spec.components.noggins = { ...spec.components.noggins, stock: { maxMm: null, unavailableMm: [] } };
  const mk = methodFor(spec);
  const mat = { id: "walls", name: "Walls", methodKey: mk.key, methodVersion: mk.version, spec, rules: { ...WALL_FRAMING_RULES, carriesRoof: true, ...rules } };
  const walls = measurements.filter((m) => m.kind === "wall");
  const c = computeWorkspace({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [{ id: "d", status: "current" }], calibrations: [cal],
    materials: [mat], measurements, contributions: walls.map((m, i) => ({ id: `c${i}`, measurementId: m.id, jobMaterialId: "walls", role: "wall" })) });
  const res = c.materialResults.walls;
  const lays = res.layouts.filter((l) => l?.method === "wall_framing@1");
  const sum = (f) => lays.reduce((s, l) => s + f(l), 0);
  const studsAt = lays.flatMap((l) => l.ticks.filter((x) => x.state !== "removed").map((x) => Math.round((x.positionMm + (l.wallMeasurementId === "b" ? lays.find((q) => q.wallMeasurementId === "a").frame.lengthMm : 0)) * 10) / 10)).sort((p, q) => p - q);
  const nogMm = res.demands.filter((d) => d.role === "noggin").reduce((s, d) => s + d.quantity * d.lengthMm, 0);
  const hoop = res.demands.filter((d) => d.role === "hoop iron").reduce((s, d) => s + d.hoopMetres, 0);
  return { c, res, lays, studs: sum((l) => l.totals.studs), plates: sum((l) => l.totals.bottomPlateMm + l.totals.topPlateMm), studsAt, nogMm, noggins: sum((l) => l.totals.noggins), hoop };
}
const pieces = (atMm, extraB = {}, extraA = {}) => {
  const r = splitWall({ wall: wall("a", [0, 0], [6000, 0]), cal, stationsMm: [atMm], newId: () => "b", names: ["Wall 2"] });
  const [p, q] = r.pieces;
  return [{ ...wall("a", [0, 0], [0, 0]), points: p.points, inputs: { ...p.inputs, ...extraA } }, { ...wall("b", [0, 0], [0, 0]), points: q.points, inputs: { ...q.inputs, ...extraB } }];
};
for (const atMm of [1500, 1800, 2000, 3333]) {
  t(`engine: a wall split at ${atMm} frames exactly like the unsplit wall at equal centres (studs, plates, noggins, hoop iron)`, () => {
    const one = run([wall("a", [0, 0], [6000, 0])]);
    const two = run(pieces(atMm));
    assert.equal(two.studs, one.studs, "stud count");
    assert.deepEqual(two.studsAt, one.studsAt, "stud positions");
    near(two.plates, one.plates, 0.01, "plate length");
    near(two.nogMm, one.nogMm, 0.5, "noggin length");
    assert.equal(two.noggins, one.noggins, "noggin pieces");
    near(two.hoop, one.hoop, 1e-6, "hoop iron");
    assert.ok(!two.res.problems.some((p) => p.blocking !== false), JSON.stringify(two.res.problems));
  });
}
t("engine: where the centres change, ONE stud stands at the join and the 450 piece lays out from it", () => {
  const one = run([wall("a", [0, 0], [6000, 0])]);
  const two = run(pieces(3000, { studCentresMm: 450 }));
  const a = two.lays.find((l) => l.wallMeasurementId === "a"), b = two.lays.find((l) => l.wallMeasurementId === "b");
  assert.deepEqual(a.ticks.filter((x) => x.state !== "removed").map((x) => x.positionMm), [0, 600, 1200, 1800, 2400, 3000]);
  assert.deepEqual(b.ticks.filter((x) => x.state !== "removed").map((x) => x.positionMm), [450, 900, 1350, 1800, 2250, 2700, 3000]);
  near(two.plates, one.plates, 0.01, "plate length unchanged");
  assert.equal(b.centresMm, 450);
});
t("engine: plates run THROUGH the split (Sam, 22 Nov): the same plate pieces as the unsplit wall, all on the first piece", () => {
  const platePieces = (r) => r.res.demands.filter((d) => /plate$/.test(d.role)).map((d) => `${d.role}:${d.lengthMm}x${d.quantity}`).sort();
  for (const [atMm, extraB] of [[2000, {}], [3000, { studCentresMm: 450 }], [4500, {}]]) {
    const one = run([wall("a", [0, 0], [6000, 0])]);
    const two = run(pieces(atMm, extraB));
    assert.deepEqual(platePieces(two), platePieces(one), `split at ${atMm}`);
    const b = two.lays.find((l) => l.wallMeasurementId === "b");
    assert.equal(b.totals.bottomPlateMm + b.totals.topPlateMm, 0, "the later piece adds no plate");
    assert.ok(two.res.demands.filter((d) => /plate$/.test(d.role)).every((d) => d.sourceRefs.every((r) => r.wallId === "a")), "counted on the first piece");
  }
  // different Double top plate settings: each piece keeps its own plates (cut at the split)
  const mixed = run(pieces(3000, { doubleTopPlate: true }));
  assert.ok(mixed.lays.find((l) => l.wallMeasurementId === "b").totals.bottomPlateMm > 0);
});
t("engine: no join when the pieces were dragged apart, bent, or differ in height (plain walls again)", () => {
  const [p, q] = pieces(2000);
  const ctx = { calibrationsById: new Map([["cal", cal]]) };
  assert.equal(wallSplitJoins([p, q], ctx).next.get("a"), "b");
  assert.equal(wallSplitJoins([p, { ...q, points: [at(2100, 0), q.points[1]] }], ctx).next.size, 0);
  assert.equal(wallSplitJoins([p, { ...q, points: [q.points[0], at(4000, 3000)] }], ctx).next.size, 0);
  assert.equal(wallSplitJoins([p, { ...q, inputs: { ...q.inputs, heightMm: 2700 } }], ctx).next.size, 0);
  assert.equal(wallSplitJoins([p, { ...q, inputs: { ...q.inputs, splitOf: undefined } }], ctx).next.size, 0);
});
t("engine: walls with no splitOf are untouched (two walls traced end to end keep their own end studs)", () => {
  const plain = run([wall("a", [0, 0], [2000, 0]), wall("b", [2000, 0], [6000, 0])]);
  const one = run([wall("a", [0, 0], [6000, 0])]);
  assert.ok(plain.studs > one.studs, `${plain.studs} > ${one.studs}`);
});
t("engine: a T on the split join still gets its junction studs either side", () => {
  const ms = [...pieces(3000), wall("t", [3000, 0], [3000, 3000], { name: "Wall 9" })];
  const r = run(ms);
  const js = r.lays.filter((l) => ["a", "b"].includes(l.wallMeasurementId)).reduce((s, l) => s + (l.totals.junctionStuds || 0), 0);
  assert.equal(js, 2);
});


// ── Sam, 22 Nov 2026: centre sections (wet area at 450 WITHOUT splitting the wall) and joining walls back ─────
t("engine: a 450 section on ONE wall frames exactly like the wall split there (studs, plates, noggins)", () => {
  for (const [from, to] of [[3000, 6000], [0, 3000], [1500, 4200]]) {
    const zoned = run([wall("a", [0, 0], [6000, 0], { centreZones: [{ fromMm: from, toMm: to, centresMm: 450, from: "wet" }] })]);
    const a = zoned.lays[0];
    const pos = a.ticks.filter((x) => x.state !== "removed").map((x) => x.positionMm);
    // the same stations zonedStations gives, and the 450 stretch really at 450
    const inZone = pos.filter((x) => x > from + 1 && x < to - 1);
    for (let i = 1; i < inZone.length; i++) near(inZone[i] - inZone[i - 1], 450, 0.01, `450 bay at ${inZone[i]}`);
    assert.ok(pos.includes(from) || from === 0, `a stud where the centres change (${from})`);
    assert.equal(zoned.res.problems.filter((p) => p.blocking !== false).length, 0);
    const one = run([wall("a", [0, 0], [6000, 0])]);
    near(zoned.plates, one.plates, 0.01, "plates unchanged");
    assert.ok(zoned.studs > one.studs, "more studs at 450");
  }
  // same studs as splitting at 3000 with the second piece at 450
  const zoned = run([wall("a", [0, 0], [6000, 0], { centreZones: [{ fromMm: 3000, toMm: 6000, centresMm: 450 }] })]);
  const split = run(pieces(3000, { studCentresMm: 450 }));
  assert.equal(zoned.studs, split.studs); assert.deepEqual(zoned.studsAt, split.studsAt); near(zoned.nogMm, split.nogMm, 0.5, "noggins");
});
t("engine: a cavity slider can sit across where the centres change (one wall)", () => {
  const ms = [wall("a", [0, 0], [6000, 0], { centreZones: [{ fromMm: 0, toMm: 3000, centresMm: 450, from: "wet" }] }),
    { id: "o", kind: "opening", parentId: "a", documentId: "d", pageIndex: 0, calibrationId: "cal", points: [], inputs: { type: "door", label: "D1", xMm: 2400, sillMm: 0, widthMm: 820, heightMm: 2100, cavityLeafMm: 820, cavityPocket: "left" } }];
  const r = run(ms);
  assert.equal(r.lays.length, 1);
  assert.ok(!r.res.problems.some((p) => p.blocking !== false && p.code !== "opening_framing_incomplete"), JSON.stringify(r.res.problems.filter((p) => p.blocking !== false)));
});
t("zonedStations: grid from each section's start, a stud at each change, end kept", () => {
  const base = [0, 600, 1200, 1800, 2400, 3000, 3600, 4200, 4800, 5400, 6000];
  assert.deepEqual(zonedStations({ runMm: 6000, baseCentresMm: 600, zones: [{ fromMm: 1000, toMm: 3000, centresMm: 450 }], basePositions: base }),
    [0, 600, 1000, 1450, 1900, 2350, 2800, 3000, 3600, 4200, 4800, 5400, 6000]);
  assert.deepEqual(zonedStations({ runMm: 6000, baseCentresMm: 600, zones: [], basePositions: base }), base);
});
t("wet sections: hand sections stay, old wet ones are replaced, a wet stretch over a hand section is left", () => {
  const inp = { centreZones: [{ fromMm: 0, toMm: 1000, centresMm: 300 }, { fromMm: 4000, toMm: 5000, centresMm: 450, from: "wet" }] };
  assert.deepEqual(withWetZones(inp, [[2000, 3000], [500, 1500]]).centreZones, [{ fromMm: 0, toMm: 1000, centresMm: 300 }, { fromMm: 2000, toMm: 3000, centresMm: 450, from: "wet" }]);
  assert.equal(withWetZones({ centreZones: [{ fromMm: 0, toMm: 900, centresMm: 450, from: "wet" }] }, []).centreZones, undefined);
});
t("server: centreZones are checked (overlaps / silly centres refused, kept sorted)", () => {
  const ok = cleanMeasurementInputs("wall", { kind: "rect", heightMm: 2400, centreZones: [{ fromMm: 3000, toMm: 6000, centresMm: 450, from: "wet" }, { fromMm: 0, toMm: 1000, centresMm: 300 }] }, 6000);
  assert.deepEqual(ok.centreZones.map((z) => z.fromMm), [0, 3000]);
  assert.equal(ok.centreZones[1].from, "wet");
  assert.equal(cleanCentreZones([{ fromMm: 0, toMm: 2000, centresMm: 450 }, { fromMm: 1000, toMm: 3000, centresMm: 450 }]).ok, false);
  assert.equal(cleanCentreZones([{ fromMm: 0, toMm: 2000, centresMm: 50 }]).ok, false);
  assert.throws(() => cleanMeasurementInputs("wall", { kind: "rect", heightMm: 2400, centreZones: [{ fromMm: 0, toMm: 50, centresMm: 450 }] }, 6000));
});
t("join: split pieces go back to ONE wall; a piece at other centres becomes a section; openings and bracing move along", () => {
  const [p, q] = pieces(3000, { studCentresMm: 450, studCentresFrom: "wet", bracing: [{ id: "x1", type: "cross", xMm: 500, spanMm: 2400 }] });
  const op = { id: "o", kind: "opening", parentId: "b", inputs: { xMm: 700, widthMm: 820 } };
  const r = joinWalls({ walls: [q, p], openingsByWall: new Map([["b", [op]]]), cal, itemCentresMm: 600 });
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.removed, ["b"]);
  assert.equal(r.wall.id, "a");
  assert.deepEqual(r.wall.inputs.centreZones, [{ fromMm: 3000, toMm: 6000, centresMm: 450, from: "wet" }]);
  assert.equal(r.openings[0].next.parentId, "a"); near(r.openings[0].next.inputs.xMm, 3700, 0.01, "opening moved along");
  assert.equal(r.wall.inputs.bracing[0].xMm, 3500);
  near(r.lengthMm, 6000, 0.01, "joined length");
  // the joined wall frames like the two pieces did
  const joined = run([{ ...r.wall, inputs: { ...r.wall.inputs, splitOf: undefined, bracing: undefined } }]);
  const two = run(pieces(3000, { studCentresMm: 450 }));
  assert.equal(joined.studs, two.studs);
  // refused: not in line / different heights
  assert.equal(joinWalls({ walls: [p, wall("z", [0, 1000], [3000, 1000])], cal, itemCentresMm: 600 }).ok, false);
  assert.equal(joinWalls({ walls: [p, { ...q, inputs: { ...q.inputs, heightMm: 2700 } }], cal, itemCentresMm: 600 }).ok, false);
});

console.log(`takeoff-tc-wall-split: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
