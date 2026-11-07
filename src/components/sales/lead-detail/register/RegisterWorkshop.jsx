/**
 * RegisterWorkshop — the Master Register (Tab 18 / R03): the staff-operated, room-by-room project brief.
 *
 * Lives INSIDE the existing lead stages (no new page, stage or department). One component, every stage:
 *   Project → Whole house → Site & existing → Rooms → Register (office) → Documents
 * Storage is stage-aware and invisible to staff (useRegister → /api/register): the lead scratchpad before a
 * project exists, the canonical project records afterwards — saved automatically, no sync button.
 * Sales facts (client, site, type, budget, consultants, drawings) are shown read-only and never re-asked.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resumePointer, outstandingItems, PROJECT_TYPE_LABELS, DELIVERY_MODELS } from "../../../../lib/register.js";
import { apiFetch, apiPut } from "../../../../lib/apiFetch.js";
import { useAuth } from "../../../../lib/useAuth.js";
import { useRegister } from "./useRegister.js";
import ContextStep from "./ContextStep.jsx";
import SectionStep from "./SectionStep.jsx";
import RoomsStep from "./RoomsStep.jsx";
import RegisterTable from "./RegisterTable.jsx";
import DocumentsStep from "./DocumentsStep.jsx";
import TenderPanel from "./TenderPanel.jsx";
import HandoverPanel from "./HandoverPanel.jsx";
import LegacyScheduleRows from "./LegacyScheduleRows.jsx";

const STEPS = [
  { key: "context", label: "Project" },
  { key: "whole_house", label: "Whole house" },
  { key: "site", label: "Site & existing" },
  { key: "rooms", label: "Rooms" },
  { key: "register", label: "Register" },
  { key: "documents", label: "Documents" },
  { key: "tender", label: "Tender", stages: ["consultants", "tender", "won"] },
  { key: "handover", label: "Handover", stages: ["won"], contract: true },
];
const OPEN_BY_DEFAULT = new Set(["winning_offer", "consultants", "tender"]);
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

// Which pre-register list a stage showed before R02 (shown again while the register is switched off).
const LEGACY_BY_STAGE = { winning_offer: "concept", consultants: "consultants" };

export default function RegisterWorkshop({ lead, patch, stage }) {
  const { profile } = useAuth();
  const rootRef = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const check = () => setVisible(el.getClientRects().length > 0);
    check();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(check) : null;
    ro?.observe(document.body);
    return () => ro?.disconnect();
  }, []);
  const store = useRegister(lead.id, { enabled: visible });
  const { reg, info, save } = store;
  const loaded = !!reg;
  const [context, setContext] = useState(null);
  const [open, setOpen] = useState(() => lsGet(`register.open.${lead.id}`, OPEN_BY_DEFAULT.has(stage) ? "1" : "0") === "1");
  const [step, setStep] = useState(null);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [showDetail, setShowDetail] = useState(() => lsGet("register.showDetail", "0") === "1");
  const [factError, setFactError] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const steps = STEPS.filter((s) => !s.stages || s.stages.includes(stage) || (s.contract && lead.contract_status === "signed"));
  useEffect(() => {
    if (!visible || info.mode !== "project") return;
    apiFetch(`/api/register/leads/${lead.id}/baseline`).then((r) => { if (r.ok) setBaseline(r.data.baseline); });
  }, [lead.id, info.mode, visible]);

  const loadContext = useCallback(async () => {
    const r = await apiFetch(`/api/register/leads/${lead.id}/context`);
    if (r.ok) setContext(r.data.context);
  }, [lead.id]);
  useEffect(() => { if (visible && loaded) loadContext(); }, [visible, loaded, loadContext, lead.project_type, lead.stage, lead.job_id]);

  // Resume where the brief was left (Tab 18 §3 "Continue Brief") once the register is loaded.
  useEffect(() => {
    if (!reg || step) return;
    const p = resumePointer(reg);
    setStep(p.step === "outstanding" ? "register" : p.step === "setup" ? "context" : p.step);
    setActiveRoomId(p.roomId);
  }, [reg, step]);

  const outstanding = useMemo(() => (reg ? outstandingItems(reg) : []), [reg]);
  function toggleOpen(v) { setOpen(v); lsSet(`register.open.${lead.id}`, v ? "1" : "0"); }
  function gotoStep(s) {
    setStep(s);
    if (reg && reg.meta.lastStep !== s) store.mutateMeta({ lastStep: s });
  }
  function selectRoom(id) {
    setActiveRoomId(id);
    if (reg && reg.meta.lastRoomId !== id) store.mutateMeta({ lastRoomId: id, lastStep: "rooms" });
  }
  function continueBrief() {
    toggleOpen(true);
    if (reg) { const p = resumePointer(reg); setStep(p.step === "setup" ? "context" : p.step); setActiveRoomId(p.roomId); }
  }
  async function setDeliveryModel(v) {
    setFactError(null);
    const r = await apiPut(`/api/register/leads/${lead.id}/facts`, { deliveryModel: v });
    if (r.ok) setContext(r.data.context); else setFactError(r.error);
  }
  async function patchLead(partial) { await patch(partial); loadContext(); }
  async function onPortalItem(item, action, evidence) {
    if (action === "approve") { store.updateItem(item.id, { certainty: "client_approved", evidence }); await store.flush(); return; }
    await store.portal(action, [item]);
  }

  const rooms = reg?.meta.rooms || [];
  const modeBadge = info.mode === "project"
    ? (info.isPreconstruction ? { t: "Project record", c: "bg-primary/10 text-primary", h: "Saved to the canonical project records (pre-construction). Selections stay internal until issued." }
      : { t: "Project record · under contract", c: "bg-green-100 text-green-700", h: "Live project — approved selections change through variations." })
    : { t: "Lead brief", c: "bg-page text-muted", h: "Saved on the lead until a project record exists, then moved onto it automatically." };
  const saveText = { idle: "", dirty: "Unsaved…", saving: "Saving…", saved: save.at ? `Saved ${save.at.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}` : "Saved", error: save.message || "Save failed" }[save.state];

  // Switched off for this lead (REGISTER_ENABLED / REGISTER_PILOT_LEADS): the pre-register lists, exactly as before.
  if (store.disabled) return <div ref={rootRef}>{LEGACY_BY_STAGE[stage] && <LegacyScheduleRows lead={lead} patch={patch} variant={LEGACY_BY_STAGE[stage]} />}</div>;
  if (!loaded && !store.error) return <div ref={rootRef} />; // first load — nothing shows until the switch is known

  return (
    <div ref={rootRef} className="rounded-card border border-hairline bg-surface" data-testid="register-workshop">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">Project brief &amp; register</p>
            <span title={modeBadge.h} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${modeBadge.c}`} data-testid="register-mode">{modeBadge.t}</span>
          </div>
          <p className="truncate text-[11px] text-muted">
            {context?.projectType ? PROJECT_TYPE_LABELS[context.projectType] : "Project type —"}
            {context?.deliveryModel ? ` · ${DELIVERY_MODELS[context.deliveryModel]}` : ""}
            {reg?.meta.planRev ? ` · Drawings ${reg.meta.planRev}` : " · Drawings —"}
            {` · ${rooms.length} room${rooms.length === 1 ? "" : "s"}`}
            {outstanding.length ? ` · ${outstanding.length} outstanding` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveText && <span className={`text-[11px] ${save.state === "error" ? "text-red-600" : save.state === "saved" ? "text-green-600" : "text-amber-600"}`} data-testid="register-save-state">{saveText}</span>}
          {open && <button type="button" onClick={() => store.flush()} disabled={save.state === "saving"} className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-ink hover:bg-page disabled:opacity-40">Save</button>}
          {!open
            ? <button type="button" onClick={continueBrief} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90" data-testid="continue-brief">{reg && (reg.items.length || rooms.length) ? "Continue brief →" : "Start brief →"}</button>
            : <button type="button" onClick={() => toggleOpen(false)} className="text-[11px] text-muted hover:text-ink">Collapse</button>}
        </div>
      </div>

      {open && (
        <>
          {store.error && <p className="px-4 py-3 text-sm text-red-600">{store.error}</p>}
          {store.notices.map((n, i) => (
            <div key={i} className="flex items-start justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-900">
              <span>{n}</span><button type="button" onClick={() => store.dismissNotice(i)} className="text-amber-700">×</button>
            </div>
          ))}
          {info.promotion?.ok && !info.promotion.alreadyPromoted && (
            <div className="border-b border-primary/20 bg-primary/5 px-4 py-1.5 text-[11px] text-primary">This brief was moved onto the project record ({info.promotion.selections} selections staged internally, {info.promotion.scopeItems} scope/requirement/action items). Nothing was sent to the client.</div>
          )}
          {info.promotion && !info.promotion.ok && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-900">The project record exists but the brief couldn&apos;t be moved onto it yet ({info.promotion.reason}). Your work is safe on the lead and will move automatically next time.</div>
          )}
          {factError && <p className="border-b border-red-200 bg-red-50 px-4 py-1.5 text-[11px] text-red-700">{factError}</p>}

          <div className="flex flex-wrap items-center gap-1 border-b border-hairline px-3 py-2">
            {steps.map((s) => (
              <button key={s.key} type="button" onClick={() => gotoStep(s.key)} data-testid={`step-${s.key}`}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${step === s.key ? "bg-primary text-white" : "border border-hairline text-ink hover:bg-page"}`}>
                {s.label}{s.key === "register" && outstanding.length ? ` (${outstanding.length})` : ""}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted" title="Detailed prompts are normally for after the PTSA is signed — staff may work ahead at any time.">
              <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={showDetail} onChange={(e) => { setShowDetail(e.target.checked); lsSet("register.showDetail", e.target.checked ? "1" : "0"); }} />
              Show detailed prompts
            </label>
          </div>

          <div className="p-4">
            {(store.loading && !reg) && <p className="text-sm text-muted">Loading the brief…</p>}
            {reg && step === "context" && (
              <ContextStep reg={reg} context={context} lead={lead} stage={stage} actor={profile} patchLead={patchLead} setDeliveryModel={setDeliveryModel}
                mutateMeta={store.mutateMeta} replaceItems={store.replaceItems} upsertItem={store.upsertItem} updateItem={store.updateItem}
                deleteItem={store.deleteItem} addItem={store.addItem} openRoom={(id) => { selectRoom(id); setStep("rooms"); }} />
            )}
            {reg && (step === "whole_house" || step === "site") && (
              <SectionStep section={step === "site" ? "site" : "project"} reg={reg} context={context} stage={stage} showDetail={showDetail} actor={profile}
                upsertItem={store.upsertItem} updateItem={store.updateItem} deleteItem={store.deleteItem} />
            )}
            {reg && step === "rooms" && (
              <RoomsStep reg={reg} context={context} stage={stage} showDetail={showDetail} activeRoomId={activeRoomId} setActiveRoomId={selectRoom}
                actor={profile} upsertItem={store.upsertItem} updateItem={store.updateItem} deleteItem={store.deleteItem} addItem={store.addItem}
                mutateMeta={store.mutateMeta} gotoContext={() => gotoStep("context")} onPortalItem={onPortalItem}
                onPrev={() => { const i = rooms.findIndex((r) => r.id === activeRoomId); if (i > 0) selectRoom(rooms[i - 1].id); }}
                onSaveNext={async () => {
                  const i = rooms.findIndex((r) => r.id === activeRoomId);
                  const next = rooms[i + 1];
                  if (next) selectRoom(next.id);
                  await store.flush();
                }} />
            )}
            {reg && step === "register" && (
              <RegisterTable reg={reg} context={context} stage={stage} info={info} actor={profile} baseline={baseline}
                updateItem={store.updateItem} deleteItem={store.deleteItem} addItem={store.addItem}
                onPortalItems={(action, items) => store.portal(action, items)} onPortalItem={onPortalItem} />
            )}
            {reg && step === "tender" && (
              <TenderPanel lead={lead} reg={reg} updateItem={store.updateItem} flush={store.flush} />
            )}
            {reg && step === "handover" && (
              <HandoverPanel lead={lead} reg={reg} info={info} flush={store.flush} portal={store.portal} onBaseline={setBaseline} />
            )}
            {reg && step === "documents" && (
              <DocumentsStep lead={lead} reg={reg} info={info} context={context} stage={stage} flush={store.flush} updateItem={store.updateItem} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
