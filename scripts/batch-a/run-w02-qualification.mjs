#!/usr/bin/env node
/**
 * W02 — Qualification / Discovery (OUTCOME-STAMP-01)
 *
 *   node scripts/batch-a/run-w02-qualification.mjs
 *   node scripts/batch-a/run-w02-qualification.mjs --write
 */
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";
import { runW02 } from "./w02-qualification.mjs";

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║     OUTCOME-STAMP-01 — W02-API-03 + W02-API-04               ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write (fixtures)" : "read-only + gap baselines"}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

await runW02(run);

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── Summary ──────────────────────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) {
  for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`);
}
process.exit(failed > 0 ? 1 : 0);
