import Anthropic from "@anthropic-ai/sdk";
import { getServiceSupabase } from "./supabaseService.mjs";
import { buildScheduleRowsForInsert, attachDependsOnUuids, stripDynamicScheduleRow, buildRowsFromClaudePlan, buildFallbackRowsFromCategories, attachDependsOnTempIds, buildConcurrentUuidUpdates } from "./scheduleGenerate.mjs";
import { resolveScheduleCategoryBlocks } from "./scheduleCategories.mjs";
import { generateSchedulePlanWithClaude } from "./scheduleClaudePlan.mjs";
import { attachCriticalPathFlags } from "./scheduleCriticalPath.mjs";
import {
  getDropboxAccessToken,
  dropboxUploadBuffer,
  sharedJobRootPath,
  DROPBOX_PRIVATE_INTERNAL_BASE,
  sanitizeTradeOrBusinessSegment,
  ensureParentFoldersForFile
} from "./dropboxClient.mjs";
import {
  buildSiteDiaryPdfBuffer,
  buildIncidentReportPdfBuffer,
  buildScheduleAnalysisPdfBuffer,
  buildScheduleGanttPdfBuffer
} from "./module6PdfKit.mjs";
import { toYmd, addDaysYmd } from "./dateYmd.mjs";

const MODEL = process.env.CLAUDE_MODEL || process.env.MODEL || "claude-sonnet-4-5";

function addDays(iso, n) {
  return addDaysYmd(iso, n);
}

function computeTaskEnd(start, durationDays, isHold) {
  if (!start) return null;
  const sd = toYmd(start);
  if (!sd) return null;
  if (Number(durationDays) <= 0 || isHold) return sd;
  return addDaysYmd(sd, Number(durationDays) - 1);
}

function complianceStatusFromExpiry(expiryDate) {
  if (!expiryDate) return "missing";
  const ymd = toYmd(expiryDate);
  if (!ymd) return "missing";
  const e = new Date(`${ymd}T00:00:00`);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  if (e < t) return "expired";
  const soon = new Date(t);
  soon.setDate(soon.getDate() + 30);
  if (e <= soon) return "expiring_soon";
  return "current";
}

function safeFileSegment(s, max = 80) {
  return String(s || "file")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, max);
}

async function claudeText(prompt) {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured.");
  const client = new Anthropic({ apiKey: key, maxRetries: 0 });
  const completion = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    temperature: 0.2,
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }]
  });
  return completion.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

async function cascadeScheduleForward(sb, projectId, rootTaskId) {
  const { data: all, error } = await sb.from("schedule_tasks").select("*").eq("project_id", projectId);
  if (error) throw error;
  const byId = new Map((all || []).map((t) => [t.id, { ...t }]));
  const root = byId.get(rootTaskId);
  if (!root) return [];

  root.end_date = computeTaskEnd(root.start_date, root.duration_days, root.is_hold_point);
  byId.set(root.id, root);

  const updated = new Set([root.id]);
  const queue = [rootTaskId];
  while (queue.length) {
    const cid = queue.shift();
    const parent = byId.get(cid);
    if (!parent || !parent.end_date) continue;
    for (const t of byId.values()) {
      const deps = t.depends_on || [];
      if (!deps.includes(cid)) continue;
      const predEnds = deps.map((id) => byId.get(id)?.end_date).filter(Boolean);
      if (!predEnds.length) continue;
      const maxEnd = predEnds.reduce((a, b) => (a > b ? a : b));
      const requiredStart = addDays(maxEnd, 1);
      if (!t.start_date || t.start_date < requiredStart) {
        t.start_date = requiredStart;
        t.end_date = computeTaskEnd(t.start_date, t.duration_days, t.is_hold_point);
        if (t.procurement_lead_days && t.procurement_lead_days > 0) {
          t.order_by_date = addDays(t.start_date, -t.procurement_lead_days);
        } else if (t.lead_time_weeks != null && Number(t.lead_time_weeks) > 0) {
          t.order_by_date = addDays(t.start_date, -Math.round(Number(t.lead_time_weeks) * 7));
        }
        byId.set(t.id, t);
        if (!updated.has(t.id)) {
          updated.add(t.id);
          queue.push(t.id);
        }
      }
    }
  }

  const nowIso = new Date().toISOString();
  for (const id of updated) {
    const row = byId.get(id);
    const { error: uerr } = await sb
      .from("schedule_tasks")
      .update({
        start_date: row.start_date,
        end_date: row.end_date,
        order_by_date: row.order_by_date ?? null,
        updated_at: nowIso
      })
      .eq("id", id);
    if (uerr) throw uerr;
  }
  return [...updated];
}

/**
 * @param {import("express").Express} app
 */
export function registerModule6Routes(app) {
  app.post("/api/schedule/generate", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.body?.projectId || "").trim();
      const startDateRaw = String(req.body?.startDate || "").trim();
      const startDate = toYmd(startDateRaw);
      if (!projectId || !startDate) {
        return res.status(400).json({
          ok: false,
          error: !startDate ? "startDate must be YYYY-MM-DD (or DD/MM/YYYY)." : "projectId and startDate required."
        });
      }
      const overrides = req.body?.overrides && typeof req.body.overrides === "object" ? req.body.overrides : {};

      const { data: proj, error: pe } = await sb
        .from("projects")
        .select("id, accepted_trades, address, job_id, buildexact_job_id")
        .eq("id", projectId)
        .single();
      if (pe || !proj) return res.status(404).json({ ok: false, error: pe?.message || "Project not found." });

      await sb.from("schedule_tasks").delete().eq("project_id", projectId);

      const excludeNames = Array.isArray(overrides.excludeNames) ? overrides.excludeNames : [];
      const useLegacy = Boolean(overrides.useLegacyTemplate);

      let rows;
      let categorySource = "legacy";
      let plannedVia = "legacy";

      if (useLegacy) {
        rows = buildScheduleRowsForInsert(projectId, startDate, proj.accepted_trades || [], { excludeNames });
      } else {
        const catCtx = await resolveScheduleCategoryBlocks(sb, proj);
        categorySource = catCtx.source;
        try {
          if (process.env.ANTHROPIC_API_KEY?.trim()) {
            const { tasks: aiTasks } = await generateSchedulePlanWithClaude({ categoryBlocks: catCtx.categories });
            rows = buildRowsFromClaudePlan(projectId, startDate, aiTasks, catCtx.categories);
            plannedVia = "claude";
          } else {
            rows = buildFallbackRowsFromCategories(projectId, startDate, catCtx.categories);
            plannedVia = "fallback_no_api_key";
          }
        } catch (err) {
          console.warn("[schedule/generate] planner", err?.message || err);
          rows = buildFallbackRowsFromCategories(projectId, startDate, catCtx.categories);
          plannedVia = "fallback_error";
        }
      }

      const insertPayload = useLegacy
        ? rows.map(({ _depends_names, ...rest }) => ({
            ...rest,
            depends_on: [],
            updated_at: new Date().toISOString()
          }))
        : rows.map((r) => ({
            ...stripDynamicScheduleRow(r),
            depends_on: [],
            updated_at: new Date().toISOString()
          }));

      const { data: inserted, error: insE } = await sb.from("schedule_tasks").insert(insertPayload).select("id,name");
      if (insE) throw insE;
      const insertedIdsOrdered = (inserted || []).map((r) => r.id);

      if (useLegacy) {
        const nameToId = new Map((inserted || []).map((r) => [r.name, r.id]));
        const withIds = rows.map((r) => ({ id: nameToId.get(r.name) }));
        const depUpdates = attachDependsOnUuids(rows, withIds);
        for (const u of depUpdates) {
          await sb.from("schedule_tasks").update({ depends_on: u.depends_on, updated_at: new Date().toISOString() }).eq("id", u.id);
        }
      } else {
        const depUpdates = attachDependsOnTempIds(rows, insertedIdsOrdered);
        for (const u of depUpdates) {
          await sb.from("schedule_tasks").update({ depends_on: u.depends_on, updated_at: new Date().toISOString() }).eq("id", u.id);
        }
        const concUpdates = buildConcurrentUuidUpdates(rows, insertedIdsOrdered);
        for (const u of concUpdates) {
          await sb
            .from("schedule_tasks")
            .update({ can_run_concurrent_with: u.can_run_concurrent_with, updated_at: new Date().toISOString() })
            .eq("id", u.id);
        }
      }

      let { data: tasks, error: te } = await sb
        .from("schedule_tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("start_date", { ascending: true, nullsFirst: false });
      if (te) throw te;
      const flagged = attachCriticalPathFlags(tasks || []);
      for (const t of flagged) {
        await sb.from("schedule_tasks").update({ is_critical_path: Boolean(t.is_critical_path) }).eq("id", t.id);
      }
      ({ data: tasks, error: te } = await sb
        .from("schedule_tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("start_date", { ascending: true, nullsFirst: false }));
      if (te) throw te;

      const phases = new Set((tasks || []).map((t) => t.phase));
      let maxEnd = "";
      for (const t of tasks || []) {
        const e = String(t.end_date || t.start_date || "");
        if (e && e > maxEnd) maxEnd = e;
      }
      const summary = {
        taskCount: (tasks || []).length,
        phaseCount: phases.size,
        estimatedCompletion: maxEnd || null,
        categorySource,
        plannedVia
      };
      const summaryLine = `Schedule generated with ${summary.taskCount} tasks across ${summary.phaseCount} phases. Estimated completion: ${summary.estimatedCompletion || "—"}.`;

      return res.json({ ok: true, tasks: tasks || [], summary, summaryLine });
    } catch (e) {
      console.error("[schedule/generate]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get("/api/schedule/meta/:projectId", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const { data: proj, error: pe } = await sb
        .from("projects")
        .select("id, address, job_id, buildexact_job_id")
        .eq("id", projectId)
        .single();
      if (pe || !proj) return res.status(404).json({ ok: false, error: pe?.message || "Project not found." });
      const catCtx = await resolveScheduleCategoryBlocks(sb, proj);
      const phaseLabels = {};
      for (const b of catCtx.categories || []) {
        phaseLabels[b.phase] = b.phaseLabel;
      }
      return res.json({ ok: true, ...catCtx, phaseLabels });
    } catch (e) {
      console.error("[schedule/meta]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get("/api/schedule/:projectId", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const { data, error } = await sb
        .from("schedule_tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("start_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return res.json({ ok: true, tasks: data || [] });
    } catch (e) {
      console.error("[schedule/get]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.patch("/api/schedule/task/:id", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const id = String(req.params.id || "").trim();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const { data: cur, error: fe } = await sb.from("schedule_tasks").select("*").eq("id", id).single();
      if (fe || !cur) return res.status(404).json({ ok: false, error: "Task not found." });

      const patch = {};
      if (body.status != null) patch.status = String(body.status);
      if (body.name != null) patch.name = String(body.name).slice(0, 500);
      if (body.phase != null) patch.phase = String(body.phase).slice(0, 200);
      if (body.start_date != null) patch.start_date = String(body.start_date);
      if (body.duration_days != null) patch.duration_days = Number(body.duration_days);
      if (body.notes !== undefined) patch.notes = body.notes;
      if (body.assigned_subcontractor_id !== undefined) patch.assigned_subcontractor_id = body.assigned_subcontractor_id || null;
      if (body.is_hold_point != null) patch.is_hold_point = Boolean(body.is_hold_point);
      if (body.ai_flag === null) patch.ai_flag = null;
      else if (body.ai_flag != null) patch.ai_flag = String(body.ai_flag);
      if (Array.isArray(body.depends_on)) patch.depends_on = body.depends_on.filter(Boolean);
      if (Array.isArray(body.can_run_concurrent_with)) patch.can_run_concurrent_with = body.can_run_concurrent_with.filter(Boolean);
      if (body.lead_time_weeks !== undefined) {
        patch.lead_time_weeks = body.lead_time_weeks == null || body.lead_time_weeks === "" ? null : Number(body.lead_time_weeks);
      }
      if (body.hold_point_description !== undefined) patch.hold_point_description = body.hold_point_description;
      if (body.hold_notify !== undefined) patch.hold_notify = Boolean(body.hold_notify);
      if (body.is_critical_path != null) patch.is_critical_path = Boolean(body.is_critical_path);

      const merged = { ...cur, ...patch };
      merged.end_date = computeTaskEnd(merged.start_date, merged.duration_days, merged.is_hold_point);
      if (merged.lead_time_weeks != null && Number(merged.lead_time_weeks) > 0 && merged.start_date) {
        merged.order_by_date = addDays(merged.start_date, -Math.round(Number(merged.lead_time_weeks) * 7));
      } else if (merged.procurement_lead_days && merged.procurement_lead_days > 0 && merged.start_date) {
        merged.order_by_date = addDays(merged.start_date, -merged.procurement_lead_days);
      }
      merged.updated_at = new Date().toISOString();

      const { error: ue } = await sb
        .from("schedule_tasks")
        .update({
          name: merged.name,
          phase: merged.phase,
          status: merged.status,
          start_date: merged.start_date,
          end_date: merged.end_date,
          duration_days: merged.duration_days,
          notes: merged.notes,
          assigned_subcontractor_id: merged.assigned_subcontractor_id,
          is_hold_point: merged.is_hold_point,
          ai_flag: merged.ai_flag,
          order_by_date: merged.order_by_date,
          depends_on: merged.depends_on,
          can_run_concurrent_with: merged.can_run_concurrent_with,
          lead_time_weeks: merged.lead_time_weeks,
          hold_point_description: merged.hold_point_description,
          hold_notify: merged.hold_notify,
          is_critical_path: merged.is_critical_path,
          updated_at: merged.updated_at
        })
        .eq("id", id);
      if (ue) throw ue;

      let updatedIds = [id];
      if (body.start_date != null || body.duration_days != null || body.is_hold_point != null || Array.isArray(body.depends_on)) {
        const more = await cascadeScheduleForward(sb, cur.project_id, id);
        updatedIds = [...new Set([...updatedIds, ...more])];
      }

      return res.json({ ok: true, updated: updatedIds });
    } catch (e) {
      console.error("[schedule/patch]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.delete("/api/schedule/task/:id", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const id = String(req.params.id || "").trim();
      const { data: cur, error: fe } = await sb.from("schedule_tasks").select("id, project_id").eq("id", id).single();
      if (fe || !cur) return res.status(404).json({ ok: false, error: "Task not found." });
      const { error: de } = await sb.from("schedule_tasks").delete().eq("id", id);
      if (de) throw de;
      return res.json({ ok: true, deleted: id });
    } catch (e) {
      console.error("[schedule/delete]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/schedule/analyse", async (req, res) => {
    try {
      const projectId = String(req.body?.projectId || "").trim();
      if (!projectId) return res.status(400).json({ ok: false, error: "projectId required." });
      const sb = getServiceSupabase();
      if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
      const { data: tasks, error } = await sb
        .from("schedule_tasks")
        .select("*")
        .eq("project_id", projectId)
        .neq("status", "complete");
      if (error) throw error;
      const scheduleJson = JSON.stringify(tasks || [], null, 0);
      const prompt =
        "You are a residential construction scheduler. Analyse this build programme for Blue Leaf Building (Adelaide) and identify: (1) critical path — which tasks determine the end date, (2) sequencing problems, (3) procurement deadlines at risk within the next 4 weeks, (4) any trades scheduled concurrently that will conflict. Write in plain English for a builder, not a project manager. Be specific about task names and dates.\nSchedule: " +
        scheduleJson;
      const analysis = await claudeText(prompt);
      return res.json({ ok: true, analysis });
    } catch (e) {
      console.error("[schedule/analyse]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/schedule/save-analysis-pdf", async (req, res) => {
    try {
      const projectId = String(req.body?.projectId || "").trim();
      const analysisText = String(req.body?.analysisText || "").trim();
      if (!projectId || !analysisText) return res.status(400).json({ ok: false, error: "projectId and analysisText required." });
      const sb = getServiceSupabase();
      if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
      const { data: proj, error: pe } = await sb.from("projects").select("address").eq("id", projectId).single();
      if (pe || !proj) return res.status(404).json({ ok: false, error: "Project not found." });
      const day = new Date().toISOString().slice(0, 10);
      const buf = await buildScheduleAnalysisPdfBuffer({
        projectAddress: proj.address,
        analysisDate: day,
        analysisText,
        generatedAt: new Date().toISOString()
      });
      const rel = `${sharedJobRootPath(proj.address)}/SCHEDULE/AI-ANALYSIS-${day}.pdf`;
      let dropbox_pdf_path = null;
      try {
        const token = await getDropboxAccessToken();
        await ensureParentFoldersForFile(token, rel);
        await dropboxUploadBuffer(token, rel, buf, { autorename: true });
        dropbox_pdf_path = rel;
      } catch (err) {
        console.warn("[schedule/save-analysis-pdf] Dropbox:", err?.message || err);
      }
      return res.json({ ok: true, dropbox_pdf_path });
    } catch (e) {
      console.error("[schedule/save-analysis-pdf]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/schedule/export-gantt-pdf", async (req, res) => {
    try {
      const projectId = String(req.body?.projectId || "").trim();
      if (!projectId) return res.status(400).json({ ok: false, error: "projectId required." });
      const sb = getServiceSupabase();
      if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
      const { data: proj, error: pe } = await sb.from("projects").select("address").eq("id", projectId).single();
      if (pe || !proj) return res.status(404).json({ ok: false, error: "Project not found." });
      const { data: tasks, error: te } = await sb
        .from("schedule_tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("start_date", { ascending: true, nullsFirst: false });
      if (te) throw te;
      const phases = new Set((tasks || []).map((t) => t.phase));
      let maxEnd = "";
      for (const t of tasks || []) {
        const e = String(t.end_date || t.start_date || "");
        if (e && e > maxEnd) maxEnd = e;
      }
      const summaryLine = `Tasks: ${(tasks || []).length} across ${phases.size} phases. Est. completion: ${maxEnd || "—"}.`;
      const buf = await buildScheduleGanttPdfBuffer({
        projectAddress: proj.address,
        tasks: tasks || [],
        summaryLine,
        generatedAt: new Date().toISOString()
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="schedule-gantt-${projectId.slice(0, 8)}.pdf"`);
      return res.send(buf);
    } catch (e) {
      console.error("[schedule/export-gantt-pdf]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/schedule/task-advice", async (req, res) => {
    try {
      const taskName = String(req.body?.taskName || "").trim();
      const context = String(req.body?.context || "").trim();
      if (!taskName) return res.status(400).json({ ok: false, error: "taskName required." });
      const prompt = `What should I consider when scheduling "${taskName}" for a residential renovation or new build in South Australia?${context ? `\n\nContext:\n${context}` : ""}\n\nAnswer in short bullet points for a builder (plain English).`;
      const advice = await claudeText(prompt);
      return res.json({ ok: true, advice });
    } catch (e) {
      console.error("[schedule/task-advice]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get("/api/whs/:projectId/compliance", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const { data: pos, error: poe } = await sb
        .from("purchase_orders")
        .select("subcontractor_id, subcontractors ( id, business_name, email, trade )")
        .eq("project_id", projectId)
        .not("subcontractor_id", "is", null);
      if (poe) throw poe;
      const subMap = new Map();
      for (const row of pos || []) {
        const sid = row.subcontractor_id;
        const sub = row.subcontractors;
        const s = Array.isArray(sub) ? sub[0] : sub;
        if (!sid || !s) continue;
        if (!subMap.has(sid)) {
          subMap.set(sid, {
            subcontractor_id: sid,
            name: s.business_name || s.email || "Subcontractor",
            email: s.email || "",
            trade: s.trade || "",
            documents: []
          });
        }
      }
      for (const sid of subMap.keys()) {
        const { data: docs } = await sb.from("contractor_compliance").select("*").eq("subcontractor_id", sid);
        const computed = (docs || []).map((d) => ({
          ...d,
          computed_status: d.expiry_date ? complianceStatusFromExpiry(d.expiry_date) : "missing"
        }));
        subMap.get(sid).documents = computed;
      }
      return res.json({ ok: true, subcontractors: [...subMap.values()] });
    } catch (e) {
      console.error("[whs/compliance list]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/whs/compliance", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const subcontractorId = String(req.body?.subcontractorId || "").trim();
      const documentType = String(req.body?.documentType || "").trim();
      const documentName = String(req.body?.documentName || "").trim();
      const expiryDate = req.body?.expiryDate ? String(req.body.expiryDate) : null;
      const issueDate = req.body?.issueDate ? String(req.body.issueDate) : null;
      const policyNumber = req.body?.policyNumber != null ? String(req.body.policyNumber) : null;
      const insurer = req.body?.insurer != null ? String(req.body.insurer) : null;
      const fileBase64 = String(req.body?.fileBase64 || "").trim();
      const fileName = String(req.body?.fileName || "document.pdf");
      if (!subcontractorId || !documentType || !fileBase64) {
        return res.status(400).json({ ok: false, error: "subcontractorId, documentType, fileBase64 required." });
      }

      const { data: sub, error: se } = await sb
        .from("subcontractors")
        .select("id, business_name")
        .eq("id", subcontractorId)
        .single();
      if (se || !sub) return res.status(404).json({ ok: false, error: "Subcontractor not found." });

      const subSeg = sanitizeTradeOrBusinessSegment(sub.business_name || "CONTRACTOR", 60);
      const day = new Date().toISOString().slice(0, 10);
      const ext = /\.(pdf|png|jpe?g|webp)$/i.test(fileName) ? fileName.match(/\.(pdf|png|jpe?g|webp)$/i)[0] : ".pdf";
      const dropRel = `${DROPBOX_PRIVATE_INTERNAL_BASE}/CONTRACTORS/${subSeg}/${documentType}-${day}${ext}`;
      let dropbox_path = null;
      try {
        const buf = Buffer.from(fileBase64.replace(/^data:.*,/, ""), "base64");
        const token = await getDropboxAccessToken();
        await ensureParentFoldersForFile(token, dropRel);
        await dropboxUploadBuffer(token, dropRel, buf, { autorename: true });
        dropbox_path = dropRel;
      } catch (err) {
        console.warn("[whs/compliance] Dropbox:", err?.message || err);
      }

      const status = expiryDate ? complianceStatusFromExpiry(expiryDate) : "missing";
      const insertRow = {
        subcontractor_id: subcontractorId,
        document_type: documentType,
        document_name: documentName || null,
        issue_date: issueDate,
        expiry_date: expiryDate,
        policy_number: policyNumber,
        insurer: insurer,
        dropbox_path,
        status,
        updated_at: new Date().toISOString()
      };
      const { data: doc, error: ie } = await sb.from("contractor_compliance").insert(insertRow).select("*").single();
      if (ie) throw ie;
      return res.json({ ok: true, document: { ...doc, computed_status: status } });
    } catch (e) {
      console.error("[whs/compliance post]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get("/api/whs/:projectId/inductions", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const { data, error } = await sb
        .from("site_inductions")
        .select("*")
        .eq("project_id", projectId)
        .order("inducted_at", { ascending: false });
      if (error) throw error;
      return res.json({ ok: true, inductions: data || [] });
    } catch (e) {
      console.error("[whs/inductions]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/whs/:projectId/reports", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const reportType = String(req.body?.reportType || "").trim();
      const severity = req.body?.severity ? String(req.body.severity) : null;
      const title = String(req.body?.title || "").trim();
      const description = req.body?.description != null ? String(req.body.description) : null;
      const correctiveAction = req.body?.correctiveAction != null ? String(req.body.correctiveAction) : null;
      const reportedBy = req.body?.reportedBy != null ? String(req.body.reportedBy) : null;
      const photosBase64 = Array.isArray(req.body?.photosBase64) ? req.body.photosBase64 : [];
      if (!projectId || !reportType || !title) return res.status(400).json({ ok: false, error: "reportType and title required." });

      const { data: proj, error: pe } = await sb.from("projects").select("address").eq("id", projectId).single();
      if (pe || !proj) return res.status(404).json({ ok: false, error: "Project not found." });

      const photo_paths = [];
      const day = new Date().toISOString().slice(0, 10);
      const root = sharedJobRootPath(proj.address);
      let token = null;
      try {
        token = await getDropboxAccessToken();
      } catch (err) {
        console.warn("[whs/reports] Dropbox token:", err?.message || err);
      }

      if (token) {
        let i = 0;
        for (const ph of photosBase64) {
          const name = safeFileSegment(ph?.name || `photo-${i}.jpg`);
          const b64 = String(ph?.data || "").replace(/^data:.*,/, "");
          if (!b64) continue;
          try {
            const buf = Buffer.from(b64, "base64");
            const ppath = `${root}/WHS/INCIDENTS/${day}-${safeFileSegment(title, 40)}-photo-${i}-${name}`;
            await ensureParentFoldersForFile(token, ppath);
            await dropboxUploadBuffer(token, ppath, buf, { autorename: true });
            photo_paths.push(ppath);
            i += 1;
          } catch (err) {
            console.warn("[whs/reports] photo upload:", err?.message || err);
          }
        }
      }

      const reportedAt = new Date().toISOString();
      const { data: inserted, error: ie } = await sb
        .from("site_reports")
        .insert({
          project_id: projectId,
          report_type: reportType,
          severity,
          title,
          description,
          corrective_action: correctiveAction,
          reported_by: reportedBy,
          status: "open",
          photo_paths,
          reported_at: reportedAt
        })
        .select("*")
        .single();
      if (ie) throw ie;

      let dropbox_pdf_path = null;
      if (token) {
        try {
          const pdfBuf = await buildIncidentReportPdfBuffer({
            projectAddress: proj.address,
            reportType,
            severity,
            title,
            description,
            correctiveAction,
            reportedBy,
            reportedAt,
            generatedAt: new Date().toISOString()
          });
          const pdfPath = `${root}/WHS/INCIDENTS/${day}-${safeFileSegment(title, 60)}.pdf`;
          await ensureParentFoldersForFile(token, pdfPath);
          await dropboxUploadBuffer(token, pdfPath, pdfBuf, { autorename: true });
          dropbox_pdf_path = pdfPath;
          await sb.from("site_reports").update({ dropbox_pdf_path }).eq("id", inserted.id);
        } catch (err) {
          console.warn("[whs/reports] PDF Dropbox:", err?.message || err);
        }
      }

      const { data: report } = await sb.from("site_reports").select("*").eq("id", inserted.id).single();
      return res.json({ ok: true, report });
    } catch (e) {
      console.error("[whs/reports post]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get("/api/whs/:projectId/reports", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const { data, error } = await sb.from("site_reports").select("*").eq("project_id", projectId).order("reported_at", { ascending: false });
      if (error) throw error;
      return res.json({ ok: true, reports: data || [] });
    } catch (e) {
      console.error("[whs/reports get]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.patch("/api/whs/report/:id", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const id = String(req.params.id || "").trim();
      const status = String(req.body?.status || "").trim();
      if (!id || status !== "resolved") return res.status(400).json({ ok: false, error: "Invalid request." });
      const now = new Date().toISOString();
      const { data, error } = await sb
        .from("site_reports")
        .update({ status: "resolved", resolved_at: now })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return res.json({ ok: true, report: data });
    } catch (e) {
      console.error("[whs/report patch]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/whs/swms", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const trade = String(req.body?.trade || "").trim();
      const title = String(req.body?.title || "").trim();
      const contentHtml = req.body?.contentHtml != null ? String(req.body.contentHtml) : null;
      if (!trade || !title) return res.status(400).json({ ok: false, error: "trade and title required." });
      const { data: template, error } = await sb
        .from("swms_templates")
        .insert({ trade, title, content_html: contentHtml, is_active: true })
        .select("*")
        .single();
      if (error) throw error;
      return res.json({ ok: true, template });
    } catch (e) {
      console.error("[whs/swms post]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get("/api/whs/swms", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const trade = req.query.trade ? String(req.query.trade).trim().toLowerCase() : null;
      const { data, error } = await sb.from("swms_templates").select("*").eq("is_active", true).order("trade");
      if (error) throw error;
      let rows = data || [];
      if (trade) {
        rows = rows.filter((r) => String(r.trade || "").toLowerCase().includes(trade) || trade.includes(String(r.trade || "").toLowerCase()));
      }
      return res.json({ ok: true, templates: rows });
    } catch (e) {
      console.error("[whs/swms get]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/diary/structure", async (req, res) => {
    try {
      const transcript = String(req.body?.transcript || "").trim();
      const projectAddress = String(req.body?.projectAddress || "").trim();
      if (!transcript) return res.status(400).json({ ok: false, error: "transcript required." });
      const prompt = `Extract and structure this site diary transcript for ${projectAddress || "the site"}.
Return JSON with these exact keys:
{ "weather", "trades_onsite": [], "work_completed", "issues", "instructions_given", "visitors" }
trades_onsite should be an array of trade name strings.
Be concise and factual. Australian English.

Transcript:
${transcript}`;
      const raw = await claudeText(prompt + "\n\nReturn only valid JSON, no markdown.");
      let structured;
      try {
        structured = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
      } catch {
        structured = {
          weather: "",
          trades_onsite: [],
          work_completed: raw,
          issues: "",
          instructions_given: "",
          visitors: ""
        };
      }
      return res.json({ ok: true, structured });
    } catch (e) {
      console.error("[diary/structure]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/diary/save", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.body?.projectId || "").trim();
      const entry = req.body?.entry && typeof req.body.entry === "object" ? req.body.entry : {};
      if (!projectId) return res.status(400).json({ ok: false, error: "projectId required." });

      const { data: proj, error: pe } = await sb.from("projects").select("address").eq("id", projectId).single();
      if (pe || !proj) return res.status(404).json({ ok: false, error: "Project not found." });

      const row = {
        project_id: projectId,
        entry_date: entry.entry_date || new Date().toISOString().slice(0, 10),
        weather: entry.weather ?? null,
        trades_onsite: Array.isArray(entry.trades_onsite) ? entry.trades_onsite : [],
        work_completed: entry.work_completed ?? null,
        issues: entry.issues ?? null,
        instructions_given: entry.instructions_given ?? null,
        visitors: entry.visitors ?? null,
        raw_voice_transcript: entry.raw_voice_transcript ?? null,
        structured_by_ai: Boolean(entry.structured_by_ai),
        supervisor: entry.supervisor ?? null
      };

      const { data: saved, error: se } = await sb.from("site_diary").insert(row).select("*").single();
      if (se) throw se;

      let dropbox_pdf_path = null;
      try {
        const token = await getDropboxAccessToken();
        const pdfBuf = await buildSiteDiaryPdfBuffer({
          projectAddress: proj.address,
          entryDate: row.entry_date,
          weather: row.weather,
          tradesOnsite: row.trades_onsite,
          workCompleted: row.work_completed,
          issues: row.issues,
          instructionsGiven: row.instructions_given,
          visitors: row.visitors,
          supervisor: row.supervisor,
          generatedAt: new Date().toISOString()
        });
        const rel = `${sharedJobRootPath(proj.address)}/SITE DIARY/${row.entry_date}.pdf`;
        await ensureParentFoldersForFile(token, rel);
        await dropboxUploadBuffer(token, rel, pdfBuf, { autorename: true });
        dropbox_pdf_path = rel;
        await sb.from("site_diary").update({ dropbox_pdf_path }).eq("id", saved.id);
      } catch (err) {
        console.warn("[diary/save] Dropbox:", err?.message || err);
      }

      const { data: entryOut } = await sb.from("site_diary").select("*").eq("id", saved.id).single();
      return res.json({ ok: true, entry: entryOut, dropbox_pdf_path: entryOut?.dropbox_pdf_path || null });
    } catch (e) {
      console.error("[diary/save]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get("/api/diary/:projectId", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const limit = req.query.limit ? Math.min(100, Math.max(1, Number(req.query.limit))) : null;
      let q = sb.from("site_diary").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return res.json({ ok: true, entries: data || [] });
    } catch (e) {
      console.error("[diary/get]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
