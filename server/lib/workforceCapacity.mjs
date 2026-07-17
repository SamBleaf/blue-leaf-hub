// =============================================================================
// Workforce capacity (Workforce Pipeline v1) — supply vs demand, per period.
// Pure day-walk: available crew-days (active staff minus leave/RDO/holiday) vs
// committed (REAL workforce_allocations, carpentry + internal-labour ONLY — never a
// construction project's full span) vs forecast (the engine's remaining expected
// crew-days spread over each job's future window). A day is EITHER committed
// (already allocated) OR forecast, never both — dedup is at day granularity so
// demand is not double-counted.
//
// Inputs (route-supplied, already filtered):
//   employees   : [{ id, leaveDays?:Set<'YYYY-MM-DD'> }]  — active staff
//   allocations : [{ jobId, employeeId, date }]           — carpentry + internal only
//   forecasts   : [{ jobId, crewSize, remainingHours, expectedStart, expectedCompletion, hoursPerDay? }]
//   today       : 'YYYY-MM-DD' — demand before this is actuals/committed, never forecast
// =============================================================================
import { isWorkingDay, toYmd, parseYmd, periodKeyOf } from "./workingCalendar.mjs";

const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const maxYmd = (a, b) => (!a ? b : !b ? a : (a > b ? a : b));

export function computeCapacity({
  horizonStart, horizonEnd, periodType = "month",
  employees = [], allocations = [], forecasts = [],
  nonWork = {}, hoursPerDay = 8, today = null,
}) {
  if (!horizonStart || !horizonEnd || horizonEnd < horizonStart) return { periods: [], totals: emptyTotals() };

  // Allocation-day index: total count per day + per-job date set (for forecast dedup).
  const committedByDay = new Map();
  const allocByJob = new Map();
  for (const a of allocations) {
    if (!a?.date) continue;
    committedByDay.set(a.date, (committedByDay.get(a.date) || 0) + 1);
    if (!allocByJob.has(a.jobId)) allocByJob.set(a.jobId, new Set());
    allocByJob.get(a.jobId).add(a.date);
  }

  // Spread each forecast's REMAINING crew-days evenly over its future working days,
  // excluding days already committed to that job.
  const forecastByDay = new Map();
  for (const f of forecasts) {
    const crew = f.crewSize > 0 ? f.crewSize : 1;
    const hpd = f.hoursPerDay || hoursPerDay;
    const remainingCrewDays = Math.max(0, (Number(f.remainingHours) || 0) / (crew * hpd));
    const windowStart = maxYmd(f.expectedStart, today);
    const windowEnd = f.expectedCompletion;
    if (!windowStart || !windowEnd || windowEnd < windowStart || remainingCrewDays <= 0) continue;
    const allocDates = allocByJob.get(f.jobId) || new Set();
    const days = [];
    for (const cur = parseYmd(windowStart), e = parseYmd(windowEnd); cur <= e; cur.setDate(cur.getDate() + 1)) {
      const y = toYmd(cur);
      if (!isWorkingDay(y, nonWork) || allocDates.has(y)) continue;
      days.push(y);
    }
    if (!days.length) continue;
    const perDay = remainingCrewDays / days.length;
    for (const y of days) forecastByDay.set(y, (forecastByDay.get(y) || 0) + perDay);
  }

  // Day-walk the horizon, tallying into period buckets.
  const buckets = new Map();
  for (const cur = parseYmd(horizonStart), end = parseYmd(horizonEnd); cur <= end; cur.setDate(cur.getDate() + 1)) {
    const ymd = toYmd(cur);
    if (!isWorkingDay(ymd, nonWork)) continue;
    const key = periodKeyOf(ymd, periodType);
    let b = buckets.get(key);
    if (!b) { b = { periodStart: ymd, periodType, availableCrewDays: 0, committedCrewDays: 0, forecastCrewDays: 0 }; buckets.set(key, b); }
    if (ymd < b.periodStart) b.periodStart = ymd;
    b.availableCrewDays += employees.reduce((n, e) => n + (e.leaveDays && e.leaveDays.has(ymd) ? 0 : 1), 0);
    b.committedCrewDays += committedByDay.get(ymd) || 0;
    b.forecastCrewDays += forecastByDay.get(ymd) || 0;
  }

  const periods = [...buckets.values()]
    .sort((a, b) => (a.periodStart < b.periodStart ? -1 : 1))
    .map((b) => {
      const available = round1(b.availableCrewDays);
      const committed = round1(b.committedCrewDays);
      const forecast = round1(b.forecastCrewDays);
      const demand = round1(committed + forecast);
      const spare = round1(available - demand);
      return {
        periodStart: b.periodStart, periodType,
        availableCrewDays: available, committedCrewDays: committed, forecastCrewDays: forecast,
        demandCrewDays: demand,
        spareCrewDays: spare > 0 ? spare : 0,
        overbookedCrewDays: spare < 0 ? round1(-spare) : 0,
        utilisationPct: available > 0 ? Math.round((demand / available) * 100) : null,
      };
    });

  return { periods, totals: rollup(periods) };
}

function rollup(periods) {
  const t = emptyTotals();
  for (const p of periods) {
    t.availableCrewDays = round1(t.availableCrewDays + p.availableCrewDays);
    t.committedCrewDays = round1(t.committedCrewDays + p.committedCrewDays);
    t.forecastCrewDays = round1(t.forecastCrewDays + p.forecastCrewDays);
    t.demandCrewDays = round1(t.demandCrewDays + p.demandCrewDays);
    t.spareCrewDays = round1(t.spareCrewDays + p.spareCrewDays);
    t.overbookedCrewDays = round1(t.overbookedCrewDays + p.overbookedCrewDays);
  }
  t.utilisationPct = t.availableCrewDays > 0 ? Math.round((t.demandCrewDays / t.availableCrewDays) * 100) : null;
  t.overbookedPeriods = periods.filter((p) => p.overbookedCrewDays > 0).length;
  return t;
}
function emptyTotals() {
  return { availableCrewDays: 0, committedCrewDays: 0, forecastCrewDays: 0, demandCrewDays: 0, spareCrewDays: 0, overbookedCrewDays: 0, utilisationPct: null, overbookedPeriods: 0 };
}
