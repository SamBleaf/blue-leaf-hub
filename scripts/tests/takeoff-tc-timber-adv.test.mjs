// Adversarial verification of shared/takeoff/engine/timber.js against TC-R04 03 (T1–T7), 02 §2, 07 TIM01–TIM03 + J1
// and 12 §Timber stock. Fixtures and journeys go through the PRODUCTION stock selection (engine/stock.js selectStock)
// and allocator (engine/allocator.js allocateLinear) — no re-implemented grid. Each "defect" test reproduces a bug
// found in review (it failed before the fix).
//   node scripts/tests/takeoff-tc-timber-adv.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  repeatedPositions, memberLength, computeRepeatedMembers, computeStudWall, computePlates, computeNoggins, computeTrim,
  computeManualTimber, timberIdentity, timberStockPolicy, resolveSizing, MAX_GENERATED_PER_WALL, OPENING_FRAMING_INCOMPLETE,
} from "../../shared/takeoff/engine/timber.js";
import { EPS_MM, LENGTH_KINDS, QUANTITY_STATUS, INSTALLATION_STATUS, PROCUREMENT_STATUS, identityKey } from "../../shared/takeoff/engine/contract.js";
import { selectStock } from "../../shared/takeoff/engine/stock.js";
import { allocateLinear } from "../../shared/takeoff/engine/allocator.js";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ""} ${a} ≠ ${b}`);
const codes = (r) => r.problems.map((p) => p.code);
const invalid = (r, re) => {
  assert.deepEqual(codes(r), ["invalid_input"]);
  assert.equal(r.demands.length, 0);
  assert.equal(r.status.quantity, "incomplete");
  if (re) assert.match(r.problems[0].message, re);
};
const stockFor = (d) => selectStock(d.lengthMm, d.stockPolicy).stockMm;
const pieces = (r) => r.demands.reduce((s, d) => s + d.quantity, 0);
const byRole = (r, role) => r.demands.filter((d) => d.role === role);

const PINE = { section: "90x45", grade: "MGP10", treatment: "H2", species: "Radiata pine" };
const rafters = (over = {}) => computeRepeatedMembers({
  materialId: "m-raft", purpose: "rafter", identity: PINE, segments: [{ id: "dist1", runMm: 10000 }], centresMm: 600,
  member: { measurementId: "mem1", mode: "projected", lengthMm: 4500, pitchDeg: 30, allowanceMm: 100 }, stock: { maxMm: 7200 }, ...over,
});
const wall = (over = {}) => computeStudWall({
  materialId: "m-stud", wallId: "W1", identity: PINE, wallLengthMm: 6000, centresMm: 600,
  height: { mode: "studCut", studLengthMm: 2400 }, stock: { maxMm: 6000 }, ...over,
});
const noggins = (over = {}) => computeNoggins({ materialId: "m-nog", wallId: "W1", identity: PINE, stock: { maxMm: 4800 },
  stations: [0, 600, 1200, 1800, 2400].map((positionMm) => ({ positionMm, widthMm: 45 })), rows: 1, rowsSource: "entered", ...over });
const manual = (entries, over = {}) => computeManualTimber({ materialId: "m-man", role: "member", identity: PINE, stock: { maxMm: 6000 }, entries, ...over });
const W01 = { id: "W01", xLeftMm: 1150, xRightMm: 2450, sillMm: 900, headMm: 2100 };
const detail = (over = {}) => ({
  source: "reviewed-detail", ref: "FD-3", belowSill: { required: true, deductionMm: 45 }, aboveHead: { required: true, deductionMm: 190 },
  members: [{ id: "K", role: "king", quantity: 2, lengthFrom: "stud", sameAsStud: true },
    { id: "L", role: "lintel", quantity: 1, lengthFrom: "openingWidth", addMm: 180, identity: { section: "190x45", grade: "MGP10", treatment: "H2" }, stock: { maxMm: 6000 } }],
  ...over,
});

/** Contract conformance (contract.js) for every result in this suite. */
function shape(r) {
  assert.ok(QUANTITY_STATUS.includes(r.status.quantity) && INSTALLATION_STATUS.includes(r.status.installation) && PROCUREMENT_STATUS.includes(r.status.procurement));
  const ids = new Set();
  for (const d of r.demands) {
    assert.ok(!ids.has(d.id), `duplicate demand id ${d.id}`);
    ids.add(d.id);
    assert.ok(Number.isInteger(d.quantity) && d.quantity >= 1 && d.lengthMm > 0 && d.unit === "piece" && d.kind === "linear");
    assert.ok(Array.isArray(d.sourceRefs) && d.sourceRefs.length && d.identity?.family === "timber");
  }
  for (const p of r.problems) assert.equal(typeof p.blocking, "boolean");
  return r;
}

// ── fixtures.json through the production stock selection (not an inline grid) ──
const fixtures = JSON.parse(readFileSync(new URL("../../docs/takeoff/TC-R04/fixtures.json", import.meta.url), "utf8")).cases;
for (const f of fixtures.filter((x) => x.kind === "memberStock")) {
  t(`fixture ${f.id}: member demand → selectStock(timber policy) = ${f.expected}`, () => {
    const a = f.input;
    const r = shape(computeRepeatedMembers({ materialId: "m", purpose: "rafter", identity: PINE, segments: [{ id: "d", runMm: 600 }], centresMm: 600,
      member: { mode: a.mode === "true" ? "true" : "projected", lengthMm: a.length, pitchDeg: a.pitch, allowanceMm: a.allowance }, stock: { maxMm: 7200 } }));
    assert.equal(r.demands[0].stockPolicy.incrementMm, a.increment);
    for (const d of r.demands) assert.equal(stockFor(d), f.expected);
  });
}
for (const f of fixtures.filter((x) => x.kind === "stock" && x.id.startsWith("TIM-"))) {
  t(`fixture ${f.id}: a ${f.input.need} mm cut line buys ${f.expected} mm through the timber policy`, () => {
    const policy = timberStockPolicy({ maxMm: 7200 });
    assert.deepEqual([policy.minMm, policy.incrementMm], [f.input.min, f.input.increment]);
    assert.equal(selectStock(f.input.need, policy).stockMm, f.expected);
    const d = manual([{ id: "x", kind: "cut", quantity: 1, lengthMm: f.input.need }]).demands[0];
    assert.equal(d.lengthMm, f.input.need, "the finished cut length is not changed to the stock length");
    assert.equal(stockFor(d), f.expected);
  });
}
for (const f of fixtures.filter((x) => x.kind === "repeated")) {
  t(`fixture ${f.id}: fixed and equal spacing both give ${f.expected} members`, () => {
    const a = f.input;
    for (const spacing of ["fixed", "equal"]) {
      assert.equal(repeatedPositions({ runMm: a.run, centresMm: a.centres, startOffsetMm: a.startOffset, endOffsetMm: a.endOffset, spacing }).length, f.expected);
    }
  });
}

// ── J1 + 12 acceptance through the production allocator ─────────────────────
t("J1 via allocateLinear: 18 × 5,400 = 97,200 mm purchased, one piece per rafter, no splice", () => {
  const r = shape(rafters());
  const a = allocateLinear(r.demands);
  assert.equal(a.rejected.length, 0);
  assert.equal(a.groups.length, 1);
  const g = a.groups[0];
  assert.deepEqual(g.purchase, [{ stockLengthMm: 5400, quantity: 18 }]);
  assert.equal(g.objective.purchasedLengthMm, 97200);
  assert.equal(g.mode, "one-per-piece");
  assert.ok(g.bars.every((b) => b.cuts.length === 1));
});
t("J1 true length via allocateLinear: 18 × 4,800 (pitch not applied, allowance once)", () => {
  const a = allocateLinear(rafters({ member: { mode: "true", lengthMm: 4500, pitchDeg: 30, allowanceMm: 100 } }).demands);
  assert.deepEqual(a.groups[0].purchase, [{ stockLengthMm: 4800, quantity: 18 }]);
});
t("12: need 4,801 with product maximum 4,800 → unavailable, never clamped to 4,800 or spliced", () => {
  const r = manual([{ id: "x", kind: "cut", quantity: 1, lengthMm: 4801 }], { stock: { maxMm: 4800 } });
  assert.equal(r.demands[0].noSplice, true);
  const a = allocateLinear(r.demands);
  assert.equal(a.groups[0].unavailable.length, 1);
  assert.equal(a.groups[0].bars.length, 0);
  assert.equal(a.groups[0].procurement, "unavailable-stock");
});
t("12: an unavailable grid length is skipped to the next grid length, never an off-grid one", () => {
  const d = rafters({ stock: { maxMm: 7200, unavailableMm: [5400] } }).demands[0];
  assert.equal(stockFor(d), 6000);
});

// ── defect: cutting-loss settings were silently dropped (T6 kerf / end trim) ──
t("defect: kerf and end trim reach the allocator — two 600 mm noggins no longer pack into one 1,200 bar", () => {
  const stations = [0, 645, 1290].map((positionMm) => ({ positionMm, widthMm: 45 }));
  const lossy = noggins({ stations, stock: { maxMm: 1200, kerfMm: 3, endTrimMm: 5, kerfConfirmed: true } });
  assert.deepEqual([lossy.demands[0].stockPolicy.kerfMm, lossy.demands[0].stockPolicy.endTrimMm, lossy.demands[0].stockPolicy.kerfConfirmed], [3, 5, true]);
  assert.equal(allocateLinear(lossy.demands).totals.newBars, 2);
  assert.equal(allocateLinear(noggins({ stations, stock: { maxMm: 1200 } }).demands).totals.newBars, 1, "no loss entered → one bar (allocator flags it unconfirmed)");
});
t("defect: cutting-loss settings are validated (negative kerf, non-boolean confirmation)", () => {
  invalid(noggins({ stock: { kerfMm: -1 } }));
  invalid(noggins({ stock: { kerfConfirmed: "yes" } }));
  invalid(noggins({ stock: { finalEndAcceptable: 1 } }));
  assert.equal(timberStockPolicy({ minRetainedOffcutMm: 300 }).minRetainedOffcutMm, 300);
  assert.deepEqual(Object.keys(timberStockPolicy({})).sort(), ["incrementMm", "kind", "maxMm", "minMm", "sharePieces", "unavailableMm"], "unset fields stay unset");
});

// ── defect: other stock settings were silently ignored (T3 "not silently") ───
t("defect: a stock list, fixed length or unknown stock key is rejected, never silently replaced by the grid", () => {
  invalid(rafters({ stock: { kind: "list", lengthsMm: [3000, 6000] } }), /1,200 mm then 600 mm/);
  invalid(rafters({ stock: { lengthsMm: [3000, 6000] } }));
  invalid(rafters({ stock: { kind: "fixed", lengthMm: 6000 } }));
  invalid(rafters({ stock: { maxmm: 6000 } }), /maxmm/);
  assert.throws(() => timberStockPolicy(null));
  assert.equal(timberStockPolicy({ kind: "grid", minMm: 1200, incrementMm: 600 }).kind, "grid", "restating the grid is fine");
});

// ── defect: an explicit sharePieces in stock settings was overridden ─────────
t("defect: stock.sharePieces is honoured; conflicting cutAllocation is rejected; sharing never lifts noSplice", () => {
  assert.equal(noggins({ stock: { maxMm: 4800, sharePieces: false } }).demands[0].stockPolicy.sharePieces, false);
  assert.equal(noggins({ cutAllocation: true, stock: { maxMm: 4800, sharePieces: true } }).demands[0].stockPolicy.sharePieces, true);
  invalid(noggins({ cutAllocation: true, stock: { maxMm: 4800, sharePieces: false } }), /two different ways/);
  const opted = rafters({ stock: { maxMm: 7200, sharePieces: true } });
  assert.ok(opted.demands.every((d) => d.stockPolicy.sharePieces === true && d.noSplice === true));
  assert.ok(rafters().demands.every((d) => d.stockPolicy.sharePieces === false), "structural default stays one piece per member");
});

// ── defect: duplicate demand ids (allocator rejects the second → member silently not ordered) ──
t("defect: duplicate member ids in an opening detail are rejected (no duplicate demand ids)", () => {
  const d = detail({ members: [{ id: "K", role: "king", quantity: 1, lengthFrom: "stud", sameAsStud: true }, { id: "K", role: "king", quantity: 1, lengthFrom: "stud", sameAsStud: true }] });
  invalid(wall({ openings: [{ ...W01, detail: d }] }), /listed twice/);
});
t("defect: ids that collide through the ':' separator are rejected, never emitted twice", () => {
  invalid(manual([{ id: "C1", kind: "count", lengthMm: 2400, markers: [{ id: "a" }] }, { id: "C1:L2400", kind: "cut", quantity: 1, lengthMm: 2400 }]), /same id/);
});
t("every demand of a fully framed wall with extras, plies and two openings has a unique stable id", () => {
  const r = shape(wall({ plies: 2, openings: [{ ...W01, detail: detail() }, { id: "D1", xLeftMm: 3500, xRightMm: 4400, sillMm: 0, headMm: 2100, detail: detail({ belowSill: undefined }) }],
    extras: [{ id: "C1", role: "corner", quantity: 3, lengthFrom: "stud", sameAsStud: true }] }));
  const again = wall({ plies: 2, openings: [{ id: "D1", xLeftMm: 3500, xRightMm: 4400, sillMm: 0, headMm: 2100, detail: detail({ belowSill: undefined }) }, { ...W01, detail: detail() }],
    extras: [{ id: "C1", role: "corner", quantity: 3, lengthFrom: "stud", sameAsStud: true }] });
  assert.deepEqual(again.demands.map((d) => d.id).sort(), r.demands.map((d) => d.id).sort(), "opening order does not change ids");
  assert.equal(allocateLinear(r.demands).rejected.length, 0);
});

// ── defect: plies / duplicates were generated before the limit check (hang) ──
t("defect: huge plies or duplicates are rejected before generation (no hang, no truncation)", () => {
  const t0 = Date.now();
  invalid(rafters({ plies: 1e9 }), /split/);
  invalid(rafters({ overrides: { "dist1:@600": { duplicate: 1e9 } } }), /split/);
  invalid(wall({ plies: 1e9 }), /split/);
  invalid(wall({ plies: 1e6, openings: [{ ...W01, detail: detail() }] }), /split/);
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0} ms`);
  assert.equal(rafters({ plies: Math.floor(MAX_GENERATED_PER_WALL / 18) }).demands.length, 18 * Math.floor(MAX_GENERATED_PER_WALL / 18), "at the limit still allowed");
});

// ── defect: identity dropped moisture / end condition / manufacturer / SKU (incompatible pooling) ──
t("defect: moisture, end condition, manufacturer and SKU are procurement identity; absent fields keep the old key", () => {
  const base = identityKey(timberIdentity(PINE));
  for (const change of [{ moisture: "green" }, { endCondition: "end-matched" }, { manufacturer: "Wesbeam" }, { sku: "LVL-190" }]) {
    assert.notEqual(identityKey(timberIdentity({ ...PINE, ...change })), base, JSON.stringify(change));
  }
  assert.equal(identityKey(timberIdentity({ ...PINE, moisture: "  " })), base);
  const green = manual([{ id: "a", kind: "cut", quantity: 1, lengthMm: 900 }], { identity: { ...PINE, moisture: "green" }, cutAllocation: true });
  const kd = manual([{ id: "b", kind: "cut", quantity: 1, lengthMm: 900 }], { identity: { ...PINE, moisture: "KD" }, cutAllocation: true });
  assert.equal(allocateLinear([...green.demands, ...kd.demands]).groups.length, 2, "green and kiln-dried never share a bar");
});
t("TIM03: grade / treatment / section changes never pool in the allocator", () => {
  const mix = [PINE, { ...PINE, grade: "MGP12" }, { ...PINE, treatment: "H3" }, { ...PINE, section: "70x45" }]
    .flatMap((identity, i) => manual([{ id: `e${i}`, kind: "cut", quantity: 1, lengthMm: 500 }], { identity, cutAllocation: true }).demands);
  assert.equal(allocateLinear(mix).groups.length, 4);
});

// ── defect: one measurement feeding two runs double counted silently ─────────
t("defect: the same measurement feeding two distribution runs is rejected (would double count)", () => {
  invalid(rafters({ segments: [{ id: "a", measurementId: "M1", runMm: 3000 }, { id: "b", measurementId: "M1", runMm: 3000 }] }), /counted twice/);
  invalid(rafters({ segments: [{ id: "j", parts: [{ measurementId: "M1", runMm: 3000 }, { measurementId: "M1", runMm: 3000 }] }] }));
  assert.equal(rafters({ segments: [{ id: "a", runMm: 3000 }, { id: "b", runMm: 3000 }] }).demands.length, 12, "two measured planes are still two");
});

// ── defect: ordered stock lost its source as data ────────────────────────────
t("defect: orderedStock keeps its source in sourceRefs; a measured length on an ordered line is refused", () => {
  const r = shape(manual([{ id: "O1", kind: "orderedStock", quantity: 4, stockLengthMm: 5400.4, source: "Cut list A", measurementId: "att-9" }]));
  assert.deepEqual(r.demands[0].sourceRefs, [{ measurementId: "att-9", role: "orderedStock", source: "Cut list A" }]);
  assert.equal(r.demands[0].lengthMm, 5400.4, "no rounding of an ordered stock length");
  const a = allocateLinear(r.demands);
  assert.deepEqual(a.groups[0].purchase, [{ stockLengthMm: 5400.4, quantity: 4 }], "bought exactly as entered");
  invalid(manual([{ id: "O", kind: "orderedStock", quantity: 1, stockLengthMm: 5400, lengthMm: 5200, source: "S" }]), /stock length only/);
  invalid(manual([{ id: "O", kind: "orderedStock", quantity: 1, stockLengthMm: 5400, source: "S", member: { mode: "true", lengthMm: 1 } }]));
});

// ── defect: trim explain claimed the allocator would join long segments ──────
t("defect: joinsAllowed is not described as an automatic join; the allocator still never splits a long trim", () => {
  const r = computeTrim({ materialId: "t", identity: { section: "66x18" }, joinsAllowed: true, stock: { maxMm: 5400 }, segments: [{ id: "t1", lengthMm: 7000 }] });
  assert.ok(!r.explain.some((e) => /allocator may join/.test(e)));
  assert.equal(r.demands[0].noSplice, false);
  assert.equal(allocateLinear(r.demands).groups[0].unavailable.length, 1);
});

// ── defect: reviewed framing detail without a reference was accepted, provenance lost ──
t("defect: a reviewed opening detail must name its reference; the reference is reported", () => {
  const noRef = wall({ openings: [{ ...W01, detail: detail({ ref: undefined }) }] });
  assert.equal(noRef.status.quantity, "incomplete");
  assert.match(noRef.problems.find((p) => p.code === "opening_framing_incomplete").message, /reviewed detail's reference/);
  assert.ok(!noRef.demands.some((d) => d.role === "lintel"));
  const ok = wall({ openings: [{ ...W01, detail: detail() }] });
  assert.equal(ok.status.quantity, "calculated");
  assert.ok(ok.explain.some((e) => /W01: framing from reviewed detail FD-3/.test(e)));
  assert.deepEqual(ok.layout.openings[0].detail, { source: "reviewed-detail", ref: "FD-3" });
  assert.equal(ok.status.installation, "unspecified", "a reviewed framing detail closes quantity, not design validation");
  const explicit = wall({ openings: [{ ...W01, detail: detail({ source: "explicit", ref: undefined }) }] });
  assert.equal(explicit.status.quantity, "calculated", "explicit quantities (manual BOM) need no detail reference");
});
t("defect: noggin rows from a reviewed detail must name it", () => {
  invalid(noggins({ rowsSource: "reviewed-detail" }), /reviewed framing detail/);
  assert.ok(noggins({ rowsSource: "reviewed-detail", rowsDetailRef: "FD-7" }).explain.some((e) => /reviewed detail FD-7/.test(e)));
});

// ── defect: hip/valley/jack were sent to manual entry that could not take a projected length ──
t("defect: a manual member line takes an individual projected length + its own pitch; allowance once", () => {
  const r = shape(manual([{ id: "H1", kind: "member", quantity: 2, measurementId: "hip-1", member: { mode: "projected", lengthMm: 3000, pitchDeg: 21.4 } }], { role: "hip", allowanceMm: 50 }));
  const d = r.demands[0];
  close(d.lengthMm, 3000 / Math.cos((21.4 * Math.PI) / 180) + 50);
  assert.deepEqual([d.quantity, d.role, d.lengthKind, d.noSplice, d.provenance], [2, "hip", LENGTH_KINDS.CUT, true, "manual"]);
  assert.equal(stockFor(d), 3600);
  assert.equal(manual([{ id: "J", kind: "member", quantity: 1, member: { mode: "true", lengthMm: 2000, pitchDeg: 45 } }]).demands[0].lengthMm, 2000, "true length never pitched");
  invalid(manual([{ id: "H", kind: "member", quantity: 1, member: { mode: "projected", lengthMm: 3000, pitchDeg: 20, allowanceMm: 50 } }], { allowanceMm: 50 }), /once/);
  invalid(manual([{ id: "H", kind: "member", quantity: 1, member: { mode: "projected", lengthMm: 3000 } }]), /Pitch/);
  assert.match(rafters({ purpose: "valley" }).problems[0].message, /manual member/);
});

// ── T1 properties (deterministic sweep, production positions) ────────────────
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
t("T1 sweep: fixed centres start at a, end at D−b, never a bay longer than c, and the count is minimal", () => {
  for (let i = 0; i < 400; i++) {
    const c = [300, 400, 450, 600, 900, 1200][i % 6];
    const D = Math.round(rand() * 20000 * 10) / 10 + 1;
    const a = i % 3 ? 0 : Math.min(45, D / 4);
    const b = i % 5 ? 0 : Math.min(22.5, D / 4);
    const p = repeatedPositions({ runMm: D, centresMm: c, startOffsetMm: a, endOffsetMm: b });
    const R = D - a - b;
    close(p[0], a); close(p.at(-1), D - b);
    for (let k = 1; k < p.length; k++) {
      assert.ok(p[k] > p[k - 1], "strictly increasing");
      assert.ok(p[k] - p[k - 1] <= c + EPS_MM, `bay ${p[k] - p[k - 1]} > ${c}`);
      if (k < p.length - 1) close(p[k] - p[k - 1], c, "only the final bay may differ");
    }
    assert.ok((p.length - 2) * c < R - EPS_MM, "one member fewer would leave a bay longer than c");
  }
});
t("T1 sweep: equal spacing uses the fewest equal bays ≤ c; endpoint exclusions only drop the end members", () => {
  for (let i = 0; i < 200; i++) {
    const c = [450, 600][i % 2];
    const D = Math.round(rand() * 12000) + 700;
    const p = repeatedPositions({ runMm: D, centresMm: c, spacing: "equal" });
    const bay = p[1] - p[0];
    assert.ok(bay <= c + EPS_MM && (p.length - 2) * c < D);
    for (let k = 1; k < p.length; k++) close(p[k] - p[k - 1], bay);
    const all = repeatedPositions({ runMm: D, centresMm: c });
    assert.deepEqual(repeatedPositions({ runMm: D, centresMm: c, includeStart: false, includeEnd: false }), all.slice(1, -1));
  }
});
t("T1 R < 0 by 0.1 mm is rejected; a float-noise zero still needs the explicit single member", () => {
  assert.throws(() => repeatedPositions({ runMm: 1000, centresMm: 600, startOffsetMm: 500.1, endOffsetMm: 500 }), /longer than the run/);
  assert.throws(() => repeatedPositions({ runMm: 1000, centresMm: 600, startOffsetMm: 500, endOffsetMm: 500 - 1e-9 }), /single member/);
  assert.deepEqual(repeatedPositions({ runMm: 1000, startOffsetMm: 500, endOffsetMm: 500 - 1e-9, singleMember: true }), [500]);
  assert.throws(() => repeatedPositions({ runMm: 1000, centresMm: 600, startOffsetMm: -1 }));
  assert.throws(() => repeatedPositions({ runMm: 1000, centresMm: 0 }));
  assert.throws(() => repeatedPositions({ runMm: Number.NaN, centresMm: 600 }));
});
t("T1 exclusions are applied after generation even with offsets and equal spacing (never a regrid)", () => {
  const all = repeatedPositions({ runMm: 6100, centresMm: 600, startOffsetMm: 45, endOffsetMm: 45, spacing: "equal" });
  assert.deepEqual(repeatedPositions({ runMm: 6100, centresMm: 600, startOffsetMm: 45, endOffsetMm: 45, spacing: "equal", includeEnd: false }), all.slice(0, -1));
});
t("T1 joined parts share one phase (3,000 + 3,000 = 11, the joint once); separate runs restart (12)", () => {
  const joined = shape(rafters({ segments: [{ id: "j", parts: [{ measurementId: "a", runMm: 3000 }, { measurementId: "b", runMm: 3000 }] }] }));
  assert.equal(joined.demands.length, 11);
  assert.equal(joined.demands.filter((d) => d.id.includes(":@3000:")).length, 1);
  const shifted = rafters({ segments: [{ id: "j", parts: [{ measurementId: "a", runMm: 2900 }, { measurementId: "b", runMm: 3100 }] }] });
  assert.deepEqual(shifted.layout.ticks.map((x) => x.positionMm), joined.layout.ticks.map((x) => x.positionMm), "phase follows the run, not the part joint");
  assert.equal(rafters({ segments: [{ id: "a", runMm: 2900 }, { id: "b", runMm: 3100 }] }).demands.length, 6 + 7, "each run restarts: 2,900 → 6, 3,100 → 7");
});
t("T1 plies and coincident planes are never deduplicated; requiredPieces = stations × plies", () => {
  const r = shape(rafters({ plies: 3, segments: [{ id: "p1", runMm: 1200 }, { id: "p2", runMm: 1200 }] }));
  assert.equal(r.demands.length, 3 * 3 * 2);
  assert.equal(pieces(r), r.layout.ticks.length * 3);
});
t("T1 overrides: stale ones block and never re-pin; removed ones never come back with a duplicate or length", () => {
  const r = rafters({ segments: [{ id: "dist1", runMm: 10300 }], overrides: { "dist1:@10000": { member: { mode: "true", lengthMm: 1 } } } });
  assert.ok(codes(r).includes("override_stale"));
  assert.ok(r.problems.find((p) => p.code === "override_stale").blocking);
  assert.ok(!r.demands.some((d) => d.lengthMm < 100), "the stale length change is not applied to the new end member");
  invalid(rafters({ overrides: { "dist1:@600": { remove: true, duplicate: 1 } } }));
  invalid(rafters({ overrides: [{ station: "dist1:@600", remove: true }] }));
});
t("T2/rake: interpolation is along the run (offsets included), lengths of an override never inherit the rake", () => {
  const r = rafters({ segments: [{ id: "d", runMm: 1200 }], member: { mode: "true", rake: { startLengthMm: 2000, endLengthMm: 3200 } },
    overrides: { "d:@600": { member: { lengthMm: 1500 } } } });
  assert.deepEqual(r.demands.map((d) => d.lengthMm), [2000, 1500, 3200]);
  invalid(rafters({ segments: [{ id: "a", runMm: 600 }, { id: "b", runMm: 600 }], member: { mode: "true", rake: { startLengthMm: 1, endLengthMm: 2 } } }), /one distribution run/);
});

// ── T2 member length ─────────────────────────────────────────────────────────
t("T2 clear span: the SUM of span + overhangs is sloped, then the allowance is added once (not each part)", () => {
  const r = memberLength({ mode: "clearSpan", lengthMm: 3000, pitchDeg: 30, overhangsMm: [{ label: "Eave", mm: 600 }, { label: "Bearing", mm: 90 }], allowanceMm: 40 });
  const cos = Math.cos(Math.PI / 6);
  close(r.trueLengthMm, 3690 / cos);
  close(r.lengthNeededMm, 3690 / cos + 40);
  assert.ok(Math.abs(r.lengthNeededMm - (3000 / cos + 690 + 40)) > 1, "overhangs are sloped too");
  assert.throws(() => memberLength({ mode: "clearSpan", lengthMm: 3000, overhangsMm: [] }), /Pitch/);
  assert.throws(() => memberLength({ mode: "clearSpan", lengthMm: 3000, pitchDeg: 30, overhangsMm: [{ label: "Eave", mm: -10 }] }));
});
t("T2 no double pitch anywhere: a true length re-entered at any pitch is unchanged; pitch is never inferred", () => {
  for (const pitch of [0, 15, 30, 45, 75]) assert.equal(memberLength({ mode: "true", lengthMm: 4321.5, pitchDeg: pitch }).trueLengthMm, 4321.5);
  assert.throws(() => memberLength({ mode: "projected", lengthMm: 4500, pitchDeg: null }), /Pitch/);
  assert.throws(() => memberLength({ mode: "projected", lengthMm: 4500, pitchDeg: -5 }));
  assert.throws(() => memberLength({ mode: "projected", lengthMm: 4500, pitchDeg: 30, allowanceMm: Number.POSITIVE_INFINITY }));
});
t("T2 allowance once on every path: repeated, override, stud wall, opening members, plates, manual", () => {
  assert.ok(rafters({ member: { mode: "true", lengthMm: 4000, allowanceMm: 25 } }).demands.every((d) => d.lengthMm === 4025));
  const w = wall({ allowanceMm: 10, openings: [{ ...W01, detail: detail() }] });
  assert.ok(byRole(w, "stud").every((d) => d.lengthMm === 2410));
  assert.deepEqual(byRole(w, "king").map((d) => d.lengthMm), [2410]);
  assert.deepEqual(byRole(w, "below-sill").map((d) => d.lengthMm), [865, 865, 865]);
  assert.equal(computePlates({ materialId: "p", wallId: "W1", identity: PINE, runMm: 6000, allowanceMm: 10, layers: [{ tag: "top" }] }).demands[0].lengthMm, 6010);
  assert.equal(manual([{ id: "c", kind: "cut", quantity: 1, lengthMm: 1000 }], { allowanceMm: 10 }).demands[0].lengthMm, 1010);
  assert.equal(memberLength({ mode: "true", lengthMm: 1000 }).lengthNeededMm, 1000, "default allowance 0 — no flashing +200/100");
});

// ── T3 ───────────────────────────────────────────────────────────────────────
t("T3 every structural demand is noSplice with one stock piece each; no maximum is invented", () => {
  const all = [
    rafters({ stock: undefined }),
    wall({ stock: undefined, openings: [{ ...W01, detail: detail({ members: detail().members.map((m) => ({ ...m, stock: undefined })) }) }] }),
    computePlates({ materialId: "p", wallId: "W1", identity: PINE, runMm: 9000, layers: [{ tag: "top" }] }),
  ];
  for (const r of all) {
    for (const d of r.demands) {
      assert.equal(d.noSplice, true, d.id);
      assert.equal(d.stockPolicy.sharePieces, false, d.id);
      assert.notEqual(d.stockPolicy.maxMm, 6000, "no arbitrary 6 m maximum");
    }
  }
  for (const r of all) {
    assert.ok(r.demands.every((d) => d.stockPolicy.maxMm === null));
    assert.ok(codes(r).includes("stock_max_unset") && r.problems.find((p) => p.code === "stock_max_unset").blocking === false);
  }
});
t("T3 the grid cannot be bent: off-grid unavailable, max below 1,200, NaN max", () => {
  for (const s of [{ unavailableMm: [1500] }, { unavailableMm: [600] }, { maxMm: 1199 }, { maxMm: Number.NaN }, { unavailableMm: "4800" }]) invalid(rafters({ stock: s }));
});

// ── T4 / TIM02 ───────────────────────────────────────────────────────────────
t("TIM02 never 'base − floor(width/centres)': a 200 mm opening across a stud removes it (naive removes 0)", () => {
  const r = wall({ openings: [{ ...W01, xLeftMm: 1100, xRightMm: 1300 }] });
  assert.equal(Math.floor(200 / 600), 0);
  assert.deepEqual(r.layout.openings[0].removedStationIds, ["W1:@1200"]);
  assert.equal(byRole(r, "stud").length, 10);
});
t("TIM02 clipping is strict and exact: a stud 0.1 mm inside is removed, one on the edge is kept", () => {
  assert.deepEqual(wall({ openings: [{ ...W01, xLeftMm: 1199.9, xRightMm: 1800.1 }] }).layout.openings[0].removedStationIds, ["W1:@1200", "W1:@1800"]);
  assert.deepEqual(wall({ openings: [{ ...W01, xLeftMm: 1200, xRightMm: 1800 }] }).layout.openings[0].removedStationIds, []);
});
t("TIM02 clipping uses the real (offset) stations, not the nominal grid", () => {
  const r = wall({ startOffsetMm: 45, endOffsetMm: 45, openings: [{ ...W01, xLeftMm: 1200, xRightMm: 1300 }] });
  assert.deepEqual(r.layout.openings[0].removedStationIds, ["W1:@1245"]);
});
t("TIM02 incomplete opening: base studs only label, no invented cripples/jacks/lintel, blocking, not order-complete", () => {
  for (const d of [undefined, { source: "explicit" }, detail({ members: [{ id: "J", role: "jack", quantity: 2, lengthFrom: "headLevel" }] })]) {
    const r = shape(wall({ openings: [{ ...W01, detail: d }] }));
    assert.deepEqual([...new Set(r.demands.map((x) => x.role))], ["stud"]);
    assert.equal(r.layout.scope, OPENING_FRAMING_INCOMPLETE);
    assert.equal(r.status.quantity, "incomplete");
    assert.ok(r.explain.includes("Base studs only; opening framing incomplete"));
  }
});
t("TIM02 below-sill / above-head pieces only at removed stations, only where the subregion exists and is required", () => {
  const r = wall({ openings: [{ ...W01, detail: detail({ aboveHead: { required: false } }) }] });
  assert.deepEqual(byRole(r, "below-sill").map((d) => d.sourceRefs[0].station), [1200, 1800, 2400]);
  assert.equal(byRole(r, "above-head").length, 0);
  const door = wall({ openings: [{ ...W01, sillMm: 0, detail: detail({ belowSill: undefined }) }] });
  assert.equal(byRole(door, "below-sill").length, 0);
  assert.equal(door.status.quantity, "calculated", "a non-existent subregion needs no rule");
});
t("TIM02 coincident king + common stud reconcile only when permitted; default orders both", () => {
  const kings = { id: "K", role: "king", quantity: 2, lengthFrom: "stud", sameAsStud: true, atMm: [600, 3000] };
  const off = wall({ openings: [{ ...W01, detail: detail({ members: [kings] }) }] });
  const on = wall({ openings: [{ ...W01, detail: detail({ members: [kings], reconcileCoincident: true }) }] });
  assert.equal(pieces(off) - pieces(on), 2);
  const otherProduct = wall({ openings: [{ ...W01, detail: detail({ reconcileCoincident: true, members: [{ ...kings, sameAsStud: undefined, identity: { ...PINE, grade: "MGP12" } }] }) }] });
  assert.equal(pieces(otherProduct), pieces(off), "a different product is never merged");
});
t("T4 height modes are exclusive and plate thicknesses are never defaulted", () => {
  invalid(wall({ height: { mode: "frameHeight", frameHeightMm: 2700, topPlateMm: 90 } }), /Bottom plate/);
  invalid(wall({ height: { mode: "frameHeight", frameHeightMm: 2700, bottomPlateMm: 45, topPlateMm: 90, studLengthMm: 2565 } }));
  invalid(wall({ height: { mode: "frameHeight", frameHeightMm: 135, bottomPlateMm: 45, topPlateMm: 90 } }), /no stud length/);
  invalid(wall({ height: { mode: "studs", studLengthMm: 2400 } }));
});

// ── T5 ───────────────────────────────────────────────────────────────────────
t("T5 noggin clear bay subtracts half of EACH bordering member (double stud 90 wide: 600 − 45 − 22.5 = 532.5)", () => {
  const r = noggins({ stations: [{ positionMm: 0, widthMm: 90 }, { positionMm: 600, widthMm: 45 }, { positionMm: 1200, widthMm: 45 }] });
  assert.deepEqual(r.demands.map((d) => d.lengthMm), [532.5, 555]);
  assert.deepEqual(noggins({ stations: [{ positionMm: 1200, widthMm: 45 }, { positionMm: 0, widthMm: 45 }, { positionMm: 600, widthMm: 45 }] }).demands.map((d) => d.id),
    noggins({ stations: [{ positionMm: 0, widthMm: 45 }, { positionMm: 600, widthMm: 45 }, { positionMm: 1200, widthMm: 45 }] }).demands.map((d) => d.id), "station order is not identity");
  invalid(noggins({ stations: [{ positionMm: 0, widthMm: 45 }, { positionMm: 40, widthMm: 45 }] }), /no clear bay/);
});
t("T5 noggin rows are never inferred: no rows → nothing ordered, blocking, whatever support spacing is supplied", () => {
  const r = noggins({ rows: undefined, rowsSource: undefined, supportSpacingMm: 450, battenSpacingMm: 600 });
  assert.equal(r.demands.length, 0);
  assert.ok(r.problems.find((p) => p.code === "noggin_rows_missing").blocking);
  invalid(noggins({ rows: 0 }));
  invalid(noggins({ rows: 1.5 }));
});
t("T5 plates: one piece per layer, never aggregate LM; joints need the detail and must be inside the run", () => {
  const r = computePlates({ materialId: "p", wallId: "W1", identity: PINE, runMm: 12000, layers: [{ tag: "bottom" }, { tag: "top" }] });
  assert.deepEqual(r.demands.map((d) => [d.role, d.quantity, d.lengthMm, d.unit]), [["bottom-plate", 1, 12000, "piece"], ["top-plate", 1, 12000, "piece"]]);
  invalid(computePlates({ materialId: "p", wallId: "W1", identity: PINE, runMm: 6000, jointDetailRef: "FD", layers: [{ tag: "top", jointsMm: [3000, 2000] }] }));
  invalid(computePlates({ materialId: "p", wallId: "W1", identity: PINE, runMm: 6000, jointDetailRef: "FD", layers: [{ tag: "top", jointsMm: [0] }] }));
  invalid(computePlates({ materialId: "p", wallId: "W1", identity: PINE, runMm: 6000, layers: [] }));
});

// ── T7 ───────────────────────────────────────────────────────────────────────
t("T7 count markers: shared length grouped, per-marker lengths in their own labelled group, all cut-kind", () => {
  const r = shape(manual([{ id: "C", kind: "count", lengthMm: 900, markers: [{ id: "1" }, { id: "2", lengthMm: 1300 }, { id: "3" }] }]));
  assert.deepEqual(r.demands.map((d) => [d.quantity, d.lengthMm, d.lengthKind]), [[2, 900, "cut"], [1, 1300, "cut"]]);
  assert.deepEqual(r.demands.map(stockFor), [1200, 1800]);
  invalid(manual([{ id: "C", kind: "count", lengthMm: 900, markers: [{ id: "1" }, { id: "1" }] }]), /listed twice/);
});

// ── sizing + robustness ──────────────────────────────────────────────────────
t("sizing is never structurally verified and never auto-selected", () => {
  assert.equal(resolveSizing({ section: null, sizing: { source: "manual" } }).outcome, "missingInput");
  for (const r of [rafters(), wall(), noggins(), manual([{ id: "c", kind: "cut", quantity: 1, lengthMm: 900 }])]) {
    assert.ok(["unspecified", "project-detail-supplied"].includes(r.status.installation));
    assert.ok(r.explain.some((e) => /not structurally verified|not checked by this tool/.test(e)));
  }
  assert.ok(!rafters({ identity: {} }).demands.some((d) => d.identity.section), "no section is invented");
});
t("garbage input never throws from a compute*: it returns a blocking invalid_input result", () => {
  const junk = [null, undefined, 0, "x", [], { materialId: "m" }, { materialId: "m", identity: PINE, segments: [null] },
    { materialId: "m", identity: PINE, stations: [null, null] }, { materialId: "m", identity: PINE, entries: [null] }, { materialId: "m", identity: PINE, layers: [null] },
    { materialId: "m", identity: PINE, segments: [{ id: "s", lengthMm: Number.NaN }] }, { materialId: "m", identity: PINE, stock: [] }];
  for (const fn of [computeRepeatedMembers, computeStudWall, computePlates, computeNoggins, computeTrim, computeManualTimber]) {
    for (const j of junk) {
      const r = fn(j);
      assert.ok(codes(r).includes("invalid_input") && r.demands.length === 0 && r.status.quantity === "incomplete", `${fn.name}(${JSON.stringify(j)})`);
    }
  }
  invalid(wall({ openings: [{ ...W01, detail: { ...detail(), members: [null] } }] }));
  invalid(wall({ openings: [{ ...W01, detail: detail({ members: [{ id: "X", role: "king", quantity: 1, lengthFrom: "constructor", sameAsStud: true }] }) }] }));
});

console.log(`takeoff-tc-timber-adv: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
