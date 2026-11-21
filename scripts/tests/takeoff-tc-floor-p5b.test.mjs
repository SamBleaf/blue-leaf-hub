// Floor frame P5b (floor_framing@1): stair beams sized from the SmartLVL 13 single span floor bearer table; connector-nail and tie-nail counts
// (Sam, 21 Nov 2026). Plan: docs/takeoff/FLOOR_FRAMING_PLAN.md.   node scripts/tests/takeoff-tc-floor-p5b.test.mjs
// Table values are never retyped here: the expected size is also worked out by a second, plain lookup that reads the GENERATED data file.
import assert from "node:assert/strict";
import { CALCULATION_VERSION, floorFramingDefaults, FLOOR_FRAMING_RULES } from "../../shared/takeoff/index.js";
import { computeFloorFraming } from "../../shared/takeoff/engine/floor/framing.js";
import { floorFixings, CONNECTOR_NAIL_BOX, NAIL_PACK_SIZE } from "../../shared/takeoff/engine/floor/fixings.js";
import { STAIR_BEAM_CANDIDATES, sizeStairBeam, sizePlies } from "../../shared/takeoff/engine/floor/stairBeams.js";
import SMARTLVL13 from "../../shared/takeoff/standards/data/smartlvl13-e1-2021.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 6).join("\n    ")}`); } }
const rect = (w, h, x = 0, y = 0) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const go = (outline, rules = {}, extra = {}) => computeFloorFraming({ materialId: "m", n: floorFramingDefaults(), rules: { ...FLOOR_FRAMING_RULES, ...rules }, outline, voids: [], wets: [], ...extra });
const stair = (w, h, x, y) => ({ id: "v1", name: "Stair void 1", stair: true, points: rect(w, h, x, y) });
const fix = (r, key) => (r.layout.fixings || []).find((f) => f.key === key);
const tr = (r, kind, at) => r.layout.trimmers.find((x) => x.kind === kind && x.at === at);
const codes = (r) => r.problems.map((p) => p.code);
const demandsOf = (r) => r.demands.filter((d) => d.role === "floor trimmer");

// independent lookup straight from the generated data: first candidate (in Sam's order) whose cell at the next FLW column up spans the beam
function lookup(spanMm, flwMm) {
  const T = SMARTLVL13.tables["L13-FLOOR-BEARER"];
  const col = T.floorLwMm.findIndex((c) => c >= flwMm);
  if (col < 0) return "Engineer";
  for (const size of ["400x63", "2/400x45", "450x63"]) {
    const cell = T.rows.find((r) => r.size === size).spansMm[col];
    if (cell != null && cell >= spanMm) return size;
  }
  return "Engineer";
}

t("table: the generated floor bearer table is complete (21 sizes x 10 floor load widths, guide p13 = pdf p16), and 400x45 single is not in it", () => {
  const T = SMARTLVL13.tables["L13-FLOOR-BEARER"];
  assert.equal(T.rows.length, 21); assert.deepEqual(T.floorLwMm, [1200, 1800, 2400, 3000, 3600, 4200, 4800, 5400, 6000, 6600]);
  assert.deepEqual(T.citation, { pdfPage: 16, guidePage: 13 }); assert.equal(T.floorMassKgM2, 40);
  assert.ok(T.rows.every((r) => r.spansMm.length === 10 && r.extraBearingMm.length === 10));
  assert.ok(!T.rows.some((r) => r.size === "400x45"));
  assert.deepEqual([...STAIR_BEAM_CANDIDATES], ["400x63", "2/400x45", "450x63"]);
  assert.ok(STAIR_BEAM_CANDIDATES.every((s) => T.rows.some((r) => r.size === s)));
  assert.deepEqual(sizePlies("2/400x45"), { plies: 2, section: "400x45" }); assert.deepEqual(sizePlies("400x63"), { plies: 1, section: "400x63" }); assert.equal(sizePlies("Engineer"), null);
});

t("A short void -> every stair beam 400x63; FLW is half the truss on the header; explain line names the table", () => {
  // 12.0 x 6.0 floor, trusses span 6000 at 450; void 1000 x 2400 at y 1800: header trusses are 1800 long -> FLW 900
  const r = go(rect(12000, 6000), {}, { voids: [stair(1000, 2400, 5000, 1800)] });
  assert.ok(r.layout.trimmers.length === 4 && r.layout.trimmers.every((x) => x.size === "400x63" && x.sizing.auto));
  assert.equal(tr(r, "header", "head").sizing.flwMm, 900); assert.equal(tr(r, "header", "head").sizing.flwColumnMm, 1200);
  assert.equal(Math.round(tr(r, "header", "head").sizing.spanMm), 1000);
  assert.ok(r.explain.some((x) => /^Stair beams: sized from SmartLVL 13 single span floor bearer table \(guide p13\): Stair void 1 head header beam span 1000, FLW 900 \(table column 1200\) → 400x63$/.test(x)), r.explain.join("\n"));
  assert.ok(demandsOf(r).every((d) => d.quantity === 1 && /400/.test(JSON.stringify(d.identity)) && /63/.test(JSON.stringify(d.identity))));
  assert.ok(!codes(r).includes("floor_stair_beam_engineer"));
});

t("A long header with a big FLW -> 2/400x45 (two 400x45 side by side); side beams use the larger header FLW; a point-load note, never blocking", () => {
  // 12.0 x 9.0, trusses span 9000; void 5000 wide x 2000 at y 500: head trusses 500 (FLW 250), foot trusses 6500 (FLW 3250 -> column 3600)
  const r = go(rect(12000, 9000), {}, { voids: [stair(5000, 2000, 3000, 500)] });
  const head = tr(r, "header", "head"), foot = tr(r, "header", "foot"), left = tr(r, "side", "left");
  assert.equal(head.size, lookup(5000, 250)); assert.equal(head.size, "400x63");
  assert.equal(foot.size, lookup(5000, 3250)); assert.equal(foot.size, "2/400x45"); assert.equal(foot.sizing.flwColumnMm, 3600);
  assert.equal(left.sizing.flwMm, 3250); assert.equal(left.size, lookup(2000, 3250)); assert.equal(left.size, "400x63");
  const d = r.demands.find((x) => x.role === "floor trimmer" && /foot header/.test(x.label));
  assert.equal(d.quantity, 2); assert.match(d.label, /foot header stair beam \(2\/400x45\)/); assert.match(JSON.stringify(d.identity), /400/);
  const note = r.problems.find((p) => p.code === "floor_stair_side_point_load");
  assert.ok(note && note.blocking === false && /Side stair beams carry the header beams as point loads: check with the engineer or LVL supplier\./.test(note.message));
  assert.equal(r.status.quantity, "calculated");
});

t("A header that 2/400x45 does not span but 450x63 does -> 450x63 (FLW 4000 -> column 4200)", () => {
  // 14.0 x 10.0, trusses span 10000; void 5100 x 1000 at y 1000: head 1000 (FLW 500), foot 8000 (FLW 4000)
  const r = go(rect(14000, 10000), {}, { voids: [stair(5100, 1000, 3000, 1000)] });
  const foot = tr(r, "header", "foot");
  assert.equal(foot.size, "450x63"); assert.equal(foot.size, lookup(5100, 4000)); assert.equal(foot.sizing.flwColumnMm, 4200);
  assert.equal(tr(r, "header", "head").size, "400x63");
  assert.equal(demandsOf(r).find((x) => /foot header/.test(x.label)).quantity, 1);
});

t("Beyond the table (FLW over the last column) -> Engineer: non-blocking note, no LVL quantity for that beam; headers and sides", () => {
  // 20.0 x 14.0, trusses span 14000; void 1000 x 400 at y 300: foot trusses 13300 (FLW 6650 > last column)
  const r = go(rect(20000, 14000), {}, { voids: [stair(1000, 400, 6000, 300)] });
  assert.equal(tr(r, "header", "foot").size, "Engineer");
  assert.equal(tr(r, "header", "head").size, "400x63");   // head trusses are 300 long
  assert.ok(r.layout.trimmers.filter((x) => x.kind === "side").every((x) => x.size === "Engineer"));
  const eng = r.problems.filter((p) => p.code === "floor_stair_beam_engineer");
  assert.equal(eng.length, 3); assert.ok(eng.every((p) => p.blocking === false && /Size from the engineer/.test(p.message)));
  assert.equal(demandsOf(r).length, 1, "only the head header is counted");
  assert.equal(r.status.quantity, "calculated");
  assert.ok(r.explain.some((x) => /foot header beam .* → Engineer \(size from the engineer, no LVL counted\)/.test(x)));
  assert.equal(sizeStairBeam({ spanMm: 1000, flwMm: 6700 }).outcome, "engineer");
});

t("No candidate spans (a 7000 wide void) -> Engineer, same fallback", () => {
  const r = go(rect(12000, 6000), {}, { voids: [stair(7000, 1000, 2000, 2000)] });
  assert.equal(tr(r, "header", "head").size, lookup(7000, 1500)); assert.equal(tr(r, "header", "head").size, "Engineer");
  assert.equal(demandsOf(r).filter((d) => /header/.test(d.label)).length, 0);
});

t("A size picked by hand wins (and a size saved before P5b is kept); 'auto' goes back to the table", () => {
  const v = [stair(5000, 2000, 3000, 500)];
  const r = go(rect(12000, 9000), { trimmerSizes: { v1: "400x45" } }, { voids: v });
  assert.ok(r.layout.trimmers.every((x) => x.size === "400x45" && x.sizing.auto === false));
  assert.ok(!r.explain.some((x) => /sized from SmartLVL 13/.test(x)));
  assert.ok(demandsOf(r).every((d) => d.quantity === 1 && /400/.test(JSON.stringify(d.identity)) && /45/.test(JSON.stringify(d.identity))));
  const saved = go(rect(12000, 9000), { trimmerSizes: { v1: "400x63" } }, { voids: v });
  assert.ok(saved.layout.trimmers.every((x) => x.size === "400x63"), "a saved 400x63 stays 400x63 even where the table says 2/400x45");
  const auto = go(rect(12000, 9000), { trimmerSizes: { v1: "auto" } }, { voids: v });
  assert.equal(tr(auto, "header", "foot").size, "2/400x45");
});

// ── nails ──
t("Strap brace nails (2/3.15 x 35 each end = 4 per brace) join the connector nails: 6.0 x 4.2, no beams = 4 braces x 4 = 16 nails, 1 box", () => {
  const r = go(rect(6000, 4200));
  const n = fix(r, "nail35");
  assert.equal(n.nailCount, 16); assert.equal(n.quantity, 1);
  assert.match(n.note, /16 nails in boxes of 9000/); assert.match(n.note, /16 strap brace nails \(4 per brace: 2\/3\.15 x 35 each end, 4 braces/);
  assert.match(n.product, /35 x 3\.15 \(box of 9000\)/);
  assert.equal(fix(r, "brace").quantity, 4);
});
t("Connector nails are ordered in boxes of 9000 (Sam, 'I think': constant), rounding up; the 75 mm nails stay a count (pack size unknown)", () => {
  assert.equal(CONNECTOR_NAIL_BOX, 9000); assert.equal(NAIL_PACK_SIZE, null);
  const lay = (beamEnds, edges) => ({ trussEnds: { plateEnds: 0, beamEnds, stairBeamEnds: 0 }, endStrongbacks: Array.from({ length: edges }, (_, i) => ({ i })), totals: {}, tieRows: [] });
  // hand check: 428 brackets x 21 = 8988 + 1 edge x 2 braces x 4 = 8 -> 8996 nails = 1 box; 429 x 21 = 9009 + 8 = 9017 -> 2 boxes
  let n = floorFixings({ layout: lay(428, 1), trussDepthMm: 400 }).find((f) => f.key === "nail35");
  assert.deepEqual([n.nailCount, n.quantity], [8996, 1]);
  n = floorFixings({ layout: lay(429, 1), trussDepthMm: 400 }).find((f) => f.key === "nail35");
  assert.deepEqual([n.nailCount, n.quantity], [9017, 2]); assert.match(n.note, /9017 nails in boxes of 9000/);
  const n75 = floorFixings({ layout: { ...lay(0, 0), trussEnds: { plateEnds: 10, beamEnds: 0, stairBeamEnds: 0 } }, trussDepthMm: 400 }).find((f) => f.key === "nail75");
  assert.equal(n75.quantity, 20); assert.ok(!/box/.test(n75.product + n75.note));
});
t("Lateral ties (no ceiling under) are nailed like strongbacks: 3 per truss crossing at 250+ deep, 2 at 200, in the 75 mm count with their own part", () => {
  // 9.0 x 6.2 at 600: 16 trusses; 2 tie rows x 16 = 32 crossings; 3 mid-span rows x 16 = 48 crossings; 32 plate ends each side
  const r = go(rect(9000, 6200), { centresMm: 600, noCeiling: true });
  assert.equal(r.layout.totals.trussCount, 16);
  const n = fix(r, "nail75");
  assert.equal(n.quantity, 64 + 64 + 48 * 3 + 32 * 3);   // skew + end strongback + mid-span + ties = 368
  assert.match(n.note, /96 lateral ties \(3 × 32 truss crossings at 400 deep, no ceiling under\)/);
  assert.match(n.note, /144 mid-span strongbacks \(3 × 48 truss crossings/);
  const r2 = go(rect(9000, 6200), { centresMm: 600, noCeiling: true, trussDepthMm: 200 });
  assert.match(fix(r2, "nail75").note, /64 lateral ties \(2 × 32 truss crossings at 200 deep/);
  const off = go(rect(9000, 6200), { centresMm: 600 });
  assert.ok(!/lateral ties/.test(fix(off, "nail75").note));
  assert.equal(fix(off, "nail75").quantity, 368 - 96);
});

t("version: still takeoff-calc@14 (unreleased branch)", () => { assert.match(CALCULATION_VERSION, /^takeoff-calc@14$/); });

console.log(`takeoff-tc-floor-p5b: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
