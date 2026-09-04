// =============================================================================
// Internal category service — the cost-only sibling of chargeUpService.mjs.
//
// BL-INTERNAL swallows every non-site hour; this layer splits it into six seeded
// categories (mig 200) on the Charge Up backbone, re-purposed COST-ONLY: no
// charge-out, no margin, no invoice. Two cost sources:
//   • timesheet (worked)  → ATEC / trade school, Logistics, Personal work — valued at
//                           the booked timesheet_entries.cost_amount, tagged internal_category_id.
//   • leave   (derived)   → Annual leave, Sick leave, RDO — DERIVED at report time from
//                           the leave/RDO spine (see deriveLeaveCost); never worker-logged.
//
// Shape mirrors chargeUpService: pure rollup helpers (unit-testable, no Supabase) plus a
// thin DB layer the routes/report call. chargeOutFromMargin / validateChargeUpSite are
// deliberately DROPPED — internal is pure overhead cost, no billing dimension.
// =============================================================================
import { auFyQuarter, superGuaranteeForFy } from "./financialYear.mjs";

export const INTERNAL_REFERENCE = "BL-INTERNAL";
export const TABLE = "internal_categories";

// Match a missing table OR a missing column (internal_category_id before mig 200): PostgREST
// surfaces a select-list gap as a "schema cache" error, a filter/update gap reaches Postgres
// as raw 42703 "column ... does not exist" — cover both so every route fails soft
// (migrationPending) rather than 500ing pre-migration. Same guard as chargeUpRoutes.
export const isMissingTable = (e) =>
  /relation .* does not exist|column .* does not exist|could not find the (table|column)|schema cache/i.test(String(e?.message || e || ""));

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

// ── Pure rollup helpers (no Supabase — unit-testable) ────────────────────────

// Roll approved internal timesheet entries up per internal_category_id → { hours, cost } +
// per-person breakdown + per-shift detail. Cost-only sibling of chargeUpService.rollupBySubJob
// (no chargeOut / margin). internalCategoryId null → the __untagged bucket (hours logged before
// the category picker existed / office-entered without a tag), surfaced for retro-assign.
//   entry: { internalCategoryId, employeeId, employeeName, hours, cost, date, notes, entryId,
//            taskCategory, completionPhotoUrl }   (cost = timesheet_entries.cost_amount)
export function rollupEntriesByCategory(entries = []) {
  const byCat = new Map();
  for (const e of entries) {
    const key = e.internalCategoryId || null;
    const hours = Number(e.hours) || 0;
    if (hours <= 0 && !e.cost) continue;
    const cost = Number(e.cost) || 0;
    if (!byCat.has(key)) byCat.set(key, { internalCategoryId: key, hours: 0, cost: 0, lastDate: null, _people: new Map(), _entries: [] });
    const s = byCat.get(key);
    s.hours += hours; s.cost += cost;
    if (e.date && (!s.lastDate || String(e.date) > String(s.lastDate))) s.lastDate = e.date;
    const pid = e.employeeId || "unknown";
    if (!s._people.has(pid)) s._people.set(pid, { employeeId: e.employeeId || null, name: e.employeeName || "Unknown", hours: 0, cost: 0 });
    const p = s._people.get(pid);
    p.hours += hours; p.cost += cost;
    s._entries.push({ entryId: e.entryId || null, date: e.date || null, employeeName: e.employeeName || "Unknown", taskCategory: e.taskCategory || null, notes: e.notes || null, hours: round1(hours), cost: round2(cost), completionPhotoUrl: e.completionPhotoUrl || null });
  }
  return [...byCat.values()]
    .map((s) => ({
      internalCategoryId: s.internalCategoryId,
      hours: round1(s.hours), cost: round2(s.cost),
      lastDate: s.lastDate,
      byPerson: [...s._people.values()]
        .map((p) => ({ ...p, hours: round1(p.hours), cost: round2(p.cost) }))
        .sort((a, b) => b.hours - a.hours),
      entries: s._entries.sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))),
    }))
    .sort((a, b) => b.cost - a.cost || b.hours - a.hours);
}

// Totals across every category incl. the untagged bucket — the "cost against the whole
// BL-INTERNAL job" figure. Cost + hours only (no chargeOut). `categories` counts tagged buckets.
export function categoryTotals(rollup = []) {
  return rollup.reduce((t, s) => ({
    hours: round1(t.hours + s.hours),
    cost: round2(t.cost + (s.cost || 0)),
    categories: t.categories + (s.internalCategoryId ? 1 : 0),
  }), { hours: 0, cost: 0, categories: 0 });
}

// Cost is pay-derived — null it for non-directors (hours stay visible to supervisors).
// Mirrors chargeUpService.stripCost, minus the chargeOut column (internal has none).
export function stripCost(rollup = [], isDirector = false) {
  if (isDirector) return rollup;
  return rollup.map((s) => ({
    ...s,
    cost: null,
    byPerson: s.byPerson.map((p) => ({ ...p, cost: null })),
    entries: (s.entries || []).map((en) => ({ ...en, cost: null })),
  }));
}

// ── DB layer (thin — routes/report compose these) ────────────────────────────

// The single BL-INTERNAL standing carpentry job (mig 125). limit(1) keeps maybeSingle from
// throwing if an env ever seeded a duplicate. Returns null if the row/mig isn't present.
export async function getInternalJob(sb) {
  const { data, error } = await sb.from("carpentry_jobs")
    .select("id, reference, address").eq("reference", INTERNAL_REFERENCE).limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function listCategories(sb, jobId, { includeArchived = true } = {}) {
  let q = sb.from(TABLE).select("*").eq("carpentry_job_id", jobId);
  if (!includeArchived) q = q.eq("status", "active");
  const { data, error } = await q.order("sort_order").order("created_at");
  if (error) throw error;
  return data || [];
}

export async function getCategory(sb, id) {
  const { data, error } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data || null;
}

// Slug from a label for the (carpentry_job_id, slug) unique key. Ad-hoc categories are rare
// (the six seeded ones cover the design); a label collision surfaces as a friendly dup error.
function slugify(label) {
  return String(label || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || `cat_${Date.now()}`;
}

// Ad-hoc category create. Defaults to a worked (timesheet) category; a leave category needs a
// valid leave_type (validated by the route). sort_order = max+10 unless one is supplied.
export async function createCategory(sb, jobId, { categoryLabel, notes = null, sortOrder = null, costSource = "timesheet", leaveType = null } = {}) {
  const { data: existing } = await sb.from(TABLE).select("sort_order").eq("carpentry_job_id", jobId);
  const nextOrder = sortOrder != null ? Number(sortOrder) : (existing || []).reduce((m, r) => Math.max(m, r.sort_order || 0), 0) + 10;
  const { data, error } = await sb.from(TABLE).insert({
    carpentry_job_id: jobId,
    category_label: categoryLabel,
    slug: slugify(categoryLabel),
    cost_source: costSource,
    leave_type: costSource === "leave" ? leaveType : null,
    notes,
    sort_order: nextOrder,
  }).select("*").single();
  if (error) throw error;
  return data;
}

// Label / notes / sortOrder / status only — no margin, and cost_source/leave_type are
// identity (fixed at create, never re-typed, so the report join can't drift).
export async function updateCategory(sb, id, patch) {
  const { data, error } = await sb.from(TABLE).update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function archiveCategory(sb, id) {
  const { error } = await sb.from(TABLE).update({ status: "archived" }).eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(sb, id) {
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

// Worked (timesheet-sourced) rollup for BL-INTERNAL: sum approved timesheet_entries.cost_amount
// grouped by internal_category_id, plus the __untagged bucket. Optional `fy` ("2025-26") narrows
// to one AU financial year. Leave categories never appear here — they're derived (deriveLeaveCost).
// Returns { rollup, categoryTotals }; empty when the mig/job isn't present.
export async function rollupWorkedByCategory(sb, { fy = null } = {}) {
  const job = await getInternalJob(sb);
  if (!job) return { rollup: [], categoryTotals: categoryTotals([]) };
  const { data: ts } = await sb.from("timesheets").select("id, date").eq("carpentry_job_id", job.id).eq("status", "approved");
  const tsIds = (ts || []).map((t) => t.id);
  const dateByTs = new Map((ts || []).map((t) => [t.id, t.date]));
  let entries = [];
  if (tsIds.length) {
    const { data, error } = await sb.from("timesheet_entries")
      .select("id, timesheet_id, employee_id, internal_category_id, hours, cost_amount, notes, task_category, completion_photo_url")
      .in("timesheet_id", tsIds);
    if (error) throw error;   // internal_category_id column missing → caller maps to migrationPending
    entries = data || [];
  }
  const empIds = [...new Set(entries.map((e) => e.employee_id).filter(Boolean))];
  const { data: emps } = empIds.length ? await sb.from("employees").select("id, name").in("id", empIds) : { data: [] };
  const nameById = new Map((emps || []).map((e) => [e.id, e.name]));
  let input = entries.map((e) => ({
    internalCategoryId: e.internal_category_id, employeeId: e.employee_id,
    employeeName: nameById.get(e.employee_id) || "Unknown",
    hours: e.hours, cost: e.cost_amount, date: dateByTs.get(e.timesheet_id) || null,
    notes: e.notes || null, entryId: e.id, taskCategory: e.task_category || null, completionPhotoUrl: e.completion_photo_url || null,
  }));
  if (fy) input = input.filter((e) => e.date && auFyQuarter(e.date).fy === fy);
  const rollup = rollupEntriesByCategory(input);
  return { rollup, categoryTotals: categoryTotals(rollup) };
}

// ── Derived-leave cost — PHASE 3 (see plan §5.2 / §5.3 / §7) ─────────────────
//
// Costs the three leave categories (Annual / Sick / RDO) on the SAME category × FY × quarter
// axis as the worked rollup, WITHOUT ever writing a timesheet row. Split into a PURE core
// (computeLeaveCost — unit-testable, no Supabase) and a thin DB wrapper (deriveLeaveCost).
//
// LOCKED cost formulas (§5.3 rule 4 — money-critical, do not re-derive):
//   RDO    = hours × break_even_hourly            (super already inside true/break-even — NEVER re-add)
//   Annual = hours × base_hourly × 1.175 × (1+SG) (base + 17.5% AL loading + employer super; excl. travel)
//   Sick   = hours × base_hourly × (1+SG)         (base + super; no loading, no travel)
//   Unpaid = $0 (present but zero-cost — visible, never dropped)
// SG = superGuaranteeForFy(fy of each date). hours = row.hours ?? per-employee standard day
// (fallback 7.6). A null base/break-even rate (terminated/archived employee) flags the row
// rate_missing rather than silently costing $0.

const LEAVE_FALLBACK_LABEL = { annual: "Annual leave", sick: "Sick leave", rdo: "RDO", unpaid: "Unpaid" };
const MS_DAY = 86400000, MS_WEEK = 7 * MS_DAY;
const ymdUTC = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const weekIndex = (d) => Math.floor((d.getTime() - Date.UTC(2024, 0, 1)) / MS_WEEK); // weeks since a Monday epoch (matches the /non-working-days feed)

// Build leave_type → { id, label } from the internal_categories rows (accepts snake or camel).
function leaveCategoryIndex(categories = []) {
  const idx = {};
  for (const c of categories) {
    const lt = c.leaveType ?? c.leave_type;
    const src = c.costSource ?? c.cost_source;
    if (!lt || (src && src !== "leave")) continue;
    idx[lt] = { id: c.id ?? null, label: c.categoryLabel ?? c.category_label ?? LEAVE_FALLBACK_LABEL[lt] ?? lt };
  }
  return idx;
}

// The per-day cost RATE for a leave type given a normalised rate row + the FY's SG.
// Returns { rate, rateMissing }. base wage = base_hourly, falling back to employees.hourly_rate.
function leaveDayRate(leaveType, rate, sg) {
  if (leaveType === "unpaid") return { rate: 0, rateMissing: false };
  if (leaveType === "rdo") {
    const be = rate?.breakEvenHourly ?? rate?.trueHourly;
    return be != null ? { rate: Number(be), rateMissing: false } : { rate: 0, rateMissing: true };
  }
  // annual / sick — base wage (excl. travel) + employer super; annual also carries the 17.5% loading.
  const base = rate?.baseHourly ?? rate?.hourlyRate;
  if (base == null) return { rate: 0, rateMissing: true };
  const loading = leaveType === "annual" ? 1.175 : 1;
  return { rate: Number(base) * loading * (1 + sg), rateMissing: false };
}

// PURE leave-cost engine. Takes the RAW rows the /non-working-days feed unions, does the
// fan-out / pattern-expansion / PH-subtraction / dedup itself, and aggregates cost by
// category × FY × quarter. No Supabase — feed it fixtures to unit-test.
//
//   perEmployeeRows : [{ employeeId, date, leaveType, hours }]   (hours null → standard day)
//   teamRdoDates    : [{ date }]                                  (fanned across activeEmployees, typed 'rdo')
//   patterns        : [{ employeeId, intervalWeeks, weekday, anchorDate }]  (expanded over [from,to], typed 'rdo')
//   publicHolidays  : ["YYYY-MM-DD", ...]                         (subtracted from the leave set)
//   activeEmployees : [{ id }]                                    (fan-out target for team RDO)
//   ratesById       : { empId: { baseHourly, trueHourly, breakEvenHourly, hourlyRate } }
//   categories      : internal_categories rows (leave_type → id/label)
//   standardHoursById / defaultStandardHours : per-day hours when a row carries none
//
// Priority on collision (same employee + date): an explicit per-employee row wins over team
// RDO, which wins over a pattern — so a day is costed once, with its explicit type/hours.
// Returns { rows, days } — rows aggregated (category × fy × quarter), days = costed per-day detail.
export function computeLeaveCost({
  perEmployeeRows = [], teamRdoDates = [], patterns = [], publicHolidays = [],
  activeEmployees = [], ratesById = {}, categories = [],
  standardHoursById = {}, defaultStandardHours = 7.6, from = null, to = null,
} = {}) {
  const catIdx = leaveCategoryIndex(categories);
  const phSet = new Set((publicHolidays || []).map((h) => (typeof h === "string" ? h : h?.date)).filter(Boolean));
  const stdHours = (empId) => Number(standardHoursById[empId] ?? defaultStandardHours) || 0;

  // 1) Union the three sources into one day-per-(employee,date) map, honouring priority.
  const dayByKey = new Map();
  const put = (employeeId, date, leaveType, hours) => {
    if (!employeeId || !date) return;
    const key = `${employeeId}|${date}`;
    if (dayByKey.has(key)) return; // earlier (higher-priority) source already claimed this day
    dayByKey.set(key, { employeeId, date, leaveType: leaveType || "rdo", hours: hours == null ? null : Number(hours) });
  };
  // a) explicit per-employee rows (highest priority — carry leave_type + hours)
  for (const r of perEmployeeRows) put(r.employeeId ?? r.employee_id, r.date ?? r.rdo_date, r.leaveType ?? r.leave_type ?? "rdo", r.hours);
  // b) team RDO — fan out across active employees, typed 'rdo', full standard day
  for (const t of teamRdoDates) {
    const date = t.date ?? t.rdo_date;
    for (const e of activeEmployees) put(e.id ?? e.employeeId, date, "rdo", null);
  }
  // c) recurring RDO patterns — expanded over [from,to] (read-only, never materialised), typed 'rdo'
  if (from && to) {
    const start = new Date(`${from}T12:00:00Z`), end = new Date(`${to}T12:00:00Z`);
    for (const p of patterns) {
      const interval = Number(p.intervalWeeks ?? p.interval_weeks) || 1;
      const weekday = Number(p.weekday);
      const anchorWeek = weekIndex(new Date(`${p.anchorDate ?? p.anchor_date}T12:00:00Z`));
      for (let d = new Date(start); d <= end; d = new Date(d.getTime() + MS_DAY)) {
        if (d.getUTCDay() !== weekday) continue;
        if ((weekIndex(d) - anchorWeek) % interval === 0) put(p.employeeId ?? p.employee_id, ymdUTC(d), "rdo", null);
      }
    }
  }

  // 2) Cost each day (minus public holidays) and aggregate by category × fy × quarter.
  const days = [];
  const agg = new Map();
  for (const day of dayByKey.values()) {
    if (phSet.has(day.date)) continue; // §5.3 rule 3 — a PH is never also a costed leave day
    const { fy, q } = auFyQuarter(day.date);
    const sg = superGuaranteeForFy(fy);
    const hours = day.hours != null ? day.hours : stdHours(day.employeeId);
    const { rate, rateMissing } = leaveDayRate(day.leaveType, ratesById[day.employeeId], sg);
    const cost = rateMissing ? 0 : round2(hours * rate);
    const cat = catIdx[day.leaveType] || { id: null, label: LEAVE_FALLBACK_LABEL[day.leaveType] || day.leaveType };
    days.push({ employeeId: day.employeeId, date: day.date, leaveType: day.leaveType, fy, quarter: q, hours: round1(hours), cost, rateMissing });

    const key = `${day.leaveType}|${fy}|${q}`;
    if (!agg.has(key)) agg.set(key, { internalCategoryId: cat.id, leaveType: day.leaveType, categoryLabel: cat.label, fy, quarter: q, hours: 0, cost: 0, rateMissing: false, estimated: true });
    const a = agg.get(key);
    a.hours += hours; a.cost += cost; a.rateMissing = a.rateMissing || rateMissing;
  }

  const rows = [...agg.values()]
    .map((a) => ({ ...a, hours: round1(a.hours), cost: round2(a.cost) }))
    .sort((x, y) => x.fy.localeCompare(y.fy) || x.quarter - y.quarter || x.leaveType.localeCompare(y.leaveType));
  return { rows, days };
}

// DB wrapper — fetch the /non-working-days sources for [from,to] + rates, then delegate to the
// pure engine. Fails soft (empty) pre-migration (missing table/column). costModel = getCostModel(sb).
export async function deriveLeaveCost(sb, { from = null, to = null, costModel = null, categories = [] } = {}) {
  if (!from || !to) return { rows: [], days: [] };
  try {
    const [empRes, teamRes, patRes, holRes, activeRes, setRes] = await Promise.all([
      sb.from("workforce_employee_rdo_dates").select("employee_id, rdo_date, leave_type, hours").gte("rdo_date", from).lte("rdo_date", to),
      sb.from("workforce_team_rdo_dates").select("rdo_date").gte("rdo_date", from).lte("rdo_date", to),
      sb.from("workforce_rdo_patterns").select("employee_id, interval_weeks, weekday, anchor_date").eq("active", true),
      sb.from("workforce_public_holidays").select("holiday_date").gte("holiday_date", from).lte("holiday_date", to),
      sb.from("employees").select("id, hourly_rate").eq("is_active", true),
      sb.from("workforce_settings").select("standard_hours").limit(1).maybeSingle(),
    ]);
    // Any missing table/column pre-migration → treat leave as empty (worked rollup still works).
    for (const r of [empRes, teamRes, patRes, holRes, activeRes]) if (r?.error && isMissingTable(r.error)) return { rows: [], days: [] };

    const cm = costModel || {};
    const ratesById = {};
    for (const [id, r] of Object.entries(cm.ratesById || {})) {
      ratesById[id] = { baseHourly: r.base_hourly ?? null, trueHourly: r.true_hourly ?? null, breakEvenHourly: r.break_even_hourly ?? null };
    }
    // Base-wage fallback to employees.hourly_rate for annual/sick when no synced cost rate exists.
    for (const e of activeRes.data || []) {
      ratesById[e.id] = { ...(ratesById[e.id] || {}), hourlyRate: e.hourly_rate ?? null };
    }
    const defaultStandardHours = Number(setRes?.data?.standard_hours) || 7.6;

    return computeLeaveCost({
      perEmployeeRows: (empRes.data || []).map((r) => ({ employeeId: r.employee_id, date: r.rdo_date, leaveType: r.leave_type || "rdo", hours: r.hours })),
      teamRdoDates: (teamRes.data || []).map((r) => ({ date: r.rdo_date })),
      patterns: (patRes.data || []).map((p) => ({ employeeId: p.employee_id, intervalWeeks: p.interval_weeks, weekday: p.weekday, anchorDate: p.anchor_date })),
      publicHolidays: (holRes.data || []).map((h) => h.holiday_date),
      activeEmployees: (activeRes.data || []).map((e) => ({ id: e.id })),
      ratesById, categories, defaultStandardHours, from, to,
    });
  } catch (e) {
    if (isMissingTable(e)) return { rows: [], days: [] };
    throw e;
  }
}
