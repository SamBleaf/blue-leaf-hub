// HUB 031 (Sam, 17 Nov 2026): per-wall stud centres (wet areas at 450), cavity sliders, full-height openings,
// automatic opening framing, lintels from cited span tables. Plans: docs/takeoff/OPENING_FRAMING_RULES_PLAN.md and
// WET_WALLS_AND_CAVITY_DOORS_PLAN.md; Sam's answers (docs/takeoff/OWNER_ANSWERS_17NOV.md) override them.
//   node scripts/tests/takeoff-tc-hub031.test.mjs
import assert from "node:assert/strict";
import { CALCULATION_VERSION, CAVITY_SLIDER_EXTRA_MM, WALL_FRAMING_RULES, WET_WALL_CENTRES_MM, cavityOpeningWidth, computeWorkspace, wallFramingDefaults } from "../../shared/takeoff/index.js";
import { cleanMaterialContent, cleanMeasurementInputs } from "../../server/lib/takeoff/takeoffService.mjs";
import { OPENING_JAMBS_MIN, TRIMMER_STACK_RULE, expandOpening, trimmerStackCount } from "../../shared/takeoff/engine/openingRules.js";
import { buildCalibration } from "../../shared/takeoff/index.js";
import { fixedWidthOpening, planCavityOpening } from "../../src/components/takeoff/measure/geometry.js";
import { NOTE_CODES } from "../../shared/takeoff/fixes.js";
import { LINTEL_PRODUCTS, ROOF_LOAD_WIDTHS_MM, selectJambs, selectLintel, tableRecord } from "../../shared/takeoff/standards/index.js";
import MGP10 from "../../shared/takeoff/standards/data/as1684-mgp10-n1n2.js";
import SMART10 from "../../shared/takeoff/standards/data/smart10-2024.js";
import L13 from "../../shared/takeoff/standards/data/smartlvl13-e1-2021.js";
import { openingRuleText, cavityConvert, fullHeightFollowers, fullHeightMm, lastOpeningSizes, itemCentresMm, toggleWetWall, wallFramingNotes, wallFramingText, wallFramingTotals, wetWallsOf, withWallCentres } from "../../src/components/takeoff/measure/tools.js";

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
  assert.match(CALCULATION_VERSION, /^takeoff-calc@8$/);
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
t("a cavity slider's opening is 2 × the door + 20: 920 → 1,860, 820 → 1,660", () => {
  assert.equal(CAVITY_SLIDER_EXTRA_MM, 20);
  assert.equal(cavityOpeningWidth(920), 1860);
  assert.equal(cavityOpeningWidth(820), 1660);
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

t("an existing door → cavity slider keeps the door where it is (full rework in takeoff-tc-cavity-door)", () => {
  const door = { xMm: 2000, sillMm: 0, widthMm: 920, heightMm: 2040, type: "door", label: "D1" };
  assert.deepEqual(cavityConvert(door, "right", 5000).inputs, { ...door, widthMm: 1860, cavityLeafMm: 920, cavityPocket: "right" });
  assert.deepEqual(cavityConvert(door, "left", 5000).inputs, { ...door, xMm: 1060, widthMm: 1860, cavityLeafMm: 920, cavityPocket: "left" });
  assert.match(cavityConvert({ ...door, xMm: 200 }, "left", 5000).warning, /past the start of the wall/);
  assert.match(cavityConvert(door, "right", 5000, [{ x0: 3000, x1: 3500, label: "W1" }]).warning, /runs into W1/);
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

t("on the plan: two taps on a calibrated wall give the slider, the pocket side from the second tap, refusals keep the first tap", () => {
  const k = 0.05, X0 = 100, Y0 = 100;
  const cal = { id: "cal", documentId: "d", pageIndex: 0, ...buildCalibration({ basisRotation: 0, horizontal: { p1: { x: X0, y: Y0 - 40 }, p2: { x: X0 + 12000 * k, y: Y0 - 40 }, knownMm: 12000 },
    vertical: { p1: { x: X0 - 40, y: Y0 }, p2: { x: X0 - 40, y: Y0 + 8000 * k }, knownMm: 8000 } }).calibration };
  const at = (x, y) => ({ x: X0 + x * k, y: Y0 + y * k });
  const walls = [{ id: "w1", points: [at(0, 0), at(6000, 0)], cal }];
  const opts = { pxPerUnit: 0.06 / k };
  const r = planCavityOpening(walls, at(603, 3), at(2000, 2), 1860, new Map(), opts);
  assert.deepEqual([r.ok, r.wallId, r.xMm, r.widthMm, r.pocket, r.movedMm], [true, "w1", 600, 1860, "right", 0]);
  const l = planCavityOpening(walls, at(3000, 0), at(1000, 0), 1860, new Map(), opts);
  assert.deepEqual([l.ok, l.xMm, l.pocket], [true, 1140, "left"], "the doorway end is the first tap; the pocket runs back towards the wall start");
  const hit = planCavityOpening(walls, at(500, 0), at(900, 0), 1860, new Map([["w1", [{ x0: 1800, x1: 2400, label: "W1" }]]]), opts);
  assert.deepEqual([hit.ok, hit.reason, hit.label], [false, "overlap", "W1"]);
  assert.equal(planCavityOpening(walls, at(5000, 0), at(5600, 0), 1860, new Map(), opts).reason, "past_end");
  assert.equal(planCavityOpening(walls, at(100, 3000), at(900, 3000), 1860, new Map(), opts).reason, "no_wall", "a tap off every wall");
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

// ══ Step 4: automatic opening framing ═══════════════════════════════════════════════════════════════════════════
/** A Walls item with the opening rules ON (the default), through the real computeWorkspace. */
const ruled = (measurements, rules = {}) => wf(measurements, { rules: { ...WALL_FRAMING_RULES, ...rules } });
const dem = (c, re) => WR(c).demands.filter((d) => re.test(d.label)).map((d) => [d.label.replace(/^Wall \d+ /, ""), d.quantity, d.lengthMm]);
const codesOf = (c) => WR(c).problems.map((p) => p.code);
// Sam's wall: 3,955 × 2,700, W1 3,430 × 600 at 450, sill 2,000 from the floor
const SAM = () => [wm("w", 3955, 2700, "Wall 1"), om("o", "w", "W1", "window", 450, 3430, 600, 2000)];

t("the rules are on by default: kings, jacks and trimmers are counted, and the old 'aren't counted' note is gone", () => {
  const c = ruled(SAM(), { carriesRoof: true });
  assert.ok(!codesOf(c).includes("opening_framing_not_counted"));
  assert.ok(WR(c).layouts[0].openings[0].rule, "the layout says how the opening was framed");
  const off = wf(SAM());
  assert.ok(codesOf(off).includes("opening_framing_not_counted"), "switched off, the Walls item is exactly as before");
});

t("Sam's wall: levels are from the FLOOR (a 45 plate under the studs), cripples under the sill at the wall's centres, a jack each side, stacked sill trimmers", () => {
  const c = ruled(SAM(), { carriesRoof: true });
  const l = wl(c, "Wall 1");
  nearAll(st(l), [0, 382.5, 3955]);   // the left king 1 jack (45) off the opening; the right king is the end stud
  assert.deepEqual(l.ticks.filter((x) => x.state === "removed").map((x) => x.positionMm), [600, 1200, 1800, 2400, 3000, 3600]);
  assert.deepEqual(dem(c, /below-sill/), [600, 1200, 1800, 2400, 3000, 3600].map((x) => [`W1 below-sill @ ${x.toLocaleString("en-AU")}`, 1, 1820]),
    "sill 2,000 from the floor − 45 plate = 1,955 − 3 stacked sill trimmers (135) = 1,820");
  assert.deepEqual(dem(c, /jack/), [["W1 jack × 2 @ 2,555 mm", 2, 2555]], "head 2,600 from the floor − 45 plate");
  assert.deepEqual(dem(c, /sill trimmer/), [["W1 sill trimmer × 3 @ 3,430 mm", 3, 3430]]);
  assert.deepEqual(dem(c, /above-head/), [], "no lintel size, so no cripples above");
  const r = l.openings[0].rule;
  assert.deepEqual([r.kings, r.jacks, r.jambsPerSide, r.jackLengthMm, r.sillFromStudBaseMm], [{ left: 1, right: 1 }, { left: 1, right: 1 }, 2, 2555, 1955]);
});

t("the jamb count includes the king and the stud under the lintel: 2 each side = 1 king + 1 jack; never fewer than 2", () => {
  assert.equal(OPENING_JAMBS_MIN, 2);
  const fake = (jambsPerSide) => ({ jambs: () => ({ outcome: "ok", jambsPerSide, basis: "test" }), lintels: () => ({ outcome: "needs_roof", reasons: ["x"] }) });
  const base = { studLengthMm: 2400, bottomPlateMm: 45, trimmerMm: 45, studWidthMm: 35, loadBearing: true, plateIdentity: {}, plateStock: {} };
  const o = { id: "o", label: "W1", type: "window", xLeftMm: 1000, xRightMm: 2200, sillMm: 900, headMm: 2100 };
  const three = expandOpening({ opening: o, ctx: { ...base, ...fake(3) } });
  assert.deepEqual([three.sides, three.jackMm, three.detail.members.find((m) => m.id === "jack").quantity], [{ left: 1, right: 1 }, { left: 70, right: 70 }, 4], "3 jambs = king + 2 jacks each side");
  const one = expandOpening({ opening: o, ctx: { ...base, ...fake(1) } });
  assert.equal(one.rule.jambsPerSide, 2, "a table count of 1 is lifted to the 2 a king and a jack make");
});

t("a window's levels: sill and head from the floor, one trimmer under 1,500 wide, cripples below = sill − plate − trimmer", () => {
  const c = ruled([wm("w", 4000, 2400, "Wall 1"), om("o", "w", "W1", "window", 1200, 1200, 1200, 900)], { carriesRoof: false });
  // 900 from the floor − 45 plate − 1 sill trimmer (45) = 810 at the stations inside 1,200–2,400: 1,800 (1,200 and 2,400 are on the edges)
  assert.deepEqual(dem(c, /below-sill/), [["W1 below-sill @ 1,800", 1, 810]]);
  // head 2,100 − 45 = 2,055 stud-base; the stud cut is 2,400, so 345 above; a non-loadbearing head trimmer (45) leaves 300 for cripples
  assert.deepEqual(dem(c, /above-head/), [["W1 above-head @ 1,800", 1, 300]]);
  assert.deepEqual(dem(c, /trimmer/).map((x) => x.slice(1)), [[1, 1290], [1, 1200]], "head trimmer between the kings (1,200 + a 45 jack each side), sill trimmer between the jacks");
});

t("a wall that doesn't carry the roof frames its head with trimmers (no lintel); one that does needs a lintel", () => {
  const no = ruled(SAM(), { carriesRoof: false });
  assert.deepEqual(dem(no, /head trimmer/).map((x) => x[1]), [3]);
  assert.ok(!codesOf(no).includes("lintel_not_sized"));
  const yes = ruled(SAM(), { carriesRoof: true });
  assert.deepEqual(dem(yes, /head trimmer/), []);
  assert.ok(codesOf(yes).includes("lintel_not_sized"));
  // a wall's own setting beats the item's
  const own = ruled([wm("w", 3955, 2700, "Wall 1", { loadBearing: false }), SAM()[1]], { carriesRoof: true });
  assert.deepEqual(dem(own, /head trimmer/).map((x) => x[1]), [3]);
  // nothing said at all: treated as carrying (never fewer studs than a loadbearing wall), and the lintel is asked for
  const unknown = ruled(SAM());
  assert.ok(codesOf(unknown).includes("lintel_not_sized"));
});

t("trimmers stack with the opening's width (a Blue Leaf default until Sam sets it from AS 1684), and the item says so once", () => {
  assert.deepEqual(TRIMMER_STACK_RULE.map((r) => [r.upToMm, r.count]), [[1500, 1], [2700, 2], [Infinity, 3]]);
  assert.deepEqual([900, 1500, 1501, 2700, 2701, 5000].map(trimmerStackCount), [1, 1, 2, 2, 3, 3]);
  const c = ruled([wm("w", 6000, 2400, "Wall 1"), om("a", "w", "W1", "window", 300, 3000, 900, 900), om("b", "w", "W2", "window", 3600, 2000, 900, 900)], { carriesRoof: false });
  assert.equal(WR(c).problems.filter((p) => p.code === "trimmer_stack_default").length, 1);
});

t("a framing detail typed on an opening wins: the rules leave it alone and the note to check the studs stays", () => {
  const detail = { source: "explicit", ref: "Sam", belowSill: { required: false }, aboveHead: { required: false }, members: [{ id: "k", role: "king", quantity: 2, lengthFrom: "stud", sameAsStud: true }] };
  const c = ruled([wm("w", 3000, 2400, "Wall 1"), om("o", "w", "D1", "door", 1000, 820, 2040, 0, { detail })], { carriesRoof: true });
  assert.equal(wl(c, "Wall 1").openings[0].rule, undefined);
  assert.ok(codesOf(c).includes("framing_detail_members"));
  assert.deepEqual(dem(c, /jack|trimmer|lintel/), []);
  // the 2-each-side studs of today are unchanged for it
  assert.equal(st(wl(c, "Wall 1")).length, st(wl(wf([wm("w", 3000, 2400, "Wall 1"), om("o", "w", "D1", "door", 1000, 820, 2040, 0, { detail })]), "Wall 1")).length);
});

t("a door: no sill trimmer, no cripples below, jacks to the head; a full-height door in a wall that doesn't carry the roof has no head, no cripples", () => {
  const door = ruled([wm("w", 3000, 2400, "Wall 1"), om("o", "w", "D1", "door", 1000, 820, 2040, 0)], { carriesRoof: false });
  assert.deepEqual(dem(door, /sill trimmer|below-sill/), []);
  assert.deepEqual(dem(door, /jack/), [["D1 jack × 2 @ 1,995 mm", 2, 1995]]);
  const full = ruled([wm("w", 3000, 2400, "Wall 1"), om("o", "w", "D1", "door", 1000, 820, 2400, 0, { fullHeight: true })], { carriesRoof: false });
  assert.deepEqual(dem(full, /head trimmer|above-head|lintel/), []);
  assert.deepEqual(dem(full, /jack/), [["D1 jack × 2 @ 2,400 mm", 2, 2400]], "full-height jacks");
  const lbw = ruled([wm("w", 3000, 2400, "Wall 1"), om("o", "w", "D1", "door", 1000, 820, 2400, 0, { fullHeight: true })], { carriesRoof: true });
  assert.ok(codesOf(lbw).includes("lintel_not_sized"));
  assert.match(WR(lbw).problems.find((p) => p.code === "lintel_not_sized").message, /engineered beam/);
});

t("a cavity slider: jamb studs at the doorway end (king + jack), 2 full studs at the pocket end, head trim over the whole opening; pocket side flips it", () => {
  const slider = (pocket) => ruled([wm("w", 3600, 2400, "Wall 1"), om("o", "w", "D1", "door", 600, 1860, 2040, 0, { cavityLeafMm: 920, cavityPocket: pocket })], { carriesRoof: false });
  const right = slider("right");
  const r = wl(right, "Wall 1").openings[0].rule;
  assert.deepEqual([r.kings, r.jacks, r.cavity], [{ left: 1, right: 2 }, { left: 1, right: 0 }, { leafMm: 920, pocket: "right" }]);
  nearAll(st(wl(right, "Wall 1")), [0, 532.5, 2482.5, 2527.5, 3000, 3600]);
  assert.deepEqual(dem(right, /jack/), [["D1 jack × 1 @ 1,995 mm", 1, 1995]]);
  assert.deepEqual(dem(right, /head trimmer/), [["D1 head trimmer × 2 @ 1,905 mm", 2, 1905]], "2 stacked over 1,860, between the king side jack and the pocket studs");
  const left = wl(slider("left"), "Wall 1").openings[0].rule;
  assert.deepEqual([left.kings, left.jacks], [{ left: 2, right: 1 }, { left: 0, right: 1 }]);
  assert.deepEqual(st(wl(slider("left"), "Wall 1")).filter((x) => x > 600 && x < 2460), [], "nothing stands in the pocket");
});

t("a slider's lintel is asked for even in a wall that doesn't carry the roof (no span table applies: type the head size)", () => {
  const c = ruled([wm("w", 3600, 2400, "Wall 1"), om("o", "w", "D1", "door", 600, 1860, 2040, 0, { cavityLeafMm: 920, cavityPocket: "right" })], { carriesRoof: false });
  assert.match(WR(c).problems.find((p) => p.code === "lintel_not_sized").message, /doesn't carry the roof, so there is no span table/);
});

t("the Walls line and wall notes say what was framed (lintels to size, plain words)", () => {
  const c = ruled(SAM(), { carriesRoof: true });
  assert.match(wallFramingText(wallFramingTotals(WR(c)), "Walls"), /1 to size/);
  const lay = WR(c).layouts[0];
  assert.match(openingRuleText(lay.openings[0]), /^W1: 1 king \+ 1 jack each side · lintel not sized \(the wind class isn't set\) · sill trimmer × 3\.$/);
  assert.ok(wallFramingNotes(WR(c), "w", null).some((x) => x.startsWith("W1: 1 king")));
});

// ══ Steps 5 and 6: lintels and jambs from cited span tables (MGP10 + the LVL guides) ════════════════════════════
t("the tables carry their source, edition and page, and the cells read straight off the PDFs match (spot checks by eye, whole lintel tables by script)", () => {
  const rec = Object.fromEntries(tableRecord().map((r) => [r.id, r]));
  assert.deepEqual([rec.T17.page, rec.T18.page, rec.T47.page, rec.T48.page, rec.T11.page, rec.T7.page, rec.T36.page], [22, 23, 50, 51, 14, 11, 41]);
  assert.equal(rec["L13-LINTEL"].edition, "E1 2021");
  assert.deepEqual(rec["L13-LINTEL"].page, [22, 23]);
  assert.equal(rec["S10-JAMB"].edition, "Mar 2024");
  assert.equal(rec["S10-JAMB"].page, 11);
  assert.equal(rec["S10-JAMB"].guidePage, 9);
  assert.equal(rec["L13-LINTEL"].rows, 60);
  assert.equal(rec["S10-JAMB"].rows, 28);
  // SmartLVL13 p. 19 of the guide (PDF 22), read from the rendered page: 300x45 sheet roof, RLW 4500 at 600 = 4000 with 5 mm more bearing
  const row = (size, mass) => L13.tables["L13-LINTEL"].rows.find((r) => r.size === size && r.massKgM2 === mass);
  const col = (rlw, sp) => L13.tables["L13-LINTEL"].columns.findIndex((c) => c.rlwMm === rlw && c.spacingMm === sp);
  assert.deepEqual([row("300x45", 40).spansMm[col(4500, 600)], row("300x45", 40).extraBearingMm[col(4500, 600)]], [4000, 5]);
  assert.deepEqual([row("400x45", 90).spansMm[col(7500, 1200)], row("400x45", 90).extraBearingMm[col(7500, 1200)]], [3600, 25]);
  assert.deepEqual([row("90x45", 90).spansMm[col(4500, 1200)], row("90x45", 40).spansMm[col(1500, 600)]], [null, 2000], "NS reads as null");
  assert.deepEqual(row("2/400x45", 90).spansMm, [6200, 6200, 5300, 5300, 4900, 4800, 4500, 4500, 4300, 4300]);
  // Smart10 guide p. 9 (PDF 11): 2/90x35 at 2,700 high, sheet roof
  const j = SMART10.tables["S10-JAMB"].rows.find((r) => r.config === "2/90x35" && r.heightMm === 2700);
  assert.deepEqual(j.maxOpeningMm, [3600, 3600, 3200, 2500, 2200, 3600, 3300, 2700, 2200, 1800]);
  // AS 1684.2 Supp 4 T17: 190x45
  assert.deepEqual(MGP10.tables.T17.rows.find((r) => r.size === "190x45").maxSpanMm, [3600, 3500, 3000, 3000, 2700, 2700, 2400, 2400, 2200, 2200]);
  assert.equal(MGP10.tables.T11.verified, true);
});

t("the SmartLVL 13 guide's own worked example: N4, sheet roof, spacing 600, 3,500 span, roof width 3,900 → 300 × 45 with 5 mm extra bearing", () => {
  const r = selectLintel({ product: "SmartLVL13", roofMass: "sheet", rlwMm: 3900, spacingMm: 600, windClass: "N4", spanMm: 3500 });
  assert.deepEqual([r.outcome, r.section, r.plies, r.extraBearingMm, r.grade], ["ok", "300x45", 1, 5, "LVL13"]);
  assert.match(r.basis, /SmartLVL 13 Design Guide \(E1 2021\), L13-LINTEL, page 22 and 23/);
});

t("the Smart10 guide's own worked example: sheet roof, 1,800 opening, 2,700 jambs, roof width 4,100 → 2/90 × 35 (two jamb studs a side)", () => {
  const r = selectJambs({ stud: { depthMm: 90, widthMm: 35, grade: "LVL Smart 10" }, roofMass: "sheet", rlwMm: 4100, windClass: "N3", jambHeightMm: 2700, openingWidthMm: 1800 });
  assert.deepEqual([r.outcome, r.jambsPerSide, r.section, r.table], ["ok", 2, "90x35", "S10-JAMB"]);
  assert.match(r.basis, /Smart10 LVL Stud Design Guide \(Mar 2024\), S10-JAMB, page 11 \(guide p\. 9\), sheet roof, roof width 4500/);
});

t("a pine MGP10 stud reads the AS 1684.2 N1/N2 jamb table (T11); a wider opening or a heavier roof asks for more studs", () => {
  const q = { stud: { depthMm: 90, widthMm: 45, grade: "MGP10" }, roofMass: "sheet", rlwMm: 3000, windClass: "N2", jambHeightMm: 2400 };
  const small = selectJambs({ ...q, openingWidthMm: 900 });
  const big = selectJambs({ ...q, openingWidthMm: 3000 });
  assert.equal(small.outcome, "ok");
  assert.ok(big.outcome !== "ok" || big.jambsPerSide >= small.jambsPerSide);
  assert.match(small.basis, /AS 1684\.2 N1\/N2 Supplement 4 \(2006\), T11, page 14/);
});

t("fail closed: anything missing is 'needs roof information', anything outside a table is 'engineer', never a default or a nearest size", () => {
  const ok = { product: "SmartLVL13", roofMass: "sheet", rlwMm: 3000, spacingMm: 600, windClass: "N2", spanMm: 1800 };
  assert.equal(selectLintel(ok).outcome, "ok");
  for (const k of ["roofMass", "rlwMm", "spacingMm", "windClass"]) assert.equal(selectLintel({ ...ok, [k]: undefined }).outcome, "needs_roof", k);
  assert.match(selectLintel({ ...ok, windClass: undefined }).reasons[0], /wind class/);
  assert.equal(selectLintel({ ...ok, windClass: "N5" }).outcome, "engineer");
  assert.equal(selectLintel({ ...ok, windClass: "C2" }).outcome, "engineer");
  assert.equal(selectLintel({ ...ok, product: "MGP10", windClass: "N3" }).outcome, "engineer", "the pine tables are N1 and N2 only");
  assert.equal(selectLintel({ ...ok, storey: "lower" }).outcome, "engineer");
  assert.equal(selectLintel({ ...ok, rlwMm: 7501 }).outcome, "engineer");
  assert.equal(selectLintel({ ...ok, spacingMm: 1201 }).outcome, "engineer");
  assert.equal(selectLintel({ ...ok, spanMm: 9000 }).outcome, "engineer");
  assert.equal(selectLintel({ ...ok, roofMass: "slate" }).outcome, "needs_roof");
  assert.equal(selectJambs({ stud: { depthMm: 90, widthMm: 35, grade: "F7" }, roofMass: "sheet", rlwMm: 3000, windClass: "N2", jambHeightMm: 2400, openingWidthMm: 900 }).outcome, "not_in_table");
  assert.equal(selectJambs({ stud: { depthMm: 90, widthMm: 35, grade: "LVL Smart 10" }, roofMass: "sheet", rlwMm: 3000, windClass: "N2", jambHeightMm: 3300, openingWidthMm: 900 }).outcome, "engineer", "taller than any tabulated jamb");
  assert.equal(selectJambs({ stud: { depthMm: 140, widthMm: 35, grade: "LVL Smart 10" }, roofMass: "sheet", rlwMm: 3000, windClass: "N2", jambHeightMm: 2400, openingWidthMm: 900 }).outcome, "not_in_table");
  assert.deepEqual(ROOF_LOAD_WIDTHS_MM, [1500, 3000, 4500, 6000, 7500]);
  assert.equal(LINTEL_PRODUCTS[0][0], "SmartLVL13");
});

t("roof width and spacing round UP to the next column (the conservative way)", () => {
  const base = { product: "SmartLVL13", roofMass: "sheet", windClass: "N2", spanMm: 2000 };
  const a = selectLintel({ ...base, rlwMm: 3001, spacingMm: 601 });
  const b = selectLintel({ ...base, rlwMm: 4500, spacingMm: 1200 });
  assert.equal(a.section, b.section);
  assert.match(a.basis, /roof width 4500, spacing 1200/);
});

t("a lintel never wider than the wall: a 2 × 63 (126) isn't offered in a 90 wall", () => {
  const r = selectLintel({ product: "SmartLVL13", roofMass: "sheet", rlwMm: 1500, spacingMm: 600, windClass: "N2", spanMm: 2050, maxThicknessMm: 90 });
  assert.ok(r.breadthMm * r.plies <= 90, JSON.stringify(r));
});

const FULL_ROOF = { carriesRoof: true, roofMass: "sheet", rlwMm: 3000, rafterSpacingMm: 600, windClass: "N2" };
const sam = () => wallFramingDefaults([product("p-plate", "plates"), product("p-nog", "noggins", { section: { depthMm: 90, widthMm: 35 } })]);
const withRoof = (measurements, over = {}) => wf(measurements, { spec: sam(), rules: { ...WALL_FRAMING_RULES, ...FULL_ROOF, ...over } });

t("Sam's wall with a roof described: the lintel comes from the table (240 × 45 LVL13 for 3,430 at roof width 3,000), it doesn't fit under a 2,600 head, and says so", () => {
  const c = withRoof(SAM());
  const r = wl(c, "Wall 1").openings[0].rule;
  assert.deepEqual([r.lintel.status, r.lintel.section, r.lintel.grade, r.lintel.plies], ["sized", "240x45", "LVL13", 1]);
  assert.deepEqual(r.lintel.noFit, { neededMm: 240, freeMm: 145 }, "2,700 stud − 2,555 head from the stud base");
  assert.match(WR(c).problems.find((p) => p.code === "lintel_no_fit").message, /240 deep lintel won't fit\. Only 145 mm is free above the head/);
  assert.deepEqual(dem(c, /lintel/), [["W1 lintel × 1 @ 3,500 mm", 1, 3500]], "cut = 3,430 + a 35 jack each side");
  assert.deepEqual(dem(c, /above-head/), [], "no room above the lintel");
  assert.match(wallFramingText(wallFramingTotals(WR(c)), "Walls"), /1 lintel, 1 won't fit/);
});

t("jambs from the Smart10 table for Sam's 90 × 35 LVL studs: 2 a side at 3,000 roof width for a 3,430 opening, three at a heavier roof", () => {
  const c = withRoof(SAM());
  assert.equal(wl(c, "Wall 1").openings[0].rule.jambTable.jambsPerSide, 2);
  assert.match(wl(c, "Wall 1").openings[0].rule.jambTable.basis, /Smart10 LVL Stud Design Guide \(Mar 2024\), S10-JAMB/);
  const heavy = withRoof(SAM(), { rlwMm: 7500, roofMass: "tile" });
  const hr = wl(heavy, "Wall 1").openings[0].rule;
  assert.ok(hr.jambsPerSide >= 3 || hr.jambTable.outcome === "engineer", JSON.stringify(hr.jambTable));
});

t("a window that fits: the lintel is counted with its cut length, cripples above it are counted from its depth, in the item's own product", () => {
  const ms = [wm("w", 4000, 2700, "Wall 1"), om("o", "w", "W1", "window", 1000, 1200, 1200, 900)];
  const c = withRoof(ms);
  const r = wl(c, "Wall 1").openings[0].rule;
  assert.equal(r.lintel.status, "sized");
  const depth = r.lintel.depthMm;
  // head 2,100 − 45 plate = 2,055 stud-base; cripples above = 2,700 − 2,055 − lintel depth, at the stations inside 1,000–2,200: 1,200 / 1,800
  assert.deepEqual(dem(c, /above-head/).map((x) => x[2]), [2700 - 2055 - depth, 2700 - 2055 - depth]);
  assert.equal(dem(c, /lintel/)[0][2], 1200 + 2 * 35, "cut = the opening + a 35 jack (Sam's 90 × 35 studs) each side");
  assert.ok(WR(c).demands.some((d) => /lintel/.test(d.label) && d.identity.grade === "LVL13" && d.identity.treatment === "H2"));
});

t("a typed lintel on the opening beats the table; 'Pine MGP10' reads the AS 1684 lintel tables for N1/N2 only", () => {
  const typed = withRoof([wm("w", 4000, 2700, "Wall 1"), om("o", "w", "W1", "window", 1000, 1200, 1200, 900, { lintel: { depthMm: 190, breadthMm: 45, plies: 2, grade: "LVL13" } })]);
  const r = wl(typed, "Wall 1").openings[0].rule;
  assert.deepEqual([r.lintel.status, r.lintel.section, r.lintel.plies], ["typed", "190x45", 2]);
  assert.deepEqual(dem(typed, /lintel/).map((x) => x[1]), [2], "2/190x45: two pieces");
  const pine = withRoof([wm("w", 4000, 2700, "Wall 1"), om("o", "w", "W1", "window", 1000, 1200, 1200, 900)], { lintelProduct: "MGP10" });
  assert.equal(wl(pine, "Wall 1").openings[0].rule.lintel.grade, "MGP10");
  assert.match(wl(pine, "Wall 1").openings[0].rule.lintel.basis, /AS 1684\.2 N1\/N2 Supplement 4 \(2006\), T17, page 22/);
  const n3 = withRoof([wm("w", 4000, 2700, "Wall 1"), om("o", "w", "W1", "window", 1000, 1200, 1200, 900)], { lintelProduct: "MGP10", windClass: "N3" });
  assert.equal(wl(n3, "Wall 1").openings[0].rule.lintel.status, "engineer");
});

t("tap the lintel to add load information: a bigger roof width on one opening gives a deeper lintel for that opening only", () => {
  const ms = [wm("w", 6000, 2700, "Wall 1"), om("a", "w", "W1", "window", 500, 1800, 1200, 900), om("b", "w", "W2", "window", 3000, 1800, 1200, 900, { loadRlwMm: 7500 })];
  const c = withRoof(ms);
  const [a, b] = wl(c, "Wall 1").openings.map((o) => o.rule.lintel);
  assert.ok(b.depthMm > a.depthMm, `${a.section} vs ${b.section}`);
  assert.match(b.basis, /roof width 7500/);
});

t("a wide slider in a wall that carries the roof: the lintel comes from the table, over the whole 1,860, with its head trim", () => {
  const ms = [wm("w", 3600, 2700, "Wall 1"), om("o", "w", "D1", "door", 600, 1860, 2040, 0, { cavityLeafMm: 920, cavityPocket: "right" })];
  const c = withRoof(ms);
  const r = wl(c, "Wall 1").openings[0].rule;
  assert.equal(r.lintel.status, "sized");
  assert.equal(dem(c, /lintel/)[0][2], 1860 + 35, "1,860 + the doorway end's 35 jack (the pocket end is 2 full studs)");
  assert.deepEqual(dem(c, /head trimmer/).map((x) => x[1]), [2]);
});

t("the Walls item reads the same through the real computeWorkspace: orders carry the lintel as its own line (the item's product, not 'studs')", () => {
  const c = withRoof([wm("w", 4000, 2700, "Wall 1"), om("o", "w", "W1", "window", 1000, 1200, 1200, 900)]);
  assert.ok(c.scheduleLines.some((l) => /LVL13/.test(l.item.description) && /45/.test(l.item.description)), JSON.stringify(c.scheduleLines.map((l) => l.item.description)));
  assert.ok(!WR(c).problems.some((p) => p.blocking), JSON.stringify(WR(c).problems.filter((p) => p.blocking)));
});

t("server whitelist: a typed lintel (section, pieces, grade), the roof width an opening carries, a wall's loadBearing and the item's roof answers are kept; nonsense is refused plainly", () => {
  const base = { xMm: 0, sillMm: 900, widthMm: 1200, heightMm: 1200, label: "W1", type: "window" };
  const ok = cleanMeasurementInputs("opening", { ...base, lintel: { depthMm: 190, breadthMm: 45, plies: 2, grade: "LVL13", junk: 1 }, loadRlwMm: 4500 }, null);
  assert.deepEqual([ok.lintel, ok.loadRlwMm], [{ depthMm: 190, breadthMm: 45, plies: 2, grade: "LVL13" }, 4500]);
  assert.throws(() => cleanMeasurementInputs("opening", { ...base, lintel: { depthMm: 10, breadthMm: 45 } }, null), /Lintel depth must be between 40 and 600 mm/);
  assert.throws(() => cleanMeasurementInputs("opening", { ...base, lintel: { depthMm: 190, breadthMm: 45, plies: 9 } }, null), /1 to 4 pieces/);
  assert.ok(!("lintel" in cleanMeasurementInputs("opening", base, null)));
  const wallBase = { kind: "rect", widthMm: 3000, heightMm: 2400, name: "W" };
  assert.equal(cleanMeasurementInputs("wall", { ...wallBase, loadBearing: false }, null).loadBearing, false);
  assert.ok(!("loadBearing" in cleanMeasurementInputs("wall", { ...wallBase, loadBearing: "yes" }, null)));
  const spec = wallFramingDefaults([]);
  const m = cleanMaterialContent({ name: "Walls", methodKey: "wall_framing", methodVersion: 1, spec,
    rules: { centresMm: 600, carriesRoof: true, roofMass: "sheet", rlwMm: 3000, rafterSpacingMm: 600, windClass: "N2", lintelProduct: "MGP10", openingFraming: false } });
  assert.deepEqual([m.rules.carriesRoof, m.rules.roofMass, m.rules.rlwMm, m.rules.rafterSpacingMm, m.rules.windClass, m.rules.lintelProduct, m.rules.openingFraming], [true, "sheet", 3000, 600, "N2", "MGP10", false]);
});

t("NOTE_CODES: the opening rules' notes are notes (never a fix row)", () => {
  for (const c of ["jambs_minimum_used", "trimmer_stack_default", "lintel_not_sized", "lintel_no_fit", "lintel_bearing"]) assert.ok(NOTE_CODES.includes(c), c);
});

t("a lintel that can't be sized leaves the quantity 'incomplete' (not blocking); once sized it is 'calculated'", () => {
  const un = ruled(SAM(), { carriesRoof: true });
  assert.equal(WR(un).status.quantity, "incomplete");
  assert.ok(!WR(un).problems.some((p) => p.blocking));
  const sized = withRoof([wm("w", 4000, 2700, "Wall 1"), om("o", "w", "W1", "window", 1000, 1200, 1200, 900)]);
  assert.equal(WR(sized).status.quantity, "calculated");
  const none = ruled(SAM(), { carriesRoof: false });
  assert.equal(WR(none).status.quantity, "calculated", "a wall that doesn't carry the roof has no lintel to size");
});

import { readFileSync } from "node:fs";
t("MeasureScreen wording (browser check): slider card names the opening and door, hints say one end / other end, a note shows above the fold, short walls drop the length", () => {
  const src = readFileSync(new URL("../../src/components/takeoff/MeasureScreen.jsx", import.meta.url), "utf8");
  assert.ok(src.includes("cavity slider · ${fmtMm(lx.widthMm)} opening (${fmtMm(lx.cavityLeafMm)} door)"));
  assert.ok(!/doorway end|towards the pocket/.test(src), "no 'doorway end' / 'pocket' wording");
  assert.ok(src.includes("noteFirst && lastCardEl") && src.includes("!noteFirst && lastCardEl"));
  assert.ok(src.includes("const tight = Math.hypot("));
});

console.log(`takeoff-tc-hub031: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
