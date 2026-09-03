/**
 * ConsultantsStage — the Consultants-stage control panel. Coordinates the design professionals
 * (architect, surveyor, soil, engineer, NatHERS, interior, lighting, sanitary — NOT the certifier,
 * which lives in Won), tracks each one's deliverables through a status machine, and routes every
 * finished document to one of two sinks: the Building Consent pack or the Fixed-Price Proposal.
 * CV-2 adds the advisory dependency schedule (a deliverable "waits" while an upstream one it needs
 * isn't received yet — never a hard block) and re-issue propagation (marking an upstream doc changed
 * flags every downstream done doc for re-issue). Also carries the provisional F&F schedule + the
 * council/certifier approval risk (advisory) + the exit-gate flags.
 */
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/apiFetch.js";
import {
  CONSULTANT_ROLES, CONSULTANT_ROLE_ORDER, CONSULTANT_CLIENT_FACING,
  CONSULTANT_DELIVERABLES, DELIVERABLE_STATUS, DELIVERABLE_STATUS_ORDER,
  DELIVERABLE_STATUS_COLORS, DELIVERABLE_FEEDS_LABELS, DELIVERABLE_DEPENDENCIES,
} from "../../../lib/constants.js";
import ConsentSpine from "./ConsentSpine.jsx";
import ConsultantComms from "./ConsultantComms.jsx";
import PreconstructionPortalCard from "./PreconstructionPortalCard.jsx";
import MeetingScheduler from "./MeetingScheduler.jsx";

const seedDeliverables = (role) => (CONSULTANT_DELIVERABLES[role] || []).map((d) => ({ key: d.key, status: "pending" }));
const deliverableMeta = (role, key) => (CONSULTANT_DELIVERABLES[role] || []).find((d) => d.key === key) || { label: key, feeds: "none" };
const nextStatus = (s) => DELIVERABLE_STATUS_ORDER[(DELIVERABLE_STATUS_ORDER.indexOf(s) + 1) % DELIVERABLE_STATUS_ORDER.length];
const isDoneStatus = (s) => s === "received" || s === "issued";
// Global key → label lookup (keys are unique across the role templates).
const DELIVERABLE_LABELS = {};
Object.values(CONSULTANT_DELIVERABLES).flat().forEach((d) => { DELIVERABLE_LABELS[d.key] = d.label; });

export default function ConsultantsStage({ lead, patch, reload }) {
  const [contacts, setContacts] = useState([]);
  const [roster, setRoster] = useState(Array.isArray(lead.consultant_roster) ? lead.consultant_roster : []);
  const [ff, setFf] = useState(Array.isArray(lead.selections_schedule) ? lead.selections_schedule : []);
  const [comms, setComms] = useState([]);

  useEffect(() => { apiFetch("/api/sales/consultants").then(({ ok, data }) => { if (ok) setContacts(data?.consultants || []); }); }, []);
  // CV-3a: the consultant-comms thread (every client↔consultant message, logged in the Hub).
  const loadComms = () => apiFetch(`/api/sales/leads/${lead.id}/consultant-comms`).then(({ ok, data }) => { if (ok) setComms(data?.messages || []); });
  useEffect(() => { loadComms(); }, [lead.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const delsOf = (r) => (r.deliverables && r.deliverables.length ? r.deliverables : seedDeliverables(r.role));

  // ── Dependency state: a flat map of every deliverable currently on the roster ──────────────
  const rosterDeliverables = {};
  roster.forEach((r) => delsOf(r).forEach((d) => { rosterDeliverables[d.key] = { status: d.status || "pending", reissue: !!d.reissue }; }));
  const rosterKeys = new Set(Object.keys(rosterDeliverables));
  const waitingOn = (key) => (DELIVERABLE_DEPENDENCIES[key] || []).filter((up) => rosterKeys.has(up) && !isDoneStatus(rosterDeliverables[up]?.status));
  function transitiveDownstream(changedKey) {
    const out = new Set(); const queue = [changedKey];
    while (queue.length) {
      const cur = queue.shift();
      for (const k of rosterKeys) {
        if ((DELIVERABLE_DEPENDENCIES[k] || []).includes(cur) && !out.has(k)) { out.add(k); queue.push(k); }
      }
    }
    return out;
  }
  const allDelStates = Object.values(rosterDeliverables);
  const doneCount = allDelStates.filter((d) => isDoneStatus(d.status)).length;
  const blockedCount = Object.keys(rosterDeliverables).filter((k) => waitingOn(k).length).length;
  const reissueCount = allDelStates.filter((d) => d.reissue).length;
  // Exit-gate signal (CW-2): every consultant on the roster has all deliverables received/issued.
  const docsReady = roster.length > 0 && roster.every((r) => delsOf(r).every((d) => isDoneStatus(d.status || "pending")));

  // ── Consultant roster + deliverables ──────────────────────────────────────
  function saveRoster(next) { setRoster(next); patch({ consultant_roster: next }); }
  const addConsultant = () => saveRoster([...roster, { role: "architect", contactId: "", briefIssuedAt: null, returnedAt: null, notes: "", deliverables: seedDeliverables("architect") }]);
  const editConsultant = (i, k, v) => saveRoster(roster.map((r, ix) => (ix === i ? { ...r, [k]: v } : r)));
  const changeRole = (i, role) => saveRoster(roster.map((r, ix) => (ix === i ? { ...r, role, deliverables: seedDeliverables(role) } : r)));
  const delConsultant = (i) => saveRoster(roster.filter((_, ix) => ix !== i));
  const toggleStamp = (i, k) => editConsultant(i, k, roster[i][k] ? null : new Date().toISOString());
  // Advancing a deliverable clears its own re-issue flag (it's been re-done / re-checked).
  const cycleDeliverable = (i, key) => saveRoster(roster.map((r, ix) => (ix !== i ? r
    : { ...r, deliverables: delsOf(r).map((d) => (d.key === key ? { ...d, status: nextStatus(d.status || "pending"), reissue: false } : d)) })));
  // Mark an upstream doc changed → flag every downstream done doc for re-issue.
  const markChanged = (changedKey) => {
    const downstream = transitiveDownstream(changedKey);
    saveRoster(roster.map((r) => ({ ...r, deliverables: delsOf(r).map((d) => (downstream.has(d.key) && isDoneStatus(d.status || "pending") ? { ...d, reissue: true } : d)) })));
  };
  const contactLabel = (c) => `${[c.firstName, c.lastName].filter(Boolean).join(" ")}${c.company ? ` — ${c.company}` : ""}`;

  // ── Provisional F&F schedule (schedule thread v2) ─────────────────────────
  function saveFf(next) { setFf(next); patch({ selections_schedule: next }); }
  const addFf = () => saveFf([...ff, { area: "", item: "", supplier: "", notes: "" }]);
  const editFf = (i, k, v) => saveFf(ff.map((r, ix) => (ix === i ? { ...r, [k]: v } : r)));
  const delFf = (i) => saveFf(ff.filter((_, ix) => ix !== i));

  return (
    <div className="space-y-4">
      {/* CV-3b — induct the client into the portal early (their home for the design team + comms) */}
      <PreconstructionPortalCard lead={lead} />

      {/* Consultant roster + deliverables */}
      <div className="rounded-card border border-hairline bg-surface p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="section-label">Consultants &amp; deliverables</h3>
          <button type="button" onClick={addConsultant} className="text-xs font-semibold text-primary hover:underline">+ Add consultant</button>
        </div>
        {rosterKeys.size > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 text-[11px]">
            <span className="text-muted">{rosterKeys.size} deliverables</span>
            <span className="text-green-700">{doneCount} done</span>
            {blockedCount > 0 && <span className="text-amber-700">{blockedCount} waiting</span>}
            {reissueCount > 0 && <span className="text-red-600 font-semibold">{reissueCount} re-issue</span>}
          </div>
        )}
        {roster.length === 0 ? (
          <p className="text-xs text-muted">Add each professional — the Hub seeds their expected documents, routes each to the Consent pack or the Proposal, and shows what&rsquo;s waiting on an upstream doc.</p>
        ) : (
          <div className="space-y-2.5">
            {roster.map((r, i) => {
              const dels = delsOf(r);
              const clientFacing = CONSULTANT_CLIENT_FACING.includes(r.role);
              return (
                <div key={i} className="rounded-lg border border-hairline bg-page p-2.5">
                  <div className="flex gap-1.5 mb-1.5 items-center">
                    <select value={r.role || "other"} onChange={(e) => changeRole(i, e.target.value)} className="w-40 rounded-lg border border-hairline px-2 py-1 text-xs bg-surface">
                      {CONSULTANT_ROLE_ORDER.map((role) => <option key={role} value={role}>{CONSULTANT_ROLES[role]}</option>)}
                    </select>
                    <select value={r.contactId || ""} onChange={(e) => editConsultant(i, "contactId", e.target.value)} className="flex-1 rounded-lg border border-hairline px-2 py-1 text-xs bg-surface">
                      <option value="">— select contact —</option>
                      {contacts.map((c) => <option key={c.id} value={c.id}>{contactLabel(c)}</option>)}
                    </select>
                    {clientFacing
                      ? <span className="shrink-0 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-semibold">Client-facing</span>
                      : <span className="shrink-0 rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 text-[10px] font-semibold">Internal</span>}
                    <button type="button" onClick={() => delConsultant(i)} className="px-1.5 text-xs text-red-500 hover:text-red-700">×</button>
                  </div>
                  {/* Deliverables checklist */}
                  {dels.length > 0 && (
                    <div className="space-y-1 mb-1.5 pl-0.5">
                      {dels.map((d) => {
                        const meta = deliverableMeta(r.role, d.key);
                        const st = d.status || "pending";
                        const waiting = waitingOn(d.key);
                        return (
                          <div key={d.key} className="flex items-center gap-2 flex-wrap">
                            <button type="button" onClick={() => cycleDeliverable(i, d.key)}
                              className={`shrink-0 w-[74px] text-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${DELIVERABLE_STATUS_COLORS[st]}`}>
                              {DELIVERABLE_STATUS[st]}
                            </button>
                            <span className="text-[11px] text-ink">{meta.label}</span>
                            {meta.feeds && meta.feeds !== "none" && (
                              <span className="text-[10px] text-muted">{DELIVERABLE_FEEDS_LABELS[meta.feeds]}</span>
                            )}
                            {waiting.length > 0 && !isDoneStatus(st) && (
                              <span className="text-[10px] text-amber-700">⏳ waiting: {waiting.map((k) => DELIVERABLE_LABELS[k] || k).join(", ")}</span>
                            )}
                            {d.reissue && <span className="text-[10px] font-semibold text-red-600">⟳ re-issue required</span>}
                            {isDoneStatus(st) && (
                              <button type="button" onClick={() => markChanged(d.key)} title="Mark this document changed — flags downstream docs for re-issue"
                                className="text-[10px] text-muted hover:text-red-600 underline underline-offset-2">changed?</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <button type="button" onClick={() => toggleStamp(i, "briefIssuedAt")}
                      className={`text-[11px] font-medium ${r.briefIssuedAt ? "text-green-700" : "text-muted hover:text-ink"}`}>
                      {r.briefIssuedAt ? "✓ Brief issued" : "○ Brief issued"}
                    </button>
                    <button type="button" onClick={() => toggleStamp(i, "returnedAt")}
                      className={`text-[11px] font-medium ${r.returnedAt ? "text-green-700" : "text-muted hover:text-ink"}`}>
                      {r.returnedAt ? "✓ All returned" : "○ All returned"}
                    </button>
                    <input value={r.notes || ""} onChange={(e) => editConsultant(i, "notes", e.target.value)} placeholder="Notes" className="flex-1 min-w-[8rem] rounded-lg border border-hairline px-2 py-1 text-[11px] bg-surface" />
                  </div>
                  {/* CV-3a — per-consultant comms thread (Hub is the source of truth; BL brokers the client) */}
                  <ConsultantComms leadId={lead.id} role={r.role} contactId={r.contactId}
                    messages={comms.filter((m) => m.consultantRole === r.role)} onChange={loadComms} />
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[10px] text-muted">Click a status pill to advance it (pending → requested → received → issued). Everyone starts at once — <span className="text-amber-700">waiting</span> is advisory, not a block.</p>
        {contacts.length === 0 && <p className="mt-1 text-[11px] text-muted">No consultant contacts yet — add engineers/suppliers in the CRM.</p>}
      </div>

      {/* Planning Consent — lodged here (pre-contract), while Building Consent + DA wait for Won */}
      <ConsentSpine lead={lead} scope="planning" />

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

      {/* Exit → Tender: documents in · proposal generated · final presentation booked */}
      <div className="rounded-card border border-hairline bg-surface p-4 space-y-2">
        <h3 className="section-label mb-1">Ready for tender</h3>
        <ul className="space-y-1 text-sm">
          <li className={`flex items-center gap-2 ${docsReady ? "text-green-700" : "text-muted"}`}>
            <span>{docsReady ? "✓" : "○"}</span> Full consultant document set received / issued
          </li>
          <li className={`flex items-center gap-2 ${lead.fee_proposal_id ? "text-green-700" : "text-muted"}`}>
            <span>{lead.fee_proposal_id ? "✓" : "○"}</span> Fixed-Price proposal generated
          </li>
          <li className="flex items-center gap-2 text-muted"><span>○</span> Final presentation booked (below)</li>
        </ul>
        <p className="text-[11px] text-muted">Certification &amp; approval risk aren&rsquo;t here — they&rsquo;re lodged/tracked later in Won.</p>
      </div>

      {/* Final presentation — booked here, before advancing to Tender */}
      <MeetingScheduler lead={lead} meetingType="proposal_presentation" reload={reload} />
    </div>
  );
}
