#!/usr/bin/env node
/**
 * W1A — CRM/Sales Control Spine (migration 127)
 *
 *   node scripts/batch-a/run-w1a-crm-control-spine.mjs
 *   node scripts/batch-a/run-w1a-crm-control-spine.mjs --write
 */
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";
import { runW1A } from "./w1a-crm-control-spine.mjs";

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║     W1A — CRM Control Spine (fit + action queue + source)     ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write (fixtures)" : "read-only + gap baselines"}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

await runW1A(run);

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── Summary ──────────────────────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) {
  for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`);
}
process.exit(failed > 0 ? 1 : 0);
