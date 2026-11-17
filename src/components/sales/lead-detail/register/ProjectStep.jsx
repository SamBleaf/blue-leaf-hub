/**
 * ProjectStep — "The project" (REGISTER_SCREENS_SPEC.md S1). In a meeting: record the client's story and budget in their
 * words, see what public mapping says about the site, name the architect and set the drawing basis, on one screen.
 *
 *   R1 what the architect's brief is still missing (each gap scrolls to its field and focuses it; hidden at zero;
 *      a sticky one-liner on a phone)
 *   R2 client · site · project type · delivery model (tap to change) · PTSA, and "Change in Sales ›"
 *   R3 The client's story (StoryFields, saved to the lead) with Top priorities (the P-005 record)
 *   R4 Site and planning: public mapping, read only, "Re-check"; "During the works" (meta.occupancy); the earlier note
 *   R5 Design team (DesignTeamCard), with the earlier design-coordination note
 *   R6 Drawings: the drawing basis (meta.planRev) and the files with Blue Leaf
 *   R7 Who does what (construction management), collapsed: the management questions, unchanged
 *
 * Moved elsewhere: the room table (Rooms), "Areas in the project" (Site & existing). "Decisions before next milestone"
 * shows only when it already holds a record. No question codes on screen.
 *
 * focusKey ("vision", "must_haves", "budget", "architect", "planRev", …) scrolls to that field and focuses it on mount.
 * onOpenRecord(id), when given, opens a record in the edit drawer (access, the earlier notes); otherwise they open in place.
 * "Re-check" runs public mapping again for any staff member (POST …/site/recheck, rate-limited per lead on the server).
 * The site sheet (phone) and the delivery-model menu take focus when they open and hand it back on close; Escape closes
 * only the top one (overlayFlag.useEscapeLayer).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  makeItem, questionById, resolvePromptId, answerConfigFor, answerIsEditable, toggleOption, itemPatch, promptsFor, siteLine,
  DELIVERY_MODELS, PROJECT_TYPE_LABELS,
} from "../../../../lib/register.js";
import { clean, chipWords, recordWords } from "../../../../lib/briefModel.js";
import { PROJECT_TYPES } from "../../../../lib/salesPipeline.js";
import { apiPost, apiPut } from "../../../../lib/apiFetch.js";
import { useBodyFlag, useEscapeLayer } from "../../../../lib/overlayFlag.js";
import { projectGaps, prioritiesFromNote, siteRows, siteSummary, SHOW_IN_SALES, PHONE_MORE_KEYS } from "../../../../lib/projectStory.js";
import StoryFields, { Tick } from "./StoryFields.jsx";
import DesignTeamCard from "./DesignTeamCard.jsx";
import PromptRow, { RepeatRows } from "./PromptRow.jsx";
import { useDialogFocus, useNarrow } from "./useRoomUi.js";
import { contractFixed } from "../../../../lib/roomScreen.js";

const OCCUPANCY = [["vacant", "Moving out"], ["partly", "Partly lived in"], ["occupied", "Living there"]];
const card = "flex flex-col gap-3 rounded-card border border-hairline bg-surface p-4";
const cardTitle = "m-0 text-base font-semibold text-ink";
const textBtn = "focus-ring inline-flex min-h-[44px] flex-none items-center px-2 text-[13px] font-bold text-primary";
const capFirst = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const adelaideDay = (d = new Date()) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Adelaide" });
const RECHECK_FAILED = "Couldn't reach the mapping service. Nothing changed.";
const MENU_W = 256;
/** Where a fixed menu goes: under the element, kept 8 px inside the window. */
const menuPos = (el) => {
  const r = el?.getBoundingClientRect?.();
  return r ? { top: Math.round(r.bottom + 4), left: Math.round(Math.max(8, Math.min(r.left, window.innerWidth - MENU_W - 8))) } : null;
};
// A link inside a wrapping line keeps a 44 px tap area through padding, without making its line 44 px tall.
const inlineTap = "min-h-0 py-[11px] -my-[11px]";

/**
 * Items on a wrapping line with a "·" between them. Each separator rides at the front of its item and the line is shifted
 * left by the separator's width and clipped, so the separator at the start of every line falls outside: no line starts
 * or ends with a stray dot. items: [{ key, node, dot = true }]; dot false keeps the space without the dot.
 */
function DotLine({ items, className = "" }) {
  return (
    <div className={`min-w-0 flex-1 overflow-x-clip ${className}`}>
      <p className="m-0 -ml-[12px] flex flex-wrap items-center">
        {items.map((it) => (
          <span key={it.key} className="inline-flex min-w-0 max-w-full items-center whitespace-nowrap">
            <span aria-hidden="true" className="inline-block w-[12px] flex-none text-center">{it.dot === false ? "" : "·"}</span>
            {it.node}
          </span>
        ))}
      </p>
    </div>
  );
}

/** A muted line holding words recorded earlier, with a way to reword or remove them. */
function EarlierNote({ item, prefix, action, readOnly, updateItem, deleteItem, onOpenRecord }) {
  const [open, setOpen] = useState(false);
  const words = clean(item.description) || chipWords(item);
  if (!words) return null;
  const locked = contractFixed(item);   // locked or in the signed baseline: the server refuses a reword of either (N21)
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2.5 text-[13px] text-muted">
        <span className="min-w-0">{prefix}: “{words}”</span>
        {!readOnly && !locked && (
          <button type="button" onClick={() => (onOpenRecord ? onOpenRecord(item.id) : setOpen((o) => !o))} className={textBtn} aria-expanded={onOpenRecord ? undefined : open}>{action}</button>
        )}
      </div>
      {open && !onOpenRecord && (
        <div className="mt-1 space-y-2 rounded-lg border border-hairline bg-page p-3">
          <textarea defaultValue={item.description || ""} rows={2} aria-label="Reword the note"
            onBlur={(e) => { if (e.target.value !== (item.description || "")) updateItem(item.id, { description: e.target.value }); }}
            className="inp block w-full resize-y px-3 py-2 text-[16px] sm:text-[15px]" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] rounded-lg border border-hairline bg-surface px-3 text-sm font-semibold text-ink hover:bg-page">Done</button>
            <button type="button" onClick={() => { if (window.confirm("Remove this note?")) deleteItem(item.id); }} className="min-h-[44px] px-3 text-sm text-red-600 hover:underline">Remove this note</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Top priorities: the P-005 record's chips (up to 3), and the words noted earlier with "Use these". */
function Priorities({ reg, upsertItem, updateItem, readOnly }) {
  const q = questionById("P-005");
  const cfg = answerConfigFor("P-005");
  const item = reg.items.find((i) => !i.roomId && resolvePromptId(i.promptKey) === "P-005" && !i.overridesDefaultId) || null;
  if (!cfg) return null;
  const seed = { itemKind: q?.itemKind || "requirement", category: q?.category || "notes", promptKey: "P-005", section: "project", technicalStatus: q?.technical || "not_required", responsibility: q?.owner || "" };
  const base = item || makeItem(seed);
  const options = cfg.options || [];
  const max = cfg.max || 3;
  const on = new Set((base.answer?.selected || []).filter((e) => !e.stale).map((e) => (e.path || [])[0] || e.optionId));
  const editable = !readOnly && answerIsEditable(base.answer);
  const write = (partial) => (item ? updateItem(item.id, partial) : upsertItem(seed, partial));
  const earlier = clean(base.description);
  const plan = earlier ? prioritiesFromNote(base.description, options, [...on], max) : null;
  const canUse = !!plan && (plan.add.length > 0 || clean(plan.rest) !== earlier);
  function useThese() {
    let answer = base.answer;
    for (const id of plan.add) answer = toggleOption(cfg, answer, [id]);
    write({ ...itemPatch(base, cfg, answer), description: plan.rest });
  }
  return (
    <div role="group" aria-label="Top priorities (pick up to 3)">
      <p className="mb-1.5 text-[13px] text-muted">Top priorities (pick up to 3)</p>
      {readOnly ? (
        <p className={`text-[15px] ${on.size ? "text-ink" : "text-muted"}`}>{options.filter((o) => on.has(o.id)).map((o) => o.label).join(", ") || "None chosen"}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((o, k) => {
            const chosen = on.has(o.id);
            return (
              <button key={o.id} type="button" aria-pressed={chosen} data-focus-key={k === 0 ? "priorities" : undefined} disabled={!editable || (!chosen && on.size >= max)}
                onClick={() => write(itemPatch(base, cfg, toggleOption(cfg, base.answer, [o.id])))}
                className={`focus-ring inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${chosen ? "border-primary bg-primary font-semibold text-white" : "border-hairline bg-surface text-ink hover:bg-page"}`}>
                {chosen && <Tick />}{o.label}
              </button>
            );
          })}
        </div>
      )}
      {earlier && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 text-[13px] text-muted">
          <span>Noted earlier: {earlier}</span>
          {editable && canUse && <button type="button" onClick={useThese} className={textBtn}>Use these</button>}
        </div>
      )}
      {clean(base.answer?.clientNote) && <p className="mt-1 text-[13px] text-muted">Note for the client: {clean(base.answer.clientNote)}</p>}
    </div>
  );
}

/**
 * Delivery model, tappable in the identity line: a 4-option menu saved through the facts endpoint. A bottom sheet on a
 * phone; wider up it sits under the button in fixed position (so the identity line's clipping never cuts it) and follows
 * the button while the page scrolls. It takes focus on open and hands it back on close; Escape closes it.
 */
function DeliveryModel({ value, onPick, readOnly }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btn = useRef(null);
  const menu = useRef(null);
  const narrow = useNarrow();
  useDialogFocus(menu, open, btn);
  useEscapeLayer(open, () => setOpen(false));
  useBodyFlag("register-overlay-open", open && narrow);
  const place = () => { const p = menuPos(btn.current); if (p) setPos(p); };
  useEffect(() => {
    if (!open || narrow) return undefined;
    const follow = () => { const p = menuPos(btn.current); if (p) setPos(p); };
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => { window.removeEventListener("scroll", follow, true); window.removeEventListener("resize", follow); };
  }, [open, narrow]);
  const words = DELIVERY_MODELS[value] || "Delivery model not set";
  if (readOnly) return <span>{DELIVERY_MODELS[value] || "Delivery model not set"}</span>;
  return (
    <span className="inline-block">
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`${words}, change delivery model`}
        onClick={() => { if (!open) place(); setOpen((o) => !o); }}
        className={`focus-ring ${inlineTap} text-[13px] leading-[22px] text-muted underline decoration-dotted underline-offset-[3px]`}>{words}</button>
      {open && (
        <>
          <button type="button" aria-label="Close menu" tabIndex={-1} onClick={() => setOpen(false)} className={`fixed inset-0 z-40 cursor-default ${narrow ? "bg-black/30" : "bg-transparent"}`} />
          <span ref={menu} role="menu" aria-label="Delivery model" tabIndex={-1} style={narrow ? undefined : { top: pos.top, left: pos.left, width: MENU_W }}
            className={`fixed z-50 block overflow-hidden border border-hairline bg-surface outline-none ${narrow
              ? "inset-x-0 bottom-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)] shadow-2xl"
              : "rounded-lg shadow-lg"}`}>
            {Object.entries(DELIVERY_MODELS).map(([k, l]) => (
              <button key={k} type="button" role="menuitemradio" aria-checked={value === k} onClick={() => { setOpen(false); if (k !== value) onPick(k); }}
                className="flex min-h-[44px] w-full items-center gap-2 px-3 text-left text-sm text-ink hover:bg-page">
                <span className="w-4 text-primary">{value === k && <Tick />}</span>{l}
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  );
}

/** Phone: the full Site and planning card as a bottom sheet. Takes focus, hands it back, closes on Escape. */
function SiteSheet({ onClose, returnTo, children }) {
  const box = useRef(null);
  useDialogFocus(box, true, returnTo);
  useEscapeLayer(true, onClose);
  useBodyFlag("register-overlay-open", true);
  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-label="Site and planning">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default bg-black/30" />
      <div ref={box} tabIndex={-1} className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-2xl outline-none">
        {children}
      </div>
    </div>
  );
}

export default function ProjectStep({
  reg, context, lead, stage, actor, patchLead, reloadContext, setDeliveryModel, mutateMeta, upsertItem, updateItem, deleteItem, addItem: _addItem, saveState,
  focusKey, readOnly = false, onOpenRecord,
}) {
  const rootRef = useRef(null);
  const siteRowRef = useRef(null);
  const meta = reg.meta;
  const [storyMore, setStoryMore] = useState(false);
  const [gapList, setGapList] = useState(false);
  const [siteSheet, setSiteSheet] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [mgmtOpen, setMgmtOpen] = useState(false);
  const [siteMsg, setSiteMsg] = useState(null);
  const [typeError, setTypeError] = useState(null);
  const narrow = useNarrow();
  const gaps = useMemo(() => projectGaps(reg, context), [reg, context]);

  const projectType = context?.projectType || lead.project_type || "";
  const deliveryModel = context?.deliveryModel || "";
  const ctx = { projectType, deliveryModel, renovationOverlay: meta.renovationOverlay, stage };
  const records = (qid) => reg.items.filter((i) => !i.roomId && resolvePromptId(i.promptKey) === qid && !i.overridesDefaultId);
  // The management questions follow the delivery model; one that already holds a record still shows under any model.
  const mgmtLive = promptsFor("mgmt", ctx);
  const mgmt = mgmtLive.length ? mgmtLive
    : promptsFor("mgmt", { ...ctx, deliveryModel: "construction_management", showDetail: true }).filter((q) => records(q.id).length > 0);
  const first = (qid) => records(qid)[0] || null;
  const access = first("W-001");
  const earlierSite = [...records("W-007"), ...records("P-008")];
  const designNote = first("M-001");
  const decisions = records("P-009");

  // Scroll to a field and focus it (the iPad keyboard opens). Fields behind "More about the client" are opened first.
  function focusField(key) {
    const find = () => [...(rootRef.current?.querySelectorAll(`[data-focus-key="${key}"]`) || [])].find((x) => x.getClientRects().length > 0);
    const go = (el) => { el.focus({ preventScroll: true }); el.scrollIntoView({ behavior: "smooth", block: "center" }); };
    const now = find();
    if (now) { go(now); return; }
    if (PHONE_MORE_KEYS.includes(key)) setStoryMore(true);
    requestAnimationFrame(() => requestAnimationFrame(() => { const el = find(); if (el) go(el); }));
  }
  const focusedFor = useRef(null);
  useEffect(() => {
    if (!focusKey || !context || focusedFor.current === focusKey) return;
    focusedFor.current = focusKey;
    focusField(focusKey);
  }, [focusKey, context]);

  async function setProjectType(v) {
    setTypeError(null);
    if (!v) return;
    if (context?.owner === "job") {
      const r = await apiPut(`/api/register/leads/${lead.id}/facts`, { projectType: v });
      if (!r.ok) setTypeError(r.error || "Not saved — try again.");
      reloadContext?.();
    } else {
      const r = await patchLead({ project_type: v });
      if (r === null || r === false) setTypeError("Not saved — try again.");
    }
  }
  // The server picks the job (else the lead), and skips a lookup under 10 minutes old: "Updated" names the lookup's day.
  async function recheck() {
    setSiteMsg("Checking public mapping…");
    const r = await apiPost(`/api/register/leads/${lead.id}/site/recheck`, {});
    if (r.ok) {
      const at = r.data?.context?.site?.enrichedAt;
      setSiteMsg(`Updated ${adelaideDay(at && Number.isFinite(Date.parse(at)) ? new Date(at) : new Date())}`);
      reloadContext?.();
    } else setSiteMsg(r.network ? RECHECK_FAILED : r.error || RECHECK_FAILED);
  }
  const showInSales = (what) => document.dispatchEvent(new CustomEvent(SHOW_IN_SALES, { detail: what }));

  const renderPrompt = (q, sectionKey) => {
    const seed = { itemKind: q.itemKind, category: q.category, promptKey: q.id, section: sectionKey, technicalStatus: q.technical, responsibility: q.owner || "" };
    if (answerConfigFor(q.id)?.repeat) {
      return <RepeatRows key={q.id} question={q} items={records(q.id)} seed={seed} actor={actor} readOnly={readOnly} saveState={saveState} upsertItem={upsertItem} updateItem={updateItem} deleteItem={deleteItem} />;
    }
    const item = first(q.id);
    return (
      <PromptRow key={q.id} question={q} item={item} seed={seed} actor={actor} readOnlyReason={readOnly ? "Read-only" : null} saveState={saveState}
        onChange={(partial) => (item ? updateItem(item.id, partial) : upsertItem(seed, partial))}
        onDelete={item && !readOnly ? () => deleteItem(item.id) : null} />
    );
  };

  if (!context) return <p className="px-2 py-3 text-sm text-muted">Loading the project…</p>;

  const id = context.identity || {};
  const site = context.site || {};
  const rows = siteRows(site, access ? recordWords(access).replace(/\.$/, "") : "");
  // Any staff member can run public mapping again (the server rate-limits it per lead); read-only viewers see the values.
  const canRecheck = !readOnly;
  const n = gaps.length;
  const gapCount = `${n} gap${n === 1 ? "" : "s"}`;
  const drawings = context.drawings || [];
  const planRev = meta.planRev || "";
  const siteGrid = (
    <dl className="m-0 flex flex-col">
      {rows.map((r, k) => (
        <div key={r.key} className={`grid min-h-[40px] grid-cols-[120px_minmax(0,1fr)] items-center gap-2 border-t border-hairline py-1.5 sm:grid-cols-[150px_minmax(0,1fr)] ${k === rows.length - 1 ? "border-b" : ""}`}>
          <dt className="text-[13px] text-muted">{r.label}</dt>
          <dd className={`m-0 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm ${r.muted ? "text-muted" : "text-ink"}`}>
            {r.chip && <span className="inline-flex h-[26px] items-center rounded-full bg-amber-50 px-2.5 text-[12px] font-bold text-amber-800">{r.chip}</span>}
            {r.link && access ? (
              <button type="button" aria-expanded={onOpenRecord ? undefined : accessOpen}
                onClick={() => { setSiteSheet(false); if (onOpenRecord) onOpenRecord(access.id); else setAccessOpen((o) => !o); }}
                className="focus-ring min-h-[44px] text-left text-primary underline underline-offset-2">{r.text}</button>
            ) : <span>{r.text}</span>}
            {r.detail && <span className="text-[13px] text-muted">{r.detail}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );

  return (
    <div ref={rootRef} className="mx-auto flex w-full max-w-[760px] flex-col gap-3" data-testid="project-step">
      {/* R1 · the gaps, where they are fixed */}
      {n > 0 && (
        <>
          <div role="status" className="hidden min-h-[48px] items-center gap-4 rounded-card border border-warning bg-amber-50 px-4 py-[13px] sm:flex" data-testid="project-gaps">
            <DotLine className="text-sm leading-[22px] text-ink" items={[
              { key: "lead", dot: false, node: <span>Still missing for the architect&apos;s brief:</span> },
              ...gaps.map((g, i) => ({ key: g.key, dot: i > 0, node: (
                <button type="button" onClick={() => focusField(g.key)} className={`focus-ring ${inlineTap} font-bold text-amber-800 underline underline-offset-2`}>{g.label}</button>
              ) })),
            ]} />
            <span className="flex-none text-[13px] font-bold text-amber-800">{gapCount}</span>
          </div>
          <div className="sticky top-[65px] z-20 -mx-2 sm:hidden md:top-0">
            <button type="button" onClick={() => setGapList((o) => !o)} aria-expanded={gapList}
              className="flex min-h-[44px] w-full items-center justify-between border-y border-warning bg-amber-50 px-4 text-left text-sm font-bold text-amber-800">
              {gapCount} for the architect&apos;s brief <span aria-hidden="true">›</span>
            </button>
            {gapList && (
              <div className="border-b border-warning bg-surface shadow-md">
                {gaps.map((g) => (
                  <button key={g.key} type="button" onClick={() => { setGapList(false); focusField(g.key); }} className="block min-h-[44px] w-full px-4 text-left text-sm text-ink hover:bg-page">{capFirst(g.label)}</button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* R2 · identity line */}
      <div className="flex min-h-[36px] flex-wrap items-center justify-between gap-x-3 text-[13px] leading-[22px] text-muted">
        <DotLine items={[
          id.clientName ? { key: "c", node: <span className="min-w-0 truncate">{id.clientName}</span> } : null,
          id.siteAddress || id.suburb ? { key: "s", node: <span className="min-w-0 truncate">{siteLine(id.siteAddress, id.suburb)}</span> } : null,
          { key: "t", node: projectType ? <span>{PROJECT_TYPE_LABELS[projectType] || capFirst(projectType.replace(/_/g, " "))}</span>
            : readOnly ? <span>Project type not set</span> : (
              <select value="" onChange={(e) => setProjectType(e.target.value)} aria-label="Set project type" className="inp my-0.5 min-h-[44px] px-2 text-[16px] sm:text-[13px]">
                <option value="">Set project type…</option>
                {PROJECT_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) },
          { key: "d", node: <DeliveryModel value={deliveryModel} onPick={(v) => setDeliveryModel(v)} readOnly={readOnly} /> },
          context.commercial?.ptsaStatus ? { key: "p", node: <span>PTSA {String(context.commercial.ptsaStatus).replace(/_/g, " ")}</span> } : null,
        ].filter(Boolean).map((it, i) => ({ ...it, dot: i > 0 }))} />
        <button type="button" onClick={() => showInSales("details")} className={`focus-ring ${inlineTap} flex-none text-[13px] font-bold text-primary`}>Change in Sales ›</button>
      </div>
      {typeError && <p className="-mt-2 text-[12px] text-red-600" role="alert">{typeError}</p>}

      {/* R3 · the client's story */}
      <section aria-labelledby="story-title" className={card}>
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h2 id="story-title" className={cardTitle}>The client&apos;s story</h2>
          <span className="text-[12px] text-muted">Saved to the client&apos;s details — Sales shows the same</span>
        </div>
        <StoryFields context={context} patchLead={patchLead} readOnly={readOnly} phoneCollapse more={storyMore} onMore={setStoryMore}
          renderPriorities={() => <Priorities reg={reg} upsertItem={upsertItem} updateItem={updateItem} readOnly={readOnly} />} />
      </section>

      {/* R4 · site and planning */}
      <section aria-labelledby="site-title" className={card}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="site-title" className={cardTitle}>Site and planning</h2>
            <span className="text-[12px] text-muted">From public mapping — a guide only. Check before relying on it.</span>
          </div>
          {canRecheck && <button type="button" onClick={recheck} disabled={siteMsg === "Checking public mapping…"} className={`${textBtn} -my-1.5 disabled:opacity-50`}>Re-check</button>}
        </div>
        {siteMsg && <p className="-mt-1 text-[12px] text-muted" role="status">{siteMsg}</p>}
        <button ref={siteRowRef} type="button" aria-haspopup="dialog" onClick={() => setSiteSheet(true)} className="flex min-h-[56px] w-full items-center justify-between gap-2 border-y border-hairline text-left text-sm text-ink sm:hidden">
          <span className="min-w-0">{siteSummary(site)}</span><span aria-hidden="true" className="text-muted">›</span>
        </button>
        <div className="hidden sm:block">{siteGrid}</div>
        {accessOpen && access && !onOpenRecord && (
          <PromptRow question={questionById("W-001")} item={access} actor={actor} readOnlyReason={readOnly ? "Read-only" : null} saveState={saveState}
            onChange={(partial) => updateItem(access.id, partial)} onDelete={readOnly ? null : () => deleteItem(access.id)} />
        )}
        <div role="group" aria-labelledby="works-label" className="flex flex-col">
          <span id="works-label" className="mb-1.5 text-[13px] text-muted">During the works</span>
          {readOnly ? (
            <p className={`text-[15px] ${meta.occupancy ? "text-ink" : "text-muted"}`}>{OCCUPANCY.find(([k]) => k === meta.occupancy)?.[1] || "Not recorded"}</p>
          ) : (
            <div className="flex h-11 overflow-hidden rounded-lg border border-hairline">
              {OCCUPANCY.map(([k, l], i) => {
                const on = meta.occupancy === k;
                return (
                  <button key={k} type="button" aria-pressed={on} data-focus-key={i === 0 ? "occupancy" : undefined} onClick={() => !on && mutateMeta({ occupancy: k })}
                    className={`focus-ring flex flex-1 items-center justify-center gap-1.5 text-sm ${i ? "border-l border-hairline" : ""} ${on ? "bg-primary font-bold text-white" : "bg-surface text-ink hover:bg-page"}`}>
                    {on && <Tick />}{l}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {earlierSite.map((it) => (
          <EarlierNote key={it.id} item={it} prefix="Earlier note" action="Tidy up" readOnly={readOnly} updateItem={updateItem} deleteItem={deleteItem} onOpenRecord={onOpenRecord} />
        ))}
      </section>

      {/* R5 · design team */}
      <DesignTeamCard lead={lead} context={context} reloadContext={reloadContext} readOnly={readOnly}>
        {designNote && (
          <div className="mt-2.5">
            <EarlierNote item={designNote} prefix="Noted earlier" action="Edit" readOnly={readOnly} updateItem={updateItem} deleteItem={deleteItem} onOpenRecord={onOpenRecord} />
          </div>
        )}
      </DesignTeamCard>

      {/* R6 · drawings */}
      <section aria-labelledby="drawings-title" className={card}>
        <h2 id="drawings-title" className={`${cardTitle} hidden sm:block`}>Drawings</h2>
        <div className="flex flex-col">
          <label htmlFor="project-plan-rev" className="mb-1.5 text-[13px] text-muted">Drawings this brief is based on</label>
          {readOnly ? (
            <p className={`text-[15px] ${planRev ? "text-ink" : "text-muted"}`}>{planRev || "Not recorded"}</p>
          ) : (
            <input id="project-plan-rev" data-focus-key="planRev" value={planRev} placeholder="e.g. DA rev 3"
              onChange={(e) => mutateMeta({ planRev: e.target.value })}
              onBlur={(e) => { const v = clean(e.target.value); if (v !== e.target.value) mutateMeta({ planRev: v }); }}
              className={`inp h-11 w-full px-3 text-[16px] sm:w-[280px] sm:text-[15px] ${clean(planRev) ? "" : "border-l-[3px] border-l-warning"}`} />
          )}
          {!clean(planRev) && !readOnly && <span className="mt-1 text-[12px] leading-4 text-amber-800">Not recorded — the brief can&apos;t be issued without it.</span>}
          <span className="mt-1.5 text-[12px] leading-4 text-muted">
            {drawings.length ? `${drawings.length} drawing file${drawings.length === 1 ? "" : "s"} with Blue Leaf` : "No drawing files with Blue Leaf yet"} ·{" "}
            <button type="button" onClick={() => showInSales("files")} className="focus-ring inline-flex min-h-[44px] items-center font-bold text-primary">Upload in Files ›</button>
          </span>
        </div>
      </section>

      {/* Decisions before next milestone: only when it already holds a record (Needs action replaces it). */}
      {decisions.length > 0 && questionById("P-009") && (
        <section className={card} aria-label="Decisions before next milestone">{renderPrompt(questionById("P-009"), "project")}</section>
      )}

      {/* R7 · who does what (construction management), closed by default */}
      {mgmt.length > 0 && (
        <div className="rounded-card border border-hairline bg-surface">
          <button type="button" aria-expanded={mgmtOpen} onClick={() => setMgmtOpen((o) => !o)}
            className="focus-ring flex min-h-[48px] w-full items-center gap-1.5 px-4 text-left text-[15px] font-bold text-ink">
            Who does what{deliveryModel && deliveryModel !== "other" ? ` (${DELIVERY_MODELS[deliveryModel].toLowerCase()})` : ""}
            <span aria-hidden="true" className={`text-muted transition ${mgmtOpen ? "rotate-90" : ""}`}>▸</span>
          </button>
          {mgmtOpen && <div className="space-y-2 border-t border-hairline p-3">{mgmt.map((q) => renderPrompt(q, "mgmt"))}</div>}
        </div>
      )}

      {/* Phone: the full Site and planning card as a bottom sheet (only while the screen is phone-width). */}
      {siteSheet && narrow && (
        <SiteSheet onClose={() => setSiteSheet(false)} returnTo={siteRowRef}>
            <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-hairline" aria-hidden="true" />
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className={cardTitle}>Site and planning</p>
                <p className="text-[12px] text-muted">From public mapping — a guide only. Check before relying on it.</p>
              </div>
              <button type="button" onClick={() => setSiteSheet(false)} aria-label="Close" className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-xl text-muted hover:bg-page">×</button>
            </div>
            {siteGrid}
            {canRecheck && <button type="button" onClick={recheck} disabled={siteMsg === "Checking public mapping…"} className={`${textBtn} mt-2 px-0 disabled:opacity-50`}>Re-check</button>}
            {siteMsg && <p className="text-[12px] text-muted" role="status">{siteMsg}</p>}
        </SiteSheet>
      )}
    </div>
  );
}
