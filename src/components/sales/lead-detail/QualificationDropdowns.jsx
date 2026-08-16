/**
 * QualificationDropdowns — Sales OS Slice 1. The tight, controlled-vocab capture shared by the
 * Enquiry call-script and the Qualify "confirm web score" flow. Every answer is a pre-written
 * dropdown (no free-text feeds client emails). Lead-column fields save via patch(); priority/concern
 * are stored as lead_signals (kind = priority / fear) so they persist across the pipeline with no
 * duplicate columns.
 */
import { useEffect, useState } from "react";
import { apiFetch, apiPost, apiPatch, apiDelete } from "../../../lib/apiFetch.js";
import {
  LEAD_LAND_STATUS_LABELS, LEAD_FINANCE_STATUS_LABELS, LEAD_DOCUMENTS_ON_HAND_LABELS,
  LEAD_PRIORITY_LABELS, LEAD_CONCERN_LABELS,
} from "../../../lib/constants.js";

function Select({ label, value, options, onChange, placeholder = "—" }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted mb-1">{label}</span>
      <select
        className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink"
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">{placeholder}</option>
        {Object.entries(options).map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
      </select>
    </label>
  );
}

function TextField({ label, value, onSave, placeholder }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted mb-1">{label}</span>
      <input
        className="w-full rounded-lg border border-hairline px-3 py-2 text-sm bg-page text-ink"
        defaultValue={value || ""}
        placeholder={placeholder || ""}
        onBlur={(e) => { const v = e.target.value.trim(); if (v !== (value || "")) onSave(v || null); }}
      />
    </label>
  );
}

export default function QualificationDropdowns({ lead, patch, showPostalAddress = true }) {
  const [signals, setSignals] = useState([]);

  async function reloadSignals() {
    const { ok, data } = await apiFetch(`/api/sales/leads/${lead.id}/signals`);
    if (ok) setSignals(data?.signals || []);
  }
  useEffect(() => { let live = true; apiFetch(`/api/sales/leads/${lead.id}/signals`).then(({ ok, data }) => { if (live && ok) setSignals(data?.signals || []); }); return () => { live = false; }; }, [lead.id]);

  const signalOf = (kind) => signals.find((s) => s.kind === kind);
  async function upsertSignal(kind, label) {
    const existing = signalOf(kind);
    if (!label) {
      if (existing) await apiDelete(`/api/sales/leads/${lead.id}/signals/${existing.id}`);
    } else if (existing) {
      await apiPatch(`/api/sales/leads/${lead.id}/signals/${existing.id}`, { label });
    } else {
      await apiPost(`/api/sales/leads/${lead.id}/signals`, { kind, label });
    }
    await reloadSignals();
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <h3 className="section-label mb-3">Client details</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="Do they own the site?" value={lead.land_status} options={LEAD_LAND_STATUS_LABELS} onChange={(v) => patch({ land_status: v })} />
        <Select label="Documents on hand" value={lead.documents_on_hand} options={LEAD_DOCUMENTS_ON_HAND_LABELS} onChange={(v) => patch({ documents_on_hand: v })} />
        <Select label="Finance" value={lead.finance_status} options={LEAD_FINANCE_STATUS_LABELS} onChange={(v) => patch({ finance_status: v })} />
        <TextField label="Partner / other decision-maker" value={lead.partner_name} onSave={(v) => patch({ partner_name: v })} placeholder="e.g. Jess" />
        <Select label="What matters most in a builder" value={signalOf("priority")?.label} options={LEAD_PRIORITY_LABELS} onChange={(v) => upsertSignal("priority", v)} />
        <Select label="Biggest worry about building" value={signalOf("fear")?.label} options={LEAD_CONCERN_LABELS} onChange={(v) => upsertSignal("fear", v)} />
      </div>
      {showPostalAddress && (
        <div className="mt-3">
          <TextField label="Client postal address (for agreements)" value={lead.client_postal_address} onSave={(v) => patch({ client_postal_address: v })} placeholder="PO Box / street address" />
        </div>
      )}
    </div>
  );
}
