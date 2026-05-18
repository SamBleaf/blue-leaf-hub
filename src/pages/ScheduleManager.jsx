import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ScheduleCalendar from "../components/schedule/ScheduleCalendar.jsx";
import ScheduleDashboard from "../components/schedule/ScheduleDashboard.jsx";
import ScheduleGantt from "../components/schedule/ScheduleGantt.jsx";
import ScheduleSheet from "../components/schedule/ScheduleSheet.jsx";
import ScheduleTemplateModal from "../components/schedule/ScheduleTemplateModal.jsx";
import ScheduleToolbar from "../components/schedule/ScheduleToolbar.jsx";
import TaskDetailPanel from "../components/schedule/TaskDetailPanel.jsx";
import RippleWarningModal from "../components/schedule/RippleWarningModal.jsx";
import { useBlueprintContext } from "../lib/BlueprintContext.jsx";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";
import {
  VIEW_DASHBOARD,
  VIEW_GANTT,
  computeEndDate,
  daysBetween,
  normalizeTask,
  phaseLabel,
  previewRipple,
  taskStatusFromPercent
} from "../lib/scheduleUtils.js";

async function readApiJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: response was not JSON (${text.slice(0, 160).replace(/\s+/g, " ")})`);
  }
}

function blankTask(projectId, phase = "general") {
  const today = new Date().toISOString().slice(0, 10);
  return normalizeTask({
    id: "",
    project_id: projectId,
    name: "New task",
    trade: "general",
    phase,
    task_type: "standard",
    start_date: today,
    end_date: today,
    duration_days: 1,
    status: "planned",
    percent_complete: 0,
    priority: "medium",
    procurement_order_status: "not_ordered",
    depends_on: []
  });
}

function analysisToCards(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((body, i) => ({ id: `${i}-${body.slice(0, 32)}`, title: body.startsWith("⚠") ? "Risk flag" : "Schedule insight", body }));
}

export default function ScheduleManager() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { setScreenContext } = useBlueprintContext() || {};
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [subcontractors, setSubcontractors] = useState([]);
  const [phaseLabels, setPhaseLabels] = useState({});
  const [currentView, setCurrentView] = useState(VIEW_DASHBOARD);
  const [zoom, setZoom] = useState("Month");
  const [showCritical, setShowCritical] = useState(true);
  const [lookahead, setLookahead] = useState(false);
  const [filterTrade, setFilterTrade] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [editTask, setEditTask] = useState(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [useLegacyGen, setUseLegacyGen] = useState(false);
  const [excludeDemo, setExcludeDemo] = useState(false);
  const [analysisCards, setAnalysisCards] = useState([]);
  const [dismissedCards, setDismissedCards] = useState([]);
  const [taskAdvice, setTaskAdvice] = useState("");
  const [ripple, setRipple] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState({});
  const [showGanttColumns, setShowGanttColumns] = useState(() => {
    try { return localStorage.getItem("blhub_gantt_columns") === "true"; } catch { return false; }
  });

  const toggleGanttColumns = useCallback(() => {
    setShowGanttColumns((v) => {
      const next = !v;
      try { localStorage.setItem("blhub_gantt_columns", String(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const selectedTaskId = editTask?.id || null;

  useEffect(() => {
    setScreenContext?.({
      page: "schedule",
      projectId,
      projectName: project?.address || "",
      currentView,
      selectedTaskId
    });
    return () => setScreenContext?.(null);
  }, [setScreenContext, projectId, project?.address, currentView, selectedTaskId]);

  useEffect(() => {
    const key = `blhub_schedule_analysis_dismissed_${projectId}`;
    try {
      setDismissedCards(JSON.parse(localStorage.getItem(key) || "[]"));
    } catch {
      setDismissedCards([]);
    }
  }, [projectId]);

  const loadProject = useCallback(async () => {
    if (!supabaseConfigured || !projectId) return;
    const sb = getSupabase();
    const { data, error: e } = await sb.from("projects").select("id, address, job_id, buildexact_job_id").eq("id", projectId).single();
    if (e) setError(e.message);
    else setProject(data);
  }, [projectId]);

  const loadSubcontractors = useCallback(async () => {
    if (!supabaseConfigured) return;
    const sb = getSupabase();
    const { data } = await sb.from("subcontractors").select("id,business_name,trade").order("business_name").limit(500);
    setSubcontractors(data || []);
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch(`/api/schedule/meta/${projectId}`);
      const j = await readApiJson(res);
      if (res.ok && j.ok) setPhaseLabels(j.phaseLabels || {});
    } catch {
      setPhaseLabels({});
    }
  }, [projectId]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/schedule/${projectId}`);
      const j = await readApiJson(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "Failed to load schedule");
      setTasks((j.tasks || []).map(normalizeTask));
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/schedule/${projectId}/dashboard`);
      const j = await readApiJson(res);
      if (res.ok && j.ok) setDashboard(j.dashboard || null);
    } catch {
      setDashboard(null);
    }
  }, [projectId]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/schedule/templates");
      const j = await readApiJson(res);
      if (res.ok && j.ok) setTemplates(j.templates || []);
    } catch {
      setTemplates([]);
    }
  }, []);

  const reloadAll = useCallback(async () => {
    await Promise.all([loadProject(), loadMeta(), loadTasks(), loadDashboard(), loadTemplates(), loadSubcontractors()]);
  }, [loadProject, loadMeta, loadTasks, loadDashboard, loadTemplates, loadSubcontractors]);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  const tradeOptions = useMemo(() => {
    const s = new Set(tasks.map((t) => t.assignee_trade || t.trade).filter(Boolean));
    return [...s].sort();
  }, [tasks]);

  const phaseOptions = useMemo(() => {
    const s = new Set(tasks.map((t) => t.phase).filter(Boolean));
    Object.keys(phaseLabels || {}).forEach((p) => s.add(p));
    if (editTask?.phase) s.add(editTask.phase);
    return [...s].sort().map((phase) => ({ value: phase, label: phaseLabel(phase, phaseLabels) }));
  }, [tasks, phaseLabels, editTask?.phase]);

  async function patchTask(id, patch, options = {}) {
    const res = await fetch(`/api/schedule/task/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    const j = await readApiJson(res);
    if (!res.ok || !j.ok) throw new Error(j.error || "Save failed");
    if (!options.skipReload) {
      await loadTasks();
      await loadDashboard();
    }
    return j;
  }

  async function saveTask() {
    if (!editTask) return;
    setBusy((b) => ({ ...b, save: true }));
    setError("");
    try {
      const payload = {
        name: editTask.name,
        trade: editTask.trade || editTask.assignee_trade || "general",
        phase: editTask.phase,
        task_type: editTask.task_type,
        status: editTask.status,
        percent_complete: editTask.percent_complete,
        start_date: editTask.start_date,
        end_date: editTask.end_date || computeEndDate(editTask.start_date, editTask.duration_days, editTask.task_type === "milestone"),
        duration_days: editTask.duration_days,
        depends_on: Array.isArray(editTask.depends_on) ? editTask.depends_on : [],
        notes: editTask.notes,
        assigned_subcontractor_id: editTask.assigned_subcontractor_id,
        planned_hours: editTask.planned_hours,
        planned_cost: editTask.planned_cost,
        assignee_trade: editTask.assignee_trade,
        priority: editTask.priority,
        procurement_item: editTask.procurement_item,
        procurement_supplier: editTask.procurement_supplier,
        procurement_lead_days: editTask.procurement_lead_days,
        procurement_order_by: editTask.procurement_order_by,
        procurement_order_status: editTask.procurement_order_status,
        is_hold_point: editTask.task_type === "milestone" || editTask.is_hold_point,
        buildexact_line_item_id: editTask.buildexact_line_item_id,
        buildexact_match: editTask.buildexact_match
      };
      if (editTask.id) {
        await patchTask(editTask.id, payload);
      } else {
        const res = await fetch(`/api/schedule/${projectId}/task`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const j = await readApiJson(res);
        if (!res.ok || !j.ok) throw new Error(j.error || "Create failed");
        await loadTasks();
        await loadDashboard();
      }
      setEditTask(null);
      setTaskAdvice("");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy((b) => ({ ...b, save: false }));
    }
  }

  async function deleteTask() {
    if (!editTask?.id) {
      setEditTask(null);
      return;
    }
    if (!window.confirm("Delete this task from the schedule?")) return;
    setBusy((b) => ({ ...b, save: true }));
    setError("");
    try {
      const res = await fetch(`/api/schedule/task/${editTask.id}`, { method: "DELETE" });
      const j = await readApiJson(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "Delete failed");
      setEditTask(null);
      await loadTasks();
      await loadDashboard();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy((b) => ({ ...b, save: false }));
    }
  }

  async function bulkDelete() {
    if (!selectedIds.length || !window.confirm(`Delete ${selectedIds.length} selected tasks?`)) return;
    setBusy((b) => ({ ...b, save: true }));
    try {
      for (const id of selectedIds) {
        const res = await fetch(`/api/schedule/task/${id}`, { method: "DELETE" });
        const j = await readApiJson(res);
        if (!res.ok || !j.ok) throw new Error(j.error || "Delete failed");
      }
      setSelectedIds([]);
      await loadTasks();
      await loadDashboard();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy((b) => ({ ...b, save: false }));
    }
  }

  async function generateSchedule() {
    setBusy((b) => ({ ...b, generate: true }));
    setError("");
    try {
      const excludeNames = excludeDemo ? ["Demolition (if applicable)"] : [];
      const res = await fetch("/api/schedule/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, startDate, overrides: { excludeNames, useLegacyTemplate: useLegacyGen } })
      });
      const j = await readApiJson(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "Generate failed");
      setTasks((j.tasks || []).map(normalizeTask));
      setGenerateOpen(false);
      setCurrentView(VIEW_GANTT);
      await loadMeta();
      await loadDashboard();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy((b) => ({ ...b, generate: false }));
    }
  }

  async function runAnalysis() {
    setBusy((b) => ({ ...b, analysis: true }));
    setError("");
    try {
      const res = await fetch("/api/schedule/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId })
      });
      const j = await readApiJson(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "Analysis failed");
      setAnalysisCards(analysisToCards(j.analysis || ""));
      setCurrentView(VIEW_DASHBOARD);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy((b) => ({ ...b, analysis: false }));
    }
  }

  function exportCsv() {
    const headers = ["Phase", "Trade", "Task", "Start Date", "End Date", "Duration", "Status", "% Complete", "Priority", "Planned Hours", "Planned Cost", "Dependencies", "Notes"];
    const rows = tasks.map((t) => [t.phase, t.trade, t.name, t.start_date || "", t.end_date || "", t.duration_days, t.status, t.percent_complete, t.priority, t.planned_hours ?? "", t.planned_cost ?? "", (t.depends_on || []).join("; "), String(t.notes || "").replace(/"/g, '""')]);
    const blob = new Blob([[headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `schedule-${projectId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportGanttPdf() {
    setBusy((b) => ({ ...b, pdf: true }));
    setError("");
    try {
      const res = await fetch("/api/schedule/export-gantt-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId })
      });
      if (!res.ok) throw new Error((await res.text()).slice(0, 200) || "Export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `schedule-gantt-${projectId}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy((b) => ({ ...b, pdf: false }));
    }
  }

  async function loadTemplate(templateId, templateStartDate) {
    setBusy((b) => ({ ...b, template: true }));
    setError("");
    try {
      const res = await fetch(`/api/schedule/${projectId}/load-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, startDate: templateStartDate })
      });
      const j = await readApiJson(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "Template load failed");
      setTasks((j.tasks || []).map(normalizeTask));
      setTemplateOpen(false);
      setCurrentView(VIEW_GANTT);
      await loadDashboard();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy((b) => ({ ...b, template: false }));
    }
  }

  async function saveAsTemplate() {
    const name = window.prompt("Template name", `${project?.address || "Project"} schedule`);
    if (!name) return;
    setBusy((b) => ({ ...b, template: true }));
    try {
      const res = await fetch(`/api/schedule/${projectId}/save-as-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      const j = await readApiJson(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "Save template failed");
      await loadTemplates();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy((b) => ({ ...b, template: false }));
    }
  }

  async function buildexactMatch() {
    setBusy((b) => ({ ...b, buildexact: true }));
    setError("");
    try {
      const res = await fetch(`/api/schedule/${projectId}/buildexact-match`, { method: "POST" });
      const j = await readApiJson(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "Buildexact match failed");
      await loadTasks();
      await loadDashboard();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy((b) => ({ ...b, buildexact: false }));
    }
  }

  async function askBlueprintTaskAdvice() {
    if (!editTask) return;
    setBusy((b) => ({ ...b, advice: true }));
    setTaskAdvice("");
    try {
      const context = [`Phase: ${editTask.phase}`, `Progress: ${editTask.percent_complete || 0}%`, `Dates: ${editTask.start_date || "-"} to ${editTask.end_date || "-"}`, editTask.notes ? `Notes: ${editTask.notes}` : ""].filter(Boolean).join("\n");
      const res = await fetch("/api/schedule/task-advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskName: editTask.name, context })
      });
      const j = await readApiJson(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "Advice failed");
      setTaskAdvice(j.advice || "");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy((b) => ({ ...b, advice: false }));
    }
  }

  async function onGanttDateChange(id, newStartDate, newEndDate) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    // Detect resize (start unchanged) vs move (start shifted)
    const isResize   = task.start_date === newStartDate;
    const newDuration = isResize
      ? Math.max(1, daysBetween(newStartDate, newEndDate) + 1)
      : task.duration_days;
    try {
      const res = await fetch(`/api/schedule/${projectId}/ripple-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: id, newStartDate })
      });
      const j = await readApiJson(res);
      if (res.ok && j.ok && j.downstream_tasks?.length) {
        setRipple({ taskId: id, newStartDate, newEndDate, newDuration, affected: j.affected || [] });
        return;
      }
    } catch {
      const local = previewRipple(tasks, id, newStartDate);
      if (local.affected.length > 1) {
        setRipple({ taskId: id, newStartDate, newEndDate, newDuration, affected: local.affected });
        return;
      }
    }
    await patchTask(id, { start_date: newStartDate, end_date: newEndDate, duration_days: newDuration });
  }

  async function confirmRipple(noCascade = false) {
    if (!ripple) return;
    setBusy((b) => ({ ...b, ripple: true }));
    try {
      await patchTask(ripple.taskId, {
        start_date:    ripple.newStartDate,
        end_date:      ripple.newEndDate,
        duration_days: ripple.newDuration,
        no_cascade:    noCascade,
      });
      setRipple(null);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy((b) => ({ ...b, ripple: false }));
    }
  }

  async function quickPatchTask(id, updates) {
    try {
      await patchTask(id, updates);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  async function directDeleteTask(id) {
    setBusy((b) => ({ ...b, save: true }));
    try {
      const res = await fetch(`/api/schedule/task/${id}`, { method: "DELETE" });
      const j = await readApiJson(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "Delete failed");
      await loadTasks();
      await loadDashboard();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy((b) => ({ ...b, save: false }));
    }
  }

  function dismissAnalysisCard(id) {
    const next = [...new Set([...dismissedCards, id])];
    setDismissedCards(next);
    localStorage.setItem(`blhub_schedule_analysis_dismissed_${projectId}`, JSON.stringify(next));
  }

  function openTask(taskOrId) {
    const task = typeof taskOrId === "string" ? tasks.find((t) => t.id === taskOrId) : taskOrId;
    if (task) {
      setTaskAdvice("");
      setEditTask(normalizeTask(task));
    }
  }

  function addTask(phase) {
    setTaskAdvice("");
    setEditTask(blankTask(projectId, phase || tasks[0]?.phase || "general"));
  }

  function orderNow(task) {
    const params = new URLSearchParams();
    if (task.procurement_supplier) params.set("trade", task.procurement_supplier);
    if (task.procurement_item) params.set("scope", task.procurement_item);
    navigate(`/tender-manager/rfq-engine?${params.toString()}`);
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/operations/${projectId}`} className="text-sm font-semibold text-accent underline">Back to project</Link>
      </div>

      <header className="rounded-card border border-hairline bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-primary">{project?.address || "Project"}</h1>
            <p className="text-sm text-muted">Schedule Manager</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setGenerateOpen(true)} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">Generate with AI</button>
            <button type="button" onClick={() => setTemplateOpen(true)} className="rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink">Load from template</button>
            <button type="button" onClick={() => addTask()} className="rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink">Start blank</button>
          </div>
        </div>
      </header>

      <ScheduleToolbar
        currentView={currentView}
        onViewChange={setCurrentView}
        onAddTask={() => addTask()}
        onAnalyse={runAnalysis}
        onExportPdf={exportGanttPdf}
        onExportCsv={exportCsv}
        onBuildexactMatch={buildexactMatch}
        onSaveTemplate={saveAsTemplate}
        zoom={zoom}
        onZoomChange={setZoom}
        showCritical={showCritical}
        onToggleCritical={() => setShowCritical((v) => !v)}
        lookahead={lookahead}
        onToggleLookahead={() => setLookahead((v) => !v)}
        filterTrade={filterTrade}
        onFilterTradeChange={setFilterTrade}
        tradeOptions={tradeOptions}
        busy={busy}
      />

      {error ? <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div> : null}
      {loading ? <p className="text-sm text-muted">Loading schedule...</p> : null}

      {!loading && !tasks.length ? (
        <div className="rounded-card border border-dashed border-hairline bg-page p-8 text-center">
          <p className="text-lg font-semibold text-ink">No schedule tasks yet.</p>
          <p className="mt-1 text-sm text-muted">Generate with AI, load the Blue Leaf template, or start with a blank task.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => setGenerateOpen(true)} className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white">Generate with AI</button>
            <button type="button" onClick={() => setTemplateOpen(true)} className="rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white">Load from template</button>
            <button type="button" onClick={() => addTask()} className="rounded-lg border border-hairline px-4 py-3 text-sm font-semibold text-ink">Start blank</button>
          </div>
        </div>
      ) : null}

      {!loading && tasks.length && currentView === VIEW_DASHBOARD ? (
        <ScheduleDashboard tasks={tasks} dashboard={dashboard} phaseLabels={phaseLabels} analysisCards={analysisCards} dismissedCards={dismissedCards} onDismissAnalysis={dismissAnalysisCard} onOpenTask={openTask} onOrderNow={orderNow} />
      ) : null}
      {!loading && tasks.length && currentView === VIEW_GANTT ? (
        <ScheduleGantt
          tasks={tasks}
          phaseLabels={phaseLabels}
          zoom={zoom}
          showCritical={showCritical}
          lookahead={lookahead}
          filterTrade={filterTrade}
          onOpenTask={openTask}
          onDateChange={onGanttDateChange}
          onProgressChange={(id, progress) => patchTask(id, { percent_complete: progress, status: taskStatusFromPercent(progress) })}
          onAddTask={addTask}
          showColumns={showGanttColumns}
          onToggleColumns={toggleGanttColumns}
          onQuickPatch={quickPatchTask}
          onContextDelete={directDeleteTask}
        />
      ) : null}
      {!loading && tasks.length && currentView === "sheet" ? (
        <ScheduleSheet tasks={tasks} phaseLabels={phaseLabels} selectedIds={selectedIds} onSelectIds={setSelectedIds} onPatchTask={(id, patch) => patchTask(id, patch)} onOpenTask={openTask} onAddTask={addTask} onBulkDelete={bulkDelete} />
      ) : null}
      {!loading && tasks.length && currentView === "calendar" ? (
        <ScheduleCalendar tasks={tasks} filterTrade={filterTrade} onOpenTask={openTask} />
      ) : null}

      {generateOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && setGenerateOpen(false)}>
          <div className="w-full max-w-md rounded-card border border-hairline bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-primary">Generate schedule</h2>
            <label className="mt-4 block text-xs font-semibold text-muted">
              Start date
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm" />
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={excludeDemo} onChange={(e) => setExcludeDemo(e.target.checked)} />
              Exclude demolition (legacy template only)
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={useLegacyGen} onChange={(e) => setUseLegacyGen(e.target.checked)} />
              Use legacy fixed-phase template
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setGenerateOpen(false)} className="rounded-lg px-3 py-2 text-sm text-muted">Cancel</button>
              <button type="button" onClick={generateSchedule} disabled={busy.generate || !startDate} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy.generate ? "Working..." : "Generate"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {templateOpen ? <ScheduleTemplateModal templates={templates} onClose={() => setTemplateOpen(false)} onLoad={loadTemplate} busy={busy.template} /> : null}
      <TaskDetailPanel task={editTask} tasks={tasks} phaseOptions={phaseOptions} subcontractors={subcontractors} onChange={setEditTask} onClose={() => setEditTask(null)} onSave={saveTask} onDelete={deleteTask} onAskBlueprint={askBlueprintTaskAdvice} advice={taskAdvice} busy={busy} />
      <RippleWarningModal preview={ripple} onConfirm={() => confirmRipple(false)} onBreakDependency={() => confirmRipple(true)} onCancel={() => setRipple(null)} busy={busy.ripple} />
    </div>
  );
}
