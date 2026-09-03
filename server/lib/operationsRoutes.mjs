import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth, requireCronSecretOrAdmin } from "./requireAuth.mjs";
import { emailAvailabilityConflict } from "./tradeCommitment.mjs";
import { sendPlainMail } from "./notifyMail.mjs";
import { getBrandingEmailLogo } from "./brandingAssets.mjs";
import { computeOpsReadiness } from "./opsReadiness.mjs";
import { ok, err, rowsToCamel } from "./apiResponse.mjs";

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * @param {import("express").Express} app
 */
export function registerOperationsRoutes(app) {
  // ── Operations enriched projects list ──────────────────────────────────────

  app.get("/api/operations/projects", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured." });
    try {
      // CV-3b: hide pre-construction-portal projects (is_preconstruction=true) — they exist to give
      // the client a portal during design, before the job is a live Ops project. Soft-degrades on a
      // pre-migration-199 DB (42703 → the column is absent → run the original unfiltered query).
      const PROJ_COLS = "id, job_id, address, status, tentative_start_date, accepted_trades, buildexact_job_id, buildexact_link_source, created_at, schedule_baseline_locked_at, jobs(id, won_at)";
      let { data: projects, error: pe } = await sb
        .from("projects")
        .select(`${PROJ_COLS}, is_preconstruction`)
        // BLH-E2E-001: hide decommissioned/anonymised projects from the active Operations board.
        // Cleanup scripts "soft-delete" by renaming address → "…_DELETED" (projects has no deleted_at
        // column), so that suffix is the exclusion convention. Mirrors the /global-tasks filter below.
        .not("address", "ilike", "%_DELETED")
        .eq("is_preconstruction", false)
        .order("created_at", { ascending: false });
      if (pe && pe.code === "42703") {
        ({ data: projects, error: pe } = await sb
          .from("projects").select(PROJ_COLS)
          .not("address", "ilike", "%_DELETED")
          .order("created_at", { ascending: false }));
      }
      if (pe) throw pe;

      const projectIds = (projects || []).map((p) => p.id);
      let tasks = [];
      if (projectIds.length) {
        const { data: td } = await sb
          .from("schedule_tasks")
          .select("id, project_id, name, start_date, end_date, percent_complete, task_type, is_hold_point, assignee_trade, trade")
          .in("project_id", projectIds)
          .is("deleted_at", null);
        tasks = td || [];
      }

      const today = new Date().toISOString().slice(0, 10);
      const byProject = {};
      for (const t of tasks) {
        if (!byProject[t.project_id]) byProject[t.project_id] = [];
        byProject[t.project_id].push(t);
      }

      const enriched = (projects || []).map((p) => {
        const pt = byProject[p.id] || [];
        const total = pt.length;
        const done = pt.filter((t) => (Number(t.percent_complete) || 0) >= 100).length;
        const overdue = pt.filter((t) => (Number(t.percent_complete) || 0) < 100 && t.end_date && t.end_date < today).length;
        const overall = total > 0 ? Math.round(pt.reduce((s, t) => s + (Number(t.percent_complete) || 0), 0) / total) : 0;

        const nextMilestone = pt
          .filter((t) => (t.task_type === "milestone" || t.is_hold_point) && (Number(t.percent_complete) || 0) < 100 && t.start_date >= today)
          .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] || null;

        const activeTrades = [...new Set(
          pt.filter((t) => { const pct = Number(t.percent_complete) || 0; return pct > 0 && pct < 100; })
            .map((t) => t.assignee_trade || t.trade).filter(Boolean)
        )];

        const health = overdue >= 4 ? "red" : overdue >= 1 ? "amber" : "green";

        return { ...p, schedule: { total, done, overdue, overall, nextMilestone, activeTrades, health } };
      });

      return res.json({ ok: true, projects: enriched });
    } catch (e) {
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get("/api/operations/global-tasks", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured." });
    try {
      // BLH-E2E-001: exclude renamed/decommissioned ("…_DELETED") projects from the global Gantt (parity with /projects).
      const { data: projects } = await sb.from("projects").select("id, address").not("address", "ilike", "%_DELETED");
      const { data: tasks } = await sb
        .from("schedule_tasks")
        .select("id, project_id, name, phase, start_date, end_date, percent_complete, task_type, is_hold_point, assignee_trade, trade")
        .is("deleted_at", null)
        .order("start_date", { ascending: true, nullsFirst: false });
      return res.json({ ok: true, projects: projects || [], tasks: tasks || [] });
    } catch (e) {
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // ── Ops Job Map (G3-C) ──────────────────────────────────────────────────────
  // Active projects plotted at their linked job's geocoded coordinates.
  // projects.job_id → jobs.id → jobs.geo_lat/geo_lng (migration 134). Only rows
  // WITH coords are returned — the map plots real pins, not guesses.
  // Colour = schedule health (green/amber/red), the same overdue-derived signal
  // already used by /api/operations/projects + OpsProjectCard — there is no
  // reliable per-project "construction phase" column to key PHASE_COLOR_MAP off,
  // so health is the meaningful, already-established colour dimension here.

  app.get("/api/operations/jobs-map", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return err(res, 503, "Supabase not configured.");
    try {
      const { data: projects, error: pe } = await sb
        .from("projects")
        .select("id, job_id, address, status, jobs(id, geo_lat, geo_lng, geo_confidence)")
        .eq("status", "active")
        .not("address", "ilike", "%_DELETED");
      if (pe) throw pe;

      // Keep only rows whose linked job has usable coords.
      const withCoords = (projects || []).filter(
        (p) => p.jobs && Number.isFinite(Number(p.jobs.geo_lat)) && Number.isFinite(Number(p.jobs.geo_lng))
      );

      const projectIds = withCoords.map((p) => p.id);
      let tasksByProject = {};
      if (projectIds.length) {
        const { data: tasks } = await sb
          .from("schedule_tasks")
          .select("project_id, end_date, percent_complete")
          .in("project_id", projectIds)
          .is("deleted_at", null);
        const today = new Date().toISOString().slice(0, 10);
        for (const t of tasks || []) {
          if (!tasksByProject[t.project_id]) tasksByProject[t.project_id] = { overdue: 0 };
          const pct = Number(t.percent_complete) || 0;
          if (pct < 100 && t.end_date && t.end_date < today) tasksByProject[t.project_id].overdue += 1;
        }
      }

      const jobsMap = withCoords.map((p) => {
        const overdue = tasksByProject[p.id]?.overdue || 0;
        const health = overdue >= 4 ? "red" : overdue >= 1 ? "amber" : "green";
        return rowsToCamel([{
          id: p.id,
          job_id: p.job_id,
          address: p.address,
          status: p.status,
          geo_lat: Number(p.jobs.geo_lat),
          geo_lng: Number(p.jobs.geo_lng),
          geo_confidence: p.jobs.geo_confidence,
          health,
          overdue,
        }])[0];
      });

      // ── Carpentry layer (mig 138) — standalone/island sites plotted alongside ──
      // builder projects. Live statuses only (active/on_hold/defects); complete +
      // cancelled drop off. No schedule-health signal exists for carpentry (it uses
      // milestones, not schedule_tasks), so the client renders these as a distinct
      // flat-colour square marker rather than a health colour. Fail-soft: if the geo
      // columns aren't present yet (mig 138 not applied), skip this layer — the
      // builder map must never break because carpentry geo isn't backfilled.
      let carpentryMap = [];
      try {
        const { data: carpRows, error: ce } = await sb
          .from("carpentry_jobs")
          .select("id, reference, address, status, client_name, geo_lat, geo_lng, geo_confidence")
          .in("status", ["active", "on_hold", "defects"])
          .not("geo_lat", "is", null);
        if (ce) throw ce;
        carpentryMap = (carpRows || [])
          .filter((c) => Number.isFinite(Number(c.geo_lat)) && Number.isFinite(Number(c.geo_lng)))
          .map((c) => rowsToCamel([{
            id: c.id,
            reference: c.reference,
            address: c.address,
            status: c.status,
            client_name: c.client_name,
            geo_lat: Number(c.geo_lat),
            geo_lng: Number(c.geo_lng),
            geo_confidence: c.geo_confidence,
            kind: "carpentry",
          }])[0]);
      } catch (carpErr) {
        console.warn("[operations/jobs-map] carpentry layer skipped:", carpErr?.message || carpErr);
      }

      return ok(res, { jobsMap, carpentryMap });
    } catch (e) {
      console.error("[operations/jobs-map]", e);
      return err(res, 502, e?.message || String(e));
    }
  });

  // ── Trade conflict detection ───────────────────────────────────────────────

  app.get("/api/operations/trade-conflicts", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured." });
    try {
      // Fetch all incomplete tasks with a trade assigned and valid date range
      const { data: tasks, error } = await sb
        .from("schedule_tasks")
        .select("id, project_id, name, assignee_trade, trade, start_date, end_date, percent_complete, projects(id, address, status)")
        .is("deleted_at", null)
        .not("start_date", "is", null)
        .not("end_date", "is", null)
        .lt("percent_complete", 100);
      if (error) throw error;

      // Filter to active projects only; use assignee_trade ?? trade
      const activeTasks = (tasks || []).filter(
        t => t.projects?.status === "active" && (t.assignee_trade || t.trade)
      ).map(t => ({
        id: t.id,
        project_id: t.project_id,
        address: t.projects?.address || "Unknown",
        tradeName: (t.assignee_trade || t.trade).trim(),
        taskName: t.name,
        start: t.start_date,
        end: t.end_date,
      }));

      // Group by trade name
      const byTrade = {};
      for (const t of activeTasks) {
        if (!byTrade[t.tradeName]) byTrade[t.tradeName] = [];
        byTrade[t.tradeName].push(t);
      }

      // Find overlapping date ranges across different projects
      const conflicts = [];
      for (const [tradeName, tradeTasks] of Object.entries(byTrade)) {
        const conflictingProjects = new Map(); // projectId → {address, taskName, startDate, endDate}

        for (let i = 0; i < tradeTasks.length; i++) {
          for (let j = i + 1; j < tradeTasks.length; j++) {
            const a = tradeTasks[i];
            const b = tradeTasks[j];
            if (a.project_id === b.project_id) continue; // same project = fine
            // Date range overlap: a.start <= b.end AND b.start <= a.end
            if (a.start <= b.end && b.start <= a.end) {
              if (!conflictingProjects.has(a.project_id)) {
                conflictingProjects.set(a.project_id, { id: a.project_id, address: a.address, taskName: a.taskName, startDate: a.start, endDate: a.end });
              }
              if (!conflictingProjects.has(b.project_id)) {
                conflictingProjects.set(b.project_id, { id: b.project_id, address: b.address, taskName: b.taskName, startDate: b.start, endDate: b.end });
              }
            }
          }
        }

        if (conflictingProjects.size >= 2) {
          conflicts.push({ trade: tradeName, projects: [...conflictingProjects.values()] });
        }
      }

      return res.json({ ok: true, conflicts });
    } catch (e) {
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // ── Trade Commitment Engine routes ────────────────────────────────────────

  /**
   * GET /api/projects/:id/trades
   * Returns all purchase orders for the project with communication log + supervisor tasks.
   */
  app.get("/api/projects/:id/trades", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { id: projectId } = req.params;
    try {
      const { data: pos, error: poErr } = await sb
        .from("purchase_orders")
        .select(`
          id, trade, po_number, status,
          po_sent_at, commencement_notified_at, stage_notified_at,
          last_contact_at, response_received_at,
          follow_up_1_sent_at, follow_up_2_sent_at,
          subcontractor_id,
          subcontractors ( id, business_name, contact, mobile, email )
        `)
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (poErr) throw new Error(poErr.message);

      // Fetch accepted RFQs with no PO (to show "PO not issued" rows)
      const { data: acceptedRfqs } = await sb
        .from("rfqs")
        .select("id, trade, subcontractor_id, subcontractors(id, business_name, contact, mobile, email)")
        .eq("project_id", projectId)
        .eq("status", "accepted");

      const existingPoSubIds = new Set((pos || []).map(p => p.subcontractor_id).filter(Boolean));
      const noPo = (acceptedRfqs || []).filter(r => !existingPoSubIds.has(r.subcontractor_id));

      const poIds = (pos || []).map(p => p.id);

      // Fetch communication log for these POs
      const { data: logRows } = poIds.length
        ? await sb
          .from("trade_communication_log")
          .select("id, purchase_order_id, event_type, sent_at, email_subject, tentative_start_label, response_status")
          .in("purchase_order_id", poIds)
          .order("sent_at", { ascending: false })
        : { data: [] };

      // Fetch pending supervisor tasks for these POs
      const { data: taskRows } = poIds.length
        ? await sb
          .from("supervisor_tasks")
          .select("id, purchase_order_id, task_type, title, description, due_date, status")
          .in("purchase_order_id", poIds)
          .eq("status", "pending")
        : { data: [] };

      const logByPo = {};
      for (const l of logRows || []) {
        if (!logByPo[l.purchase_order_id]) logByPo[l.purchase_order_id] = [];
        logByPo[l.purchase_order_id].push(l);
      }
      const tasksByPo = {};
      for (const t of taskRows || []) {
        if (!tasksByPo[t.purchase_order_id]) tasksByPo[t.purchase_order_id] = [];
        tasksByPo[t.purchase_order_id].push(t);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const trades = (pos || []).map(po => {
        const lastContact = po.last_contact_at ? new Date(po.last_contact_at) : (po.po_sent_at ? new Date(po.po_sent_at) : null);
        let daysSince = null;
        if (lastContact) {
          lastContact.setHours(0, 0, 0, 0);
          daysSince = Math.floor((today - lastContact) / (24 * 60 * 60 * 1000));
        }
        const log = logByPo[po.id] || [];
        const latestEvent = log[0] || null;
        const tasks = tasksByPo[po.id] || [];

        let statusLabel = "PO issued";
        if (po.response_received_at) statusLabel = "Response received";
        else if (po.stage_notified_at) statusLabel = "Stage notice sent";
        else if (po.commencement_notified_at) statusLabel = "Commencement notice sent";
        else if (po.po_sent_at) statusLabel = "PO issued";

        const isGhosting = !po.response_received_at && daysSince !== null && daysSince >= 5;

        return {
          id: po.id,
          trade: po.trade,
          po_number: po.po_number,
          status: po.status,
          po_sent_at: po.po_sent_at,
          response_received_at: po.response_received_at,
          last_contact_at: po.last_contact_at,
          days_since_contact: daysSince,
          status_label: statusLabel,
          is_ghosting: isGhosting,
          subcontractor: po.subcontractors || null,
          latest_event: latestEvent,
          log,
          supervisor_tasks: tasks,
        };
      });

      // Append "no PO" rows
      for (const rfq of noPo) {
        trades.push({
          id: null,
          trade: rfq.trade,
          po_number: null,
          status: null,
          po_sent_at: null,
          response_received_at: null,
          last_contact_at: null,
          days_since_contact: null,
          status_label: "PO not issued",
          is_ghosting: false,
          subcontractor: rfq.subcontractors || null,
          latest_event: null,
          log: [],
          supervisor_tasks: [],
        });
      }

      // Fetch project commencement date
      const { data: proj } = await sb
        .from("projects")
        .select("commencement_date, contract_signed_at")
        .eq("id", projectId)
        .single();

      return res.json({ ok: true, trades, commencement_date: proj?.commencement_date || null, contract_signed_at: proj?.contract_signed_at || null });
    } catch (e) {
      console.error("[projects/trades]", e);
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  /**
   * PATCH /api/projects/:id/commencement
   * Update project commencement_date (and optionally contract_signed_at).
   */
  app.patch("/api/projects/:id/commencement", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { id: projectId } = req.params;
    try {
      const update = {};
      if (req.body?.commencement_date !== undefined) update.commencement_date = req.body.commencement_date || null;
      if (req.body?.contract_signed !== undefined) update.contract_signed_at = req.body.contract_signed ? new Date().toISOString() : null;
      const { error } = await sb.from("projects").update(update).eq("id", projectId);
      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  /**
   * POST /api/trade-communication/respond
   * Record a response against a purchase order.
   */
  app.post("/api/trade-communication/respond", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { purchase_order_id, response_status, notes } = req.body || {};
    if (!purchase_order_id || !response_status) {
      return res.status(400).json({ ok: false, error: "purchase_order_id and response_status required" });
    }
    const validStatuses = ["responded", "unsure", "ghosted", "unavailable"];
    if (!validStatuses.includes(response_status)) {
      return res.status(400).json({ ok: false, error: "Invalid response_status" });
    }
    try {
      const nowIso = new Date().toISOString();
      const { data: po, error: poErr } = await sb
        .from("purchase_orders")
        .update({ response_received_at: nowIso, last_contact_at: nowIso })
        .eq("id", purchase_order_id)
        .select("id, project_id, subcontractor_id, trade, subcontractors(contact, email, business_name, mobile), projects(address)")
        .single();
      if (poErr) throw new Error(poErr.message);

      await sb.from("trade_communication_log").insert({
        purchase_order_id,
        project_id: po.project_id,
        subcontractor_id: po.subcontractor_id,
        event_type: "response_received",
        response_status,
        response_notes: notes || null,
        response_received_at: nowIso,
      });

      // If ghosted or unavailable — create find_backup_trade task + send conflict email
      if (response_status === "ghosted" || response_status === "unavailable") {
        const sub = po.subcontractors || {};
        const proj = po.projects || {};
        const jobAddress = proj.address || "";
        const contactName = sub.contact || "there";
        const email = sub.email || "";

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 2);

        await sb.from("supervisor_tasks").insert({
          project_id: po.project_id,
          purchase_order_id,
          subcontractor_id: po.subcontractor_id,
          task_type: "find_backup_trade",
          title: `Find backup ${po.trade} for ${jobAddress}`,
          description: `${sub.business_name || po.trade} is ${response_status === "ghosted" ? "unresponsive" : "unavailable"}. Find an alternate ${po.trade} subcontractor.`,
          due_date: dueDate.toISOString().slice(0, 10),
        });

        if (email) {
          const logo = await getBrandingEmailLogo(sb).catch(() => "");
          const tmpl = emailAvailabilityConflict({ contactName, jobAddress, trade: po.trade, logo });
          sendPlainMail({ to: email, subject: tmpl.subject, text: tmpl.text, html: tmpl.html })
            .catch(e => console.warn("[trade-respond] conflict email:", e.message));

          await sb.from("trade_communication_log").insert({
            purchase_order_id,
            project_id: po.project_id,
            subcontractor_id: po.subcontractor_id,
            event_type: "availability_conflict",
            email_subject: tmpl.subject,
          });
        }
      }

      return res.json({ ok: true });
    } catch (e) {
      console.error("[trade-communication/respond]", e);
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  /**
   * PATCH /api/supervisor-tasks/:id
   * Update a supervisor task status/due_date/description.
   */
  app.patch("/api/supervisor-tasks/:id", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { id } = req.params;
    try {
      const update = {};
      if (req.body?.status !== undefined) update.status = req.body.status;
      if (req.body?.due_date !== undefined) update.due_date = req.body.due_date;
      if (req.body?.description !== undefined) update.description = req.body.description;
      if (update.status === "done") update.completed_at = new Date().toISOString();
      const { error } = await sb.from("supervisor_tasks").update(update).eq("id", id);
      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  /**
   * GET /api/projects/:id/supervisor-tasks
   * Returns all supervisor_tasks for the project ordered by due_date ASC.
   */
  app.get("/api/projects/:id/supervisor-tasks", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const { id: projectId } = req.params;
    const statusFilter = req.query.status || "pending";
    try {
      const { data: tasks, error } = await sb
        .from("supervisor_tasks")
        .select(`
          id, task_type, title, description, due_date, status, created_at, completed_at,
          purchase_order_id, subcontractor_id,
          purchase_orders ( id, po_number, trade ),
          subcontractors ( id, business_name, contact, mobile )
        `)
        .eq("project_id", projectId)
        .in("status", statusFilter === "all" ? ["pending", "in_progress", "done", "dismissed"] : [statusFilter, "in_progress"])
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return res.json({ ok: true, tasks: tasks || [] });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  /**
   * GET /api/projects/:projectId/ops-readiness
   * Read-only post-win operations setup checklist (P0-B5).
   */
  app.get("/api/projects/:projectId/ops-readiness", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const projectId = String(req.params.projectId || "").trim();
    if (!projectId) return res.status(400).json({ ok: false, error: "projectId required" });
    try {
      const { data: project, error: pErr } = await sb.from("projects").select("id").eq("id", projectId).maybeSingle();
      if (pErr) throw pErr;
      if (!project) return res.status(404).json({ ok: false, error: "Project not found" });
      const readiness = await computeOpsReadiness(sb, { projectId });
      return res.json({ ok: true, ...readiness });
    } catch (e) {
      console.error("[ops-readiness/project]", e);
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  /**
   * GET /api/jobs/:jobId/ops-readiness
   * Alias — resolves project via job_id (P0-B5).
   */
  app.get("/api/jobs/:jobId/ops-readiness", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    const jobId = String(req.params.jobId || "").trim();
    if (!jobId) return res.status(400).json({ ok: false, error: "jobId required" });
    try {
      const { data: job, error: jErr } = await sb.from("jobs").select("id").eq("id", jobId).maybeSingle();
      if (jErr) throw jErr;
      if (!job) return res.status(404).json({ ok: false, error: "Job not found" });
      const readiness = await computeOpsReadiness(sb, { jobId });
      return res.json({ ok: true, ...readiness });
    } catch (e) {
      console.error("[ops-readiness/job]", e);
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  /**
   * POST /api/cron/trade-ghost-check
   * Mutates trade-commitment state (marks trades unresponsive). Guarded by the same
   * CRON_SECRET shared-secret as /api/cron/portal-sync: when CRON_SECRET is set,
   * callers must present it (x-cron-secret header or ?secret=).
   */
  app.post("/api/cron/trade-ghost-check", requireCronSecretOrAdmin, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
    try {
      const { runGhostCheck } = await import("./tradeCommitment.mjs");
      const result = await runGhostCheck(sb);
      return res.json(result);
    } catch (e) {
      console.error("[cron/trade-ghost-check]", e);
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
