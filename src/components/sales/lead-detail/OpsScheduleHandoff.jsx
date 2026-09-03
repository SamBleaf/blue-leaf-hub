/**
 * OpsScheduleHandoff — SC-3 + CW-3. At Won, the operator sets the target start date and drafts the
 * Operations schedule from the estimate programme (Ops then owns + refines it), then drops the SA
 * mandatory building-notification stages (from the Building Consent / DNF) onto it as hold-points.
 */
import { useState } from "react";
import { apiPost } from "../../../lib/apiFetch.js";

function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() + 28); // a sensible ~4-week-out default; operator adjusts
  return d.toISOString().slice(0, 10);
}

export default function OpsScheduleHandoff({ lead }) {
  const [startDate, setStartDate] = useState(defaultStart());
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const [seeded, setSeeded] = useState(false);
  const [notified, setNotified] = useState(false);

  async function seed() {
    setBusy("seed"); setMsg(null);
    const { ok, data, error } = await apiPost(`/api/sales/leads/${lead.id}/seed-ops-schedule`, { startDate });
    setBusy("");
    if (!ok) { setMsg({ type: "error", text: error || "Could not seed the schedule." }); return; }
    setSeeded(true);
    setMsg({ type: "success", text: `Draft Ops schedule created — ${data?.count || 0} stages from ${startDate}. Refine it in Operations.` });
  }
  async function addNotifications() {
    setBusy("notify"); setMsg(null);
    const { ok, data, error } = await apiPost(`/api/sales/leads/${lead.id}/building-notifications`, {});
    setBusy("");
    if (!ok) { setMsg({ type: "error", text: error || "Could not add the notifications." }); return; }
    setNotified(true);
    setMsg({ type: "success", text: `Added ${data?.added || 0} building-notification hold-points to the schedule.` });
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <h3 className="section-label mb-1">Operations schedule handoff</h3>
      <p className="text-[11px] text-muted mb-3">Set the target start, draft the build schedule from the estimate programme, then add the mandatory building notifications. Operations owns the schedule from here.</p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink">
          <span className="block text-[11px] text-muted mb-1">Target start date</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-hairline px-2 py-1.5 text-xs bg-page text-ink focus:outline-none focus:ring-1 focus:ring-primary/40" />
        </label>
        <button type="button" onClick={seed} disabled={busy === "seed" || seeded}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy === "seed" ? "Drafting…" : seeded ? "✓ Schedule drafted" : "Draft the build schedule →"}
        </button>
        <button type="button" onClick={addNotifications} disabled={busy === "notify" || notified}
          className="rounded-lg border border-hairline px-3 py-2 text-xs font-semibold text-ink hover:bg-page disabled:opacity-50">
          {busy === "notify" ? "Adding…" : notified ? "✓ Notifications added" : "Add building-notification hold-points"}
        </button>
      </div>
      <p className="mt-2 text-[10px] text-muted">Add the notification hold-points once Building Consent is granted (from the DNF above). Each is a pinned inspection the leading hand must give notice for.</p>
      {msg && <p className={`mt-2 text-xs ${msg.type === "error" ? "text-red-600" : "text-green-600"}`}>{msg.text}</p>}
    </div>
  );
}
