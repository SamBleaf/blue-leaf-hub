import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import WorkerLayout from "../../components/worker/WorkerLayout.jsx";
import { workerFetch } from "../../lib/workerFetch.js";

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

export default function WorkerHome() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let stop = false;
    workerFetch("/api/worker/me")
      .then(r => r.json())
      .then(j => {
        if (stop) return;
        if (!j.ok) { setError(j.error || "Failed to load"); return; }
        setMe(j);
      })
      .catch(() => { if (!stop) setError("Network error"); })
      .finally(() => { if (!stop) setLoading(false); });
    return () => { stop = true; };
  }, []);

  if (loading) {
    return (
      <WorkerLayout>
        <div className="flex items-center justify-center pt-24 text-muted text-sm">Loading…</div>
      </WorkerLayout>
    );
  }
  if (error) {
    return (
      <WorkerLayout>
        <div className="p-4 text-red-600 text-sm">{error}</div>
      </WorkerLayout>
    );
  }

  const { employee, today_timesheet: ts, yesterday_project, weekly_hours, open_task_count } = me;
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
              onClick={() => navigate("/worker/timesheet/log")}
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

        {/* Site tasks card */}
        <div className="rounded-card bg-white shadow-sm border border-hairline p-4 mb-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-ink">Site tasks</h2>
            {open_task_count > 0 && (
              <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{open_task_count} open</span>
            )}
          </div>
          {open_task_count === 0 ? (
            <p className="text-sm text-muted">No open tasks</p>
          ) : (
            <p className="text-sm text-muted mb-2">{open_task_count} task{open_task_count !== 1 ? "s" : ""} waiting</p>
          )}
          <Link to="/worker/tasks" className="text-sm text-primary font-medium">View all →</Link>
        </div>

        {/* Weekly hours chip */}
        <p className="text-center text-sm text-muted mt-3">
          This week: <span className="font-semibold text-ink">{weekly_hours} hrs</span>
        </p>
      </div>
    </WorkerLayout>
  );
}
