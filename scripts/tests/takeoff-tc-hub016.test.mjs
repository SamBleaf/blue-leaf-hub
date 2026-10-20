// Hub review HUB 016 — cladding sheets are shared across a wall before more stock is bought. Owner rule (Sam,
// 20 Oct 2026): the long tongue/groove edges stay factory (a sheet keeps its width); the other direction can be cut
// however you like; nothing is turned over. Drives the REAL engine (sheetCutPlan + cladding.sheetLayout).
import assert from "node:assert/strict";
import { sheetLayout } from "../../shared/takeoff/engine/cladding.js";
import { planSheets } from "../../shared/takeoff/engine/sheetCutPlan.js";
import { buildWall } from "../../shared/takeoff/engine/wall.js";
import { CATALOGUE_SEED } from "../../shared/takeoff/products/seed.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); } }
const P = (id) => CATALOGUE_SEED.products.find((p) => p.id === id);
const AXON400_3000 = [P("axon-404419")];
const AXON400 = ["axon-404417", "axon-404418", "axon-404419"].map(P);
const JOINT = { gapMm: 10, detailRef: "H-flashing" };
const layout = (w, h, products = AXON400_3000, extra = {}) => sheetLayout(buildWall({ id: "W1", kind: "rect", widthMm: w, heightMm: h, ...extra.wall }), extra.openings || [], products, { materialId: "m", wallId: "W1", orientation: "vertical", jointRows: JOINT, ...extra.opts });
const sheets = (r) => r.demands.filter((d) => d.unit === "sheet");

t("the recorded 6,573 × 3,600 Axon wall: 12 sheets one-per-cell → 8 shared (6 lower, 5 full-width upper pieces from one sheet, 1 for the narrow upper piece)", () => {
  const r = layout(6573, 3600);
  assert.equal(sheets(r).length, 8);
  const plan = r.layout.cutPlan;
  const upper = plan.sheets.find((s) => s.cellIds.length === 5);
  assert.deepEqual(upper.cellIds, ["c0r1", "c1r1", "c2r1", "c3r1", "c4r1"]);
  // the narrow upper strip can't use the lower narrow strip's offcut: it keeps the other factory edge
  assert.deepEqual(plan.rejected, [{ cellId: "c5r1", fromCellId: "c5r0", reason: "factory-edge" }]);
  assert.equal(r.layout.cells.find((c) => c.id === "c1r1").sheetId, upper.id);
  assert.equal(r.layout.cells.find((c) => c.id === "c1r1").source, "sheet");
  // offcuts are listed, never counted as reused unless a piece was assigned
  assert.ok(r.layout.potentialOffcuts.every((o) => o.allocated === false));
  assert.ok(r.layout.potentialOffcuts.some((o) => o.widthMm === 622 && o.lengthMm === 3000 && o.edge === "right"));
});

t("a ripped strip's offcut IS reused by a strip needing its other factory edge (narrow strips at both ends of a wall)", () => {
  // datum 400 → a 400 mm strip at the start (needs its RIGHT edge), full strips, a narrow strip at the end (needs its LEFT edge)
  const r = layout(3200, 2700, AXON400_3000, { opts: { datumMm: 400 } });
  const plan = r.layout.cutPlan;
  assert.equal(plan.fromOffcut.length, 1, JSON.stringify(plan));
  const used = r.layout.cells.find((c) => c.id === plan.fromOffcut[0].cellId);
  assert.equal(used.source, "offcut");
  assert.ok(sheets(r).length < r.layout.cells.filter((c) => c.occupied).length);
});

t("cross-cuts share a sheet along its length, with a saw cut between pieces; the shortest listed sheets that hold them are chosen", () => {
  const r = planSheets({ pieces: [{ cellId: "a", widthMm: 1200, lengthMm: 590, keep: "full" }, { cellId: "b", widthMm: 1200, lengthMm: 590, keep: "full" }, { cellId: "c", widthMm: 1200, lengthMm: 590, keep: "full" }],
    lengthsMm: [2450, 2750, 3000], sheetWidthMm: 1200, coverMm: 1200, kerfMm: 5 });
  assert.equal(r.sheets.length, 1); assert.equal(r.sheets[0].stockLengthMm, 2450); assert.equal(r.sheets[0].residualMm, 2450 - 3 * 590 - 15);
  // five 590 fit a 3,000 sheet; six don't
  const six = planSheets({ pieces: Array.from({ length: 6 }, (_, i) => ({ cellId: `p${i}`, widthMm: 1200, lengthMm: 590, keep: "full" })), lengthsMm: [3000], sheetWidthMm: 1200, coverMm: 1200 });
  assert.deepEqual(six.sheets.map((s) => s.cellIds.length).sort(), [1, 5]);
});

t("deterministic: the same wall gives the same plan; changing the wall, an opening or the stock lengths recalculates it", () => {
  assert.equal(JSON.stringify(layout(6573, 3600)), JSON.stringify(layout(6573, 3600)));
  assert.notEqual(sheets(layout(6400, 3600)).length, 0);
  assert.equal(sheets(layout(6573, 3600, AXON400)).length, 8);   // 2,450 / 2,750 / 3,000 listed: still 8, shorter sheets where they fit
  const withWindow = layout(6573, 3600, AXON400_3000, { openings: [{ id: "O1", xMm: 1300, sillMm: 900, widthMm: 900, heightMm: 1200 }] });
  assert.ok(sheets(withWindow).length <= 8);
});

t("never more sheets than one-per-cell, and every piece is cut from exactly one sheet or offcut", () => {
  for (const [w, h] of [[4800, 2700], [4801, 2700], [6573, 3600], [1300, 2400], [9000, 6500], [2500, 3100]]) {
    const r = layout(w, h);
    const occupied = r.layout.cells.filter((c) => c.occupied && c.stockLengthMm);
    assert.ok(sheets(r).length <= occupied.length, `${w}×${h}`);
    const seen = new Map();
    for (const s of r.layout.cutPlan.sheets) for (const id of s.cellIds) seen.set(id, (seen.get(id) || 0) + 1);
    for (const f of r.layout.cutPlan.fromOffcut) seen.set(f.cellId, (seen.get(f.cellId) || 0) + 1);
    for (const c of occupied) assert.equal(seen.get(c.id), 1, `${w}×${h} ${c.id}`);
  }
});

t("a foam (Rendex) system keeps one panel per cell — no sharing rule for it yet", () => {
  const foam = CATALOGUE_SEED.products.filter((p) => p.family === "eps-cladding").slice(0, 1);
  if (!foam.length) return;
  const r = sheetLayout(buildWall({ id: "W1", kind: "rect", widthMm: 4500, heightMm: 2400 }), [], foam, { materialId: "f", wallId: "W1" });
  assert.equal(r.layout?.cutPlan ?? null, null);
});

console.log(`takeoff-tc-hub016: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
