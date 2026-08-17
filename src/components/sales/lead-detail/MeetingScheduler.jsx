/**
 * MeetingScheduler — schedule ONE pipeline meeting type for a lead (cal.com).
 * Both booking modes (Sam's choice):
 *   • "Copy client booking link" → the prefilled cal.com self-book link (client picks a slot; the
 *     webhook stamps it back automatically).
 *   • "Set a time yourself" → book-on-behalf: creates a real cal.com booking if the API is wired
 *     (invite goes out), otherwise records the meeting in the Hub so it still shows on the agenda.
 * Reads the lead's current meeting of this type from lead_meetings and shows its status + links.
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiPost } from "../../../lib/apiFetch.js";
import { MEETING_TYPE_LABELS } from "../../../lib/constants.js";

function fmtDateTime(x) {
  if (!x) return "";
  try { return new Date(x).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; }
}

export default function MeetingScheduler({ lead, meetingType, reload }) {
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copyMsg, setCopyMsg] = useState("");
  const [schedOpen, setSchedOpen] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [duration, setDuration] = useState("");
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

  async function schedule() {
    if (!startAt) { setMsg({ type: "error", text: "Pick a date & time." }); return; }
    setBusy(true); setMsg(null);
    const { ok, data, error } = await apiPost(`/api/sales/leads/${lead.id}/meetings/schedule`, {
      meetingType,
      startAt: new Date(startAt).toISOString(),
      durationMins: duration ? Number(duration) : null,
      location: location || null,
    });
    setBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Couldn't schedule the meeting." }); return; }
    setSchedOpen(false); setStartAt(""); setDuration(""); setLocation("");
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
        <div className="rounded-lg border border-hairline bg-page px-3 py-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-muted mb-1">Date &amp; time</label>
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="w-full rounded-lg border border-hairline px-2 py-1.5 text-sm focus-ring" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted mb-1">Duration (mins)</label>
              <input type="number" min="15" step="15" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 60" className="w-full rounded-lg border border-hairline px-2 py-1.5 text-sm focus-ring" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted mb-1">Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Phone / video / site address" className="w-full rounded-lg border border-hairline px-2 py-1.5 text-sm focus-ring" />
          </div>
          <p className="text-[11px] text-muted">Sends a cal.com invite if the calendar API is connected; otherwise it is recorded in the Hub so it still shows on your agenda.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setSchedOpen(false)} className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-surface">Cancel</button>
            <button type="button" onClick={schedule} disabled={busy} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">{busy ? "Saving…" : "Save meeting"}</button>
          </div>
        </div>
      )}
      {msg && <p className={`text-xs ${msg.type === "error" ? "text-red-600" : "text-green-600"}`}>{msg.text}</p>}
    </div>
  );
}
