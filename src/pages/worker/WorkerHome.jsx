import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import WorkerLayout from "../../components/worker/WorkerLayout.jsx";
import { workerFetch } from "../../lib/workerFetch.js";
import { selectedJobQuery, setSelectedJob } from "../../lib/workerJob.js";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(d) {
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const STATUS_BADGE = {
  submitted: "bg-blue-100 text-blue-700",
  approved:  "bg-green-100 text-green-700",
  rejected:  "bg-red-100 text-red-700",
  draft:     "bg-gray-100 text-gray-600",
};

// Normalise a Planner allocation into the worker's job shape (matches workerJob.js / WORKER_JOB_TYPES).
// Building = project (address is the identifier); Carpentry = client name + address.
function allocJob(a) {
  if (!a) return null;
  // Workers need WHERE to go → lead with the address; the carpentry client name is the sub-label.
  if (a.carpentryJobId) return { id: a.carpentryJobId, type: "carpentry", name: a.carpentryJobAddress || a.carpentryJobClientName || "Carpentry job", address: (a.carpentryJobAddress && a.carpentryJobClientName) ? a.carpentryJobClientName : "", kind: "Carpentry" };
  if (a.projectId) return { id: a.projectId, type: "project", name: a.projectAddress || "Building site", address: "", kind: "Building" };
  return null;
}

// Today's site — the worker's daily start: where am I, with which crew, and what's waiting on me.
function TodaySiteCard({ today, tomorrow, counts, onOpenTasks }) {
  const t = allocJob(today);
  const tm = allocJob(tomorrow);
  return (
    <div className="rounded-card bg-white shadow-sm border border-hairline p-4 mb-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">Today&apos;s site</h2>
      {t ? (
        <>
          <p className="text-base font-bold text-ink leading-tight">{t.name}</p>
          {t.address && t.address !== t.name && <p className="text-sm text-muted">{t.address}</p>}
          {today.crewName && <p className="mt-1.5 text-sm text-ink">Crew: <span className="font-medium">{today.crewName}</span></p>}
          {today.notes && <p className="mt-2 text-sm text-muted italic">“{today.notes}”</p>}
          {counts && (counts.open > 0 || counts.done > 0) && (
            <button
              type="button"
              onClick={onOpenTasks}
              className="mt-3 w-full flex items-center justify-between rounded-lg bg-page px-3 py-2 text-sm"
            >
              <span className="text-ink">
                <span className="font-semibold">{counts.open}</span> open
                {counts.urgent > 0 && <> · <span className="font-semibold text-red-600">{counts.urgent}</span> urgent</>}
                {counts.done > 0 && <> · <span className="text-muted">{counts.done} done</span></>}
              </span>
              <span className="text-primary font-medium">Tasks →</span>
            </button>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">Not scheduled yet — check with your supervisor.</p>
      )}

      {tm && (
        <p className="mt-3 pt-3 border-t border-hairline text-sm text-muted">
          <span className="font-medium text-ink">Tomorrow:</span> {tm.name}{tomorrow.crewName ? ` · ${tomorrow.crewName}` : ""}
        </p>
      )}
    </div>
  );
}

export default function WorkerHome() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [alloc, setAlloc] = useState(null);
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState(null);

  // Home loads two things together: the worker summary (/me) and today+tomorrow's Planner
  // allocation. The allocation is non-blocking — if it fails, Home still renders.
  useEffect(() => {
    let stop = false;
    const q = selectedJobQuery();
    Promise.all([
      workerFetch(`/api/worker/me${q ? `?${q}` : ""}`).then(r => r.json()).catch(() => ({ ok: false, error: "Network error" })),
      workerFetch(`/api/worker/allocations/today`).then(r => r.json()).catch(() => ({ ok: false })),
    ]).then(([meJ, allocJ]) => {
      if (stop) return;
      if (!meJ.ok) { setError(meJ.error || "Failed to load"); return; }
      setMe(meJ);
      if (allocJ.ok) setAlloc(allocJ);
    }).finally(() => { if (!stop) setLoading(false); });
    return () => { stop = true; };
  }, []);

  // Today's task counts are scoped to today's ALLOCATED job (not the global open-task count),
  // so "3 open · 1 urgent" reflects what's waiting on the worker where they actually are.
  useEffect(() => {
    const j = allocJob(alloc?.today);
    if (!j) { setCounts(null); return; }
    let stop = false;
    workerFetch(`/api/worker/tasks?jobId=${encodeURIComponent(j.id)}&jobType=${j.type}`)
      .then(r => r.json())
      .then(d => {
        if (stop || !d.ok) return;
        const tasks = d.tasks || [];
        const active = tasks.filter(t => t.status !== "done");
        setCounts({ open: active.length, urgent: active.filter(t => t.priority === "urgent").length, done: tasks.length - active.length });
      })
      .catch(() => {});
    return () => { stop = true; };
  }, [alloc]);

  // Tapping today's task counts opens Tasks already set to today's allocated job (P4B→P4C bridge).
  function openTodayTasks() {
    const j = allocJob(alloc?.today);
    if (j) setSelectedJob({ id: j.id, type: j.type, address: j.address });
    navigate("/worker/tasks");
  }

  if (loading) {
    return (
      <WorkerLayout>
        <div className="flex items-center justify-center pt-24 text-muted text-sm">Loading…</div>
      </WorkerLayout>
    );
  }
  if (error) {
    const isAuth = /link is invalid|reset|unauthor/i.test(error);
    return (
      <WorkerLayout>
        <div className="px-6 pt-20 text-center">
          {isAuth ? (
            <>
              <p className="text-3xl mb-3">🔑</p>
              <h1 className="text-base font-bold text-ink mb-2">Your link has expired</h1>
              <p className="text-sm text-muted">This worker link is no longer valid or has been reset.<br />Please ask your site supervisor for a new link.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted mb-3">{error}</p>
              <button type="button" onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold">Try again</button>
            </>
          )}
        </div>
      </WorkerLayout>
    );
  }

  const { employee, today_timesheet: ts, yesterday_project, weekly_hours } = me;
  const today = new Date();
  const firstName = (employee?.name || "").split(" ")[0];
  const hasEntries = ts?.timesheet_entries?.length > 0;
  const totalHoursToday = (ts?.timesheet_entries || []).reduce((s, e) => s + Number(e.hours || 0), 0);
  const projectName = yesterday_project?.address || "Select project";
  const isRejected = ts?.status === "rejected";
  const isSubmittedOrApproved = ts?.status === "submitted" || ts?.status === "approved";

  return (
    <WorkerLayout>
      <div className="px-4 pb-8">
        {/* Rejection banner */}
        {isRejected && (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-sm font-semibold text-amber-800">Timesheet returned</p>
            {ts.rejection_notes && <p className="text-sm text-amber-700 mt-1">{ts.rejection_notes}</p>}
            <button
              type="button"
              onClick={() => navigate(`/worker/timesheet/log?date=${ts.date}`)}
              className="mt-2 text-sm font-semibold text-amber-800 underline underline-offset-2"
            >
              Edit and resubmit →
            </button>
          </div>
        )}

        {/* Greeting */}
        <div className="mt-5 mb-4">
          <h1 className="text-lg font-bold text-ink">Hi {firstName}</h1>
          <p className="text-sm text-muted">{fmtDate(today)}</p>
        </div>

        {/* Today's site — where am I going + what matters today (Planner allocation) */}
        <TodaySiteCard today={alloc?.today} tomorrow={alloc?.tomorrow} counts={counts} onOpenTasks={openTodayTasks} />

        {/* Timesheet card */}
        <div className="rounded-card bg-white shadow-sm border border-hairline p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink">Today&apos;s timesheet</h2>
            {ts?.status && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[ts.status] || ""}`}>
                {ts.status}
              </span>
            )}
          </div>

          {isSubmittedOrApproved && hasEntries ? (
            <>
              <div className="space-y-1 mb-3">
                {ts.timesheet_entries.map(e => (
                  <div key={e.id} className="flex justify-between text-sm">
                    <span className="text-ink">{e.task_category?.replace(/_/g, " ")}</span>
                    <span className="text-muted">{Number(e.hours)}h</span>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-hairline flex justify-between text-sm font-semibold">
                <span className="text-ink">Total</span>
                <span className="text-ink">{totalHoursToday}h</span>
              </div>
              {/* Allow editing until approved */}
              {ts.status === "submitted" && (
                <button
                  type="button"
                  onClick={() => navigate("/worker/timesheet/log")}
                  className="mt-3 w-full py-2 rounded-lg border border-hairline text-ink text-sm font-medium"
                >
                  Edit timesheet
                </button>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3 text-sm">
                <span className="text-muted">{projectName}</span>
                <Link to="/worker/timesheet/log" className="text-primary font-medium text-xs">Change</Link>
              </div>
              {hasEntries && (
                <div className="space-y-1 mb-3">
                  {ts.timesheet_entries.map(e => (
                    <div key={e.id} className="flex justify-between text-sm">
                      <span className="text-ink">{e.task_category?.replace(/_/g, " ")}</span>
                      <span className="text-muted">{Number(e.hours)}h</span>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => navigate("/worker/timesheet/log")}
                className="w-full py-3 rounded-lg bg-primary text-white text-sm font-semibold"
              >
                + Log my hours
              </button>
              {hasEntries && ts?.status === "draft" && (
                <button
                  type="button"
                  onClick={() => navigate("/worker/timesheet/log")}
                  className="mt-2 w-full py-2 rounded-lg border border-primary text-primary text-sm font-semibold"
                >
                  Submit timesheet
                </button>
              )}
            </>
          )}
        </div>

        {/* Time off */}
        <button
          type="button"
          onClick={() => navigate("/worker/day-off")}
          className="w-full rounded-card bg-white shadow-sm border border-hairline p-4 mb-3 flex items-center justify-between text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-primary shrink-0">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            Request time off
          </span>
          <span className="text-primary text-sm font-medium">→</span>
        </button>

        {/* Weekly hours — tasks live on the Today card + the Tasks tab now */}
        <p className="text-center text-sm text-muted mt-4">
          This week: <span className="font-semibold text-ink">{weekly_hours} hrs</span>
        </p>
      </div>
    </WorkerLayout>
  );
}
