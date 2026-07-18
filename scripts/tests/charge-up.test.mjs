// Charge Up service — unit tests. Run: node scripts/tests/charge-up.test.mjs
// No framework — plain assertions, exits 1 on any failure.
import { rollupBySubJob, categoryTotals, stripCost } from "../../server/lib/chargeUpService.mjs";

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

console.log(`charge-up: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
