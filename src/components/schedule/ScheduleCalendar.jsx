import { useMemo, useState } from "react";
import { daysBetween, phaseColor } from "../../lib/scheduleUtils.js";

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

export default function ScheduleCalendar({ tasks = [], filterTrade, onOpenTask }) {
  const [cursor, setCursor] = useState(() => monthStart(new Date()));
  const cells = useMemo(() => {
    const first = monthStart(cursor);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);
  const visible = filterTrade ? tasks.filter((t) => (t.assignee_trade || t.trade || "").toLowerCase() === filterTrade.toLowerCase()) : tasks;

  return (
    <div className="rounded-card border border-hairline bg-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="rounded-lg border border-hairline px-3 py-2 text-sm text-ink">Prev</button>
        <h2 className="text-lg font-bold text-primary">{cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}</h2>
        <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="rounded-lg border border-hairline px-3 py-2 text-sm text-ink">Next</button>
      </div>
      <div className="mt-3 grid grid-cols-7 text-center text-xs font-semibold uppercase tracking-wide text-muted">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-hairline">
        {cells.map((date) => {
          const dateYmd = ymd(date);
          const dayTasks = visible.filter((t) => t.start_date && (t.end_date || t.start_date) && t.start_date <= dateYmd && (t.end_date || t.start_date) >= dateYmd);
          const muted = date.getMonth() !== cursor.getMonth();
          return (
            <div key={dateYmd} className={`min-h-[120px] border-b border-r border-hairline p-1 ${muted ? "bg-page/50" : "bg-surface"}`}>
              <p className={`text-xs font-semibold ${muted ? "text-muted" : "text-ink"}`}>{date.getDate()}</p>
              <div className="mt-1 space-y-1">
                {dayTasks.slice(0, 4).map((task) => {
                  const duration = Math.max(0, daysBetween(task.start_date, task.end_date || task.start_date));
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onOpenTask(task)}
                      className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-semibold text-white"
                      style={{ backgroundColor: phaseColor(task.phase), opacity: duration > 6 ? 0.95 : 0.85 }}
                      title={task.name}
                    >
                      {task.name}
                    </button>
                  );
                })}
                {dayTasks.length > 4 ? <p className="text-[11px] text-muted">+{dayTasks.length - 4} more</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
