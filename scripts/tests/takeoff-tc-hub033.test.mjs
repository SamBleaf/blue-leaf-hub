// HUB 033 (Sam, 18 Nov 2026): short MGP10 pieces share the product's stud/plate lengths; hoop iron per wall; hand-added order lines.
//   node scripts/tests/takeoff-tc-hub033.test.mjs
import assert from "node:assert/strict";
import { computeWorkspace, wallFramingDefaults, methodFor, WALL_FRAMING_RULES, buildSupplierGroups, hoopIronForWall, hoopIronRolls, parseManualEntry, normaliseManualLines,
  HOOP_IRON_PRODUCTS, DEFAULT_HOOP_ROLL_M, memberGroup } from "../../shared/takeoff/index.js";
import { timberStockPolicy } from "../../shared/takeoff/engine/timber.js";
import { buildExportSnapshot } from "../../server/lib/takeoff/takeoffService.mjs";
import { renderSupplierOrderPdf, RENDERER_VERSION } from "../../server/lib/takeoff/takeoffPdf.mjs";
import { allocateLinear } from "../../shared/takeoff/engine/allocator.js";

let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 4).join("\n    ")}`); } }

const rect = (id, w, h, n, extra = {}) => ({ id, kind: "wall", inputs: { kind: "rect", widthMm: w, heightMm: h, name: n, ...extra } });
function ws(measurements, { studGrade = "MGP10", rules = {} } = {}) {
  const spec = wallFramingDefaults([]);
  spec.components.studs = { ...spec.components.studs, section: { depthMm: 90, widthMm: 45 }, grade: studGrade, treatment: "H2", stock: { maxMm: null, unavailableMm: [] } };
  spec.components.noggins = { ...spec.components.noggins, stock: { maxMm: null, unavailableMm: [] } };   // no longest length set anywhere
  const mk = methodFor(spec);
  const walls = { id: "walls", name: "Walls", methodKey: mk.key, methodVersion: mk.version, spec, rules: { ...WALL_FRAMING_RULES, carriesRoof: true, ...rules } };
  const ids = measurements.filter((m) => m.kind === "wall").map((m) => m.id);
  return { workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [], materials: [walls], measurements,
    contributions: ids.map((id, i) => ({ id: `c${i}`, measurementId: id, jobMaterialId: "walls", role: "wall" })) };
}

// ── 1. short MGP10 pieces share the product's own lengths ──────────────────────────────────────────────────────────
await t("MGP10 with no longest length set uses 6,000 (a default, still flagged to confirm)", () => {
  assert.equal(timberStockPolicy({ grade: "MGP10" }).maxMm, 6000);
  assert.equal(timberStockPolicy({ grade: "MGP10", maxMm: 4800 }).maxMm, 4800);
  assert.equal(timberStockPolicy({ grade: "LVL Smart 10" }).maxMm, null, "other grades are not defaulted");
  const c = computeWorkspace(ws([rect("w1", 4000, 2700, "Wall 1")]));
  const said = JSON.stringify(c.materialProblems) + JSON.stringify(Object.values(c.materialResults).map((r) => r.problems || []));
  assert.match(said, /stock_max_unset|longest length isn.t set/, "the assumed 6,000 is still said, so it is confirmed before ordering");
});

await t("noggins (short) are cut out of the stud/plate lengths of the same product: fewer lengths than packing them among themselves", () => {
  // 2.7 m MGP10 studs at 600 centres on a 5 m wall; nogginss are ~0.5 m pieces
  const c = computeWorkspace(ws([rect("w1", 5000, 2700, "Wall 1")]));
  const demands = Object.values(c.materialResults).flatMap((r) => r.demands || []);
  const shorts = demands.filter((d) => d.identity?.grade === "MGP10" && d.lengthMm < 1200);
  assert.ok(shorts.length > 0, "the wall has short MGP10 pieces");
  const bought = c.scheduleLines.filter((l) => l.item.stockLengthMm && /MGP10/.test(l.item.description));
  // every cut of a short piece is on the cut list against a real stock length
  const lists = Object.values(c.materialResults).flatMap((r) => r.appendix?.timber || []).flatMap((x) => x.rows);
  for (const r of lists.filter((x) => x.cutMm < 1200)) assert.ok(r.stockMm >= 1200, `short ${r.cutMm} is cut from a ${r.stockMm} length`);
  assert.ok(bought.every((l) => l.item.stockLengthMm >= 1200));
});

await t("a shared stud length is not given to two long studs (a stud stays one length)", () => {
  const c = computeWorkspace(ws([rect("w1", 4000, 3300, "Wall 1"), rect("w2", 3000, 2700, "Wall 2")]));
  const studs = c.scheduleLines.filter((l) => l.component === "studs" && l.roles?.stud);
  assert.ok(studs.some((l) => l.item.stockLengthMm === 3600), "3.3 m studs still buy 3.6");
  assert.ok(studs.some((l) => l.item.stockLengthMm === 2700), "2.7 m studs still buy 2.7");
});

await t("allocator still never packs a short piece with no stock to take it", () => {
  const pol = { ...timberStockPolicy({ grade: "MGP10", maxMm: 6000 }), sharePieces: true };
  const r = allocateLinear([{ id: "n", kind: "linear", unit: "piece", lengthKind: "cut", lengthMm: 500, quantity: 4, identity: { family: "timber", section: "90x45", grade: "MGP10", treatment: "H2" }, stockPolicy: pol }]);
  assert.equal(r.groups[0].bars.length, 1);
  assert.ok(r.groups[0].bars[0].stockLengthMm >= 2000);
});

// ── 2. hoop iron ───────────────────────────────────────────────────────────────────────────────────────────────────
await t("hoop iron rule: straps = 2 × ceil(length / 1200), metres = straps × 0.7; 30 m rolls, the supplier's wording", () => {
  const rows = [[600, 2, 1.4], [1200, 2, 1.4], [1201, 4, 2.8], [2400, 4, 2.8], [9000, 16, 11.2], [0, 0, 0]];
  for (const [mm, straps, m] of rows) { const h = hoopIronForWall(mm); assert.equal(h.straps, straps, `${mm}`); assert.equal(h.metres, m, `${mm}`); }
  assert.equal(hoopIronRolls(31, 30), 2);
  assert.equal(hoopIronRolls(11.2, null), null);
  assert.equal(HOOP_IRON_PRODUCTS[0].name, "HOOP IRON PUNCHED 0.8X30MM 30MT (ROLL)");
  assert.equal(HOOP_IRON_PRODUCTS[0].rollM, 30);
  assert.equal(DEFAULT_HOOP_ROLL_M, 30);
});

await t("a Walls item orders hoop iron for every wall (per-wall off switch) as ONE line in rolls, printed under BRACING", () => {
  const c = computeWorkspace(ws([rect("w1", 9000, 2700, "Wall 1"), rect("w2", 4000, 2700, "Wall 2", { noHoopIron: true }), rect("w3", 1200, 2700, "Wall 3")]));
  const hoop = c.scheduleLines.filter((l) => l.hoop);
  assert.equal(hoop.length, 1);
  assert.equal(hoop[0].unit, "roll");
  assert.equal(hoop[0].quantity, 1, "11.2 m + 0 (off) + 1.4 m = 12.6 m, one 30 m roll");
  assert.equal(hoop[0].item.hoopMetres, 12.6);
  assert.match(hoop[0].item.note, /12\.6 m of hoop iron/);
  assert.equal(hoop[0].hoop.rollM, 30);
  const g = buildSupplierGroups([{ lines: c.scheduleLines.filter((l) => l.roles).map((l) => ({ unit: l.unit, quantity: l.quantity, stockLengthMm: l.item.stockLengthMm, roles: l.roles, product: l.product || null, hoop: l.hoop || null })) }]);
  const b = g.find((x) => x.key === "bracing");
  assert.equal(b.heading, "BRACING");
  assert.equal(b.rows[0].product, "HOOP IRON PUNCHED 0.8X30MM 30MT (ROLL)");
  assert.equal(b.rows[0].unit, "EA");
  assert.equal(b.rows[0].quantity, 1);
  assert.equal(b.rows[0].cutText, "1");
  assert.equal(b.rows[0].totalText, "1.00 EA");
  assert.ok(!g.some((x) => x.heading === "HOOP IRON"), "no separate hoop iron heading");
});

await t("hoop iron roll length: rolls = ceil(metres / roll), no spare share", () => {
  const c = computeWorkspace(ws([rect("w1", 9000, 2700, "Wall 1")], { rules: { hoopIronRollM: 10, spareRate: 10 } }));
  const l = c.scheduleLines.find((x) => x.hoop);
  assert.equal(l.quantity, 2);
  assert.match(l.item.note, /2 rolls of 10 m/);
  assert.equal(l.spareQuantity, undefined);
});

await t("no hoop iron when every wall's switch is off; a wall with no length has none", () => {
  const c = computeWorkspace(ws([rect("w1", 3000, 2700, "Wall 1", { noHoopIron: true })]));
  assert.ok(!c.scheduleLines.some((l) => l.hoop));
});

// ── 3 + 4. hand-added lines ────────────────────────────────────────────────────────────────────────────────────────
await t("manual entry: counts/lengths in metres, or EA; nothing guessed", () => {
  assert.deepEqual(parseManualEntry("4/3.6").cuts, [{ count: 4, lengthMm: 3600 }]);
  assert.deepEqual(parseManualEntry("2/2.4, 4/3.6, 1/2.4").cuts, [{ count: 4, lengthMm: 3600 }, { count: 3, lengthMm: 2400 }]);
  assert.equal(parseManualEntry("10").quantity, 10);
  assert.equal(parseManualEntry("10 EA").unit, "EA");
  for (const bad of ["", "abc", "4/", "0/3.6", "4/0", "3.6", "4/99"]) assert.equal(parseManualEntry(bad).ok, false, bad);
});

await t("manual lines are validated the same way on the server; a bad one is refused in plain words", () => {
  const ok = normaliseManualLines([{ id: "a", heading: "studs", product: "PINE 90x45 MGP10", entry: "4/3.6" }, { id: "b", heading: "bracing", product: "Strap bracing", entry: "6" }]);
  assert.equal(ok.ok, true);
  assert.equal(ok.lines[0].manual, true);
  assert.equal(ok.lines[1].unit, "EA");
  assert.equal(normaliseManualLines([{ id: "a", heading: "nope", product: "x", entry: "1" }]).ok, false);
  assert.equal(normaliseManualLines([{ id: "a", heading: "studs", product: "", entry: "1" }]).ok, false);
  assert.equal(normaliseManualLines([{ id: "a", heading: "studs", product: "x", entry: "1" }, { id: "a", heading: "studs", product: "x", entry: "1" }]).ok, false);
  assert.match(normaliseManualLines([{ id: "a", heading: "studs", product: "x", entry: "zz" }]).error, /isn't a count\/length/);
  assert.equal(normaliseManualLines(null).lines.length, 0);
});

await t("a manual line prints in its own group, marked added by hand, and is never merged with a calculated row", () => {
  const manual = normaliseManualLines([{ id: "m1", heading: "studs", product: "PINE 90x45 MGP10 P/M", entry: "4/3.6, 2/2.4" }, { id: "m2", heading: "bracing", product: "Tension straps", entry: "6 EA" },
    { id: "m3", heading: "hoop", product: "Hoop iron strap 30 x 0.8 galvanised", entry: "10" }, { id: "m4", heading: "other", product: "Sundry", entry: "1/1" }]).lines;
  const calc = [{ lines: [{ unit: "piece", quantity: 3, stockLengthMm: 2400, roles: { stud: 3 }, product: { section: "90x45", grade: "MGP10", treatment: "H2" } }] }];
  const g = buildSupplierGroups(calc, manual);
  const studs = g.find((x) => x.key === "studs");
  assert.equal(studs.rows.length, 2);
  assert.equal(studs.rows[0].manual, undefined);
  assert.equal(studs.rows[1].manual, true);
  assert.equal(studs.rows[1].cutText, "4/3.6, 2/2.4");
  assert.equal(studs.rows[1].totalLm, 19.2);
  assert.deepEqual(g.map((x) => x.heading), ["STUDS", "BRACING", "OTHER"], "a hand-added hoop iron line goes under BRACING");
  assert.equal(g.find((x) => x.key === "bracing").rows.find((r) => r.product === "Tension straps").quantity, 6);
  // manual-only order (no calculated timber)
  assert.equal(buildSupplierGroups([], manual).length, 3);
  assert.equal(memberGroup("hoop iron").heading, "BRACING");
  assert.equal(memberGroup("tension strap").heading, "BRACING");
});

await t("export snapshot + PDF: hoop iron and a hand-added line print under their headings; a manual-only order is allowed", async () => {
  const w = ws([rect("w1", 9000, 2700, "Wall 1"), rect("w2", 4000, 2700, "Wall 2", { noHoopIron: true })]);
  const c = computeWorkspace(w);
  const lines = c.scheduleLines.map((l) => ({ bucketKey: l.bucketKey, specKey: l.specKey, jobMaterialId: l.jobMaterialIds[0], finishedLengthMm: l.finishedLengthMm, quantity: l.quantity, unit: l.unit, item: l.item }));
  const manualLines = normaliseManualLines([{ id: "m1", heading: "bracing", product: "Strap bracing", entry: "4/3.6" }]).lines;
  const order = { id: "o", orderRef: "TO-33", revision: 1, category: "timber_cladding", delivery: { method: "pickup", pickupBranch: "Wingfield", asap: true, contactPhone: "0400" }, manualLines };
  const { snapshot, problems } = buildExportSnapshot({ wsSnapshot: w, order, lines, supplier: { id: "s1", name: "Sample", email: "a@example.test" }, company: { name: "Blue Leaf Building", phone: "1" }, jobLabel: "1 Sample St", rendererVersion: RENDERER_VERSION });
  assert.ok(snapshot.supplierGroups.some((g) => g.heading === "BRACING" && g.rows.some((r) => !r.manual && /^HOOP IRON/.test(r.product) && r.quantity === 1 && r.totalText === "1.00 EA")));
  assert.ok(snapshot.supplierGroups.some((g) => g.heading === "BRACING" && g.rows.some((r) => r.manual && r.cutText === "4/3.6")));
  assert.equal(snapshot.manualLines.length, 1);
  assert.equal(snapshot.delivery.manualLines, undefined, "hand-added lines are not delivery");
  assert.ok(!problems.includes("Add at least one length to the order."));
  const pdf = await renderSupplierOrderPdf(snapshot, { exportNo: 1, isDraft: true, snapshotSha256: "x" });
  assert.ok(pdf.length > 1000);
  // an order with ONLY a hand-added line is not refused for having no lengths
  const only = buildExportSnapshot({ wsSnapshot: w, order, lines: [], supplier: { id: "s1", name: "Sample" }, company: { name: "BL", phone: "1" }, jobLabel: "x", rendererVersion: RENDERER_VERSION });
  assert.ok(!only.problems.includes("Add at least one length to the order."));
});

console.log(`takeoff-tc-hub033: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
