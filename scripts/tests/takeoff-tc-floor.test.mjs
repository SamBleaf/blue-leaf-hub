// Floor frame, Phase 1 (floor_framing@1): trusses, strongbacks, ring beams and stair trimmers. Plan: docs/takeoff/FLOOR_FRAMING_PLAN.md
//   node scripts/tests/takeoff-tc-floor.test.mjs
import assert from "node:assert/strict";
import { buildCalibration, CALCULATION_VERSION, computeWorkspace, methodFor, buildSupplierGroups, floorFramingDefaults, FLOOR_FRAMING_RULES, wallFramingDefaults, WALL_FRAMING_RULES } from "../../shared/takeoff/index.js";
import { layoutFloor, edgeLabel, TRUSS_COUNT_TOLERANCE_MM, parseSize, STRONGBACK_SPAN_RULE, mmToPoint } from "../../shared/takeoff/engine/floor/geometry.js";
import { methodReads } from "../../shared/takeoff/engine/dispatch.js";
import { cleanMaterialContent, cleanMeasurementInputs, _test } from "../../server/lib/takeoff/takeoffService.mjs";
import { pointToMm } from "../../shared/takeoff/calibration.js";
import { withoutFloorBeams, isFloorItem, isWallsItem, toolsFor, usesWalls } from "../../src/components/takeoff/measure/tools.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 3).join("\n    ")}`); } }
const near = (a, b, eps = 0.01, what = "") => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} ≈ ${b}`);

const rect = (w, h, x = 0, y = 0) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const L_SHAPE = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 2000 }, { x: 3000, y: 2000 }, { x: 3000, y: 4200 }, { x: 0, y: 4200 }];

// ── pure geometry ────────────────────────────────────────────────────────────────────────────────────────────
t("worked example: 6.0 x 4.2 m room, trusses span the short way: 15 at 450, 11 at 600, all 4200", () => {
  for (const [c, n] of [[450, 15], [600, 11]]) {
    const r = layoutFloor({ outline: rect(6000, 4200), rules: { centresMm: c } });
    assert.equal(r.totals.trussCount, n, `centres ${c}`);
    assert.deepEqual(r.trussesByLength, [{ lengthMm: 4200, count: n }]);
  }
});
t("a truss ALWAYS stands on the far edge: count = ceil(width / centres) + 1, a short last bay is fine and says nothing", () => {
  assert.equal(layoutFloor({ outline: rect(5400, 3000), rules: { centresMm: 450 } }).totals.trussCount, 13);   // 12 bays exactly
  assert.equal(layoutFloor({ outline: rect(5500, 3000), rules: { centresMm: 450 } }).totals.trussCount, 14);   // 12.2 bays: 13 + 1
  const r = layoutFloor({ outline: rect(6000, 4200), rules: { centresMm: 450 } });                              // last bay is 150
  assert.equal(r.problems.filter((p) => /bay/i.test(p.message)).length, 0, "no short-last-bay warning (Sam, 18 Nov)");
  const last = r.lines[r.lines.length - 1];
  near(last.uMm, 6000);
});
t("worked example: strongbacks 18 lm in all, 12 lm of it at the truss ends (no beams)", () => {
  const r = layoutFloor({ outline: rect(6000, 4200), rules: { centresMm: 450 } });
  near(r.totals.endStrongbackLm, 12); near(r.totals.midStrongbackLm, 6); near(r.totals.strongbackLm, 18);
  assert.equal(r.totals.strongbackRows, 1);
  assert.deepEqual(r.edges.map((e) => e.kind), ["end", "side", "end", "side"]);
});
t("span the long way: trusses run 6000, spaced across the 4200 side (11 at 450)", () => {
  const r = layoutFloor({ outline: rect(6000, 4200), rules: { centresMm: 450, span: "long" } });
  assert.equal(r.totals.trussCount, 11); assert.deepEqual(r.trussesByLength, [{ lengthMm: 6000, count: 11 }]);
  near(r.totals.endStrongbackLm, 8.4);   // the two 4.2 m edges
});
t("the same floor drawn the other way round gives the same answer (direction follows the shape, not the drawing)", () => {
  const a = layoutFloor({ outline: rect(6000, 4200), rules: { centresMm: 450 } });
  const b = layoutFloor({ outline: rect(4200, 6000), rules: { centresMm: 450 } });
  assert.deepEqual(a.trussesByLength, b.trussesByLength); near(a.totals.strongbackLm, b.totals.strongbackLm);
});
t("L-shaped outline: trusses are clipped to the outline, with an edge truss on the step (8 x 4200 in the tall arm, 8 x 2000 in the short arm)", () => {
  const r = layoutFloor({ outline: L_SHAPE, rules: { centresMm: 450 } });
  assert.equal(r.totals.trussCount, 16);                       // 15 on the grid, plus one on the step edge at 3000
  assert.deepEqual(r.trussesByLength, [{ lengthMm: 4200, count: 8 }, { lengthMm: 2000, count: 8 }]);
  near(r.totals.floorAreaM2, 18.6);
  assert.equal(r.edges.filter((e) => e.kind === "end").length, 3);
});
t("truss lengths are rounded UP to the next 10 mm", () => {
  assert.deepEqual(layoutFloor({ outline: rect(6000, 4203), rules: { centresMm: 600 } }).trussesByLength, [{ lengthMm: 4210, count: 11 }]);
  assert.deepEqual(layoutFloor({ outline: rect(6000, 4200.2), rules: { centresMm: 600 } }).trussesByLength, [{ lengthMm: 4200, count: 11 }]);
});
t("void interrupting trusses: each cut truss becomes two shorter ones ending at the headers; headers snap outward to truss lines", () => {
  // void 1000 wide (u 2500..3500) and 2400 long (v 900..3300) in a 6000 x 4200 floor at 450
  const r = layoutFloor({ outline: rect(6000, 4200), voids: [{ id: "v1", name: "Stair void 1", stair: true, points: rect(1000, 2400, 2500, 900) }], rules: { centresMm: 450 } });
  assert.equal(r.totals.trussCount, 17);                    // lines at 2700 and 3150 are cut: 13 + 2 x 2
  assert.deepEqual(r.trussesByLength, [{ lengthMm: 4200, count: 13 }, { lengthMm: 900, count: 4 }]);
  assert.equal(r.trusses.filter((x) => x.interrupted).length, 4);
  near(r.totals.floorAreaM2, 25.2 - 2.4);
  const head = r.trimmers.filter((x) => x.kind === "header"), side = r.trimmers.filter((x) => x.kind === "side");
  assert.equal(head.length, 2); assert.equal(side.length, 2);
  head.forEach((h) => near(h.lengthMm, 1350));              // 2250 to 3600: the truss lines either side of the void
  side.forEach((s) => near(s.lengthMm, 2400 + 90));         // the void's length plus 45 bearing each end
  assert.ok(r.problems.some((p) => p.code === "floor_truss_interrupted" && !p.blocking));
});
t("a void edge ON a truss line: that line is replaced by the side trimmer (the header only runs line to line)", () => {
  const r = layoutFloor({ outline: rect(6000, 4200), voids: [{ id: "v1", stair: true, points: rect(900, 2400, 2250, 900) }], rules: { centresMm: 450 } });   // u 2250..3150, both on truss lines
  r.trimmers.filter((x) => x.kind === "header").forEach((h) => near(h.lengthMm, 900));
  assert.ok(r.trusses.filter((x) => x.interrupted).length >= 2);
});
t("an opening that is not a stair void gets no trimmers (and a note)", () => {
  const r = layoutFloor({ outline: rect(6000, 4200), voids: [{ id: "v1", name: "Opening 1", stair: false, points: rect(1000, 2400, 2500, 900) }], rules: { centresMm: 450 } });
  assert.equal(r.trimmers.length, 0);
  assert.ok(r.problems.some((p) => p.code === "floor_opening_no_trimmers"));
});
t("a void outside the outline, or crossing itself, blocks with a plain message (never fixed silently)", () => {
  const out = layoutFloor({ outline: rect(6000, 4200), voids: [{ id: "v1", name: "Stair void 1", points: rect(1000, 1000, 5600, 3800) }], rules: {} });
  assert.ok(out.problems.some((p) => p.code === "floor_void_outside" && p.blocking && /outside the floor outline/.test(p.message)));
  const bow = layoutFloor({ outline: [{ x: 0, y: 0 }, { x: 6000, y: 4200 }, { x: 6000, y: 0 }, { x: 0, y: 4200 }], rules: {} });
  assert.ok(bow.problems.some((p) => p.code === "floor_outline_invalid" && /crosses itself/.test(p.message)));
  assert.equal(bow.totals, null);
});
t("mid-span strongback rows by the longest truss: none to 3.5 m, one over 3.5 to 6.5 m, three over 6.5 m (exact edges)", () => {
  const rows = (span) => layoutFloor({ outline: rect(9000, span), rules: { centresMm: 600 } }).totals.strongbackRows;
  assert.equal(rows(3500), 0); assert.equal(rows(3600), 1); assert.equal(rows(6500), 1); assert.equal(rows(6600), 3);
  assert.deepEqual(STRONGBACK_SPAN_RULE, { noneMaxMm: 3500, oneMaxMm: 6500 });
  near(layoutFloor({ outline: rect(7000, 6600), rules: { centresMm: 600 } }).totals.midStrongbackLm, 21);   // three rows of 7 m
});
t("per-job strongback rows override (0 to 3) beats the span rule; 2 rows sit at the thirds", () => {
  const r = (n) => layoutFloor({ outline: rect(6000, 4200), rules: { centresMm: 600, strongbackRows: n } });
  assert.equal(r(0).totals.strongbackRows, 0); near(r(0).totals.midStrongbackLm, 0);
  assert.equal(r(3).totals.strongbackRows, 3); near(r(3).totals.midStrongbackLm, 18);
  near(r(2).midRows[0].fraction, 1 / 3); near(r(2).midRows[1].fraction, 2 / 3);
  assert.equal(r(null).totals.strongbackRows, 1);
});
t("a beam on an end edge replaces that edge's end strongback; a beam with no size blocks; a stale edge is noted", () => {
  const base = { outline: rect(6000, 4200), rules: { centresMm: 450 } };
  const sized = layoutFloor({ ...base, rules: { ...base.rules, beams: { e0: "445x63" } } });
  near(sized.totals.endStrongbackLm, 6); near(sized.totals.beamLm, 6);
  assert.deepEqual(sized.beamsBySize ?? sized.totals.beamsBySize, [{ size: "445x63", lm: 6 }]);
  assert.ok(!sized.problems.some((p) => p.blocking));
  const unsized = layoutFloor({ ...base, rules: { ...base.rules, beams: { e0: "unsized" } } });
  assert.ok(unsized.problems.some((p) => p.code === "floor_beam_unsized" && p.blocking && /Edge A/.test(p.message)));
  assert.equal(unsized.beams.length, 0);
  assert.ok(layoutFloor({ ...base, rules: { ...base.rules, beams: { e9: "445x63" } } }).problems.some((p) => p.code === "floor_beam_stale"));
  assert.ok(layoutFloor({ ...base, rules: { ...base.rules, beams: { e0: "big" } } }).problems.some((p) => p.code === "floor_beam_unsized" && /isn't a beam size/.test(p.message)));
});
t("sizes are read as depth x thickness", () => { assert.equal(parseSize("445 × 63"), "445x63"); assert.equal(parseSize("400X63"), "400x63"); assert.equal(parseSize("big"), null); });
t("mmToPoint is the exact inverse of pointToMm (the plan overlay draws the layout back onto the page)", () => {
  const cal = { ...buildCalibration({ basisRotation: 0, horizontal: { p1: { x: 100, y: 60 }, p2: { x: 700, y: 60 }, knownMm: 12000 }, vertical: { p1: { x: 60, y: 100 }, p2: { x: 60, y: 500 }, knownMm: 8000 } }).calibration };
  const o = { x: 150, y: 210 }, p = { x: 321.5, y: 333.25 };
  const q = pointToMm(cal, o, p), back = mmToPoint(cal, o, q);
  near(back.x, p.x, 1e-6); near(back.y, p.y, 1e-6);
});

// ── through the real engine (traced areas on a scaled page) ──────────────────────────────────────────────────
const k = 0.05, X0 = 100, Y0 = 100;
const H = { p1: { x: X0, y: Y0 - 40 }, p2: { x: X0 + 12000 * k, y: Y0 - 40 }, knownMm: 12000 };
const V = { p1: { x: X0 - 40, y: Y0 }, p2: { x: X0 - 40, y: Y0 + 8000 * k }, knownMm: 8000 };
const cal = { id: "cal", documentId: "d", pageIndex: 0, ...buildCalibration({ basisRotation: 0, horizontal: H, vertical: V }).calibration, status: "ready" };
const at = (p) => ({ x: X0 + p.x * k, y: Y0 + p.y * k });
const area = (id, pts, inputs) => ({ id, kind: "area", documentId: "d", pageIndex: 0, calibrationId: "cal", points: pts.map(at), inputs });
const floorArea = (pts = rect(6000, 4200), id = "f1") => area(id, pts, { role: "floor", kind: pts.length === 4 ? "rect" : "polygon" });
const voidArea = (id, pts, name, stair = true) => area(id, pts, { role: "void", kind: "rect", name, stair });
function run(measurements, rules = {}, specTweak = null) {
  const spec = floorFramingDefaults();
  if (specTweak) specTweak(spec);
  const mk = methodFor(spec);
  const mat = { id: "floor", name: "Floor", methodKey: mk.key, methodVersion: mk.version, spec, rules: { ...FLOOR_FRAMING_RULES, ...rules } };
  const c = computeWorkspace({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [{ id: "d", status: "current" }], calibrations: [cal],
    materials: [mat], measurements, contributions: measurements.map((m, i) => ({ id: `c${i}`, measurementId: m.id, jobMaterialId: "floor", role: "primary" })) });
  const res = c.materialResults.floor;
  const groups = buildSupplierGroups([{ lines: c.scheduleLines.filter((l) => l.roles).map((l) => ({ unit: l.unit, quantity: l.quantity, stockLengthMm: l.item.stockLengthMm, roles: l.roles, product: l.product || null, hoop: l.hoop || null, bracing: l.bracing || null, description: l.item.description, problem: l.problems.length > 0 })) }]);
  return { c, res, groups, lay: res.layouts[0] || null, lines: c.scheduleLines };
}
const group = (r, heading) => r.groups.find((g) => g.heading === heading);
const ids = (r) => r.res.demands.map((d) => d.role);

t("engine: the worked example order: trusses by length, strongbacks 18 lm, nothing under BEAMS or TRIMMERS", () => {
  const r = run([floorArea()], { centresMm: 450 });
  assert.equal(r.res.methodKey, "floor_framing");
  assert.equal(r.res.status.quantity, "calculated", JSON.stringify(r.res.problems.filter((p) => p.blocking)));
  assert.equal(r.lay.totals.trussCount, 15);
  assert.deepEqual(r.groups.map((g) => g.heading), ["FLOOR TRUSSES", "STRONGBACKS"]);
  const tr = group(r, "FLOOR TRUSSES");
  assert.equal(tr.rows.length, 1); assert.equal(tr.rows[0].unit, "EA"); assert.equal(tr.rows[0].quantity, 15); assert.match(tr.rows[0].product, /FLOOR TRUSS 4200 mm/);
  const sb = group(r, "STRONGBACKS");
  near(sb.totalLm, 18); assert.match(sb.rows[0].product, /120x35/);
  assert.equal(r.res.demands.filter((d) => d.role === "floor strongback").reduce((a, d) => a + d.lengthMm * d.quantity, 0), 18000);
});
t("engine: 600 centres gives 11 trusses", () => { assert.equal(run([floorArea()], { centresMm: 600 }).lay.totals.trussCount, 11); });
t("engine: a beam with no size makes the order Incomplete with a clear line, and no beam is guessed", () => {
  const r = run([floorArea()], { beams: { e0: "unsized" } });
  assert.equal(r.res.status.quantity, "incomplete");
  const p = r.res.problems.find((x) => x.code === "floor_beam_unsized");
  assert.ok(p && p.blocking && /Edge A has a beam with no size/.test(p.message));
  assert.ok(!r.groups.some((g) => g.heading === "BEAMS"));
  assert.ok(r.lines.every((l) => l.problems.some((m) => /no size/.test(m))), "every floor line carries the problem");
});
t("engine: sized beams buy LVL by the 300 mm grid under BEAMS, in their own size; the end strongback on that edge goes", () => {
  const r = run([floorArea()], { beams: { e0: "445x63", e2: "400x63" } });
  assert.equal(r.res.status.quantity, "calculated");
  const bm = group(r, "BEAMS");
  assert.equal(bm.rows.length, 2);
  assert.ok(bm.rows.some((x) => /445X63/.test(x.product) && /LVL/.test(x.product)) && bm.rows.some((x) => /400X63/.test(x.product)));
  near(bm.totalLm, 12);                                           // 6000 stock each: 6000 is on the 1200 + 300n grid
  assert.ok(!group(r, "STRONGBACKS").rows.some((x) => /^.*$/.test(x.product) && x.totalLm > 12), "strongbacks are the mid row only");
  near(group(r, "STRONGBACKS").totalLm, 6);
  assert.ok(!r.groups.some((g) => g.heading === "LINTELS"), "a floor beam is never a lintel");
});
t("engine: LVL beams are bought in 300 mm steps (a 4,250 edge buys 4,500)", () => {
  const r = run([floorArea(rect(6000, 4250))], { span: "long", beams: { e1: "445x63" } });   // trusses span the 6 m, so the 4.25 m edges are the ends
  assert.equal(r.lay.edges.find((e) => e.id === "e1").kind, "end");
  assert.deepEqual(group(r, "BEAMS").rows[0].cuts, [{ count: 1, lengthMm: 4500 }]);
});
t("engine: stair trimmers are LVL 445 x 63 by default, 400 x 63 by chip, under TRIMMERS (never HD & SILL TR)", () => {
  const v = voidArea("v1", rect(1000, 2400, 2500, 900), "Stair void 1");
  const r = run([floorArea(), v]);
  assert.equal(r.res.status.quantity, "calculated");
  const tm = group(r, "TRIMMERS");
  assert.ok(tm && tm.rows.length === 1 && /445X63/.test(tm.rows[0].product));
  assert.ok(!r.groups.some((g) => g.heading === "HD & SILL TR"));
  near(tm.totalLm, 1.5 + 1.5 + 2.7 + 2.7, 3.0, "stock lm, rounded up to the grid");
  const r2 = run([floorArea(), v], { trimmerSizes: { v1: "400x63" } });
  assert.ok(/400X63/.test(group(r2, "TRIMMERS").rows[0].product));
  assert.equal(r.lay.totals.trussCount, 17);
  assert.equal(group(r, "FLOOR TRUSSES").rows.length, 2);
  assert.deepEqual(group(r, "FLOOR TRUSSES").rows.map((x) => [x.quantity, x.product]), [[13, "FLOOR TRUSS 4200 mm"], [4, "FLOOR TRUSS 900 mm"]]);
});
t("engine: floor roles file under their own headings, in the supplier's order, after the wall groups", () => {
  const r = run([floorArea(), voidArea("v1", rect(1000, 2400, 2500, 900), "Stair void 1")], { beams: { e0: "445x63" } });
  assert.deepEqual(r.groups.map((g) => g.heading), ["FLOOR TRUSSES", "STRONGBACKS", "BEAMS", "TRIMMERS"]);
});
t("engine: a strongback longer than the longest stock is cut into stock-length pieces and says so", () => {
  const r = run([floorArea(rect(7000, 4200))], { centresMm: 600 });
  assert.ok(r.res.problems.some((p) => p.code === "floor_strongback_joined"));
  assert.ok(r.res.demands.filter((d) => d.role === "floor strongback").every((d) => d.lengthMm <= 6000));
});
t("engine: the strongback size is editable per job (140 x 35)", () => {
  const r = run([floorArea()], {}, (spec) => { spec.components.strongback.section = { depthMm: 140, widthMm: 35 }; });
  assert.match(group(r, "STRONGBACKS").rows[0].product, /140x35/);
});
t("engine: same result whatever order the measurements are assigned in (deterministic)", () => {
  const ms = [floorArea(), voidArea("v2", rect(900, 900, 800, 1500), "Stair void 2"), voidArea("v1", rect(1000, 2400, 3500, 900), "Stair void 1")];
  const a = run(ms, { centresMm: 450 }), b = run([...ms].reverse(), { centresMm: 450 });
  assert.deepEqual(a.lines.map((l) => [l.bucketKey, l.quantity]).sort(), b.lines.map((l) => [l.bucketKey, l.quantity]).sort());
  assert.deepEqual(a.groups, b.groups);
});
t("engine: no outline yet is a plain note, not a crash or a zero", () => {
  const r = run([voidArea("v1", rect(1000, 1000, 1000, 1000), "Stair void 1")]);
  assert.ok(r.res.problems.some((p) => p.code === "floor_outline_missing"));
  assert.equal(r.lines.length, 0);
});
t("engine: an unscaled page says to scale it", () => {
  const m = { ...floorArea(), calibrationId: "nope" };
  const r = run([m]);
  assert.ok(r.res.problems.some((p) => p.blocking));
  assert.equal(r.lines.length, 0);
});
t("engine: walls ignore floor areas and the floor frame refuses walls (measurement_unused, never silently dropped)", () => {
  const wallsSpec = wallFramingDefaults([]); const wk = methodFor(wallsSpec);
  const wallsMat = { id: "walls", name: "Walls", methodKey: wk.key, methodVersion: wk.version, spec: wallsSpec, rules: { ...WALL_FRAMING_RULES } };
  const c = computeWorkspace({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [{ id: "d", status: "current" }], calibrations: [cal],
    materials: [wallsMat], measurements: [floorArea()], contributions: [{ id: "c0", measurementId: "f1", jobMaterialId: "walls", role: "primary" }] });
  assert.ok(c.materialResults.walls.problems.some((p) => p.code === "measurement_unused"));
  assert.deepEqual(methodReads({ methodKey: "floor_framing", spec: { family: "timber" } }), ["area"]);
  assert.deepEqual(methodReads({ methodKey: "wall_framing", spec: { family: "timber" } }), ["wall"]);
});

// ── server whitelist ─────────────────────────────────────────────────────────────────────────────────────────
t("server: an area keeps only role, shape, name and stair; unknown keys are dropped; no role = no inputs", () => {
  assert.deepEqual(cleanMeasurementInputs("area", { role: "floor", kind: "rect", name: "Floor, Ground", stair: true, evil: 1, totals: { m2: 99 } }, null), { role: "floor", kind: "rect", name: "Floor, Ground" });
  assert.deepEqual(cleanMeasurementInputs("area", { role: "void", kind: "polygon", stair: false }, null), { role: "void", kind: "polygon", name: null, stair: false });
  assert.deepEqual(cleanMeasurementInputs("area", { role: "void" }, null), { role: "void", kind: "rect", name: null, stair: true });
  assert.equal(cleanMeasurementInputs("area", { role: "hax" }, null), null);
  assert.equal(cleanMeasurementInputs("area", {}, null), null);
});
t("server: the Floor frame item is accepted (method, spec parts) and its rules keep the per-edge and per-void maps", () => {
  const spec = floorFramingDefaults(); const mk = methodFor(spec);
  assert.deepEqual(mk, { key: "floor_framing", version: 1 });
  const uuid = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const rules = { centresMm: 450, span: "short", strongbackRows: 2, lastBeamSize: "445x63", beams: { e0: "445x63", e1: "unsized" }, trimmerSizes: { [uuid]: "400x63" } };
  const out = cleanMaterialContent({ name: "Floor", methodKey: mk.key, methodVersion: mk.version, spec, rules });
  assert.equal(out.spec.purpose, "floor");
  assert.deepEqual(out.rules, rules);
  assert.deepEqual(Object.keys(out.spec.components), ["strongback", "beam", "trimmer"]);
  assert.deepEqual(out.spec.components.strongback.section, { depthMm: 120, widthMm: 35 });
  assert.equal(out.spec.components.beam.section.depthMm, null, "no default beam size");
  assert.equal(_test.cleanGenericRules({ a: 1 }).a, 1);
});
t("a new Floor frame item needs nothing before ordering (the engine's own material problems are empty)", () => {
  const r = run([floorArea()]);
  assert.equal(r.res.status.procurement, "ready");   // missing-product would mean the item still needs setup
  assert.ok(!r.res.problems.some((p) => p.code === "material_incomplete"));
});
t("tools: a Floor frame is drawn with Rectangle or Outline (and Pan), is not a Walls item, and has no Select", () => {
  const spec = floorFramingDefaults(); const mk = methodFor(spec);
  const m = { id: "f", name: "Floor frame", methodKey: mk.key, methodVersion: mk.version, spec, rules: {} };
  assert.ok(isFloorItem(m) && !isWallsItem(m) && !usesWalls(m));
  assert.deepEqual(toolsFor(m).map((x) => x.k), ["rect", "area", "pan"]);
  assert.deepEqual(toolsFor(m).map((x) => x.label), ["Rectangle", "Outline", "Pan"]);
  assert.ok(!isFloorItem({ methodKey: "wall_framing", spec: { family: "timber", purpose: "walls" } }));
});
t("review fixes: short void-cut pieces get no mid-span row; bad row override is flagged; a void crossing an L notch is rejected", () => {
  const base = { outline: rect(6000, 4200), voids: [{ id: "v", name: "Stair", stair: true, points: rect(1000, 2700, 2000, 750) }], rules: { centresMm: 450 } };
  const lay = layoutFloor(base);
  assert.ok(lay.totals.midStrongbackLm < 5, `mid lm ${lay.totals.midStrongbackLm}`);
  const bad = layoutFloor({ outline: rect(6000, 4200), rules: { strongbackRows: 5 } });
  assert.ok(bad.problems.some((p) => p.code === "floor_strongback_rows_invalid"));
  const L = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 2000 }, { x: 3000, y: 2000 }, { x: 3000, y: 4200 }, { x: 0, y: 4200 }];
  const cross = layoutFloor({ outline: L, voids: [{ id: "v", name: "Hole", stair: true, points: [{ x: 2000, y: 1000 }, { x: 4000, y: 1000 }, { x: 4000, y: 3000 }, { x: 2000, y: 3000 }] }], rules: {} });
  assert.ok(cross.problems.some((p) => p.code === "floor_void_outside"));
});
t("version: the calculation is stamped takeoff-calc@11 so saved orders offer an update", () => { assert.match(CALCULATION_VERSION, /^takeoff-calc@11$/); });

// ── P1 owner decisions, 18 Nov 2026 (Sam approved all six recommendations) ──────────────────────────────────
t("tolerance: a traced width within 5 mm over a centres multiple adds no truss; 6 mm over does", () => {
  assert.equal(TRUSS_COUNT_TOLERANCE_MM, 5);
  const n = (w) => layoutFloor({ outline: rect(w, 3000), rules: { centresMm: 450 } }).totals.trussCount;
  assert.equal(n(5400), 13); assert.equal(n(5403), 13); assert.equal(n(5405), 13); assert.equal(n(5406), 14);
  assert.equal(n(5395), 13, "under a multiple is unchanged");
});
t("edge labels: truss-end edges are A, B, C ... (never the outline edge number); stale and unsized messages use the letter", () => {
  assert.deepEqual([1, 2, 26, 27, 28, 52, 53].map(edgeLabel), ["A", "B", "Z", "AA", "AB", "AZ", "BA"]);
  const r = layoutFloor({ outline: rect(6000, 4200), rules: { centresMm: 450, beams: { e2: "445x63" } } });
  assert.deepEqual(r.edges.filter((e) => e.kind === "end").map((e) => e.label), ["A", "B"]);
  assert.equal(r.beams[0].label, "B"); assert.equal(r.endStrongbacks[0].label, "A");
  const l = layoutFloor({ outline: L_SHAPE, rules: { centresMm: 450 } });
  const ends = l.edges.filter((e) => e.kind === "end").map((e) => e.label);
  assert.deepEqual(ends, ["A", "B", "C", "D"].slice(0, ends.length));
  assert.ok(!r.edges.some((e) => e.label === "" || e.label === undefined));
});
t("engine: order notes and explain use the edge letter, not the outline number", () => {
  const r = run([floorArea()], { beams: { e2: "445x63" } });
  assert.ok(r.res.demands.some((d) => /Beam on edge B \(445x63\)/.test(d.label || d.note || JSON.stringify(d))));
  assert.ok(r.res.demands.some((d) => /End strongback, edge A/.test(JSON.stringify(d))));
  assert.ok(r.res.explain.some((x) => /Beams: edge B 445x63/.test(x)));
  assert.ok(!r.res.demands.some((d) => /edge [0-9]/.test(JSON.stringify(d))));
});
t("redrawing the floor outline clears the beam marks only (rules kept); the old material is untouched so one Undo restores it", () => {
  const mat = { id: "m1", rules: { centresMm: 600, beams: { e0: "445x63" }, lastBeamSize: "445x63" } };
  const out = withoutFloorBeams(mat);
  assert.equal(out.rules.beams, undefined); assert.equal(out.rules.centresMm, 600); assert.equal(out.rules.lastBeamSize, "445x63");
  assert.deepEqual(mat.rules.beams, { e0: "445x63" });
  assert.deepEqual(withoutFloorBeams({ id: "m2" }).rules, {});
});
t("engine: a wet area drawn on a floor item is allowed and ignored with a non-blocking note", () => {
  const base = run([floorArea()], {});
  const wet = run([floorArea(), { ...floorArea(), id: "w1", inputs: { role: "wet", name: "Bathroom" } }], {});
  const p = wet.res.problems.find((x) => x.code === "floor_wet_ignored");
  assert.ok(p && p.blocking === false && /Wet areas are used in the sheets phase/.test(p.message));
  assert.ok(!wet.res.problems.some((x) => x.code === "measurement_unused"));
  assert.equal(wet.res.status.quantity, base.res.status.quantity);
  assert.deepEqual(wet.res.demands.map((d) => [d.role, d.lengthMm, d.quantity]), base.res.demands.map((d) => [d.role, d.lengthMm, d.quantity]));
});
t("engine: a wet area with no floor outline still prompts to draw the outline (plus the wet note)", () => {
  const r = run([{ ...floorArea(), id: "w1", inputs: { role: "wet", name: "Bathroom" } }], {});
  const codes = r.res.problems.map((x) => x.code);
  assert.ok(codes.includes("floor_outline_missing")); assert.ok(codes.includes("floor_wet_ignored"));
});
t("decisions confirmed: beams/trimmers LVL Smart 10 H2 longest 11,000; strongbacks MGP10 H2 longest 6,000; cut stair void counts its pieces", () => {
  const d = floorFramingDefaults();
  const txt = JSON.stringify(d);
  assert.match(txt, /11000/); assert.match(txt, /6000/);
  const r = layoutFloor({ outline: rect(6000, 4200), voids: [{ id: "v1", stair: true, points: rect(1000, 2400, 2000, 900) }], rules: { centresMm: 450 } });
  assert.ok(r.totals.trussCount > 15, "trusses cut by a void are counted as their pieces");
});

console.log(`takeoff-tc-floor: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);