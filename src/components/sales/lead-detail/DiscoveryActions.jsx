/**
 * DiscoveryActions — Sales OS Discovery action panel (the discovery email is in Client correspondence):
 *   • Generate the concept agreement PDF (saved to the client's documents; download to show in the meeting).
 *   • Mark the concept agreement accepted → creates the client folder + backfills docs.
 *   • Client folder link once accepted; the winning_offer advance is gated on acceptance server-side.
 */
import { useState } from "react";
import { apiPost } from "../../../lib/apiFetch.js";

export default function DiscoveryActions({ lead, reload }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [docUrl, setDocUrl] = useState(null);
  const [editUrl, setEditUrl] = useState(null);

  const hasAgreement = !!lead.concept_agreement_document_path;
  const accepted = lead.concept_agreement_status === "accepted";

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
    const { ok, data, error } = await apiPost(`/api/sales/leads/${lead.id}/concept-agreement/accept`, {});
    setBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Could not accept." }); return; }
    const p = data?.provisioning || {};
    const tail = p.folder ? "client folder created." : p.uploaded ? "concept agreement uploaded to the client folder." : "recorded.";
    setMsg({ type: "success", text: `Concept agreement accepted — ${tail}` }); await reload();
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-4 space-y-3">
      <h3 className="section-label">Discovery — next steps</h3>

      {/* Concept agreement */}
      <div data-next-target="concept_agreement_status" className="rounded-lg bg-page px-3 py-2 space-y-2 transition-shadow">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink">Concept agreement</span>
          <span className="text-[11px] text-muted">{lead.concept_agreement_status || "not generated"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-next-focus={!hasAgreement || undefined} onClick={generate} disabled={busy} className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface">
            {hasAgreement ? "Re-generate" : "Generate"}
          </button>
          {editUrl && <a href={editUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-medium text-primary hover:bg-surface">Open in Google Docs</a>}
          {docUrl && <a href={docUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-primary hover:bg-surface">Download DOCX</a>}
          {!accepted && <button type="button" data-next-focus={hasAgreement || undefined} onClick={markAccepted} disabled={busy || !hasAgreement} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">Mark accepted</button>}
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
    </div>
  );
}
