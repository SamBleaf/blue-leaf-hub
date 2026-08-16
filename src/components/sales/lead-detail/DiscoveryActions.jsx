/**
 * DiscoveryActions — Sales OS Discovery action panel:
 *   • Send the discovery process/fees email (assembled preview → send; optional concept-agreement attach).
 *   • Generate the concept agreement PDF (saved to the client's documents; download to show in the meeting).
 *   • Mark the concept agreement accepted → creates the client folder + backfills docs.
 *   • Client folder link once accepted; the winning_offer advance is gated on acceptance server-side.
 */
import { useState } from "react";
import { apiPost } from "../../../lib/apiFetch.js";

function fmtDateTime(x) {
  try { return new Date(x).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; }
}

export default function DiscoveryActions({ lead, reload }) {
  const [preview, setPreview] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [attachAgreement, setAttachAgreement] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [docUrl, setDocUrl] = useState(null);
  const [editUrl, setEditUrl] = useState(null);

  const hasDesigner = !!lead.selected_designer_contact_id;
  const hasAgreement = !!lead.concept_agreement_document_path;
  const accepted = lead.concept_agreement_status === "accepted";

  async function openPreview() {
    setBusy(true); setMsg(null);
    const { ok, data, error } = await apiPost(`/api/sales/leads/${lead.id}/discovery-email/send`, { preview: true });
    setBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Could not build the preview." }); return; }
    setPreview(data?.preview || null); setPreviewOpen(true);
  }
  async function sendNow() {
    setBusy(true); setMsg(null);
    const { ok, error } = await apiPost(`/api/sales/leads/${lead.id}/discovery-email/send`, { attachAgreement });
    setBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Could not send." }); return; }
    setPreviewOpen(false); setMsg({ type: "success", text: "Discovery email sent." }); await reload();
  }
  async function generate() {
    setBusy(true); setMsg(null);
    const { ok, data, error } = await apiPost(`/api/sales/leads/${lead.id}/concept-agreement/generate`, {});
    setBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Could not generate the agreement." }); return; }
    setDocUrl(data?.downloadUrl || null); setEditUrl(data?.editUrl || null);
    setMsg({ type: "success", text: "Concept agreement generated." }); await reload();
  }
  async function markAccepted() {
    if (!window.confirm("Mark the concept agreement as accepted? This creates the client folder.")) return;
    setBusy(true); setMsg(null);
    const { ok, error } = await apiPost(`/api/sales/leads/${lead.id}/concept-agreement/accept`, {});
    setBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Could not accept." }); return; }
    setMsg({ type: "success", text: "Concept agreement accepted — client folder created." }); await reload();
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-4 space-y-3">
      <h3 className="section-label">Discovery — next steps</h3>

      {/* Discovery email */}
      <div className="space-y-2">
        {!hasDesigner && <p className="text-xs text-amber-700">Select a designer above before sending the discovery email.</p>}
        <label className="flex items-center gap-2 text-xs text-ink">
          <input type="checkbox" checked={attachAgreement} onChange={(e) => setAttachAgreement(e.target.checked)} disabled={!hasAgreement} />
          Attach the concept agreement PDF {hasAgreement ? "" : "(generate it first)"}
        </label>
        <button type="button" onClick={openPreview} disabled={busy || !hasDesigner} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "Working…" : lead.discovery_email_sent_at ? "Preview / re-send discovery email" : "Preview & send discovery email"}
        </button>
        {lead.discovery_email_sent_at && <p className="text-[11px] text-muted">Sent {fmtDateTime(lead.discovery_email_sent_at)}</p>}
      </div>

      {/* Concept agreement */}
      <div className="rounded-lg bg-page px-3 py-2 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink">Concept agreement</span>
          <span className="text-[11px] text-muted">{lead.concept_agreement_status || "not generated"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={generate} disabled={busy} className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface">
            {hasAgreement ? "Re-generate" : "Generate"}
          </button>
          {editUrl && <a href={editUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-medium text-primary hover:bg-surface">Open in Google Docs</a>}
          {docUrl && <a href={docUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-primary hover:bg-surface">Download DOCX</a>}
          {!accepted && <button type="button" onClick={markAccepted} disabled={busy || !hasAgreement} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">Mark accepted</button>}
          {accepted && <span className="text-xs font-medium text-green-700">✓ Accepted</span>}
        </div>
      </div>

      {/* Client folder */}
      {lead.client_folder_link ? (
        <a href={lead.client_folder_link} target="_blank" rel="noreferrer" className="block text-xs text-primary hover:underline">📁 Open client folder</a>
      ) : accepted ? (
        <p className="text-[11px] text-muted">Client folder created (Dropbox not configured, or the link is still resolving).</p>
      ) : (
        <p className="text-[11px] text-muted">The client folder is created when the concept agreement is accepted.</p>
      )}

      {msg && <p className={`text-xs ${msg.type === "error" ? "text-red-600" : "text-green-600"}`}>{msg.text}</p>}

      {previewOpen && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPreviewOpen(false)}>
          <div className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-card bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-semibold text-ink mb-1">Discovery email preview</h4>
            <p className="text-xs text-muted mb-3">To: {lead.email || "—"}{attachAgreement ? " · concept agreement attached" : ""}</p>
            <p className="text-xs font-semibold text-ink">{preview.subject}</p>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-ink bg-page rounded-lg p-3 border border-hairline font-sans leading-relaxed">{preview.text}</pre>
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
