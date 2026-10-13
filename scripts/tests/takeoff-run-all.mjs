// Run every takeoff test suite in sequence and summarise. `npm run test:takeoff`
// TAKEOFF_TEST_VERBOSE=1 also lists every test name as it passes.
// Pure suites always run. DB-backed suites (takeoff-db / takeoff-api) use an ISOLATED Postgres:
// TAKEOFF_TEST_DB_URL (CI service container) or a private local cluster; they print SKIPPED
// when neither is available (reported, never counted as a pass).
import { spawnSync } from "node:child_process";

const SUITES = [
  "takeoff-calc", "takeoff-geometry", "takeoff-gestures", "takeoff-profile-editor", "takeoff-pdf", "takeoff-db", "takeoff-api", "takeoff-premigration",
];
let failed = 0;
const rows = [];
for (const s of SUITES) {
  const r = spawnSync(process.execPath, [`scripts/tests/${s}.test.mjs`], { encoding: "utf8" });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const summary = (out.match(new RegExp(`${s}: .*`)) || [out.trim().split("\n").pop()])[0];
  const status = /SKIPPED/.test(out) ? "SKIPPED" : r.status === 0 ? "PASS" : "FAIL";
  if (status === "FAIL") { failed++; process.stderr.write(out); }
  else if (process.env.TAKEOFF_TEST_VERBOSE) process.stdout.write(`── ${s}\n${out}`);
  rows.push(`${status.padEnd(8)} ${summary}`);
}
console.log(rows.join("\n"));
process.exit(failed ? 1 : 0);
