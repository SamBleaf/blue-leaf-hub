// Short plates cut from full 6.0 m sticks (Sam, 18 Nov 2026): "plates that are under 3 metres long get tallied up and then divided by
// 6 metres so we can ensure that we get all of the short plate lengths out of just full 6 metre sticks, with some waste."
// Plan: docs/takeoff/SHORT_PLATES_6M_PLAN.md. Run: node scripts/tests/takeoff-tc-short-plates.test.mjs
//
// Every top and bottom plate piece under 3,000 mm (after the join rule) is pooled across the whole Walls item (per plate product) and
// packed into 6,000 mm sticks by the shared allocator (first-fit-decreasing + branch-and-bound), 5 mm saw cut per cut. Plates of 3,000 mm
// and over keep their own stock lengths. A product whose longest available length is under 6,000 uses that length. Spare sticks % (0 by default).
// Hand-worked figures (a wall gives a bottom AND a top plate of its own length, so each wall length below is TWO pieces):
//   walls 2950, 2400, 1800, 1200, 900, 600  →  12 pieces, 19,700 mm of plate + 12 × 5 = 60 mm of saw cuts = 19,760 mm
//   ceil(19,760 / 6,000) = 4 sticks (lower bound; 4 sticks hold 24,000), so 24,000 − 19,700 − 60 = 4,240 mm of offcut, however the cuts are dealt
//   2,995 × 2 + 2 × 5 = 6,000 exactly (one stick, no offcut); 2,996 × 2 + 10 = 6,002 (two sticks)
import assert from "node:assert/strict";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  CALCULATION_VERSION, WALL_FRAMING_RULES, buildSupplierGroups, computeWorkspace as computeWorkspaceRaw, methodFor, normaliseFamilySpec, wallFramingDefaults,
} from "../../shared/takeoff/index.js";
import { SHORT_PLATE_BELOW_MM, SHORT_PLATE_KERF_MM, SHORT_PLATE_STICK_MM, isShortPlate, shortPlateSparePct, shortPlateStickMm } from "../../shared/takeoff/engine/dispatch.js";
import { timberStockPolicy } from "../../shared/takeoff/engine/timber.js";
import { buildExportSnapshot } from "../../server/lib/takeoff/takeoffService.mjs";
import { RENDERER_VERSION, renderSiteAppendixPdf } from "../../server/lib/takeoff/takeoffPdf.mjs";
import { wallFramingText, wallFramingTotals } from "../../src/components/takeoff/measure/tools.js";

// hoop iron is on by default for every wall; this suite is about plates, so its line is left out
const computeWorkspace = (w) => { const c = computeWorkspaceRaw(w); return { ...c, scheduleLines: c.scheduleLines.filter((l) => !l.hoop) }; };
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 4).join("\n    ")}`); } }

const product = (id, purpose, over = {}) => ({ id, name: id, isActive: true, methodKey: "linear_stock", methodVersion: 1, rules: {},
  spec: { family: "timber", purpose, section: { depthMm: 90, widthMm: 45 }, grade: "MGP15", treatment: "H2", species: null, supplierName: "Yard A", productCode: null, stock: { maxMm: null, unavailableMm: [] }, ...over } });
// pine plates (MGP15: any grade but MGP10, so the owner 300 mm grid), no longest length set
const READY = (platesOver = {}) => wallFramingDefaults([product("p-stud", "studs"), product("p-plate", "plates", platesOver), product("p-nog", "noggins", { section: { depthMm: 90, widthMm: 35 } })]);
const wm = (id, widthMm, heightMm, name) => ({ id, kind: "wall", inputs: { kind: "rect", widthMm, heightMm, name } });
const item = (id, spec, rules = {}) => ({ id, name: id, methodKey: "wall_framing", methodVersion: 1, spec, rules: { ...WALL_FRAMING_RULES, ...rules, openingFraming: false } });
/** Walls items through the real computeWorkspace; `ms` = [[wallId, lengthMm]] all on the one item unless `on` says otherwise. */
function run(lengths, { spec = READY(), rules = {}, items = null, on = null } = {}) {
  const measurements = lengths.map(([id, mm]) => wm(id, mm, 2400, id));
  const materials = items || [item("walls", spec, rules)];
  const contributions = measurements.map((m) => ({ id: `c-${m.id}`, measurementId: m.id, jobMaterialId: on ? on[m.id] : materials[0].id, role: "wall" }));
  const ws = { workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [], materials, measurements, contributions };
  return { ws, c: computeWorkspace(ws) };
}
const plateLines = (c, id = "walls") => c.scheduleLines.filter((l) => l.jobMaterialIds.includes(id) && l.component === "plates");
const pooledLine = (c, id = "walls") => plateLines(c, id).find((l) => l.shortPlates);
const ownLines = (c, id = "walls") => plateLines(c, id).filter((l) => !l.shortPlates).map((l) => [l.quantity, l.finishedLengthMm]).sort((a, b) => a[1] - b[1]);
const sticksOf = (c, id = "walls") => (c.materialResults[id].appendix.timber.find((x) => x.title === "Short plates cut list (pooled into full sticks)") || {}).sticks || [];
const WORKED = [["a", 2950], ["b", 2400], ["c", 1800], ["d", 1200], ["e", 900], ["f", 600]];
const PIECES = WORKED.flatMap(([, mm]) => [mm, mm]).sort((a, b) => b - a);

await t("constants: under 3,000 mm, 6,000 mm sticks, 5 mm saw cut; the calculation is stamped takeoff-calc@9", () => {
  assert.deepEqual([SHORT_PLATE_BELOW_MM, SHORT_PLATE_STICK_MM, SHORT_PLATE_KERF_MM], [3000, 6000, 5]);
  assert.match(CALCULATION_VERSION, /^takeoff-calc@9$/);
});

await t("worked example: 12 short plates (2,950 ×2, 2,400 ×2, 1,800 ×2, 1,200 ×2, 900 ×2, 600 ×2) come out of 4 full 6,000 sticks, nothing else bought", () => {
  const { c } = run(WORKED);
  const pl = pooledLine(c);
  assert.deepEqual([pl.quantity, pl.finishedLengthMm, pl.unit], [4, 6000, "piece"]);
  assert.deepEqual(ownLines(c), [], "no plate is bought as its own length");
  const sticks = sticksOf(c);
  assert.equal(sticks.length, 4);
  // every piece appears once, and every stick adds up: cuts + 5 mm per cut + offcut = 6,000
  assert.deepEqual(sticks.flatMap((s) => s.cuts.map((x) => x.lengthMm)).sort((a, b) => b - a), PIECES);
  for (const s of sticks) {
    assert.equal(s.stockMm, 6000);
    assert.equal(s.cuts.reduce((a, x) => a + x.lengthMm, 0) + s.cuts.length * 5 + s.offcutMm, 6000, `stick ${s.n}`);
    assert.equal(s.kerfLossMm, s.cuts.length * 5);
    assert.ok(s.offcutMm >= 0);
  }
  assert.equal(sticks.reduce((a, s) => a + s.offcutMm, 0), 4240, "24,000 − 19,700 − 12 × 5");
  assert.deepEqual(pl.shortPlatePool, { pieces: 12, sticks: 4, stickMm: 6000, offcutMm: 4240, kerfMm: 5 });
  assert.match(pl.item.note, /12 short plates \(under 3,000 mm\) pooled across the walls and cut from 4 × 6,000 mm sticks, 5 mm saw cut each, 4,240 mm of offcut left/);
  assert.match(pl.item.description, /6,000 mm length \(short plates, pooled\)$/);
});

await t("worked example: the stick plan is deterministic; two walls' cuts mix in one stick (a cut list names each cut's own wall)", () => {
  const a = sticksOf(run(WORKED).c), b = sticksOf(run([...WORKED].reverse()).c);
  assert.equal(a.length, b.length);
  assert.deepEqual(a.map((s) => s.cuts.map((x) => x.lengthMm)), b.map((s) => s.cuts.map((x) => x.lengthMm)), "same sticks whatever order the walls were traced");
  const labels = a.flatMap((s) => s.cuts.map((x) => x.label));
  assert.ok(labels.includes("a bottom plate 0–2,950") && labels.includes("f top plate 0–600"), JSON.stringify(labels.slice(0, 3)));
  assert.ok(a.some((s) => new Set(s.cuts.map((x) => x.label.split(" ")[0])).size > 1), "one stick holds plates from different walls");
});

await t("exactly 3,000 stays out of the pool (its own 3,000 length); 2,999 goes in", () => {
  const { c } = run([["w", 3000]]);
  assert.equal(pooledLine(c), undefined);
  assert.deepEqual(ownLines(c), [[2, 3000]], "bottom + top plate each their own 3,000");
  const two = run([["w", 3000], ["x", 2999]]).c;
  assert.deepEqual(ownLines(two), [[2, 3000]]);
  assert.deepEqual([pooledLine(two).quantity, pooledLine(two).finishedLengthMm], [2, 6000], "the wall's two 2,999 plates: 5,998 + 10 saw cuts = 6,008 does not fit one stick");
});

await t("the 5 mm saw cut at the edge: 2 × 2,995 + 2 × 5 = 6,000 fits one stick exactly (no offcut); 2 × 2,996 + 10 = 6,002 needs two", () => {
  const fit = run([["w", 2995]]).c;
  assert.deepEqual([pooledLine(fit).quantity, sticksOf(fit)[0].offcutMm, sticksOf(fit)[0].cuts.length], [1, 0, 2]);
  const over = run([["w", 2996]]).c;
  assert.equal(pooledLine(over).quantity, 2);
  assert.deepEqual(sticksOf(over).map((s) => s.cuts.length), [1, 1]);
  assert.deepEqual(sticksOf(over).map((s) => s.offcutMm), [6000 - 2996 - 5, 6000 - 2996 - 5]);
  const two = run([["w", 2999]]).c;
  assert.equal(pooledLine(two).quantity, 2, "2 × 2,999 + 10 = 6,008 does not fit one stick");
});

await t("plates of 3,000 and over keep today's behaviour: their own stock lengths, ordered apart from the pooled sticks", () => {
  const { c } = run([["a", 3600], ["b", 4500], ["c", 2400], ["d", 2400]]);
  assert.deepEqual(ownLines(c), [[2, 3600], [2, 4500]]);
  assert.deepEqual([pooledLine(c).quantity, pooledLine(c).shortPlatePool.pieces], [2, 4], "4 × 2,400 + 20 = 9,620 → 2 sticks");
});

await t("a plate over the plates' longest length is joined over a stud first, and only the pieces then under 3,000 are pooled", () => {
  // 12,000 wall: joined over the stud at 10,800 → 10,800 (LVL long plate, own line) + 1,200 per layer; the two 1,200 pieces are pooled
  const { c } = run([["w", 12000]]);
  assert.deepEqual(c.scheduleLines.filter((l) => l.component === "longPlates").map((l) => [l.quantity, l.finishedLengthMm]), [[2, 10800]]);
  assert.deepEqual(ownLines(c), []);
  assert.deepEqual([pooledLine(c).quantity, pooledLine(c).shortPlatePool.pieces], [1, 2]);
});

await t("a product whose longest length is 5,400 cuts its short plates from 5,400 sticks, and says so", () => {
  const { c } = run([["w", 2700]], { spec: READY({ stock: { maxMm: 5400, unavailableMm: [] } }) });
  const pl = pooledLine(c);
  assert.equal(pl.finishedLengthMm, 5400);
  assert.equal(pl.quantity, 2, "2 × 2,700 + 10 = 5,410 does not fit a 5,400 stick (it would fit a 6,000)");
  assert.match(pl.item.note, /5,400 mm is this product's longest available length \(under 6,000 mm\)/);
  const six = run([["w", 2700]]).c;
  assert.equal(pooledLine(six).quantity, 1, "the same walls on a 6,000 product need one stick");
  assert.doesNotMatch(pooledLine(six).item.note, /longest available/);
});

await t("shortPlateStickMm: 6,000; the longest available under 6,000 (longest length, or 6,000 marked not stocked); none for a product with no length", () => {
  const grid = (o) => timberStockPolicy({ grade: "MGP15", ...o });
  assert.equal(shortPlateStickMm(grid({})), 6000, "no longest set: 6,000");
  assert.equal(shortPlateStickMm(grid({ maxMm: 12000 })), 6000);
  assert.equal(shortPlateStickMm(grid({ maxMm: 6000 })), 6000);
  assert.equal(shortPlateStickMm(grid({ maxMm: 5400 })), 5400);
  assert.equal(shortPlateStickMm(grid({ maxMm: 4800 })), 4800);
  assert.equal(shortPlateStickMm(grid({ maxMm: 6000, unavailableMm: [6000] })), 5700, "6,000 not stocked → the next length down");
  assert.equal(shortPlateStickMm(timberStockPolicy({ grade: "MGP10", maxMm: 6000 })), 6000);
  assert.equal(shortPlateStickMm(timberStockPolicy({ grade: "MGP10", maxMm: 5400 })), 5400);
  assert.equal(shortPlateStickMm(timberStockPolicy({ grade: "MGP10", maxMm: 5700 })), 5400, "MGP10 steps 600 above 3,000: 5,700 is not orderable, so the longest is 5,400");
});

await t("isShortPlate: only top and bottom plates of a Walls item under 3,000; never trimmers, studs, noggins, long plates or a plate of 3,000", () => {
  const d = (over) => ({ kind: "linear", role: "bottom-plate", lengthMm: 2400, identity: { component: "plates" }, stockPolicy: { kind: "grid" }, ...over });
  assert.equal(isShortPlate(d({})), true);
  assert.equal(isShortPlate(d({ role: "top-plate" })), true);
  assert.equal(isShortPlate(d({ role: "top-2-plate" })), true, "a second top plate is a top plate");
  assert.equal(isShortPlate(d({ lengthMm: 2999.9 })), true);
  assert.equal(isShortPlate(d({ lengthMm: 3000 })), false);
  assert.equal(isShortPlate(d({ role: "head trimmer" })), false);
  assert.equal(isShortPlate(d({ role: "sill trimmer" })), false);
  assert.equal(isShortPlate(d({ role: "stud", identity: { component: "studs" } })), false);
  assert.equal(isShortPlate(d({ identity: { component: "noggins" }, role: "noggin" })), false);
  assert.equal(isShortPlate(d({ identity: { component: "longPlates" } })), false);
  assert.equal(isShortPlate(d({ identity: {} })), false, "a plate on a plain timber item (no Walls part) is untouched");
});

await t("pools are per plate product: two Walls items with different plate sections each get their own sticks and line", () => {
  const specA = READY(), specB = READY({ section: { depthMm: 140, widthMm: 45 } });
  const items = [item("walls", specA), item("walls2", specB)];
  const { c } = run([["a", 2400], ["b", 2400]], { items, on: { a: "walls", b: "walls2" } });
  for (const id of ["walls", "walls2"]) assert.deepEqual([pooledLine(c, id).quantity, pooledLine(c, id).shortPlatePool.pieces], [1, 2], id);
  assert.notEqual(pooledLine(c, "walls").product.section, pooledLine(c, "walls2").product.section);
  // the same two walls on ONE item share a single pool: 4 × 2,400 + 20 = 9,620 → 2 sticks, not 2 × 1
  const one = run([["a", 2400], ["b", 2400]]).c;
  assert.deepEqual([pooledLine(one).quantity, pooledLine(one).shortPlatePool.pieces], [2, 4]);
});

await t("MGP10 (the default Walls plates): pooled into 6,000 sticks as well; noggins and studs are untouched", () => {
  const spec = wallFramingDefaults([]);
  const mk = methodFor(spec);
  const mats = [{ id: "walls", name: "Walls", methodKey: mk.key, methodVersion: mk.version, spec, rules: { ...WALL_FRAMING_RULES, carriesRoof: true } }];
  const { c } = run([["a", 2400], ["b", 2400]], { items: mats });
  assert.deepEqual([pooledLine(c).quantity, pooledLine(c).finishedLengthMm], [2, 6000]);
  const before = run([["a", 2400], ["b", 2400]], { items: mats }).c.scheduleLines.filter((l) => l.component !== "plates").map((l) => [l.component, l.quantity, l.finishedLengthMm]);
  assert.ok(before.length >= 2 && before.every(([k]) => k === "studs" || k === "noggins"), JSON.stringify(before));
  assert.ok(c.scheduleLines.filter((l) => l.component !== "plates").every((l) => !l.shortPlates && !/pooled/.test(l.item.description)));
});

await t("spare sticks %: 0 by default (nothing added); 25% of 4 sticks = 1 spare; 10% of 4 rounds up to 1; 100% doubles; junk is 0", () => {
  const sticks = (rules) => { const l = pooledLine(run(WORKED, { rules }).c); return [l.quantity, l.spareQuantity ?? 0]; };
  assert.deepEqual(sticks({}), [4, 0]);
  assert.deepEqual(sticks({ shortPlateSparePct: 0 }), [4, 0]);
  assert.deepEqual(sticks({ shortPlateSparePct: 25 }), [5, 1]);
  assert.deepEqual(sticks({ shortPlateSparePct: 10 }), [5, 1]);
  assert.deepEqual(sticks({ shortPlateSparePct: 50 }), [6, 2]);
  assert.deepEqual(sticks({ shortPlateSparePct: 100 }), [8, 4]);
  assert.deepEqual(sticks({ shortPlateSparePct: 250 }), [8, 4], "capped at 100%");
  assert.deepEqual(sticks({ shortPlateSparePct: -5 }), [4, 0]);
  assert.deepEqual(sticks({ shortPlateSparePct: "abc" }), [4, 0]);
  assert.equal(shortPlateSparePct({ shortPlateSparePct: "12.5" }), 12.5);
  assert.equal(shortPlateSparePct(undefined), 0);
  const l = pooledLine(run(WORKED, { rules: { shortPlateSparePct: 25 } }).c);
  assert.match(l.item.note, /\+ 1 spare stick \(25%\)/);
  assert.equal(l.shortPlatePool.sticks, 4, "the cut list still holds the 4 calculated sticks");
  assert.equal(sticksOf(run(WORKED, { rules: { shortPlateSparePct: 25 } }).c).length, 4);
});

await t("supplier order: the pooled sticks read as ONE count at 6.0 under T&B PLATES with the plates bought at 6.0 (e.g. 4/6)", () => {
  const { ws, c } = run([...WORKED, ["g", 6000]]);
  const lines = c.scheduleLines.map((l) => ({ bucketKey: l.bucketKey, specKey: l.specKey, jobMaterialId: l.jobMaterialIds[0], finishedLengthMm: l.finishedLengthMm, quantity: l.quantity, unit: l.unit, item: l.item }));
  const { snapshot } = buildExportSnapshot({ wsSnapshot: ws, order: { id: "o", orderRef: "TO-SP", revision: 1, category: "timber_cladding", delivery: { method: "pickup", pickupBranch: "Wingfield", asap: true, contactPhone: "0400" } },
    lines, supplier: { id: "s", name: "Yard (sample)" }, company: { name: "Blue Leaf Building" }, jobLabel: "x", rendererVersion: RENDERER_VERSION });
  assert.ok(snapshot.items.length >= 1 && c.scheduleLines.some((l) => l.item.description.includes("short plates, pooled")), "the order line says so");
  const items = [{ lines: c.scheduleLines.filter((l) => l.component === "plates").map((l) => ({ ...l, stockLengthMm: l.finishedLengthMm })) }];
  const tb = buildSupplierGroups(items)[0];
  assert.equal(tb.heading, "T&B PLATES");
  assert.equal(tb.rows.length, 1);
  assert.equal(tb.rows[0].cutText, "6/6", "4 pooled sticks + the 2 plates of the 6,000 wall (each wall has a top and a bottom plate)");
  assert.equal(tb.rows[0].totalLm, 36);
});

await t("site appendix PDF: a stick-by-stick list (which cuts come from each stick, the offcut left) under the short plates cut list", async () => {
  const { ws, c } = run(WORKED);
  const lines = c.scheduleLines.map((l) => ({ bucketKey: l.bucketKey, specKey: l.specKey, jobMaterialId: l.jobMaterialIds[0], finishedLengthMm: l.finishedLengthMm, quantity: l.quantity, unit: l.unit, item: l.item }));
  const { snapshot } = buildExportSnapshot({ wsSnapshot: ws, order: { id: "o", orderRef: "TO-SP", revision: 1, category: "timber_cladding", delivery: { method: "pickup", pickupBranch: "Wingfield", asap: true, contactPhone: "0400" } },
    lines, supplier: { id: "s", name: "Yard (sample)" }, company: { name: "Blue Leaf Building" }, jobLabel: "x", rendererVersion: RENDERER_VERSION });
  const tb = snapshot.appendix.timber.find((x) => /Short plates cut list/.test(x.title));
  assert.equal(tb.sticks.length, 4, "the frozen snapshot carries the sticks");
  const pdf = await renderSiteAppendixPdf(snapshot, { exportNo: 1, isDraft: true, snapshotSha256: "x" });
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), isEvalSupported: false, verbosity: 0 }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) text += ` ${(await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(" ")}`;
  await doc.destroy();
  assert.ok(text.includes("Short plates cut list"), "titled");
  for (let i = 1; i <= 4; i++) assert.ok(text.includes(`Stick ${i} (6,000 mm)`), `stick ${i}`);
  assert.ok(/offcut [\d,]+ mm, saw cuts [\d,]+ mm/.test(text), "offcut and saw cuts per stick");
});

await t("Walls line: names the short plates and their sticks ('12 short plates from 4 × 6.0 m sticks'); nothing when there are none", () => {
  const { c } = run(WORKED);
  const totals = wallFramingTotals(c.materialResults.walls);
  assert.deepEqual(totals.shortPlates, { pieces: 12, sticks: 4, stickMm: 6000, spare: 0 });
  assert.match(wallFramingText(totals, "Walls"), /top plate 9\.85 m · 12 short plates from 4 × 6\.0 m sticks · /);
  assert.ok(!("shortPlates" in wallFramingTotals(run([["w", 5000]]).c.materialResults.walls)));
  assert.doesNotMatch(wallFramingText(wallFramingTotals(run([["w", 5000]]).c.materialResults.walls), "Walls"), /short plate/);
  assert.equal(wallFramingTotals(c.materialResults.walls, "a").shortPlates, undefined, "the per-wall line is the wall's own framing; the pool is the item's");
});

await t("the double top plate's second layer is pooled too (4 plates per wall)", () => {
  const { c } = run([["w", 2000]], { rules: { doubleTopPlate: true } });
  assert.deepEqual([pooledLine(c).shortPlatePool.pieces, pooledLine(c).quantity], [3, 2], "3 × 2,000 + 15 = 6,015 does not fit one stick");
});

await t("a short plate that cannot fit a product's longest stock with its kerf stays on its own line (no blocking error)", () => {
  for (const [w, max] of [[2999, 3000], [2998, 3000], [2700, 2700]]) {
    const { c } = run([["w", w]], { spec: READY({ stock: { maxMm: max, unavailableMm: [] } }) });
    assert.equal(pooledLine(c), undefined, `${w}/${max} is not pooled`);
    assert.deepEqual(ownLines(c), [[2, max]], `${w}/${max} keeps its own stock line`);
    assert.equal((c.materialResults.walls.problems || []).filter((p) => p.blocking).length, 0, `${w}/${max} has no blocking problem`);
  }
  const { c } = run([["w", 2995]], { spec: READY({ stock: { maxMm: 3000, unavailableMm: [] } }) });
  assert.ok(pooledLine(c), "2995 in 3000 stock still pools");
});

await t("the pooled line names every plate role it holds, and the Walls line shows the spare sticks", () => {
  const { c } = run([["w", 2900]], { rules: { shortPlateSparePct: 50 } });
  assert.deepEqual(Object.keys(pooledLine(c).roles).sort(), ["bottom-plate", "top-plate"]);
  assert.match(wallFramingText(wallFramingTotals(c.materialResults.walls), "Walls"), /from 1 × 6\.0 m stick \+ 1 spare/);
});

console.log(`takeoff-tc-short-plates: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
