#!/usr/bin/env node
/**
 * W17-P8 — Deputy-replacement hardening gate.
 * Runs the ENTIRE Workforce surface (W15 + W16 + W17 P1–P7) in one pass → one combined verdict.
 * This is the regression gate for replacing Deputy (SAM-W15-002: E2E + parallel-run sign-off).
 */
import { createRunner, assertServerUp, WRITE } from "./_helpers.mjs";
import { runW15TimesheetAuth } from "./w15-timesheet-auth.mjs";
import { runW16AllocationBaseline } from "./w16-allocation-baseline.mjs";
import { runW17TeamTabBaseline } from "./w17-team-tab-baseline.mjs";
import { runW17SnapshotReview } from "./w17-snapshot-review.mjs";
import { runW17WorkerTasks } from "./w17-worker-tasks.mjs";
import { runW17PlannerBaseline } from "./w17-planner-baseline.mjs";
import { runW17PlannerDnD } from "./w17-planner-dnd.mjs";
import { runW17RdoHoliday } from "./w17-rdo-holiday.mjs";
import { runW17VoiceTasks } from "./w17-voice-tasks.mjs";
import { runW17Qc } from "./w17-qc.mjs";

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║   W17-P8 — Deputy-replacement Workforce hardening gate         ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`  Mode: ${WRITE ? "--write" : "read-only + gap baselines"}`);
console.log(`  Time: ${new Date().toLocaleString("en-AU")}`);

const run = createRunner();
run.section("Environment");
if (!(await assertServerUp(run))) process.exit(1);

const suites = [
  ["W15 timesheet auth", runW15TimesheetAuth],
  ["W16 allocation baseline", runW16AllocationBaseline],
  ["W17-P1 team tab", runW17TeamTabBaseline],
  ["W17-P2 snapshot review", runW17SnapshotReview],
  ["W17-P3 worker tasks/preview", runW17WorkerTasks],
  ["W17-P4 planner minimum", runW17PlannerBaseline],
  ["W17-P4b/c planner drag-drop", runW17PlannerDnD],
  ["W17-P5 RDO/public-holiday", runW17RdoHoliday],
  ["W17-P6 voice-to-tasks", runW17VoiceTasks],
  ["W17-P7 leading-hand QC", runW17Qc],
];

for (const [name, fn] of suites) {
  run.section(`══ ${name} ══`);
  try { await fn(run); } catch (e) { run.fail(`${name} crashed`, e.message); }
}

const { passed, failed, skipped, gapDocumented, failures } = run.stats;
console.log("\n══════════════════════════════════════════════════════════════");
console.log(`  DEPUTY-REPLACEMENT GATE — Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}  Gap-documented: ${gapDocumented}`);
if (failures.length) { console.log("\n  Failures:"); for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`); }
console.log(failed === 0
  ? "\n  ✅ Workforce surface GREEN — ready for the Deputy parallel-run (SAM-W15-002). Gaps await migrations 118/119."
  : "\n  ❌ Failures above — NOT ready.");
process.exit(failed > 0 ? 1 : 0);
