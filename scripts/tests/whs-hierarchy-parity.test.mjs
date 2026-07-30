// Parity + behaviour test for the hierarchy-of-control bar (Design §6.1). The builder (client) and the
// composed pack (server) must agree exactly on the tier, or the on-screen bar and the printed bar differ.
// Run: node scripts/tests/whs-hierarchy-parity.test.mjs
import * as srv from "../../server/lib/whs/hierarchyBar.mjs";
import * as cli from "../../src/lib/whsHierarchy.js";

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; } else { fail++; console.error("  ✗", n); } };

const CASES = [[], [4], [1, 2, 3, 4], [5], [6], [5, 6], [1, 6], [3, 5], [2], [4, 5, 6], [7, 0, 3]];
for (const levels of CASES) {
  const s = srv.hierarchyTier(levels), c = cli.hierarchyTier(levels);
  ok(JSON.stringify(s) === JSON.stringify(c), `parity for [${levels}] — server ${JSON.stringify(s)} vs client ${JSON.stringify(c)}`);
}

// Tier semantics
ok(srv.hierarchyTier([1, 2, 3, 4]).tier === "green", "L1–L4 → green (engineering or higher)");
ok(srv.hierarchyTier([3, 5]).tier === "amber", "top L5 → amber (admin)");
ok(srv.hierarchyTier([2, 6]).tier === "red" && srv.hierarchyTier([2, 6]).ppeOnly, "top L6 → red, ppeOnly");
ok(srv.hierarchyTier([]).tier === "none", "no levels → none");
ok(srv.hierarchyTier([7, 0]).highest === null, "out-of-range levels ignored");

// G-2: HRCW with admin/PPE top → needs justification; task module does not
ok(srv.needsJustification([5], true) === true, "HRCW top-L5 needs justification");
ok(srv.needsJustification([6], true) === true, "HRCW top-L6 needs justification");
ok(srv.needsJustification([4], true) === false, "HRCW top-L4 does not");
ok(srv.needsJustification([6], false) === false, "task module top-L6 does not (PPE-led is ok for task)");
ok(cli.needsJustification([5], true) === true, "client mirror agrees");

// Bar HTML renders 6 segments and the tier label
const html = srv.renderBarHtml([1, 2, 3, 4]);
ok((html.match(/display:inline-block/g) || []).length === 6, "bar renders 6 segments");
ok(html.includes("Engineering"), "bar shows the top-control label");

console.log(`whs-hierarchy-parity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
