import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkerLayout from "../../components/worker/WorkerLayout.jsx";
import { workerFetch } from "../../lib/workerFetch.js";

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["M", "T", "W", "T", "F", "S", "S"];
// Local calendar date (NOT toISOString — that shifts a day in AU timezones).
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

// Worker "My timesheets" calendar — green = logged, red = a working day with nothing
// logged, so the boys can work backward and keep every day complete.
export default function WorkerWeek() {
  const navigate = useNavigate();
  const [view, setView] = useState(() => firstOfMonth(new Date()));
  const [byDate, setByDate] = useState({});
  const [loading, setLoading] = useState(true);

  const monthStart = ymd(view);
  const monthEnd = ymd(new Date(view.getFullYear(), view.getMonth() + 1, 0));

  useEffect(() => {
    let stop = false;
    setLoading(true);
    workerFetch(`/api/worker/timesheets?from=${monthStart}&to=${monthEnd}`)
      .then((r) => r.json())
      .then((j) => { if (stop) return; const m = {}; for (const t of (j.timesheets || [])) m[t.date] = t; setByDate(m); })
      .catch(() => {})
      .finally(() => { if (!stop) setLoading(false); });
    return () => { stop = true; };
  }, [monthStart, monthEnd]);

  const cells = useMemo(() => {
    const offset = (view.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const todayStr = ymd(new Date());
    const out = [];
    for (let i = 0; i < offset; i++) out.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(view.getFullYear(), view.getMonth(), day);
      const key = ymd(d);
      const ts = byDate[key] || null;
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const isFuture = key > todayStr;
      let dot = null;
      if (ts && (ts.status === "submitted" || ts.status === "approved")) dot = "green";
      else if (ts && ts.status === "rejected") dot = "red";
      else if (!ts && !isWeekend && !isFuture) dot = "red";
      out.push({ key, day, dot, isFuture, isToday: key === todayStr, isWeekend });
    }
    return out;
  }, [view, byDate]);

  const canForward = view < firstOfMonth(new Date());
  const missing = cells.filter((c) => c && c.dot === "red").length;

  return (
    <WorkerLayout>
      <div className="px-4 pb-8">
        <h1 className="text-lg font-bold text-ink pt-4 mb-1">My timesheets</h1>
        <p className="text-sm text-muted mb-3">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 align-middle mr-1" />Logged
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 align-middle ml-3 mr-1" />Working day not logged. Tap a day to add or edit it.
        </p>

        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))} aria-label="Previous month" className="w-9 h-9 rounded-full border border-hairline text-ink text-lg flex items-center justify-center">‹</button>
          <span className="text-sm font-semibold text-ink">{MON[view.getMonth()]} {view.getFullYear()}</span>
          <button type="button" disabled={!canForward} onClick={() => canForward && setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))} aria-label="Next month" className="w-9 h-9 rounded-full border border-hairline text-ink text-lg flex items-center justify-center disabled:opacity-30">›</button>
        </div>

        {missing > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-sm mb-2 text-amber-800">
            <span className="font-semibold">{missing}</span> day{missing > 1 ? "s" : ""} this month not logged — the red ones.
          </div>
        )}

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WD.map((w, i) => <div key={i} className="text-center text-[11px] font-semibold text-muted py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c, i) => c === null ? <div key={i} /> : (
            <button
              key={i}
              type="button"
              disabled={c.isFuture}
              onClick={() => navigate(`/worker/timesheet/log?date=${c.key}`)}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm ${c.isToday ? "ring-2 ring-primary" : "border border-hairline"} ${c.isFuture ? "opacity-30" : "bg-white active:scale-95"}`}
            >
              <span className={`${c.isWeekend ? "text-muted" : "text-ink"} font-medium leading-none`}>{c.day}</span>
              {c.dot && <span className={`w-1.5 h-1.5 rounded-full mt-1 ${c.dot === "green" ? "bg-green-500" : "bg-red-500"}`} />}
            </button>
          ))}
        </div>
        {loading && <div className="text-center text-xs text-muted mt-3">Loading…</div>}
      </div>
    </WorkerLayout>
  );
}
