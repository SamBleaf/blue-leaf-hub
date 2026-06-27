#!/usr/bin/env node
/**
 * TEST-JOURNEY-B-01 — Full batch: W07 send + matcher smoke + journey chain + W08 accept regression pointer
 *
 *   node scripts/batch-a/run-test-journey-b-01.mjs
 *   node scripts/batch-a/run-test-journey-b-01.mjs --write
 */
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";
import { runW07SendBaseline } from "./w07-send-baseline.mjs";
import { runJourneyBRfqMoneyPath } from "./journey-b-rfq-money-path.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║              TEST-JOURNEY-B-01 — RFQ money path              ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write" : "read-only + gap baselines"}`);
console.log(`  Time: ${new Date().toLocaleString("en-AU")}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

run.section("Phase A — W07 engine send baseline");
await runW07SendBaseline(run);

run.section("Phase B — W07 matcher unit smoke (strict)");
const matcher = spawnSync("node", ["scripts/test-imap-quote-match.mjs", "--strict"], {
  cwd: root,
  encoding: "utf8",
});
if (matcher.status === 0) {
  run.pass("W07 matcher unit suite (--strict) green");
} else {
  run.fail("W07 matcher unit suite (--strict)", matcher.stderr?.slice(0, 400) || "non-zero exit");
}

run.section("Phase C — JOURNEY-B money path chain");
await runJourneyBRfqMoneyPath(run);

if (WRITE) {
  run.section("Phase D — W08 accept alignment regression (existing suite)");
  const w08 = spawnSync("node", ["scripts/batch-a/run-w08-accept-alignment.mjs", "--write"], {
    cwd: root,
    encoding: "utf8",
  });
  if (w08.status === 0) {
    run.pass("W08 accept-alignment regression (--write) green");
  } else {
    run.fail("W08 accept-alignment regression", w08.stdout?.slice(-500) || "non-zero exit");
  }
} else {
  run.gap("W08 accept-alignment regression", "requires --write on full batch");
}

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── TEST-JOURNEY-B-01 Summary ────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) {
  for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`);
}
process.exit(failed > 0 ? 1 : 0);
