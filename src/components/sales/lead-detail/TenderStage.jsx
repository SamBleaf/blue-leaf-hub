/**
 * TenderStage — the Tender-stage control panel. Turns Tender from a dumping ground into a tracked
 * pipeline-within-a-stage:
 *   • Sub-status strip (pack prep → RFQs → pricing → estimate → proposal → presented → reviewing →
 *     contract prep/sent/signed) — clickable; set as the work moves.
 *   • Estimate & Fixed-Price Proposal (first-class): RFQ Engine entry + Create Fee Proposal +
 *     specifications/allowances (schedule thread v3, over selections_schedule).
 *   • Blue Leaf Proposal Checklist — client-facing QC; a proposal <80% complete is flagged
 *     "not ready to present". (Client-facing → Blue Leaf branded, never "APB".)
 *   • Five named actions: the proposal presentation meeting + four named client emails.
 *   • Building-contract capture: prepared → sent → signed (feeds the Won gate).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  TENDER_SUBSTATUS, TENDER_SUBSTATUS_ORDER, CONTRACT_STATUS, CONTRACT_STATUS_ORDER,
  PROPOSAL_CHECKLIST_ITEMS, PROPOSAL_READY_THRESHOLD,
} from "../../../lib/constants.js";
import MeetingScheduler from "./MeetingScheduler.jsx";
import StageEmailButton from "./StageEmailButton.jsx";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function TenderStage({ lead, patch, reload, onStartRfq, creatingJob }) {
  const sub = lead.tender_substatus || null;
  const subIdx = sub ? TENDER_SUBSTATUS_ORDER.indexOf(sub) : -1;
  const checklist = lead.proposal_checklist && typeof lead.proposal_checklist === "object" ? lead.proposal_checklist : {};
  const [testimonials, setTestimonials] = useState(checklist._testimonials || "");

  const doneCount = PROPOSAL_CHECKLIST_ITEMS.filter((it) => checklist[it.key]).length;
  const readiness = doneCount / PROPOSAL_CHECKLIST_ITEMS.length;
  const notReady = readiness < PROPOSAL_READY_THRESHOLD;

  function setSub(s) { patch({ tender_substatus: s }); }
  function toggleItem(key) { patch({ proposal_checklist: { ...checklist, [key]: !checklist[key] } }); }
  function saveTestimonials(v) { patch({ proposal_checklist: { ...checklist, _testimonials: v } }); }

  function setContract(status) {
    const updates = { contract_status: status };
    if (status === "sent" && !lead.contract_sent_date) updates.contract_sent_date = todayISO();
    if (status === "signed" && !lead.contract_signed_date) updates.contract_signed_date = todayISO();
    patch(updates);
  }

  return (
    <div className="space-y-4">
      {/* Sub-status strip */}
      <div className="rounded-card border border-hairline bg-surface p-4">
        <h3 className="section-label mb-2">Tender progress</h3>
        <div className="flex flex-wrap gap-1.5">
          {TENDER_SUBSTATUS_ORDER.map((s, i) => {
            const on = sub === s;
            const done = subIdx >= 0 && i < subIdx;
            return (
              <button key={s} type="button" onClick={() => setSub(s)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${on ? "bg-primary text-white" : done ? "bg-green-100 text-green-700" : "border border-hairline text-muted hover:bg-page"}`}>
                {done ? "✓ " : ""}{TENDER_SUBSTATUS[s]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Estimate & Fixed-Price Proposal */}
      <div className="rounded-card border border-primary bg-primary/[0.06] p-4">
        <h3 className="section-label mb-1 text-primary">Estimate &amp; proposal</h3>
        <p className="text-xs text-muted mb-3 leading-relaxed">
          Build the estimate in the RFQ Engine, then generate the client Fixed-Price Proposal from it.
        </p>
        <button type="button" onClick={onStartRfq} disabled={creatingJob || !lead.site_address?.trim()}
          className="block w-full text-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-colors disabled:opacity-50">
          {creatingJob ? "Setting up…" : "Proceed to RFQ Engine & Estimate →"}
        </button>
        {!lead.site_address?.trim() && <p className="text-[11px] text-orange-600 text-center mt-2 font-medium">Add site address before starting tender.</p>}
        <Link to="/tender-manager/fee-proposal/new"
          className="mt-2 block w-full text-center rounded-lg border border-primary text-primary px-4 py-2 text-sm font-medium hover:bg-primary hover:text-white transition-colors">
          Create Fixed-Price Proposal →
        </Link>
        <p className="mt-2 text-[11px] text-muted">Specifications, allowances &amp; the specified F&amp;F schedule (from Consultants) feed the proposal.</p>
      </div>

      {/* Blue Leaf Proposal Checklist (client-facing QC) */}
      <div className="rounded-card border border-hairline bg-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="section-label">Blue Leaf Proposal Checklist</h3>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${notReady ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-700"}`}>
            {doneCount}/{PROPOSAL_CHECKLIST_ITEMS.length} · {Math.round(readiness * 100)}%
          </span>
        </div>
        {notReady && (
          <p className="mb-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800">
            ⚠ Under {Math.round(PROPOSAL_READY_THRESHOLD * 100)}% — not ready to present. Complete the proposal before booking the presentation.
          </p>
        )}
        <div className="space-y-1.5">
          {PROPOSAL_CHECKLIST_ITEMS.map((it) => (
            <label key={it.key} className="flex items-center gap-2 text-xs text-ink cursor-pointer">
              <input type="checkbox" className="w-3.5 h-3.5 accent-primary" checked={!!checklist[it.key]} onChange={() => toggleItem(it.key)} />
              {it.label}
            </label>
          ))}
        </div>
        <div className="mt-2">
          <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Testimonials / references to include</label>
          <textarea rows={2} value={testimonials} onChange={(e) => setTestimonials(e.target.value)} onBlur={(e) => { if (e.target.value !== (checklist._testimonials || "")) saveTestimonials(e.target.value); }}
            placeholder="Which past clients / projects to reference in this proposal…" className="w-full rounded-lg border border-hairline px-3 py-2 text-xs bg-page text-ink resize-none" />
        </div>
      </div>

      {/* Proposal presentation meeting */}
      <MeetingScheduler lead={lead} meetingType="proposal_presentation" reload={reload} />

      {/* Named client actions */}
      <div className="rounded-card border border-hairline bg-surface p-4">
        <h3 className="section-label mb-2">Client emails</h3>
        <div className="flex flex-wrap gap-2">
          <StageEmailButton lead={lead} endpoint="tender-email" which="proposal_followup" label="Proposal follow-up (24h)" title="Post-presentation follow-up" reload={reload} onSent={() => { if (subIdx < TENDER_SUBSTATUS_ORDER.indexOf("client_reviewing")) setSub("client_reviewing"); }} />
          <StageEmailButton lead={lead} endpoint="tender-email" which="review_followup" label="Client-review follow-up" title="Client reviewing" reload={reload} />
          <StageEmailButton lead={lead} endpoint="tender-email" which="contract_sent" label="Contract sent" title="Contract on its way" reload={reload} onSent={() => setContract("sent")} />
          <StageEmailButton lead={lead} endpoint="tender-email" which="contract_followup" label="Unsigned-contract follow-up" title="Contract chase" reload={reload} />
        </div>
        <p className="mt-2 text-[11px] text-muted">Each is a distinct action — the copy is editable before it sends. Sending is gated by TENDER_EMAIL_ENABLED (preview always works).</p>
      </div>

      {/* Building contract capture */}
      <div className="rounded-card border border-hairline bg-surface p-4">
        <h3 className="section-label mb-2">Building contract</h3>
        <div className="flex flex-wrap gap-2 mb-2">
          {CONTRACT_STATUS_ORDER.map((s) => {
            const on = lead.contract_status === s;
            const idx = CONTRACT_STATUS_ORDER.indexOf(s);
            const cur = lead.contract_status ? CONTRACT_STATUS_ORDER.indexOf(lead.contract_status) : -1;
            const done = cur >= 0 && idx < cur;
            return (
              <button key={s} type="button" onClick={() => setContract(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${on ? "bg-primary text-white" : done ? "bg-green-100 text-green-700" : "border border-hairline text-ink hover:bg-page"}`}>
                {done ? "✓ " : ""}{CONTRACT_STATUS[s]}
              </button>
            );
          })}
        </div>
        {lead.contract_sent_date && <p className="text-[11px] text-muted">Sent {lead.contract_sent_date}{lead.contract_signed_date ? ` · Signed ${lead.contract_signed_date}` : ""}</p>}
        <p className="mt-1 text-[11px] text-muted">Upload the client-signed contract in the <span className="font-medium text-ink">Documents</span> tab (type &ldquo;Construction contract&rdquo;). A signed contract is required to move to Won.</p>
      </div>
    </div>
  );
}
