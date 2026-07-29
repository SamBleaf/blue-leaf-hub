// carpentrySwmsRoutes.mjs
// Admin/supervisor endpoints for the carpentry Safety tab: the job's SWMS + the crew sign-on matrix,
// with zero-entry auto-seed from the job's project_type. Worker sign-on endpoints live in
// workforceRoutes.mjs (where workerAuth + admin "preview as worker" are in scope). SWMS content
// itself lives once in the shared swms_templates library.
import { ok, err, rowsToCamel, translateDbError } from "../apiResponse.mjs";
import { requireAuth, requireRole } from "../requireAuth.mjs";
import { getServiceSupabase } from "../supabaseService.mjs";
import { workCategoriesForProjectType } from "./carpentrySwmsMap.mjs";

/**
 * Attach every active SWMS whose work_category overlaps the job's project_type categories, if the job
 * has no SWMS attached yet. Idempotent + best-effort — returns the current template-id list.
 */
export async function ensureCarpentryJobSwms(sb, job) {
  let { data: links } = await sb.from("project_swms").select("swms_template_id").eq("carpentry_job_id", job.id);
  let autoSeeded = false;
  if (!links || links.length === 0) {
    const cats = workCategoriesForProjectType(job.project_type);
    const { data: tmpls } = await sb.from("swms_templates").select("id").eq("is_active", true).overlaps("work_category", cats);
    if (tmpls && tmpls.length) {
      const rows = tmpls.map((t) => ({ carpentry_job_id: job.id, swms_template_id: t.id, trade: "Carpentry" }));
      await sb.from("project_swms").insert(rows); // fast path (reconciled below, so its error is non-fatal)
      // RECONCILE: guarantee EVERY matched SWMS is attached. A batch insert that partially fails (e.g. a
      // concurrent first-open) must never silently drop a SWMS off a job — a missing SWMS is a WHS gap.
      const { data: have } = await sb.from("project_swms").select("swms_template_id").eq("carpentry_job_id", job.id);
      const haveIds = new Set((have || []).map((h) => h.swms_template_id));
      for (const r of rows) { if (!haveIds.has(r.swms_template_id)) await sb.from("project_swms").insert(r); }
      autoSeeded = true;
      ({ data: links } = await sb.from("project_swms").select("swms_template_id").eq("carpentry_job_id", job.id));
    }
  }
  return { templateIds: (links || []).map((l) => l.swms_template_id), autoSeeded };
}

export function registerCarpentrySwmsRoutes(app) {
  // The job's SWMS + the crew × SWMS sign-on matrix. Auto-seeds the SWMS set on first open.
  app.get("/api/carpentry/jobs/:jobId/swms", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const jobId = String(req.params.jobId);
    try {
      const { data: job } = await sb.from("carpentry_jobs")
        .select("id, reference, address, project_type").eq("id", jobId).maybeSingle();
      if (!job) return err(res, 404, "Job not found.");

      const { templateIds, autoSeeded } = await ensureCarpentryJobSwms(sb, job);

      let swms = [];
      if (templateIds.length) {
        const { data: t } = await sb.from("swms_templates").select("*").in("id", templateIds).order("title");
        swms = rowsToCamel(t || []);
      }
      // Expected crew = distinct active employees rostered to this job (Planner allocations).
      const { data: allocs } = await sb.from("workforce_allocations").select("employee_id").eq("carpentry_job_id", jobId);
      const empIds = [...new Set((allocs || []).map((a) => a.employee_id).filter(Boolean))];
      let crew = [];
      if (empIds.length) {
        const { data: emps } = await sb.from("employees").select("id, name").in("id", empIds).eq("is_active", true).order("name");
        crew = rowsToCamel(emps || []);
      }
      const { data: signons } = await sb.from("whs_swms_signon")
        .select("swms_template_id, swms_version, employee_id, signed_at").eq("carpentry_job_id", jobId);

      return ok(res, { swms, crew, signons: rowsToCamel(signons || []), autoSeeded });
    } catch (e) {
      return err(res, 500, translateDbError(e) || "Could not load the job's SWMS.");
    }
  });

  // Add or remove a SWMS from the job (by exception — the set is auto-seeded).
  app.post("/api/carpentry/jobs/:jobId/swms", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const jobId = String(req.params.jobId);
    const action = String(req.body?.action || "add").toLowerCase();
    const swmsTemplateId = String(req.body?.swmsTemplateId || "").trim();
    if (!swmsTemplateId) return err(res, 400, "swmsTemplateId required.");
    try {
      if (action === "remove") {
        await sb.from("project_swms").delete().eq("carpentry_job_id", jobId).eq("swms_template_id", swmsTemplateId);
        return ok(res, { removed: true });
      }
      const { error } = await sb.from("project_swms").insert({ carpentry_job_id: jobId, swms_template_id: swmsTemplateId, trade: "Carpentry" });
      if (error && !/duplicate|unique/i.test(String(error.message || ""))) return err(res, 500, translateDbError(error));
      return ok(res, { added: true });
    } catch (e) {
      return err(res, 500, translateDbError(e) || "Could not update the job's SWMS.");
    }
  });

  // ── SWMS library management (Settings → Modules → WHS / SWMS Library) ────────────────────────
  // The library is authored ONCE here and shared across every job. Standards-compliant (camelCase).
  app.get("/api/whs/swms-library", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    try {
      const { data, error } = await sb.from("swms_templates").select("*").order("trade").order("title");
      if (error) return err(res, 500, translateDbError(error));
      return ok(res, { templates: rowsToCamel(data || []) });
    } catch (e) {
      return err(res, 500, translateDbError(e) || "Could not load the SWMS library.");
    }
  });

  // Edit a SWMS. `bumpVersion:true` increments the version → every worker must re-sign (the sign-on
  // record is version-keyed), which is exactly how a revised SWMS should behave.
  app.patch("/api/whs/swms-library/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured.");
    const id = String(req.params.id);
    const b = req.body || {};
    const patch = {};
    if (typeof b.title === "string") patch.title = b.title.trim();
    if (typeof b.summary === "string") patch.summary = b.summary;
    if (typeof b.source === "string") patch.source = b.source;
    if (typeof b.contentHtml === "string") patch.content_html = b.contentHtml;
    if (typeof b.isHighRisk === "boolean") patch.is_high_risk = b.isHighRisk;
    if (typeof b.isActive === "boolean") patch.is_active = b.isActive;
    if (Array.isArray(b.workCategory)) patch.work_category = b.workCategory.map((c) => String(c));
    if (b.reviewStatus === "draft" || b.reviewStatus === "reviewed") patch.review_status = b.reviewStatus;
    try {
      if (b.bumpVersion === true) {
        const { data: cur } = await sb.from("swms_templates").select("version").eq("id", id).maybeSingle();
        if (!cur) return err(res, 404, "SWMS not found.");
        patch.version = (Number(cur.version) || 1) + 1;
      }
      if (Object.keys(patch).length === 0) return err(res, 400, "Nothing to update.");
      const { data, error } = await sb.from("swms_templates").update(patch).eq("id", id).select("*").single();
      if (error) return err(res, 500, translateDbError(error));
      return ok(res, { template: rowsToCamel([data])[0] });
    } catch (e) {
      return err(res, 500, translateDbError(e) || "Could not update the SWMS.");
    }
  });
}
