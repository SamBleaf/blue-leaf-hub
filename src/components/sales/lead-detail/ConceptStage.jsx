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

export default function ConceptStage({ lead, patch, reload }) {
  const [invoices, setInvoices] = useState([]);
  const [rows, setRows] = useState(Array.isArray(lead.selections_schedule) ? lead.selections_schedule : []);
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
  function setStatus(s) { patch({ concept_design_status: status === s ? null : s }); }

  function saveRows(next) { setRows(next); patch({ selections_schedule: next }); }
  const addRow = () => saveRows([...rows, { area: "", item: "", notes: "" }]);
  const editRow = (i, k, v) => saveRows(rows.map((r, ix) => (ix === i ? { ...r, [k]: v } : r)));
  const delRow = (i) => saveRows(rows.filter((_, ix) => ix !== i));

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
      <div className="rounded-card border border-hairline bg-surface p-4">
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

      {/* Finishes schedule v1 */}
      <div className="rounded-card border border-hairline bg-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="section-label">Finishes schedule</h3>
          <button type="button" onClick={addRow} className="text-xs font-semibold text-primary hover:underline">+ Add row</button>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-muted">Start the finishes schedule — it carries through to Consultants + the proposal.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex gap-1.5">
                <input value={r.area || ""} onChange={(e) => editRow(i, "area", e.target.value)} placeholder="Area" className="w-28 rounded-lg border border-hairline px-2 py-1 text-xs" />
                <input value={r.item || ""} onChange={(e) => editRow(i, "item", e.target.value)} placeholder="Item / finish" className="flex-1 rounded-lg border border-hairline px-2 py-1 text-xs" />
                <input value={r.notes || ""} onChange={(e) => editRow(i, "notes", e.target.value)} placeholder="Notes" className="flex-1 rounded-lg border border-hairline px-2 py-1 text-xs" />
                <button type="button" onClick={() => delRow(i)} className="px-1.5 text-xs text-red-500 hover:text-red-700">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Meetings */}
      <MeetingScheduler lead={lead} meetingType="designer_meeting" reload={reload} />
      <MeetingScheduler lead={lead} meetingType="winning_offer_presentation" reload={reload} />

      {/* PTSA / Plans pathway (the exit gate) */}
      <div className="rounded-card border border-hairline bg-surface p-4 space-y-3">
        <h3 className="section-label">PTSA / Plans pathway</h3>
        <div>
          <label className="block text-xs text-muted mb-1">Pre-construction fee (ex GST)</label>
          <input type="number" min="0" defaultValue={lead.preconstruction_fee ? String(lead.preconstruction_fee) : ""}
            onBlur={(e) => { const v = e.target.value ? parseFloat(e.target.value) : null; if (v !== (lead.preconstruction_fee ?? null)) patch({ preconstruction_fee: v }); }}
            placeholder="e.g. 15000" className="w-full rounded-lg border border-hairline px-3 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="w-4 h-4 accent-primary" checked={!!lead.concept_pathway_explained} onChange={(e) => patch({ concept_pathway_explained: e.target.checked })} />
          PTSA / Plans pathway explained to the client
        </label>
      </div>
    </div>
  );
}
