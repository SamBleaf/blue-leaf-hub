import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkerLayout from "../../components/worker/WorkerLayout.jsx";
import { workerFetch } from "../../lib/workerFetch.js";

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["M", "T", "W", "T", "F", "S", "S"];
// Local calendar date (NOT toISOString — that shifts a day in AU timezones).
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

// Worker "My Week" — a logged/missing calendar so the boys work backward and keep every day complete.
export default function WorkerWeek() {
  const navigate = useNavigate();
  const [view, setView] = useState(() => firstOfMonth(new Date()));
  const [byDate, setByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null); // null | "auth" | "load"

  const monthStart = ymd(view);
  const monthEnd = ymd(new Date(view.getFullYear(), view.getMonth() + 1, 0));

  useEffect(() => {
    let stop = false;
    setLoading(true);
    setLoadError(null);
    workerFetch(`/api/worker/timesheets?from=${monthStart}&to=${monthEnd}`)
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
      .then(({ status, body }) => {
        if (stop) return;
        // Don't paint a failed load as "every day missing" — surface the error instead.
        if (status === 401) { setLoadError("auth"); return; }
        if (!body.ok) { setLoadError("load"); return; }
        const m = {}; for (const t of (body.timesheets || [])) m[t.date] = t; setByDate(m);
      })
      .catch(() => { if (!stop) setLoadError("load"); })
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
      else if (ts && ts.status === "rejected") dot = "amber"; // returned — needs resubmit
      else if (!ts && !isWeekend && !isFuture && !loadError) dot = "red"; // working day, nothing logged
      out.push({ key, day, dot, isFuture, isToday: key === todayStr, isWeekend });
    }
    return out;
  }, [view, byDate, loadError]);

  const canForward = view < firstOfMonth(new Date());
  const missing = cells.filter((c) => c && c.dot === "red").length;

  return (
    <WorkerLayout>
      <div className="px-4 pb-8">
        <h1 className="text-lg font-bold text-ink pt-4 mb-2">My Week</h1>

        {/* Lead with the answer: are you caught up? */}
        {loadError && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-sm mb-3 text-red-700">
            {loadError === "auth"
              ? "Your worker link has expired or been reset — ask the office for a new link."
              : <>Couldn&apos;t load your timesheets. <button type="button" onClick={() => window.location.reload()} className="font-semibold underline">Retry</button></>}
          </div>
        )}
        {!loadError && missing > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-sm mb-3 text-amber-800">
            <span className="font-semibold">{missing}</span> day{missing > 1 ? "s" : ""} not logged — the red ones. Tap to fix.
          </div>
        )}
        {!loadError && !loading && missing === 0 && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-2.5 text-sm mb-3 text-green-700 font-medium">
            ✓ All caught up this month — nice one.
          </div>
        )}

        <p className="text-xs text-muted mb-3">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 align-middle mr-1" />Logged
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 align-middle ml-3 mr-1" />Missing
        </p>

        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))} aria-label="Previous month" className="w-9 h-9 rounded-full border border-hairline text-ink text-lg flex items-center justify-center">‹</button>
          <span className="text-sm font-semibold text-ink">{MON[view.getMonth()]} {view.getFullYear()}</span>
          <button type="button" disabled={!canForward} onClick={() => canForward && setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))} aria-label="Next month" className="w-9 h-9 rounded-full border border-hairline text-ink text-lg flex items-center justify-center disabled:opacity-30">›</button>
        </div>

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
              {c.dot && <span className={`w-2 h-2 rounded-full mt-1 ${c.dot === "green" ? "bg-green-500" : c.dot === "amber" ? "bg-amber-500" : "bg-red-500"}`} />}
            </button>
          ))}
        </div>
        {loading && <div className="text-center text-xs text-muted mt-3">Loading…</div>}
      </div>
    </WorkerLayout>
  );
}
