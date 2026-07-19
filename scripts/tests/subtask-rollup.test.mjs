// Sub-task actual rollup — unit tests. Run: node scripts/tests/subtask-rollup.test.mjs
import { rollupSubtaskActuals, subtaskKey } from "../../server/lib/subtaskRollup.mjs";

let pass = 0, fail = 0;
function eq(a, e, name) { const A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) pass++; else { fail++; console.error(`  ✗ ${name}\n      expected ${E}\n      got      ${A}`); } }

eq(subtaskKey("cladding", "cladding_installation"), "cladding|cladding_installation", "composite key = task_category|canonical_key");

const roll = rollupSubtaskActuals([
  { task_category: "cladding", canonical_key: "cladding_installation", cost_amount: 200, hours: 4 },
  { task_category: "cladding", canonical_key: "cladding_installation", cost_amount: 150, hours: 3 },
  { task_category: "cladding", canonical_key: "battening", cost_amount: 90, hours: 2 },
  { task_category: "cladding", canonical_key: null, cost_amount: 500, hours: 8 },   // untagged → rolls to category, not a sub-task
  { task_category: "first_fix_framing", canonical_key: "wall_framing", cost_amount: 300, hours: 6 },
]);
eq(roll["cladding|cladding_installation"], { cost: 350, hours: 7 }, "same sub-task across days sums");
eq(roll["cladding|battening"], { cost: 90, hours: 2 }, "distinct sub-task tracked separately");
eq(roll["first_fix_framing|wall_framing"], { cost: 300, hours: 6 }, "sub-task scoped by its own task_category");
eq(Object.keys(roll).includes("cladding|"), false, "untagged (null canonical_key) is NOT a sub-task bucket");
eq(Object.keys(roll).length, 3, "only tagged sub-tasks produce buckets");
eq(rollupSubtaskActuals([]), {}, "no entries → empty");
eq(rollupSubtaskActuals([{ task_category: "cladding", canonicalKey: "prep", costAmount: 10.005, hours: 1 }])["cladding|prep"], { cost: 10.01, hours: 1 }, "camelCase inputs + rounding tolerated");

console.log(`subtask-rollup: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
