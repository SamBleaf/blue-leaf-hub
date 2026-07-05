import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkerLayout from "../../components/worker/WorkerLayout.jsx";
import { workerFetch } from "../../lib/workerFetch.js";
import { paletteByKey } from "../../lib/plannerColors.js";

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDaysD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d) => addDaysD(d, -((d.getDay() + 6) % 7));
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Where the worker is scheduled — address leads (where to go); carpentry client is the sub-label.
function shiftSite(a) {
  if (!a) return { name: "", sub: "", kind: "" };
  if (a.carpentryJobId) return { name: a.carpentryJobAddress || a.carpentryJobClientName || "Carpentry job", sub: (a.carpentryJobAddress && a.carpentryJobClientName) ? a.carpentryJobClientName : "", kind: "Carpentry" };
  return { name: a.projectAddress || "Building site", sub: "", kind: "Building" };
}

// Timesheet status for a day. "Missing" only flags a past/today working day with nothing logged.
function tsStatus(ts, { isFuture, isWeekend, hasShift }) {
  if (ts && (ts.status === "submitted" || ts.status === "approved")) {
    const h = (ts.timesheet_entries || []).reduce((s, e) => s + Number(e.hours || 0), 0);
    return { text: `${ts.status === "approved" ? "Approved" : "Logged"}${h ? ` · ${h}h` : ""}`, tone: "green" };
  }
  if (ts && ts.status === "rejected") return { text: "Returned", tone: "amber" };
  if (ts && ts.status === "draft") return { text: "Draft", tone: "muted" };
  if (isFuture) return { text: "", tone: "muted" };
  if (!hasShift && isWeekend) return { text: "", tone: "muted" };
  if (!hasShift) return { text: "Not logged", tone: "red" };
  return { text: "Not logged", tone: "red" };
}

export default function WorkerWeek() {
  const navigate = useNavigate();
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [allocByDate, setAllocByDate] = useState({});
  const [tsByDate, setTsByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [shift, setShift] = useState(null);

  const weekFrom = ymd(monday);
  const weekTo = ymd(addDaysD(monday, 6));
  const todayStr = ymd(new Date());
  const isThisWeek = ymd(mondayOf(new Date())) === weekFrom;

  useEffect(() => {
    let stop = false;
    setLoading(true); setLoadError(null);
    Promise.all([
      workerFetch(`/api/worker/allocations/week?from=${weekFrom}&to=${weekTo}`).then((r) => r.json()).catch(() => ({ ok: false })),
      workerFetch(`/api/worker/timesheets?from=${weekFrom}&to=${weekTo}`).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) })),
    ]).then(([aJ, tR]) => {
      if (stop) return;
      if (aJ.ok) { const m = {}; for (const a of aJ.allocations || []) m[a.allocationDate] = a; setAllocByDate(m); }
      if (tR.status === 401) { setLoadError("auth"); return; }
      if (tR.body?.ok) { const m = {}; for (const t of tR.body.timesheets || []) m[t.date] = t; setTsByDate(m); }
    }).finally(() => { if (!stop) setLoading(false); });
    return () => { stop = true; };
  }, [weekFrom, weekTo]);

  const rows = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = addDaysD(monday, i);
    const key = ymd(d);
    return { key, d, isToday: key === todayStr, isFuture: key > todayStr, isWeekend: i >= 5, alloc: allocByDate[key], ts: tsByDate[key] };
  }), [monday, allocByDate, tsByDate, todayStr]);

  const dayTones = rows.map((r) => tsStatus(r.ts, { isFuture: r.isFuture, isWeekend: r.isWeekend, hasShift: !!r.alloc }).tone);
  const missing = dayTones.filter((t) => t === "red").length;
  const logged = dayTones.filter((t) => t === "green").length;   // days actually submitted/approved
  const allFuture = rows.every((r) => r.isFuture);               // whole week is in the future

  return (
    <WorkerLayout>
      <div className="px-4 pb-8">
        <h1 className="text-lg font-bold text-ink pt-4 mb-3">My Week</h1>

        {/* Week nav */}
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={() => setMonday((m) => addDaysD(m, -7))} aria-label="Previous week" className="w-9 h-9 rounded-full border border-hairline text-ink text-lg flex items-center justify-center">‹</button>
          <div className="text-center">
            <p className="text-sm font-semibold text-ink">{monday.getDate()} {MON[monday.getMonth()]} – {addDaysD(monday, 6).getDate()} {MON[addDaysD(monday, 6).getMonth()]}</p>
            {!isThisWeek && <button type="button" onClick={() => setMonday(mondayOf(new Date()))} className="text-xs text-primary font-medium">This week</button>}
          </div>
          <button type="button" onClick={() => setMonday((m) => addDaysD(m, 7))} aria-label="Next week" className="w-9 h-9 rounded-full border border-hairline text-ink text-lg flex items-center justify-center">›</button>
        </div>

        {loadError === "auth" && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-sm mb-3 text-red-700">Your worker link expired — ask the office for a new one.</div>
        )}
        {!loadError && !loading && missing > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-sm mb-3 text-amber-800"><span className="font-semibold">{missing}</span> day{missing > 1 ? "s" : ""} not logged this week — tap to fix.</div>
        )}
        {!loadError && !loading && missing === 0 && logged > 0 && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-2.5 text-sm mb-3 text-green-700 font-medium">✓ This week&apos;s all logged — nice one.</div>
        )}
        {!loadError && !loading && missing === 0 && logged === 0 && (
          <div className="rounded-lg bg-slate-50 border border-hairline p-2.5 text-sm mb-3 text-muted">{allFuture ? "This week hasn’t started yet." : "Nothing logged yet this week."}</div>
        )}

        {/* Day rows */}
        <div className="rounded-card border border-hairline bg-surface divide-y divide-hairline overflow-hidden">
          {rows.map((r) => {
            const site = shiftSite(r.alloc);
            const pal = r.alloc ? paletteByKey(r.alloc.colorKey) : null;
            const st = tsStatus(r.ts, { isFuture: r.isFuture, isWeekend: r.isWeekend, hasShift: !!r.alloc });
            const tone = st.tone === "green" ? "text-green-600" : st.tone === "red" ? "text-red-600" : st.tone === "amber" ? "text-amber-600" : "text-muted";
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => (r.alloc ? setShift({ ...r.alloc, dateKey: r.key }) : !r.isFuture && navigate(`/worker/timesheet/log?date=${r.key}`))}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left ${r.isWeekend && !r.alloc && !r.ts ? "bg-page/40" : "active:bg-page"}`}
              >
                <span className={`w-10 shrink-0 text-center ${r.isToday ? "text-primary" : "text-ink"}`}>
                  <span className="block text-[11px] font-semibold uppercase">{DOW[r.d.getDay()]}</span>
                  <span className="block text-base font-bold leading-none">{r.d.getDate()}</span>
                </span>
                <span className="flex-1 min-w-0">
                  {r.alloc ? (
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: pal.bg, color: pal.text }}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: pal.dot }} />
                      <span className="text-xs font-medium truncate">{site.name}</span>
                    </span>
                  ) : (
                    <span className="text-sm text-muted">{r.isWeekend ? "—" : "Not scheduled"}</span>
                  )}
                </span>
                <span className={`shrink-0 text-xs font-medium ${tone}`}>{st.text}</span>
              </button>
            );
          })}
        </div>
        {loading && <div className="text-center text-xs text-muted mt-3">Loading…</div>}

        {shift && (() => {
          const site = shiftSite(shift);
          const pal = paletteByKey(shift.colorKey);
          const d = new Date(`${shift.dateKey}T00:00:00`);
          return (
            <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onClick={() => setShift(null)}>
              <div className="w-full sm:max-w-sm bg-surface rounded-t-2xl sm:rounded-card p-5" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: pal.dot }} />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Scheduled shift</span>
                </div>
                <p className="text-base font-bold text-ink leading-tight">{site.name}</p>
                {site.sub && <p className="text-sm text-muted">{site.sub}</p>}
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between"><dt className="text-muted">Date</dt><dd className="text-ink font-medium">{d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">Job type</dt><dd className="text-ink">{site.kind}</dd></div>
                  {shift.crewName && <div className="flex justify-between"><dt className="text-muted">Crew</dt><dd className="text-ink">{shift.crewName}</dd></div>}
                </dl>
                {shift.notes && (
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">Notes</p>
                    <p className="text-sm text-ink whitespace-pre-wrap">{shift.notes}</p>
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => navigate(`/worker/timesheet/log?date=${shift.dateKey}`)} className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold">Log hours</button>
                  <button type="button" onClick={() => setShift(null)} className="px-4 py-2.5 rounded-lg border border-hairline text-sm text-muted">Close</button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </WorkerLayout>
  );
}
