import { useState } from "react";

const REASON_CODES = [
  { value: "weather",          label: "Weather" },
  { value: "client_variation", label: "Client variation" },
  { value: "design_change",    label: "Design change" },
  { value: "council_permit",   label: "Council / permit delay" },
  { value: "subcontractor",    label: "Subcontractor delay" },
  { value: "site_conditions",  label: "Site conditions" },
  { value: "other",            label: "Other" },
];

const STATUS_CHIP = {
  pending:  "border-warning/40 bg-warning/10 text-warning",
  approved: "border-green-200 bg-green-50 text-green-700",
  rejected: "border-danger/30 bg-danger/10 text-danger",
};

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function reasonLabel(code) {
  return REASON_CODES.find((r) => r.value === code)?.label || code;
}

export default function DelaysTab({ eots = [], onRaise, onApprove, onApply, busy = {} }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ reason_code: "weather", days_claimed: "", description: "" });
  const [approvingId, setApprovingId] = useState(null);
  const [approvedDays, setApprovedDays] = useState("");

  async function handleRaise(e) {
    e.preventDefault();
    await onRaise({ reason_code: form.reason_code, days_claimed: Number(form.days_claimed), description: form.description || undefined });
    setForm({ reason_code: "weather", days_claimed: "", description: "" });
    setShowForm(false);
  }

  async function handleApprove(eotId) {
    await onApprove(eotId, { status: "approved", days_approved: Number(approvedDays) });
    setApprovingId(null);
    setApprovedDays("");
  }

  const pendingCount = eots.filter((e) => e.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-primary">Extension of Time (EOT)</h2>
          {pendingCount > 0 && (
            <p className="mt-0.5 text-sm font-semibold text-warning">{pendingCount} pending review</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
        >
          {showForm ? "Cancel" : "+ Raise EOT"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleRaise} className="rounded-card border border-primary/20 bg-primary/5 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink">New EOT claim</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-muted">
              Reason code
              <select
                value={form.reason_code}
                onChange={(e) => setForm((f) => ({ ...f, reason_code: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-hairline bg-surface px-2 py-2 text-sm text-ink"
                required
              >
                {REASON_CODES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-muted">
              Days claimed
              <input
                type="number"
                min="1"
                value={form.days_claimed}
                onChange={(e) => setForm((f) => ({ ...f, days_claimed: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-hairline bg-surface px-2 py-2 text-sm text-ink"
                placeholder="e.g. 14"
                required
              />
            </label>
          </div>
          <label className="block text-xs font-semibold text-muted">
            Description
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="mt-1 w-full resize-none rounded-lg border border-hairline bg-surface px-2 py-2 text-sm text-ink"
              placeholder="Describe the delay circumstances…"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-3 py-2 text-sm text-muted">Cancel</button>
            <button type="submit" disabled={busy.raise} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy.raise ? "Raising…" : "Raise EOT"}
            </button>
          </div>
        </form>
      )}

      {!eots.length ? (
        <div className="rounded-card border border-dashed border-hairline bg-page p-8 text-center">
          <p className="text-sm text-muted">No EOT claims yet. Raise one when a delay event occurs.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {eots.map((eot) => (
            <div key={eot.id} className="rounded-card border border-hairline bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CHIP[eot.status] || STATUS_CHIP.pending}`}>
                      {eot.status.charAt(0).toUpperCase() + eot.status.slice(1)}
                    </span>
                    <span className="text-sm font-semibold text-ink">{reasonLabel(eot.reason_code)}</span>
                  </div>
                  {eot.description && (
                    <p className="mt-1 text-sm text-muted">{eot.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
                    <span>Claimed: <strong className="text-ink">{eot.days_claimed}d</strong></span>
                    {eot.days_approved != null && (
                      <span>Approved: <strong className="text-ink">{eot.days_approved}d</strong></span>
                    )}
                    <span>Raised: {fmtDate(eot.raised_at)}</span>
                    {eot.resolved_at && <span>Resolved: {fmtDate(eot.resolved_at)}</span>}
                    {eot.applied_at && (
                      <span className="font-semibold text-accent">Applied: {fmtDate(eot.applied_at)}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  {eot.status === "pending" && (
                    approvingId === eot.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max={eot.days_claimed}
                          value={approvedDays}
                          onChange={(e) => setApprovedDays(e.target.value)}
                          placeholder="Days granted"
                          className="w-28 rounded-lg border border-hairline px-2 py-1.5 text-sm text-ink"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleApprove(eot.id)}
                          disabled={!approvedDays || busy.approve}
                          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => { setApprovingId(null); setApprovedDays(""); }}
                          className="text-xs text-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => { setApprovingId(eot.id); setApprovedDays(String(eot.days_claimed)); }}
                          className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => onApprove(eot.id, { status: "rejected" })}
                          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-1.5 text-xs font-semibold text-danger"
                        >
                          Reject
                        </button>
                      </>
                    )
                  )}
                  {eot.status === "approved" && !eot.applied_at && (
                    <button
                      type="button"
                      onClick={() => onApply(eot.id)}
                      disabled={busy.apply === eot.id}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {busy.apply === eot.id ? "Applying…" : "Apply to schedule"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
