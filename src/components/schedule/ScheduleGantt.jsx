import { useEffect, useRef, useState } from "react";
import { Gantt, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import {
  getTaskGanttStyles,
  groupTasksByPhase,
  phaseColor,
  phaseLabel,
  tasksActiveInWindow,
} from "../../lib/scheduleUtils.js";

// ─── Ghost bar helpers ────────────────────────────────────────────────────────

function getChartStartDate(ganttTasks, viewMode) {
  if (!ganttTasks.length) return new Date();
  const earliest = new Date(Math.min(...ganttTasks.map((t) => t.start.getTime())));
  if (viewMode === ViewMode.Day) {
    const d = new Date(earliest);
    d.setDate(d.getDate() - 1);
    return d;
  }
  const d = new Date(earliest);
  d.setMonth(d.getMonth() - 1);
  if (viewMode === ViewMode.Week) {
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  } else {
    d.setDate(1);
  }
  return d;
}

function getPxPerDay(viewMode, colWidth) {
  if (viewMode === ViewMode.Day) return colWidth;
  if (viewMode === ViewMode.Week) return colWidth / 7;
  return colWidth / 30;
}

function GhostBars({ tasks, ganttTasks, showColumns, viewMode, colWidth }) {
  const drifted = tasks.filter(
    (t) =>
      t.baseline_start_date &&
      t.baseline_end_date &&
      (t.start_date !== t.baseline_start_date || t.end_date !== t.baseline_end_date)
  );
  if (!drifted.length) return null;

  const chartStart = getChartStartDate(ganttTasks, viewMode);
  const pxPerDay   = getPxPerDay(viewMode, colWidth);
  const leftOffset = showColumns ? COLUMNS_PX : 0;

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      style={{ left: leftOffset, top: 0, width: `calc(100% - ${leftOffset}px)`, height: "100%", overflow: "visible", zIndex: 5 }}
    >
      {drifted.map((task) => {
        const rowIdx = ganttTasks.findIndex((gt) => gt.id === task.id);
        if (rowIdx < 0) return null;
        const bStart = new Date(`${task.baseline_start_date}T12:00:00`);
        const bEnd   = new Date(`${task.baseline_end_date}T12:00:00`);
        const ghostX = Math.round((bStart - chartStart) / 86400000 * pxPerDay);
        const ghostW = Math.max(4, Math.round((bEnd - bStart) / 86400000 * pxPerDay + pxPerDay));
        const ghostY = HEADER_HEIGHT + rowIdx * ROW_HEIGHT + Math.round((ROW_HEIGHT - 8) / 2);
        return (
          <rect
            key={task.id}
            x={ghostX}
            y={ghostY}
            width={ghostW}
            height={8}
            rx={3}
            fill="#64748b"
            fillOpacity={0.25}
            stroke="#64748b"
            strokeOpacity={0.45}
            strokeWidth={1}
          />
        );
      })}
    </svg>
  );
}

const COLUMNS_WIDTH = "330px";
const COLUMNS_PX    = 330;
const ROW_HEIGHT    = 50;
const HEADER_HEIGHT = 50;

function toDate(ymd) {
  const d = ymd ? new Date(`${ymd}T12:00:00`) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function toYmdFromDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function fmtShort(iso) {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

// ─── Custom left-panel components ────────────────────────────────────────────

function GanttListHeader({ headerHeight }) {
  return (
    <div style={{ height: headerHeight, display: "flex", alignItems: "center", background: "#f8f9fa", borderBottom: "1px solid #e5e7eb", boxSizing: "border-box", userSelect: "none" }}>
      <div style={{ flex: 1, minWidth: 0, padding: "0 8px 0 28px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Task</div>
      <div style={{ width: 62, padding: "0 4px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center", flexShrink: 0 }}>From</div>
      <div style={{ width: 62, padding: "0 4px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center", flexShrink: 0 }}>To</div>
      <div style={{ width: 38, padding: "0 6px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center", flexShrink: 0 }}>Days</div>
    </div>
  );
}

function GanttListTable({ rowHeight, tasks: ganttTasks, onExpanderClick }) {
  return (
    <div>
      {ganttTasks.map((task) => {
        const isPhase  = String(task.id).startsWith("phase:");
        const startYmd = task.start ? toYmdFromDate(task.start) : "";
        const endYmd   = task.end   ? toYmdFromDate(task.end)   : "";
        const dur = startYmd && endYmd
          ? Math.round((new Date(`${endYmd}T12:00:00`) - new Date(`${startYmd}T12:00:00`)) / 86400000) + 1
          : null;
        return (
          <div key={task.id} style={{ height: rowHeight, display: "flex", alignItems: "center", background: isPhase ? "#f8f9fa" : "#ffffff", borderBottom: "1px solid #f1f5f9", boxSizing: "border-box" }}>
            <div style={{ flex: 1, minWidth: 0, padding: "0 8px", overflow: "hidden", display: "flex", alignItems: "center", gap: 4 }}>
              {isPhase && (
                <button
                  type="button"
                  style={{ fontSize: 9, color: "#94a3b8", lineHeight: 1, flexShrink: 0, background: "none", border: "none", cursor: "pointer", padding: "0 2px", marginLeft: 2 }}
                  onClick={() => onExpanderClick(task)}
                >
                  {task.hideChildren ? "▶" : "▼"}
                </button>
              )}
              <span style={{ fontSize: isPhase ? 11 : 12, fontWeight: isPhase ? 700 : 400, color: isPhase ? "#374151" : "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                {task.name}
              </span>
            </div>
            <div style={{ width: 62, padding: "0 4px", fontSize: 11, color: "#64748b", textAlign: "center", flexShrink: 0 }}>{isPhase ? "" : fmtShort(startYmd)}</div>
            <div style={{ width: 62, padding: "0 4px", fontSize: 11, color: "#64748b", textAlign: "center", flexShrink: 0 }}>{isPhase ? "" : fmtShort(endYmd)}</div>
            <div style={{ width: 38, padding: "0 6px", fontSize: 11, color: "#94a3b8", textAlign: "center", flexShrink: 0 }}>{isPhase || dur == null ? "" : `${dur}d`}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Context menu ─────────────────────────────────────────────────────────────

function ContextMenu({ x, y, task, onMarkComplete, onMarkInProgress, onEdit, onDelete, onClose }) {
  useEffect(() => {
    const onKey   = (e) => { if (e.key === "Escape") onClose(); };
    const onClick = () => onClose();
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  const isComplete   = (Number(task.percent_complete) || 0) >= 100;
  const isInProgress = !isComplete && (Number(task.percent_complete) || 0) > 0;
  const menuX = Math.min(x, window.innerWidth  - 188);
  const menuY = Math.min(y, window.innerHeight - 200);

  return (
    <div
      className="fixed z-[200] w-44 rounded-lg border border-hairline bg-surface shadow-xl py-1 text-sm"
      style={{ left: menuX, top: menuY }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 border-b border-hairline mb-1">
        <p className="text-xs font-semibold text-ink truncate">{task.name}</p>
        <p className="text-xs text-muted capitalize">{String(task.phase || "").replace(/_/g, " ")}</p>
      </div>

      {!isComplete && (
        <button type="button" onClick={() => { onMarkComplete(); onClose(); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-page text-ink">
          <span className="text-green-500 text-base leading-none">✓</span> Mark complete
        </button>
      )}
      {!isComplete && !isInProgress && (
        <button type="button" onClick={() => { onMarkInProgress(); onClose(); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-page text-ink">
          <span className="text-blue-500 text-base leading-none">▷</span> Mark in progress
        </button>
      )}
      <button type="button" onClick={() => { onEdit(); onClose(); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-page text-ink">
        <span className="text-muted">✎</span> Edit task
      </button>
      <div className="my-1 border-t border-hairline" />
      <button type="button" onClick={() => { onDelete(); onClose(); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-page text-red-600">
        <span>✕</span> Delete task
      </button>
    </div>
  );
}

// ─── Gantt task conversion ────────────────────────────────────────────────────

function toGanttTasks(tasks, phaseLabels, showCritical) {
  const today = new Date().toISOString().slice(0, 10);
  const { order, groups } = groupTasksByPhase(tasks);
  const out = [];
  for (const phase of order) {
    const list   = groups[phase] || [];
    const starts = list.map((t) => t.start_date).filter(Boolean).sort();
    const ends   = list.map((t) => t.end_date || t.start_date).filter(Boolean).sort();
    const color  = phaseColor(phase);
    if (starts.length && ends.length) {
      out.push({
        id: `phase:${phase}`,
        name: phaseLabel(phase, phaseLabels),
        type: "project",
        start: toDate(starts[0]),
        end: toDate(ends.at(-1)),
        progress: Math.round(list.reduce((s, t) => s + (Number(t.percent_complete) || 0), 0) / Math.max(1, list.length)),
        hideChildren: false,
        styles: { progressColor: color, progressSelectedColor: color, backgroundColor: "#e5e7eb", backgroundSelectedColor: "#d1d5db" },
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
        styles: getTaskGanttStyles(t, color, showCritical, today),
      });
    }
  }
  return out;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScheduleGantt({
  tasks = [],
  phaseLabels = {},
  zoom = "Month",
  showCritical,
  lookahead,
  filterTrade,
  onOpenTask,
  onDateChange,
  onProgressChange,
  onAddTask,
  showColumns = false,
  onToggleColumns,
  onQuickPatch,
  onContextDelete,
  baselineLocked = null,
  onLockBaseline,
  onResetBaseline,
}) {
  const [ctxMenu, setCtxMenu] = useState(null);
  const containerRef = useRef(null);

  const today        = new Date().toISOString().slice(0, 10);
  const lookaheadEnd = new Date();
  lookaheadEnd.setDate(lookaheadEnd.getDate() + 21);

  const windowed  = lookahead ? tasksActiveInWindow(tasks, today, lookaheadEnd.toISOString().slice(0, 10)) : tasks;
  const filtered  = filterTrade ? windowed.filter((t) => (t.assignee_trade || t.trade || "").toLowerCase() === filterTrade.toLowerCase()) : windowed;
  const ganttTasks = toGanttTasks(filtered, phaseLabels, showCritical);
  const viewMode  = zoom === "Week" ? ViewMode.Day : zoom === "Project" ? ViewMode.Month : ViewMode.Week;
  const colWidth  = zoom === "Week" ? 46 : zoom === "Project" ? 90 : 70;

  function handleContextMenu(e) {
    e.preventDefault();
    if (!containerRef.current || !ganttTasks.length) return;
    const rect = containerRef.current.getBoundingClientRect();
    const lookaheadBannerH = lookahead ? 52 : 0;
    // p-2 (8px) + lookahead banner + gantt header (50px)
    const chartTop = rect.top + 8 + lookaheadBannerH + HEADER_HEIGHT;
    const rowIndex  = Math.floor((e.clientY - chartTop) / ROW_HEIGHT);
    if (rowIndex < 0 || rowIndex >= ganttTasks.length) return;
    const gt = ganttTasks[rowIndex];
    if (!gt || String(gt.id).startsWith("phase:")) return;
    const rawTask = tasks.find((t) => t.id === gt.id);
    if (!rawTask) return;
    setCtxMenu({ x: e.clientX, y: e.clientY, task: rawTask });
  }

  if (!ganttTasks.length) {
    return (
      <div className="rounded-card border border-dashed border-hairline bg-page p-8 text-center">
        <p className="text-muted">No tasks match this view.</p>
        <button type="button" onClick={() => onAddTask?.()} className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Add task</button>
      </div>
    );
  }

  const driftedCount = baselineLocked
    ? tasks.filter(
        (t) =>
          t.baseline_start_date &&
          t.baseline_end_date &&
          (t.start_date !== t.baseline_start_date || t.end_date !== t.baseline_end_date)
      ).length
    : 0;

  // Vertical position of the toggle button (aligns with the Gantt header row)
  const baselineBarH = 44; // height of baseline control strip
  const toggleBtnTop = (lookahead ? 52 : 0) + baselineBarH + 9;
  const toggleBtnLeft = showColumns ? COLUMNS_PX - 16 : 8;

  return (
    <div className="space-y-2">
      {lookahead && (
        <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
          3-week lookahead active: today → {lookaheadEnd.toISOString().slice(0, 10)}
        </p>
      )}

      {/* Baseline control bar */}
      {baselineLocked ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          <span className="font-semibold text-primary">
            Baseline locked {new Date(baselineLocked).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
          </span>
          {driftedCount > 0 && (
            <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
              {driftedCount} task{driftedCount !== 1 ? "s" : ""} drifted
            </span>
          )}
          {driftedCount === 0 && (
            <span className="text-xs text-muted">No drift — on baseline</span>
          )}
          <button
            type="button"
            onClick={onResetBaseline}
            className="ml-auto rounded-lg border border-hairline px-2 py-1 text-xs text-muted hover:border-danger/40 hover:text-danger"
          >
            Reset baseline
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm">
          <span className="text-muted">No baseline set</span>
          <button
            type="button"
            onClick={onLockBaseline}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
          >
            Lock Baseline
          </button>
        </div>
      )}

      {/* Gantt wrapper — relative so the toggle button can be absolutely positioned */}
      <div className="relative">
        {/* Column toggle button — floats at the edge of the list panel */}
        <button
          type="button"
          onClick={onToggleColumns}
          title={showColumns ? "Hide columns" : "Show columns (Name · From · To · Days)"}
          className="absolute z-10 flex items-center justify-center rounded border border-hairline bg-surface/95 text-muted shadow-sm hover:border-primary/40 hover:text-primary transition-colors"
          style={{ top: toggleBtnTop, left: toggleBtnLeft, width: 18, height: 18, fontSize: 9 }}
        >
          {showColumns ? "◁" : "▷"}
        </button>

        <div
          ref={containerRef}
          className="relative overflow-x-auto rounded-card border border-hairline bg-surface p-2"
          onContextMenu={handleContextMenu}
        >
          {baselineLocked && (
            <GhostBars
              tasks={tasks}
              ganttTasks={ganttTasks}
              showColumns={showColumns}
              viewMode={viewMode}
              colWidth={colWidth}
            />
          )}
          <Gantt
            tasks={ganttTasks}
            viewMode={viewMode}
            listCellWidth={showColumns ? COLUMNS_WIDTH : ""}
            columnWidth={colWidth}
            TaskListHeader={showColumns ? GanttListHeader : undefined}
            TaskListTable={showColumns  ? GanttListTable  : undefined}
            onClick={(task) => {
              if (!String(task.id).startsWith("phase:")) onOpenTask?.(task.id);
            }}
            onDoubleClick={(task) => {
              if (String(task.id).startsWith("phase:")) onAddTask?.(String(task.id).replace("phase:", ""));
            }}
            onDateChange={(task) => {
              if (!String(task.id).startsWith("phase:"))
                onDateChange?.(task.id, toYmdFromDate(task.start), toYmdFromDate(task.end));
              return true;
            }}
            onProgressChange={(task) => {
              if (!String(task.id).startsWith("phase:")) onProgressChange?.(task.id, task.progress);
              return true;
            }}
          />
        </div>
      </div>

      {/* Colour legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted select-none">
        {[
          { bg: "linear-gradient(to right,#86efac 100%,#e5e7eb 0%)", label: "Complete" },
          { bg: "linear-gradient(to right,#ea580c 45%,#fce0d4 45%)", label: "In progress" },
          { bg: "#fee2e2",  label: "Overdue" },
          { bg: "#fed7aa",  label: "Critical path" },
          { bg: "#fef3c7",  label: "Procurement" },
        ].map(({ bg, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2.5 rounded-sm flex-shrink-0" style={{ background: bg, border: "1px solid #e5e7eb" }} />
            {label}
          </span>
        ))}
        <span className="ml-auto text-muted/60 italic">Right-click a task bar for quick actions</span>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          task={ctxMenu.task}
          onMarkComplete={()    => onQuickPatch?.(ctxMenu.task.id, { percent_complete: 100, status: "complete" })}
          onMarkInProgress={()  => onQuickPatch?.(ctxMenu.task.id, { percent_complete: 50,  status: "in_progress" })}
          onEdit={()            => onOpenTask?.(ctxMenu.task.id)}
          onDelete={() => {
            if (window.confirm(`Delete "${ctxMenu.task.name}"?`)) onContextDelete?.(ctxMenu.task.id);
          }}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
