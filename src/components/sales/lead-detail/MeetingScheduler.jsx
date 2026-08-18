/**
 * MeetingScheduler — schedule ONE pipeline meeting type for a lead (cal.com). Both booking modes:
 *   • "Copy client booking link" → the prefilled cal.com self-book link (client picks a slot; the
 *     webhook stamps it back automatically).
 *   • "Set a time yourself" → the live SlotPicker: pick a real open slot (book-on-behalf → a cal.com
 *     invite goes out if the API is wired, else a Hub-recorded meeting). Ideal while on a call.
 * Reads the lead's current meeting of this type from lead_meetings and shows its status + links.
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiPost } from "../../../lib/apiFetch.js";
import { MEETING_TYPE_LABELS } from "../../../lib/constants.js";
import SlotPicker from "../SlotPicker.jsx";

function fmtDateTime(x) {
  if (!x) return "";
  try { return new Date(x).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; }
}

export default function MeetingScheduler({ lead, meetingType, reload }) {
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copyMsg, setCopyMsg] = useState("");
  const [schedOpen, setSchedOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const label = MEETING_TYPE_LABELS[meetingType] || "Meeting";

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await apiFetch(`/api/sales/leads/${lead.id}/meetings`);
    if (ok) setMeeting((data.meetings || []).find((m) => m.meetingType === meetingType && m.status !== "cancelled") || null);
    setLoading(false);
  }, [lead.id, meetingType]);
  useEffect(() => { load(); }, [load]);

  async function copyLink() {
    const { ok, data, error } = await apiFetch(`/api/sales/leads/${lead.id}/booking-link?meetingType=${meetingType}`);
    if (!ok) { setCopyMsg(error || "Couldn't build the link."); return; }
    try { await navigator.clipboard.writeText(data.url); setCopyMsg("Booking link copied ✓"); }
    catch { setCopyMsg(data.url); }
    setTimeout(() => setCopyMsg(""), 5000);
  }

  async function schedule(iso) {
    setBusy(true); setMsg(null);
    const { ok, data, error } = await apiPost(`/api/sales/leads/${lead.id}/meetings/schedule`, {
      meetingType, startAt: iso, location: location || null,
    });
    setBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Couldn't schedule the meeting." }); return; }
    setSchedOpen(false); setLocation("");
    setMsg({ type: "success", text: data?.bookedViaCalcom ? "Booked — cal.com invite sent." : "Meeting time recorded." });
    await load();
    reload?.();
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-4 space-y-3">
      <h3 className="section-label">{label}</h3>

      <div className="rounded-lg bg-page px-3 py-2 text-sm">
        {loading ? (
          <p className="text-xs text-muted">Loading…</p>
        ) : meeting ? (
          <div>
            <p className="font-medium text-green-700">
              ✓ {meeting.status === "rescheduled" ? "Rescheduled" : "Scheduled"}
              {meeting.bookingSource === "manual" ? " (Hub record)" : ""}
            </p>
            <p className="text-xs text-muted mt-0.5">
              {fmtDateTime(meeting.scheduledAt) || "Time TBC"}{meeting.location ? ` · ${meeting.location}` : ""}
            </p>
            {(meeting.calRescheduleUrl || meeting.calCancelUrl) && (
              <div className="mt-1 flex gap-3 text-xs">
                {meeting.calRescheduleUrl && <a href={meeting.calRescheduleUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">Reschedule</a>}
                {meeting.calCancelUrl && <a href={meeting.calCancelUrl} target="_blank" rel="noreferrer" className="text-red-500 hover:underline">Cancel</a>}
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted">Not scheduled yet — send the client a booking link, or set a time yourself.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copyLink} className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-ink hover:bg-page">
          Copy client booking link
        </button>
        <button type="button" onClick={() => setSchedOpen((o) => !o)} className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-ink hover:bg-page">
          {schedOpen ? "Close" : meeting ? "Change the time" : "Set a time yourself"}
        </button>
      </div>
      {copyMsg && <p className="text-[11px] text-muted break-all">{copyMsg}</p>}

      {schedOpen && (
        <div className="rounded-lg border border-hairline bg-page px-3 py-3 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-muted mb-1">Location (optional)</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Phone / video / site address" className="w-full rounded-lg border border-hairline px-2 py-1.5 text-sm focus-ring" />
          </div>
          <SlotPicker meetingType={meetingType} onPick={schedule} busy={busy} />
        </div>
      )}
      {msg && <p className={`text-xs ${msg.type === "error" ? "text-red-600" : "text-green-600"}`}>{msg.text}</p>}
    </div>
  );
}
