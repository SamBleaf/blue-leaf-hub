import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkerLayout from "../../components/worker/WorkerLayout.jsx";
import { workerFetch, isWorkerPreview } from "../../lib/workerFetch.js";
import { DAY_OFF_REQUEST_STATUSES, DAY_OFF_REQUEST_STATUS_LABELS } from "../../lib/constants.js";

// LOCAL calendar date (NOT toISOString — that shifts a day in AU timezones, which
// would block a same-day request in the morning).
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const STATUS_CHIP = {
  [DAY_OFF_REQUEST_STATUSES.SUBMITTED]: "bg-amber-100 text-amber-700",
  [DAY_OFF_REQUEST_STATUSES.APPROVED]:  "bg-green-100 text-green-700",
  [DAY_OFF_REQUEST_STATUSES.REJECTED]:  "bg-red-100 text-red-700",
};

function fmtRange(dateFrom, dateTo) {
  const opts = { day: "numeric", month: "short" };
  const from = new Date(`${dateFrom}T12:00:00`).toLocaleDateString("en-AU", opts);
  if (dateTo === dateFrom) return from;
  const to = new Date(`${dateTo}T12:00:00`).toLocaleDateString("en-AU", opts);
  return `${from} – ${to}`;
}

export default function WorkerRequestDayOff() {
  const navigate = useNavigate();
  const preview = isWorkerPreview();
  const today = todayStr();

  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");

  const [requests, setRequests] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  // The worker's own requests only — the server scopes this to the caller's employee.
  useEffect(() => {
    let stop = false;
    workerFetch("/api/worker/day-off-requests")
      .then(r => r.json())
      .then(j => { if (!stop && j.ok) setRequests(j.requests || []); })
      .catch(() => {})
      .finally(() => { if (!stop) setLoadingList(false); });
    return () => { stop = true; };
  }, []);

  function onFromChange(val) {
    setDateFrom(val);
    if (dateTo < val) setDateTo(val);
  }

  async function submit() {
    setFormError("");
    if (!dateFrom || !dateTo) { setFormError("Pick both a from and to date."); return; }
    if (dateTo < dateFrom) { setFormError("The end date must be on or after the start date."); return; }
    setSubmitting(true);
    try {
      const res = await workerFetch("/api/worker/day-off-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateFrom, dateTo, reason: reason.trim() || null }),
      });
      const j = await res.json();
      if (j.ok) setSubmitted(true);
      else setFormError(j.error || "Submit failed");
    } catch {
      setFormError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success ──────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <WorkerLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="#006c9b" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-ink mb-2">Submitted</h2>
          <p className="text-sm text-muted mb-6">Your time-off request has been sent for approval.</p>
          <button type="button" onClick={() => navigate("/worker")} className="px-6 py-3 rounded-lg bg-primary text-white text-sm font-semibold">
            Done
          </button>
        </div>
      </WorkerLayout>
    );
  }

  // ── Form + own requests ──────────────────────────────────────────────────
  return (
    <WorkerLayout onBack={() => navigate("/worker")}>
      <div className="px-4 pt-5 pb-10">
        <h1 className="text-base font-bold text-ink mb-4">Request time off</h1>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs text-muted uppercase tracking-wide block mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              min={today}
              onChange={e => onFromChange(e.target.value)}
              className="w-full rounded-lg border border-hairline px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-xs text-muted uppercase tracking-wide block mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || today}
              onChange={e => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-hairline px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <label className="text-xs text-muted uppercase tracking-wide block mb-1">Reason (optional)</label>
        <textarea
          placeholder="e.g. Family event, medical appointment…"
          value={reason}
          rows={3}
          onChange={e => setReason(e.target.value)}
          className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 mb-3"
        />

        {formError && <p className="text-sm text-red-600 mb-3">{formError}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={preview || submitting}
          className="w-full py-3 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
        >
          {preview ? "Read-only preview" : submitting ? "Submitting…" : "Submit request"}
        </button>

        {/* Own requests — most recent first (server-ordered) */}
        <div className="mt-8">
          <h2 className="text-xs text-muted uppercase tracking-wide mb-2">Your requests</h2>
          {loadingList ? (
            <p className="text-sm text-muted py-4 text-center">Loading…</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted py-4 text-center">No requests yet</p>
          ) : (
            <div className="space-y-2">
              {requests.map(r => (
                <div key={r.id} className="rounded-lg border border-hairline bg-white px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{fmtRange(r.dateFrom, r.dateTo)}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_CHIP[r.status] || ""}`}>
                      {DAY_OFF_REQUEST_STATUS_LABELS[r.status] || r.status}
                    </span>
                  </div>
                  {r.reason && <p className="text-xs text-muted mt-1">{r.reason}</p>}
                  {r.status === DAY_OFF_REQUEST_STATUSES.REJECTED && r.rejectionNotes && (
                    <p className="text-xs text-red-600 mt-1">{r.rejectionNotes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </WorkerLayout>
  );
}
