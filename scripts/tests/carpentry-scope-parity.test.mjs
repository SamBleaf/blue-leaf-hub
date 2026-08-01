// Parity + behaviour test for the carpentry job-scope questionnaire (§4). Server (carpentryScope.mjs) and
// client (carpentryScope.js) must agree, or the builder derives a different module set than the server gate.
// Run: node scripts/tests/carpentry-scope-parity.test.mjs
import * as srv from "../../server/lib/whs/carpentryScope.mjs";
import * as cli from "../../src/lib/carpentryScope.js";

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

// Parity of the static maps
ok(JSON.stringify(srv.J_MODULE_MAP) === JSON.stringify(cli.J_MODULE_MAP), "J_MODULE_MAP parity");
ok(JSON.stringify([...srv.J_MAP_CODES].sort()) === JSON.stringify([...cli.J_MAP_CODES].sort()), "J_MAP_CODES parity");
ok(srv.J_QUESTIONS.length === cli.J_QUESTIONS.length && srv.J_QUESTIONS.every((q, i) => q.key === cli.J_QUESTIONS[i].key), "J_QUESTIONS keys parity");

const CASES = [
  {},
  { j4Loadbearing: "yes" },
  { j5Pre2004: "yes", j8Excavation: "yes" },
  { j6Silica: "yes", j7Road: "no" },
  { j1Stages: ["first_fix"], j2Heights: "yes", j3Openings: "no", j4Loadbearing: "no", j5Pre2004: "no", j6Silica: "no", j7Road: "no", j8Excavation: "no" },
];
for (const c of CASES) {
  ok(JSON.stringify(srv.deriveScopeModules(c)) === JSON.stringify(cli.deriveScopeModules(c)), `deriveScopeModules parity ${JSON.stringify(c)}`);
  ok(JSON.stringify(srv.jScopeMissing(c)) === JSON.stringify(cli.jScopeMissing(c)), `jScopeMissing parity ${JSON.stringify(c)}`);
}

// Behaviour: the demolition/asbestos/excavation recovery + G-6
ok(srv.deriveScopeModules({ j4Loadbearing: "yes" }).includes("H-08") && srv.deriveScopeModules({ j4Loadbearing: "yes" }).includes("H-09"), "load-bearing → H-08 + H-09");
ok(srv.deriveScopeModules({ j5Pre2004: "yes" })[0] === "H-10", "pre-2004 → H-10");
ok(srv.deriveScopeModules({ j8Excavation: "yes" })[0] === "H-13", "excavation → H-13");
ok(srv.deriveScopeModules({ j5Pre2004: "no" }).length === 0, "a 'no' derives nothing");
ok(srv.jScopeMissing({}).includes("j1Stages"), "empty scope is missing stages");
const full = { j1Stages: ["first_fix"], j2Heights: "no", j3Openings: "no", j4Loadbearing: "no", j5Pre2004: "no", j6Silica: "no", j7Road: "no", j8Excavation: "no" };
ok(srv.jScopeComplete(full) === true, "all answered (incl. all-no) → complete");
ok(srv.jScopeComplete({ ...full, j3Openings: undefined }) === false, "a blank yesno → incomplete");

console.log(`carpentry-scope-parity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
