#!/usr/bin/env node
/**
 * W07-API-01 / RFQ-04 — Engine outbound RFQ send baseline
 *
 *   node scripts/batch-a/run-w07-send-baseline.mjs
 *   node scripts/batch-a/run-w07-send-baseline.mjs --write
 */
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";
import { runW07SendBaseline } from "./w07-send-baseline.mjs";

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║   W07-API-01 / RFQ-04 — Engine outbound send baseline      ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write" : "read-only + gap baselines"}`);
console.log(`  Time: ${new Date().toLocaleString("en-AU")}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

await runW07SendBaseline(run);

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── Summary ──────────────────────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) {
  for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`);
}
process.exit(failed > 0 ? 1 : 0);
