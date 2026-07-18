// =============================================================================
// Charge Up service — rolls approved timesheet entries up to per-SITE + per-PERSON
// hours + cost + charge-out $, for invoicing BLB Charge Up work by location.
// Pure (no Supabase) so it's unit-testable, like stageAggregation.mjs. The route
// fetches the approved entries + the per-employee charge-up rate and passes them in.
//
// entry shape: { chargeUpJobId, employeeId, employeeName, hours, cost }
//   chargeUpJobId null → untagged charge-up hours (roll up to the category, no site)
//   cost = timesheet_entries.cost_amount (pay-derived, booked at approval)
// charge-out $ = hours × the employee's charge_up_hourly (billable, from the cost model)
// =============================================================================

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

export function rollupBySubJob(entries = [], chargeUpRateByEmployee = {}) {
  const bySub = new Map();
  for (const e of entries) {
    const key = e.chargeUpJobId || null;
    const hours = Number(e.hours) || 0;
    if (hours <= 0 && !e.cost) continue;
    const cost = Number(e.cost) || 0;
    const rate = Number(chargeUpRateByEmployee[e.employeeId]) || 0;
    const chargeOut = hours * rate;
    if (!bySub.has(key)) bySub.set(key, { chargeUpJobId: key, hours: 0, cost: 0, chargeOut: 0, _people: new Map() });
    const s = bySub.get(key);
    s.hours += hours; s.cost += cost; s.chargeOut += chargeOut;
    const pid = e.employeeId || "unknown";
    if (!s._people.has(pid)) s._people.set(pid, { employeeId: e.employeeId || null, name: e.employeeName || "Unknown", hours: 0, cost: 0, chargeOut: 0 });
    const p = s._people.get(pid);
    p.hours += hours; p.cost += cost; p.chargeOut += chargeOut;
  }
  return [...bySub.values()]
    .map((s) => ({
      chargeUpJobId: s.chargeUpJobId,
      hours: round1(s.hours), cost: round2(s.cost), chargeOut: round2(s.chargeOut),
      byPerson: [...s._people.values()]
        .map((p) => ({ ...p, hours: round1(p.hours), cost: round2(p.cost), chargeOut: round2(p.chargeOut) }))
        .sort((a, b) => b.hours - a.hours),
    }))
    .sort((a, b) => b.chargeOut - a.chargeOut || b.hours - a.hours);
}

// Category totals across every site (incl. the untagged bucket) — the "cost against the
// whole category" figure, with hours + charge-out as the invoicing signal.
export function categoryTotals(rollup = []) {
  return rollup.reduce((t, s) => ({
    hours: round1(t.hours + s.hours),
    cost: round2(t.cost + (s.cost || 0)),
    chargeOut: round2(t.chargeOut + s.chargeOut),
    sites: t.sites + (s.chargeUpJobId ? 1 : 0),
  }), { hours: 0, cost: 0, chargeOut: 0, sites: 0 });
}

// Cost is pay-derived — null it for non-directors (charge-out $ stays; it's billable,
// not pay). Mirrors the director-gating in workforceRoutes.
export function stripCost(rollup = [], isDirector = false) {
  if (isDirector) return rollup;
  return rollup.map((s) => ({ ...s, cost: null, byPerson: s.byPerson.map((p) => ({ ...p, cost: null })) }));
}
