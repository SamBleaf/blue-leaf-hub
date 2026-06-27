#!/usr/bin/env node
/**
 * JOURNEY-B-01 — RFQ money path chain
 *
 *   node scripts/batch-a/run-journey-b-rfq-money-path.mjs
 *   node scripts/batch-a/run-journey-b-rfq-money-path.mjs --write
 */
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";
import { runJourneyBRfqMoneyPath } from "./journey-b-rfq-money-path.mjs";

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║   JOURNEY-B-01 — RFQ send → match → receive → accept       ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write" : "read-only + gap baselines"}`);
console.log(`  Time: ${new Date().toLocaleString("en-AU")}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

await runJourneyBRfqMoneyPath(run);

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── Summary ──────────────────────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) {
  for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`);
}
process.exit(failed > 0 ? 1 : 0);
