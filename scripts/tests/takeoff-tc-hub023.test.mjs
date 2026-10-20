// Hub review HUB 023, wall-by-wall plan step 3: Rectangle and Area on a scaled elevation. Pure rules from the measure
// helpers: which materials get Rectangle + Area, a Rectangle's four square corners (a corner drag moves that corner
// only, on either shape), the outline's frame (the engine's own: x from its leftmost corner, y up from its lowest, every page
// rotation and separate X / Y scales), corners on the nearest 10 mm, its m², tapping it (inside, or its closing side), an outline that crosses
// itself, a window or door from two opposite corners, and openings staying put when a corner moves (cut back past any
// side, refused when wholly off the wall by its box or its slope, a door that grows to reach the floor). Then, through the
// REAL engine (computeWorkspace): a 4 × 3 m Rectangle is 12 m² laid out with real sheet sizes, a five-corner Area keeps
// its corners and its area, area alone never bypasses the sheet layout, a corner drag changes the sheets at once, and
// an opening tapped on the outline is cut out where it was tapped, before and after a corner moves.
// The screens are in e2e/ui-review/tc-measure.spec.js; the real server keeping the outline is in takeoff-api.test.mjs.
import assert from "node:assert/strict";
import { isOutline, nextOpeningLabel, openingRecord, outlineWallInputs, sheetSummaryText, toolsFor, wallSheetSummary, SHAPE_TOOLS, OPENING_TOOLS } from "../../src/components/takeoff/measure/tools.js";
import { closedRing, distToPolyline, isRectOutline, keepOpeningsInPlace, openingOutsideOutline, outlineAreaM2, outlineAt, outlineFrame, outlineOpening, outlineProblem, pointInPolygon, rectCorners, snapToMmGrid } from "../../src/components/takeoff/measure/geometry.js";
import { fmtM2 } from "../../src/components/takeoff/format.js";
import { buildCalibration, computeWorkspace, methodFor } from "../../shared/takeoff/index.js";
import { productGroups, specFromGroup } from "../../shared/takeoff/products/index.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } }
const near = (a, b, eps = 1e-6, what = "") => assert.ok(Math.abs(a - b) <= eps, `${what} ${a} ≈ ${b}`);

// an elevation page at 1:100-ish: k PDF units per mm, origin (100, 100), the same scale both ways (checked)
const k = 0.05, X0 = 100, Y0 = 100;
const H = { p1: { x: X0, y: Y0 - 40 }, p2: { x: X0 + 12000 * k, y: Y0 - 40 }, knownMm: 12000 };
const V = { p1: { x: X0 - 40, y: Y0 }, p2: { x: X0 - 40, y: Y0 + 8000 * k }, knownMm: 8000 };
const cal = { id: "cal", documentId: "d", pageIndex: 0, ...buildCalibration({ basisRotation: 0, horizontal: H, vertical: V }).calibration, status: "ready" };
// PDF y runs UP the page: at(x, y) is x mm across and y mm up
const at = (x, y) => ({ x: X0 + x * k, y: Y0 + y * k });

// the REAL engine on one Axon 400 smooth cladding (every wall on it)
const fam = (spec) => { const m = methodFor(spec); return { spec, methodKey: m.key, methodVersion: m.version }; };
const axon = productGroups({ family: "cladding" }).find((g) => g.name === "Axon 400 smooth");
function engine(measurements, extraContribs = [], c = cal, extraMats = []) {
  const mats = [{ id: "clad", name: "Axon 400 smooth", ...fam({ ...specFromGroup(axon), assemblyId: "axon-vertical", spareRate: 0 }), rules: { route: "cavity" } }, ...extraMats];
  const walls = measurements.filter((m) => m.kind === "wall");
  return computeWorkspace({ workspace: { id: "ws", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [{ id: "d", status: "current" }], calibrations: [{ ...c, documentId: "d", pageIndex: 0, status: "ready" }],
    materials: mats, measurements, contributions: [...walls.map((w) => ({ id: `c-${w.id}`, measurementId: w.id, jobMaterialId: "clad", role: "wall" })), ...extraContribs] });
}
const outline = (id, points, name = "Wall 1") => ({ id, kind: "wall", documentId: "d", pageIndex: 0, calibrationId: "cal", points, inputs: { kind: "polygon", name } });

t("Rectangle and Area sit beside Line on every cladding-type wall material (timber walls, flashing and aluminium unchanged)", () => {
  const keys = (spec, methodKey = "sheet_layout") => toolsFor({ spec, methodKey }).map((x) => x.k);
  for (const family of ["cladding", "aac", "foam", "timber-cladding", "batten", "accessory"]) assert.deepEqual(keys({ family }), ["line", "rect", "area", "select", "pan"], family);
  assert.deepEqual(toolsFor({ spec: { family: "cladding" }, methodKey: "sheet_layout" }).map((x) => x.label), ["Line", "Rectangle", "Area", "Select", "Pan"]);
  assert.deepEqual(keys({ family: "timber", purpose: "studs" }, "wall_frame"), ["wall", "select", "pan"]);
  assert.deepEqual(keys({}, "flashing_runs"), ["run", "count", "select", "pan"]);
  assert.deepEqual(keys({ family: "aluminium" }, "linear_stock"), ["run", "select", "pan"]);
  assert.deepEqual([...SHAPE_TOOLS], ["rect", "area"]);
  assert.deepEqual([...OPENING_TOOLS], ["line", "rect", "area"], "+ Window / + Door in Line, Rectangle and Area");
});

t("an outline wall is a traced elevation outline named like any other wall (Wall N), with no height of its own", () => {
  const ms = [{ kind: "wall", inputs: { name: "Wall 1", heightMm: 2700 } }, { kind: "wall", inputs: { name: "Wall 2" } }];
  assert.deepEqual(outlineWallInputs(ms), { kind: "polygon", name: "Wall 3" });
  assert.equal(isOutline({ kind: "wall", inputs: { kind: "polygon" }, points: [at(0, 0), at(1, 0), at(1, 1)] }), true);
  assert.equal(isOutline({ kind: "wall", inputs: { kind: "rect" }, points: [at(0, 0), at(1, 0)] }), false);
  assert.equal(isOutline({ kind: "wall", inputs: { kind: "polygon" }, points: [at(0, 0), at(1, 0)] }), false, "fewer than three corners is no outline");
});

t("Rectangle: two opposite corners make four square corners (either diagonal, any tap order); a hand-drawn shape is not a rectangle", () => {
  const r = rectCorners(at(1000, 1000), at(5000, 4000));
  assert.deepEqual(r, [at(1000, 1000), at(5000, 1000), at(5000, 4000), at(1000, 4000)]);
  assert.equal(isRectOutline(r), true);
  assert.equal(isRectOutline(rectCorners(at(5000, 1000), at(1000, 4000))), true, "the other diagonal");
  assert.equal(isRectOutline(rectCorners(at(5000, 4000), at(1000, 1000))), true, "top right first");
  assert.equal(isRectOutline([at(0, 0), at(4000, 0), at(4000, 3000), at(0, 3001)]), false, "a corner off by 1 mm");
  assert.equal(isRectOutline([at(0, 0), at(4000, 0), at(4000, 3000)]), false);
  assert.equal(isRectOutline([at(0, 0), at(4000, 0), at(4000, 0), at(0, 3000)]), false, "two corners on top of each other");
});

t("acceptance 8: a 4 m × 3 m Rectangle on a scaled elevation reads 12.00 m² (and 4,000 wide × 3,000 high in the engine's frame)", () => {
  const r = rectCorners(at(1000, 1000), at(5000, 4000));
  near(outlineAreaM2(r, cal), 12, 1e-9, "m²");
  assert.equal(fmtM2(outlineAreaM2(r, cal)), "12.00");
  const f = outlineFrame(r, cal);
  near(f.widthMm, 4000, 1e-9); near(f.heightMm, 3000, 1e-9);
  assert.equal(outlineAreaM2(r, null), null, "no scale: no area");
  assert.equal(fmtM2(1234.5), "1,234.50");
});

t("the outline's frame is the engine's own on every page rotation and on a stretched (separate X / Y) scale: a point goes there and back exactly", () => {
  for (const rot of [0, 90, 180, 270]) {
    for (const mode of ["uniform", "separate"]) {
      const side = rot % 180 !== 0;
      const Hs = { p1: { x: 0, y: 0 }, p2: side ? { x: 0, y: 100 } : { x: 100, y: 0 }, knownMm: 4000 };
      const Vs = { p1: { x: 0, y: 0 }, p2: side ? { x: mode === "separate" ? 50 : 100, y: 0 } : { x: 0, y: mode === "separate" ? 50 : 100 }, knownMm: 4000 };
      const c = { id: "c", ...buildCalibration({ basisRotation: rot, horizontal: Hs, vertical: Vs, mode }).calibration };
      const pts = [{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 40 }, { x: 35, y: 55 }, { x: 10, y: 40 }];
      const f = outlineFrame(pts, c);
      // the same frame as dispatch.js resolveWall: x from the leftmost corner, y up from the lowest
      const xs = f.polygon.map((p) => p.x), ys = f.polygon.map((p) => p.y);
      near(Math.min(...xs), 0, 1e-9, `${rot}/${mode} min x`); near(Math.min(...ys), 0, 1e-9, `${rot}/${mode} min y`);
      near(Math.max(...xs), f.widthMm, 1e-9); near(Math.max(...ys), f.heightMm, 1e-9);
      const p = { x: 23.3, y: 31.7 }, back = f.toPdf(f.toLocal(p));
      near(back.x, p.x, 1e-9, `${rot}/${mode} x back`); near(back.y, p.y, 1e-9, `${rot}/${mode} y back`);
      // the engine lays the wall out over exactly this outline
      const res = engine([{ id: "w", kind: "wall", documentId: "d", pageIndex: 0, calibrationId: "c", points: pts, inputs: { kind: "polygon", name: "Wall 1" } }], [], c);
      const L = res.materialResults.clad.layouts[0];
      near(L.areas.grossM2, outlineAreaM2(pts, c), 1e-9, `${rot}/${mode} m²`);
      assert.deepEqual(L.wall.bbox, { x0: 0, y0: 0, x1: f.widthMm, y1: f.heightMm }, `${rot}/${mode} bbox`);
    }
  }
});

t("an Area keeps every corner; one that crosses itself or has no area can't be a wall", () => {
  const gable = [at(1000, 1000), at(5000, 1000), at(5000, 3000), at(3000, 4500), at(1000, 3000)];
  near(outlineAreaM2(gable, cal), 11, 1e-9, "gable m²");   // 4 × 2 m + a 4 m × 1.5 m triangle
  assert.equal(outlineProblem(gable, cal), null);
  assert.equal(outlineProblem([at(0, 0), at(1000, 1000), at(1000, 0), at(0, 1000)], cal), "wall_self_intersecting");
  assert.equal(outlineProblem([at(0, 0), at(1000, 0), at(2000, 0)], cal), "wall_polygon_invalid");
  assert.equal(outlineProblem(gable, null), "wall_polygon_invalid", "no scale");
});

t("tapping an outline: inside it, or a finger's reach from any side — the closing side (last corner back to the first) too; the smaller of two that overlap", () => {
  const big = { id: "big", points: rectCorners(at(0, 0), at(8000, 6000)) };
  const small = { id: "small", points: rectCorners(at(1000, 1000), at(5000, 4000)) };
  const toScreen = (p) => ({ x: (p.x - X0) * 2, y: -(p.y - Y0) * 2 });   // 2 px per PDF unit, y down
  const tap = (p) => outlineAt([big, small], p, toScreen(p), toScreen)?.id ?? null;
  assert.equal(tap(at(3000, 2000)), "small", "inside both: the smaller one");
  assert.equal(tap(at(7000, 5000)), "big");
  assert.equal(tap(at(-100, 3000)), "big", "just outside the closing side (x = 0, from the last corner back to the first)");
  assert.equal(tap(at(-1000, 3000)), null, "too far off");
  assert.equal(pointInPolygon(at(3000, 2000), small.points), true);
  // the closing side is part of the shape: an open line would miss a tap there
  const sp = toScreen(at(1000, 2500));
  assert.ok(distToPolyline(sp, small.points.map(toScreen)) > 20, "open: far from the drawn line");
  assert.ok(distToPolyline(sp, closedRing(small.points).map(toScreen)) < 1e-9, "closed: on it");
});

t("+ Window on an outline: two opposite corners give offset, sill, width and height in real mm to the nearest 10 (any tap order); a door sits on the floor", () => {
  const f = outlineFrame(rectCorners(at(1000, 1000), at(5000, 4000)), cal);
  const w = outlineOpening(f, at(2003, 1997), at(3204, 3196), "window");
  assert.deepEqual(w, { ok: true, xMm: 1000, sillMm: 1000, widthMm: 1200, heightMm: 1200, clipped: false, tappedWidthMm: 1200, tappedHeightMm: 1200 });
  assert.deepEqual(outlineOpening(f, at(3204, 1997), at(2003, 3196), "window"), w, "the other diagonal, the other way round");
  const d = outlineOpening(f, at(3800, 1100), at(4600, 3100), "door");
  assert.deepEqual([d.xMm, d.sillMm, d.widthMm, d.heightMm, d.clipped], [2800, 0, 800, 2100, false], "the door goes down to the floor");
  // past the sides, bottom or top: cut back to the outline, and it says so (a finger's slip doesn't)
  const c = outlineOpening(f, at(4500, 2000), at(5600, 3000), "window", { slopMm: 100 });
  assert.deepEqual([c.xMm, c.widthMm, c.clipped, c.tappedWidthMm], [3500, 500, true, 1100]);
  const slip = outlineOpening(f, at(4500, 2000), at(5050, 3000), "window", { slopMm: 100 });
  assert.deepEqual([slip.widthMm, slip.clipped], [500, false]);
  const top = outlineOpening(f, at(2000, 3000), at(3000, 4400), "window", { slopMm: 100 });
  assert.deepEqual([top.sillMm, top.heightMm, top.clipped], [2000, 1000, true], "never above the top");
  assert.deepEqual(outlineOpening(f, at(2000, 2000), at(2004, 3000), "window"), { ok: false, reason: "too_small" });
  assert.deepEqual(outlineOpening(null, at(0, 0), at(1, 1), "window"), { ok: false, reason: "no_outline" });
  // under a gable's slope: inside the box but outside the outline → the plan says only the part on the wall comes off
  const gf = outlineFrame([at(0, 0), at(4000, 0), at(4000, 2000), at(2000, 3500), at(0, 2000)], cal);
  assert.equal(openingOutsideOutline(gf.polygon, { xMm: 1500, sillMm: 1500, widthMm: 1000, heightMm: 1000 }), false);
  assert.equal(openingOutsideOutline(gf.polygon, { xMm: 200, sillMm: 1500, widthMm: 800, heightMm: 1200 }), true);
});

/** A corner drag in Select: that corner only, on a Rectangle and an Area alike (HUB 023 "vertex edits"). */
const dragCorner = (pts, i, p) => pts.map((q, k) => (k === i ? p : q));

t("a corner drag moves that corner only, on a Rectangle as on an Area: a Rectangle can become a skillion, and its m² and size follow", () => {
  const r = rectCorners(at(1000, 1000), at(5000, 4000));
  const sk = dragCorner(r, 2, at(5000, 4600));                       // the top right corner up 600: a skillion
  assert.deepEqual(sk, [at(1000, 1000), at(5000, 1000), at(5000, 4600), at(1000, 4000)]);
  assert.equal(isRectOutline(sk), false, "no longer a rectangle");
  near(outlineAreaM2(sk, cal), 4 * (3 + 3.6) / 2, 1e-9, "13.2 m²");
  const f = outlineFrame(sk, cal);
  near(f.widthMm, 4000, 1e-9); near(f.heightMm, 3600, 1e-9);
  assert.equal(outlineProblem(sk, cal), null);
  near(outlineAreaM2(dragCorner(r, 0, at(-400, 1000)), cal), (5.4 + 4) / 2 * 3, 1e-9, "the left side leans out: 14.1 m²");
});

t("openings stay put on the page when the outline's lowest / leftmost corner moves; a door keeps its head and stays on the floor (and says it grew); past the new left or bottom is cut back; wholly off the wall refuses the move", () => {
  const r = rectCorners(at(1000, 1000), at(5000, 4000));
  const ops = [{ id: "w1", inputs: { xMm: 1000, sillMm: 1000, widthMm: 1200, heightMm: 1200, label: "W1", type: "window" } },
    { id: "d1", inputs: { xMm: 2800, sillMm: 0, widthMm: 800, heightMm: 2100, label: "D1", type: "door" } }];
  const m = rectCorners(at(-400, 500), at(5000, 4000));               // its left side and its floor both moved out
  const kept = keepOpeningsInPlace(r, m, cal, ops);
  assert.deepEqual([kept.cut, kept.lost, kept.outside], [[], [], []]);
  assert.deepEqual(kept.resized, [{ name: "D1", heightMm: 2600 }], "the door reaches the new floor, and says so");
  assert.deepEqual(kept.openings.map((o) => o.inputs), [
    { xMm: 2400, sillMm: 1500, widthMm: 1200, heightMm: 1200, label: "W1", type: "window" },
    { xMm: 4200, sillMm: 0, widthMm: 800, heightMm: 2600, label: "D1", type: "door" }]);
  // the window's corners are exactly where they were on the page
  const A = outlineFrame(r, cal), B = outlineFrame(m, cal);
  for (const [lx, ly, nx, ny] of [[1000, 1000, 2400, 1500], [2200, 2200, 3600, 2700]]) {
    const p = A.toPdf({ x: lx, y: ly }), q = B.toPdf({ x: nx, y: ny });
    near(q.x, p.x, 1e-9); near(q.y, p.y, 1e-9);
  }
  // the door's head stays where it was (its foot goes down to the new floor)
  near(B.toPdf({ x: 4200, y: 2600 }).y, A.toPdf({ x: 2800, y: 2100 }).y, 1e-9);
  // moving the far corner changes nothing for openings measured from the left and the bottom
  const far = keepOpeningsInPlace(r, dragCorner(r, 2, at(6000, 5000)), cal, ops);
  assert.deepEqual(far, { openings: ops, cut: [], lost: [], outside: [], resized: [] });
  // the left side moves in past W1's left edge: W1 is cut back to the new edge, its right edge stays
  const inward = keepOpeningsInPlace(r, rectCorners(at(2500, 1000), at(5000, 4000)), cal, ops);
  assert.deepEqual(inward.cut, ["W1"]);
  assert.deepEqual(inward.openings[0].inputs, { xMm: 0, sillMm: 1000, widthMm: 700, heightMm: 1200, label: "W1", type: "window" });
  // so far in that W1 is wholly off the wall: the move is refused
  assert.deepEqual(keepOpeningsInPlace(r, rectCorners(at(3500, 1000), at(5000, 4000)), cal, ops).lost, ["W1"]);
  // the bottom moves up past the window's sill: cut back from below
  const up = keepOpeningsInPlace(r, rectCorners(at(1000, 2500), at(5000, 4000)), cal, [ops[0]]);
  assert.deepEqual([up.openings[0].inputs.sillMm, up.openings[0].inputs.heightMm, up.cut], [0, 700, ["W1"]]);
});

t("openings past the new RIGHT or TOP side are cut back the same way, and one left wholly off the wall there (or above a lowered gable apex) refuses the move", () => {
  const r = rectCorners(at(1000, 1000), at(5000, 4000));
  const w1 = { id: "w1", inputs: { xMm: 1000, sillMm: 1000, widthMm: 1200, heightMm: 1200, label: "W1", type: "window" } };
  const d1 = { id: "d1", inputs: { xMm: 2800, sillMm: 0, widthMm: 800, heightMm: 2100, label: "D1", type: "door" } };
  // the right side in past D1's right edge: D1 cut back to it (400 wide), its left edge stays
  const right = keepOpeningsInPlace(r, rectCorners(at(1000, 1000), at(4200, 4000)), cal, [w1, d1]);
  assert.deepEqual([right.cut, right.lost, right.openings[1].inputs.xMm, right.openings[1].inputs.widthMm], [["D1"], [], 2800, 400]);
  // … and wholly past it: refused (the reviewer's top-right drag in to 2,500 × 1,500 leaves both off the wall)
  assert.deepEqual(keepOpeningsInPlace(r, rectCorners(at(1000, 1000), at(3500, 4000)), cal, [w1, d1]).lost, ["D1"]);
  assert.deepEqual(keepOpeningsInPlace(r, rectCorners(at(1000, 1000), at(3500, 2500)), cal, [{ ...w1, inputs: { ...w1.inputs, sillMm: 2000, widthMm: 600, heightMm: 600 } },
    { ...d1, inputs: { ...d1.inputs, xMm: 3000 } }]).lost, ["W1", "D1"]);
  // the top down past W1's head and D1's head: both cut back from above (the door keeps its foot on the floor)
  const top = keepOpeningsInPlace(r, rectCorners(at(1000, 1000), at(5000, 2600)), cal, [w1, d1]);
  assert.deepEqual(top.cut, ["W1", "D1"]);
  assert.deepEqual(top.openings.map((o) => [o.inputs.sillMm, o.inputs.heightMm]), [[1000, 600], [0, 1600]]);
  assert.deepEqual(top.resized, [], "a cut door is in the cut note, not the grown one");
  // … and wholly below W1's sill: refused
  assert.deepEqual(keepOpeningsInPlace(r, rectCorners(at(1000, 1000), at(5000, 1800)), cal, [w1]).lost, ["W1"]);
  // a gable: W2 high in the gable; the apex comes down and across so W2 is wholly above the slope, though still
  // inside the outline's box — the engine's own test refuses it
  const G = [at(1000, 1000), at(5000, 1000), at(5000, 3000), at(3000, 4500), at(1000, 3000)];
  const w2 = { id: "w2", inputs: { xMm: 1800, sillMm: 2700, widthMm: 400, heightMm: 300, label: "W2", type: "window" } };
  assert.equal(openingOutsideOutline(outlineFrame(G, cal).polygon, w2.inputs), false, "on the gable to start with");
  const low = dragCorner(G, 3, at(4900, 4100));
  const fl = outlineFrame(low, cal);
  assert.ok(w2.inputs.sillMm + w2.inputs.heightMm <= fl.heightMm && w2.inputs.xMm + w2.inputs.widthMm <= fl.widthMm, "inside the box");
  assert.deepEqual(keepOpeningsInPlace(G, low, cal, [w2]).lost, ["W2"]);
  // the apex down a little: W2 now reaches above the slope — kept (only the part on the wall comes off), and said
  const bit = keepOpeningsInPlace(G, dragCorner(G, 3, at(3000, 4100)), cal, [w2]);
  assert.deepEqual([bit.lost, bit.cut, bit.outside], [[], [], ["W2"]]);
  assert.deepEqual(bit.openings[0].inputs, w2.inputs, "not moved, not cut");
  // a door on a floor that moved down: the same head, taller, said once
  const down = keepOpeningsInPlace(r, rectCorners(at(1000, 500), at(5000, 4000)), cal, [d1]);
  assert.deepEqual([down.openings[0].inputs.sillMm, down.openings[0].inputs.heightMm, down.resized, down.cut, down.outside], [0, 2600, [{ name: "D1", heightMm: 2600 }], [], []]);
});

// ── through the REAL engine (computeWorkspace) ────────────────────────────────────────────────────────────────

t("acceptance 8 (engine): the 4 × 3 m Rectangle is 12 m² laid out with REAL sheet sizes from the product (no area shortcut)", () => {
  const res = engine([outline("w", rectCorners(at(1000, 1000), at(5000, 4000)))]).materialResults.clad;
  const L = res.layouts[0];
  near(L.areas.grossM2, 12, 1e-9);
  assert.equal(L.method, "sheet_layout@2");
  const sheets = res.demands.filter((d) => d.unit === "sheet");
  assert.ok(sheets.length >= 4, `${sheets.length} sheets`);
  for (const d of sheets) {
    assert.ok(axon.lengthsMm.includes(d.identity.stockLengthMm), `${d.identity.stockLengthMm} is a real Axon 400 length (${axon.lengthsMm})`);
    assert.equal(d.identity.stockWidthMm, axon.widthMm);
  }
  assert.ok(L.areas.stockM2 >= 12, "the sheets cover the wall");
  // the panel's summary of that wall
  const s = wallSheetSummary(res, "w");
  assert.equal(s.sheets.reduce((a, g) => a + g.qty, 0), sheets.reduce((a, d) => a + d.quantity, 0));
  assert.match(sheetSummaryText(s), /^\d+ sheets? [\d,]+ × 1,200/);
  assert.equal(wallSheetSummary(res, "other"), null);
  assert.equal(sheetSummaryText(null), "");
  assert.equal(sheetSummaryText({ sheets: [{ qty: 1, lengthMm: 3000, widthMm: 1200 }], borrowed: 2 }), "1 sheet 3,000 × 1,200 + 2 pieces from other walls");
});

t("area alone never bypasses the sheets: a traced AREA on a cladding is refused as unused (blocking); the outline WALL gets the layout", () => {
  const area = { id: "a", kind: "area", documentId: "d", pageIndex: 0, calibrationId: "cal", points: rectCorners(at(1000, 1000), at(5000, 4000)) };
  const res = engine([area], [{ id: "c-a", measurementId: "a", jobMaterialId: "clad", role: "surface" }]).materialResults.clad;
  assert.ok(res.problems.some((p) => p.code === "measurement_unused" && p.blocking), JSON.stringify(res.problems.map((p) => p.code)));
  assert.equal(res.demands.filter((d) => d.unit === "sheet").length, 0, "no sheets from an area on its own");
  assert.equal(res.status.procurement === "ready", false);
});

t("corners land on the nearest 10 mm of the page's real-mm grid: a wall tapped 3,000.3 high is 3,000 high and takes 3,000 sheets, never the next length up (any rotation, separate scales)", () => {
  const g133 = productGroups({}).find((x) => /Axon 133 smooth/.test(x.name));   // listed 2,450 / 2,750 / 3,000 / 3,600
  const run133 = (pts) => {
    const mats = [{ id: "c", name: "Axon 133", ...fam(specFromGroup(g133)), rules: {} }];
    return computeWorkspace({ workspace: { id: "ws", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [{ id: "d", status: "current" }], calibrations: [cal],
      materials: mats, measurements: [outline("w", pts)], contributions: [{ id: "x", measurementId: "w", jobMaterialId: "c", role: "wall" }] }).materialResults.c.demands.filter((d) => d.unit === "sheet").map((d) => d.identity.stockLengthMm);
  };
  const raw = rectCorners(at(1000.2, 999.9), at(5000.1, 4000.2));   // a finger's hair over 3,000
  assert.deepEqual(run133(raw), [3600, 3600, 3600, 3600], "unsnapped: the next sheet length up");
  const snapped = rectCorners(snapToMmGrid(cal, at(1000.2, 999.9)), snapToMmGrid(cal, at(5000.1, 4000.2)));
  const f = outlineFrame(snapped, cal);
  near(f.widthMm, 4000, 1e-6); near(f.heightMm, 3000, 1e-6);
  assert.deepEqual(run133(snapped), [3000, 3000, 3000, 3000]);
  // a corner moves at most 5 mm, along the scale's own axes, on every rotation and on a stretched scale
  for (const rot of [0, 90, 180, 270]) {
    const side = rot % 180 !== 0;
    const c = { id: "c", ...buildCalibration({ basisRotation: rot, horizontal: { p1: { x: 0, y: 0 }, p2: side ? { x: 0, y: 100 } : { x: 100, y: 0 }, knownMm: 4000 },
      vertical: { p1: { x: 0, y: 0 }, p2: side ? { x: 50, y: 0 } : { x: 0, y: 50 }, knownMm: 4000 }, mode: "separate" }).calibration };
    const p = { x: 23.31, y: 31.77 }, q = snapToMmGrid(c, p);
    const d = outlineFrame([{ x: 0, y: 0 }, p, q], c);
    assert.ok(d, `${rot}`);
    const mp = d.toLocal(p), mq = d.toLocal(q);
    assert.ok(Math.abs(mp.x - mq.x) <= 5 + 1e-9 && Math.abs(mp.y - mq.y) <= 5 + 1e-9, `${rot}: moved ${mp.x - mq.x}, ${mp.y - mq.y}`);
    const g = outlineFrame([{ x: 0, y: 0 }, q, snapToMmGrid(c, { x: 61.9, y: 7.3 })], c);
    for (const v of g.polygon) for (const w of [v.x, v.y]) near(w / 10, Math.round(w / 10), 1e-9, `${rot}: on the grid`);
  }
  assert.equal(snapToMmGrid(null, at(1, 1)).x, at(1, 1).x, "no scale: unchanged");
});

t("acceptance 9 (engine): a five-corner Area keeps all five corners and its area; the gable top cuts the sheets to the slope", () => {
  const g = outline("g", [at(1000, 1000), at(5000, 1000), at(5000, 3000), at(3000, 4500), at(1000, 3000)]);
  const res = engine([g]).materialResults.clad;
  const L = res.layouts[0];
  assert.equal(L.wall.polygon.length, 5, "all five corners");
  near(L.areas.grossM2, 11, 1e-9);
  assert.ok(L.areas.layoutCutM2 < L.areas.stockM2, "cut to the slope, not a rectangle");
});

t("acceptance 9 (engine): dragging a corner changes the area and the sheets at once (the next calculation)", () => {
  const r = rectCorners(at(1000, 1000), at(5000, 4000));
  const before = engine([outline("w", r)]).materialResults.clad;
  const after = engine([outline("w", dragCorner(r, 0, at(-400, 1000)))]).materialResults.clad;
  near(after.layouts[0].areas.grossM2, 14.1, 1e-9);
  const n = (res) => res.demands.filter((d) => d.unit === "sheet").reduce((a, d) => a + d.quantity, 0);
  assert.ok(n(after) > n(before), `${n(before)} → ${n(after)} sheets`);
});

t("an opening from two corners on the outline is cut out exactly where it was tapped, and still there after the lowest / leftmost corner moves", () => {
  const r = rectCorners(at(1000, 1000), at(5000, 3500));   // 2,500 high, then 3,000 (Axon 400 comes up to 3,000 long)
  const f = outlineFrame(r, cal);
  const w = outlineOpening(f, at(2000, 2000), at(3200, 3200), "window");
  const op = openingRecord("o1", "w", { xMm: w.xMm, sillMm: w.sillMm, widthMm: w.widthMm, heightMm: w.heightMm, label: nextOpeningLabel([], "window"), type: "window" });
  const res1 = engine([outline("w", r), op]).materialResults.clad;
  const o1 = res1.layouts[0].openings[0];
  assert.deepEqual([o1.x0, o1.y0, o1.x1, o1.y1], [1000, 1000, 2200, 2200]);
  near(res1.layouts[0].areas.openingM2, 1.44, 1e-9);
  assert.equal(res1.problems.filter((p) => /^opening_/.test(p.code)).length, 0);
  // the corner moves; the editor keeps the opening in place (one Undo for both)
  const m = dragCorner(r, 0, at(-400, 500));                          // the bottom left corner, down and left
  const kept = keepOpeningsInPlace(r, m, cal, [op]).openings[0];
  const res2 = engine([outline("w", m), kept]).materialResults.clad;
  const o2 = res2.layouts[0].openings[0];
  const F2 = outlineFrame(m, cal);
  for (const [a, b] of [[{ x: o1.x0, y: o1.y0 }, { x: o2.x0, y: o2.y0 }], [{ x: o1.x1, y: o1.y1 }, { x: o2.x1, y: o2.y1 }]]) {
    const p = f.toPdf(a), q = F2.toPdf(b);
    near(q.x, p.x, 1e-9, "same place across"); near(q.y, p.y, 1e-9, "same place up");
  }
  near(res2.layouts[0].areas.openingM2, 1.44, 1e-9, "the same window");
  // without keeping it in place, the engine would measure it from the new corner (it would move): the old bug
  const moved = engine([outline("w", m), op]).materialResults.clad.layouts[0].openings[0];
  assert.notDeepEqual([moved.x0, moved.y0], [o2.x0, o2.y0]);
});

console.log(`takeoff-tc-hub023: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
