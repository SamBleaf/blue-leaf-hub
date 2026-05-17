import { Gantt, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import { groupTasksByPhase, phaseColor, phaseLabel, tasksActiveInWindow } from "../../lib/scheduleUtils.js";

function toDate(ymd) {
  const d = ymd ? new Date(`${ymd}T12:00:00`) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function toYmdFromDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function toGanttTasks(tasks, phaseLabels, showCritical) {
  const { order, groups } = groupTasksByPhase(tasks);
  const out = [];
  for (const phase of order) {
    const list = groups[phase] || [];
    const starts = list.map((t) => t.start_date).filter(Boolean).sort();
    const ends = list.map((t) => t.end_date || t.start_date).filter(Boolean).sort();
    const color = phaseColor(phase);
    if (starts.length && ends.length) {
      out.push({
        id: `phase:${phase}`,
        name: phaseLabel(phase, phaseLabels),
        type: "project",
        start: toDate(starts[0]),
        end: toDate(ends.at(-1)),
        progress: Math.round(list.reduce((sum, t) => sum + (Number(t.percent_complete) || 0), 0) / Math.max(1, list.length)),
        hideChildren: false,
        styles: { progressColor: color, progressSelectedColor: color, backgroundColor: "#e5e7eb", backgroundSelectedColor: "#d1d5db" }
      });
    }
    for (const t of list) {
      const isMilestone = t.task_type === "milestone" || Number(t.duration_days) === 0 || t.is_hold_point;
      const isProcurement = t.task_type === "procurement";
      out.push({
        id: t.id,
        project: starts.length ? `phase:${phase}` : undefined,
        name: `${isProcurement ? "PROC " : ""}${t.name}`,
        type: isMilestone ? "milestone" : "task",
        start: toDate(t.start_date),
        end: toDate(t.end_date || t.start_date),
        progress: Number(t.percent_complete) || 0,
        dependencies: Array.isArray(t.depends_on) ? t.depends_on : [],
        styles: {
          progressColor: isProcurement ? "#d97706" : color,
          progressSelectedColor: isProcurement ? "#d97706" : color,
          backgroundColor: showCritical && t.is_critical_path ? "#fed7aa" : isProcurement ? "#fef3c7" : "#e5e7eb",
          backgroundSelectedColor: showCritical && t.is_critical_path ? "#fdba74" : "#d1d5db"
        }
      });
    }
  }
  return out;
}

export default function ScheduleGantt({ tasks = [], phaseLabels = {}, zoom = "Month", showCritical, lookahead, filterTrade, onOpenTask, onDateChange, onProgressChange, onAddTask }) {
  const today = new Date().toISOString().slice(0, 10);
  const lookaheadEnd = new Date();
  lookaheadEnd.setDate(lookaheadEnd.getDate() + 21);
  const windowed = lookahead ? tasksActiveInWindow(tasks, today, lookaheadEnd.toISOString().slice(0, 10)) : tasks;
  const filtered = filterTrade ? windowed.filter((t) => (t.assignee_trade || t.trade || "").toLowerCase() === filterTrade.toLowerCase()) : windowed;
  const ganttTasks = toGanttTasks(filtered, phaseLabels, showCritical);
  const viewMode = zoom === "Week" ? ViewMode.Day : zoom === "Project" ? ViewMode.Month : ViewMode.Week;

  if (!ganttTasks.length) {
    return (
      <div className="rounded-card border border-dashed border-hairline bg-page p-8 text-center">
        <p className="text-muted">No tasks match this view.</p>
        <button type="button" onClick={() => onAddTask?.()} className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Add task</button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {lookahead ? <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">3-week lookahead active: today to {lookaheadEnd.toISOString().slice(0, 10)}</p> : null}
      <div className="overflow-x-auto rounded-card border border-hairline bg-surface p-2">
        <Gantt
          tasks={ganttTasks}
          viewMode={viewMode}
          listCellWidth="220px"
          columnWidth={zoom === "Week" ? 46 : zoom === "Project" ? 90 : 70}
          onClick={(task) => {
            if (!String(task.id).startsWith("phase:")) onOpenTask?.(task.id);
          }}
          onDoubleClick={(task) => {
            if (String(task.id).startsWith("phase:")) onAddTask?.(String(task.id).replace("phase:", ""));
          }}
          onDateChange={(task) => {
            if (!String(task.id).startsWith("phase:")) onDateChange?.(task.id, toYmdFromDate(task.start), toYmdFromDate(task.end));
            return true;
          }}
          onProgressChange={(task) => {
            if (!String(task.id).startsWith("phase:")) onProgressChange?.(task.id, task.progress);
            return true;
          }}
        />
      </div>
    </div>
  );
}
