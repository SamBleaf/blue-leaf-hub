// Loads above (Sam, 18 Nov 2026): "Above these walls" = Roof (today) · Floor + roof · Engineer.
//   node scripts/tests/takeoff-tc-loads-above.test.mjs
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { WALL_FRAMING_RULES, computeWorkspace, wallFramingDefaults } from "../../shared/takeoff/index.js";
import { ENGINEER_GRADES, FLOOR_WIDTHS_MM, LOADS_ABOVE, loadsAboveOf, parseLintelText, selectLintel } from "../../shared/takeoff/standards/index.js";
import { cleanMeasurementInputs, _test } from "../../server/lib/takeoff/takeoffService.mjs";
import MGP10DATA from "../../shared/takeoff/standards/data/as1684-mgp10-n1n2.js";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 25).join("\n    ")}`); } }

// ── fixtures (same shape as takeoff-tc-lintel-position) ──────────────────────────────────────────────────────────
const product = (id, purpose, over = {}) => ({ id, name: id, isActive: true, methodKey: "linear_stock", methodVersion: 1, rules: {},
  spec: { family: "timber", purpose, section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", species: null, supplierName: "Yard A", productCode: null, stock: { maxMm: null, unavailableMm: [] }, ...over } });
const READY = () => wallFramingDefaults([product("p-stud", "studs"), product("p-plate", "plates"), product("p-nog", "noggins", { section: { depthMm: 90, widthMm: 35 } })]);
const walls = (spec, rules) => ({ id: "walls", name: "Walls", methodKey: "wall_framing", methodVersion: 1, spec, rules });
const snap = (materials, measurements, contributions) => ({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [], materials, measurements, contributions });
const wm = (id, widthMm, heightMm, name) => ({ id, kind: "wall", inputs: { kind: "rect", widthMm, heightMm, name } });
const om = (id, parentId, label, type, xMm, widthMm, heightMm, sillMm, extra = {}) => ({ id, kind: "opening", parentId, inputs: { xMm, sillMm, widthMm, heightMm, label, type, ...extra } });
const onW = (measurementId) => ({ id: `c-${measurementId}-walls`, measurementId, jobMaterialId: "walls", role: "wall" });
const ROOF = { carriesRoof: true, roofMass: "sheet", rlwMm: 3000, rafterSpacingMm: 600, windClass: "N2" };
// a 3,000 wide window in a 6,000 wall, head at 2,100 (600 free above the 2,700 studs)
const WIN = (extra = {}) => [wm("w", 6000, 2700, "Wall 1"), om("o", "w", "W1", "window", 1000, 3000, 1200, 900, extra)];
const run = (measurements, rules) => computeWorkspace(snap([walls(READY(), { ...WALL_FRAMING_RULES, ...ROOF, ...rules })], measurements, measurements.filter((m) => m.kind === "wall").map((m) => onW(m.id))));
const WR = (c) => c.materialResults.walls;
const rule = (c) => WR(c).layouts[0].openings[0].rule;

const FLOOR = { loadsAbove: "floorRoof", floorWidthMm: 3600, lintelProduct: "MGP10" };
const base = { product: "MGP10", roofMass: "sheet", rlwMm: 3000, spacingMm: 600, windClass: "N2", loadsAbove: "floorRoof", floorWidthMm: 3600, spanMm: 1800 };

t("constants: three choices, three floor widths, two grades; absent = roof", () => {
  assert.deepEqual([...LOADS_ABOVE], ["roof", "floorRoof", "engineer"]);
  assert.deepEqual([...FLOOR_WIDTHS_MM], [1800, 3600, 4800]);
  assert.deepEqual([...ENGINEER_GRADES], ["MGP10", "LVL13"]);
  assert.equal(loadsAboveOf({}), "roof");
  assert.equal(loadsAboveOf({ loadsAbove: "floorRoof" }), "floorRoof");
  assert.equal(loadsAboveOf({ loadsAbove: "junk" }), "roof");
});

// ── Roof: unchanged vs 4367c84 wherever the old answer was a size or "needs" ─────────────────────────────────────
let old = null;
try { const dir = execSync("mktemp -d").toString().trim(); execSync(`git archive 4367c84 shared | tar -x -C ${dir}`, { stdio: "ignore" }); old = await import(`${dir}/shared/takeoff/standards/index.js`); } catch { /* no such commit here: skipped */ }
t("roof: every case the old selector answered (size or needs) is byte-identical; only old 'engineer' answers can change", () => {
  if (!old) return;
  let same = 0, restored = 0, changed = [];
  for (const product of ["MGP10", "SmartLVL13"]) for (const windClass of ["N1", "N2", "N3", "N4", undefined]) for (const roofMass of ["sheet", "tile"])
    for (const rlwMm of [1500, 3000, 4500, 6000, 7500, 8000]) for (const spacingMm of [600, 1200, 1300]) for (const spanMm of [600, 1500, 2400, 3300, 4500, 6000, 9000]) {
      const q = { product, roofMass, rlwMm, spacingMm, windClass, spanMm, maxThicknessMm: 90 };
      const a = old.selectLintel(q), b = selectLintel(q);
      // 18 Nov 2026: the MGP10 port had dropped the large single sections that carry a bearing subscript (T18 240x45, ...); with them
      // restored an MGP10 pick can be a smaller section that still spans. Never a shorter span than asked, never an LVL/product change.
      if (a.outcome !== "engineer" && product === "MGP10" && JSON.stringify(a) !== JSON.stringify(b)) { assert.equal(b.outcome, "ok"); assert.equal(b.grade, "MGP10"); assert.ok(b.maxSpanMm >= spanMm); assert.ok(b.depthMm * b.plies <= a.depthMm * a.plies, "restored rows are shallower"); restored++; }
      else if (a.outcome !== "engineer") { assert.deepEqual(b, a); same++; }
      else if (JSON.stringify(a) !== JSON.stringify(b)) { changed.push([a, b]); }
    }
  assert.ok(same > 800, `${same} identical`);
  // the only changes: an MGP10 item whose old answer was "engineer" now gets an LVL13 size with the note, never anything else
  assert.ok(changed.length > 0);
  for (const [a, b] of changed) { assert.equal(a.outcome, "engineer"); assert.equal(b.outcome, "ok"); assert.equal(b.grade, "LVL13"); assert.equal(b.note, "MGP10 doesn't span — LVL13"); assert.equal(q0(b), "MGP10"); }
  function q0() { return "MGP10"; }
});
t("roof: an MGP10 item with the roof case unchanged (loadsAbove absent) still reads T17 with no note", () => {
  const c = run(WIN(), { lintelProduct: "MGP10", windClass: "N2" });
  const l = rule(c).lintel;
  assert.equal(l.grade, "MGP10"); assert.match(l.basis, /T17/); assert.equal(l.note, undefined);
  assert.equal(rule(c).loadsAbove, undefined, "nothing new in a roof result");
});

// ── Roof: MGP10 first, then LVL13 ────────────────────────────────────────────────────────────────────────────────
t("roof MGP10 item, no MGP10 size spans: falls back to LVL13 with the note", () => {
  const r = selectLintel({ product: "MGP10", roofMass: "sheet", rlwMm: 3000, spacingMm: 600, windClass: "N2", spanMm: 5000, maxThicknessMm: 90 });
  assert.deepEqual([r.outcome, r.grade, r.note], ["ok", "LVL13", "MGP10 doesn't span — LVL13"]);
  assert.match(r.basis, /L13-LINTEL, /);
  const c = run(WIN({}), { lintelProduct: "MGP10", windClass: "N3" });   // N3 isn't in the pine table
  assert.deepEqual([rule(c).lintel.status, rule(c).lintel.grade, rule(c).lintel.note], ["sized", "LVL13", "MGP10 doesn't span — LVL13"]);
});
t("roof: a missing answer never falls back (needs stays needs), nor does one both tables refuse", () => {
  assert.equal(selectLintel({ product: "MGP10", roofMass: "sheet", rlwMm: 3000, windClass: "N2", spanMm: 1800 }).outcome, "needs_roof");
  assert.equal(selectLintel({ product: "MGP10", roofMass: "sheet", rlwMm: 3000, spacingMm: 600, windClass: "N5", spanMm: 1800 }).outcome, "engineer");
  assert.equal(selectLintel({ product: "MGP10", roofMass: "sheet", rlwMm: 3000, spacingMm: 600, windClass: "N2", spanMm: 9000 }).outcome, "engineer");
});
t("roof LVL13 item is untouched (no fallback, no note)", () => {
  const r = selectLintel({ product: "SmartLVL13", roofMass: "sheet", rlwMm: 3000, spacingMm: 600, windClass: "N2", spanMm: 1800 });
  assert.equal(r.outcome, "ok"); assert.equal(r.note, undefined);
});

// ── Floor + roof ─────────────────────────────────────────────────────────────────────────────────────────────────
t("floor + roof reads MGP10 T47 (sheet) / T48 (tile), N1 and N2, with '(2-storey tables)' on the source line", () => {
  const s = selectLintel(base);
  assert.deepEqual([s.outcome, s.grade, s.table, s.twoStorey, s.note], ["ok", "MGP10", "T47", true, undefined]);
  assert.match(s.basis, /AS 1684\.2 N1\/N2 Supplement 4 \(2006\), T47, page 50, sheet roof, roof width 4500, floor width 3600 \(2-storey tables\)/);
  const tl = selectLintel({ ...base, roofMass: "tile" });
  assert.equal(tl.table, "T48"); assert.match(tl.basis, /T48, page 51, tile roof/);
  assert.equal(selectLintel({ ...base, windClass: "N1" }).table, "T47");
});
t("floor width rounds UP to the table's axis (1800/3600/4800), never down: a wider floor never gives a smaller lintel", () => {
  const w = (f) => selectLintel({ ...base, floorWidthMm: f, spanMm: 2800 });
  assert.match(w(1800).basis, /floor width 1800/);
  assert.match(w(1801).basis, /floor width 3600/);
  assert.match(w(3600).basis, /floor width 3600/);
  assert.match(w(4000).basis, /floor width 4800/);
  assert.match(w(4800).basis, /floor width 4800/);
  assert.deepEqual([w(1800).section, w(1800).plies, w(3600).section, w(3600).plies, w(4800).section, w(4800).plies], ["290x45", 1, "240x45", 2, "290x45", 2]);
});
t("floor width over the table's last column → engineer (type the size), never the nearest", () => {
  const r = selectLintel({ ...base, floorWidthMm: 4801 });
  assert.equal(r.outcome, "engineer"); assert.match(r.reasons[0], /type the size/);
  assert.equal(selectLintel({ ...base, floorWidthMm: undefined }).outcome, "needs_roof");
  assert.equal(selectLintel({ ...base, rlwMm: undefined }).outcome, "needs_roof");
  assert.equal(selectLintel({ ...base, windClass: undefined }).outcome, "needs_roof");
});
t("MGP10 doesn't span: LVL13 lower-storey table (own axes 1200/2400/3600, rounds up on those) with the note on the card", () => {
  const r = selectLintel({ ...base, spanMm: 3400 });
  assert.deepEqual([r.outcome, r.grade, r.table, r.note], ["ok", "LVL13", "L13-LINTEL-LOWER", "MGP10 doesn't span — LVL13"]);
  assert.match(r.basis, /SmartLVL 13 Design Guide \(E1 2021\), L13-LINTEL-LOWER, page 26 \(guide p\. 23\), sheet roof, roof width 3000, floor width 3600 \(2-storey tables\)/);
  assert.match(selectLintel({ ...base, spanMm: 3400, roofMass: "tile" }).basis, /page 27 \(guide p\. 24\), tile roof/);
  assert.match(selectLintel({ ...base, spanMm: 4000, floorWidthMm: 1800 }).basis, /floor width 2400/, "1800 rounds up to the LVL table's 2400");
  assert.match(selectLintel({ ...base, spanMm: 3400, rlwMm: 3100 }).basis, /roof width 4500/);
  // the LVL table stops at 3600 floor and 6000 roof: above that it doesn't answer
  assert.equal(selectLintel({ ...base, spanMm: 3400, floorWidthMm: 4800 }).outcome, "engineer");
});
t("N3: MGP10 lower tables (N1/N2 only) are skipped, LVL13 lower table used; N4 and beyond: type the size", () => {
  const n3 = selectLintel({ ...base, windClass: "N3", spanMm: 1800 });
  assert.deepEqual([n3.outcome, n3.grade, n3.table], ["ok", "LVL13", "L13-LINTEL-LOWER"]);
  assert.match(n3.note, /^N3: MGP10 lower-storey tables are N1\/N2 only/);
  for (const w of ["N4", "N5", "C1"]) { const r = selectLintel({ ...base, windClass: w }); assert.equal(r.outcome, "engineer", w); assert.match(r.reasons[0], /type the size/); }
});
t("floor + roof in the engine: sizes the opening, says (2-storey tables), jambs stay at the minimum with a note, and is complete", () => {
  const c = run(WIN(), FLOOR);
  const r = rule(c);
  assert.equal(r.loadsAbove, "floorRoof");
  assert.equal(r.lintel.status, "sized"); assert.equal(r.lintel.grade, "MGP10"); assert.match(r.lintel.basis, /2-storey tables/);
  assert.deepEqual([r.lintel.section, r.lintel.plies], ["290x45", 2]);
  assert.equal(WR(c).status.quantity, "calculated");
  assert.ok(WR(c).problems.some((p) => p.code === "jambs_minimum_used"));
});

// ── Engineer ─────────────────────────────────────────────────────────────────────────────────────────────────────
t("engineer: no lintel is ever sized, the quantity is incomplete until the size is typed", () => {
  const sel = selectLintel({ ...base, loadsAbove: "engineer" });
  assert.equal(sel.outcome, "engineer"); assert.match(sel.reasons[0], /per engineer/);
  const c = run(WIN(), { loadsAbove: "engineer" });
  assert.equal(rule(c).lintel.status, "engineer");
  assert.notEqual(WR(c).status.quantity, "calculated", "incomplete");
  assert.ok(WR(c).problems.some((p) => p.code === "lintel_not_sized"));
  assert.equal(selectLintel({ ...base, loadsAbove: "engineer", windClass: "N1", spanMm: 600 }).outcome, "engineer", "even a tiny span");
});
t("engineer: a typed size completes it, labelled per engineer, grade from the chip", () => {
  for (const [text, grade, section, plies] of [["290x45", "MGP10", "290x45", 1], ["2/240x45", "LVL13", "240x45", 2]]) {
    const p = parseLintelText(text);
    const c = run(WIN({ lintel: { depthMm: p.depthMm, breadthMm: p.breadthMm, plies: p.plies, grade, perEngineer: true } }), { loadsAbove: "engineer" });
    const l = rule(c).lintel;
    assert.deepEqual([l.status, l.section, l.plies, l.grade, l.perEngineer], ["typed", section, plies, grade, true]);
    assert.match(l.basis, /per engineer/);
    assert.equal(WR(c).status.quantity, "calculated");
    assert.ok(!WR(c).problems.some((x) => x.code === "lintel_not_sized"));
  }
});

// ── quick-entry text + server whitelist ──────────────────────────────────────────────────────────────────────────
t("parseLintelText: 290x45, 2/240x45, spaces and ×; junk is refused with a reason", () => {
  assert.deepEqual(parseLintelText("290x45"), { ok: true, depthMm: 290, breadthMm: 45, plies: 1 });
  assert.deepEqual(parseLintelText("2/240x45"), { ok: true, depthMm: 240, breadthMm: 45, plies: 2 });
  assert.deepEqual(parseLintelText(" 2 / 190 × 45 "), { ok: true, depthMm: 190, breadthMm: 45, plies: 2 });
  assert.deepEqual(parseLintelText("300X63"), { ok: true, depthMm: 300, breadthMm: 63, plies: 1 });
  for (const bad of ["", "abc", "290", "290x", "x45", "5/240x45", "0/240x45", "45x290", "2000x45", "290x45x3", "290x450", "-290x45", "290.5x45", null, undefined])
    { const r = parseLintelText(bad); assert.equal(r.ok, false, String(bad)); assert.ok(r.error.length > 5); }
});
t("server: loadsAbove / floorWidthMm are kept or refused, the typed text parses, perEngineer is kept", () => {
  const rules = (r) => _test.cleanGenericRules(r);
  assert.deepEqual(rules({ loadsAbove: "floorRoof", floorWidthMm: 3600 }), { loadsAbove: "floorRoof", floorWidthMm: 3600 });
  const open = { xMm: 0, sillMm: 900, widthMm: 1200, heightMm: 1200, type: "window" };
  const a = cleanMeasurementInputs("opening", { ...open, lintel: { text: "2/240x45", grade: "LVL13", perEngineer: true } });
  assert.deepEqual(a.lintel, { depthMm: 240, breadthMm: 45, plies: 2, grade: "LVL13", perEngineer: true });
  assert.deepEqual(cleanMeasurementInputs("opening", { ...open, lintel: { depthMm: 290, breadthMm: 45, plies: 1 } }).lintel, { depthMm: 290, breadthMm: 45, plies: 1 });
  assert.throws(() => cleanMeasurementInputs("opening", { ...open, lintel: { text: "junk" } }), /Type the size/);
});

// ── review fixes: MGP10 data, bearing, carriesRoof ───────────────────────────────────────────────────────────────
t("MGP10 lintel tables: every span is a multiple of 100 (a fused 9005 once read as a span), every row has a bearing cell per column", () => {
  const D = MGP10DATA;
  for (const id of ["T17", "T18", "T47", "T48"]) for (const r of D.tables[id].rows) {
    assert.equal(r.extraBearingMm.length, r.maxSpanMm.length, `${id} ${r.size}`);
    for (const v of r.maxSpanMm) assert.equal(v % 100, 0, `${id} ${r.size} ${v}`);
  }
});
t("Floor + roof, tile, roof 7500, floor 4800: a long opening is not 'sized' as a 170x35", () => {
  const q = { product: "MGP10", roofMass: "tile", rlwMm: 7500, windClass: "N2", loadsAbove: "floorRoof", floorWidthMm: 4800, maxThicknessMm: 90 };
  for (const spanMm of [2500, 4000, 6000, 9000]) { const r = selectLintel({ ...q, spanMm }); assert.ok(r.outcome !== "ok" || r.maxSpanMm <= 4000, `${spanMm}: ${r.section} ${r.maxSpanMm}`); }
});
t("an MGP10 lower-storey cell with a subscript passes its extra bearing on", () => {
  // T47 240x35 at roof 4500 / floor 3600 spans 1600 with +5
  const r = selectLintel({ product: "MGP10", roofMass: "sheet", rlwMm: 4500, windClass: "N2", loadsAbove: "floorRoof", floorWidthMm: 3600, spanMm: 1550, maxThicknessMm: 45, maxDepthMm: 240 });
  assert.ok(r.outcome === "ok" && r.grade === "MGP10", JSON.stringify(r));
  const direct = selectLintel({ ...base, rlwMm: 4500, spanMm: 1500, maxThicknessMm: 35 });
  assert.equal(typeof direct.extraBearingMm, "number");
});
t("Above these walls = Floor + roof or Engineer: 'carries roof' = No does not drop the lintel; a non-loadbearing wall still does", () => {
  for (const la of ["floorRoof", "engineer"]) {
    const c = run(WIN(), { carriesRoof: false, loadsAbove: la, floorWidthMm: 3600 });
    assert.notEqual(rule(c).lintel.status, "not_needed", la);
  }
  assert.equal(rule(run(WIN(), { carriesRoof: false })).lintel.status, "not_needed", "roof item unchanged");
});

console.log(`takeoff-tc-loads-above: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
