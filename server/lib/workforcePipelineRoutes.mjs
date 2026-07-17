// =============================================================================
// Workforce Pipeline routes (v1) — API composition ONLY. No business math here:
// it fetches from confirmed schema, hands plain data to the pure services
// (workingCalendar / stageAggregation / scheduleIntelligence / workforceCapacity),
// and shapes the apiResponse. Every optional table is read fail-soft so a not-yet-
// applied migration degrades to empty context rather than a 500.
//
// Endpoints (admin/supervisor):
//   GET /api/workforce/pipeline?from&to&horizon         — full board (jobs + capacity)
//   GET /api/workforce/pipeline/forecast/:carpentryJobId — one job's full breakdown
// =============================================================================
import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import { ok, err } from "./apiResponse.mjs";
import { getCostModel } from "./costModelService.mjs";
import { addWorkingDays, workingDaysBetween } from "./workingCalendar.mjs";
import { aggregateStages } from "./stageAggregation.mjs";
import { resolveStage, stageLabel, TASKCAT_TO_STAGE } from "./carpentryStages.mjs";
import { forecastDuration, collateHistorical } from "./scheduleIntelligence.mjs";
import { computeCapacity } from "./workforceCapacity.mjs";
import { todayYmd, addDaysYmd } from "./dateYmd.mjs";

const CALC_VERSION = "wp-v1";
const HORIZON_DAYS = { week: 7, month: 31, quarter: 92, year: 366 };
const CAPACITY_BUCKET = { week: "week", month: "week", quarter: "month", year: "month" };
const ACTIVE_STATUSES = ["active", "on_hold", "defects"];
const CLOSED_HISTORY_CAP = 30;          // bound the historical pass (thin-N is expected)
const HISTORY_LOOKBACK_DAYS = 240;      // how far back to read timesheet actuals

async function safe(q) { try { const { data, error } = await q; return error ? [] : (data || []); } catch { return []; } }
const num = (v) => Number(v) || 0;
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

// ── Build plain stage-entries for a set of jobs from approved timesheets ──────
// Returns Map(jobId → [{ hours, overtimeHours, taskCategory, canonicalKey, date, employeeId }])
async function stageEntriesByJob(sb, jobIds, sinceYmd) {
  if (!jobIds.length) return new Map();
  const timesheets = await safe(
    sb.from("timesheets").select("id, date, employee_id, carpentry_job_id, status")
      .eq("status", "approved").in("carpentry_job_id", jobIds).gte("date", sinceYmd)
  );
  const tsById = new Map(timesheets.map((t) => [t.id, t]));
  const tsIds = timesheets.map((t) => t.id);
  const entries = tsIds.length
    ? await safe(sb.from("timesheet_entries").select("timesheet_id, task_category, hours, overtime_hours, budget_line_item_id").in("timesheet_id", tsIds))
    : [];
  // canonical_key per line item id
  const lineIds = [...new Set(entries.map((e) => e.budget_line_item_id).filter(Boolean))];
  const lineItems = lineIds.length
    ? await safe(sb.from("carpentry_budget_line_items").select("id, canonical_key").in("id", lineIds))
    : [];
  const canonById = new Map(lineItems.map((li) => [li.id, li.canonical_key]));

  const byJob = new Map();
  for (const e of entries) {
    const ts = tsById.get(e.timesheet_id);
    if (!ts?.carpentry_job_id) continue;
    const row = {
      hours: num(e.hours), overtimeHours: num(e.overtime_hours),
      taskCategory: e.task_category, canonicalKey: e.budget_line_item_id ? canonById.get(e.budget_line_item_id) : null,
      date: ts.date, employeeId: ts.employee_id,
    };
    if (!byJob.has(ts.carpentry_job_id)) byJob.set(ts.carpentry_job_id, []);
    byJob.get(ts.carpentry_job_id).push(row);
  }
  return byJob;
}

// ── Historical stage medians keyed by project_type (from CLOSED carpentry jobs) ─
async function historicalByProjectType(sb, nonWork, sinceYmd) {
  const closed = await safe(
    sb.from("carpentry_jobs").select("id, project_type").eq("status", "complete")
      .order("actual_end", { ascending: false }).limit(CLOSED_HISTORY_CAP)
  );
  if (!closed.length) return { byType: new Map(), sampled: 0, capped: false };
  const entriesByJob = await stageEntriesByJob(sb, closed.map((j) => j.id), sinceYmd);
  const aggsByType = new Map();
  for (const j of closed) {
    const rows = entriesByJob.get(j.id);
    if (!rows?.length) continue;
    const agg = aggregateStages({ entries: rows, nonWork });
    if (!agg.stages.length) continue;
    if (!aggsByType.has(j.project_type)) aggsByType.set(j.project_type, []);
    aggsByType.get(j.project_type).push(agg);
  }
  const byType = new Map();
  let sampled = 0;
  for (const [type, aggs] of aggsByType) { byType.set(type, collateHistorical(aggs)); sampled += aggs.length; }
  return { byType, sampled, capped: closed.length >= CLOSED_HISTORY_CAP };
}

function crewSizeFor(jobId, allocEmpByJob, overrides) {
  const distinct = allocEmpByJob.get(jobId);
  if (distinct && distinct.size > 0) return { crewSize: distinct.size, crewSizeSource: "allocations" };
  const vals = overrides && typeof overrides === "object" ? Object.values(overrides).map(Number).filter((n) => n > 0) : [];
  if (vals.length) return { crewSize: Math.max(...vals), crewSizeSource: "override" };
  return { crewSize: 3, crewSizeSource: "default" };
}

function includedStagesFor(items, budgets) {
  const set = new Set();
  for (const it of items) { const s = resolveStage({ canonicalKey: it.canonical_key, taskCategory: it.task_category }); if (s) set.add(s); }
  if (!set.size) for (const b of budgets) { if (b.cost_type === "labour") { const s = TASKCAT_TO_STAGE[b.workforce_task_category]; if (s) set.add(s); } }
  return [...set];
}

// ── The full board build (shared by both endpoints) ──────────────────────────
async function buildPipeline(sb, cm, { from, to, today, horizon }) {
  const histSince = addDaysYmd(today, -HISTORY_LOOKBACK_DAYS);

  // Non-working days (fail-soft): public holidays + team-wide RDO.
  const [holidayRows, teamRdoRows] = await Promise.all([
    safe(sb.from("workforce_public_holidays").select("holiday_date").gte("holiday_date", histSince).lte("holiday_date", to)),
    safe(sb.from("workforce_team_rdo_dates").select("rdo_date").gte("rdo_date", histSince).lte("rdo_date", to)),
  ]);
  const nonWork = {
    holidays: new Set(holidayRows.map((r) => r.holiday_date)),
    rdo: new Set(teamRdoRows.map((r) => r.rdo_date)),
  };

  // Active employees + per-employee RDO within the horizon (→ leaveDays).
  const [employeeRows, empRdoRows] = await Promise.all([
    safe(sb.from("employees").select("id").eq("is_active", true)),
    safe(sb.from("workforce_employee_rdo_dates").select("employee_id, rdo_date").gte("rdo_date", from).lte("rdo_date", to)),
  ]);
  const leaveByEmp = new Map();
  for (const r of empRdoRows) { if (!leaveByEmp.has(r.employee_id)) leaveByEmp.set(r.employee_id, new Set()); leaveByEmp.get(r.employee_id).add(r.rdo_date); }
  const employees = employeeRows.map((e) => ({ id: e.id, leaveDays: leaveByEmp.get(e.id) || null }));

  // Allocations in the horizon (every row = one internal crew-day; carpentry + construction).
  const allocRows = await safe(
    sb.from("workforce_allocations").select("allocation_date, employee_id, project_id, carpentry_job_id").gte("allocation_date", from).lte("allocation_date", to)
  );
  const allocations = allocRows.map((a) => ({ jobId: a.carpentry_job_id || a.project_id, employeeId: a.employee_id, date: a.allocation_date }));
  const allocEmpByJob = new Map();          // carpentry_job_id → Set(employee_id) for crew-size inference
  for (const a of allocRows) { if (!a.carpentry_job_id) continue; if (!allocEmpByJob.has(a.carpentry_job_id)) allocEmpByJob.set(a.carpentry_job_id, new Set()); allocEmpByJob.get(a.carpentry_job_id).add(a.employee_id); }

  // Carpentry jobs (active / on-hold / defects) — the pipeline rows.
  const jobs = await safe(
    sb.from("carpentry_jobs").select("id, address, reference, status, project_type, start_date, end_date, actual_start, actual_end, floor_area_m2, storey_count, crew_size_overrides")
      .in("status", ACTIVE_STATUSES).order("start_date", { ascending: true, nullsFirst: false })
  );
  const jobIds = jobs.map((j) => j.id);

  const [budgetRows, itemRows, entriesByJob, hist] = await Promise.all([
    jobIds.length ? safe(sb.from("carpentry_job_budgets").select("job_id, cost_type, budget_ex_gst, workforce_task_category").in("job_id", jobIds)) : [],
    jobIds.length ? safe(sb.from("carpentry_budget_line_items").select("job_id, canonical_key, task_category").in("job_id", jobIds)) : [],
    stageEntriesByJob(sb, jobIds, histSince),
    historicalByProjectType(sb, nonWork, histSince),
  ]);
  const budgetsByJob = groupBy(budgetRows, "job_id");
  const itemsByJob = groupBy(itemRows, "job_id");

  const forecastsForCapacity = [];
  const jobCards = jobs.map((job) => {
    const budgets = budgetsByJob.get(job.id) || [];
    const items = itemsByJob.get(job.id) || [];
    const labourSell = round1(budgets.filter((b) => b.cost_type === "labour").reduce((s, b) => s + num(b.budget_ex_gst), 0));
    const { crewSize, crewSizeSource } = crewSizeFor(job.id, allocEmpByJob, job.crew_size_overrides);
    const includedStages = includedStagesFor(items, budgets);
    const rows = entriesByJob.get(job.id) || [];
    const actuals = rows.length ? aggregateStages({ entries: rows, nonWork, hoursPerDay: cm?.hoursPerDay || 8 }) : null;
    const historical = hist.byType.get(job.project_type) || null;

    const forecast = forecastDuration({
      labourSell, crewSize, cm, hoursPerDay: cm?.hoursPerDay || 8, nonWork, actuals, historical, includedStages,
      plannedStartDate: job.start_date || job.actual_start || null,
    });
    if (labourSell > 0 || crewSizeSource !== "default") {
      forecastsForCapacity.push({ jobId: job.id, crewSize, remainingHours: forecast.remainingHours, expectedStart: forecast.expectedStart, expectedCompletion: forecast.expectedCompletion });
    }

    const be = forecast.breakEven;
    const deadlineDate = (forecast.expectedStart && be.available)
      ? addWorkingDays(forecast.expectedStart, Math.max(1, Math.ceil(be.breakEvenAllowanceDays)), nonWork) : null;

    return {
      id: job.id, kind: "carpentry",
      label: job.address || job.reference || "Carpentry job",
      projectType: job.project_type, status: job.status,
      floorAreaM2: job.floor_area_m2, storeyCount: job.storey_count,
      approvedWindow: { start: job.start_date || null, end: job.end_date || null },
      actualWindow: { start: job.actual_start || null, end: job.actual_end || null },
      forecast: {
        source: forecast.source, confidence: forecast.confidence, sampleSize: forecast.sampleSize,
        crewSize, crewSizeSource,
        expectedStart: forecast.expectedStart, expectedCompletion: forecast.expectedCompletion,
        expectedProductiveCrewDays: forecast.expectedProductiveCrewDays, expectedCalendarDays: forecast.expectedCalendarDays,
        expectedHours: forecast.expectedHours, consumedHours: forecast.consumedHours, remainingHours: forecast.remainingHours,
        productionRate: forecast.productionRate, percentComplete: forecast.percentComplete,
        assumptions: forecast.assumptions, explanation: forecast.explanation,
        calcVersion: CALC_VERSION,
      },
      breakEven: {
        available: be.available, labourSell,
        allowanceDays: be.breakEvenAllowanceDays, targetMarginDays: be.targetMarginDays,
        atMarginDays: be.atMarginDays, breakEvenDays: be.breakEvenDays,
        deadlineDate, marginRisk: forecast.marginRisk,
      },
      actual: actuals ? {
        consumedCrewDays: actuals.totalCrewDays,
        elapsedWorkingDays: workingDaysBetween(actuals.firstDate, actuals.lastDate, nonWork),
        firstDate: actuals.firstDate, lastDate: actuals.lastDate,
        productionRate: forecast.productionRate, percentComplete: forecast.percentComplete,
        distinctEmployees: actuals.distinctEmployees,
      } : null,
      stages: mergeStages(includedStages, actuals, historical),
      excludedHours: actuals ? actuals.excluded : { total: 0, byReason: {} },
    };
  });

  // Construction projects referenced by allocations = internal-labour context (NEVER full span).
  const constructionIds = [...new Set(allocRows.filter((a) => a.project_id && !a.carpentry_job_id).map((a) => a.project_id))];
  const projRows = constructionIds.length ? await safe(sb.from("projects").select("id, address").in("id", constructionIds)) : [];
  const projById = new Map(projRows.map((p) => [p.id, p]));
  const construction = constructionIds.map((pid) => {
    const dates = allocRows.filter((a) => a.project_id === pid).map((a) => a.allocation_date).sort();
    return { id: pid, kind: "construction", label: projById.get(pid)?.address || "Construction project", allocationSpan: { start: dates[0] || null, end: dates[dates.length - 1] || null } };
  });

  const capacity = computeCapacity({
    horizonStart: from, horizonEnd: to, periodType: CAPACITY_BUCKET[horizon] || "week",
    employees, allocations, forecasts: forecastsForCapacity, nonWork, today,
    hoursPerDay: cm?.hoursPerDay || 8,
  });

  return {
    jobs: jobCards,
    construction,
    capacity: capacity.periods,
    capacityTotals: capacity.totals,
    meta: {
      from, to, today, horizon,
      costModelSynced: !!cm,
      historicalJobsSampled: hist.sampled, historicalCapped: hist.capped,
      generatedAt: new Date().toISOString(), calcVersion: CALC_VERSION,
    },
  };
}

function mergeStages(includedStages, actuals, historical) {
  const keys = new Set(includedStages);
  (actuals?.stages || []).forEach((s) => keys.add(s.stage));
  const actualByStage = new Map((actuals?.stages || []).map((s) => [s.stage, s]));
  const gapByStage = new Map((actuals?.gaps || []).map((g) => [g.toStage, g.gapWorkingDays]));
  return [...keys].map((stage) => {
    const a = actualByStage.get(stage);
    return {
      stage, label: stageLabel(stage),
      actualHours: a ? a.hours : 0,
      forecastHours: historical?.expectedHoursByStage?.[stage] ?? null,
      first: a?.firstDate || null, last: a?.lastDate || null,
      gapBeforeWorkingDays: gapByStage.get(stage) ?? null,
      productionRate: a?.productionRate ?? null,
    };
  }).sort((x, y) => (x.first || "9999") < (y.first || "9999") ? -1 : 1);
}

function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); }
  return m;
}

function parseHorizon(q) {
  const horizon = ["week", "month", "quarter", "year"].includes(q.horizon) ? q.horizon : "month";
  const from = q.from || todayYmd();
  const to = q.to || addDaysYmd(from, HORIZON_DAYS[horizon]);
  return { horizon, from, to, today: todayYmd() };
}

export function registerWorkforcePipelineRoutes(app) {
  app.get("/api/workforce/pipeline", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    try {
      const cm = await getCostModel(sb);
      const board = await buildPipeline(sb, cm, parseHorizon(req.query));
      ok(res, board);
    } catch (e) {
      err(res, 500, "Could not build the workforce pipeline");
      console.error("[pipeline]", e?.message || e);
    }
  });

  app.get("/api/workforce/pipeline/forecast/:carpentryJobId", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    try {
      const cm = await getCostModel(sb);
      // Wide window so the job is included regardless of its start date.
      const params = { horizon: "year", from: addDaysYmd(todayYmd(), -HISTORY_LOOKBACK_DAYS), to: addDaysYmd(todayYmd(), HORIZON_DAYS.year), today: todayYmd() };
      const board = await buildPipeline(sb, cm, params);
      const job = board.jobs.find((j) => j.id === req.params.carpentryJobId);
      if (!job) return err(res, 404, "Carpentry job not found in the pipeline", "NOT_FOUND");
      ok(res, { job, meta: board.meta });
    } catch (e) {
      err(res, 500, "Could not build the job forecast");
      console.error("[pipeline/forecast]", e?.message || e);
    }
  });
}
