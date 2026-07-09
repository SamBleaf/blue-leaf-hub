/**
 * TimesheetDetailModal — the "banner" detail view for a single timesheet, shared by the
 * Workforce Snapshot grid and the Approvals list. Opens on a click, loads the full timesheet
 * (hours per category, notes, completion photos + the tasks the worker marked done that shift)
 * and offers Approve / Decline / Edit inline.
 *
 * Props:
 *   timesheetId — the timesheet to show (GET /api/workforce/timesheets/:id/detail)
 *   role        — caller role; gates the actions (approve = admin, decline/edit = admin|supervisor)
 *   onClose     — close the modal
 *   onChanged   — called after any mutation (approve/decline/edit) so the parent can refresh
 */
import { useEffect, useState } from "react";
import { apiFetch, apiPost, apiPatch } from "../../lib/apiFetch.js";
import { TASK_LABELS, TASK_OPTIONS } from "../../lib/taskCategories.js";

const STATUS_BADGE = {
  submitted: "bg-blue-100 text-blue-700",
  approved:  "bg-green-100 text-green-700",
  rejected:  "bg-red-100 text-red-700",
  draft:     "bg-gray-100 text-gray-600",
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(`${d}T12:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

// An entry's photo is either a signed storage URL (newer) or an inline data: URL (legacy hours flow).
function mediaUrl(row) {
  if (row?.completion_photo_signed_url) return row.completion_photo_signed_url;
  if (typeof row?.completion_photo_url === "string" && row.completion_photo_url.startsWith("data:")) return row.completion_photo_url;
  return null;
}

export default function TimesheetDetailModal({ timesheetId, role, onClose, onChanged }) {
  const [ts, setTs] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState({});          // { [entryId]: { hours, taskCategory } }
  const [savingEntry, setSavingEntry] = useState(null);
  const [declining, setDeclining] = useState(false);
  const [declineNotes, setDeclineNotes] = useState("");

  const canApprove = role === "admin";
  const canModerate = role === "admin" || role === "supervisor";  // decline + edit

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/workforce/timesheets/${timesheetId}/detail`).then(({ ok, data, error: e }) => {
      if (cancelled) return;
      if (ok) { setTs(data.timesheet); setTasks(data.tasksCompleted || []); }
      else setError(e || "Could not load the timesheet.");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [timesheetId]);

  const entries = ts?.timesheet_entries || [];
  const totalHours = entries.reduce((n, e) => n + Number(e.hours || 0), 0);
  const isSubmitted = ts?.status === "submitted";
  const jobLabel = ts?.carpentry_jobs
    ? `${ts.carpentry_jobs.reference || ""} ${ts.carpentry_jobs.address || ts.carpentry_jobs.client_name || ""}`.trim()
    : (ts?.projects?.address || null);

  async function approve() {
    setBusy(true); setError("");
    const { ok, error: e } = await apiPost(`/api/workforce/timesheets/${timesheetId}/approve`, {});
    setBusy(false);
    if (ok) { onChanged?.(); onClose(); } else setError(e || "Could not approve this timesheet.");
  }

  async function confirmDecline() {
    setBusy(true); setError("");
    const { ok, error: e } = await apiPost(`/api/workforce/timesheets/${timesheetId}/reject`, { notes: declineNotes.trim() });
    setBusy(false);
    if (ok) { onChanged?.(); onClose(); } else setError(e || "Could not decline this timesheet.");
  }

  function startEdit() {
    const d = {};
    for (const e of entries) d[e.id] = { hours: String(Number(e.hours)), taskCategory: e.task_category };
    setDrafts(d);
    setEditing(true);
  }

  async function saveEntry(entry) {
    const draft = drafts[entry.id];
    if (!draft) return;
    const hours = Number(draft.hours);
    if (!(hours > 0 && hours <= 24)) { setError("Hours must be a number between 0 and 24."); return; }
    setSavingEntry(entry.id); setError("");
    const { ok, data, error: e } = await apiPatch(`/api/workforce/timesheet-entries/${entry.id}`, {
      hours, taskCategory: draft.taskCategory,
    });
    setSavingEntry(null);
    if (!ok) { setError(e || "Could not save this entry."); return; }
    setTs((prev) => ({
      ...prev,
      timesheet_entries: (prev.timesheet_entries || []).map((x) =>
        x.id === entry.id ? { ...x, hours: data.entry.hours, task_category: data.entry.taskCategory, cost_amount: data.entry.costAmount } : x),
    }));
    onChanged?.();
  }

  return (
    // z above the Blueprint FAB (9999) + the "+" quick-add FAB (z-50) so the bottom sheet and its
    // backdrop sit over them — otherwise those floating widgets cover the lower rows + action bar.
    <div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-xl sm:rounded-card w-full max-w-lg mx-0 sm:mx-4 shadow-xl max-h-[88vh] overflow-y-auto">
        {loading ? (
          <p className="p-6 text-sm text-muted text-center">Loading timesheet…</p>
        ) : !ts ? (
          <div className="p-6">
            <p className="text-sm text-danger">{error || "Timesheet not found."}</p>
            <button onClick={onClose} className="mt-3 text-sm text-primary">Close</button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-hairline px-5 py-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-ink truncate">{ts.employees?.name || "Worker"}</h3>
                <p className="text-xs text-muted mt-0.5">{fmtDate(ts.date)}{jobLabel ? ` · ${jobLabel}` : ""}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${STATUS_BADGE[ts.status] || "bg-gray-100 text-gray-600"}`}>{ts.status}</span>
                <button onClick={onClose} className="text-muted hover:text-ink text-lg leading-none" aria-label="Close">✕</button>
              </div>
            </div>

            {error && <p className="mx-5 mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

            {/* Hours logged */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">Hours logged</p>
                <p className="text-sm font-semibold text-ink">{totalHours.toFixed(1)}h total</p>
              </div>
              {entries.length === 0 ? (
                <p className="text-sm text-muted">No entries on this timesheet.</p>
              ) : (
                <div className="space-y-2">
                  {entries.map((e) => {
                    const photo = mediaUrl(e);
                    const draft = drafts[e.id];
                    return (
                      <div key={e.id} className="rounded-lg border border-hairline p-3">
                        {editing && draft ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={draft.taskCategory}
                              onChange={(ev) => setDrafts((p) => ({ ...p, [e.id]: { ...p[e.id], taskCategory: ev.target.value } }))}
                              className="flex-1 border border-hairline rounded-lg px-2 py-1.5 text-sm bg-white focus-ring"
                            >
                              {TASK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <input
                              type="number" step="0.5" min="0" max="24" value={draft.hours}
                              onChange={(ev) => setDrafts((p) => ({ ...p, [e.id]: { ...p[e.id], hours: ev.target.value } }))}
                              className="w-16 border border-hairline rounded-lg px-2 py-1.5 text-sm text-right focus-ring"
                            />
                            <span className="text-xs text-muted">h</span>
                            <button onClick={() => saveEntry(e)} disabled={savingEntry === e.id} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-accent text-white disabled:opacity-50">
                              {savingEntry === e.id ? "…" : "Save"}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-ink">{TASK_LABELS[e.task_category] || e.task_category}</p>
                              {e.notes && <p className="text-xs text-muted mt-0.5 whitespace-pre-wrap">{e.notes}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold text-ink">{Number(e.hours).toFixed(1)}h</p>
                              {Number(e.overtime_hours) > 0 && <p className="text-[10px] text-amber-600">+{Number(e.overtime_hours).toFixed(1)} OT</p>}
                            </div>
                          </div>
                        )}
                        {photo && !editing && (
                          <a href={photo} target="_blank" rel="noreferrer" className="inline-block mt-2" title="Open full photo">
                            <img src={photo} alt="Entry photo" className="w-16 h-16 rounded-lg object-cover border border-hairline" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tasks completed that shift */}
            {tasks.length > 0 && (
              <div className="px-5 pb-4">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Tasks completed this shift ({tasks.length})</p>
                <div className="space-y-2">
                  {tasks.map((t) => {
                    const photo = mediaUrl(t);
                    return (
                      <div key={t.id} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-3">
                        <span className="mt-0.5 text-emerald-600 shrink-0">✓</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-ink">{t.title}</p>
                          {photo && (
                            <a href={photo} target="_blank" rel="noreferrer" className="inline-block mt-2" title="Open full photo">
                              <img src={photo} alt="Task photo" className="w-16 h-16 rounded-lg object-cover border border-emerald-200" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="sticky bottom-0 bg-white border-t border-hairline px-5 py-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
              {declining ? (
                <div className="space-y-2">
                  <textarea
                    value={declineNotes}
                    onChange={(e) => setDeclineNotes(e.target.value)}
                    placeholder="Reason for declining (optional — the worker sees this)"
                    rows={2}
                    className="w-full border border-hairline rounded-lg px-3 py-2 text-sm resize-none focus-ring"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setDeclining(false)} disabled={busy} className="px-4 py-2 rounded-lg border border-hairline text-sm font-medium text-muted">Cancel</button>
                    <button onClick={confirmDecline} disabled={busy} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">{busy ? "…" : "Confirm decline"}</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 justify-end">
                  {canModerate && isSubmitted && (
                    <button onClick={() => (editing ? setEditing(false) : startEdit())} className="px-4 py-2 rounded-lg border border-hairline text-sm font-medium text-ink">
                      {editing ? "Done editing" : "Edit"}
                    </button>
                  )}
                  {canModerate && isSubmitted && !editing && (
                    <button onClick={() => setDeclining(true)} disabled={busy} className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-sm font-medium disabled:opacity-50">Decline</button>
                  )}
                  {canApprove && isSubmitted && !editing && (
                    <button onClick={approve} disabled={busy} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-50">{busy ? "…" : "Approve"}</button>
                  )}
                  {(!isSubmitted || !canModerate) && !editing && (
                    <button onClick={onClose} className="px-4 py-2 rounded-lg border border-hairline text-sm font-medium text-muted">Close</button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
