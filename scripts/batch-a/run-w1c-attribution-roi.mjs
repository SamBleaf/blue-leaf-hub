#!/usr/bin/env node
/**
 * W1C — closed-loop attribution + ROI (migrations 129 + 130)
 *
 *   node scripts/batch-a/run-w1c-attribution-roi.mjs
 *   node scripts/batch-a/run-w1c-attribution-roi.mjs --write
 */
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";
import { runW1C } from "./w1c-attribution-roi.mjs";

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║     W1C — Closed-loop attribution + ROI (Batch 1C)            ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write (fixtures)" : "read-only + gap baselines"}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

await runW1C(run);

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── Summary ──────────────────────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) { for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`); }
process.exit(failed > 0 ? 1 : 0);
