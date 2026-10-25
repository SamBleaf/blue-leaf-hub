// Hub review HUB 028 — Walls (trace once, studs + plates + noggins together). Plan: docs/hub_review/WALLS_FRAMING_PLAN.md
// ("Sam's decisions (25 October 2026)" override its defaults).
// Step 1, engine options in shared/takeoff/engine/timber.js, each OFF unless asked for: identity `component`, stud-wall
// side studs + merge and opening clipping, Sam's join over a stud (splitPlateAtStuds), noggin owner-rule rows
// (wallNogginRows: 1 row at 2,700 or under, 2 over) and closed bays. The per-wall figures below are the round 1 worked
// example (1 stud each side) proven through the real engine and allocator, bought on Sam's round 2 timber grid (300 mm
// steps, step 2), with round 2's full-length bottom plate (the round 1 door gaps came out in the final review). Round
// 2's 2 studs each side come in step 3.
// Step 2, material and registry (engine/families.js, methods.js, dispatch.js methodReads): the Walls spec (purpose
// "walls", four parts incl. Long plates = 90 × 45 LVL, Sam's round 3), its normaliser, identity, needs and line,
// wallPartFill / wallFramingDefaults, wall_framing@1 reading walls only, and the 300 mm grid for ALL timber.
// Step 3, the Walls calculation (engine/dispatch.js runWallFraming, purchaseLines, schedule.js): both worked examples
// recomputed under Sam's round 2 (2 studs each side, full-length bottom plate, 300 mm steps) through the real
// computeWorkspace, the switch, separate lines and cut lists per part, item-wide blocks, the double-count note, round 3
// LVL long plates, touching studs and order independence.
// Step 4, entry and plan (src/components/takeoff/measure/tools.js): Walls traces with Line only, usesWalls, the Walls
// line (wallFramingTotals / wallFramingText) for both worked examples and the mixed run, "Details: n to fix" and the
// Walls-only starting Wall height. The screens are in e2e/ui-review/tc-hub028.spec.js.
// Step 5, the Walls card and wall pages (tools.js wallFramingNotes / wallLongPlateOverMm / wallPartText): each wall
// page's own notes (its LVL long plates, its openings' lintels note), the "over 6.0 m" the calculation splits against,
// and the Walls card's part writes (a built-in row, a company product, a typed field) as normaliser fixed points.
// Step 6: SOP 20-08's Walls words (the short-noggin example's studs, the refusal message, the long-plate exception to
// "never joined") checked against the engine and the server's own words.
//   node scripts/tests/takeoff-tc-hub028.test.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  NOGGIN_ROW_RULES, NOGGIN_TWO_ROWS_OVER_MM, computeNoggins, computePlates, computeStudWall, repeatedPositions, splitPlateAtStuds,
  timberIdentity, wallNogginRows,
} from "../../shared/takeoff/engine/timber.js";
import { allocateLinear } from "../../shared/takeoff/engine/allocator.js";
import { identityKey } from "../../shared/takeoff/engine/contract.js";
import { TakeoffValidationError } from "../../shared/takeoff/units.js";
import { TIMBER_STOCK_GRID, timberStockPolicy } from "../../shared/takeoff/engine/timber.js";
import { selectStock } from "../../shared/takeoff/engine/stock.js";
import {
  CALCULATION_VERSION, TIMBER_GRID, TIMBER_GRID_SOURCE, TIMBER_PRESETS, TIMBER_PURPOSES, WALLS_PURPOSE, WALL_FRAMING_RULES, WALL_LONG_PLATE_DEFAULT,
  WALL_PARTS, WALL_PART_DEFAULT_MAX_MM, WALL_PART_LABELS, computeWorkspace, describeFamilySpec, familyIdentity, familyProblems, getMethod, isLvlTimber,
  longPlateStockLengths, methodFor, methodReads, normaliseFamilySpec, onTimberGrid, orderLineState, orderStatus, productionMethods, stockIdentityKey, timberProductFill,
  wallFramingDefaults, wallPartFill, wallPartProducts, WALL_STUDS_EACH_SIDE, applyTimberPreset, matchTimberChoice, timberPresetsFor,
} from "../../shared/takeoff/index.js";
import { JOB_GENERATED_LIMIT } from "../../shared/takeoff/engine/dispatch.js";
import { TIMBER_ORDERING_POLICY } from "../../shared/takeoff/products/index.js";
import { CATALOGUE_SEED } from "../../shared/takeoff/products/seed.js";
import { cleanMaterialContent } from "../../server/lib/takeoff/takeoffService.mjs";
import { isWallsItem, lastWallHeight, lineStartHeight, toolsFor, usesWalls, wallFramingNotes, wallFramingText, wallFramingTotals, wallLongPlateOverMm, wallLongPlateOverText, wallPartText,
  wallPartsNeedText, wallPartsToFix, wallsNotCounted } from "../../src/components/takeoff/measure/tools.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 3).join("\n    ")}`); } }

const near = (a, b, msg = "") => assert.ok(Math.abs(a - b) < 1e-6, `${msg} ${a} ≠ ${b}`);
const nearAll = (a, b, msg = "") => { assert.equal(a.length, b.length, `${msg} ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); a.forEach((x, i) => near(x, b[i], `${msg}[${i}]`)); };
const codes = (r) => r.problems.map((p) => p.code);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// the Walls parts (built-in defaults with a treatment so nothing is "missing product")
const STUDS = { section: "90x45", grade: "MGP10", treatment: "H2", component: "studs" };
const PLATES = { section: "90x45", grade: "MGP10", treatment: "H2", component: "plates" };
const NOGGINS = { section: "90x35", grade: "MGP10", treatment: "H2", component: "noggins" };
const W = 45; // stud thickness along the wall (90 × 45)

const D1 = { id: "D1", xLeftMm: 1000, xRightMm: 1820, sillMm: 0, headMm: 2040 };
const W1 = { id: "W1", xLeftMm: 1200, xRightMm: 3000, sillMm: 900, headMm: 2100 };

const MAX = { maxMm: 6000 }; // Sam's longest length for plates and noggins (25 Oct 2026); studs get it too here
/** A Walls stud wall: both ends, cut = Wall height, side studs + merge, clipping. */
const studs = (wallLengthMm, openings = [], over = {}) => computeStudWall({
  materialId: "walls", wallId: over.wallId ?? "w1", measurementId: over.wallId ?? "w1", identity: STUDS, label: "Studs", stock: MAX, wallLengthMm, centresMm: 600,
  height: { mode: "studCut", studLengthMm: 2700 }, openings, openingSideStuds: { studWidthMm: W }, clipOpeningLevels: true, ...over,
});
const counted = (r) => r.layout.ticks.filter((t) => t.state !== "removed");
const at = (r) => counted(r).map((t) => t.positionMm);
const plates = (runMm, layers, over = {}) => computePlates({
  materialId: "walls", wallId: over.wallId ?? "w1", measurementId: over.wallId ?? "w1", identity: PLATES, label: "Plates", stock: MAX, runMm, layers, ...over,
});
/** Noggins on the counted studs of a stud wall, rows by Sam's rule for the height. */
const noggins = (studWall, openings, heightMm, over = {}) => computeNoggins({
  materialId: "walls", wallId: studWall.layout.wallId, identity: NOGGINS, label: "Noggins", stock: MAX,
  stations: counted(studWall).map((t) => ({ positionMm: t.positionMm, widthMm: W })), ...wallNogginRows(heightMm),
  openings: openings.map(({ id, xLeftMm, xRightMm }) => ({ id, xLeftMm, xRightMm })), skipClosedBays: true, ...over,
});
const lengths = (r) => r.demands.flatMap((d) => Array(d.quantity).fill(d.lengthMm));
/** New stock lengths bought, ascending (one allocator call, as dispatch makes one per material). */
const bought = (demands) => allocateLinear(demands).groups.flatMap((g) => g.bars.filter((b) => b.source === "new").map((b) => b.stockLengthMm)).sort((a, b) => a - b);

// ── the 2,700 worked example, wall by wall ──────────────────────────────────
const wall1 = studs(6000, [D1], { wallId: "w1" });
const wall2 = studs(4000, [W1], { wallId: "w2" });

t("worked example Wall 1 (6,000, D1 at 1,000 to 1,820): 11 studs at the plan's stations, side studs labelled beside D1", () => {
  nearAll(at(wall1), [0, 600, 977.5, 1842.5, 2400, 3000, 3600, 4200, 4800, 5400, 6000]);
  assert.equal(wall1.demands.length, 11);
  assert.ok(wall1.demands.every((d) => d.role === "stud" && d.lengthMm === 2700), "cut = Wall height");
  assert.deepEqual(wall1.layout.ticks.filter((x) => x.state === "removed").map((x) => [x.positionMm, x.openingId]), [[1200, "D1"], [1800, "D1"]]);
  assert.deepEqual(wall1.layout.ticks.filter((x) => x.state === "side").map((x) => x.positionMm), [977.5, 1842.5]);
  assert.deepEqual(wall1.demands.filter((d) => /beside/.test(d.label)).map((d) => d.label), ["Stud @ 977.5 (beside D1)", "Stud @ 1,842.5 (beside D1)"]);
  assert.ok(!wall1.demands.some((d) => /king|jack|trimmer|lintel/i.test(`${d.role} ${d.label}`)), "never a king, jack, trimmer or lintel");
  assert.equal(wall1.layout.studWidthMm, W);
});

t("worked example Wall 2 (4,000, W1 on the 600 grid): each edge stud merges into its side stud, 6 studs", () => {
  nearAll(at(wall2), [0, 600, 1177.5, 3022.5, 3600, 4000]);
  assert.equal(wall2.demands.length, 6);
  const side = wall2.layout.ticks.filter((x) => x.state === "side");
  assert.deepEqual(side.map((x) => [x.positionMm, x.mergedMm, x.besideOpeningIds]), [[1177.5, [1200], ["W1"]], [3022.5, [3000], ["W1"]]]);
  assert.deepEqual(wall2.layout.ticks.filter((x) => x.state === "removed").map((x) => x.positionMm), [1800, 2400]);
  assert.ok(wall2.explain.some((e) => /stud at 1,200 and the side stud at 1,177.5 are 22.5 mm apart \(closer than 45 mm\), so they are one stud at 1,177.5/.test(e)), wall2.explain.join("\n"));
});

t("run total: 17 studs, each bought as a 2,700 length (one length per stud, 300 mm steps)", () => {
  const all = [...wall1.demands, ...wall2.demands];
  assert.equal(all.length, 17);
  assert.deepEqual(bought(all), Array(17).fill(2700));
});

t("plates: the bottom plate is bought full length like the top plate, door or not (Sam's round 2: 2 × 6,000 + 2 × 4,200)", () => {
  const p1 = plates(6000, [{ tag: "bottom" }, { tag: "top" }], { wallId: "w1" });
  const p2 = plates(4000, [{ tag: "bottom" }, { tag: "top" }], { wallId: "w2" });
  assert.deepEqual(p1.layout.layers.map((l) => [l.tag, l.piecesMm]), [["bottom", [6000]], ["top", [6000]]]);
  assert.deepEqual(p2.layout.layers.map((l) => [l.tag, l.piecesMm]), [["bottom", [4000]], ["top", [4000]]]);
  assert.deepEqual(p1.demands.map((d) => d.label), ["Bottom plate 0–6,000", "Top plate 0–6,000"]);
  assert.deepEqual(bought([...p1.demands, ...p2.demands]), [4200, 4200, 6000, 6000]);
  assert.ok(p1.explain.includes("Bottom plate: one continuous 6,000 mm piece (no joints selected from the framing detail)"), p1.explain.join("\n"));
  assert.ok(p1.explain.includes("Top plate: one continuous 6,000 mm piece (no joints selected from the framing detail)"));
  // the round 1 door gaps are gone from computePlates: a layer's old gapsMm is no setting, so it cuts nothing
  const old = plates(6000, [{ tag: "bottom", gapsMm: [{ id: "D1", fromMm: 1000, toMm: 1820 }] }], { wallId: "w1" });
  assert.deepEqual([old.layout.layers[0].piecesMm, "gapsMm" in old.layout.layers[0], codes(old)], [[6000], false, []]);
});

t("noggins at 2,700 (1 row, Sam's rule): 9 + 4 = 13 with the plan's exact lengths, 6,705 mm", () => {
  const n1 = noggins(wall1, [D1], 2700, { stock: undefined });
  const n2 = noggins(wall2, [W1], 2700, { stock: undefined });
  nearAll(lengths(n1), [555, 332.5, 512.5, 555, 555, 555, 555, 555, 555]);
  nearAll(lengths(n2), [555, 532.5, 532.5, 355]);
  near(sum(lengths(n1)), 4730);
  near(sum(lengths(n2)), 1975);
  assert.deepEqual(n1.layout.bays.filter((b) => b.openingId).map((b) => [b.fromMm, b.toMm, b.openingId]), [[977.5, 1842.5, "D1"]]);
  assert.deepEqual(n2.layout.bays.filter((b) => b.openingId).map((b) => [b.fromMm, b.toMm, b.openingId]), [[1177.5, 3022.5, "W1"]]);
  for (const n of [n1, n2]) {
    assert.equal(n.layout.rows, 1);
    assert.equal(n.layout.rowsSource, "owner-rule");
    assert.equal(n.layout.rowsRuleRef, NOGGIN_ROW_RULES.one);
    assert.equal(n.status.quantity, "calculated");
  }
  const all = [...n1.demands, ...n2.demands];
  near(sum(all.map((d) => d.lengthMm * d.quantity)), 6705);
  // no longest length: each noggin buys its own 1,200 (the allocator's note says why)
  const own = allocateLinear(all);
  assert.deepEqual(bought(all), Array(13).fill(1200));
  assert.ok(JSON.stringify(own).includes("allocation_share_needs_max"));
  // a 6,000 longest length shares lengths across the walls: 1,200 + 5,700 = 6,900, the least possible in 300 mm steps
  assert.deepEqual(bought([...noggins(wall1, [D1], 2700).demands, ...noggins(wall2, [W1], 2700).demands]), [1200, 5700]);
});

t("the 3,000 example: same 17 studs (cut 3,000), 2 rows = 26 noggins 13,410 mm; double top plate adds only top-2 pieces", () => {
  const s1 = studs(6000, [D1], { wallId: "w1", height: { mode: "studCut", studLengthMm: 3000 } });
  const s2 = studs(4000, [W1], { wallId: "w2", height: { mode: "studCut", studLengthMm: 3000 } });
  assert.deepEqual([at(s1), at(s2)], [at(wall1), at(wall2)], "positions don't depend on height");
  assert.deepEqual(bought([...s1.demands, ...s2.demands]), Array(17).fill(3000));
  const n1 = noggins(s1, [D1], 3000, { stock: undefined });
  const n2 = noggins(s2, [W1], 3000, { stock: undefined });
  assert.equal(n1.layout.rows, 2);
  assert.equal(n1.layout.rowsRuleRef, NOGGIN_ROW_RULES.two);
  const all = [...n1.demands, ...n2.demands];
  assert.equal(sum(all.map((d) => d.quantity)), 26);
  near(sum(all.map((d) => d.lengthMm * d.quantity)), 13410);
  assert.equal(sum(bought(all)), 31200);
  // 3,000 + 4,500 + 6,000 = 13,500, the least possible in 300 mm steps (13,410 needed)
  assert.deepEqual(bought([...noggins(s1, [D1], 3000).demands, ...noggins(s2, [W1], 3000).demands]), [3000, 4500, 6000]);
  const layers = (doubleTop) => [{ tag: "bottom" }, { tag: "top" }, ...(doubleTop ? [{ tag: "top-2" }] : [])];
  const off = [plates(6000, layers(false), { wallId: "w1" }), plates(4000, layers(false), { wallId: "w2" })];
  const on = [plates(6000, layers(true), { wallId: "w1" }), plates(4000, layers(true), { wallId: "w2" })];
  assert.deepEqual(bought(on.flatMap((p) => p.demands)), [4200, 4200, 4200, 6000, 6000, 6000]);
  const offIds = off.flatMap((p) => p.demands.map((d) => d.id));
  const added = on.flatMap((p) => p.demands).filter((d) => !offIds.includes(d.id));
  assert.deepEqual(added.map((d) => [d.role, d.lengthMm]), [["top-2-plate", 6000], ["top-2-plate", 4000]]);
  assert.deepEqual(on.flatMap((p) => p.demands).filter((d) => offIds.includes(d.id)), off.flatMap((p) => p.demands), "every other plate unchanged");
});

// ── rows ─────────────────────────────────────────────────────────────────────
t("rows: 2,700 is not over (1 row); 2,701, 3,000 and 4,000 are (2 rows); both are Sam's owner rules", () => {
  assert.equal(NOGGIN_TWO_ROWS_OVER_MM, 2700);
  assert.deepEqual(wallNogginRows(2700), { rows: 1, rowsSource: "owner-rule", rowsRuleRef: "HUB 028: 2,700 mm or under = 1 row" });
  assert.deepEqual(wallNogginRows(2400), wallNogginRows(2700));
  for (const h of [2701, 3000, 4000]) assert.deepEqual(wallNogginRows(h), { rows: 2, rowsSource: "owner-rule", rowsRuleRef: "HUB 028: over 2,700 mm = 2 rows" }, String(h));
  assert.ok(!/confirm|default/i.test(JSON.stringify(NOGGIN_ROW_RULES)), "no 'to confirm' or 'default' row source");
  for (const bad of [undefined, 0, -1, "2700"]) assert.throws(() => wallNogginRows(bad), TakeoffValidationError);
});

t("rows: computeNoggins records the owner rule (explain + layout); one needs its reference; no rows still blocks", () => {
  const s = studs(2400, [], { wallId: "w9" });
  const two = noggins(s, [], 2701);
  assert.equal(two.demands.length, 4);
  assert.ok(two.demands.every((d) => d.quantity === 2));
  assert.ok(two.explain.some((e) => e.endsWith("× 2 row(s) (owner rule: HUB 028: over 2,700 mm = 2 rows)")), two.explain.join("\n"));
  const one = noggins(s, [], 2700);
  assert.ok(one.demands.every((d) => d.quantity === 1));
  assert.ok(one.explain.some((e) => e.endsWith("× 1 row(s) (owner rule: HUB 028: 2,700 mm or under = 1 row)")));
  assert.deepEqual(codes(noggins(s, [], 3000, { rowsRuleRef: "" })), ["invalid_input"]);
  const none = noggins(s, [], 3000, { rows: undefined, rowsSource: undefined, rowsRuleRef: undefined });
  assert.deepEqual(codes(none), ["noggin_rows_missing"]);
  assert.equal(none.status.quantity, "incomplete");
  assert.equal(none.layout.rowsSource, undefined, "no rows, no row source");
  // entered rows read exactly as before
  const entered = noggins(s, [], 3000, { rows: 3, rowsSource: "entered", rowsRuleRef: undefined });
  assert.ok(entered.explain.some((e) => e.endsWith("× 3 row(s) (entered)")));
  assert.equal(entered.layout.rowsSource, undefined);
});

// ── side studs, merges and wall ends ─────────────────────────────────────────
t("a door at xMm 0 merges its side stud with the end stud", () => {
  const D = { id: "D2", xLeftMm: 0, xRightMm: 820, sillMm: 0, headMm: 2040 };
  const r = studs(6000, [D]);
  nearAll(at(r), [0, 842.5, 1200, 1800, 2400, 3000, 3600, 4200, 4800, 5400, 6000]);
  const end = r.layout.ticks.find((x) => x.positionMm === 0);
  assert.deepEqual([end.state, end.mergedMm, end.besideOpeningIds], ["full", [0], ["D2"]]);
  assert.equal(r.demands[0].label, "Stud @ 0 (beside D2)");
  assert.ok(at(r).every((x) => x >= 0 && x <= 6000), "never outside the wall");
});

t("a door at the far wall end: its outer side stud is the end stud", () => {
  const D = { id: "D3", xLeftMm: 5180, xRightMm: 6000, sillMm: 0, headMm: 2040 };
  const r = studs(6000, [D]);
  nearAll(at(r), [0, 600, 1200, 1800, 2400, 3000, 3600, 4200, 4800, 5157.5, 6000]);
  assert.deepEqual(r.layout.ticks.find((x) => x.positionMm === 6000).mergedMm, [6000]);
});

t("a centre stud 20 mm from a side stud merges into it; one 50 mm away is kept", () => {
  const merged = studs(6000, [{ id: "W", xLeftMm: 1000, xRightMm: 1757.5, sillMm: 900, headMm: 2100 }]);
  nearAll(at(merged), [0, 600, 977.5, 1780, 2400, 3000, 3600, 4200, 4800, 5400, 6000]);
  assert.deepEqual(merged.layout.ticks.find((x) => x.positionMm === 1780).mergedMm, [1800]);
  const kept = studs(6000, [{ id: "W", xLeftMm: 1000, xRightMm: 1727.5, sillMm: 900, headMm: 2100 }]);
  nearAll(at(kept), [0, 600, 977.5, 1750, 1800, 2400, 3000, 3600, 4200, 4800, 5400, 6000]);
  assert.deepEqual(kept.layout.ticks.find((x) => x.positionMm === 1750).mergedMm, []);
});

t("two openings 90 apart: touching side studs are both kept, no throw, no noggin between them", () => {
  const Wb = { id: "W2", xLeftMm: 1910, xRightMm: 2600, sillMm: 900, headMm: 2100 };
  const r = studs(6000, [D1, Wb]);
  nearAll(at(r), [0, 600, 977.5, 1842.5, 1887.5, 2622.5, 3000, 3600, 4200, 4800, 5400, 6000]);
  assert.equal(r.demands.length, 12);
  const n = noggins(r, [D1, Wb], 2700);
  assert.deepEqual(codes(n), []);
  const shut = n.layout.bays.filter((b) => b.closed);
  assert.deepEqual(shut.map((b) => [b.fromMm, b.toMm, b.clearMm]), [[1842.5, 1887.5, 0]]);
  assert.ok(!n.demands.some((d) => d.label.startsWith("Noggin 1,842.5")));
  assert.ok(n.explain.some((e) => /1 closed \(touching studs, no noggin\)/.test(e)));
  // without the option a closed bay is still an error, exactly as before
  assert.deepEqual(codes(noggins(r, [D1, Wb], 2700, { skipClosedBays: undefined })), ["invalid_input"]);
});

t("a 6,010 mm wall: the 6,000 stud merges into the end stud (11 studs) and the noggins are normal", () => {
  const r = studs(6010, []);
  nearAll(at(r), [0, 600, 1200, 1800, 2400, 3000, 3600, 4200, 4800, 5400, 6010]);
  const n = noggins(r, [], 2700);
  assert.equal(n.demands.length, 10);
  near(sum(lengths(n)), 9 * 555 + 565);
  // Studs (option off) still gives its 12, unchanged
  assert.equal(studs(6010, [], { openingSideStuds: undefined }).demands.length, 12);
});

t("a wall shorter than one stud thickness: its end studs are one stud, and the noggins give no bays rather than an error", () => {
  const r = studs(40, []);
  nearAll(at(r), [0]);
  assert.equal(r.demands.length, 1);
  const n = noggins(r, [], 2700);
  assert.deepEqual(n.problems, []);
  assert.deepEqual([n.demands, n.layout.bays, n.status.quantity], [[], [], "calculated"]);
  assert.ok(n.explain.includes("1 framing station, so no bays and no noggins"), n.explain.join("\n"));
  // without skipClosedBays it is still refused, as before
  assert.deepEqual(codes(noggins(r, [], 2700, { skipClosedBays: undefined })), ["invalid_input"]);
});

t("openings 10 mm apart share one stud centred in the gap, beside both (never no stud)", () => {
  const A = { id: "A", xLeftMm: 1000, xRightMm: 1500, sillMm: 900, headMm: 2100 };
  const B = { id: "B", xLeftMm: 1510, xRightMm: 2000, sillMm: 900, headMm: 2100 };
  const r = studs(6000, [A, B]);
  nearAll(at(r), [0, 600, 977.5, 1505, 2022.5, 2400, 3000, 3600, 4200, 4800, 5400, 6000]);
  const shared = r.layout.ticks.find((x) => x.positionMm === 1505);
  assert.deepEqual([shared.state, shared.besideOpeningIds, shared.mergedMm], ["side", ["A", "B"], [1505]]);
  assert.equal(r.demands.find((d) => d.label.startsWith("Stud @ 1,505")).label, "Stud @ 1,505 (beside A, B)");
  assert.ok(r.explain.includes("A and B are 10 mm apart, so they share one stud at 1,505"), r.explain.join("\n"));
  assert.ok(!r.explain.some((e) => /left out|1,505 and the side stud at 1,505/.test(e)), "explained once");
  // no noggin either side of the shared stud (both bays are openings)
  const n = noggins(r, [A, B], 2700);
  assert.deepEqual(n.layout.bays.filter((b) => b.openingId).map((b) => [b.fromMm, b.toMm, b.openingId]), [[977.5, 1505, "A"], [1505, 2022.5, "B"]]);
});

t("neighbouring openings: 1 stud between them for any gap under 90 (two stud thicknesses), 2 from 90, whatever the grid", () => {
  const between = (g) => {
    const r = studs(6000, [{ id: "A", xLeftMm: 1000, xRightMm: 1250, sillMm: 900, headMm: 2100 }, { id: "B", xLeftMm: 1250 + g, xRightMm: 1700, sillMm: 900, headMm: 2100 }]);
    return at(r).filter((x) => x > 1000 && x < 1700);
  };
  for (const g of [0, 10, 20, 22.4, 22.5, 30, 45, 89]) assert.equal(between(g).length, 1, `gap ${g}: ${between(g)}`);
  for (const g of [90, 100]) assert.equal(between(g).length, 2, `gap ${g}: ${between(g)}`);
  nearAll(between(0), [1250]);
  // a door and a sidelight traced edge to edge on a 600 grid line: one stud at the shared edge (the grid stud merges in)
  const D = { id: "D", xLeftMm: 1000, xRightMm: 1200, sillMm: 0, headMm: 2040 };
  const S = { id: "S", xLeftMm: 1200, xRightMm: 1700, sillMm: 900, headMm: 2100 };
  const r = studs(6000, [D, S]);
  nearAll(at(r), [0, 600, 977.5, 1200, 1722.5, 1800, 2400, 3000, 3600, 4200, 4800, 5400, 6000]);
  assert.deepEqual(r.layout.ticks.find((x) => x.positionMm === 1200).besideOpeningIds, ["D", "S"]);
  // and off the grid: still one
  nearAll(studs(6000, [{ ...D, xRightMm: 1250 }, { ...S, xLeftMm: 1250 }]).layout.ticks.filter((x) => x.state === "side").map((x) => x.positionMm), [977.5, 1250, 1722.5]);
});

t("options off: the same wall keeps today's Studs result (grid stations only, the old labels and ticks)", () => {
  const off = studs(4000, [W1], { openingSideStuds: undefined, clipOpeningLevels: undefined, label: undefined });
  assert.deepEqual(off.demands.map((d) => d.label), ["Stud @ 0", "Stud @ 600", "Stud @ 1,200", "Stud @ 3,000", "Stud @ 3,600", "Stud @ 4,000"]);
  assert.deepEqual(off.layout.ticks.map((x) => x.state), ["full", "full", "full", "removed", "removed", "full", "full", "full"]);
  assert.equal(off.layout.studWidthMm, undefined);
  assert.ok(!off.layout.ticks.some((x) => "mergedMm" in x || "besideOpeningIds" in x));
  assert.ok(off.explain.some((e) => e.startsWith("6 common stud station(s) × 1")));
});

// ── clipping ─────────────────────────────────────────────────────────────────
t("a window head above the stud length is clipped with a note (no block); Studs still refuses it", () => {
  const tall = { id: "W5", xLeftMm: 1000, xRightMm: 2000, sillMm: 900, headMm: 2800 };
  const r = studs(4000, [tall]);
  assert.deepEqual(codes(r).filter((c) => c === "opening_clipped"), ["opening_clipped"]);
  const note = r.problems.find((p) => p.code === "opening_clipped");
  assert.equal(note.blocking, false);
  assert.equal(note.message, "W5: its head (2,800 mm) is above the 2,700 mm studs, so it is taken to the top of the studs.");
  assert.equal(r.layout.openings[0].headMm, 2700);
  assert.ok(r.demands.length > 0);
  assert.deepEqual(codes(studs(4000, [tall], { clipOpeningLevels: undefined })), ["invalid_input"]);
});

t("an opening wholly above the studs is clipped too: a note (no block), and it doesn't change the wall's framing", () => {
  // a knee wall: 850 mm studs and a window remembered at sill 900
  const W = { id: "W6", xLeftMm: 1000, xRightMm: 2000, sillMm: 900, headMm: 2100 };
  const r = studs(4000, [W], { height: { mode: "studCut", studLengthMm: 850 } });
  assert.deepEqual(r.problems.map((p) => [p.code, p.blocking, p.message]), [["opening_clipped", false,
    "W6 is above the top of the 850 mm studs (sill 900 mm), so it doesn't change this wall's framing. Check the wall height or the opening."]]);
  assert.equal(r.status.quantity, "calculated");
  nearAll(at(r), [0, 600, 1200, 1800, 2400, 3000, 3600, 4000]);
  assert.ok(!r.layout.ticks.some((x) => x.state === "removed" || x.state === "side"), "no stud removed, no side studs");
  assert.deepEqual(r.layout.openings, []);
  assert.deepEqual(r.layout.openingsAboveStuds, [{ id: "W6", xLeftMm: 1000, xRightMm: 2000 }]);
  assert.ok(r.explain.includes("W6: above the 850 mm studs, so no studs are removed for it"));
  // sill exactly at the top of the studs is above them too; a door under it doesn't overlap it in the stud frame
  const D = { id: "D1", xLeftMm: 1000, xRightMm: 1820, sillMm: 0, headMm: 2040 };
  const hi = studs(6000, [D, { id: "H1", xLeftMm: 1500, xRightMm: 2500, sillMm: 2700, headMm: 3000 }]);
  assert.deepEqual(codes(hi), ["opening_clipped", "opening_framing_incomplete"], "no overlap block");
  assert.deepEqual(hi.problems.filter((p) => p.code === "opening_framing_incomplete").map((p) => p.refs[0].openingId), ["D1"], "nothing to frame for H1");
  assert.deepEqual(at(hi), at(studs(6000, [D])));
  // still refused without the option, and a head at or below the sill is still a data error
  assert.deepEqual(codes(studs(4000, [W], { height: { mode: "studCut", studLengthMm: 850 }, clipOpeningLevels: undefined })), ["invalid_input"]);
  assert.deepEqual(codes(studs(4000, [{ ...W, sillMm: 3000, headMm: 2900 }])), ["invalid_input"]);
  assert.equal(studs(4000, [W]).layout.openingsAboveStuds, undefined, "the key only shows when there is one");
});

// ── Sam's plate join rule ────────────────────────────────────────────────────
const grid = (L) => repeatedPositions({ runMm: L, centresMm: 600 });

t("plate split: 9,000 at 600 centres → 6,000 + 3,000, joined over the stud at 6,000; 15,000 → 6,000 + 6,000 + 3,000", () => {
  const r = splitPlateAtStuds({ fromMm: 0, toMm: 9000, studCentresMm: grid(9000), maxMm: 6000, wallLabel: "Wall 1" });
  assert.equal(r.problem, null);
  assert.deepEqual(r.pieces.map((p) => p.lengthMm), [6000, 3000]);
  assert.deepEqual(r.joinsMm, [6000]);
  assert.deepEqual(splitPlateAtStuds({ fromMm: 0, toMm: 15000, studCentresMm: grid(15000), maxMm: 6000 }).pieces.map((p) => p.lengthMm), [6000, 6000, 3000]);
  // a piece that already fits is returned whole
  assert.deepEqual(splitPlateAtStuds({ fromMm: 0, toMm: 6000, studCentresMm: grid(6000), maxMm: 6000 }).pieces, [{ fromMm: 0, toMm: 6000, lengthMm: 6000 }]);
  // the furthest stud in range, not the nearest: studs at 0, 2,000, 5,500, 9,000
  assert.deepEqual(splitPlateAtStuds({ fromMm: 0, toMm: 9000, studCentresMm: [9000, 2000, 0, 5500], maxMm: 6000 }).joinsMm, [5500]);
});

t("plate split: no stud centre in range → one plain blocking problem naming the wall, no pieces", () => {
  const r = splitPlateAtStuds({ fromMm: 0, toMm: 9000, studCentresMm: [0, 7000, 9000], maxMm: 6000, wallLabel: "Wall 3" });
  assert.equal(r.pieces, null);
  assert.equal(r.problem.code, "plate_too_long");
  assert.equal(r.problem.blocking, true);
  assert.equal(r.problem.message, "Wall 3: the plate has no stud to join over from 0 to 7,000 mm. That is 7,000 mm, longer than the 6,000 mm longest length. Set a longer longest length for the plates.");
  assert.deepEqual(r.problem.refs, [{ fromMm: 0, toMm: 9000, noStudFromMm: 0, noStudToMm: 7000 }]);
  assert.throws(() => splitPlateAtStuds({ fromMm: 0, toMm: 9000, studCentresMm: [], maxMm: 0 }), TakeoffValidationError);
});

t("computePlates joinOverStuds: each layer split at the studs within the 6,000 longest length, one stock length per piece", () => {
  const D = { id: "D1", xLeftMm: 1000, xRightMm: 1820 };
  const s = studs(12000, [{ ...D, sillMm: 0, headMm: 2040 }]);
  const p = plates(12000, [{ tag: "bottom" }, { tag: "top" }],
    { joinOverStuds: { studCentresMm: at(s), wallLabel: "Wall 1" } });
  assert.deepEqual(codes(p), []);
  // the door doesn't cut the bottom plate (Sam's round 2), so it joins over the same stud as the top plate
  assert.deepEqual(p.layout.layers.map((l) => [l.tag, l.piecesMm, l.joinsOverStudsMm]), [["bottom", [6000, 6000], [6000]], ["top", [6000, 6000], [6000]]]);
  assert.ok(p.explain.includes("Top plate: 12,000 mm joined over the stud at 6,000 mm (longest length 6,000 mm) → 6,000 + 6,000 mm"), p.explain.join("\n"));
  assert.ok(p.explain.includes("Bottom plate: 12,000 mm joined over the stud at 6,000 mm (longest length 6,000 mm) → 6,000 + 6,000 mm"));
  assert.deepEqual(bought(p.demands), [6000, 6000, 6000, 6000]);
  // a top plate over a window wider than the longest length: the problem names the stretch with no stud and a remedy that works
  const W9 = { id: "W9", xLeftMm: 1500, xRightMm: 7500, sillMm: 900, headMm: 2100 };
  const wideStuds = { joinOverStuds: { studCentresMm: at(studs(9000, [W9])), wallLabel: "Wall 1" } };
  const wide = plates(9000, [{ tag: "top" }], wideStuds);
  assert.deepEqual(wide.problems.map((x) => x.message), ["Wall 1: the top plate has no stud to join over from 1,477.5 to 7,522.5 mm. That is 6,045 mm, longer than the 6,000 mm longest length. Set a longer longest length for the plates."]);
  // every layer runs under or over the window, so the wall has one problem, naming the first layer that can't join
  const all = plates(9000, [{ tag: "bottom" }, { tag: "top" }, { tag: "top-2" }], wideStuds);
  assert.deepEqual([codes(all), all.layout.layers.map((l) => l.piecesMm)], [["plate_too_long"], [[], [], []]]);
  assert.match(all.problems[0].message, /^Wall 1: the bottom plate has no stud/);
  assert.match(plates(9000, [{ tag: "top-2" }], wideStuds).problems[0].message, /^Wall 1: the second top plate has no stud/);
  // with a 7,200 longest length the same wall joins
  const longer = plates(9000, [{ tag: "top" }], { stock: { maxMm: 7200 }, joinOverStuds: { studCentresMm: at(studs(9000, [W9])) } });
  assert.deepEqual([codes(longer), longer.layout.layers[0].piecesMm], [[], [1477.5, 6922.5, 600]]);
  // a 9,000 wall: 6,000 + 3,000 top plate
  const nine = plates(9000, [{ tag: "top" }], { joinOverStuds: { studCentresMm: at(studs(9000)) } });
  assert.deepEqual(nine.layout.layers[0].piecesMm, [6000, 3000]);
  assert.deepEqual(bought(nine.demands), [3000, 6000]);
});

t("computePlates joinOverStuds: the longest length is the longest stock actually sold (6,000 not stocked → 5,400)", () => {
  const p = plates(9000, [{ tag: "top" }], { stock: { maxMm: 6000, unavailableMm: [6000] }, joinOverStuds: { studCentresMm: grid(9000) } });
  assert.deepEqual(p.layout.layers[0].piecesMm, [5400, 3600]);
  assert.deepEqual(bought(p.demands), [3600, 5400]);
});

t("computePlates joinOverStuds: unjoinable pieces give ONE blocking problem for the wall and aren't ordered", () => {
  const p = plates(9000, [{ tag: "bottom" }, { tag: "top" }], { joinOverStuds: { studCentresMm: [0, 7000, 9000], wallLabel: "Wall 2" } });
  assert.deepEqual(codes(p), ["plate_too_long"]);
  assert.match(p.problems[0].message, /^Wall 2: the bottom plate has no stud to join over from 0 to 7,000 mm\./);
  assert.deepEqual(p.problems[0].refs, [{ wallId: "w1", layer: "bottom", fromMm: 0, toMm: 9000, noStudFromMm: 0, noStudToMm: 7000 }]);
  assert.deepEqual(p.demands, []);
  assert.equal(p.status.quantity, "incomplete");
  // no longest length set: nothing to split against, the piece stays whole (and the usual "confirm" note shows)
  const open = plates(9000, [{ tag: "top" }], { stock: undefined, joinOverStuds: { studCentresMm: grid(9000) } });
  assert.deepEqual(open.layout.layers[0].piecesMm, [9000]);
  assert.deepEqual(codes(open), ["stock_max_unset"]);
});

// ── identity component and part labels ───────────────────────────────────────
t("identity component keeps studs, plates and noggins apart (separate allocator groups); omitted when not given", () => {
  const product = { section: "90x45", grade: "MGP10", treatment: "H2" };
  assert.equal(timberIdentity({ ...product, component: "studs" }).component, "studs");
  assert.ok(!("component" in timberIdentity(product)), "no key unless given, so every existing identity is unchanged");
  assert.notEqual(identityKey(timberIdentity({ ...product, component: "studs" })), identityKey(timberIdentity({ ...product, component: "plates" })));
  const s = studs(2400, [], { identity: { ...product, component: "studs" }, height: { mode: "studCut", studLengthMm: 4200 } });
  const p = plates(4200, [{ tag: "top" }], { identity: { ...product, component: "plates" } });
  const groups = allocateLinear([...s.demands, ...p.demands]).groups;
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.bars.map((b) => b.stockLengthMm)).sort(), [[4200], [4200, 4200, 4200, 4200, 4200]]);
});

t("label names the part in its identity problem ('Studs: …'); the stock note is the same for every part; unlabelled is today's", () => {
  const r = studs(2400, [], { identity: { section: "90x45", grade: "MGP10" }, stock: undefined });
  assert.deepEqual(r.problems.map((p) => p.message), ["Studs: choose the treatment before ordering.", "The longest available stock isn't set for this product — confirm it before ordering."]);
  assert.equal(r.status.procurement, "missing-product");
  const n = noggins(r, [], 2700, { identity: { section: "90x35" } });
  assert.equal(n.problems[0].message, "Noggins: choose the grade, treatment before ordering.");
  // the 'longest length' note reads the same from every part, so a Walls item can show it once
  const stockNotes = ["Studs", "Plates", "Noggins"].map((label) => plates(3000, [{ tag: "top" }], { label, stock: undefined }).problems.map((p) => p.message));
  assert.deepEqual(new Set(stockNotes.flat()).size, 1, JSON.stringify(stockNotes));
  const plain = studs(2400, [], { identity: { section: "90x45", grade: "MGP10" }, label: undefined, stock: undefined });
  assert.deepEqual(plain.problems.map((p) => p.message), ["Timber: choose the treatment before ordering.", "The longest available stock isn't set for this product — confirm it before ordering."]);
});

// ══ Step 2: material and registry ═══════════════════════════════════════════════════════════════════════════

// ── Sam's round 2, decision 3: ALL timber is bought in 300 mm steps (min 1,200) ──
const tSnap = (materials, measurements, contributions) => ({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } },
  documents: [], calibrations: [], materials, measurements, contributions });
const tMat = (id, methodKey, purpose, rules = {}, stock = {}) => ({ id, name: id, methodKey, methodVersion: 1,
  spec: { family: "timber", purpose, section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", stock }, rules });
const tRows = (c, id) => c.scheduleLines.filter((l) => l.jobMaterialIds.includes(id)).map((l) => [l.quantity, l.finishedLengthMm]).sort((a, b) => a[1] - b[1]);

t("grid: one owner timber grid, 1,200 then 300 mm steps (Sam, 25 Oct 2026), in families.js, timber.js and the product seed", () => {
  assert.deepEqual(TIMBER_GRID, { kind: "grid", minMm: 1200, incrementMm: 300 });
  assert.ok(Object.isFrozen(TIMBER_GRID));
  assert.equal(TIMBER_STOCK_GRID, TIMBER_GRID, "the engine reads the same object (one definition)");
  assert.equal(TIMBER_GRID_SOURCE, "OWNER-2026-10-25");
  assert.deepEqual([TIMBER_ORDERING_POLICY.minLengthMm, TIMBER_ORDERING_POLICY.incrementMm, TIMBER_ORDERING_POLICY.scope], [1200, 300, "all-suppliers-timber"]);
  assert.deepEqual(TIMBER_ORDERING_POLICY.sourceRefs, ["OWNER-2026-10-14", "OWNER-2026-10-25"]);
  assert.match(CALCULATION_VERSION, /^takeoff-calc@4$/, "a behaviour change is stamped into exports");
  const p = timberStockPolicy({});
  assert.deepEqual([p.kind, p.minMm, p.incrementMm], ["grid", 1200, 300]);
  for (const [need, buy] of [[2700, 2700], [4000, 4200], [1000, 1200], [6000, 6000], [1200.1, 1500], [4180, 4200], [5196.2, 5400], [2701, 3000]]) {
    assert.equal(selectStock(need, p).stockMm, buy, `${need} → ${buy}`);
  }
  assert.ok(timberStockPolicy({}).sharePieces === false && timberStockPolicy({ incrementMm: 300 }).incrementMm === 300, "restating the grid is fine");
  assert.throws(() => timberStockPolicy({ incrementMm: 600 }), /1,200 mm then 300 mm steps/);
  assert.equal(normaliseFamilySpec({ family: "timber", purpose: "studs", stock: { kind: "grid", minMm: 1200, incrementMm: 600 } }).stock.incrementMm, 300,
    "a spec saved with the old 600 mm steps is read on the owner grid");
});

t("grid: existing Studs, Plates, Noggins and other timber items all buy on it (2,700 studs buy 2,700; a 4,000 plate 4,200; 1,000 → 1,200)", () => {
  const c = computeWorkspace(tSnap([
    tMat("st", "wall_frame", "studs", { centresMm: 600, studHeightMm: 2700 }), tMat("pl", "linear_stock", "plates"),
    tMat("ng", "linear_stock", "noggins", { centresMm: 600, nogginRows: 1 }, { maxMm: 6000 }), tMat("tr", "linear_stock", "other"),
  ], [{ id: "w", kind: "wall", inputs: { kind: "rect", widthMm: 4000, heightMm: 2700, name: "North" } },
    { id: "m1", kind: "manual", finishedLengthMm: 1000, quantity: 1 }, { id: "m2", kind: "manual", finishedLengthMm: 2700, quantity: 2 }],
  [{ id: "c1", measurementId: "w", jobMaterialId: "st", role: "wall" }, { id: "c2", measurementId: "w", jobMaterialId: "pl", role: "wall" },
    { id: "c3", measurementId: "w", jobMaterialId: "ng", role: "wall" }, { id: "c4", measurementId: "m1", jobMaterialId: "tr" }, { id: "c5", measurementId: "m2", jobMaterialId: "tr" }]));
  assert.deepEqual(tRows(c, "st"), [[8, 2700]], "8 studs cut 2,700, each bought as a 2,700 (was 3,000 on 600 mm steps)");
  assert.deepEqual(tRows(c, "pl"), [[2, 4200]], "bottom + top 4,000 → 2 × 4,200");
  assert.deepEqual(tRows(c, "tr"), [[1, 1200], [2, 2700]], "entered 1,000 → 1,200 and 2,700 → 2,700");
  const ng = tRows(c, "ng");
  assert.ok(ng.length && ng.every(([, len]) => onTimberGrid(len) && len <= 6000), JSON.stringify(ng));
  for (const id of ["st", "pl", "ng", "tr"]) for (const [, len] of tRows(c, id)) assert.equal((len - 1200) % 300, 0, `${id} ${len} on the grid`);
});

t("grid: unavailable lengths still only REMOVE grid lengths (now every 300 mm), never add off-grid ones", () => {
  assert.deepEqual([2700, 1500, 2400, 4800, 11100].map(onTimberGrid), [true, true, true, true, true]);
  assert.deepEqual([2650, 2750, 1000, 1199, 11000, "x", null].map(onTimberGrid), [false, false, false, false, false, false, false]);
  const off = timberStockPolicy({ unavailableMm: [2700] });
  assert.deepEqual([selectStock(2700, off).stockMm, selectStock(2700, off).reason], [3000, "grid-next-available"]);
  assert.equal(selectStock(2600, off).stockMm, 3000, "2,600 would buy 2,700; it isn't stocked, so the next grid length");
  assert.throws(() => timberStockPolicy({ unavailableMm: [2650] }), /2,650 mm is not a timber stock length \(1,200 mm then 300 mm steps\)/);
  assert.deepEqual(normaliseFamilySpec({ family: "timber", purpose: "plates", stock: { unavailableMm: [6600, 2750, 2700, 1000, 2650, 4500] } }).stock.unavailableMm,
    [2700, 4500, 6600], "the normaliser keeps grid lengths only");
  const c = computeWorkspace(tSnap([tMat("pl", "linear_stock", "plates", {}, { unavailableMm: [4200] })],
    [{ id: "w", kind: "wall", inputs: { kind: "rect", widthMm: 4000, heightMm: 2700 } }], [{ id: "c", measurementId: "w", jobMaterialId: "pl", role: "wall" }]));
  assert.deepEqual(tRows(c, "pl"), [[2, 4500]], "4,200 not stocked → 4,500");
});

// the grid's words: the SOP examples, the app's help text and the seed's source register say what the engine does
const REPO = new URL("../../", import.meta.url);
const readRepo = (p) => readFileSync(new URL(p, REPO), "utf8");
const mmNum = (s) => Number(s.replace(/,/g, ""));

t("grid: every stock-grid example in SOP 20-08 ('2,350 → 2,400; 500 → 1,200; 1,200.1 → 1,500') is what the engine buys", () => {
  const sop = readRepo("docs/sops/20_takeoff/20-08_timber_takeoff.md");
  const pairs = sop.split("\n").filter((line) => /stock grid|next stock length/.test(line))
    .flatMap((line) => [...line.matchAll(/(\d[\d,]*(?:\.\d+)?) → (\d[\d,]*(?:\.\d+)?)/g)].map((m) => [mmNum(m[1]), mmNum(m[2])]));
  assert.ok(pairs.length >= 4, `found ${JSON.stringify(pairs)}`);
  assert.ok(pairs.some(([a, b]) => a === 1200.1 && b === 1500), "the 1,200.1 example reads 1,500 (it read 1,800 on 600 mm steps)");
  for (const [need, buy] of pairs) assert.equal(selectStock(need, timberStockPolicy({})).stockMm, buy, `SOP says ${need} → ${buy}`);
});

t("grid: no app text still names the old 600 mm timber grid (e.g. 'the timber 1200/600 grid does not apply')", () => {
  const stale = /1,?200 ?\/ ?600|1,?200 ?\+ ?600|every 600 ?mm|600 mm (?:steps|increments)|then 600 ?mm/;
  const files = readdirSync(new URL("src/", REPO), { recursive: true }).filter((f) => /\.(jsx?|mjs)$/.test(f));
  assert.ok(files.length > 50, `scanned ${files.length} files`);
  const hits = files.flatMap((f) => readRepo(`src/${f}`).split("\n").map((line, i) => [f, i + 1, line]).filter(([, , line]) => stale.test(line)))
    .map(([f, n, line]) => `src/${f}:${n}: ${line.trim()}`);
  assert.deepEqual(hits, []);
});

t("grid: every source code the product seed cites (OWNER-2026-10-25 included) has its own entry in the seed's source register", () => {
  const refs = new Set();
  (function walk(o) {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (k === "sourceRefs" && Array.isArray(v)) v.forEach((r) => refs.add(r)); else walk(v); }
  })(CATALOGUE_SEED);
  assert.ok(refs.has("OWNER-2026-10-25") && refs.size > 10, [...refs].join(" "));
  assert.equal(CATALOGUE_SEED.sourceRegister, "09-SOURCE-REGISTER.md");
  const register = readRepo(`docs/takeoff/TC-R04/${CATALOGUE_SEED.sourceRegister}`);
  const entries = new Set([...register.matchAll(/^## (\S+)/gm)].map((m) => m[1]));
  assert.deepEqual([...refs].filter((r) => !entries.has(r)), [], "cited codes with no register entry");
  const entry = register.split(/^## /m).find((s) => s.startsWith("OWNER-2026-10-25"));
  assert.match(entry, /1200 mm minimum, then 300 mm increments/);
  assert.match(register.split(/^## /m).find((s) => s.startsWith("OWNER-2026-10-14 clarification")), /superseded by OWNER-2026-10-25/);
});

t("grid: timber placed on the old 600 mm steps is 'placed, no longer in the takeoff', never counted against the new length (SOP 20-08 Section 8)", () => {
  const studWall = (stock) => computeWorkspace(tSnap([tMat("st", "wall_frame", "studs", { centresMm: 600, studHeightMm: 2700 }, stock)],
    [{ id: "w", kind: "wall", inputs: { kind: "rect", widthMm: 6000, heightMm: 2700 } }], [{ id: "c", measurementId: "w", jobMaterialId: "st", role: "wall" }]));
  const now = studWall({});
  // the 3,000 line the 600 mm grid used to give (same material, same identity: only the stock length differs)
  const old = studWall({ unavailableMm: [2700] }).scheduleLines[0];
  assert.deepEqual(now.scheduleLines.map((l) => [l.quantity, l.finishedLengthMm]), [[11, 2700]]);
  assert.deepEqual([old.quantity, old.finishedLengthMm], [11, 3000]);
  assert.notEqual(old.bucketKey, now.scheduleLines[0].bucketKey);
  const st = orderStatus(now.scheduleLines, [{ bucketKey: old.bucketKey, contributionId: null, quantity: 11 }]);
  assert.deepEqual(st.get(now.scheduleLines[0].bucketKey), { bucketKey: now.scheduleLines[0].bucketKey, required: 11, ordered: 0, remaining: 11, surplus: 0 });
  assert.deepEqual(st.get(old.bucketKey), { bucketKey: old.bucketKey, required: 0, ordered: 11, remaining: 0, surplus: 11, reconcile: true });
  // a draft line on the old length is out of date (the Orders screen then offers "Update to what's needed now" or "Remove line")
  const mats = new Map(tSnap([tMat("st", "wall_frame", "studs", { centresMm: 600, studHeightMm: 2700 })]).materials.map((m) => [m.id, m]));
  const draft = orderLineState({ bucketKey: old.bucketKey, jobMaterialId: "st", finishedLengthMm: 3000, quantity: 11, unit: "piece", item: old.item }, now, mats);
  assert.deepEqual([draft.stale, draft.problem], [true, "line_stale_missing"]);
  const sop = readRepo("docs/sops/20_takeoff/20-08_timber_takeoff.md");
  assert.match(sop, /Timber ordered before 25 Oct 2026 shows under \*\*Placed, but no longer in the takeoff\*\*.*Don't re-order\./);
});

// ── the Walls material ────────────────────────────────────────────────────────
const walls = (spec, rules = { ...WALL_FRAMING_RULES }) => ({ id: "walls", name: "Walls", methodKey: "wall_framing", methodVersion: 1, spec, rules });
const product = (id, purpose, over = {}) => ({ id, name: id, isActive: true, methodKey: "linear_stock", methodVersion: 1, rules: {},
  spec: { family: "timber", purpose, section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", species: null, supplierName: "Yard A", productCode: null, stock: { maxMm: null, unavailableMm: [] }, ...over } });
const partOf = (spec, k) => spec.components[k];
const brief = (p) => [p.section.depthMm, p.section.widthMm, p.grade, p.treatment, p.stock.maxMm];

t("Walls is one timber item: purpose 'walls' (no Purpose chip), wall_framing@1 in production, reading traced walls only", () => {
  assert.equal(WALLS_PURPOSE, "walls");
  assert.ok(!TIMBER_PURPOSES.includes(WALLS_PURPOSE), "kept out of TIMBER_PURPOSES: no chip, no company-product purpose");
  assert.deepEqual(methodFor(wallFramingDefaults([])), { key: "wall_framing", version: 1 });
  assert.deepEqual(methodFor({ family: "timber", purpose: "studs" }), { key: "wall_frame", version: 1 }, "Studs unchanged");
  const m = getMethod("wall_framing", 1);
  assert.deepEqual([m.status, m.generic, m.families, m.roles], ["production", true, ["timber"], ["wall"]]);
  assert.ok(productionMethods().includes(m));
  assert.throws(() => getMethod("wall_framing", 2), /not available/);
  assert.deepEqual(methodReads(walls(wallFramingDefaults([]))), ["wall"]);
  // the other timber methods read what they read before
  const read = (methodKey, purpose) => methodReads({ methodKey, spec: { family: "timber", purpose } });
  assert.deepEqual(read("wall_frame", "studs"), ["wall", "manual", "count"]);
  assert.deepEqual(read("linear_stock", "plates"), ["wall", "run", "polyline", "manual", "count"]);
  assert.deepEqual(read("linear_stock", "noggins"), ["wall", "manual", "count"]);
  assert.deepEqual(read("repeated_members", "rafters"), ["distribution", "run", "polyline", "member", "manual", "count"]);
  assert.deepEqual(WALL_PARTS, ["studs", "plates", "longPlates", "noggins"]);
  assert.deepEqual(WALL_PART_LABELS, { studs: "Studs", plates: "Plates", longPlates: "Long plates", noggins: "Noggins" });
  assert.deepEqual(WALL_FRAMING_RULES, { centresMm: 600, doubleTopPlate: false });
});

t("defaults, no company products: studs 90 × 45 MGP10, plates 90 × 45 and noggins 90 × 35 at Sam's 6,000, long plates 90 × 45 LVL at 11,000", () => {
  const d = wallFramingDefaults([]);
  assert.deepEqual(brief(partOf(d, "studs")), [90, 45, "MGP10", null, null], "studs: no longest length stated");
  assert.deepEqual(brief(partOf(d, "plates")), [90, 45, null, null, 6000]);
  assert.deepEqual(brief(partOf(d, "longPlates")), [90, 45, "LVL", null, 11000]);
  assert.deepEqual(brief(partOf(d, "noggins")), [90, 35, null, null, 6000]);
  assert.deepEqual(WALL_PART_DEFAULT_MAX_MM, { studs: null, plates: 6000, longPlates: 11000, noggins: 6000 });
  assert.deepEqual(WALL_LONG_PLATE_DEFAULT, { depthMm: 90, widthMm: 45, grade: "LVL" });
  for (const k of WALL_PARTS) {
    const p = partOf(d, k);
    assert.deepEqual([p.treatment, p.species, p.supplierName, p.productCode, p.stock.unavailableMm], [null, null, null, null, []], `${k}: nothing invented`);
  }
  assert.deepEqual(normaliseFamilySpec(d), d, "exactly what the server keeps");
  assert.deepEqual([d.family, d.purpose, d.plies, d.spareRate, d.endAllowanceMm, d.section, d.grade, d.treatment], ["timber", "walls", 1, 0, 0, { depthMm: null, widthMm: null }, null, null]);
  assert.deepEqual(d.stock, { ...TIMBER_GRID, maxMm: null, unavailableMm: [] }, "the top-level stock stays empty (the parts carry it)");
  // HUB 027's built-in lists are unchanged: no LVL row was added for Walls
  assert.ok(!Object.values(TIMBER_PRESETS).flat().some((p) => /lvl/i.test(`${p.id} ${p.grade || ""}`)));
});

t("defaults with company products: exactly one per part fills it (its stock too); two leave the built-in row; nothing copied between parts", () => {
  const stud = product("p-stud", "studs", { stock: { maxMm: 4800, unavailableMm: [3600] } });
  const pine = product("p-plate", "plates", { grade: "MGP12", treatment: "H3" });                                   // no longest length → Sam's 6,000
  const lvl = product("p-lvl", "plates", { grade: "LVL13", species: "LVL", treatment: "H2-S", supplierName: "Yard B", productCode: "LVL9045", stock: { maxMm: 10800, unavailableMm: [9000] } });
  const nog = product("p-nog", "noggins", { section: { depthMm: 90, widthMm: 35 }, stock: { maxMm: 5400, unavailableMm: [] } });
  const ignored = [product("p-old", "studs", { grade: "MGP12" }), product("p-std", "studs", {})].map((p, i) => (i ? { ...p, rules: { companyDefault: true } } : { ...p, isActive: false }));
  const d = wallFramingDefaults([stud, pine, lvl, nog, product("p-bat", "battens"), ...ignored]);
  assert.deepEqual(brief(partOf(d, "studs")), [90, 45, "MGP10", "H2", 4800]);
  assert.deepEqual(partOf(d, "studs").stock, { maxMm: 4800, unavailableMm: [3600] });
  assert.deepEqual(brief(partOf(d, "plates")), [90, 45, "MGP12", "H3", 6000], "the pine plate product; Sam's 6,000 as it states none");
  assert.deepEqual(partOf(d, "longPlates"), { section: { depthMm: 90, widthMm: 45 }, grade: "LVL13", treatment: "H2-S", species: "LVL", supplierName: "Yard B", productCode: "LVL9045",
    stock: { maxMm: 10800, unavailableMm: [9000] } }, "the LVL plate product fills Long plates");
  assert.deepEqual(brief(partOf(d, "noggins")), [90, 35, "MGP10", "H2", 5400], "the noggin product's own longest length wins over 6,000");
  assert.deepEqual(wallPartProducts([stud, pine, lvl, nog], "plates").map((p) => p.id), ["p-plate"]);
  assert.deepEqual(wallPartProducts([stud, pine, lvl, nog], "longPlates").map((p) => p.id), ["p-lvl"]);
  assert.deepEqual([isLvlTimber(lvl.spec), isLvlTimber({ grade: "LVL" }), isLvlTimber({ species: "Hyspan lvl" }), isLvlTimber(pine.spec), isLvlTimber({ grade: "GL17" })], [true, true, true, false, false]);
  // two stud products: the built-in row (the products are one pick away); the other parts still fill
  const two = wallFramingDefaults([stud, product("p-stud2", "studs", { section: { depthMm: 90, widthMm: 35 } }), nog]);
  assert.deepEqual(brief(partOf(two, "studs")), [90, 45, "MGP10", null, null]);
  assert.deepEqual(brief(partOf(two, "noggins")), [90, 35, "MGP10", "H2", 5400]);
  assert.deepEqual(brief(partOf(two, "plates")), [90, 45, null, null, 6000], "no plate product: no treatment copied from the studs");
  assert.deepEqual(brief(partOf(two, "longPlates")), [90, 45, "LVL", null, 11000]);
  assert.deepEqual(normaliseFamilySpec(d), d);
  assert.deepEqual(stud.spec.stock, { maxMm: 4800, unavailableMm: [3600] }, "the product is never changed");
});

t("wallPartFill = timberProductFill (HUB 027, unchanged) + the product's longest length and 'not stocked' lengths", () => {
  const part = { ...partOf(wallFramingDefaults([]), "noggins") };
  const prod = product("p", "noggins", { section: { depthMm: 90, widthMm: 35 }, species: "Radiata pine", stock: { maxMm: 6000, unavailableMm: [4800] } }).spec;
  const f = wallPartFill(part, prod, "noggins");
  const { stock, ...rest } = f;
  assert.deepEqual(rest, (({ stock: _s, ...x }) => x)(timberProductFill(part, prod)), "every other field is exactly timberProductFill");
  assert.deepEqual(stock, { maxMm: 6000, unavailableMm: [4800] });
  stock.unavailableMm.push(1); assert.deepEqual(prod.stock.unavailableMm, [4800], "copied, not shared");
  assert.deepEqual(wallPartFill(part, { ...prod, stock: { maxMm: null } }, "plates").stock, { maxMm: 6000, unavailableMm: [] }, "no own longest: the part's default");
  assert.deepEqual(wallPartFill(part, { ...prod, stock: undefined }, "longPlates").stock.maxMm, 11000);
  assert.deepEqual(wallPartFill(part, { ...prod, stock: undefined }, "studs").stock.maxMm, null);
  assert.deepEqual(wallPartFill(part, { ...prod, stock: undefined }).stock.maxMm, null, "no part named: nothing assumed");
  // HUB 027: timberProductFill still copies no stock (the Timber card keeps its own)
  const spec = { family: "timber", purpose: "noggins", stock: { kind: "grid", minMm: 1200, incrementMm: 300, maxMm: 3600 } };
  assert.deepEqual(timberProductFill(spec, prod).stock, spec.stock);
  assert.deepEqual(Object.keys(timberProductFill({}, prod)).sort(), ["grade", "productCode", "section", "species", "supplierName", "treatment"]);
});

t("normaliser: a Walls spec is a fixed point; junk and unknown parts are dropped; parts are cleaned like timber; unknown purposes stay 'other'", () => {
  const d = wallFramingDefaults([]);
  const sent = { ...d, junk: 1, spareRate: 10, plies: 3, endAllowanceMm: 50, section: { depthMm: 90, widthMm: 45 }, grade: "MGP10",
    components: { ...d.components, extra: { section: { depthMm: 1 } },
      plates: { ...d.components.plates, colour: "red", treatment: "  H2  ", section: { depthMm: "90", widthMm: 45 }, stock: { maxMm: "5400", unavailableMm: [4800, 4850, 4800, 1000], kind: "list" } } } };
  const n = normaliseFamilySpec(sent);
  assert.deepEqual(Object.keys(n.components), WALL_PARTS);
  assert.deepEqual(n.components.plates, { section: { depthMm: 90, widthMm: 45 }, grade: null, treatment: "H2", species: null, supplierName: null, productCode: null,
    stock: { maxMm: 5400, unavailableMm: [4800] } });
  assert.deepEqual([n.junk, n.spareRate, n.plies, n.endAllowanceMm, n.section, n.grade], [undefined, 0, 1, 0, { depthMm: null, widthMm: null }, null],
    "no spares, plies or allowance on Walls; the top-level identity stays empty");
  assert.deepEqual(normaliseFamilySpec(n), n, "fixed point");
  assert.deepEqual(normaliseFamilySpec(JSON.parse(JSON.stringify(n))), n, "survives a JSON round trip");
  // no parts at all → four empty parts (each then needs its details), never an invented size
  const empty = normaliseFamilySpec({ family: "timber", purpose: "walls" });
  for (const k of WALL_PARTS) assert.deepEqual(brief(empty.components[k]), [null, null, null, null, null]);
  assert.throws(() => normaliseFamilySpec({ family: "timber", purpose: "walls", components: { plates: { section: { depthMm: -90 } } } }),
    (e) => e instanceof TakeoffValidationError && e.message === "Plates: section depth must be a positive number.");
  assert.throws(() => normaliseFamilySpec({ family: "timber", purpose: "walls", components: { longPlates: { stock: { maxMm: 0 } } } }), /Long plates: longest available length must be a positive number/);
  assert.equal(normaliseFamilySpec({ family: "timber", purpose: "bogus" }).purpose, "other", "an unknown purpose is still 'other'");
  assert.equal(normaliseFamilySpec({ family: "timber", purpose: "studs", components: d.components }).components, undefined, "only Walls keeps parts");
  // the real server's cleaner keeps the parts and the rules (bounded scalars)
  const clean = cleanMaterialContent({ name: "Walls", methodKey: "wall_framing", methodVersion: 1, spec: sent, rules: { centresMm: 450, doubleTopPlate: true } });
  assert.deepEqual(clean.spec, n);
  assert.deepEqual([clean.methodKey, clean.methodVersion, clean.rules], ["wall_framing", 1, { centresMm: 450, doubleTopPlate: true }]);
  assert.throws(() => cleanMaterialContent({ name: "Walls", methodKey: "wall_framing", methodVersion: 1, spec: { family: "cladding", product: {} }, rules: {} }), /doesn't fit this material/);
});

t("identity: all four parts' identities; a part's product changes it; the same parts are the same identity", () => {
  const d = wallFramingDefaults([]);
  const id = familyIdentity(d);
  assert.deepEqual(Object.keys(id), ["family", "purpose", "components"]);
  assert.deepEqual(Object.keys(id.components), WALL_PARTS);
  assert.deepEqual(id.components.longPlates, { section: { depthMm: 90, widthMm: 45 }, grade: "lvl", treatment: null, species: null, productCode: null });
  const key = (spec) => identityKey(familyIdentity(spec));
  const withPart = (k, over) => ({ ...d, components: { ...d.components, [k]: { ...d.components[k], ...over } } });
  assert.equal(key(withPart("plates", { grade: "  ", treatment: null })), key(d), "formatting is not identity");
  assert.equal(key(withPart("studs", { grade: "mgp10" })), key(d), "case is not identity");
  for (const k of WALL_PARTS) assert.notEqual(key(withPart(k, { treatment: "H3" })), key(d), `${k} treatment`);
  assert.notEqual(key(withPart("longPlates", { productCode: "LVL9045" })), key(d));
  assert.equal(key(withPart("noggins", { stock: { maxMm: 3600, unavailableMm: [] } })), key(d), "like timber, stock is not identity");
  assert.ok(stockIdentityKey(d) && stockIdentityKey(d) === stockIdentityKey(normaliseFamilySpec(d)));
  assert.notEqual(stockIdentityKey(d), stockIdentityKey(withPart("studs", { treatment: "H2" })));
});

t("needs name the part ('Plates: enter the treatment …'); Long plates only when a plate uses them", () => {
  const d = wallFramingDefaults([]);
  assert.deepEqual(familyProblems(d).map((p) => [p.part, p.message]), [
    ["studs", "Studs: enter the treatment (or \"untreated\")."],
    ["plates", "Plates: enter the grade or species."], ["plates", "Plates: enter the treatment (or \"untreated\")."],
    ["noggins", "Noggins: enter the grade or species."], ["noggins", "Noggins: enter the treatment (or \"untreated\")."],
  ]);
  assert.ok(familyProblems(d).every((p) => p.code === "material_incomplete"));
  assert.deepEqual(familyProblems(d, { usesLongPlates: true }).filter((p) => p.part === "longPlates").map((p) => p.message), ["Long plates: enter the treatment (or \"untreated\")."]);
  const ready = wallFramingDefaults([product("a", "studs"), product("b", "plates"), product("c", "noggins", { section: { depthMm: 90, widthMm: 35 } })]);
  assert.deepEqual(familyProblems(ready), [], "every part used so far has its product: nothing to fix");
  assert.deepEqual(familyProblems(ready, { usesLongPlates: true }).map((p) => p.message), ["Long plates: enter the treatment (or \"untreated\")."]);
  const lvl = wallFramingDefaults([product("a", "studs"), product("b", "plates"), product("l", "plates", { grade: "LVL13", treatment: "H2-S" }), product("c", "noggins")]);
  assert.deepEqual(familyProblems(lvl, { usesLongPlates: true }), []);
  const blank = normaliseFamilySpec({ family: "timber", purpose: "walls" });
  assert.deepEqual(familyProblems(blank).filter((p) => p.part === "studs").map((p) => p.message),
    ["Studs: enter the timber section (e.g. 90 × 45).", "Studs: enter the grade or species.", "Studs: enter the treatment (or \"untreated\")."]);
  // a plain timber item reads as before (HUB 027)
  assert.deepEqual(familyProblems({ family: "timber", purpose: "studs", section: { depthMm: 90, widthMm: 45 }, grade: "MGP10" }).map((p) => [p.message, p.part]),
    [["Enter the treatment (or \"untreated\").", undefined]]);
  // through the engine the needs block ordering and name the part (missing product)
  const c = computeWorkspace(tSnap([walls(d)], [{ id: "w", kind: "wall", inputs: { kind: "rect", widthMm: 4000, heightMm: 2700, name: "Wall 1" } }],
    [{ id: "c", measurementId: "w", jobMaterialId: "walls", role: "wall" }]));
  const probs = c.materialResults.walls.problems;
  assert.ok(probs.some((p) => p.message === "Plates: enter the treatment (or \"untreated\")." && p.blocking), JSON.stringify(probs));
  assert.ok(!probs.some((p) => /^Long plates/.test(p.message)), "no Long plates need until a plate uses them");
  assert.equal(c.orderReady, false);
});

t("describe: 'Studs 90 × 45 MGP10 · plates 90 × 45 · long plates 90 × 45 LVL · noggins 90 × 35' (never 'verified')", () => {
  const d = wallFramingDefaults([]);
  assert.deepEqual(describeFamilySpec(d), { line: "Studs 90 × 45 MGP10 · plates 90 × 45 · long plates 90 × 45 LVL · noggins 90 × 35", installation: "Size: manual selection (not structurally checked)" });
  const filled = wallFramingDefaults([product("a", "studs"), product("l", "plates", { grade: "LVL13", species: "LVL", treatment: "H2-S" })]);
  assert.equal(describeFamilySpec(filled).line, "Studs 90 × 45 MGP10 H2 · plates 90 × 45 · long plates 90 × 45 LVL13 LVL H2-S · noggins 90 × 35");
  assert.equal(describeFamilySpec({ family: "timber", purpose: "walls" }).line, "Studs section? · plates section? · long plates section? · noggins section?");
});

t("Long plates stock: 300 mm steps from 6,300 up to 11,000, plus 11,000 itself; a product's own longest length; not-stocked lengths come out", () => {
  const d = wallFramingDefaults([]);
  const lv = longPlateStockLengths(d.components.longPlates);
  assert.deepEqual(lv, [6300, 6600, 6900, 7200, 7500, 7800, 8100, 8400, 8700, 9000, 9300, 9600, 9900, 10200, 10500, 10800, 11000]);
  assert.ok(lv.slice(0, -1).every(onTimberGrid) && !onTimberGrid(11000), "every length on the 300 mm grid except the 11,000 Sam named");
  assert.deepEqual(longPlateStockLengths({ stock: { maxMm: 10800, unavailableMm: [9000] } }).slice(-3), [10200, 10500, 10800], "a 10,800 LVL product ends at 10,800");
  assert.ok(!longPlateStockLengths({ stock: { maxMm: 10800, unavailableMm: [9000] } }).includes(9000));
  assert.equal(longPlateStockLengths({ stock: { maxMm: 12000 } }).at(-1), 12000);
  assert.deepEqual(longPlateStockLengths({ stock: { maxMm: null } }), lv, "no longest length → Sam's 11,000");
  assert.deepEqual(longPlateStockLengths(undefined), lv);
});

// ══ Step 3: the Walls calculation (engine/dispatch.js runWallFraming, purchaseLines, schedule.js) ═══════════════════
// Sam's round 2: 2 full-length studs each side of every opening, the bottom plate bought full length; round 3: a plate
// piece over the pine plates' longest length (6,000) is ONE 90 × 45 LVL length, joined over a stud only past 11,000.
const READY = () => wallFramingDefaults([product("p-stud", "studs"), product("p-plate", "plates"), product("p-nog", "noggins", { section: { depthMm: 90, widthMm: 35 } })]);
const LVL_READY = () => wallFramingDefaults([product("p-stud", "studs"), product("p-plate", "plates"), product("p-lvl", "plates", { grade: "LVL", treatment: "H2" }),
  product("p-nog", "noggins", { section: { depthMm: 90, widthMm: 35 } })]);
const withPart = (spec, k, over) => ({ ...spec, components: { ...spec.components, [k]: { ...spec.components[k], ...over } } });
const wm = (id, widthMm, heightMm, name, over = {}) => ({ id, kind: "wall", inputs: { kind: "rect", widthMm, heightMm, name, ...over } });
const om = (id, parentId, label, type, xMm, widthMm, heightMm, sillMm, detail) => ({ id, kind: "opening", parentId,
  inputs: { xMm, sillMm, widthMm, heightMm, label, type, ...(detail ? { detail } : {}) } });
const onW = (measurementId, jobMaterialId = "walls") => ({ id: `c-${measurementId}-${jobMaterialId}`, measurementId, jobMaterialId, role: "wall" });
/** Every wall of these measurements on the Walls item (as wf puts them). */
const wallCons = (ms) => ms.filter((m) => m.kind === "wall").map((m) => onW(m.id));
/** A Walls item (and any other materials) through the real computeWorkspace; every wall is on the Walls item unless told. */
const wf = (measurements, { spec = READY(), rules = { ...WALL_FRAMING_RULES }, extra = [], contributions = null } = {}) =>
  computeWorkspace(tSnap([walls(spec, rules), ...extra], measurements, contributions || measurements.filter((m) => m.kind === "wall").map((m) => onW(m.id))));
const WR = (c) => c.materialResults.walls;
const wl = (c, name) => WR(c).layouts.find((l) => l.wallLabel === name);
const st = (l) => l.ticks.filter((x) => x.state !== "removed").map((x) => x.positionMm);
const partLines = (c, part) => c.scheduleLines.filter((l) => l.jobMaterialIds.includes("walls") && l.component === part);
const partRows = (c, part) => partLines(c, part).map((l) => [l.quantity, l.finishedLengthMm]);
const partDemands = (c, part) => WR(c).demands.filter((d) => d.identity.component === part);
const cutList = (c, title) => WR(c).appendix.timber.find((x) => x.title === title);
const msgs = (c) => WR(c).problems.map((p) => [p.code, p.blocking, p.message]);
const hasMsg = (c, code, blocking, message) => msgs(c).some(([k, b, m]) => k === code && b === blocking && m === message);
const pieceSum = (c, part) => partDemands(c, part).reduce((a, d) => a + d.quantity, 0);
const fittedMm = (c, part) => partDemands(c, part).reduce((a, d) => a + d.quantity * d.lengthMm, 0);
// the worked example: one Line run A → B → C. Wall 1 (A to B) 6,000 with D1 820 × 2,040 at 1,000; Wall 2 (B to C) 4,000
// with W1 1,800 × 1,200 at 1,200 from the corner, sill 900 (its edges on the 600 grid on purpose, to show the merge)
const EXAMPLE = (H, H2 = H) => [wm("w1", 6000, H, "Wall 1"), wm("w2", 4000, H2, "Wall 2"),
  om("d1", "w1", "D1", "door", 1000, 820, 2040, 0), om("o1", "w2", "W1", "window", 1200, 1800, 1200, 900)];
const ex = (H, { doubleTopPlate = false, spec, H2 } = {}) => wf(EXAMPLE(H, H2), { spec, rules: { centresMm: 600, doubleTopPlate } });
const WALL1_AT = [0, 600, 932.5, 977.5, 1842.5, 1887.5, 2400, 3000, 3600, 4200, 4800, 5400, 6000];
const WALL2_AT = [0, 600, 1132.5, 1177.5, 3022.5, 3067.5, 3600, 4000];
const nogLengths = (c, wallId) => partDemands(c, "noggins").filter((d) => d.sourceRefs[0].wallId === wallId).flatMap((d) => Array(d.quantity).fill(d.lengthMm));
const NOT_COUNTED = "Lintels, jacks and trimmers at D1, W1 aren't counted.";
const STUDS_NO_MAX = "Studs: the longest length isn't set. Confirm it before ordering.";

t("Walls, the 2,700 example (round 2): 21 studs × 2,700, plates 2 × 6,000 + 2 × 4,200 (bottom = top, full length), 13 noggins 6,525 mm", () => {
  const c = ex(2700);
  const r = WR(c);
  assert.deepEqual(Object.keys(c.materialResults), ["walls"], "one material, one wall-framing result (not three takeoffs)");
  assert.deepEqual([r.methodKey, r.layouts.map((l) => [l.wallLabel, l.method])], ["wall_framing", [["Wall 1", "wall_framing@1"], ["Wall 2", "wall_framing@1"]]]);
  // studs: 9 grid + 2 each side of D1 = 13; Wall 2: 1,200 and 3,000 merge into the first studs beside W1, 4 grid + 4 = 8
  nearAll(st(wl(c, "Wall 1")), WALL1_AT, "Wall 1");
  nearAll(st(wl(c, "Wall 2")), WALL2_AT, "Wall 2");
  // the layout keys openings by their measurement id (as Studs does), and carries the plan label for the notes
  assert.deepEqual(wl(c, "Wall 1").ticks.filter((x) => x.state === "side").map((x) => [x.positionMm, x.besideOpeningIds]),
    [[932.5, ["d1"]], [977.5, ["d1"]], [1842.5, ["d1"]], [1887.5, ["d1"]]]);
  assert.deepEqual([wl(c, "Wall 1").openings.map((o) => [o.id, o.label]), wl(c, "Wall 2").openings.map((o) => [o.id, o.label])], [[["d1", "D1"]], [["o1", "W1"]]]);
  assert.deepEqual(wl(c, "Wall 2").ticks.filter((x) => x.state === "removed").map((x) => x.openingId), ["o1", "o1"]);
  assert.deepEqual(wl(c, "Wall 2").ticks.filter((x) => x.state === "side").map((x) => [x.positionMm, x.mergedMm]), [[1132.5, []], [1177.5, [1200]], [3022.5, [3000]], [3067.5, []]]);
  assert.deepEqual(wl(c, "Wall 2").ticks.filter((x) => x.state === "removed").map((x) => x.positionMm), [1800, 2400]);
  assert.equal(wl(c, "Wall 1").sideStudsEachSide, WALL_STUDS_EACH_SIDE);
  assert.equal(WALL_STUDS_EACH_SIDE, 2);
  assert.deepEqual(partRows(c, "studs"), [[21, 2700]], "cut = Wall height, one 2,700 length each (300 mm steps)");
  assert.ok(partDemands(c, "studs").every((d) => d.role === "stud" && d.lengthMm === 2700));
  assert.deepEqual(partDemands(c, "studs").filter((d) => /beside/.test(d.label)).map((d) => d.label).slice(0, 4),
    ["Wall 1 stud @ 932.5 (beside D1)", "Wall 1 stud @ 977.5 (beside D1)", "Wall 1 stud @ 1,842.5 (beside D1)", "Wall 1 stud @ 1,887.5 (beside D1)"]);
  // plates: the bottom plate is the full wall like the top plate (no door gap), one stock length per piece
  for (const [name, L] of [["Wall 1", 6000], ["Wall 2", 4000]]) {
    assert.deepEqual(wl(c, name).plates.layers.map((l) => [l.tag, l.piecesMm, l.longPiecesMm, "gapsMm" in l]), [["bottom", [L], [], false], ["top", [L], [], false]], name);
  }
  assert.deepEqual(partRows(c, "plates"), [[2, 6000], [2, 4200]]);
  assert.deepEqual(partRows(c, "longPlates"), [], "no plate over 6,000, so no LVL");
  // noggins: 1 row (Sam's rule), bay = gap less half of each 45 mm stud; none in an opening bay or between touching studs
  nearAll(nogLengths(c, "w1"), [555, 287.5, 467.5, 555, 555, 555, 555, 555, 555]);
  nearAll(nogLengths(c, "w2"), [555, 487.5, 487.5, 355]);
  near(sum(nogLengths(c, "w1")), 4640); near(sum(nogLengths(c, "w2")), 1885);
  assert.equal(pieceSum(c, "noggins"), 13); near(fittedMm(c, "noggins"), 6525);
  const shut = (name) => wl(c, name).noggins.bays.filter((b) => b.closed).map((b) => [b.fromMm, b.toMm]);
  assert.deepEqual([shut("Wall 1"), shut("Wall 2")], [[[932.5, 977.5], [1842.5, 1887.5]], [[1132.5, 1177.5], [3022.5, 3067.5]]], "touching studs: no noggin, no block");
  assert.deepEqual(wl(c, "Wall 1").noggins.bays.filter((b) => b.openingId).map((b) => [b.fromMm, b.toMm, b.openingId]), [[977.5, 1842.5, "d1"]]);
  assert.deepEqual([wl(c, "Wall 1").noggins.rows, wl(c, "Wall 1").noggins.rowsSource, wl(c, "Wall 1").noggins.rowsRuleRef], [1, "owner-rule", NOGGIN_ROW_RULES.one]);
  // shared across the item at the 6,000 default, on the 300 mm grid: 4,800 + 1,800 = 6,600, the least possible for 6,525
  assert.deepEqual(partRows(c, "noggins"), [[1, 4800], [1, 1800]]);
  assert.deepEqual(wl(c, "Wall 1").totals, { studs: 13, studLengthMm: 2700, bottomPlateMm: 6000, topPlateMm: 6000, secondTopPlateMm: null, longPlateMm: 0, noggins: 9, nogginRows: 1 });
  assert.deepEqual(wl(c, "Wall 2").totals, { studs: 8, studLengthMm: 2700, bottomPlateMm: 4000, topPlateMm: 4000, secondTopPlateMm: null, longPlateMm: 0, noggins: 4, nogginRows: 1 });
  // the order: studs, then plates, then noggins, each named by its part
  assert.deepEqual(c.scheduleLines.map((l) => [l.component, l.item.component, l.item.description]), [
    ["studs", "studs", "Studs 90 × 45 MGP10 H2 — 2,700 mm length"],
    ["plates", "plates", "Plates 90 × 45 MGP10 H2 — 6,000 mm length"], ["plates", "plates", "Plates 90 × 45 MGP10 H2 — 4,200 mm length"],
    ["noggins", "noggins", "Noggins 90 × 35 MGP10 H2 — 4,800 mm length"], ["noggins", "noggins", "Noggins 90 × 35 MGP10 H2 — 1,800 mm length"]]);
  // never a king, jack, trimmer or lintel; one plain "aren't counted" note, which doesn't block (quantity stays incomplete, as Studs)
  assert.deepEqual([...new Set(r.demands.map((d) => d.role))].sort(), ["bottom-plate", "noggin", "stud", "top-plate"]);
  assert.ok(!r.demands.some((d) => /king|jack|trimmer|lintel/i.test(`${d.role} ${d.label}`)));
  assert.deepEqual(msgs(c), [["opening_framing_not_counted", false, NOT_COUNTED], ["stock_max_unset", false, STUDS_NO_MAX]]);
  assert.deepEqual([wl(c, "Wall 1").openingsNotCounted, wl(c, "Wall 2").openingsNotCounted], [["d1"], ["o1"]]);
  assert.deepEqual(r.problems.find((p) => p.code === "opening_framing_not_counted").refs,
    [{ measurementId: "w1", openingId: "d1", openingLabel: "D1" }, { measurementId: "w2", openingId: "o1", openingLabel: "W1" }]);
  assert.deepEqual([r.status.quantity, r.status.procurement, c.orderReady], ["incomplete", "ready", true]);
  assert.ok(c.scheduleLines.every((l) => !l.problems.length && l.notes.filter((x) => x === NOT_COUNTED).length === 1), "said once on every line");
});

t("Walls, the 2,700 example with no noggin longest length: 13 × 1,200 and one plain note; a saved noggin product's 6,000 shares with no note", () => {
  const c = ex(2700, { spec: withPart(READY(), "noggins", { stock: { maxMm: null, unavailableMm: [] } }) });
  assert.deepEqual(partRows(c, "noggins"), [[13, 1200]]);
  // the plan's wording: "its own 1,200 length" when every noggin buys a 1,200
  assert.ok(hasMsg(c, "noggins_not_shared", false, "Noggins: each is cut from its own 1,200 length. Set the noggins' longest length under Details to share lengths across walls."), JSON.stringify(msgs(c)));
  // wide centres (1,500): each 1,455 noggin buys a 1,500 length, and the note says so
  const wide = wf([wm("w", 3000, 2700, "Wall 1")], { spec: withPart(READY(), "noggins", { stock: { maxMm: null, unavailableMm: [] } }), rules: { centresMm: 1500, doubleTopPlate: false } });
  assert.deepEqual(partRows(wide, "noggins"), [[2, 1500]]);
  assert.ok(hasMsg(wide, "noggins_not_shared", false, "Noggins: each is cut from its own 1,500 length. Set the noggins' longest length under Details to share lengths across walls."), JSON.stringify(msgs(wide)));
  assert.ok(hasMsg(c, "stock_max_unset", false, "Studs and noggins: the longest length isn't set. Confirm it before ordering."));
  assert.ok(!msgs(c).some(([, , m]) => /for this product/.test(m)), "never the unnamed 'for this product'");
  // every part with a saved longest length: no longest-length notes at all, and the noggins share
  const stocked = (over = {}) => ({ stock: { maxMm: 6000, unavailableMm: [] }, ...over });
  const full = ex(2700, { spec: wallFramingDefaults([product("p-stud", "studs", stocked()), product("p-plate", "plates", stocked()),
    product("p-nog", "noggins", stocked({ section: { depthMm: 90, widthMm: 35 } }))]) });
  assert.deepEqual(partRows(full, "noggins"), [[1, 4800], [1, 1800]]);
  assert.deepEqual(msgs(full), [["opening_framing_not_counted", false, NOT_COUNTED]]);
});

t("Walls, the 3,000 example with Double top plate: 21 × 3,000, plates 3 × 6,000 + 3 × 4,200, 26 noggins (2 rows) 13,050 mm", () => {
  const c = ex(3000, { doubleTopPlate: true });
  nearAll(st(wl(c, "Wall 1")), WALL1_AT, "positions don't depend on height");
  nearAll(st(wl(c, "Wall 2")), WALL2_AT);
  assert.deepEqual(partRows(c, "studs"), [[21, 3000]]);
  assert.deepEqual(wl(c, "Wall 1").plates.layers.map((l) => [l.tag, l.piecesMm]), [["bottom", [6000]], ["top", [6000]], ["top-2", [6000]]]);
  assert.deepEqual(partRows(c, "plates"), [[3, 6000], [3, 4200]]);
  assert.ok(partDemands(c, "noggins").every((d) => d.quantity === 2), "2 rows (owner rule): each bay twice");
  assert.equal(wl(c, "Wall 2").noggins.rowsRuleRef, NOGGIN_ROW_RULES.two);
  assert.equal(pieceSum(c, "noggins"), 26); near(fittedMm(c, "noggins"), 13050);
  // 4,800 + 4,500 + 3,900 = 13,200, the least possible in 300 mm steps (13,050 needed; 2 × 6,000 is too short)
  assert.deepEqual(partRows(c, "noggins"), [[1, 4800], [1, 4500], [1, 3900]]);
  assert.deepEqual(wl(c, "Wall 1").totals, { studs: 13, studLengthMm: 3000, bottomPlateMm: 6000, topPlateMm: 6000, secondTopPlateMm: 6000, longPlateMm: 0, noggins: 18, nogginRows: 2 });
  assert.deepEqual(wl(c, "Wall 2").totals, { studs: 8, studLengthMm: 3000, bottomPlateMm: 4000, topPlateMm: 4000, secondTopPlateMm: 4000, longPlateMm: 0, noggins: 8, nogginRows: 2 });
  assert.deepEqual(cutList(c, "Plates cut list").rows.map((x) => [x.qty, x.cutMm, x.stockMm, x.labels]), [
    [3, 6000, 6000, ["Wall 1 bottom plate 0–6,000", "Wall 1 second top plate 0–6,000", "Wall 1 top plate 0–6,000"]],
    [3, 4000, 4200, ["Wall 2 bottom plate 0–4,000", "Wall 2 second top plate 0–4,000", "Wall 2 top plate 0–4,000"]]]);
  // no noggin longest length: 26 × 1,200 = 31,200
  const own = ex(3000, { doubleTopPlate: true, spec: withPart(READY(), "noggins", { stock: { maxMm: null, unavailableMm: [] } }) });
  assert.deepEqual(partRows(own, "noggins"), [[26, 1200]]);
});

t("Double top plate changes only the top-2 demands (at 2,700 and 3,000): the studs, bottom plate and noggins stay identical", () => {
  for (const H of [2700, 3000]) {
    const off = ex(H), on = ex(H, { doubleTopPlate: true });
    const offIds = new Set(WR(off).demands.map((d) => d.id));
    const added = WR(on).demands.filter((d) => !offIds.has(d.id));
    assert.deepEqual(added.map((d) => [d.role, d.lengthMm, d.label]), [["top-2-plate", 6000, "Wall 1 second top plate 0–6,000"], ["top-2-plate", 4000, "Wall 2 second top plate 0–4,000"]], String(H));
    assert.deepEqual(WR(on).demands.filter((d) => offIds.has(d.id)), WR(off).demands, `${H}: every other demand unchanged`);
    const same = (c, part) => partLines(c, part).map((l) => [l.bucketKey, l.quantity, l.finishedLengthMm, l.item.description, l.problems]);
    for (const part of ["studs", "noggins"]) assert.deepEqual(same(on, part), same(off, part), `${H} ${part}`);
    assert.deepEqual(partRows(on, "plates"), partRows(off, "plates").map(([q, len]) => [q + 1, len]), "the second top plate: 1 × 6,000 and 1 × 4,200 more");
    for (const name of ["Wall 1", "Wall 2"]) {
      const { secondTopPlateMm, ...rest } = wl(on, name).totals;
      assert.deepEqual(rest, (({ secondTopPlateMm: _x, ...o }) => o)(wl(off, name).totals), `${H} ${name} totals`);
      assert.equal(secondTopPlateMm, wl(off, name).totals.topPlateMm);
    }
  }
});

t("a mixed run (Wall 1 at 2,700, Wall 2 at 3,000): cuts and noggin rows per wall; an item-wide stud height is never read; 2,701 is over", () => {
  const c = wf(EXAMPLE(2700, 3000), { rules: { centresMm: 600, doubleTopPlate: false, studHeightMm: 2400 } });
  assert.deepEqual(partRows(c, "studs"), [[8, 3000], [13, 2700]]);
  assert.deepEqual(WR(c).layouts.map((l) => [l.wallLabel, l.totals.studLengthMm, l.totals.nogginRows, l.totals.noggins]), [["Wall 1", 2700, 1, 9], ["Wall 2", 3000, 2, 8]]);
  assert.deepEqual(WR(c).layouts.map((l) => l.noggins.rowsRuleRef), [NOGGIN_ROW_RULES.one, NOGGIN_ROW_RULES.two]);
  assert.equal(pieceSum(c, "noggins"), 17);
  const rowsAt = (H) => wl(wf([wm("w", 2400, H, "Wall 1")]), "Wall 1").totals.nogginRows;
  assert.deepEqual([rowsAt(2400), rowsAt(2700), rowsAt(2701), rowsAt(4000)], [1, 1, 2, 2]);
});

t("corners: an L run has 2 studs at its corner, a closed 3,000 square 24 studs (8 at corners), a straight wall split by a height change one more", () => {
  const L = ex(2700);
  assert.deepEqual([st(wl(L, "Wall 1")).at(-1), st(wl(L, "Wall 2"))[0]], [6000, 0], "one end stud from each wall at B");
  const square = wf([1, 2, 3, 4].map((i) => wm(`s${i}`, 3000, 2700, `Wall ${i}`)));
  assert.deepEqual(partRows(square, "studs"), [[24, 2700]]);
  assert.equal(WR(square).layouts.flatMap((l) => l.ticks.filter((x) => x.positionMm === 0 || x.positionMm === 3000)).length, 8);
  const count = (c) => pieceSum(c, "studs");
  assert.equal(count(wf([wm("a", 6000, 2700, "Wall 1")])), 11);
  assert.equal(count(wf([wm("a", 3000, 2700, "Wall 1"), wm("b", 3000, 3000, "Wall 2")])), 12);
  assert.equal(count(wf([wm("a", 2500, 2700, "Wall 1"), wm("b", 3500, 3000, "Wall 2")])), 13);
});

t("bottom plate (round 2): bought the full wall length like the top plate; doors, windows and 'other' never cut it, a full-width door neither", () => {
  const c = wf([wm("w", 6000, 2700, "Wall 1"), om("a", "w", "D1", "door", 1000, 820, 2040, 0), om("b", "w", "D2", "door", 3000, 820, 2040, 0),
    om("x", "w", "X1", "other", 4500, 900, 2000, 0)]);
  assert.deepEqual(wl(c, "Wall 1").plates.layers.map((l) => [l.tag, l.piecesMm]), [["bottom", [6000]], ["top", [6000]]]);
  assert.deepEqual(partDemands(c, "plates").map((d) => [d.label, d.lengthMm]), [["Wall 1 bottom plate 0–6,000", 6000], ["Wall 1 top plate 0–6,000", 6000]]);
  assert.deepEqual(partRows(c, "plates"), [[2, 6000]]);
  assert.ok(WR(c).explain.includes("Bottom plate: one continuous 6,000 mm piece (no joints selected from the framing detail)"));
  const full = wf([wm("w", 820, 2700, "Wall 1"), om("a", "w", "D1", "door", 0, 820, 2040, 0)]);
  assert.deepEqual(wl(full, "Wall 1").plates.layers.map((l) => l.piecesMm), [[820], [820]]);
  assert.deepEqual([partRows(full, "plates"), st(wl(full, "Wall 1")), pieceSum(full, "noggins")], [[[2, 1200]], [0, 820], 0], "its 2 end studs, no noggin in the doorway");
  assert.ok(!msgs(full).some(([, blocking]) => blocking), JSON.stringify(msgs(full)));
});

t("2 studs each side: between openings g apart there are floor(g ÷ 45) side studs (at least 1, at most 4), never a further stud inside an opening", () => {
  const two = { openingSideStuds: { studWidthMm: W, perSide: 2 } };
  const A = { id: "A", xLeftMm: 1000, xRightMm: 1250, sillMm: 900, headMm: 2100 };
  const between = (g) => at(studs(6000, [A, { id: "B", xLeftMm: 1250 + g, xRightMm: 2300, sillMm: 900, headMm: 2100 }], two)).filter((x) => x >= 1250 - 1e-6 && x <= 1250 + g + 1e-6);
  for (const [g, n] of [[0, 1], [10, 1], [30, 1], [44.9, 1], [45, 1], [67.5, 1], [89, 1], [90, 2], [134, 2], [135, 3], [179, 3], [180, 4], [300, 4]]) {
    const xs = between(g);
    assert.equal(xs.length, n, `gap ${g}: ${xs}`);
    if (g >= W) assert.ok(xs.every((x) => x - W / 2 >= 1250 - 1e-6 && x + W / 2 <= 1250 + g + 1e-6), `gap ${g}: every stud fits in the gap ${xs}`);
  }
  nearAll(between(90), [1272.5, 1317.5], "90 apart: two studs filling the gap");
  nearAll(between(300), [1272.5, 1317.5, 1482.5, 1527.5]);
  // one each side (Studs, perSide default 1) is unchanged: 2 from 90 up, whatever the gap
  assert.equal(at(studs(6000, [A, { id: "B", xLeftMm: 1550, xRightMm: 2300, sillMm: 900, headMm: 2100 }])).filter((x) => x > 1250 && x < 1550).length, 2);
  assert.deepEqual(codes(studs(6000, [A], { openingSideStuds: { studWidthMm: W, perSide: 0 } })), ["invalid_input"]);
  assert.deepEqual(codes(studs(6000, [A], { openingSideStuds: { studWidthMm: W, perSide: 1.5 } })), ["invalid_input"]);
});

t("touching studs beside openings: no noggin and no block; a door at the wall start merges into the end stud; openings 90 apart share 2 studs", () => {
  const c = wf([wm("w", 6000, 2700, "Wall 1"), om("a", "w", "D2", "door", 0, 820, 2040, 0), om("b", "w", "D3", "door", 2000, 820, 2040, 0),
    om("e", "w", "W2", "window", 2910, 690, 1200, 900)]);
  const l = wl(c, "Wall 1");
  nearAll(st(l), [0, 842.5, 887.5, 1200, 1800, 1932.5, 1977.5, 2842.5, 2887.5, 3622.5, 3667.5, 4200, 4800, 5400, 6000]);
  assert.deepEqual(l.ticks.find((x) => x.positionMm === 0).besideOpeningIds, ["a"], "the end stud is D2's stud too");
  // 90 apart: D3's second stud is W2's first and W2's second is D3's first (each stud beside both)
  assert.deepEqual([2842.5, 2887.5].map((x) => l.ticks.find((y) => y.positionMm === x).besideOpeningIds), [["b", "e"], ["e", "b"]]);
  assert.deepEqual(partDemands(c, "studs").filter((d) => [2842.5, 2887.5].includes(d.sourceRefs[0].station)).map((d) => d.label),
    ["Wall 1 stud @ 2,842.5 (beside D3, W2)", "Wall 1 stud @ 2,887.5 (beside W2, D3)"], "the cut list names them by label");
  assert.deepEqual(l.noggins.bays.filter((b) => b.closed).map((b) => [b.fromMm, b.toMm]), [[842.5, 887.5], [1932.5, 1977.5], [2842.5, 2887.5], [3622.5, 3667.5]]);
  nearAll(nogLengths(c, "w"), [267.5, 555, 87.5, 487.5, 555, 555, 555]);
  assert.deepEqual(l.plates.layers.map((x) => x.piecesMm), [[6000], [6000]], "no 0 mm piece, no door gap");
  assert.ok(!msgs(c).some(([, blocking]) => blocking), JSON.stringify(msgs(c)));
  assert.equal(WR(c).status.procurement, "ready");
  // trace noise: a 6,010 wall's 6,000 stud merges into its end stud (11) and the noggins are normal
  const noisy = wf([wm("w", 6010, 2700, "Wall 1")]);
  assert.deepEqual([pieceSum(noisy, "studs"), pieceSum(noisy, "noggins")], [11, 10]);
});

t("round 3: a 9,000 wall's bottom and top plates are each ONE 9,000 LVL length, on their own 'Plates 90 × 45 LVL' line and cut list", () => {
  const c = wf([wm("w", 9000, 2700, "Wall 1")], { spec: LVL_READY() });
  assert.deepEqual(wl(c, "Wall 1").plates.layers.map((l) => [l.tag, l.piecesMm, l.longPiecesMm, l.joinsOverStudsMm]), [["bottom", [9000], [9000], []], ["top", [9000], [9000], []]]);
  assert.deepEqual([partRows(c, "longPlates"), partRows(c, "plates")], [[[2, 9000]], []], "not joined, no pine plate");
  assert.deepEqual(partLines(c, "longPlates").map((l) => [l.item.component, l.item.description]), [["longPlates", "Plates 90 × 45 LVL H2 — 9,000 mm length"]]);
  assert.deepEqual(cutList(c, "Long plates cut list").rows, [{ cutMm: 9000, stockMm: 9000, qty: 2, labels: ["Wall 1 bottom plate 0–9,000", "Wall 1 top plate 0–9,000"] }]);
  assert.deepEqual(WR(c).appendix.timber.map((x) => x.title), ["Studs cut list", "Long plates cut list", "Noggins cut list"]);
  assert.deepEqual(c.scheduleLines.map((l) => l.component), ["studs", "longPlates", "noggins", "noggins"]);
  assert.deepEqual([wl(c, "Wall 1").totals.bottomPlateMm, wl(c, "Wall 1").totals.topPlateMm, wl(c, "Wall 1").totals.longPlateMm], [9000, 9000, 18000], "the plate totals include the LVL metres");
  assert.ok(WR(c).explain.includes("Top plate: one continuous 9,000 mm piece (one long plate, over the 6,000 mm plates)"), WR(c).explain.join("\n"));
  assert.deepEqual([WR(c).status.procurement, msgs(c).filter(([, b]) => b)], ["ready", []], "a saved LVL product: nothing to fix");
  // Double top plate: three 9,000 LVL lengths
  assert.deepEqual(partRows(wf([wm("w", 9000, 2700, "Wall 1")], { spec: LVL_READY(), rules: { centresMm: 600, doubleTopPlate: true } }), "longPlates"), [[3, 9000]]);
  // the built-in LVL part (no treatment): its need shows now, naming the part, and holds the order
  const d = wf([wm("w", 9000, 2700, "Wall 1")]);
  assert.ok(hasMsg(d, "material_incomplete", true, "Long plates: enter the treatment (or \"untreated\")."), JSON.stringify(msgs(d)));
  assert.deepEqual([WR(d).status.procurement, d.orderReady, partLines(d, "longPlates")[0].item.description], ["missing-product", false, "Plates 90 × 45 LVL — 9,000 mm length"]);
});

t("round 3: a 6,000 wall stays pine (no LVL line or need); a 12,000 wall at 600 centres joins over the stud at 10,800: 10,800 LVL + 1,200 pine per layer", () => {
  const six = wf([wm("w", 6000, 2700, "Wall 1")]);
  assert.deepEqual([partRows(six, "plates"), partRows(six, "longPlates")], [[[2, 6000]], []]);
  assert.ok(!msgs(six).some(([, , m]) => /^Long plates/.test(m)), "the LVL part's needs only show once it is used");
  assert.equal(WR(six).status.procurement, "ready");
  const twelve = wf([wm("w", 12000, 2700, "Wall 1")], { spec: LVL_READY() });
  assert.deepEqual(wl(twelve, "Wall 1").plates.layers.map((l) => [l.tag, l.piecesMm, l.longPiecesMm, l.joinsOverStudsMm]),
    [["bottom", [10800, 1200], [10800], [10800]], ["top", [10800, 1200], [10800], [10800]]]);
  assert.deepEqual([partRows(twelve, "longPlates"), partRows(twelve, "plates")], [[[2, 10800]], [[2, 1200]]]);
  assert.ok(WR(twelve).explain.includes("Top plate: 12,000 mm joined over the stud at 10,800 mm (longest length 11,000 mm) → 10,800 + 1,200 mm (10,800 mm as a long plate, over the 6,000 mm plates)"));
  assert.deepEqual(cutList(twelve, "Plates cut list").rows.map((x) => [x.qty, x.cutMm, x.stockMm, x.labels]), [[2, 1200, 1200, ["Wall 1 bottom plate 10,800–12,000", "Wall 1 top plate 10,800–12,000"]]]);
  // one job, both kinds: the 6,000 wall's plates are pine, the 9,000 wall's LVL, each on its own lines (studs, plates, LVL, noggins)
  const both = wf([wm("a", 6000, 2700, "Wall 1"), wm("b", 9000, 2700, "Wall 2")]);
  assert.deepEqual([partRows(both, "plates"), partRows(both, "longPlates")], [[[2, 6000]], [[2, 9000]]]);
  assert.deepEqual([...new Set(both.scheduleLines.map((l) => l.component))], ["studs", "plates", "longPlates", "noggins"]);
  assert.ok(hasMsg(both, "material_incomplete", true, "Long plates: enter the treatment (or \"untreated\")."), "a plate now uses the LVL part, so its needs show");
  // trace noise past 6,000: a 6,010 wall buys the first LVL length (6,300) for each plate
  assert.deepEqual(partRows(wf([wm("w", 6010, 2700, "Wall 1")], { spec: LVL_READY() }), "longPlates"), [[2, 6300]]);
  // only past 11,000 with no stud in range is a plate blocked: a window 11.3 m wide leaves no stud to join over
  const wideMeas = [wm("w", 12000, 2700, "Wall 5"), om("o", "w", "W9", "window", 500, 11300, 1200, 900), wm("w6", 4000, 2700, "Wall 6")];
  const wide = wf(wideMeas, { spec: LVL_READY() });
  assert.ok(hasMsg(wide, "plate_too_long", true, "Wall 5: the bottom plate has no stud to join over from 477.5 to 11,822.5 mm. That is 11,345 mm, longer than the 11,000 mm longest length. Set a longer longest length for the long plates."), JSON.stringify(msgs(wide)));
  assert.ok(wide.scheduleLines.length && wide.scheduleLines.every((l) => l.problems.some((p) => p.startsWith("Wall 5: the bottom plate has no stud"))), "the block holds every line of the item");
  // the final review: that wall adds nothing to the totals (no studs or noggins without its plates) and is named
  assert.deepEqual(WR(wide).layouts.map((l) => l.wallLabel), ["Wall 6"]);
  assert.ok(WR(wide).demands.every((d) => d.sourceRefs.every((r) => r.wallId === "w6")));
  assert.equal(wallFramingText(wallFramingTotals(WR(wide)), "Walls", wallsNotCounted(WR(wide), wideMeas, wallCons(wideMeas), "walls")),
    "Walls: 8 studs at 2,700 · bottom plate 4.00 m · top plate 4.00 m · 7 noggins (1 row) · Wall 5 not counted");
});

t("item-wide blocks: overlapping openings give that wall no quantities, the other walls keep theirs, and every line of the item carries the block", () => {
  const c = wf([wm("w1", 6000, 2700, "Wall 1"), wm("w2", 4000, 2700, "Wall 2"), om("a", "w2", "W1", "window", 500, 1000, 1200, 900), om("b", "w2", "W2", "window", 1200, 1000, 1200, 900)]);
  const block = "Wall 2: Openings W1 and W2 overlap along the wall — frame them as one opening or with explicit members.";
  assert.ok(hasMsg(c, "invalid_input", true, block), JSON.stringify(msgs(c)));
  assert.deepEqual(WR(c).layouts.map((l) => l.wallLabel), ["Wall 1"], "Wall 2 gets no quantities");
  assert.ok(WR(c).demands.length && WR(c).demands.every((d) => d.sourceRefs.every((s) => s.wallId === "w1")));
  assert.deepEqual([partRows(c, "studs"), partRows(c, "plates")], [[[11, 2700]], [[2, 6000]]], "Wall 1 still shows its quantities");
  assert.ok(c.scheduleLines.length === 3 && c.scheduleLines.every((l) => l.problems.includes(block)), "studs and noggins held too");
  assert.deepEqual([WR(c).status.procurement, c.orderReady], ["draft", false]);
  // a sloped, gable or outline wall, or one with no height: one blocking line each naming the wall, on every line
  const g = wf([wm("w1", 6000, 2700, "Wall 1"), { id: "w3", kind: "wall", inputs: { kind: "rake", widthMm: 3000, startHeightMm: 2400, endHeightMm: 3000, name: "Wall 3" } },
    { id: "w4", kind: "wall", inputs: { kind: "rect", widthMm: 3000, name: "Wall 4" } },
    { id: "w6", kind: "wall", inputs: { kind: "gable", widthMm: 3000, eavesHeightMm: 2400, apexHeightMm: 3600, apexXMm: 1500, name: "Wall 6" } },
    { id: "w7", kind: "wall", inputs: { kind: "polygon", polygon: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2400 }], name: "Wall 7" } }]);
  const blocks = msgs(g).filter(([, b]) => b);
  assert.deepEqual(blocks, [
    ["wall_not_straight", true, "Wall 3 is sloped or traced as an outline. Walls only works out straight walls of one height."],
    ["wall_incomplete", true, "Wall 4: enter the Wall height."],
    ["wall_not_straight", true, "Wall 6 is sloped or traced as an outline. Walls only works out straight walls of one height."],
    ["wall_not_straight", true, "Wall 7 is sloped or traced as an outline. Walls only works out straight walls of one height."]]);
  assert.deepEqual(WR(g).layouts.map((l) => l.wallLabel), ["Wall 1"]);
  assert.ok(g.scheduleLines.every((l) => blocks.every(([, , m]) => l.problems.includes(m))));
  // no stud section: nothing can be laid out, and it says why
  const bare = wf([wm("w1", 6000, 2700, "Wall 1")], { spec: withPart(READY(), "studs", { section: { depthMm: 90, widthMm: null } }) });
  assert.deepEqual(msgs(bare), [["material_incomplete", true, "Studs: enter the timber section (e.g. 90 × 45)."]], "the need said once, and never 'trace the walls'");
  assert.deepEqual([WR(bare).layouts, WR(bare).demands], [[], []]);
});

t("a window head above the studs is clipped on Walls with a note naming its wall (no block); a Studs item still refuses it, as before", () => {
  const tall = [wm("w2", 4000, 2700, "Wall 2"), om("o5", "w2", "W5", "window", 1000, 1000, 1900, 900)];
  const c = wf(tall);
  assert.ok(hasMsg(c, "opening_clipped", false, "Wall 2 W5: its head (2,800 mm) is above the 2,700 mm studs, so it is taken to the top of the studs."), JSON.stringify(msgs(c)));
  assert.equal(wl(c, "Wall 2").openings[0].headMm, 2700);
  assert.ok(pieceSum(c, "studs") > 0 && !msgs(c).some(([, b]) => b));
  const studsItem = computeWorkspace(tSnap([tMat("st", "wall_frame", "studs", { centresMm: 600 })], tall, [onW("w2", "st")]));
  assert.ok(studsItem.materialResults.st.problems.some((p) => p.code === "invalid_input" && p.blocking !== false), "Studs unchanged: still refused");
});

t("an explicit framing detail on an opening still adds its own members, with a note to check the studs beside it; the others stay 'not counted'", () => {
  const detail = { source: "explicit", aboveHead: { required: false },
    members: [{ id: "L1", role: "lintel", quantity: 1, lengthFrom: "openingWidth", addMm: 300, identity: { section: "190x45", grade: "LVL", treatment: "H2" }, stock: { maxMm: 6000 } }] };
  const c = wf([wm("w1", 6000, 2700, "Wall 1"), om("d1", "w1", "D1", "door", 1000, 820, 2040, 0, detail), om("o2", "w1", "W1", "window", 3000, 1200, 1200, 900)]);
  assert.ok(hasMsg(c, "framing_detail_members", false, "Wall 1 D1: its framing detail adds its own members. Check the studs beside D1 aren't counted twice."), JSON.stringify(msgs(c)));
  assert.ok(hasMsg(c, "opening_framing_not_counted", false, "Lintels, jacks and trimmers at W1 aren't counted."));
  const lintel = WR(c).demands.filter((d) => d.role === "lintel");
  assert.deepEqual(lintel.map((d) => [d.lengthMm, d.label]), [[1120, "Wall 1 D1 lintel × 1 @ 1,120 mm"]]);
  assert.ok(c.scheduleLines.some((l) => l.item.description === "190 × 45 LVL H2 — 1,200 mm length" && !l.component), "its own line, not a Walls part");
  assert.deepEqual(wl(c, "Wall 1").openingsNotCounted, ["o2"], "the opening's measurement id (its label is on layout.openings)");
  // without the detail no lintel is ever counted
  assert.ok(!WR(wf([wm("w1", 6000, 2700, "Wall 1"), om("d1", "w1", "D1", "door", 1000, 820, 2040, 0)])).demands.some((d) => d.role === "lintel"));
});

t("studs and plates of the same 90 × 45 MGP10 H2 stay on separate lines and cut lists, named by part; an order line is only offered its own part", () => {
  const c = wf([wm("w", 4000, 4200, "Wall 1")]);
  const stud = partLines(c, "studs"), plate = partLines(c, "plates");
  assert.deepEqual([stud.map((l) => [l.quantity, l.finishedLengthMm]), plate.map((l) => [l.quantity, l.finishedLengthMm])], [[[8, 4200]], [[2, 4200]]]);
  assert.notEqual(stud[0].bucketKey, plate[0].bucketKey);
  assert.equal(stud[0].materialKey, plate[0].materialKey, "one material");
  assert.deepEqual([stud[0].item.component, plate[0].item.component, stud[0].item.description, plate[0].item.description],
    ["studs", "plates", "Studs 90 × 45 MGP10 H2 — 4,200 mm length", "Plates 90 × 45 MGP10 H2 — 4,200 mm length"]);
  assert.deepEqual(WR(c).appendix.timber.map((x) => x.title), ["Studs cut list", "Plates cut list", "Noggins cut list"]);
  assert.deepEqual(cutList(c, "Studs cut list").rows.map((x) => [x.qty, x.cutMm, x.stockMm]), [[8, 4200, 4200]]);
  assert.deepEqual(cutList(c, "Plates cut list").rows.map((x) => [x.qty, x.cutMm, x.stockMm]), [[2, 4000, 4200]]);
  assert.deepEqual(c.scheduleLines.map((l) => l.component), ["studs", "plates", "noggins", "noggins"]);
  // a draft line that went out of date (e.g. its product changed) is offered its own part's 4,200 line, never the other part's
  const mats = new Map([["walls", walls(READY())]]);
  const stale = (component) => orderLineState({ bucketKey: "gone", jobMaterialId: "walls", finishedLengthMm: 4200, quantity: 2, unit: "piece", ...(component ? { item: { component } } : {}) }, c, mats);
  assert.equal(stale("plates").suggestion?.bucketKey, plate[0].bucketKey, "a plate line is offered the plate line (the stud line comes first in the list)");
  assert.equal(stale("studs").suggestion?.bucketKey, stud[0].bucketKey);
  assert.equal(stale(null).suggestion, null, "a line with no part is never guessed onto one");
  assert.deepEqual([stale("plates").stale, stale("plates").problem], [true, "line_stale_missing"]);
});

t("noggins on Walls use the stud's thickness (555 bays at 600 centres); a wall also on Studs or Noggins gets one note on Walls, theirs unchanged", () => {
  const studsItem = { ...tMat("st", "wall_frame", "studs", { centresMm: 600 }), name: "Studs 1" };
  const nogItem = { ...tMat("ng", "linear_stock", "noggins", { centresMm: 600, nogginRows: 1 }, { maxMm: 6000 }), name: "Noggins 1" };
  nogItem.spec = { ...nogItem.spec, section: { depthMm: 90, widthMm: 35 } };
  const plateItem = { ...tMat("pl", "linear_stock", "plates"), name: "Plates 1" };
  const meas = [wm("w1", 2400, 2700, "Wall 1"), wm("w2", 2400, 2700, "Wall 2"), wm("w3", 3000, 2700, "Wall 3")];
  const both = wf(meas, { extra: [studsItem, nogItem, plateItem],
    contributions: [onW("w1"), onW("w2"), onW("w3"), onW("w2", "st"), onW("w2", "ng"), onW("w3", "pl")] });
  const alone = computeWorkspace(tSnap([studsItem, nogItem, plateItem], meas, [onW("w2", "st"), onW("w2", "ng"), onW("w3", "pl")]));
  const note = "Wall 2 is also on Noggins 1 and Studs 1, so its framing may be counted twice.";
  const note3 = "Wall 3 is also on Plates 1, so its framing may be counted twice.";
  assert.deepEqual(WR(both).problems.filter((p) => p.code === "walls_counted_twice").map((p) => [p.blocking, p.message]), [[false, note], [false, note3]]);
  assert.ok(partLines(both, "studs").every((l) => l.notes.includes(note) && l.notes.includes(note3) && !l.problems.length), "a note, not a block");
  assert.equal(both.orderReady, true);
  const own = (c, id) => c.scheduleLines.filter((l) => l.jobMaterialIds.includes(id));
  for (const id of ["st", "ng", "pl"]) {
    assert.deepEqual(own(both, id), own(alone, id), `${id} lines unchanged`);
    assert.deepEqual(both.materialResults[id], alone.materialResults[id], `${id} result unchanged`);
  }
  assert.ok(!both.materialResults.st.problems.some((p) => /counted twice/.test(p.message)), "no note on their side");
  // the same 2,400 wall: Walls 4 × 555 (the 45 mm stud), the Noggins item its own 35 mm width: 4 × 565, as before
  assert.deepEqual(partDemands(both, "noggins").filter((d) => d.sourceRefs[0].wallId === "w2").map((d) => d.lengthMm), [555, 555, 555, 555]);
  assert.deepEqual(both.materialResults.ng.demands.map((d) => d.lengthMm), [565, 565, 565, 565]);
  // a wall only on Walls gets no note
  assert.ok(!msgs(wf(meas)).some(([code]) => code === "walls_counted_twice"));
});

t("needs: a Walls item with no company products blocks ordering, naming each part, but its quantities are still worked out", () => {
  const c = ex(2700, { spec: wallFramingDefaults([]) });
  assert.equal(WR(c).status.procurement, "missing-product");
  const needs = msgs(c).filter(([code]) => code === "material_incomplete").map(([, b, m]) => [b, m]);
  assert.deepEqual(needs, [[true, "Studs: enter the treatment (or \"untreated\")."], [true, "Plates: enter the grade or species."], [true, "Plates: enter the treatment (or \"untreated\")."],
    [true, "Noggins: enter the grade or species."], [true, "Noggins: enter the treatment (or \"untreated\")."]]);
  assert.ok(c.scheduleLines.every((l) => l.problems.includes("Plates: enter the treatment (or \"untreated\").")));
  assert.equal(c.orderReady, false);
  assert.deepEqual([pieceSum(c, "studs"), partRows(c, "plates"), pieceSum(c, "noggins")], [21, [[2, 6000], [2, 4200]], 13]);
  assert.deepEqual(partLines(c, "studs")[0].item.description, "Studs 90 × 45 MGP10 — 2,700 mm length");
  assert.ok(!msgs(c).some(([, , m]) => /choose the .* before ordering/.test(m)), "the part's needs once, never the engine's own wording as well");
});

t("the Walls layout keys openings by measurement id (as Studs does) and carries their labels; notes and cut lists use the labels", () => {
  // what the wall pages look up: layout.openings[].id, ticks' openingId / besideOpeningIds and bays' openingId are the
  // opening measurements' ids, so WallsScreen's lookups by opening.id find them
  const meas = [wm("w2", 4000, 2700, "Wall 2"), om("o5", "w2", "W5", "window", 1000, 1000, 1200, 900), om("o6", "w2", "W6", "window", 2600, 800, 300, 2800)];
  const c = wf(meas);
  const l = wl(c, "Wall 2");
  assert.deepEqual(l.openings.map((o) => [o.id, o.label]), [["o5", "W5"]]);
  assert.deepEqual(l.openingsAboveStuds, [{ id: "o6", label: "W6", xLeftMm: 2600, xRightMm: 3400 }]);
  for (const o of meas.filter((x) => x.kind === "opening" && x.id === "o5")) assert.ok(l.openings.find((x) => x.id === o.id), "found by the opening's measurement id");
  const ids = new Set(["o5", "o6"]);
  assert.ok(l.ticks.every((t) => (t.openingId == null || ids.has(t.openingId)) && (t.besideOpeningIds || []).every((x) => ids.has(x))), JSON.stringify(l.ticks));
  assert.ok(l.noggins.bays.every((b) => b.openingId == null || ids.has(b.openingId)));
  assert.deepEqual(l.openingsNotCounted, ["o5"]);
  assert.ok(hasMsg(c, "opening_clipped", false, "Wall 2 W6 is above the top of the 2,700 mm studs (sill 2,800 mm), so it doesn't change this wall's framing. Check the wall height or the opening."), JSON.stringify(msgs(c)));
  assert.ok(hasMsg(c, "opening_framing_not_counted", false, "Lintels, jacks and trimmers at W5 aren't counted."));
  assert.ok(partDemands(c, "studs").some((d) => d.label === "Wall 2 stud @ 977.5 (beside W5)"));
  assert.ok(WR(c).explain.includes("W5: 2 full-height stud(s) strictly inside 1,000–2,000 removed"), WR(c).explain.join("\n"));
  // overlapping openings are named by their labels too
  const clash = wf([wm("w", 4000, 2700, "Wall 1"), om("x1", "w", "W1", "window", 500, 1000, 1200, 900), om("x2", "w", "W2", "window", 1200, 1000, 1200, 900)]);
  assert.ok(hasMsg(clash, "invalid_input", true, "Wall 1: Openings W1 and W2 overlap along the wall — frame them as one opening or with explicit members."), JSON.stringify(msgs(clash)));
});

t("two openings with the same label on one wall are named along the wall (W1, then W1 (2)), whatever order they were added", () => {
  const wall = wm("w", 6000, 2700, "Wall 1");
  const a = om("zz", "w", "W1", "window", 1000, 900, 1200, 900), b = om("aa", "w", "W1", "window", 3500, 900, 1200, 900);
  const fwd = wf([wall, a, b]), rev = wf([wall, b, a]);
  assert.deepEqual(wl(fwd, "Wall 1").openings.map((o) => [o.id, o.label]), [["zz", "W1"], ["aa", "W1 (2)"]], "the left one is W1");
  assert.deepEqual(partDemands(fwd, "studs").filter((d) => /beside/.test(d.label)).map((d) => d.label),
    ["Wall 1 stud @ 932.5 (beside W1)", "Wall 1 stud @ 977.5 (beside W1)", "Wall 1 stud @ 1,922.5 (beside W1)", "Wall 1 stud @ 1,967.5 (beside W1)",
      "Wall 1 stud @ 3,432.5 (beside W1 (2))", "Wall 1 stud @ 3,477.5 (beside W1 (2))", "Wall 1 stud @ 4,422.5 (beside W1 (2))", "Wall 1 stud @ 4,467.5 (beside W1 (2))"]);
  assert.ok(hasMsg(fwd, "opening_framing_not_counted", false, "Lintels, jacks and trimmers at W1, W1 (2) aren't counted."), JSON.stringify(msgs(fwd)));
  assert.deepEqual(WR(rev), WR(fwd));
  // the same lines; only the draft-line staleness key follows the stored order of the openings (as for every material)
  const noKey = (c) => c.scheduleLines.map(({ dependencyKey: _k, item: { dependencyKey: _i, ...item }, ...l }) => ({ ...l, item }));
  assert.deepEqual(noKey(rev), noKey(fwd));
});

t("a framing-detail member's own need still blocks on Walls, naming its wall; the parts' needs are still said once", () => {
  const detail = { source: "explicit", aboveHead: { required: false },
    members: [{ id: "L1", role: "lintel", quantity: 1, lengthFrom: "openingWidth", addMm: 300, identity: { section: "190x45", grade: "LVL" }, stock: { maxMm: 6000 } }] };
  const c = wf([wm("w1", 6000, 2700, "Wall 1"), om("d1", "w1", "D1", "door", 1000, 820, 2040, 0, detail)]);
  assert.ok(hasMsg(c, "timber_identity_incomplete", true, "Wall 1 D1 L1: choose the treatment before ordering."), JSON.stringify(msgs(c)));
  assert.deepEqual([WR(c).status.procurement, c.orderReady], ["draft", false]);
  assert.ok(c.scheduleLines.every((l) => l.problems.includes("Wall 1 D1 L1: choose the treatment before ordering.")));
  // with its treatment the item is ready again
  const ok = wf([wm("w1", 6000, 2700, "Wall 1"), om("d1", "w1", "D1", "door", 1000, 820, 2040, 0,
    { ...detail, members: [{ ...detail.members[0], identity: { section: "190x45", grade: "LVL", treatment: "H2" } }] })]);
  assert.deepEqual([WR(ok).status.procurement, msgs(ok).filter(([, b]) => b)], ["ready", []]);
  // a Walls part's own identity problem never shows twice (the needs test: once each, from the part)
  assert.ok(!msgs(ex(2700, { spec: wallFramingDefaults([]) })).some(([code]) => code === "timber_identity_incomplete"));
});

t("the 'aren't counted' note names every opening without a framing detail (never 'and n more')", () => {
  const meas = [wm("w", 12000, 2700, "Wall 1"), ...Array.from({ length: 9 }, (_, i) => om(`o${i}`, "w", `W${i + 1}`, "window", 300 + i * 1300, 600, 1200, 900))];
  const c = wf(meas, { spec: LVL_READY() });
  assert.ok(hasMsg(c, "opening_framing_not_counted", false, "Lintels, jacks and trimmers at W1, W2, W3, W4, W5, W6, W7, W8, W9 aren't counted."), JSON.stringify(msgs(c)));
});

t("round 3: an LVL longest length marked not stocked (11,000, off the 300 mm grid) is kept by the normaliser and never bought", () => {
  const spec = withPart(LVL_READY(), "longPlates", { stock: { maxMm: 11000, unavailableMm: [11000, 10800] } });
  const n = normaliseFamilySpec(spec);
  assert.deepEqual(n.components.longPlates.stock, { maxMm: 11000, unavailableMm: [10800, 11000] });
  assert.deepEqual(normaliseFamilySpec(n), n, "a fixed point");
  assert.deepEqual(longPlateStockLengths(n.components.longPlates).slice(-2), [10200, 10500]);
  // a 10,900 wall: no 11,000 or 10,800 LVL, so each plate joins over the stud at 10,200 (10,200 LVL + 700 pine)
  const c = wf([wm("w", 10900, 2700, "Wall 1")], { spec });
  assert.deepEqual([partRows(c, "longPlates"), partRows(c, "plates")], [[[2, 10200]], [[2, 1200]]]);
  assert.deepEqual(wl(c, "Wall 1").plates.layers.map((l) => [l.piecesMm, l.joinsOverStudsMm]), [[[10200, 700], [10200]], [[10200, 700], [10200]]]);
  // a pine plate's not-stocked length off the grid still comes out, as before
  assert.deepEqual(normaliseFamilySpec(withPart(LVL_READY(), "plates", { stock: { maxMm: 6000, unavailableMm: [6100, 5700] } })).components.plates.stock.unavailableMm, [5700]);
  // a Long plates part with no longest length: 11,000 is its longest, so it can be marked not stocked too
  assert.deepEqual(normaliseFamilySpec(withPart(LVL_READY(), "longPlates", { stock: { maxMm: null, unavailableMm: [11000] } })).components.longPlates.stock.unavailableMm, [11000]);
});

t("order independence: the walls in any order (and the same input twice) give the same lines, layouts and notes; the job limit still applies", () => {
  const base = ex(2700);
  const m = EXAMPLE(2700);
  const shuffled = wf([m[3], m[1], m[2], m[0]], { rules: { centresMm: 600, doubleTopPlate: false }, contributions: [onW("w2"), onW("w1")] });
  assert.deepEqual(shuffled.scheduleLines, base.scheduleLines);
  assert.deepEqual(WR(shuffled), WR(base));
  assert.deepEqual(ex(2700), base, "the same input twice");
  // ten walls traced in reverse: same lines and the same wall order on the result
  const ten = Array.from({ length: 10 }, (_, i) => wm(`w${i}`, 3000 + i * 450, 2700 + (i % 3) * 150, `Wall ${i + 1}`));
  const fwd = wf(ten), rev = wf([...ten].reverse());
  assert.deepEqual(rev.scheduleLines, fwd.scheduleLines);
  assert.deepEqual(WR(rev).layouts.map((l) => l.wallLabel), ["Wall 1", "Wall 2", "Wall 3", "Wall 4", "Wall 5", "Wall 6", "Wall 7", "Wall 8", "Wall 9", "Wall 10"]);
  assert.deepEqual(WR(rev), WR(fwd));
  // JOB_GENERATED_LIMIT: studs, plates and both noggin rows all count
  assert.equal(JOB_GENERATED_LIMIT, 20000);
  const many = Array.from({ length: 25 }, (_, i) => wm(`m${i}`, 30000, 3000, `Wall ${i + 1}`));
  assert.throws(() => wf(many, { rules: { centresMm: 100, doubleTopPlate: false } }), (e) => e instanceof TakeoffValidationError && /more than 20,000 pieces \(stopped at Walls\)/.test(e.message));
});

// ══ Step 4: entry and plan (src/components/takeoff/measure/tools.js) ═══════════════════════════════════════════════
const line = (c, wallId = null) => wallFramingText(wallFramingTotals(WR(c), wallId), wallId ? null : "Walls");

t("tools: a Walls item traces with Line only (no Rectangle or Area, no Wall); Studs, Plates and Noggins keep Wall; usesWalls includes Walls", () => {
  const keys = (m) => toolsFor(m).map((x) => x.k);
  const w = walls(wallFramingDefaults([]));
  assert.deepEqual(keys(w), ["line", "select", "pan"]);
  assert.equal(toolsFor(w)[0].label, "Line");
  assert.deepEqual(keys({ spec: { family: "timber", purpose: "walls" } }), ["line", "select", "pan"], "by its purpose too (before the method is known)");
  assert.deepEqual(keys({ spec: { family: "timber", purpose: "studs" }, methodKey: "wall_frame" }), ["wall", "select", "pan"]);
  assert.deepEqual(keys({ spec: { family: "timber", purpose: "plates" }, methodKey: "linear_stock" }), ["wall", "run", "count", "select", "pan"]);
  assert.deepEqual(keys({ spec: { family: "timber", purpose: "noggins" }, methodKey: "linear_stock" }), ["wall", "count", "select", "pan"]);
  assert.deepEqual(keys({ spec: { family: "cladding" }, methodKey: "sheet_layout" }), ["line", "rect", "area", "select", "pan"], "cladding unchanged");
  assert.ok(usesWalls(w) && isWallsItem(w));
  for (const purpose of ["studs", "plates", "noggins"]) assert.ok(usesWalls({ spec: { family: "timber", purpose } }) && !isWallsItem({ spec: { family: "timber", purpose } }), purpose);
  assert.ok(!usesWalls({ spec: { family: "timber", purpose: "rafters" } }) && !isWallsItem({ spec: { family: "timber", purpose: "rafters" } }));
});

t("Walls line, the 2,700 example: 'Walls: 21 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 13 noggins (1 row)', and each wall's own", () => {
  const c = ex(2700);
  assert.equal(line(c), "Walls: 21 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 13 noggins (1 row)");
  assert.equal(line(c, "w1"), "13 studs at 2,700 · bottom plate 6.00 m · top plate 6.00 m · 9 noggins (1 row)");
  assert.equal(line(c, "w2"), "8 studs at 2,700 · bottom plate 4.00 m · top plate 4.00 m · 4 noggins (1 row)");
  assert.equal(wallFramingText(wallFramingTotals(WR(c), "w2"), "Wall 2"), "Wall 2: 8 studs at 2,700 · bottom plate 4.00 m · top plate 4.00 m · 4 noggins (1 row)");
  assert.deepEqual(wallFramingTotals(WR(c)), { walls: 2, studs: 21, studsByHeight: [[2700, 21]], bottomPlateMm: 10000, topPlateMm: 10000, secondTopPlateMm: null, noggins: 13, rows: [1] });
  // the line's studs and noggins are exactly what the order buys
  assert.deepEqual([pieceSum(c, "studs"), pieceSum(c, "noggins")], [21, 13]);
  assert.ok(!/confirm|default/i.test(line(c)), "no 'to confirm' wording: both row rules are Sam's");
  // without the openings (the first screen step): 19 studs, 17 noggins; at 450 centres 25 studs
  const plain = EXAMPLE(2700).filter((m) => m.kind === "wall");
  assert.equal(line(wf(plain)), "Walls: 19 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 17 noggins (1 row)");
  assert.equal(line(wf(plain, { rules: { centresMm: 450, doubleTopPlate: false } })), "Walls: 25 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 23 noggins (1 row)");
});

t("Walls line, the 3,000 example with Double top plate: only the top plate changes to '2 × 10.00 m'; 26 noggins (2 rows)", () => {
  assert.equal(line(ex(2700, { doubleTopPlate: true })), "Walls: 21 studs at 2,700 · bottom plate 10.00 m · top plate 2 × 10.00 m · 13 noggins (1 row)");
  const c = ex(3000, { doubleTopPlate: true });
  assert.equal(line(c), "Walls: 21 studs at 3,000 · bottom plate 10.00 m · top plate 2 × 10.00 m · 26 noggins (2 rows)");
  assert.equal(line(c, "w1"), "13 studs at 3,000 · bottom plate 6.00 m · top plate 2 × 6.00 m · 18 noggins (2 rows)");
  assert.equal(line(c, "w2"), "8 studs at 3,000 · bottom plate 4.00 m · top plate 2 × 4.00 m · 8 noggins (2 rows)");
});

t("Walls line, a mixed run: 'Walls: 21 studs (13 at 2,700, 8 at 3,000) · … · 17 noggins (1–2 rows)', lowest height first; all at 3,000 reads '(2 rows)'", () => {
  const c = wf(EXAMPLE(2700, 3000), { rules: { centresMm: 600, doubleTopPlate: false, studHeightMm: 2400 } });
  assert.equal(line(c), "Walls: 21 studs (13 at 2,700, 8 at 3,000) · bottom plate 10.00 m · top plate 10.00 m · 17 noggins (1–2 rows)");
  const rev = wf(EXAMPLE(3000, 2700));
  assert.equal(line(rev), "Walls: 21 studs (8 at 2,700, 13 at 3,000) · bottom plate 10.00 m · top plate 10.00 m · 22 noggins (1–2 rows)", "lowest height first, whichever wall has it");
  assert.equal(line(ex(3000)), "Walls: 21 studs at 3,000 · bottom plate 10.00 m · top plate 10.00 m · 26 noggins (2 rows)");
  // a long LVL plate counts in the plate totals (the wording doesn't change)
  assert.equal(line(wf([wm("w", 9000, 2700, "Wall 1")], { spec: LVL_READY() })), "Walls: 16 studs at 2,700 · bottom plate 9.00 m · top plate 9.00 m · 15 noggins (1 row)");
  assert.equal(wallFramingText({ walls: 1, studs: 1, studsByHeight: [[2400, 1]], bottomPlateMm: 40, topPlateMm: 40, secondTopPlateMm: null, noggins: 1, rows: [1] }),
    "1 stud at 2,400 · bottom plate 0.04 m · top plate 0.04 m · 1 noggin (1 row)");
});

t("Walls line: a blocked wall adds nothing (the other walls still read); nothing worked out → no line; other materials never read as Walls", () => {
  const blocked = wf([...EXAMPLE(2700), wm("g", 5000, 2700, "Wall 3", { kind: "gable" })]);
  assert.equal(line(blocked), "Walls: 21 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 13 noggins (1 row)");
  assert.ok(WR(blocked).problems.some((p) => p.blocking && /Wall 3 is sloped/.test(p.message)), "the block is on the item's lines, not hidden");
  const none = wf([]);
  assert.equal(wallFramingTotals(WR(none)), null);
  assert.equal(wallFramingText(null, "Walls"), "");
  assert.equal(wallFramingTotals({ layouts: [{ method: "wall_frame@1", totals: { studs: 9 } }] }), null);
});

t("Walls line: a blocked wall is named on the line ('· Wall 1 not counted'), never a quiet gap in the totals", () => {
  const cons = (ms) => ms.filter((m) => m.kind === "wall").map((m) => onW(m.id));
  const named = (ms, extra = {}) => { const c = wf(ms, extra); return wallFramingText(wallFramingTotals(WR(c)), "Walls", wallsNotCounted(WR(c), ms, extra.contributions || cons(ms), "walls")); };
  // overlapping windows on Wall 1 (the reviewer's case): Wall 2 still reads, Wall 1 is named, its reason is a block
  const overlap = [wm("w1", 6000, 2700, "Wall 1"), wm("w2", 4000, 2700, "Wall 2"),
    om("o1", "w1", "W1", "window", 1000, 1200, 1200, 900), om("o2", "w1", "W2", "window", 1600, 1200, 1200, 900)];
  assert.equal(named(overlap), "Walls: 8 studs at 2,700 · bottom plate 4.00 m · top plate 4.00 m · 7 noggins (1 row) · Wall 1 not counted");
  assert.ok(hasMsg(wf(overlap), "invalid_input", true, "Wall 1: Openings W1 and W2 overlap along the wall — frame them as one opening or with explicit members."));
  // no Wall height on Wall 2; a gable Wall 3 as well: both named, in name order
  const two = [wm("w1", 6000, 2700, "Wall 1"), wm("w2", 4000, null, "Wall 2"), wm("g", 5000, 2700, "Wall 3", { kind: "gable" })];
  assert.equal(named(two), "Walls: 11 studs at 2,700 · bottom plate 6.00 m · top plate 6.00 m · 10 noggins (1 row) · Wall 2 and Wall 3 not counted");
  assert.deepEqual(wallsNotCounted(WR(wf(two)), [...two].reverse(), cons(two).reverse(), "walls"), ["Wall 2", "Wall 3"], "whatever order they were traced");
  // nothing worked out: the line says so on its own
  assert.equal(named([wm("w2", 4000, null, "Wall 1")]), "Walls: Wall 1 not counted");
  assert.equal(wallFramingText(null, "Walls", ["Wall 1", "Wall 2", "Wall 3"]), "Walls: Wall 1, Wall 2 and Wall 3 not counted");
  assert.equal(wallFramingText(null, null, ["Wall 1"]), "Wall 1 not counted");
  // every wall worked out, an archived assignment, or a wall on another material: nothing named
  assert.deepEqual(wallsNotCounted(WR(ex(2700)), EXAMPLE(2700), cons(EXAMPLE(2700)), "walls"), []);
  assert.equal(named(EXAMPLE(2700)), "Walls: 21 studs at 2,700 · bottom plate 10.00 m · top plate 10.00 m · 13 noggins (1 row)");
  const gone = [...cons(two).filter((c) => c.measurementId !== "g"), { ...onW("g"), archived: true }];
  assert.deepEqual(wallsNotCounted(WR(wf(two, { contributions: gone })), two, gone, "walls"), ["Wall 2"]);
  assert.deepEqual(wallsNotCounted(WR(wf(two)), two, cons(two).map((c) => (c.measurementId === "w2" ? { ...c, jobMaterialId: "axon" } : c)), "walls"), ["Wall 3"]);
  assert.deepEqual(wallsNotCounted(null, two, cons(two), "walls"), []);
  // two walls of one name are told apart as the engine tells them (with a short id)
  const twins = [wm("aaaa1", 4000, null, "Wall 1"), wm("bbbb2", 4000, 2700, "Wall 1")];
  assert.deepEqual(wallsNotCounted(WR(wf(twins)), twins, cons(twins), "walls"), ["Wall 1 (aaaa)"]);
});

t("Details: n to fix: the built-in parts have no treatment (studs, plates, noggins = 3); saved products = 0; Long plates only once a plate uses them", () => {
  const raw = ex(2700, { spec: wallFramingDefaults([]) });
  assert.equal(wallPartsToFix(WR(raw)), 3);
  assert.equal(wallPartsToFix(WR(wf([]))), 0, "nothing traced: a Walls item with saved products for every part");
  assert.equal(wallPartsToFix(WR(wf([], { spec: wallFramingDefaults([]) }))), 3, "needs show before anything is traced");
  assert.equal(wallPartsToFix(WR(ex(2700))), 0);
  const noLvlTreatment = withPart(LVL_READY(), "longPlates", { treatment: null });
  assert.equal(wallPartsToFix(WR(wf([wm("w", 6000, 2700, "Wall 1")], { spec: noLvlTreatment }))), 0, "no plate over 6,000: the LVL's treatment isn't asked for");
  assert.equal(wallPartsToFix(WR(wf([wm("w", 9000, 2700, "Wall 1")], { spec: noLvlTreatment }))), 1);
});

t("starting Wall height: a Walls item starts at the last height of ITS OWN walls (empty the first time); cladding keeps the takeoff's last height", () => {
  const ms = [
    { id: "cl-1", kind: "wall", inputs: { kind: "rect", heightMm: 2745, name: "Wall 1", runId: "r1", seq: 1 } },
    { id: "wf-1", kind: "wall", inputs: { kind: "rect", heightMm: 2700, name: "Wall 2", runId: "r2", seq: 1 } },
    { id: "wf-2", kind: "wall", inputs: { kind: "rect", heightMm: 2800, name: "Wall 3", runId: "r2", seq: 2 } },
    { id: "cl-2", kind: "wall", inputs: { kind: "rect", heightMm: 3000, name: "Wall 4", runId: "r3", seq: 1 } },
  ];
  const cs = [{ measurementId: "cl-1", jobMaterialId: "axon" }, { measurementId: "cl-2", jobMaterialId: "axon" }, { measurementId: "wf-1", jobMaterialId: "walls" }, { measurementId: "wf-2", jobMaterialId: "walls" }];
  const w = walls(wallFramingDefaults([]));
  const axon = { id: "axon", methodKey: "sheet_layout", spec: { family: "cladding" } };
  assert.equal(lineStartHeight(ms, cs, w), 2800, "its own last wall (highest seq in its run), never the cladding's 3,000");
  assert.equal(lineStartHeight(ms, cs, axon), 3000, "cladding: HUB 022's start, the takeoff's last wall height");
  assert.equal(lineStartHeight(ms, cs, axon), lastWallHeight(ms));
  assert.equal(lineStartHeight(ms.slice(0, 1), cs.slice(0, 1), w), null, "a cladding wall at 2,745 never carries over: empty the first time");
  assert.equal(lineStartHeight(ms, cs.map((c) => (c.measurementId === "wf-2" ? { ...c, archived: true } : c)), w), 2700, "an archived assignment doesn't count");
  assert.equal(lineStartHeight([], [], null), null);
});

// ── step 5: the Walls card and the wall pages ─────────────────────────────────

t("wall pages: each wall's own notes, its openings' lintels note (the item's names every wall's) and, round 3, its LVL plates", () => {
  const c = ex(2700);
  assert.ok(hasMsg(c, "opening_framing_not_counted", false, NOT_COUNTED), "the item's note names both walls' openings");
  assert.deepEqual(wallFramingNotes(WR(c), "w1", READY()), ["Lintels, jacks and trimmers at D1 aren't counted."]);
  assert.deepEqual(wallFramingNotes(WR(c), "w2", READY()), ["Lintels, jacks and trimmers at W1 aren't counted."]);
  // a wall with no opening (or no detail missing) has no notes; neither has a wall that isn't worked out
  const plain = wf([wm("w1", 6000, 2700, "Wall 1")]);
  assert.deepEqual(wallFramingNotes(WR(plain), "w1", READY()), []);
  assert.deepEqual(wallFramingNotes(WR(c), "nope", READY()), []);
  assert.deepEqual(wallFramingNotes(null, "w1", READY()), []);
  // an explicit framing detail on D1: Wall 1 no longer names it (W1 on Wall 2 still does)
  const detail = { source: "explicit", aboveHead: { required: false },
    members: [{ id: "L1", role: "lintel", quantity: 1, lengthFrom: "openingWidth", addMm: 300, identity: { section: "190x45", grade: "LVL", treatment: "H2" }, stock: { maxMm: 6000 } }] };
  const framed = wf([...EXAMPLE(2700).filter((m) => m.id !== "d1"), om("d1", "w1", "D1", "door", 1000, 820, 2040, 0, detail)]);
  assert.deepEqual([wallFramingNotes(WR(framed), "w1", READY()), wallFramingNotes(WR(framed), "w2", READY())], [[], ["Lintels, jacks and trimmers at W1 aren't counted."]]);
  // round 3: a 9,000 wall's plates are LVL, so its page says so (the 4,000 wall's doesn't)
  const long = wf([wm("w1", 9000, 2700, "Wall 1"), wm("w2", 4000, 2700, "Wall 2"), om("d1", "w1", "D1", "door", 1000, 820, 2040, 0)], { spec: LVL_READY() });
  assert.deepEqual(wallFramingNotes(WR(long), "w1", LVL_READY()), ["Plates: 90 × 45 LVL H2 (over 6.0 m)", "Lintels, jacks and trimmers at D1 aren't counted."]);
  assert.deepEqual(wallFramingNotes(WR(long), "w2", LVL_READY()), []);
  const builtIn = wallFramingDefaults([]);
  assert.deepEqual(wallFramingNotes(WR(wf([wm("w1", 9000, 2700, "Wall 1")], { spec: builtIn })), "w1", builtIn), ["Plates: 90 × 45 LVL (over 6.0 m)"], "the plan's wording, built-in Long plates");
});

t("Long plates 'over 6.0 m' is the longest pine plate the calculation buys: the plates' longest grid length less not-stocked ones (6,000 not stocked → 5.7 m)", () => {
  const spec = (stock) => withPart(wallFramingDefaults([]), "plates", { stock });
  assert.equal(wallLongPlateOverMm(wallFramingDefaults([])), 6000);
  assert.equal(wallLongPlateOverText(wallFramingDefaults([])), "over 6.0 m");
  assert.equal(wallLongPlateOverMm(spec({ maxMm: 6000, unavailableMm: [6000] })), 5700);
  assert.equal(wallLongPlateOverMm(spec({ maxMm: 6100, unavailableMm: [] })), 6000, "an off-grid longest length buys the grid length under it");
  assert.equal(wallLongPlateOverMm(spec({ maxMm: 5400, unavailableMm: [] })), 5400);
  assert.equal(wallLongPlateOverMm(spec({ maxMm: null, unavailableMm: [] })), null, "no longest length: no plate is a long plate");
  assert.equal(wallLongPlateOverText(spec({ maxMm: null, unavailableMm: [] })), "");
  // the calculation agrees: with 6,000 not stocked a 5,800 plate is one LVL length, a 5,700 plate stays pine
  const s = normaliseFamilySpec(withPart(LVL_READY(), "plates", { stock: { maxMm: 6000, unavailableMm: [6000] } }));
  const longMm = (L) => wl(wf([wm("w", L, 2700, "Wall 1")], { spec: s }), "Wall 1").totals.longPlateMm;
  assert.deepEqual([longMm(5800), longMm(5700)], [11600, 0]);
  assert.deepEqual(wallFramingNotes(WR(wf([wm("w", 5800, 2700, "Wall 1")], { spec: s })), "w", s), ["Plates: 90 × 45 LVL H2 (over 5.7 m)"]);
  // no plates longest length: the 9,000 wall's plates are not LVL and its page says nothing about them
  const none = normaliseFamilySpec(withPart(LVL_READY(), "plates", { stock: { maxMm: null, unavailableMm: [] } }));
  assert.equal(wl(wf([wm("w", 9000, 2700, "Wall 1")], { spec: none }), "Wall 1").totals.longPlateMm, 0);
});

t("Long plates read 'over X m' only when a plate can be LVL, as the calculation decides: the Long plates' longest must go past the pine limit", () => {
  const spec = (plates, longPlates = {}) => withPart(withPart(LVL_READY(), "plates", { stock: plates }), "longPlates", { stock: { ...LVL_READY().components.longPlates.stock, ...longPlates } });
  const longMm = (s, L) => wl(wf([wm("w", L, 2700, "Wall 1")], { spec: normaliseFamilySpec(s) }), "Wall 1").totals.longPlateMm;
  // plates' longest 12,000 (past the Long plates' 11,000): no plate is ever LVL, so no "over 12.0 m"
  const past = spec({ maxMm: 12000, unavailableMm: [] });
  assert.deepEqual([wallLongPlateOverMm(past), wallLongPlateOverText(past), longMm(past, 9000)], [null, "", 0]);
  // 11,100 (a pine grid length past 11,000): never LVL either, a 10,900 plate stays pine
  const grid = spec({ maxMm: 11100, unavailableMm: [] });
  assert.deepEqual([wallLongPlateOverMm(grid), longMm(grid, 10900)], [null, 0]);
  // 11,000 (off the grid, so pine stops at 10,800): a 10,900 plate is one 11,000 LVL length, and the figure says so
  const under = spec({ maxMm: 11000, unavailableMm: [] });
  assert.deepEqual([wallLongPlateOverText(under), longMm(under, 10900), longMm(under, 10800)], ["over 10.8 m", 21800, 0]);
  // Long plates' own longest lowered to the pine 6,000: no LVL either
  const low = spec({ maxMm: 6000, unavailableMm: [] }, { maxMm: 6000 });
  assert.deepEqual([wallLongPlateOverMm(low), longMm(low, 9000) > 0], [null, false]);
  // whenever a wall page names LVL plates, the figure is there (the engine used them, so the condition holds)
  assert.deepEqual(wallFramingNotes(WR(wf([wm("w", 10900, 2700, "Wall 1")], { spec: normaliseFamilySpec(under) })), "w", under), ["Plates: 90 × 45 LVL H2 (over 10.8 m)"]);
});

t("a wall page says a Walls item's parts that need setup in ONE line, the parts 'Details: n to fix' counts", () => {
  const builtIn = wf(EXAMPLE(2700), { spec: wallFramingDefaults([]) });
  assert.equal(wallPartsToFix(WR(builtIn)), 3);
  assert.equal(wallPartsNeedText(WR(builtIn)), "3 parts need setup (studs, plates and noggins).");
  assert.equal(wallPartsNeedText(WR(ex(2700))), "", "nothing to set up");
  assert.equal(wallPartsNeedText(null), "");
  // round 3: the built-in Long plates (no treatment) only once a plate uses them
  const long = wf([wm("w1", 9000, 2700, "Wall 1")]);
  assert.deepEqual([wallPartsToFix(WR(long)), wallPartsNeedText(WR(long))], [1, "1 part needs setup (long plates)."]);
});

t("a wall page names a part as the supplier reads it, each word once: '90 × 45 LVL', '90 × 45 LVL13 LVL H2-S', '90 × 35 MGP10 H2'", () => {
  assert.equal(wallPartText(wallFramingDefaults([]).components.longPlates), "90 × 45 LVL");
  assert.equal(wallPartText({ section: { depthMm: 90, widthMm: 45 }, grade: "LVL", species: "lvl", treatment: "H2" }), "90 × 45 LVL H2");
  assert.equal(wallPartText({ section: { depthMm: 90, widthMm: 45 }, grade: "LVL13", species: "LVL", treatment: "H2-S" }), "90 × 45 LVL13 LVL H2-S");
  assert.equal(wallPartText(READY().components.noggins), "90 × 35 MGP10 H2");
  assert.equal(wallPartText({ section: { depthMm: null, widthMm: null } }), "section?");
});

t("the Walls card's part writes are normaliser fixed points: a built-in row, a company product (stock too) and a typed field, each changing only its part", () => {
  const base = wallFramingDefaults([]);
  // the card edits spec.components[part] as a timber spec of the part's purpose (Long plates are plates), then drops the purpose
  const asPart = (spec, part, fn) => {
    const purpose = part === "longPlates" ? "plates" : part;
    const next = { ...fn({ ...spec.components[part], purpose }) };
    delete next.purpose;
    return { ...spec, components: { ...spec.components, [part]: next } };
  };
  const fixed = (spec) => assert.deepEqual(normaliseFamilySpec(spec), spec);
  const others = (a, b, part) => assert.deepEqual(WALL_PARTS.filter((k) => k !== part).map((k) => a.components[k]), WALL_PARTS.filter((k) => k !== part).map((k) => b.components[k]));
  // a built-in row: studs 120 × 45 MGP10 (section and grade), then the Long plates row (90 × 45 LVL)
  const row = timberPresetsFor("studs").find((x) => x.id === "studs-120x45-mgp10");
  const a = asPart(base, "studs", (p) => applyTimberPreset(p, row));
  fixed(a); others(a, base, "studs");
  assert.deepEqual(brief(a.components.studs), [120, 45, "MGP10", null, null]);
  const lvlRow = { id: "longPlates-90x45-lvl", ...WALL_LONG_PLATE_DEFAULT };
  const b = asPart(withPart(base, "longPlates", { section: { depthMm: 140, widthMm: 45 }, grade: "LVL13", productCode: "X", species: "LVL" }), "longPlates", (p) => applyTimberPreset(p, lvlRow));
  fixed(b);
  assert.deepEqual([brief(b.components.longPlates), b.components.longPlates.productCode, b.components.longPlates.species], [[90, 45, "LVL", null, 11000], null, null]);
  // a company product: wallPartFill copies its identity AND its longest length / not-stocked lengths into that part only
  const nog = product("p-nog", "noggins", { section: { depthMm: 90, widthMm: 35 }, stock: { maxMm: 5400, unavailableMm: [4800] } });
  const c = asPart(base, "noggins", (p) => wallPartFill(p, nog.spec, "noggins"));
  fixed(c); others(c, base, "noggins");
  assert.deepEqual([...brief(c.components.noggins), c.components.noggins.supplierName, c.components.noggins.stock.unavailableMm], [90, 35, "MGP10", "H2", 5400, "Yard A", [4800]]);
  assert.equal(matchTimberChoice({ ...c.components.noggins, purpose: "noggins" }, timberPresetsFor("noggins"), wallPartProducts([nog], "noggins")), "p-nog", "the list then shows the product");
  // a product with no longest length leaves the part's default (6,000 for plates), never none
  const plate = product("p-plate", "plates");
  assert.equal(asPart(base, "plates", (p) => wallPartFill(p, plate.spec, "plates")).components.plates.stock.maxMm, 6000);
  // a typed treatment and a cleared longest length
  const d = withPart(withPart(base, "plates", { treatment: "H2" }), "noggins", { stock: { ...base.components.noggins.stock, maxMm: null } });
  fixed(d);
  assert.deepEqual([d.components.plates.treatment, d.components.noggins.stock.maxMm], ["H2", null]);
  // the Long plates part lists only LVL plate products, Plates only the others
  const lvl = product("p-lvl", "plates", { grade: "LVL", treatment: "H2" });
  assert.deepEqual([wallPartProducts([plate, lvl], "plates").map((x) => x.id), wallPartProducts([plate, lvl], "longPlates").map((x) => x.id)], [["p-plate"], ["p-lvl"]]);
});

// ══ Step 6: SOP 20-08's Walls words say what the engine and the server do ═══════════════════════════════════════
const SOP_2008 = () => readRepo("docs/sops/20_takeoff/20-08_timber_takeoff.md");

t("SOP 20-08's short-noggin example names the studs the engine places: 977.5 is the first stud beside D1 (face on its edge), 932.5 the outer (second)", () => {
  const sop = SOP_2008();
  const m = sop.match(/\*\*Short noggins\*\* beside openings are counted as worked out, for example ([\d.,]+) mm between the stud at ([\d,]+) and the outer \(second\) stud beside D1 at ([\d.,]+)\./);
  assert.ok(m, "the example names the outer (second) stud beside D1");
  assert.doesNotMatch(sop, /first stud beside D1 at 932\.5/, "932.5 is the second stud, not the first");
  const [noggin, from, outer] = m.slice(1).map(mmNum);
  const c = ex(2700);
  const left = wl(c, "Wall 1").ticks.filter((x) => x.state === "side" && x.positionMm < 1000).map((x) => x.positionMm);
  nearAll(left, [1000 - 1.5 * W, 1000 - W / 2], "D1's left studs: the second (932.5), then the first (977.5, its face on the edge)");
  near(outer, left[0], "the SOP's outer stud");
  near(noggin, outer - from - W, "gap less half of each 45 mm stud");
  assert.ok(nogLengths(c, "w1").some((x) => Math.abs(x - noggin) < 1e-6), "the engine counts that noggin");
});

t("SOP 20-08 quotes the Walls refusal as the server words it, the same in Sections 8 and 11, for each kind it names", () => {
  const quotes = [...SOP_2008().matchAll(/"Walls can't use an? ([^"]+?) measurement — assign it to the right material\."/g)].map((m) => m[1]);
  assert.ok(quotes.length >= 2, `found ${JSON.stringify(quotes)}`);
  assert.deepEqual([...new Set(quotes)], ["manual / polyline / count"], "every quote names the same three kinds (an entered length, a Run, a Count)");
  const reads = methodReads(walls(wallFramingDefaults([])));
  for (const k of quotes[0].split(" / ")) assert.ok(!reads.includes(k), `Walls refuses a ${k} measurement`);
  const words = "`${cm.name} can't use a ${mm.kind} measurement — assign it to the right material.`";
  assert.ok(readRepo("server/lib/takeoff/takeoffService.mjs").includes(words), "the server's words");
  assert.ok(readRepo("src/ui-review/fixtures/takeoff.js").includes(words), "the review mock's words (mock parity)");
});

t("SOP 20-08: every 'never joined' / 'never clamped' stock line (outside the Timber card's own field) names the Walls long-plate rule the engine keeps", () => {
  const lines = SOP_2008().split("\n").filter((l) => /never (?:clamped or )?joined|never clamped/.test(l) && !/^\d+\. \*\*Stock\*\* \(fixed\)/.test(l));
  assert.ok(lines.length >= 3, `found ${lines.length}`);
  for (const l of lines) assert.match(l, /Walls/, `no Walls exception: ${l.slice(0, 100)}`);
  // what those lines say: a 9,000 Walls plate is one LVL length, and only a plate over 11,000 is joined over a stud
  assert.deepEqual(partRows(wf([wm("w", 9000, 2700, "Wall 1")], { spec: LVL_READY() }), "longPlates"), [[2, 9000]]);
  const twelve = wf([wm("w", 12000, 2700, "Wall 1")], { spec: LVL_READY() });
  assert.deepEqual([partRows(twelve, "longPlates"), partRows(twelve, "plates")], [[[2, 10800]], [[2, 1200]]]);
});

// ══ Final review fixes (25 October 2026) ══════════════════════════════════════════════════════════════════════════
const L_RUN = [wm("w1", 6000, 2700, "Wall 1"), wm("w2", 4000, 2700, "Wall 2")];
const lineOf = (c, ms) => wallFramingText(wallFramingTotals(WR(c)), "Walls", wallsNotCounted(WR(c), ms, wallCons(ms), "walls"));

t("final review: a part's longest length under 1,200 is one need naming the part, and every wall is 'not counted' (never 0.00 m of plates or 0 noggins)", () => {
  for (const [k, maxMm, label] of [["plates", 6, "Plates"], ["noggins", 1000, "Noggins"], ["studs", 6, "Studs"]]) {
    const spec = withPart(READY(), k, { stock: { maxMm, unavailableMm: [] } });
    const c = wf(L_RUN, { spec });
    const need = `${label}: the longest length must be at least 1,200 mm.`;
    assert.ok(hasMsg(c, "material_incomplete", true, need), `${k}: ${JSON.stringify(msgs(c))}`);
    assert.deepEqual(WR(c).problems.filter((p) => p.code === "material_incomplete").map((p) => p.part), [k], `${k}: the need names its part`);
    assert.equal(wallPartsToFix(WR(c)), 1, `${k}: "Details: 1 to fix"`);
    assert.ok(!msgs(c).some(([, , m]) => /Longest stock/.test(m)), `${k}: no unnamed per-wall "Longest stock" message`);
    assert.deepEqual([WR(c).layouts.length, WR(c).demands.length], [0, 0], `${k}: no wall is worked out`);
    assert.equal(lineOf(c, L_RUN), "Walls: Wall 1 and Wall 2 not counted", k);
  }
  // exactly 1,200 is a real longest length (no need); none set is a note, not a need
  assert.ok(!familyProblems(withPart(READY(), "noggins", { stock: { maxMm: 1200, unavailableMm: [] } })).length);
  assert.ok(!familyProblems(withPart(READY(), "studs", { stock: { maxMm: null, unavailableMm: [] } })).length);
  // the Long plates part's longest length is only a need once a plate uses it (never on a 6,000 wall)
  assert.ok(!familyProblems(withPart(READY(), "longPlates", { stock: { maxMm: 600, unavailableMm: [] } })).some((p) => p.part === "longPlates"));
});

t("final review: the LVL stock starts at the first 300 mm step over the plates' ACTUAL pine longest (a 4,800 plate product: a 5,000 plate buys 5,100 LVL)", () => {
  const lvl = product("p-lvl", "plates", { grade: "LVL", treatment: "H2" });
  const spec = wallFramingDefaults([product("p-stud", "studs"), product("p-plate", "plates", { stock: { maxMm: 4800, unavailableMm: [] } }), lvl,
    product("p-nog", "noggins", { section: { depthMm: 90, widthMm: 35 } })]);
  assert.equal(spec.components.plates.stock.maxMm, 4800, "the product's own longest length wins");
  const c = wf([wm("w", 5000, 2700, "Wall 1")], { spec });
  assert.deepEqual([partRows(c, "longPlates"), partRows(c, "plates")], [[[2, 5100]], []]);
  assert.equal(wallLongPlateOverText(spec), "over 4.8 m");
  // 6,000 not stocked: pine stops at 5,700, so a 5,800 plate buys 6,000 of LVL (not 6,300)
  const off = withPart(LVL_READY(), "plates", { stock: { maxMm: 6000, unavailableMm: [6000] } });
  assert.deepEqual(partRows(wf([wm("w", 5800, 2700, "Wall 1")], { spec: off }), "longPlates"), [[2, 6000]]);
  // the 6,000 default is unchanged: a 6,010 plate still buys 6,300
  assert.deepEqual(partRows(wf([wm("w", 6010, 2700, "Wall 1")], { spec: LVL_READY() }), "longPlates"), [[2, 6300]]);
  assert.deepEqual(longPlateStockLengths({ stock: { maxMm: 11000 } }, 4800).slice(0, 3), [5100, 5400, 5700]);
  assert.deepEqual(longPlateStockLengths({ stock: { maxMm: 11000 } }, 10800), [11000], "over 10,800 only the 11,000 itself");
  assert.deepEqual(longPlateStockLengths({ stock: { maxMm: 11000 } }, null)[0], 6300, "no pine longest: the 6,300 default floor");
});

t("final review: a wall on two Walls items (e.g. a wet-area Walls 2 at 450) is noted on both, so it isn't quietly counted twice", () => {
  const second = { ...walls(READY(), { centresMm: 450, doubleTopPlate: false }), id: "walls2", name: "Walls 2" };
  const ms = [wm("w1", 3000, 2700, "Wall 1"), wm("w2", 3000, 2700, "Wall 2")];
  const c = wf(ms, { extra: [second], contributions: [onW("w1"), onW("w2"), onW("w1", "walls2")] });
  const twice = (id) => c.materialResults[id].problems.filter((p) => p.code === "walls_counted_twice").map((p) => [p.blocking, p.message]);
  assert.deepEqual(twice("walls"), [[false, "Wall 1 is also on Walls 2, so its framing may be counted twice."]]);
  assert.deepEqual(twice("walls2"), [[false, "Wall 1 is also on Walls, so its framing may be counted twice."]]);
  // both are still counted (a note, not a block): 6 studs at 600 and 8 at 450 on the shared wall
  assert.deepEqual([wl(c, "Wall 1").totals.studs, c.materialResults.walls2.layouts[0].totals.studs], [6, 8]);
  // a Walls item never notes itself, and a wall on one Walls item gets no note
  assert.ok(!msgs(wf(ms)).some(([code]) => code === "walls_counted_twice"));
});

t("final review: cut-list labels follow the stations along the wall (@ 0, 600, 932.5 … 6,000), the thousands separator no longer breaking the order", () => {
  const studLabels = cutList(ex(2700), "Studs cut list").rows.flatMap((r) => r.labels);
  const wall1 = studLabels.filter((x) => x.startsWith("Wall 1 "));
  const along = (x) => Number(x.match(/@ ([\d,.]+)/)[1].replace(/,/g, ""));
  assert.deepEqual(wall1.map(along), WALL1_AT, wall1.join(" | "));
  assert.equal(wall1[2], "Wall 1 stud @ 932.5 (beside D1)");
  assert.deepEqual(studLabels.filter((x) => x.startsWith("Wall 2 ")).map(along), WALL2_AT);
  assert.ok(studLabels.indexOf(wall1.at(-1)) < studLabels.findIndex((x) => x.startsWith("Wall 2 ")), "Wall 1, then Wall 2");
});

console.log(`takeoff-tc-hub028: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
