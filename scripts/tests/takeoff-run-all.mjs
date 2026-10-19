// Run every takeoff test suite in sequence and summarise. `npm run test:takeoff`
// TAKEOFF_TEST_VERBOSE=1 also lists every test name as it passes.
// Pure suites always run. DB-backed suites (takeoff-db / takeoff-api) use an ISOLATED Postgres:
// TAKEOFF_TEST_DB_URL (CI service container) or a private local cluster; they print SKIPPED
// when neither is available (reported, never counted as a pass).
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

// TC-R04 engine suites (timber, cladding, supports, allocator, flashing paths, integration + adversarial) by name
const TC = readdirSync("scripts/tests").filter((f) => /^takeoff-tc-.*\.test\.mjs$/.test(f)).map((f) => f.replace(/\.test\.mjs$/, "")).sort();
const SUITES = [
  "takeoff-calc", "takeoff-sections", "takeoff-r04", "takeoff-geometry", "takeoff-gestures", "takeoff-profile-editor", "takeoff-pdf", "takeoff-db", "takeoff-api", "takeoff-premigration",
  ...TC,
];
let failed = 0, skipped = 0;
const rows = [];
for (const s of SUITES) {
  const r = spawnSync(process.execPath, [`scripts/tests/${s}.test.mjs`], { encoding: "utf8" });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const summary = (out.match(new RegExp(`${s}: .*`)) || [out.trim().split("\n").pop()])[0];
  const status = /SKIPPED/.test(out) ? "SKIPPED" : r.status === 0 ? "PASS" : "FAIL";
  if (status === "SKIPPED") skipped++;
  if (status === "FAIL") { failed++; process.stderr.write(out); }
  else if (process.env.TAKEOFF_TEST_VERBOSE) process.stdout.write(`── ${s}\n${out}`);
  rows.push(`${status.padEnd(8)} ${summary}`);
}
console.log(rows.join("\n"));
// A skipped DB suite is NOT a pass: exit non-zero unless the caller explicitly accepts skips.
if (skipped && !failed) console.log(`\n${skipped} suite(s) SKIPPED — not verified. Set TAKEOFF_ALLOW_SKIP=1 to exit 0 anyway.`);
process.exit(failed || (skipped && !process.env.TAKEOFF_ALLOW_SKIP) ? 1 : 0);
