// TC-R04 stock selection + shared linear allocator (03 §T3/§T6, 11, 12 §Timber stock) against the production
// functions in shared/takeoff/engine/stock.js and allocator.js. Every STOCK-*, TIM-min-grid-*, CUT-* and ALI-*
// case of docs/takeoff/TC-R04/fixtures.json is asserted, plus the computational acceptance cases of 11.
//   node scripts/tests/takeoff-tc-allocator.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_GRID_LENGTHS, permittedStockLengths, selectStock, stockLengthsFrom, stockPolicyProblem } from "../../shared/takeoff/engine/stock.js";
import { DEFAULT_NODE_BUDGET, MAX_CUTS, allocateLinear, simulateBar } from "../../shared/takeoff/engine/allocator.js";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

const FIXTURES = JSON.parse(readFileSync(new URL("../../docs/takeoff/TC-R04/fixtures.json", import.meta.url), "utf8")).cases;
const fixtures = (prefix) => FIXTURES.filter((c) => c.id.startsWith(prefix));
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-6, `${msg ?? ""} ${a} ≠ ${b}`);

// Synthetic products/policies (owner examples, not supplier catalogue data)
const ANGLE = { family: "aluminium", profile: { shape: "equal-angle", aMm: 50, bMm: 50, tMm: 3 }, finish: "mill" };
const ANGLE_BLACK = { ...ANGLE, finish: "black anodised" };
const ANGLE_40 = { ...ANGLE, profile: { shape: "equal-angle", aMm: 40, bMm: 40, tMm: 3 } };
const ALU = { kind: "fixed", lengthMm: 6500, kerfMm: 3, kerfConfirmed: true, endTrimMm: 0, finalEndAcceptable: false, sharePieces: true, minRetainedOffcutMm: 300 };
const TIMBER = { family: "timber", section: { depthMm: 90, widthMm: 45 }, grade: "mgp10", treatment: "h2", species: null };
const GRID = { kind: "grid", minMm: 1200, incrementMm: 600 }; // owner-confirmed timber grid (12)
const alu = (id, lengthMm, over = {}) => ({ id, kind: "linear", unit: "piece", lengthMm, quantity: 1, identity: ANGLE, stockPolicy: ALU, label: id, ...over });
const one = (r) => { assert.equal(r.groups.length, 1, "one group"); return r.groups[0]; };
const cutIds = (g) => g.bars.flatMap((b) => b.cuts.map((c) => c.cutId));

// ── fixtures.json ────────────────────────────────────────────────────────────
t("fixtures STOCK-* (4) via selectStock: grid, availability and maximum", () => {
  const cases = fixtures("STOCK-");
  assert.equal(cases.length, 4);
  for (const c of cases) {
    const i = c.input;
    if (i.available) {
      assert.equal(selectStock(i.need, { kind: "list", lengthsMm: i.available }).stockMm, c.expected, `${c.id} list`);
      // same availability expressed on the timber grid: unlisted grid lengths are unavailable
      const max = Math.max(...i.available);
      const unavailableMm = permittedStockLengths({ ...GRID, maxMm: max }).filter((l) => !i.available.includes(l));
      const r = selectStock(i.need, { ...GRID, maxMm: max, unavailableMm });
      assert.equal(r.stockMm, c.expected, `${c.id} grid`);
      assert.equal(r.reason, "grid-next-available");
    } else {
      assert.equal(selectStock(i.need, { kind: "grid", minMm: 1200, incrementMm: i.increment, maxMm: i.max ?? null }).stockMm, c.expected, c.id);
    }
  }
});
t("fixtures TIM-min-grid-* (6) via selectStock on the 1200/600 grid", () => {
  const cases = fixtures("TIM-min-grid-");
  assert.equal(cases.length, 6);
  for (const c of cases) assert.equal(selectStock(c.input.need, { kind: "grid", minMm: c.input.min, incrementMm: c.input.increment }).stockMm, c.expected, c.id);
});
t("fixtures CUT-* (2) via simulateBar (either end policy) and allocateLinear", () => {
  const cases = fixtures("CUT-");
  assert.equal(cases.length, 2);
  for (const c of cases) {
    const { cuts, stock, kerf, endTrim = 0 } = c.input;
    for (const finalEndAcceptable of [false, true]) assert.equal(simulateBar(stock, cuts, { kerfMm: kerf, endTrimMm: endTrim, finalEndAcceptable }).fits, c.expected, `${c.id} fea=${finalEndAcceptable}`);
    const g = one(allocateLinear(cuts.map((L, x) => alu(`${c.id}:${x}`, L, { stockPolicy: { ...ALU, lengthMm: stock, kerfMm: kerf } }))));
    assert.equal(g.barCount, c.expected ? 1 : 2, c.id);
  }
});
t("fixtures ALI-* (8) via simulateBar: residual or does-not-fit", () => {
  const cases = fixtures("ALI-");
  assert.equal(cases.length, 8);
  for (const c of cases) {
    const { cuts, stock, kerf, endTrim = 0, finalEndAcceptable } = c.input;
    const r = simulateBar(stock, cuts, { kerfMm: kerf, endTrimMm: endTrim, finalEndAcceptable });
    if (c.expected === null) { assert.equal(r.fits, false, c.id); assert.equal(r.residualMm, null, c.id); }
    else { assert.equal(r.fits, true, c.id); near(r.residualMm, c.expected, c.id); }
  }
});

// ── stock.js ─────────────────────────────────────────────────────────────────
t("T3 grid: exact multiple stays; float noise absorbed; a real 0.1 mm overrun still steps up", () => {
  assert.equal(selectStock(4200, GRID).stockMm, 4200);
  assert.equal(selectStock(4200 + 1e-9, GRID).stockMm, 4200);
  assert.equal(selectStock(4200.1, GRID).stockMm, 4800);
  assert.equal(selectStock(4200.1, GRID).reason, "grid");
});
t("T3 rejects non-positive / non-numeric need", () => {
  for (const need of [0, -1, NaN, Infinity, "4200", null]) {
    const r = selectStock(need, GRID);
    assert.equal(r.stockMm, null); assert.equal(r.reason, "invalid-need");
  }
});
t("never clamps: 4801 with maximum 4800 → unavailable (12); 7000 with maximum 6000 → unavailable", () => {
  const a = selectStock(4801, { ...GRID, maxMm: 4800 });
  assert.equal(a.stockMm, null); assert.equal(a.reason, "exceeds-max");
  assert.equal(selectStock(7000, { ...GRID, maxMm: 6000 }).stockMm, null);
  assert.equal(selectStock(4800, { ...GRID, maxMm: 4800 }).stockMm, 4800);
});
t("availability only removes grid lengths: never introduces an off-grid length or another minimum", () => {
  assert.equal(selectStock(4300, { ...GRID, unavailableMm: [4500] }).stockMm, 4800, "off-grid entry ignored");
  assert.equal(selectStock(500, { ...GRID, unavailableMm: [1200] }).stockMm, 1800, "no silent smaller minimum");
  const r = selectStock(4300, { ...GRID, maxMm: 5400, unavailableMm: [4800, 5400] });
  assert.equal(r.stockMm, null); assert.equal(r.reason, "no-available-length");
  for (let need = 1; need < 9000; need += 37.3) {
    const s = selectStock(need, { ...GRID, unavailableMm: [2400, 4500, 4800] }).stockMm;
    assert.ok(s >= need && s >= 1200 && (s - 1200) % 600 === 0 && s !== 2400 && s !== 4800, `${need} → ${s}`);
  }
});
t("grid minimum and increment are never defaulted silently; bad grids are invalid", () => {
  assert.equal(selectStock(500, { kind: "grid", incrementMm: 600 }).reason, "invalid-policy");
  assert.equal(selectStock(500, { kind: "grid", minMm: 1200 }).reason, "invalid-policy");
  assert.equal(selectStock(500, { ...GRID, maxMm: 600 }).reason, "invalid-policy");
  assert.equal(selectStock(500, { kind: "grid", minMm: 1, incrementMm: 0.001, maxMm: 1e6 }).reason, "invalid-policy");
  assert.ok(MAX_GRID_LENGTHS >= 1000);
});
t("same timber settings at two suppliers give the same 1200/600 stock (12)", () => {
  for (const need of [500, 1199, 1200, 1200.1, 1800, 1800.1, 4300, 9999]) {
    assert.equal(selectStock(need, { ...GRID }).stockMm, selectStock(need, { kind: "grid", incrementMm: 600, minMm: 1200, maxMm: null }).stockMm);
  }
});
t("list and fixed policies; random-length supply is not cut-allocated", () => {
  assert.deepEqual(selectStock(2401, { kind: "list", lengthsMm: [6000, 2400, 3600] }), { stockMm: 3600, reason: "list", message: "3600 mm listed stock length." });
  assert.equal(selectStock(6500, { kind: "fixed", lengthMm: 6500 }).stockMm, 6500);
  assert.equal(selectStock(6501, { kind: "fixed", lengthMm: 6500 }).stockMm, null);
  assert.equal(selectStock(1000, { kind: "random", orderIncrementM: 0.3 }).reason, "unsupported-policy");
});
t("permittedStockLengths / stockLengthsFrom: bounded grid listed, unbounded grid is a sequence (no 6 m cap)", () => {
  assert.deepEqual(permittedStockLengths({ ...GRID, maxMm: 4200, unavailableMm: [3000] }), [1200, 1800, 2400, 3600, 4200]);
  assert.equal(permittedStockLengths(GRID), null);
  const it = stockLengthsFrom(5000, GRID);
  assert.deepEqual([it.next().value, it.next().value, it.next().value, it.next().value], [5400, 6000, 6600, 7200]);
  assert.deepEqual(permittedStockLengths({ kind: "list", lengthsMm: [4800, 2400, 4800] }), [2400, 4800]);
});
t("stockPolicyProblem validates the cutting-loss fields", () => {
  assert.equal(stockPolicyProblem(ALU), null);
  assert.equal(stockPolicyProblem({ ...ALU, kerfMm: -1 }).code, "invalid-policy");
  assert.equal(stockPolicyProblem({ ...ALU, endTrimMm: NaN }).code, "invalid-policy");
  assert.equal(stockPolicyProblem({ ...ALU, sharePieces: "yes" }).code, "invalid-policy");
  assert.equal(stockPolicyProblem(null).code, "invalid-policy");
});

// ── simulateBar ──────────────────────────────────────────────────────────────
t("11 example: A01 6500 → 3997, 1494, 891 with explicit placements; length conserved", () => {
  const r = simulateBar(6500, [2500, 2500, 600], { kerfMm: 3 });
  assert.equal(r.fits, true);
  assert.deepEqual(r.sequence.map((s) => [s.startMm, s.endMm, s.kerfMm]), [[0, 2500, 3], [2503, 5003, 3], [5006, 5606, 3]]);
  assert.equal(r.kerfLossMm, 9); assert.equal(r.residualMm, 891);
  near(r.trimLossMm + 5600 + r.kerfLossMm + r.residualMm, 6500);
  assert.equal(simulateBar(6500, [2500, 2500, 600, 800], { kerfMm: 3 }).residualMm, 88);
  assert.equal(simulateBar(6500, [2500, 2500, 600, 900], { kerfMm: 3 }).fits, false);
});
t("one separating cut per piece while material remains — never n−1 kerfs with a residual left", () => {
  for (const fea of [false, true]) {
    const r = simulateBar(4800, [2390, 2390], { kerfMm: 3, finalEndAcceptable: fea });
    assert.equal(r.kerfLossMm, 6); assert.equal(r.residualMm, 14);
  }
});
t("exact final piece may use an acceptable stock end (no nonexistent third cut); otherwise insufficient", () => {
  const ok = simulateBar(6500, [2500, 2500, 1494], { kerfMm: 3, finalEndAcceptable: true });
  assert.equal(ok.fits, true); assert.equal(ok.kerfLossMm, 6); assert.equal(ok.residualMm, 0);
  assert.deepEqual(ok.sequence.map((s) => s.usesFinalEnd), [false, false, true]);
  const no = simulateBar(6500, [2500, 2500, 1494], { kerfMm: 3, finalEndAcceptable: false });
  assert.equal(no.fits, false); assert.equal(no.failedIndex, 2); assert.equal(no.residualMm, null);
});
t("a saw cut is never assumed outside usable stock: a partial kerf does not fit", () => {
  assert.equal(simulateBar(1200, [1199], { kerfMm: 3, finalEndAcceptable: true }).fits, false);
  assert.equal(simulateBar(1202, [1199], { kerfMm: 3 }).fits, true);
  assert.equal(simulateBar(1200, [1199], { kerfMm: 0 }).residualMm, 1);
});
t("end trim is consumed before the first piece and can make an exact length impossible", () => {
  const r = simulateBar(6500, [6490], { kerfMm: 3, endTrimMm: 10, finalEndAcceptable: true });
  assert.equal(r.fits, true); assert.equal(r.sequence[0].startMm, 10); assert.equal(r.trimLossMm, 10); assert.equal(r.residualMm, 0);
  assert.equal(simulateBar(6500, [6490], { kerfMm: 3, endTrimMm: 10, finalEndAcceptable: false }).fits, false);
  assert.equal(simulateBar(6500, [6500], { kerfMm: 3, endTrimMm: 1, finalEndAcceptable: true }).fits, false);
  assert.equal(simulateBar(6500, [6500], { kerfMm: 3, finalEndAcceptable: true }).fits, true);
});
t("simulateBar rejects invalid input instead of guessing", () => {
  assert.equal(simulateBar(0, [100]).reason, "invalid-input");
  assert.equal(simulateBar(6500, [100, -1]).reason, "invalid-input");
  assert.equal(simulateBar(6500, [100], { kerfMm: -3 }).reason, "invalid-input");
  assert.equal(simulateBar(100, [50], { endTrimMm: 101 }).reason, "trim-exceeds-stock");
});

// ── 11 acceptance cases ──────────────────────────────────────────────────────
t("AC1 2500+2500+600, 6500 stock, 3 kerf, no trims: one bar, three pieces, 9 cut loss, 891 planned remainder", () => {
  const g = one(allocateLinear([alu("W01:left", 2500, { label: "W01 left jamb" }), alu("W01:right", 2500, { label: "W01 right jamb" }), alu("W01:bottom", 600, { label: "W01 bottom" })]));
  assert.equal(g.barCount, 1); assert.deepEqual(g.purchase, [{ stockLengthMm: 6500, quantity: 1 }]);
  const bar = g.bars[0];
  assert.equal(bar.source, "new"); assert.equal(bar.cuts.length, 3); assert.equal(bar.kerfLossMm, 9); assert.equal(bar.residualMm, 891);
  assert.equal(bar.residualStatus, "planned"); assert.equal(bar.residualUsable, true);
  assert.deepEqual(bar.cuts.map((c) => c.label), ["W01 left jamb", "W01 right jamb", "W01 bottom"]);
  assert.equal(6500 - g.totals.requiredLengthMm, 900, "900 before saw loss");
  assert.equal(g.proven, true); assert.equal(g.procurement, "ready"); assert.deepEqual(g.problems, []);
  assert.equal(g.objective.kind, "min-new-bars");
});
t("AC2 add 800: still one bar, four pieces, 12 cut loss, 88; add 900 instead: cannot share one bar", () => {
  const base = [alu("a", 2500), alu("b", 2500), alu("c", 600)];
  const g = one(allocateLinear([...base, alu("d", 800)]));
  assert.equal(g.barCount, 1); assert.equal(g.bars[0].cuts.length, 4); assert.equal(g.bars[0].kerfLossMm, 12); assert.equal(g.bars[0].residualMm, 88);
  assert.equal(g.bars[0].residualUsable, false, "88 < 300 keep-from threshold → scrap");
  assert.equal(one(allocateLinear([...base, alu("d", 900)])).barCount, 2);
});
t("AC3 three 3400 cuts need THREE bars although the LM bound is two (never ceil(total LM / 6.5))", () => {
  const g = one(allocateLinear([alu("p", 3400, { quantity: 3 })]));
  assert.equal(Math.ceil((3 * 3400) / 6500), 2);
  assert.equal(g.barCount, 3); assert.equal(g.lowerBound, 3); assert.equal(g.proven, true);
  assert.ok(g.bars.every((b) => b.cuts.length === 1));
});
t("AC4 a 600 cut uses a compatible existing 891 offcut leaving 288; never a different finish or smaller section", () => {
  const off = { id: "OC-891", lengthMm: 891, identity: ANGLE, label: "A01 remainder" };
  const g = one(allocateLinear([alu("W02:bottom", 600)], { existingOffcuts: [off] }));
  assert.equal(g.barCount, 0); assert.equal(g.bars.length, 1);
  assert.equal(g.bars[0].source, "offcut"); assert.equal(g.bars[0].offcutId, "OC-891"); assert.equal(g.bars[0].residualMm, 288);
  near(g.totals.offcutLengthUsedMm, 891); assert.equal(g.totals.purchasedLengthMm, 0);
  for (const identity of [ANGLE_BLACK, ANGLE_40]) {
    const r = allocateLinear([alu("W02:bottom", 600)], { existingOffcuts: [{ ...off, identity }] });
    assert.equal(one(r).barCount, 1); assert.equal(one(r).bars[0].source, "new");
    assert.deepEqual(r.unusedOffcuts.map((o) => o.offcutId), ["OC-891"]);
  }
});
t("AC5 cross-window pooling 4000+2400+2500+2500+600 fits two bars, 3 mm per extracted piece, labels kept", () => {
  const ds = [alu("W03:left", 4000, { label: "W03 left jamb" }), alu("W02:bottom", 2400, { label: "W02 bottom" }),
    alu("W01:left", 2500, { label: "W01 left jamb" }), alu("W01:right", 2500, { label: "W01 right jamb" }), alu("W01:bottom", 600, { label: "W01 bottom" })];
  const g = one(allocateLinear(ds));
  assert.equal(g.barCount, 2); assert.equal(g.proven, true);
  for (const b of g.bars) assert.equal(b.kerfLossMm, 3 * b.cuts.length);
  assert.equal(g.totals.cutLossMm, 15);
  const labels = Object.fromEntries(g.bars.flatMap((b) => b.cuts.map((c) => [c.demandId, c.label])));
  for (const d of ds) assert.equal(labels[d.id], d.label);
});
t("AC6 6501 on 6500 stock is unavailable (no splice); exact 6500 depends on the end policy", () => {
  const g = one(allocateLinear([alu("long", 6501)]));
  assert.equal(g.bars.length, 0); assert.equal(g.barCount, 0);
  assert.equal(g.unavailable.length, 1); assert.equal(g.unavailable[0].reason, "exceeds-stock"); assert.equal(g.unavailable[0].cutId, "long:1");
  assert.equal(g.procurement, "unavailable-stock");
  assert.ok(g.problems.some((p) => p.code === "allocation_unavailable" && p.blocking === true));
  const exact = (pol) => one(allocateLinear([alu("x", 6500, { stockPolicy: { ...ALU, ...pol } })]));
  const ok = exact({ finalEndAcceptable: true });
  assert.equal(ok.barCount, 1); assert.equal(ok.bars[0].residualMm, 0); assert.equal(ok.bars[0].kerfLossMm, 0);
  assert.equal(exact({ finalEndAcceptable: false }).unavailable[0].reason, "end-policy");
  assert.equal(exact({ finalEndAcceptable: true, endTrimMm: 5 }).unavailable[0].reason, "end-policy");
});
t("AC7 2500+2500+1494 fills 6500 with two cuts when the final end is acceptable; trim required → insufficient", () => {
  const ds = [alu("a", 2500), alu("b", 2500), alu("c", 1494)];
  const ok = one(allocateLinear(ds.map((d) => ({ ...d, stockPolicy: { ...ALU, finalEndAcceptable: true } }))));
  assert.equal(ok.barCount, 1); assert.equal(ok.bars[0].kerfLossMm, 6); assert.equal(ok.bars[0].residualMm, 0);
  assert.equal(ok.bars[0].cuts[2].usesFinalEnd, true);
  const trim = one(allocateLinear(ds));
  assert.equal(trim.barCount, 2, "one bar is insufficient once the final end needs a cut");
});
const GREEDY_TRAP = [alu("W11:left", 3247), alu("W12:left", 2597), alu("W13:left", 1947), alu("W13:right", 1947), alu("W14:left", 1622), alu("W14:right", 1622)];
t("AC10 first-fit-decreasing (3 bars) is worse than branch-and-bound (2 bars, proven)", () => {
  const g = one(allocateLinear(GREEDY_TRAP));
  assert.equal(g.initialBarCount, 3); assert.equal(g.barCount, 2); assert.equal(g.lowerBound, 2);
  assert.equal(g.proven, true); assert.equal(g.planLabel, "Suggested cut plan — minimum stock proven");
  assert.ok(g.bars.every((b) => b.residualMm === 0), "both bars exactly full (3247+1622+1622, 2597+1947+1947)");
});
t("AC10 exhausted budget keeps the feasible plan and is labelled honestly (never claims a minimum)", () => {
  const g = one(allocateLinear(GREEDY_TRAP, { nodeBudget: 0 }));
  assert.equal(g.barCount, 3); assert.equal(g.initialBarCount, 3); assert.equal(g.proven, false); assert.equal(g.searchComplete, false);
  assert.equal(g.searchNodes, 0); assert.equal(g.nodeBudget, 0);
  assert.match(g.planLabel, /minimum not proven/);
  assert.ok(g.problems.some((p) => p.code === "allocation_not_proven" && p.blocking === false));
  assert.ok(g.explain.includes("Best plan found — minimum not proven."));
  for (let budget = 0; budget <= 200; budget += 7) {
    const r = one(allocateLinear(GREEDY_TRAP, { nodeBudget: budget }));
    assert.ok(r.barCount <= r.initialBarCount, `budget ${budget}`);
    assert.ok(r.searchNodes <= budget);
    if (!r.proven) assert.ok(r.lowerBound < r.barCount);
  }
});

// ── seeded property tests ────────────────────────────────────────────────────
function mulberry32(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const POLICIES = [
  ALU,
  { kind: "fixed", lengthMm: 6500, kerfMm: 2.5, endTrimMm: 5, finalEndAcceptable: true, sharePieces: true },
  { kind: "list", lengthsMm: [2400, 3600, 4800, 6000], kerfMm: 3, kerfConfirmed: true, sharePieces: true, minRetainedOffcutMm: 500 },
  { ...GRID, maxMm: 5400, unavailableMm: [3000], kerfMm: 3, sharePieces: true },
  { ...GRID, maxMm: 6000 },
  { ...GRID },
  { kind: "fixed", lengthMm: 6500, kerfMm: 3, finalEndAcceptable: true },
];
function scenario(rnd) {
  const ids = [ANGLE, ANGLE_BLACK];
  const demands = [];
  const nd = 1 + Math.floor(rnd() * 9);
  for (let i = 0; i < nd; i++) {
    const L = rnd() < 0.2 ? Math.round((100 + rnd() * 6800) * 10) / 10 : 100 + Math.round(rnd() * 6600);
    demands.push({ id: `D${i}`, kind: "linear", lengthMm: L, quantity: 1 + Math.floor(rnd() * 3), identity: ids[Math.floor(rnd() * 2)],
      stockPolicy: POLICIES[Math.floor(rnd() * POLICIES.length)], label: `Opening ${i}` });
  }
  const existingOffcuts = [];
  const no = Math.floor(rnd() * 4);
  for (let j = 0; j < no; j++) {
    existingOffcuts.push({ id: `OC${j}`, lengthMm: 200 + Math.round(rnd() * 2800), identity: ids[Math.floor(rnd() * 2)], label: `rack ${j}`,
      ...(rnd() < 0.3 ? { finalEndAcceptable: true } : {}), ...(rnd() < 0.2 ? { endTrimMm: 4 } : {}), ...(rnd() < 0.2 ? { quantity: 2 } : {}) });
  }
  return { demands, existingOffcuts };
}
const deepFreeze = (o) => { if (o && typeof o === "object") { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };

t("AC11 conservation of length, exactly-once coverage, no double-counted offcut, never worse than initial (400 seeded cases)", () => {
  const rnd = mulberry32(20261014);
  for (let s = 0; s < 400; s++) {
    const { demands, existingOffcuts } = deepFreeze(scenario(rnd));
    const nodeBudget = [0, 40, 3000][s % 3];
    const r = allocateLinear(demands, { existingOffcuts, nodeBudget }); // frozen inputs: any mutation throws
    const where = `case ${s}`;
    const expected = demands.flatMap((d) => Array.from({ length: d.quantity }, (_, q) => `${d.id}:${q + 1}`)).sort();
    const covered = r.groups.flatMap((g) => [...cutIds(g), ...g.unavailable.map((u) => u.cutId)]).sort();
    assert.deepEqual(covered, expected, `${where}: every cut exactly once`);
    const usedOffcuts = r.groups.flatMap((g) => g.bars.filter((b) => b.source === "offcut").map((b) => b.offcutId));
    assert.equal(new Set(usedOffcuts).size, usedOffcuts.length, `${where}: an offcut used twice`);
    const offcutIds = new Set(existingOffcuts.flatMap((o) => (o.quantity === 2 ? [`${o.id}:1`, `${o.id}:2`] : [o.id])));
    for (const id of usedOffcuts) assert.ok(offcutIds.has(id), `${where}: invented offcut ${id}`);
    assert.equal(usedOffcuts.length + r.unusedOffcuts.length, offcutIds.size, `${where}: offcuts conserved`);
    for (const g of r.groups) {
      const pol = g.policy;
      for (const b of g.bars) {
        const cutsLen = b.cuts.reduce((a, c) => a + c.lengthMm, 0);
        near(b.trimLossMm + cutsLen + b.kerfLossMm + b.residualMm, b.stockLengthMm, `${where} ${b.id} conservation`);
        assert.ok(b.residualMm >= 0, `${where}: negative residual`);
        const src = b.source === "offcut" ? existingOffcuts.find((o) => b.offcutId === o.id || b.offcutId.startsWith(`${o.id}:`)) : null;
        if (src) assert.equal(JSON.stringify(src.identity), JSON.stringify(g.identity), `${where}: offcut identity`);
        const opts = { kerfMm: pol.kerfMm ?? 0, endTrimMm: src ? src.endTrimMm ?? pol.endTrimMm : pol.endTrimMm, finalEndAcceptable: src ? src.finalEndAcceptable ?? pol.finalEndAcceptable : pol.finalEndAcceptable };
        const lens = b.cuts.map((c) => c.lengthMm);
        const sim = simulateBar(b.stockLengthMm, lens, opts);
        assert.equal(sim.fits, true, `${where}: bar re-simulates`); near(sim.residualMm, b.residualMm);
        assert.equal(simulateBar(b.stockLengthMm, [...lens].reverse(), opts).fits, true, `${where}: order-independent`);
        if (b.source === "new") assert.equal(selectStock(b.stockLengthMm, pol).stockMm, b.stockLengthMm, `${where}: ${b.stockLengthMm} is a permitted stock length`);
        if (!pol.sharePieces || g.mode === "one-per-piece") assert.equal(b.cuts.length, 1, `${where}: one stock piece per member`);
      }
      for (const u of g.unavailable) {
        if (u.reason === "exceeds-stock") assert.equal(selectStock(u.lengthMm, pol).stockMm, null, `${where}: unavailable ${u.lengthMm}`);
        assert.ok(!g.bars.some((b) => b.cuts.some((c) => c.cutId === u.cutId)), `${where}: unavailable never partially cut`);
      }
      const tot = g.totals;
      near(tot.purchasedLengthMm + tot.offcutLengthUsedMm, tot.requiredLengthMm + tot.cutLossMm + tot.trimLossMm + tot.remainderMm, `${where}: group totals`);
      assert.ok(g.objective.purchasedLengthMm <= g.initialPurchasedLengthMm + 1e-6, `${where}: worse than initial plan`);
      if (Math.abs(g.objective.purchasedLengthMm - g.initialPurchasedLengthMm) < 1e-6) assert.ok(g.barCount <= g.initialBarCount, `${where}: more bars than initial`);
      if (g.lowerBoundUnit === "bars") assert.ok(g.barCount >= g.lowerBound, `${where}: below lower bound`);
      else assert.ok(g.objective.purchasedLengthMm >= g.lowerBound - 1e-6, `${where}: below lower bound`);
      assert.ok(g.searchNodes <= nodeBudget);
    }
  }
});
t("determinism: same result twice and for shuffled demand / offcut order", () => {
  const rnd = mulberry32(99);
  for (let s = 0; s < 60; s++) {
    const { demands, existingOffcuts } = scenario(rnd);
    const a = JSON.stringify(allocateLinear(demands, { existingOffcuts, nodeBudget: 2000 }));
    assert.equal(JSON.stringify(allocateLinear(demands, { existingOffcuts, nodeBudget: 2000 })), a);
    const shuffled = JSON.stringify(allocateLinear([...demands].reverse(), { existingOffcuts: [...existingOffcuts].reverse(), nodeBudget: 2000 }));
    assert.equal(shuffled, a, `case ${s}`);
  }
});

/** Exhaustive optimum (new bars, then offcuts used) for one shared single-length group. */
function bruteForce(lengths, offcuts, stock, opts) {
  const n = lengths.length;
  let best = null;
  const assign = new Array(n).fill(0);
  const fits = (len, cuts, o = opts) => simulateBar(len, [...cuts].sort((a, b) => b - a), o).fits;
  const evaluate = (k) => {
    const blocks = Array.from({ length: k }, () => []);
    assign.forEach((b, i) => blocks[b].push(lengths[i]));
    const options = blocks.map((cuts) => [...(fits(stock, cuts) ? [-1] : []), ...offcuts.map((o, j) => (fits(o, cuts) ? j : null)).filter((j) => j !== null)]);
    const rec = (bi, used, nb, oc) => {
      if (bi === k) { if (!best || nb < best[0] || (nb === best[0] && oc < best[1])) best = [nb, oc]; return; }
      for (const opt of options[bi]) {
        if (opt === -1) rec(bi + 1, used, nb + 1, oc);
        else if (!used.has(opt)) { used.add(opt); rec(bi + 1, used, nb, oc + 1); used.delete(opt); }
      }
    };
    rec(0, new Set(), 0, 0);
  };
  const partitions = (i, k) => { if (i === n) return evaluate(k); for (let b = 0; b <= k; b++) { assign[i] = b; partitions(i + 1, Math.max(k, b + 1)); } };
  partitions(0, 0);
  return best;
}
t("branch-and-bound equals the exhaustive optimum on 150 small seeded cases (new bars, then offcuts used)", () => {
  const rnd = mulberry32(7);
  for (let s = 0; s < 150; s++) {
    const kerf = [0, 3, 2.5][s % 3], fea = s % 2 === 0, stock = 3000;
    const lengths = Array.from({ length: 2 + Math.floor(rnd() * 6) }, () => 200 + Math.round(rnd() * 2300));
    const offs = Array.from({ length: Math.floor(rnd() * 3) }, () => 300 + Math.round(rnd() * 1500));
    const pol = { kind: "fixed", lengthMm: stock, kerfMm: kerf, kerfConfirmed: true, finalEndAcceptable: fea, sharePieces: true };
    const g = one(allocateLinear(lengths.map((L, i) => alu(`c${i}`, L, { stockPolicy: pol })), { existingOffcuts: offs.map((L, j) => ({ id: `o${j}`, lengthMm: L, identity: ANGLE })) }));
    const opt = bruteForce(lengths, offs, stock, { kerfMm: kerf, finalEndAcceptable: fea });
    assert.deepEqual([g.barCount, g.objective.offcutsUsed], opt, `case ${s}: ${lengths} / offcuts ${offs}`);
    assert.equal(g.searchComplete, true); assert.equal(g.proven, true);
  }
});

// ── timber T3 / T6 ───────────────────────────────────────────────────────────
const timber = (id, lengthMm, policy = GRID, over = {}) => ({ id, kind: "linear", lengthMm, quantity: 1, identity: TIMBER, stockPolicy: policy, label: id, ...over });
t("T3 default one stock piece per structural member: 500/1199/1200/1200.1/1800/1800.1 → 1200/1200/1200/1800/1800/2400", () => {
  const lens = [500, 1199, 1200, 1200.1, 1800, 1800.1];
  const g = one(allocateLinear(lens.map((L, i) => timber(`R${i}`, L))));
  assert.equal(g.mode, "one-per-piece");
  const stockFor = Object.fromEntries(g.bars.map((b) => [b.cuts[0].lengthMm, b.stockLengthMm]));
  assert.deepEqual(lens.map((L) => stockFor[L]), [1200, 1200, 1200, 1800, 1800, 2400]);
  assert.ok(g.bars.every((b) => b.cuts.length === 1), "never shared by default");
  assert.deepEqual(g.bars.map((b) => b.cuts[0].lengthMm).sort((a, b) => a - b), lens, "finished cut lengths unchanged");
  assert.equal(g.procurement, "ready"); assert.deepEqual(g.problems, []); assert.equal(g.proven, true);
});
t("never joins: a too-long piece whose joins are allowed is needs-joint-detail (05), not split", () => {
  const g = one(allocateLinear([timber("TR1", 7300, { ...GRID, maxMm: 6000 }, { noSplice: false }), timber("TR2", 7300, { ...GRID, maxMm: 6000 }, { noSplice: true })]));
  assert.deepEqual(g.unavailable.map((u) => [u.demandId, u.reason]), [["TR1", "needs-joint-detail"], ["TR2", "exceeds-stock"]]);
  assert.equal(g.bars.length, 0);
});
t("T3 4801 with product maximum 4800 → unavailable; never clamped to 4800 or spliced", () => {
  const g = one(allocateLinear([timber("P1", 4801, { ...GRID, maxMm: 4800 }), timber("P2", 4800, { ...GRID, maxMm: 4800 })]));
  assert.equal(g.bars.length, 1); assert.equal(g.bars[0].cuts[0].demandId, "P2");
  assert.deepEqual(g.unavailable.map((u) => [u.demandId, u.reason]), [["P1", "exceeds-stock"]]);
});
t("12 an existing compatible offcut shorter than 1200 can satisfy a 500 cut without a new purchase", () => {
  const g = one(allocateLinear([timber("N1", 500)], { existingOffcuts: [{ id: "T-700", lengthMm: 700, identity: TIMBER }] }));
  assert.equal(g.barCount, 0); assert.equal(g.bars[0].source, "offcut"); assert.equal(g.bars[0].residualMm, 200);
});
t("one-per-piece with a kerf that cannot fit steps to the next grid length — visibly", () => {
  const g = one(allocateLinear([timber("S1", 1200, { ...GRID, kerfMm: 3, kerfConfirmed: true })]));
  assert.equal(g.bars[0].stockLengthMm, 1800);
  assert.ok(g.problems.some((p) => p.code === "allocation_stock_stepped" && p.blocking === false));
});
t("T6 opt-in sharing (trim/noggins): FFD opens 2 × 1200, branch-and-bound buys 1 × 2400 (same length, fewer bars)", () => {
  const pol = { ...GRID, maxMm: 6000, kerfMm: 3, kerfConfirmed: true, sharePieces: true };
  const g = one(allocateLinear([timber("N1", 1000, pol), timber("N2", 1000, pol)]));
  assert.equal(g.mode, "shared-multi"); assert.equal(g.objective.kind, "min-purchased-length"); assert.equal(g.lowerBoundUnit, "mm");
  assert.equal(g.initialBarCount, 2); assert.equal(g.initialPurchasedLengthMm, 2400);
  assert.deepEqual(g.purchase, [{ stockLengthMm: 2400, quantity: 1 }]);
  assert.equal(g.bars[0].kerfLossMm, 6); assert.equal(g.bars[0].residualMm, 394);
});
t("multiple stock lengths: minimise purchased length then bars — 2000+2000+1000 from 3 × 2400 to 1 × 6000", () => {
  const pol = { kind: "list", lengthsMm: [2400, 3600, 4800, 6000], kerfMm: 3, kerfConfirmed: true, sharePieces: true };
  const g = one(allocateLinear([timber("a", 2000, pol), timber("b", 2000, pol), timber("c", 1000, pol)]));
  assert.equal(g.initialPurchasedLengthMm, 7200); assert.equal(g.initialBarCount, 3);
  assert.deepEqual(g.purchase, [{ stockLengthMm: 6000, quantity: 1 }]);
  assert.match(g.objective.text, /total purchased length, then bar count/);
});
t("sharing on a grid with no maximum is refused (not shared) and says why", () => {
  const g = one(allocateLinear([timber("a", 1000, { ...GRID, sharePieces: true, kerfMm: 0, kerfConfirmed: true }), timber("b", 1000, { ...GRID, sharePieces: true, kerfMm: 0, kerfConfirmed: true })]));
  assert.equal(g.mode, "one-per-piece"); assert.equal(g.barCount, 2);
  assert.ok(g.problems.some((p) => p.code === "allocation_share_needs_max"));
});
t("never pools by a generic name: grade / treatment / finish differences are separate groups", () => {
  const r = allocateLinear([timber("a", 1000), timber("b", 1000, GRID, { identity: { ...TIMBER, treatment: "h3" } }), timber("c", 1000, GRID, { identity: { ...TIMBER, grade: "mgp12" } })]);
  assert.equal(r.groups.length, 3);
  const r2 = allocateLinear([alu("m", 600), alu("k", 600, { identity: ANGLE_BLACK })]);
  assert.equal(r2.groups.length, 2); assert.equal(r2.totals.newBars, 2);
});
t("same identity with different cutting settings: separate groups, flagged, and an offcut is still used once only", () => {
  const r = allocateLinear([alu("a", 600), alu("b", 600, { stockPolicy: { ...ALU, kerfMm: 4 } })], { existingOffcuts: [{ id: "OC", lengthMm: 700, identity: ANGLE }] });
  assert.equal(r.groups.length, 2);
  assert.ok(r.problems.some((p) => p.code === "allocation_identity_split"));
  assert.equal(r.totals.offcutsUsed, 1); assert.equal(r.totals.newBars, 1);
});

// ── statuses, provenance and inputs ──────────────────────────────────────────
t("missing / unconfirmed saw kerf: estimate allowed, procurement stays draft (11)", () => {
  const unset = one(allocateLinear([alu("a", 2500, { stockPolicy: { ...ALU, kerfMm: undefined, kerfConfirmed: false } })]));
  assert.equal(unset.procurement, "draft");
  const p = unset.problems.find((x) => x.code === "allocation_loss_unconfirmed");
  assert.ok(p && p.blocking === false && /uses 0 mm/.test(p.message));
  assert.equal(unset.bars[0].kerfLossMm, 0);
  assert.equal(one(allocateLinear([alu("a", 2500, { stockPolicy: { ...ALU, kerfConfirmed: false } })])).procurement, "draft");
});
t("an offcut is not consumed when the new bar already has room (11 objective order)", () => {
  const g = one(allocateLinear([alu("a", 2500), alu("b", 2500), alu("c", 600)], { existingOffcuts: [{ id: "OC1", lengthMm: 1200, identity: ANGLE }] }));
  assert.equal(g.initialBarCount, 1); assert.equal(g.barCount, 1);
  assert.equal(g.objective.offcutsUsed, 0, "first-fit put the 600 in the offcut; the search gives it back");
  assert.deepEqual(g.objective.remaindersMm, [1200, 891]);
});
t("an existing offcut is used when it reduces new purchasing (installed demand unchanged)", () => {
  const ds = [alu("a", 3000), alu("b", 3000), alu("c", 500)];
  assert.equal(one(allocateLinear(ds)).barCount, 2);
  const g = one(allocateLinear(ds, { existingOffcuts: [{ id: "OC1", lengthMm: 3100, identity: ANGLE }] }));
  assert.equal(g.barCount, 1); assert.equal(g.objective.offcutsUsed, 1); assert.equal(g.totals.requiredLengthMm, 6500);
});
t("planned remainders never become inventory; inputs are not mutated", () => {
  const offcuts = deepFreeze([{ id: "OC1", lengthMm: 1200, identity: ANGLE }]);
  const demands = deepFreeze([alu("a", 2500), alu("b", 2500), alu("c", 600)]);
  const r = allocateLinear(demands, { existingOffcuts: offcuts });
  assert.deepEqual(r.unusedOffcuts.map((o) => o.offcutId), ["OC1"], "only entered offcuts are listed — no 891 appears");
  assert.ok(r.groups[0].bars.every((b) => b.residualStatus === "planned"));
  const again = allocateLinear([alu("d", 800)], { existingOffcuts: offcuts });
  assert.equal(one(again).bars[0].offcutId, "OC1", "only the entered offcut is offered — not the earlier plan's 891 remainder");
});
t("quantities expand to unique cut ids; the grouped label is retained", () => {
  const g = one(allocateLinear([alu("W05:jamb", 2400, { quantity: 4, label: "W05 jambs" })]));
  assert.deepEqual(cutIds(g).sort(), ["W05:jamb:1", "W05:jamb:2", "W05:jamb:3", "W05:jamb:4"]);
  assert.ok(g.bars.every((b) => b.cuts.every((c) => c.label === "W05 jambs" && c.demandId === "W05:jamb")));
});
t("invalid demands are rejected (never guessed); the rest are still covered exactly once", () => {
  const r = allocateLinear([alu("dup", 600), alu("dup", 700), alu("ok", 650), alu("neg", -5), alu("frac", 600, { quantity: 1.5 }), alu("noid", 600, { identity: null }),
    alu("badpol", 600, { stockPolicy: { kind: "grid", incrementMm: 600 } }), alu("sheet", 600, { kind: "sheet" }), alu("zero", 600, { quantity: 0 })]);
  // a duplicated id rejects EVERY copy — keeping the first would depend on input order
  assert.deepEqual(r.rejected.map((x) => [x.demandId, x.reason]), [["dup", "duplicate-id"], ["dup", "duplicate-id"], ["neg", "invalid-length"], ["frac", "invalid-quantity"], ["noid", "missing-identity"], ["badpol", "invalid-policy"], ["sheet", "not-linear"]]);
  assert.ok(r.problems.some((p) => p.code === "allocation_demand_rejected" && p.blocking));
  assert.deepEqual(cutIds(one(r)), ["ok:1"]);
});
t("orderedStock length bypasses selection, packing and kerf", () => {
  const g = one(allocateLinear([alu("buy", 5400, { lengthKind: "orderedStock", quantity: 2 })]));
  assert.deepEqual(g.purchase, [{ stockLengthMm: 5400, quantity: 2 }]);
  assert.ok(g.bars.every((b) => b.ordered && b.kerfLossMm === 0 && b.residualMm === 0 && b.cuts.length === 1));
});
t(`more than MAX_CUTS (${MAX_CUTS}) pieces is rejected, never truncated`, () => {
  const r = allocateLinear([alu("many", 100, { quantity: MAX_CUTS + 1 })]);
  assert.equal(r.groups.length, 0); assert.equal(r.rejected[0].reason, "limit-exceeded");
});
t("keep-offcuts-from threshold: unset → remainder not classified; set → reusable vs scrap totals", () => {
  const unset = one(allocateLinear([alu("a", 2500, { stockPolicy: { ...ALU, minRetainedOffcutMm: undefined } })]));
  assert.equal(unset.bars[0].residualUsable, null); assert.equal(unset.totals.reusableRemainderMm, null);
  const g = one(allocateLinear([alu("a", 3400), alu("b", 3400), alu("c", 3000)]));
  assert.equal(g.totals.reusableRemainderMm + g.totals.scrapMm, g.totals.remainderMm);
});
t("per-offcut end condition: an acceptable far end lets an exact piece use the whole offcut", () => {
  const off = (finalEndAcceptable) => ({ id: "OC", lengthMm: 900, identity: ANGLE, finalEndAcceptable });
  assert.equal(one(allocateLinear([alu("a", 900)], { existingOffcuts: [off(true)] })).barCount, 0);
  assert.equal(one(allocateLinear([alu("a", 900)], { existingOffcuts: [off(false)] })).barCount, 1);
});
t("an invalid or duplicated existing offcut is ignored with a visible problem (never double counted)", () => {
  const r = allocateLinear([alu("a", 600)], { existingOffcuts: [{ id: "X", lengthMm: 700, identity: ANGLE }, { id: "X", lengthMm: 700, identity: ANGLE }, { id: "Y", lengthMm: -1, identity: ANGLE }] });
  assert.equal(r.totals.offcutsUsed, 1); assert.equal(r.totals.newBars, 0);
  assert.deepEqual(r.unusedOffcuts, []);
  assert.equal(r.problems.filter((p) => p.code === "allocation_offcut_invalid").length, 2);
});
t("a piece longer than new stock can use a longer existing offcut; when those are taken it is unavailable", () => {
  const off = [{ id: "LONG", lengthMm: 7000, identity: ANGLE }];
  const g1 = one(allocateLinear([alu("x", 6800)], { existingOffcuts: off }));
  assert.equal(g1.barCount, 0); assert.equal(g1.bars[0].offcutId, "LONG");
  const g2 = one(allocateLinear([alu("x", 6800), alu("y", 6700)], { existingOffcuts: off }));
  assert.deepEqual(g2.unavailable.map((u) => [u.demandId, u.reason]), [["y", "offcuts-exhausted"]]);
  assert.deepEqual(cutIds(g2), ["x:1"]);
});
t("every grid length removed by availability: nothing new can be bought, offcuts still usable", () => {
  const pol = { ...GRID, maxMm: 1800, unavailableMm: [1200, 1800], sharePieces: true, kerfMm: 3, kerfConfirmed: true };
  const g = one(allocateLinear([timber("a", 500, pol)]));
  assert.equal(g.unavailable[0].reason, "no-available-length"); assert.equal(g.lowerBound, 0);
  const h = one(allocateLinear([timber("a", 500, pol)], { existingOffcuts: [{ id: "T", lengthMm: 800, identity: TIMBER }] }));
  assert.equal(h.bars[0].source, "offcut"); assert.equal(h.barCount, 0); assert.equal(h.proven, true);
});
t(`default node budget is ${DEFAULT_NODE_BUDGET} and is reported per group`, () => {
  const g = one(allocateLinear([alu("a", 600)]));
  assert.equal(g.nodeBudget, DEFAULT_NODE_BUDGET);
});

console.log(`takeoff-tc-allocator: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
