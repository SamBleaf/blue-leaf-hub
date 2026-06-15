import crypto from "crypto";
import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";
import { buildexactConfigured, createPurchaseOrder, createContact, getContacts, beList, beFetch } from "./buildexactClient.mjs";
import { pullBuildexactEstimate } from "./buildexactDeepIntegration.mjs";
import { normaliseAddress } from "./addressNormalise.mjs";

// ── Task metadata ─────────────────────────────────────────────────────────────

const TASK_PHASE_MAP = {
  first_fix_framing:    "frame",
  cladding:             "lock_up",
  second_fix:           "fitout",
  outdoor_works:        "completion",
  formwork_slab_prep:   "site_slab",
  site_labouring:       "general",
  site_cleanup:         "general",
  supervision:          "general",
  other:                "general",
};

export const TASK_LABELS = {
  first_fix_framing:    "First fix / framing",
  cladding:             "Cladding",
  second_fix:           "Second fix",
  outdoor_works:        "Outdoor works",
  formwork_slab_prep:   "Formwork / slab prep",
  site_labouring:       "Site labouring",
  site_cleanup:         "Site cleanup",
  supervision:          "Supervision",
  other:                "Other",
};

const TASK_CATEGORIES = Object.keys(TASK_LABELS);

// ── Cost helpers ──────────────────────────────────────────────────────────────

// Split a day's hours into three pay bands:
//   regular   — up to overtime_threshold (paid at base rate)
//   overtime  — between overtime_threshold and double_time_threshold (overtime_multiplier)
//   doubletime — above double_time_threshold (double_time_multiplier)
// A missing/invalid threshold means that band simply never applies (treated as Infinity).
function splitOvertimeHours(totalHours, settings) {
  const hours = Number(totalHours) || 0;
  const otRaw = Number(settings?.overtime_threshold);
  const dtRaw = Number(settings?.double_time_threshold);
  const ot = Number.isFinite(otRaw) ? otRaw : Infinity;
  const dt = Number.isFinite(dtRaw) ? dtRaw : Infinity;

  const regular = Math.min(hours, ot);
  const overtime = hours > ot ? Math.min(hours, dt) - ot : 0;
  const doubletime = hours > dt ? hours - dt : 0;

  return {
    regular: Math.max(0, regular),
    overtime: Math.max(0, overtime),
    doubletime: Math.max(0, doubletime),
  };
}

function computeCost(bands, employee) {
  const rate = Number(employee?.hourly_rate) || 0;
  const otMult = Number(employee?.overtime_multiplier) || 1;
  const dtMult = Number(employee?.double_time_multiplier) || 1;
  const cost =
    bands.regular * rate +
    bands.overtime * rate * otMult +
    bands.doubletime * rate * dtMult;
  return Math.round(cost * 100) / 100;
}

// ── Monday of the current ISO week ───────────────────────────────────────────

function weekStart(dateStr) {
  const d = new Date(dateStr || Date.now());
  const day = d.getUTCDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ── Buildexact sync ───────────────────────────────────────────────────────────

// Match a site address to a Buildexact job id — via the buildexact_job_sync mirror first
// (one row per BX job, small), then Hub jobs by normalised address. This is the "linked by
// job address" path used when a record has no direct buildexact_job_id stored.
async function resolveBuildexactJobIdByAddress(rawAddress, sb) {
  const addr = normaliseAddress(rawAddress || "");
  if (!addr.normalised) return null;
  const { data: mirrors } = await sb.from("buildexact_job_sync").select("buildexact_job_id, address").not("buildexact_job_id", "is", null);
  const m = (mirrors || []).find(r => normaliseAddress(r.address || "").normalised === addr.normalised);
  if (m?.buildexact_job_id) return m.buildexact_job_id;
  const { data: jrow } = await sb.from("jobs").select("buildexact_job_id").eq("address_normalised", addr.normalised).not("buildexact_job_id", "is", null).maybeSingle();
  return jrow?.buildexact_job_id || null;
}

// Resolve a timesheet's Buildexact job id. Carpentry jobs ARE Buildexact jobs (created from
// accepted BX quotes) — they carry buildexact_job_id directly (source of truth), falling back
// to an address match. Construction timesheets resolve job_id (or project_id → projects.job_id)
// → jobs.buildexact_job_id, then the buildexact_job_sync mirror, then address.
// Returns { buildexactJobId, error } — error is a plain-English reason when it can't resolve.
async function resolveBuildexactJobIdForTimesheet(timesheet, sb) {
  if (timesheet.carpentry_job_id) {
    const { data: cj } = await sb.from("carpentry_jobs").select("buildexact_job_id, address").eq("id", timesheet.carpentry_job_id).maybeSingle();
    if (cj?.buildexact_job_id) return { buildexactJobId: cj.buildexact_job_id, error: null };
    const byAddr = await resolveBuildexactJobIdByAddress(cj?.address, sb);
    if (byAddr) return { buildexactJobId: byAddr, error: null };
    return { buildexactJobId: null, error: "No Buildexact job for this carpentry job — set its Buildexact job ID or match the site address" };
  }

  let jobId = timesheet.job_id || null;
  if (!jobId && timesheet.project_id) {
    const { data: proj } = await sb.from("projects").select("job_id").eq("id", timesheet.project_id).maybeSingle();
    jobId = proj?.job_id || null;
  }
  if (!jobId) return { buildexactJobId: null, error: "No job linked to this timesheet (or its project)" };
  const { data: job } = await sb.from("jobs").select("buildexact_job_id, address").eq("id", jobId).maybeSingle();
  if (job?.buildexact_job_id) return { buildexactJobId: job.buildexact_job_id, error: null };
  const { data: mirror } = await sb.from("buildexact_job_sync").select("buildexact_job_id").eq("job_id", jobId).maybeSingle();
  if (mirror?.buildexact_job_id) return { buildexactJobId: mirror.buildexact_job_id, error: null };
  const byAddr = await resolveBuildexactJobIdByAddress(job?.address, sb);
  if (byAddr) return { buildexactJobId: byAddr, error: null };
  return { buildexactJobId: null, error: "Linked job has no Buildexact ID" };
}

// Resolve the worker's reusable "[Name] (HUB)" Buildexact contact — create ONCE, reuse forever
// (never a new contact per push, the way Deputy ended up duplicating). Returns the contactId, or
// null if creation isn't possible (the Work Order still works without it — the name is on the line).
export async function ensureBuildexactContact(emp, sb) {
  if (emp.buildexact_contact_id) return emp.buildexact_contact_id;
  const wantName = `${emp.name} (HUB)`;
  try {
    const existing = beList(await getContacts()).find(c => (c.name || "").trim().toLowerCase() === wantName.toLowerCase());
    let contactId = existing?.contactId || existing?.id || null;
    if (!contactId) {
      const created = await createContact({
        contactType: "Person",
        name: wantName,
        email: emp.email || undefined,
        mobile: emp.phone || undefined,
      });
      contactId = created?.contactId || created?.id || null;
    }
    if (contactId) {
      await sb.from("employees").update({ buildexact_contact_id: contactId, updated_at: new Date().toISOString() }).eq("id", emp.id);
    }
    return contactId;
  } catch (e) {
    console.warn("[workforce/buildexact-contact]", e?.message);
    return null;
  }
}

// The Buildexact "Actuals Category" (a Work-Order line's `parentTask`) for a labour line. For a
// carpentry job, use the per-job category mapped from the task (carpentry_job_budgets, mig 067);
// otherwise fall back to the task label.
export async function resolveCostCategory(timesheet, entry, sb) {
  if (timesheet.carpentry_job_id) {
    const { data: b } = await sb.from("carpentry_job_budgets")
      .select("category_name")
      .eq("job_id", timesheet.carpentry_job_id)
      .eq("cost_type", "labour")
      .eq("workforce_task_category", entry.task_category)
      .order("sort_order").limit(1).maybeSingle();
    if (b?.category_name) return b.category_name;
  }
  return TASK_LABELS[entry.task_category] || entry.task_category;
}

// Push an approved timesheet to Buildexact as a WORK ORDER (orderType 'Work') — the mechanism
// Deputy used (proven live 2026-06-14): one Work Order per timesheet, a Labour line per entry,
// each line's `parentTask` set to the job's cost category (the "Actuals Category"), description
// "[Name] (HUB)". Returns { synced, error?, skipped?, workOrderId? } so callers can count.
export async function syncTimesheetToBuildexact(timesheet, sb) {
  if (!buildexactConfigured()) return { synced: false, skipped: true };
  if (timesheet.buildexact_work_order_id) return { synced: true, skipped: "already_pushed" }; // idempotent — never duplicate
  const { data: emp } = await sb.from("employees").select("*").eq("id", timesheet.employee_id).single();
  if (!emp) {
    await sb.from("timesheets").update({ buildexact_sync_error: "Employee record not found" }).eq("id", timesheet.id);
    return { synced: false, error: "Employee record not found" };
  }
  const { buildexactJobId, error: resolveErr } = await resolveBuildexactJobIdForTimesheet(timesheet, sb);
  if (!buildexactJobId) {
    await sb.from("timesheets").update({ buildexact_sync_error: resolveErr }).eq("id", timesheet.id);
    return { synced: false, error: resolveErr };
  }
  const { data: entries } = await sb.from("timesheet_entries").select("*").eq("timesheet_id", timesheet.id);
  if (!entries?.length) return { synced: false, skipped: "no_entries" };

  const contactId = await ensureBuildexactContact(emp, sb);

  const items = [];
  for (const entry of entries) {
    const parentTask = await resolveCostCategory(timesheet, entry, sb);
    items.push({
      costItemType: "Labour",
      description: `${emp.name} (HUB)`,
      quantity: Number(entry.hours),
      unitCost: Number(emp.hourly_rate),
      totalCost: Number(entry.cost_amount ?? 0),
      uom: "hr",
      parentTask: parentTask || undefined,
      notes: "Imported from Blue Leaf Hub",
    });
  }

  try {
    const order = await createPurchaseOrder({
      jobId: buildexactJobId,
      orderType: "Work",
      // Apply GST (10%) like Deputy's native sync. Tax is an ORDER-level flag in Buildexact
      // (isTaxFree) — NOT a line-item field. New API-created orders default to isTaxFree:true
      // (GST-free); Deputy stamps isTaxFree:false so the Actual Cost matches the historical
      // labour orders. The ex-GST cost (what drives margin) is identical either way.
      isTaxFree: false,
      ...(contactId ? { contactId } : {}),
      description: `Blue Leaf Hub labour — ${emp.name} — ${timesheet.date}`,
      items,
    });
    const woId = order?.purchaseOrderId || order?.id || null;
    // Verify the line items actually landed. Buildexact has been seen to create the order
    // header but drop the lines — and a Work Order with 0 items can't be marked Completed.
    // Catch it loudly instead of silently reporting success.
    let landed = items.length;
    if (woId) {
      try { const back = await beFetch(`/jobs/purchaseorders/${woId}/items`); landed = (Array.isArray(back) ? back : (back.items || [])).length; }
      catch { /* keep the sent count */ }
    }
    if (woId && items.length > 0 && landed === 0) {
      await sb.from("timesheets").update({ buildexact_sync_error: "Work Order created but its line items didn't land in Buildexact", buildexact_work_order_id: woId }).eq("id", timesheet.id);
      console.warn("[workforce/buildexact-sync] WORK ORDER has NO line items", JSON.stringify({ id: woId, sentLines: items.length }));
      return { synced: false, error: "Work Order line items didn't land in Buildexact", workOrderId: woId };
    }
    await sb.from("timesheets").update({
      buildexact_synced_at: new Date().toISOString(),
      buildexact_sync_error: null,
      buildexact_work_order_id: woId,
    }).eq("id", timesheet.id);
    console.log("[workforce/buildexact-sync] WORK ORDER created", JSON.stringify({ orderNumber: order?.orderNumber, id: woId, job: buildexactJobId, lines: landed }));
    return { synced: true, workOrderId: woId };
  } catch (e) {
    console.warn("[workforce/buildexact-sync] WORK ORDER failed", JSON.stringify({ job: buildexactJobId, error: e?.message }));
    await sb.from("timesheets").update({ buildexact_sync_error: e?.message || "Work Order create failed" }).eq("id", timesheet.id);
    return { synced: false, error: e?.message };
  }
}

// ── Labour budget update (fire-and-forget) ────────────────────────────────────

async function updateJobLabourBudget(jobId, sb) {
  if (!jobId) return;
  try {
    const { data: entries } = await sb
      .from("timesheet_entries")
      .select("task_category, cost_amount, timesheets!inner(job_id, status)")
      .eq("timesheets.job_id", jobId)
      .eq("timesheets.status", "approved");
    if (!entries?.length) return;
    // BX05 — INTENTIONAL no-op write. The Financial Command Centre already derives labour
    // budget-vs-actual by reading approved timesheets live and resolving task_category →
    // trade_category (financeCCRoutes.mjs). Persisting these totals into job_budgets here
    // would DOUBLE-COUNT labour against that live read. Kept as an observability log only —
    // do not "complete" this into a job_budgets upsert without first removing the live read.
    const grouped = {};
    for (const e of entries) {
      const cat = e.task_category;
      grouped[cat] = (grouped[cat] || 0) + Number(e.cost_amount || 0);
    }
    console.log("[workforce/labour-budget]", jobId, grouped);
  } catch (err) {
    console.warn("[workforce/labour-budget] update failed:", err?.message);
  }
}

// ── Approve a single timesheet (shared logic) ─────────────────────────────────

async function approveSingleTimesheet(timesheetId, callerId, sb) {
  const { data: ts, error: tsErr } = await sb
    .from("timesheets")
    .select("*, employees(*)")
    .eq("id", timesheetId)
    .single();
  if (tsErr || !ts) throw new Error("Timesheet not found");

  const { data: entries } = await sb.from("timesheet_entries").select("*").eq("timesheet_id", timesheetId);
  const { data: settings } = await sb.from("workforce_settings").select("*").limit(1).single();

  // Compute cost for each entry
  for (const entry of entries || []) {
    const bands = splitOvertimeHours(Number(entry.hours), settings || { overtime_threshold: 8, double_time_threshold: 10 });
    const cost = computeCost(bands, ts.employees);
    // overtime_hours stores all premium hours (overtime + double-time) — preserves the
    // column's original meaning (hours paid above the base rate).
    await sb.from("timesheet_entries")
      .update({ cost_amount: cost, overtime_hours: bands.overtime + bands.doubletime })
      .eq("id", entry.id);
  }

  await sb.from("timesheets").update({
    status: "approved",
    approved_by: callerId,
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", timesheetId);

  // Auto-feed pushes to Buildexact on approval; manual-feed waits for an explicit
  // "Sync to Buildexact" action (workforce_settings.buildexact_sync_mode).
  if ((settings?.buildexact_sync_mode || "auto") === "auto") {
    syncTimesheetToBuildexact(ts, sb).catch(e => console.error("[workforce/sync]", e?.message));
  }
  updateJobLabourBudget(ts.job_id, sb).catch(e => console.error("[workforce/labour-budget]", e?.message));
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerWorkforceRoutes(app) {
  // ── Settings ──────────────────────────────────────────────────────────────

  app.get("/api/workforce/settings", requireAuth, async (_req, res) => {
    const sb = getServiceSupabase();
    let { data } = await sb.from("workforce_settings").select("*").limit(1).single();
    if (!data) {
      await sb.from("workforce_settings").insert({});
      ({ data } = await sb.from("workforce_settings").select("*").limit(1).single());
    }
    res.json({ ok: true, settings: data });
  });

  app.put("/api/workforce/settings", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { data: existing } = await sb.from("workforce_settings").select("id").limit(1).single();
    if (!existing) return res.status(404).json({ ok: false, error: "Settings not found" });
    const allowed = [
      "standard_hours", "standard_break_minutes", "standard_start_time",
      "overtime_threshold", "double_time_threshold", "working_days",
      "cost_code_first_fix_framing", "cost_code_cladding", "cost_code_second_fix",
      "cost_code_outdoor_works", "cost_code_formwork_slab_prep", "cost_code_site_labouring",
      "cost_code_site_cleanup", "cost_code_supervision", "cost_code_other",
      "buildexact_sync_mode",
    ];
    const update = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    }
    update.updated_at = new Date().toISOString();
    const { data, error } = await sb.from("workforce_settings").update(update).eq("id", existing.id).select().single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, settings: data });
  });

  // ── Employees ─────────────────────────────────────────────────────────────

  app.get("/api/workforce/employees", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const isDirector = ["admin"].includes(req.caller.role);
    const includeInactive = req.query.include_inactive === "true";
    let q = sb.from("employees").select("id, user_id, name, trade, employment_type, is_leading_hand, is_active, email, phone, staff_code, buildexact_employee_id, buildexact_contact_id, invite_sent_at, created_at" + (isDirector ? ", hourly_rate, overtime_multiplier, double_time_multiplier" : ""));
    if (!includeInactive) q = q.eq("is_active", true);
    q = q.order("name");
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, employees: data });
  });

  app.post("/api/workforce/employees", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    const { name, trade, employment_type, hourly_rate, overtime_multiplier, double_time_multiplier, is_leading_hand, buildexact_employee_id, email, phone, staff_code } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "name is required" });
    const { data, error } = await sb.from("employees").insert({
      name, trade: trade || "carpenter",
      employment_type: employment_type || "full_time",
      hourly_rate: hourly_rate || 0,
      overtime_multiplier: overtime_multiplier || 1.5,
      double_time_multiplier: double_time_multiplier || 2.0,
      is_leading_hand: !!is_leading_hand,
      buildexact_employee_id: buildexact_employee_id || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      staff_code: staff_code?.trim() || null,
    }).select().single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, employee: data });
  });

  app.put("/api/workforce/employees/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    const allowed = ["name", "trade", "employment_type", "hourly_rate", "overtime_multiplier", "double_time_multiplier", "is_leading_hand", "buildexact_employee_id", "buildexact_contact_id", "email", "phone", "staff_code"];
    const update = { updated_at: new Date().toISOString() };
    for (const k of allowed) {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    }
    const { data, error } = await sb.from("employees").update(update).eq("id", req.params.id).select().single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, employee: data });
  });

  app.delete("/api/workforce/employees/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    const { error } = await sb.from("employees").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", req.params.id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true });
  });

  app.post("/api/workforce/employees/:id/invite", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    const { data: emp } = await sb.from("employees").select("*").eq("id", req.params.id).single();
    if (!emp) return res.status(404).json({ ok: false, error: "Employee not found" });
    if (!req.body.email) return res.status(400).json({ ok: false, error: "email is required" });
    try {
      await sb.auth.admin.inviteUserByEmail(req.body.email, {
        data: { employee_id: emp.id, role: "worker" },
      });
      await sb.from("employees").update({ invite_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", emp.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e?.message || "Invite failed" });
    }
  });

  app.get("/api/workforce/employees/:id/preview", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const today = new Date().toISOString().slice(0, 10);
    const [empRes, tsRes] = await Promise.all([
      sb.from("employees").select("id, name, trade, employment_type, is_leading_hand, is_active").eq("id", req.params.id).single(),
      sb.from("timesheets").select("*, timesheet_entries(*)").eq("employee_id", req.params.id).eq("date", today).maybeSingle(),
    ]);
    if (!empRes.data) return res.status(404).json({ ok: false, error: "Employee not found" });
    res.json({ ok: true, employee: empRes.data, today_timesheet: tsRes.data || null });
  });

  // ── Timesheets ────────────────────────────────────────────────────────────

  app.get("/api/workforce/timesheets/pending", requireAuth, async (_req, res) => {
    const sb = getServiceSupabase();
    const { data, error } = await sb
      .from("timesheets")
      .select("*, employees(id, name, trade, hourly_rate, overtime_multiplier), projects(id, address), carpentry_jobs(id, reference, client_name), timesheet_entries(*)")
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, timesheets: data });
  });

  app.get("/api/workforce/timesheets", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const isDirector = req.caller.role === "admin";
    const { status, employee_id, project_id, date_from, date_to } = req.query;
    let q = sb.from("timesheets")
      .select("*, employees(id, name, trade" + (isDirector ? ", hourly_rate, overtime_multiplier" : "") + "), projects(id, address), carpentry_jobs(id, reference, client_name), timesheet_entries(*)")
      .order("date", { ascending: false });
    if (status) q = q.eq("status", status);
    if (employee_id) q = q.eq("employee_id", employee_id);
    if (project_id) q = q.eq("project_id", project_id);
    if (date_from) q = q.gte("date", date_from);
    if (date_to) q = q.lte("date", date_to);
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, timesheets: data });
  });

  app.post("/api/workforce/timesheets/mass-fill", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { date, project_id, job_id, carpentry_job_id, entries } = req.body;
    if (!date || !Array.isArray(entries) || !entries.length) {
      return res.status(400).json({ ok: false, error: "date and entries[] are required" });
    }
    const results = [];
    for (const e of entries) {
      try {
        const { employee_id, task_category, hours, notes } = e;
        if (!employee_id || !task_category || !hours) {
          results.push({ employee_id, ok: false, error: "Missing fields" });
          continue;
        }
        // Upsert timesheet for this employee+date
        let { data: ts } = await sb.from("timesheets").select("id").eq("employee_id", employee_id).eq("date", date).maybeSingle();
        if (!ts) {
          const ins = await sb.from("timesheets").insert({
            employee_id, date,
            project_id: project_id || null,
            job_id: job_id || null,
            carpentry_job_id: carpentry_job_id || null,
            status: "submitted",
            submitted_at: new Date().toISOString(),
          }).select("id").single();
          ts = ins.data;
        }
        if (!ts?.id) { results.push({ employee_id, ok: false, error: "Could not create timesheet" }); continue; }

        const { error: entryErr } = await sb.from("timesheet_entries").insert({
          timesheet_id: ts.id,
          employee_id,
          task_category,
          phase: TASK_PHASE_MAP[task_category] || "general",
          hours: Number(hours),
          overtime_hours: 0,
          notes: notes || null,
        });
        results.push({ employee_id, timesheet_id: ts.id, ok: !entryErr, error: entryErr?.message });
      } catch (err) {
        results.push({ employee_id: e.employee_id, ok: false, error: err?.message });
      }
    }
    res.json({ ok: true, results });
  });

  app.post("/api/workforce/timesheets/mass-approve", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    const { timesheet_ids } = req.body;
    if (!Array.isArray(timesheet_ids) || !timesheet_ids.length) {
      return res.status(400).json({ ok: false, error: "timesheet_ids[] required" });
    }
    const results = [];
    for (const id of timesheet_ids) {
      try {
        await approveSingleTimesheet(id, req.caller.id, sb);
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: err?.message });
      }
    }
    res.json({ ok: true, results });
  });

  app.post("/api/workforce/timesheets/:id/approve", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    try {
      await approveSingleTimesheet(req.params.id, req.caller.id, sb);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message });
    }
  });

  // Retry Buildexact sync for a specific approved timesheet
  app.post("/api/workforce/timesheets/:id/sync", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    const { data: ts } = await sb.from("timesheets")
      .select("*, timesheet_entries(*)").eq("id", req.params.id).single();
    if (!ts) return res.status(404).json({ ok: false, error: "Timesheet not found" });
    try {
      await syncTimesheetToBuildexact(ts, sb);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Bulk-push all approved timesheets not yet synced to Buildexact (manual-feed / catch-up button)
  app.post("/api/workforce/timesheets/sync-pending", requireAuth, requireRole("admin"), async (_req, res) => {
    const sb = getServiceSupabase();
    if (!buildexactConfigured()) return res.status(400).json({ ok: false, error: "Buildexact is not configured." });
    const { data: rows, error } = await sb.from("timesheets")
      .select("*, timesheet_entries(*)")
      .eq("status", "approved")
      .is("buildexact_synced_at", null);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    let synced = 0, failed = 0;
    for (const ts of rows || []) {
      try {
        const r = await syncTimesheetToBuildexact(ts, sb);
        if (r?.synced) synced++; else failed++;
      } catch (e) {
        console.warn("[workforce/sync-pending]", e?.message);
        failed++;
      }
    }
    res.json({ ok: true, synced, failed, total: (rows || []).length });
  });

  // Admin delete (test cleanup / erroneous entries) — cascades to timesheet_entries
  app.delete("/api/workforce/timesheets/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    await sb.from("timesheet_entries").delete().eq("timesheet_id", req.params.id);
    const { error } = await sb.from("timesheets").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true });
  });

  app.post("/api/workforce/timesheets/:id/reject", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { notes } = req.body;
    const { error } = await sb.from("timesheets").update({
      status: "rejected",
      rejection_notes: notes || null,
      updated_at: new Date().toISOString(),
    }).eq("id", req.params.id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true });
  });

  // Director can un-approve a timesheet → resets to submitted so it can be re-reviewed/edited
  app.post("/api/workforce/timesheets/:id/unapprove", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    const { error } = await sb.from("timesheets").update({
      status: "submitted",
      approved_by: null,
      approved_at: null,
      buildexact_synced_at: null,
      buildexact_sync_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", req.params.id).eq("status", "approved");
    if (error) return res.status(500).json({ ok: false, error: error.message });
    // Reset cost_amount on entries so it gets re-computed on next approval
    await sb.from("timesheet_entries").update({ cost_amount: null, overtime_hours: 0 })
      .eq("timesheet_id", req.params.id);
    res.json({ ok: true });
  });

  // Attribute (or clear) a carpentry job on a pending/submitted timesheet
  app.patch("/api/workforce/timesheets/:id/carpentry-job", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { carpentryJobId } = req.body;
    // Verify the timesheet exists and is editable (not yet approved)
    const { data: ts, error: tsErr } = await sb
      .from("timesheets")
      .select("id, status")
      .eq("id", req.params.id)
      .maybeSingle();
    if (tsErr || !ts) return res.status(404).json({ ok: false, error: "Timesheet not found" });
    if (ts.status === "approved") {
      return res.status(400).json({ ok: false, error: "Cannot change carpentry job on an approved timesheet. Unapprove it first." });
    }
    // Validate carpentryJobId if provided
    if (carpentryJobId) {
      const { data: job } = await sb.from("carpentry_jobs").select("id").eq("id", carpentryJobId).maybeSingle();
      if (!job) return res.status(400).json({ ok: false, error: "Carpentry job not found" });
    }
    const { error } = await sb.from("timesheets")
      .update({ carpentry_job_id: carpentryJobId || null, updated_at: new Date().toISOString() })
      .eq("id", req.params.id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true });
  });

  // ── Labour dashboard ──────────────────────────────────────────────────────

  app.get("/api/projects/:id/labour", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const projectId = req.params.id;
    const isDirector = req.caller.role === "admin";

    const { data: project } = await sb.from("projects").select("id, address, job_id").eq("id", projectId).single();
    if (!project) return res.status(404).json({ ok: false, error: "Project not found" });

    // All approved timesheet entries for this project
    const { data: entries } = await sb
      .from("timesheet_entries")
      .select("task_category, hours, cost_amount, timesheets!inner(project_id, status, date, employees(id, name))")
      .eq("timesheets.project_id", projectId)
      .eq("timesheets.status", "approved");

    // Group by category
    const byCategory = {};
    for (const e of entries || []) {
      const cat = e.task_category;
      if (!byCategory[cat]) byCategory[cat] = { task_category: cat, label: TASK_LABELS[cat] || cat, phase: TASK_PHASE_MAP[cat] || "general", total_hours: 0, total_cost: 0, entry_count: 0 };
      byCategory[cat].total_hours += Number(e.hours || 0);
      byCategory[cat].total_cost += Number(e.cost_amount || 0);
      byCategory[cat].entry_count++;
    }

    // Workers active this week
    const monStr = weekStart(new Date().toISOString().slice(0, 10));
    const { data: weekEntries } = await sb
      .from("timesheet_entries")
      .select("hours, cost_amount, timesheets!inner(project_id, status, date, employees(id, name))")
      .eq("timesheets.project_id", projectId)
      .in("timesheets.status", ["approved", "submitted"])
      .gte("timesheets.date", monStr);

    const workerMap = {};
    for (const e of weekEntries || []) {
      const emp = e.timesheets?.employees;
      if (!emp) continue;
      if (!workerMap[emp.id]) workerMap[emp.id] = { name: emp.name, hours: 0, cost: 0 };
      workerMap[emp.id].hours += Number(e.hours || 0);
      workerMap[emp.id].cost += Number(e.cost_amount || 0);
    }

    const totalHours = Object.values(byCategory).reduce((s, c) => s + c.total_hours, 0);
    const totalCost = Object.values(byCategory).reduce((s, c) => s + c.total_cost, 0);

    // Buildexact estimates (best-effort)
    let buildexactEstimates = null;
    if (project.job_id) {
      const { data: job } = await sb.from("jobs").select("buildexact_job_id").eq("id", project.job_id).maybeSingle();
      if (job?.buildexact_job_id) {
        try { buildexactEstimates = await pullBuildexactEstimate(job.buildexact_job_id); } catch { /* ignore */ }
      }
    }

    res.json({
      ok: true,
      entries_by_category: Object.values(byCategory),
      workers_this_week: Object.values(workerMap),
      total_hours: totalHours,
      total_cost: isDirector ? totalCost : null,
      buildexact_estimates: buildexactEstimates,
    });
  });

  // ── Site tasks ────────────────────────────────────────────────────────────

  const PRIORITY_ORDER = { urgent: 0, normal: 1, when_time_permits: 2 };

  app.get("/api/projects/:id/site-tasks", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const { data, error } = await sb
      .from("site_tasks")
      .select("*, employees!assigned_to(id, name)")
      .eq("project_id", req.params.id)
      .neq("status", "wont_do")
      .order("sort_order")
      .order("created_at");
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const sorted = (data || []).sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99));
    res.json({ ok: true, tasks: sorted });
  });

  app.post("/api/projects/:id/site-tasks", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { title, description, assigned_to, priority, category, due_date } = req.body;
    if (!title) return res.status(400).json({ ok: false, error: "title is required" });
    const { data, error } = await sb.from("site_tasks").insert({
      project_id: req.params.id,
      title, description: description || null,
      assigned_to: assigned_to || null,
      priority: priority || "normal",
      category: category || "general",
      due_date: due_date || null,
      created_by: req.caller.id,
      created_via: "manual",
    }).select().single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, task: data });
  });

  app.post("/api/projects/:id/site-tasks/bulk", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const { tasks, created_via } = req.body;
    if (!Array.isArray(tasks) || !tasks.length) {
      return res.status(400).json({ ok: false, error: "tasks[] required" });
    }
    const rows = tasks.map(t => ({
      project_id: req.params.id,
      title: t.title,
      description: t.description || null,
      priority: t.priority || "normal",
      category: t.category || "general",
      assigned_to: t.assigned_to || null,
      created_by: req.caller.id,
      created_via: created_via || "manual",
    }));
    const { data, error } = await sb.from("site_tasks").insert(rows).select();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, tasks: data });
  });

  app.patch("/api/site-tasks/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const allowed = ["title", "description", "assigned_to", "priority", "category", "status", "due_date", "completion_notes", "sort_order"];
    const update = { updated_at: new Date().toISOString() };
    for (const k of allowed) {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    }
    if (req.body.status === "done" && !update.completed_at) {
      update.completed_at = new Date().toISOString();
    }
    const { data, error } = await sb.from("site_tasks").update(update).eq("id", req.params.id).select().single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, task: data });
  });

  app.delete("/api/site-tasks/:id", requireAuth, requireRole("admin", "supervisor"), async (req, res) => {
    const sb = getServiceSupabase();
    const { error } = await sb.from("site_tasks").update({ status: "wont_do", updated_at: new Date().toISOString() }).eq("id", req.params.id);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true });
  });

  // Generate (or rotate) a worker's magic-link token and return the shareable path. (W01)
  // Admin issues this once per worker and sends them the link; regenerate to revoke the old one.
  app.post("/api/workforce/employees/:id/worker-link", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    const { data: emp } = await sb.from("employees").select("id, name, worker_token").eq("id", req.params.id).maybeSingle();
    if (!emp) return res.status(404).json({ ok: false, error: "Employee not found" });
    let token = emp.worker_token;
    if (!token || req.body?.regenerate) {
      token = crypto.randomBytes(24).toString("base64url");
      const { error } = await sb.from("employees").update({ worker_token: token, updated_at: new Date().toISOString() }).eq("id", emp.id);
      if (error) return res.status(500).json({ ok: false, error: error.message });
    }
    res.json({ ok: true, token, path: `/worker?token=${encodeURIComponent(token)}` });
  });

  // ── Worker-facing endpoints ───────────────────────────────────────────────

  async function resolveWorkerEmployee(userId, sb) {
    // 1. Already linked by user_id (the normal case after first login)
    const { data: linked } = await sb.from("employees").select("*").eq("user_id", userId).eq("is_active", true).maybeSingle();
    if (linked) return linked;

    // 2. First login after invite. The invite stores the employee_id in the auth
    //    user's metadata (see POST /employees/:id/invite). Read it and link it back
    //    to employees.user_id so every future lookup hits branch 1.
    const { data: authUser } = await sb.auth.admin.getUserById(userId);
    const metaEmployeeId = authUser?.user?.user_metadata?.employee_id;
    if (metaEmployeeId) {
      const { data: byMeta } = await sb.from("employees").select("*").eq("id", metaEmployeeId).eq("is_active", true).maybeSingle();
      if (byMeta) {
        if (!byMeta.user_id) {
          await sb.from("employees").update({ user_id: userId, updated_at: new Date().toISOString() }).eq("id", byMeta.id);
        }
        return { ...byMeta, user_id: userId };
      }
    }

    return null;
  }

  // Worker auth: accept a per-worker magic-link token (?token= or x-worker-token header)
  // so field workers use the PWA without a Supabase account. Falls back to normal Supabase
  // auth when no token is present (logged-in admin/worker). A token resolves to exactly ONE
  // active employee and grants only that worker's own endpoints — never admin/supervisor ones.
  async function workerAuth(req, res, next) {
    const token = String(req.query.token || req.get("x-worker-token") || "").trim();
    if (token) {
      const sb = getServiceSupabase();
      const { data: emp } = await sb.from("employees").select("*").eq("worker_token", token).eq("is_active", true).maybeSingle();
      if (emp) { req.workerEmployee = emp; return next(); }
      return res.status(401).json({ ok: false, error: "This worker link is invalid or has been reset." });
    }
    return requireAuth(req, res, next);
  }

  app.get("/api/worker/me", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return res.status(403).json({ ok: false, error: "No employee record found" });

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const monStr = weekStart(today);

    const [todayTs, yesterdayTs, weekEntries, settings] = await Promise.all([
      sb.from("timesheets").select("*, timesheet_entries(*)").eq("employee_id", emp.id).eq("date", today).maybeSingle(),
      sb.from("timesheets").select("project_id, projects(id, address)").eq("employee_id", emp.id).eq("date", yesterday).maybeSingle(),
      sb.from("timesheet_entries").select("hours, timesheets!inner(employee_id, date, status)").eq("timesheets.employee_id", emp.id).gte("timesheets.date", monStr).in("timesheets.status", ["submitted", "approved"]),
      sb.from("workforce_settings").select("*").limit(1).single(),
    ]);

    const weeklyHours = (weekEntries.data || []).reduce((s, e) => s + Number(e.hours || 0), 0);

    // Open tasks for current project
    let openTaskCount = 0;
    let currentProjectId = null;
    if (todayTs.data?.project_id) {
      currentProjectId = todayTs.data.project_id;
    } else if (yesterdayTs.data?.project_id) {
      currentProjectId = yesterdayTs.data.project_id;
    }
    if (currentProjectId) {
      const { count } = await sb.from("site_tasks").select("id", { count: "exact", head: true }).eq("project_id", currentProjectId).in("status", ["open", "in_progress"]);
      openTaskCount = count || 0;
    }

    // Return employee without rate
    const { hourly_rate: _r, overtime_multiplier: _om, double_time_multiplier: _dm, worker_token: _wt, ...safeEmp } = emp;

    res.json({
      ok: true,
      employee: safeEmp,
      today_timesheet: todayTs.data || null,
      yesterday_project: yesterdayTs.data?.projects || null,
      weekly_hours: Math.round(weeklyHours * 100) / 100,
      open_task_count: openTaskCount,
      current_project_id: currentProjectId,
      settings: settings.data || null,
    });
  });

  app.get("/api/worker/projects", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return res.status(403).json({ ok: false, error: "No employee record found" });

    // Fetch construction projects AND carpentry jobs in parallel
    const [projRes, carpRes] = await Promise.all([
      sb.from("projects").select("id, address, job_id, status").order("address", { ascending: true }),
      sb.from("carpentry_jobs").select("id, address, client_name, status").order("address", { ascending: true }),
    ]);
    if (projRes.error) return res.status(500).json({ ok: false, error: projRes.error.message });

    const projects = (projRes.data || []).map(p => ({ ...p, type: "project" }));
    // Carpentry jobs surface as sites — show "address (client)" for clarity
    const carpJobs = (carpRes.data || []).map(j => ({
      id: j.id,
      address: j.client_name ? `${j.address} (${j.client_name})` : j.address,
      status: j.status,
      type: "carpentry",
    }));

    // Active sites first, then alphabetical within each bucket
    const list = [...projects, ...carpJobs].sort((a, b) => {
      const aActive = a.status === "active" ? 0 : 1;
      const bActive = b.status === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.address.localeCompare(b.address);
    });

    res.json({ ok: true, projects: list });
  });

  app.post("/api/worker/timesheets", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return res.status(403).json({ ok: false, error: "No employee record found" });

    const { date, project_id, job_id, carpentry_job_id, entries } = req.body;
    if (!date || !Array.isArray(entries) || !entries.length) {
      return res.status(400).json({ ok: false, error: "date and entries[] required" });
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    if (date > todayStr) {
      return res.status(400).json({ ok: false, error: "Cannot log hours for a future date" });
    }
    if (entries.reduce((s, e) => s + (Number(e.hours) || 0), 0) > 24) {
      return res.status(400).json({ ok: false, error: "Total hours for one day cannot exceed 24" });
    }

    // Check existing timesheet for today
    const { data: existing } = await sb.from("timesheets").select("id, status").eq("employee_id", emp.id).eq("date", date).maybeSingle();
    if (existing && existing.status === "approved") {
      return res.status(409).json({ ok: false, error: "Timesheet already approved" });
    }

    let timesheetId = existing?.id;
    if (!timesheetId) {
      const { data: ts, error: tsErr } = await sb.from("timesheets").insert({
        employee_id: emp.id, date,
        project_id: project_id || null,
        job_id: job_id || null,
        carpentry_job_id: carpentry_job_id || null,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      }).select("id").single();
      if (tsErr) return res.status(500).json({ ok: false, error: tsErr.message });
      timesheetId = ts.id;
    } else {
      await sb.from("timesheets").update({
        project_id: project_id || null,
        job_id: job_id || null,
        carpentry_job_id: carpentry_job_id || null,
        status: "submitted",
        submitted_at: new Date().toISOString(),
        rejection_notes: null,
        updated_at: new Date().toISOString(),
      }).eq("id", timesheetId);
      // Clear old entries on resubmit
      await sb.from("timesheet_entries").delete().eq("timesheet_id", timesheetId);
    }

    // Insert entries
    const entryRows = entries.map(e => ({
      timesheet_id: timesheetId,
      employee_id: emp.id,
      task_category: e.task_category,
      phase: TASK_PHASE_MAP[e.task_category] || "general",
      hours: Number(e.hours),
      overtime_hours: 0,
      notes: e.notes || null,
      completion_photo_url: e.completion_photo_url || null,
    }));
    const { error: entryErr } = await sb.from("timesheet_entries").insert(entryRows);
    if (entryErr) return res.status(500).json({ ok: false, error: entryErr.message });

    res.json({ ok: true, timesheet_id: timesheetId });
  });

  app.get("/api/worker/timesheets/:date", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return res.status(403).json({ ok: false, error: "No employee record found" });
    const { data } = await sb.from("timesheets").select("*, timesheet_entries(*)").eq("employee_id", emp.id).eq("date", req.params.date).maybeSingle();
    res.json({ ok: true, timesheet: data || null });
  });

  app.put("/api/worker/timesheets/:id", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return res.status(403).json({ ok: false, error: "No employee record found" });

    const { data: ts } = await sb.from("timesheets").select("id, employee_id, status").eq("id", req.params.id).single();
    if (!ts) return res.status(404).json({ ok: false, error: "Timesheet not found" });
    if (ts.employee_id !== emp.id) return res.status(403).json({ ok: false, error: "Forbidden" });
    if (ts.status === "approved") return res.status(409).json({ ok: false, error: "Cannot edit approved timesheet" });

    const { entries, ...rest } = req.body;
    const todayStr = new Date().toISOString().slice(0, 10);
    if (rest.date && rest.date > todayStr) {
      return res.status(400).json({ ok: false, error: "Cannot log hours for a future date" });
    }
    if (Array.isArray(entries) && entries.reduce((s, e) => s + (Number(e.hours) || 0), 0) > 24) {
      return res.status(400).json({ ok: false, error: "Total hours for one day cannot exceed 24" });
    }
    await sb.from("timesheets").update({ ...rest, status: "submitted", submitted_at: new Date().toISOString(), rejection_notes: null, updated_at: new Date().toISOString() }).eq("id", ts.id);
    if (Array.isArray(entries)) {
      await sb.from("timesheet_entries").delete().eq("timesheet_id", ts.id);
      const rows = entries.map(e => ({
        timesheet_id: ts.id, employee_id: emp.id,
        task_category: e.task_category,
        phase: TASK_PHASE_MAP[e.task_category] || "general",
        hours: Number(e.hours), overtime_hours: 0,
        notes: e.notes || null,
        completion_photo_url: e.completion_photo_url || null,
      }));
      await sb.from("timesheet_entries").insert(rows);
    }
    res.json({ ok: true });
  });

  app.get("/api/worker/tasks", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return res.status(403).json({ ok: false, error: "No employee record found" });

    // Find current context from latest timesheet (may be regular project or carpentry job)
    const { data: latestTs } = await sb
      .from("timesheets")
      .select("project_id, carpentry_job_id")
      .eq("employee_id", emp.id)
      .in("status", ["submitted", "approved"])
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestTs) return res.json({ ok: true, tasks: [], project_id: null });

    let tasksQuery;
    if (latestTs.carpentry_job_id) {
      tasksQuery = sb
        .from("site_tasks")
        .select("*, employees!assigned_to(id, name)")
        .eq("carpentry_job_id", latestTs.carpentry_job_id)
        .neq("status", "wont_do")
        .order("sort_order")
        .order("created_at");
    } else if (latestTs.project_id) {
      tasksQuery = sb
        .from("site_tasks")
        .select("*, employees!assigned_to(id, name)")
        .eq("project_id", latestTs.project_id)
        .neq("status", "wont_do")
        .order("sort_order")
        .order("created_at");
    } else {
      return res.json({ ok: true, tasks: [], project_id: null });
    }

    const { data: tasks } = await tasksQuery;

    // Filter: open+in_progress tasks (unassigned OR assigned to this employee) + done tasks
    const visible = (tasks || []).filter(t =>
      t.status === "done" ||
      t.assigned_to === null ||
      t.assigned_to === emp.id
    );
    const sorted = visible.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99));
    res.json({ ok: true, tasks: sorted, project_id: latestTs.project_id, carpentry_job_id: latestTs.carpentry_job_id });
  });

  app.post("/api/worker/tasks/:id/complete", workerAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const emp = req.workerEmployee || await resolveWorkerEmployee(req.caller.id, sb);
    if (!emp) return res.status(403).json({ ok: false, error: "No employee record found" });

    const update = {
      status: "done",
      completed_at: new Date().toISOString(),
      completed_by: emp.id,
      updated_at: new Date().toISOString(),
    };
    if (req.body.notes) update.completion_notes = req.body.notes;
    if (req.body.photo_url && emp.is_leading_hand) update.completion_photo_url = req.body.photo_url;

    const { data, error } = await sb.from("site_tasks").update(update).eq("id", req.params.id).select().single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, task: data });
  });

  // ── CSV export (for History tab) ─────────────────────────────────────────

  app.get("/api/workforce/timesheets/export.csv", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const isDirector = req.caller.role === "admin";
    const { date_from, date_to, employee_id, project_id } = req.query;

    let q = sb.from("timesheet_entries")
      .select("*, timesheets!inner(date, status, employees(name, trade), projects(address))")
      .in("timesheets.status", ["approved", "submitted"]);
    if (date_from) q = q.gte("timesheets.date", date_from);
    if (date_to) q = q.lte("timesheets.date", date_to);
    if (employee_id) q = q.eq("timesheets.employees.id", employee_id);
    if (project_id) q = q.eq("timesheets.project_id", project_id);
    q = q.order("timesheets.date", { ascending: false });

    const { data: entries } = await q;

    const headers = ["Date", "Employee", "Trade", "Project", "Task", "Hours", "Overtime Hours", "Status"];
    if (isDirector) headers.push("Cost");

    const rows = (entries || []).map(e => {
      const row = [
        e.timesheets?.date || "",
        e.timesheets?.employees?.name || "",
        e.timesheets?.employees?.trade || "",
        e.timesheets?.projects?.address || "",
        TASK_LABELS[e.task_category] || e.task_category,
        e.hours,
        e.overtime_hours || 0,
        e.timesheets?.status || "",
      ];
      if (isDirector) row.push(e.cost_amount != null ? Number(e.cost_amount).toFixed(2) : "");
      return row;
    });

    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="timesheets-export.csv"');
    res.send(csv);
  });

  console.log("[workforce] routes registered");
}
