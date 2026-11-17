/**
 * RegisterWorkshop — the Master Register (Tab 18 / R03): the staff-operated, room-by-room project brief.
 *
 * Lives INSIDE the existing lead stages (no new page, stage or department). One component, every stage
 * (REGISTER_SCREENS_SPEC.md, owner approval 17 Nov 2026):
 *   The project · Rooms · Throughout · Site & existing · Documents | Register · Tender (office)
 * An "Actions" pill opens every point waiting on someone (the same rule as the architect's brief's next-issue list).
 * Storage is stage-aware and invisible to staff (useRegister → /api/register): the lead scratchpad before a
 * project exists, the canonical project records afterwards — saved automatically, no sync button.
 * Sales facts (client, site, type, budget, consultants, drawings) are shown read-only and never re-asked.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resumePointer, siteLine, PROJECT_TYPE_LABELS, DELIVERY_MODELS } from "../../../../lib/register.js";
import { STAGES } from "../../../../lib/salesPipeline.js";
import { SHOW_IN_SALES } from "../../../../lib/projectStory.js";
import { apiFetch, apiPut } from "../../../../lib/apiFetch.js";
import { useAuth } from "../../../../lib/useAuth.js";
import { useRegister } from "./useRegister.js";
import ProjectStep from "./ProjectStep.jsx";
import SectionStep from "./SectionStep.jsx";
import RoomsList from "./RoomsList.jsx";
import RoomScreen from "./RoomScreen.jsx";
import ActionsPanel, { actionsSummary } from "./ActionsPanel.jsx";
import { NeedsActionProvider } from "./NeedsAction.jsx";
import EditDrawer from "./EditDrawer.jsx";
import RegisterTable from "./RegisterTable.jsx";
import DocumentsStep from "./DocumentsStep.jsx";
import TenderPanel from "./TenderPanel.jsx";
import HandoverPanel from "./HandoverPanel.jsx";
import LegacyScheduleRows from "./LegacyScheduleRows.jsx";

// Capture tabs first, then the office tabs after a divider (spec F2).
const STEPS = [
  { key: "context", label: "The project" },
  { key: "rooms", label: "Rooms" },
  { key: "whole_house", label: "Throughout" },
  { key: "site", label: "Site & existing" },
  { key: "documents", label: "Documents" },
  { key: "register", label: "Register", office: true },
  { key: "tender", label: "Tender", office: true, stages: ["consultants", "tender", "won"] },
  { key: "handover", label: "Handover", office: true, stages: ["won"], contract: true },
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
  // Unsaved edits are kept on this device per signed-in staff member (same key format as Takeoff's recovery).
  const store = useRegister(lead.id, { enabled: visible, actorKey: profile?.id ? `staff:${profile.id}` : null });
  const { reg, info, save } = store;
  const loaded = !!reg;
  const [context, setContext] = useState(null);
  const [open, setOpen] = useState(() => lsGet(`register.open.${lead.id}`, OPEN_BY_DEFAULT.has(stage) ? "1" : "0") === "1");
  const [step, setStep] = useState(null);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [roomOpen, setRoomOpen] = useState(false);        // the Rooms tab opens on the list; a room opens over it
  const [actionsOpen, setActionsOpen] = useState(null);   // null | the Actions list's starting filter
  const [recordDrawer, setRecordDrawer] = useState(null); // a record opened from the Actions list
  const [factError, setFactError] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const steps = STEPS.filter((s) => !s.stages || s.stages.includes(stage) || (s.contract && lead.contract_status === "signed"));
  useEffect(() => {
    if (!visible || info.mode !== "project") return;
    apiFetch(`/api/register/leads/${lead.id}/baseline`).then((r) => { if (r.ok) setBaseline(r.data.baseline); });
  }, [lead.id, info.mode, visible]);

  // Full-width workspace: lock page scroll + Escape to exit.
  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [expanded]);
  // "Change in Sales ›" / "Upload in Files ›" (Project step) show a LeadDetail tab: leave full width so it can be seen.
  useEffect(() => {
    if (!expanded) return undefined;
    const onShow = () => setExpanded(false);
    document.addEventListener(SHOW_IN_SALES, onShow);
    return () => document.removeEventListener(SHOW_IN_SALES, onShow);
  }, [expanded]);

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

  // The header's Actions pill: next-issue points, with an amber dot while any has no one named (spec F1, S4).
  const actions = useMemo(() => (reg && context ? actionsSummary(reg, context) : { count: 0, unnamed: 0 }), [reg, context]);
  // On a phone the Hub's stage bar is hidden while a room is open (spec S3p): a view rule only, nothing stored.
  useEffect(() => {
    const on = step === "rooms" && roomOpen && open;
    try { if (on) document.body.dataset.registerRoom = "open"; else delete document.body.dataset.registerRoom; } catch { /* no DOM */ }
    return () => { try { delete document.body.dataset.registerRoom; } catch { /* no DOM */ } };
  }, [step, roomOpen, open]);
  function toggleOpen(v) { setOpen(v); lsSet(`register.open.${lead.id}`, v ? "1" : "0"); }
  function gotoStep(s) {
    setStep(s);
    if (reg && reg.meta.lastStep !== s) store.mutateMeta({ lastStep: s });
  }
  function selectRoom(id) {
    setActiveRoomId(id);
    if (reg && reg.meta.lastRoomId !== id) store.mutateMeta({ lastRoomId: id, lastStep: "rooms" });
  }
  function openRoom(id) { selectRoom(id); setRoomOpen(true); setStep("rooms"); }
  function continueBrief() {
    toggleOpen(true);
    if (reg) { const p = resumePointer(reg); setStep(p.step === "setup" ? "context" : p.step); setActiveRoomId(p.roomId); }
  }
  const reloadContext = loadContext;
  async function setDeliveryModel(v) {
    setFactError(null);
    const r = await apiPut(`/api/register/leads/${lead.id}/facts`, { deliveryModel: v });
    if (r.ok) setContext(r.data.context); else setFactError(r.error);
  }
  // Returns patch()'s result (the saved lead, or null on failure) so StoryFields and the project-type select can say "Not saved".
  async function patchLead(partial) { const r = await patch(partial); loadContext(); return r; }
  async function onPortalItem(item, action, evidence) {
    if (action === "approve") { store.updateItem(item.id, { certainty: "client_approved", evidence }); await store.flush(); return; }
    await store.portal(action, [item]);
  }

  const rooms = reg?.meta.rooms || [];
  // The badge states the OPERATIONAL status of the record only — never "under contract" (that's a separate
  // state derived from the signed contract + baseline, shown truthfully in the Handover step). A Won-flipped
  // live project is not necessarily under a signed contract, so we don't imply it here.
  const modeBadge = info.mode === "project"
    ? (info.isPreconstruction ? { t: "Project record · pre-construction", c: "bg-primary/10 text-primary", h: "Saved to the canonical project records (pre-construction). Selections stay internal until issued. Contract / baseline / handover status is in the Handover step." }
      : { t: "Project record · live (Operations)", c: "bg-primary/10 text-primary", h: "Live Operations project — approved selections change through variations. Contract, baseline, Ops-ready handover and portal status are shown in the Handover step." })
    : { t: "Lead brief", c: "bg-page text-muted", h: "Saved on the lead until a project record exists, then moved onto it automatically." };
  const saveText = { idle: "", dirty: "Unsaved…", saving: "Saving…", saved: save.at ? `Saved ${save.at.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}` : "Saved", error: save.message || "Save failed", rejected: save.message || "Change rejected — not saved", conflict: save.message || "Changed elsewhere — review" }[save.state];

  // Switched off for this lead (REGISTER_ENABLED / REGISTER_PILOT_LEADS): the pre-register lists, exactly as before.
  if (store.disabled) return <div ref={rootRef}>{LEGACY_BY_STAGE[stage] && <LegacyScheduleRows lead={lead} patch={patch} variant={LEGACY_BY_STAGE[stage]} />}</div>;
  if (!loaded && !store.error) return <div ref={rootRef} />; // first load — nothing shows until the switch is known

  return (
    // Every ⚑ below (PromptRow in older screens passes no reg/context) reads the register, Sales context and staff member here.
    <NeedsActionProvider reg={reg} context={context} actor={profile}>
    <div ref={rootRef} className={expanded ? "fixed inset-0 z-40 overflow-y-auto bg-page px-2 py-3 sm:px-6 sm:py-4" : "-mx-3 sm:mx-0"}>
      <div className={`rounded-card border border-hairline bg-surface ${expanded ? "mx-auto max-w-[1180px]" : ""}`} data-testid="register-workshop">
      {expanded && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-hairline bg-surface px-4 py-2 text-[11px]">
          <span className="font-semibold text-ink">{context?.identity?.clientName || lead.name || "This project"}</span>
          {context?.identity?.siteAddress && <span className="text-muted">{siteLine(context.identity.siteAddress, context.identity.suburb)}</span>}
          <span className="text-muted">Stage: {STAGES.find((s) => s.id === context?.stage)?.label || stage}</span>
          <span className="text-muted">Drawings: {reg?.meta.planRev || "—"}</span>
          <button type="button" onClick={() => setExpanded(false)} className="ml-auto rounded border border-hairline px-2 py-0.5 text-ink hover:bg-page" data-testid="register-exit-expand">Exit full width ✕</button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-bold text-primary">Project brief</p>
            <span title={modeBadge.h} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${modeBadge.c}`} data-testid="register-mode">{modeBadge.t}</span>
          </div>
          <p className="truncate text-[11px] text-muted">
            {context?.projectType ? PROJECT_TYPE_LABELS[context.projectType] : "Project type —"}
            {context?.deliveryModel ? ` · ${DELIVERY_MODELS[context.deliveryModel]}` : ""}
            {reg?.meta.planRev ? ` · Drawings ${reg.meta.planRev}` : " · Drawings —"}
            {context?.identity?.suburb ? ` · ${context.identity.suburb}` : ""}
            {` · ${rooms.length} room${rooms.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveText && <span className={`text-[11px] ${save.state === "error" || save.state === "rejected" ? "text-red-600" : save.state === "saved" ? "text-green-600" : "text-amber-600"}`} data-testid="register-save-state">{saveText}</span>}
          {open && <button type="button" onClick={() => store.flush()} disabled={save.state === "saving"} className="min-h-[44px] rounded-lg border border-hairline px-3 text-xs font-semibold text-ink hover:bg-page disabled:opacity-40">Save</button>}
          {open && (
            <button type="button" onClick={() => setActionsOpen("next_issue")} className="relative inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-hairline px-3 text-xs font-semibold text-ink hover:bg-page" data-testid="actions-pill"
              title={actions.unnamed ? `${actions.unnamed} with no one named yet` : "Everything waiting on someone"}>
              Actions {actions.count}
              {actions.unnamed > 0 && <span className="h-2 w-2 rounded-full bg-warning" aria-label="Some have no one named" />}
            </button>
          )}
          {open && !expanded && <button type="button" onClick={() => setExpanded(true)} className="hidden min-h-[44px] rounded-lg border border-hairline px-3 text-xs font-semibold text-ink hover:bg-page sm:inline-block" data-testid="register-expand" title="Open the register in a full-width workspace">⤢ Expand</button>}
          {!open
            ? <button type="button" onClick={continueBrief} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90" data-testid="continue-brief">{reg && (reg.items.length || rooms.length) ? "Continue brief →" : "Start brief →"}</button>
            : <button type="button" onClick={() => { setExpanded(false); toggleOpen(false); }} className="min-h-[44px] px-2 text-[11px] text-muted hover:text-ink">Collapse</button>}
        </div>
      </div>

      {store.recovery && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-900" data-testid="register-recovery">
          <span>
            Unsaved changes from {new Date(store.recovery.savedAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} are kept on this device
            {store.recovery.count ? ` (${store.recovery.count} ${store.recovery.count === 1 ? "change" : "changes"})` : ""}.
            {store.recovery.conflicts ? ` ${store.recovery.conflicts} ${store.recovery.conflicts === 1 ? "was" : "were"} also changed elsewhere; the latest value will be kept.` : ""}
          </span>
          <span className="flex gap-2">
            <button type="button" onClick={store.restoreDraft} className="rounded border border-amber-300 bg-surface px-2.5 py-1 font-semibold text-amber-900 hover:bg-amber-100" data-testid="register-recovery-restore">Restore</button>
            <button type="button" onClick={store.discardDraft} className="rounded px-2.5 py-1 text-amber-800 hover:underline" data-testid="register-recovery-discard">Discard</button>
          </span>
        </div>
      )}

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

          <div className="flex items-center gap-1 overflow-x-auto border-b border-hairline px-3 py-2 sm:flex-wrap">
            {steps.map((s, k) => (
              <span key={s.key} className="contents">
                {s.office && !steps[k - 1]?.office && <span className="mx-1 h-5 w-px bg-hairline" aria-hidden="true" />}
                <button type="button" onClick={() => { gotoStep(s.key); if (s.key === "rooms") setRoomOpen(false); }} data-testid={`step-${s.key}`}
                  className={`min-h-[44px] shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${step === s.key ? "bg-primary text-white" : s.office ? "text-muted hover:bg-page hover:text-ink" : "border border-hairline text-ink hover:bg-page"}`}>
                  {s.label}
                </button>
              </span>
            ))}
          </div>

          <div className="p-2 sm:p-4">
            {(store.loading && !reg) && <p className="text-sm text-muted">Loading the brief…</p>}
            {reg && step === "context" && (
              <ProjectStep reg={reg} context={context} lead={lead} stage={stage} actor={profile} patchLead={patchLead} reloadContext={reloadContext} setDeliveryModel={setDeliveryModel}
                mutateMeta={store.mutateMeta} upsertItem={store.upsertItem} updateItem={store.updateItem} deleteItem={store.deleteItem} addItem={store.addItem} saveState={store.saveStateOf} onOpenRecord={(id) => setRecordDrawer({ kind: "record", ids: [id] })} />
            )}
            {reg && (step === "whole_house" || step === "site") && (
              <SectionStep section={step === "site" ? "site" : "project"} reg={reg} context={context} stage={stage} showDetail={false} actor={profile}
                upsertItem={store.upsertItem} updateItem={store.updateItem} deleteItem={store.deleteItem} saveState={store.saveStateOf} mutateMeta={store.mutateMeta} />
            )}
            {reg && step === "rooms" && (!roomOpen || !rooms.some((r) => r.id === activeRoomId)) && (
              <RoomsList reg={reg} context={context} mutateMeta={store.mutateMeta} replaceItems={store.replaceItems} openRoom={openRoom} readOnly={false} />
            )}
            {reg && step === "rooms" && roomOpen && rooms.some((r) => r.id === activeRoomId) && (
              <RoomScreen reg={reg} context={context} stage={stage} roomId={activeRoomId} actor={profile} upsertItem={store.upsertItem} updateItem={store.updateItem}
                deleteItem={store.deleteItem} addItem={store.addItem} replaceItems={store.replaceItems} mutateMeta={store.mutateMeta} saveState={store.saveStateOf}
                onPortalItem={onPortalItem} flush={store.flush} onBack={() => setRoomOpen(false)} onOpenRoom={(id) => openRoom(id)} />
            )}
            {reg && step === "register" && (
              <RegisterTable reg={reg} context={context} stage={stage} info={info} actor={profile} baseline={baseline}
                updateItem={store.updateItem} deleteItem={store.deleteItem} addItem={store.addItem}
                onPortalItems={(action, items) => store.portal(action, items)} onPortalItem={onPortalItem} saveState={store.saveStateOf} />
            )}
            {reg && step === "tender" && (
              <TenderPanel lead={lead} reg={reg} updateItem={store.updateItem} flush={store.flush} />
            )}
            {reg && step === "handover" && (
              <HandoverPanel lead={lead} reg={reg} info={info} flush={store.flush} portal={store.portal} onBaseline={setBaseline} />
            )}
            {reg && step === "documents" && (
              <DocumentsStep lead={lead} reg={reg} info={info} context={context} stage={stage} flush={store.flushAll} updateItem={store.updateItem} deleteItem={store.deleteItem} addItem={store.addItem}
                upsertItem={store.upsertItem} mutateMeta={store.mutateMeta} replaceItems={store.replaceItems} patchLead={patchLead} reloadContext={reloadContext}
                saveStateOf={store.saveStateOf} actor={profile} onPortalItem={onPortalItem} onOpenRoom={openRoom} onOpenActions={(f) => setActionsOpen(f || "next_issue")} saveText={saveText} />
            )}
          </div>
          {reg && actionsOpen && (
            <ActionsPanel reg={reg} context={context} actor={profile} updateItem={store.updateItem} upsertItem={store.upsertItem} addItem={store.addItem} initialFilter={actionsOpen}
              onOpenRecord={(id, ids) => setRecordDrawer({ kind: "record", ids: ids?.length ? ids : [id] })} onClose={() => setActionsOpen(null)} />
          )}
          {reg && recordDrawer && (
            <EditDrawer target={recordDrawer} lead={lead} reg={reg} context={context} actor={profile} readOnly={false} saveStateOf={store.saveStateOf} updateItem={store.updateItem} addItem={store.addItem}
              deleteItem={store.deleteItem} upsertItem={store.upsertItem} mutateMeta={store.mutateMeta} replaceItems={store.replaceItems} patchLead={patchLead}
              reloadContext={reloadContext} onPortalItem={onPortalItem} onClose={() => setRecordDrawer(null)} onPreview={() => { setRecordDrawer(null); setActionsOpen(null); gotoStep("documents"); }}
              onOpenRoom={(id) => { setRecordDrawer(null); setActionsOpen(null); openRoom(id); }} saveText={saveText} />
          )}
        </>
      )}
      </div>
    </div>
    </NeedsActionProvider>
  );
}
