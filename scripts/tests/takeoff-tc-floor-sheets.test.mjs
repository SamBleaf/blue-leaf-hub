// Floor frame, Phase 2 (floor_framing@1): Structaflor main-floor sheets, wet areas. Plan: docs/takeoff/FLOOR_FRAMING_PLAN.md section 7
//   node scripts/tests/takeoff-tc-floor-sheets.test.mjs
import assert from "node:assert/strict";
import { buildCalibration, CALCULATION_VERSION, computeWorkspace, methodFor, buildSupplierGroups, floorFramingDefaults, FLOOR_FRAMING_RULES } from "../../shared/takeoff/index.js";
import { layoutFloor } from "../../shared/takeoff/engine/floor/geometry.js";
import { layoutSheets, structaflorThicknessMm, PACK_FIT_TOLERANCE_MM, STAGGER_MIN_MM } from "../../shared/takeoff/engine/floor/sheets.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 9).join("\n    ")}`); } }
const near = (a, b, eps = 0.01, what = "") => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} ≈ ${b}`);
const rect = (w, h, x = 0, y = 0) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const L_SHAPE = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 2000 }, { x: 3000, y: 2000 }, { x: 3000, y: 4200 }, { x: 0, y: 4200 }];

/** frame layout + sheets straight from the engine, plan-frame millimetres */
function sheets(outline, rules = {}, { voids = [], wets = [] } = {}) {
  const r = { centresMm: 450, ...rules };
  const lay = layoutFloor({ outline, voids, wets, rules: r });
  assert.ok(!lay.problems.some((p) => p.blocking), JSON.stringify(lay.problems));
  const sh = layoutSheets({ outline, voids: lay.voids, wets: lay.wets, rules: r, lines: lay.lines, minU: lay.frame.minU, centresMm: r.centresMm });
  return { lay, sh };
}
const wet = (pts, name = "Wet area 1", id = "w1") => ({ id, name, points: pts });
const vd = (pts, name = "Stair void 1", id = "v1") => ({ id, name, stair: true, points: pts });

// ── the plan's worked example (section 7.7), recomputed by hand ─────────────────────────────────────────────
// 6.0 x 4.2 m, trusses span the 4.2 m side. Rows across: 4200 / 800 = 5 full rows + one 200 mm rip = 6 rows.
//   Row A (rows 1, 3, 5): 3600 + 2400.  Row B (rows 2, 4, 6): 1800 + 3600 + 600.   Whole sheets: 3 + 2 = 5.
//   Cut pieces: 3 x 2400, 2 x 1800, 2 x 600 = 12,000 mm (+ cuts) -> 4 sheets: [2400+600] [2400+600] [2400] [1800+1800].
//   Row 6 is 200 wide: floor(790 / 200) = 3 strips per sheet, strips 1800 + 3600 + 600 = 2 lanes of stock -> 1 sheet.
//   Packed = 5 + 4 + 1 = 10.  No reuse: 5 whole + 7 cut pieces + 1 rip sheet = 13.  +5% -> 10.5 -> 11.
for (const centres of [450, 600]) {
  t(`worked example at ${centres} centres: 6 rows, 10 packed, 13 without reuse, 11 ordered with 5%`, () => {
    const { sh } = sheets(rect(6000, 4200), { centresMm: centres });
    assert.equal(sh.rows, 6);
    assert.deepEqual(sh.packed, { whole: 5, cut: 4, strips: 1, total: 10 });
    assert.equal(sh.packedNoReuseSheets, 13);
    assert.equal(sh.packedSheets, 10);
    assert.equal(sh.orderedSheets, 11);
    assert.equal(sh.sheet.thicknessMm, centres === 450 ? 19 : 22);
    assert.equal(sh.sheet.name, `STRUCTAFLOR 3600x800x${centres === 450 ? 19 : 22}`);
    assert.deepEqual(sh.rowJoints[0], [3600]); assert.deepEqual(sh.rowJoints[1], [1800, 5400]); assert.deepEqual(sh.rowJoints[2], [3600]);
    assert.equal(sh.rowJoints[5].join(), "1800,5400");
    near(sh.laidM2, 25.2); assert.match(sh.summary, /^11 sheets \(25\.2 m² laid, waste 5%\)$/);
  });
}
t("area check: 25.2 / 2.88 = 8.75 so 9 is the least possible; 10 is the realistic packed count", () => { assert.ok(Math.ceil(25.2 / 2.88) === 9 && sheets(rect(6000, 4200)).sh.packedSheets >= 9); });
t("pack tolerance is 10 mm and the saw cut 5: 1800 + 1800 fits one 3600 sheet only through it", () => {
  assert.equal(PACK_FIT_TOLERANCE_MM, 10);
  assert.equal(sheets(rect(3600, 1600)).sh.packed.total, 2);   // two rows of one whole 3600 sheet each
});

// ── reuse and waste ──────────────────────────────────────────────────────────────────────────────────────────
t("offcut reuse off: every piece takes its own sheet (13), and waste is added after it (14)", () => {
  const { sh } = sheets(rect(6000, 4200), { reuseOffcuts: false });
  assert.equal(sh.packedSheets, 13); assert.equal(sh.orderedSheets, 14); assert.equal(sh.reuseOffcuts, false);
});
t("waste 0 / 5 / 10 percent on 10 packed sheets: 10 / 11 / 11, rounded UP to whole sheets, applied after reuse", () => {
  const w = (p) => sheets(rect(6000, 4200), { wastePct: p }).sh.orderedSheets;
  assert.equal(w(0), 10); assert.equal(w(5), 11); assert.equal(w(10), 11); assert.equal(w(11), 12); assert.equal(w(null), 11);
});
t("a waste outside 0 to 50 falls back to 5% with a note, never blocks", () => {
  const { sh } = sheets(rect(6000, 4200), { wastePct: 80 });
  assert.equal(sh.orderedSheets, 11); assert.ok(sh.problems.some((p) => p.code === "floor_sheet_waste_invalid" && p.blocking === false));
});

// ── thickness from centres ───────────────────────────────────────────────────────────────────────────────────
t("thickness comes from the centres: 19 mm at 450 (and closer), 22 mm at 600", () => {
  assert.equal(structaflorThicknessMm(300), 19); assert.equal(structaflorThicknessMm(450), 19); assert.equal(structaflorThicknessMm(600), 22);
  assert.ok(sheets(rect(6000, 4200), { centresMm: 800 }).sh.problems.some((p) => p.code === "floor_sheet_centres"));
});

// ── 3600 x 600 option ───────────────────────────────────────────────────────────────────────────────────────
t("3600 x 600 sheets: 4200 / 600 = 7 rows, no rip; 4 A rows + 3 B rows", () => {
  const { sh } = sheets(rect(6000, 4200), { sheetWidthMm: 600 });
  assert.equal(sh.rows, 7); assert.equal(sh.rippedRowWidthMm, null);
  assert.equal(sh.sheet.name, "STRUCTAFLOR 3600x600x19");
  // whole: A 4 + B 3 = 7; cuts: 4 x 2400, 3 x 1800, 3 x 600 = 14,400 + 5,400 + 1,800 = 21,600 mm -> at least 6 sheets
  assert.equal(sh.packed.whole, 7); assert.ok(sh.packed.cut >= 6 && sh.packed.cut <= 7, `cut ${sh.packed.cut}`);
  assert.equal(sh.packed.strips, 0);
});

// ── joints: every end joint on a truss line, adjacent rows staggered at least 600 ───────────────────────────
function checkJoints(outline, rules, shapes = {}) {
  const { lay, sh } = sheets(outline, rules, shapes);
  const truss = lay.lines.map((l) => l.uMm);
  sh.rowJoints.forEach((js, r) => {
    for (const j of js) assert.ok(truss.some((u) => Math.abs(u - j) < 0.2), `row ${r + 1}: joint at ${j} is not on a truss line (${truss.slice(0, 6)}…)`);
    if (r > 0) for (const a of js) for (const b of sh.rowJoints[r - 1]) assert.ok(Math.abs(a - b) >= STAGGER_MIN_MM - 1e-6, `rows ${r} and ${r + 1}: joints ${b} and ${a} are under ${STAGGER_MIN_MM} apart`);
  });
  assert.ok(!sh.problems.some((p) => /stagger|off_truss/.test(p.code)), JSON.stringify(sh.problems));
  return sh;
}
t("stagger >= 600 and every end joint on a truss line: rectangles at 300 / 400 / 450 / 600 centres", () => {
  for (const [w, h] of [[6000, 4200], [7210, 3333], [9000, 6100], [4800, 2700], [12000, 5000], [3600, 3000], [3000, 2000], [10250, 7400]]) for (const c of [300, 400, 450, 600]) checkJoints(rect(w, h), { centresMm: c });
});
t("stagger >= 600 and joints on truss lines: L-shapes and both truss directions", () => {
  for (const c of [450, 600]) for (const span of ["short", "long"]) {
    checkJoints(L_SHAPE, { centresMm: c, span });
    checkJoints(rect(6000, 4200), { centresMm: c, span });
  }
});
t("a row no longer than one sheet is one piece with no joint and no offset (3.0 x 2.0 m)", () => {
  const { sh } = sheets(rect(3000, 2000));
  assert.ok(sh.rowJoints.every((j) => j.length === 0));
  assert.equal(sh.pieces.length, sh.rows);
});
t("sheet pieces are deterministic and cover the main floor within the cut waste", () => {
  const a = sheets(rect(6000, 4200)).sh, b = sheets(rect(6000, 4200)).sh;
  assert.deepEqual(a, b);
  const area = a.pieces.reduce((s, p) => s + p.lengthMm * p.widthMm, 0) / 1e6;
  near(area, 25.2, 0.01);
});

// ── voids, wet areas, L-shape ────────────────────────────────────────────────────────────────────────────────
t("wet area deduction: 6.0 x 4.2 less a 2.4 x 1.8 wet area = 20.88 m² main floor, 4.32 m² wet", () => {
  const w = wet(rect(2400, 1800));
  const { lay, sh } = sheets(rect(6000, 4200), {}, { wets: [w] });
  near(lay.totals.mainAreaM2, 20.88); near(lay.totals.wetM2, 4.32); near(lay.wets[0].areaM2, 4.32); near(lay.totals.floorAreaM2, 25.2);
  near(sh.laidM2, 20.88);
  assert.ok(sh.orderedSheets <= sheets(rect(6000, 4200)).sh.orderedSheets, "a wet area never adds sheets");
});
t("wet area and void together: main = outline - voids - wet; sheets avoid both", () => {
  const { lay, sh } = sheets(rect(6000, 4200), {}, { wets: [wet(rect(2400, 1800))], voids: [vd(rect(1200, 2400, 3600, 1200))] });
  near(lay.totals.mainAreaM2, 25.2 - 4.32 - 2.88); near(lay.totals.openingsM2, 2.88);
  near(sh.laidM2, 25.2 - 4.32 - 2.88);
  for (const p of sh.pieces) { const xs = p.corners.map((c) => c.x), ys = p.corners.map((c) => c.y); assert.ok(Math.min(...xs) >= -0.2 && Math.max(...xs) <= 6000.2 && Math.min(...ys) >= -0.2 && Math.max(...ys) <= 4200.2); }
});
t("a wet area outside the outline is a blocking problem; so is one over a void or another wet area", () => {
  const blocked = (shapes, code) => assert.ok(layoutFloor({ outline: rect(6000, 4200), rules: { centresMm: 450 }, ...shapes }).problems.some((p) => p.code === code && p.blocking), code);
  blocked({ wets: [wet(rect(2000, 1000, 5500, 3900))] }, "floor_wet_outside");
  blocked({ wets: [wet(rect(2000, 1000, -500, 100))] }, "floor_wet_outside");
  blocked({ wets: [wet(rect(2000, 1000, 1000, 1000))], voids: [vd(rect(1500, 1500, 1500, 1200))] }, "floor_wet_overlap");
  blocked({ wets: [wet(rect(2000, 1000, 1000, 1000)), wet(rect(2000, 1000, 1500, 1200), "Wet area 2", "w2")] }, "floor_wet_overlap");
});
t("polygon wet areas only block on real overlap, not bounding boxes (review D1)", () => {
  const tri = [{ x: 500, y: 500 }, { x: 2500, y: 500 }, { x: 500, y: 2500 }];
  const has = (shapes) => layoutFloor({ outline: rect(6000, 4200), rules: { centresMm: 450 }, ...shapes }).problems.some((p) => p.code === "floor_wet_overlap");
  assert.equal(has({ wets: [wet(tri)], voids: [vd(rect(900, 900, 1700, 1700))] }), false, "disjoint triangle and void");
  assert.equal(has({ wets: [wet(tri)], voids: [vd(rect(900, 900, 900, 900))] }), true, "void inside the triangle");
  assert.equal(has({ wets: [wet(tri), wet(rect(900, 900, 1700, 1700), "Wet area 2", "w2")] }), false, "disjoint wets");
});
t("a sheet end beside a wet edge that is off a truss line gets a non-blocking note (review D2)", () => {
  const { sh } = sheets(rect(6000, 4200), {}, { wets: [wet(rect(2400, 1800))] });
  const n = sh.problems.find((p) => p.code === "floor_sheet_opening_edge");
  assert.ok(n && !n.blocking, "note present and non-blocking");
  assert.ok(!sheets(rect(6000, 4200)).sh.problems.some((p) => p.code === "floor_sheet_opening_edge"), "no note without openings");
});
t("a void that fills the whole row strip splits the row into two segments, each laid from its own start", () => {
  // a 1.2 m wide void through the full height of rows 2 to 3 (v 800 to 2400): rows 2 and 3 have two segments
  const { sh } = sheets(rect(6000, 4200), {}, { voids: [vd(rect(1200, 1600, 2400, 800))] });
  const row2 = sh.pieces.filter((p) => p.row === 2);
  assert.ok(row2.length >= 2);
  assert.ok(row2.every((p) => { const xs = p.corners.map((c) => c.x); return Math.max(...xs) <= 2400.2 || Math.min(...xs) >= 3599.8; }), "no piece of row 2 crosses the void");
  near(sh.laidM2, 25.2 - 1.92);
  checkJoints(rect(6000, 4200), {}, { voids: [vd(rect(1200, 1600, 2400, 800))] });
});
t("L-shape: sheeted over the L only; area and a plausible count", () => {
  const { lay, sh } = sheets(L_SHAPE, {});
  near(lay.totals.mainAreaM2, 6 * 2 + 3 * 2.2);   // 12.0 + 6.6 = 18.6
  near(sh.laidM2, 18.6);
  assert.ok(sh.packedSheets >= Math.ceil(18.6 / 2.88) && sh.packedSheets <= 10, `L-shape ${sh.packedSheets}`);
});
t("no main floor to sheet (wet area fills the floor): no sheets, no order line", () => {
  const lay = layoutFloor({ outline: rect(2400, 1800), rules: { centresMm: 450 }, wets: [wet(rect(2400, 1800))] });
  const sh = layoutSheets({ outline: rect(2400, 1800), voids: [], wets: lay.wets, rules: { centresMm: 450 }, lines: lay.lines, minU: lay.frame.minU, centresMm: 450 });
  assert.equal(sh, null);
});

// ── through the real engine: demands, the FLOORING heading, the wet note ─────────────────────────────────────────
const k = 0.05, X0 = 100, Y0 = 100;
const H = { p1: { x: X0, y: Y0 - 40 }, p2: { x: X0 + 12000 * k, y: Y0 - 40 }, knownMm: 12000 };
const V = { p1: { x: X0 - 40, y: Y0 }, p2: { x: X0 - 40, y: Y0 + 8000 * k }, knownMm: 8000 };
const cal = { id: "cal", documentId: "d", pageIndex: 0, ...buildCalibration({ basisRotation: 0, horizontal: H, vertical: V }).calibration, status: "ready" };
const at = (p) => ({ x: X0 + p.x * k, y: Y0 + p.y * k });
const area = (id, pts, inputs) => ({ id, kind: "area", documentId: "d", pageIndex: 0, calibrationId: "cal", points: pts.map(at), inputs });
const floorArea = (pts = rect(6000, 4200), id = "f1") => area(id, pts, { role: "floor", kind: pts.length === 4 ? "rect" : "polygon" });
const wetArea = (id, pts, name = "Wet area 1") => area(id, pts, { role: "wet", kind: "rect", name });
function run(measurements, rules = {}) {
  const spec = floorFramingDefaults();
  const mk = methodFor(spec);
  const mat = { id: "floor", name: "Floor", methodKey: mk.key, methodVersion: mk.version, spec, rules: { ...FLOOR_FRAMING_RULES, ...rules } };
  const c = computeWorkspace({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [{ id: "d", status: "current" }], calibrations: [cal],
    materials: [mat], measurements, contributions: measurements.map((m, i) => ({ id: `c${i}`, measurementId: m.id, jobMaterialId: "floor", role: "primary" })) });
  const res = c.materialResults.floor;
  const groups = buildSupplierGroups([{ lines: c.scheduleLines.filter((l) => l.roles).map((l) => ({ unit: l.unit, quantity: l.quantity, stockLengthMm: l.item.stockLengthMm, roles: l.roles, product: l.product || null, hoop: l.hoop || null, bracing: l.bracing || null, description: l.item.description, problem: l.problems.length > 0 })) }]);
  return { c, res, groups, lay: res.layouts[0] || null };
}
t("engine: the order has FLOORING: STRUCTAFLOR 3600x800x19, 11 sheets, listed after the trusses and strongbacks", () => {
  const r = run([floorArea()]);
  assert.equal(r.res.status.quantity, "calculated", JSON.stringify(r.res.problems.filter((p) => p.blocking)));
  const g = r.groups.find((x) => x.heading === "FLOORING");
  assert.ok(g, r.groups.map((x) => x.heading).join());
  assert.equal(g.rows.length, 1); assert.equal(g.rows[0].product, "STRUCTAFLOR 3600x800x19"); assert.equal(g.rows[0].unit, "EA"); assert.equal(g.rows[0].quantity, 11);
  assert.deepEqual(r.groups.map((x) => x.heading), ["FLOOR TRUSSES", "STRONGBACKS", "FLOORING"]);
  assert.equal(r.lay.sheets.summary, "11 sheets (25.2 m² laid, waste 5%)");
});
t("engine: 600 centres orders the 22 mm sheet; 3600 x 600 and waste settings change the line", () => {
  assert.equal(run([floorArea()], { centresMm: 600 }).groups.find((x) => x.heading === "FLOORING").rows[0].product, "STRUCTAFLOR 3600x800x22");
  const r = run([floorArea()], { sheetWidthMm: 600, wastePct: 0 });
  const row = r.groups.find((x) => x.heading === "FLOORING").rows[0];
  assert.equal(row.product, "STRUCTAFLOR 3600x600x19"); assert.equal(row.quantity, r.lay.sheets.packedSheets);
});
t("engine: a wet area is deducted, shown as a note (never an order line), and no longer says 'used in the sheets phase'", () => {
  const r = run([floorArea(), wetArea("w1", rect(2400, 1800))]);
  assert.equal(r.res.status.quantity, "calculated");
  near(r.lay.totals.mainAreaM2, 20.88); near(r.lay.totals.wetM2, 4.32);
  const note = r.res.problems.find((p) => p.code === "floor_wet_pending");
  assert.ok(note && note.blocking === false && /^Wet area flooring \(Scyon, phase 3\): 4\.32 m² — not counted yet$/.test(note.message), JSON.stringify(note));
  assert.ok(!r.res.problems.some((p) => p.code === "floor_wet_ignored"));
  assert.ok(!r.groups.some((g) => /SCYON|WET/i.test(g.heading) || g.rows.some((x) => /scyon/i.test(x.product))));
  assert.equal(r.lay.sheets.laidM2, 20.88);
});
t("engine: a wet area outside the outline makes the order Incomplete with a plain line", () => {
  const r = run([floorArea(), wetArea("w1", rect(2000, 1000, 5500, 3900))]);
  assert.equal(r.res.status.quantity, "incomplete");
  assert.ok(r.res.problems.some((p) => p.code === "floor_wet_outside" && p.blocking && /outside the floor outline/.test(p.message)));
});
t("version: the calculation is stamped takeoff-calc@12 (a floor with an outline now gains a sheet count, so saved orders offer an update)", () => { assert.match(CALCULATION_VERSION, /^takeoff-calc@12$/); });

console.log(`takeoff-tc-floor-sheets: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
