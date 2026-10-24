// TC-R04 timber methods (03 T1–T7, 02 §2, 07 TIM01–TIM03 + journey J1) against the production module
// shared/takeoff/engine/timber.js. Every fixtures.json case of kind "repeated"/"memberStock" runs through it.
//   node scripts/tests/takeoff-tc-timber.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  repeatedPositions, memberLength, computeRepeatedMembers, computeStudWall, computePlates, computeNoggins, computeTrim,
  computeManualTimber, timberIdentity, timberStockPolicy, resolveSizing, TIMBER_STOCK_GRID, MAX_GENERATED_PER_WALL,
  OPENING_FRAMING_INCOMPLETE,
} from "../../shared/takeoff/engine/timber.js";
import { EPS_MM, LENGTH_KINDS, UNITS, QUANTITY_STATUS, INSTALLATION_STATUS, PROCUREMENT_STATUS, identityKey } from "../../shared/takeoff/engine/contract.js";
import { TakeoffValidationError } from "../../shared/takeoff/units.js";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; if (process.env.TAKEOFF_TEST_VERBOSE) console.log(`  ✓ ${name}`); } catch (e) { fail++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

// The owner grid (12), asserted inline — the allocator owns stock selection; this only proves the demands.
const gridStock = (need) => Math.max(TIMBER_STOCK_GRID.minMm, Math.ceil((need - EPS_MM) / TIMBER_STOCK_GRID.incrementMm) * TIMBER_STOCK_GRID.incrementMm);
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ""} ${a} ≠ ${b}`);
const codes = (r) => r.problems.map((p) => p.code);
const throwsValidation = (fn, re) => assert.throws(fn, (e) => e instanceof TakeoffValidationError && (!re || re.test(e.message)));

const PINE = { section: "90x45", grade: "MGP10", treatment: "H2", species: "Radiata pine" };
const rafters = (over = {}) => computeRepeatedMembers({
  materialId: "m-raft", purpose: "rafter", identity: PINE, segments: [{ id: "dist1", runMm: 10000 }], centresMm: 600,
  member: { measurementId: "mem1", mode: "projected", lengthMm: 4500, pitchDeg: 30, allowanceMm: 100 }, stock: { maxMm: 7200 }, ...over,
});
const wall = (over = {}) => computeStudWall({
  materialId: "m-stud", wallId: "W1", identity: PINE, wallLengthMm: 6000, centresMm: 600,
  height: { mode: "studCut", studLengthMm: 2400 }, stock: { maxMm: 6000 }, ...over,
});

/** Contract conformance for every MethodResult this suite produces. */
function shape(r) {
  for (const k of ["demands", "problems", "explain"]) assert.ok(Array.isArray(r[k]), `${k} array`);
  assert.ok(QUANTITY_STATUS.includes(r.status.quantity));
  assert.ok(INSTALLATION_STATUS.includes(r.status.installation));
  assert.ok(PROCUREMENT_STATUS.includes(r.status.procurement));
  const ids = new Set();
  for (const d of r.demands) {
    assert.ok(typeof d.id === "string" && d.id && !ids.has(d.id), `stable unique id ${d.id}`);
    ids.add(d.id);
    assert.ok(d.materialId && d.role && d.label);
    assert.equal(d.kind, "linear");
    assert.ok(UNITS.includes(d.unit) && d.unit === "piece", "timber is pieces, never aggregate LM");
    assert.ok(Number.isInteger(d.quantity) && d.quantity >= 1);
    assert.ok(d.lengthMm > 0);
    assert.ok(Object.values(LENGTH_KINDS).includes(d.lengthKind));
    assert.equal(d.identity.family, "timber");
    assert.ok(["calculated", "manual"].includes(d.provenance));
    assert.ok(Array.isArray(d.sourceRefs) && d.sourceRefs.length);
    if (d.lengthKind === LENGTH_KINDS.ORDERED_STOCK) assert.equal(d.stockPolicy, undefined);
    else assert.deepEqual([d.stockPolicy.kind, d.stockPolicy.minMm, d.stockPolicy.incrementMm], ["grid", 1200, 300]); // owner grid, Sam 25 Oct 2026
  }
  for (const p of r.problems) assert.ok(p.code && p.message && typeof p.blocking === "boolean");
  return r;
}

// ── fixtures.json (kinds owned by this module) ───────────────────────────────
const fixtures = JSON.parse(readFileSync(new URL("../../docs/takeoff/TC-R04/fixtures.json", import.meta.url), "utf8")).cases;
const mine = fixtures.filter((f) => f.kind === "repeated" || f.kind === "memberStock");
t("fixtures: all six TIM repeated/memberStock cases are present", () => {
  assert.deepEqual(mine.map((f) => f.id).sort(), ["TIM-offsets", "TIM-pitched", "TIM-run-10000", "TIM-run-6000", "TIM-run-6100", "TIM-true-no-double-pitch"]);
});
for (const f of mine) {
  t(`fixture ${f.id} → ${f.expected}`, () => {
    const a = f.input;
    if (f.kind === "repeated") {
      const opts = { runMm: a.run, centresMm: a.centres, startOffsetMm: a.startOffset ?? 0, endOffsetMm: a.endOffset ?? 0 };
      assert.equal(repeatedPositions(opts).length, f.expected);
      const r = shape(computeRepeatedMembers({ materialId: "m", purpose: "joist", identity: PINE, segments: [{ id: "d", runMm: a.run }],
        centresMm: a.centres, startOffsetMm: opts.startOffsetMm, endOffsetMm: opts.endOffsetMm, member: { mode: "entered", lengthMm: 3000 } }));
      assert.equal(r.demands.length, f.expected);
    } else {
      assert.equal(a.increment, TIMBER_STOCK_GRID.incrementMm, "fixture uses the owner 300 grid");
      const len = memberLength({ mode: a.mode === "true" ? "true" : "projected", lengthMm: a.length, pitchDeg: a.pitch, allowanceMm: a.allowance });
      assert.equal(gridStock(len.lengthNeededMm), f.expected);
    }
  });
}

// ── J1 timber journey ────────────────────────────────────────────────────────
t("J1 10,000 run @600 → 18 rafters; 4,500 projected @30° + 100 → 5,400 stock; 18 × 5,400 = 97,200 mm", () => {
  const r = shape(rafters());
  assert.equal(r.demands.length, 18);
  assert.deepEqual(r.layout.ticks.map((x) => x.positionMm), [0, 600, 1200, 1800, 2400, 3000, 3600, 4200, 4800, 5400, 6000, 6600, 7200, 7800, 8400, 9000, 9600, 10000]);
  for (const d of r.demands) {
    close(d.lengthMm, 4500 / Math.cos(Math.PI / 6) + 100, "unrounded length needed");
    assert.equal(d.lengthKind, LENGTH_KINDS.CUT);
    assert.equal(d.noSplice, true);
    assert.equal(d.stockPolicy.sharePieces, false, "one stock piece per structural member");
    assert.equal(d.stockPolicy.maxMm, 7200);
    assert.equal(gridStock(d.lengthMm), 5400);
  }
  assert.equal(r.demands.reduce((s, d) => s + gridStock(d.lengthMm) * d.quantity, 0), 97200);
  assert.deepEqual(r.status, { quantity: "calculated", installation: "unspecified", procurement: "draft" });
  assert.ok(r.explain.some((e) => /manually specified — not structurally verified/.test(e)), "section labelled manual");
  assert.deepEqual(r.problems, []);
});
t("J1 switching to true length does not apply pitch: 4,500 + 100 = 4,600 → 4,800 stock", () => {
  const r = shape(rafters({ member: { mode: "true", lengthMm: 4500, pitchDeg: 30, allowanceMm: 100 } }));
  assert.equal(r.demands.length, 18);
  for (const d of r.demands) { assert.equal(d.lengthMm, 4600); assert.equal(gridStock(d.lengthMm), 4800); }
  assert.equal(r.layout.ticks[0].trueLengthMm, 4500);
  assert.ok(r.explain.some((e) => /already sloped, pitch not applied/.test(e)));
});
t("J1 demand ids are stable across recalculation and a run extension keeps unaffected station ids", () => {
  const a = rafters().demands.map((d) => d.id);
  assert.deepEqual(rafters().demands.map((d) => d.id), a);
  const b = rafters({ segments: [{ id: "dist1", runMm: 10300 }] }).demands.map((d) => d.id);
  assert.deepEqual(b.slice(0, 17), a.slice(0, 17));
  assert.equal(a[0], "m-raft:rafter:dist1:@0:p1");
});

// ── T1 repeated positions ────────────────────────────────────────────────────
t("T1 exact multiple includes the end once: 6,000 @600 → 11 (0 … 6,000)", () => {
  const p = repeatedPositions({ runMm: 6000, centresMm: 600 });
  assert.equal(p.length, 11); assert.equal(p[10], 6000); assert.equal(new Set(p).size, 11);
});
t("T1 final bay is shorter, never longer: 6,100 @600 → 12, final bay 100", () => {
  const p = repeatedPositions({ runMm: 6100, centresMm: 600 });
  assert.equal(p.length, 12); assert.equal(p[11] - p[10], 100);
  for (let i = 1; i < p.length; i++) assert.ok(p[i] - p[i - 1] <= 600 + EPS_MM);
});
t("T1 float noise on an exact multiple does not add a member; a real 0.1 mm overrun does", () => {
  assert.equal(repeatedPositions({ runMm: 6000 + 1e-9, centresMm: 600 }).length, 11);
  assert.equal(repeatedPositions({ runMm: 6000.1, centresMm: 600 }).length, 12);
});
t("T1 offsets shift the grid by a and shorten R (TIM-offsets): first 50, last 6,050", () => {
  const p = repeatedPositions({ runMm: 6100, centresMm: 600, startOffsetMm: 50, endOffsetMm: 50 });
  assert.equal(p[0], 50); assert.equal(p[p.length - 1], 6050); assert.equal(p.length, 11);
});
t("T1 never silently subtracts half a section: 90x45 members still start at 0 without offsets", () => {
  const r = rafters({ identity: { ...PINE, section: "90x45" } });
  assert.equal(r.layout.ticks[0].positionMm, 0); assert.equal(r.layout.ticks.at(-1).positionMm, 10000);
});
t("T1 R < 0 rejected (repeatedPositions throws; compute returns blocking invalid_input, no demands)", () => {
  throwsValidation(() => repeatedPositions({ runMm: 1000, centresMm: 600, startOffsetMm: 600, endOffsetMm: 500 }), /longer than the run/);
  const r = shape(rafters({ startOffsetMm: 6000, endOffsetMm: 5000 }));
  assert.equal(r.demands.length, 0); assert.deepEqual(codes(r), ["invalid_input"]); assert.equal(r.problems[0].blocking, true);
  assert.equal(r.status.quantity, "incomplete");
});
t("T1 zero usable run only as an explicitly selected single member", () => {
  throwsValidation(() => repeatedPositions({ runMm: 1000, centresMm: 600, startOffsetMm: 500, endOffsetMm: 500 }), /single member/);
  assert.deepEqual(repeatedPositions({ runMm: 1000, startOffsetMm: 500, endOffsetMm: 500, singleMember: true }), [500]);
  throwsValidation(() => repeatedPositions({ runMm: 1000, centresMm: 600, singleMember: true }), /single member/i);
});
t("T1 endpoint exclusions are applied AFTER generation (no regrid)", () => {
  const all = repeatedPositions({ runMm: 6100, centresMm: 600 });
  assert.deepEqual(repeatedPositions({ runMm: 6100, centresMm: 600, includeStart: false }), all.slice(1));
  assert.deepEqual(repeatedPositions({ runMm: 6100, centresMm: 600, includeEnd: false }), all.slice(0, -1));
  assert.deepEqual(repeatedPositions({ runMm: 6000, centresMm: 600, includeStart: false, includeEnd: false }), [600, 1200, 1800, 2400, 3000, 3600, 4200, 4800, 5400]);
  assert.equal(repeatedPositions({ runMm: 6100, centresMm: 600, includeEnd: false }).at(-1), 6000, "the 6,000 member stays; grid not shifted");
});
t("T1 equal spacing is an explicit alternative: 6,100 @≤600 → 11 equal bays, 12 members", () => {
  const p = repeatedPositions({ runMm: 6100, centresMm: 600, spacing: "equal" });
  assert.equal(p.length, 12); assert.equal(p[0], 0); assert.equal(p[11], 6100);
  for (let i = 1; i < p.length; i++) close(p[i] - p[i - 1], 6100 / 11, "equal bay");
  assert.deepEqual(repeatedPositions({ runMm: 6000, centresMm: 600, spacing: "equal" }), repeatedPositions({ runMm: 6000, centresMm: 600 }));
  throwsValidation(() => repeatedPositions({ runMm: 6000, centresMm: 600, spacing: "balanced" }));
});
t("T1 disconnected segments restart their own grid (3,000 + 3,000 → 6 + 6 = 12)", () => {
  const r = shape(rafters({ segments: [{ id: "a", runMm: 3000 }, { id: "b", runMm: 3000 }] }));
  assert.equal(r.demands.length, 12);
  assert.deepEqual(r.layout.ticks.filter((x) => x.segmentId === "b").map((x) => x.positionMm), [0, 600, 1200, 1800, 2400, 3000]);
  assert.deepEqual([...new Set(r.demands.map((d) => d.sourceRefs[0].measurementId))].sort(), ["a", "b"]);
});
t("T1 connected collinear parts selected as one run share one grid; the shared end counts once (11, not 12)", () => {
  const r = shape(rafters({ segments: [{ id: "joined", parts: [{ measurementId: "a", runMm: 3000 }, { measurementId: "b", runMm: 3000 }] }] }));
  assert.equal(r.demands.length, 11);
  const at = (x) => r.demands.find((d) => d.label === `Rafter @ ${x.toLocaleString("en-AU")}`).sourceRefs[0];
  assert.deepEqual(at(3600), { measurementId: "b", role: "distribution", station: 600 });
  assert.deepEqual(at(3000), { measurementId: "a", role: "distribution", station: 3000 });
});
t("T1 never deduplicates adjacent plies or coincident separate planes", () => {
  const r = shape(rafters({ plies: 2 }));
  assert.equal(r.demands.length, 36);
  assert.equal(new Set(r.demands.map((d) => d.id)).size, 36);
  const planes = shape(rafters({ segments: [{ id: "plane1", runMm: 6000 }, { id: "plane2", runMm: 6000 }] }));
  assert.equal(planes.demands.length, 22, "same positions on two planes are two members");
});
t("T1 per-run offsets and exclusions override the defaults for that run only", () => {
  const r = rafters({ segments: [{ id: "a", runMm: 6000, includeStart: false }, { id: "b", runMm: 6000, startOffsetMm: 300 }] });
  assert.equal(r.layout.ticks.filter((x) => x.segmentId === "a").length, 10);
  assert.equal(r.layout.ticks.filter((x) => x.segmentId === "b")[0].positionMm, 300);
});
t("T1 runaway member counts are rejected, never truncated", () => {
  throwsValidation(() => repeatedPositions({ runMm: 10_000_000, centresMm: 1 }), /split/);
  assert.equal(repeatedPositions({ runMm: (MAX_GENERATED_PER_WALL - 1) * 10, centresMm: 10 }).length, MAX_GENERATED_PER_WALL);
});

// ── T1 tick overrides ────────────────────────────────────────────────────────
t("T1 tick overrides: remove, duplicate and length change are tied to the station id", () => {
  const r = shape(rafters({ overrides: { "dist1:@600": { remove: true }, "dist1:@1200": { duplicate: 1 }, "dist1:@1800": { member: { mode: "true", lengthMm: 3000 } } } }));
  assert.equal(r.demands.length, 18);
  assert.ok(!r.demands.some((d) => d.id.includes(":@600:")));
  assert.equal(r.demands.filter((d) => d.id.includes(":@1200:")).length, 2);
  const changed = r.demands.find((d) => d.id === "m-raft:rafter:dist1:@1800:p1");
  assert.equal(changed.lengthMm, 3100, "true length + the base 100 allowance, no pitch"); assert.equal(changed.provenance, "manual");
  assert.equal(r.layout.ticks.find((x) => x.stationId === "dist1:@600").removed, true);
  assert.equal(r.status.quantity, "calculated");
});
t("T1 an override whose station no longer exists is stale (blocking), not re-pinned to another member", () => {
  const r = shape(rafters({ centresMm: 450, overrides: { "dist1:@600": { remove: true } } }));
  assert.ok(codes(r).includes("override_stale"));
  assert.equal(r.demands.length, Math.ceil(10000 / 450) + 1);
  assert.equal(r.status.quantity, "incomplete");
});
t("T2 raked members interpolate a straight rake from two explicit lengths", () => {
  const r = shape(rafters({ segments: [{ id: "d", runMm: 1200 }], member: { mode: "true", rake: { startLengthMm: 2000, endLengthMm: 3200 } } }));
  assert.deepEqual(r.demands.map((d) => d.lengthMm), [2000, 2600, 3200]);
  const bad = rafters({ member: { mode: "true", lengthMm: 3000, rake: { startLengthMm: 1, endLengthMm: 2 } } });
  assert.deepEqual(codes(bad), ["invalid_input"]);
});

// ── T2 member length ─────────────────────────────────────────────────────────
t("T2 projected ÷ cos(pitch); a true-length measurement is never pitched again (no double pitch)", () => {
  const p = memberLength({ mode: "projected", lengthMm: 4500, pitchDeg: 30 });
  close(p.trueLengthMm, 5196.152422706632);
  const tr = memberLength({ mode: "true", lengthMm: p.trueLengthMm, pitchDeg: 30 });
  close(tr.trueLengthMm, p.trueLengthMm, "re-entering the true length keeps it");
  assert.equal(memberLength({ mode: "entered", lengthMm: 3600, pitchDeg: 45 }).trueLengthMm, 3600);
});
t("T2 pitch is never inferred: projected without pitch is rejected; pitch ≥ 90 rejected", () => {
  throwsValidation(() => memberLength({ mode: "projected", lengthMm: 4500 }), /Pitch/);
  throwsValidation(() => memberLength({ mode: "projected", lengthMm: 4500, pitchDeg: 90 }), /90/);
  throwsValidation(() => memberLength({ lengthMm: 4500 }), /length source/);
});
t("T2 no universal allowance and no flashing +200/100 rules: default allowance 0 keeps 4,321 exact", () => {
  const r = memberLength({ mode: "true", lengthMm: 4321 });
  assert.equal(r.lengthNeededMm, 4321);
  assert.equal(memberLength({ mode: "true", lengthMm: 4321, allowanceMm: 50 }).lengthNeededMm, 4371, "allowance once");
});
t("T2 clear span + labelled overhangs converts their SUM to slope, then adds the true-length allowance once", () => {
  const r = memberLength({ mode: "clearSpan", lengthMm: 3600, pitchDeg: 25, overhangsMm: [{ label: "Eave overhang", mm: 450 }, { label: "Ridge bearing", mm: 45 }], allowanceMm: 50 });
  close(r.trueLengthMm, 4095 / Math.cos((25 * Math.PI) / 180));
  close(r.lengthNeededMm, r.trueLengthMm + 50);
  assert.ok(r.explain[0].includes("Eave overhang 450"));
});
t("T2 exclusive modes: overhangs with a projected/true member line are rejected; unlabelled overhangs rejected", () => {
  throwsValidation(() => memberLength({ mode: "projected", lengthMm: 4500, pitchDeg: 30, overhangsMm: [{ label: "Eave", mm: 450 }] }), /already includes/);
  throwsValidation(() => memberLength({ mode: "true", lengthMm: 4500, overhangsMm: [{ label: "Eave", mm: 450 }] }));
  throwsValidation(() => memberLength({ mode: "clearSpan", lengthMm: 3600, pitchDeg: 25, overhangsMm: [{ mm: 450 }] }), /label/);
});
t("T2 rejects non-positive lengths and negative allowance", () => {
  throwsValidation(() => memberLength({ mode: "true", lengthMm: 0 }));
  throwsValidation(() => memberLength({ mode: "true", lengthMm: 3000, allowanceMm: -1 }));
});

// ── T3 stock policy + TIM03 identity ─────────────────────────────────────────
t("T3 structural demands carry the owner grid, noSplice and one stock piece each (no allocator here)", () => {
  for (const d of rafters().demands) assert.deepEqual(d.stockPolicy, { kind: "grid", minMm: 1200, incrementMm: 300, maxMm: 7200, unavailableMm: [], sharePieces: false });
});
t("T3 the grid cannot be redefined: another minimum/increment or an off-grid unavailable length is rejected", () => {
  throwsValidation(() => timberStockPolicy({ incrementMm: 600 }), /1,200 mm then 300 mm steps/); // the old 600 grid is gone too
  throwsValidation(() => timberStockPolicy({ minMm: 900 }));
  throwsValidation(() => timberStockPolicy({ unavailableMm: [4400] }), /not a timber stock length \(1,200 mm then 300 mm steps\)/);
  throwsValidation(() => timberStockPolicy({ maxMm: 1000 }));
  assert.deepEqual(timberStockPolicy({ unavailableMm: [4800, 4800, 3000] }).unavailableMm, [3000, 4800]);
  assert.deepEqual(codes(rafters({ stock: { incrementMm: 600 } })), ["invalid_input"]);
});
t("T3 no arbitrary 6 m maximum: an unset product maximum stays null and is flagged (non-blocking)", () => {
  const r = shape(rafters({ stock: undefined }));
  assert.equal(r.demands[0].stockPolicy.maxMm, null);
  const p = r.problems.find((x) => x.code === "stock_max_unset");
  assert.ok(p && p.blocking === false);
  assert.equal(r.status.quantity, "calculated");
});
t("T3 same timber settings at two suppliers yield the same 1200/300 grid", () => {
  const a = rafters({ identity: { ...PINE, supplier: "Supplier A" } }).demands[0].stockPolicy;
  const b = rafters({ identity: { ...PINE, supplier: "Supplier B" } }).demands[0].stockPolicy;
  assert.deepEqual(a, b);
});
t("TIM03 grade / treatment / section / species / supplier changes change identity; equal specs share it", () => {
  const key = (p) => identityKey(rafters({ identity: p }).demands[0].identity);
  const base = key(PINE);
  assert.equal(key({ ...PINE, section: "90 × 45", grade: "mgp10", treatment: " h2 " }), base, "formatting is not identity");
  for (const change of [{ grade: "MGP12" }, { treatment: "H3" }, { section: "70x45" }, { species: "Douglas fir" }, { supplier: "Supplier A" }]) {
    assert.notEqual(key({ ...PINE, ...change }), base, JSON.stringify(change));
  }
  assert.deepEqual(rafters({ identity: { ...PINE, grade: "MGP12" } }).demands.map((d) => d.id), rafters().demands.map((d) => d.id), "same stations, new identity");
});
t("TIM03 a supplier stock change (max / unavailable) changes the demand stock policy so allocations go stale", () => {
  const a = identityKey(rafters().demands[0].stockPolicy);
  assert.notEqual(identityKey(rafters({ stock: { maxMm: 6000 } }).demands[0].stockPolicy), a);
  assert.notEqual(identityKey(rafters({ stock: { maxMm: 7200, unavailableMm: [5400] } }).demands[0].stockPolicy), a);
});
t("timberIdentity shape: family timber + section/grade/treatment/species; optional supplier only when given", () => {
  assert.deepEqual(timberIdentity({ section: "90 x 45", grade: "mgp10", treatment: "h2" }), { family: "timber", section: "90x45", grade: "MGP10", treatment: "H2", species: null });
  assert.equal(timberIdentity({ ...PINE, supplier: "S" }).supplier, "S");
});
t("missing section/grade/treatment → procurement missing-product (quantity still calculated)", () => {
  const r = shape(rafters({ identity: { section: "90x45" } }));
  assert.equal(r.status.procurement, "missing-product"); assert.equal(r.status.quantity, "calculated");
  assert.ok(codes(r).includes("timber_identity_incomplete"));
});

// ── Sizing provenance ────────────────────────────────────────────────────────
t("sizing: manual is never verified; an attached project schedule is project-detail-supplied; no section → missingInput", () => {
  assert.deepEqual([resolveSizing({ section: "90x45" }).outcome, resolveSizing({ section: "90x45" }).installation], ["manual", "unspecified"]);
  const s = resolveSizing({ section: "2/190x45", sizing: { source: "projectSchedule", ref: "Eng. schedule S-01 rev B" } });
  assert.equal(s.installation, "project-detail-supplied");
  assert.equal(resolveSizing({ section: null }).outcome, "missingInput");
  throwsValidation(() => resolveSizing({ section: "90x45", sizing: { source: "projectSchedule" } }), /schedule/);
  throwsValidation(() => resolveSizing({ section: "90x45", sizing: { source: "spanTable" } }));
  assert.equal(rafters({ sizing: { source: "projectSchedule", ref: "S-01" } }).status.installation, "project-detail-supplied");
  for (const r of [rafters(), wall()]) assert.notEqual(r.status.installation, "supported-by-selected-rule");
});
t("battens use the support grid, and hip/valley/jack need individual lengths — not repeated members", () => {
  const b = rafters({ purpose: "batten" });
  assert.deepEqual(codes(b), ["invalid_input"]); assert.match(b.problems[0].message, /support grid/);
  assert.match(rafters({ purpose: "hip" }).problems[0].message, /individual/);
});

// ── T4 stud wall (TIM02) ─────────────────────────────────────────────────────
const W01 = { id: "W01", xLeftMm: 1150, xRightMm: 2450, sillMm: 900, headMm: 2100 };
const fullDetail = (over = {}) => ({
  source: "reviewed-detail", ref: "Frame detail FD-3",
  belowSill: { required: true, deductionMm: 45 }, aboveHead: { required: true, deductionMm: 190 },
  members: [
    { id: "K", role: "king", quantity: 2, lengthFrom: "stud", sameAsStud: true },
    { id: "J", role: "jack", quantity: 2, lengthFrom: "headLevel", sameAsStud: true },
    { id: "L", role: "lintel", quantity: 1, lengthFrom: "openingWidth", addMm: 180, identity: { section: "190x45", grade: "MGP10", treatment: "H2" }, stock: { maxMm: 6000 } },
    { id: "S", role: "sill-trimmer", quantity: 1, lengthFrom: "openingWidth", sameAsStud: true },
  ],
  ...over,
});
t("TIM02 actual station clipping, not base − floor(width/centres): 1,150–2,450 removes 1,200/1,800/2,400 (8 left, naive says 9)", () => {
  const r = shape(wall({ openings: [W01] }));
  const studs = r.demands.filter((d) => d.role === "stud");
  assert.equal(studs.length, 8);
  assert.notEqual(studs.length, 11 - Math.floor(1300 / 600));
  assert.deepEqual(r.layout.openings[0].removedStationIds, ["W1:@1200", "W1:@1800", "W1:@2400"]);
});
t("TIM02 studs exactly on an opening edge are kept (strictly inside only); a narrow opening between studs removes none", () => {
  const edge = wall({ openings: [{ ...W01, xLeftMm: 1200, xRightMm: 2400 }] });
  assert.deepEqual(edge.layout.openings[0].removedStationIds, ["W1:@1800"]);
  const narrow = wall({ openings: [{ ...W01, xLeftMm: 1210, xRightMm: 1790 }] });
  assert.equal(narrow.demands.filter((d) => d.role === "stud").length, 11);
  const wide = wall({ openings: [{ ...W01, xLeftMm: 1190, xRightMm: 1810 }] });
  assert.equal(wide.demands.filter((d) => d.role === "stud").length, 9, "naive floor(620/600) would remove 1");
});
t("TIM02 without a detail: base studs only; opening framing incomplete — no invented cripples, jacks or lintel", () => {
  const r = shape(wall({ openings: [W01] }));
  assert.deepEqual([...new Set(r.demands.map((d) => d.role))], ["stud"]);
  assert.equal(r.layout.scope, OPENING_FRAMING_INCOMPLETE);
  assert.equal(r.status.quantity, "incomplete");
  const p = r.problems.find((x) => x.code === "opening_framing_incomplete");
  assert.ok(p.blocking && p.message.includes(OPENING_FRAMING_INCOMPLETE));
});
t("TIM02 with an explicit detail: cripples/above-head at the removed stations, kings/jacks/lintel/sill as entered", () => {
  const r = shape(wall({ openings: [{ ...W01, detail: fullDetail() }] }));
  const by = (role) => r.demands.filter((d) => d.role === role);
  assert.deepEqual(by("below-sill").map((d) => d.lengthMm), [855, 855, 855]);
  assert.deepEqual(by("above-head").map((d) => d.lengthMm), [110, 110, 110]);
  assert.deepEqual(by("king").map((d) => [d.quantity, d.lengthMm]), [[2, 2400]]);
  assert.deepEqual(by("jack").map((d) => [d.quantity, d.lengthMm]), [[2, 2100]]);
  const lintel = by("lintel")[0];
  assert.deepEqual([lintel.quantity, lintel.lengthMm, lintel.identity.section, lintel.stockPolicy.maxMm], [1, 1480, "190x45", 6000]);
  assert.equal(by("sill-trimmer")[0].lengthMm, 1300);
  assert.equal(lintel.provenance, "manual");
  assert.equal(r.status.quantity, "calculated");
  assert.equal(r.layout.scope, "studs with explicit opening framing");
  assert.equal(by("stud").length, 8);
});
t("TIM02 subregions that don't exist get no pieces (door at floor level; head at stud top)", () => {
  const r = shape(wall({ openings: [{ ...W01, sillMm: 0, headMm: 2400, detail: fullDetail({ belowSill: undefined, aboveHead: undefined }) }] }));
  assert.equal(r.demands.filter((d) => d.role === "below-sill" || d.role === "above-head").length, 0);
  assert.equal(r.status.quantity, "calculated");
});
t("TIM02 subregion present but not required by the detail → no pieces", () => {
  const r = wall({ openings: [{ ...W01, detail: fullDetail({ belowSill: { required: false }, aboveHead: { required: false } }) }] });
  assert.equal(r.demands.filter((d) => d.role === "below-sill" || d.role === "above-head").length, 0);
});
t("TIM02 unknown lintel/jack sizes are never filled with defaults: no product → incomplete, no demand", () => {
  const d = fullDetail();
  d.members = d.members.map((m) => (m.id === "L" ? { ...m, identity: undefined } : m));
  const r = wall({ openings: [{ ...W01, detail: d }] });
  assert.ok(!r.demands.some((x) => x.role === "lintel"));
  assert.equal(r.status.quantity, "incomplete");
  assert.match(r.problems.find((x) => x.code === "opening_framing_incomplete").message, /L product/);
  const noRule = wall({ openings: [{ ...W01, detail: fullDetail({ belowSill: { required: true } }) }] });
  assert.match(noRule.problems.find((x) => x.code === "opening_framing_incomplete").message, /below-sill deduction/);
  const noMembers = wall({ openings: [{ ...W01, detail: fullDetail({ members: undefined }) }] });
  assert.equal(noMembers.status.quantity, "incomplete");
});
t("TIM02 coincident common + king studs reconcile only when the detail permits; extra plies stay separate", () => {
  const kings = { id: "K", role: "king", quantity: 2, lengthFrom: "stud", sameAsStud: true, atMm: [600, 3000] };
  const detail = (reconcileCoincident) => fullDetail({ reconcileCoincident, members: [kings] });
  const no = wall({ openings: [{ ...W01, detail: detail(false) }] });
  const yes = wall({ openings: [{ ...W01, detail: detail(true) }] });
  const pieces = (r) => r.demands.reduce((s, d) => s + d.quantity, 0);
  assert.equal(pieces(no) - pieces(yes), 2);
  assert.equal(yes.layout.ticks.find((x) => x.stationId === "W1:@600").reconciledWith, "m-stud:king:W1:W01:K");
  assert.ok(!yes.demands.some((d) => d.id === "m-stud:stud:W1:@600:p1"));
  const two = wall({ plies: 2, openings: [{ ...W01, detail: detail(true) }] });
  assert.ok(two.demands.some((d) => d.id === "m-stud:stud:W1:@600:p2"), "second ply kept");
  const other = wall({ openings: [{ ...W01, detail: fullDetail({ reconcileCoincident: true, members: [{ ...kings, lengthMm: 2300, lengthFrom: undefined }] }) }] });
  assert.equal(pieces(other), pieces(no), "different length → not reconciled");
});
t("T4 frame-height mode subtracts explicit plates and deductions; modes are exclusive; plates are never defaulted", () => {
  const r = shape(wall({ height: { mode: "frameHeight", frameHeightMm: 2700, bottomPlateMm: 45, topPlateMm: 90, deductions: [{ label: "Packer", mm: 10 }] } }));
  assert.equal(r.layout.studLengthMm, 2555);
  assert.equal(r.demands[0].lengthMm, 2555);
  assert.deepEqual(codes(wall({ height: { mode: "frameHeight", frameHeightMm: 2700 } })), ["invalid_input"]);
  assert.deepEqual(codes(wall({ height: { mode: "studCut", studLengthMm: 2400, topPlateMm: 90 } })), ["invalid_input"]);
  assert.deepEqual(codes(wall({ height: undefined })), ["invalid_input"]);
});
t("T4 opening levels from the frame base convert with the bottom plate (frame-height mode only)", () => {
  const h = { mode: "frameHeight", frameHeightMm: 2490, bottomPlateMm: 45, topPlateMm: 45 };
  const r = wall({ height: h, levelsFrom: "frameBase", openings: [{ ...W01, sillMm: 945, headMm: 2145, detail: fullDetail() }] });
  assert.deepEqual(r.demands.filter((d) => d.role === "below-sill").map((d) => d.lengthMm), [855, 855, 855]);
  assert.deepEqual(codes(wall({ levelsFrom: "frameBase", openings: [W01] })), ["invalid_input"]);
});
t("T4 explicit additions (corners, junctions, hold-downs) only — none are inferred", () => {
  const plain = wall();
  assert.deepEqual([...new Set(plain.demands.map((d) => d.role))], ["stud"]);
  assert.equal(plain.layout.scope, "base studs");
  const r = shape(wall({ extras: [{ id: "C1", role: "corner", quantity: 3, lengthFrom: "stud", sameAsStud: true }, { id: "HD", role: "hold-down", quantity: 1, lengthMm: 2400 }] }));
  assert.equal(r.demands.find((d) => d.role === "corner").quantity, 3);
  assert.ok(!r.demands.some((d) => d.role === "hold-down"), "no product → not ordered");
  assert.ok(codes(r).includes("member_incomplete")); assert.equal(r.status.quantity, "incomplete");
});
t("T4 overlapping or out-of-wall openings are rejected", () => {
  assert.deepEqual(codes(wall({ openings: [W01, { ...W01, id: "W02", xLeftMm: 2000, xRightMm: 3000 }] })), ["invalid_input"]);
  assert.deepEqual(codes(wall({ openings: [{ ...W01, xRightMm: 6500 }] })), ["invalid_input"]);
  assert.deepEqual(codes(wall({ openings: [{ ...W01, headMm: 2500 }] })), ["invalid_input"]);
});

// ── T5 plates / noggins / trim ───────────────────────────────────────────────
const plates = (over = {}) => computePlates({ materialId: "m-plate", wallId: "W1", identity: PINE, runMm: 9000, stock: { maxMm: 6000 },
  layers: [{ tag: "bottom" }, { tag: "top" }, { tag: "top2" }], ...over });
t("T5 plates: run × explicit layers, each a continuous noSplice piece with its layer tag — never aggregate LM", () => {
  const r = shape(plates());
  assert.deepEqual(r.demands.map((d) => [d.role, d.lengthMm, d.noSplice]), [["bottom-plate", 9000, true], ["top-plate", 9000, true], ["top2-plate", 9000, true]]);
  assert.ok(r.demands.every((d) => d.unit === "piece"));
});
t("T5 plates split only at joints selected from the framing detail", () => {
  const r = shape(plates({ jointDetailRef: "FD-2 staggered joints", layers: [{ tag: "top", jointsMm: [4800] }, { tag: "top2", jointsMm: [3000, 6000] }] }));
  assert.deepEqual(r.demands.map((d) => `${d.role}:${d.lengthMm}`), ["top-plate:4800", "top-plate:4200", "top2-plate:3000", "top2-plate:3000", "top2-plate:3000"]);
  assert.deepEqual(codes(plates({ layers: [{ tag: "top", jointsMm: [4800] }] })), ["invalid_input"], "joint without the detail");
  assert.deepEqual(codes(plates({ jointDetailRef: "FD", layers: [{ tag: "top", jointsMm: [9000] }] })), ["invalid_input"]);
  assert.deepEqual(codes(plates({ layers: [{ tag: "top" }, { tag: "top" }] })), ["invalid_input"]);
});
const studsAt = [0, 600, 1200, 1800, 2400].map((positionMm) => ({ positionMm, widthMm: 45 }));
const noggins = (over = {}) => computeNoggins({ materialId: "m-nog", wallId: "W1", identity: PINE, stock: { maxMm: 4800 }, stations: studsAt, rows: 1, rowsSource: "entered", ...over });
t("T5 noggins: clear bay = centres − half of each bordering member (600 − 22.5 − 22.5 = 555) × rows", () => {
  const r = shape(noggins({ rows: 2 }));
  assert.deepEqual(r.demands.map((d) => [d.lengthMm, d.quantity]), [[555, 2], [555, 2], [555, 2], [555, 2]]);
  assert.equal(r.demands[0].stockPolicy.sharePieces, true, "noggins may share stock (suggested cut plan)");
  assert.equal(noggins({ cutAllocation: false }).demands[0].stockPolicy.sharePieces, false);
  assert.equal(noggins({ allowanceMm: 5 }).demands[0].lengthMm, 560);
});
t("T5 noggin rows are never inferred (missing → incomplete, no pieces, even with a cladding support spacing)", () => {
  const r = shape(noggins({ rows: undefined, rowsSource: undefined, claddingSupportSpacingMm: 600 }));
  assert.equal(r.demands.length, 0); assert.ok(codes(r).includes("noggin_rows_missing")); assert.equal(r.status.quantity, "incomplete");
  assert.deepEqual(codes(noggins({ rowsSource: undefined })), ["invalid_input"]);
});
t("T5 bays through openings are removed; returns are added separately", () => {
  const r = shape(noggins({ openings: [{ id: "W01", xLeftMm: 700, xRightMm: 1700 }], returns: [{ id: "R1", quantity: 2, lengthMm: 300 }] }));
  assert.deepEqual(r.layout.bays.map((b) => b.openingId), [null, "W01", "W01", null]);
  assert.deepEqual(r.demands.map((d) => `${d.role}:${d.lengthMm}×${d.quantity}`), ["noggin:555×1", "noggin:555×1", "noggin-return:300×2"]);
});
t("T5 trim: segment + explicit mitre/end allowances; visible join policy decides noSplice", () => {
  const r = shape(computeTrim({ materialId: "m-trim", identity: { section: "66x18", profile: "Colonial architrave" }, stock: { maxMm: 5400 },
    segments: [{ id: "t1", lengthMm: 2100, startAllowanceMm: 20, endAllowanceMm: 20 }, { id: "t2", lengthMm: 900 }] }));
  assert.deepEqual(r.demands.map((d) => [d.lengthMm, d.noSplice]), [[2140, true], [900, true]]);
  assert.equal(r.status.procurement, "draft", "trim needs a section, not a structural grade");
  const joined = computeTrim({ materialId: "m-trim", identity: { section: "66x18" }, joinsAllowed: true, segments: [{ id: "t1", lengthMm: 7000 }] });
  assert.equal(joined.demands[0].noSplice, false);
});

// ── T7 manual / count / orderedStock ─────────────────────────────────────────
const manual = (entries, over = {}) => computeManualTimber({ materialId: "m-man", role: "member", identity: PINE, stock: { maxMm: 6000 }, entries, ...over });
t("T7 count markers share one length; per-marker overrides become small labelled groups; cut lengths keep stock selection", () => {
  const r = shape(manual([{ id: "C1", kind: "count", measurementId: "cnt", lengthMm: 2400, markers: [{ id: "a" }, { id: "b" }, { id: "c", lengthMm: 3000 }, { id: "d", lengthMm: 3000 }] }]));
  assert.deepEqual(r.demands.map((d) => [d.quantity, d.lengthMm, d.lengthKind]), [[2, 2400, "cut"], [2, 3000, "cut"]]);
  assert.match(r.demands[1].label, /marker length/);
  assert.deepEqual(r.demands[0].sourceRefs.map((s) => s.cell), ["a", "b"]);
  assert.equal(gridStock(manual([{ id: "x", kind: "cut", quantity: 1, lengthMm: 500 }]).demands[0].lengthMm), 1200, "a 500 cut still buys new stock on the grid");
});
t("T7 orderedStock bypasses slope, allowance and rounding; keeps its source; mixed lines are labelled", () => {
  const r = shape(manual([
    { id: "O1", kind: "orderedStock", quantity: 6, stockLengthMm: 5400, source: "Supplier cut list 14/10", measurementId: "att-1" },
    { id: "X1", kind: "cut", quantity: 2, lengthMm: 3000 },
  ], { allowanceMm: 50 }));
  const [o, c] = r.demands;
  assert.deepEqual([o.lengthKind, o.lengthMm, o.quantity, o.stockPolicy], [LENGTH_KINDS.ORDERED_STOCK, 5400, 6, undefined]);
  assert.match(o.label, /Ordered stock .*Supplier cut list 14\/10/);
  assert.deepEqual(o.sourceRefs, [{ measurementId: "att-1", role: "orderedStock", source: "Supplier cut list 14/10" }]);
  assert.deepEqual([c.lengthKind, c.lengthMm], [LENGTH_KINDS.CUT, 3050]);
  assert.match(c.label, /^Cut /);
  assert.ok(r.explain.some((e) => /Mixed lines/.test(e)));
  assert.deepEqual(codes(manual([{ id: "O", kind: "orderedStock", quantity: 1, stockLengthMm: 5400 }])), ["invalid_input"], "source required");
  assert.deepEqual(codes(manual([{ id: "O", kind: "orderedStock", quantity: 1, stockLengthMm: 5400, source: "S", allowanceMm: 10 }])), ["invalid_input"]);
});
t("T7 invalid entries are rejected (fractional quantity, marker without a length, unknown kind)", () => {
  assert.deepEqual(codes(manual([{ id: "x", kind: "cut", quantity: 1.5, lengthMm: 3000 }])), ["invalid_input"]);
  assert.deepEqual(codes(manual([{ id: "C", kind: "count", markers: [{ id: "a" }] }])), ["invalid_input"]);
  assert.deepEqual(codes(manual([{ id: "x", kind: "lm", quantity: 1, lengthMm: 3000 }])), ["invalid_input"]);
});

console.log(`takeoff-tc-timber: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
