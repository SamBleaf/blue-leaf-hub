/**
 * StageEmailButton — a self-contained "preview then send" button for a stage-family email. Endpoint
 * is parameterised so it drives any of the sales email endpoints (concept-email, tender-email, …).
 * Preview always works; sending is gated server-side by that family's *_EMAIL_ENABLED flag. Edited
 * copy in the preview is honoured for that send only.
 *
 *   endpoint  e.g. "concept-email" | "tender-email"  →  POST /api/sales/leads/:id/<endpoint>/send
 *   which     the template key within that family
 */
import { useState } from "react";
import { apiPost } from "../../../lib/apiFetch.js";

export default function StageEmailButton({ lead, endpoint, which, label, title, reload, onSent }) {
  const [preview, setPreview] = useState(null); // { subject, text }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const url = `/api/sales/leads/${lead.id}/${endpoint}/send`;

  async function open() {
    setBusy(true); setMsg(null);
    const { ok, data, error } = await apiPost(url, { which, preview: true });
    setBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Could not build the preview." }); return; }
    setPreview({ subject: data?.preview?.subject || "", text: data?.preview?.text || "" });
  }
  async function send() {
    setBusy(true); setMsg(null);
    const { ok, error } = await apiPost(url, { which, subject: preview.subject, text: preview.text });
    setBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Could not send." }); return; }
    setPreview(null); setMsg({ type: "success", text: "Email sent." });
    onSent?.(); reload?.();
  }

  return (
    <>
      <button type="button" onClick={open} disabled={busy}
        className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-ink hover:bg-page disabled:opacity-50">
        {busy && !preview ? "…" : label}
      </button>
      {msg && <span className={`ml-2 text-xs ${msg.type === "error" ? "text-red-600" : "text-green-600"}`}>{msg.text}</span>}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPreview(null)}>
          <div className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-card bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-semibold text-ink mb-1">{title || label} — preview</h4>
            <p className="text-xs text-muted mb-3">To: {lead.email || "—"}</p>
            <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Subject</label>
            <input value={preview.subject} onChange={(e) => setPreview((p) => ({ ...p, subject: e.target.value }))}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink mb-3 focus-ring" />
            <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Message</label>
            <textarea value={preview.text} onChange={(e) => setPreview((p) => ({ ...p, text: e.target.value }))} rows={12}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page leading-relaxed focus-ring" />
            <p className="text-[11px] text-muted mt-1">Edits apply to this send only.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPreview(null)} className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink hover:bg-page">Close</button>
              <button type="button" onClick={send} disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{busy ? "Sending…" : "Send email"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
