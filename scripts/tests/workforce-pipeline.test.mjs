// Workforce Pipeline — unit tests (pure calc layers). Run: node scripts/tests/workforce-pipeline.test.mjs
// No framework — plain assertions, exits 1 on any failure. Extended as each service lands.
import {
  isWeekend, isWorkingDay, workingDaysBetween, addWorkingDays, calendarDaysBetween, bucketWorkingDays,
} from "../../server/lib/workingCalendar.mjs";
import { resolveStage, isProductionCategory, stageLabel, stageOrder } from "../../server/lib/carpentryStages.mjs";
import { aggregateStages } from "../../server/lib/stageAggregation.mjs";

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; console.error(`  ✗ ${name}\n      expected ${e}\n      got      ${a}`); }
}
function ok(cond, name) { if (cond) pass++; else { fail++; console.error(`  ✗ ${name}`); } }

// ── workingCalendar ── (2026-07-13 is a Monday)
ok(isWeekend("2026-07-18"), "Sat is weekend");
ok(isWeekend("2026-07-19"), "Sun is weekend");
ok(!isWeekend("2026-07-13"), "Mon is not weekend");
ok(isWorkingDay("2026-07-13", {}), "Mon is a working day");
ok(!isWorkingDay("2026-07-13", { holidays: new Set(["2026-07-13"]) }), "holiday is not a working day");
ok(!isWorkingDay("2026-07-13", { rdo: new Set(["2026-07-13"]) }), "RDO is not a working day");
eq(workingDaysBetween("2026-07-13", "2026-07-19", {}), 5, "Mon–Sun = 5 working days");
eq(workingDaysBetween("2026-07-13", "2026-07-19", { holidays: new Set(["2026-07-15"]) }), 4, "one holiday drops to 4");
eq(workingDaysBetween("2026-07-19", "2026-07-13", {}), 0, "reversed range = 0");
eq(addWorkingDays("2026-07-13", 4, {}), "2026-07-17", "Mon + 4 working days = Fri");
eq(addWorkingDays("2026-07-17", 1, {}), "2026-07-20", "Fri + 1 working day skips the weekend to Mon");
eq(addWorkingDays("2026-07-18", 0, {}), "2026-07-20", "0 working days from Sat lands on next Mon");
eq(calendarDaysBetween("2026-07-13", "2026-07-19"), 7, "Mon–Sun = 7 calendar days");
const wb = bucketWorkingDays("2026-07-13", "2026-07-26", "week", {});
eq(wb.length, 2, "two week buckets");
eq(wb.map((b) => b.workingDays), [5, 5], "5 working days per week");

// ── carpentryStages ──
eq(resolveStage({ canonicalKey: "wall_framing" }), "wall_framing", "fine canonical → stage");
eq(resolveStage({ canonicalKey: "cladding_installation" }), "cladding", "cladding install → cladding stage");
eq(resolveStage({ taskCategory: "cladding" }), "cladding", "coarse task_category fallback");
eq(resolveStage({ canonicalKey: "roof_framing", taskCategory: "first_fix_framing" }), "roof_framing", "fine wins over coarse");
eq(resolveStage({ taskCategory: "supervision" }), null, "supervision maps to no stage");
eq(resolveStage({}), null, "nothing → null (reported unmatched)");
ok(!isProductionCategory("supervision"), "supervision is non-production");
ok(isProductionCategory("cladding"), "cladding is production");
eq(stageLabel("wall_framing"), "Wall framing", "stage label");
ok(stageOrder("floor_system") < stageOrder("roof_framing"), "stage order is sequential");

// ── stageAggregation ── (Mon 07-13 … Thu 07-16; Wed 07-15 idle between framing stages)
const agg = aggregateStages({
  hoursPerDay: 8,
  entries: [
    { hours: 8, canonicalKey: "wall_framing", taskCategory: "first_fix_framing", date: "2026-07-13", employeeId: "A" },
    { hours: 8, canonicalKey: "wall_framing", taskCategory: "first_fix_framing", date: "2026-07-14", employeeId: "A" },
    { hours: 8, canonicalKey: "roof_framing", taskCategory: "first_fix_framing", date: "2026-07-16", employeeId: "A" },
    { hours: 4, taskCategory: "supervision", date: "2026-07-13", employeeId: "S" },   // excluded (non-production)
    { hours: 5, taskCategory: "other", date: "2026-07-14", employeeId: "A" },          // excluded (no stage)
  ],
});
eq(agg.stages.map((s) => s.stage), ["wall_framing", "roof_framing"], "two worked stages, ordered");
eq(agg.stages[0].hours, 16, "wall framing 16h");
eq(agg.stages[0].crewDays, 2, "wall framing 2 crew-days");
eq(agg.stages[0].elapsedWorkingDays, 2, "wall framing elapsed 2 working days (Mon–Tue)");
eq(agg.stages[0].productionRate, 8, "wall framing 8 hrs/working-day");
eq(agg.gaps, [{ fromStage: "wall_framing", toStage: "roof_framing", gapWorkingDays: 1 }], "1 idle working day (Wed) between framing stages");
eq(agg.excluded.total, 9, "9 excluded hours");
eq(agg.excluded.byReason.supervision, 4, "4 supervision hours excluded");
eq(agg.excluded.byReason.unmatched_no_stage, 5, "5 unmatched hours excluded");
eq(agg.totalHours, 24, "24 production hours total");
eq(agg.totalCrewDays, 3, "3 crew-days total");
eq(agg.distinctEmployees, 1, "1 distinct production employee");

console.log(`workforce-pipeline: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
