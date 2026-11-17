// HUB 032 (Sam, 18 Nov 2026): the timber order laid out as Blue Leaf's supplier take-off (grouped by member role), and
// MGP10 only orderable in 600 mm lengths. Run: node scripts/tests/takeoff-tc-hub032.test.mjs
import assert from "node:assert/strict";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { computeWorkspace, wallFramingDefaults, methodFor, WALL_FRAMING_RULES, buildSupplierGroups, formatCuts, memberGroup, productText, splitByRole, metres,
  isMgp10Grade, timberGridFor, onTimberGrid, MGP10_GRID, TIMBER_GRID, CALCULATION_VERSION, SUPPLIER_ORDER_FORMAT, normaliseFamilySpec } from "../../shared/takeoff/index.js";
import { timberStockPolicy } from "../../shared/takeoff/engine/timber.js";
import { selectStock } from "../../shared/takeoff/engine/stock.js";
import { buildExportSnapshot, snapshotHash } from "../../server/lib/takeoff/takeoffService.mjs";
import { renderSupplierOrderPdf, RENDERER_VERSION } from "../../server/lib/takeoff/takeoffPdf.mjs";

let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 4).join("\n    ")}`); } }

const stock = (grade, over = {}) => timberStockPolicy({ grade, maxMm: 6000, ...over });
const buy = (mm, grade, over) => selectStock(mm, stock(grade, over)).stockMm;

await t("MGP10 grade detection: MGP10 / MGP 10 / mgp10 only; never MGP12, MGP15 or LVL Smart 10", () => {
  for (const g of ["MGP10", "mgp10", "MGP 10", " MGP10 "]) assert.equal(isMgp10Grade(g), true, g);
  for (const g of ["MGP12", "MGP15", "LVL SMART 10", "LVL Smart 10", "F7", "", null, undefined, "MGP100"]) assert.equal(isMgp10Grade(g), false, String(g));
  assert.deepEqual(timberGridFor("MGP10"), MGP10_GRID);
  assert.deepEqual(MGP10_GRID, { kind: "grid", minMm: 600, incrementMm: 600 });
  assert.deepEqual(timberGridFor("LVL Smart 10"), TIMBER_GRID);
});

await t("MGP10 600 rule: every cut buys the next multiple of 600 (2,650 → 3,000; 2,700 → 3,000, because 2,700 is not a multiple of 600)", () => {
  const rows = [[1, 600], [450, 600], [600, 600], [601, 1200], [1199, 1200], [1200, 1200], [1500, 1800], [2400, 2400], [2650, 3000], [2700, 3000], [3000, 3000], [3001, 3600], [3300, 3600], [5400, 5400], [5999, 6000], [6000, 6000]];
  for (const [need, want] of rows) assert.equal(buy(need, "MGP10"), want, `${need} → ${want}`);
  assert.equal(buy(6001, "MGP10"), null, "over the longest: unavailable, never clamped or spliced");
  assert.equal(selectStock(6001, stock("MGP10")).reason, "exceeds-max");
});

await t("MGP10 600 rule edge cases: a longest length off the grid, lengths marked not stocked, case and spacing of the grade", () => {
  assert.equal(buy(5500, "MGP10", { maxMm: 5700 }), null, "5,700 is not orderable, so the longest MGP10 is 5,400");
  assert.equal(buy(5400, "MGP10", { maxMm: 5700 }), 5400);
  assert.equal(buy(2650, "MGP10", { unavailableMm: [3000] }), 3600, "3,000 not stocked → the next 600 step");
  assert.equal(buy(2650, "MGP10", { unavailableMm: [1500, 2700] }), 3000, "a mark left from the old 300 grid (1,500, 2,700) is ignored, never refused");
  assert.equal(buy(2650, "mgp 10"), 3000);
  assert.deepEqual(stock("MGP10", { minMm: 1200, incrementMm: 300 }).minMm, 600, "a saved 1,200 + 300n spec on an MGP10 product is replaced by the 600 grid");
  assert.throws(() => stock("MGP10", { unavailableMm: [3100] }), /not a timber stock length/);
  assert.equal(onTimberGrid(1800, "MGP10"), true);
  assert.equal(onTimberGrid(1500, "MGP10"), false);
  assert.equal(onTimberGrid(1500, "LVL Smart 10"), true);
});

await t("other grades are untouched: LVL, MGP12 and MGP15 still buy 1,200 then 300 mm steps (2,650 → 2,700)", () => {
  for (const g of ["LVL Smart 10", "MGP12", "MGP15", null]) {
    assert.equal(buy(2650, g), 2700, String(g));
    assert.equal(buy(500, g), 1200, String(g));
    assert.equal(buy(1201, g), 1500, String(g));
  }
  assert.throws(() => timberStockPolicy({ grade: "MGP12", minMm: 600, incrementMm: 600 }), /for every supplier/);
});

await t("a saved MGP10 spec normalises to the 600 grid; an LVL spec to the 300 grid", () => {
  const spec = (grade) => normaliseFamilySpec({ family: "timber", purpose: "plates", section: { depthMm: 90, widthMm: 45 }, grade, treatment: "H2", stock: { maxMm: 6000, unavailableMm: [1500, 1800] } });
  assert.deepEqual([spec("MGP10").stock.minMm, spec("MGP10").stock.incrementMm, spec("MGP10").stock.unavailableMm], [600, 600, [1800]]);
  assert.deepEqual([spec("LVL Smart 10").stock.minMm, spec("LVL Smart 10").stock.incrementMm, spec("LVL Smart 10").stock.unavailableMm], [1200, 300, [1500, 1800]]);
});

// ── a real Walls run: MGP10 parts lock to 600, LVL keeps its lengths, and the order reads as the supplier take-off ──
const rect = (id, w, h, n) => ({ id, kind: "wall", inputs: { kind: "rect", widthMm: w, heightMm: h, name: n } });
function wallsWorkspace() {
  const spec = wallFramingDefaults([]);
  const mk = methodFor(spec);
  const walls = { id: "walls", name: "Walls", methodKey: mk.key, methodVersion: mk.version, spec, rules: { ...WALL_FRAMING_RULES, carriesRoof: true } };
  const ms = [rect("w1", 9000, 2700, "Wall 1"), rect("w2", 4000, 2700, "Wall 2"),
    { id: "d1", kind: "opening", parentId: "w1", inputs: { xMm: 1000, sillMm: 0, widthMm: 820, heightMm: 2040, label: "D1", type: "door" } },
    { id: "o1", kind: "opening", parentId: "w2", inputs: { xMm: 1200, sillMm: 900, widthMm: 1800, heightMm: 1200, label: "W1", type: "window" } }];
  return { workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [], calibrations: [], materials: [walls], measurements: ms,
    contributions: [{ id: "a", measurementId: "w1", jobMaterialId: "walls", role: "wall" }, { id: "b", measurementId: "w2", jobMaterialId: "walls", role: "wall" }] };
}

await t("Walls run: every MGP10 line is a multiple of 600; LVL studs keep their 300 mm lengths (2,700)", () => {
  const c = computeWorkspace(wallsWorkspace());
  const mgp = c.scheduleLines.filter((l) => isMgp10Grade(l.product?.grade));
  assert.ok(mgp.length >= 3, "plates and noggins are MGP10");
  for (const l of mgp) assert.equal(l.finishedLengthMm % 600, 0, `${l.item.description}`);
  const studs = c.scheduleLines.filter((l) => l.component === "studs");
  assert.ok(studs.some((l) => l.finishedLengthMm === 2700), "LVL studs still 2,700");
  assert.ok(c.scheduleLines.every((l) => l.roles && Object.keys(l.roles).length), "every timber line carries the roles it was bought for");
});

const supplier = { id: "s1", name: "Biancos (sample)", email: "orders@example.test", phone: "08 0000 0000" };
const company = { name: "Blue Leaf Building", phone: "08 1111 1111", email: "office@example.test" };
function exportOf(c, w, over = {}) {
  const lines = c.scheduleLines.map((l) => ({ bucketKey: l.bucketKey, specKey: l.specKey, jobMaterialId: l.jobMaterialIds[0], finishedLengthMm: l.finishedLengthMm, quantity: l.quantity, unit: l.unit, item: l.item, ...over }));
  return buildExportSnapshot({ wsSnapshot: w, order: { id: "o", orderRef: "TO-32", revision: 1, category: "timber_cladding", delivery: { method: "pickup", pickupBranch: "Wingfield", asap: true, contactPhone: "0400" } },
    lines, supplier, company, jobLabel: "1 Sample St", rendererVersion: RENDERER_VERSION });
}

await t("export snapshot: supplierGroups by member role, orderFormat stamped, items (the order's identity) unchanged", () => {
  const w = wallsWorkspace(), c = computeWorkspace(w);
  const { snapshot } = exportOf(c, w);
  assert.equal(snapshot.orderFormat, SUPPLIER_ORDER_FORMAT);
  assert.equal(snapshot.calculationVersion, CALCULATION_VERSION);
  assert.match(RENDERER_VERSION, /^takeoff-pdf@5$/);
  assert.deepEqual(snapshot.supplierGroups.map((g) => g.heading), ["T&B PLATES", "STUDS", "JAMB STUDS", "HD & SILL TR", "NOGGINS"].filter((h) => snapshot.supplierGroups.some((g) => g.heading === h)));
  assert.ok(snapshot.supplierGroups.some((g) => g.heading === "T&B PLATES") && snapshot.supplierGroups.some((g) => g.heading === "NOGGINS"));
  assert.equal(snapshot.items[0].lines.length, c.scheduleLines.length, "one ledger line per bought length, exactly as before");
  // pieces bought on the order add back to the pieces printed on the take-off (nothing lost or invented)
  const ordered = c.scheduleLines.reduce((a, l) => a + l.quantity, 0);
  const printed = snapshot.supplierGroups.reduce((a, g) => a + g.rows.reduce((b, r) => b + (r.unit === "EA" ? r.quantity : r.cuts.reduce((x, k) => x + k.count, 0)), 0), 0);
  assert.equal(printed, ordered);
});

await t("worked example: Sam's supplier take-off (plates MGP10 + LVL, precut studs, jambs, junction blocks, head and sill trimmers)", () => {
  const L = (unit, quantity, stockLengthMm, roles, product) => ({ unit, quantity, stockLengthMm, roles, product });
  const pine = (section, treatment = "H2") => ({ section, grade: "MGP10", treatment, species: null });
  const lvl = (section) => ({ section, grade: "LVL SMART 10", treatment: "H2", species: null });
  const plates = [[12, 6000], [4, 5400], [9, 4800], [9, 4200], [8, 3600], [3, 3300], [6, 3000], [2, 2700], [8, 2400]];
  const items = [{ lines: [
    ...plates.map(([n, mm]) => L("piece", n, mm, { "bottom-plate": n / 2 | 0 || n, "top-plate": n - (n / 2 | 0 || n) }, pine("90x45"))),
    ...[[7, 8400], [4, 7800], [6, 7200], [5, 6600]].map(([n, mm]) => L("piece", n, mm, { "bottom-plate": 1, "top-plate": n - 1 }, lvl("90x45"))),
    L("piece", 270, 2700, { stud: 270 }, lvl("90x35")), L("piece", 95, 3000, { stud: 95 }, lvl("90x35")),
    L("piece", 15, 5100, { stud: 15 }, lvl("90x35")), L("piece", 8, 4800, { stud: 8 }, lvl("90x35")),
    ...[[2, 4800], [2, 4200], [2, 3600], [4, 3300], [24, 3000], [42, 2700]].map(([n, mm]) => L("piece", n, mm, { king: n - 1, jack: 1 }, pine("90x35"))),
    L("piece", 14, 2700, { junction: 14 }, pine("90x45")),
    L("piece", 2, 4800, { "head trimmer": 1, "sill trimmer": 1 }, pine("90x45")), L("piece", 4, 3600, { "sill trimmer": 4 }, pine("90x45")),
  ] }];
  const g = buildSupplierGroups(items);
  assert.deepEqual(g.map((x) => x.heading), ["T&B PLATES", "STUDS", "JAMB STUDS", "JUNCT. BLK", "HD & SILL TR"]);
  const tb = g[0];
  assert.deepEqual(tb.rows.map((r) => r.product), ["PINE 90x45 MGP10 P/M", "LVL SMART10 H2 90X45 P/M"], "pine row, then the LVL row");
  assert.equal(tb.rows[0].cutText, "12/6, 4/5.4, 9/4.8, 9/4.2, 8/3.6, 3/3.3, 6/3, 2/2.7, 8/2.4");
  assert.equal(tb.rows[0].totalLm, 255.9);
  assert.equal(tb.rows[1].cutText, "7/8.4, 4/7.8, 6/7.2, 5/6.6");
  assert.equal(tb.rows[1].totalLm, 166.2);
  const studs = g[1].rows;
  assert.deepEqual(studs.map((r) => [r.product, r.unit, r.quantity ?? r.cutText, r.totalLm ?? null]), [
    ["LVL SMART10 H2 90X35 P/M", "LM", "15/5.1, 8/4.8", 114.9],
    ["LVL STUD SMART10 H2 90X35 2.7M", "EA", 270, null], ["LVL STUD SMART10 H2 90X35 3M", "EA", 95, null]]);
  assert.equal(g[2].rows[0].cutText, "2/4.8, 2/4.2, 2/3.6, 4/3.3, 24/3, 42/2.7");
  assert.equal(g[2].rows[0].totalLm, 223.8);
  assert.deepEqual([g[3].rows[0].cutText, g[3].rows[0].totalLm], ["14/2.7", 37.8]);
  assert.deepEqual([g[4].rows[0].cutText, g[4].rows[0].totalLm], ["2/4.8, 4/3.6", 24]);
});

await t("formatting and grouping helpers", () => {
  assert.deepEqual([6000, 5400, 2700, 3000, 3300, 450].map(metres), ["6", "5.4", "2.7", "3", "3.3", "0.45"]);
  assert.equal(formatCuts([{ count: 2, lengthMm: 2700 }, { count: 12, lengthMm: 6000 }]), "12/6, 2/2.7", "longest first");
  const key = (r) => memberGroup(r).heading;
  assert.deepEqual(["bottom-plate", "top-plate", "top-2-plate", "stud", "below-sill", "above-head", "king", "jack", "head trimmer", "sill trimmer", "lintel", "noggin", "noggin-return", "junction"].map(key),
    ["T&B PLATES", "T&B PLATES", "T&B PLATES", "STUDS", "STUDS", "STUDS", "JAMB STUDS", "JAMB STUDS", "HD & SILL TR", "HD & SILL TR", "LINTELS", "NOGGINS", "NOGGINS", "JUNCT. BLK"]);
  assert.equal(key("rafter"), "RAFTERS");
  assert.equal(productText({ section: "90x35", grade: "MGP10", treatment: "UNTREATED" }), "PINE 90x35 MGP10 UNTREATED P/M");
  assert.equal(productText({ section: "90x45", grade: "MGP10", treatment: "H3" }, { precutMm: 3000 }), "PINE STUD 90x45 MGP10 H3 3M");
  assert.deepEqual(splitByRole({ stud: 3, jack: 1 }, 8), [["jack", 2], ["stud", 6]], "a raised line is shared in proportion and still adds up");
  assert.deepEqual(splitByRole({ stud: 3, jack: 1 }, 3).reduce((a, [, n]) => a + n, 0), 3);
  assert.deepEqual(splitByRole(null, 4), [["other", 4]]);
});

await t("the PDF prints the take-off: group headings, product rows, count/length cuts, LM, and takeoff-pdf@5 in the footer; an old snapshot still renders", async () => {
  const w = wallsWorkspace(), c = computeWorkspace(w);
  const { snapshot } = exportOf(c, w);
  const read = async (snap) => {
    const buf = await renderSupplierOrderPdf(snap, { exportNo: 1, isDraft: true, snapshotSha256: snapshotHash(snap) });
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, verbosity: 0 }).promise;
    let out = "";
    for (let i = 1; i <= doc.numPages; i++) out += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(" ") + " ";
    await doc.destroy();
    return out;
  };
  const text = await read(snapshot);
  for (const s of ["TIMBER", "T&B PLATES", "STUDS", "NOGGINS", "P/M", "LM", "takeoff-pdf@5"]) assert.ok(text.includes(s), s);
  assert.ok(/\d+\/\d(\.\d)?/.test(text), "count/length cuts");
  assert.ok(!/mm length/.test(text.split("DRAFT")[0] || ""), "no per-stock-length rows any more");
  const { supplierGroups: _g, orderFormat: _f, ...old } = snapshot;
  void _g; void _f;
  old.items = old.items.map(({ inSupplierGroups: _i, ...x }) => x);
  const oldText = await read(old);
  assert.ok(oldText.includes("mm length"), "a snapshot frozen before @5 keeps its own table");
});

console.log(`takeoff-tc-hub032: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
