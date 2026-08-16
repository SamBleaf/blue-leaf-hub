/**
 * QualifyActions — Sales OS Slice 1. The Qualify-stage action panel:
 *   • "Confirm web score" banner for pre-scored web leads.
 *   • Send the Qualify introduction email — assembled PREVIEW first, then send (company profile
 *     attached server-side). Behind QUALIFY_EMAIL_ENABLED (the send returns a clear 503 if off).
 *   • Build-conversation status (booked via the emailed cal.com link → webhook; no manual tick).
 *   • Nurture prompt when the score is below 5 (Lost stays a manual choice).
 */
import { useState } from "react";
import { apiPost } from "../../../lib/apiFetch.js";

function fmtDate(x) {
  if (!x) return "";
  try { return new Date(x).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); } catch { return ""; }
}
function fmtDateTime(x) {
  if (!x) return "";
  try { return new Date(x).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; }
}

export default function QualifyActions({ lead, patch, reload }) {
  const [preview, setPreview] = useState(null);      // { subject, text, bookingLink }
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);              // { type, text }

  const score = lead.qualify_score || 0;
  const booked = !!lead.discovery_meeting_booked_at;
  const introSent = !!lead.qualify_intro_sent_at;
  const needsConfirm = lead.web_prescored && !lead.qualify_confirmed_at;
  const recommendNurture = lead.stage === "qualify" && score < 5;

  async function openPreview() {
    setBusy(true); setMsg(null);
    const { ok, data, error } = await apiPost(`/api/sales/leads/${lead.id}/qualify-email/send`, { preview: true });
    setBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Could not build the preview." }); return; }
    setPreview(data?.preview || null);
    setPreviewOpen(true);
  }
  async function sendNow() {
    setBusy(true); setMsg(null);
    const { ok, error } = await apiPost(`/api/sales/leads/${lead.id}/qualify-email/send`, {});
    setBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Could not send the email." }); return; }
    setPreviewOpen(false);
    setMsg({ type: "success", text: "Qualify email sent." });
    await reload();
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-4 space-y-3">
      <h3 className="section-label">Qualify — next step</h3>

      {needsConfirm && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
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
      <div className="rounded-lg bg-page px-3 py-2 text-sm">
        {booked ? (
          <div>
            <p className="font-medium text-green-700">✓ Build conversation booked</p>
            <p className="text-xs text-muted mt-0.5">{fmtDateTime(lead.discovery_meeting_at) || "Time TBC"}</p>
            <div className="mt-1 flex gap-3 text-xs">
              {lead.calcom_reschedule_url && <a href={lead.calcom_reschedule_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Reschedule</a>}
              {lead.calcom_cancel_url && <a href={lead.calcom_cancel_url} target="_blank" rel="noreferrer" className="text-red-500 hover:underline">Cancel</a>}
            </div>
          </div>
        ) : introSent ? (
          <p className="text-muted">Qualify email sent {fmtDate(lead.qualify_intro_sent_at)} — waiting on the client to book their build conversation.</p>
        ) : (
          <p className="text-muted">Send the qualify email to invite them to book a build conversation.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={openPreview} disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "Working…" : introSent ? "Preview / re-send qualify email" : "Preview & send qualify email"}
        </button>
      </div>

      {msg && (
        <p className={`text-xs ${msg.type === "error" ? "text-red-600" : "text-green-600"}`}>{msg.text}</p>
      )}

      {recommendNurture && (
        <div className="rounded-lg bg-page border border-hairline px-3 py-2">
          <p className="text-xs text-muted">
            Qualifying score <span className="font-semibold text-ink">{score}/8</span> is below the 5 needed to advance — move to <span className="font-medium">Nurture</span>, not Lost.
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

      {previewOpen && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPreviewOpen(false)}>
          <div className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-card bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-semibold text-ink mb-1">Qualify email preview</h4>
            <p className="text-xs text-muted mb-3">To: {lead.email || "—"} · Company profile attached on send</p>
            <p className="text-xs font-semibold text-ink">{preview.subject}</p>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-ink bg-page rounded-lg p-3 border border-hairline font-sans leading-relaxed">{preview.text}</pre>
            {preview.bookingLink && <p className="mt-2 text-[11px] text-muted break-all">Booking link: {preview.bookingLink}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPreviewOpen(false)} className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink hover:bg-page">Close</button>
              <button type="button" onClick={sendNow} disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{busy ? "Sending…" : "Send email"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
