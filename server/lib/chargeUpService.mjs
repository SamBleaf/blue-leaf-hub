// =============================================================================
// Charge Up service — rolls approved timesheet entries up to per-SITE + per-PERSON
// hours + cost + charge-out $, for invoicing BLB Charge Up work by location.
// Pure (no Supabase) so it's unit-testable, like stageAggregation.mjs. The route
// fetches the approved entries + the per-employee charge-up rate and passes them in.
//
// entry shape: { chargeUpJobId, employeeId, employeeName, hours, cost, date, notes, entryId }
//   chargeUpJobId null → untagged charge-up hours (roll up to the category, no site)
//   cost = timesheet_entries.cost_amount (pay-derived, booked at approval)
//   date/notes/entryId → the per-shift detail surfaced when a site is expanded
// charge-out $: when the site has a TARGET GROSS MARGIN set (Phase 2, marginBySite) it's derived
//   from the wage cost — cost ÷ (1 − margin/100) — so the realised gross margin equals the number
//   set; otherwise it's hours × the employee's charge_up_hourly (billable, from the cost model).
// =============================================================================

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

// Charge-out from a target gross margin: charge = cost ÷ (1 − margin%/100) so gross margin
// (charge − cost)/charge == margin. marginPct is a percentage in [0, 100).
export function chargeOutFromMargin(cost, marginPct) {
  const c = Number(cost) || 0;
  const denom = 1 - (Number(marginPct) || 0) / 100;
  return denom > 0 ? c / denom : 0;
}

// marginBySite: { [chargeUpJobId]: targetGrossMarginPct } — a per-site target gross margin that
// prices the site off its wage cost (Phase 2). Absent/null → each worker's charge_up_hourly.
export function rollupBySubJob(entries = [], chargeUpRateByEmployee = {}, marginBySite = {}) {
  const bySub = new Map();
  for (const e of entries) {
    const key = e.chargeUpJobId || null;
    const hours = Number(e.hours) || 0;
    if (hours <= 0 && !e.cost) continue;
    const cost = Number(e.cost) || 0;
    const margin = key != null ? marginBySite[key] : null;
    const chargeOut = margin != null
      ? chargeOutFromMargin(cost, margin)
      : hours * (Number(chargeUpRateByEmployee[e.employeeId]) || 0);
    if (!bySub.has(key)) bySub.set(key, { chargeUpJobId: key, hours: 0, cost: 0, chargeOut: 0, lastDate: null, _people: new Map(), _entries: [] });
    const s = bySub.get(key);
    s.hours += hours; s.cost += cost; s.chargeOut += chargeOut;
    if (e.date && (!s.lastDate || String(e.date) > String(s.lastDate))) s.lastDate = e.date;
    const pid = e.employeeId || "unknown";
    if (!s._people.has(pid)) s._people.set(pid, { employeeId: e.employeeId || null, name: e.employeeName || "Unknown", hours: 0, cost: 0, chargeOut: 0 });
    const p = s._people.get(pid);
    p.hours += hours; p.cost += cost; p.chargeOut += chargeOut;
    s._entries.push({ entryId: e.entryId || null, date: e.date || null, employeeName: e.employeeName || "Unknown", notes: e.notes || null, hours: round1(hours), cost: round2(cost), chargeOut: round2(chargeOut) });
  }
  return [...bySub.values()]
    .map((s) => ({
      chargeUpJobId: s.chargeUpJobId,
      hours: round1(s.hours), cost: round2(s.cost), chargeOut: round2(s.chargeOut),
      lastDate: s.lastDate,
      byPerson: [...s._people.values()]
        .map((p) => ({ ...p, hours: round1(p.hours), cost: round2(p.cost), chargeOut: round2(p.chargeOut) }))
        .sort((a, b) => b.hours - a.hours),
      entries: s._entries.sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))),
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
  return rollup.map((s) => ({
    ...s,
    cost: null,
    byPerson: s.byPerson.map((p) => ({ ...p, cost: null })),
    entries: (s.entries || []).map((en) => ({ ...en, cost: null })),
  }));
}

// AU financial year label for a YYYY-MM-DD date. The FY runs 1 Jul → 30 Jun and is
// labelled by its start year + the last two digits of the end year, e.g. "2025/26".
export function auFinancialYear(dateStr) {
  if (!dateStr) return null;
  const [y, m] = String(dateStr).split("-").map(Number);
  if (!y || !m) return null;
  const startYear = m >= 7 ? y : y - 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

// Roll charge-up entries up by AU financial year, WITH charge-out $ (which the older
// internal-cost-summary lacks). entry: { date, chargeUpJobId, employeeId, hours, cost }
// Uses the same precedence as rollupBySubJob — the site's target gross margin when set
// (marginBySite, priced off wage cost), else the employee's charge_up_hourly — so the FY
// charge-out totals reconcile with the category + per-site totals rather than contradicting them.
export function rollupByFinancialYear(entries = [], chargeUpRateByEmployee = {}, marginBySite = {}) {
  const byFy = new Map();
  for (const e of entries) {
    const fy = auFinancialYear(e.date);
    if (!fy) continue;
    const hours = Number(e.hours) || 0;
    const cost = Number(e.cost) || 0;
    const key = e.chargeUpJobId || null;
    const margin = key != null ? marginBySite[key] : null;
    const chargeOut = margin != null ? chargeOutFromMargin(cost, margin) : hours * (Number(chargeUpRateByEmployee[e.employeeId]) || 0);
    if (!byFy.has(fy)) byFy.set(fy, { fy, hours: 0, cost: 0, chargeOut: 0 });
    const f = byFy.get(fy);
    f.hours += hours; f.cost += cost; f.chargeOut += chargeOut;
  }
  return [...byFy.values()]
    .map((f) => ({ fy: f.fy, hours: round1(f.hours), cost: round2(f.cost), chargeOut: round2(f.chargeOut) }))
    .sort((a, b) => a.fy.localeCompare(b.fy));
}

// Planner site-choice validation for a charge-up allocation. Pure so the route stays
// declarative (no business rule in the handler). "Charge-up shifts always need a job
// address" — a shift on the BL-CHARGEUP category MUST name a site, but only once the
// category actually has active sites to choose from (else there's nothing to pick and
// we fail soft to untagged, same as the PWA log-hours guard).
//   isChargeUpJob : is the allocation's carpentry job the BL-CHARGEUP category?
//   activeSiteIds : ids of the category's active charge_up_jobs (empty if none/pre-mig)
//   chargeUpJobId : the site the caller picked (or null)
// → { chargeUpJobId }  (the value to store — null when not a charge-up allocation)
// → { error }          (reject: a required-but-missing or a not-a-member site)
export function validateChargeUpSite({ isChargeUpJob = false, activeSiteIds = [], chargeUpJobId = null } = {}) {
  if (!isChargeUpJob) return { chargeUpJobId: null };          // ordinary allocation — never tagged
  const active = new Set(activeSiteIds.filter(Boolean));
  if (!chargeUpJobId) {
    if (active.size === 0) return { chargeUpJobId: null };     // no sites yet → allow untagged
    return { error: "Pick a charge-up site for this shift." };
  }
  if (!active.has(chargeUpJobId)) return { error: "That charge-up site isn't part of this job." };
  return { chargeUpJobId };
}
