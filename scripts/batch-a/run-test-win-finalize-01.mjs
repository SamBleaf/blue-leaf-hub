#!/usr/bin/env node
/**
 * TEST-WIN-FINALIZE-01 — Full batch
 *
 *   node scripts/batch-a/run-test-win-finalize-01.mjs
 *   node scripts/batch-a/run-test-win-finalize-01.mjs --write
 */
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";
import { runW05WinFinalize } from "./w05-win-finalize.mjs";
import { runJourneyWinFinalize } from "./journey-win-finalize.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║            TEST-WIN-FINALIZE-01 — Win handoff batch          ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write" : "read-only + gap baselines"}`);
console.log(`  Time: ${new Date().toLocaleString("en-AU")}`);

const run = createRunner();
run.section("Environment");
const up = await assertServerUp(run);
if (!up) process.exit(1);

run.section("Phase A — W05 win/lose finalize baseline");
await runW05WinFinalize(run);

run.section("Phase B — JOURNEY-WIN accept → win → ops");
await runJourneyWinFinalize(run);

if (WRITE) {
  run.section("Phase C — W08 win-quote + W09 ops regression");
  const w08 = spawnSync("node", ["scripts/batch-a/run-w08-win-quote-readiness.mjs", "--write"], {
    cwd: root,
    encoding: "utf8",
  });
  if (w08.status === 0) {
    run.pass("W08 win-quote-readiness regression (--write) green");
  } else {
    run.fail("W08 win-quote-readiness regression", w08.stdout?.slice(-400) || "non-zero exit");
  }

  const w09 = spawnSync("node", ["scripts/batch-a/run-w09-ops-readiness.mjs", "--write"], {
    cwd: root,
    encoding: "utf8",
  });
  if (w09.status === 0) {
    run.pass("W09 ops-readiness regression (--write) green");
  } else {
    run.fail("W09 ops-readiness regression", w09.stdout?.slice(-400) || "non-zero exit");
  }
} else {
  run.gap("W08/W09 regression phases", "requires --write on full batch");
}

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n── TEST-WIN-FINALIZE-01 Summary ─────────────────────────────");
console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) {
  for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`);
}
process.exit(failed > 0 ? 1 : 0);
