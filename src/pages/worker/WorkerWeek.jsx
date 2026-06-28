import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkerLayout from "../../components/worker/WorkerLayout.jsx";
import { workerFetch } from "../../lib/workerFetch.js";

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["M", "T", "W", "T", "F", "S", "S"];
// Local calendar date (NOT toISOString — that shifts a day in AU timezones).
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const addDaysD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d) => addDaysD(d, -((d.getDay() + 6) % 7));

// Where the worker is scheduled that day (Planner allocation): site + crew.
function siteLabel(a) {
  if (!a) return null;
  return { where: a.carpentryJobClientName || a.carpentryJobAddress || a.projectAddress || "Allocated", crew: a.crewName || null };
}

// Timesheet status for a roster day. "Missing" only flags an allocated working day with nothing logged.
function tsLabel(ts, { isFuture, hasAlloc }) {
  if (ts && (ts.status === "submitted" || ts.status === "approved")) {
    const h = (ts.timesheet_entries || []).reduce((s, e) => s + Number(e.hours || 0), 0);
    return { text: `${ts.status === "approved" ? "Approved" : "Submitted"}${h ? ` · ${h}h` : ""}`, tone: "green" };
  }
  if (ts && ts.status === "rejected") return { text: "Returned", tone: "amber" };
  if (ts && ts.status === "draft") return { text: "Draft", tone: "muted" };
  if (isFuture) return { text: "Not due yet", tone: "muted" };
  if (!hasAlloc) return { text: "Not required", tone: "muted" };
  return { text: "Missing", tone: "red" };
}

// Worker "My timesheets" calendar — green = logged, red = a working day with nothing
// logged, so the boys can work backward and keep every day complete.
export default function WorkerWeek() {
  const navigate = useNavigate();
  const [view, setView] = useState(() => firstOfMonth(new Date()));
  const [byDate, setByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null); // null | "auth" | "load"
  const [weekAllocs, setWeekAllocs] = useState(null); // null = not loaded
  const [weekTs, setWeekTs] = useState({});

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

  // "This week" roster — current Mon–Sun Planner allocations + that week's timesheet status.
  // Independent of the month calendar below (always shows the live current week).
  useEffect(() => {
    let stop = false;
    const monday = mondayOf(new Date());
    const from = ymd(monday), to = ymd(addDaysD(monday, 6));
    Promise.all([
      workerFetch(`/api/worker/allocations/week`).then(r => r.json()).catch(() => ({ ok: false })),
      workerFetch(`/api/worker/timesheets?from=${from}&to=${to}`).then(r => r.json()).catch(() => ({ ok: false })),
    ]).then(([aJ, tJ]) => {
      if (stop) return;
      if (aJ.ok) setWeekAllocs(aJ.allocations || []);
      if (tJ.ok) { const m = {}; for (const t of (tJ.timesheets || [])) m[t.date] = t; setWeekTs(m); }
    });
    return () => { stop = true; };
  }, []);

  const weekRows = useMemo(() => {
    if (weekAllocs === null) return null;
    const monday = mondayOf(new Date());
    const byDay = {}; for (const a of weekAllocs) byDay[a.allocationDate] = a;
    const todayStr = ymd(new Date());
    const rows = [];
    for (let i = 0; i < 7; i++) {
      const d = addDaysD(monday, i);
      const key = ymd(d);
      const isWeekend = i >= 5;
      const a = byDay[key] || null;
      const ts = weekTs[key] || null;
      if (isWeekend && !a && !ts) continue; // hide empty weekends
      rows.push({ key, label: WEEKDAY_FULL[d.getDay()].slice(0, 3), site: siteLabel(a), ts, isToday: key === todayStr, isFuture: key > todayStr });
    }
    return rows;
  }, [weekAllocs, weekTs]);

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
      else if (!ts && !isWeekend && !isFuture && !loadError) dot = "red"; // working day, nothing logged (suppressed if the load failed)
      out.push({ key, day, dot, isFuture, isToday: key === todayStr, isWeekend });
    }
    return out;
  }, [view, byDate, loadError]);

  const canForward = view < firstOfMonth(new Date());
  const missing = cells.filter((c) => c && c.dot === "red").length;

  return (
    <WorkerLayout>
      <div className="px-4 pb-8">
        <h1 className="text-lg font-bold text-ink pt-4 mb-3">My Week</h1>

        {/* This week — roster: where I'm scheduled + did I log it */}
        {weekRows && weekRows.length > 0 && (
          <div className="mb-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">This week</h2>
            <div className="rounded-card bg-white shadow-sm border border-hairline divide-y divide-hairline overflow-hidden">
              {weekRows.map((row) => {
                const st = tsLabel(row.ts, { isFuture: row.isFuture, hasAlloc: !!row.site });
                const tone = st.tone === "green" ? "text-green-600" : st.tone === "red" ? "text-red-600" : st.tone === "amber" ? "text-amber-600" : "text-muted";
                return (
                  <button
                    key={row.key}
                    type="button"
                    disabled={row.isFuture}
                    onClick={() => navigate(`/worker/timesheet/log?date=${row.key}`)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left ${row.isFuture ? "opacity-60" : "active:bg-page"}`}
                  >
                    <span className={`w-9 shrink-0 text-sm font-semibold ${row.isToday ? "text-primary" : "text-ink"}`}>{row.label}</span>
                    <span className="flex-1 min-w-0">
                      {row.site ? (
                        <>
                          <span className="block text-sm text-ink truncate">{row.site.where}</span>
                          {row.site.crew && <span className="block text-xs text-muted truncate">{row.site.crew}</span>}
                        </>
                      ) : (
                        <span className="block text-sm text-muted">Not allocated</span>
                      )}
                    </span>
                    <span className={`shrink-0 text-xs font-medium ${tone}`}>{st.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">Timesheet history</h2>
        <p className="text-sm text-muted mb-3 leading-relaxed">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 align-middle mr-1" />Logged
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 align-middle ml-3 mr-1" />Not logged
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 align-middle ml-3 mr-1" />Returned
          <span className="block text-xs mt-1">Tap a day to add or edit it.</span>
        </p>

        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={() => setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))} aria-label="Previous month" className="w-9 h-9 rounded-full border border-hairline text-ink text-lg flex items-center justify-center">‹</button>
          <span className="text-sm font-semibold text-ink">{MON[view.getMonth()]} {view.getFullYear()}</span>
          <button type="button" disabled={!canForward} onClick={() => canForward && setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))} aria-label="Next month" className="w-9 h-9 rounded-full border border-hairline text-ink text-lg flex items-center justify-center disabled:opacity-30">›</button>
        </div>

        {loadError && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-sm mb-2 text-red-700">
            {loadError === "auth"
              ? "Your worker link has expired or been reset — ask the office for a new link."
              : <>Couldn&apos;t load your timesheets. <button type="button" onClick={() => window.location.reload()} className="font-semibold underline">Retry</button></>}
          </div>
        )}

        {!loadError && missing > 0 && (
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
              {c.dot && <span className={`w-2 h-2 rounded-full mt-1 ${c.dot === "green" ? "bg-green-500" : c.dot === "amber" ? "bg-amber-500" : "bg-red-500"}`} />}
            </button>
          ))}
        </div>
        {loading && <div className="text-center text-xs text-muted mt-3">Loading…</div>}
      </div>
    </WorkerLayout>
  );
}
