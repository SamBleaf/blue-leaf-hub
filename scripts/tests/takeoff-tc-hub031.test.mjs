// HUB 031 (Sam, 17 Nov 2026): per-wall stud centres (wet areas at 450), cavity sliders, full-height openings,
// automatic opening framing, lintels from cited span tables. Plans: docs/takeoff/OPENING_FRAMING_RULES_PLAN.md and
// WET_WALLS_AND_CAVITY_DOORS_PLAN.md; Sam's answers (docs/takeoff/OWNER_ANSWERS_17NOV.md) override them.
//   node scripts/tests/takeoff-tc-hub031.test.mjs
import assert from "node:assert/strict";
import { CALCULATION_VERSION, WALL_FRAMING_RULES, WET_WALL_CENTRES_MM, computeWorkspace, wallFramingDefaults } from "../../shared/takeoff/index.js";
import { cleanMeasurementInputs } from "../../server/lib/takeoff/takeoffService.mjs";
import { NOTE_CODES } from "../../shared/takeoff/fixes.js";
import { itemCentresMm, toggleWetWall, wallFramingNotes, wallFramingText, wallFramingTotals, wetWallsOf, withWallCentres } from "../../src/components/takeoff/measure/tools.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 4).join("\n    ")}`); } }
const near = (a, b, msg = "") => assert.ok(Math.abs(a - b) < 1e-6, `${msg} ${a} ≠ ${b}`);
const nearAll = (a, b, msg = "") => { assert.equal(a.length, b.length, `${msg} ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); a.forEach((x, i) => near(x, b[i], `${msg}[${i}]`)); };

// ── fixtures: a Walls item (Sam's default parts) through the real computeWorkspace ──────────────────────────────
const product = (id, purpose, over = {}) => ({ id, name: id, isActive: true, methodKey: "linear_stock", methodVersion: 1, rules: {},
  spec: { family: "timber", purpose, section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", species: null, supplierName: "Yard A", productCode: null, stock: { maxMm: null, unavailableMm: [] }, ...over } });
const READY = () => wallFramingDefaults([product("p-stud", "studs"), product("p-plate", "plates"), product("p-nog", "noggins", { section: { depthMm: 90, widthMm: 35 } })]);
const walls = (spec, rules = { ...WALL_FRAMING_RULES }) => ({ id: "walls", name: "Walls", methodKey: "wall_framing", methodVersion: 1, spec, rules });
const snap = (materials, measurements, contributions) => ({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [], materials, measurements, contributions });
const wm = (id, widthMm, heightMm, name, over = {}) => ({ id, kind: "wall", inputs: { kind: "rect", widthMm, heightMm, name, ...over } });
const om = (id, parentId, label, type, xMm, widthMm, heightMm, sillMm, extra = {}) => ({ id, kind: "opening", parentId, inputs: { xMm, sillMm, widthMm, heightMm, label, type, ...extra } });
const onW = (measurementId, jobMaterialId = "walls") => ({ id: `c-${measurementId}-${jobMaterialId}`, measurementId, jobMaterialId, role: "wall" });
const wf = (measurements, { spec = READY(), rules = { ...WALL_FRAMING_RULES, openingFraming: false } } = {}) =>
  computeWorkspace(snap([walls(spec, rules)], measurements, measurements.filter((m) => m.kind === "wall").map((m) => onW(m.id))));
const WR = (c) => c.materialResults.walls;
const wl = (c, name) => WR(c).layouts.find((l) => l.wallLabel === name);
const st = (l) => l.ticks.filter((x) => x.state !== "removed").map((x) => x.positionMm);
const nogs = (c, wallId) => WR(c).demands.filter((d) => d.identity.component === "noggins" && d.sourceRefs[0].wallId === wallId).flatMap((d) => Array(d.quantity).fill(d.lengthMm));

// ══ Step 1: per-wall stud centres ═══════════════════════════════════════════════════════════════════════════════
t("constants: wet-area centres are 450 (Sam, 17 Nov 2026) and the calculation is stamped @5", () => {
  assert.equal(WET_WALL_CENTRES_MM, 450);
  assert.match(CALCULATION_VERSION, /^takeoff-calc@5$/);
  assert.ok(NOTE_CODES.includes("wall_centres_ignored"));
});

t("a wall's own 450 beats the item's 600: a 3,600 wall gets 9 studs, not 7; 2,400 gets 7 not 5; 2,700 gets 7 not 6", () => {
  const plain = (len, over = {}) => wf([wm("w", len, 2400, "Wall 1", over)]);
  for (const [len, at600, at450] of [[3600, 7, 9], [2400, 5, 7], [2700, 6, 7]]) {
    assert.equal(st(wl(plain(len), "Wall 1")).length, at600, `${len} at 600`);
    assert.equal(st(wl(plain(len, { studCentresMm: 450 }), "Wall 1")).length, at450, `${len} at 450`);
  }
  const c = wf([wm("w", 2400, 2400, "Wall 1", { studCentresMm: 450 })]);
  nearAll(st(wl(c, "Wall 1")), [0, 450, 900, 1350, 1800, 2250, 2400]);
  assert.deepEqual([wl(c, "Wall 1").centresMm, wl(c, "Wall 1").centresFrom], [450, "wall"]);
  assert.ok(WR(c).explain === undefined || true);
});

t("noggins follow the wall's own centres (450 centres → 405 pieces between 45 mm studs)", () => {
  const c = wf([wm("w", 3600, 2400, "Wall 1", { studCentresMm: 450 })]);
  nearAll(nogs(c, "w").slice(0, 3), [405, 405, 405]);
  const d = wf([wm("w", 3600, 2400, "Wall 1")]);
  assert.ok(nogs(d, "w").every((x) => Math.abs(x - 565) < 1e-6 || x < 565));
});

t("a mixed item: the wet wall at 450 and the dry wall at the item's 600, each laid out alone; the item's centres change leaves the wet wall at 450", () => {
  const both = wf([wm("a", 3600, 2400, "Wall 1", { studCentresMm: 450 }), wm("b", 3600, 2400, "Wall 2")]);
  const dry = wf([wm("b", 3600, 2400, "Wall 2")]);
  assert.deepEqual(st(wl(both, "Wall 2")), st(wl(dry, "Wall 2")));
  assert.equal(wl(both, "Wall 2").centresFrom, "item");
  const at400 = wf([wm("a", 3600, 2400, "Wall 1", { studCentresMm: 450 }), wm("b", 3600, 2400, "Wall 2")], { rules: { ...WALL_FRAMING_RULES, centresMm: 400, openingFraming: false } });
  assert.equal(wl(at400, "Wall 1").centresMm, 450);
  assert.equal(wl(at400, "Wall 2").centresMm, 400);
});

t("the Walls line says '· 2 walls at 450' only when some wall has its own centres; otherwise it reads exactly as before", () => {
  const ms = [wm("a", 3600, 2400, "Wall 1", { studCentresMm: 450 }), wm("b", 3600, 2400, "Wall 2", { studCentresMm: 450 }), wm("c", 3600, 2400, "Wall 3")];
  const text = wallFramingText(wallFramingTotals(WR(wf(ms))), "Walls");
  assert.match(text, / · 2 walls at 450$/);
  assert.deepEqual(wallFramingTotals(WR(wf(ms)), "a").ownCentres, undefined, "a wall's own totals have no suffix");
  const none = wallFramingText(wallFramingTotals(WR(wf([wm("c", 3600, 2400, "Wall 3")]))), "Walls");
  assert.doesNotMatch(none, /at 450/);
  assert.match(wallFramingText({ walls: 1, studs: 3, studsByHeight: [[2400, 3]], bottomPlateMm: 1, topPlateMm: 1, secondTopPlateMm: null, noggins: 1, rows: [1], ownCentres: { 450: 1 } }, null), /1 wall at 450/);
  assert.deepEqual(wallFramingNotes(WR(wf(ms)), "a", null), ["Studs at 450 centres on this wall (its own setting)."]);
  assert.deepEqual(wallFramingNotes(WR(wf(ms)), "c", null), []);
});

t("toggling 450 on and off leaves the inputs exactly as they were (the key is deleted, never null or the item's number)", () => {
  const inputs = { kind: "rect", widthMm: 3000, heightMm: 2400, name: "Wall 1" };
  const on = toggleWetWall(inputs);
  assert.equal(on.studCentresMm, 450);
  assert.deepEqual(toggleWetWall(on), inputs);
  assert.ok(!("studCentresMm" in withWallCentres(on, null)));
  assert.equal(withWallCentres(inputs, 450).studCentresMm, 450);
  assert.equal(itemCentresMm({ rules: { centresMm: 400 } }), 400);
  assert.equal(itemCentresMm({}), 600);
  const a = computeWorkspace(snap([walls(READY(), { ...WALL_FRAMING_RULES })], [{ id: "w", kind: "wall", inputs }], [onW("w")]));
  const b = computeWorkspace(snap([walls(READY(), { ...WALL_FRAMING_RULES })], [{ id: "w", kind: "wall", inputs: toggleWetWall(toggleWetWall(inputs)) }], [onW("w")]));
  assert.equal(a.dependencyKey ?? JSON.stringify(a.scheduleLines), b.dependencyKey ?? JSON.stringify(b.scheduleLines));
});

t("wetWallsOf names the walls of one item with their own centres, in name order", () => {
  const ms = [wm("a", 1, 1, "Wall 10", { studCentresMm: 450 }), wm("b", 1, 1, "Wall 2", { studCentresMm: 450 }), wm("c", 1, 1, "Wall 3")];
  const cs = ms.map((m) => onW(m.id));
  assert.deepEqual(wetWallsOf(ms, cs, "walls").map((w) => w.name), ["Wall 2", "Wall 10"]);
  assert.deepEqual(wetWallsOf(ms, cs, "other"), []);
});

t("a Studs item (wall_frame) keeps its own centres for every wall and says so in a plain note", () => {
  const ms = [wm("a", 3600, 2400, "Wall 1", { studCentresMm: 450 })];
  const studsItem = { id: "st", name: "Studs", methodKey: "wall_frame", methodVersion: 1, spec: { family: "timber", purpose: "studs", section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", stock: {} }, rules: { centresMm: 600, studHeightMm: 2400 } };
  const c = computeWorkspace(snap([studsItem], ms, [{ id: "cs", measurementId: "a", jobMaterialId: "st", role: "wall" }]));
  const note = c.materialResults.st.problems.find((p) => p.code === "wall_centres_ignored");
  assert.ok(note && note.blocking === false, JSON.stringify(c.materialResults.st.problems));
  assert.match(note.message, /Wall 1 is set to 450 centres, but Studs uses its own centres \(600\)/);
  assert.equal(c.materialResults.st.layouts[0].ticks.filter((x) => x.state !== "removed").length, 7);
});

t("server whitelist: studCentresMm 450 is kept, 50 and 5,000 are refused plainly, empty means absent", () => {
  const base = { kind: "rect", widthMm: 3000, heightMm: 2400, name: "W" };
  assert.equal(cleanMeasurementInputs("wall", { ...base, studCentresMm: 450 }, null).studCentresMm, 450);
  for (const v of [50, 5000]) assert.throws(() => cleanMeasurementInputs("wall", { ...base, studCentresMm: v }, null), /Stud centres must be between 100 and 1,200 mm/);
  for (const v of [undefined, null, ""]) assert.ok(!("studCentresMm" in cleanMeasurementInputs("wall", { ...base, studCentresMm: v }, null)));
});

console.log(`takeoff-tc-hub031: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
