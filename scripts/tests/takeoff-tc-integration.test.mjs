// TC-R04 integration — the generic engine through the SAME computeWorkspace the UI and server use:
// method dispatch → demands → one allocator → purchase lines → order snapshot → supplier PDF + site appendix.
// Journeys J1 (timber), J2 (Axon), the aluminium example (11), continuous flashing paths (13) and J5 (mixed).
//   node scripts/tests/takeoff-tc-integration.test.mjs
import assert from "node:assert/strict";
import { buildCalibration, verifyCalibration, computeWorkspace, orderLineState, starterProfile } from "../../shared/takeoff/index.js";
import { aluminiumPreset, productGroups, specFromGroup } from "../../shared/takeoff/products/index.js";
import { buildExportSnapshot } from "../../server/lib/takeoff/takeoffService.mjs";
import { renderSiteAppendixPdf, renderSupplierOrderPdf } from "../../server/lib/takeoff/takeoffPdf.mjs";

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.stack?.split("\n").slice(0, 3).join("\n    ")}`); }
}

// 1 PDF unit = 20 mm on both axes, verified (order-ready)
const cal = verifyCalibration(buildCalibration({ horizontal: { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, knownMm: 2000 }, vertical: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 100 }, knownMm: 2000 } }).calibration,
  { p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 }, expectedMm: 1000 });
const U = 20;
const ws = (over = {}) => ({ workspace: { id: "w", name: "t", revision: 1, state: "active", owner: { carpentryJobId: "j" } }, documents: [{ id: "d", status: "current" }],
  calibrations: [{ ...cal, id: "cal", documentId: "d", pageIndex: 0, calibrationRevision: 1 }], materials: [], measurements: [], contributions: [], ...over });
const line = (id, kind, mm, inputs) => ({ id, kind, documentId: "d", pageIndex: 0, calibrationId: "cal", points: [{ x: 1, y: 1 }, { x: 1 + mm / U, y: 1 }], ...(inputs ? { inputs } : {}) });
const path = (id, legsMm, inputs) => {
  const pts = [{ x: 1, y: 1 }];
  legsMm.forEach((mm, i) => { const p = pts[pts.length - 1]; pts.push(i % 2 ? { x: p.x, y: p.y + mm / U } : { x: p.x + mm / U, y: p.y }); });
  return { id, kind: "polyline", documentId: "d", pageIndex: 0, calibrationId: "cal", points: pts, ...(inputs ? { inputs } : {}) };
};
const con = (id, measurementId, jobMaterialId, role = "primary") => ({ id, measurementId, jobMaterialId, role });
const linesOf = (c, matId) => c.scheduleLines.filter((l) => l.jobMaterialIds.includes(matId));
const summary = (ls) => ls.map((l) => `${l.quantity} ${l.unit}${l.finishedLengthMm ? ` @${l.finishedLengthMm}` : ""}`).sort();

// ── J1 timber ─────────────────────────────────────────────────────────────────
const rafters = (rules = {}) => ({ id: "tim", name: "Rafters 90x45", methodKey: "repeated_members", methodVersion: 2,
  spec: { family: "timber", purpose: "rafters", section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H3", endAllowanceMm: 100 },
  rules: { centresMm: 600, lengthSource: "projected", pitchDeg: 30, ...rules } });
const j1 = (rules) => ws({ materials: [rafters(rules)],
  measurements: [line("dist", "distribution", 10000, { startOffsetMm: 0, endOffsetMm: 0, includeStart: true, includeEnd: true, spacing: "fixed", overrides: [] }), line("mem", "member", 4500, { mode: "projected" })],
  contributions: [con("c-dist", "dist", "tim", "distribution"), con("c-mem", "mem", "tim", "member")] });

await t("J1: 10,000 run @600 = 18 rafters; 4,500 @30° + 100 → 5,400 stock; 18 × 5,400 = 97,200 mm", () => {
  const c = computeWorkspace(j1());
  const ls = linesOf(c, "tim");
  assert.deepEqual(summary(ls), ["18 piece @5400"]);
  assert.equal(ls[0].quantity * ls[0].finishedLengthMm, 97200);
  assert.equal(ls[0].problems.length, 0, ls[0].problems.join("; "));
  assert.equal(c.materialResults.tim.status.procurement, "ready");
});
await t("J1: true length never applies pitch (4,500 + 100 → 4,800 stock)", () => {
  assert.deepEqual(summary(linesOf(computeWorkspace(j1({ lengthSource: "true" })), "tim")), ["18 piece @4800"]);
});
await t("J1: purchase units attribute back to the distribution contribution (allocation conservation)", () => {
  const c = computeWorkspace(j1());
  const dist = c.contributions.find((x) => x.contributionId === "c-dist");
  assert.equal(dist.pieces.reduce((a, p) => a + p.quantity, 0), 18);
});
await t("J1: grade change makes a draft order line stale (identity)", () => {
  const c0 = computeWorkspace(j1());
  const l = c0.scheduleLines[0];
  const order = { bucketKey: l.bucketKey, specKey: l.specKey, jobMaterialId: "tim", finishedLengthMm: l.finishedLengthMm, quantity: 18, unit: "piece" };
  assert.equal(orderLineState(order, c0, j1().materials).stale, false);
  const w2 = j1(); w2.materials[0].spec.grade = "MGP12";
  const st = orderLineState(order, computeWorkspace(w2), w2.materials);
  assert.equal(st.stale, true);
});
await t("J1: no distribution run → blocking problem, never zero", () => {
  const w = j1(); w.contributions = [con("c-mem", "mem", "tim", "member")];
  const c = computeWorkspace(w);
  assert.equal(linesOf(c, "tim").length, 0);
  assert.ok(c.materialResults.tim.problems.some((p) => p.code === "distribution_missing" && p.blocking));
});

// ── J2 Axon ───────────────────────────────────────────────────────────────────
const axon = productGroups({ family: "cladding" }).find((g) => g.name === "Axon 133 smooth");
const j2 = (widthMm = 4800) => ws({
  materials: [{ id: "clad", name: "Axon", methodKey: "sheet_layout", methodVersion: 2, spec: specFromGroup(axon), rules: {} }],
  measurements: [{ id: "wall", kind: "wall", inputs: { kind: "rect", widthMm, heightMm: 2700, name: "North" } },
    { id: "win", kind: "opening", parentId: "wall", inputs: { xMm: 1350, sillMm: 900, widthMm: 900, heightMm: 900, label: "W01" } }],
  contributions: [con("c-wall", "wall", "clad", "wall")] });

await t("J2: 4,800 × 2,700 Axon, window inside one cell → 4 sheets (2750), net 12.15 m²", () => {
  const c = computeWorkspace(j2());
  const ls = linesOf(c, "clad");
  assert.deepEqual(summary(ls), ["4 sheet @2750"]);
  const lay = c.materialResults.clad.layouts[0];
  assert.ok(Math.abs(lay.areas.netM2 - 12.15) < 1e-9, String(lay.areas.netM2));
  assert.equal(ls[0].item.sku, "403932");
});
await t("J2: 4,801 wide → 5 sheets", () => {
  assert.deepEqual(summary(linesOf(computeWorkspace(j2(4801)), "clad")), ["5 sheet @2750"]);
});
await t("J2: wall without heights is an incomplete draft (blocks), not zero", () => {
  const w = j2(); w.measurements[0].inputs = { kind: "rect", widthMm: 4800, name: "North" };
  const c = computeWorkspace(w);
  assert.equal(linesOf(c, "clad").length, 0);
  assert.ok(c.materialResults.clad.problems.some((p) => p.code === "wall_incomplete"));
});

// ── Aluminium (11) ────────────────────────────────────────────────────────────
const alu = (extra = {}) => ({ id: "alu", name: "Angle 50x50x3", methodKey: "linear_stock", methodVersion: 1, spec: { ...aluminiumPreset(), kerfMm: 3, kerfConfirmed: true, ...extra }, rules: {} });
const opening = (id, w, h, label) => ({ id, kind: "opening", inputs: { xMm: 0, sillMm: 0, widthMm: w, heightMm: h, label } });
await t("ALU 1: 600 × 2400 window → 2500 + 2500 + 600 → ONE 6500 bar, 891 remainder", () => {
  const c = computeWorkspace(ws({ materials: [alu()], measurements: [opening("o1", 600, 2400, "W01")], contributions: [con("c1", "o1", "alu", "opening")] }));
  assert.deepEqual(summary(linesOf(c, "alu")), ["1 bar @6500"]);
  const bars = c.materialResults.alu.appendix.aluminium[0].bars;
  assert.equal(bars.length, 1);
  assert.deepEqual(bars[0].cuts.map((x) => x.lengthMm).sort((a, b) => a - b), [600, 2500, 2500]);
  assert.ok(Math.abs(bars[0].residualMm - 891) < 1e-9, String(bars[0].residualMm));
});
await t("ALU 3: three 3400 cuts need THREE bars (not ceil(LM/6.5))", () => {
  const c = computeWorkspace(ws({ materials: [alu()], measurements: [{ id: "m", kind: "manual", finishedLengthMm: 3400, quantity: 3 }], contributions: [con("c", "m", "alu")] }));
  assert.deepEqual(summary(linesOf(c, "alu")), ["3 bar @6500"]);
});
await t("ALU 5: cross-window pooling 4000+2400+2500+2500+600 → two bars, labels kept", () => {
  const c = computeWorkspace(ws({ materials: [alu()],
    measurements: [opening("o1", 600, 2400, "W01"), { id: "m1", kind: "manual", finishedLengthMm: 4000, quantity: 1 }, { id: "m2", kind: "manual", finishedLengthMm: 2400, quantity: 1 }],
    contributions: [con("c1", "o1", "alu", "opening"), con("c2", "m1", "alu"), con("c3", "m2", "alu")] }));
  assert.deepEqual(summary(linesOf(c, "alu")), ["2 bar @6500"]);
  const labels = c.materialResults.alu.appendix.aluminium[0].bars.flatMap((b) => b.cuts.map((x) => x.label));
  assert.ok(labels.includes("W01 left jamb") && labels.includes("W01 bottom"));
});
await t("ALU 6: 6501 cut is unavailable (blocking), never spliced", () => {
  const c = computeWorkspace(ws({ materials: [alu()], measurements: [{ id: "m", kind: "manual", finishedLengthMm: 6501, quantity: 1 }], contributions: [con("c", "m", "alu")] }));
  assert.ok(c.materialResults.alu.problems.some((p) => p.code === "unavailable_stock" && p.blocking));
  assert.equal(c.materialResults.alu.status.procurement, "unavailable-stock");
});
await t("ALU: unconfirmed kerf blocks ordering (estimate only)", () => {
  const c = computeWorkspace(ws({ materials: [alu({ kerfMm: null, kerfConfirmed: false })], measurements: [opening("o1", 600, 2400, "W01")], contributions: [con("c1", "o1", "alu", "opening")] }));
  assert.ok(linesOf(c, "alu").every((l) => l.problems.length > 0));
  assert.equal(c.orderReady, false);
});

// ── Continuous flashing paths (13) ────────────────────────────────────────────
const flashing = { id: "fl", name: "Barge", methodKey: "flashing_runs", methodVersion: 1, rules: {}, spec: { product: "Flashing", finish: "COLORBOND", bmt: 0.55, colour: "Monument" }, profile: starterProfile() };
await t("FLASH 1: four 750 legs → tight 3000 → ONE 3200 piece (no per-corner allowance)", () => {
  const c = computeWorkspace(ws({ materials: [flashing], measurements: [path("p", [750, 750, 750, 750])], contributions: [con("c", "p", "fl")] }));
  assert.deepEqual(c.scheduleLines.map((l) => `${l.quantity}×${l.finishedLengthMm}`), ["1×3200"]);
  assert.deepEqual(c.contributions[0].path.cornersMm, [750, 1500, 2250]);
});
await t("FLASH 6: 10,000 path flagged until split; split at 8,800 → 9,000 + 1,400", () => {
  const c0 = computeWorkspace(ws({ materials: [flashing], measurements: [path("p", [5000, 5000])], contributions: [con("c", "p", "fl")] }));
  assert.ok(c0.scheduleLines[0].problems.includes("ceiling_exceeded"));
  assert.equal(c0.contributions[0].path.overflow.legalSplitMm, 8800);
  const c1 = computeWorkspace(ws({ materials: [flashing], measurements: [path("p", [5000, 5000], { splitsMm: [8800] })], contributions: [con("c", "p", "fl")] }));
  assert.deepEqual(c1.scheduleLines.map((l) => `${l.quantity}×${l.finishedLengthMm}`).sort(), ["1×1400", "1×9000"]);
  assert.ok(c1.scheduleLines.every((l) => !l.problems.length));
});

// ── J5 mixed procurement + export ─────────────────────────────────────────────
const j5 = () => {
  const a = j1(), b = j2();
  return ws({
    materials: [...a.materials, ...b.materials, alu(), flashing],
    measurements: [...a.measurements, ...b.measurements, opening("o1", 600, 2400, "W01"), path("p", [750, 750, 750, 750])],
    contributions: [...a.contributions, ...b.contributions, con("c-o1", "o1", "alu", "opening"), con("c-p", "p", "fl")],
  });
};
await t("J5: mixed job — units never merge (pieces, sheets, bars, flashing lengths)", () => {
  const c = computeWorkspace(j5());
  assert.deepEqual(c.scheduleLines.map((l) => l.unit || "flashing").sort(), ["bar", "flashing", "piece", "sheet"]);
  assert.equal(c.totalLm, 3.2); // LM total is flashing only
  assert.equal(c.orderReady, true, JSON.stringify(c.scheduleLines.map((l) => l.problems)));
});
await t("J5: order snapshot → MATERIAL ORDER PDF (bars/sheets/pieces) + separate site appendix", async () => {
  const w = j5();
  const c = computeWorkspace(w);
  const lines = c.scheduleLines.map((l) => ({ bucketKey: l.bucketKey, specKey: l.specKey, jobMaterialId: l.jobMaterialIds[0], finishedLengthMm: l.finishedLengthMm, quantity: l.quantity, unit: l.unit || "piece" }));
  const { snapshot, problems } = buildExportSnapshot({ wsSnapshot: w, order: { id: "o", orderRef: "TO-1", revision: 1, delivery: { method: "pickup", pickupBranch: "Wingfield", asap: true, contactPhone: "0400" } },
    lines, supplier: { id: "s", name: "Supplier" }, company: { name: "Blue Leaf", phone: "08" }, jobLabel: "1 Example St", rendererVersion: "test" });
  assert.deepEqual(problems, []);
  assert.equal(snapshot.items.length, 3);
  assert.deepEqual(snapshot.totals.byUnit, { piece: 18, sheet: 4, bar: 1 });
  assert.equal(snapshot.appendix.aluminium[0].bars.length, 1);
  assert.equal(snapshot.appendix.flashingRuns.length, 1);
  const pdf = await renderSupplierOrderPdf(snapshot, { exportNo: 1, isDraft: false, snapshotSha256: "abc" });
  const app = await renderSiteAppendixPdf(snapshot, { exportNo: 1, snapshotSha256: "abc" });
  assert.ok(pdf.length > 1000 && app.length > 1000);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
});

console.log(`takeoff-tc-integration: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
