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

await t("J2: 4,800 × 2,700 Axon, window inside one cell → 4 sheets (2750), net 12.15 m² (+ its own 7 pine battens and 1 roll of foam tape, wall-by-wall step 4)", () => {
  const c = computeWorkspace(j2());
  const ls = linesOf(c, "clad");
  // step 4 (21 Oct 2026): the Axon works out its own battens and foam tape — takeoff-tc-autobattens.test.mjs has the working
  // HUB 030: the battens are 90 × 35 H3 pine in 300 mm lengths (36.6 m → 2 × 5,700 + 4 × 5,400 + 3,600)
  assert.deepEqual(summary(ls), ["1 piece @3600", "1 roll", "2 piece @5700", "4 piece @5400", "4 sheet @2750"]);
  const lay = c.materialResults.clad.layouts[0];
  assert.ok(Math.abs(lay.areas.netM2 - 12.15) < 1e-9, String(lay.areas.netM2));
  assert.equal(ls[0].item.sku, "403932");
});
await t("J2: 4,801 wide → 5 sheets", () => {
  assert.deepEqual(summary(linesOf(computeWorkspace(j2(4801)), "clad").filter((l) => l.unit === "sheet")), ["5 sheet @2750"]);
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
  // + the Axon's own battens (pieces) and foam tape (a roll), wall-by-wall step 4 — still never merged
  assert.deepEqual(c.scheduleLines.map((l) => l.unit || "flashing").sort(), ["bar", "flashing", "piece", "piece", "piece", "piece", "roll", "sheet"], "rafters + the battens' three pine lengths");
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
  assert.deepEqual(snapshot.totals.byUnit, { piece: 18 + 7, sheet: 4, bar: 1, roll: 1 }); // 18 rafters + the Axon's 7 pine battens; its tape roll
  assert.equal(snapshot.appendix.aluminium[0].bars.length, 1);
  assert.equal(snapshot.appendix.flashingRuns.length, 1);
  const pdf = await renderSupplierOrderPdf(snapshot, { exportNo: 1, isDraft: false, snapshotSha256: "abc" });
  const app = await renderSiteAppendixPdf(snapshot, { exportNo: 1, snapshotSha256: "abc" });
  assert.ok(pdf.length > 1000 && app.length > 1000);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
});

// ── follow-ups from the UI reviews ─────────────────────────────────────────────
await t("06 dependency staleness: a draft line goes stale when its inputs change even if the totals don't (refresh clears it)", () => {
  const w = j2(); const c0 = computeWorkspace(w);
  const sl = c0.scheduleLines.find((l) => l.jobMaterialIds.includes("clad"));
  const order = { bucketKey: sl.bucketKey, specKey: sl.specKey, jobMaterialId: "clad", finishedLengthMm: sl.finishedLengthMm, quantity: sl.quantity, unit: sl.unit, item: sl.item };
  assert.equal(orderLineState(order, c0, w.materials).stale, false);
  const w2 = j2(); w2.measurements[1].inputs = { ...w2.measurements[1].inputs, xMm: 1400 }; // window moved; still 4 sheets
  const c1 = computeWorkspace(w2);
  assert.deepEqual(summary(linesOf(c1, "clad").filter((l) => l.unit === "sheet")), ["4 sheet @2750"]);
  const st = orderLineState(order, c1, w2.materials);
  assert.equal(st.problem, "line_stale_inputs");
  assert.equal(st.suggestion.bucketKey, order.bucketKey); // explicit update to the same bucket
  assert.equal(orderLineState({ ...order, item: st.suggestion.item }, c1, w2.materials).stale, false);
});
await t("spares are added on top of the layout quantity and shown separately", () => {
  const w = j2(); w.materials[0].spec = { ...w.materials[0].spec, spareRate: 10 };
  const l = linesOf(computeWorkspace(w), "clad")[0];
  assert.equal(l.quantity, 5); assert.equal(l.spareQuantity, 1); assert.match(l.item.note, /incl\. 1 spare \(10% of the material\)/);
});
await t("a timber trim run with a corner is TWO pieces (one per straight leg), never one bent member", () => {
  const trim = { id: "tr", name: "Trim", methodKey: "linear_stock", methodVersion: 1, spec: { family: "timber", purpose: "trim", section: { depthMm: 42, widthMm: 19 }, grade: "Merbau", treatment: "untreated" }, rules: {} };
  const c = computeWorkspace(ws({ materials: [trim], measurements: [path("p", [3000, 2000])], contributions: [con("c", "p", "tr")] }));
  assert.deepEqual(summary(linesOf(c, "tr")), ["1 piece @2100", "1 piece @3000"]); // 2,000 → 2,100 on the 300 mm timber grid
});
await t("a raked wall may start at 0 mm (triangle) — only an absent height is missing", () => {
  const w = j2(); w.measurements[0].inputs = { kind: "rake", widthMm: 4800, startHeightMm: 0, endHeightMm: 2700, name: "Tri" }; w.measurements.pop();
  const c = computeWorkspace(w);
  assert.ok(!c.materialResults.clad.problems.some((p) => p.code === "wall_incomplete"), JSON.stringify(c.materialResults.clad.problems));
  assert.ok(linesOf(c, "clad").length > 0);
});
await t("accessory set: recipe runs on the wall's real routes; a set needs only its name; missing recipe blocks", () => {
  const acc = (rules) => ({ id: "acc", name: "Starters", methodKey: "accessory_routes", methodVersion: 1, spec: { family: "accessory", product: { name: "Starter set" } }, rules });
  const base = j2();
  const none = computeWorkspace(ws({ materials: [acc({})], measurements: base.measurements, contributions: [con("c", "wall", "acc", "wall")] }));
  assert.ok(none.materialResults.acc.problems.some((p) => p.code === "recipe_missing"));
  assert.ok(!none.materialResults.acc.problems.some((p) => p.code === "material_incomplete"));
  const rec = { groups: [{ id: "starter", kind: "starter", routes: ["base"], stockPolicy: { kind: "list", lengthsMm: [6000], sharePieces: true, kerfMm: 0 } }] };
  const c = computeWorkspace(ws({ materials: [acc({ recipe: rec })], measurements: base.measurements, contributions: [con("c", "wall", "acc", "wall")] }));
  assert.deepEqual(summary(linesOf(c, "acc")), ["1 piece @6000"]);
});

// ── adversarial review fixes (engine) ─────────────────────────────────────────
const sumBy = (c, bucket) => c.contributions.reduce((a, x) => a + x.pieces.filter((p) => p.bucketKey === bucket).reduce((b, p) => b + p.quantity, 0), 0);
await t("QO-02/SEC-03: two materials with the same product never share a bucket", () => {
  const a = j2(); const b = j2();
  const w = ws({ materials: [a.materials[0], { ...b.materials[0], id: "clad2", name: "Axon B" }],
    measurements: [...a.measurements, { ...a.measurements[0], id: "wall2" }, { ...a.measurements[1], id: "win2", parentId: "wall2" }],
    contributions: [con("c1", "wall", "clad", "wall"), con("c2", "wall2", "clad2", "wall")] });
  const c = computeWorkspace(w);
  const keys = c.scheduleLines.map((l) => l.bucketKey);
  assert.equal(new Set(keys).size, keys.length);
  for (const l of c.scheduleLines) assert.equal(sumBy(c, l.bucketKey), l.quantity); // conservation per bucket
});
await t("QO-03/SEC-02: entered lengths on rafters are ordered; a kind the method can't read is a blocking problem (never dropped)", () => {
  const w = j1(); w.measurements.push({ id: "man", kind: "manual", finishedLengthMm: 2000, quantity: 2 }); w.contributions.push(con("cm2", "man", "tim"));
  const c = computeWorkspace(w);
  assert.deepEqual(summary(linesOf(c, "tim")), ["18 piece @5400", "2 piece @2100"]); // 2,000 → 2,100 on the 300 mm timber grid
  const w2 = j1(); w2.measurements.push({ id: "wl", kind: "wall", inputs: { kind: "rect", widthMm: 3000, heightMm: 2400 } }); w2.contributions.push(con("cw", "wl", "tim", "wall"));
  const c2 = computeWorkspace(w2);
  assert.ok(c2.materialResults.tim.problems.some((p) => p.code === "measurement_unused" && p.blocking));
  assert.equal(c2.orderReady, false);
});
await t("QO-04/QO-05/F02/F03: a horizontal joint is never bought as the cladding product — the Axon's own H-flashing (step 4), or named as NOT on the order where a hand-made accessory set owns the joints", () => {
  const w = j2(); w.measurements[0].inputs = { kind: "rect", widthMm: 4800, heightMm: 4000, name: "North" };
  w.materials[0].rules = { jointRows: { atMm: [2400], gapMm: 10, detailRef: "D1" } };
  const c = computeWorkspace(w);
  const ls = linesOf(c, "clad");
  // wall-by-wall step 4 (21 Oct 2026): every horizontal Axon joint takes Hardie H-flashing (code 305613), bought as itself
  assert.ok(ls.filter((l) => !l.follower).every((l) => l.unit === "sheet" && /Axon/.test(l.item.description)), JSON.stringify(ls.map((l) => l.item.description)));
  assert.deepEqual(ls.filter((l) => l.follower === "hflashing").map((l) => [l.quantity, l.item.description]), [[2, "Hardie™ 9mm Alum Horizontal H Flashing, code 305613 — 3,000 mm length"]]);
  assert.ok(!c.materialResults.clad.problems.some((p) => p.code === "component_not_selected"));
  // an older job whose accessory set (made by hand) has its own joint strip keeps it: the cladding's joint is named NOT on the order
  const acc = { id: "acc", name: "Joints", methodKey: "accessory_routes", methodVersion: 1, spec: { family: "accessory", product: { name: "Joint set" } },
    rules: { recipe: { groups: [{ id: "h", kind: "joint-strip", routes: ["joints"], stockPolicy: { kind: "list", lengthsMm: [3000], sharePieces: true, kerfMm: 0 } }] } } };
  const c2 = computeWorkspace({ ...w, materials: [...w.materials, acc], contributions: [...w.contributions, con("ca", "wall", "acc", "wall")] });
  assert.ok(linesOf(c2, "clad").every((l) => l.unit === "sheet" || ["battens", "tape"].includes(l.follower)), JSON.stringify(linesOf(c2, "clad").map((l) => l.item.description)));
  assert.ok(c2.materialResults.clad.problems.some((p) => p.code === "component_not_selected" && /Not on this order/.test(p.message)));
});
await t("QO-11: battens on two walls attribute each wall's pieces to that wall's contribution", () => {
  const bat = { id: "bt", name: "Battens", methodKey: "support_grid", methodVersion: 1, spec: { family: "batten", orientation: "vertical", product: { name: "Batten 70x35", widthMm: 70, thicknessMm: 35, lengthsMm: [3000] } }, rules: { maxSpacingMm: 600, fixingScope: { status: "by-others", reason: "framer" } } };
  const w = ws({ materials: [bat], measurements: [{ id: "N", kind: "wall", inputs: { kind: "rect", widthMm: 4800, heightMm: 2700, name: "North" } }, { id: "S", kind: "wall", inputs: { kind: "rect", widthMm: 3000, heightMm: 2700, name: "South" } }],
    contributions: [con("cN", "N", "bt", "wall"), con("cS", "S", "bt", "wall")] });
  const c = computeWorkspace(w);
  const n = c.contributions.find((x) => x.contributionId === "cN").pieces.reduce((a, p) => a + p.quantity, 0);
  const sth = c.contributions.find((x) => x.contributionId === "cS").pieces.reduce((a, p) => a + p.quantity, 0);
  assert.equal(n, 9); assert.equal(sth, 6);
});
await t("QO-08: random-length LM is rounded ONCE per material (not per wall then again)", () => {
  const tcm = { id: "tc", name: "Shiplap", methodKey: "area_to_linear", methodVersion: 2, spec: { family: "timber-cladding", layout: "course", orientation: "horizontal", supply: "random", orderIncrementM: 1,
    product: { name: "Shiplap", widthMm: 135, thicknessMm: 19, effectiveCoverMm: 120 } }, rules: {} };
  const walls = ["A", "B", "C"].map((id) => ({ id, kind: "wall", inputs: { kind: "rect", widthMm: 1010, heightMm: 1000, name: id } }));
  const c = computeWorkspace(ws({ materials: [tcm], measurements: walls, contributions: walls.map((w) => con(`c${w.id}`, w.id, "tc", "wall")) }));
  // 3 × 1.01 m² ÷ 0.12 = 25.25 LM → 26 LM once (per-wall rounding would give 3 × 9 = 27); its battens (step 4) are pieces
  assert.deepEqual(summary(linesOf(c, "tc").filter((l) => l.unit === "lm")), ["26 lm"]);
});
await t("QO-09/F12: full packs only when the supplier requires them; QO-14: spare % is per material, not per line", () => {
  const w = j2(); w.materials[0].spec = { ...w.materials[0].spec, product: { ...w.materials[0].spec.product, packQuantity: 3, fullPackRequired: true } };
  // the sheet pack size never rounds the Axon's own battens (step 4): still the 7 pine lengths
  assert.deepEqual(summary(linesOf(computeWorkspace(w), "clad").filter((l) => l.unit !== "roll")), ["1 piece @3600", "2 piece @5700", "4 piece @5400", "6 sheet @2750"]);
  const w2 = j2(); w2.materials[0].spec = { ...w2.materials[0].spec, spareRate: 10 };
  const ls = linesOf(computeWorkspace(w2), "clad");
  assert.equal(ls.filter((l) => l.unit === "sheet").reduce((a, l) => a + (l.spareQuantity || 0), 0), 1); // ceil(4 × 10 %) = 1 for the whole material
  assert.equal(ls.filter((l) => l.follower === "battens").reduce((a, l) => a + (l.spareQuantity || 0), 0), 1, "the battens' own spare: ceil(7 × 10 %), once for their lengths");
});
await t("QO-10/PH-06: connected collinear runs are one grid (18, not 20); a run traced twice is blocked; noise past a multiple adds no member", () => {
  const two = j1(); two.measurements[0] = line("d1", "distribution", 5000); two.measurements.push({ ...line("d2", "distribution", 5000), points: [{ x: 1 + 5000 / U, y: 1 }, { x: 1 + 10000 / U, y: 1 }] });
  two.contributions = [con("c1", "d1", "tim", "distribution"), con("c2", "d2", "tim", "distribution"), con("c-mem", "mem", "tim", "member")];
  assert.deepEqual(summary(linesOf(computeWorkspace(two), "tim")), ["18 piece @5400"]);
  const dup = j1(); dup.measurements.push({ ...line("dist2", "distribution", 10000) }); dup.contributions.push(con("c-d2", "dist2", "tim", "distribution"));
  const cd = computeWorkspace(dup);
  assert.ok(cd.materialResults.tim.problems.some((p) => p.code === "distribution_overlap" && p.blocking));
  const noise = j1(); noise.measurements[0] = line("dist", "distribution", 7200.000006);
  assert.deepEqual(summary(linesOf(computeWorkspace(noise), "tim")), ["13 piece @5400"]);
});
await t("F04/SEC-07: an offcut stamped for another finish isn't used; one longer than the stock is refused, never zeroing the order", () => {
  const mk = (inputs) => computeWorkspace(ws({ materials: [alu()], measurements: [opening("o1", 600, 2400, "W01"), { id: "off", kind: "offcut", inputs: { materialId: "alu", label: "Rack", ...inputs } }],
    contributions: [con("c1", "o1", "alu", "opening"), con("co", "off", "alu", "offcut")] }));
  const other = mk({ lengthMm: 6000, identityKey: "{\"family\":\"aluminium\",\"finish\":\"black\"}" });
  assert.deepEqual(summary(linesOf(other, "alu")), ["1 bar @6500"]);
  assert.ok(other.materialResults.alu.problems.some((p) => p.code === "offcut_other_product"));
  const huge = mk({ lengthMm: 100000 });
  assert.ok(huge.materialResults.alu.problems.some((p) => p.code === "offcut_too_long" && p.blocking));
});
await t("SEC-04/F05: a takeoff over the job limit is refused; a sub-millimetre accessory stock can't exhaust memory", () => {
  const meas = [], cons = [];
  for (let i = 0; i < 6; i++) { meas.push({ id: `w${i}`, kind: "wall", inputs: { kind: "rect", widthMm: 99000, heightMm: 2700, name: `W${i}` } }); cons.push(con(`c${i}`, `w${i}`, "st", "wall")); }
  const studs = { id: "st", name: "Studs", methodKey: "wall_frame", methodVersion: 1, spec: { family: "timber", purpose: "studs", section: { depthMm: 90, widthMm: 45 }, grade: "MGP10", treatment: "H2" }, rules: { centresMm: 20, studHeightMm: 2400 } };
  assert.throws(() => computeWorkspace(ws({ materials: [studs], measurements: meas, contributions: cons })), /more than 20,000 pieces/);
  const acc = { id: "acc", name: "Acc", methodKey: "accessory_routes", methodVersion: 1, spec: { family: "accessory", product: { name: "A" } },
    rules: { recipe: { groups: [{ id: "s", kind: "starter", identity: { n: 1 }, routes: ["base"], stockPolicy: { kind: "list", lengthsMm: [0.002] }, jointOverlapMm: 0.001 }] } } };
  const t0 = Date.now();
  const c = computeWorkspace(ws({ materials: [acc], measurements: [{ id: "w", kind: "wall", inputs: { kind: "rect", widthMm: 100000, heightMm: 2700, name: "N" } }], contributions: [con("c", "w", "acc", "wall")] }));
  assert.ok(Date.now() - t0 < 2000);
  assert.ok(c.materialResults.acc.problems.some((p) => /pieces of 0.002 mm stock/.test(p.message)));
});
await t("F08: support battens land on the cladding's vertical sheet joints (required stations)", () => {
  const a = j2(); a.measurements.pop();
  const bat = { id: "bt", name: "Battens", methodKey: "support_grid", methodVersion: 1, spec: { family: "batten", orientation: "vertical", product: { name: "Batten", widthMm: 70, thicknessMm: 35, lengthsMm: [5400] } }, rules: { maxSpacingMm: 900 } };
  const c = computeWorkspace(ws({ materials: [a.materials[0], bat], measurements: a.measurements, contributions: [con("c1", "wall", "clad", "wall"), con("c2", "wall", "bt", "wall")] }));
  const at = c.materialResults.bt.layouts[0].stations.map((s) => s.atMm);
  for (const j of [1200, 2400, 3600]) assert.ok(at.includes(j), `no support at sheet joint ${j}: ${at}`);
});

console.log(`takeoff-tc-integration: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
