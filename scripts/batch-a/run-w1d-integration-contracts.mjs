#!/usr/bin/env node
/**
 * W1D — CRM inbound-feed contracts + outbound-sync readiness
 *
 *   node scripts/batch-a/run-w1d-integration-contracts.mjs           # readiness + guards (no fixtures)
 *   node scripts/batch-a/run-w1d-integration-contracts.mjs --write    # + inbound simulations
 */
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";
import { runW1D } from "./w1d-integration-contracts.mjs";

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║   W1D — CRM feed contracts (website/social/google/email)      ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write (inbound sims + readiness)" : "readiness + guards only"}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

await runW1D(run);

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── Summary ──────────────────────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) { for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`); }
process.exit(failed > 0 ? 1 : 0);
