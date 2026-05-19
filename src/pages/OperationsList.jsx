import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Gantt, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";

const PROJECT_COLORS = [
  "#006c9b", "#2E6B4F", "#ea580c", "#1e40af", "#7c3aed",
  "#0d9488", "#d97706", "#e11d48", "#65a30d", "#b45309",
];

const HEALTH = {
  green: { dot: "bg-green-400", label: "On track",  chip: "border-green-200 bg-green-50 text-green-700" },
  amber: { dot: "bg-amber-400", label: "Attention",  chip: "border-warning/40 bg-warning/10 text-warning" },
  red:   { dot: "bg-red-500",   label: "Behind",     chip: "border-danger/40 bg-danger/10 text-danger" },
};

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function HealthBadge({ health }) {
  const h = HEALTH[health] || HEALTH.green;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${h.chip}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${h.dot}`} />
      {h.label}
    </span>
  );
}

function ProjectCard({ project, colorIdx }) {
  const { schedule } = project;
  const color = PROJECT_COLORS[colorIdx % PROJECT_COLORS.length];
  const won = project.jobs?.won_at ? fmtDate(project.jobs.won_at) : "—";

  return (
    <Link
      to={`/operations/${project.id}`}
      className="block rounded-card border border-hairline bg-surface p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"
      style={{ borderTopColor: color, borderTopWidth: 3 }}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-bold text-primary leading-snug">{project.address}</h2>
        <HealthBadge health={schedule?.health || "green"} />
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="flex justify-between text-xs text-muted mb-1">
          <span>{schedule?.done || 0}/{schedule?.total || 0} tasks done</span>
          <span className="font-semibold text-ink">{schedule?.overall || 0}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-hairline">
          <div className="h-full rounded transition-all" style={{ width: `${schedule?.overall || 0}%`, backgroundColor: color }} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
        {schedule?.overdue > 0 && (
          <span className="text-danger font-semibold col-span-2">{schedule.overdue} overdue task{schedule.overdue !== 1 ? "s" : ""}</span>
        )}
        <span>Won: <strong className="text-ink">{won}</strong></span>
        <span>Trades: <strong className="text-ink">{schedule?.activeTrades?.length || 0} active</strong></span>
        {schedule?.nextMilestone && (
          <span className="col-span-2 truncate">
            Next milestone: <strong className="text-ink">{schedule.nextMilestone.name}</strong>
          </span>
        )}
        {project.buildexact_job_id ? (
          <span className="text-accent font-semibold">BX linked</span>
        ) : (
          <span className="text-warning">BX not linked</span>
        )}
      </div>
    </Link>
  );
}

function ProjectRow({ project, colorIdx }) {
  const { schedule } = project;
  const color = PROJECT_COLORS[colorIdx % PROJECT_COLORS.length];
  const won = project.jobs?.won_at ? fmtDate(project.jobs.won_at) : "—";

  return (
    <tr className="border-b border-hairline hover:bg-page">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: color }} />
          <Link to={`/operations/${project.id}`} className="font-semibold text-primary hover:underline text-sm">
            {project.address}
          </Link>
        </div>
      </td>
      <td className="px-3 py-2.5"><HealthBadge health={schedule?.health || "green"} /></td>
      <td className="px-3 py-2.5 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-20 h-1.5 overflow-hidden rounded bg-hairline">
            <div className="h-full rounded" style={{ width: `${schedule?.overall || 0}%`, backgroundColor: color }} />
          </div>
          <span className="text-xs text-muted">{schedule?.overall || 0}%</span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-xs text-muted truncate max-w-[160px]">
        {schedule?.nextMilestone ? <span className="font-medium text-ink">{schedule.nextMilestone.name}</span> : <span className="text-muted">—</span>}
      </td>
      <td className="px-3 py-2.5 text-xs text-muted">
        {schedule?.overdue > 0 ? <span className="text-danger font-semibold">{schedule.overdue}</span> : <span className="text-green-600">—</span>}
      </td>
      <td className="px-3 py-2.5 text-xs text-muted">{schedule?.activeTrades?.length || 0}</td>
      <td className="px-3 py-2.5 text-xs text-muted">{won}</td>
      <td className="px-3 py-2.5 text-xs">
        {project.buildexact_job_id
          ? <span className="text-accent font-semibold">Linked</span>
          : <span className="text-warning">Pending</span>}
      </td>
    </tr>
  );
}

function GlobalGantt({ projects, tasks, filterTrade, onFilterTrade }) {
  const [zoom, setZoom] = useState("Month");
  const viewMode = zoom === "Week" ? ViewMode.Day : zoom === "Project" ? ViewMode.Month : ViewMode.Week;
  const colWidth  = zoom === "Week" ? 46 : zoom === "Project" ? 90 : 70;

  const colorMap = useMemo(() => {
    const m = {};
    projects.forEach((p, i) => { m[p.id] = PROJECT_COLORS[i % PROJECT_COLORS.length]; });
    return m;
  }, [projects]);

  const ganttTasks = useMemo(() => {
    const filtered = filterTrade
      ? tasks.filter((t) => (t.assignee_trade || t.trade || "").toLowerCase() === filterTrade.toLowerCase())
      : tasks;

    const byProject = {};
    for (const t of filtered) {
      if (!byProject[t.project_id]) byProject[t.project_id] = [];
      byProject[t.project_id].push(t);
    }

    const out = [];
    for (const p of projects) {
      const ptasks = byProject[p.id];
      if (!ptasks?.length) continue;
      const color = colorMap[p.id];
      const starts = ptasks.map((t) => t.start_date).filter(Boolean).sort();
      const ends   = ptasks.map((t) => t.end_date || t.start_date).filter(Boolean).sort();
      if (!starts.length) continue;

      out.push({
        id: `proj:${p.id}`,
        name: p.address,
        type: "project",
        start: new Date(`${starts[0]}T12:00:00`),
        end: new Date(`${ends.at(-1)}T12:00:00`),
        progress: Math.round(ptasks.reduce((s, t) => s + (Number(t.percent_complete) || 0), 0) / ptasks.length),
        hideChildren: false,
        styles: { backgroundColor: "#e5e7eb", progressColor: color, progressSelectedColor: color },
      });

      for (const t of ptasks) {
        const isMilestone = t.task_type === "milestone" || t.is_hold_point;
        out.push({
          id: t.id,
          project: `proj:${p.id}`,
          name: t.name,
          type: isMilestone ? "milestone" : "task",
          start: t.start_date ? new Date(`${t.start_date}T12:00:00`) : new Date(),
          end: t.end_date ? new Date(`${t.end_date}T12:00:00`) : new Date(),
          progress: Number(t.percent_complete) || 0,
          styles: { backgroundColor: `${color}26`, progressColor: color, progressSelectedColor: color },
        });
      }
    }
    return out;
  }, [projects, tasks, filterTrade, colorMap]);

  const tradeOptions = useMemo(() => {
    const s = new Set(tasks.map((t) => t.assignee_trade || t.trade).filter(Boolean));
    return [...s].sort();
  }, [tasks]);

  if (!ganttTasks.length) {
    return <p className="text-sm text-muted py-4">No scheduled tasks found across active projects.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-muted">
          Zoom
          <select value={zoom} onChange={(e) => setZoom(e.target.value)} className="rounded-lg border border-hairline bg-surface px-2 py-1 text-ink">
            <option value="Week">Week</option>
            <option value="Month">Month</option>
            <option value="Project">Project</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-muted">
          Trade
          <select value={filterTrade} className="rounded-lg border border-hairline bg-surface px-2 py-1 text-ink" onChange={e => onFilterTrade?.(e.target.value)}>
            <option value="">All trades</option>
            {tradeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      {/* Project colour legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {projects.map((p, i) => (
          <span key={p.id} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: PROJECT_COLORS[i % PROJECT_COLORS.length] }} />
            {p.address}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-card border border-hairline bg-surface p-2">
        <Gantt
          tasks={ganttTasks}
          viewMode={viewMode}
          columnWidth={colWidth}
          listCellWidth=""
        />
      </div>
    </div>
  );
}

export default function OperationsList() {
  const [projects, setProjects] = useState([]);
  const [globalTasks, setGlobalTasks] = useState([]);
  const [globalProjects, setGlobalProjects] = useState([]);
  const [tradeConflicts, setTradeConflicts] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [cardMode, setCardMode] = useState("list"); // "card" | "list"
  const [filterTrade, setFilterTrade] = useState("");
  const [ganttOpen, setGanttOpen] = useState(() => {
    try { return localStorage.getItem("blhub_global_gantt_open") !== "false"; } catch { return true; }
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/operations/projects");
      const j = await res.json();
      if (res.ok && j.ok) setProjects(j.projects || []);
      else setError(j.error || "Failed to load projects");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGlobal = useCallback(async () => {
    try {
      const res = await fetch("/api/operations/global-tasks");
      const j = await res.json();
      if (res.ok && j.ok) {
        setGlobalTasks(j.tasks || []);
        setGlobalProjects(j.projects || []);
      }
    } catch {
      // non-fatal
    }
  }, []);

  const loadConflicts = useCallback(async () => {
    try {
      const res = await fetch("/api/operations/trade-conflicts");
      const j = await res.json();
      if (res.ok && j.ok) setTradeConflicts(j.conflicts || []);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadGlobal(); }, [loadGlobal]);
  useEffect(() => { loadConflicts(); }, [loadConflicts]);

  function toggleGantt() {
    setGanttOpen(prev => {
      const next = !prev;
      try { localStorage.setItem("blhub_global_gantt_open", String(next)); } catch { /* noop */ }
      return next;
    });
  }

  return (
    <div className="space-y-6 pb-24">
      <header>
        <h1 className="page-title text-2xl">Active projects</h1>
        <p className="mt-0.5 text-sm text-muted">Won tenders appear here. Click any project to open its hub.</p>
      </header>

      {error && <div className="text-sm text-danger">{error}</div>}

      {/* Pinned Global Gantt */}
      <div className="rounded-card border border-hairline bg-surface overflow-hidden">
        <button
          type="button"
          onClick={toggleGantt}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-ink hover:bg-page transition-colors"
        >
          <span className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">All Projects — Schedule</span>
            {globalTasks.length > 0 && (
              <span className="rounded-full bg-page border border-hairline px-2 py-0.5 text-xs text-muted font-normal">
                {globalProjects.length} projects · {globalTasks.length} tasks
              </span>
            )}
            {tradeConflicts.length > 0 && (
              <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                {tradeConflicts.length} trade conflict{tradeConflicts.length !== 1 ? "s" : ""}
              </span>
            )}
          </span>
          <span className={`text-muted transition-transform ${ganttOpen ? "rotate-180" : ""}`}>▾</span>
        </button>
        {ganttOpen && (
          <div className="border-t border-hairline px-4 pb-4 pt-3 space-y-4">
            {tradeConflicts.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-warning">Trade scheduling conflicts</p>
                {tradeConflicts.map((c) => (
                  <div key={c.trade} className="text-xs text-ink">
                    <span className="font-semibold">{c.trade}</span>
                    {" is booked across "}
                    {c.projects.map((p, i) => (
                      <span key={p.id}>
                        {i > 0 && " and "}
                        <span className="font-semibold">{p.address}</span>
                        {" ("}
                        {new Date(p.startDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                        {"–"}
                        {new Date(p.endDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                        {")"}
                      </span>
                    ))}
                    {" on overlapping dates"}
                  </div>
                ))}
              </div>
            )}
            {globalTasks.length === 0 ? (
              <p className="text-sm text-muted py-2">No scheduled tasks found — add a schedule to a project to see it here.</p>
            ) : (
              <GlobalGantt
                projects={globalProjects.length ? globalProjects : projects.map((p) => ({ id: p.id, address: p.address }))}
                tasks={globalTasks}
                filterTrade={filterTrade}
                onFilterTrade={setFilterTrade}
              />
            )}
          </div>
        )}
      </div>

      {/* Projects section */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Active projects</h2>
        <div className="flex items-center gap-1 rounded-lg border border-hairline bg-surface p-1">
          <button type="button" onClick={() => setCardMode("card")} title="Card view" className={`rounded px-2 py-1 text-sm ${cardMode === "card" ? "bg-primary text-white" : "text-muted"}`}>⊞</button>
          <button type="button" onClick={() => setCardMode("list")} title="List view" className={`rounded px-2 py-1 text-sm ${cardMode === "list" ? "bg-primary text-white" : "text-muted"}`}>☰</button>
        </div>
      </div>

      {loading && <p className="text-sm text-muted">Loading…</p>}

      {!loading && (
        <>
          {!projects.length ? (
            <p className="text-sm text-muted">No projects yet — mark a tender as won in Tender Manager.</p>
          ) : cardMode === "card" ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((p, i) => <ProjectCard key={p.id} project={p} colorIdx={i} />)}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-card border border-hairline bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-hairline bg-page section-label">
                  <tr>
                    {["Address", "Stage", "Progress", "Next Milestone", "Risk", "Trades", "Won", "BX"].map((h) => (
                      <th key={h} className="px-3 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p, i) => <ProjectRow key={p.id} project={p} colorIdx={i} />)}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
