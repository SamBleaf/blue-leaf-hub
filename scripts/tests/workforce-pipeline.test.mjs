// Workforce Pipeline — unit tests (pure calc layers). Run: node scripts/tests/workforce-pipeline.test.mjs
// No framework — plain assertions, exits 1 on any failure. Extended as each service lands.
import {
  isWeekend, isWorkingDay, workingDaysBetween, addWorkingDays, calendarDaysBetween, bucketWorkingDays,
} from "../../server/lib/workingCalendar.mjs";
import { resolveStage, isProductionCategory, stageLabel, stageOrder } from "../../server/lib/carpentryStages.mjs";
import { aggregateStages } from "../../server/lib/stageAggregation.mjs";
import { breakEven, forecastDuration, collateHistorical } from "../../server/lib/scheduleIntelligence.mjs";
import { computeCapacity } from "../../server/lib/workforceCapacity.mjs";
import { burnForLine } from "../../server/lib/costModelService.mjs";

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; console.error(`  ✗ ${name}\n      expected ${e}\n      got      ${a}`); }
}
function ok(cond, name) { if (cond) pass++; else { fail++; console.error(`  ✗ ${name}`); } }
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

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

// ── scheduleIntelligence: break-even ── (real cost-model shape; headcount 7)
const cm = { teamChargeUpPerDay: 3937, teamBreakEvenPerDay: 3281, headcount: 7, hoursPerDay: 8, marginPct: 0.2 };
const labourSell = 101044;
const be = breakEven({ labourSell, crewSize: 3, cm });
ok(be.available, "break-even available with real cost model");
// Reconcile vs the existing Budget burn block (burnForLine) — same inputs → same whole-team-days.
const burn = burnForLine(labourSell, 0, 0, cm);
eq(be.atMarginDays, burn.atMarginDays, "atMarginDays reconciles with burnForLine (Budget burn block)");
eq(be.breakEvenDays, burn.breakEvenDays, "breakEvenDays reconciles with burnForLine");
// Crew-scaling: whole-team-days × headcount/crewSize → crew productive working-days.
eq(be.targetMarginDays, round1((labourSell / cm.teamChargeUpPerDay) * (7 / 3)), "targetMarginDays scales to crew of 3");
ok(be.breakEvenAllowanceDays > be.targetMarginDays, "break-even allowance is looser than target-margin days");
ok(be.breakEvenAllowanceDays > be.breakEvenDays, "crew allowance (÷3) exceeds whole-team break-even days");
const beNo = breakEven({ labourSell, crewSize: 3, cm: null });
ok(!beNo.available, "break-even unavailable without a cost model");

// ── scheduleIntelligence: forecast (budget-derived, no history/actuals) ──
const fcBudget = forecastDuration({ labourSell, crewSize: 3, cm, includedStages: ["wall_framing", "roof_framing"], plannedStartDate: "2026-08-03" });
eq(fcBudget.source, "budget_break_even", "no history/actuals → budget-derived source");
eq(fcBudget.confidence, "Low", "budget-derived is Low confidence");
eq(fcBudget.expectedProductiveCrewDays, be.targetMarginDays, "budget-derived expected crew-days = target-margin days");
ok(!fcBudget.marginRisk, "budget-derived (at target margin) is NOT flagged as margin risk");
ok(fcBudget.expectedCalendarDays > fcBudget.expectedProductiveCrewDays, "calendar span exceeds productive days (gaps+allowances)");
ok(fcBudget.expectedCompletion > "2026-08-03", "expected completion is after the planned start");

// ── scheduleIntelligence: margin-risk flag (historical hours exceed the allowance) ──
const fcRisk = forecastDuration({
  labourSell, crewSize: 3, cm, includedStages: ["wall_framing"],
  historical: { expectedHoursByStage: { wall_framing: 2000 }, gapMediansByStage: {}, sampleSize: 5 },
});
eq(fcRisk.source, "historical", "history present → historical source");
eq(fcRisk.confidence, "Medium", "sample of 5 → Medium confidence");
ok(fcRisk.marginRisk, "forecast exceeding break-even allowance is flagged");
ok(fcRisk.explanation.includes("exceeds the break-even"), "explanation names the margin-risk");

// ── scheduleIntelligence: active job override (live production) ──
const activeAgg = aggregateStages({
  entries: [
    { hours: 8, canonicalKey: "wall_framing", taskCategory: "first_fix_framing", date: "2026-07-13", employeeId: "A" },
    { hours: 8, canonicalKey: "wall_framing", taskCategory: "first_fix_framing", date: "2026-07-14", employeeId: "B" },
    { hours: 8, canonicalKey: "wall_framing", taskCategory: "first_fix_framing", date: "2026-07-15", employeeId: "A" },
  ],
});
const fcActive = forecastDuration({
  labourSell, crewSize: 3, cm, actuals: activeAgg, includedStages: ["wall_framing"],
  historical: { expectedHoursByStage: { wall_framing: 240 }, gapMediansByStage: {}, sampleSize: 3 },
});
eq(fcActive.source, "active_production", "live timesheets → active source");
eq(fcActive.consumedHours, 24, "consumed hours from approved timesheets");
eq(fcActive.remainingHours, 216, "remaining = expected − consumed");
ok(fcActive.percentComplete === 10, "percent complete = 24/240");
ok(fcActive.productionRate === 8, "production rate 8 hrs/working-day");
ok(fcActive.expectedCompletion > "2026-07-15", "completion projects forward from last worked day");

// ── scheduleIntelligence: collate historical medians ──
const h1 = aggregateStages({ entries: [{ hours: 100, canonicalKey: "wall_framing", taskCategory: "first_fix_framing", date: "2026-06-01", employeeId: "A" }] });
const h2 = aggregateStages({ entries: [{ hours: 200, canonicalKey: "wall_framing", taskCategory: "first_fix_framing", date: "2026-06-01", employeeId: "A" }] });
const hist = collateHistorical([h1, h2]);
eq(hist.sampleSize, 2, "two comparable jobs collated");
eq(hist.expectedHoursByStage.wall_framing, 150, "median wall-framing hours = 150");

// ── workforceCapacity: supply vs demand (week Mon 07-13 … Fri 07-17 = 5 working days) ──
const cap = computeCapacity({
  horizonStart: "2026-07-13", horizonEnd: "2026-07-17", periodType: "week", today: "2026-07-13",
  employees: [{ id: "A" }, { id: "B" }, { id: "C" }],           // 3 staff, no leave → 15 available
  allocations: [                                                 // J1: 5 committed allocation-days
    { jobId: "J1", employeeId: "A", date: "2026-07-13" },
    { jobId: "J1", employeeId: "A", date: "2026-07-14" },
    { jobId: "J1", employeeId: "A", date: "2026-07-15" },
    { jobId: "J1", employeeId: "B", date: "2026-07-13" },
    { jobId: "J1", employeeId: "B", date: "2026-07-14" },
  ],
  forecasts: [{ jobId: "J2", crewSize: 2, remainingHours: 32, hoursPerDay: 8, expectedStart: "2026-07-13", expectedCompletion: "2026-07-17" }],
});
eq(cap.periods.length, 1, "one week bucket");
eq(cap.periods[0].availableCrewDays, 15, "available = 3 staff × 5 working days");
eq(cap.periods[0].committedCrewDays, 5, "committed = 5 real allocation-days");
eq(cap.periods[0].forecastCrewDays, 2, "forecast = 32h ÷ (2×8) crew-days spread over the week");
eq(cap.periods[0].spareCrewDays, 8, "spare = 15 − (5 + 2)");
eq(cap.periods[0].overbookedCrewDays, 0, "not overbooked");

// ── workforceCapacity: committed/forecast dedup (a day is committed OR forecast, never both) ──
const dedup = computeCapacity({
  horizonStart: "2026-07-13", horizonEnd: "2026-07-17", periodType: "week", today: "2026-07-13",
  employees: [{ id: "A" }],
  allocations: [
    { jobId: "J3", employeeId: "A", date: "2026-07-13" },       // J3 committed Mon+Tue
    { jobId: "J3", employeeId: "A", date: "2026-07-14" },
  ],
  forecasts: [{ jobId: "J3", crewSize: 1, remainingHours: 24, hoursPerDay: 8, expectedStart: "2026-07-13", expectedCompletion: "2026-07-17" }],
});
eq(dedup.periods[0].committedCrewDays, 2, "J3 committed Mon+Tue");
eq(dedup.periods[0].forecastCrewDays, 3, "J3 forecast only on the 3 UNallocated days (Wed–Fri), not double-counted");

// ── workforceCapacity: overbooking flagged ──
const over = computeCapacity({
  horizonStart: "2026-07-13", horizonEnd: "2026-07-17", periodType: "week", today: "2026-07-13",
  employees: [{ id: "A" }],                                      // 5 available
  allocations: [
    { jobId: "J1", employeeId: "A", date: "2026-07-13" }, { jobId: "J1", employeeId: "A", date: "2026-07-14" },
    { jobId: "J1", employeeId: "A", date: "2026-07-15" }, { jobId: "J1", employeeId: "A", date: "2026-07-16" },
    { jobId: "J1", employeeId: "A", date: "2026-07-17" },       // 5 committed
  ],
  forecasts: [{ jobId: "J2", crewSize: 1, remainingHours: 48, hoursPerDay: 8, expectedStart: "2026-07-13", expectedCompletion: "2026-07-17" }], // 6 forecast
});
eq(over.periods[0].overbookedCrewDays, 6, "demand 11 vs available 5 → 6 crew-days overbooked");
eq(over.periods[0].spareCrewDays, 0, "no spare when overbooked");
eq(over.totals.overbookedPeriods, 1, "one overbooked period in totals");

console.log(`workforce-pipeline: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
