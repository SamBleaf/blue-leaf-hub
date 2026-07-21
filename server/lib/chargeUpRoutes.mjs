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
import { getCostModel } from "./costModelService.mjs";
import { rollupBySubJob, categoryTotals, stripCost, rollupByFinancialYear } from "./chargeUpService.mjs";

const TABLE = "charge_up_jobs";
// Match a missing table OR a missing column (charge_up_job_id before mig 145): PostgREST
// surfaces a select-list gap as a "schema cache" error, but a column referenced only in a
// filter/update reaches Postgres as raw 42703 "column ... does not exist" — cover both so
// every charge-up route fails soft (migrationPending) instead of 500ing pre-migration.
const isMissingTable = (e) => /relation .* does not exist|column .* does not exist|could not find the (table|column)|schema cache/i.test(String(e?.message || e || ""));

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

  // Per-site + per-person invoicing analytics: hours + charge-out $ (billable) + cost
  // (director-only) from approved timesheets, keyed by charge_up_job_id. Category total cost
  // = "cost against the whole category"; per-site hours/charge-out = the invoicing signal.
  app.get("/api/carpentry/jobs/:id/charge-up-summary", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    const jobId = req.params.id;
    const isDirector = req.caller?.role === "admin";
    try {
      const { data: ts } = await sb.from("timesheets").select("id, date").eq("carpentry_job_id", jobId).eq("status", "approved");
      const tsIds = (ts || []).map((t) => t.id);
      const dateByTs = new Map((ts || []).map((t) => [t.id, t.date]));
      let entries = [];
      if (tsIds.length) {
        const { data, error } = await sb.from("timesheet_entries")
          .select("id, timesheet_id, employee_id, charge_up_job_id, hours, cost_amount, notes").in("timesheet_id", tsIds);
        if (error) throw error;   // charge_up_job_id column missing → migrationPending
        entries = data || [];
      }
      // employee names + per-employee charge-up rate (from the cost model)
      const empIds = [...new Set(entries.map((e) => e.employee_id).filter(Boolean))];
      const { data: emps } = empIds.length ? await sb.from("employees").select("id, name").in("id", empIds) : { data: [] };
      const nameById = new Map((emps || []).map((e) => [e.id, e.name]));
      const cm = await getCostModel(sb).catch(() => null);
      const rateByEmp = {};
      if (cm?.ratesById) for (const [id, r] of Object.entries(cm.ratesById)) rateByEmp[id] = Number(r.charge_up_hourly) || 0;
      // select("*") so margin_pct (mig 150) is picked up when present, and its absence
      // pre-migration doesn't error — the per-site margin just stays off.
      const { data: sites } = await sb.from(TABLE).select("*").eq("carpentry_job_id", jobId);
      const siteById = new Map((sites || []).map((s) => [s.id, s]));
      const marginBySite = {};
      for (const s of sites || []) if (s.margin_pct != null) marginBySite[s.id] = Number(s.margin_pct);

      const input = entries.map((e) => ({
        chargeUpJobId: e.charge_up_job_id, employeeId: e.employee_id,
        employeeName: nameById.get(e.employee_id) || "Unknown",
        hours: e.hours, cost: e.cost_amount,
        date: dateByTs.get(e.timesheet_id) || null, notes: e.notes || null, entryId: e.id,
      }));
      const roll = stripCost(rollupBySubJob(input, rateByEmp, marginBySite), isDirector);
      const subJobs = roll.filter((s) => s.chargeUpJobId).map((s) => ({
        ...s,
        siteLabel: siteById.get(s.chargeUpJobId)?.site_label || "(deleted site)",
        address: siteById.get(s.chargeUpJobId)?.address || null,
        // margin reveals cost (cost = chargeOut × (1 − margin)), so only expose it to directors.
        marginPct: isDirector ? (siteById.get(s.chargeUpJobId)?.margin_pct ?? null) : null,
      }));
      const untagged = roll.find((s) => !s.chargeUpJobId) || null;
      // by-financial-year rollup WITH charge-out $ (the older internal-cost-summary has cost+hours only)
      const fyInput = entries.map((e) => ({ date: dateByTs.get(e.timesheet_id), chargeUpJobId: e.charge_up_job_id, employeeId: e.employee_id, hours: e.hours, cost: e.cost_amount }));
      let byFy = rollupByFinancialYear(fyInput, rateByEmp, marginBySite);
      if (!isDirector) byFy = byFy.map((f) => ({ ...f, cost: null }));
      ok(res, { subJobs, untagged, byFy, categoryTotals: categoryTotals(roll), canViewCost: isDirector });
    } catch (e) {
      if (isMissingTable(e)) return ok(res, { subJobs: [], untagged: null, byFy: [], categoryTotals: { hours: 0, cost: 0, chargeOut: 0, sites: 0 }, migrationPending: true });
      err(res, 500, "Could not build the charge-up summary");
      console.error("[charge-up summary]", e?.message || e);
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
    // Per-site target gross margin (mig 150). "" / null → clear (fall back to each worker's
    // charge_up_hourly). Margin reveals cost, so it's director(admin)-only. Pre-migration the write
    // hits a missing column → caught as MIGRATION_PENDING.
    if ("marginPct" in req.body) {
      if (req.caller?.role !== "admin") return err(res, 403, "Only a director can set the charge-up margin", "FORBIDDEN");
      const raw = req.body.marginPct;
      if (raw === null || raw === "") patch.margin_pct = null;
      // Gross margin must be in [0, 100) — at 100% charge-out would be infinite.
      else { const n = Number(raw); if (!Number.isFinite(n) || n < 0 || n >= 100) return err(res, 400, "Margin must be between 0 and 99.99%"); patch.margin_pct = n; }
    }
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

  // ── Untagged hours (charge-up entries logged before/without a site) ──────────
  // List approved charge-up timesheet entries that have no site yet, so an admin can
  // assign them to a site retroactively (e.g. hours logged before the Location picker existed).
  app.get("/api/carpentry/jobs/:id/charge-up-untagged", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    const jobId = req.params.id;
    try {
      const { data: ts } = await sb.from("timesheets").select("id, date").eq("carpentry_job_id", jobId).eq("status", "approved");
      const tsIds = (ts || []).map((t) => t.id);
      const dateByTs = new Map((ts || []).map((t) => [t.id, t.date]));
      if (!tsIds.length) return ok(res, { untaggedEntries: [] });
      const { data: rows, error } = await sb.from("timesheet_entries")
        .select("id, timesheet_id, employee_id, hours, notes").in("timesheet_id", tsIds).is("charge_up_job_id", null);
      if (error) throw error;   // charge_up_job_id column missing → migrationPending
      const empIds = [...new Set((rows || []).map((r) => r.employee_id).filter(Boolean))];
      const { data: emps } = empIds.length ? await sb.from("employees").select("id, name").in("id", empIds) : { data: [] };
      const nameById = new Map((emps || []).map((e) => [e.id, e.name]));
      const untaggedEntries = (rows || [])
        .map((r) => ({ entryId: r.id, date: dateByTs.get(r.timesheet_id) || null, employeeName: nameById.get(r.employee_id) || "Unknown", hours: Number(r.hours) || 0, notes: r.notes || null }))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.employeeName.localeCompare(b.employeeName));
      ok(res, { untaggedEntries });
    } catch (e) {
      if (isMissingTable(e)) return ok(res, { untaggedEntries: [], migrationPending: true });
      err(res, 500, "Could not load untagged hours");
      console.error("[charge-up untagged]", e?.message || e);
    }
  });

  // Assign untagged entries to a site. Validates the site belongs to this job and that the
  // entries belong to this job's approved timesheets (so we never re-tag someone else's hours).
  app.post("/api/carpentry/jobs/:id/charge-up-assign", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    const jobId = req.params.id;
    const chargeUpJobId = req.body?.chargeUpJobId;
    const entryIds = Array.isArray(req.body?.entryIds) ? req.body.entryIds.filter(Boolean) : [];
    if (!chargeUpJobId) return err(res, 400, "Pick a site to assign to");
    if (!entryIds.length) return err(res, 400, "No hours selected");
    try {
      // site must belong to this job (any status — you can assign to an archived site's history)
      const { data: site } = await sb.from(TABLE).select("id").eq("id", chargeUpJobId).eq("carpentry_job_id", jobId).maybeSingle();
      if (!site) return err(res, 400, "That site isn't part of this job");
      // entries must belong to this job's approved timesheets
      const { data: ts } = await sb.from("timesheets").select("id").eq("carpentry_job_id", jobId).eq("status", "approved");
      const tsIds = (ts || []).map((t) => t.id);
      if (!tsIds.length) return err(res, 400, "No approved hours to assign");
      const { data: updated, error } = await sb.from("timesheet_entries")
        .update({ charge_up_job_id: chargeUpJobId }).in("id", entryIds).in("timesheet_id", tsIds).select("id");
      if (error) throw error;
      ok(res, { assigned: (updated || []).length });
    } catch (e) {
      if (isMissingTable(e)) return err(res, 503, "Charge-up sites not enabled yet — apply migration 145", "MIGRATION_PENDING");
      err(res, 500, translateDbError(e));
      console.error("[charge-up assign]", e?.message || e);
    }
  });
}
