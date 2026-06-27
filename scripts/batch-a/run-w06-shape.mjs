#!/usr/bin/env node
/**
 * W06-UI-02 — Package API shape test runner
 *
 *   node scripts/batch-a/run-w06-shape.mjs
 *   node scripts/batch-a/run-w06-shape.mjs --write
 */
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";
import { runW06Shape } from "./w06-package-shape.mjs";

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║         W06 — Package API shape (W06-UI-02)                  ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write" : "read-only"}`);
console.log(`  Time: ${new Date().toLocaleString("en-AU")}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

await runW06Shape(run);

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── Summary ──────────────────────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) {
  for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`);
}
process.exit(failed > 0 ? 1 : 0);
