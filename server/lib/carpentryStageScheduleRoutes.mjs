// =============================================================================
// Carpentry stage-schedule routes (Phase 1/2). Composition only — the layout maths
// live in carpentryStageScheduleService.mjs. The single canonical store both the
// carpentry ScheduleTab and the Workforce Pipeline calendar read/write, so a date
// edit in either place syncs to the other. Fail-soft until migration 144 is applied.
//
//   GET   /api/carpentry/jobs/:id/stage-schedule        — stages (auto-seed / auto-heal)
//   POST  /api/carpentry/jobs/:id/stage-schedule/seed   — clean re-auto-layout, keeps locked
//   PATCH /api/carpentry/stage-schedule/:rowId          — move/resize/lock one stage
// =============================================================================
import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import { ok, err, rowsToCamel, rowToCamel } from "./apiResponse.mjs";
import { seedStageSchedule, subsectionsForStages } from "./carpentryStageScheduleService.mjs";
import { getCostModel } from "./costModelService.mjs";
import { stageLabel } from "./carpentryStages.mjs";

const TABLE = "carpentry_job_stage_schedule";
const isMissingTable = (e) => /relation .* does not exist|could not find the table|schema cache/i.test(String(e?.message || e || ""));

// Prefer the stored subsection label (budget-driven); fall back to the taxonomy label.
const withLabels = (rows) => rowsToCamel(rows).map((r) => ({ ...r, stageLabel: r.label || stageLabel(r.stageKey) }));

async function loadSeedInputs(sb, jobId) {
  const [{ data: job }, { data: lineItems }, { data: budgets }, cm] = await Promise.all([
    sb.from("carpentry_jobs").select("id, start_date, actual_start, crew_size_overrides").eq("id", jobId).maybeSingle(),
    sb.from("carpentry_budget_line_items").select("id, carpentry_job_budget_id, description, canonical_key, task_category, sell_ex_gst").eq("job_id", jobId),
    sb.from("carpentry_job_budgets").select("id, category_name, cost_type, budget_ex_gst, workforce_task_category").eq("job_id", jobId),
    getCostModel(sb).catch(() => null),
  ]);
  return { job, lineItems: lineItems || [], budgetSubsections: budgets || [], cm };
}

const crewSizesOf = (job) => (job?.crew_size_overrides && typeof job.crew_size_overrides === "object" ? job.crew_size_overrides : {});

// The stage rows this job SHOULD have right now (pure), given its budget + start + existing locks.
function computeDesired(inputs, existing) {
  const { job, lineItems, budgetSubsections, cm } = inputs;
  if (!job) return null;
  return seedStageSchedule({
    jobStartDate: job.start_date || job.actual_start || null,
    budgetSubsections, budgetLineItems: lineItems, cm,
    crewSizes: crewSizesOf(job),
    existing: existing || [],
  });
}

// Attach each stage's display-only budget subsections (derived; never persisted).
const withSubsections = (stages, subMap) => stages.map((s) => ({ ...s, subsections: subMap[s.stageKey] || [] }));

// Persist the desired set: upsert, then drop any stale unlocked rows no longer wanted
// (e.g. keys from a superseded seed). Returns the fresh rows.
async function persistDesired(sb, jobId, desired) {
  const payload = desired.map((r) => ({ carpentry_job_id: jobId, ...r }));
  const { error } = await sb.from(TABLE).upsert(payload, { onConflict: "carpentry_job_id,stage_key" });
  if (error) return { error };
  const keep = desired.map((r) => r.stage_key);
  if (keep.length) {
    await sb.from(TABLE).delete().eq("carpentry_job_id", jobId).eq("locked", false)
      .not("stage_key", "in", `(${keep.join(",")})`);
  }
  const { data, error: e2 } = await sb.from(TABLE).select("*").eq("carpentry_job_id", jobId).order("sort_order");
  if (e2) return { error: e2 };
  return { rows: data || [] };
}

const keySet = (rows) => new Set((rows || []).map((r) => r.stage_key));
const sameKeys = (a, b) => { const A = keySet(a), B = keySet(b); return A.size === B.size && [...A].every((k) => B.has(k)); };

export function registerCarpentryStageScheduleRoutes(app) {
  // GET — stages for a job; seed on empty + auto-heal when the stored keys drift from the
  // current budget (e.g. after a superseded seed, or the budget changed).
  app.get("/api/carpentry/jobs/:id/stage-schedule", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    const jobId = req.params.id;
    try {
      const { data: existing, error } = await sb.from(TABLE).select("*").eq("carpentry_job_id", jobId).order("sort_order");
      if (error) throw error;
      const inputs = await loadSeedInputs(sb, jobId);
      const desired = computeDesired(inputs, existing || []);
      if (desired === null) return err(res, 404, "Carpentry job not found", "NOT_FOUND");
      const subMap = subsectionsForStages(inputs.budgetSubsections, inputs.lineItems, inputs.cm, crewSizesOf(inputs.job));
      // Reseed if empty or the stage set drifted; otherwise keep the stored (possibly hand-moved) dates.
      if (!existing?.length || !sameKeys(existing, desired)) {
        const done = await persistDesired(sb, jobId, desired);
        if (done.error) throw done.error;
        return ok(res, { stages: withSubsections(withLabels(done.rows), subMap) });
      }
      ok(res, { stages: withSubsections(withLabels(existing), subMap) });
    } catch (e) {
      if (isMissingTable(e)) return ok(res, { stages: [], migrationPending: true });
      err(res, 500, "Could not load the stage schedule");
      console.error("[stage-schedule GET]", e?.message || e);
    }
  });

  // POST /seed — clean re-auto-layout from the job start + durations, keeping locked stages.
  app.post("/api/carpentry/jobs/:id/stage-schedule/seed", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    const jobId = req.params.id;
    try {
      const { data: existing } = await sb.from(TABLE).select("*").eq("carpentry_job_id", jobId);
      const inputs = await loadSeedInputs(sb, jobId);
      const desired = computeDesired(inputs, existing || []);
      if (desired === null) return err(res, 404, "Carpentry job not found", "NOT_FOUND");
      const done = await persistDesired(sb, jobId, desired);
      if (done.error) throw done.error;
      const subMap = subsectionsForStages(inputs.budgetSubsections, inputs.lineItems, inputs.cm, crewSizesOf(inputs.job));
      ok(res, { stages: withSubsections(withLabels(done.rows), subMap) });
    } catch (e) {
      if (isMissingTable(e)) return err(res, 503, "Stage schedule not enabled yet — apply migration 144", "MIGRATION_PENDING");
      err(res, 500, "Could not seed the stage schedule");
      console.error("[stage-schedule seed]", e?.message || e);
    }
  });

  // PATCH — move / resize / lock / annotate one stage. The two-way-sync write point.
  app.patch("/api/carpentry/stage-schedule/:rowId", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    const patch = {};
    if ("plannedStart" in req.body) patch.planned_start = req.body.plannedStart || null;
    if ("plannedEnd" in req.body) patch.planned_end = req.body.plannedEnd || null;
    if ("locked" in req.body) patch.locked = !!req.body.locked;
    if ("status" in req.body && ["planned", "in_progress", "complete"].includes(req.body.status)) patch.status = req.body.status;
    if ("notes" in req.body) patch.notes = req.body.notes || null;
    if ("dependsOn" in req.body && Array.isArray(req.body.dependsOn)) patch.depends_on = req.body.dependsOn;
    if (!Object.keys(patch).length) return err(res, 400, "No valid fields to update");
    if (patch.planned_start && patch.planned_end && patch.planned_end < patch.planned_start) {
      return err(res, 400, "Stage end cannot be before its start");
    }
    try {
      const { data, error } = await sb.from(TABLE).update(patch).eq("id", req.params.rowId).select("*").maybeSingle();
      if (error) throw error;
      if (!data) return err(res, 404, "Stage not found", "NOT_FOUND");
      ok(res, { stage: { ...rowToCamel(data), stageLabel: data.label || stageLabel(data.stage_key) } });
    } catch (e) {
      if (isMissingTable(e)) return err(res, 503, "Stage schedule not enabled yet — apply migration 144", "MIGRATION_PENDING");
      err(res, 500, "Could not update the stage");
      console.error("[stage-schedule PATCH]", e?.message || e);
    }
  });
}
