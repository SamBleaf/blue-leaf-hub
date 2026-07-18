// Carpentry stage-schedule service — unit tests. Run: node scripts/tests/carpentry-stage-schedule.test.mjs
// No framework — plain assertions, exits 1 on any failure.
import { seedStageSchedule, resolveIncludedStages, mergeActuals, stageDurationDays } from "../../server/lib/carpentryStageScheduleService.mjs";

let pass = 0, fail = 0;
function eq(a, e, name) { const A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) pass++; else { fail++; console.error(`  ✗ ${name}\n      expected ${E}\n      got      ${A}`); } }
function ok(c, name) { if (c) pass++; else { fail++; console.error(`  ✗ ${name}`); } }

// ── resolveIncludedStages ── (2026-08-03 is a Monday)
eq(resolveIncludedStages([{ canonical_key: "wall_framing" }, { canonical_key: "cladding_installation" }, { canonical_key: "doors" }]),
  ["wall_framing", "cladding", "second_fix"], "budget line items → ordered stages");
eq(resolveIncludedStages([]).length, 11, "no budget → default full-package set (11 stages)");
ok(resolveIncludedStages([{ canonicalKey: "roof_framing" }, { canonicalKey: "floor_framing" }]).join(",") === "floor_system,roof_framing", "camelCase keys + reorder by stageOrder");

// ── crew-scaled durations ──
eq(stageDurationDays("wall_framing", {}), 6, "wall framing 10d @ crew 5 → ceil(10×3/5)=6 working days");
eq(stageDurationDays("wall_framing", { first_fix_framing: 10 }), 3, "more crew → fewer days (ceil(10×3/10)=3)");
eq(stageDurationDays("cladding", {}), 6, "cladding 8d @ crew 4 → 6");

// ── seed / auto-layout ──
const rows = seedStageSchedule({
  jobStartDate: "2026-08-03",
  budgetLineItems: [{ canonical_key: "wall_framing" }, { canonical_key: "cladding_installation" }, { canonical_key: "doors" }],
});
eq(rows.map((r) => r.stage_key), ["wall_framing", "cladding", "second_fix"], "seed: three ordered stages");
eq(rows[0].planned_start, "2026-08-03", "wall framing starts on the job start (Mon)");
eq(rows[0].planned_end, "2026-08-10", "wall framing ends after 6 working days");
eq(rows[1].planned_start, "2026-08-11", "cladding starts the next working day after framing");
eq(rows[1].depends_on, [{ stageKey: "wall_framing", type: "FS", lagDays: 0 }], "cladding FS-depends on wall framing");
eq(rows[2].depends_on[0].stageKey, "cladding", "second fix FS-depends on cladding (transitive gap enforcement)");
ok(rows[0].sort_order < rows[1].sort_order && rows[1].sort_order < rows[2].sort_order, "sort_order follows stage order");

// ── milestone backfill overrides the auto-layout start ──
const withMilestone = seedStageSchedule({
  jobStartDate: "2026-08-03",
  budgetLineItems: [{ canonical_key: "wall_framing" }, { canonical_key: "cladding_installation" }],
  milestones: [{ name: "Cladding start", target_date: "2026-09-01" }],
});
eq(withMilestone.find((r) => r.stage_key === "cladding").planned_start, "2026-09-01", "milestone date backfills cladding start (carries user dates across)");

// ── a milestone can push a stage LATER but never before its dependencies (no overlap) ──
const noOverlap = seedStageSchedule({
  jobStartDate: "2026-08-03",
  budgetLineItems: [{ canonical_key: "wall_framing" }, { canonical_key: "cladding_installation" }],
  milestones: [{ name: "Cladding start", target_date: "2026-08-05" }], // earlier than framing ends (08-10)
});
const clad = noOverlap.find((r) => r.stage_key === "cladding");
const wall = noOverlap.find((r) => r.stage_key === "wall_framing");
ok(clad.planned_start > wall.planned_end, "cladding starts AFTER framing despite an earlier milestone date (deps win)");
eq(clad.planned_start, "2026-08-11", "cladding clamped to the sequential start, not the overlapping milestone");

// ── locked existing row is preserved, not re-laid-out ──
const withLock = seedStageSchedule({
  jobStartDate: "2026-08-03",
  budgetLineItems: [{ canonical_key: "wall_framing" }, { canonical_key: "cladding_installation" }],
  existing: [{ stage_key: "wall_framing", planned_start: "2026-07-01", planned_end: "2026-07-15", locked: true, depends_on: [], status: "in_progress" }],
});
eq(withLock.find((r) => r.stage_key === "wall_framing").planned_start, "2026-07-01", "locked stage keeps its dates");
ok(withLock.find((r) => r.stage_key === "wall_framing").locked === true, "locked flag preserved");

// ── mergeActuals attaches timesheet-observed dates ──
const merged = mergeActuals(rows, { stages: [{ stage: "wall_framing", firstDate: "2026-08-04", lastDate: "2026-08-12" }] });
eq(merged[0].actual_start, "2026-08-04", "actual_start from aggregation");
eq(merged[0].actual_end, "2026-08-12", "actual_end from aggregation");
ok(merged[1].actual_start === null, "stage with no timesheets → null actuals");

console.log(`carpentry-stage-schedule: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
