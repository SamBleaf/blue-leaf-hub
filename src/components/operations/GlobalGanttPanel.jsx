// Global cross-project Gantt (presentational). Behaviour-preserving relocation of the prior
// inline GlobalGantt from OperationsList — same gantt-task-react usage, zoom, and trade filter.
import { useMemo, useState } from "react";
import { Gantt, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import { PROJECT_COLORS } from "../../lib/operationsDashboard.js";

export default function GlobalGanttPanel({ projects, tasks, filterTrade, onFilterTrade }) {
  const [zoom, setZoom] = useState("Month");
  const viewMode = zoom === "Week" ? ViewMode.Day : zoom === "Project" ? ViewMode.Month : ViewMode.Week;
  const colWidth = zoom === "Week" ? 46 : zoom === "Project" ? 90 : 70;

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
      const ends = ptasks.map((t) => t.end_date || t.start_date).filter(Boolean).sort();
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
    return <p className="py-4 text-sm text-muted">No scheduled tasks found across active projects.</p>;
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
          <select value={filterTrade} className="rounded-lg border border-hairline bg-surface px-2 py-1 text-ink" onChange={(e) => onFilterTrade?.(e.target.value)}>
            <option value="">All trades</option>
            {tradeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {projects.map((p, i) => (
          <span key={p.id} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: PROJECT_COLORS[i % PROJECT_COLORS.length] }} />
            {p.address}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-card border border-hairline bg-surface p-2">
        <Gantt tasks={ganttTasks} viewMode={viewMode} columnWidth={colWidth} listCellWidth="" />
      </div>
    </div>
  );
}
