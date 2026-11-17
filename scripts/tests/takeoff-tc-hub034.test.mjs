// HUB 034 (Sam, 18 Nov 2026): Add bracing (ply sheets by wall height, hoop iron cross braces, tensioners), hoop iron in 30 m rolls under BRACING.
//   node scripts/tests/takeoff-tc-hub034.test.mjs
import assert from "node:assert/strict";
import { computeWorkspace, wallFramingDefaults, methodFor, WALL_FRAMING_RULES, buildSupplierGroups, normaliseManualLines, MANUAL_HEADINGS, memberGroup,
  BRACING_RULE, PLY_BRACE_PRODUCTS, TENSIONER_PRODUCT, plyBraceFor, crossBraceHoop, addBracingMark, removeBracingMark, cleanBracing, bracingForWall, bracingHeightMm, bracingMarkText } from "../../shared/takeoff/index.js";
import { cleanMeasurementInputs } from "../../server/lib/takeoff/takeoffService.mjs";

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 4).join("\n    ")}`); } }

const rect = (id, w, h, n, extra = {}) => ({ id, kind: "wall", inputs: { kind: "rect", widthMm: w, heightMm: h, name: n, ...extra } });
function ws(measurements) {
  const spec = wallFramingDefaults([]);
  spec.components.studs = { ...spec.components.studs, section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2", stock: { maxMm: null, unavailableMm: [] } };
  spec.components.noggins = { ...spec.components.noggins, stock: { maxMm: null, unavailableMm: [] } };
  const mk = methodFor(spec);
  const walls = { id: "walls", name: "Walls", methodKey: mk.key, methodVersion: mk.version, spec, rules: { ...WALL_FRAMING_RULES, carriesRoof: true } };
  const ids = measurements.map((m) => m.id);
  return { workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [], materials: [walls], measurements,
    contributions: ids.map((id, i) => ({ id: `c${i}`, measurementId: id, jobMaterialId: "walls", role: "wall" })) };
}
const lines = (c) => c.scheduleLines.filter((l) => l.roles).map((l) => ({ unit: l.unit, quantity: l.quantity, stockLengthMm: l.item.stockLengthMm, roles: l.roles, product: l.product || null, hoop: l.hoop || null, bracing: l.bracing || null }));
const bracingRows = (c) => (buildSupplierGroups([{ lines: lines(c) }]).find((g) => g.key === "bracing") || { rows: [] }).rows;

t("ply sheet length follows the wall height: the smallest stocked sheet that covers it", () => {
  assert.equal(plyBraceFor(2400).lengthMm, 2745);
  assert.equal(plyBraceFor(2745).lengthMm, 2745);
  assert.equal(plyBraceFor(2746).lengthMm, 3050);
  assert.equal(plyBraceFor(3050).lengthMm, 3050);
  assert.equal(plyBraceFor(3051), null, "no stocked sheet that long: never guessed");
  assert.equal(plyBraceFor(null), null);
  assert.deepEqual(PLY_BRACE_PRODUCTS.map((p) => p.name), ["BRACE OS H2 6X1200X2745MM", "BRACE OS H2 6X1200X3050MM"]);
  assert.ok(PLY_BRACE_PRODUCTS.every((p) => p.defaultToConfirm), "seed sheets are flagged to confirm");
});

t("cross brace hoop iron: 2 diagonals of sqrt(span² + height²), 2 tensioners; Sam's 2.7 × 1.6 × 2 is the rounded-up rule of thumb", () => {
  const a = crossBraceHoop(2700, 2700);
  assert.equal(a.diagonalMm, 3818.4);
  assert.equal(a.metres, 7.637);
  assert.equal(a.tensioners, 2);
  assert.equal(a.angleDeg, 45);
  const b = crossBraceHoop(2700, 2400);
  assert.equal(b.metres, 7.225);
  assert.ok(2.7 * 1.6 * 2 > b.metres, "the rule of thumb (8.64 m) allows more than the geometry");
  assert.equal(crossBraceHoop(0, 2400), null);
  assert.equal(crossBraceHoop(2700, null), null);
});

t("heights: rect, rake and gable use the tallest point", () => {
  assert.equal(bracingHeightMm({ kind: "rect", heightMm: 2400 }), 2400);
  assert.equal(bracingHeightMm({ kind: "rake", startHeightMm: 2400, endHeightMm: 3000 }), 3000);
  assert.equal(bracingHeightMm({ kind: "gable", eavesHeightMm: 2400, apexHeightMm: 3200 }), 3200);
  assert.equal(bracingHeightMm({ kind: "rect" }), null);
});

t("adding a mark: a ply sheet is centred on the tap and kept inside the wall; overlap is refused; remove undoes it (key deleted)", () => {
  const base = { kind: "rect", widthMm: 6000, heightMm: 2700 };
  const a = addBracingMark(base, { type: "ply", atMm: 3000, lengthMm: 6000, id: "p1" });
  assert.equal(a.ok, true);
  assert.deepEqual(a.mark, { id: "p1", type: "ply", xMm: 2400 });
  assert.equal(addBracingMark(a.inputs, { type: "ply", atMm: 3200, lengthMm: 6000 }).ok, false, "overlaps p1");
  const b = addBracingMark(a.inputs, { type: "ply", atMm: 100, lengthMm: 6000, id: "p2" });
  assert.equal(b.mark.xMm, 0, "kept inside the wall");
  assert.equal(addBracingMark(base, { type: "ply", atMm: 900, lengthMm: 900 }).ok, false, "wall shorter than a sheet");
  const c = addBracingMark(base, { type: "cross", atMm: 5900, lengthMm: 6000, id: "x1" });
  assert.deepEqual(c.mark, { id: "x1", type: "cross", xMm: 3300, spanMm: 2700 }, "default span 2,700, kept inside");
  assert.equal(addBracingMark(base, { type: "cross", atMm: 1000, lengthMm: 2000 }).ok, false, "cross longer than the wall");
  assert.match(addBracingMark(base, { type: "cross", atMm: 1000, lengthMm: 6000, spanMm: 100 }).error, /at least/);
  assert.deepEqual(removeBracingMark(a.inputs, "p1"), base, "removing the last mark leaves the inputs exactly as they were");
  assert.equal(removeBracingMark(b.inputs, "p1").bracing.length, 1);
  assert.match(bracingMarkText(a.mark, 2700), /2,400 mm · 2,745 long/);
});

t("the server re-checks the marks and keeps them on the wall's inputs", () => {
  assert.equal(cleanBracing([{ id: "a", type: "ply", xMm: 0 }, { id: "b", type: "cross", xMm: 100, spanMm: 2700, junk: 1 }]).ok, true);
  assert.deepEqual(cleanBracing([{ id: "b", type: "cross", xMm: 100.4, spanMm: 2700, junk: 1 }]).marks, [{ id: "b", type: "cross", xMm: 100, spanMm: 2700 }]);
  for (const bad of [[{ type: "ply", xMm: 0 }], [{ id: "a", type: "nail", xMm: 0 }], [{ id: "a", type: "cross", xMm: 0, spanMm: 10 }], [{ id: "a", type: "ply", xMm: -5 }], [{ id: "a", type: "ply", xMm: 0 }, { id: "a", type: "ply", xMm: 1500 }], "x"]) assert.equal(cleanBracing(bad).ok, false);
  const out = cleanMeasurementInputs("wall", { kind: "rect", widthMm: 4800, heightMm: 2700, bracing: [{ id: "p1", type: "ply", xMm: 0 }] }, null);
  assert.deepEqual(out.bracing, [{ id: "p1", type: "ply", xMm: 0 }]);
  assert.throws(() => cleanMeasurementInputs("wall", { kind: "rect", widthMm: 4800, heightMm: 2700, bracing: [{ id: "p1", type: "ply", xMm: "no" }] }, null));
  assert.ok(!("bracing" in cleanMeasurementInputs("wall", { kind: "rect", widthMm: 4800, heightMm: 2700, bracing: [] }, null)));
});

t("engine: ply sheets by wall height, cross-brace hoop joins the wall straps in ONE roll line, 2 tensioners per cross", () => {
  const marks = [{ id: "p1", type: "ply", xMm: 0 }, { id: "p2", type: "ply", xMm: 1500 }, { id: "x1", type: "cross", xMm: 2400, spanMm: 2400 }];
  const c = computeWorkspace(ws([rect("w1", 4800, 2745, "Wall 1", { bracing: marks })]));
  const ply = c.scheduleLines.find((l) => l.bracing?.id === PLY_BRACE_PRODUCTS[0].id);
  assert.equal(ply.quantity, 2);
  assert.equal(ply.finishedLengthMm, 2745);
  const ten = c.scheduleLines.find((l) => l.bracing?.id === TENSIONER_PRODUCT.id);
  assert.equal(ten.quantity, 2);
  const hoop = c.scheduleLines.filter((l) => l.hoop);
  assert.equal(hoop.length, 1, "wall straps + cross braces are one line");
  const cross = crossBraceHoop(2400, 2745).metres;
  assert.equal(hoop[0].item.hoopMetres, Number((8 * 0.7 + cross).toFixed(2)));
  assert.equal(hoop[0].quantity, 1);
  assert.match(hoop[0].item.note, /wall straps \+ .* m cross braces/);
  const rows = bracingRows(c);
  assert.deepEqual(rows.map((r) => r.product), ["HOOP IRON PUNCHED 0.8X30MM 30MT (ROLL)", "TENSIONER SET HEX HEAD (PCE)", "BRACE OS H2 6X1200X2745MM"]);
  assert.deepEqual(rows.map((r) => r.totalText), ["1.00 EA", "2.00 EA", "2.00 EA"]);
});

t("engine: a 3,000 mm wall takes the 3,050 sheet; a taller wall or one with no height is said, never counted or guessed", () => {
  const p = [{ id: "p1", type: "ply", xMm: 0 }];
  const tall = computeWorkspace(ws([rect("w1", 4800, 3000, "Wall 1", { bracing: p })]));
  assert.equal(tall.scheduleLines.find((l) => l.bracing)?.bracing.id, PLY_BRACE_PRODUCTS[1].id);
  const taller = computeWorkspace(ws([rect("w1", 4800, 3300, "Wall 1", { bracing: p })]));
  assert.ok(!taller.scheduleLines.some((l) => l.bracing));
  const said = (c) => JSON.stringify(Object.values(c.materialResults).flatMap((r) => r.problems || []));
  assert.match(said(taller), /bracing_note/);
  assert.match(said(taller), /no stocked sheet is that long/);
  const none = computeWorkspace(ws([{ id: "w1", kind: "wall", inputs: { kind: "rect", widthMm: 4800, name: "Wall 1", bracing: p } }]));
  assert.ok(!none.scheduleLines.some((l) => l.bracing));
  const b = bracingForWall([{ id: "x", type: "cross", xMm: 0, spanMm: 2700 }], 6000);
  assert.match(b.notes.join(" "), /degrees/, "a very steep cross brace is flagged for the bracing plan");
  const past = bracingForWall([{ id: "x", type: "ply", xMm: 4000 }], 2400, 4800);
  assert.match(past.notes.join(" "), /past the end of the wall/);
});

t("no marks, no bracing lines; marks change the calculation (a new dependency key)", () => {
  const plain = computeWorkspace(ws([rect("w1", 4800, 2700, "Wall 1")]));
  assert.ok(!plain.scheduleLines.some((l) => l.bracing));
  assert.equal(bracingRows(plain).length, 1, "only the wall straps' rolls");
  const braced = computeWorkspace(ws([rect("w1", 4800, 2700, "Wall 1", { bracing: [{ id: "p1", type: "ply", xMm: 0 }] })]));
  assert.notEqual(plain.materialResults.walls.dependencyKey ?? JSON.stringify(plain.scheduleLines), braced.materialResults.walls.dependencyKey ?? JSON.stringify(braced.scheduleLines));
});

t("supplier format: BRACING block, then TEMP BR and SB SCREW headings (manual only)", () => {
  const hoopId = { name: "HOOP IRON PUNCHED 0.8X30MM 30MT (ROLL)" };
  const calc = [{ lines: [
    { unit: "roll", quantity: 5, stockLengthMm: null, roles: { "hoop iron": 5 }, hoop: { ...hoopId, rollM: 30 } },
    { unit: "piece", quantity: 30, stockLengthMm: null, roles: { "bracing tensioner": 30 }, bracing: { name: TENSIONER_PRODUCT.name } },
    { unit: "piece", quantity: 10, stockLengthMm: 2745, roles: { "bracing sheet": 10 }, bracing: { name: PLY_BRACE_PRODUCTS[0].name } },
    { unit: "piece", quantity: 18, stockLengthMm: 3050, roles: { "bracing sheet": 18 }, bracing: { name: PLY_BRACE_PRODUCTS[1].name } },
  ] }];
  const manual = normaliseManualLines([{ id: "t1", heading: "tempbr", product: "PINE 90x35 MGP10 P/M", entry: "10/4.8" }, { id: "s1", heading: "sbscrew", product: "COACHSCREW 10X75 GALV (PK 10)", entry: "1 EA" }]).lines;
  const g = buildSupplierGroups(calc, manual);
  assert.deepEqual(g.map((x) => x.heading), ["BRACING", "TEMP BR", "SB SCREW"]);
  const line = (r) => [r.product, r.cutText, r.totalText || (r.unit === "EA" ? `${r.quantity} EA` : `${r.totalLm.toFixed(2)} LM`)].filter(Boolean).join(" — ");
  assert.deepEqual(g[0].rows.map(line), [
    "HOOP IRON PUNCHED 0.8X30MM 30MT (ROLL) — 5 — 5.00 EA", "TENSIONER SET HEX HEAD (PCE) — 30 — 30.00 EA", "BRACE OS H2 6X1200X2745MM — 10 — 10.00 EA", "BRACE OS H2 6X1200X3050MM — 18 — 18.00 EA"]);
  assert.equal(line(g[1].rows[0]), "PINE 90x35 MGP10 P/M — 10/4.8 — 48.00 LM");
  assert.equal(line(g[2].rows[0]), "COACHSCREW 10X75 GALV (PK 10) — 1 EA");
  assert.ok(MANUAL_HEADINGS.some(([k, x]) => k === "tempbr" && /TEMP BR/.test(x)) && MANUAL_HEADINGS.some(([k]) => k === "sbscrew"));
  assert.equal(memberGroup("tempbr").heading, "TEMP BR");
  assert.equal(BRACING_RULE.tensionersPerCross, 2);
});

console.log(`takeoff-tc-hub034: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
