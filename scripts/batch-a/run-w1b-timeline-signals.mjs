#!/usr/bin/env node
/**
 * W1B — CRM unified timeline + lead_signals (migrations 127 + 128)
 *
 *   node scripts/batch-a/run-w1b-timeline-signals.mjs
 *   node scripts/batch-a/run-w1b-timeline-signals.mjs --write
 */
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";
import { runW1B } from "./w1b-timeline-signals.mjs";

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║      W1B — Unified timeline + trust signals (Batch 1B)        ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write (fixtures)" : "read-only + gap baselines"}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

await runW1B(run);

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── Summary ──────────────────────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) { for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`); }
process.exit(failed > 0 ? 1 : 0);
