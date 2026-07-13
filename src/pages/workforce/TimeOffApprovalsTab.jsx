import { useEffect, useState, useCallback } from "react";
import { apiFetch, apiPost, apiPatch } from "../../lib/apiFetch.js";
import { can } from "../../lib/roles.js";

// Approvals surface for worker time-off requests — mirrors the timesheet Approvals tab.
// Approve writes the day(s) to the planner (RDO rows); reject removes them again.

function fmtDate(d) {
  if (!d) return "—";
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
function fmtRange(from, to) {
  return from === to ? fmtDate(from) : `${fmtDate(from)} → ${fmtDate(to)}`;
}
function dayCount(from, to) {
  const ms = new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`);
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

export default function TimeOffApprovalsTab({ role }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [rejectFor, setRejectFor] = useState(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [editFor, setEditFor] = useState(null);
  const [editDraft, setEditDraft] = useState({ dateFrom: "", dateTo: "", reason: "" });

  const canApprove = can.approveTimesheets(role);  // admin
  const canModerate = can.accessWorkforce(role);   // admin + supervisor (reject / edit)

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await apiFetch("/api/workforce/day-off-requests?status=submitted");
    if (ok) setRequests(data.requests || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const say = (type, msg) => { setFlash({ type, msg }); setTimeout(() => setFlash(null), 3500); };

  async function approve(r) {
    setBusyId(r.id);
    const { ok, error } = await apiPost(`/api/workforce/day-off-requests/${r.id}/approve`, {});
    setBusyId(null);
    if (ok) { setRequests((p) => p.filter((x) => x.id !== r.id)); say("ok", `Approved — ${dayCount(r.dateFrom, r.dateTo)} day(s) added to the planner.`); }
    else say("error", error || "Could not approve.");
  }

  async function confirmReject() {
    const r = rejectFor;
    setBusyId(r.id);
    const { ok, error } = await apiPost(`/api/workforce/day-off-requests/${r.id}/reject`, { notes: rejectNotes.trim() || undefined });
    setBusyId(null); setRejectFor(null); setRejectNotes("");
    if (ok) { setRequests((p) => p.filter((x) => x.id !== r.id)); say("ok", "Request rejected."); }
    else say("error", error || "Could not reject.");
  }

  function openEdit(r) { setEditFor(r); setEditDraft({ dateFrom: r.dateFrom, dateTo: r.dateTo, reason: r.reason || "" }); }
  async function saveEdit() {
    const r = editFor;
    if (!editDraft.dateFrom || !editDraft.dateTo || editDraft.dateTo < editDraft.dateFrom) { say("error", "Check the dates — 'to' can't be before 'from'."); return; }
    setBusyId(r.id);
    const { ok, data, error } = await apiPatch(`/api/workforce/day-off-requests/${r.id}`, editDraft);
    setBusyId(null);
    if (ok) { setRequests((p) => p.map((x) => (x.id === r.id ? data.request : x))); setEditFor(null); say("ok", "Updated."); }
    else say("error", error || "Could not update.");
  }

  return (
    <div>
      {flash && (
        <div className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${flash.type === "ok" ? "bg-accent/10 text-accent" : "bg-red-50 text-red-600 border border-red-200"}`}>
          {flash.msg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : requests.length === 0 ? (
        <div className="rounded-card border border-hairline bg-surface p-8 text-center">
          <p className="text-sm text-muted">No pending time-off requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="rounded-card border border-hairline bg-surface p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-ink">{r.employees?.name || "Unknown"}</p>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    {dayCount(r.dateFrom, r.dateTo)} day{dayCount(r.dateFrom, r.dateTo) > 1 ? "s" : ""}
                  </span>
                </div>
                <p className="text-sm text-ink mt-0.5">{fmtRange(r.dateFrom, r.dateTo)}</p>
                {r.reason && <p className="text-xs text-muted mt-1 whitespace-pre-wrap">{r.reason}</p>}
                <p className="text-[11px] text-muted mt-1">Requested {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—"}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canModerate && (
                  <button type="button" onClick={() => openEdit(r)} disabled={busyId === r.id} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-hairline text-ink hover:bg-page disabled:opacity-40">Edit</button>
                )}
                {canModerate && (
                  <button type="button" onClick={() => { setRejectFor(r); setRejectNotes(""); }} disabled={busyId === r.id} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40">Reject</button>
                )}
                {canApprove && (
                  <button type="button" onClick={() => approve(r)} disabled={busyId === r.id} className="text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-accent text-white hover:opacity-95 disabled:opacity-40">
                    {busyId === r.id ? "…" : "Approve"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject modal */}
      {rejectFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRejectFor(null)} />
          <div className="relative w-full max-w-sm rounded-card bg-surface p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-ink">Reject time-off request</h3>
            <p className="text-xs text-muted mt-1">{rejectFor.employees?.name} · {fmtRange(rejectFor.dateFrom, rejectFor.dateTo)}</p>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              rows={3}
              placeholder="Reason (optional — shown to the worker)"
              className="mt-3 w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRejectFor(null)} className="text-sm px-3 py-1.5 rounded-lg border border-hairline text-ink">Cancel</button>
              <button type="button" onClick={confirmReject} disabled={busyId === rejectFor.id} className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-red-600 text-white disabled:opacity-40">Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditFor(null)} />
          <div className="relative w-full max-w-sm rounded-card bg-surface p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-ink">Edit request</h3>
            <p className="text-xs text-muted mt-1">{editFor.employees?.name}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-ink">From
                <input type="date" value={editDraft.dateFrom} onChange={(e) => setEditDraft((d) => ({ ...d, dateFrom: e.target.value }))} className="mt-1 w-full rounded-lg border border-hairline px-2 py-1.5 text-sm focus-ring" />
              </label>
              <label className="text-xs font-medium text-ink">To
                <input type="date" value={editDraft.dateTo} min={editDraft.dateFrom} onChange={(e) => setEditDraft((d) => ({ ...d, dateTo: e.target.value }))} className="mt-1 w-full rounded-lg border border-hairline px-2 py-1.5 text-sm focus-ring" />
              </label>
            </div>
            <textarea value={editDraft.reason} onChange={(e) => setEditDraft((d) => ({ ...d, reason: e.target.value }))} rows={2} placeholder="Reason" className="mt-3 w-full rounded-lg border border-hairline px-3 py-2 text-sm focus-ring" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditFor(null)} className="text-sm px-3 py-1.5 rounded-lg border border-hairline text-ink">Cancel</button>
              <button type="button" onClick={saveEdit} disabled={busyId === editFor.id} className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-primary text-white disabled:opacity-40">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
