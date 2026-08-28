/**
 * ConsultantsStage — the Consultants-stage control panel. Coordinates the engineering / private
 * certification / lighting / sanitary etc. consultants, issues the provisional fittings & fixtures
 * schedule (schedule thread v2 — the same selections_schedule carried from Concept), and tracks the
 * councils/certifier approval risk. The three exit-gate flags (engineering ready · cert pathway
 * confirmed · provisional F&F issued) are set here; approval risk is advisory (never blocks).
 */
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/apiFetch.js";
import { APPROVAL_RISK, APPROVAL_RISK_STEPS, APPROVAL_RISK_COLORS, CONSULTANT_ROLES, CONSULTANT_ROLE_ORDER } from "../../../lib/constants.js";

export default function ConsultantsStage({ lead, patch }) {
  const [contacts, setContacts] = useState([]);
  const [roster, setRoster] = useState(Array.isArray(lead.consultant_roster) ? lead.consultant_roster : []);
  const [ff, setFf] = useState(Array.isArray(lead.selections_schedule) ? lead.selections_schedule : []);

  useEffect(() => { apiFetch("/api/sales/consultants").then(({ ok, data }) => { if (ok) setContacts(data?.consultants || []); }); }, []);

  const risk = lead.approval_risk || "unknown";

  // ── Consultant roster ────────────────────────────────────────────────────
  function saveRoster(next) { setRoster(next); patch({ consultant_roster: next }); }
  const addConsultant = () => saveRoster([...roster, { role: "engineer", contactId: "", briefIssuedAt: null, returnedAt: null, notes: "" }]);
  const editConsultant = (i, k, v) => saveRoster(roster.map((r, ix) => (ix === i ? { ...r, [k]: v } : r)));
  const delConsultant = (i) => saveRoster(roster.filter((_, ix) => ix !== i));
  const toggleStamp = (i, k) => editConsultant(i, k, roster[i][k] ? null : new Date().toISOString());
  const contactLabel = (c) => `${[c.firstName, c.lastName].filter(Boolean).join(" ")}${c.company ? ` — ${c.company}` : ""}`;

  // ── Provisional F&F schedule (v2 of the selections thread) ────────────────
  function saveFf(next) { setFf(next); patch({ selections_schedule: next }); }
  const addFf = () => saveFf([...ff, { area: "", item: "", supplier: "", notes: "" }]);
  const editFf = (i, k, v) => saveFf(ff.map((r, ix) => (ix === i ? { ...r, [k]: v } : r)));
  const delFf = (i) => saveFf(ff.filter((_, ix) => ix !== i));

  return (
    <div className="space-y-4">
      {/* Approval risk (advisory chip) */}
      <div className="rounded-card border border-hairline bg-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="section-label">Council / certifier approval risk</h3>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${APPROVAL_RISK_COLORS[risk]}`}>{APPROVAL_RISK[risk]}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {APPROVAL_RISK_STEPS.map((r) => (
            <button key={r} type="button" onClick={() => patch({ approval_risk: r })}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${risk === r ? "bg-primary text-white" : "border border-hairline text-ink hover:bg-page"}`}>
              {APPROVAL_RISK[r]}
            </button>
          ))}
        </div>
        {risk === "high" && <p className="mt-2 text-[11px] text-red-600">High approval risk — flag it in the proposal and manage the client&rsquo;s expectations on timing.</p>}
      </div>

      {/* Consultant roster */}
      <div className="rounded-card border border-hairline bg-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="section-label">Consultants</h3>
          <button type="button" onClick={addConsultant} className="text-xs font-semibold text-primary hover:underline">+ Add consultant</button>
        </div>
        {roster.length === 0 ? (
          <p className="text-xs text-muted">Add the engineer, certifier, lighting &amp; sanitary consultants — track the brief out and the response back.</p>
        ) : (
          <div className="space-y-2.5">
            {roster.map((r, i) => (
              <div key={i} className="rounded-lg border border-hairline bg-page p-2.5">
                <div className="flex gap-1.5 mb-1.5">
                  <select value={r.role || "other"} onChange={(e) => editConsultant(i, "role", e.target.value)} className="w-40 rounded-lg border border-hairline px-2 py-1 text-xs bg-surface">
                    {CONSULTANT_ROLE_ORDER.map((role) => <option key={role} value={role}>{CONSULTANT_ROLES[role]}</option>)}
                  </select>
                  <select value={r.contactId || ""} onChange={(e) => editConsultant(i, "contactId", e.target.value)} className="flex-1 rounded-lg border border-hairline px-2 py-1 text-xs bg-surface">
                    <option value="">— select contact —</option>
                    {contacts.map((c) => <option key={c.id} value={c.id}>{contactLabel(c)}</option>)}
                  </select>
                  <button type="button" onClick={() => delConsultant(i)} className="px-1.5 text-xs text-red-500 hover:text-red-700">×</button>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <button type="button" onClick={() => toggleStamp(i, "briefIssuedAt")}
                    className={`text-[11px] font-medium ${r.briefIssuedAt ? "text-green-700" : "text-muted hover:text-ink"}`}>
                    {r.briefIssuedAt ? "✓ Brief issued" : "○ Brief issued"}
                  </button>
                  <button type="button" onClick={() => toggleStamp(i, "returnedAt")}
                    className={`text-[11px] font-medium ${r.returnedAt ? "text-green-700" : "text-muted hover:text-ink"}`}>
                    {r.returnedAt ? "✓ Returned" : "○ Returned"}
                  </button>
                  <input value={r.notes || ""} onChange={(e) => editConsultant(i, "notes", e.target.value)} placeholder="Notes" className="flex-1 min-w-[8rem] rounded-lg border border-hairline px-2 py-1 text-[11px] bg-surface" />
                </div>
              </div>
            ))}
          </div>
        )}
        {contacts.length === 0 && <p className="mt-2 text-[11px] text-muted">No consultant contacts yet — add engineers/suppliers in the CRM.</p>}
      </div>

      {/* Provisional F&F schedule (schedule thread v2) */}
      <div className="rounded-card border border-hairline bg-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="section-label">Provisional fittings &amp; fixtures schedule</h3>
          <button type="button" onClick={addFf} className="text-xs font-semibold text-primary hover:underline">+ Add row</button>
        </div>
        {ff.length === 0 ? (
          <p className="text-xs text-muted">Carries the finishes from Concept. Issue the provisional F&amp;F to suppliers, then tick &ldquo;issued&rdquo; below.</p>
        ) : (
          <div className="space-y-1.5">
            {ff.map((r, i) => (
              <div key={i} className="flex gap-1.5">
                <input value={r.area || ""} onChange={(e) => editFf(i, "area", e.target.value)} placeholder="Area" className="w-24 rounded-lg border border-hairline px-2 py-1 text-xs" />
                <input value={r.item || ""} onChange={(e) => editFf(i, "item", e.target.value)} placeholder="Item" className="flex-1 rounded-lg border border-hairline px-2 py-1 text-xs" />
                <input value={r.supplier || ""} onChange={(e) => editFf(i, "supplier", e.target.value)} placeholder="Supplier" className="w-28 rounded-lg border border-hairline px-2 py-1 text-xs" />
                <button type="button" onClick={() => delFf(i)} className="px-1.5 text-xs text-red-500 hover:text-red-700">×</button>
              </div>
            ))}
          </div>
        )}
        <label className="mt-3 flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="w-4 h-4 accent-primary" checked={!!lead.provisional_ff_issued} onChange={(e) => patch({ provisional_ff_issued: e.target.checked })} />
          Provisional F&amp;F schedule issued to suppliers
        </label>
      </div>

      {/* Exit-gate flags */}
      <div className="rounded-card border border-hairline bg-surface p-4 space-y-2">
        <h3 className="section-label mb-1">Ready for tender</h3>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="w-4 h-4 accent-primary" checked={!!lead.consultants_engineering_ready} onChange={(e) => patch({ consultants_engineering_ready: e.target.checked })} />
          Engineering complete enough for tender
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="w-4 h-4 accent-primary" checked={!!lead.consultants_cert_pathway_confirmed} onChange={(e) => patch({ consultants_cert_pathway_confirmed: e.target.checked })} />
          Certification pathway confirmed
        </label>
        <p className="text-[11px] text-muted">Certification <span className="font-medium">approval</span> isn&rsquo;t required to tender — track it as approval risk above.</p>
      </div>
    </div>
  );
}
