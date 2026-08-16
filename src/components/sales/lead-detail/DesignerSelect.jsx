/**
 * DesignerSelect — Sales OS Discovery. Pick the recommended designer/consultant (from CRM contacts
 * typed architect/designer). Selecting one autofills the client-facing concept + design fees from
 * the designer's defaults (fill-if-empty; confirm before overwriting hand-edited fees). Fees are
 * stored EX-GST and shown with their INC-GST client price.
 */
import { useEffect, useState } from "react";
import { apiFetch, apiPost } from "../../../lib/apiFetch.js";
import { incGst } from "../../../lib/constants.js";

const incDollars = (ex) => (ex == null || ex === "" ? null : Math.round(incGst(Number(ex))));

function FeeInput({ label, valueExGst, onSave }) {
  const inc = incDollars(valueExGst);
  return (
    <label className="block">
      <span className="block text-xs text-muted mb-1">
        {label} <span className="text-muted/70">(ex GST{inc != null ? ` — client sees $${inc.toLocaleString("en-AU")} inc` : ""})</span>
      </span>
      <input
        type="number" step="0.01" defaultValue={valueExGst ?? ""} placeholder="ex GST"
        className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink"
        onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== (valueExGst ?? null)) onSave(v); }}
      />
    </label>
  );
}

export default function DesignerSelect({ lead, patch, reload }) {
  const [designers, setDesigners] = useState([]);
  useEffect(() => { apiFetch("/api/sales/designers").then(({ ok, data }) => { if (ok) setDesigners(data?.designers || []); }); }, []);
  const selected = lead.selected_designer_contact_id || "";

  async function pick(contactId) {
    if (!contactId) return;
    let overwrite = false;
    const hasFees = lead.concept_fee != null || lead.design_package_fee != null;
    if (hasFees && contactId !== selected) {
      overwrite = window.confirm("Overwrite the current concept/design fees with this designer's defaults?");
    }
    const { ok, error } = await apiPost(`/api/sales/leads/${lead.id}/designer`, { contactId, overwrite });
    if (!ok) { alert(error || "Couldn't set the designer (is migration 179/180 applied?)."); return; }
    await reload();
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <h3 className="section-label mb-3">Designer &amp; fees</h3>
      <label className="block mb-3">
        <span className="block text-xs text-muted mb-1">Recommended designer / consultant</span>
        <select value={selected} onChange={(e) => pick(e.target.value)} className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink">
          <option value="">— select a designer —</option>
          {designers.map((d) => (
            <option key={d.id} value={d.id}>
              {[d.firstName, d.lastName].filter(Boolean).join(" ")}{d.company ? ` — ${d.company}` : ""}
            </option>
          ))}
        </select>
        {designers.length === 0 && (
          <span className="mt-1 block text-[11px] text-muted">No designers yet — add a CRM contact typed “architect” or “designer” with default fees.</span>
        )}
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FeeInput label="Concept fee" valueExGst={lead.concept_fee} onSave={(v) => patch({ concept_fee: v })} />
        <FeeInput label="Full design fee" valueExGst={lead.design_package_fee} onSave={(v) => patch({ design_package_fee: v })} />
      </div>
    </div>
  );
}
