import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkerLayout from "../../components/worker/WorkerLayout.jsx";
import { workerFetch } from "../../lib/workerFetch.js";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STATUS_BADGE = {
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  draft: "bg-gray-100 text-gray-600",
};
const ymd = (d) => d.toISOString().slice(0, 10);

// Worker "My timesheets" — last 2 weeks, so they can spot a day they missed.
export default function WorkerWeek() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let stop = false;
    workerFetch("/api/worker/timesheets?days=14")
      .then((r) => r.json())
      .then((j) => { if (stop) return; if (!j.ok) setError(j.error || "Failed to load"); else setRows(j.timesheets || []); })
      .catch(() => { if (!stop) setError("Network error"); })
      .finally(() => { if (!stop) setLoading(false); });
    return () => { stop = true; };
  }, []);

  const days = useMemo(() => {
    const byDate = new Map(rows.map((t) => [t.date, t]));
    const todayStr = ymd(new Date());
    const out = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.now() - i * 86400000);
      const key = ymd(d);
      const ts = byDate.get(key) || null;
      const dow = d.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const isPast = key < todayStr;
      out.push({ key, d, ts, isWeekend, isToday: key === todayStr, missing: !ts && isPast && !isWeekend });
    }
    return out;
  }, [rows]);

  const missingCount = days.filter((x) => x.missing).length;

  return (
    <WorkerLayout>
      <div className="px-4 pb-8">
        <h1 className="text-lg font-bold text-ink pt-4 mb-1">My timesheets</h1>
        <p className="text-sm text-muted mb-3">The last two weeks — check nothing&apos;s been missed.</p>

        {loading ? (
          <div className="pt-12 text-center text-muted text-sm">Loading…</div>
        ) : error ? (
          <div className="pt-2 text-red-600 text-sm">{error}</div>
        ) : (
          <>
            {missingCount > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm mb-3">
                <span className="font-semibold text-amber-800">{missingCount} day{missingCount > 1 ? "s" : ""} not logged</span>
                <span className="text-amber-700"> in the last 2 weeks — tap one to add it.</span>
              </div>
            )}
            <div className="space-y-1.5">
              {days.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  onClick={() => navigate(`/worker/timesheet/log?date=${x.key}`)}
                  disabled={x.isWeekend && !x.ts}
                  className={`w-full flex items-center justify-between rounded-lg border px-3 py-3 text-left transition active:scale-[0.99] ${x.missing ? "border-amber-300 bg-amber-50" : "border-hairline bg-white"} ${x.isWeekend && !x.ts ? "opacity-50" : ""}`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">
                      {DOW[x.d.getDay()]} {x.d.getDate()} {MON[x.d.getMonth()]}{x.isToday ? " · Today" : ""}
                    </div>
                    <div className="text-xs text-muted truncate">
                      {x.ts?.project || (x.missing ? "Not logged" : x.isWeekend ? "Weekend" : "—")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {x.ts ? (
                      <>
                        <span className="text-sm font-semibold text-ink">{x.ts.hours}h</span>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[x.ts.status] || "bg-gray-100 text-gray-600"}`}>{x.ts.status}</span>
                      </>
                    ) : x.missing ? (
                      <span className="text-[11px] font-semibold text-amber-700">Add →</span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </WorkerLayout>
  );
}
