#!/usr/bin/env node
/**
 * W17-P7 — leading-hand QC checklist
 */
import { runW17Qc } from "./w17-qc.mjs";
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║         W17-P7 leading-hand QC checklist                      ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write" : "read-only + gap baselines"}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

await runW17Qc(run);

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── Summary ──────────────────────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) { console.log("\n  Failures:"); for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`); }
process.exit(failed > 0 ? 1 : 0);
