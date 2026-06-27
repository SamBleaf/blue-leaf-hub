#!/usr/bin/env node
/**
 * W18-P0-03 — Client-visible Journey photo enforcement
 */
import { runW18PortalPhotoVisibility } from "./w18-portal-photo-visibility.mjs";
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║         W18 Portal Photo Visibility — P0-03                  ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write" : "static + E2E runtime probes"}`);
console.log(`  Time: ${new Date().toLocaleString("en-AU")}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

await runW18PortalPhotoVisibility(run);

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── Summary ──────────────────────────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) {
  console.log("\n  Failures:");
  for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`);
}
process.exit(failed > 0 ? 1 : 0);
