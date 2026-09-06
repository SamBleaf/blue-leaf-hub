/**
 * StageEmailBox — one email surface at every stage. A dropdown lists the client emails relevant to
 * the current stage; picking one loads its autofilled preview (via the existing per-family endpoints —
 * qualify/discovery/concept/tender + the new pipeline-gap family), which you can edit and send. Reuses
 * every existing template + endpoint (never re-implements them), so the copy stays exactly as written.
 * Sending is gated per family by that family's *_EMAIL_ENABLED flag; preview always works.
 */
import { useState, useEffect, useCallback } from "react";
import { apiPost } from "../../../lib/apiFetch.js";

// stage key → the emails available in its dropdown. { label, path (endpoint), which (template key) }.
// Enquiry = a call (no email); Consultants = handled by the per-consultant comms threads.
const STAGE_EMAILS = {
  // Stages with a dedicated email sender (Qualify, Discovery, Concept, and the Tender / accepted-concepts
  // buttons) are intentionally NOT listed here — their own panel owns those sends, so the box would only
  // duplicate them. The box carries the pipeline-gap emails that have no dedicated card of their own.
  fee_proposal: [ // PTSA / Plans
    { label: "PTSA covering email", path: "pipeline-email/send", which: "ptsa_covering" },
  ],
  tender: [
    { label: "Tender started (client update)", path: "pipeline-email/send", which: "tender_started" },
  ],
  won: [
    { label: "Contract signed — welcome", path: "pipeline-email/send", which: "contract_signed" },
    { label: "Moving into Operations", path: "pipeline-email/send", which: "ops_handoff" },
  ],
  nurture: [
    { label: "Nurture check-in", path: "pipeline-email/send", which: "nurture" },
  ],
  lost: [
    { label: "Lost close-off", path: "pipeline-email/send", which: "lost" },
  ],
};

// Stages whose client email is owned by a dedicated in-stage panel (so the box defers to it).
const DEDICATED_SENDER_STAGES = new Set(["qualify", "discovery", "winning_offer"]);

export default function StageEmailBox({ lead }) {
  const templates = STAGE_EMAILS[lead.stage] || [];
  const [sel, setSel] = useState(0);
  const [preview, setPreview] = useState(null); // { subject, text }
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const loadPreview = useCallback(async (idx) => {
    const t = templates[idx];
    if (!t) return;
    setLoading(true); setMsg(null); setPreview(null);
    const { ok, data, error } = await apiPost(`/api/sales/leads/${lead.id}/${t.path}`, { preview: true, which: t.which || undefined });
    setLoading(false);
    if (!ok) { setMsg({ type: "error", text: error || "Couldn't build the preview." }); return; }
    setPreview(data?.preview || null);
  }, [lead.id, lead.stage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setSel(0); if (templates.length) loadPreview(0); }, [lead.stage]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(e) { const idx = Number(e.target.value); setSel(idx); loadPreview(idx); }

  async function send() {
    if (!preview) return;
    const t = templates[sel];
    setBusy(true); setMsg(null);
    const { ok, error } = await apiPost(`/api/sales/leads/${lead.id}/${t.path}`, { which: t.which || undefined, subject: preview.subject, text: preview.text });
    setBusy(false);
    if (!ok) { setMsg({ type: "error", text: error || "Couldn't send the email." }); return; }
    setMsg({ type: "success", text: "Email sent." });
  }

  if (!templates.length) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-4">
        <h3 className="section-label mb-1">Stage email</h3>
        <p className="text-xs text-muted">
          {DEDICATED_SENDER_STAGES.has(lead.stage)
            ? "This stage has its own client-email panel above — send it from there."
            : lead.stage === "consultants" ? "Consultant messages go through the per-consultant comms threads above."
            : lead.stage === "enquiry" ? "The Enquiry step is a call — no client email yet."
            : "No client email at this stage."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="section-label">Stage email</h3>
        <span className="text-[11px] text-muted truncate max-w-[55%]">To: {lead.email || "—"}</span>
      </div>
      <select value={sel} onChange={pick} className="w-full rounded-lg border border-hairline px-2 py-1.5 text-sm bg-page text-ink focus-ring">
        {templates.map((t, i) => <option key={i} value={i}>{t.label}</option>)}
      </select>

      {loading ? (
        <p className="text-xs text-muted">Building the email…</p>
      ) : preview && (
        <>
          <input value={preview.subject || ""} onChange={(e) => setPreview((p) => ({ ...p, subject: e.target.value }))}
            placeholder="Subject" className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink focus-ring" />
          <textarea value={preview.text || ""} onChange={(e) => setPreview((p) => ({ ...p, text: e.target.value }))} rows={12}
            className="w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink bg-page leading-relaxed focus-ring" />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted">Autofilled with the client’s details + your signature. Edits apply to this send only.</p>
            <button type="button" onClick={send} disabled={busy}
              className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? "Sending…" : "Send email"}
            </button>
          </div>
        </>
      )}
      {msg && <p className={`text-xs ${msg.type === "error" ? "text-red-600" : "text-green-600"}`}>{msg.text}</p>}
    </div>
  );
}
