import { useEffect, useRef, useState } from "react";
import { SCHEDULE_VIEWS } from "../../lib/scheduleUtils.js";

export default function ScheduleToolbar({
  currentView,
  onViewChange,
  onAddTask,
  onExportPdf,
  onExportCsv,
  onBuildexactMatch,
  onSaveTemplate,
  zoom,
  onZoomChange,
  showCritical,
  onToggleCritical,
  lookahead,
  onToggleLookahead,
  filterTrade,
  onFilterTradeChange,
  tradeOptions = [],
  alertCount = 0,
  onToggleAlerts,
  clickToEdit = false,
  onToggleClickToEdit,
  busy = {},
  canEdit = true
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const close = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [moreOpen]);

  const overflowActions = [
    { key: "pdf", label: busy.pdf ? "PDF…" : "Export PDF", onClick: onExportPdf, disabled: busy.pdf },
    { key: "csv", label: "Export CSV", onClick: onExportCsv },
    { key: "bx", label: busy.buildexact ? "Matching…" : "BX Match", onClick: onBuildexactMatch, disabled: busy.buildexact },
    { key: "template", label: "Save template", onClick: onSaveTemplate },
  ];

  return (
    <div className="rounded-card border border-hairline bg-surface p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-page p-1">
          {SCHEDULE_VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => onViewChange(view.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${currentView === view.id ? "bg-primary text-white" : "text-muted hover:bg-surface hover:text-ink"}`}
            >
              {view.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <button type="button" onClick={onAddTask} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white">
              + Add task
            </button>
          ) : null}
          {onToggleAlerts ? (
            <button type="button" onClick={onToggleAlerts} className={`relative rounded-lg border px-3 py-2 text-sm font-semibold transition ${alertCount > 0 ? "border-warning/50 bg-warning/10 text-ink" : "border-hairline text-muted"}`}>
              Alerts
              {alertCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-warning text-[10px] font-bold text-white">{alertCount}</span>
              )}
            </button>
          ) : null}
          {/* Desktop: inline export / template actions */}
          <div className="hidden md:flex flex-wrap items-center gap-2">
            <button type="button" onClick={onExportPdf} disabled={busy.pdf} className="rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink disabled:opacity-50">
              {busy.pdf ? "PDF..." : "Export PDF"}
            </button>
            <button type="button" onClick={onExportCsv} className="rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink">
              Export CSV
            </button>
            <button type="button" onClick={onBuildexactMatch} disabled={busy.buildexact} className="rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink disabled:opacity-50">
              {busy.buildexact ? "Matching..." : "BX Match"}
            </button>
            <button type="button" onClick={onSaveTemplate} className="rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink">
              Save template
            </button>
          </div>
          {/* Mobile: overflow menu for secondary actions */}
          <div className="relative md:hidden" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              className="rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink"
              aria-expanded={moreOpen}
              aria-haspopup="menu"
            >
              More ⋯
            </button>
            {moreOpen ? (
              <div className="absolute right-0 top-full z-20 mt-1 min-w-[10.5rem] rounded-lg border border-hairline bg-surface py-1 shadow-lg">
                {overflowActions.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    disabled={action.disabled}
                    onClick={() => {
                      action.onClick?.();
                      setMoreOpen(false);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-page disabled:opacity-50"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-muted">
          Zoom
          <select value={zoom} onChange={(e) => onZoomChange(e.target.value)} className="rounded-lg border border-hairline bg-surface px-2 py-1 text-ink">
            <option value="Week">Week</option>
            <option value="Month">Month</option>
            <option value="Project">Project</option>
          </select>
        </label>
        <button type="button" onClick={onToggleCritical} className={`rounded-lg border px-3 py-1.5 font-semibold ${showCritical ? "border-warning bg-warning/10 text-ink" : "border-hairline text-muted"}`}>
          Critical path
        </button>
        <button type="button" onClick={onToggleLookahead} className={`rounded-lg border px-3 py-1.5 font-semibold ${lookahead ? "border-primary bg-primary/10 text-primary" : "border-hairline text-muted"}`}>
          3-week lookahead
        </button>
        {onToggleClickToEdit ? (
          <button
            type="button"
            onClick={onToggleClickToEdit}
            title={clickToEdit ? "Click to edit is ON — clicking a task opens its detail panel" : "Click to edit is OFF — drag tasks silently, right-click to open options"}
            className={`rounded-lg border px-3 py-1.5 font-semibold ${clickToEdit ? "border-accent bg-accent/10 text-accent" : "border-hairline text-muted"}`}
          >
            {clickToEdit ? "✏️ Click to edit" : "Click to edit"}
          </button>
        ) : null}
        <label className="flex items-center gap-2 text-muted">
          Filter trade
          <select value={filterTrade} onChange={(e) => onFilterTradeChange(e.target.value)} className="rounded-lg border border-hairline bg-surface px-2 py-1 text-ink">
            <option value="">All trades</option>
            {tradeOptions.map((trade) => (
              <option key={trade} value={trade}>{trade}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
