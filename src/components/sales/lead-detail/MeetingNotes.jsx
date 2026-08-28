/**
 * MeetingNotes — structured notes for a pipeline meeting (rule 8: every meeting, not raw transcript).
 * Seven fields saved as jsonb on the lead_meetings row. Shown collapsed under a booked meeting.
 */
import { useState } from "react";
import { apiPut } from "../../../lib/apiFetch.js";

const NOTE_FIELDS = [
  ["priorities", "Client priorities"],
  ["decisions",  "Decisions made"],
  ["changes",    "Changes requested"],
  ["risks",      "Risks raised"],
  ["followups",  "Follow-up actions"],
  ["owner",      "Owner"],
  ["next_step",  "Next step"],
];

export default function MeetingNotes({ leadId, meetingType, meeting, reload }) {
  const saved = (meeting && meeting.structuredNotes && typeof meeting.structuredNotes === "object") ? meeting.structuredNotes : {};
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const hasNotes = NOTE_FIELDS.some(([k]) => String(saved[k] || "").trim());
  const set = (k, v) => setNotes((n) => ({ ...n, [k]: v }));

  async function save() {
    setBusy(true); setMsg("");
    const { ok, error } = await apiPut(`/api/sales/leads/${leadId}/meetings/${meetingType}/notes`, { notes });
    setBusy(false);
    if (!ok) { setMsg(error || "Couldn't save notes."); return; }
    setMsg("Saved ✓");
    setTimeout(() => setMsg(""), 3000);
    reload?.();
  }

  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-[11px] font-semibold text-primary hover:underline">
        {open ? "Hide notes" : hasNotes ? "Meeting notes ✓" : "+ Meeting notes"}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-hairline bg-page px-3 py-2.5">
          {NOTE_FIELDS.map(([k, label]) => (
            <div key={k}>
              <label className="block text-[11px] font-semibold text-muted mb-0.5">{label}</label>
              {k === "owner" || k === "next_step" ? (
                <input value={notes[k] || ""} onChange={(e) => set(k, e.target.value)} className="w-full rounded-lg border border-hairline px-2 py-1 text-xs focus-ring" />
              ) : (
                <textarea value={notes[k] || ""} onChange={(e) => set(k, e.target.value)} rows={2} className="w-full rounded-lg border border-hairline px-2 py-1 text-xs resize-none focus-ring" />
              )}
            </div>
          ))}
          <div className="flex items-center justify-end gap-2">
            {msg && <span className={`text-[11px] ${msg.startsWith("Saved") ? "text-green-600" : "text-red-600"}`}>{msg}</span>}
            <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? "Saving…" : "Save notes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
