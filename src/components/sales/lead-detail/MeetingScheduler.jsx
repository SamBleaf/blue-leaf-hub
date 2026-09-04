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
import MeetingNotes from "./MeetingNotes.jsx";

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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePreview, setInvitePreview] = useState(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  const label = MEETING_TYPE_LABELS[meetingType] || "Meeting";

  const [syncing, setSyncing] = useState(false);
  const pick = (rows) => (rows || []).find((m) => m.meetingType === meetingType && m.status !== "cancelled") || null;

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await apiFetch(`/api/sales/leads/${lead.id}/meetings`);
    let m = ok ? pick(data.meetings) : null;
    // Nothing booked yet? Poll cal.com once to catch a client self-booking the webhook may have missed.
    if (!m) {
      const s = await apiPost(`/api/sales/leads/${lead.id}/meetings/sync`, { meetingType });
      if (s.ok && s.data?.synced > 0) {
        const re = await apiFetch(`/api/sales/leads/${lead.id}/meetings`);
        if (re.ok) m = pick(re.data.meetings);
      }
    }
    setMeeting(m);
    setLoading(false);
  }, [lead.id, meetingType]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  // Manual re-poll (the client just booked while you're on the phone).
  async function checkBooking() {
    setSyncing(true); setMsg(null);
    const { ok, data } = await apiPost(`/api/sales/leads/${lead.id}/meetings/sync`, { meetingType });
    setSyncing(false);
    if (ok && data?.synced > 0) { await load(); reload?.(); return; }
    if (ok && data?.configured === false) setMsg({ type: "error", text: data.message });
    else if (ok && data?.error) setMsg({ type: "error", text: data.error });
    else setMsg({ type: "success", text: "No booking found yet — try again once the client has booked." });
  }

  async function copyLink() {
    const { ok, data, error } = await apiFetch(`/api/sales/leads/${lead.id}/booking-link?meetingType=${meetingType}`);
    if (!ok) { setCopyMsg(error || "Couldn't build the link."); return; }
    try { await navigator.clipboard.writeText(data.url); setCopyMsg("Booking link copied ✓"); }
    catch { setCopyMsg(data.url); }
    setTimeout(() => setCopyMsg(""), 5000);
  }

  async function openInvite() {
    setInviteBusy(true); setMsg(null);
    const { ok, data, error } = await apiPost(`/api/sales/leads/${lead.id}/meetings/${meetingType}/invite-email`, { preview: true });
    setInviteBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Couldn't build the email." }); return; }
    setInvitePreview(data?.preview || null); setInviteOpen(true);
  }
  async function sendInvite() {
    setInviteBusy(true); setMsg(null);
    const { ok, error } = await apiPost(`/api/sales/leads/${lead.id}/meetings/${meetingType}/invite-email`, { subject: invitePreview?.subject, text: invitePreview?.text });
    setInviteBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Couldn't send the email." }); return; }
    setInviteOpen(false); setMsg({ type: "success", text: "Booking email sent." });
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
            <MeetingNotes leadId={lead.id} meetingType={meetingType} meeting={meeting} reload={load} />
          </div>
        ) : (
          <div>
            <p className="text-muted">Not scheduled yet — send the client a booking link, or set a time yourself.</p>
            <button type="button" onClick={checkBooking} disabled={syncing}
              className="mt-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50">
              {syncing ? "Checking cal.com…" : "↻ Check for booking"}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={openInvite} disabled={inviteBusy} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {inviteBusy ? "…" : "Email booking link"}
        </button>
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

      {inviteOpen && invitePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setInviteOpen(false)}>
          <div className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-card bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-semibold text-ink mb-1">{label} — booking email</h4>
            <p className="text-xs text-muted mb-3">To: {lead.email || "—"}</p>
            <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Subject</label>
            <input value={invitePreview.subject || ""} onChange={(e) => setInvitePreview((p) => ({ ...p, subject: e.target.value }))}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink mb-3 focus-ring" />
            <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Message</label>
            <textarea value={invitePreview.text || ""} onChange={(e) => setInvitePreview((p) => ({ ...p, text: e.target.value }))} rows={10}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page leading-relaxed focus-ring" />
            <p className="text-[11px] text-muted mt-1">Edits apply to this send only. Behind LEAD_MAILBOX_ENABLED.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setInviteOpen(false)} className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink hover:bg-page">Close</button>
              <button type="button" onClick={sendInvite} disabled={inviteBusy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{inviteBusy ? "Sending…" : "Send email"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
