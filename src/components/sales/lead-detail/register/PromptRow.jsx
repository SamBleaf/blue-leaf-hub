/**
 * PromptRow — one register item (or an unstarted prompt from the Tab 21 library). Compact by default,
 * detail behind "More". Answers are optional; "Undecided / N/A / Excluded / By Others" are valid answers.
 *
 * Rules made physical here (the server enforces the same ones):
 *   • client-approved can only be set together with evidence (who / when / how);
 *   • technical "verified" can only be set together with a drawing / consultant reference;
 *   • a project-wide default is inherited by rooms until a room exception is recorded explicitly;
 *   • portal actions on a selection are explicit buttons, never side effects of editing.
 */
import { useState } from "react";
import {
  makeItem, REGISTER_DISPOSITIONS, DISPOSITION_ORDER, REGISTER_CERTAINTY, CERTAINTY_ORDER, RESPONSIBILITIES,
  TECHNICAL_STATUSES, PRICING_STATUSES, SUPPLY_BY, ITEM_KINDS, categoryLabel, itemIssues, outstandingReasons,
} from "../../../../lib/register.js";
import { Chip, Mini, Select } from "./ui.jsx";

const KIND_TONE = { scope: "slate", requirement: "violet", selection: "blue", action: "amber" };
const QUICK = [["na", "N/A"], ["excluded", "Excluded"], ["by_others", "By others"], ["undecided", "Undecided"]];
const APPROVAL_METHODS = [["meeting", "In a meeting"], ["email", "By email"], ["signed", "Signed document"], ["portal_choice", "Client portal choice"]];
const dispOptions = DISPOSITION_ORDER.map((k) => [k, REGISTER_DISPOSITIONS[k]]);
const certOptions = CERTAINTY_ORDER.map((k) => [k, REGISTER_CERTAINTY[k]]);
const reqCertOptions = [["not_considered", "Not discussed"], ["preference", "Client wants"], ["client_approved", "Client-approved"]];

function portalBadge(item) {
  const s = item.sync;
  if (!s || s.table !== "client_selections") return null;
  if (s.locked) return <Chip tone="green" title="Locked — change through a variation">Locked ({s.status})</Chip>;
  if (s.status === "approved") return <Chip tone="green">Approved{s.clientVisible ? " · on portal" : ""}</Chip>;
  if (s.status === "in_review") return <Chip tone="amber">Client chose — review</Chip>;
  if (s.clientVisible) return <Chip tone="blue">On portal · {s.status === "overdue" ? "overdue" : "awaiting client"}</Chip>;
  return <Chip tone="slate" title="Internal — not visible to the client until issued">Staged (internal)</Chip>;
}

export default function PromptRow({
  question, item, seed, onChange, onDelete, inherited, onMakeException, actor, onPortal, readOnlyReason, compact,
}) {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState(null);          // 'approve' | 'verify' | 'portal_approve'
  const [evMethod, setEvMethod] = useState("meeting");
  const [evRef, setEvRef] = useState("");
  const [showText, setShowText] = useState(false);
  const it = item || makeItem(seed);
  const kind = it.itemKind;
  const started = !!item;
  const issues = item ? itemIssues(item) : [];
  const reasons = item ? outstandingReasons(item) : [];
  const set = (partial) => onChange(partial);
  const who = actor?.full_name || actor?.email || "Blue Leaf";
  const today = new Date().toISOString();

  function chooseCertainty(v) {
    if (v === "client_approved" && !(it.evidence?.at && it.evidence?.by)) { setAsk("approve"); setEvMethod("meeting"); setEvRef(""); return; }
    set({ certainty: v, ...(v !== "client_approved" ? { evidence: null } : {}) });
  }
  function chooseTechnical(v) {
    if (v === "verified" && !(it.technicalEvidence?.ref)) { setAsk("verify"); setEvRef(it.source || ""); return; }
    set({ technicalStatus: v, ...(v !== "verified" ? { technicalEvidence: null } : {}) });
  }
  function confirmAsk() {
    if (ask === "approve") set({ certainty: "client_approved", evidence: { at: today, by: who, method: evMethod, ref: evRef.trim() || null } });
    if (ask === "verify") set({ technicalStatus: "verified", technicalEvidence: { at: today, by: who, ref: evRef.trim() } });
    if (ask === "portal_approve") onPortal?.("approve", { at: today, by: who, method: "portal_choice", ref: evRef.trim() || "Client choice via portal" });
    setAsk(null);
  }
  function appendOption(opt) {
    const cur = (it.description || "").trim();
    if (cur.toLowerCase().includes(opt.toLowerCase())) return;
    set({ description: cur ? `${cur}, ${opt}` : opt });
  }

  const title = question?.short || (it.overridesDefaultId ? "Room exception" : "Custom item");
  const locked = !!it.sync?.locked;
  const disabled = !!readOnlyReason;

  return (
    <div className={`rounded-lg border p-2.5 ${started ? "border-hairline bg-page" : "border-dashed border-hairline bg-surface"}`} data-testid={`prompt-${question?.id || it.id}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone={KIND_TONE[kind]}>{ITEM_KINDS[kind]}</Chip>
            <span className="text-xs font-semibold text-ink">{title}</span>
            {question?.id && <span className="text-[10px] text-muted">{question.id}</span>}
            {it.category && !compact && <Chip>{categoryLabel(it.category)}</Chip>}
            {it.overridesDefaultId && <Chip tone="violet">Room exception</Chip>}
            {it.isDefault && <Chip tone="violet">Project default</Chip>}
            {portalBadge(it)}
            {reasons.includes("verification") && <Chip tone="amber">Needs verification</Chip>}
            {it.technicalStatus === "verified" && <Chip tone="green">Verified</Chip>}
            {it.pricingStatus && it.pricingStatus !== "not_reviewed" && <Chip tone="slate">{PRICING_STATUSES[it.pricingStatus]}</Chip>}
          </div>
          {question?.text && (
            <button type="button" onClick={() => setShowText((s) => !s)} className={`mt-0.5 block w-full text-left text-[11px] leading-snug text-muted ${showText ? "" : "line-clamp-1"}`}>
              {question.text}
            </button>
          )}

          {inherited && !item && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded border border-violet-200 bg-violet-50/60 px-2 py-1 text-[11px] text-violet-800">
              <span>Whole-house default: <span className="font-semibold">{inherited.description || inherited.product || "set"}</span></span>
              <button type="button" disabled={disabled} onClick={onMakeException} className="font-semibold text-violet-700 hover:underline disabled:opacity-40">Record a room exception</button>
            </div>
          )}

          {(!inherited || item) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {kind === "scope" && (
                <Select value={it.disposition} onChange={(v) => set({ disposition: v })} options={dispOptions} className="w-36" disabled={disabled || locked} />
              )}
              <input value={it.description} disabled={disabled || locked} onChange={(e) => set({ description: e.target.value })}
                placeholder={kind === "scope" ? "What's being done…" : kind === "requirement" ? "Required outcome…" : kind === "action" ? "Question / follow-up…" : "Direction / product…"}
                className="inp min-w-[10rem] flex-1 text-[11px]" />
              {kind === "selection" && (
                <Select value={it.certainty} onChange={chooseCertainty} options={certOptions} className="w-32" disabled={disabled || locked} />
              )}
              {kind === "requirement" && (
                <Select value={it.certainty} onChange={chooseCertainty} options={reqCertOptions} className="w-32" disabled={disabled} />
              )}
              {kind === "action" && (
                <>
                  <Select value={it.responsibility} onChange={(v) => set({ responsibility: v })} options={Object.entries(RESPONSIBILITIES)} placeholder="owner —" className="w-36" disabled={disabled} />
                  <label className="flex items-center gap-1 text-[11px] text-ink">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={it.resolved} disabled={disabled} onChange={(e) => set({ resolved: e.target.checked })} /> Done
                  </label>
                </>
              )}
            </div>
          )}

          {(!inherited || item) && !disabled && !locked && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {kind !== "action" && QUICK.filter(([k]) => kind !== "requirement" || k === "na" || k === "undecided").map(([k, l]) => (
                <button key={k} type="button" onClick={() => set({ disposition: k })}
                  className={`rounded-full border px-2 py-0.5 text-[10px] ${it.disposition === k && started && k !== "undecided" ? "border-primary bg-primary text-white" : "border-hairline text-muted hover:text-ink"}`}>{l}</button>
              ))}
              {question?.options?.map((o) => (
                <button key={o} type="button" onClick={() => appendOption(o)} className="rounded-full border border-dashed border-hairline px-2 py-0.5 text-[10px] text-ink hover:bg-surface">+ {o}</button>
              ))}
            </div>
          )}

          {ask && (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px]">
              {ask === "approve" && <p className="mb-1 font-semibold text-amber-900">Record the client approval</p>}
              {ask === "verify" && <p className="mb-1 font-semibold text-amber-900">Record what verified it (drawing / consultant document)</p>}
              {ask === "portal_approve" && <p className="mb-1 font-semibold text-amber-900">Approve the client&apos;s portal choice: {it.sync?.clientChoice?.product || it.product}</p>}
              <div className="flex flex-wrap items-center gap-1.5">
                {ask === "approve" && <Select value={evMethod} onChange={setEvMethod} options={APPROVAL_METHODS} className="w-40" />}
                <input value={evRef} onChange={(e) => setEvRef(e.target.value)} className="inp min-w-[12rem] flex-1 text-[11px]"
                  placeholder={ask === "verify" ? "e.g. A301 Rev D detail 4 / engineer letter 12 Nov" : "Reference (meeting, email date, document)…"} />
                <button type="button" disabled={ask === "verify" && !evRef.trim()} onClick={confirmAsk} className="rounded bg-primary px-2 py-1 font-semibold text-white disabled:opacity-40">Confirm</button>
                <button type="button" onClick={() => setAsk(null)} className="rounded border border-hairline px-2 py-1 text-ink">Cancel</button>
              </div>
              <p className="mt-1 text-[10px] text-amber-800">Recorded as {who}, {new Date().toLocaleDateString("en-AU")}. Approval ≠ engineering verification ≠ a fixed price.</p>
            </div>
          )}

          {it.sync?.status === "in_review" && it.sync.clientChoice && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50/70 px-2 py-1 text-[11px] text-amber-900">
              <span>Client chose <span className="font-semibold">{it.sync.clientChoice.product || "an option"}</span>
                {it.sync.clientChoice.costImpact != null && Number(it.sync.clientChoice.costImpact) !== 0 ? ` · cost impact $${Number(it.sync.clientChoice.costImpact).toLocaleString("en-AU")} — variation review` : ""}</span>
              <button type="button" onClick={() => { setAsk("portal_approve"); setEvRef(""); }} className="font-semibold text-primary hover:underline">Approve</button>
              <button type="button" onClick={() => onPortal?.("return")} className="text-ink hover:underline">Return to client</button>
            </div>
          )}

          {issues.length > 0 && <p className="mt-1 text-[10px] text-amber-700">{issues.join(" ")}</p>}
          {readOnlyReason && <p className="mt-1 text-[10px] text-muted">{readOnlyReason}</p>}
          {locked && <p className="mt-1 text-[10px] text-muted">Approved under the contract — product changes go through a variation.</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {(!inherited || item) && <button type="button" onClick={() => setOpen((o) => !o)} className="text-[11px] text-primary hover:underline">{open ? "Less" : "More"}</button>}
          {onDelete && !disabled && <button type="button" onClick={onDelete} title="Remove this item" className="text-xs text-red-500 hover:text-red-700">×</button>}
        </div>
      </div>

      {open && (
        <div className="mt-2 grid grid-cols-1 gap-2 border-t border-hairline pt-2 sm:grid-cols-3">
          {kind === "selection" && <>
            <Mini label="Product"><input value={it.product} disabled={disabled || locked} onChange={(e) => set({ product: e.target.value })} className="inp text-[11px]" /></Mini>
            <Mini label="Manufacturer"><input value={it.manufacturer} disabled={disabled || locked} onChange={(e) => set({ manufacturer: e.target.value })} className="inp text-[11px]" /></Mini>
            <Mini label="Model / code"><input value={it.model} disabled={disabled || locked} onChange={(e) => set({ model: e.target.value })} className="inp text-[11px]" /></Mini>
            <Mini label="Finish / colour"><input value={it.colour} disabled={disabled || locked} onChange={(e) => set({ colour: e.target.value })} className="inp text-[11px]" /></Mini>
            <Mini label="Supplier"><input value={it.supplier} disabled={disabled || locked} onChange={(e) => set({ supplier: e.target.value })} placeholder="e.g. Routleys" className="inp text-[11px]" /></Mini>
            <Mini label="Scope / disposition"><Select value={it.disposition} onChange={(v) => set({ disposition: v })} options={dispOptions} disabled={disabled || locked} /></Mini>
          </>}
          {(kind === "selection" || kind === "scope") && <>
            <Mini label="Quantity (blank = not measured)">
              <div className="flex gap-1">
                <input type="number" step="any" value={it.quantity ?? ""} disabled={disabled || locked} onChange={(e) => set({ quantity: e.target.value === "" ? null : Number(e.target.value) })} className="inp w-20 text-[11px]" />
                <input value={it.unit} disabled={disabled || locked} onChange={(e) => set({ unit: e.target.value })} placeholder="unit" className="inp w-16 text-[11px]" />
              </div>
            </Mini>
            <Mini label="Supplied by"><Select value={it.supplyBy} onChange={(v) => set({ supplyBy: v })} options={Object.entries(SUPPLY_BY)} placeholder="—" disabled={disabled} /></Mini>
          </>}
          {kind !== "action" && (
            <Mini label="Owner (next decision)"><Select value={it.responsibility} onChange={(v) => set({ responsibility: v })} options={Object.entries(RESPONSIBILITIES)} placeholder="—" disabled={disabled} /></Mini>
          )}
          <Mini label="Next action"><input value={it.nextAction} disabled={disabled} onChange={(e) => set({ nextAction: e.target.value, resolved: false })} className="inp text-[11px]" /></Mini>
          <Mini label="Drawing / supplier ref"><input value={it.source} disabled={disabled} onChange={(e) => set({ source: e.target.value })} placeholder="sheet + rev / doc no + rev / meeting" className="inp text-[11px]" /></Mini>
          <Mini label="Technical verification">
            <Select value={it.technicalStatus} onChange={chooseTechnical} options={Object.entries(TECHNICAL_STATUSES)} disabled={disabled} />
            {it.technicalEvidence?.ref && <p className="mt-0.5 text-[10px] text-muted">by {it.technicalEvidence.by} — {it.technicalEvidence.ref}</p>}
          </Mini>
          {kind !== "action" && kind !== "requirement" && (
            <Mini label="Pricing (link — never a price)">
              <Select value={it.pricingStatus} onChange={(v) => set({ pricingStatus: v })} options={Object.entries(PRICING_STATUSES)} disabled={disabled} />
              <input value={it.pricingRef} disabled={disabled} onChange={(e) => set({ pricingRef: e.target.value })} placeholder="estimate line / RFQ / quote ref" className="inp mt-1 text-[11px]" />
            </Mini>
          )}
          <Mini label="Record type">
            <Select value={kind} onChange={(v) => set({ itemKind: v })} options={Object.entries(ITEM_KINDS)} disabled={disabled || locked} title="Scope = work · Requirement = outcome · Selection = product choice · Action = follow-up" />
          </Mini>
          {it.evidence?.at && <p className="text-[10px] text-muted sm:col-span-3">Client approval: {it.evidence.by} · {new Date(it.evidence.at).toLocaleDateString("en-AU")} · {it.evidence.method || ""} {it.evidence.ref ? `— ${it.evidence.ref}` : ""}</p>}
          {it.sync?.table === "client_selections" && onPortal && !disabled && (
            <div className="flex flex-wrap gap-2 sm:col-span-3">
              {!it.sync.clientVisible && !locked && <button type="button" onClick={() => onPortal("issue")} className="rounded border border-primary px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5">Issue to client portal</button>}
              {it.sync.clientVisible && !["approved", "ordered", "installed"].includes(it.sync.status) && <button type="button" onClick={() => onPortal("withdraw")} className="rounded border border-hairline px-2 py-1 text-[11px] text-ink hover:bg-surface">Withdraw from portal</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
