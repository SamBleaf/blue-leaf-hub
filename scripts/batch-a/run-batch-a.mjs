#!/usr/bin/env node
/**
 * Batch A (W01–W05) API test skeleton runner — Days 6–8 hardening.
 *
 * Usage:
 *   node scripts/batch-a/run-batch-a.mjs           # read-only + gap-documented baselines
 *   node scripts/batch-a/run-batch-a.mjs --write   # + create/delete test fixtures
 *
 * Prerequisites:
 *   npm run dev (port 8787)
 *   node scripts/create-test-user.mjs
 */
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";
import { runW01 } from "./w01-leads.mjs";
import { runW02 } from "./w02-qualification.mjs";
import { runW03 } from "./w03-fee-proposal.mjs";
import { runW04 } from "./w04-job-setup.mjs";
import { runW05, runW05P0A5, runW05P0A6 } from "./w05-tender-board.mjs";

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║         Batch A — W01–W05 Test Skeleton Runner               ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write (fixtures)" : "read-only + gap baselines"}`);
console.log(`  Time: ${new Date().toLocaleString("en-AU")}`);

const run = createRunner();

run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

await runW01(run);
await runW02(run);
await runW03(run);
await runW04(run);
await runW05P0A5(run);
await runW05P0A6(run);

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── Summary ──────────────────────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);

if (failures.length) {
  console.log("\n  Failures:");
  for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`);
}

process.exit(failed > 0 ? 1 : 0);
