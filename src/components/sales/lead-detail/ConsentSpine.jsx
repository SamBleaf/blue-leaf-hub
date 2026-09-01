/**
 * ConsentSpine — the SA planning/building consent tracker (CW-1). Job-keyed (mig 196), so it appears
 * once the job exists (from PTSA signing). Tracks the three consents in statutory order —
 * Planning Consent → Building Consent → Development Approval — plus the PlanSA application number, a
 * pre-lodgement document checklist (the Building Consent pack), and deep-links to PlanSA (no API —
 * the operator lodges/tracks in the portal). A private certifier grants Building Consent only; no
 * build may start before Development Approval. Building Consent is lodged AFTER design-lock so a
 * later change never forces a re-certification (a PlanSA variation).
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiPut } from "../../../lib/apiFetch.js";
import {
  CONSENT_STATUS, CONSENT_STATUS_ORDER, CONSENT_STATUS_COLORS,
  BUILDING_CONSENT_ROUTE, CONSENT_PRELODGEMENT_ITEMS, PLANSA_LINKS,
} from "../../../lib/constants.js";

function StatusSelect({ value, onChange }) {
  const v = value || "not_started";
  return (
    <select value={v} onChange={(e) => onChange(e.target.value)}
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border-0 cursor-pointer focus:outline-none ${CONSENT_STATUS_COLORS[v]}`}>
      {CONSENT_STATUS_ORDER.map((s) => <option key={s} value={s}>{CONSENT_STATUS[s]}</option>)}
    </select>
  );
}

export default function ConsentSpine({ lead }) {
  const [consent, setConsent] = useState(null);
  const [noJob, setNoJob] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { ok, data } = await apiFetch(`/api/sales/leads/${lead.id}/consent`);
    if (ok) { setConsent(data?.consent || {}); setNoJob(!!data?.noJob); }
    setLoaded(true);
  }, [lead.id]);
  useEffect(() => { load(); }, [load]);

  const save = async (patch) => {
    setConsent((c) => ({ ...(c || {}), ...patch }));   // optimistic
    await apiPut(`/api/sales/leads/${lead.id}/consent`, patch);
  };
  const c = consent || {};
  const checklist = c.prelodgement_checklist && typeof c.prelodgement_checklist === "object" ? c.prelodgement_checklist : {};
  const checklistDone = CONSENT_PRELODGEMENT_ITEMS.filter((it) => checklist[it.key]).length;
  const toggleItem = (key) => save({ prelodgement_checklist: { ...checklist, [key]: !checklist[key] } });

  if (!loaded) return null;
  if (noJob) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-4">
        <h3 className="section-label mb-1">Planning &amp; building consent</h3>
        <p className="text-xs text-muted">Consent tracking starts once the job is created (at PTSA signing).</p>
      </div>
    );
  }

  const dateField = (field) => (
    <input type="date" value={c[field] || ""} onChange={(e) => save({ [field]: e.target.value || null })}
      className="rounded border border-hairline px-2 py-1 text-xs bg-page text-ink focus:outline-none focus:ring-1 focus:ring-primary/40" />
  );
  const refField = (field, ph) => (
    <input defaultValue={c[field] || ""} placeholder={ph} onBlur={(e) => { if ((e.target.value || null) !== (c[field] || null)) save({ [field]: e.target.value || null }); }}
      className="flex-1 min-w-[7rem] rounded-lg border border-hairline px-2 py-1 text-xs bg-page text-ink" />
  );

  return (
    <div className="rounded-card border border-hairline bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="section-label">Planning &amp; building consent (PlanSA)</h3>
        <span className="text-[10px] text-muted">no API — track &amp; lodge in the portal</span>
      </div>

      {/* Deep-links */}
      <div className="flex flex-wrap gap-1.5">
        {Object.values(PLANSA_LINKS).map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noreferrer"
            className="rounded-lg border border-hairline px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-page">{l.label} ↗</a>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted w-28 shrink-0">DAP application #</span>
        {refField("dap_application_number", "PlanSA application / ID number")}
      </div>

      {/* 1 · Planning Consent */}
      <div className="rounded-lg border border-hairline bg-page/60 p-3">
        <div className="flex items-center justify-between mb-1.5">
          <div><span className="text-xs font-semibold text-ink">1 · Planning Consent</span> <span className="text-[10px] text-muted">land use · lodge at Consultants entry, pre-contract</span></div>
          <StatusSelect value={c.planning_consent_status} onChange={(v) => save({ planning_consent_status: v })} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {refField("planning_consent_ref", "Consent reference #")}
          {dateField("planning_consent_lodged_at")}
        </div>
      </div>

      {/* 2 · Building Consent */}
      <div className="rounded-lg border border-hairline bg-page/60 p-3">
        <div className="flex items-center justify-between mb-1.5">
          <div><span className="text-xs font-semibold text-ink">2 · Building Consent</span> <span className="text-[10px] text-muted">Building Rules · lodge in Won, after design-lock</span></div>
          <StatusSelect value={c.building_consent_status} onChange={(v) => save({ building_consent_status: v })} />
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <select value={c.building_consent_route || ""} onChange={(e) => save({ building_consent_route: e.target.value || null })}
            className="rounded-lg border border-hairline px-2 py-1 text-xs bg-page text-ink">
            <option value="">— who grants it —</option>
            {Object.entries(BUILDING_CONSENT_ROUTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {refField("building_consent_ref", "Consent reference #")}
          {dateField("building_consent_lodged_at")}
        </div>
        <p className="text-[10px] text-amber-700">Lodge only once design-lock + tender are settled — a later Building-Rules change forces a PlanSA variation (fee + delay).</p>
      </div>

      {/* 3 · Development Approval */}
      <div className="rounded-lg border border-hairline bg-page/60 p-3">
        <div className="flex items-center justify-between mb-1.5">
          <div><span className="text-xs font-semibold text-ink">3 · Development Approval</span> <span className="text-[10px] text-red-600 font-medium">no build until granted</span></div>
          <StatusSelect value={c.development_approval_status} onChange={(v) => save({ development_approval_status: v })} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {refField("development_approval_number", "DA number")}
          {dateField("development_approval_at")}
        </div>
      </div>

      {/* Pre-lodgement checklist (Building Consent pack) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-ink">Building Consent pack</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${checklistDone === CONSENT_PRELODGEMENT_ITEMS.length ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>
            {checklistDone}/{CONSENT_PRELODGEMENT_ITEMS.length}
          </span>
        </div>
        <div className="space-y-1">
          {CONSENT_PRELODGEMENT_ITEMS.map((it) => (
            <label key={it.key} className="flex items-center gap-2 text-xs text-ink cursor-pointer">
              <input type="checkbox" className="w-3.5 h-3.5 accent-primary" checked={!!checklist[it.key]} onChange={() => toggleItem(it.key)} />
              {it.label}
            </label>
          ))}
        </div>
      </div>

      <textarea rows={2} defaultValue={c.consent_notes || ""} placeholder="Consent notes…"
        onBlur={(e) => { if ((e.target.value || null) !== (c.consent_notes || null)) save({ consent_notes: e.target.value || null }); }}
        className="w-full rounded-lg border border-hairline px-3 py-2 text-xs bg-page text-ink resize-none" />
    </div>
  );
}
