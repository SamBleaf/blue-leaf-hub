import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";
import { buildGanttSvg, PHASE_COLORS } from "../lib/ganttRenderer.js";
import { toYmd, addDaysYmd } from "../lib/dateYmd.js";

async function readApiJson(res) {
  const text = await res.text();
  if (!text) {
    if (!res.ok) throw new Error(`HTTP ${res.status}: empty response`);
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: response was not JSON (${text.slice(0, 160).replace(/\s+/g, " ")})`);
  }
}

function addDays(iso, n) {
  return addDaysYmd(iso, n);
}

function computeEnd(start, durationDays, isHold) {
  const sd = toYmd(start);
  if (!sd) return "";
  if (Number(durationDays) <= 0 || isHold) return sd;
  return addDaysYmd(sd, Number(durationDays) - 1);
}

function normalizeScheduleTask(t) {
  let c = t.can_run_concurrent_with;
  if (typeof c === "string") {
    try {
      c = JSON.parse(c);
    } catch {
      c = [];
    }
  }
  return { ...t, depends_on: Array.isArray(t.depends_on) ? t.depends_on : [], can_run_concurrent_with: Array.isArray(c) ? c : [] };
}

export default function ScheduleManager() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [genOpen, setGenOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [excludeDemo, setExcludeDemo] = useState(false);
  const [useLegacyGen, setUseLegacyGen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [editTask, setEditTask] = useState(null);
  const [subQuery, setSubQuery] = useState("");
  const [subHits, setSubHits] = useState([]);
  const [analysis, setAnalysis] = useState("");
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [savePdfBusy, setSavePdfBusy] = useState(false);
  const [phaseLabels, setPhaseLabels] = useState({});
  const [genSummary, setGenSummary] = useState("");
  const [exportPdfBusy, setExportPdfBusy] = useState(false);
  const [adviceBusy, setAdviceBusy] = useState(false);
  const [taskAdvice, setTaskAdvice] = useState("");

  const loadMeta = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/schedule/meta/${projectId}`);
      const j = await readApiJson(res);
      if (res.ok && j.ok) setPhaseLabels(j.phaseLabels || {});
    } catch {
      /* non-fatal */
    }
  }, [projectId]);

  const loadProject = useCallback(async () => {
    if (!supabaseConfigured || !projectId) return;
    const sb = getSupabase();
    const { data, error: e } = await sb.from("projects").select("id, address").eq("id", projectId).single();
    if (e) setError(e.message);
    else setProject(data);
  }, [projectId]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/schedule/${projectId}`);
      const j = await readApiJson(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "Failed to load schedule");
      setTasks((j.tasks || []).map(normalizeScheduleTask));
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const range = useMemo(() => {
    if (!tasks.length) {
      const t = new Date().toISOString().slice(0, 10);
      return { start: t, end: addDays(t, 120) };
    }
    let min = "";
    let max = "";
    for (const tk of tasks) {
      const s = toYmd(tk.start_date);
      const e = toYmd(tk.end_date || tk.start_date) || s;
      if (s) {
        if (!min || s < min) min = s;
        if (e && (!max || e > max)) max = e;
      }
    }
    if (!min) {
      const t = new Date().toISOString().slice(0, 10);
      return { start: t, end: addDays(t, 120) };
    }
    if (!max) max = min;
    return { start: addDays(min, -7), end: addDays(max, 21) };
  }, [tasks]);

  const svgMarkup = useMemo(
    () => buildGanttSvg(tasks, range, { phaseLabels, weekColWidth: 100 }),
    [tasks, range, phaseLabels]
  );

  const phaseOrder = useMemo(() => {
    const o = [];
    const seen = new Set();
    for (const t of tasks) {
      const p = t.phase || "general";
      if (!seen.has(p)) {
        seen.add(p);
        o.push(p);
      }
    }
    return o;
  }, [tasks]);

  const phaseOptions = useMemo(() => {
    const s = new Set(phaseOrder);
    Object.keys(phaseLabels || {}).forEach((k) => s.add(k));
    if (editTask?.phase) s.add(editTask.phase);
    return [...s].sort();
  }, [phaseOrder, phaseLabels, editTask?.phase]);

  async function generateSchedule() {
    const normalized = toYmd(startDate);
    if (!normalized) {
      setError("Pick a valid start date (use the calendar — YYYY-MM-DD).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const excludeNames = excludeDemo ? ["Demolition (if applicable)"] : [];
      const res = await fetch("/api/schedule/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, startDate: normalized, overrides: { excludeNames, useLegacyTemplate: useLegacyGen } })
      });
      const j = await readApiJson(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "Generate failed");
      setTasks((j.tasks || []).map(normalizeScheduleTask));
      setGenSummary(j.summaryLine || "");
      await loadMeta();
      setGenOpen(false);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runAnalysis() {
    setAnalysisBusy(true);
    setAnalysis("");
    setAnalysisOpen(true);
    setError("");
    try {
      const res = await fetch("/api/schedule/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId })
      });
      const j = await readApiJson(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "Analysis failed");
      setAnalysis(j.analysis || "");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setAnalysisBusy(false);
    }
  }

  async function saveAnalysisPdf() {
    if (!analysis.trim()) return;
    setSavePdfBusy(true);
    setError("");
    try {
      const res = await fetch("/api/schedule/save-analysis-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, analysisText: analysis })
      });
      const j = await readApiJson(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "Save failed");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSavePdfBusy(false);
    }
  }

  function exportCsv() {
    const headers = [
      "Phase",
      "Trade",
      "Task",
      "Start Date",
      "End Date",
      "Duration (days)",
      "Status",
      "Dependencies",
      "Lead Time (weeks)",
      "Hold Point",
      "Hold Description",
      "Notes"
    ];
    const depNames = (ids) =>
      (ids || [])
        .map((id) => tasks.find((x) => x.id === id)?.name || id)
        .join("; ");
    const rows = tasks.map((t) =>
      [
        t.phase,
        t.trade,
        t.name,
        t.start_date || "",
        t.end_date || "",
        t.duration_days,
        t.status,
        depNames(t.depends_on),
        t.lead_time_weeks ?? "",
        t.is_hold_point ? "Yes" : "No",
        String(t.hold_point_description || "").replace(/"/g, '""'),
        String(t.notes || "").replace(/"/g, '""')
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `schedule-${projectId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportGanttPdf() {
    setExportPdfBusy(true);
    setError("");
    try {
      const res = await fetch("/api/schedule/export-gantt-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId })
      });
      if (!res.ok) {
        const errText = await res.text();
        let msg = errText.slice(0, 200);
        try {
          const j = JSON.parse(errText);
          if (j.error) msg = j.error;
        } catch {
          /* keep msg */
        }
        throw new Error(msg || "Export failed");
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `schedule-gantt-${projectId}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setExportPdfBusy(false);
    }
  }

  async function searchSubs(q) {
    setSubQuery(q);
    if (!supabaseConfigured || q.length < 2) {
      setSubHits([]);
      return;
    }
    const sb = getSupabase();
    const { data } = await sb.from("subcontractors").select("id,business_name,trade").ilike("business_name", `%${q}%`).limit(25);
    setSubHits(data || []);
  }

  async function saveTask() {
    if (!editTask) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: editTask.name,
        phase: editTask.phase,
        status: editTask.status,
        start_date: toYmd(editTask.start_date) || editTask.start_date,
        duration_days: editTask.duration_days,
        notes: editTask.notes,
        assigned_subcontractor_id: editTask.assigned_subcontractor_id,
        is_hold_point: editTask.is_hold_point,
        depends_on: Array.isArray(editTask.depends_on) ? editTask.depends_on : [],
        can_run_concurrent_with: Array.isArray(editTask.can_run_concurrent_with) ? editTask.can_run_concurrent_with : [],
        lead_time_weeks: editTask.lead_time_weeks === "" || editTask.lead_time_weeks == null ? null : Number(editTask.lead_time_weeks),
        hold_point_description: editTask.hold_point_description || null,
        hold_notify: Boolean(editTask.hold_notify)
      };
      if (editTask.ai_flag_cleared) payload.ai_flag = null;
      const res = await fetch(`/api/schedule/task/${editTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const j = await readApiJson(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "Save failed");
      setEditTask(null);
      await loadTasks();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function onSvgClick(e) {
    const id = e.target?.getAttribute?.("data-task-id");
    if (!id) return;
    const t = tasks.find((x) => x.id === id);
    if (t) setEditTask({ ...t, ai_flag_cleared: false });
  }

  const byPhase = useMemo(() => {
    const m = {};
    for (const t of tasks) {
      const p = t.phase || "general";
      if (!m[p]) m[p] = [];
      m[p].push(t);
    }
    return m;
  }, [tasks]);

  async function deleteTask() {
    if (!editTask?.id) return;
    if (!window.confirm("Delete this task from the schedule?")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/schedule/task/${editTask.id}`, { method: "DELETE" });
      const j = await readApiJson(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "Delete failed");
      setEditTask(null);
      await loadTasks();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function askAiAdvice() {
    if (!editTask) return;
    setAdviceBusy(true);
    setTaskAdvice("");
    setError("");
    try {
      const ctx = [
        `Phase: ${editTask.phase}`,
        `Duration days: ${editTask.duration_days}`,
        `Depends on: ${(editTask.depends_on || []).join(", ")}`,
        editTask.notes ? `Notes: ${editTask.notes}` : ""
      ]
        .filter(Boolean)
        .join("\n");
      const res = await fetch("/api/schedule/task-advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskName: editTask.name, context: ctx })
      });
      const j = await readApiJson(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "Advice failed");
      setTaskAdvice(j.advice || "");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setAdviceBusy(false);
    }
  }

  function toggleDep(id) {
    setEditTask((x) => {
      const cur = Array.isArray(x.depends_on) ? [...x.depends_on] : [];
      const i = cur.indexOf(id);
      if (i >= 0) cur.splice(i, 1);
      else cur.push(id);
      return { ...x, depends_on: cur };
    });
  }

  function toggleConcurrent(id) {
    setEditTask((x) => {
      const cur = Array.isArray(x.can_run_concurrent_with) ? [...x.can_run_concurrent_with] : [];
      const i = cur.indexOf(id);
      if (i >= 0) cur.splice(i, 1);
      else cur.push(id);
      return { ...x, can_run_concurrent_with: cur };
    });
  }

  if (!project && !error) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/operations/${projectId}`} className="text-sm font-semibold text-accent underline">
          ← Back to project
        </Link>
      </div>
      <header className="rounded-card border border-hairline bg-surface p-4 shadow-sm">
        <h1 className="text-xl font-bold text-primary">{project?.address || "Project"}</h1>
        <p className="text-sm text-muted">Schedule</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setGenOpen(true)} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
            Generate schedule
          </button>
          <button type="button" onClick={runAnalysis} className="rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink">
            AI Analyse
          </button>
          <button type="button" onClick={exportCsv} disabled={!tasks.length} className="rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink">
            Export CSV
          </button>
          <button
            type="button"
            onClick={exportGanttPdf}
            disabled={!tasks.length || exportPdfBusy}
            className="rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink disabled:opacity-50"
          >
            {exportPdfBusy ? "PDF…" : "Export PDF"}
          </button>
        </div>
      </header>

      {error ? <div className="text-sm text-danger">{error}</div> : null}

      {loading ? <p className="text-sm text-muted">Loading…</p> : null}

      {!loading && !tasks.length ? (
        <div className="rounded-card border border-dashed border-hairline bg-page p-8 text-center">
          <p className="text-muted">No schedule tasks yet.</p>
          <button type="button" onClick={() => setGenOpen(true)} className="mt-4 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white">
            Generate schedule
          </button>
        </div>
      ) : null}

      {!loading && tasks.length ? (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="lg:w-[35%] lg:min-w-[280px] lg:max-h-[70vh] lg:overflow-y-auto">
            {phaseOrder.map((ph) => {
              const list = byPhase[ph] || [];
              if (!list.length) return null;
              const open = !collapsed[ph];
              const phTitle = phaseLabels[ph] || ph.replace(/_/g, " ");
              return (
                <div key={ph} className="mb-3 rounded-lg border border-hairline overflow-hidden">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-bold text-white"
                    style={{ backgroundColor: PHASE_COLORS[ph] || "#64748b" }}
                    onClick={() => setCollapsed((c) => ({ ...c, [ph]: !c[ph] }))}
                  >
                    {phTitle}
                    <span>{open ? "▼" : "▶"}</span>
                  </button>
                  {open ? (
                    <ul className="divide-y divide-hairline bg-surface text-sm">
                      {list.map((t) => (
                        <li key={t.id} className="flex items-stretch gap-0">
                          <button
                            type="button"
                            className="shrink-0 px-2 py-2 text-lg text-muted hover:bg-page"
                            title="Options"
                            aria-label="Task options"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditTask({ ...t, ai_flag_cleared: false });
                            }}
                          >
                            ⋯
                          </button>
                          <button
                            type="button"
                            className="min-w-0 flex-1 flex flex-col items-start gap-1 px-2 py-2 text-left hover:bg-page"
                            onClick={() => setEditTask({ ...t, ai_flag_cleared: false })}
                          >
                            <span className="flex items-center gap-2 font-semibold text-ink">
                              {(t.can_run_concurrent_with || []).length ? (
                                <span className="text-xs font-normal text-accent" title="May run in parallel with other tasks">
                                  ⧉
                                </span>
                              ) : null}
                              {t.is_hold_point ? "◆ " : ""}
                              {t.name}
                            </span>
                            <span className="text-xs text-muted">
                              <span className="rounded bg-page px-1.5 py-0.5">{t.trade}</span>{" "}
                              {t.start_date}–{t.end_date} · {t.duration_days}d · {t.status}
                              {t.is_critical_path ? <span className="ml-1 text-orange-600 font-semibold">● critical</span> : null}
                              {t.hold_notify ? <span className="ml-1 text-danger font-bold" title="Hold notify">!</span> : null}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="lg:w-[65%] lg:max-h-[70vh] overflow-x-auto overflow-y-auto rounded-card border border-hairline bg-surface p-2">
            <p className="mb-2 text-xs text-muted">Orange outline ≈ critical path. Grey curves = dependencies. Scroll horizontally for the full programme.</p>
            <div dangerouslySetInnerHTML={{ __html: svgMarkup }} onClick={onSvgClick} role="presentation" />
          </div>
        </div>
      ) : null}

      {genOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && setGenOpen(false)}>
          <div className="w-full max-w-md rounded-card border border-hairline bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-primary">Generate schedule</h2>
            <p className="mt-1 text-xs text-muted">
              Uses fee proposal / Buildxact categories when linked, then Claude for dependencies. Tick below for the older fixed template instead.
            </p>
            {genSummary ? (
              <p className="mt-3 rounded border border-accent/30 bg-page px-3 py-2 text-sm text-ink" role="status">
                {genSummary}
              </p>
            ) : null}
            <label className="mt-4 block text-xs font-semibold text-muted">
              Start date *
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v)) setStartDate(v);
                }}
                className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm"
              />
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={excludeDemo} onChange={(e) => setExcludeDemo(e.target.checked)} />
              Exclude demolition (legacy template only)
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={useLegacyGen} onChange={(e) => setUseLegacyGen(e.target.checked)} />
              Use legacy fixed-phase template (no Claude / fee categories)
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-2 text-sm text-muted" onClick={() => setGenOpen(false)}>
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={generateSchedule} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
                {busy ? "Working…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {analysisOpen ? (
        <div className="fixed inset-0 z-[95] flex justify-end bg-black/40" onClick={(e) => e.target === e.currentTarget && setAnalysisOpen(false)}>
          <div className="h-full w-full max-w-md overflow-y-auto border-l border-hairline bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-primary">AI analysis</h2>
              <button type="button" className="text-sm text-muted" onClick={() => setAnalysisOpen(false)}>
                Close
              </button>
            </div>
            {analysisBusy ? <p className="mt-6 text-sm text-muted">Loading…</p> : null}
            {!analysisBusy ? <pre className="mt-4 whitespace-pre-wrap font-sans text-sm text-ink">{analysis || "—"}</pre> : null}
            <button
              type="button"
              disabled={savePdfBusy || !analysis.trim()}
              onClick={saveAnalysisPdf}
              className="mt-6 w-full rounded-lg bg-primary py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {savePdfBusy ? "Saving…" : "Save to Dropbox"}
            </button>
          </div>
        </div>
      ) : null}

      {editTask ? (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/40" onClick={(e) => e.target === e.currentTarget && setEditTask(null)}>
          <div className="h-full w-full max-w-lg overflow-y-auto border-l border-hairline bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-primary">Task options</h2>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Task name
              <input
                value={editTask.name || ""}
                onChange={(e) => setEditTask((x) => ({ ...x, name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Category / phase
              <select
                value={editTask.phase || ""}
                onChange={(e) => setEditTask((x) => ({ ...x, phase: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm"
              >
                {phaseOptions.map((p) => (
                  <option key={p} value={p}>
                    {phaseLabels[p] || p.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Duration (days) — ≈ {((Number(editTask.duration_days) || 0) / 7).toFixed(1)} weeks
              <input
                type="number"
                min={0}
                value={editTask.duration_days}
                onChange={(e) =>
                  setEditTask((x) => ({
                    ...x,
                    duration_days: Number(e.target.value),
                    end_date: computeEnd(x.start_date, Number(e.target.value), x.is_hold_point)
                  }))
                }
                className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Lead time (weeks before work — procurement)
              <input
                type="number"
                min={0}
                step={0.5}
                value={editTask.lead_time_weeks ?? ""}
                onChange={(e) => setEditTask((x) => ({ ...x, lead_time_weeks: e.target.value === "" ? "" : Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm"
              />
            </label>
            <p className="mt-3 text-xs font-semibold text-muted">Depends on (must finish before this task)</p>
            <ul className="mt-1 max-h-28 overflow-y-auto rounded border border-hairline bg-page text-xs">
              {tasks
                .filter((o) => o.id !== editTask.id)
                .map((o) => (
                  <li key={o.id} className="flex items-center gap-2 border-b border-hairline px-2 py-1">
                    <input type="checkbox" checked={(editTask.depends_on || []).includes(o.id)} onChange={() => toggleDep(o.id)} />
                    <span className="truncate">{o.name}</span>
                  </li>
                ))}
            </ul>
            <p className="mt-3 text-xs font-semibold text-muted">Can run concurrent with</p>
            <ul className="mt-1 max-h-28 overflow-y-auto rounded border border-hairline bg-page text-xs">
              {tasks
                .filter((o) => o.id !== editTask.id)
                .map((o) => (
                  <li key={`c-${o.id}`} className="flex items-center gap-2 border-b border-hairline px-2 py-1">
                    <input type="checkbox" checked={(editTask.can_run_concurrent_with || []).includes(o.id)} onChange={() => toggleConcurrent(o.id)} />
                    <span className="truncate">{o.name}</span>
                  </li>
                ))}
            </ul>
            <label className="mt-4 block text-xs font-semibold text-muted">
              Status
              <select value={editTask.status} onChange={(e) => setEditTask((x) => ({ ...x, status: e.target.value }))} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm">
                <option value="planned">planned</option>
                <option value="in_progress">in_progress</option>
                <option value="complete">complete</option>
                <option value="delayed">delayed</option>
                <option value="blocked">blocked</option>
              </select>
            </label>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Start date
              <input
                type="date"
                value={editTask.start_date || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
                  setEditTask((x) => ({ ...x, start_date: v, end_date: computeEnd(v, x.duration_days, x.is_hold_point) }));
                }}
                className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm"
              />
            </label>
            <p className="mt-3 text-xs text-muted">
              End date (computed, read-only): <span className="font-mono text-ink">{computeEnd(editTask.start_date, editTask.duration_days, editTask.is_hold_point)}</span>
            </p>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Notes
              <textarea value={editTask.notes || ""} onChange={(e) => setEditTask((x) => ({ ...x, notes: e.target.value }))} rows={3} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm" />
            </label>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Assigned subcontractor (search)
              <input type="search" value={subQuery} onChange={(e) => searchSubs(e.target.value)} className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm" placeholder="Type name…" />
            </label>
            {subHits.length ? (
              <ul className="mt-1 max-h-32 overflow-y-auto rounded border border-hairline bg-page text-xs">
                {subHits.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="w-full px-2 py-1 text-left hover:bg-surface"
                      onClick={() => {
                        setEditTask((x) => ({ ...x, assigned_subcontractor_id: s.id }));
                        setSubQuery(s.business_name);
                      }}
                    >
                      {s.business_name} ({s.trade})
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editTask.is_hold_point} onChange={(e) => setEditTask((x) => ({ ...x, is_hold_point: e.target.checked }))} />
              Hold point / inspection
            </label>
            <label className="mt-3 block text-xs font-semibold text-muted">
              Hold point description
              <textarea
                value={editTask.hold_point_description || ""}
                onChange={(e) => setEditTask((x) => ({ ...x, hold_point_description: e.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-lg border border-hairline px-2 py-2 text-sm"
                placeholder="e.g. Frame inspection — council sign-off before cladding"
              />
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(editTask.hold_notify)} onChange={(e) => setEditTask((x) => ({ ...x, hold_notify: e.target.checked }))} />
              Flag this hold on the schedule
            </label>
            <button type="button" disabled={adviceBusy} onClick={askAiAdvice} className="mt-4 w-full rounded-lg border border-primary py-2 text-sm font-semibold text-primary">
              {adviceBusy ? "Asking…" : "Ask AI — scheduling tips for this task"}
            </button>
            {taskAdvice ? <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-hairline bg-page p-2 text-xs text-ink">{taskAdvice}</pre> : null}
            {editTask.ai_flag ? (
              <div className="mt-3 text-xs text-muted">
                AI flag: <span className="text-ink">{editTask.ai_flag}</span>
                <button type="button" className="ml-2 text-primary underline" onClick={() => setEditTask((x) => ({ ...x, ai_flag_cleared: true, ai_flag: null }))}>
                  Clear
                </button>
              </div>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" className="rounded-lg border border-danger/50 px-3 py-2 text-sm text-danger" onClick={deleteTask} disabled={busy}>
                Delete task
              </button>
              <button type="button" className="flex-1 rounded-lg border border-hairline py-2 text-sm" onClick={() => setEditTask(null)}>
                Cancel
              </button>
              <button type="button" disabled={busy} className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-white" onClick={saveTask}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
