/**
 * QualifyActions — Sales OS Slice 1. The Qualify-stage action panel:
 *   • "Confirm web score" banner for pre-scored web leads.
 *   • The build conversation: a clear choice between inviting the client to book and logging one already held.
 *     The invitation itself is the Qualify email in Client correspondence (LeadCorrespondence), one send control.
 *   • Nurture prompt when the score is below 5 (Lost stays a manual choice).
 */
import { useState, useEffect } from "react";
import { apiPost } from "../../../lib/apiFetch.js";
import { QUALIFY_CONFIRM_TARGET, STAGE_EMAIL_TARGET, focusLeadControl } from "../../../lib/leadNextAction.js";

function fmtDate(x) {
  if (!x) return "";
  try { return new Date(x).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); } catch { return ""; }
}
function fmtDateTime(x) {
  if (!x) return "";
  try { return new Date(x).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; }
}

export default function QualifyActions({ lead, patch, reload }) {
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState(null);              // { type, text }

  const score = lead.qualify_score || 0;
  const booked = !!lead.discovery_meeting_booked_at;
  const introSent = !!lead.qualify_intro_sent_at;

  // Auto-detect a self-booked build conversation by polling cal.com (the robust path — the client
  // books via the emailed link and the Hub FETCHES the booking rather than waiting on a webhook).
  async function checkBooking(silent) {
    setSyncing(true); if (!silent) setMsg(null);
    const { ok, data } = await apiPost(`/api/sales/leads/${lead.id}/meetings/sync`, { meetingType: "build_conversation" });
    setSyncing(false);
    if (ok && data?.synced > 0) { await reload(); return; }
    if (silent) return;
    if (ok && data?.configured === false) setMsg({ type: "error", text: data.message });
    else if (ok && data?.error) setMsg({ type: "error", text: data.error });
    else setMsg({ type: "success", text: "No booking found yet — try again once the client has booked." });
  }
  useEffect(() => {
    if (introSent && !booked) checkBooking(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, introSent, booked]);
  const needsConfirm = lead.web_prescored && !lead.qualify_confirmed_at;
  const recommendNurture = lead.stage === "qualify" && score < 5;

  // Already spoken to them (phone / in person)? Record the build conversation as held WITHOUT sending the
  // qualify email — this is the manual path that satisfies the Discovery gate when there's no cal.com booking.
  async function logCall() {
    setBusy(true); setMsg(null);
    const now = new Date().toISOString();
    const saved = await patch({ discovery_meeting_booked_at: now, discovery_meeting_at: now, discovery_meeting_source: "manual" });
    setBusy(false);
    if (!saved) { setMsg({ type: "error", text: "Could not log the call — try again." }); return; }
    setMsg({ type: "success", text: "Logged — build conversation recorded as already held (no email sent)." });
    await reload();
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-4 space-y-3">
      <h3 className="section-label">Build conversation</h3>

      {needsConfirm && (
        <div data-next-target={QUALIFY_CONFIRM_TARGET} className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 transition-shadow">
          <p className="text-xs text-amber-800">
            These answers came from the website enquiry form. Review the scorecard + client details, then confirm.
          </p>
          <button
            type="button"
            onClick={() => patch({ qualify_confirmed_at: new Date().toISOString() }).then(reload)}
            className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Confirm web score
          </button>
        </div>
      )}

      {/* Build conversation status */}
      <div data-next-target="discovery_meeting_booked_at" className="rounded-lg bg-page px-3 py-2 text-sm transition-shadow">
        {booked ? (
          <div>
            <p className="font-medium text-green-700">{lead.discovery_meeting_source === "manual" ? "✓ Build conversation logged as already held" : "✓ Build conversation booked"}</p>
            <p className="text-xs text-muted mt-0.5">{fmtDateTime(lead.discovery_meeting_at) || "Time TBC"}</p>
            <div className="mt-1 flex gap-3 text-xs">
              {lead.calcom_reschedule_url && <a href={lead.calcom_reschedule_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Reschedule</a>}
              {lead.calcom_cancel_url && <a href={lead.calcom_cancel_url} target="_blank" rel="noreferrer" className="text-red-500 hover:underline">Cancel</a>}
            </div>
          </div>
        ) : introSent ? (
          <div>
            <p className="text-muted">Qualify email recorded as sent {fmtDate(lead.qualify_intro_sent_at)}. Waiting on the client to book their build conversation.</p>
            <button type="button" onClick={() => checkBooking(false)} disabled={syncing}
              className="mt-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50">
              {syncing ? "Checking cal.com…" : "↻ Check for booking"}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-muted">Not booked yet. Invite them to book with the qualify email.</p>
            <button type="button" onClick={() => focusLeadControl(STAGE_EMAIL_TARGET)}
              className="mt-1 text-xs font-semibold text-primary hover:underline">
              Go to the qualify email
            </button>
          </div>
        )}
        {!booked && (
          <div className="mt-2 border-t border-hairline pt-2">
            <p className="text-xs text-muted">Already spoken to them by phone or in person?</p>
            <button type="button" onClick={logCall} disabled={busy}
              className="mt-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50">
              {busy ? "Logging…" : "Log the build conversation as already held (no email)"}
            </button>
          </div>
        )}
      </div>

      {msg && (
        <p className={`text-xs ${msg.type === "error" ? "text-red-600" : "text-green-600"}`}>{msg.text}</p>
      )}

      {recommendNurture && (
        <div className="rounded-lg bg-page border border-hairline px-3 py-2">
          <p className="text-xs text-muted">
            The score is below the 5 needed to advance. Move to <span className="font-medium">Nurture</span>, not Lost.
          </p>
          <button
            type="button"
            onClick={() => patch({ stage: "nurture" }).then(reload)}
            className="mt-2 rounded-lg border border-hairline px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface"
          >
            → Move to Nurture
          </button>
        </div>
      )}
    </div>
  );
}
