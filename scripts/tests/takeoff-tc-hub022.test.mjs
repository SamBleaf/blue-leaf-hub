// Hub review follow-up HUB 022 (Sam, 20 Oct 2026: "share offcuts across walls") — one cut plan for every wall of a
// fibre-cement material: one wall's spare slices and ripped-strip offcuts serve pieces on another wall. Same rules as
// HUB 016 (long factory edges kept, nothing turned over, 5 mm per cut, an offcut only for a piece needing its edge).
// Drives the REAL engine through computeWorkspace (dispatch → sheetLayout → shareSheetsAcrossWalls → purchase lines).
import assert from "node:assert/strict";
import { computeWorkspace } from "../../shared/takeoff/index.js";
import { productGroups, specFromGroup } from "../../shared/takeoff/products/index.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } }
const g = productGroups({ family: "cladding" }).find((x) => x.name === "Axon 400 smooth");
const spec = { ...specFromGroup(g), assemblyId: "axon-vertical", spareRate: 0 };
const JOINT = { atMm: [], gapMm: 10, detailRef: "H-flashing" };
function ws(walls, rules = {}) {
  return { workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [],
    materials: [{ id: "clad", name: "Axon", methodKey: "sheet_layout", methodVersion: 2, spec, rules: { route: "cavity", jointRows: JOINT, ...rules } }],
    measurements: walls.map(([id, w, h, name]) => ({ id, kind: "wall", inputs: { kind: "rect", widthMm: w, heightMm: h, name } })),
    contributions: walls.map(([id]) => ({ id: `c-${id}`, measurementId: id, jobMaterialId: "clad", role: "wall" })) };
}
const run = (walls, rules) => computeWorkspace(ws(walls, rules));
const ordered = (c) => c.scheduleLines.filter((l) => l.unit === "sheet").reduce((n, l) => n + l.quantity, 0);
const layouts = (c) => c.materialResults.clad.layouts;
const TWO_TALL = [["a", 6573, 3600, "North"], ["b", 6573, 3600, "South"]];
// North starts with a 400 mm part strip (keeps its RIGHT edge → the rip keeps the LEFT edge); South ends with a 400 mm
// strip that needs its LEFT edge — exactly the edge North's offcut has
const RIP = [["a", 2800, 2400, "North"], ["b", 2800, 2400, "South"]];
const RIP_RULES = { datumByWall: { a: 400 } };

t("two recorded 6,573 × 3,600 walls: 16 sheets planned wall by wall → 15 shared (the upper slices pack across walls); off = 16", () => {
  assert.equal(ordered(run(TWO_TALL)), 15);
  assert.equal(ordered(run(TWO_TALL, { shareSheetsAcrossWalls: false })), 16);
  assert.equal(ordered(run([TWO_TALL[0]])), 8, "one wall on its own is unchanged (HUB 016)");
});

t("a ripped strip's offcut on one wall serves a piece on another wall that needs that factory edge: 6 → 5 sheets", () => {
  const c = run(RIP, RIP_RULES);
  assert.equal(ordered(c), 5);
  assert.equal(ordered(run(RIP, { ...RIP_RULES, shareSheetsAcrossWalls: false })), 6);
  const south = layouts(c).find((L) => L.wallLabel === "South");
  const piece = south.cells.find((cl) => cl.occupied && cl.cutWidthMm < 1000);
  assert.equal(piece.source, "offcut");
  assert.equal(piece.sheetWall, "North");
  assert.equal(piece.fromPiece, "North strip 1", "strips are numbered by position: the part strip before the datum is strip 1");
  assert.deepEqual(south.cutPlan.fromOffcut, [{ cellId: piece.id, fromCellId: null, fromName: "North strip 1" }]);
  assert.equal(south.cutPlan.fromOtherWalls, 1);
  assert.equal(south.cutPlan.scope, "walls");
  assert.deepEqual(south.cutPlan.walls, ["North", "South"]);
  assert.equal(south.cutPlan.totalSheets, 5); assert.equal(south.cutPlan.totalPieces, 6);
});

t("the factory-edge rule holds across walls: the same edge on both walls is refused with the other wall named, never turned over", () => {
  // both tall walls END with a narrow strip needing its LEFT edge: the upper slices are shared (16 → 15), the end strips never
  const c = run(TWO_TALL);
  const south = layouts(c).find((L) => L.wallLabel === "South");
  assert.equal(south.cutPlan.scope, "walls");
  assert.ok(south.cutPlan.rejected.some((x) => /^North strip 6/.test(x.fromName || "") && x.reason === "factory-edge"), JSON.stringify(south.cutPlan.rejected));
  assert.ok(layouts(c).every((L) => L.cells.filter((cl) => cl.occupied && cl.cutWidthMm < 1000).every((cl) => cl.source === "sheet")));
  // when sharing saves nothing (two plain walls, the same edge at both ends), each wall keeps its own plan
  const same = run([["a", 2800, 2400, "North"], ["b", 2800, 2400, "South"]]);
  assert.equal(ordered(same), 6);
  assert.ok(layouts(same).every((L) => L.cutPlan.scope === undefined));
});

t("every piece on every wall is cut exactly once; each sheet is ordered once, on the wall of its first piece", () => {
  for (const [walls, rules] of [[TWO_TALL, {}], [RIP, RIP_RULES], [[["a", 3000, 2400, "North"], ["b", 4100, 2400, "East"], ["c", 2500, 2400, "West"]], {}]]) {
    const c = run(walls, rules);
    const r = c.materialResults.clad;
    const sheetDemands = r.demands.filter((d) => d.unit === "sheet");
    assert.equal(sheetDemands.length, ordered(c), "one demand per ordered sheet");
    assert.equal(new Set(sheetDemands.map((d) => d.id)).size, sheetDemands.length, "demand ids unique across walls");
    for (const L of layouts(c)) for (const cl of L.cells.filter((x) => x.occupied)) assert.ok(cl.sheetId, `${L.wallLabel} ${cl.id} has a sheet`);
    const owned = layouts(c).reduce((n, L) => n + L.cutPlan.sheets.length, 0);
    assert.equal(owned, sheetDemands.length, "each sheet counted on exactly one wall");
    // contributions share out the whole order, nothing lost or doubled
    const pieces = c.contributions.filter((x) => x.jobMaterialId === "clad").flatMap((x) => x.pieces).filter((p) => /sheet/.test(p.bucketKey));
    assert.equal(pieces.reduce((n, p) => n + p.quantity, 0), ordered(c));
  }
});

t("the cut list (site appendix) names every piece a shared sheet serves, and each wall lists the pieces it takes from another wall", () => {
  const c = run(RIP, RIP_RULES);
  const rows = c.materialResults.clad.appendix.layouts.flatMap((x) => x.rows.map((r) => r.description));
  assert.ok(rows.some((d) => /^Sheet 1 — 404417 2,450 mm: North strip 1, South strip 3$/.test(d)), rows.join(" | "));
  const southNotes = c.materialResults.clad.appendix.layouts.find((x) => x.wallLabel === "South").notes.join(" ");
  assert.match(southNotes, /South: from other walls — strip 3 from Sheet 1 \(counted on North; the offcut of North strip 1\)/);
  assert.match(southNotes, /shared with the other walls of this material \(all walls: 6 pieces from 5 sheets\)/);
});

t("the same walls give the same plan whatever order they were added in, and twice in a row", () => {
  const a = run(RIP, RIP_RULES);
  const rev = computeWorkspace({ ...ws(RIP, RIP_RULES), measurements: ws(RIP, RIP_RULES).measurements.reverse(), contributions: ws(RIP, RIP_RULES).contributions.reverse() });
  const sig = (c) => JSON.stringify(c.materialResults.clad.demands.filter((d) => d.unit === "sheet").map((d) => d.label).sort());
  assert.equal(sig(a), sig(rev));
  assert.equal(ordered(a), ordered(rev));
  assert.equal(JSON.stringify(run(RIP, RIP_RULES).materialResults.clad.layouts), JSON.stringify(a.materialResults.clad.layouts));
});

t("a wall whose quantity is blocked (taller than any sheet, no joint) shares nothing; the other walls still share", () => {
  const c = computeWorkspace(ws([...RIP, ["z", 2800, 3600, "Tall"]], { ...RIP_RULES, jointRows: undefined }));
  const tall = layouts(c).find((L) => L.wallLabel === "Tall");
  assert.ok(c.materialResults.clad.problems.some((p) => p.code === "sheet_too_tall"));
  assert.ok(!tall.cutPlan || tall.cutPlan.scope !== "walls", "the blocked wall isn't in the shared plan");
  const south = layouts(c).find((L) => L.wallLabel === "South");
  assert.equal(south.cutPlan.scope, "walls"); assert.deepEqual(south.cutPlan.walls, ["North", "South"]);
});

t("spares are added on the shared total, and the order line changes plan version when sharing is switched", () => {
  const withSpares = computeWorkspace({ ...ws(TWO_TALL), materials: [{ ...ws(TWO_TALL).materials[0], spec: { ...spec, spareRate: 10 } }] });
  const lines = withSpares.scheduleLines.filter((l) => l.unit === "sheet");
  assert.equal(lines.reduce((n, l) => n + (l.spareQuantity || 0), 0) > 0, true);
  assert.equal(lines.reduce((n, l) => n + l.quantity - (l.spareQuantity || 0), 0), 15);
  const on = run(TWO_TALL).scheduleLines.find((l) => l.unit === "sheet").dependencyKey;
  const off = run(TWO_TALL, { shareSheetsAcrossWalls: false }).scheduleLines.find((l) => l.unit === "sheet").dependencyKey;
  assert.notEqual(on, off);
});

// ── adversarial review fixes (20 Oct 2026) ─────────────────────────────────────────────────────────────────────
t("review HIGH: a piece within one saw cut of the longest sheet (2,996 on 3,000) takes that sheet whole — never left off the order", () => {
  for (const h of [2996, 2999, 3000]) {
    for (const share of [true, false]) {
      const c = computeWorkspace(ws([["a", 4800, h, "North"], ["b", 2400, 2400, "South"]], share ? { jointRows: undefined } : { jointRows: undefined, shareSheetsAcrossWalls: false }));
      const occupied = layouts(c).flatMap((L) => L.cells.filter((x) => x.occupied && x.stockLengthMm));
      assert.ok(occupied.every((x) => x.sheetId), `h ${h} share ${share}: every piece is on a sheet`);
      assert.ok(ordered(c) >= 6, `h ${h} share ${share}: 4 North strips + 2 South pieces need at least 6 sheets, got ${ordered(c)}`);
    }
  }
  // a raked wall whose tallest strip needs 2,995.9 mm
  const rake = computeWorkspace({ ...ws([["r", 7300, 2700, "Rake"]], { jointRows: undefined }), measurements: [{ id: "r", kind: "wall", inputs: { kind: "rake", widthMm: 7300, startHeightMm: 2700, endHeightMm: 3000, name: "Rake" } }] });
  const rc = layouts(rake)[0]?.cells.filter((x) => x.occupied && x.stockLengthMm) || [];
  assert.ok(rc.length && rc.every((x) => x.sheetId), JSON.stringify(rc.filter((x) => !x.sheetId).map((x) => x.id)));
});

t("review HIGH safety net: the planner reports a piece it can't place, and the wall blocks instead of ordering short", async () => {
  const { planSheets } = await import("../../shared/takeoff/engine/sheetCutPlan.js");
  const p = planSheets({ pieces: [{ cellId: "x", widthMm: 1200, lengthMm: 3200, keep: "full" }, { cellId: "y", widthMm: 1200, lengthMm: 2000, keep: "full" }], lengthsMm: [2450, 3000], sheetWidthMm: 1200, coverMm: 1200, kerfMm: 5 });
  assert.deepEqual(p.unplaced, ["x"]);
  assert.equal(p.sheets.length, 1);
});

t("review MEDIUM: a narrow piece that needs no factory edge leaves an offcut with either edge — it serves an edged piece on another wall", () => {
  // Return: one 400 strip (no neighbours → keeps no edge). North ends with a 400 strip needing its left edge.
  const walls = [["a", 2800, 2400, "North"], ["b", 400, 2400, "Return"]];
  const on = run(walls), off = run(walls, { shareSheetsAcrossWalls: false });
  assert.equal(ordered(off), 4);
  assert.equal(ordered(on), 3);
  // one narrow piece rides the other's rip offcut (either way round is valid), with no false factory-edge refusal
  const narrow = layouts(on).flatMap((L) => L.cells.filter((x) => x.occupied && x.cutWidthMm < 1000).map((x) => ({ wall: L.wallLabel, ...x })));
  assert.equal(narrow.filter((x) => x.source === "offcut").length, 1, JSON.stringify(narrow.map((x) => [x.wall, x.id, x.source, x.fromPiece])));
  assert.ok(layouts(on).every((L) => L.cutPlan.rejected.length === 0));
  // and the same holds inside one wall: a part strip that needs no edge never blocks an edged one
  const solo = run([["a", 400, 2400, "Pier"]]);
  assert.equal(ordered(solo), 1);
});

t("review LOW: with 12 walls, walls stay in order and sheet numbers follow them (padded plan keys)", () => {
  const walls = Array.from({ length: 12 }, (_, i) => [`m${String(i).padStart(2, "0")}`, 2800, 2400, `W${i}`]);
  // every other wall starts with a 400 part strip, so its rip serves the next wall's end strip (sharing saves sheets)
  const c = run(walls, { datumByWall: Object.fromEntries(walls.filter((_, i) => i % 2 === 0).map((w) => [w[0], 400])) });
  assert.ok(ordered(c) < 36, `shared: ${ordered(c)}`);
  const L = layouts(c);
  assert.deepEqual(L[0].cutPlan.walls, walls.map((w) => w[3]));
  const firstSheet = (lay) => Math.min(...lay.cutPlan.sheets.map((s) => Number(s.id.slice(1))));
  const order = L.map((lay) => [lay.wallLabel, firstSheet(lay)]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  assert.deepEqual(order, walls.map((w) => w[3]));
});

t("review (recheck) MEDIUM: sharing never orders more than planning each wall on its own (fewest sheets, then least stock length)", () => {
  const jr = { atMm: [1225], gapMm: 10, detailRef: "H-flashing" };
  for (const walls of [[["a", 7000, 2650, "North"], ["b", 7000, 2470, "South"]], [["a", 7000, 2650, "N"], ["b", 7000, 2650, "S"], ["c", 7000, 2650, "E"]]]) {
    const stock = (c) => c.scheduleLines.filter((l) => l.unit === "sheet").reduce((t, l) => t + l.quantity * l.finishedLengthMm, 0);
    const on = run(walls, { jointRows: jr }), off = run(walls, { jointRows: jr, shareSheetsAcrossWalls: false });
    assert.ok(ordered(on) <= ordered(off), `${ordered(on)} vs ${ordered(off)}`);
    assert.ok(ordered(on) < ordered(off) || stock(on) <= stock(off), `${stock(on)} vs ${stock(off)} mm`);
  }
});

t("review (recheck) LOW: one rule for every listed length — a single piece takes the shortest listed sheet that holds it", () => {
  for (const [h, L] of [[2447, 2450], [2449, 2450], [2747, 2750], [2996, 3000], [2450, 2450]]) {
    const c = run([["a", 1200, h, "One"]], { jointRows: undefined });
    const lines = c.scheduleLines.filter((l) => l.unit === "sheet");
    assert.deepEqual(lines.map((l) => [l.quantity, l.finishedLengthMm]), [[1, L]], `height ${h}`);
  }
});

console.log(`takeoff-tc-hub022: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
