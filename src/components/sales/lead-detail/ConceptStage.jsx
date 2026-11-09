/**
 * ConceptStage — the Concept-stage control panel (delivering the paid concept design work).
 *   • Design-lock: active design actions stay locked until the concept fee shows PAID (Xero) or a
 *     Sam/Josh override. • Design state machine (with designer → sent to client → approved).
 *   • Finishes schedule v1 (the schedule thread). • Brief meeting + Concept presentation.
 *   • PTSA / Plans pathway prepared (fee set + explained) — the exit-gate fields.
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiPost } from "../../../lib/apiFetch.js";
import { CONCEPT_DESIGN_STATUS, CONCEPT_DESIGN_STEPS } from "../../../lib/constants.js";
import MeetingScheduler from "./MeetingScheduler.jsx";
import RegisterWorkshop from "./register/RegisterWorkshop.jsx";

export default function ConceptStage({ lead, patch, reload }) {
  const [invoices, setInvoices] = useState([]);
  const [busy, setBusy] = useState(false);

  const loadInvoices = useCallback(async () => {
    const { ok, data } = await apiFetch(`/api/finance/leads/${lead.id}/xero-invoices`);
    if (ok) setInvoices(data.invoices || []);
  }, [lead.id]);
  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const conceptInvoice = invoices.find((i) => i.invoiceType === "concept_fee");
  const feePaid = conceptInvoice && ["paid", "part_paid"].includes(conceptInvoice.status);
  const unlocked = feePaid || !!lead.concept_fee_override_at;
  const status = lead.concept_design_status || null;

  async function override() {
    setBusy(true);
    const { ok } = await apiPost(`/api/sales/leads/${lead.id}/concept-fee/override`, {});
    setBusy(false);
    if (ok) reload?.();
  }
  // Forward-only: clicking a step sets it; clicking the already-active step is a no-op
  // (never silently clears the design status). Correcting a mis-click = click an earlier step.
  function setStatus(s) { if (status !== s) patch({ concept_design_status: s }); }

  return (
    <div className="space-y-4">
      {/* Design-lock */}
      <div className={`rounded-card border p-3 ${unlocked ? "border-green-200 bg-green-50/40" : "border-amber-300 bg-amber-50/50"}`}>
        {unlocked ? (
          <p className="text-sm font-medium text-green-800">
            ✓ Design unlocked{feePaid ? " — concept fee paid" : lead.concept_fee_override_at ? " — manual override" : ""}
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-amber-800">
              🔒 Concept design is locked until the concept fee is paid{conceptInvoice ? ` (invoice ${conceptInvoice.status || "issued"})` : " (no invoice yet — issue it in Discovery)"}.
            </p>
            <button type="button" onClick={override} disabled={busy} className="shrink-0 rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-500 hover:text-white disabled:opacity-50">
              {busy ? "…" : "Override"}
            </button>
          </div>
        )}
      </div>

      {/* Design state machine */}
      <div data-next-target="concept_design_status" className="rounded-card border border-hairline bg-surface p-4 transition-shadow">
        <h3 className="section-label mb-2">Concept design</h3>
        <div className="flex flex-wrap gap-2">
          {CONCEPT_DESIGN_STEPS.map((s) => {
            const on = status === s;
            const idx = CONCEPT_DESIGN_STEPS.indexOf(s);
            const done = status && CONCEPT_DESIGN_STEPS.indexOf(status) > idx;
            return (
              <button key={s} type="button" disabled={!unlocked} onClick={() => setStatus(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${on ? "bg-primary text-white" : done ? "bg-green-100 text-green-700" : "border border-hairline text-ink hover:bg-page"}`}>
                {done ? "✓ " : ""}{CONCEPT_DESIGN_STATUS[s]}
              </button>
            );
          })}
        </div>
        {!unlocked && <p className="mt-2 text-[11px] text-muted">Unlock (fee paid or override) to start moving the design forward.</p>}
        <p className="mt-2 text-xs text-muted">
          Concept drawings: upload the concept drawings in the <span className="font-medium text-ink">Documents</span> tab (type “Concept drawings”). Approve when the client signs off.
        </p>
      </div>

      {/* Project brief & register — the room-by-room staff workshop (carries to Consultants + proposal) */}
      <RegisterWorkshop lead={lead} patch={patch} stage="winning_offer" />

      {/* Meetings */}
      <MeetingScheduler lead={lead} meetingType="designer_meeting" reload={reload} />
      <MeetingScheduler lead={lead} meetingType="winning_offer_presentation" reload={reload} />

      {/* PTSA / Plans pathway (the exit gate) */}
      <div className="rounded-card border border-hairline bg-surface p-4 space-y-3">
        <h3 className="section-label">PTSA / Plans pathway</h3>
        <div data-next-target="preconstruction_fee" className="rounded-lg transition-shadow">
          <label className="block text-xs text-muted mb-1">Pre-construction fee (ex GST)</label>
          <input type="number" min="0" defaultValue={lead.preconstruction_fee ? String(lead.preconstruction_fee) : ""}
            onBlur={(e) => { const v = e.target.value ? parseFloat(e.target.value) : null; if (v !== (lead.preconstruction_fee ?? null)) patch({ preconstruction_fee: v }); }}
            placeholder="e.g. 15000" className="w-full rounded-lg border border-hairline px-3 py-2 text-sm" />
        </div>
        <label data-next-target="concept_pathway_explained" className="flex items-center gap-2 rounded-lg text-sm text-ink transition-shadow">
          <input type="checkbox" className="w-4 h-4 accent-primary" checked={!!lead.concept_pathway_explained} onChange={(e) => patch({ concept_pathway_explained: e.target.checked })} />
          PTSA / Plans pathway explained to the client
        </label>
      </div>
    </div>
  );
}
