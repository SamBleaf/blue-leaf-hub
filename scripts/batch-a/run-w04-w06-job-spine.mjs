#!/usr/bin/env node
/**
 * JOB-SPINE-01 — W04-API-02 + W06-API-03
 *
 *   node scripts/batch-a/run-w04-w06-job-spine.mjs
 *   node scripts/batch-a/run-w04-w06-job-spine.mjs --write
 */
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";
import { runW04W06JobSpine } from "./w04-w06-job-spine.mjs";

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║     JOB-SPINE-01 — W04-API-02 + W06-API-03                   ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write (fixtures)" : "read-only + gap baselines"}`);
console.log(`  Time: ${new Date().toLocaleString("en-AU")}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

await runW04W06JobSpine(run);

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── Summary ──────────────────────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) {
  console.log("\n  Failures:");
  for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`);
}
process.exit(failed > 0 ? 1 : 0);
