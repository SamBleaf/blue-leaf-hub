// Double top plate PER WALL (Sam, 18 Nov 2026): "as you're using the select tool in the takeoff, you should just be able to toggle on and
// off double top plate as you're working around, instead of having to do it before you draw the line."
// Plan: docs/takeoff/DOUBLE_TOP_PLATE_PER_WALL.md. Run: node scripts/tests/takeoff-tc-double-top.test.mjs
//
// A wall's own setting is inputs.doubleTopPlate (true / false). No key = the Walls item's Double top plate (rules.doubleTopPlate).
// An item saved with doubleTopPlate: true and walls with no setting of their own still has every wall double (legacy).
import assert from "node:assert/strict";
import { CALCULATION_VERSION, WALL_FRAMING_RULES, buildCalibration, computeWorkspace as computeWorkspaceRaw, methodFor, wallFramingDefaults } from "../../shared/takeoff/index.js";
import { wallHasDoubleTop } from "../../shared/takeoff/engine/families.js";
import { cleanMeasurementInputs } from "../../server/lib/takeoff/takeoffService.mjs";
import {
  clearDoubleTopOverrides, doubleTopState, setAllDoubleTop, toggleWallDoubleTop, wallDoubleTopOn, wallFramingText, wallFramingTotals, wallOwnDoubleTop, withWallDoubleTop,
} from "../../src/components/takeoff/measure/tools.js";

// hoop iron is on by default for every wall; this suite is about plates, so its line is left out
const computeWorkspace = (w) => { const c = computeWorkspaceRaw(w); return { ...c, scheduleLines: c.scheduleLines.filter((l) => !l.hoop) }; };
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 4).join("\n    ")}`); } }

const product = (id, purpose, over = {}) => ({ id, name: id, isActive: true, methodKey: "linear_stock", methodVersion: 1, rules: {},
  spec: { family: "timber", purpose, section: { depthMm: 90, widthMm: 45 }, grade: "MGP15", treatment: "H2", species: null, supplierName: "Yard A", productCode: null, stock: { maxMm: null, unavailableMm: [] }, ...over } });
const READY = () => wallFramingDefaults([product("p-stud", "studs"), product("p-plate", "plates"), product("p-nog", "noggins", { section: { depthMm: 90, widthMm: 35 } })]);
const wm = (id, widthMm, extra = {}) => ({ id, kind: "wall", inputs: { kind: "rect", widthMm, heightMm: 2400, name: id, ...extra } });
const item = (rules = {}) => ({ id: "walls", name: "Walls", methodKey: "wall_framing", methodVersion: 1, spec: READY(), rules: { ...WALL_FRAMING_RULES, ...rules, openingFraming: false } });
function run(measurements, rules = {}) {
  const materials = [item(rules)];
  const contributions = measurements.map((m) => ({ id: `c-${m.id}`, measurementId: m.id, jobMaterialId: "walls", role: "wall" }));
  const ws = { workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [], materials, measurements, contributions };
  const c = computeWorkspace(ws);
  const lay = (id) => c.materialResults.walls.layouts.find((l) => l.wallMeasurementId === id);
  return { ws, c, lay, res: c.materialResults.walls };
}
const second = (lay, id) => lay(id).totals.secondTopPlateMm;

// ── the rule ─────────────────────────────────────────────────────────────────────────────────────────────────
t("the rule: the wall's own true / false beats the item; no setting follows the item; junk in a record follows the item", () => {
  assert.equal(wallHasDoubleTop(true, { doubleTopPlate: false }), true);
  assert.equal(wallHasDoubleTop(false, { doubleTopPlate: true }), false);
  assert.equal(wallHasDoubleTop(null, { doubleTopPlate: true }), true);
  assert.equal(wallHasDoubleTop(null, { doubleTopPlate: false }), false);
  assert.equal(wallHasDoubleTop(undefined, undefined), false);
  assert.equal(wallHasDoubleTop("yes", { doubleTopPlate: true }), true, "a stray string is no setting");
});

// ── per wall on / off, through the real engine ──────────────────────────────────────────────────────────────
t("per wall ON: one wall of three has the second top plate; the others and the totals follow", () => {
  const { lay, res } = run([wm("a", 5000), wm("b", 4000, { doubleTopPlate: true }), wm("c", 3500)]);
  assert.equal(second(lay, "a"), null); assert.equal(second(lay, "b"), 4000); assert.equal(second(lay, "c"), null);
  assert.deepEqual([lay("a").doubleTop, lay("b").doubleTop, lay("b").doubleTopFrom, lay("a").doubleTopFrom], [false, true, "wall", "item"]);
  assert.ok(lay("b").plateThickMm > 0, "the elevation draws the plate at the plates' own thickness");
  const text = wallFramingText(wallFramingTotals(res), "Walls");
  assert.match(text, /top plate 12\.50 m \+ second 4\.00 m/, text);        // only the wall that has it counts
  assert.match(wallFramingText(wallFramingTotals(res, "b")), /top plate 2 × 4\.00 m/);
  assert.match(wallFramingText(wallFramingTotals(res, "a")), /top plate 5\.00 m/);
  assert.doesNotMatch(wallFramingText(wallFramingTotals(res, "a")), /2 ×/);
});
t("per wall OFF beats an item that is on", () => {
  const { lay } = run([wm("a", 5000), wm("b", 4000, { doubleTopPlate: false })], { doubleTopPlate: true });
  assert.equal(second(lay, "a"), 5000); assert.equal(second(lay, "b"), null);
  assert.equal(lay("a").doubleTopFrom, "item"); assert.equal(lay("b").doubleTopFrom, "wall");
});
t("the second top plate adds a plate line quantity for that wall only (long walls, bought as their own lengths)", () => {
  const plates = (r) => r.c.scheduleLines.filter((l) => l.component === "plates").reduce((a, l) => a + l.quantity * l.finishedLengthMm, 0);
  const none = plates(run([wm("a", 5000), wm("b", 5000)]));
  const one = plates(run([wm("a", 5000), wm("b", 5000, { doubleTopPlate: true })]));
  const both = plates(run([wm("a", 5000), wm("b", 5000, { doubleTopPlate: true })], { doubleTopPlate: true }));
  assert.ok(one - none >= 5000 && one - none < 10000, `one wall: +${one - none}`);
  assert.ok(both - none >= 10000, `both walls: +${both - none}`);
});

// ── item default ─────────────────────────────────────────────────────────────────────────────────────────────
t("item default: walls with no setting of their own follow the item, on and off", () => {
  const off = run([wm("a", 5000), wm("b", 4000)]), on = run([wm("a", 5000), wm("b", 4000)], { doubleTopPlate: true });
  assert.deepEqual([second(off.lay, "a"), second(off.lay, "b")], [null, null]);
  assert.deepEqual([second(on.lay, "a"), second(on.lay, "b")], [5000, 4000]);
});

// ── backward compatible ──────────────────────────────────────────────────────────────────────────────────────
t("legacy: an item saved with doubleTopPlate: true and no per-wall key keeps EVERY wall double, and an explicit false/absent item stays single, counts unchanged", () => {
  const legacy = run([wm("a", 5000), wm("b", 4000), wm("c", 2400)], { doubleTopPlate: true });
  assert.deepEqual(["a", "b", "c"].map((id) => second(legacy.lay, id)), [5000, 4000, 2400]);
  const explicit = run([wm("a", 5000, { doubleTopPlate: true }), wm("b", 4000, { doubleTopPlate: true }), wm("c", 2400, { doubleTopPlate: true })]);
  assert.deepEqual(explicit.c.scheduleLines.map((l) => [l.component, l.quantity, l.finishedLengthMm]), legacy.c.scheduleLines.map((l) => [l.component, l.quantity, l.finishedLengthMm]));
  const plain = run([wm("a", 5000), wm("b", 4000)]);
  const keyed = run([wm("a", 5000, { doubleTopPlate: false }), wm("b", 4000, { doubleTopPlate: false })]);
  assert.deepEqual(plain.c.scheduleLines.map((l) => [l.component, l.quantity, l.finishedLengthMm]), keyed.c.scheduleLines.map((l) => [l.component, l.quantity, l.finishedLengthMm]));
});
t("CALCULATION_VERSION is NOT bumped: no existing record gets a different count (the new key is absent on all of them)", () => {
  assert.match(CALCULATION_VERSION, /^takeoff-calc@12/);
  const before = run([wm("a", 5000), wm("b", 2400)], { doubleTopPlate: true });
  assert.equal(before.lay("a").totals.secondTopPlateMm, 5000);
  assert.equal(before.lay("b").totals.secondTopPlateMm, 2400);
});

// ── short plate pooling ──────────────────────────────────────────────────────────────────────────────────────
t("short plates: a 2,400 wall with a double top plate pools THREE pieces (bottom, top, second top), not two", () => {
  const pooled = (c) => c.scheduleLines.find((l) => l.component === "plates" && l.shortPlates);
  const single = run([wm("a", 2400)]), dbl = run([wm("a", 2400, { doubleTopPlate: true })]);
  assert.equal(pooled(single.c).shortPlatePool.pieces, 2);
  const pl = pooled(dbl.c);
  assert.equal(pl.shortPlatePool.pieces, 3);
  assert.equal(pl.shortPlatePool.sticks, 2, "three 2,400 pieces + 15 mm of cuts (7,215 mm) need two 6,000 sticks");
  const sticks = dbl.c.materialResults.walls.appendix.timber.find((x) => x.title === "Short plates cut list (pooled into full sticks)").sticks;
  assert.deepEqual(sticks.flatMap((s) => s.cuts.map((x) => x.label)).sort(), ["a bottom plate 0–2,400", "a second top plate 0–2,400", "a top plate 0–2,400"]);
});
t("short plates: per wall, only the walls with the second plate add a piece to the pool", () => {
  const r = run([wm("a", 2400, { doubleTopPlate: true }), wm("b", 1800), wm("c", 1200, { doubleTopPlate: true })]);
  const pl = r.c.scheduleLines.find((l) => l.component === "plates" && l.shortPlates);
  assert.equal(pl.shortPlatePool.pieces, 3 + 2 + 3);
});
t("long and short walls mix: a 5,000 wall's second top plate stays on its own length, the 2,400 wall's joins the pool", () => {
  const r = run([wm("a", 5000, { doubleTopPlate: true }), wm("b", 2400, { doubleTopPlate: true })]);
  const pl = r.c.scheduleLines.filter((l) => l.component === "plates");
  assert.equal(pl.find((l) => l.shortPlates).shortPlatePool.pieces, 3);
  assert.equal(pl.filter((l) => !l.shortPlates).reduce((a, l) => a + l.quantity, 0) >= 3, true, "bottom, top and second top of the 5,000 wall");
});

// ── junctions and corners are not touched ───────────────────────────────────────────────────────────────────
const k = 0.05, X0 = 100, Y0 = 100;
const H = { p1: { x: X0, y: Y0 - 40 }, p2: { x: X0 + 12000 * k, y: Y0 - 40 }, knownMm: 12000 };
const V = { p1: { x: X0 - 40, y: Y0 }, p2: { x: X0 - 40, y: Y0 + 8000 * k }, knownMm: 8000 };
const cal = { id: "cal", documentId: "d", pageIndex: 0, ...buildCalibration({ basisRotation: 0, horizontal: H, vertical: V }).calibration, status: "ready" };
const at = (x, y) => ({ x: X0 + x * k, y: Y0 + y * k });
const pwall = (id, a, b, extra = {}) => ({ id, kind: "wall", documentId: "d", pageIndex: 0, calibrationId: "cal", points: [at(...a), at(...b)], inputs: { kind: "rect", heightMm: 2700, name: id, ...extra } });
function runPts(measurements, rules = {}) {
  const spec = wallFramingDefaults([]);
  spec.components.studs = { ...spec.components.studs, section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", stock: { maxMm: null, unavailableMm: [] } };
  spec.components.noggins = { ...spec.components.noggins, stock: { maxMm: null, unavailableMm: [] } };
  const mk = methodFor(spec);
  const mat = { id: "walls", name: "Walls", methodKey: mk.key, methodVersion: mk.version, spec, rules: { ...WALL_FRAMING_RULES, carriesRoof: true, openingFraming: false, ...rules } };
  const c = computeWorkspace({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [{ id: "d", status: "current" }], calibrations: [cal],
    materials: [mat], measurements, contributions: measurements.map((m, i) => ({ id: `c${i}`, measurementId: m.id, jobMaterialId: "walls", role: "wall" })) });
  return c.materialResults.walls;
}
const studsAndJunctions = (res) => res.layouts.map((l) => [l.wallMeasurementId, l.totals.studs, l.totals.junctionStuds ?? 0, l.totals.junctionBlocks ?? 0, l.totals.cornerStuds ?? 0, l.totals.noggins, l.junctions.length, l.corners.length]);
t("a T junction and an L corner: studs, junction studs, junction blocks, corner studs and noggins are identical with and without the second top plate", () => {
  const walls = (extra) => [pwall("a", [0, 0], [6000, 0], extra), pwall("b", [3000, 0], [3000, 3000], extra), pwall("c", [6000, 0], [6000, 3000])];
  const plain = runPts(walls({})), dbl = runPts(walls({ doubleTopPlate: true }));
  assert.deepEqual(studsAndJunctions(dbl), studsAndJunctions(plain));
  assert.ok(plain.layouts.find((l) => l.wallMeasurementId === "a").totals.junctionStuds > 0, "the T is really there");
  assert.ok(plain.layouts.some((l) => (l.corners || []).length), "the corner is really there");
  const a = dbl.layouts.find((l) => l.wallMeasurementId === "a");
  assert.equal(a.totals.secondTopPlateMm, 6000);
});

// ── the Select tool's helpers (what the chip does) ──────────────────────────────────────────────────────────
const mat = (on) => ({ id: "walls", rules: { doubleTopPlate: on } });
const rec = (id, doubleTopPlate) => ({ id, kind: "wall", inputs: { kind: "rect", name: id, ...(doubleTopPlate === undefined ? {} : { doubleTopPlate }) }, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
const cons = (ms) => ms.map((m) => ({ id: `c${m.id}`, measurementId: m.id, jobMaterialId: "walls" }));
t("the chip on one wall: flips what the wall shows; back to the item's answer DELETES the key (the inputs are exactly as they were)", () => {
  const w = rec("a");
  const on = toggleWallDoubleTop(w, mat(false));
  assert.equal(on.doubleTopPlate, true);
  const back = toggleWallDoubleTop({ ...w, inputs: on }, mat(false));
  assert.deepEqual(back, w.inputs); assert.ok(!("doubleTopPlate" in back));
  const offOnDouble = toggleWallDoubleTop(w, mat(true));
  assert.equal(offOnDouble.doubleTopPlate, false);
  assert.deepEqual(toggleWallDoubleTop({ ...w, inputs: offOnDouble }, mat(true)), w.inputs);
  assert.deepEqual([wallOwnDoubleTop(w), wallOwnDoubleTop({ inputs: on }), wallOwnDoubleTop({ inputs: offOnDouble })], [null, true, false]);
  assert.equal(wallDoubleTopOn(w, mat(true)), true);
  assert.deepEqual(withWallDoubleTop({ name: "x", heightMm: 2400 }, true, mat(false)), { name: "x", heightMm: 2400, doubleTopPlate: true }, "other inputs untouched");
});
t("mixed selection: the state reads mixed; one tap sets ALL on; the next tap sets all off", () => {
  const ms = [rec("a", true), rec("b"), rec("c", false)];
  const s = doubleTopState(ms, cons(ms), mat(false));
  assert.deepEqual([s.state, s.on, s.off, s.total, s.own], ["mixed", 1, 2, 3, 2]);
  const ch = setAllDoubleTop(ms, cons(ms), mat(false));
  assert.equal(ch.length, 2, "only the two that were off change");
  const afterOn = ms.map((m) => ch.find((c) => c.before.id === m.id)?.next || m);
  assert.equal(doubleTopState(afterOn, cons(afterOn), mat(false)).state, "on");
  const ch2 = setAllDoubleTop(afterOn, cons(afterOn), mat(false));
  assert.equal(ch2.length, 3);
  const afterOff = afterOn.map((m) => ch2.find((c) => c.before.id === m.id)?.next || m);
  assert.equal(doubleTopState(afterOff, cons(afterOff), mat(false)).state, "off");
  assert.equal(doubleTopState([], [], mat(false)).state, "none");
});
t("the state counts the item's walls only: other items' walls, archived walls and outlines are left alone", () => {
  const ms = [rec("a", true), rec("b"), { ...rec("x"), archived: true }, { ...rec("o"), inputs: { kind: "polygon", name: "o" }, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }];
  const cs = [{ id: "ca", measurementId: "a", jobMaterialId: "walls" }, { id: "cx", measurementId: "x", jobMaterialId: "walls" }, { id: "co", measurementId: "o", jobMaterialId: "walls" }, { id: "cz", measurementId: "b", jobMaterialId: "other" }];
  const s = doubleTopState(ms, cs, mat(false));
  assert.deepEqual([s.total, s.on], [1, 1], "b belongs to another item here; x is archived; o is an outline");
});

// ── the item's checkbox: Apply to every wall? ───────────────────────────────────────────────────────────────
t("apply to every wall: YES clears the walls' own settings, so all follow the item; NO leaves them and only walls without their own follow", () => {
  const ms = [rec("a", true), rec("b"), rec("c", false)];
  // the item's box goes ON. Walls with a setting of their own: a, c (2), so the app asks.
  assert.equal(doubleTopState(ms, cons(ms), mat(true)).own, 2);
  const yes = ms.map((m) => clearDoubleTopOverrides(ms, cons(ms), mat(true)).find((c) => c.before.id === m.id)?.next || m);
  assert.deepEqual(yes.map((m) => wallDoubleTopOn(m, mat(true))), [true, true, true]);
  assert.ok(yes.every((m) => !("doubleTopPlate" in m.inputs)), "overrides are cleared, not rewritten");
  // NO: nothing is touched
  assert.deepEqual(ms.map((m) => wallDoubleTopOn(m, mat(true))), [true, true, false], "a keeps its own true, b follows the item, c keeps its own false");
  assert.equal(clearDoubleTopOverrides([rec("a"), rec("b")], cons([rec("a"), rec("b")]), mat(true)).length, 0, "no wall with its own setting: no question, nothing to clear");
});
t("apply to every wall through the engine: after YES every wall has the plate; after NO only the walls without a setting do", () => {
  const ms = [wm("a", 5000, { doubleTopPlate: false }), wm("b", 4000), wm("c", 3000, { doubleTopPlate: true })];
  const no = run(ms, { doubleTopPlate: true });
  assert.deepEqual(["a", "b", "c"].map((id) => second(no.lay, id)), [null, 4000, 3000]);
  const cleared = ms.map((m) => ({ ...m, inputs: Object.fromEntries(Object.entries(m.inputs).filter(([key]) => key !== "doubleTopPlate")) }));
  const yes = run(cleared, { doubleTopPlate: true });
  assert.deepEqual(["a", "b", "c"].map((id) => second(yes.lay, id)), [5000, 4000, 3000]);
});

// ── the server whitelist ────────────────────────────────────────────────────────────────────────────────────
t("server: accepts doubleTopPlate true / false on a wall, drops it when absent or null, REJECTS anything else", () => {
  const clean = (extra) => cleanMeasurementInputs("wall", { kind: "rect", widthMm: 4000, heightMm: 2400, name: "W", ...extra }, null);
  assert.equal(clean({ doubleTopPlate: true }).doubleTopPlate, true);
  assert.equal(clean({ doubleTopPlate: false }).doubleTopPlate, false);
  assert.ok(!("doubleTopPlate" in clean({})));
  assert.ok(!("doubleTopPlate" in clean({ doubleTopPlate: null })));
  for (const junk of ["true", "yes", 1, 0, {}, [], "on"]) assert.throws(() => clean({ doubleTopPlate: junk }), /Double top plate on a wall is on or off/, JSON.stringify(junk));
  assert.equal(clean({ doubleTopPlate: true, studCentresMm: 450, noHoopIron: true }).studCentresMm, 450, "its neighbours are kept");
});

console.log(`takeoff-tc-double-top: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
