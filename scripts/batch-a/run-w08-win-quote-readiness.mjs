#!/usr/bin/env node
/**
 * P0-B4 — Win quote readiness (W08-API-02/05, W09-API-02/08)
 *
 * Usage:
 *   node scripts/batch-a/run-w08-win-quote-readiness.mjs
 *   node scripts/batch-a/run-w08-win-quote-readiness.mjs --write
 */
import { runW08WinQuoteReadiness } from "./w08-win-quote-readiness.mjs";
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║         W08 Win Quote Readiness — P0-B4                      ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write" : "read-only + gap baselines"}`);
console.log(`  Time: ${new Date().toLocaleString("en-AU")}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

await runW08WinQuoteReadiness(run);

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── Summary ──────────────────────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) {
  console.log("\n  Failures:");
  for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`);
}
process.exit(failed > 0 ? 1 : 0);
