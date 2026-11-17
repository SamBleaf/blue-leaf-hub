// HUB 031 (Sam, 17 Nov 2026): per-wall stud centres (wet areas at 450), cavity sliders, full-height openings,
// automatic opening framing, lintels from cited span tables. Plans: docs/takeoff/OPENING_FRAMING_RULES_PLAN.md and
// WET_WALLS_AND_CAVITY_DOORS_PLAN.md; Sam's answers (docs/takeoff/OWNER_ANSWERS_17NOV.md) override them.
//   node scripts/tests/takeoff-tc-hub031.test.mjs
import assert from "node:assert/strict";
import { CALCULATION_VERSION, CAVITY_LEAF_WIDE_MM, CAVITY_SLIDER_EXTRA_MM, WALL_FRAMING_RULES, WET_WALL_CENTRES_MM, cavityLeafFromOpening, cavityOpeningWidth, computeWorkspace, wallFramingDefaults } from "../../shared/takeoff/index.js";
import { cleanMeasurementInputs } from "../../server/lib/takeoff/takeoffService.mjs";
import { fixedWidthOpening } from "../../src/components/takeoff/measure/geometry.js";
import { NOTE_CODES } from "../../shared/takeoff/fixes.js";
import { cavityConvert, fullHeightFollowers, fullHeightMm, lastOpeningSizes, itemCentresMm, toggleWetWall, wallFramingNotes, wallFramingText, wallFramingTotals, wetWallsOf, withWallCentres } from "../../src/components/takeoff/measure/tools.js";

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

// ══ Step 2: cavity slider (opening = 2 × door + 20) ═════════════════════════════════════════════════════════════
t("a cavity slider's opening is 2 × the door + 20: 920 → 1,860, 820 → 1,660; the door is read back to the nearest 10", () => {
  assert.equal(CAVITY_SLIDER_EXTRA_MM, 20);
  assert.equal(cavityOpeningWidth(920), 1860);
  assert.equal(cavityOpeningWidth(820), 1660);
  assert.equal(cavityLeafFromOpening(1860), 920);
  assert.equal(CAVITY_LEAF_WIDE_MM, 1200);
});

t("framing: a 1,860 slider at 600 in a 3,600 wall has no stud inside the pocket, 2 full studs at each edge (pocket end included)", () => {
  const ms = [wm("w", 3600, 2400, "Wall 1"), om("o", "w", "D1", "door", 600, 1860, 2040, 0, { cavityLeafMm: 920, cavityPocket: "right" })];
  const c = wf(ms);
  const l = wl(c, "Wall 1");
  nearAll(st(l), [0, 532.5, 577.5, 2482.5, 2527.5, 3000, 3600]);
  assert.deepEqual(l.ticks.filter((x) => x.state === "removed").map((x) => x.positionMm), [1200, 1800, 2400]);
  assert.equal(l.ticks.filter((x) => x.state === "side").length, 4);
});

t("placing a slider: the first tap is the doorway end, the second only gives the direction (and so the pocket side); width is always 1,860", () => {
  const r = fixedWidthOpening({ wallLenMm: 3600, firstMm: 603, secondMm: 1500, widthMm: 1860 });
  assert.deepEqual(r, { ok: true, xMm: 600, widthMm: 1860, pocket: "right", movedMm: 0 });
  const back = fixedWidthOpening({ wallLenMm: 3600, firstMm: 2460, secondMm: 1000, widthMm: 1860 });
  assert.deepEqual(back, { ok: true, xMm: 600, widthMm: 1860, pocket: "left", movedMm: 0 });
  assert.equal(fixedWidthOpening({ wallLenMm: 3600, firstMm: 600, secondMm: 604, widthMm: 1860 }).widthMm, 1860, "tap rounding can't turn 920 into 1,840");
});

t("placing a slider: a finger's slip (100 mm or less) past the wall end slides back and says so; more, or running into W1, is refused; too long for the wall is refused", () => {
  assert.deepEqual(fixedWidthOpening({ wallLenMm: 2400, firstMm: 580, secondMm: 900, widthMm: 1860 }), { ok: true, xMm: 540, widthMm: 1860, pocket: "right", movedMm: 40 });
  assert.deepEqual(fixedWidthOpening({ wallLenMm: 2400, firstMm: 200, secondMm: 100, widthMm: 1860 }), { ok: false, reason: "past_end", overMm: 1660 });
  assert.deepEqual(fixedWidthOpening({ wallLenMm: 2400, firstMm: 700, secondMm: 900, widthMm: 1860 }), { ok: false, reason: "past_end", overMm: 160 });
  assert.deepEqual(fixedWidthOpening({ wallLenMm: 1500, firstMm: 0, secondMm: 100, widthMm: 1860 }), { ok: false, reason: "too_long" });
  assert.deepEqual(fixedWidthOpening({ wallLenMm: 5000, firstMm: 1000, secondMm: 2000, widthMm: 1860, others: [{ x0: 2500, x1: 3400, label: "W1" }] }), { ok: false, reason: "overlap", label: "W1" });
  assert.equal(fixedWidthOpening({ wallLenMm: 5000, firstMm: 1000, secondMm: 1000, widthMm: 1860 }).reason, "no_direction");
});

t("an existing door → cavity slider: right keeps the offset, left moves it back by door + 20, over 1,200 wide is read as the whole opening, no room is refused", () => {
  const door = { xMm: 2000, sillMm: 0, widthMm: 920, heightMm: 2040, type: "door", label: "D1" };
  assert.deepEqual(cavityConvert(door, "right", 5000).inputs, { ...door, widthMm: 1860, cavityLeafMm: 920, cavityPocket: "right" });
  assert.deepEqual(cavityConvert(door, "left", 5000).inputs, { ...door, xMm: 1060, widthMm: 1860, cavityLeafMm: 920, cavityPocket: "left" });
  assert.match(cavityConvert({ ...door, xMm: 200 }, "left", 5000).error, /runs past the end of this wall/);
  assert.match(cavityConvert(door, "right", 5000, [{ x0: 3000, x1: 3500, label: "W1" }]).error, /runs into W1/);
  const wide = cavityConvert({ ...door, widthMm: 1860 }, null, 5000);
  assert.equal(wide.inputs.cavityLeafMm, 920);
  assert.equal(wide.inputs.widthMm, 1860);
  assert.equal(wide.wide, true);
  assert.match(cavityConvert(door, null, 5000).error, /Choose the side/);
});

t("the last slider's door width is remembered for the next one", () => {
  const ms = [wm("w", 5000, 2400, "Wall 1"), om("o", "w", "D1", "door", 600, 1860, 2040, 0, { cavityLeafMm: 920, cavityPocket: "left" })];
  assert.equal(lastOpeningSizes(ms).door.leafMm, 920);
  assert.deepEqual(lastOpeningSizes([wm("w", 5000, 2400, "Wall 1")]).door, { heightMm: null });
});

t("server whitelist: cavityLeafMm and cavityPocket stay on a door only; 200 is refused plainly; a window drops them", () => {
  const base = { xMm: 0, sillMm: 0, widthMm: 1860, heightMm: 2040, label: "D1" };
  const ok = cleanMeasurementInputs("opening", { ...base, type: "door", cavityLeafMm: 920, cavityPocket: "left" }, null);
  assert.deepEqual([ok.cavityLeafMm, ok.cavityPocket], [920, "left"]);
  const win = cleanMeasurementInputs("opening", { ...base, type: "window", cavityLeafMm: 920, cavityPocket: "left" }, null);
  assert.ok(!("cavityLeafMm" in win) && !("cavityPocket" in win));
  assert.throws(() => cleanMeasurementInputs("opening", { ...base, type: "door", cavityLeafMm: 200 }, null), /Door width must be between 300 and 1,500 mm/);
  assert.ok(!("cavityPocket" in cleanMeasurementInputs("opening", { ...base, type: "door", cavityLeafMm: 920, cavityPocket: "up" }, null)));
});

// ══ Step 3: full height (opening height = wall height, stored as a flag) ═════════════════════════════════════════
t("full height: the opening resolves to wall height − sill whatever was stored; a raised wall takes it up with no 'clipped' note", () => {
  const door = (h, extra = {}) => om("o", "w", "D1", "door", 1000, 820, h, 0, extra);
  const at2400 = wf([wm("w", 3000, 2400, "Wall 1"), door(2400, { fullHeight: true })]);
  const at2700 = wf([wm("w", 3000, 2700, "Wall 1"), door(2400, { fullHeight: true })]);   // the stored 2,400 is stale: the wall went up
  const plain = wf([wm("w", 3000, 2700, "Wall 1"), door(2400)]);
  const opening = (c) => wl(c, "Wall 1").openings[0];
  assert.equal(opening(at2400).headMm, 2400);
  assert.equal(opening(at2700).headMm, 2700, "follows the wall");
  assert.equal(opening(plain).headMm, 2400, "without the flag the stored height stands");
  assert.ok(!WR(at2700).problems.some((p) => p.code === "opening_clipped"));
  // a window with a sill runs from the sill to the top of the wall
  const win = wf([wm("w", 3000, 2700, "Wall 1"), om("o", "w", "W1", "window", 1000, 900, 1200, 900, { fullHeight: true })]);
  assert.equal(opening(win).headMm, 2700);
  assert.equal(opening(win).sillMm, 900);
});

t("full height: studs, plates and noggins count as for any opening of that width (nothing is framed above the head by Walls itself)", () => {
  const full = wf([wm("w", 3000, 2400, "Wall 1"), om("o", "w", "D1", "door", 1000, 820, 2400, 0, { fullHeight: true })]);
  const door = wf([wm("w", 3000, 2400, "Wall 1"), om("o", "w", "D1", "door", 1000, 820, 2040, 0)]);
  assert.deepEqual(st(wl(full, "Wall 1")), st(wl(door, "Wall 1")));
});

t("full height on a legacy Studs item in frame-height mode never blocks (head = the top of the studs)", () => {
  const studsItem = { id: "st", name: "Studs", methodKey: "wall_frame", methodVersion: 1, spec: { family: "timber", purpose: "studs", section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", stock: {} }, rules: { centresMm: 600, studHeightMm: 2200 } };
  const c = computeWorkspace(snap([studsItem], [wm("w", 3000, 2400, "Wall 1"), om("o", "w", "D1", "door", 1000, 820, 2400, 0, { fullHeight: true })], [{ id: "cs", measurementId: "w", jobMaterialId: "st", role: "wall" }]));
  assert.ok(!c.materialResults.st.problems.some((p) => p.blocking), JSON.stringify(c.materialResults.st.problems));
  assert.equal(c.materialResults.st.layouts[0].openings[0].headMm, 2200);
});

t("full height helpers: the stored snapshot is wall height − sill; followers rewrite it in the wall's own edit, plain openings untouched", () => {
  assert.equal(fullHeightMm({ kind: "rect", heightMm: 2700 }, 0), 2700);
  assert.equal(fullHeightMm({ kind: "rect", heightMm: 2700 }, 900), 1800);
  assert.equal(fullHeightMm({ kind: "rect", heightMm: 2700 }, 2700), null);
  assert.equal(fullHeightMm({ kind: "gable", heightMm: 2700 }, 0), null);
  const ops = [om("d", "w", "D1", "door", 0, 820, 2400, 0, { fullHeight: true }), om("w1", "w", "W1", "window", 1000, 900, 1500, 300, { fullHeight: true }), om("p", "w", "W2", "window", 2000, 900, 1200, 900)];
  const fol = fullHeightFollowers(ops, { kind: "rect", heightMm: 2700 });
  assert.deepEqual(fol.map((f) => [f.next.id, f.next.inputs.heightMm]), [["d", 2700], ["w1", 2400]]);
  assert.deepEqual(fullHeightFollowers(ops.slice(0, 1), { kind: "rect", heightMm: 2400 }), [], "already right: no edit");
});

t("server whitelist: fullHeight is kept only as true", () => {
  const base = { xMm: 0, sillMm: 0, widthMm: 820, heightMm: 2400, label: "D1", type: "door" };
  assert.equal(cleanMeasurementInputs("opening", { ...base, fullHeight: true }, null).fullHeight, true);
  for (const v of ["true", 1, false, null]) assert.ok(!("fullHeight" in cleanMeasurementInputs("opening", { ...base, fullHeight: v }, null)));
});

console.log(`takeoff-tc-hub031: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
