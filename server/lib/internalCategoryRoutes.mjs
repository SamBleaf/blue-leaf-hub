// =============================================================================
// Internal category routes — CRUD + retro-assign for the cost-only sub-layer under
// BL-INTERNAL. Sibling of chargeUpRoutes.mjs; composition only, the rollup maths live
// in internalCategoryService.mjs. Fail-soft (migrationPending / 503) until mig 200 is applied.
//
//   GET    /api/carpentry/jobs/:id/internal-categories       — list categories for BL-INTERNAL
//   POST   /api/carpentry/jobs/:id/internal-categories       — add an ad-hoc category
//   PATCH  /api/carpentry/internal-categories/:id            — edit label/notes/sortOrder/status
//   DELETE /api/carpentry/internal-categories/:id            — archive (soft) / ?hard=1 delete
//   GET    /api/carpentry/internal-categories/:id/shifts     — per-category worked-shift detail
//   GET    /api/carpentry/jobs/:id/internal-untagged         — approved internal hours with no tag
//   POST   /api/carpentry/jobs/:id/internal-assign           — retro-assign untagged hours (worked only)
//
// COST-ONLY: no charge-out, no margin. The assign path rejects any leave-source target so a
// costed leave day can never be written into the timesheet ledger (plan §7 / critique B1).
// =============================================================================
import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import { ok, err, rowsToCamel, rowToCamel, translateDbError } from "./apiResponse.mjs";
import {
  TABLE, isMissingTable,
  listCategories, createCategory, updateCategory, getCategory, archiveCategory, deleteCategory,
  rollupEntriesByCategory, stripCost,
} from "./internalCategoryService.mjs";

const LEAVE_TYPES = ["annual", "sick", "rdo", "unpaid"];

export function registerInternalCategoryRoutes(app) {
  // List the categories under BL-INTERNAL (all statuses — the UI filters). camelCase out.
  app.get("/api/carpentry/jobs/:id/internal-categories", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    try {
      const rows = await listCategories(sb, req.params.id, { includeArchived: true });
      ok(res, { internalCategories: rowsToCamel(rows) });
    } catch (e) {
      if (isMissingTable(e)) return ok(res, { internalCategories: [], migrationPending: true });
      err(res, 500, "Could not load the internal categories");
      console.error("[internal-categories GET]", e?.message || e);
    }
  });

  // Add an ad-hoc category. Defaults to a worked (timesheet) category; a leave category needs a
  // valid leave_type. The six seeded categories (mig 200) are the default set — this is rare.
  app.post("/api/carpentry/jobs/:id/internal-categories", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    const categoryLabel = String(req.body?.categoryLabel || "").trim();
    if (!categoryLabel) return err(res, 400, "A category name is required");
    const costSource = req.body?.costSource === "leave" ? "leave" : "timesheet";
    const leaveType = costSource === "leave" ? (req.body?.leaveType || null) : null;
    if (costSource === "leave" && !LEAVE_TYPES.includes(leaveType)) return err(res, 400, "Pick a valid leave type for a leave category");
    try {
      const row = await createCategory(sb, req.params.id, { categoryLabel, notes: req.body?.notes || null, sortOrder: req.body?.sortOrder ?? null, costSource, leaveType });
      ok(res, { internalCategory: rowToCamel(row) });
    } catch (e) {
      if (isMissingTable(e)) return err(res, 503, "Internal categories not enabled yet — apply migration 200", "MIGRATION_PENDING");
      err(res, 500, translateDbError(e));
      console.error("[internal-categories POST]", e?.message || e);
    }
  });

  // Edit a category — label / notes / sort order / status only. No margin; cost_source and
  // leave_type are identity (fixed at create) so the report join can never drift.
  app.patch("/api/carpentry/internal-categories/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    const patch = {};
    if ("categoryLabel" in req.body) { const v = String(req.body.categoryLabel || "").trim(); if (!v) return err(res, 400, "Category name cannot be empty"); patch.category_label = v; }
    if ("notes" in req.body) patch.notes = req.body.notes || null;
    if ("sortOrder" in req.body) patch.sort_order = Number(req.body.sortOrder) || 0;
    if ("status" in req.body && ["active", "archived"].includes(req.body.status)) patch.status = req.body.status;
    if (!Object.keys(patch).length) return err(res, 400, "No valid fields to update");
    try {
      const row = await updateCategory(sb, req.params.id, patch);
      if (!row) return err(res, 404, "Internal category not found", "NOT_FOUND");
      ok(res, { internalCategory: rowToCamel(row) });
    } catch (e) {
      if (isMissingTable(e)) return err(res, 503, "Internal categories not enabled yet — apply migration 200", "MIGRATION_PENDING");
      err(res, 500, translateDbError(e));
      console.error("[internal-categories PATCH]", e?.message || e);
    }
  });

  // Archive (default, keeps history visible) or hard-delete (?hard=1). Leave categories are
  // soft-archive-only — they have no FK, so a hard delete would erase their historical report
  // line (plan §10 / critique F1); reject the hard delete of a leave category.
  app.delete("/api/carpentry/internal-categories/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    const hard = req.query.hard === "1" || req.query.hard === "true";
    try {
      if (hard) {
        const cat = await getCategory(sb, req.params.id);
        if (cat && cat.cost_source === "leave") return err(res, 400, "Leave categories can't be hard-deleted — archive it instead");
        await deleteCategory(sb, req.params.id);
      } else {
        await archiveCategory(sb, req.params.id);
      }
      ok(res);
    } catch (e) {
      if (isMissingTable(e)) return err(res, 503, "Internal categories not enabled yet — apply migration 200", "MIGRATION_PENDING");
      err(res, 500, translateDbError(e));
      console.error("[internal-categories DELETE]", e?.message || e);
    }
  });

  // Full per-category shift detail (lazy-loaded on category expand): every approved shift tagged
  // to this category (date, worker, task, description, hours, cost[director]). Cost-only — no
  // charge-out. A leave category has no tagged shifts (it's derived) → returns empty + derived:true.
  app.get("/api/carpentry/internal-categories/:id/shifts", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    const isDirector = req.caller?.role === "admin";
    try {
      const { data: cat, error: catErr } = await sb.from(TABLE).select("*").eq("id", req.params.id).maybeSingle();
      if (catErr) throw catErr;
      if (!cat) return err(res, 404, "Internal category not found", "NOT_FOUND");
      const baseCategory = { id: cat.id, categoryLabel: cat.category_label, notes: cat.notes || null, costSource: cat.cost_source, leaveType: cat.leave_type, status: cat.status };
      if (cat.cost_source === "leave") {
        return ok(res, { category: baseCategory, shifts: [], totals: { hours: 0, cost: isDirector ? 0 : null }, derived: true });
      }
      const { data: ts } = await sb.from("timesheets").select("id, date").eq("carpentry_job_id", cat.carpentry_job_id).eq("status", "approved");
      const tsIds = (ts || []).map((t) => t.id);
      const dateByTs = new Map((ts || []).map((t) => [t.id, t.date]));
      let entries = [];
      if (tsIds.length) {
        const { data, error } = await sb.from("timesheet_entries")
          .select("id, timesheet_id, employee_id, hours, cost_amount, notes, task_category, completion_photo_url")
          .in("timesheet_id", tsIds).eq("internal_category_id", cat.id);
        if (error) throw error;
        entries = data || [];
      }
      const empIds = [...new Set(entries.map((e) => e.employee_id).filter(Boolean))];
      const { data: emps } = empIds.length ? await sb.from("employees").select("id, name").in("id", empIds) : { data: [] };
      const nameById = new Map((emps || []).map((e) => [e.id, e.name]));
      const input = entries.map((e) => ({
        internalCategoryId: cat.id, employeeId: e.employee_id, employeeName: nameById.get(e.employee_id) || "Unknown",
        hours: e.hours, cost: e.cost_amount, date: dateByTs.get(e.timesheet_id) || null,
        notes: e.notes || null, entryId: e.id, taskCategory: e.task_category || null, completionPhotoUrl: e.completion_photo_url || null,
      }));
      const [rolled] = stripCost(rollupEntriesByCategory(input), isDirector);
      ok(res, {
        category: baseCategory,
        shifts: rolled?.entries || [],
        totals: { hours: rolled?.hours || 0, cost: rolled ? rolled.cost : (isDirector ? 0 : null) },
      });
    } catch (e) {
      if (isMissingTable(e)) return ok(res, { category: null, shifts: [], totals: null, migrationPending: true });
      err(res, 500, "Could not load the category's shifts");
      console.error("[internal-categories shifts]", e?.message || e);
    }
  });

  // Approved BL-INTERNAL timesheet entries with no category yet — so an admin can retro-assign
  // hours logged before the picker existed (or office-entered without a tag).
  app.get("/api/carpentry/jobs/:id/internal-untagged", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    const jobId = req.params.id;
    try {
      const { data: ts } = await sb.from("timesheets").select("id, date").eq("carpentry_job_id", jobId).eq("status", "approved");
      const tsIds = (ts || []).map((t) => t.id);
      const dateByTs = new Map((ts || []).map((t) => [t.id, t.date]));
      if (!tsIds.length) return ok(res, { untaggedEntries: [] });
      const { data: rows, error } = await sb.from("timesheet_entries")
        .select("id, timesheet_id, employee_id, hours, notes").in("timesheet_id", tsIds).is("internal_category_id", null);
      if (error) throw error;   // internal_category_id column missing → migrationPending
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
      console.error("[internal-untagged]", e?.message || e);
    }
  });

  // Retro-assign untagged entries to a category. The target MUST be a worked (timesheet-source)
  // category belonging to this job — a leave-source target is rejected (400) so costed leave can
  // never be written into the timesheet ledger (plan §7 / critique B1). Entries are constrained to
  // this job's approved timesheets so we never re-tag someone else's hours.
  app.post("/api/carpentry/jobs/:id/internal-assign", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    const jobId = req.params.id;
    const internalCategoryId = req.body?.internalCategoryId;
    const entryIds = Array.isArray(req.body?.entryIds) ? req.body.entryIds.filter(Boolean) : [];
    if (!internalCategoryId) return err(res, 400, "Pick a category to assign to");
    if (!entryIds.length) return err(res, 400, "No hours selected");
    try {
      const { data: cat } = await sb.from(TABLE).select("id, cost_source").eq("id", internalCategoryId).eq("carpentry_job_id", jobId).maybeSingle();
      if (!cat) return err(res, 400, "That category isn't part of this job");
      if (cat.cost_source !== "timesheet") return err(res, 400, "Leave categories are derived — you can't assign worked hours to them");
      const { data: ts } = await sb.from("timesheets").select("id").eq("carpentry_job_id", jobId).eq("status", "approved");
      const tsIds = (ts || []).map((t) => t.id);
      if (!tsIds.length) return err(res, 400, "No approved hours to assign");
      const { data: updated, error } = await sb.from("timesheet_entries")
        .update({ internal_category_id: internalCategoryId }).in("id", entryIds).in("timesheet_id", tsIds).select("id");
      if (error) throw error;
      ok(res, { assigned: (updated || []).length });
    } catch (e) {
      if (isMissingTable(e)) return err(res, 503, "Internal categories not enabled yet — apply migration 200", "MIGRATION_PENDING");
      err(res, 500, translateDbError(e));
      console.error("[internal-assign]", e?.message || e);
    }
  });
}
