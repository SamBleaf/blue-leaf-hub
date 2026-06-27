#!/usr/bin/env node
import { runW17SnapshotReview } from "./w17-snapshot-review.mjs";
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║     W17 Snapshot Weekly Review — W17-P2 (read-only refine)     ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write" : "read-only + gap baselines"}`);
console.log(`  Time: ${new Date().toLocaleString("en-AU")}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

await runW17SnapshotReview(run);

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── Summary ──────────────────────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) {
  console.log("\n  Failures:");
  for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`);
}
process.exit(failed > 0 ? 1 : 0);
