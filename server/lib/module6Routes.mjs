import Anthropic from "@anthropic-ai/sdk";
import { getServiceSupabase } from "./supabaseService.mjs";
import { buildScheduleRowsForInsert, attachDependsOnUuids, stripDynamicScheduleRow, buildRowsFromClaudePlan, buildFallbackRowsFromCategories, attachDependsOnTempIds, buildConcurrentUuidUpdates, attachTaskDependenciesUuids } from "./scheduleGenerate.mjs";
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

function clampPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function statusFromPercent(percent, fallback = "planned") {
  const p = clampPercent(percent);
  if (p >= 100) return "complete";
  if (p > 0) return "in_progress";
  return fallback && fallback !== "complete" && fallback !== "in_progress" ? fallback : "planned";
}

function normaliseTask(t = {}) {
  let c = t.can_run_concurrent_with;
  if (typeof c === "string") {
    try {
      c = JSON.parse(c);
    } catch {
      c = [];
    }
  }
  let bx = t.buildexact_match;
  if (typeof bx === "string") {
    try {
      bx = JSON.parse(bx);
    } catch {
      bx = null;
    }
  }
  const taskType = t.task_type || (t.is_hold_point || Number(t.duration_days) === 0 ? "milestone" : "standard");
  const percent = t.percent_complete != null ? clampPercent(t.percent_complete) : t.status === "complete" ? 100 : t.status === "in_progress" ? 50 : 0;
  return {
    ...t,
    task_type: taskType,
    percent_complete: percent,
    depends_on: Array.isArray(t.depends_on) ? t.depends_on : [],
    can_run_concurrent_with: Array.isArray(c) ? c : [],
    procurement_order_by: toYmd(t.procurement_order_by) || toYmd(t.order_by_date) || null,
    order_by_date: toYmd(t.order_by_date) || toYmd(t.procurement_order_by) || null,
    procurement_order_status: t.procurement_order_status || "not_ordered",
    assignee_trade: t.assignee_trade || t.trade || "",
    priority: t.priority || "medium",
    buildexact_match: bx || null
  };
}

function addMaybeDays(ymd, n) {
  const d = toYmd(ymd);
  if (!d) return null;
  return addDaysYmd(d, Number(n) || 0);
}

function computeOrderBy(task) {
  const start = toYmd(task.start_date);
  if (!start) return null;
  if (task.procurement_lead_days != null && Number(task.procurement_lead_days) > 0) return addDaysYmd(start, -Number(task.procurement_lead_days));
  if (task.lead_time_weeks != null && Number(task.lead_time_weeks) > 0) return addDaysYmd(start, -Math.round(Number(task.lead_time_weeks) * 7));
  return toYmd(task.procurement_order_by || task.order_by_date) || null;
}

function daysBetween(a, b) {
  const aa = toYmd(a);
  const bb = toYmd(b);
  if (!aa || !bb) return 0;
  return Math.round((new Date(`${bb}T12:00:00`) - new Date(`${aa}T12:00:00`)) / 86400000);
}

function procurementStatus(task, today = new Date().toISOString().slice(0, 10)) {
  const orderBy = toYmd(task.procurement_order_by || task.order_by_date) || computeOrderBy(task);
  if (!orderBy) return { tone: "muted", label: "No order date", daysUntil: null, orderBy: null };
  const daysUntil = daysBetween(today, orderBy);
  if (task.procurement_order_status === "delivered") return { tone: "green", label: "Delivered", daysUntil, orderBy };
  if (daysUntil < 0) return { tone: "red", label: `${Math.abs(daysUntil)}d overdue`, daysUntil, orderBy };
  if (daysUntil <= 7) return { tone: "amber", label: `${daysUntil}d to order`, daysUntil, orderBy };
  return { tone: "green", label: `${daysUntil}d to order`, daysUntil, orderBy };
}

function scheduleDashboard(tasksInput, phaseLabels = {}, webhookEvents = []) {
  const tasks = (tasksInput || []).map(normaliseTask);
  const today = new Date().toISOString().slice(0, 10);
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "complete" || t.percent_complete >= 100).length;
  const inProgress = tasks.filter((t) => t.status === "in_progress" || (t.percent_complete > 0 && t.percent_complete < 100)).length;
  const notStarted = Math.max(0, total - done - inProgress);
  const incomplete = tasks.filter((t) => t.percent_complete < 100 && t.status !== "complete");
  const overdue = incomplete.filter((t) => toYmd(t.end_date) && toYmd(t.end_date) < today).length;
  const overallPercent = total ? Math.round(tasks.reduce((sum, t) => sum + clampPercent(t.percent_complete), 0) / total) : 0;
  const dated = tasks.filter((t) => toYmd(t.start_date) && toYmd(t.end_date));
  const projectStart = dated.map((t) => toYmd(t.start_date)).sort()[0] || today;
  const projectEnd = dated.map((t) => toYmd(t.end_date)).sort().at(-1) || today;
  const plannedSpan = Math.max(1, daysBetween(projectStart, projectEnd));
  const plannedPercentByDate = Math.max(0, Math.min(100, Math.round((Math.max(0, daysBetween(projectStart, today)) / plannedSpan) * 100)));
  const daysOffset = Math.round(((overallPercent - plannedPercentByDate) / 100) * plannedSpan);
  const groups = new Map();
  for (const t of tasks) {
    const phase = t.phase || "general";
    if (!groups.has(phase)) groups.set(phase, []);
    groups.get(phase).push(t);
  }
  const phaseRows = [...groups.entries()].map(([phase, list]) => ({
    phase,
    label: phaseLabels[phase] || phase.replace(/_/g, " "),
    count: list.length,
    progress: list.length ? Math.round(list.reduce((sum, t) => sum + clampPercent(t.percent_complete), 0) / list.length) : 0,
    planned_hours: list.reduce((sum, t) => sum + (Number(t.planned_hours) || 0), 0),
    planned_cost: list.reduce((sum, t) => sum + (Number(t.planned_cost) || 0), 0),
    overdue: list.filter((t) => t.percent_complete < 100 && toYmd(t.end_date) && toYmd(t.end_date) < today).length
  }));
  const procurement = tasks
    .filter((t) => t.task_type === "procurement" || t.procurement_item || t.procurement_order_by || t.order_by_date)
    .map((t) => ({ ...t, procurement_status: procurementStatus(t, today) }))
    .sort((a, b) => String(a.procurement_order_by || a.order_by_date || "9999-12-31").localeCompare(String(b.procurement_order_by || b.order_by_date || "9999-12-31")));
  const workloadMap = new Map();
  for (const t of tasks) {
    const key = t.assignee_trade || t.trade || "Unassigned";
    if (!workloadMap.has(key)) workloadMap.set(key, { trade: key, count: 0, hours: 0, overdue: 0 });
    const row = workloadMap.get(key);
    row.count += 1;
    row.hours += Number(t.planned_hours) || 0;
    if (t.percent_complete < 100 && toYmd(t.end_date) && toYmd(t.end_date) < today) row.overdue += 1;
  }
  const plannedCost = tasks.reduce((sum, t) => sum + (Number(t.planned_cost) || 0), 0);
  const buildexactCost = tasks.reduce((sum, t) => sum + (Number(t.buildexact_match?.amount) || 0), 0);
  return {
    total,
    done,
    inProgress,
    notStarted,
    incomplete: incomplete.length,
    overdue,
    overallPercent,
    plannedPercentByDate,
    daysOffset,
    projectStart,
    projectEnd,
    phaseRows,
    procurement,
    workload: [...workloadMap.values()].sort((a, b) => b.hours - a.hours || b.count - a.count),
    cost: { plannedCost, buildexactCost, hasBuildexact: buildexactCost > 0 },
    buildexactAlerts: (webhookEvents || []).map((e) => ({
      id: e.id,
      event_type: e.event_type,
      received_at: e.received_at,
      message: `${e.event_type || "Buildexact update"} received — review linked schedule costs.`
    }))
  };
}

function ripplePreview(tasksInput, taskId, newStartDate) {
  const tasks = (tasksInput || []).map(normaliseTask);
  const byId = new Map(tasks.map((t) => [t.id, { ...t }]));
  const root = byId.get(taskId);
  const start = toYmd(newStartDate);
  if (!root || !start) return { affected: [], updatedTasks: tasks };
  const original = new Map(tasks.map((t) => [t.id, { ...t }]));
  root.start_date = start;
  root.end_date = computeTaskEnd(root.start_date, root.duration_days, root.is_hold_point || root.task_type === "milestone");
  root.order_by_date = computeOrderBy(root);
  root.procurement_order_by = root.order_by_date;
  byId.set(root.id, root);
  const affected = [];
  const pushAffected = (row) => {
    const old = original.get(row.id) || {};
    affected.push({ id: row.id, name: row.name, old_start_date: old.start_date || null, new_start_date: row.start_date || null, old_end_date: old.end_date || null, new_end_date: row.end_date || null });
  };
  pushAffected(root);
  const queue = [root.id];
  while (queue.length) {
    const cid = queue.shift();
    const parent = byId.get(cid);
    if (!parent?.end_date) continue;
    for (const t of byId.values()) {
      if (!(t.depends_on || []).includes(cid)) continue;
      const predEnds = (t.depends_on || []).map((id) => byId.get(id)?.end_date).filter(Boolean);
      if (!predEnds.length) continue;
      const requiredStart = addDaysYmd(predEnds.sort().at(-1), 1);
      if (!t.start_date || t.start_date < requiredStart) {
        t.start_date = requiredStart;
        t.end_date = computeTaskEnd(t.start_date, t.duration_days, t.is_hold_point || t.task_type === "milestone");
        t.order_by_date = computeOrderBy(t);
        t.procurement_order_by = t.order_by_date;
        byId.set(t.id, t);
        pushAffected(t);
        queue.push(t.id);
      }
    }
  }
  return { affected, updatedTasks: tasks.map((t) => byId.get(t.id) || t) };
}

function flattenEstimateLines(estimate) {
  const out = [];
  for (const cat of estimate?.categories || []) {
    const categoryName = cat.name || "";
    for (const item of cat.active_items || []) {
      out.push({
        id: `${estimate.id}:${cat.number || categoryName}:${item.code || item.description}`,
        category: categoryName,
        code: item.code || "",
        description: item.description || categoryName,
        amount: Number(item.total ?? item.subtotal ?? 0) || 0,
        estimate_id: estimate.id
      });
    }
    if (!Array.isArray(cat.active_items) || !cat.active_items.length) {
      out.push({
        id: `${estimate.id}:${cat.number || categoryName}`,
        category: categoryName,
        code: String(cat.number || ""),
        description: categoryName,
        amount: Number(cat.subtotal_inc_gst ?? cat.subtotal_ex_gst ?? cat.subtotal ?? 0) || 0,
        estimate_id: estimate.id
      });
    }
  }
  return out;
}

function wordSet(s) {
  return new Set(String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2));
}

function matchScore(a, b) {
  const aa = wordSet(a);
  const bb = wordSet(b);
  if (!aa.size || !bb.size) return 0;
  let hits = 0;
  for (const w of aa) if (bb.has(w)) hits += 1;
  return Math.round((hits / Math.max(aa.size, bb.size)) * 100);
}

function templateTaskRow(templateTask, projectId, startDate, templateId) {
  const tempId = templateTask.temp_id || templateTask.id || templateTask.name;
  const start = addMaybeDays(startDate, Number(templateTask.offset_from_project_start) || 0);
  const taskType = templateTask.task_type || "standard";
  const duration = Math.max(0, Number(templateTask.duration_days) || 0);
  const proc = templateTask.procurement || null;
  const orderBy = proc?.lead_days ? addMaybeDays(start, -Number(proc.lead_days)) : null;
  return {
    project_id: projectId,
    template_id: templateId,
    name: templateTask.name,
    trade: templateTask.assignee_trade || "general",
    phase: templateTask.phase || "general",
    start_date: start,
    end_date: computeTaskEnd(start, duration, taskType === "milestone"),
    duration_days: duration,
    depends_on: [],
    status: "planned",
    is_hold_point: taskType === "milestone",
    task_type: taskType,
    percent_complete: 0,
    procurement_item: proc?.item || null,
    procurement_supplier: proc?.supplier || null,
    procurement_lead_days: proc?.lead_days || null,
    procurement_order_by: orderBy,
    order_by_date: orderBy,
    procurement_order_status: proc?.order_status || "not_ordered",
    planned_hours: templateTask.planned_hours ?? null,
    planned_cost: templateTask.planned_cost ?? null,
    assignee_trade: templateTask.assignee_trade || null,
    priority: templateTask.priority || "medium",
    notes: templateTask.notes || null,
    updated_at: new Date().toISOString(),
    _temp_id: tempId,
    _depends_temp: Array.isArray(templateTask.depends_on) ? templateTask.depends_on : []
  };
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
  const { data: all, error } = await sb.from("schedule_tasks").select("*").eq("project_id", projectId).is("deleted_at", null);
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
          t.procurement_order_by = t.order_by_date;
        } else if (t.lead_time_weeks != null && Number(t.lead_time_weeks) > 0) {
          t.order_by_date = addDays(t.start_date, -Math.round(Number(t.lead_time_weeks) * 7));
          t.procurement_order_by = t.order_by_date;
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
        procurement_order_by: row.procurement_order_by ?? row.order_by_date ?? null,
        updated_at: nowIso
      })
      .eq("id", id);
    if (uerr) throw uerr;
  }
  return [...updated];
}

async function loadBuildexactScheduleHints(sb, project) {
  if (!sb || !project) return [];
  const filters = [];
  if (project.buildexact_job_id) filters.push(["buildexact_job_id", project.buildexact_job_id]);
  if (project.job_id) filters.push(["job_id", project.job_id]);
  for (const [col, value] of filters) {
    const { data } = await sb
      .from("buildexact_estimates")
      .select("schedule_hints")
      .eq(col, value)
      .not("schedule_hints", "is", null)
      .order("imported_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const hints = Array.isArray(data?.schedule_hints) ? data.schedule_hints : [];
    if (hints.length) return hints;
  }
  return [];
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

      // Soft-delete: get current max version, then mark existing rows deleted
      const { data: vRows } = await sb.from("schedule_tasks").select("schedule_version").eq("project_id", projectId).is("deleted_at", null).order("schedule_version", { ascending: false }).limit(1);
      const nextVersion = ((vRows?.[0]?.schedule_version) || 0) + 1;
      await sb.from("schedule_tasks").update({ deleted_at: new Date().toISOString() }).eq("project_id", projectId).is("deleted_at", null);

      const excludeNames = Array.isArray(overrides.excludeNames) ? overrides.excludeNames : [];
      const useLegacy = Boolean(overrides.useLegacyTemplate);

      let rows;
      let categorySource = "legacy";
      let plannedVia = "legacy";
      const scheduleHints = await loadBuildexactScheduleHints(sb, proj);

      if (useLegacy) {
        rows = buildScheduleRowsForInsert(projectId, startDate, proj.accepted_trades || [], { excludeNames });
      } else {
        const catCtx = await resolveScheduleCategoryBlocks(sb, proj);
        categorySource = catCtx.source;
        try {
          if (process.env.ANTHROPIC_API_KEY?.trim()) {
            const { tasks: aiTasks } = await generateSchedulePlanWithClaude({ categoryBlocks: catCtx.categories });
            rows = buildRowsFromClaudePlan(projectId, startDate, aiTasks, catCtx.categories, { scheduleHints });
            plannedVia = "claude";
          } else {
            rows = buildFallbackRowsFromCategories(projectId, startDate, catCtx.categories, { scheduleHints });
            plannedVia = "fallback_no_api_key";
          }
        } catch (err) {
          console.warn("[schedule/generate] planner", err?.message || err);
          rows = buildFallbackRowsFromCategories(projectId, startDate, catCtx.categories, { scheduleHints });
          plannedVia = "fallback_error";
        }
      }

      const insertPayload = useLegacy
        ? rows.map(({ _depends_names, ...rest }) => ({
            ...rest,
            depends_on: [],
            schedule_version: nextVersion,
            updated_at: new Date().toISOString()
          }))
        : rows.map((r) => ({
            ...stripDynamicScheduleRow(r),
            depends_on: [],
            schedule_version: nextVersion,
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
        const taskDepUpdates = attachTaskDependenciesUuids(rows, insertedIdsOrdered);
        for (const u of taskDepUpdates) {
          const patch = { updated_at: new Date().toISOString() };
          if (u.task_dependencies.length) patch.task_dependencies = u.task_dependencies;
          if (u.depends_on.length) patch.depends_on = u.depends_on;
          if (patch.task_dependencies || patch.depends_on) {
            await sb.from("schedule_tasks").update(patch).eq("id", u.id);
          }
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
        .is("deleted_at", null)
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
        .is("deleted_at", null)
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

  app.get("/api/schedule/templates", async (_req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const { data, error } = await sb.from("schedule_templates").select("*").order("is_default", { ascending: false }).order("name");
      if (error) throw error;
      return res.json({ ok: true, templates: data || [] });
    } catch (e) {
      console.error("[schedule/templates list]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get("/api/schedule/templates/:id", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const id = String(req.params.id || "").trim();
      const { data, error } = await sb.from("schedule_templates").select("*").eq("id", id).single();
      if (error) throw error;
      return res.json({ ok: true, template: data });
    } catch (e) {
      console.error("[schedule/templates get]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/schedule/templates", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const name = String(body.name || "").trim();
      if (!name) return res.status(400).json({ ok: false, error: "name required." });
      const row = {
        name,
        description: body.description != null ? String(body.description) : null,
        project_type: String(body.project_type || "new_build"),
        tasks: Array.isArray(body.tasks) ? body.tasks : [],
        is_default: Boolean(body.is_default),
        updated_at: new Date().toISOString()
      };
      const { data, error } = await sb.from("schedule_templates").insert(row).select("*").single();
      if (error) throw error;
      return res.json({ ok: true, template: data });
    } catch (e) {
      console.error("[schedule/templates post]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.put("/api/schedule/templates/:id", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const id = String(req.params.id || "").trim();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const patch = { updated_at: new Date().toISOString() };
      if (body.name != null) patch.name = String(body.name).trim();
      if (body.description !== undefined) patch.description = body.description == null ? null : String(body.description);
      if (body.project_type != null) patch.project_type = String(body.project_type);
      if (Array.isArray(body.tasks)) patch.tasks = body.tasks;
      if (body.is_default != null) patch.is_default = Boolean(body.is_default);
      const { data, error } = await sb.from("schedule_templates").update(patch).eq("id", id).select("*").single();
      if (error) throw error;
      return res.json({ ok: true, template: data });
    } catch (e) {
      console.error("[schedule/templates put]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.delete("/api/schedule/templates/:id", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const id = String(req.params.id || "").trim();
      const { error } = await sb.from("schedule_templates").delete().eq("id", id);
      if (error) throw error;
      return res.json({ ok: true, deleted: id });
    } catch (e) {
      console.error("[schedule/templates delete]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get("/api/schedule/:projectId/dashboard", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const { data: tasks, error } = await sb.from("schedule_tasks").select("*").eq("project_id", projectId).is("deleted_at", null).order("start_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      let phaseLabels = {};
      try {
        const { data: proj } = await sb.from("projects").select("id, address, job_id, buildexact_job_id").eq("id", projectId).single();
        if (proj) {
          const catCtx = await resolveScheduleCategoryBlocks(sb, proj);
          for (const b of catCtx.categories || []) phaseLabels[b.phase] = b.phaseLabel;
        }
      } catch {
        phaseLabels = {};
      }
      const { data: events } = await sb
        .from("buildexact_webhook_events")
        .select("id,event_type,payload,received_at")
        .eq("matched_project_id", projectId)
        .order("received_at", { ascending: false })
        .limit(8);
      return res.json({ ok: true, dashboard: scheduleDashboard(tasks || [], phaseLabels, events || []) });
    } catch (e) {
      console.error("[schedule/dashboard]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.get("/api/schedule/:projectId/procurement", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const { data, error } = await sb.from("schedule_tasks").select("*").eq("project_id", projectId).is("deleted_at", null).order("procurement_order_by", { ascending: true, nullsFirst: false });
      if (error) throw error;
      const today = new Date().toISOString().slice(0, 10);
      const tasks = (data || [])
        .map(normaliseTask)
        .filter((t) => t.task_type === "procurement" || t.procurement_item || t.procurement_order_by || t.order_by_date)
        .map((t) => ({ ...t, procurement_status: procurementStatus(t, today) }));
      return res.json({ ok: true, tasks });
    } catch (e) {
      console.error("[schedule/procurement]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/schedule/:projectId/ripple-check", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const taskId = String(req.body?.taskId || "").trim();
      const newStartDate = toYmd(req.body?.newStartDate);
      if (!taskId || !newStartDate) return res.status(400).json({ ok: false, error: "taskId and newStartDate required." });
      const { data, error } = await sb.from("schedule_tasks").select("*").eq("project_id", projectId).is("deleted_at", null);
      if (error) throw error;
      const preview = ripplePreview(data || [], taskId, newStartDate);
      return res.json({ ok: true, downstream_tasks: preview.affected.slice(1), affected: preview.affected, updatedTasks: preview.updatedTasks });
    } catch (e) {
      console.error("[schedule/ripple-check]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/schedule/:projectId/task", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const name = String(body.name || "").trim();
      if (!name) return res.status(400).json({ ok: false, error: "name required." });
      const taskType = String(body.task_type || "standard");
      const duration = Math.max(0, Number(body.duration_days ?? (taskType === "milestone" ? 0 : 1)) || 0);
      const start = toYmd(body.start_date) || new Date().toISOString().slice(0, 10);
      const orderBy = body.procurement_order_by ? toYmd(body.procurement_order_by) : computeOrderBy({ ...body, start_date: start });
      const row = {
        project_id: projectId,
        name,
        trade: String(body.trade || body.assignee_trade || "general"),
        phase: String(body.phase || "general"),
        start_date: start,
        end_date: computeTaskEnd(start, duration, taskType === "milestone"),
        duration_days: duration,
        depends_on: Array.isArray(body.depends_on) ? body.depends_on.filter(Boolean) : [],
        task_dependencies: Array.isArray(body.task_dependencies) ? body.task_dependencies : [],
        status: statusFromPercent(body.percent_complete, String(body.status || "planned")),
        is_hold_point: Boolean(body.is_hold_point || taskType === "milestone" || taskType === "inspection" || taskType === "approval"),
        task_type: taskType,
        percent_complete: clampPercent(body.percent_complete),
        procurement_item: body.procurement_item || null,
        procurement_supplier: body.procurement_supplier || null,
        procurement_lead_days: body.procurement_lead_days == null || body.procurement_lead_days === "" ? null : Number(body.procurement_lead_days),
        lead_time_days: body.lead_time_days == null || body.lead_time_days === "" ? null : Number(body.lead_time_days),
        procurement_order_by: orderBy,
        order_by_date: orderBy,
        procurement_order_status: body.procurement_order_status || "not_ordered",
        planned_hours: body.planned_hours == null || body.planned_hours === "" ? null : Number(body.planned_hours),
        planned_cost: body.planned_cost == null || body.planned_cost === "" ? null : Number(body.planned_cost),
        assignee_trade: body.assignee_trade || body.trade || null,
        priority: body.priority || "medium",
        notes: body.notes || null,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await sb.from("schedule_tasks").insert(row).select("*").single();
      if (error) throw error;
      return res.json({ ok: true, task: data });
    } catch (e) {
      console.error("[schedule/task create]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/schedule/:projectId/load-template", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const templateId = String(req.body?.templateId || "").trim();
      const startDate = toYmd(req.body?.startDate);
      if (!projectId || !templateId || !startDate) return res.status(400).json({ ok: false, error: "projectId, templateId and startDate required." });
      const { data: template, error: te } = await sb.from("schedule_templates").select("*").eq("id", templateId).single();
      if (te || !template) return res.status(404).json({ ok: false, error: te?.message || "Template not found." });
      const templateTasks = Array.isArray(template.tasks) ? template.tasks : [];
      const { data: tvRows } = await sb.from("schedule_tasks").select("schedule_version").eq("project_id", projectId).is("deleted_at", null).order("schedule_version", { ascending: false }).limit(1);
      const templateNextVersion = ((tvRows?.[0]?.schedule_version) || 0) + 1;
      await sb.from("schedule_tasks").update({ deleted_at: new Date().toISOString() }).eq("project_id", projectId).is("deleted_at", null);
      const rows = templateTasks.map((t) => templateTaskRow(t, projectId, startDate, template.id));
      const insertPayload = rows.map(({ _temp_id, _depends_temp, ...r }) => ({ ...r, schedule_version: templateNextVersion }));
      const { data: inserted, error: ie } = await sb.from("schedule_tasks").insert(insertPayload).select("id,name");
      if (ie) throw ie;
      const idByTemp = new Map();
      rows.forEach((r, i) => idByTemp.set(r._temp_id, inserted?.[i]?.id));
      for (const r of rows) {
        const id = idByTemp.get(r._temp_id);
        if (!id) continue;
        const deps = (r._depends_temp || []).map((tempId) => idByTemp.get(tempId)).filter(Boolean);
        if (deps.length) await sb.from("schedule_tasks").update({ depends_on: deps, updated_at: new Date().toISOString() }).eq("id", id);
      }
      const { data: tasks, error } = await sb.from("schedule_tasks").select("*").eq("project_id", projectId).is("deleted_at", null).order("start_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return res.json({ ok: true, template, tasks: tasks || [] });
    } catch (e) {
      console.error("[schedule/load-template]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/schedule/:projectId/save-as-template", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).json({ ok: false, error: "name required." });
      const { data: tasks, error } = await sb.from("schedule_tasks").select("*").eq("project_id", projectId).is("deleted_at", null).order("start_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      const start = (tasks || []).map((t) => toYmd(t.start_date)).filter(Boolean).sort()[0] || new Date().toISOString().slice(0, 10);
      const tempById = new Map((tasks || []).map((t, i) => [t.id, `task_${i + 1}`]));
      const templateTasks = (tasks || []).map((t, i) => ({
        id: tempById.get(t.id) || `task_${i + 1}`,
        phase: t.phase,
        name: t.name,
        task_type: t.task_type || (t.is_hold_point ? "milestone" : "standard"),
        duration_days: Number(t.duration_days) || 0,
        offset_from_project_start: daysBetween(start, t.start_date),
        depends_on: (t.depends_on || []).map((id) => tempById.get(id)).filter(Boolean),
        planned_hours: t.planned_hours,
        planned_cost: t.planned_cost,
        procurement: t.task_type === "procurement" || t.procurement_item ? {
          item: t.procurement_item || t.name,
          supplier: t.procurement_supplier || "",
          lead_days: t.procurement_lead_days || null,
          order_status: t.procurement_order_status || "not_ordered"
        } : null,
        assignee_trade: t.assignee_trade || t.trade,
        priority: t.priority || "medium"
      }));
      const { data: template, error: ie } = await sb
        .from("schedule_templates")
        .insert({
          name,
          description: req.body?.description != null ? String(req.body.description) : `Saved from project ${projectId}`,
          project_type: String(req.body?.project_type || "custom"),
          tasks: templateTasks,
          is_default: false,
          updated_at: new Date().toISOString()
        })
        .select("*")
        .single();
      if (ie) throw ie;
      return res.json({ ok: true, template });
    } catch (e) {
      console.error("[schedule/save-as-template]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/schedule/:projectId/buildexact-match", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase service role not configured." });
    try {
      const projectId = String(req.params.projectId || "").trim();
      const { data: proj, error: pe } = await sb.from("projects").select("id, job_id").eq("id", projectId).single();
      if (pe || !proj) return res.status(404).json({ ok: false, error: pe?.message || "Project not found." });
      const { data: tasks, error: te } = await sb.from("schedule_tasks").select("*").eq("project_id", projectId).is("deleted_at", null);
      if (te) throw te;
      const { data: estimates, error: ee } = await sb
        .from("buildexact_estimates")
        .select("id,job_id,quote_number,address,categories,estimate_total,imported_at")
        .eq("job_id", proj.job_id)
        .order("imported_at", { ascending: false })
        .limit(3);
      if (ee) throw ee;
      const lines = (estimates || []).flatMap(flattenEstimateLines);
      const matches = [];
      for (const task of tasks || []) {
        let best = null;
        for (const line of lines) {
          const score = Math.max(matchScore(task.name, line.description), matchScore(task.assignee_trade || task.trade, `${line.category} ${line.description}`));
          if (score >= 45 && (!best || score > best.score)) best = { ...line, score };
        }
        if (best && best.score >= 70) {
          const match = { line_item_id: best.id, description: best.description, category: best.category, amount: best.amount, score: best.score, estimate_id: best.estimate_id };
          const { error } = await sb
            .from("schedule_tasks")
            .update({ buildexact_line_item_id: best.id, buildexact_match: match, planned_cost: best.amount || null, updated_at: new Date().toISOString() })
            .eq("id", task.id);
          if (error) throw error;
          matches.push({ task_id: task.id, task_name: task.name, match });
        }
      }
      return res.json({ ok: true, matches, estimateCount: (estimates || []).length });
    } catch (e) {
      console.error("[schedule/buildexact-match]", e);
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
        .is("deleted_at", null)
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
      if (body.trade != null) patch.trade = String(body.trade).slice(0, 200);
      if (body.phase != null) patch.phase = String(body.phase).slice(0, 200);
      if (body.start_date != null) patch.start_date = String(body.start_date);
      if (body.end_date != null) patch.end_date = String(body.end_date);
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
      if (body.task_type != null) patch.task_type = String(body.task_type);
      if (body.percent_complete != null) {
        patch.percent_complete = clampPercent(body.percent_complete);
        if (body.status == null) patch.status = statusFromPercent(patch.percent_complete, cur.status);
      }
      if (body.priority != null) patch.priority = String(body.priority);
      if (body.planned_hours !== undefined) patch.planned_hours = body.planned_hours == null || body.planned_hours === "" ? null : Number(body.planned_hours);
      if (body.planned_cost !== undefined) patch.planned_cost = body.planned_cost == null || body.planned_cost === "" ? null : Number(body.planned_cost);
      if (body.assignee_trade !== undefined) patch.assignee_trade = body.assignee_trade == null ? null : String(body.assignee_trade);
      if (body.procurement_item !== undefined) patch.procurement_item = body.procurement_item == null ? null : String(body.procurement_item);
      if (body.procurement_supplier !== undefined) patch.procurement_supplier = body.procurement_supplier == null ? null : String(body.procurement_supplier);
      if (body.procurement_lead_days !== undefined) patch.procurement_lead_days = body.procurement_lead_days == null || body.procurement_lead_days === "" ? null : Number(body.procurement_lead_days);
      if (body.procurement_order_by !== undefined) patch.procurement_order_by = body.procurement_order_by ? String(body.procurement_order_by) : null;
      if (body.procurement_order_status !== undefined) patch.procurement_order_status = body.procurement_order_status == null ? "not_ordered" : String(body.procurement_order_status);
      if (body.buildexact_line_item_id !== undefined) patch.buildexact_line_item_id = body.buildexact_line_item_id == null ? null : String(body.buildexact_line_item_id);
      if (body.buildexact_match !== undefined) patch.buildexact_match = body.buildexact_match || null;
      if (body.float_days !== undefined) patch.float_days = body.float_days == null || body.float_days === "" ? null : Number(body.float_days);
      if (body.template_id !== undefined) patch.template_id = body.template_id || null;
      if (Array.isArray(body.task_dependencies)) patch.task_dependencies = body.task_dependencies;
      if (body.lead_time_days !== undefined) patch.lead_time_days = body.lead_time_days == null || body.lead_time_days === "" ? null : Number(body.lead_time_days);

      const merged = { ...cur, ...patch };
      merged.end_date = body.end_date != null ? toYmd(body.end_date) : computeTaskEnd(merged.start_date, merged.duration_days, merged.is_hold_point || merged.task_type === "milestone");
      const computedOrderBy = computeOrderBy(merged);
      if (computedOrderBy) {
        merged.order_by_date = computedOrderBy;
        merged.procurement_order_by = computedOrderBy;
      }
      merged.updated_at = new Date().toISOString();

      const { error: ue } = await sb
        .from("schedule_tasks")
        .update({
          name: merged.name,
          trade: merged.trade,
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
          task_type: merged.task_type,
          percent_complete: merged.percent_complete,
          procurement_item: merged.procurement_item,
          procurement_supplier: merged.procurement_supplier,
          procurement_lead_days: merged.procurement_lead_days,
          procurement_order_by: merged.procurement_order_by,
          procurement_order_status: merged.procurement_order_status,
          buildexact_line_item_id: merged.buildexact_line_item_id,
          buildexact_match: merged.buildexact_match,
          planned_cost: merged.planned_cost,
          planned_hours: merged.planned_hours,
          assignee_trade: merged.assignee_trade,
          priority: merged.priority,
          float_days: merged.float_days,
          template_id: merged.template_id,
          task_dependencies: merged.task_dependencies ?? [],
          lead_time_days: merged.lead_time_days ?? null,
          updated_at: merged.updated_at
        })
        .eq("id", id);
      if (ue) throw ue;

      let updatedIds = [id];
      if (!body.no_cascade && (body.start_date != null || body.duration_days != null || body.is_hold_point != null || Array.isArray(body.depends_on))) {
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
      const { error: de } = await sb.from("schedule_tasks").update({ deleted_at: new Date().toISOString() }).eq("id", id);
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
        .is("deleted_at", null)
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
        .is("deleted_at", null)
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

  // ─── Operations enriched projects list ───────────────────────────────────

  app.get("/api/operations/projects", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured." });
    try {
      const { data: projects, error: pe } = await sb
        .from("projects")
        .select("id, address, status, tentative_start_date, accepted_trades, buildexact_job_id, buildexact_link_source, created_at, schedule_baseline_locked_at, jobs(id, won_at)")
        .order("created_at", { ascending: false });
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

  app.get("/api/operations/global-tasks", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured." });
    try {
      const { data: projects } = await sb.from("projects").select("id, address");
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

  // ─── Trade conflict detection ─────────────────────────────────────────────

  app.get("/api/operations/trade-conflicts", async (req, res) => {
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

  // ─── Baseline lock / reset ────────────────────────────────────────────────

  app.post("/api/schedule/:projectId/baseline/lock", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured." });
    try {
      const { projectId } = req.params;
      const { data: tasks, error: te } = await sb
        .from("schedule_tasks")
        .select("id, start_date, end_date")
        .eq("project_id", projectId)
        .is("deleted_at", null);
      if (te) throw te;
      for (const task of tasks || []) {
        await sb.from("schedule_tasks")
          .update({ baseline_start_date: task.start_date, baseline_end_date: task.end_date })
          .eq("id", task.id);
      }
      const now = new Date().toISOString();
      await sb.from("projects").update({ schedule_baseline_locked_at: now }).eq("id", projectId);
      return res.json({ ok: true, locked_at: now, count: (tasks || []).length });
    } catch (e) {
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.delete("/api/schedule/:projectId/baseline", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured." });
    try {
      const { projectId } = req.params;
      await sb.from("schedule_tasks")
        .update({ baseline_start_date: null, baseline_end_date: null })
        .eq("project_id", projectId);
      await sb.from("projects").update({ schedule_baseline_locked_at: null }).eq("id", projectId);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // ─── EOT tracking ─────────────────────────────────────────────────────────

  app.get("/api/schedule/:projectId/eot", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured." });
    try {
      const { data, error } = await sb
        .from("schedule_eot")
        .select("*")
        .eq("project_id", req.params.projectId)
        .order("raised_at", { ascending: false });
      if (error) throw error;
      return res.json({ ok: true, eots: data || [] });
    } catch (e) {
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/schedule/:projectId/eot", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured." });
    try {
      const { projectId } = req.params;
      const { reason_code, description, days_claimed } = req.body;
      if (!reason_code || !days_claimed) return res.status(400).json({ ok: false, error: "reason_code and days_claimed required." });
      const { data, error } = await sb.from("schedule_eot").insert({
        project_id: projectId,
        reason_code,
        description: description || null,
        days_claimed: Number(days_claimed),
        status: "pending"
      }).select("*").single();
      if (error) throw error;
      return res.json({ ok: true, eot: data });
    } catch (e) {
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.patch("/api/schedule/:projectId/eot/:eotId", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured." });
    try {
      const { eotId } = req.params;
      const { status, days_approved } = req.body;
      if (!["approved", "rejected"].includes(status)) return res.status(400).json({ ok: false, error: "status must be approved or rejected." });
      const patch = { status, resolved_at: new Date().toISOString() };
      if (status === "approved" && days_approved !== undefined) patch.days_approved = Number(days_approved);
      const { data, error } = await sb.from("schedule_eot").update(patch).eq("id", eotId).select("*").single();
      if (error) throw error;
      return res.json({ ok: true, eot: data });
    } catch (e) {
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/schedule/:projectId/eot/:eotId/apply", async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Supabase not configured." });
    try {
      const { projectId, eotId } = req.params;
      const { data: eot, error: ee } = await sb.from("schedule_eot").select("*").eq("id", eotId).single();
      if (ee || !eot) return res.status(404).json({ ok: false, error: "EOT not found." });
      if (eot.status !== "approved") return res.status(400).json({ ok: false, error: "EOT must be approved before applying." });
      if (!eot.days_approved) return res.status(400).json({ ok: false, error: "No approved days set." });
      const days = Number(eot.days_approved);
      const { data: tasks, error: te } = await sb.from("schedule_tasks").select("id, start_date, end_date").eq("project_id", projectId).is("deleted_at", null);
      if (te) throw te;
      for (const task of tasks || []) {
        await sb.from("schedule_tasks").update({
          start_date: task.start_date ? addDays(task.start_date, days) : null,
          end_date:   task.end_date   ? addDays(task.end_date, days)   : null,
        }).eq("id", task.id);
      }
      await sb.from("schedule_eot").update({ applied_at: new Date().toISOString() }).eq("id", eotId);
      return res.json({ ok: true, tasks_shifted: (tasks || []).length, days });
    } catch (e) {
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
