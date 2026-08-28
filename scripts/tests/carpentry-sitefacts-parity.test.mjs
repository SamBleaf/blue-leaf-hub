// Parity + resolution test for the site-facts layer (§2). Server + client resolveSiteFacts must agree,
// and every mapped target must resolve to exactly one real control (no unmatched, no over/under-tick).
// Uses the register JSON as ground truth — no DB. Run: node scripts/tests/carpentry-sitefacts-parity.test.mjs
import { readFileSync } from "fs";
import * as srv from "../../server/lib/whs/carpentrySiteFacts.mjs";
import * as cli from "../../src/lib/carpentrySiteFacts.js";

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.error("  ✗", n); } };

const reg = JSON.parse(readFileSync("docs/whs/registers/whs_content.json", "utf8"));
const byCode = Object.fromEntries(reg.modules.map((m) => [m.code, { content_json: { controlOptions: m.controlOptions } }]));

// Static parity
ok(JSON.stringify(srv.SF_RESOLVE) === JSON.stringify(cli.SF_RESOLVE), "SF_RESOLVE parity");
ok(JSON.stringify(srv.STOPWORK_TARGETS) === JSON.stringify(cli.STOPWORK_TARGETS), "STOPWORK_TARGETS parity");
ok(srv.SF_QUESTIONS.length === cli.SF_QUESTIONS.length, "SF_QUESTIONS parity");

const CASES = [
  {},
  { sf01Scaffold: "green" },
  { sf01Scaffold: "untagged" },
  { sf03Openings: "covers" },
  { sf03Openings: "guardrail" },
  { sf07FallSystem: "arrest" },
  { sf07FallSystem: "restraint" },
  { sf10Dust: "extraction", sf11CutStation: "ground" },
  { sf12Overhead: "deenergised" },
];
for (const sf of CASES) {
  const s = srv.resolveSiteFacts(sf, {}, byCode);
  const c = cli.resolveSiteFacts(sf, {}, byCode);
  ok(JSON.stringify(s.byCode) === JSON.stringify(c.byCode), `resolve parity ${JSON.stringify(sf)}`);
  ok(s.unmatched.length === 0, `no unmatched targets ${JSON.stringify(sf)}`);
}

// Behaviour
const scaf = srv.resolveSiteFacts({ sf01Scaffold: "green" }, {}, byCode);
ok(scaf.targeted === 7, `scaffold green → 7 controls (got ${scaf.targeted})`);
ok(Object.keys(scaf.byCode).sort().join(",") === "H-01,H-02,H-03,H-04,H-05,T-13", "scaffold spans H-01..H-05 + T-13");
ok(srv.resolveSiteFacts({ sf01Scaffold: "no" }, {}, byCode).targeted === 0, "scaffold=no ticks nothing");
ok(srv.resolveSiteFacts({ sf01Scaffold: "untagged" }, {}, byCode).targeted === 0, "scaffold=untagged ticks nothing (not certified)");
ok(srv.resolveSiteFacts({}, { stopWind: "32" }, byCode).targeted === 5, "a stop-work limit → 5 stop-work controls");
ok(srv.resolveSiteFacts({ sf07FallSystem: "arrest" }, {}, byCode).byCode["H-01"]?.[0].startsWith("Fall-arrest"), "arrest → the H-01 fall-arrest control specifically (not travel restraint)");

console.log(`carpentry-sitefacts-parity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
