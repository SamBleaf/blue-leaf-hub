// =============================================================================
// Stage aggregation (Workforce Pipeline / Schedule Intelligence v1)
// Pure: turns approved timesheet entries into per-stage ACTUALS + observed inter-stage
// gaps, separating productive from elapsed duration, and reporting excluded hours honestly
// (never silently pretending the data is complete). The route joins timesheet_entries →
// budget_line_item_id → carpentry_budget_line_items.canonical_key and passes plain entries in.
//
// entry shape: { hours, overtimeHours, taskCategory, canonicalKey, date:'YYYY-MM-DD', employeeId }
// =============================================================================
import { resolveStage, isProductionCategory, stageOrder } from "./carpentryStages.mjs";
import { workingDaysBetween, calendarDaysBetween } from "./workingCalendar.mjs";

const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
function addExcluded(ex, reason, hours) { ex.total = round1(ex.total + hours); ex.byReason[reason] = round1((ex.byReason[reason] || 0) + hours); }

export function aggregateStages({ entries = [], nonWork = {}, hoursPerDay = 8 } = {}) {
  const byStage = {};
  const employeesByStage = {};
  const datesByStage = {};
  const excluded = { total: 0, byReason: {} };

  for (const e of entries) {
    const hours = Number(e.hours) || 0;
    if (hours <= 0) continue;
    const ot = Number(e.overtimeHours ?? e.overtime_hours) || 0;
    // Data-quality exclusions (reported, not dropped silently).
    if (!isProductionCategory(e.taskCategory)) { addExcluded(excluded, "supervision", hours); continue; }
    const stage = resolveStage({ canonicalKey: e.canonicalKey, taskCategory: e.taskCategory });
    if (!stage) { addExcluded(excluded, (!e.taskCategory || e.taskCategory === "other") ? "unmatched_no_stage" : "unmapped_category", hours); continue; }
    const s = (byStage[stage] ||= { stage, hours: 0, overtimeHours: 0, entries: 0 });
    s.hours += hours; s.overtimeHours += ot; s.entries += 1;
    (employeesByStage[stage] ||= new Set()).add(e.employeeId);
    if (e.date) (datesByStage[stage] ||= []).push(e.date);
  }

  const stages = Object.values(byStage).map((s) => {
    const dates = datesByStage[s.stage] || [];
    const first = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
    const last = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
    const elapsedWorkingDays = first && last ? workingDaysBetween(first, last, nonWork) : 0;
    const elapsedCalendarDays = first && last ? calendarDaysBetween(first, last) : 0;
    const crewDays = round1(s.hours / (hoursPerDay || 8));
    return {
      stage: s.stage,
      hours: round1(s.hours),
      overtimeHours: round1(s.overtimeHours),
      employeeCount: (employeesByStage[s.stage] || new Set()).size,
      firstDate: first,
      lastDate: last,
      elapsedWorkingDays,          // productive-vs-elapsed: elapsed side
      elapsedCalendarDays,
      crewDays,                    // productive side (hours ÷ hoursPerDay)
      productionRate: elapsedWorkingDays > 0 ? round1(s.hours / elapsedWorkingDays) : null, // hrs/working-day
    };
  }).sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage));

  // Observed inter-stage gaps: working days strictly between one worked stage's last date and
  // the next worked stage's first date. NOT asserted as a required dependency — a labelled
  // observed allowance (see scheduleIntelligence gap-medians).
  const gaps = [];
  for (let i = 1; i < stages.length; i++) {
    const prev = stages[i - 1], cur = stages[i];
    const gap = (prev.lastDate && cur.firstDate)
      ? Math.max(0, workingDaysBetween(prev.lastDate, cur.firstDate, nonWork) - 2)
      : 0;
    gaps.push({ fromStage: prev.stage, toStage: cur.stage, gapWorkingDays: gap });
  }

  return {
    stages,
    gaps,
    excluded,
    totalHours: round1(stages.reduce((a, s) => a + s.hours, 0)),
    totalCrewDays: round1(stages.reduce((a, s) => a + s.crewDays, 0)),
    firstDate: stages.reduce((m, s) => (s.firstDate && (!m || s.firstDate < m) ? s.firstDate : m), null),
    lastDate: stages.reduce((m, s) => (s.lastDate && (!m || s.lastDate > m) ? s.lastDate : m), null),
    distinctEmployees: new Set(Object.values(employeesByStage).flatMap((set) => [...set])).size,
  };
}
