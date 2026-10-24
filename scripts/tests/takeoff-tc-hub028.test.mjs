// Hub review HUB 028 — Walls (trace once, studs + plates + noggins together). Plan: docs/hub_review/WALLS_FRAMING_PLAN.md
// ("Sam's decisions (25 October 2026)" override its defaults).
// Step 1, engine options in shared/takeoff/engine/timber.js, each OFF unless asked for: identity `component`, stud-wall
// side studs + merge and opening clipping, plate gaps + Sam's join over a stud (splitPlateAtStuds), noggin owner-rule
// rows (wallNogginRows: 1 row at 2,700 or under, 2 over) and closed bays. The per-wall figures below are the round 1
// worked example (1 stud each side, door gaps, the 600 mm grid) proven through the real engine and allocator. Sam's
// round 2 (2 studs each side, bottom plate full length, 300 mm steps) comes in steps 2 and 3, which update them.
//   node scripts/tests/takeoff-tc-hub028.test.mjs
import assert from "node:assert/strict";
import {
  NOGGIN_ROW_RULES, NOGGIN_TWO_ROWS_OVER_MM, computeNoggins, computePlates, computeStudWall, repeatedPositions, splitPlateAtStuds,
  timberIdentity, wallNogginRows,
} from "../../shared/takeoff/engine/timber.js";
import { allocateLinear } from "../../shared/takeoff/engine/allocator.js";
import { identityKey } from "../../shared/takeoff/engine/contract.js";
import { TakeoffValidationError } from "../../shared/takeoff/units.js";

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
const doorGaps = (...ds) => ds.map((d) => ({ id: d.id, fromMm: d.xLeftMm, toMm: d.xRightMm }));
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

t("run total: 17 studs, each bought as a 3,000 length (one length per stud)", () => {
  const all = [...wall1.demands, ...wall2.demands];
  assert.equal(all.length, 17);
  assert.deepEqual(bought(all), Array(17).fill(3000));
});

t("plates: doors cut the bottom plate, the window doesn't, top plates run on (1 × 1,200, 3 × 4,200, 1 × 6,000)", () => {
  const p1 = plates(6000, [{ tag: "bottom", gapsMm: doorGaps(D1) }, { tag: "top" }], { wallId: "w1" });
  const p2 = plates(4000, [{ tag: "bottom", gapsMm: [] }, { tag: "top" }], { wallId: "w2" });
  assert.deepEqual(p1.layout.layers.map((l) => [l.tag, l.piecesMm]), [["bottom", [1000, 4180]], ["top", [6000]]]);
  assert.deepEqual(p2.layout.layers.map((l) => [l.tag, l.piecesMm]), [["bottom", [4000]], ["top", [4000]]]);
  assert.deepEqual(p1.layout.layers[0].gapsMm, [{ id: "D1", fromMm: 1000, toMm: 1820 }]);
  assert.deepEqual(p1.demands.map((d) => d.label), ["Bottom plate 0–1,000", "Bottom plate 1,820–6,000", "Top plate 0–6,000"]);
  const bottom = [p1, p2].flatMap((p) => p.layout.layers.filter((l) => l.tag === "bottom").flatMap((l) => l.piecesMm));
  const top = [p1, p2].flatMap((p) => p.layout.layers.filter((l) => l.tag === "top").flatMap((l) => l.piecesMm));
  assert.equal(sum(bottom), 9180);
  assert.equal(sum(top), 10000);
  assert.deepEqual(bought([...p1.demands, ...p2.demands]), [1200, 4200, 4200, 4200, 6000]);
  assert.ok(p1.explain.some((e) => e === "Bottom plate: 6,000 mm less D1 1,000–1,820 → 1,000 + 4,180 mm"), p1.explain.join("\n"));
  assert.ok(p1.explain.includes("Top plate: one continuous 6,000 mm piece (no joints selected from the framing detail)"));
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
  // a 6,000 longest length shares lengths across the walls: 6,000 + 1,200 = 7,200 (the least possible)
  assert.deepEqual(bought([...noggins(wall1, [D1], 2700).demands, ...noggins(wall2, [W1], 2700).demands]), [1200, 6000]);
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
  assert.deepEqual(bought([...noggins(s1, [D1], 3000).demands, ...noggins(s2, [W1], 3000).demands]), [1800, 6000, 6000]);
  const layers = (doubleTop, gaps) => [{ tag: "bottom", gapsMm: gaps }, { tag: "top" }, ...(doubleTop ? [{ tag: "top-2" }] : [])];
  const off = [plates(6000, layers(false, doorGaps(D1)), { wallId: "w1" }), plates(4000, layers(false, []), { wallId: "w2" })];
  const on = [plates(6000, layers(true, doorGaps(D1)), { wallId: "w1" }), plates(4000, layers(true, []), { wallId: "w2" })];
  assert.deepEqual(bought(on.flatMap((p) => p.demands)), [1200, 4200, 4200, 4200, 4200, 6000, 6000]);
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
t("a door at xMm 0 merges its side stud with the end stud and leaves no 0 mm bottom plate piece", () => {
  const D = { id: "D2", xLeftMm: 0, xRightMm: 820, sillMm: 0, headMm: 2040 };
  const r = studs(6000, [D]);
  nearAll(at(r), [0, 842.5, 1200, 1800, 2400, 3000, 3600, 4200, 4800, 5400, 6000]);
  const end = r.layout.ticks.find((x) => x.positionMm === 0);
  assert.deepEqual([end.state, end.mergedMm, end.besideOpeningIds], ["full", [0], ["D2"]]);
  assert.equal(r.demands[0].label, "Stud @ 0 (beside D2)");
  assert.ok(at(r).every((x) => x >= 0 && x <= 6000), "never outside the wall");
  const p = plates(6000, [{ tag: "bottom", gapsMm: doorGaps(D) }]);
  assert.deepEqual(p.layout.layers[0].piecesMm, [5180]);
  assert.deepEqual(p.problems, []);
});

t("a door at the far wall end: its outer side stud is the end stud", () => {
  const D = { id: "D3", xLeftMm: 5180, xRightMm: 6000, sillMm: 0, headMm: 2040 };
  const r = studs(6000, [D]);
  nearAll(at(r), [0, 600, 1200, 1800, 2400, 3000, 3600, 4200, 4800, 5157.5, 6000]);
  assert.deepEqual(r.layout.ticks.find((x) => x.positionMm === 6000).mergedMm, [6000]);
  assert.deepEqual(plates(6000, [{ tag: "bottom", gapsMm: doorGaps(D) }]).layout.layers[0].piecesMm, [5180]);
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

// ── bottom plate gaps ────────────────────────────────────────────────────────
t("bottom plate: two doors give 3 pieces; a full-width door gives no plate and no error; the top plate is one piece", () => {
  const Da = { id: "Da", xLeftMm: 1000, xRightMm: 1820 };
  const Db = { id: "Db", xLeftMm: 3000, xRightMm: 3820 };
  const p = plates(6000, [{ tag: "bottom", gapsMm: doorGaps(Da, Db) }, { tag: "top" }]);
  assert.deepEqual(p.layout.layers.map((l) => l.piecesMm), [[1000, 1180, 2180], [6000]]);
  const full = plates(820, [{ tag: "bottom", gapsMm: [{ id: "D", fromMm: 0, toMm: 820 }] }, { tag: "top" }]);
  assert.deepEqual(full.layout.layers.map((l) => l.piecesMm), [[], [820]]);
  assert.deepEqual(full.problems, []);
  assert.equal(full.status.quantity, "calculated");
  assert.ok(full.explain.includes("Bottom plate: 820 mm less D 0–820 → no plate"));
  assert.deepEqual(codes(plates(6000, [{ tag: "bottom", gapsMm: [{ id: "X", fromMm: 5000, toMm: 6500 }] }])), ["invalid_input"]);
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
  const p = plates(12000, [{ tag: "bottom", gapsMm: doorGaps(D) }, { tag: "top" }],
    { joinOverStuds: { studCentresMm: at(s), wallLabel: "Wall 1" } });
  assert.deepEqual(codes(p), []);
  assert.deepEqual(p.layout.layers.map((l) => [l.tag, l.piecesMm, l.joinsOverStudsMm]), [["bottom", [1000, 5980, 4200], [7800]], ["top", [6000, 6000], [6000]]]);
  assert.ok(p.explain.includes("Top plate: 12,000 mm joined over the stud at 6,000 mm (longest length 6,000 mm) → 6,000 + 6,000 mm"), p.explain.join("\n"));
  assert.ok(p.explain.includes("Bottom plate: 12,000 mm less D1 1,000–1,820; joined over the stud at 7,800 mm (longest length 6,000 mm) → 1,000 + 5,980 + 4,200 mm"));
  assert.deepEqual(bought(p.demands), [1200, 4200, 6000, 6000, 6000]);
  // a top plate over a window wider than the longest length: the problem names the stretch with no stud and a remedy that works
  const W9 = { id: "W9", xLeftMm: 1500, xRightMm: 7500, sillMm: 900, headMm: 2100 };
  const wideStuds = { joinOverStuds: { studCentresMm: at(studs(9000, [W9])), wallLabel: "Wall 1" } };
  const wide = plates(9000, [{ tag: "top" }], wideStuds);
  assert.deepEqual(wide.problems.map((x) => x.message), ["Wall 1: the top plate has no stud to join over from 1,477.5 to 7,522.5 mm. That is 6,045 mm, longer than the 6,000 mm longest length. Set a longer longest length for the plates."]);
  // every layer runs under or over the window, so the wall has one problem, naming the first layer that can't join
  const all = plates(9000, [{ tag: "bottom", gapsMm: [] }, { tag: "top" }, { tag: "top-2" }], wideStuds);
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

console.log(`takeoff-tc-hub028: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
