/**
 * TenderStage — the Tender-stage control panel. Turns Tender from a dumping ground into a tracked
 * pipeline-within-a-stage:
 *   • Sub-status strip (pack prep → RFQs → pricing → estimate → proposal → presented → reviewing →
 *     contract prep/sent/signed) — clickable; set as the work moves.
 *   • Estimate & Fixed-Price Proposal (first-class): RFQ Engine entry + Create Fee Proposal +
 *     specifications/allowances (schedule thread v3, over selections_schedule).
 *   • Blue Leaf Proposal Checklist — client-facing QC; a proposal <80% complete is flagged
 *     "not ready to present". (Client-facing → Blue Leaf branded, never "APB".)
 *   • The proposal presentation meeting. The named client emails are in Client correspondence.
 *   • Building-contract capture: prepared → sent, then signed by uploading the signed PDF (feeds the Won gate).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  TENDER_SUBSTATUS, TENDER_SUBSTATUS_ORDER, CONTRACT_STATUS, CONTRACT_STATUS_ORDER,
  PROPOSAL_CHECKLIST_ITEMS, PROPOSAL_READY_THRESHOLD,
} from "../../../lib/constants.js";
import { apiFetch, apiPost } from "../../../lib/apiFetch.js";
import { RFQ_START_TARGET, PROPOSAL_PRESENTATION_TARGET, currentTenderStep } from "../../../lib/leadNextAction.js";
import MeetingScheduler from "./MeetingScheduler.jsx";
import ScheduleProgramme from "./ScheduleProgramme.jsx";
import RegisterWorkshop from "./register/RegisterWorkshop.jsx";

const todayISO = () => new Date().toISOString().slice(0, 10);

const readAsBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (ev) => resolve(String(ev.target.result).split(",")[1]);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

/**
 * Building contract: Prepared and Sent are simple statuses; "signed" only ever comes from uploading the
 * client-signed PDF (POST …/contract/mark-signed). A lead marked signed before this rule existed shows the
 * same upload, because it needs the file before it can move to Won.
 */
export function BuildingContract({ lead, patch, reload, isAdmin }) {
  const signed = lead.contract_status === "signed";
  const hasEvidence = lead.contract_evidence_present === true;
  const [file, setFile] = useState(null);
  const [signedDate, setSignedDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [evidence, setEvidence] = useState(null);
  const [contractRef, setContractRef] = useState("");
  const [checked, setChecked] = useState(false);
  const clientName = lead.name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "this client";

  useEffect(() => {
    if (!hasEvidence) { setEvidence(null); return undefined; }
    let cancelled = false;
    apiFetch(`/api/sales/leads/${lead.id}/documents`).then(({ ok, data }) => {
      if (!cancelled && ok) setEvidence((data.documents || []).find((d) => d.document_type === "construction_contract") || null);
    });
    return () => { cancelled = true; };
  }, [lead.id, hasEvidence, lead.contract_signed_date]);

  function setStatus(status) {
    const updates = { contract_status: status };
    if (status === "sent" && !lead.contract_sent_date) updates.contract_sent_date = todayISO();
    patch(updates);
  }

  async function upload() {
    if (!file) { setError("Choose the signed PDF first."); return; }
    setBusy(true); setError("");
    try {
      const signedPdfBase64 = await readAsBase64(file);
      const { ok, error: uploadError } = await apiPost(`/api/sales/leads/${lead.id}/contract/mark-signed`, {
        signedPdfBase64, filename: file.name, signedDate: signedDate || undefined, executedConfirmed: true, contractRef: contractRef.trim(),
      });
      if (!ok) { setError(uploadError || "Couldn't save the signed contract."); return; }
      setFile(null); setSignedDate(""); setContractRef(""); setChecked(false);
      await reload();
    } catch (e) {
      setError(e?.message || "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  }

  async function undoSigned() {
    if (!window.confirm("Take this contract out of Signed? The status goes back to Sent and the change is logged. The PDF stays in Documents.")) return;
    const saved = await patch({ contract_status: "sent" });
    if (!saved) setError("Couldn't change the contract status.");
  }

  const statuses = CONTRACT_STATUS_ORDER.filter((s) => s !== "signed");
  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <h3 className="section-label mb-2">Building contract</h3>

      {signed && hasEvidence && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
          <p className="text-sm font-semibold text-green-700">✓ Signed{lead.contract_signed_date ? ` ${lead.contract_signed_date}` : ""}</p>
          {evidence?.review_notes && <p className="mt-0.5 text-[11px] text-green-800" data-testid="contract-check-record">{evidence.review_notes}</p>}
          {evidence?.download_url
            ? <a href={evidence.download_url} target="_blank" rel="noreferrer" className="mt-0.5 block break-all text-xs font-medium text-primary hover:underline">{evidence.filename}</a>
            : <p className="mt-0.5 text-xs text-muted">Signed PDF on file</p>}
        </div>
      )}

      {signed && !hasEvidence && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Marked signed{lead.contract_signed_date ? ` ${lead.contract_signed_date}` : ""}, but the signed PDF isn&rsquo;t on file. Upload it to move this lead to Won.
        </p>
      )}

      {!signed && (
        <>
          <div className="mb-2 flex flex-wrap gap-2">
            {statuses.map((s) => {
              const on = lead.contract_status === s;
              const done = statuses.indexOf(lead.contract_status) > statuses.indexOf(s);
              return (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${on ? "bg-primary text-white" : done ? "bg-green-100 text-green-700" : "border border-hairline text-ink hover:bg-page"}`}>
                  {done ? "✓ " : ""}{CONTRACT_STATUS[s]}
                </button>
              );
            })}
          </div>
          {lead.contract_sent_date && <p className="mb-2 text-[11px] text-muted">Sent {lead.contract_sent_date}</p>}
        </>
      )}

      {!(signed && hasEvidence) && (
        <div data-next-target="contract_status" className="mt-2 rounded-lg border border-hairline bg-page/60 p-3 transition-shadow">
          <p className="mb-2 text-xs text-muted">
            {signed ? "Upload the client-signed PDF." : "When the client has signed, upload the PDF. That marks the contract signed. It's required to move to Won."}
          </p>
          <input type="file" data-next-focus accept="application/pdf,.pdf" aria-label="Signed building contract PDF"
            onChange={(e) => { setFile(e.target.files?.[0] || null); setError(""); setChecked(false); }}
            className="mb-2 block w-full text-xs text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink" />
          {(!signed || !lead.contract_signed_date) && (
            <label className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
              <span>Date signed <span className="font-normal">(optional)</span></span>
              <input type="date" value={signedDate} onChange={(e) => setSignedDate(e.target.value)} className="rounded border border-hairline bg-surface px-2 py-1 text-xs text-ink" />
            </label>
          )}
          {file && (
            <div className="mb-2 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900" data-testid="contract-verify">
              <p>The Hub can tell this is a PDF. It can&apos;t tell whose contract it is, so please check it before marking it signed.</p>
              <label className="block">
                <span className="mb-0.5 block font-medium">Contract reference or revision</span>
                <input value={contractRef} onChange={(e) => setContractRef(e.target.value)} placeholder="e.g. HIA 2026 Rev B" className="w-full rounded border border-hairline bg-surface px-2 py-1.5 text-xs text-ink" data-testid="contract-ref" />
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" data-testid="contract-confirm" />
                <span>This is the fully signed building contract for <b>{clientName}</b>{lead.site_address ? <> at <b>{lead.site_address}</b></> : null}. My name goes on the record.</span>
              </label>
            </div>
          )}
          <button type="button" onClick={upload} disabled={busy || !file || !checked || !contractRef.trim()}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? "Saving…" : signed ? "Attach signed PDF" : "✓ Mark contract as signed"}
          </button>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-xs font-medium text-danger">{error}</p>}
      {signed && isAdmin && (
        <button type="button" onClick={undoSigned} className="mt-2 text-[11px] font-medium text-muted hover:text-ink">Undo signed status</button>
      )}
    </div>
  );
}

/** Where the tender is up to. Staff set every step except the last, which only the signed PDF can set. */
export function TenderProgress({ lead, onSet }) {
  const signed = lead.contract_status === "signed";
  const current = currentTenderStep(lead);
  const currentIdx = current ? TENDER_SUBSTATUS_ORDER.indexOf(current) : -1;
  return (
    <div className="rounded-card border border-hairline bg-surface p-4">
      <h3 className="section-label mb-2">Tender progress</h3>
      <div className="flex flex-wrap gap-1.5">
        {TENDER_SUBSTATUS_ORDER.map((s, i) => {
          const on = current === s;
          const done = currentIdx >= 0 && i < currentIdx;
          const tone = on ? "bg-primary text-white" : done ? "bg-green-100 text-green-700" : "border border-hairline text-muted";
          const text = `${done ? "✓ " : ""}${TENDER_SUBSTATUS[s]}`;
          if (s === "contract_signed") return <span key={s} className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{text}</span>;
          return (
            <button key={s} type="button" disabled={signed} onClick={() => onSet(s)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition disabled:cursor-default ${tone} ${on || done ? "" : "enabled:hover:bg-page"}`}>
              {text}
            </button>
          );
        })}
      </div>
      {!signed && <p className="mt-2 text-[11px] text-muted">&ldquo;Contract signed&rdquo; ticks itself when the signed PDF is uploaded under Building contract.</p>}
    </div>
  );
}

export default function TenderStage({ lead, patch, reload, onStartRfq, creatingJob, isAdmin = false }) {
  const checklist = lead.proposal_checklist && typeof lead.proposal_checklist === "object" ? lead.proposal_checklist : {};
  const [testimonials, setTestimonials] = useState(checklist._testimonials || "");

  const doneCount = PROPOSAL_CHECKLIST_ITEMS.filter((it) => checklist[it.key]).length;
  const readiness = doneCount / PROPOSAL_CHECKLIST_ITEMS.length;
  const notReady = readiness < PROPOSAL_READY_THRESHOLD;

  function setSub(s) { patch({ tender_substatus: s }); }
  function toggleItem(key) { patch({ proposal_checklist: { ...checklist, [key]: !checklist[key] } }); }
  function saveTestimonials(v) { patch({ proposal_checklist: { ...checklist, _testimonials: v } }); }

  return (
    <div className="space-y-4">
      {/* Sub-status strip */}
      <TenderProgress lead={lead} onSet={setSub} />

      {/* Estimate & Fixed-Price Proposal */}
      <div className="rounded-card border border-primary bg-primary/[0.06] p-4">
        <h3 className="section-label mb-1 text-primary">Estimate &amp; proposal</h3>
        <p className="text-xs text-muted mb-3 leading-relaxed">
          Build the estimate in the RFQ Engine, then generate the client Fixed-Price Proposal from it.
        </p>
        <button type="button" data-next-target={RFQ_START_TARGET} onClick={onStartRfq} disabled={creatingJob || !lead.site_address?.trim()}
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

      {/* Selection register — current scope + decisions for the estimator (read/resolve; no prices created here) */}
      <RegisterWorkshop lead={lead} patch={patch} stage="tender" />

      {/* SC-1 — the construction programme derived from the estimate's SCHED lines + buffers */}
      <ScheduleProgramme lead={lead} />

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
      <div data-next-target={PROPOSAL_PRESENTATION_TARGET} className="rounded-card transition-shadow">
        <MeetingScheduler lead={lead} meetingType="proposal_presentation" reload={reload} />
      </div>

      <BuildingContract lead={lead} patch={patch} reload={reload} isAdmin={isAdmin} />
    </div>
  );
}
