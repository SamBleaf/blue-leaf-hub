// =============================================================================
// Carpentry stage-schedule routes (Phase 1). Composition only — the layout maths
// live in carpentryStageScheduleService.mjs. The single canonical store both the
// carpentry ScheduleTab and the Workforce Pipeline calendar read/write, so a date
// edit in either place syncs to the other. Fail-soft until migration 144 is applied
// (returns migrationPending so the UI shows a gentle "apply 144" state, never a 500).
//
//   GET   /api/carpentry/jobs/:id/stage-schedule        — stages (auto-seed if empty)
//   POST  /api/carpentry/jobs/:id/stage-schedule/seed   — (re)auto-layout, keeps locked
//   PATCH /api/carpentry/stage-schedule/:rowId          — move/resize/lock one stage
// =============================================================================
import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import { ok, err, rowsToCamel, rowToCamel } from "./apiResponse.mjs";
import { seedStageSchedule } from "./carpentryStageScheduleService.mjs";
import { getCostModel } from "./costModelService.mjs";
import { stageLabel } from "./carpentryStages.mjs";

const TABLE = "carpentry_job_stage_schedule";
const isMissingTable = (e) => /relation .* does not exist|could not find the table|schema cache/i.test(String(e?.message || e || ""));

// Prefer the stored subsection label (budget-driven); fall back to the taxonomy label.
function withLabels(rows) {
  return rowsToCamel(rows).map((r) => ({ ...r, stageLabel: r.label || stageLabel(r.stageKey) }));
}

async function loadSeedInputs(sb, jobId) {
  const [{ data: job }, { data: lineItems }, { data: budgets }, cm] = await Promise.all([
    sb.from("carpentry_jobs").select("id, start_date, actual_start, crew_size_overrides").eq("id", jobId).maybeSingle(),
    sb.from("carpentry_budget_line_items").select("canonical_key, task_category").eq("job_id", jobId),
    sb.from("carpentry_job_budgets").select("category_name, cost_type, budget_ex_gst, workforce_task_category").eq("job_id", jobId),
    getCostModel(sb).catch(() => null),
  ]);
  return { job, lineItems: lineItems || [], budgetSubsections: budgets || [], cm };
}

// Compute the desired rows for a job and upsert them (preserving locked rows via the service).
async function seedAndPersist(sb, jobId, existing) {
  const { job, lineItems, budgetSubsections, cm } = await loadSeedInputs(sb, jobId);
  if (!job) return { error: "not_found" };
  const desired = seedStageSchedule({
    jobStartDate: job.start_date || job.actual_start || null,
    budgetSubsections,
    budgetLineItems: lineItems,
    cm,
    crewSizes: job.crew_size_overrides && typeof job.crew_size_overrides === "object" ? job.crew_size_overrides : {},
    existing: existing || [],
  });
  const payload = desired.map((r) => ({ carpentry_job_id: jobId, ...r }));
  const { data, error } = await sb.from(TABLE)
    .upsert(payload, { onConflict: "carpentry_job_id,stage_key" })
    .select("*");
  if (error) return { error };
  return { rows: data || [] };
}

export function registerCarpentryStageScheduleRoutes(app) {
  // GET — stages for a job; auto-seed on first read (empty).
  app.get("/api/carpentry/jobs/:id/stage-schedule", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    const jobId = req.params.id;
    try {
      const { data: existing, error } = await sb.from(TABLE).select("*").eq("carpentry_job_id", jobId).order("sort_order");
      if (error) throw error;
      if (existing && existing.length) return ok(res, { stages: withLabels(existing) });
      const seeded = await seedAndPersist(sb, jobId, existing);
      if (seeded.error === "not_found") return err(res, 404, "Carpentry job not found", "NOT_FOUND");
      if (seeded.error) throw seeded.error;
      ok(res, { stages: withLabels(seeded.rows) });
    } catch (e) {
      if (isMissingTable(e)) return ok(res, { stages: [], migrationPending: true });
      err(res, 500, "Could not load the stage schedule");
      console.error("[stage-schedule GET]", e?.message || e);
    }
  });

  // POST /seed — (re)auto-layout from the job start + durations, keeping locked stages.
  app.post("/api/carpentry/jobs/:id/stage-schedule/seed", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    const jobId = req.params.id;
    try {
      const { data: existing } = await sb.from(TABLE).select("*").eq("carpentry_job_id", jobId);
      const seeded = await seedAndPersist(sb, jobId, existing || []);
      if (seeded.error === "not_found") return err(res, 404, "Carpentry job not found", "NOT_FOUND");
      if (seeded.error) throw seeded.error;
      ok(res, { stages: withLabels(seeded.rows) });
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
      ok(res, { stage: { ...rowToCamel(data), stageLabel: stageLabel(data.stage_key) } });
    } catch (e) {
      if (isMissingTable(e)) return err(res, 503, "Stage schedule not enabled yet — apply migration 144", "MIGRATION_PENDING");
      err(res, 500, "Could not update the stage");
      console.error("[stage-schedule PATCH]", e?.message || e);
    }
  });
}
