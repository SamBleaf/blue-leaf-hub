#!/usr/bin/env node
/**
 * P0-B2 Phase 1 — Accept alignment baseline (W08-API-03, W08-API-04, W09-API-05)
 *
 *   node scripts/batch-a/run-w08-accept-alignment.mjs
 *   node scripts/batch-a/run-w08-accept-alignment.mjs --write
 */
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";
import { runW08AcceptAlignment } from "./w08-accept-alignment.mjs";

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║   P0-B2 Phase 1 — Accept alignment baseline (W08/W09)      ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write" : "read-only"}`);
console.log(`  Time: ${new Date().toLocaleString("en-AU")}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

await runW08AcceptAlignment(run);

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── Summary ──────────────────────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) {
  for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`);
}
process.exit(failed > 0 ? 1 : 0);
