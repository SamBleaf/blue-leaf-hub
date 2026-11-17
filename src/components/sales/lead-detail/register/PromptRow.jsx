/**
 * PromptRow — one register item (or an unstarted prompt from the Tab 21 library). Compact by default,
 * detail behind "More". Answers are optional; "Undecided / N/A / Excluded / By Others" are valid answers.
 *
 * A configured question is answered on its ProgressiveChoiceCard (Tab 27 Gate 2). A custom item, or one with no
 * question behind it, keeps the typed row. RepeatRows draws one row per item for a question that repeats.
 *
 * Rules made physical here (the server enforces the same ones):
 *   • client-approved can only be set together with evidence (who / when / how);
 *   • technical "verified" can only be set together with a drawing / consultant reference;
 *   • a project-wide default is inherited by rooms until a room exception is recorded explicitly;
 *   • portal actions on a selection are explicit buttons, never side effects of editing.
 *
 * Needs action from… (REGISTER_SCREENS_SPEC.md S4): every row carries the ⚑ (NeedsAction.jsx) in its header box. It stays
 * mounted in that one box; once an action is set the box only restyles (under the row on a phone) so its sheet stays open.
 * reg / context come from these props or from <NeedsActionProvider>. actionFlag={false} leaves it off (the Register
 * table's expanded row, whose table row already has one).
 *
 * office: "Product details…" (REGISTER_SCREENS_SPEC.md S3) — the office fields only, for a row whose chips and ⚑ are
 * already on screen (ChoiceRow, the edit drawer): product, manufacturer, model, colour, supplier, client wording, supplied
 * by, client status with its evidence, technical check with its reference, drawing ref, the client portal, and the
 * settle-outs (By others · Excluded · Deferred · Existing to remain). No question code, kind or category chip, help line,
 * record-type or disposition select (those stay in the Register table). Phone inputs are 16 px and 44 px tall.
 *
 * A record in the signed contract (roomScreen.contractFixed: baselined or locked) can't change its content; who, next
 * action, references and the technical check stay open, as the server allows.
 */
import { useRef, useState } from "react";
import {
  makeItem, genId, REGISTER_DISPOSITIONS, DISPOSITION_ORDER, REGISTER_CERTAINTY, CERTAINTY_ORDER, RESPONSIBILITIES,
  TECHNICAL_STATUSES, PRICING_STATUSES, SUPPLY_BY, ITEM_KINDS, categoryLabel, itemIssues, outstandingReasons,
  questionById, resolvePromptId, configForRow, isGuidedConfig, answerIsEditable, dispositionApplies, answerSummary, ANSWER_NATURES, BASELINE_TIERS, OPEN_OPTION_IDS, assumptionIsDraft,
  promptWording, settleOptions, settlePatch,
} from "../../../../lib/register.js";
import { contractFixed } from "../../../../lib/roomScreen.js";
import { Chip, Mini, Select } from "./ui.jsx";
import ProgressiveChoiceCard from "./ProgressiveChoiceCard.jsx";
import { NeedsActionFlag } from "./NeedsAction.jsx";
import { flagState } from "../../../../lib/needsAction.js";

// The dense office inputs: 16 px on a phone (iOS doesn't zoom), 11 px from 640 px up. The input's own size wins over .inp.
const DENSE = "text-[16px] sm:text-[11px]";
// Product details (office mode): 44 px on a phone, a little roomier than the dense table.
const OFFICE_INPUT = "inp min-h-[44px] w-full px-3 text-[16px] sm:min-h-[36px] sm:text-sm";
const officeChip = (on) => `focus-ring inline-flex min-h-[44px] items-center rounded-full border px-3.5 text-[15px] sm:min-h-[40px] sm:text-sm disabled:cursor-not-allowed disabled:opacity-50 ${on ? "border-primary bg-primary font-bold text-white" : "border-hairline bg-surface text-ink hover:bg-page"}`;

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
  question: questionProp, item, seed, onChange, onDelete, actor, onPortal, readOnlyReason, compact, saveState, rowTitle, fixedZone, usedZones, assumptionOf, meeting, areaOptions, coveredQuestions,
  reg, context, actionFlag = true, office = false,
}) {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState(null);          // 'approve' | 'verify' | 'portal_approve'
  const [evMethod, setEvMethod] = useState("meeting");
  const [evRef, setEvRef] = useState("");
  const [showText, setShowText] = useState(false);
  const it = item || makeItem(seed);
  const question = questionProp || questionById(resolvePromptId(it.promptKey));   // the office table opens rows by item
  const config = configForRow(question?.id, it);
  const qid = config?.linkedKey ? `${question.id}-${config.linkedKey}` : question?.id || it.id;
  const assumed = assumptionOf?.(it);
  const guided = isGuidedConfig(config) && answerIsEditable(it.answer);
  const noteOnly = config?.handling === "note";
  const usesDisposition = dispositionApplies(config);
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

  // On a room screen whose other prompts cover some options, the wording follows the buttons that are left.
  const wording = guided ? promptWording(question, config, it.answer, coveredQuestions) : { short: question?.short, text: question?.text };
  const title = rowTitle || config?.linkedLabel || wording.short || (it.overridesDefaultId ? "Room exception" : "Custom item");
  const locked = contractFixed(it);   // content fields only: who, next action, refs and checks stay editable
  const lockedWords = it.sync?.locked ? "Approved under the contract — product changes go through a variation." : "Part of the signed contract — change it through a variation.";
  const disabled = !!readOnlyReason;
  // The ⚑: in the header box while nothing is set; once set, the same box drops under the row on a phone for the pill.
  const flagSet = actionFlag && ["set", "done"].includes(flagState(item || null));

  // Shared by both modes: the approval / verification ask, and the client portal's review and issue controls.
  const askPanel = ask && (
    <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px]">
      {ask === "approve" && <p className="mb-1 font-semibold text-amber-900">Record the client approval</p>}
      {ask === "verify" && <p className="mb-1 font-semibold text-amber-900">Record what verified it (drawing / consultant document)</p>}
      {ask === "portal_approve" && <p className="mb-1 font-semibold text-amber-900">Approve the client&apos;s portal choice: {it.sync?.clientChoice?.product || it.product}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {ask === "approve" && <Select value={evMethod} onChange={setEvMethod} options={APPROVAL_METHODS} className="w-40" />}
        <input value={evRef} onChange={(e) => setEvRef(e.target.value)} className={`inp min-w-[12rem] flex-1 ${DENSE}`} aria-label="Reference"
          placeholder={ask === "verify" ? "e.g. A301 Rev D detail 4 / engineer letter 12 Nov" : "Reference (meeting, email date, document)…"} />
        <button type="button" disabled={ask === "verify" && !evRef.trim()} onClick={confirmAsk} className="min-h-[44px] rounded bg-primary px-3 font-semibold text-white disabled:opacity-40 sm:min-h-0 sm:px-2 sm:py-1">Confirm</button>
        <button type="button" onClick={() => setAsk(null)} className="min-h-[44px] rounded border border-hairline px-3 text-ink sm:min-h-0 sm:px-2 sm:py-1">Cancel</button>
      </div>
      <p className="mt-1 text-[10px] text-amber-800">Recorded as {who}, {new Date().toLocaleDateString("en-AU")}. Approval ≠ engineering verification ≠ a fixed price.</p>
    </div>
  );
  const portalReview = (
    <>
      {it.sync?.status === "in_review" && it.sync.clientChoice && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50/70 px-2 py-1 text-[11px] text-amber-900">
          <span>Client chose <span className="font-semibold">{it.sync.clientChoice.product || "an option"}</span>
            {it.sync.clientChoice.costImpact != null && Number(it.sync.clientChoice.costImpact) !== 0 ? ` · cost impact $${Number(it.sync.clientChoice.costImpact).toLocaleString("en-AU")} — variation review` : ""}</span>
          <button type="button" onClick={() => { setAsk("portal_approve"); setEvRef(""); }} className="font-semibold text-primary hover:underline">Approve</button>
          <button type="button" onClick={() => onPortal?.("return")} className="text-ink hover:underline">Return to client</button>
        </div>
      )}

      {it.sync?.status === "changes_requested" && (
        <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
          <span className="font-semibold">Client requested a change</span>
          {it.sync.changeRequest?.notes ? <> — “{it.sync.changeRequest.notes}”</> : null}
          <p className="mt-0.5 text-[10px] text-amber-800">Resolve it before approving: update the proposed product above, then release it to the client again.</p>
        </div>
      )}
    </>
  );
  const portalButtons = it.sync?.table === "client_selections" && onPortal && !disabled && (
    <div className="flex flex-wrap gap-2 sm:col-span-3">
      {!it.sync.clientVisible && !locked && <button type="button" onClick={() => onPortal("issue")} className="min-h-[44px] rounded border border-primary px-3 text-[11px] font-semibold text-primary hover:bg-primary/5 sm:min-h-0 sm:px-2 sm:py-1">Issue to client portal</button>}
      {it.sync.clientVisible && !["approved", "ordered", "installed"].includes(it.sync.status) && <button type="button" onClick={() => onPortal("withdraw")} className="min-h-[44px] rounded border border-hairline px-3 text-[11px] text-ink hover:bg-surface sm:min-h-0 sm:px-2 sm:py-1">Withdraw from portal</button>}
    </div>
  );

  if (office) {
    const settle = guided && kind !== "action" ? settleOptions(config, { showDetail: true, current: it.disposition }) : [];
    const product = (key, label, placeholder, opts = {}) => (
      <OfficeField label={label}>
        <input value={it[key] || ""} disabled={disabled || (!opts.wording && locked)} onChange={(e) => set({ [key]: e.target.value })} placeholder={placeholder} className={OFFICE_INPUT} />
      </OfficeField>
    );
    const sel = "min-h-[44px] w-full px-3 text-[16px] sm:min-h-[36px] sm:text-sm";
    return (
      <div className="space-y-3" data-testid={`office-${qid}`}>
        {settle.length > 0 && (
          <div role="group" aria-label="Settle it as">
            <p className="mb-1.5 text-xs text-muted">Settle it as</p>
            <div className="flex flex-wrap gap-2">
              {settle.map(([d, label]) => (
                <button key={d} type="button" aria-pressed={it.disposition === d} disabled={disabled || locked} onClick={() => set(settlePatch(it, config, d))}
                  className={officeChip(it.disposition === d)} data-testid={`settle-${qid}-${d}`}>
                  {it.disposition === d && <span aria-hidden="true" className="mr-1">✓</span>}{label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {kind === "selection" && <>
            {product("product", "Product", "")}
            {product("manufacturer", "Manufacturer", "")}
            {product("model", "Model or code", "")}
            {product("colour", "Finish or colour", "")}
            {product("supplier", "Supplier", "e.g. Routleys")}
            {/* What the client reads in the Client Selections Presentation. Wording only, so it stays open after approval. */}
            {product("clientLabel", "What the client reads: name", "e.g. Kitchen mixer", { wording: true })}
            {product("clientDescription", "What the client reads: description", "Plain words, e.g. Pull-down sink mixer, brushed nickel", { wording: true })}
          </>}
          {(kind === "selection" || kind === "scope") && usesDisposition && (
            <OfficeField label="Supplied by"><Select value={it.supplyBy} onChange={(v) => set({ supplyBy: v })} options={Object.entries(SUPPLY_BY)} placeholder="—" disabled={disabled} className={sel} /></OfficeField>
          )}
          {kind === "selection" && <OfficeField label="Client status"><Select value={it.certainty} onChange={chooseCertainty} options={certOptions} disabled={disabled || locked} className={sel} /></OfficeField>}
          {kind === "requirement" && !noteOnly && <OfficeField label="Client status"><Select value={it.certainty} onChange={chooseCertainty} options={reqCertOptions} disabled={disabled} className={sel} /></OfficeField>}
          <OfficeField label="Technical check"><Select value={it.technicalStatus} onChange={chooseTechnical} options={Object.entries(TECHNICAL_STATUSES)} disabled={disabled} className={sel} /></OfficeField>
          <OfficeField label="Drawing or supplier reference">
            <input value={it.source || ""} disabled={disabled} onChange={(e) => set({ source: e.target.value })} placeholder="Sheet and revision, document, or meeting" className={OFFICE_INPUT} />
          </OfficeField>
        </div>
        {it.technicalEvidence?.ref && <p className="text-[13px] text-muted">Checked by {it.technicalEvidence.by}: {it.technicalEvidence.ref}</p>}
        {it.evidence?.at && <p className="text-[13px] text-muted">Client approval: {it.evidence.by} · {new Date(it.evidence.at).toLocaleDateString("en-AU")}{it.evidence.ref ? ` · ${it.evidence.ref}` : ""}</p>}
        {assumed && (
          <p className="rounded-lg border border-dashed border-hairline px-3 py-2 text-[13px] text-muted" data-testid={`assumption-${qid}`}>
            <span className="font-bold text-ink">Blue Leaf pricing assumption ({BASELINE_TIERS[assumed.tier]}{assumptionIsDraft(assumed) ? ", draft wording" : ""}){assumed.coversOnly ? `, only for the ${assumed.coversOnly.join(" and ")}` : ""}:</span> {assumed.text} Staff only. Not a client choice, an approval or a price.
          </p>
        )}
        {askPanel}
        {portalReview}
        {portalButtons}
        {issues.length > 0 && <p className="text-[13px] text-amber-800">{issues.join(" ")}</p>}
        {locked && <p className="text-[13px] text-muted">{lockedWords}</p>}
        {readOnlyReason && <p className="text-[13px] text-muted">{readOnlyReason}</p>}
      </div>
    );
  }

  return (
    <div className={`relative rounded-lg border p-2.5 ${started ? "border-hairline bg-page" : "border-dashed border-hairline bg-surface"}`} data-testid={`prompt-${qid}`}>
      <div className={`flex items-start gap-2 ${flagSet ? "flex-wrap sm:flex-nowrap" : ""}`}>
        <div className="min-w-0 flex-1">
          <div className={`flex flex-wrap items-center gap-1.5 ${actionFlag && !flagSet ? "pr-36" : flagSet ? "" : "pr-24"} sm:pr-0`}>
            <Chip tone={KIND_TONE[kind]}>{guided ? ANSWER_NATURES[config.nature] : ITEM_KINDS[kind]}</Chip>
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
          {wording.text && !rowTitle && !config?.linkedKey && (
            <button type="button" onClick={() => setShowText((s) => !s)} className={`mt-0.5 block w-full text-left text-[11px] leading-snug text-muted ${showText ? "" : "line-clamp-1"}`}>
              {wording.text}
            </button>
          )}

          {guided && (
            <ProgressiveChoiceCard question={question} config={config} item={it} disabled={disabled || locked} onPatch={set} saveState={saveState} fixedZone={fixedZone} usedZones={usedZones} areaOptions={areaOptions} coveredQuestions={coveredQuestions} />
          )}
          {assumed && (
            <p className="mt-1.5 rounded border border-dashed border-hairline px-2 py-1 text-[11px] text-muted" data-testid={`assumption-${qid}`}>
              <span className="font-semibold text-ink">Blue Leaf pricing assumption ({BASELINE_TIERS[assumed.tier]}{assumptionIsDraft(assumed) ? ", draft wording" : ""}){assumed.coversOnly ? `, only for the ${assumed.coversOnly.join(" and ")}` : ""}:</span> {assumed.text} Staff only. Not a client choice, an approval or a price.
            </p>
          )}
          {guided && (kind === "action" || config.handling === "record" || config.repeat?.owner) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Select value={it.responsibility} onChange={(v) => set({ responsibility: v })} options={Object.entries(RESPONSIBILITIES)} placeholder="owner —" className="w-36" disabled={disabled} />
              {kind === "action" && (
                <label className="flex min-h-[40px] items-center gap-1 text-[11px] text-ink sm:min-h-0">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={it.resolved} disabled={disabled} onChange={(e) => set({ resolved: e.target.checked })} /> Done
                </label>
              )}
            </div>
          )}

          {!guided && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {kind === "scope" && usesDisposition && (
                <Select value={it.disposition} onChange={(v) => set({ disposition: v })} options={dispOptions} className="w-36" disabled={disabled || locked} />
              )}
              <input value={it.description} disabled={disabled || locked} onChange={(e) => set({ description: e.target.value })}
                placeholder={kind === "scope" ? "What's being done…" : kind === "requirement" ? "Required outcome…" : kind === "action" ? "Question / follow-up…" : "Direction / product…"}
                className={`inp min-w-[10rem] flex-1 ${DENSE}`} />
              {kind === "selection" && (
                <Select value={it.certainty} onChange={chooseCertainty} options={certOptions} className="w-32" disabled={disabled || locked} />
              )}
              {kind === "requirement" && !noteOnly && (
                <Select value={it.certainty} onChange={chooseCertainty} options={reqCertOptions} className="w-32" disabled={disabled} />
              )}
              {(kind === "action" || noteOnly) && (
                <Select value={it.responsibility} onChange={(v) => set({ responsibility: v })} options={Object.entries(RESPONSIBILITIES)} placeholder="owner —" className="w-36" disabled={disabled} />
              )}
              {kind === "action" && (
                <label className="flex items-center gap-1 text-[11px] text-ink">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={it.resolved} disabled={disabled} onChange={(e) => set({ resolved: e.target.checked })} /> Done
                </label>
              )}
            </div>
          )}

          {!guided && item?.answer && answerSummary(item) && <p className="mt-1 text-[11px] text-muted">Recorded: <span className="font-medium text-ink">{answerSummary(item)}</span></p>}

          {!guided && !noteOnly && !disabled && !locked && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {kind !== "action" && QUICK.filter(([k]) => kind !== "requirement" || k === "na" || k === "undecided").map(([k, l]) => (
                <button key={k} type="button" onClick={() => set({ disposition: k })}
                  className={`rounded-full border px-2 py-0.5 text-[10px] ${it.disposition === k && started && k !== "undecided" ? "border-primary bg-primary text-white" : "border-hairline text-muted hover:text-ink"}`}>{l}</button>
              ))}
            </div>
          )}

          {askPanel}
          {portalReview}

          {issues.length > 0 && <p className="mt-1 text-[10px] text-amber-700">{issues.join(" ")}</p>}
          {readOnlyReason && <p className="mt-1 text-[10px] text-muted">{readOnlyReason}</p>}
          {locked && <p className="mt-1 text-[10px] text-muted">{lockedWords}</p>}
        </div>
        <div className={flagSet ? "flex w-full items-center gap-2 sm:w-auto sm:shrink-0 sm:flex-col sm:items-end sm:gap-1"
          : "absolute right-2.5 top-2.5 flex items-center gap-2 sm:static sm:shrink-0 sm:flex-col sm:items-end sm:gap-1"}>
          {actionFlag && (
            <NeedsActionFlag reg={reg} context={context} item={item || null} seed={seed || it} actor={actor} readOnly={disabled}
              updateItem={(_id, partial) => onChange(partial)} upsertItem={(_seed, partial) => onChange(partial)} />
          )}
          {<button type="button" onClick={() => setOpen((o) => !o)} className="text-[11px] text-primary hover:underline">{open ? "Less" : guided ? "Office fields" : "More"}</button>}
          {onDelete && !disabled && <button type="button" onClick={onDelete} title="Remove this item" className="text-xs text-red-500 hover:text-red-700">×</button>}
        </div>
      </div>

      {open && (
        <div className="mt-2 grid grid-cols-1 gap-2 border-t border-hairline pt-2 sm:grid-cols-3">
          {kind === "selection" && <>
            <Mini label="Product"><input value={it.product} disabled={disabled || locked} onChange={(e) => set({ product: e.target.value })} className={`inp ${DENSE}`} /></Mini>
            <Mini label="Manufacturer"><input value={it.manufacturer} disabled={disabled || locked} onChange={(e) => set({ manufacturer: e.target.value })} className={`inp ${DENSE}`} /></Mini>
            <Mini label="Model / code"><input value={it.model} disabled={disabled || locked} onChange={(e) => set({ model: e.target.value })} className={`inp ${DENSE}`} /></Mini>
            <Mini label="Finish / colour"><input value={it.colour} disabled={disabled || locked} onChange={(e) => set({ colour: e.target.value })} className={`inp ${DENSE}`} /></Mini>
            <Mini label="Supplier"><input value={it.supplier} disabled={disabled || locked} onChange={(e) => set({ supplier: e.target.value })} placeholder="e.g. Routleys" className={`inp ${DENSE}`} /></Mini>
            {/* What the client reads in the Client Selections Presentation; the supplier's wording above stays as it is
                for the technical schedule. Wording only, so it stays editable after approval. */}
            <Mini label="Client label (presentation)"><input value={it.clientLabel || ""} disabled={disabled} onChange={(e) => set({ clientLabel: e.target.value })} placeholder="e.g. Kitchen mixer" className={`inp ${DENSE}`} /></Mini>
            <Mini label="Client description (presentation)"><input value={it.clientDescription || ""} disabled={disabled} onChange={(e) => set({ clientDescription: e.target.value })} placeholder="Plain words for the client, e.g. Pull-down sink mixer, brushed nickel" className={`inp ${DENSE}`} /></Mini>
            {usesDisposition && <Mini label="Scope / disposition"><Select value={it.disposition} onChange={(v) => set({ disposition: v })} options={dispOptions} disabled={disabled || locked} /></Mini>}
          </>}
          {guided && kind === "scope" && usesDisposition && <Mini label="Scope / disposition"><Select value={it.disposition} onChange={(v) => set({ disposition: v })} options={dispOptions} disabled={disabled || locked} /></Mini>}
          {guided && kind === "selection" && <Mini label="Client status"><Select value={it.certainty} onChange={chooseCertainty} options={certOptions} disabled={disabled || locked} /></Mini>}
          {guided && kind === "requirement" && <Mini label="Client status"><Select value={it.certainty} onChange={chooseCertainty} options={reqCertOptions} disabled={disabled} /></Mini>}
          {(kind === "selection" || kind === "scope") && usesDisposition && <>
            {!meeting && <Mini label="Quantity (blank = not measured)">
              <div className="flex gap-1">
                <input type="number" step="any" value={it.quantity ?? ""} disabled={disabled || locked} onChange={(e) => set({ quantity: e.target.value === "" ? null : Number(e.target.value) })} className={`inp w-20 ${DENSE}`} />
                <input value={it.unit} disabled={disabled || locked} onChange={(e) => set({ unit: e.target.value })} placeholder="unit" className={`inp w-16 ${DENSE}`} />
              </div>
            </Mini>}
            <Mini label="Supplied by"><Select value={it.supplyBy} onChange={(v) => set({ supplyBy: v })} options={Object.entries(SUPPLY_BY)} placeholder="—" disabled={disabled} /></Mini>
          </>}
          {kind !== "action" && (
            <Mini label="Owner (next decision)"><Select value={it.responsibility} onChange={(v) => set({ responsibility: v })} options={Object.entries(RESPONSIBILITIES)} placeholder="—" disabled={disabled} /></Mini>
          )}
          <Mini label="Next action"><input value={it.nextAction} disabled={disabled} onChange={(e) => set({ nextAction: e.target.value, resolved: false })} className={`inp ${DENSE}`} /></Mini>
          <Mini label="Drawing / supplier ref"><input value={it.source} disabled={disabled} onChange={(e) => set({ source: e.target.value })} placeholder="sheet + rev / doc no + rev / meeting" className={`inp ${DENSE}`} /></Mini>
          <Mini label="Technical verification">
            <Select value={it.technicalStatus} onChange={chooseTechnical} options={Object.entries(TECHNICAL_STATUSES)} disabled={disabled} />
            {it.technicalEvidence?.ref && <p className="mt-0.5 text-[10px] text-muted">by {it.technicalEvidence.by} — {it.technicalEvidence.ref}</p>}
          </Mini>
          {!meeting && kind !== "action" && kind !== "requirement" && usesDisposition && (
            <Mini label="Pricing (link — never a price)">
              <Select value={it.pricingStatus} onChange={(v) => set({ pricingStatus: v })} options={Object.entries(PRICING_STATUSES)} disabled={disabled} />
              <input value={it.pricingRef} disabled={disabled} onChange={(e) => set({ pricingRef: e.target.value })} placeholder="estimate line / RFQ / quote ref" className={`inp mt-1 ${DENSE}`} />
            </Mini>
          )}
          <Mini label="Record type">
            <Select value={kind} onChange={(v) => set({ itemKind: v })} options={Object.entries(ITEM_KINDS)} disabled={disabled || locked} title="Scope = work · Requirement = outcome · Selection = product choice · Action = follow-up" />
          </Mini>
          {it.evidence?.at && <p className="text-[10px] text-muted sm:col-span-3">Client approval: {it.evidence.by} · {new Date(it.evidence.at).toLocaleDateString("en-AU")} · {it.evidence.method || ""} {it.evidence.ref ? `— ${it.evidence.ref}` : ""}</p>}
          {portalButtons}
        </div>
      )}
    </div>
  );
}

/** A captioned office field: the caption is the field's name (the label wraps the field). */
function OfficeField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

/**
 * One row per item for a question that repeats (Tab 27 B01, MR-UX-01H). "+ Add another" opens a fresh row, and a row isn't
 * saved until something is answered on it. Blank and saved rows are one keyed list and a row keeps its id when it is saved,
 * so the first answer doesn't rebuild the row: focus, typing and an open "+ More detail" all stay where they were.
 * A used id is never offered again, so a removed row stays removed. Mount one of these per room and question.
 *
 * Where each zone is its own default (a floor per zone, paint per surface, kitchen and scullery standards), the zones shown
 * first are laid out as one row each, so the zone takes no tap. The rarer zones are a "+ Scullery" button away. Anything
 * already recorded always has a row. renderBelow adds what is linked under a saved row (gutters under a roof).
 */
export function RepeatRows({ question, items, seed, upsertItem, updateItem, deleteItem, readOnly, renderBelow, noAdd, titleOf, ...row }) {
  const spare = useRef(genId());                 // the open row while nothing is recorded
  const slotIds = useRef({});                    // the open row for each zone laid out, by zone
  const [added, setAdded] = useState(null);      // the open row from "+ Add another" or "+ Scullery": { id, zone? }
  const saved = new Set(items.map((i) => i.id));
  if (saved.has(spare.current)) spare.current = genId();
  for (const z of Object.keys(slotIds.current)) if (saved.has(slotIds.current[z])) delete slotIds.current[z];
  if (added && saved.has(added.id)) setAdded(null);
  const seedFor = (id, zone) => ({ ...seed, id, ...(zone ? { answer: { ...seed.answer, zone: { key: zone.id, label: zone.label } } } : {}) });
  const cfg = configForRow(question.id, makeItem(seed));
  const tid = cfg?.linkedKey ? `${question.id}-${cfg.linkedKey}` : question.id;
  const zones = cfg?.repeat?.eachZone ? cfg.zones || [] : [];
  const zoneOf = (item) => zones.find((z) => z.id === item.answer?.zone?.key) || null;
  const openZone = (z) => OPEN_OPTION_IDS.has(z.id);

  const taken = new Set();
  const laidOut = zones.filter((z) => !z.detail && !openZone(z)).map((zone) => {
    const item = items.find((i) => !taken.has(i.id) && zoneOf(i)?.id === zone.id) || null;
    if (item) taken.add(item.id);
    if (!item && !slotIds.current[zone.id]) slotIds.current[zone.id] = genId();
    return { id: item ? item.id : slotIds.current[zone.id], item, zone };
  });
  const openAdded = added && !saved.has(added.id) ? added : null;
  const blankId = zones.length ? null : openAdded ? openAdded.id : items.length ? null : spare.current;
  const rows = [
    ...laidOut,
    ...items.filter((i) => !taken.has(i.id)).map((item) => ({ id: item.id, item, zone: zoneOf(item) })),
    ...(blankId ? [{ id: blankId, item: null, zone: null }] : []),
    ...(zones.length && openAdded ? [{ id: openAdded.id, item: null, zone: openAdded.zone }] : []),
  ];
  const rowZones = new Set(rows.map((r) => r.zone?.id).filter(Boolean));
  const moreZones = zones.filter((z) => (z.detail || openZone(z)) && (openZone(z) ? openAdded?.zone?.id !== z.id : !rowZones.has(z.id)));
  const usedZones = zones.length ? new Set(items.map((i) => i.answer?.zone?.key).filter((k) => k && !OPEN_OPTION_IDS.has(k))) : null;
  const addBtn = "focus-ring inline-flex min-h-[40px] items-center rounded-full border border-dashed border-hairline px-3 text-[11px] font-semibold text-primary hover:bg-page sm:min-h-[30px]";
  return (
    <div className="space-y-2">
      {zones.length > 0 && (
        <div>
          <span className="text-xs font-semibold text-ink">{question.short}</span> <span className="text-[10px] text-muted">{question.id}</span>
          <p className="text-[11px] leading-snug text-muted">{question.text}</p>
        </div>
      )}
      {rows.map(({ id, item, zone }) => (
        <div key={id} className="space-y-1.5" data-testid={zone ? `slot-${question.id}-${zone.id}` : undefined}>
          <PromptRow question={question} item={item} seed={seedFor(id, zone)} readOnlyReason={readOnly ? "Read-only" : null} {...row}
            rowTitle={zone?.label || (item && titleOf?.(item)) || undefined} fixedZone={!!zone} usedZones={usedZones}
            onChange={(partial) => (item ? updateItem(id, partial) : upsertItem(seedFor(id, zone), partial))}
            onDelete={item ? () => deleteItem(id) : undefined} />
          {item && renderBelow?.(item)}
        </div>
      ))}
      {!readOnly && !zones.length && !blankId && !noAdd && (
        <button type="button" onClick={() => setAdded({ id: genId() })} className={addBtn} data-testid={`add-another-${tid}`}>+ Add another</button>
      )}
      {!readOnly && moreZones.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {moreZones.map((z) => <button key={z.id} type="button" onClick={() => setAdded({ id: genId(), zone: z })} className={addBtn} data-testid={`add-zone-${question.id}-${z.id}`}>+ {z.label}</button>)}
        </div>
      )}
    </div>
  );
}
