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
import { signSiteTaskPhotos, isUuid } from "./siteMedia.mjs";

// Task field validation — mirrors the job task POST so the SAME TasksPanel component works
// against a charge-up site (site_tasks re-keyed to charge_up_job_id, mig 151).
const TASK_PRIORITIES = ["urgent", "normal", "when_time_permits"];
const TASK_CATEGORIES = ["general", "defect", "safety", "materials", "inspection", "first_fix_framing", "cladding", "second_fix", "outdoor_works", "formwork_slab_prep", "site_labouring", "site_cleanup", "supervision"];
const TASK_CREATED_VIA = ["manual", "voice_note", "ai_extraction"];

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

  // Full per-site shift detail for the site-detail pop-up: the site's own fields + every approved
  // shift worked there (date, worker, task, description, hours, charge-out, cost[director],
  // completion photo). Charge-out is margin-priced exactly like the summary. Fetched lazily on open
  // so the (potentially photo-heavy) payload never loads with the main page.
  app.get("/api/carpentry/charge-up-jobs/:id/shifts", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    const isDirector = req.caller?.role === "admin";
    try {
      const { data: site, error: siteErr } = await sb.from(TABLE).select("*").eq("id", req.params.id).maybeSingle();
      if (siteErr) throw siteErr;
      if (!site) return err(res, 404, "Charge-up site not found", "NOT_FOUND");
      const { data: ts } = await sb.from("timesheets").select("id, date").eq("carpentry_job_id", site.carpentry_job_id).eq("status", "approved");
      const tsIds = (ts || []).map((t) => t.id);
      const dateByTs = new Map((ts || []).map((t) => [t.id, t.date]));
      let entries = [];
      if (tsIds.length) {
        const { data, error } = await sb.from("timesheet_entries")
          .select("id, timesheet_id, employee_id, hours, cost_amount, notes, task_category, completion_photo_url")
          .in("timesheet_id", tsIds).eq("charge_up_job_id", site.id);
        if (error) throw error;
        entries = data || [];
      }
      const empIds = [...new Set(entries.map((e) => e.employee_id).filter(Boolean))];
      const { data: emps } = empIds.length ? await sb.from("employees").select("id, name").in("id", empIds) : { data: [] };
      const nameById = new Map((emps || []).map((e) => [e.id, e.name]));
      const cm = await getCostModel(sb).catch(() => null);
      const rateByEmp = {};
      if (cm?.ratesById) for (const [id, r] of Object.entries(cm.ratesById)) rateByEmp[id] = Number(r.charge_up_hourly) || 0;
      const marginBySite = site.margin_pct != null ? { [site.id]: Number(site.margin_pct) } : {};
      const input = entries.map((e) => ({
        chargeUpJobId: site.id, employeeId: e.employee_id, employeeName: nameById.get(e.employee_id) || "Unknown",
        hours: e.hours, cost: e.cost_amount, date: dateByTs.get(e.timesheet_id) || null,
        notes: e.notes || null, entryId: e.id, taskCategory: e.task_category || null, completionPhotoUrl: e.completion_photo_url || null,
      }));
      const [rolled] = stripCost(rollupBySubJob(input, rateByEmp, marginBySite), isDirector);
      ok(res, {
        site: { id: site.id, siteLabel: site.site_label, address: site.address || null, notes: site.notes || null, status: site.status, marginPct: isDirector ? (site.margin_pct ?? null) : null },
        shifts: rolled?.entries || [],
        totals: { hours: rolled?.hours || 0, cost: rolled ? rolled.cost : (isDirector ? 0 : null), chargeOut: rolled?.chargeOut || 0 },
      });
    } catch (e) {
      if (isMissingTable(e)) return ok(res, { site: null, shifts: [], totals: null, migrationPending: true });
      err(res, 500, "Could not load the site's shifts");
      console.error("[charge-up shifts]", e?.message || e);
    }
  });

  // ── Per-site TASKS (site_tasks re-keyed to charge_up_job_id, mig 151) ────────
  // Same table + component as a real carpentry job; scoped to the site. Edits/deletes reuse the
  // existing id-scoped PATCH/DELETE /api/carpentry/tasks/:id. Owned by the SITE alone
  // (project_id + carpentry_job_id NULL — the mig-151 3-way one-owner rule) so they NEVER match a
  // parent-job reader (worker PWA task list, job Tasks tab, earned-value rollup) — no leak.
  app.get("/api/carpentry/charge-up-jobs/:id/tasks", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    try {
      const { data, error } = await sb.from("site_tasks")
        .select("*, assigned:employees!assigned_to(id, name), completer:employees!completed_by(id, name)")
        .eq("charge_up_job_id", req.params.id).neq("status", "wont_do")
        .order("sort_order").order("created_at");
      if (error) throw error;
      await signSiteTaskPhotos(sb, data || []);
      ok(res, { tasks: rowsToCamel(data || []) });
    } catch (e) {
      if (isMissingTable(e)) return ok(res, { tasks: [], migrationPending: true });
      err(res, 500, "Could not load the site's tasks");
      console.error("[charge-up tasks GET]", e?.message || e);
    }
  });

  app.post("/api/carpentry/charge-up-jobs/:id/tasks", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    try {
      if (!isUuid(req.params.id)) return err(res, 400, "Invalid site id");
      const { data: site } = await sb.from(TABLE).select("id").eq("id", req.params.id).maybeSingle();
      if (!site) return err(res, 404, "Charge-up site not found", "NOT_FOUND");
      const { title, description, priority = "normal", dueDate, category = "general", assignedTo, createdVia = "manual", taskAudience = "worker" } = req.body || {};
      if (!title?.trim()) return err(res, 400, "title is required");
      if (!["worker", "supervisor"].includes(taskAudience)) return err(res, 400, "Invalid taskAudience");
      if (!TASK_PRIORITIES.includes(priority)) return err(res, 400, "Invalid priority");
      if (!TASK_CATEGORIES.includes(category)) return err(res, 400, "Invalid category");
      if (!TASK_CREATED_VIA.includes(createdVia)) return err(res, 400, "Invalid createdVia");
      if (assignedTo && !isUuid(assignedTo)) return err(res, 400, "Invalid assignee");
      const row = {
        carpentry_job_id: null, charge_up_job_id: site.id, project_id: null,   // site-owned only (no parent → no leak)
        title: title.trim(), description: description?.trim() || null, priority, category,
        assigned_to: assignedTo || null, due_date: dueDate || null, created_by: req.caller.id,
        created_via: createdVia, status: "open", sort_order: 0,
        ...(taskAudience && taskAudience !== "worker" ? { task_audience: taskAudience } : {}),
      };
      const { data: task, error } = await sb.from("site_tasks").insert(row).select("*, employees!assigned_to(id, name)").single();
      if (error) throw error;
      ok(res, { task });
    } catch (e) {
      if (isMissingTable(e)) return err(res, 503, "Charge-up tasks not enabled yet — apply migration 151", "MIGRATION_PENDING");
      err(res, 500, translateDbError(e));
      console.error("[charge-up tasks POST]", e?.message || e);
    }
  });

  // ── Per-site SITE DIARY (carpentry_site_diary re-keyed to charge_up_job_id, mig 151) ──
  app.get("/api/carpentry/charge-up-jobs/:id/diary", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    try {
      const { data, error } = await sb.from("carpentry_site_diary").select("*")
        .eq("charge_up_job_id", req.params.id).order("entry_date", { ascending: false });
      if (error) throw error;
      ok(res, { entries: rowsToCamel(data || []) });
    } catch (e) {
      if (isMissingTable(e)) return ok(res, { entries: [], migrationPending: true });
      err(res, 500, "Could not load the site diary");
      console.error("[charge-up diary GET]", e?.message || e);
    }
  });

  app.post("/api/carpentry/charge-up-jobs/:id/diary", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Database not configured", "NO_DB");
    try {
      const { data: site } = await sb.from(TABLE).select("id").eq("id", req.params.id).maybeSingle();
      if (!site) return err(res, 404, "Charge-up site not found", "NOT_FOUND");
      const { entryDate, weather, tradesOnsite, workCompleted, issues, instructionsGiven, visitors, rawVoiceTranscript, structuredByAi = false, supervisor, photoPaths } = req.body || {};
      const { data: entry, error } = await sb.from("carpentry_site_diary").insert({
        job_id: null, charge_up_job_id: site.id,   // site-owned only (mig 151 drops diary job_id NOT NULL)
        entry_date: entryDate || new Date().toISOString().slice(0, 10),
        weather: weather || null, trades_onsite: Array.isArray(tradesOnsite) ? tradesOnsite : [],
        work_completed: workCompleted || null, issues: issues || null, instructions_given: instructionsGiven || null,
        visitors: visitors || null, raw_voice_transcript: rawVoiceTranscript || null, structured_by_ai: Boolean(structuredByAi),
        supervisor: supervisor || null, photo_paths: Array.isArray(photoPaths) ? photoPaths : [], created_at: new Date().toISOString(),
      }).select("*").single();
      if (error) throw error;
      ok(res, { entry: rowToCamel(entry) });
    } catch (e) {
      if (isMissingTable(e)) return err(res, 503, "Charge-up diary not enabled yet — apply migration 151", "MIGRATION_PENDING");
      err(res, 500, translateDbError(e));
      console.error("[charge-up diary POST]", e?.message || e);
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
