// TC-R04 ADVERSARIAL checks of the shared linear allocator + stock selection (03 §T3/§T6, 11, 12 §Timber stock)
// against shared/takeoff/engine/stock.js and allocator.js. Each "defect" test failed on the first implementation;
// the rest try to break the never-rules, the proven flag (exhaustive brute force), conservation and determinism.
//   node scripts/tests/takeoff-tc-allocator-adv.test.mjs
import assert from "node:assert/strict";
import { MAX_LENGTH_MM, permittedStockLengths, selectStock, stockLengthsFrom, stockPolicyProblem } from "../../shared/takeoff/engine/stock.js";
import { DEFAULT_NODE_BUDGET, MAX_CUTS, MAX_SEARCH_PIECES, allocateLinear, simulateBar } from "../../shared/takeoff/engine/allocator.js";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

const EPS = 1e-6;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= EPS, `${msg ?? ""} ${a} ≠ ${b}`);
const ANGLE = { family: "aluminium", profile: { shape: "equal-angle", aMm: 50, bMm: 50, tMm: 3 }, finish: "mill" };
const TIMBER = { family: "timber", section: { depthMm: 90, widthMm: 45 }, grade: "mgp10", treatment: "h2" };
const ALU = { kind: "fixed", lengthMm: 6500, kerfMm: 3, kerfConfirmed: true, endTrimMm: 0, finalEndAcceptable: false, sharePieces: true, minRetainedOffcutMm: 300 };
const GRID = { kind: "grid", minMm: 1200, incrementMm: 600 };
const alu = (id, lengthMm, over = {}) => ({ id, kind: "linear", unit: "bar", lengthMm, quantity: 1, identity: ANGLE, stockPolicy: ALU, label: id, ...over });
const timber = (id, lengthMm, policy = GRID, over = {}) => ({ id, kind: "linear", unit: "piece", lengthMm, quantity: 1, identity: TIMBER, stockPolicy: policy, label: id, ...over });
const one = (r) => { assert.equal(r.groups.length, 1, "one group"); return r.groups[0]; };
const cutIds = (g) => g.bars.flatMap((b) => b.cuts.map((c) => c.cutId));
const deepFreeze = (o) => { if (o && typeof o === "object") { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
function mulberry32(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

// ── defects found and fixed (each failed on the first implementation) ───────────
t("defect: simulateBar treated a non-boolean finalEndAcceptable (\"false\") as an acceptable end", () => {
  const r = simulateBar(6500, [2500, 2500, 1494], { kerfMm: 3, finalEndAcceptable: "false" });
  assert.equal(r.fits, false); assert.equal(r.reason, "invalid-input");
  assert.equal(simulateBar(6500, [2500, 2500, 1494], { kerfMm: 3, finalEndAcceptable: 1 }).reason, "invalid-input");
  // unset (undefined / null) is the conservative "the final end needs a cut"
  assert.equal(simulateBar(6500, [2500, 2500, 1494], { kerfMm: 3, finalEndAcceptable: null }).fits, false);
  assert.equal(simulateBar(6500, [2500, 2500, 1494], { kerfMm: 3 }).fits, false);
});
t("defect: a huge need on a grid whose next length is unavailable looped forever (now invalid input, returns)", () => {
  const r = selectStock(1e20, { ...GRID, unavailableMm: [1e20] }); // previously never returned
  assert.equal(r.stockMm, null); assert.equal(r.reason, "invalid-need");
  assert.equal(selectStock(MAX_LENGTH_MM, GRID).reason, "invalid-need");
  assert.deepEqual([...stockLengthsFrom(1e20, GRID)], []);
  const near1e9 = [...stockLengthsFrom(MAX_LENGTH_MM - 700, GRID)]; // an unbounded grid still stops at the precision guard
  assert.ok(near1e9.every((s) => s < MAX_LENGTH_MM));
  assert.equal(stockPolicyProblem({ kind: "fixed", lengthMm: 1e12 }).code, "invalid-policy");
  const huge = allocateLinear([timber("huge", 1e20, { ...GRID, unavailableMm: [1e20] })]);
  assert.equal(huge.groups.length, 0); assert.deepEqual(huge.rejected.map((x) => x.reason), ["invalid-length"]);
});
t("defect: grid tolerance was a fraction of the increment — selectStock and the allocator disagreed at 4200.0005", () => {
  assert.equal(selectStock(4200.0005, GRID).stockMm, 4800, "0.0005 mm over is more than EPS_MM noise");
  assert.equal(selectStock(4200 + 1e-7, GRID).stockMm, 4200, "true float noise is still absorbed");
  const g = one(allocateLinear([timber("P", 4200.0005)]));
  assert.equal(g.bars[0].stockLengthMm, selectStock(4200.0005, GRID).stockMm);
  assert.ok(!g.problems.some((p) => p.code === "allocation_stock_stepped"), "no misleading kerf/trim 'stepped' warning");
});
t("defect: shared-multi claimed 'minimum proven' when only a shorter length holds a load exactly (fit is not monotone)", () => {
  const pol = { kind: "list", lengthsMm: [2400, 2401, 3000, 3001], kerfMm: 3, kerfConfirmed: true, finalEndAcceptable: true, sharePieces: true };
  // 1500 + 3 + 1497 = 3000 exactly fills a 3000 bar via the acceptable final end, but needs 3003 in a 3001 bar
  assert.equal(simulateBar(3000, [1500, 1497], { kerfMm: 3, finalEndAcceptable: true }).fits, true);
  assert.equal(simulateBar(3001, [1500, 1497], { kerfMm: 3, finalEndAcceptable: true }).fits, false);
  const lengths = [1497, 2780, 1755, 1955, 1500, 2997];
  const g = one(allocateLinear(lengths.map((L, i) => timber(`c${i}`, L, pol))));
  assert.equal(g.objective.purchasedLengthMm, 13800, "was 15600 with 'proven' (6 bars)"); assert.equal(g.barCount, 5);
  assert.equal(g.proven, true);
  const opt = bruteForce(lengths, [], pol, true);
  assert.equal(g.objective.purchasedLengthMm, opt.len); assert.equal(g.barCount, opt.nb);
});
t("defect: a duplicated demand id kept whichever copy came first (result depended on input order)", () => {
  const a = allocateLinear([alu("dup", 600), alu("dup", 700), alu("ok", 2500)]);
  const b = allocateLinear([alu("dup", 700), alu("ok", 2500), alu("dup", 600)]);
  assert.deepEqual(JSON.stringify(a.groups), JSON.stringify(b.groups));
  assert.deepEqual(a.rejected.map((r) => [r.demandId, r.reason]), [["dup", "duplicate-id"], ["dup", "duplicate-id"]]);
  assert.deepEqual(cutIds(one(a)), ["ok:1"]);
  assert.ok(a.problems.some((p) => p.code === "allocation_demand_rejected" && p.blocking));
});
t("defect: one offcut record listed twice with different quantities was counted 3 times (double counting)", () => {
  const ds = [alu("a", 600), alu("b", 600), alu("c", 600)];
  const r = allocateLinear(ds, { existingOffcuts: [{ id: "X", lengthMm: 700, identity: ANGLE, quantity: 2 }, { id: "X", lengthMm: 700, identity: ANGLE }] });
  assert.equal(r.totals.offcutsUsed, 0, "conflicting records sharing an id are never guessed"); assert.deepEqual(r.unusedOffcuts, []);
  assert.ok(r.problems.some((p) => p.code === "allocation_offcut_invalid" && /share this id/.test(p.message)));
  // the SAME record listed twice counts once
  const same = allocateLinear([alu("a", 600), alu("b", 600)], { existingOffcuts: [{ id: "Y", lengthMm: 700, identity: ANGLE }, { id: "Y", lengthMm: 700, identity: ANGLE }], nodeBudget: 0 });
  assert.equal(same.totals.offcutsUsed + same.unusedOffcuts.length, 1);
});
t("defect: an expanded offcut id colliding with another record (X×2 → X:1 vs \"X:1\") dropped one by input order", () => {
  const offA = { id: "X", lengthMm: 700, identity: ANGLE, quantity: 2 }, offB = { id: "X:1", lengthMm: 650, identity: ANGLE };
  const ds = [alu("a", 600), alu("b", 600), alu("c", 600)];
  const r1 = allocateLinear(ds, { existingOffcuts: [offA, offB] });
  const r2 = allocateLinear(ds, { existingOffcuts: [offB, offA] });
  assert.equal(JSON.stringify(r1.groups), JSON.stringify(r2.groups));
  assert.equal(JSON.stringify(r1.unusedOffcuts), JSON.stringify(r2.unusedOffcuts));
  assert.deepEqual(r1.unusedOffcuts, []); assert.equal(r1.totals.offcutsUsed, 0);
  assert.equal(r1.problems.filter((p) => /collide/.test(p.message)).length, 2);
});
t("defect: an offcut with null end fields (as a DB row gives) was ignored instead of using the policy defaults", () => {
  const r = allocateLinear([alu("a", 600)], { existingOffcuts: [{ id: "X", lengthMm: 700, identity: ANGLE, endTrimMm: null, finalEndAcceptable: null, quantity: null }] });
  assert.equal(r.totals.offcutsUsed, 1); assert.equal(r.totals.newBars, 0);
  assert.equal(one(r).bars[0].residualMm, 97);
  // a policy with null cutting booleans is unset (false), not invalid
  assert.equal(stockPolicyProblem({ ...ALU, finalEndAcceptable: null, kerfConfirmed: null, sharePieces: null }), null);
});
t("defect: one-per-piece bound was O(pieces × offcuts) per node and weak — 2000 studs + 300 offcuts took ~23 s, unproven", () => {
  const rnd = mulberry32(3);
  const existingOffcuts = Array.from({ length: 300 }, (_, j) => ({ id: `o${j}`, lengthMm: 2000 + Math.round(rnd() * 3000), identity: TIMBER }));
  const t0 = Date.now();
  const g = one(allocateLinear([timber("stud", 2700, GRID, { quantity: 2000 })], { existingOffcuts }));
  const ms = Date.now() - t0;
  const fitting = existingOffcuts.filter((o) => o.lengthMm >= 2700).length;
  assert.equal(g.objective.offcutsUsed, fitting); assert.equal(g.barCount, 2000 - fitting);
  assert.equal(g.proven, true, "the matching bound proves the minimum"); assert.equal(g.lowerBound, g.objective.purchasedLengthMm);
  assert.ok(ms < 10000, `${ms} ms`);
});
t("defect: one-per-piece first-fit scanned every opened (full) bar — 50,000 cuts were quadratic", () => {
  const t0 = Date.now();
  const g = one(allocateLinear([timber("nog", 450, { ...GRID, maxMm: 6000 }, { quantity: MAX_CUTS })]));
  const ms = Date.now() - t0;
  assert.equal(g.barCount, MAX_CUTS); assert.equal(g.totals.allocatedCuts, MAX_CUTS); assert.equal(g.proven, true);
  assert.ok(ms < 3000, `${ms} ms (was ~4.7 s)`);
});
t("defect: a tight (pre-allowance) length was cut-allocated raw — 11 needs finished lengths", () => {
  const r = allocateLinear([alu("tight", 2400, { lengthKind: "tight" }), alu("weird", 2400, { lengthKind: "approx" }), alu("fin", 2400, { lengthKind: "finished" }), alu("cut", 600, { lengthKind: "cut" })]);
  assert.deepEqual(r.rejected.map((x) => [x.demandId, x.reason]), [["tight", "not-finished-length"], ["weird", "invalid-length-kind"]]);
  assert.deepEqual(cutIds(one(r)).sort(), ["cut:1", "fin:1"]);
});
t("defect: an empty / array identity was pooled as if compatible (never pool without a real identity)", () => {
  const r = allocateLinear([alu("e1", 600, { identity: {} }), alu("e2", 600, { identity: {} }), alu("arr", 600, { identity: ["aluminium"] })]);
  assert.deepEqual(r.rejected.map((x) => x.reason), ["missing-identity", "missing-identity", "missing-identity"]);
  assert.equal(r.groups.length, 0);
  const o = allocateLinear([alu("a", 600)], { existingOffcuts: [{ id: "E", lengthMm: 900, identity: {} }] });
  assert.equal(o.totals.offcutsUsed, 0); assert.ok(o.problems.some((p) => p.code === "allocation_offcut_invalid"));
});
t("defect: different purchase units were pooled into one group (unit is part of purchase identity)", () => {
  const r = allocateLinear([alu("b", 3000), alu("p", 3000, { unit: "piece" })]);
  assert.equal(r.groups.length, 2); assert.deepEqual(r.groups.map((g) => g.unit).sort(), ["bar", "piece"]);
  assert.ok(r.problems.some((p) => p.code === "allocation_identity_split"));
});
t("defect: a proven shared plan was not called a suggested cut plan (T6)", () => {
  const g = one(allocateLinear([alu("a", 2500), alu("b", 2500), alu("c", 600)]));
  assert.equal(g.proven, true); assert.match(g.planLabel, /^Suggested cut plan/);
  const tim = one(allocateLinear([timber("n1", 1000, { ...GRID, maxMm: 6000, kerfMm: 3, kerfConfirmed: true, sharePieces: true })]));
  assert.match(tim.planLabel, /^Suggested cut plan/);
});
t("defect: 'confirmed' with no kerf entered was purchase-ready — 11 allows only an ENTERED zero", () => {
  const g = one(allocateLinear([alu("a", 2500, { stockPolicy: { ...ALU, kerfMm: undefined, kerfConfirmed: true } })]));
  assert.equal(g.procurement, "draft");
  assert.ok(g.problems.some((p) => p.code === "allocation_loss_unconfirmed" && /No saw kerf entered/.test(p.message) && p.blocking === false));
  assert.equal(one(allocateLinear([alu("a", 2500, { stockPolicy: { ...ALU, kerfMm: 0, kerfConfirmed: true } })])).procurement, "ready");
  assert.equal(one(allocateLinear([alu("a", 2500, { stockPolicy: { ...ALU, kerfMm: 0, kerfConfirmed: false } })])).procurement, "draft");
});
t("defect: null options threw a TypeError (allocateLinear / simulateBar)", () => {
  assert.equal(one(allocateLinear([alu("a", 600)], null)).barCount, 1);
  assert.equal(simulateBar(6500, [600], null).residualMm, 5900);
});
t("defect: bars did not record the end condition they were simulated under (11 usable-end flags)", () => {
  const off = { id: "OC", lengthMm: 900, identity: ANGLE, finalEndAcceptable: true, endTrimMm: 0 };
  const g = one(allocateLinear([alu("a", 900), alu("b", 6000)], { existingOffcuts: [off] })); // 900 + 6000 cannot share a bar
  for (const b of g.bars) { // the server can re-simulate each bar from the bar alone
    const sim = simulateBar(b.stockLengthMm, b.cuts.map((c) => c.lengthMm), b.endCondition);
    assert.equal(sim.fits, true); near(sim.residualMm, b.residualMm);
  }
  assert.deepEqual(g.bars.find((b) => b.source === "offcut").endCondition, { kerfMm: 3, endTrimMm: 0, finalEndAcceptable: true });
  assert.deepEqual(g.bars.find((b) => b.source === "new").endCondition, { kerfMm: 3, endTrimMm: 0, finalEndAcceptable: false });
});

// ── kerf / end conventions (11) — boundary inputs ─────────────────────────────
t("kerf: n kerfs while a residual remains, n−1 only for an exact acceptable final end — never blindly either", () => {
  const exact = simulateBar(6500, [3250, 3247], { kerfMm: 3, finalEndAcceptable: true });
  assert.equal(exact.fits, true); assert.equal(exact.kerfLossMm, 3); assert.equal(exact.residualMm, 0);
  assert.equal(simulateBar(6500, [3250, 3247], { kerfMm: 3, finalEndAcceptable: false }).fits, false);
  const loose = simulateBar(6500, [3000, 3000], { kerfMm: 3, finalEndAcceptable: true });
  assert.equal(loose.kerfLossMm, 6); assert.equal(loose.residualMm, 494);
  // a 1 mm sliver after the last piece cannot absorb a 3 mm kerf, and is not an "exact" end either
  assert.equal(simulateBar(6500, [3250, 3246], { kerfMm: 3, finalEndAcceptable: true }).fits, false);
  // a cut landing exactly on the stock end is inside usable stock
  assert.equal(simulateBar(6500, [6497], { kerfMm: 3 }).residualMm, 0);
  assert.equal(simulateBar(6500, [6498], { kerfMm: 3, finalEndAcceptable: true }).fits, false);
});
t("kerf: float noise is tolerated but a real 0.1 mm overrun never fits (11, 06 precision)", () => {
  assert.equal(simulateBar(6500, [2500.0000000001, 2500, 1494], { kerfMm: 3, finalEndAcceptable: true }).fits, true);
  assert.equal(simulateBar(6500, [2500.1, 2500, 1494], { kerfMm: 3, finalEndAcceptable: true }).fits, false);
  assert.equal(simulateBar(6500, [2500.1, 2500, 1494], { kerfMm: 3, finalEndAcceptable: false }).fits, false);
});
t("end trim: an offcut's own trim / end condition overrides the policy; trim longer than the offcut is never used", () => {
  const pol = { ...ALU, finalEndAcceptable: true };
  const strict = one(allocateLinear([alu("a", 900, { stockPolicy: pol })], { existingOffcuts: [{ id: "OC", lengthMm: 900, identity: ANGLE, finalEndAcceptable: false }] }));
  assert.equal(strict.barCount, 1, "the offcut's far end needs a cut, so 900 does not fit 900");
  const trimmed = one(allocateLinear([alu("a", 600)], { existingOffcuts: [{ id: "OC", lengthMm: 700, identity: ANGLE, endTrimMm: 800 }] }));
  assert.equal(trimmed.barCount, 1); assert.equal(trimmed.objective.offcutsUsed, 0);
});
t("AC6 / 12: 6501 on 6500 and 4801 on a 4800-max grid stay unavailable with sharing on — never clamped, split or joined", () => {
  const g = one(allocateLinear([alu("long", 6501), alu("short", 600)]));
  assert.deepEqual(g.unavailable.map((u) => [u.cutId, u.reason]), [["long:1", "exceeds-stock"]]);
  assert.deepEqual(cutIds(g), ["short:1"]); assert.equal(g.procurement, "unavailable-stock");
  const tg = one(allocateLinear([timber("P", 4801, { ...GRID, maxMm: 4800, sharePieces: true, kerfMm: 0, kerfConfirmed: true }), timber("Q", 100, { ...GRID, maxMm: 4800, sharePieces: true, kerfMm: 0, kerfConfirmed: true })]));
  assert.deepEqual(tg.unavailable.map((u) => u.demandId), ["P"]);
  assert.ok(tg.bars.every((b) => b.stockLengthMm <= 4800 && b.cuts.every((c) => c.lengthMm !== 4800)));
  const kerfHuge = one(allocateLinear([alu("a", 600, { stockPolicy: { ...ALU, kerfMm: 7000 } })]));
  assert.equal(kerfHuge.unavailable[0].reason, "end-policy"); assert.equal(kerfHuge.bars.length, 0);
});

// ── stock selection boundaries (03 §T3, 12) ───────────────────────────────────
t("defect: a grid minimum that is not a whole number of increments skipped its own minimum (one-per-piece 1200, shared 1000)", () => {
  const pol = { kind: "grid", minMm: 1000, incrementMm: 600, maxMm: 3000, kerfMm: 0, kerfConfirmed: true };
  assert.equal(selectStock(904.6, pol).reason, "invalid-policy", "T3 max(min, ceil(L/inc)·inc) ≠ 12 min + n·inc here: refused, not guessed");
  for (const sharePieces of [false, true]) {
    const r = allocateLinear([timber("a", 904.6, { ...pol, sharePieces })]);
    assert.equal(r.groups.length, 0); assert.equal(r.rejected[0].reason, "invalid-policy");
  }
  assert.equal(stockPolicyProblem({ kind: "grid", minMm: 1.2, incrementMm: 0.3 }), null, "float-noise ratios still count as whole");
  assert.equal(stockPolicyProblem({ kind: "grid", minMm: 1200, incrementMm: 600 }), null);
});
t("selectStock = the smallest permitted length ≥ need for random grids / availability", () => {
  const rnd = mulberry32(11);
  for (let s = 0; s < 300; s++) {
    const inc = [300, 600, 450][s % 3], min = inc * [2, 3, 4][Math.floor(rnd() * 3)];
    const maxMm = rnd() < 0.5 ? min + inc * (2 + Math.floor(rnd() * 12)) : null;
    const grid = permittedStockLengths({ kind: "grid", minMm: min, incrementMm: inc, maxMm: maxMm ?? min + inc * 20 });
    const unavailableMm = grid.filter(() => rnd() < 0.25);
    const pol = { kind: "grid", minMm: min, incrementMm: inc, maxMm, unavailableMm };
    const need = rnd() < 0.3 ? grid[Math.floor(rnd() * grid.length)] : Math.round(rnd() * (min + inc * 22) * 10) / 10 + 0.1;
    const want = grid.filter((g) => !unavailableMm.includes(g)).find((g) => g >= need - EPS) ?? null;
    const got = selectStock(need, pol).stockMm;
    if (maxMm !== null || want !== null) assert.equal(got, want, `case ${s}: need ${need} ${JSON.stringify(pol)}`);
    // on the grid = the minimum or a whole multiple of the increment (contract: max(min, ceil(L/inc)·inc))
    const onGrid = (v) => v === min || Math.abs(v / inc - Math.round(v / inc)) < 1e-9;
    if (got !== null) assert.ok(got >= need - EPS && got >= min && onGrid(got), `${got} off-grid / short for ${need}`);
  }
});
t("selectStock never returns a length below the need, below the minimum, or above the maximum", () => {
  for (let need = 0.5; need < 8000; need += 97.3) {
    const r = selectStock(need, { ...GRID, maxMm: 6000, unavailableMm: [1800, 4200] });
    if (r.stockMm === null) assert.ok(need > 6000 - EPS, `${need}`);
    else assert.ok(r.stockMm >= need && r.stockMm >= 1200 && r.stockMm <= 6000 && r.stockMm !== 1800 && r.stockMm !== 4200);
  }
});
t("invalid stock policies are rejected, never defaulted (no 1200/600 fallback, no 6 m cap, no 3 mm kerf)", () => {
  for (const bad of [{ kind: "grid", minMm: 0, incrementMm: 600 }, { kind: "grid", minMm: 1200, incrementMm: -600 }, { kind: "list", lengthsMm: [] },
    { kind: "list", lengthsMm: [2400, NaN] }, { kind: "fixed" }, { kind: "grid", minMm: 1200, incrementMm: 600, unavailableMm: "4800" }]) {
    assert.ok(stockPolicyProblem(bad), JSON.stringify(bad));
  }
  assert.equal(stockPolicyProblem({ ...ALU, kerfMm: "3" }).code, "invalid-policy");
  assert.equal(selectStock(20000, GRID).stockMm, 20400, "no implied maximum");
  const g = one(allocateLinear([alu("a", 600, { stockPolicy: { kind: "fixed", lengthMm: 6500, sharePieces: true } })]));
  assert.equal(g.bars[0].kerfLossMm, 0, "unset kerf is never filled with an illustrative 3 mm");
});

// ── never-rules & accounting ──────────────────────────────────────────────────
t("ordered stock is never re-rounded to the grid, kerfed or packed", () => {
  const g = one(allocateLinear([timber("buy", 5000, GRID, { lengthKind: "orderedStock", quantity: 2 }), timber("cut", 500)]));
  assert.deepEqual(g.purchase, [{ stockLengthMm: 5000, quantity: 2 }, { stockLengthMm: 1200, quantity: 1 }]);
  assert.ok(g.bars.filter((b) => b.ordered).every((b) => b.kerfLossMm === 0 && b.residualMm === 0 && b.cuts[0].lengthMm === 5000));
});
t("a planned residual of one group is never offered to another group as stock", () => {
  const r = allocateLinear([alu("a", 2500), alu("b", 2500), alu("c", 600), alu("d", 600, { stockPolicy: { ...ALU, kerfMm: 4 } })]);
  assert.equal(r.groups.length, 2);
  assert.ok(r.groups.every((g) => g.bars.every((b) => b.source === "new" && b.residualStatus === "planned")));
  assert.equal(r.totals.newBars, 2); assert.deepEqual(r.unusedOffcuts, []);
});
t("cut ids stay unique when demand ids contain ':' (\"a\" and \"a:1\")", () => {
  const g = one(allocateLinear([alu("a", 600, { quantity: 2 }), alu("a:1", 700)]));
  assert.deepEqual(cutIds(g).sort(), ["a:1", "a:1:1", "a:2"]);
});
t("zero quantity is nothing to cover (not rejected); weird node budgets fall back to the default", () => {
  const r = allocateLinear([alu("z", 600, { quantity: 0 })]);
  assert.equal(r.groups.length, 0); assert.deepEqual(r.rejected, []);
  for (const nodeBudget of [NaN, -1, 1.5, "100", Infinity]) assert.equal(one(allocateLinear([alu("a", 600)], { nodeBudget })).nodeBudget, DEFAULT_NODE_BUDGET);
});
t(`above MAX_SEARCH_PIECES (${MAX_SEARCH_PIECES}) the first-fit plan is kept and labelled honestly`, () => {
  const same = one(allocateLinear([alu("p", 3400, { quantity: MAX_SEARCH_PIECES + 1 })]));
  assert.equal(same.barCount, MAX_SEARCH_PIECES + 1); assert.equal(same.proven, true, "proven by the large-piece bound, not by search");
  assert.ok(same.explain.some((e) => /search skipped/.test(e)));
  const rnd = mulberry32(5);
  const mixed = one(allocateLinear(Array.from({ length: MAX_SEARCH_PIECES + 1 }, (_, i) => alu(`m${i}`, 300 + Math.round(rnd() * 3000)))));
  assert.equal(mixed.searchNodes, 0); assert.equal(mixed.searchComplete, false);
  if (!mixed.proven) { assert.match(mixed.planLabel, /minimum not proven/); assert.ok(mixed.lowerBound < mixed.barCount); }
});
t("offcut pieces above MAX_CUTS are ignored with a problem (never truncated silently)", () => {
  const r = allocateLinear([alu("a", 600)], { existingOffcuts: [{ id: "BIG", lengthMm: 700, identity: ANGLE, quantity: MAX_CUTS + 1 }] });
  assert.equal(r.totals.offcutsUsed, 0); assert.ok(r.problems.some((p) => /more than/.test(p.message)));
});

// ── exhaustive brute force: proven / searchComplete are never false claims ─────
/** Exhaustive optimum of the full objective (purchased length, bars, offcuts used, remainders largest-first). */
function bruteForce(lengths, offs, pol, share) {
  const P = permittedStockLengths(pol);
  const n = lengths.length;
  let best = null;
  const cmp = (a, b) => {
    if (Math.abs(a.len - b.len) > EPS) return a.len - b.len;
    if (a.nb !== b.nb) return a.nb - b.nb;
    if (a.oc !== b.oc) return a.oc - b.oc;
    for (let i = 0; i < Math.max(a.rem.length, b.rem.length); i++) { const x = a.rem[i] ?? 0, y = b.rem[i] ?? 0; if (Math.abs(x - y) > EPS) return y - x; }
    return 0;
  };
  const opt = (trim, fea) => ({ kerfMm: pol.kerfMm ?? 0, endTrimMm: trim, finalEndAcceptable: fea });
  const assign = new Array(n).fill(0);
  const evaluate = (k) => {
    const blocks = Array.from({ length: k }, () => []);
    assign.forEach((b, i) => blocks[b].push(lengths[i]));
    if (!share && blocks.some((b) => b.length > 1)) return;
    const options = blocks.map((cuts) => {
      const c = [...cuts].sort((a, b) => b - a), o = [];
      for (const s of P) { const r = simulateBar(s, c, opt(pol.endTrimMm ?? 0, pol.finalEndAcceptable === true)); if (r.fits) o.push({ s, res: r.residualMm }); }
      offs.forEach((of, j) => { const r = simulateBar(of.lengthMm, c, opt(of.endTrimMm ?? pol.endTrimMm ?? 0, of.finalEndAcceptable ?? pol.finalEndAcceptable === true)); if (r.fits) o.push({ j, res: r.residualMm }); });
      return o;
    });
    const rec = (bi, used, len, nb, oc, rem) => {
      if (bi === k) {
        const all = [...rem, ...offs.filter((_, j) => !used.has(j)).map((o) => o.lengthMm)].sort((a, b) => b - a);
        const obj = { len, nb, oc, rem: all };
        if (!best || cmp(obj, best) < 0) best = obj;
        return;
      }
      for (const op of options[bi]) {
        if (op.j === undefined) rec(bi + 1, used, len + op.s, nb + 1, oc, [...rem, op.res]);
        else if (!used.has(op.j)) { used.add(op.j); rec(bi + 1, used, len, nb, oc + 1, [...rem, op.res]); used.delete(op.j); }
      }
    };
    rec(0, new Set(), 0, 0, 0, []);
  };
  const partitions = (i, k) => { if (i === n) return evaluate(k); for (let b = 0; b <= k; b++) { assign[i] = b; partitions(i + 1, Math.max(k, b + 1)); } };
  partitions(0, 0);
  return best;
}
const BF_POLICIES = [
  { kind: "list", lengthsMm: [1800, 2400, 3000], kerfMm: 3, kerfConfirmed: true, sharePieces: true },
  { kind: "list", lengthsMm: [2400, 2401, 3000, 3002], kerfMm: 3, kerfConfirmed: true, finalEndAcceptable: true, sharePieces: true },
  { kind: "grid", minMm: 1200, incrementMm: 600, maxMm: 3600, unavailableMm: [2400], kerfMm: 2.5, endTrimMm: 5, kerfConfirmed: true, sharePieces: true },
  { kind: "fixed", lengthMm: 3000, kerfMm: 3, kerfConfirmed: true, finalEndAcceptable: true, sharePieces: true },
  { kind: "list", lengthsMm: [1800, 2400, 3000], kerfMm: 3, kerfConfirmed: true },
  { kind: "grid", minMm: 1200, incrementMm: 600, maxMm: 3000, kerfMm: 3, kerfConfirmed: true, finalEndAcceptable: true },
];
t("proven ⇒ minimum (length, bars) and searchComplete ⇒ whole-objective optimum, at any budget (360 seeded cases)", () => {
  const rnd = mulberry32(20261015);
  const specials = [600, 1200, 1497, 1500, 1794, 1800, 2397, 2400, 2997, 3000];
  for (let s = 0; s < 360; s++) {
    const pol = BF_POLICIES[s % BF_POLICIES.length];
    const lengths = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => (rnd() < 0.3 ? specials[Math.floor(rnd() * specials.length)] : 150 + Math.round(rnd() * 2850)));
    const offs = Array.from({ length: Math.floor(rnd() * 3) }, (_, j) => ({ id: `o${j}`, lengthMm: 300 + Math.round(rnd() * 2400), identity: TIMBER,
      ...(rnd() < 0.3 ? { finalEndAcceptable: rnd() < 0.5 } : {}), ...(rnd() < 0.2 ? { endTrimMm: 4 } : {}) }));
    const nodeBudget = [0, 15, 300, DEFAULT_NODE_BUDGET][s % 4];
    const g = one(allocateLinear(lengths.map((L, i) => timber(`c${i}`, L, pol)), { existingOffcuts: offs, nodeBudget }));
    if (g.unavailable.length) continue;
    const opt = bruteForce(lengths, offs, pol, pol.sharePieces === true);
    const where = `case ${s} ${JSON.stringify(pol)} ${lengths} offcuts ${JSON.stringify(offs.map((o) => o.lengthMm))}`;
    assert.ok(g.objective.purchasedLengthMm >= opt.len - EPS, `${where}: beat the exhaustive optimum?`);
    if (g.lowerBoundUnit === "bars") assert.ok(g.lowerBound <= opt.nb, `${where}: lower bound above optimum`);
    else assert.ok(g.lowerBound <= opt.len + EPS, `${where}: lower bound above optimum`);
    if (g.proven) { near(g.objective.purchasedLengthMm, opt.len, `${where}: proven length`); assert.equal(g.barCount, opt.nb, `${where}: proven bars`); }
    else assert.match(g.planLabel, /not proven|One stock piece/, where);
    if (g.searchComplete) {
      assert.equal(g.objective.offcutsUsed, opt.oc, `${where}: offcuts`);
      assert.equal(g.objective.remaindersMm.length, opt.rem.length, where);
      g.objective.remaindersMm.forEach((r, i) => near(r, opt.rem[i], `${where}: remainder ${i}`));
    }
    if (nodeBudget === DEFAULT_NODE_BUDGET) assert.equal(g.searchComplete, true, `${where}: tiny case should finish`);
  }
});
t("existing offcuts never increase new purchasing or required length (never sacrifice a bar for offcut reuse)", () => {
  const rnd = mulberry32(77);
  for (let s = 0; s < 150; s++) {
    const pol = BF_POLICIES[s % BF_POLICIES.length];
    const ds = Array.from({ length: 1 + Math.floor(rnd() * 7) }, (_, i) => timber(`c${i}`, 150 + Math.round(rnd() * 2850), pol));
    const offs = Array.from({ length: 1 + Math.floor(rnd() * 4) }, (_, j) => ({ id: `o${j}`, lengthMm: 200 + Math.round(rnd() * 3000), identity: TIMBER }));
    const without = one(allocateLinear(ds)), withOff = one(allocateLinear(ds, { existingOffcuts: offs }));
    near(without.totals.requiredLengthMm + 0, withOff.totals.requiredLengthMm, `case ${s}: installed demand unchanged`);
    if (without.proven && withOff.proven && !without.unavailable.length) {
      assert.ok(withOff.objective.purchasedLengthMm <= without.objective.purchasedLengthMm + EPS, `case ${s}: offcuts increased purchasing`);
      if (Math.abs(withOff.objective.purchasedLengthMm - without.objective.purchasedLengthMm) <= EPS) assert.ok(withOff.barCount <= without.barCount, `case ${s}`);
    }
  }
});

// ── placements, conservation, determinism under hostile inputs ────────────────
t("placements: inside the stock after the trim, in order, a kerf after every non-final-end piece, nothing overlaps", () => {
  const rnd = mulberry32(31);
  for (let s = 0; s < 150; s++) {
    const pol = { ...BF_POLICIES[s % 4], endTrimMm: [0, 2, 7.5][s % 3] };
    const ds = Array.from({ length: 1 + Math.floor(rnd() * 12) }, (_, i) => timber(`c${i}`, Math.round((100 + rnd() * 2800) * 10) / 10, pol, { quantity: 1 + Math.floor(rnd() * 2) }));
    const offs = Array.from({ length: Math.floor(rnd() * 3) }, (_, j) => ({ id: `o${j}`, lengthMm: 300 + Math.round(rnd() * 2400), identity: TIMBER, ...(rnd() < 0.3 ? { endTrimMm: 1 } : {}) }));
    const g = one(allocateLinear(deepFreeze(ds), { existingOffcuts: deepFreeze(offs), nodeBudget: 500 }));
    for (const b of g.bars) {
      const ec = b.endCondition;
      let pos = ec.endTrimMm;
      b.cuts.forEach((c, x) => {
        near(c.startMm, pos, `case ${s} ${b.id} cut ${x} start`); near(c.endMm - c.startMm, c.lengthMm);
        assert.ok(c.endMm <= b.stockLengthMm + EPS, `case ${s}: cut beyond stock`);
        if (c.usesFinalEnd) { assert.equal(x, b.cuts.length - 1); assert.equal(c.kerfAfterMm, 0); near(c.endMm, b.stockLengthMm); }
        else { assert.equal(c.kerfAfterMm, ec.kerfMm); assert.ok(c.endMm + ec.kerfMm <= b.stockLengthMm + EPS, `case ${s}: kerf outside usable stock`); }
        pos = c.endMm + c.kerfAfterMm;
      });
      near(b.trimLossMm + b.cuts.reduce((a, c) => a + c.lengthMm, 0) + b.kerfLossMm + b.residualMm, b.stockLengthMm, `case ${s} conservation`);
      near(b.stockLengthMm - pos, b.residualMm, `case ${s} residual = what is left after the last cut`);
      assert.ok(b.residualMm >= 0);
    }
  }
});
t("determinism: shuffled demands / offcuts with duplicates and invalid records give identical groups", () => {
  const rnd = mulberry32(404);
  for (let s = 0; s < 40; s++) {
    const ds = Array.from({ length: 2 + Math.floor(rnd() * 8) }, (_, i) => alu(`d${Math.floor(rnd() * 6)}`, 300 + Math.round(rnd() * 3000), { label: `W${i}` }));
    const offs = Array.from({ length: Math.floor(rnd() * 5) }, () => ({ id: `o${Math.floor(rnd() * 3)}`, lengthMm: rnd() < 0.15 ? -1 : 300 + Math.round(rnd() * 2000), identity: ANGLE, quantity: 1 + Math.floor(rnd() * 2) }));
    const a = allocateLinear(ds, { existingOffcuts: offs, nodeBudget: 2000 });
    const b = allocateLinear([...ds].reverse(), { existingOffcuts: [...offs].reverse(), nodeBudget: 2000 });
    assert.equal(JSON.stringify(a.groups), JSON.stringify(b.groups), `case ${s}`);
    assert.equal(JSON.stringify(a.unusedOffcuts), JSON.stringify(b.unusedOffcuts), `case ${s}`);
    assert.deepEqual(a.rejected.map((r) => r.demandId).sort(), b.rejected.map((r) => r.demandId).sort());
    const expected = ds.filter((d) => ds.filter((x) => x.id === d.id).length === 1).map((d) => `${d.id}:1`).sort();
    assert.deepEqual(a.groups.flatMap((g) => [...cutIds(g), ...g.unavailable.map((u) => u.cutId)]).sort(), expected, `case ${s}: exactly once`);
  }
});

console.log(`takeoff-tc-allocator-adv: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
