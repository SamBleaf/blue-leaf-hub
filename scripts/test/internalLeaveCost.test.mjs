// =============================================================================
// Deterministic unit test for computeLeaveCost — the money-critical derived-leave
// engine (plan §5.2/§5.3, BL-INTERNAL cost layer). Plain node, no framework.
//
//   node scripts/test/internalLeaveCost.test.mjs
//
// Exercises all three leave sources (per-employee typed rows, team RDO fan-out,
// expanded RDO patterns) + a public-holiday collision + a part-timer + a half-day
// + a null-rate archived employee, asserting the LOCKED formulas exactly:
//   RDO    = hours × break_even_hourly            (never double-super'd)
//   Annual = hours × base_hourly × 1.175 × (1+SG)
//   Sick   = hours × base_hourly × (1+SG)
// plus: PH day excluded, half-day = 0.5×std, dedup (explicit row beats team RDO),
// rate_missing flagged (not silent $0).
// =============================================================================
import assert from "node:assert/strict";
import { computeLeaveCost } from "../../server/lib/internalCategoryService.mjs";

let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log(`  ok  ${label}`); };

// ── Fixtures ────────────────────────────────────────────────────────────────
// All dates in AU FY 2025-26 → SG = 0.12 (superGuaranteeForFy default/lookup).
const SG = 0.12;
// E1 full-timer (std day 7.6), E2 part-timer, E3 archived w/ NO synced rate.
const ratesById = {
  E1: { baseHourly: 40, breakEvenHourly: 60, hourlyRate: 40 },
  E2: { baseHourly: 32, breakEvenHourly: 50, hourlyRate: 32 },
  // E3 deliberately absent → rate lookup misses → rate_missing
};
const activeEmployees = [{ id: "E1" }, { id: "E2" }]; // E3 archived, not fanned into team RDO
const categories = [
  { id: "cat-annual", category_label: "Annual leave", leave_type: "annual", cost_source: "leave" },
  { id: "cat-sick", category_label: "Sick leave", leave_type: "sick", cost_source: "leave" },
  { id: "cat-rdo", category_label: "RDO", leave_type: "rdo", cost_source: "leave" },
];

const perEmployeeRows = [
  { employeeId: "E1", date: "2025-09-15", leaveType: "annual", hours: null }, // full day 7.6
  { employeeId: "E1", date: "2025-09-16", leaveType: "sick", hours: null },   // full day 7.6
  { employeeId: "E1", date: "2025-09-17", leaveType: "annual", hours: 3.8 },  // HALF-day = 0.5×7.6
  { employeeId: "E2", date: "2025-09-18", leaveType: "rdo", hours: 4 },       // part-timer, non-7.6 hours
  { employeeId: "E3", date: "2025-09-19", leaveType: "rdo", hours: null },    // archived null-rate → rate_missing
  { employeeId: "E2", date: "2025-09-25", leaveType: "annual", hours: null }, // lands on a PUBLIC HOLIDAY → excluded
  { employeeId: "E1", date: "2025-10-10", leaveType: "annual", hours: null }, // SAME date as a team RDO → explicit wins (dedup)
];
const teamRdoDates = [
  { date: "2025-10-03" }, // fans across E1 + E2
  { date: "2025-10-10" }, // E1 has an explicit annual row here → only E2 gets team RDO
];
const patterns = [
  { employeeId: "E1", intervalWeeks: 1, weekday: 5, anchorDate: "2025-11-07" }, // one Friday in the window
];
const publicHolidays = ["2025-09-25"];

const { rows, days } = computeLeaveCost({
  perEmployeeRows, teamRdoDates, patterns, publicHolidays,
  activeEmployees, ratesById, categories,
  defaultStandardHours: 7.6,
  from: "2025-11-03", to: "2025-11-07", // window only bounds PATTERN expansion (→ 2025-11-07)
});

const row = (lt, fy, q) => rows.find((r) => r.leaveType === lt && r.fy === fy && r.quarter === q);
const r2 = (n) => Math.round(n * 100) / 100;

// Expected per-formula day costs (raw, then aggregated + rounded)
const annual = (h) => r2(h * 40 * 1.175 * (1 + SG));
const sick = (h) => r2(h * 40 * (1 + SG));

console.log("computeLeaveCost — derived leave engine");

// ── Formula-exact assertions ─────────────────────────────────────────────────
check("Annual Q1 = base×1.175×(1+SG), full + half day summed", () => {
  const a = row("annual", "2025-26", 1);
  assert.ok(a, "annual Q1 row exists");
  // per-day rounding (day rows sum to the aggregate): 400.06 + 200.03 = 600.09
  assert.equal(a.cost, annual(7.6) + annual(3.8));
  assert.equal(a.cost, 600.09);
  assert.equal(a.hours, 11.4);
  assert.equal(a.internalCategoryId, "cat-annual");
  assert.equal(a.categoryLabel, "Annual leave");
  assert.equal(a.estimated, true);
  assert.equal(a.rateMissing, false);
});

check("Sick Q1 = base×(1+SG), no loading", () => {
  const s = row("sick", "2025-26", 1);
  assert.ok(s);
  assert.equal(s.cost, sick(7.6)); // 340.48
  assert.equal(s.cost, 340.48);
  assert.equal(s.hours, 7.6);
});

check("RDO uses break_even_hourly directly — never double-super'd", () => {
  // Q2 RDO days: team 2025-10-03 (E1 7.6×60=456, E2 7.6×50=380) + team 2025-10-10 (E2 only 380)
  //            + pattern 2025-11-07 (E1 7.6×60=456) = 1672.00; hours 7.6×4 = 30.4
  const rq2 = row("rdo", "2025-26", 2);
  assert.ok(rq2);
  assert.equal(rq2.cost, 1672);
  assert.equal(rq2.hours, 30.4);
  // A super-multiplier would inflate this (e.g. ×1.12 → 1872.64); assert it did NOT happen.
  assert.notEqual(rq2.cost, r2(1672 * 1.12));
});

// ── Structural invariants ─────────────────────────────────────────────────────
check("public-holiday day excluded (E2 annual 2025-09-25 not costed)", () => {
  assert.equal(days.find((d) => d.date === "2025-09-25"), undefined);
  // No annual Q1 contribution from E2 → annual Q1 hours stay 11.4 (E1 only)
  assert.equal(days.filter((d) => d.leaveType === "annual").every((d) => d.employeeId === "E1"), true);
});

check("half-day honoured: 3.8 = 0.5 × 7.6 standard day", () => {
  const half = days.find((d) => d.date === "2025-09-17");
  assert.ok(half);
  assert.equal(half.hours, 3.8);
  assert.equal(half.cost, annual(3.8)); // 200.03
});

check("dedup: explicit annual on 2025-10-10 beats team RDO for E1", () => {
  const e1 = days.filter((d) => d.employeeId === "E1" && d.date === "2025-10-10");
  assert.equal(e1.length, 1);
  assert.equal(e1[0].leaveType, "annual"); // NOT rdo
  // E2 still gets the team RDO on that date
  const e2 = days.find((d) => d.employeeId === "E2" && d.date === "2025-10-10");
  assert.equal(e2.leaveType, "rdo");
});

check("part-timer non-7.6 hours: E2 RDO 4h × break_even 50 = 200", () => {
  const pt = days.find((d) => d.employeeId === "E2" && d.date === "2025-09-18");
  assert.equal(pt.hours, 4);
  assert.equal(pt.cost, 200);
});

check("null-rate archived employee flagged rate_missing, not silent $0", () => {
  const miss = days.find((d) => d.employeeId === "E3");
  assert.ok(miss);
  assert.equal(miss.rateMissing, true);
  assert.equal(miss.cost, 0);
  assert.equal(miss.hours, 7.6); // still counts hours (standard day)
  const rdoQ1 = row("rdo", "2025-26", 1);
  assert.equal(rdoQ1.rateMissing, true); // aggregate row carries the flag
  assert.equal(rdoQ1.cost, 200);         // E2 200 + E3 0
  assert.equal(rdoQ1.hours, 11.6);       // 4 + 7.6
});

check("team RDO fanned only across active employees (E3 excluded from fan-out)", () => {
  // E3 appears once (its own explicit row on 09-19), never via team RDO
  assert.equal(days.filter((d) => d.employeeId === "E3").length, 1);
});

check("total costed day count = 10 (11 sources − 1 public holiday)", () => {
  assert.equal(days.length, 10);
});

check("every derived row is flagged estimated:true", () => {
  assert.equal(rows.every((r) => r.estimated === true), true);
});

console.log(`\nAll ${passed} assertions passed.`);
process.exit(0);
