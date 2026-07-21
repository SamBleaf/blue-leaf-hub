// Charge Up service — unit tests. Run: node scripts/tests/charge-up.test.mjs
// No framework — plain assertions, exits 1 on any failure.
import { rollupBySubJob, categoryTotals, stripCost, validateChargeUpSite, auFinancialYear, rollupByFinancialYear, chargeOutFromMargin } from "../../server/lib/chargeUpService.mjs";

let pass = 0, fail = 0;
function eq(a, e, name) { const A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) pass++; else { fail++; console.error(`  ✗ ${name}\n      expected ${E}\n      got      ${A}`); } }
function ok(c, name) { if (c) pass++; else { fail++; console.error(`  ✗ ${name}`); } }

const entries = [
  { chargeUpJobId: "S1", employeeId: "A", employeeName: "Anna", hours: 8, cost: 200 },
  { chargeUpJobId: "S1", employeeId: "B", employeeName: "Ben", hours: 4, cost: 100 },
  { chargeUpJobId: "S2", employeeId: "A", employeeName: "Anna", hours: 5, cost: 125 },
  { chargeUpJobId: null, employeeId: "A", employeeName: "Anna", hours: 2, cost: 50 },   // untagged bucket
];
const rates = { A: 90, B: 80 };   // charge_up_hourly per person

const roll = rollupBySubJob(entries, rates);

// ── per-site rollup, sorted by charge-out ──
eq(roll.map((s) => s.chargeUpJobId), ["S1", "S2", null], "sites sorted by charge-out; untagged bucket last");
const s1 = roll.find((s) => s.chargeUpJobId === "S1");
eq(s1.hours, 12, "S1 total hours");
eq(s1.cost, 300, "S1 total cost");
eq(s1.chargeOut, 1040, "S1 charge-out = 8×90 + 4×80");
eq(s1.byPerson.map((p) => [p.name, p.hours, p.chargeOut]), [["Anna", 8, 720], ["Ben", 4, 320]], "S1 per-person hours + charge-out, ordered by hours");
eq(roll.find((s) => s.chargeUpJobId === "S2").chargeOut, 450, "S2 charge-out = 5×90");
eq(roll.find((s) => s.chargeUpJobId === null).hours, 2, "untagged bucket keeps its hours");

// ── missing rate → charge-out 0 (never NaN) ──
eq(rollupBySubJob([{ chargeUpJobId: "S3", employeeId: "Z", employeeName: "Zed", hours: 3, cost: 60 }], rates)[0].chargeOut, 0, "no rate for employee → charge-out 0");

// ── category totals ──
eq(categoryTotals(roll), { hours: 19, cost: 475, chargeOut: 1670, sites: 2 }, "category totals; untagged not counted as a site");

// ── director gating: cost nulled for non-directors, charge-out kept ──
const stripped = stripCost(roll, false);
ok(stripped[0].cost === null, "non-director: site cost nulled");
ok(stripped[0].chargeOut === 1040, "non-director: charge-out (billable) preserved");
ok(stripped[0].byPerson[0].cost === null, "non-director: per-person cost nulled");
eq(stripCost(roll, true)[0].cost, 300, "director: cost preserved");

// ── Planner site-choice validation (validateChargeUpSite) ──
eq(validateChargeUpSite({ isChargeUpJob: false, activeSiteIds: [], chargeUpJobId: null }), { chargeUpJobId: null }, "ordinary allocation → never tagged");
eq(validateChargeUpSite({ isChargeUpJob: false, activeSiteIds: ["S1"], chargeUpJobId: "S1" }), { chargeUpJobId: null }, "non-charge-up job ignores a stray site id");
eq(validateChargeUpSite({ isChargeUpJob: true, activeSiteIds: [], chargeUpJobId: null }), { chargeUpJobId: null }, "charge-up but no sites yet → allow untagged (fail soft)");
ok(!!validateChargeUpSite({ isChargeUpJob: true, activeSiteIds: ["S1", "S2"], chargeUpJobId: null }).error, "charge-up with sites but none picked → required error");
ok(!!validateChargeUpSite({ isChargeUpJob: true, activeSiteIds: ["S1"], chargeUpJobId: "S9" }).error, "picked a site that isn't part of the job → error");
eq(validateChargeUpSite({ isChargeUpJob: true, activeSiteIds: ["S1", "S2"], chargeUpJobId: "S2" }), { chargeUpJobId: "S2" }, "valid site choice → stored");

// ── AU financial year labelling ──
eq(auFinancialYear("2026-07-19"), "2026/27", "July → new FY starts");
eq(auFinancialYear("2026-06-30"), "2025/26", "June → prior FY");
eq(auFinancialYear("2027-01-05"), "2026/27", "Jan → FY started previous July");
eq(auFinancialYear(null), null, "no date → null");

// ── by-FY rollup with charge-out ──
const fyRates = { A: 100, B: 80 };
const fyRoll = rollupByFinancialYear([
  { date: "2026-06-20", employeeId: "A", hours: 10, cost: 250 }, // FY 2025/26
  { date: "2026-07-02", employeeId: "A", hours: 5, cost: 125 },  // FY 2026/27
  { date: "2026-08-10", employeeId: "B", hours: 4, cost: 88 },   // FY 2026/27
], fyRates);
eq(fyRoll.map((f) => f.fy), ["2025/26", "2026/27"], "FYs sorted ascending");
eq(fyRoll[0], { fy: "2025/26", hours: 10, cost: 250, chargeOut: 1000 }, "FY 2025/26 = 10h × $100");
eq(fyRoll[1], { fy: "2026/27", hours: 9, cost: 213, chargeOut: 820 }, "FY 2026/27 = 5×100 + 4×80");

// ── FY rollup honours the per-site margin (reconciles with per-site totals) ──
const fyOv = rollupByFinancialYear([
  { date: "2026-07-02", chargeUpJobId: "S1", employeeId: "A", hours: 10, cost: 250 }, // margin priced off cost
  { date: "2026-07-03", chargeUpJobId: null, employeeId: "A", hours: 2, cost: 50 },   // untagged → per-person
], { A: 130 }, { S1: 40 });
eq(fyOv[0].chargeOut, 676.67, "FY charge-out: S1 250÷0.6 (margin) + untagged 2×$130");

// ── per-shift entries + lastDate (Phase 1 drill-down) ──
const dated = [
  { chargeUpJobId: "S1", employeeId: "A", employeeName: "Anna", hours: 8, cost: 200, date: "2026-07-10", notes: "Deck boards", entryId: "e1" },
  { chargeUpJobId: "S1", employeeId: "B", employeeName: "Ben", hours: 4, cost: 100, date: "2026-07-12", notes: "", entryId: "e2" },
];
const dr = rollupBySubJob(dated, rates);
const ds1 = dr.find((s) => s.chargeUpJobId === "S1");
eq(ds1.entries.map((en) => [en.date, en.employeeName, en.hours, en.chargeOut]), [["2026-07-12", "Ben", 4, 320], ["2026-07-10", "Anna", 8, 720]], "entries per shift, newest first, with charge-out");
eq(ds1.entries[1].notes, "Deck boards", "entry keeps the worker's free-text note");
eq(ds1.entries[0].notes, null, "empty note → null");
eq(ds1.lastDate, "2026-07-12", "lastDate = most recent shift date");

// ── entry passthrough for the site-detail pop-up: task category + completion photo ──
const wp = rollupBySubJob([
  { chargeUpJobId: "S1", employeeId: "A", employeeName: "Anna", hours: 5, cost: 120, date: "2026-07-14", notes: "Fixed gate", entryId: "e9", taskCategory: "site_labouring", completionPhotoUrl: "data:image/jpeg;base64,zzz" },
], rates)[0].entries[0];
eq([wp.taskCategory, wp.completionPhotoUrl], ["site_labouring", "data:image/jpeg;base64,zzz"], "entry carries taskCategory + completion photo");
ok(stripCost(rollupBySubJob([{ chargeUpJobId: "S1", employeeId: "A", hours: 5, cost: 120, entryId: "e9", completionPhotoUrl: "data:x" }], rates), false)[0].entries[0].completionPhotoUrl === "data:x", "non-director keeps the photo (only cost is stripped)");

// ── per-site target gross margin (Phase 2) — charge-out priced off wage cost ──
eq(chargeOutFromMargin(300, 40), 500, "chargeOutFromMargin: 300 ÷ (1−0.40) = 500");
eq(chargeOutFromMargin(100, 100), 0, "100% margin guarded → 0 (never divide by zero)");
const mvs1 = rollupBySubJob(dated, rates, { S1: 40 }).find((s) => s.chargeUpJobId === "S1");
eq(mvs1.chargeOut, 500, "40% target margin: cost 300 ÷ 0.6 = 500");
ok(Math.abs((mvs1.chargeOut - mvs1.cost) / mvs1.chargeOut - 0.4) < 1e-9, "realised gross margin == the target (40%)");
eq(mvs1.entries.find((en) => en.entryId === "e1").chargeOut, 333.33, "margin applies per entry: 200 ÷ 0.6");
eq(mvs1.byPerson.find((p) => p.name === "Anna").chargeOut, 333.33, "margin flows into per-person too");
eq(rollupBySubJob(dated, rates, {}).find((s) => s.chargeUpJobId === "S1").chargeOut, 1040, "no margin → per-person rate as before");
eq(rollupBySubJob(dated, rates, { S1: 0 }).find((s) => s.chargeUpJobId === "S1").chargeOut, 300, "0% margin → charge-out = wage cost (300)");
// untagged bucket never takes a margin
eq(rollupBySubJob([{ chargeUpJobId: null, employeeId: "A", employeeName: "Anna", hours: 2, cost: 50 }], rates, { S1: 40 }).find((s) => !s.chargeUpJobId).chargeOut, 180, "untagged ignores site margin (2×$90)");

// ── stripCost also nulls per-entry cost for non-directors ──
ok(stripCost(dr, false).find((s) => s.chargeUpJobId === "S1").entries.every((en) => en.cost === null), "non-director: per-entry cost nulled");
ok(stripCost(dr, true).find((s) => s.chargeUpJobId === "S1").entries[0].cost != null, "director: per-entry cost preserved");

console.log(`charge-up: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
