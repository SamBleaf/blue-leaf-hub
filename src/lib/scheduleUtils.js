import { addDaysYmd, toYmd } from "./dateYmd.js";

export const VIEW_DASHBOARD = "dashboard";
export const VIEW_GANTT = "gantt";
export const VIEW_SHEET = "sheet";
export const VIEW_CALENDAR = "calendar";

export const SCHEDULE_VIEWS = [
  { id: VIEW_DASHBOARD, label: "Dashboard" },
  { id: VIEW_GANTT, label: "Gantt" },
  { id: VIEW_SHEET, label: "Sheet" },
  { id: VIEW_CALENDAR, label: "Calendar" }
];

export const PHASE_LABELS = {
  pre_construction: "Pre-construction",
  site_slab: "Site & Slab",
  site_prep: "Site Prep",
  substructure: "Substructure",
  frame: "Frame",
  rough_in: "Rough-in / First Fix",
  lock_up: "Lock-up",
  fitout: "Second Fix / Fitout",
  completion: "Completion",
  post_construction: "Post-construction",
  general: "General"
};

// Semantic phase colours — each phase maps to a meaningful construction colour
export const PHASE_COLOR_MAP = {
  pre_construction:  "#64748b", // slate    — admin / planning
  site_prep:         "#92400e", // brown    — dirt / earthworks
  site_slab:         "#78716c", // stone    — concrete / slab
  substructure:      "#78716c", // stone    — footings / concrete
  excavation:        "#92400e", // brown    — excavation
  frame:             "#ea580c", // orange   — structure rising
  roofing:           "#1e40af", // deep blue — sky / roof
  roof:              "#1e40af", // deep blue
  lock_up:           "#0d9488", // teal     — sealing the envelope
  rough_in:          "#d97706", // amber    — electrical / services
  first_fix:         "#d97706", // amber
  insulation:        "#65a30d", // lime     — green product
  wall_lining:       "#7c3aed", // violet   — finishes begin
  painting:          "#e11d48", // rose     — colour / surface
  fitout:            "#0284c7", // sky blue — fixtures going in
  second_fix:        "#0284c7", // sky blue
  floor_coverings:   "#b45309", // warm brown — floors
  tiling:            "#b45309", // warm brown
  external_works:    "#0369a1", // blue     — external
  landscaping:       "#15803d", // green    — gardens
  completion:        "#059669", // emerald  — done
  post_construction: "#059669", // emerald
  handover:          "#059669", // emerald
  general:           "#94a3b8", // cool grey — fallback
};

const FALLBACK_PALETTE = ["#2563eb","#9333ea","#0ea5e9","#db2777","#16a34a","#d97706","#0d9488","#ea580c"];

// Colour helpers — used by Gantt for status-based styling
export function hexToTint(hex, opacity) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  const tr = Math.round(r+(255-r)*(1-opacity));
  const tg = Math.round(g+(255-g)*(1-opacity));
  const tb = Math.round(b+(255-b)*(1-opacity));
  return `#${tr.toString(16).padStart(2,"0")}${tg.toString(16).padStart(2,"0")}${tb.toString(16).padStart(2,"0")}`;
}

export function darkenHex(hex, amount=20) {
  const r = Math.max(0, parseInt(hex.slice(1,3),16)-amount);
  const g = Math.max(0, parseInt(hex.slice(3,5),16)-amount);
  const b = Math.max(0, parseInt(hex.slice(5,7),16)-amount);
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
}

/** Returns gantt-task-react styles object based on task status + phase colour */
export function getTaskGanttStyles(task, phaseColorHex, showCritical, todayStr) {
  const today = todayStr || new Date().toISOString().slice(0,10);
  const isComplete = (Number(task.percent_complete)||0) >= 100 || task.status === "complete";
  const isOverdue   = !isComplete && task.end_date && task.end_date < today;
  const isCritical  = showCritical && task.is_critical_path;
  const isProc      = task.task_type === "procurement";
  if (isComplete) return { backgroundColor:"#e5e7eb", backgroundSelectedColor:"#d1d5db", progressColor:"#86efac", progressSelectedColor:"#4ade80" };
  if (isOverdue)  return { backgroundColor:"#fee2e2", backgroundSelectedColor:"#fecaca", progressColor:"#ef4444", progressSelectedColor:"#dc2626" };
  if (isCritical) return { backgroundColor:"#fed7aa", backgroundSelectedColor:"#fdba74", progressColor:"#fb923c", progressSelectedColor:"#f97316" };
  if (isProc)     return { backgroundColor:"#fef3c7", backgroundSelectedColor:"#fde68a", progressColor:"#d97706", progressSelectedColor:"#b45309" };
  return {
    backgroundColor:         hexToTint(phaseColorHex, 0.25),
    backgroundSelectedColor: hexToTint(phaseColorHex, 0.38),
    progressColor:           phaseColorHex,
    progressSelectedColor:   darkenHex(phaseColorHex, 15),
  };
}

export function safeDate(value) {
  return toYmd(value) || "";
}

export function daysBetween(a, b) {
  const aa = safeDate(a);
  const bb = safeDate(b);
  if (!aa || !bb) return 0;
  const ad = new Date(`${aa}T12:00:00`);
  const bd = new Date(`${bb}T12:00:00`);
  return Math.round((bd - ad) / 86400000);
}

export function addDaysSafe(ymd, days) {
  const d = safeDate(ymd);
  if (!d) return "";
  return addDaysYmd(d, Number(days) || 0);
}

export function computeEndDate(startDate, durationDays, isMilestone = false) {
  const start = safeDate(startDate);
  if (!start) return "";
  const duration = Math.max(0, Number(durationDays) || 0);
  if (duration <= 0 || isMilestone) return start;
  return addDaysSafe(start, duration - 1);
}

export function computeOrderByDate(task) {
  const start = safeDate(task?.start_date);
  if (!start) return "";
  const leadDays = Number(task?.procurement_lead_days ?? 0);
  if (leadDays > 0) return addDaysSafe(start, -leadDays);
  const leadWeeks = Number(task?.lead_time_weeks ?? 0);
  if (leadWeeks > 0) return addDaysSafe(start, -Math.round(leadWeeks * 7));
  return safeDate(task?.procurement_order_by || task?.order_by_date);
}

export function normalizeTask(task = {}) {
  let canRun = task.can_run_concurrent_with;
  if (typeof canRun === "string") {
    try {
      canRun = JSON.parse(canRun);
    } catch {
      canRun = [];
    }
  }
  let buildexactMatch = task.buildexact_match;
  if (typeof buildexactMatch === "string") {
    try {
      buildexactMatch = JSON.parse(buildexactMatch);
    } catch {
      buildexactMatch = null;
    }
  }
  const taskType = task.task_type || (task.is_hold_point || Number(task.duration_days) === 0 ? "milestone" : "standard");
  const start = safeDate(task.start_date);
  const end = safeDate(task.end_date) || computeEndDate(start, task.duration_days, taskType === "milestone" || task.is_hold_point);
  const percent = task.percent_complete != null ? Number(task.percent_complete) : task.status === "complete" ? 100 : task.status === "in_progress" ? 50 : 0;
  return {
    ...task,
    task_type: taskType,
    start_date: start,
    end_date: end,
    depends_on: Array.isArray(task.depends_on) ? task.depends_on : [],
    can_run_concurrent_with: Array.isArray(canRun) ? canRun : [],
    percent_complete: Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0)),
    priority: task.priority || "medium",
    procurement_order_status: task.procurement_order_status || "not_ordered",
    procurement_order_by: safeDate(task.procurement_order_by) || computeOrderByDate(task),
    order_by_date: safeDate(task.order_by_date) || computeOrderByDate(task),
    assignee_trade: task.assignee_trade || task.trade || "",
    planned_hours: task.planned_hours == null || task.planned_hours === "" ? null : Number(task.planned_hours),
    planned_cost: task.planned_cost == null || task.planned_cost === "" ? null : Number(task.planned_cost),
    buildexact_match: buildexactMatch || null
  };
}

export function groupTasksByPhase(tasks) {
  const order = [];
  const groups = {};
  for (const raw of tasks || []) {
    const task = normalizeTask(raw);
    const phase = task.phase || "general";
    if (!groups[phase]) {
      groups[phase] = [];
      order.push(phase);
    }
    groups[phase].push(task);
  }
  return { order, groups };
}

export function phaseLabel(phase, labels = {}) {
  return labels?.[phase] || PHASE_LABELS[phase] || String(phase || "general").replace(/_/g, " ");
}

export function phaseColor(phase) {
  const p = String(phase || "general");
  if (PHASE_COLOR_MAP[p]) return PHASE_COLOR_MAP[p];
  let hash = 0;
  for (let i = 0; i < p.length; i += 1) hash = (hash * 31 + p.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
}

export function taskStatusFromPercent(percent) {
  const p = Number(percent) || 0;
  if (p >= 100) return "complete";
  if (p > 0) return "in_progress";
  return "planned";
}

export function calculateDashboard(tasksInput, options = {}) {
  const tasks = (tasksInput || []).map(normalizeTask);
  const today = safeDate(options.today) || new Date().toISOString().slice(0, 10);
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "complete" || t.percent_complete >= 100).length;
  const inProgress = tasks.filter((t) => t.status === "in_progress" || (t.percent_complete > 0 && t.percent_complete < 100)).length;
  const notStarted = Math.max(0, total - done - inProgress);
  const incomplete = tasks.filter((t) => t.percent_complete < 100 && t.status !== "complete");
  const overdue = incomplete.filter((t) => safeDate(t.end_date) && t.end_date < today).length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  const delayed = tasks.filter((t) => t.status === "delayed").length;
  const overallPercent = total ? Math.round(tasks.reduce((sum, t) => sum + (Number(t.percent_complete) || 0), 0) / total) : 0;

  const dated = tasks.filter((t) => t.start_date && t.end_date);
  const projectStart = dated.map((t) => t.start_date).sort()[0] || today;
  const projectEnd = dated.map((t) => t.end_date).sort().at(-1) || today;
  const elapsed = Math.max(0, daysBetween(projectStart, today));
  const plannedSpan = Math.max(1, daysBetween(projectStart, projectEnd));
  const plannedPercentByDate = Math.min(100, Math.max(0, Math.round((elapsed / plannedSpan) * 100)));
  const daysOffset = Math.round(((overallPercent - plannedPercentByDate) / 100) * plannedSpan);

  const phaseRows = [];
  const { order, groups } = groupTasksByPhase(tasks);
  for (const phase of order) {
    const list = groups[phase] || [];
    const progress = list.length ? Math.round(list.reduce((sum, t) => sum + (Number(t.percent_complete) || 0), 0) / list.length) : 0;
    const phaseStart = list.map((t) => t.start_date).filter(Boolean).sort()[0] || "";
    const phaseEnd = list.map((t) => t.end_date).filter(Boolean).sort().at(-1) || "";
    phaseRows.push({
      phase,
      label: phaseLabel(phase, options.phaseLabels),
      progress,
      count: list.length,
      planned_hours: list.reduce((sum, t) => sum + (Number(t.planned_hours) || 0), 0),
      planned_cost: list.reduce((sum, t) => sum + (Number(t.planned_cost) || 0), 0),
      overdue: list.filter((t) => t.percent_complete < 100 && t.end_date && t.end_date < today).length,
      start_date: phaseStart,
      end_date: phaseEnd,
      color: phaseColor(phase)
    });
  }

  const procurement = tasks
    .filter((t) => t.task_type === "procurement" || t.procurement_item || t.order_by_date || t.procurement_order_by)
    .map((t) => ({ ...t, procurement_status: procurementStatus(t, today) }))
    .sort((a, b) => String(a.procurement_order_by || a.order_by_date || "9999-12-31").localeCompare(String(b.procurement_order_by || b.order_by_date || "9999-12-31")));

  const workload = Object.values(
    tasks.reduce((acc, t) => {
      const key = t.assignee_trade || t.trade || "Unassigned";
      if (!acc[key]) acc[key] = { trade: key, count: 0, hours: 0, overdue: 0 };
      acc[key].count += 1;
      acc[key].hours += Number(t.planned_hours) || 0;
      if (t.percent_complete < 100 && t.end_date && t.end_date < today) acc[key].overdue += 1;
      return acc;
    }, {})
  ).sort((a, b) => b.hours - a.hours || b.count - a.count);

  const plannedCost = tasks.reduce((sum, t) => sum + (Number(t.planned_cost) || 0), 0);
  const bxCost = tasks.reduce((sum, t) => sum + (Number(t.buildexact_match?.amount) || 0), 0);

  return {
    total,
    done,
    inProgress,
    notStarted,
    incomplete: incomplete.length,
    overdue,
    blocked,
    delayed,
    overallPercent,
    plannedPercentByDate,
    daysOffset,
    projectStart,
    projectEnd,
    phaseRows,
    procurement,
    workload,
    cost: {
      plannedCost,
      buildexactCost: bxCost,
      hasBuildexact: bxCost > 0
    }
  };
}

export function procurementStatus(task, todayInput) {
  const today = safeDate(todayInput) || new Date().toISOString().slice(0, 10);
  const orderBy = safeDate(task?.procurement_order_by || task?.order_by_date) || computeOrderByDate(task);
  if (!orderBy) return { tone: "muted", label: "No order date", daysUntil: null, orderBy: "" };
  const daysUntil = daysBetween(today, orderBy);
  if (String(task?.procurement_order_status || "") === "delivered") return { tone: "green", label: "Delivered", daysUntil, orderBy };
  if (daysUntil < 0) return { tone: "red", label: `${Math.abs(daysUntil)}d overdue`, daysUntil, orderBy };
  if (daysUntil <= 7) return { tone: "amber", label: `${daysUntil}d to order`, daysUntil, orderBy };
  return { tone: "green", label: `${daysUntil}d to order`, daysUntil, orderBy };
}

export function tasksActiveInWindow(tasks, start, end) {
  const s = safeDate(start);
  const e = safeDate(end);
  if (!s || !e) return (tasks || []).map(normalizeTask);
  return (tasks || []).map(normalizeTask).filter((t) => {
    const ts = t.start_date || t.end_date;
    const te = t.end_date || t.start_date;
    if (!ts || !te) return false;
    return ts <= e && te >= s;
  });
}

export function downstreamTaskIds(tasksInput, rootId) {
  const tasks = (tasksInput || []).map(normalizeTask);
  const downstream = new Set();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    for (const task of tasks) {
      if (downstream.has(task.id)) continue;
      if ((task.depends_on || []).includes(id)) {
        downstream.add(task.id);
        queue.push(task.id);
      }
    }
  }
  return [...downstream];
}

export function previewRipple(tasksInput, taskId, newStartDate) {
  const tasks = (tasksInput || []).map(normalizeTask);
  const byId = new Map(tasks.map((t) => [t.id, { ...t }]));
  const root = byId.get(taskId);
  const nextStart = safeDate(newStartDate);
  if (!root || !nextStart) return { affected: [], updatedTasks: tasks };

  root.start_date = nextStart;
  root.end_date = computeEndDate(root.start_date, root.duration_days, root.task_type === "milestone" || root.is_hold_point);
  root.procurement_order_by = computeOrderByDate(root);
  root.order_by_date = root.procurement_order_by || root.order_by_date;
  byId.set(root.id, root);

  const affected = [{ id: root.id, name: root.name, old_start_date: tasks.find((t) => t.id === root.id)?.start_date || "", new_start_date: root.start_date, old_end_date: tasks.find((t) => t.id === root.id)?.end_date || "", new_end_date: root.end_date }];
  const queue = [root.id];
  while (queue.length) {
    const cid = queue.shift();
    const parent = byId.get(cid);
    if (!parent?.end_date) continue;
    for (const task of byId.values()) {
      if (task.id === cid || !(task.depends_on || []).includes(cid)) continue;
      const predEnds = (task.depends_on || []).map((id) => byId.get(id)?.end_date).filter(Boolean);
      if (!predEnds.length) continue;
      const requiredStart = addDaysSafe(predEnds.sort().at(-1), 1);
      if (!task.start_date || task.start_date < requiredStart) {
        const old = { ...task };
        task.start_date = requiredStart;
        task.end_date = computeEndDate(task.start_date, task.duration_days, task.task_type === "milestone" || task.is_hold_point);
        task.procurement_order_by = computeOrderByDate(task);
        task.order_by_date = task.procurement_order_by || task.order_by_date;
        byId.set(task.id, task);
        affected.push({ id: task.id, name: task.name, old_start_date: old.start_date, new_start_date: task.start_date, old_end_date: old.end_date, new_end_date: task.end_date });
        queue.push(task.id);
      }
    }
  }

  return { affected, updatedTasks: tasks.map((t) => byId.get(t.id) || t) };
}

export function templateTaskToScheduleRow(templateTask, projectId, startDate) {
  const tempId = templateTask.temp_id || templateTask.id || templateTask.name;
  const start = addDaysSafe(startDate, Number(templateTask.offset_from_project_start) || 0);
  const taskType = templateTask.task_type || "standard";
  const duration = Math.max(0, Number(templateTask.duration_days) || 0);
  const procurement = templateTask.procurement || null;
  const orderBy = procurement?.lead_days ? addDaysSafe(start, -Number(procurement.lead_days)) : null;
  return {
    project_id: projectId,
    name: templateTask.name,
    trade: templateTask.assignee_trade || "general",
    phase: templateTask.phase || "general",
    task_type: taskType,
    start_date: start,
    end_date: computeEndDate(start, duration, taskType === "milestone"),
    duration_days: duration,
    depends_on: [],
    status: "planned",
    percent_complete: 0,
    is_hold_point: taskType === "milestone",
    procurement_item: procurement?.item || null,
    procurement_supplier: procurement?.supplier || null,
    procurement_lead_days: procurement?.lead_days || null,
    procurement_order_by: orderBy,
    order_by_date: orderBy,
    procurement_order_status: procurement?.order_status || "not_ordered",
    planned_hours: templateTask.planned_hours ?? null,
    assignee_trade: templateTask.assignee_trade || null,
    priority: templateTask.priority || "medium",
    notes: templateTask.notes || null,
    _template_temp_id: tempId,
    _template_depends_on: Array.isArray(templateTask.depends_on) ? templateTask.depends_on : []
  };
}
