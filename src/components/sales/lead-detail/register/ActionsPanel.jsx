/**
 * ActionsPanel — the Actions list, opened from the header pill (docs/documents/REGISTER_SCREENS_SPEC.md S4 layout C).
 *
 * Everything waiting on someone, grouped by who in the order the architect reads it. The list IS openPoints() from
 * src/lib/briefModel.js (scope "next_issue" = the brief's numbered "Needed for the next drawing issue" list; "all" adds
 * the client's finish choices); this file never decides what is open. Each row:
 *   subject · place, then what's needed (or an amber prompt), tags, the by-when pill and a 44 px ✓
 *   ✓ closes it (a technical check asks for its drawing or document reference first) into "Done today", Undo for 5 s
 *   no one named: one tap on [Architect] [Engineer] [Energy assessor] [Client] [More…] names who
 *   the row body opens the record (onOpenRecord(id, ids)); a row with nothing asked yet opens the "Needs action from…"
 *   sheet at "What's needed" instead, as its words say; the pill and More… open the sheet too
 * "Copy list" copies plain text. Nothing is ever sent from the Hub.
 *
 * initialFilter: "next_issue" (the default) | "all" | "unnamed" — the next-issue list opened at its "No one named yet"
 * group, scrolled to and highlighted (the Documents step's "Name who").
 *
 * A 420 px right drawer on a tablet or desktop, a full-screen sheet on a phone. It renders in place (no portal), so the
 * record drawer opened from a row, mounted after it, sits on top of it and closing that drawer comes back to the list.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { genId } from "../../../../lib/register.js";
import { openPoints } from "../../../../lib/briefModel.js";
import {
  groupPoints, pointKey, pointSubject, pointLine, pointTags, copyListText, copiedWords, choiceByKey, setActionPatch, prefillWhat,
  defaultDue, donePatch, checkedPatch, undoPatchFor, isLocked, openingView, rowOpensSheet, INLINE_WHO_KEYS, WHO_CHOICES, WHOLE_JOB_ACTION_SEED,
  UNNAMED_GROUP,
} from "../../../../lib/needsAction.js";
import { NeedsActionSheet, ActionToast } from "./NeedsAction.jsx";

// The header pill's numbers live with the rules; exported here too so the pill and the panel come from one import.
// eslint-disable-next-line react-refresh/only-export-components -- a pure count for the header pill, beside the panel it opens
export { actionsSummary } from "../../../../lib/needsAction.js";

const omit = (obj, key) => { const next = { ...obj }; delete next[key]; return next; };
const TAG = { amber: "bg-warning/[0.12] text-amber-800", red: "border border-red-200 bg-red-50 text-red-700" };
// The inline who chips: a 44 px tap area round the drawn 36 px pill.
const INLINE_CHIP = "focus-ring group inline-flex min-h-[44px] items-center rounded-full";
const INLINE_PILL = "inline-flex h-9 items-center rounded-full border border-hairline bg-surface px-2.5 text-[13px] group-hover:bg-page";

function TickIcon() {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>;
}
function CloseIcon() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>;
}

/** Copy without the async clipboard (older iPads, http): a hidden text box. */
function copyByHand(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const done = document.execCommand("copy");
    ta.remove();
    return done;
  } catch { return false; }
}

/** One point. A row that has just moved group fades in (200 ms); one being closed or moved fades out first. */
function PointRow({ p, hint, fading, arrived, checking, refText, onRefText, onBody, onPill, onTick, onAssign, onMore, onCheckSave, onCheckCancel }) {
  const [shown, setShown] = useState(!arrived);
  useEffect(() => {
    if (shown) return undefined;
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, [shown]);
  const refId = useId();
  const line = pointLine(p);
  const tags = pointTags(p);
  const subject = pointSubject(p);
  const technical = p.item.technicalStatus === "needs_verification";
  const locked = isLocked(p.item);
  const unnamed = p.who.key === "none";
  return (
    <div data-testid={`action-row-${pointKey(p)}`}
      className={`grid min-h-[56px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-2.5 transition-opacity duration-200 motion-reduce:transition-none ${fading || !shown ? "opacity-0" : "opacity-100"}`}>
      <button type="button" onClick={onBody} className="focus-ring -mx-1 flex min-h-[44px] min-w-0 flex-col items-start justify-center gap-[3px] rounded-lg px-1 text-left hover:bg-page">
        <span className="text-sm leading-[19px] text-ink"><span className="font-bold">{subject}</span> <span className="text-[13px] text-muted">· {p.place.label}</span></span>
        <span className={`text-[13px] leading-[18px] ${line.tone === "amber" ? "text-amber-800" : "text-ink"}`}>{line.text}{hint ? " — tap to say what's needed" : ""}</span>
        {tags.map((t) => <span key={t.text} className={`mt-[3px] rounded-xl px-2 py-[3px] text-xs font-bold leading-4 ${TAG[t.tone]}`}>{t.text}</span>)}
        {locked && <span className="text-xs text-muted">Locked by the contract — raise a variation.</span>}
      </button>
      <div className="flex items-center gap-2">
        {p.due && (
          <button type="button" onClick={onPill} aria-label={`By ${p.by}. Change who, when or what`} className="focus-ring inline-flex min-h-[44px] items-center rounded-lg">
            <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full border border-hairline bg-surface px-2 text-xs font-bold text-muted">{p.by}</span>
          </button>
        )}
        {!locked && (
          <button type="button" onClick={onTick} aria-label={`${technical ? "Mark checked" : "Mark done"}: ${subject}`} aria-expanded={technical ? checking : undefined}
            className="focus-ring flex h-11 w-11 items-center justify-center rounded-lg border border-hairline bg-surface text-accent hover:bg-page">
            <TickIcon />
          </button>
        )}
      </div>
      {unnamed && !locked && (
        <div role="group" aria-label={`Who for ${subject}`} className="col-span-2 -my-1 flex flex-wrap gap-x-1.5">
          {INLINE_WHO_KEYS.map((k) => (
            <button key={k} type="button" onClick={() => onAssign(k)} data-testid={`assign-${k}`} className={INLINE_CHIP}>
              <span className={`${INLINE_PILL} text-ink`}>{WHO_CHOICES.find((c) => c.key === k).label}</span>
            </button>
          ))}
          <button type="button" onClick={onMore} className={INLINE_CHIP}><span className={`${INLINE_PILL} text-muted`}>More…</span></button>
        </div>
      )}
      {checking && (
        <div className="col-span-2 flex flex-col gap-1.5">
          <label htmlFor={refId} className="text-xs font-bold uppercase tracking-[0.06em] text-muted">Drawing or document reference</label>
          <div className="flex gap-2">
            <input id={refId} type="text" required autoFocus value={refText} onChange={(e) => onRefText(e.target.value)} placeholder="e.g. A301 Rev D detail 4"
              onKeyDown={(e) => { if (e.key === "Enter") onCheckSave(); if (e.key === "Escape") { e.stopPropagation(); onCheckCancel(); } }}
              className="focus-ring h-11 min-w-0 flex-1 rounded-lg border border-hairline bg-surface px-3 text-base text-ink sm:text-sm" />
            <button type="button" disabled={!refText.trim()} onClick={onCheckSave} className="focus-ring h-11 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-40">Save</button>
            <button type="button" onClick={onCheckCancel} className="focus-ring h-11 rounded-lg px-2 text-sm text-muted hover:text-ink">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ActionsPanel({ reg, context, updateItem, upsertItem, addItem, onOpenRecord, onClose, initialFilter, actor }) {
  const opening = openingView(initialFilter);
  const [filter, setFilter] = useState(opening.filter);
  // "unnamed": scroll to the "No one named yet" group, focus its header and highlight it for a moment.
  const [focusAsk, setFocusAsk] = useState(() => (opening.focusGroup ? { group: opening.focusGroup, n: 1 } : null));
  const [flash, setFlash] = useState(opening.focusGroup);
  const [seenFilter, setSeenFilter] = useState(initialFilter);
  if (seenFilter !== initialFilter) {
    setSeenFilter(initialFilter);
    setFilter(opening.filter);
    setFlash(opening.focusGroup);
    setFocusAsk(opening.focusGroup ? { group: opening.focusGroup, n: (focusAsk?.n || 0) + 1 } : null);
  }
  const listRef = useRef(null);
  const panelRef = useRef(null);
  const groupRefs = useRef({});
  const next = useMemo(() => (reg ? openPoints(reg, context, { scope: "next_issue" }) : []), [reg, context]);
  const all = useMemo(() => (reg ? openPoints(reg, context, { scope: "all" }) : []), [reg, context]);
  const points = filter === "all" ? all : next;
  const groups = groupPoints(points);
  const byId = useMemo(() => new Map((reg?.items || []).map((i) => [i.id, i])), [reg]);
  const latest = useRef(byId);
  useEffect(() => { latest.current = byId; });

  const [sheet, setSheet] = useState(null);       // { id, extraIds } for a record, or { seed } for a new whole-job action
  const anchor = useRef(null);
  const [checking, setChecking] = useState(null); // the point key with its reference field open
  const [refText, setRefText] = useState("");
  const [fading, setFading] = useState({});
  const [arrived, setArrived] = useState({});
  const [done, setDone] = useState([]);           // closed while this list was open: [{ key, subject }]
  const [doneOpen, setDoneOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  const titleId = useId();
  const head = useRef(null);
  const by = actor?.full_name || actor?.email || "Blue Leaf";

  // Open: focus the title, hold the page still; close: give focus back. Escape closes (a sheet open on top closes first).
  const sheetOpen = useRef(false);
  useEffect(() => { sheetOpen.current = !!sheet; }, [sheet]);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const before = typeof document !== "undefined" ? document.activeElement : null;
    head.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key !== "Escape" || sheetOpen.current) return;
      // A dialog opened on top (the record drawer from a row) closes first.
      const other = document.activeElement?.closest?.("[role='dialog']");
      if (other && !panelRef.current?.contains(other)) return;
      e.stopPropagation();
      closeRef.current?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); document.body.style.overflow = prev; before?.focus?.(); };
  }, []);
  // After the title takes focus on opening: the group asked for, at the top of the list.
  useEffect(() => {
    if (!focusAsk) return undefined;
    const sec = groupRefs.current[focusAsk.group], list = listRef.current;
    if (sec && list) {
      list.scrollTop = Math.max(0, sec.offsetTop);
      sec.querySelector("h3")?.focus({ preventScroll: true });
    }
    const t = setTimeout(() => setFlash(null), 2400);
    return () => clearTimeout(t);
  }, [focusAsk]);

  const save = (id, patch) => { if (patch) updateItem?.(id, patch); };
  const create = (seed, patch) => (upsertItem ? upsertItem(seed, patch) : addItem?.({ ...seed, ...patch }));
  const itemsOf = (p) => p.ids.map((id) => latest.current.get(id)).filter(Boolean);
  const fadeThen = (k, fn) => { setFading((f) => ({ ...f, [k]: true })); later(() => { fn(); setFading((f) => omit(f, k)); }, 200); };
  const openSheet = (p, el, focusWhat = false) => { anchor.current = el; setSheet({ id: p.ids[0], extraIds: p.ids.slice(1), focusWhat }); };
  const openRow = (p, el) => (rowOpensSheet(p) || !onOpenRecord ? openSheet(p, el, rowOpensSheet(p)) : onOpenRecord(p.ids[0], p.ids));

  function assign(p, key) {
    const c = choiceByKey(key, context);
    const k = pointKey(p);
    fadeThen(k, () => {
      for (const it of itemsOf(p)) save(it.id, setActionPatch(it, c, { what: prefillWhat(reg, it), due: defaultDue(key) }));
      setArrived((a) => ({ ...a, [k]: true }));
      later(() => setArrived((a) => omit(a, k)), 600);
    });
  }
  function closePoint(p, patchFor, words) {
    const k = pointKey(p), doneKey = `${k}:${genId()}`;
    const items = itemsOf(p);
    const undo = items.map((it) => [it.id, undoPatchFor(it, patchFor(it))]);
    setChecking(null);
    fadeThen(k, () => {
      for (const it of items) save(it.id, patchFor(it));
      setDone((d) => [{ key: doneKey, subject: `${p.place.label} · ${pointSubject(p)}` }, ...d]);
      setToast({ id: genId(), text: words, undo: () => { for (const [id, patch] of undo) save(id, patch); setDone((d) => d.filter((x) => x.key !== doneKey)); } });
    });
  }
  function tick(p) {
    const k = pointKey(p);
    if (p.item.technicalStatus === "needs_verification") { setChecking((c) => (c === k ? null : k)); setRefText(""); return; }
    closePoint(p, () => donePatch(), "Marked done.");
  }
  function saveChecked(p) {
    if (!refText.trim()) return;
    // A merged point's other records are elements in or out, not checks: they close as done.
    closePoint(p, (it) => (it.technicalStatus === "needs_verification" ? checkedPatch(it, { ref: refText, by }) : donePatch()), "Marked checked.");
  }
  async function copy() {
    const text = copyListText(points);
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch { copied = copyByHand(text); }
    setToast({ id: genId(), text: copied ? copiedWords(points.length) : "Couldn't copy the list on this device." });
  }

  const sheetItem = sheet ? byId.get(sheet.id || sheet.seed?.id) || null : null;
  const sheetExtras = (sheet?.extraIds || []).map((id) => byId.get(id)).filter(Boolean);
  const showSheet = !!sheet && (!!sheetItem || !!sheet.seed);
  const hintKey = pointKey(points.find((p) => pointLine(p).nothingAsked) || null);
  const seg = (on) => `focus-ring h-11 whitespace-nowrap px-3 text-[13px] ${on ? "bg-primary font-bold text-white" : "bg-surface text-ink hover:bg-page"}`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 hidden bg-ink/20 sm:block" aria-hidden="true" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="actions-panel"
        className="relative flex h-full w-full flex-col bg-surface shadow-xl sm:w-[420px] sm:border-l sm:border-hairline">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-hairline pl-4 pr-1">
          <h2 id={titleId} ref={head} tabIndex={-1} className="text-lg font-bold text-ink outline-none">Actions <span className="text-muted">· {points.length}</span></h2>
          <button type="button" aria-label="Close" onClick={onClose} className="focus-ring flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:text-ink"><CloseIcon /></button>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-2">
          <div role="group" aria-label="Show" className="flex overflow-hidden rounded-lg border border-hairline">
            <button type="button" aria-pressed={filter === "next_issue"} onClick={() => setFilter("next_issue")} className={`${seg(filter === "next_issue")} border-r border-hairline`} data-testid="actions-filter-next">Next drawing issue ({next.length})</button>
            <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")} className={seg(filter === "all")} data-testid="actions-filter-all">Everything open ({all.length})</button>
          </div>
          <button type="button" onClick={copy} disabled={!points.length} className="focus-ring h-11 whitespace-nowrap rounded-lg px-1 text-[13px] font-bold text-primary disabled:opacity-40">Copy list</button>
        </div>

        <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {!points.length && <p className="px-4 py-10 text-center text-sm text-muted">Nothing is waiting on anyone.</p>}
          {groups.map((g) => (
            <section key={g.key} ref={(n) => { groupRefs.current[g.key] = n; }} aria-label={`${g.label}, ${g.points.length}`} data-testid={`actions-group-${g.key}`}
              data-highlight={flash === g.key ? "true" : undefined}
              className={`transition duration-500 motion-reduce:transition-none ${flash === g.key ? "bg-warning/[0.06] ring-2 ring-inset ring-warning" : ""}`}>
              {/* Solid behind the sticky header, so rows scrolling under it don't show through the amber tint. */}
              <h3 tabIndex={-1} className={`sticky top-0 z-[1] flex h-9 items-center gap-2 border-y border-hairline px-4 text-xs font-bold uppercase tracking-[0.06em] outline-none ${g.key === UNNAMED_GROUP ? "bg-surface text-amber-800" : "bg-page text-muted"}`}>
                {g.key === UNNAMED_GROUP && <span aria-hidden="true" className="absolute inset-0 bg-warning/[0.12]" />}
                {g.key === UNNAMED_GROUP && <span aria-hidden="true" className="relative h-2 w-2 rounded-full bg-warning" />}
                <span className="relative">{g.label} · {g.points.length}</span>
              </h3>
              {g.points.map((p) => {
                const k = pointKey(p);
                return (
                  <PointRow key={k} p={p} hint={k === hintKey} fading={!!fading[k]} arrived={!!arrived[k]} checking={checking === k} refText={refText} onRefText={setRefText}
                    onBody={(e) => openRow(p, e.currentTarget)}
                    onPill={(e) => openSheet(p, e.currentTarget)} onMore={(e) => openSheet(p, e.currentTarget)}
                    onTick={() => tick(p)} onAssign={(key) => assign(p, key)} onCheckSave={() => saveChecked(p)} onCheckCancel={() => setChecking(null)} />
                );
              })}
            </section>
          ))}
          {done.length > 0 && (
            <section aria-label="Done today">
              <button type="button" aria-expanded={doneOpen} onClick={() => setDoneOpen((v) => !v)}
                className="focus-ring flex h-11 w-full items-center gap-2 border-b border-hairline px-4 text-left text-xs font-bold uppercase tracking-[0.06em] text-muted hover:bg-page">
                <span aria-hidden="true" className={`transition ${doneOpen ? "rotate-90" : ""}`}>▸</span>Done today ({done.length})
              </button>
              {doneOpen && (
                <ul>
                  {done.map((d) => <li key={d.key} className="border-b border-hairline px-4 py-2.5 text-[13px] text-muted">✓ {d.subject}</li>)}
                </ul>
              )}
            </section>
          )}
        </div>

        <div className="flex min-h-[56px] shrink-0 items-center border-t border-hairline bg-surface px-2 pb-[env(safe-area-inset-bottom)]">
          <button type="button" data-testid="actions-add-whole-job"
            onClick={(e) => { anchor.current = e.currentTarget; setSheet({ seed: { ...WHOLE_JOB_ACTION_SEED, id: genId() }, focusWhat: true }); }}
            className="focus-ring h-11 rounded-lg px-2 text-sm font-bold text-primary hover:bg-page">+ Needs action for the whole job</button>
        </div>
      </div>

      {showSheet && (
        <NeedsActionSheet key={sheet.id || sheet.seed.id} reg={reg} context={context} actor={actor} item={sheetItem} seed={sheetItem ? null : sheet.seed}
          extras={sheetExtras} updateItem={updateItem} upsertItem={create} anchor={anchor} focusWhat={!!sheet.focusWhat}
          onClose={() => setSheet(null)} onNotify={setToast} onDone={({ subject }) => setDone((d) => [{ key: genId(), subject }, ...d])} />
      )}
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
