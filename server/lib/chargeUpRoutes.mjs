// =============================================================================
// BLB Charge Up routes — manage the site-level sub-jobs under the BL-CHARGEUP
// category + (P3) the per-site invoicing analytics. Composition only; the rollup
// maths live in chargeUpService.mjs. Fail-soft until migration 145 is applied.
//
//   GET    /api/carpentry/jobs/:id/charge-up-jobs   — list sites for the category
//   POST   /api/carpentry/jobs/:id/charge-up-jobs   — add a site
//   PATCH  /api/carpentry/charge-up-jobs/:id        — edit a site
//   DELETE /api/carpentry/charge-up-jobs/:id        — archive (soft) / ?hard=1 delete
// =============================================================================
import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import { ok, err, rowsToCamel, rowToCamel, translateDbError } from "./apiResponse.mjs";

const TABLE = "charge_up_jobs";
const isMissingTable = (e) => /relation .* does not exist|could not find the table|schema cache/i.test(String(e?.message || e || ""));

export function registerChargeUpRoutes(app) {
  // List the sites under a charge-up category.
  app.get("/api/carpentry/jobs/:id/charge-up-jobs", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    try {
      const { data, error } = await sb.from(TABLE).select("*")
        .eq("carpentry_job_id", req.params.id).order("sort_order").order("created_at");
      if (error) throw error;
      ok(res, { chargeUpJobs: rowsToCamel(data || []) });
    } catch (e) {
      if (isMissingTable(e)) return ok(res, { chargeUpJobs: [], migrationPending: true });
      err(res, 500, "Could not load the charge-up sites");
      console.error("[charge-up GET]", e?.message || e);
    }
  });

  // Add a site.
  app.post("/api/carpentry/jobs/:id/charge-up-jobs", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    const siteLabel = String(req.body?.siteLabel || "").trim();
    if (!siteLabel) return err(res, 400, "A site name is required");
    try {
      // next sort_order = max + 10
      const { data: existing } = await sb.from(TABLE).select("sort_order").eq("carpentry_job_id", req.params.id);
      const nextOrder = (existing || []).reduce((m, r) => Math.max(m, r.sort_order || 0), 0) + 10;
      const { data, error } = await sb.from(TABLE).insert({
        carpentry_job_id: req.params.id,
        site_label: siteLabel,
        address: req.body?.address || null,
        notes: req.body?.notes || null,
        sort_order: nextOrder,
      }).select("*").single();
      if (error) throw error;
      ok(res, { chargeUpJob: rowToCamel(data) });
    } catch (e) {
      if (isMissingTable(e)) return err(res, 503, "Charge-up sites not enabled yet — apply migration 145", "MIGRATION_PENDING");
      err(res, 500, translateDbError(e));
      console.error("[charge-up POST]", e?.message || e);
    }
  });

  // Edit a site.
  app.patch("/api/carpentry/charge-up-jobs/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    const patch = {};
    if ("siteLabel" in req.body) { const v = String(req.body.siteLabel || "").trim(); if (!v) return err(res, 400, "Site name cannot be empty"); patch.site_label = v; }
    if ("address" in req.body) patch.address = req.body.address || null;
    if ("notes" in req.body) patch.notes = req.body.notes || null;
    if ("sortOrder" in req.body) patch.sort_order = Number(req.body.sortOrder) || 0;
    if ("status" in req.body && ["active", "archived"].includes(req.body.status)) patch.status = req.body.status;
    if (!Object.keys(patch).length) return err(res, 400, "No valid fields to update");
    try {
      const { data, error } = await sb.from(TABLE).update(patch).eq("id", req.params.id).select("*").maybeSingle();
      if (error) throw error;
      if (!data) return err(res, 404, "Charge-up site not found", "NOT_FOUND");
      ok(res, { chargeUpJob: rowToCamel(data) });
    } catch (e) {
      if (isMissingTable(e)) return err(res, 503, "Charge-up sites not enabled yet — apply migration 145", "MIGRATION_PENDING");
      err(res, 500, translateDbError(e));
      console.error("[charge-up PATCH]", e?.message || e);
    }
  });

  // Archive (default) or hard-delete a site. Archive keeps its logged hours visible in
  // analytics; hard delete relies on ON DELETE SET NULL so hours are never orphaned.
  app.delete("/api/carpentry/charge-up-jobs/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    const hard = req.query.hard === "1" || req.query.hard === "true";
    try {
      if (hard) {
        const { error } = await sb.from(TABLE).delete().eq("id", req.params.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from(TABLE).update({ status: "archived" }).eq("id", req.params.id);
        if (error) throw error;
      }
      ok(res);
    } catch (e) {
      if (isMissingTable(e)) return err(res, 503, "Charge-up sites not enabled yet — apply migration 145", "MIGRATION_PENDING");
      err(res, 500, translateDbError(e));
      console.error("[charge-up DELETE]", e?.message || e);
    }
  });
}
