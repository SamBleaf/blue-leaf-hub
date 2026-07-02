#!/usr/bin/env node
/**
 * W17 — Worker task reorder
 *   node scripts/batch-a/run-w17-task-reorder.mjs --write
 */
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";
import { runW17TaskReorder } from "./w17-task-reorder.mjs";

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║        W17 — Worker task reorder (hold-drag order)            ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write (fixtures)" : "read-only"}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

await runW17TaskReorder(run);

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── Summary ──────────────────────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) { for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`); }
process.exit(failed > 0 ? 1 : 0);
