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
const full = { j1Stages: ["first_fix"], j2Heights: "no", j3Openings: "no", j4Loadbearing: "no", j5Pre2004: "no", j6Silica: "no", j7Road: "no", j8Excavation: "no", j_plant: "no", j_services: "no" };
ok(srv.jScopeComplete(full) === true, "all answered (incl. all-no) → complete");
ok(srv.jScopeComplete({ ...full, j3Openings: undefined }) === false, "a blank yesno → incomplete");
ok(srv.jScopeComplete({ ...full, j_plant: undefined }) === false, "the new plant question is required for G-6");

// Stage → module derivation (§1→§2, Sam's 2-review pass) — server + client must agree, gate honoured.
ok(JSON.stringify(srv.STAGE_MODULES) === JSON.stringify(cli.STAGE_MODULES), "STAGE_MODULES parity");
ok(JSON.stringify(srv.MODULE_GATE) === JSON.stringify(cli.MODULE_GATE), "MODULE_GATE parity");
ok(JSON.stringify(srv.ALWAYS_MODULES) === JSON.stringify(cli.ALWAYS_MODULES), "ALWAYS_MODULES parity");
ok(JSON.stringify(Object.keys(srv.GATE_PREDICATES)) === JSON.stringify(Object.keys(cli.GATE_PREDICATES)), "GATE_PREDICATES keys parity");
const D = (j, sf) => srv.deriveModulesFromScope(j, sf);
const DCASES = [
  [{ j1Stages: ["first_fix"] }, {}],
  [{ j1Stages: ["first_fix"], j2Heights: "yes" }, {}],
  [{ j1Stages: ["cladding", "roofing"], j6Silica: "yes" }, {}],
  [{ j1Stages: ["second_fix"], j5Pre2004: "yes" }, {}],
  [{ j1Stages: ["cladding"] }, { sf01Scaffold: "green" }],
  [{ j_plant: "yes" }, {}],
  [{}, { sf12Overhead: "confirmed" }],
  [{}, {}],
];
for (const [j, sf] of DCASES) ok(JSON.stringify(D(j, sf).sort()) === JSON.stringify(cli.deriveModulesFromScope(j, sf).sort()), `deriveModulesFromScope parity ${JSON.stringify(j)}|${JSON.stringify(sf)}`);

// Behaviour of the 2-review map
ok(!D({ j1Stages: ["first_fix"] }).includes("H-02"), "first_fix without >2m → no H-02 (gated)");
ok(D({ j1Stages: ["first_fix"], j2Heights: "yes" }).includes("H-02"), "first_fix + >2m=yes → H-02 appears");
ok(D({ j1Stages: ["roofing"], j2Heights: "yes" }).includes("H-03") && D({ j1Stages: ["roofing"], j2Heights: "yes" }).includes("H-04"), "roofing + >2m → truss + batten falls (moved off first_fix)");
ok(!D({ j1Stages: ["first_fix"], j2Heights: "yes" }).includes("H-03"), "first_fix no longer pulls truss-fall H-03");
ok(D({ j1Stages: ["roofing"], j2Heights: "yes" }).includes("T-04") && D({ j1Stages: ["roofing"], j2Heights: "yes" }).includes("T-08"), "roofing now carries saws + ladders (was empty)");
ok(D({}).includes("T-14") && D({}).includes("T-10"), "T-10 + T-14 always on");
ok(D({ j_plant: "yes" }).includes("H-07"), "j_plant=yes → H-07 (was orphaned)");
ok(!D({ j1Stages: ["roofing"], j2Heights: "yes" }).includes("H-07"), "H-07 gate-only — no plant, no H-07 even on roofing");
ok(D({ j_services: "yes" }).includes("H-11"), "j_services=yes → H-11 (was orphaned)");
ok(D({}, { sf12Overhead: "confirmed" }).includes("H-11"), "overhead-services site fact auto-fires H-11");
ok(D({ j1Stages: ["cladding"] }, { sf01Scaffold: "green" }).includes("T-13"), "scaffold on site → T-13");
ok(!D({ j1Stages: ["cladding"] }, {}).includes("T-13"), "no scaffold fact → no T-13 (site-fact gated)");
ok(!D({ j1Stages: ["cladding"] }).includes("H-05"), "cladding without >2m → no H-05 (fall gate)");
ok(D({ j1Stages: ["cladding"], j2Heights: "yes" }).includes("H-05") && !D({ j1Stages: ["cladding"], j2Heights: "yes" }).includes("H-14"), "cladding + >2m → H-05; H-14 still gated on silica (off by default)");

console.log(`carpentry-scope-parity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
