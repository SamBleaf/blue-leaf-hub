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
import { resumePointer, siteLine, PROJECT_TYPE_LABELS, isRenovationProject } from "../../../../lib/register.js";
import { STAGES } from "../../../../lib/salesPipeline.js";
import { SHOW_IN_SALES } from "../../../../lib/projectStory.js";
import { timeOfDay } from "../../../../lib/roomScreen.js";
import { SAVE_RETRY_WORDS } from "../../../../lib/registerMerge.js";
import { useEscapeLayer, useBodyFlag, useBodyData } from "../../../../lib/overlayFlag.js";
import { apiFetch, apiPut } from "../../../../lib/apiFetch.js";
import { useAuth } from "../../../../lib/useAuth.js";
import { useRegister } from "./useRegister.js";
import { useNarrow } from "./useRoomUi.js";
import { IconButton, Popover, MenuItem } from "./RoomUi.jsx";
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
// The capture tabs: while one is open the lead page's header and the project bar scroll away (index.css, spec S3p).
const CAPTURE_STEPS = new Set(STEPS.filter((s) => !s.office).map((s) => s.key));
// The office tabs that still say where the brief is kept (lead or project record); the capture tabs don't (spec F1).
const MODE_BADGE_STEPS = new Set(["register", "handover"]);
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

// Which pre-register list a stage showed before R02 (shown again while the register is switched off).
const LEGACY_BY_STAGE = { winning_offer: "concept", consultants: "consultants" };

/** The header's save words (spec F1): 'Saving…' / 'Saved 9:35 pm' / 'Not saved — retrying', in Adelaide time. */
function headerSaveWords(save, saveAt) {
  const at = save.at || saveAt;
  switch (save.state) {
    case "dirty": case "saving": return { text: "Saving…", cls: "text-muted" };
    case "saved": return { text: at ? `Saved ${timeOfDay(at)}` : "Saved", cls: "text-accent" };
    case "error": return { text: save.message || SAVE_RETRY_WORDS, cls: "font-bold text-red-700" };
    case "rejected": return { text: save.message || "Not saved", cls: "font-bold text-red-700" };
    case "conflict": return { text: save.message || "Changed elsewhere — check", cls: "font-bold text-amber-800" };
    default: return { text: "", cls: "" };
  }
}

/**
 * The header's ⋯ menu (spec S1 "an office override in the register ⋯ menu"): the existing-building questions follow the
 * project type (Extension or Renovation turns them on); for another type the office can turn them on or off here.
 */
function BriefMenu({ reg, context, lead, mutateMeta }) {
  const narrow = useNarrow();
  const [menu, setMenu] = useState(false);
  const btn = useRef(null);
  const close = useCallback(() => setMenu(false), []);
  const byType = isRenovationProject(context?.projectType || lead.project_type || null);
  const on = byType || !!reg.meta.renovationOverlay;
  return (
    <div className="relative">
      <IconButton label="More options" buttonRef={btn} expanded={menu} onClick={() => setMenu((m) => !m)} className="border border-hairline text-ink" />
      <Popover open={menu} onClose={close} narrow={narrow} anchorRef={btn} title="Project brief">
        <MenuItem checked={on} kind="checkbox" disabled={byType} testId="brief-menu-existing-building"
          hint="Follows the project type (Extension or Renovation turns it on)"
          onClick={() => mutateMeta({ renovationOverlay: !reg.meta.renovationOverlay })}>
          Ask about the existing building
        </MenuItem>
      </Popover>
    </div>
  );
}

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
  const [tickMode, setTickMode] = useState(false);       // the Rooms list's "Choose upstairs rooms" tick mode (RoomsList onTickChange)
  const expandBarRef = useRef(null);
  const [expandBarH, setExpandBarH] = useState(0);
  const tabRowRef = useRef(null);
  const ctxSeq = useRef(0);                              // the newest context request; an older answer arriving later is dropped
  const steps = STEPS.filter((s) => !s.stages || s.stages.includes(stage) || (s.contract && lead.contract_status === "signed"));
  useEffect(() => {
    if (!visible || info.mode !== "project") return;
    apiFetch(`/api/register/leads/${lead.id}/baseline`).then((r) => { if (r.ok) setBaseline(r.data.baseline); });
  }, [lead.id, info.mode, visible]);

  // Full-width workspace: lock page scroll; Escape exits only when it is the top layer (a drawer, sheet or ⋯ menu open on
  // it closes first, finding N1). In a text box Escape is left to the box, so it cancels a rename instead. A dialog that
  // doesn't use the shared layers (one inside the register, or any open modal) keeps its own Escape.
  useEscapeLayer(expanded, () => {
    try {
      const dialogs = [...(rootRef.current?.querySelectorAll('[role="dialog"], [aria-modal="true"]') || []), ...document.querySelectorAll('[aria-modal="true"]')];
      if (dialogs.some((el) => el.getClientRects().length > 0)) return false;
    } catch { /* no DOM */ }
    setExpanded(false);
    return true;
  }, { yieldToFields: true });
  // It covers the page: hide the Blueprint and Quick-add buttons (index.css) while it's open.
  useBodyFlag("register-overlay-open", expanded);
  useEffect(() => {
    if (!expanded) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [expanded]);
  // Offered from 768 px (below it the Hub's bottom nav would cover its footer): leave it if the window gets narrower.
  useEffect(() => {
    if (!expanded) return undefined;
    let mq;
    try { mq = window.matchMedia("(max-width: 767px)"); } catch { return undefined; }
    const check = () => { if (mq.matches) setExpanded(false); };
    check();
    mq.addEventListener?.("change", check);
    return () => mq.removeEventListener?.("change", check);
  }, [expanded]);
  // The register's sticky bars sit under the workspace's own bar (--register-top, index.css).
  useEffect(() => {
    if (!expanded) return undefined;
    const el = expandBarRef.current;
    if (!el) return undefined;
    const measure = () => setExpandBarH(el.offsetHeight || 0);
    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [expanded]);
  // "Change in Sales ›" / "Upload in Files ›" (Project step) show a LeadDetail tab: leave full width so it can be seen.
  useEffect(() => {
    if (!expanded) return undefined;
    const onShow = () => setExpanded(false);
    document.addEventListener(SHOW_IN_SALES, onShow);
    return () => document.removeEventListener(SHOW_IN_SALES, onShow);
  }, [expanded]);

  const loadContext = useCallback(async () => {
    const n = ++ctxSeq.current;
    const r = await apiFetch(`/api/register/leads/${lead.id}/context`);
    if (n !== ctxSeq.current) return;       // a newer request is on its way: never put older story text back in the boxes
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
  const rooms = reg?.meta.rooms || [];
  const roomShown = step === "rooms" && roomOpen && rooms.some((r) => r.id === activeRoomId);
  const listShown = step === "rooms" && !roomShown;
  useEffect(() => { if (!listShown) setTickMode(false); }, [listShown]);   // tick mode ends with the list
  const onTickChange = useCallback((on) => setTickMode(!!on), []);
  // View rules only, nothing stored; held by the copy on screen (the lead page also renders a CSS-hidden copy):
  // - on a phone the Hub's stage bar is hidden while a room is open or the list is in tick mode (spec S3p, N7);
  // - on a capture tab the lead header and the project bar scroll away (M7).
  const live = visible && open && !!reg && !store.disabled;
  useBodyData("data-register-room", live && step === "rooms" ? (roomShown ? "open" : tickMode ? "tick" : null) : null);
  useBodyData("data-register-open", live && CAPTURE_STEPS.has(step) ? "1" : null);
  // Phone: the tab row scrolls sideways and the active tab scrolls into view (spec F2). Only the row moves, never the page.
  useEffect(() => {
    const row = tabRowRef.current;
    const el = row?.querySelector('[aria-current="page"]');
    if (!row || !el || row.scrollWidth <= row.clientWidth) return;
    try {
      const r = row.getBoundingClientRect(), b = el.getBoundingClientRect();
      if (b.left < r.left) row.scrollLeft -= r.left - b.left + 12;
      else if (b.right > r.right) row.scrollLeft += b.right - r.right + 12;
    } catch { /* no layout */ }
  }, [step, open, loaded]);
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
    const n = ++ctxSeq.current;
    const r = await apiPut(`/api/register/leads/${lead.id}/facts`, { deliveryModel: v });
    if (!r.ok) { setFactError(r.error); return; }
    // A context request sent while this one was saving may predate it: read again rather than trust either answer.
    if (n !== ctxSeq.current) { loadContext(); return; }
    setContext(r.data.context);
  }
  // Returns patch()'s result (the saved lead, or null on failure) so StoryFields and the project-type select can say "Not saved".
  async function patchLead(partial) { const r = await patch(partial); loadContext(); return r; }
  async function onPortalItem(item, action, evidence) {
    if (action === "approve") { store.updateItem(item.id, { certainty: "client_approved", evidence }); await store.flush(); return; }
    await store.portal(action, [item]);
  }

  // The badge states the OPERATIONAL status of the record only — never "under contract" (that's a separate
  // state derived from the signed contract + baseline, shown truthfully in the Handover step). A Won-flipped
  // live project is not necessarily under a signed contract, so we don't imply it here. Office tabs only (spec F1).
  const modeBadge = !MODE_BADGE_STEPS.has(step) ? null : info.mode === "project"
    ? (info.isPreconstruction ? { t: "Project record · pre-construction", c: "bg-primary/10 text-primary", h: "Kept on the project record before construction starts. Selections stay internal until they're issued. Contract, baseline and handover status are in the Handover step." }
      : { t: "Project record · live (Operations)", c: "bg-primary/10 text-primary", h: "A live project in Operations: approved selections change through variations. Contract, baseline, handover and client portal status are in the Handover step." })
    : { t: "Lead brief", c: "bg-page text-muted", h: "Kept on the lead until a project record exists, then moved onto it automatically." };
  const words = headerSaveWords(save, store.saveAt);
  const saveText = words.text;
  // Spec F1: 'Extension · Seacliff Park · Drawings DA rev 3 · 16 rooms', leaving out what isn't known yet.
  const subline = [
    context?.projectType ? PROJECT_TYPE_LABELS[context.projectType] : "",
    context?.identity?.suburb || "",
    reg?.meta.planRev ? `Drawings ${reg.meta.planRev}` : "",
    rooms.length ? `${rooms.length} room${rooms.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" · ");

  // Switched off for this lead (REGISTER_ENABLED / REGISTER_PILOT_LEADS): the pre-register lists, exactly as before.
  if (store.disabled) return <div ref={rootRef}>{LEGACY_BY_STAGE[stage] && <LegacyScheduleRows lead={lead} patch={patch} variant={LEGACY_BY_STAGE[stage]} />}</div>;
  if (!loaded && !store.error) return <div ref={rootRef} />; // first load — nothing shows until the switch is known

  return (
    // Every ⚑ below (PromptRow in older screens passes no reg/context) reads the register, Sales context and staff member here.
    <NeedsActionProvider reg={reg} context={context} actor={profile}>
    {/* data-register-frame carries --register-top, the offset the register's sticky bars sit under (index.css); in the
        full-width workspace it is that workspace's own bar. !mt-0: a parent's space-y margin must not push the fixed
        workspace down (P2). */}
    <div ref={rootRef} data-register-frame="" data-register-expanded={expanded ? "" : undefined}
      style={expanded ? { "--register-top": `${expandBarH}px` } : undefined}
      className={expanded ? "fixed inset-0 z-40 !mt-0 overflow-y-auto bg-page px-2 py-3 sm:px-6 sm:py-4" : "-mx-3 sm:mx-0"}>
      <div className={`rounded-card border border-hairline bg-surface ${expanded ? "mx-auto max-w-[1180px]" : ""}`} data-testid="register-workshop">
      {expanded && (
        <div ref={expandBarRef} className="sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-hairline bg-surface px-4 py-1 text-[11px]">
          <span className="font-semibold text-ink">{context?.identity?.clientName || lead.name || "This project"}</span>
          {context?.identity?.siteAddress && <span className="text-muted">{siteLine(context.identity.siteAddress, context.identity.suburb)}</span>}
          <span className="text-muted">Stage: {STAGES.find((s) => s.id === context?.stage)?.label || stage}</span>
          <span className="text-muted">Drawings: {reg?.meta.planRev || "—"}</span>
          <button type="button" onClick={() => setExpanded(false)} className="ml-auto inline-flex min-h-[44px] items-center rounded-lg border border-hairline px-3 text-ink hover:bg-page" data-testid="register-exit-expand">Exit full width ✕</button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-bold text-primary">Project brief</p>
            {open && modeBadge && <span title={modeBadge.h} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${modeBadge.c}`} data-testid="register-mode">{modeBadge.t}</span>}
          </div>
          {subline && <p className="truncate text-[12px] text-muted" data-testid="register-subline">{subline}</p>}
        </div>
        <div className="flex items-center gap-2">
          {/* On a room screen the save state lives in the room bar, not here (spec S3 correction). */}
          {saveText && !(open && roomShown) && <span className={`text-[12px] ${words.cls}`} data-testid="register-save-state">{saveText}</span>}
          {open && <button type="button" onClick={() => store.flush()} disabled={save.state === "saving"} className="min-h-[44px] rounded-lg border border-hairline px-3 text-xs font-semibold text-ink hover:bg-page disabled:opacity-40">Save</button>}
          {open && (
            <button type="button" onClick={() => setActionsOpen("next_issue")} className="relative inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-hairline px-3 text-xs font-semibold text-ink hover:bg-page" data-testid="actions-pill"
              aria-label={`Actions ${actions.count}${actions.unnamed > 0 ? ", some have no one named" : ""}`}
              title={actions.unnamed ? `${actions.unnamed} with no one named yet` : "Everything waiting on someone"}>
              Actions {actions.count}
              {actions.unnamed > 0 && <span className="h-2 w-2 rounded-full bg-warning" aria-hidden="true" />}
            </button>
          )}
          {open && !expanded && <button type="button" onClick={() => setExpanded(true)} className="hidden min-h-[44px] items-center rounded-lg border border-hairline px-3 text-xs font-semibold text-ink hover:bg-page md:inline-flex" data-testid="register-expand" title="Open the register in a full-width workspace">⤢ Expand</button>}
          {open && reg && <BriefMenu reg={reg} context={context} lead={lead} mutateMeta={store.mutateMeta} />}
          {!open
            ? <button type="button" onClick={continueBrief} className="inline-flex min-h-[44px] items-center rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:opacity-90" data-testid="continue-brief">{reg && (reg.items.length || rooms.length) ? "Continue brief →" : "Start brief →"}</button>
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
            <button type="button" onClick={store.restoreDraft} className="inline-flex min-h-[44px] items-center rounded-lg border border-amber-300 bg-surface px-3 font-semibold text-amber-900 hover:bg-amber-100" data-testid="register-recovery-restore">Restore</button>
            <button type="button" onClick={store.discardDraft} className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-amber-800 hover:underline" data-testid="register-recovery-discard">Discard</button>
          </span>
        </div>
      )}

      {open && (
        <>
          {store.error && <p className="px-4 py-3 text-sm text-red-600">{store.error}</p>}
          {store.notices.map((n, i) => (
            <div key={i} className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 pl-4 pr-1 text-[11px] text-amber-900">
              <span className="py-1.5">{n}</span>
              <button type="button" onClick={() => store.dismissNotice(i)} aria-label="Dismiss" title="Dismiss"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-base text-amber-700 hover:bg-amber-100">×</button>
            </div>
          ))}
          {info.promotion?.ok && !info.promotion.alreadyPromoted && (
            <div className="border-b border-primary/20 bg-primary/5 px-4 py-1.5 text-[11px] text-primary">This brief was moved onto the project record ({info.promotion.selections} selections staged internally, {info.promotion.scopeItems} scope/requirement/action items). Nothing was sent to the client.</div>
          )}
          {info.promotion && !info.promotion.ok && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-900">The project record exists but the brief couldn&apos;t be moved onto it yet ({info.promotion.reason}). Your work is safe on the lead and will move automatically next time.</div>
          )}
          {factError && <p className="border-b border-red-200 bg-red-50 px-4 py-1.5 text-[11px] text-red-700">{factError}</p>}

          <nav ref={tabRowRef} aria-label="Project brief steps" className="flex items-center gap-1 overflow-x-auto border-b border-hairline px-3 py-2 sm:flex-wrap">
            {steps.map((s, k) => (
              <span key={s.key} className="contents">
                {s.office && !steps[k - 1]?.office && <span className="mx-1 h-5 w-px bg-hairline" aria-hidden="true" />}
                <button type="button" onClick={() => { gotoStep(s.key); if (s.key === "rooms") setRoomOpen(false); }} data-testid={`step-${s.key}`}
                  aria-current={step === s.key ? "page" : undefined}
                  className={`min-h-[44px] shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${step === s.key ? "bg-primary text-white" : s.office ? "text-muted hover:bg-page hover:text-ink" : "border border-hairline text-ink hover:bg-page"}`}>
                  {s.label}
                </button>
              </span>
            ))}
          </nav>

          <div className="p-2 sm:p-4">
            {(store.loading && !reg) && <p className="text-sm text-muted">Loading the brief…</p>}
            {reg && step === "context" && (
              <ProjectStep reg={reg} context={context} lead={lead} stage={stage} actor={profile} patchLead={patchLead} reloadContext={reloadContext} setDeliveryModel={setDeliveryModel}
                mutateMeta={store.mutateMeta} upsertItem={store.upsertItem} updateItem={store.updateItem} deleteItem={store.deleteItem} addItem={store.addItem} saveState={store.saveStateOf} onOpenRecord={(id) => setRecordDrawer({ kind: "record", ids: [id] })} />
            )}
            {reg && (step === "whole_house" || step === "site") && (
              <SectionStep section={step === "site" ? "site" : "project"} reg={reg} context={context} stage={stage} actor={profile} onPortalItem={onPortalItem}
                upsertItem={store.upsertItem} updateItem={store.updateItem} deleteItem={store.deleteItem} saveState={store.saveStateOf} mutateMeta={store.mutateMeta} />
            )}
            {reg && listShown && (
              <RoomsList reg={reg} context={context} mutateMeta={store.mutateMeta} replaceItems={store.replaceItems} openRoom={openRoom} readOnly={false}
                onTickChange={onTickChange} />
            )}
            {reg && roomShown && (
              <RoomScreen reg={reg} context={context} stage={stage} roomId={activeRoomId} actor={profile} upsertItem={store.upsertItem} updateItem={store.updateItem}
                deleteItem={store.deleteItem} addItem={store.addItem} replaceItems={store.replaceItems} mutateMeta={store.mutateMeta} saveState={store.saveStateOf}
                metaState={store.metaState} saveAt={store.saveAt} onOpenRecord={(id, opts) => setRecordDrawer({ kind: "record", ids: [id], ...(opts?.details ? { details: true } : {}) })}
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
