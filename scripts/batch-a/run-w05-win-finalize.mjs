#!/usr/bin/env node
/**
 * W05-API-01/02, W09-API-01, RFQ-16 — Win/lose finalize baseline
 *
 *   node scripts/batch-a/run-w05-win-finalize.mjs
 *   node scripts/batch-a/run-w05-win-finalize.mjs --write
 */
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";
import { runW05WinFinalize } from "./w05-win-finalize.mjs";

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║   W05/W09 — Win / lose finalize baseline (TEST-WIN-FINALIZE) ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write" : "read-only + gap baselines"}`);
console.log(`  Time: ${new Date().toLocaleString("en-AU")}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

await runW05WinFinalize(run);

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── Summary ──────────────────────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) {
  for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`);
}
process.exit(failed > 0 ? 1 : 0);
