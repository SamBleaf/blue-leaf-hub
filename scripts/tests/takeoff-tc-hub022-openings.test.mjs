// Hub review HUB 022, wall-by-wall plan step 2: + Window / + Door on the plan. Pure rules from the measure helpers:
// two taps snap to the nearest traced wall and give the opening's offset from that wall's start and its width in real
// mm to the nearest 10 (any tap order, separate X / Y scales too); taps past a wall end or round a corner are cut back
// to the wall and say so; a tap on no traced wall (or ends on two unrelated walls) makes nothing; labels W1 / D1 per
// wall (the elevation's own rule); the boxes start at the last window / door; the record is exactly the elevation's
// opening. Then, through the REAL engine (computeWorkspace), the plan opening is deducted for every material on the
// wall, sits where the elevation says, and a door sits on the floor.
// The screens are in e2e/ui-review/tc-measure.spec.js; the real server keeping the opening is in takeoff-api.test.mjs.
import assert from "node:assert/strict";
import { lastOpeningSizes, nextOpeningLabel, openingRecord } from "../../src/components/takeoff/measure/tools.js";
import { OPENING_REACH_MM, nearestWall, openingAboveWall, openingOnWall, planOpening, tapSlopMm, wallStation } from "../../src/components/takeoff/measure/geometry.js";
import { buildCalibration, computeWorkspace, methodFor } from "../../shared/takeoff/index.js";
import { productGroups, specFromGroup } from "../../shared/takeoff/products/index.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } }

// a plan page at 1:100-ish: k PDF units per mm, origin (100, 100); the same scale both ways
const k = 0.05, X0 = 100, Y0 = 100;
const H = { p1: { x: X0, y: Y0 - 40 }, p2: { x: X0 + 12000 * k, y: Y0 - 40 }, knownMm: 12000 };
const V = { p1: { x: X0 - 40, y: Y0 }, p2: { x: X0 - 40, y: Y0 + 8000 * k }, knownMm: 8000 };
const cal = { id: "cal", documentId: "d", pageIndex: 0, ...buildCalibration({ basisRotation: 0, horizontal: H, vertical: V }).calibration };
const at = (x, y) => ({ x: X0 + x * k, y: Y0 + y * k });
// the plan's check job: four walls 6 / 4 / 6 / 4 m traced in one run (corners shared exactly)
const C = [at(0, 0), at(6000, 0), at(6000, 4000), at(0, 4000)];
const walls = [0, 1, 2, 3].map((i) => ({ id: `w${i + 1}`, points: [C[i], C[(i + 1) % 4]], cal }));
const PX = 0.06 / k;   // the phone at about 2× zoom: 0.06 screen px per mm → px per PDF unit
const opts = { pxPerUnit: PX };

t("two taps on one wall: that wall, the offset from its start and the width in real mm to the nearest 10 (any tap order)", () => {
  const r = planOpening(walls, at(1003, 4), at(2207, -6), opts);
  assert.deepEqual(r, { ok: true, wallId: "w1", xMm: 1000, widthMm: 1200, tappedWidthMm: 1200, clipped: null, nextWallId: null });
  assert.deepEqual(planOpening(walls, at(2207, -6), at(1003, 4), opts), r, "end first, start second: the same opening");
  // a wall traced the other way: the offset is from ITS start (wall 3 runs from x = 6,000 back to 0)
  const w3 = planOpening(walls, at(3800, 4000), at(5000, 4000), opts);
  assert.deepEqual([w3.wallId, w3.xMm, w3.widthMm], ["w3", 1000, 1200]);
  // a wall running up the page (wall 4: from y = 4,000 up to 0)
  const w4 = planOpening(walls, at(0, 2000), at(0, 2900), opts);
  assert.deepEqual([w4.wallId, w4.xMm, w4.widthMm], ["w4", 1100, 900]);
});

t("the station along a wall is worked in real mm: a page with separate X / Y scales projects correctly", () => {
  // drawn stretched: 1 mm across = k units, 1 mm down = 2k units
  const Vs = { p1: { x: X0 - 40, y: Y0 }, p2: { x: X0 - 40, y: Y0 + 8000 * 2 * k }, knownMm: 8000 };
  const sep = { id: "s", ...buildCalibration({ basisRotation: 0, horizontal: H, vertical: Vs, mode: "separate" }).calibration };
  const P = (x, y) => ({ x: X0 + x * k, y: Y0 + y * 2 * k });
  // a diagonal wall 3,000 across and 4,000 down = 5,000 long; a point 2,500 along it is at (1,500, 2,000)
  const st = wallStation([P(0, 0), P(3000, 4000)], sep, P(1500, 2000));
  assert.ok(Math.abs(st.lengthMm - 5000) < 1e-6 && Math.abs(st.stationMm - 2500) < 1e-6 && st.offMm < 1e-6, JSON.stringify(st));
  // 400 mm off the wall, square to it in REAL mm (the normal of (3,4)/5 is (4,−3)/5)
  const off = wallStation([P(0, 0), P(3000, 4000)], sep, P(1500 + 320, 2000 - 240));
  assert.ok(Math.abs(off.offMm - 400) < 1e-6 && Math.abs(off.stationMm - 2500) < 1e-6, JSON.stringify(off));
  const r = planOpening([{ id: "d", points: [P(0, 0), P(3000, 4000)], cal: sep }], P(600, 800), P(1500, 2000), { pxPerUnit: PX });
  assert.deepEqual([r.xMm, r.widthMm], [1000, 1500]);
});

t("a finger's slip is the zoom's 12 px in real mm (at least 20 mm, never more than the 400 mm reach)", () => {
  assert.equal(tapSlopMm(walls[0], PX), 200, "about 2× zoom: 0.06 px per mm → 200 mm");
  assert.equal(tapSlopMm(walls[0], 1 / k), 20, "zoomed right in: never below 20 mm");
  assert.equal(tapSlopMm(walls[0], 0.004 / k), OPENING_REACH_MM, "zoomed right out: never more than the reach");
});

t("past a free wall end: cut back to the wall, and it says so (the tapped width is kept for the message)", () => {
  const open = [walls[0]];   // wall 1 on its own: its end at 6,000 is free
  const r = planOpening(open, at(5000, 0), at(6300, 0), opts);
  assert.deepEqual(r, { ok: true, wallId: "w1", xMm: 5000, widthMm: 1000, tappedWidthMm: 1300, clipped: "end", nextWallId: null });
  const s = planOpening(open, at(-400, 0), at(900, 0), opts);
  assert.deepEqual([s.xMm, s.widthMm, s.tappedWidthMm, s.clipped], [0, 900, 1300, "end"], "past the start: from 0, never a negative offset");
  // a few mm over (tapping right on the end) is just the end: no warning; nor is a finger's slip (12 px at this zoom)
  const e = planOpening(open, at(5000, 0), at(6003, 0), opts);
  assert.deepEqual([e.xMm, e.widthMm, e.clipped], [5000, 1000, null]);
  for (const over of [5, 60, 150, 190]) {
    const f = planOpening(open, at(5000, 0), at(6000 + over, 0), opts);
    assert.deepEqual([f.widthMm, f.clipped], [1000, null], `${over} mm past the end is the end being tapped`);
  }
  assert.equal(planOpening(open, at(-150, 0), at(900, 0), opts).clipped, null, "150 mm before the start: a slip too");
  // zoomed right in, the same 150 mm is 150 px: a real overshoot
  assert.equal(planOpening(open, at(5000, 0), at(6150, 0), { pxPerUnit: 1 / k }).clipped, "end");
  // rounding never puts the opening past the wall end (a wall 4,003 long)
  const odd = [{ id: "o", points: [at(0, 6000), at(4003, 6000)], cal }];
  const o = planOpening(odd, at(2996, 6000), at(4003, 6000), opts);
  assert.ok(o.xMm + o.widthMm <= 4003 && o.xMm % 10 === 0 && o.widthMm % 10 === 0, JSON.stringify(o));
  assert.equal(planOpening(open, at(6200, 0), at(6600, 0), opts).ok, false, "both taps past the end: nothing");
});

t("round a corner: on the wall carrying most of it, the part on the next wall cut off, and it says so", () => {
  // 600 on wall 1 before the corner, 400 down wall 2 after it
  const r = planOpening(walls, at(5400, 0), at(6000, 400), opts);
  assert.deepEqual(r, { ok: true, wallId: "w1", xMm: 5400, widthMm: 600, tappedWidthMm: 1000, clipped: "corner", nextWallId: "w2" });
  // more of it down wall 2: it goes on wall 2
  const s = planOpening(walls, at(5700, 0), at(6000, 900), opts);
  assert.deepEqual([s.wallId, s.xMm, s.widthMm, s.clipped, s.nextWallId], ["w2", 0, 900, "corner", "w1"]);
});

t("a tap just inside a corner (or a few mm outside it) is the corner: no warning, even when it is nearer the next wall", () => {
  // the review's case: 10 mm short of the corner and 30 mm into the room (under 2 px at this zoom), nearer wall 2's line
  assert.deepEqual(planOpening(walls, at(4800, 0), at(5990, 30), opts), { ok: true, wallId: "w1", xMm: 4800, widthMm: 1190, tappedWidthMm: 1220, clipped: null, nextWallId: null });
  assert.equal(planOpening(walls, at(4800, 0), at(6005, -5), opts).clipped, null, "5 mm outside the corner");
  assert.equal(planOpening(walls, at(4800, 0), at(6000, 150), opts).clipped, null, "150 mm down the next wall: a slip at this zoom");
  // beside wall 1, well short of its end: off the wall line, not round the corner
  const side = planOpening(walls, at(4800, 0), at(5600, 300), opts);
  assert.deepEqual([side.wallId, side.widthMm, side.clipped], ["w1", 800, null]);
  // a window from corner to corner, both taps a little inside the room (each nearer the wall next to it): on wall 1
  const full = planOpening(walls, at(5, 10), at(5995, 10), opts);
  assert.deepEqual([full.ok, full.wallId, full.xMm + full.widthMm <= 6000, full.widthMm >= 5980, full.clipped], [true, "w1", true, true, null]);
});

t("across the join of a straight wall split where its height changes (HUB 022): said as a join, never a corner", () => {
  const S = [{ id: "a", points: [at(0, 6000), at(3000, 6000)], cal }, { id: "b", points: [at(3000, 6000), at(6000, 6000)], cal }];
  const r = planOpening(S, at(2700, 6000), at(3300, 6000), opts);
  assert.deepEqual(r, { ok: true, wallId: "a", xMm: 2700, widthMm: 300, tappedWidthMm: 600, clipped: "join", nextWallId: "b" });
  const more = planOpening(S, at(2500, 6000), at(3700, 6000), opts);
  assert.deepEqual([more.wallId, more.xMm, more.widthMm, more.clipped, more.nextWallId], ["b", 0, 700, "join", "a"]);
  // ends well along both: refused as a join (tap each part on its own wall), not "different walls"
  assert.deepEqual(planOpening(S, at(2000, 6000), at(4000, 6000), opts), { ok: false, reason: "across_join", wallId: "a", otherWallId: "b" });
  // a real corner is still a corner
  assert.equal(planOpening(walls, at(5400, 0), at(6000, 400), opts).clipped, "corner");
});

t("a window reaching above its wall is spotted as it is placed (the engine deducts only the part on the wall)", () => {
  const o = (sillMm, heightMm, xMm = 1000, widthMm = 1200) => ({ xMm, sillMm, widthMm, heightMm });
  assert.equal(openingAboveWall({ kind: "rect", heightMm: 2400 }, 6000, o(1000, 1500)), true, "top at 2,500 on a 2,400 wall");
  assert.equal(openingAboveWall({ kind: "rect", heightMm: 2400 }, 6000, o(900, 1500)), false, "top exactly at the wall top");
  assert.equal(openingAboveWall({ heightMm: 2700 }, 6000, o(0, 2100)), false, "a door on a 2,700 wall (no kind = rect)");
  assert.equal(openingAboveWall({ kind: "rect" }, 6000, o(1000, 1500)), false, "no wall height yet: nothing to say");
  // a sloping top: fine at the high end, over it at the low end
  const rake = { kind: "rake", startHeightMm: 2400, endHeightMm: 3600 };
  assert.equal(openingAboveWall(rake, 6000, o(1200, 1800, 4500, 1000)), false);
  assert.equal(openingAboveWall(rake, 6000, o(1200, 1800, 200, 1000)), true);
});

t("no traced wall near a tap: nothing (and ends on two walls that don't meet: nothing)", () => {
  assert.equal(nearestWall(walls, at(3000, 2000), opts), null, "the middle of the room");
  assert.equal(nearestWall(walls, at(3000, 150), opts).wall.id, "w1", "a tap a little off the wall line is on it");
  assert.deepEqual(planOpening(walls, at(3000, 2000), at(3500, 0), opts), { ok: false, reason: "no_wall" });
  assert.deepEqual(planOpening(walls, at(3000, 0), at(3000, 2000), opts), { ok: false, reason: "other_end_off_wall", wallId: "w1" });
  assert.deepEqual(planOpening(walls, at(3000, 0), at(3000, 4000), opts), { ok: false, reason: "different_walls", wallId: "w1", otherWallId: "w3" }, "two opposite walls");
  // two walls that meet, but the ends are well along each (not just round the corner): never a 3 m window guessed
  assert.deepEqual(planOpening(walls, at(3000, 0), at(6000, 2000), opts), { ok: false, reason: "different_walls", wallId: "w1", otherWallId: "w2" });
  assert.equal(nearestWall([], at(0, 0), opts), null);
  // zoomed right in, a tap on the far face of a thick wall is still on it (real mm reach), but not a metre off
  assert.equal(nearestWall(walls, at(3000, 350), { pxPerUnit: 1 / k }).wall.id, "w1");
  assert.equal(nearestWall(walls, at(3000, 1000), { pxPerUnit: 1 / k }), null);
  // zoomed right out a finger covers metres: a tap is still never more than a metre off the wall
  const out = { pxPerUnit: 0.004 / k };
  assert.equal(nearestWall(walls, at(3000, 900), out).wall.id, "w1");
  assert.equal(nearestWall(walls, at(3000, 1200), out), null);
});

t("labels per wall: W1, W2 … windows, D1 … doors, the first free number (the elevation's own rule)", () => {
  assert.equal(nextOpeningLabel([], "window"), "W1");
  assert.equal(nextOpeningLabel(["W1", "D1"], "window"), "W2");
  assert.equal(nextOpeningLabel(["W1", "W3"], "window"), "W2");
  assert.equal(nextOpeningLabel(["W1", "W2"], "door"), "D1");
  assert.equal(nextOpeningLabel([null, undefined, "D1"], "door"), "D2");
  assert.equal(nextOpeningLabel([], "other"), "O1");
});

t("the boxes start at the last window (height + sill) and the last door (height); none yet: empty", () => {
  const o = (id, inputs, extra = {}) => ({ id, kind: "opening", parentId: "w1", inputs, ...extra });
  const wall = { id: "w1", kind: "wall", inputs: { heightMm: 2700 } };
  assert.deepEqual(lastOpeningSizes([]), { window: { heightMm: null, sillMm: null }, door: { heightMm: null } });
  const ms = [wall, o("a", { type: "window", heightMm: 900, sillMm: 900 }), o("b", { type: "door", heightMm: 2100, sillMm: 0 }), o("c", { type: "window", heightMm: 1200, sillMm: 1000 }),
    o("gone", { type: "window", heightMm: 600, sillMm: 1500 }, { archived: true }), o("x", { type: "other", heightMm: 400, sillMm: 0 })];
  assert.deepEqual(lastOpeningSizes(ms), { window: { heightMm: 1200, sillMm: 1000 }, door: { heightMm: 2100 } });
  assert.deepEqual(lastOpeningSizes([wall, o("old", { heightMm: 1500, sillMm: 600 })]).window, { heightMm: 1500, sillMm: 600 }, "an opening with no type is a window");
  // an aluminium window entered by size after them (no wall; its sill 0 is only a placeholder) never sets the boxes
  const alu = { id: "alu", kind: "opening", parentId: null, inputs: { xMm: 0, sillMm: 0, widthMm: 1800, heightMm: 2100, label: "W01", type: "window" } };
  assert.deepEqual(lastOpeningSizes([...ms, alu]).window, { heightMm: 1200, sillMm: 1000 });
  assert.deepEqual(lastOpeningSizes([alu]).window, { heightMm: null, sillMm: null });
  assert.deepEqual(lastOpeningSizes([o("orphan", { type: "window", heightMm: 900, sillMm: 800 }, { parentId: "nowhere" })]).window, { heightMm: null, sillMm: null }, "a parent that isn't a wall");
});

t("the record is exactly the elevation's opening: no plan points, no fields of its own", () => {
  const r = openingRecord("id-1", "w1", { xMm: 1000, sillMm: 900, widthMm: 1200, heightMm: 1200, label: "W1", type: "window" });
  assert.deepEqual(r, { id: "id-1", kind: "opening", parentId: "w1", documentId: null, pageIndex: null, calibrationId: null, points: null, label: null,
    inputs: { xMm: 1000, sillMm: 900, widthMm: 1200, heightMm: 1200, label: "W1", type: "window" } });
});

t("drawn on the plan: the part on its wall, along the wall from its start", () => {
  const on = openingOnWall(walls[2].points, cal, 1000, 1200);   // wall 3 runs from x = 6,000 back to 0
  assert.ok(Math.abs(on.a.x - at(5000, 4000).x) < 1e-9 && Math.abs(on.b.x - at(3800, 4000).x) < 1e-9 && on.a.y === at(0, 4000).y, JSON.stringify(on));
  const clip = openingOnWall(walls[0].points, cal, 5500, 1000);   // sticks out past the end: only the part on the wall
  assert.ok(Math.abs(clip.b.x - at(6000, 0).x) < 1e-9);
  assert.equal(openingOnWall(walls[0].points, cal, 7000, 500), null, "off the wall: not drawn");
  assert.equal(openingOnWall(walls[0].points, null, 0, 500), null);
});

// ── through the REAL engine: deducted for every material on the wall, in the right place; a door on the floor ──────
const fam = (spec) => { const m = methodFor(spec); return { spec, methodKey: m.key, methodVersion: m.version }; };
const axon = productGroups({ family: "cladding" }).find((g) => g.name === "Axon 400 smooth");
const batten = productGroups({}).find((g) => /Cavity Batten/.test(g.name));
const shiplap = { family: "timber-cladding", supply: "random", orderIncrementM: 1, product: { name: "Shiplap", widthMm: 140, thicknessMm: 19, effectiveCoverMm: 120, lengthMm: 5400 } };
function workspace(openings) {
  const mats = [{ id: "clad", name: "Axon 400 smooth", ...fam({ ...specFromGroup(axon), assemblyId: "axon-vertical", spareRate: 0 }), rules: { route: "cavity" } },
    { id: "bat", name: "Cavity battens", ...fam(specFromGroup(batten)), rules: { maxSpacingMm: 600 } },
    { id: "tc", name: "Shiplap", ...fam(shiplap), rules: {} }];
  const wallMs = walls.map((w, i) => ({ id: w.id, kind: "wall", documentId: "d", pageIndex: 0, calibrationId: "cal", points: w.points, inputs: { kind: "rect", heightMm: 2700, name: `Wall ${i + 1}`, runId: "11111111-1111-4111-8111-111111111111", seq: i + 1 } }));
  return computeWorkspace({ workspace: { id: "ws", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [{ id: "d", status: "current" }], calibrations: [cal],
    materials: mats, measurements: [...wallMs, ...openings],
    contributions: walls.flatMap((w) => mats.map((m) => ({ id: `${m.id}-${w.id}`, measurementId: w.id, jobMaterialId: m.id, role: "wall" }))) });
}
const fromPlan = (id, taps, type, heightMm, sillMm) => {
  const r = planOpening(walls, taps[0], taps[1], opts);
  return openingRecord(id, r.wallId, { xMm: r.xMm, sillMm: type === "door" ? 0 : sillMm, widthMm: r.widthMm, heightMm, label: nextOpeningLabel([], type), type });
};

t("acceptance 7 (engine): three windows and a door from the plan are deducted for EVERY material on their walls, in place", () => {
  const ops = [fromPlan("o1", [at(1000, 0), at(2200, 0)], "window", 1200, 900), fromPlan("o2", [at(6000, 500), at(6000, 1700)], "window", 1200, 900),
    fromPlan("o3", [at(3800, 4000), at(5000, 4000)], "window", 1200, 900), fromPlan("o4", [at(0, 2000), at(0, 2900)], "door", 2100)];
  assert.deepEqual(ops.map((o) => [o.parentId, o.inputs.xMm, o.inputs.widthMm, o.inputs.sillMm]), [["w1", 1000, 1200, 900], ["w2", 500, 1200, 900], ["w3", 1000, 1200, 900], ["w4", 1100, 900, 0]]);
  const before = workspace([]), after = workspace(ops);
  for (const mat of ["clad", "bat", "tc"]) {
    for (const w of walls) {
      const L = after.materialResults[mat].layouts.find((x) => x.wallMeasurementId === w.id || x.wallId === w.id);
      const B = before.materialResults[mat].layouts.find((x) => x.wallMeasurementId === w.id || x.wallId === w.id);
      const mine = ops.filter((o) => o.parentId === w.id);
      const expectM2 = mine.reduce((a, o) => a + (o.inputs.widthMm * o.inputs.heightMm) / 1e6, 0);
      assert.ok(Math.abs(L.areas.openingM2 - expectM2) < 1e-9, `${mat} ${w.id}: openings ${L.areas.openingM2} m² (expected ${expectM2})`);
      assert.ok(Math.abs(L.areas.netM2 - (B.areas.netM2 - expectM2)) < 1e-9, `${mat} ${w.id}: net area less the opening`);
    }
    assert.equal((after.materialResults[mat].problems || []).filter((p) => /^opening_/.test(p.code)).length, 0, `${mat}: no opening problems`);
  }
  // the cladding cuts round them: less layout-cut area, and the opening sits where the elevation draws it
  const clad = after.materialResults.clad.layouts.find((x) => x.wallMeasurementId === "w1" || x.wallId === "w1");
  assert.deepEqual((clad.openings || []).map((o) => [o.x0, o.x1, o.y0, o.y1]), [[1000, 2200, 900, 2100]]);
  assert.ok(clad.areas.layoutCutM2 < before.materialResults.clad.layouts.find((x) => x.wallId === "w1" || x.wallMeasurementId === "w1").areas.layoutCutM2);
  const door = after.materialResults.clad.layouts.find((x) => x.wallMeasurementId === "w4" || x.wallId === "w4").openings[0];
  assert.deepEqual([door.type, door.y0, door.y1], ["door", 0, 2100], "the door sits on the floor");
  // the timber cladding orders fewer metres, the battens and sheets are still worked out (nothing blocked)
  const lm = (c) => c.materialResults.tc.demands.reduce((a, d) => a + (d.unit === "lm" ? d.quantity : 0), 0);
  assert.ok(lm(after) < lm(before), `${lm(before)} → ${lm(after)} lm`);
});

t("a window cut back at the wall end is fully on the wall: the engine has nothing to clip or warn about", () => {
  const r = planOpening([walls[0]], at(5000, 0), at(6300, 0), opts);
  const c = workspace([openingRecord("o", r.wallId, { xMm: r.xMm, sillMm: 900, widthMm: r.widthMm, heightMm: 1200, label: "W1", type: "window" })]);
  assert.equal((c.materialResults.clad.problems || []).filter((p) => p.code === "opening_clipped" || p.code === "opening_outside_wall").length, 0);
  const L = c.materialResults.clad.layouts.find((x) => x.wallId === "w1" || x.wallMeasurementId === "w1");
  assert.ok(Math.abs(L.areas.openingM2 - 1.2) < 1e-9, String(L.areas.openingM2));
});

console.log(`takeoff-tc-hub022-openings: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
