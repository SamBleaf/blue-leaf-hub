/**
 * NeedsAction — the ⚑ on a record row and its "Needs action from…" sheet (docs/documents/REGISTER_SCREENS_SPEC.md S4).
 *
 *   ⚑ outline grey ... nothing needed
 *   ⚑ outline amber .. open (a technical check, a choice not decided, an element in or out) but no one asked
 *   pill ............. "<Who> · <By when>" once set; "✓ Done" once closed. Tapping either opens the sheet.
 *
 * Who, with the words prefilled and the by-when defaulted: 2 taps (⚑, a Who chip). The sheet stays open; every further
 * change saves on tap or blur. Every rule (what a tap writes, the prefill, the suggested chip) is in
 * src/lib/needsAction.js; what counts as open is briefModel.js openPoints / isOpenPoint, the rule that fills the
 * architect's brief. Nothing here sends anything.
 *
 * Mount NeedsActionFlag in ONE place in a row and keep it there: moving it elsewhere when its state changes remounts it
 * and closes its sheet (PromptRow keeps it in its header box and only restyles the box).
 *
 * reg / context / actor come from the props, else from <NeedsActionProvider> (the lead mounts it once round the
 * workshop), so rows deep inside older screens get them without new props.
 */
import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { makeItem, genId, questionById, resolvePromptId } from "../../../../lib/register.js";
import { clean, dueLabel } from "../../../../lib/briefModel.js";
import {
  whoChoices, whoKeyOf, suggestedWho, defaultDue, prefillWhat, setActionPatch, donePatch, checkedPatch, clearPatch, undoPatchFor,
  flagState, pillWords, isOverdue, addedWords, footnoteFor, subjectLine, isLocked,
} from "../../../../lib/needsAction.js";

const Scope = createContext(null);

/** Gives every ⚑ below it the register, the Sales context and the signed-in staff member. */
export function NeedsActionProvider({ reg, context, actor, children }) {
  return <Scope.Provider value={{ reg, context, actor }}>{children}</Scope.Provider>;
}

/** Popover on a tablet or desktop, bottom sheet on a phone (Tailwind's sm breakpoint). */
function useIsWide() {
  const query = "(min-width: 640px)";
  const [wide, setWide] = useState(() => (typeof window === "undefined" || !window.matchMedia ? true : window.matchMedia(query).matches));
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    on();
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return wide;
}

export function FlagIcon({ size = 20, className = "" }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}
function CloseIcon() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>;
}

/** One short message at a time ("Marked done. Undo"): 5 s with Undo, 3 s without. Never sends anything. */
export function ActionToast({ toast, onDismiss }) {
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; });
  const id = toast?.id;
  const ms = toast?.undo ? 5000 : 3200;
  useEffect(() => {
    if (!id) return undefined;
    const t = setTimeout(() => dismiss.current?.(), ms);
    return () => clearTimeout(t);
  }, [id, ms]);
  if (!toast || typeof document === "undefined") return null;
  return createPortal(
    // Top on a phone (the bottom sheet and the Hub's bottom bar sit low), bottom on a tablet or desktop.
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex justify-center px-4 sm:bottom-6 sm:top-auto">
      <div role="status" aria-live="polite" className="pointer-events-auto flex min-h-[44px] max-w-full items-center gap-3 rounded-lg bg-ink px-4 text-sm text-white shadow-lg">
        <span>{toast.text}</span>
        {toast.undo && (
          <button type="button" onClick={() => { toast.undo(); dismiss.current?.(); }} className="focus-ring min-h-[44px] px-1 font-bold underline">Undo</button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * The ⚑ on a record row (44 px) and, once set, its pill. item is the record, or null for a question not answered yet:
 * then the first Who tap creates the record from seed (upsertItem(seed, partial)).
 */
export function NeedsActionFlag({ reg, context, item, seed, updateItem, upsertItem, readOnly, actor }) {
  const scope = useContext(Scope);
  const R = reg ?? scope?.reg, C = context ?? scope?.context, A = actor ?? scope?.actor;
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const btn = useRef(null);
  const seedId = useRef(null);
  if (!item && !seedId.current) seedId.current = seed?.id || genId();   // one id for this row, so a quick second tap can't make a twin
  const seedWithId = !item && seed ? { ...seed, id: seed.id || seedId.current } : null;
  const rec = item || (seedWithId ? makeItem(seedWithId) : null);
  if (!rec) return null;
  const state = flagState(item || null);
  const subject = subjectLine(R, rec);
  const close = () => { setOpen(false); btn.current?.focus(); };
  const toggle = () => setOpen((o) => !o);
  const pill = state === "set" || state === "done";
  const overdue = state === "set" && isOverdue(rec.actionDue);

  return (
    <>
      {pill ? (
        <button ref={btn} type="button" onClick={toggle} aria-haspopup="dialog" aria-expanded={open} data-testid={`needs-action-${rec.id}`}
          aria-label={state === "done" ? `Needs action: done. ${subject}` : `Needs action: ${pillWords(C, rec)}${overdue ? ", overdue" : ""}. ${subject}`}
          className="focus-ring inline-flex min-h-[44px] max-w-full items-center rounded-lg">
          {state === "done" ? (
            <span className="inline-flex h-7 items-center gap-1 rounded-full border border-hairline bg-page px-2.5 text-xs font-bold text-muted">✓ Done</span>
          ) : (
            <span className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full bg-warning/[0.12] px-2.5 text-xs font-bold text-ink">
              <FlagIcon size={14} className="shrink-0 text-amber-800" />
              <span className="truncate">{pillWords(C, rec)}</span>
              {overdue && <span className="rounded-full bg-red-50 px-1.5 text-[11px] font-bold text-red-700">Overdue</span>}
            </span>
          )}
        </button>
      ) : (
        <button ref={btn} type="button" onClick={toggle} aria-haspopup="dialog" aria-expanded={open} disabled={readOnly && state === "none"}
          aria-label={`Needs action from… ${subject}`} title={state === "open" ? "Open: no one has been asked yet" : "Needs action from…"} data-testid={`needs-action-${rec.id}`}
          className={`focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-surface disabled:opacity-40 ${state === "open" ? "border-warning text-amber-800" : "border-hairline text-muted hover:text-ink"} ${open ? "ring-2 ring-primary ring-offset-2" : ""}`}>
          <FlagIcon />
        </button>
      )}
      {open && (
        <NeedsActionSheet reg={R} context={C} actor={A} item={item || null} seed={seedWithId} updateItem={updateItem} upsertItem={upsertItem}
          readOnly={readOnly} anchor={btn} onClose={close} onNotify={setToast} />
      )}
      <ActionToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

const CHIP = "focus-ring inline-flex min-h-[44px] items-center justify-center rounded-full border text-[13px] leading-4 disabled:cursor-not-allowed disabled:opacity-40";
const LABEL = "text-xs font-bold uppercase tracking-[0.06em] text-muted";

/**
 * The sheet: a 360 px popover anchored to the ⚑ on a tablet or desktop, a bottom sheet on a phone (drag handle, at most
 * 90% high; swipe down, the scrim or X closes it). Nothing typed is lost on closing.
 *   extras: records asked as one point with item (two elements still in or out); each gets the same who and by-when.
 *   onNotify({ id, text, undo? }) shows a toast; onDone({ subject }) tells the Actions list a point closed.
 */
export function NeedsActionSheet({ reg, context, actor, item, seed, extras = [], updateItem, upsertItem, readOnly, anchor, onClose, onNotify, onDone, focusWhat }) {
  const wide = useIsWide();
  const ids = { title: useId(), sub: useId(), who: useId(), when: useId(), what: useId(), ref: useId() };
  const rec = item || (seed ? makeItem(seed) : null);
  const question = rec ? questionById(resolvePromptId(rec.promptKey)) : null;
  const choices = whoChoices(context);
  const state = flagState(item || null);
  const isSet = state === "set" || state === "done";
  const currentKey = isSet && rec ? whoKeyOf(context, rec) : null;
  const suggested = currentKey || !rec ? null : suggestedWho(rec, question);
  const savedWhat = clean(rec?.nextAction);
  const savedDue = rec?.actionDue || "";
  const prefill = rec ? prefillWhat(reg, rec) : "";
  const locked = isLocked(rec);
  const ro = !!readOnly || locked;
  const technical = rec?.technicalStatus === "needs_verification";

  const [what, setWhat] = useState(savedWhat || prefill);
  const [edited, setEdited] = useState(false);
  const [due, setDue] = useState(savedDue || defaultDue(currentKey || suggested));
  const [dueTouched, setDueTouched] = useState(!!savedDue);
  const [picking, setPicking] = useState(/^\d{4}-/.test(savedDue));
  const [checking, setChecking] = useState(false);
  const [refText, setRefText] = useState("");
  // Take up a value saved from elsewhere (the row's own controls) while the sheet is open.
  const [seen, setSeen] = useState({ what: savedWhat, due: savedDue });
  if (seen.what !== savedWhat || seen.due !== savedDue) {
    setSeen({ what: savedWhat, due: savedDue });
    if (savedWhat && savedWhat !== clean(what)) setWhat(savedWhat);
    if (savedDue && savedDue !== due) setDue(savedDue);
  }

  const box = useRef(null), whatRef = useRef(null), dateRef = useRef(null), refRef = useRef(null);
  const [pos, setPos] = useState(null);
  const [drag, setDrag] = useState(0);
  const dragFrom = useRef(null);

  const save = (patch) => {
    if (!patch || ro) return;
    if (item) updateItem?.(item.id, patch);
    else if (seed) upsertItem?.(seed, patch);
  };
  const saveExtras = (fn) => { if (ro) return; for (const x of extras) { const p = fn(x); if (p) updateItem?.(x.id, p); } };
  const subject = rec ? subjectLine(reg, rec, extras) : "";

  function saveWhat() {
    const text = clean(what);
    if (ro || !rec || !text || text === savedWhat) return;
    if (isSet) {
      // A new next action reopens a done one (the existing rule).
      save({ nextAction: text, resolved: false });
      if (edited) saveExtras(() => ({ nextAction: text, resolved: false }));
    } else if (!item && rec.itemKind === "action") {
      save({ description: text, nextAction: text });   // a new follow-up keeps its words, with no one named yet
    } else if (edited) {
      // Words typed before anyone is named aren't lost on closing: they wait under "No one named yet".
      save({ nextAction: text, resolved: false });
      saveExtras(() => ({ nextAction: text, resolved: false }));
    }
  }
  const close = () => { saveWhat(); onClose?.(); };
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });

  function chooseWho(c) {
    const text = clean(what);
    if (ro || !rec || !text) return;
    const nextDue = dueTouched ? due : defaultDue(c.key);
    setDue(nextDue);
    save(setActionPatch(rec, c, { what: text, due: nextDue }));
    saveExtras((x) => setActionPatch(x, c, { what: edited ? text : prefillWhat(reg, x), due: nextDue }));
    if (!currentKey || state === "done") onNotify?.({ id: genId(), text: addedWords(c, nextDue) });
  }
  function chooseDue(v) {
    if (ro) return;
    setDue(v);
    setDueTouched(true);
    if (isSet) { save({ actionDue: v }); saveExtras(() => ({ actionDue: v })); }
  }
  function markDone() {
    const before = undoPatchFor(rec, donePatch());
    save(donePatch());
    saveExtras(() => donePatch());
    onDone?.({ subject });
    onNotify?.({ id: genId(), text: "Marked done.", undo: () => { save(before); saveExtras(() => ({ resolved: false })); } });
  }
  function saveChecked() {
    const p = checkedPatch(rec, { ref: refText, by: actor?.full_name || actor?.email || "Blue Leaf" });
    if (!p) return;
    const before = undoPatchFor(rec, p);
    save(p);
    setChecking(false);
    setRefText("");
    onDone?.({ subject });
    onNotify?.({ id: genId(), text: "Marked checked.", undo: () => save(before) });
  }
  function clearAll() {
    if (ro || !rec) return;
    save(clearPatch(rec, question));
    saveExtras((x) => clearPatch(x));
    const next = { ...rec, ...clearPatch(rec, question) };
    setWhat(prefillWhat(reg, next));
    setEdited(false);
    setDue(defaultDue(suggestedWho(next, question)));
    setDueTouched(false);
    setPicking(false);
    setChecking(false);
  }

  // Place the popover under (or over) the ⚑, inside the window, and keep it there.
  useLayoutEffect(() => {
    if (!wide) return undefined;
    const place = () => {
      const a = anchor?.current?.getBoundingClientRect?.();
      const el = box.current;
      if (!a || !el) return;
      const vw = window.innerWidth, vh = window.innerHeight, w = Math.min(360, vw - 16), h = el.offsetHeight;
      const left = Math.min(Math.max(8, a.right - w + 24), vw - w - 8);
      let top = a.bottom + 10, below = true;
      if (top + h > vh - 8 && a.top - 10 - h >= 8) { top = a.top - 10 - h; below = false; }
      else if (top + h > vh - 8) top = Math.max(8, vh - 8 - h);
      const arrow = Math.min(Math.max(14, a.left + a.width / 2 - left - 7), w - 28);
      setPos((p) => (p && p.left === left && p.top === top && p.below === below && p.arrow === arrow && p.width === w ? p : { left, top, width: w, below, arrow }));
    };
    place();
    const ro2 = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    if (box.current) ro2?.observe(box.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { ro2?.disconnect(); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [wide, anchor]);

  // Outside tap and Escape close it (Escape doesn't also leave the full-width workspace).
  useEffect(() => {
    const onDown = (e) => {
      if (!wide) return;                       // the phone sheet has its own scrim
      if (box.current?.contains(e.target) || anchor?.current?.contains(e.target)) return;
      closeRef.current?.();
    };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); closeRef.current?.(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); window.removeEventListener("keydown", onKey, true); };
  }, [wide, anchor]);

  // Focus: the words when asked (a new follow-up), otherwise the sheet itself.
  useEffect(() => {
    if (focusWhat) whatRef.current?.focus(); else box.current?.focus();
  }, [focusWhat]);
  useEffect(() => {
    if (!picking || !dateRef.current || dateRef.current.value) return;
    dateRef.current.focus();
    try { dateRef.current.showPicker?.(); } catch { /* the native picker opens on the next tap instead */ }
  }, [picking]);
  useEffect(() => { if (checking) refRef.current?.focus(); }, [checking]);

  if (!rec || typeof document === "undefined") return null;
  const footnote = footnoteFor(rec, currentKey || suggested);
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(due);
  const noWords = !clean(what);

  const body = (
    <>
      <div className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-hairline pl-4 pr-1"
        onTouchStart={wide ? undefined : (e) => { dragFrom.current = e.touches[0].clientY; }}
        onTouchMove={wide ? undefined : (e) => { if (dragFrom.current != null) setDrag(Math.max(0, e.touches[0].clientY - dragFrom.current)); }}
        onTouchEnd={wide ? undefined : () => { const d = drag; dragFrom.current = null; setDrag(0); if (d > 80) close(); }}>
        <div className="min-w-0">
          <h2 id={ids.title} className="text-[15px] font-bold leading-5 text-ink">Needs action from…</h2>
          <p id={ids.sub} className="truncate text-[13px] leading-[17px] text-muted">{subject}</p>
        </div>
        <button type="button" aria-label="Close" onClick={close} className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:text-ink"><CloseIcon /></button>
      </div>

      {locked && <p className="mx-4 mt-3 rounded-lg border border-hairline bg-page px-3 py-2 text-[13px] text-ink">Locked by the contract — raise a variation.</p>}

      <div className="flex flex-col gap-4 p-4">
        <div role="group" aria-labelledby={ids.who} className="flex flex-col gap-2">
          <span id={ids.who} className={LABEL}>Who</span>
          {/* Three a row: two rows of three in the popover, the same on a phone. */}
          <div className="grid grid-cols-3 gap-1.5">
            {choices.map((c) => {
              const on = c.key === currentKey;
              const sug = c.key === suggested;
              return (
                <button key={c.key} type="button" aria-pressed={on} disabled={ro || noWords} onClick={() => chooseWho(c)} data-testid={`who-${c.key}`}
                  aria-label={`${c.label}${sug ? " (suggested)" : ""}`}
                  className={`${CHIP} min-w-0 flex-col px-2 py-1 text-center ${on ? "border-primary bg-primary font-bold text-white" : sug ? "border-2 border-primary bg-surface font-bold text-primary" : "border-hairline bg-surface text-ink hover:bg-page"}`}>
                  <span>{on && <span aria-hidden="true">✓ </span>}{c.short}</span>
                  {c.named && <span className={`max-w-full truncate text-[11px] font-normal ${on ? "text-white/90" : "text-muted"}`}>{c.named}</span>}
                  {sug && <span aria-hidden="true" className="text-[10px] font-bold leading-3 tracking-[0.04em]">suggested</span>}
                </button>
              );
            })}
          </div>
          {noWords && !ro && <p className="text-xs text-amber-800">Say what&apos;s needed first</p>}
        </div>

        <div role="group" aria-labelledby={ids.when} className="flex flex-col gap-2">
          <span id={ids.when} className={LABEL}>By when</span>
          <div className="flex flex-wrap items-center gap-2">
            {[["next_issue", "Next drawing issue"], ["next_meeting", "Next meeting"]].map(([v, l]) => (
              <button key={v} type="button" aria-pressed={due === v} disabled={ro} onClick={() => { setPicking(false); chooseDue(v); }}
                className={`${CHIP} px-3 ${due === v ? "border-primary bg-primary font-bold text-white" : "border-hairline bg-surface text-ink hover:bg-page"}`}>
                {due === v && <span aria-hidden="true" className="mr-1">✓</span>}{l}
              </button>
            ))}
            <button type="button" aria-pressed={isDate} disabled={ro} onClick={() => setPicking(true)}
              className={`${CHIP} px-3 ${isDate ? "border-primary bg-primary font-bold text-white" : "border-hairline bg-surface text-ink hover:bg-page"}`}>
              {isDate ? <><span aria-hidden="true" className="mr-1">✓</span>{dueLabel(due)}</> : "Pick a date…"}
            </button>
            {isDate && isOverdue(due) && <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">Overdue</span>}
          </div>
          {picking && (
            <input ref={dateRef} type="date" value={isDate ? due : ""} disabled={ro} aria-label="Pick a date"
              onChange={(e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) chooseDue(e.target.value); }}
              className="focus-ring h-11 w-full rounded-lg border border-hairline bg-surface px-3 text-base text-ink sm:w-56 sm:text-sm" />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={ids.what} className={LABEL}>What&apos;s needed</label>
          <input id={ids.what} ref={whatRef} type="text" value={what} disabled={ro} placeholder="Say what's needed…" data-testid="needs-action-what"
            onFocus={(e) => { const el = e.target; requestAnimationFrame(() => { try { el.setSelectionRange(0, el.value.length); } catch { /* not selectable */ } }); }}
            onChange={(e) => { setWhat(e.target.value); setEdited(true); }} onBlur={saveWhat}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            className="focus-ring h-11 w-full rounded-lg border border-hairline bg-surface px-3 text-base text-ink sm:text-[15px]" />
          {footnote && <p className="text-xs leading-[17px] text-muted">{footnote}</p>}
        </div>
      </div>

      {isSet && !ro && checking && (
        <div className="flex flex-col gap-2 border-t border-hairline px-4 py-3">
          <label htmlFor={ids.ref} className={LABEL}>Drawing or document reference</label>
          <div className="flex gap-2">
            <input id={ids.ref} ref={refRef} type="text" required value={refText} onChange={(e) => setRefText(e.target.value)} placeholder="e.g. A301 Rev D detail 4"
              onKeyDown={(e) => { if (e.key === "Enter") saveChecked(); }}
              className="focus-ring h-11 min-w-0 flex-1 rounded-lg border border-hairline bg-surface px-3 text-base text-ink sm:text-sm" />
            <button type="button" disabled={!clean(refText)} onClick={saveChecked} className="focus-ring h-11 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-40">Save</button>
          </div>
        </div>
      )}
      {isSet && !ro && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-hairline px-4 py-1.5">
          {state === "done" ? <span className="text-sm font-bold text-muted">✓ Done</span>
            : technical ? <button type="button" aria-expanded={checking} onClick={() => setChecking((v) => !v)} className="focus-ring h-11 rounded-lg border border-accent bg-surface px-4 text-sm font-bold text-accent hover:bg-page">Checked</button>
              : <button type="button" onClick={markDone} className="focus-ring h-11 rounded-lg border border-accent bg-surface px-4 text-sm font-bold text-accent hover:bg-page">Done</button>}
          <button type="button" onClick={clearAll} className="focus-ring h-11 rounded-lg px-3 text-sm text-muted hover:text-ink">Clear</button>
        </div>
      )}
    </>
  );

  const dialog = { role: "dialog", "aria-labelledby": ids.title, "aria-describedby": ids.sub, tabIndex: -1, "data-testid": "needs-action-sheet" };
  return createPortal(
    wide ? (
      <div ref={box} {...dialog} style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { left: -9999, top: 0, width: 360, visibility: "hidden" }}
        className="fixed z-[60] flex max-h-[calc(100vh-16px)] flex-col overflow-y-auto rounded-card border border-hairline bg-surface shadow-[0_12px_32px_rgba(26,26,46,0.16)] outline-none">
        {pos && (
          <span aria-hidden="true" style={{ left: pos.arrow }}
            className={`absolute h-3.5 w-3.5 rotate-45 border-hairline bg-surface ${pos.below ? "-top-[8px] border-l border-t" : "-bottom-[8px] border-b border-r"}`} />
        )}
        {body}
      </div>
    ) : (
      <div className="fixed inset-0 z-[60]">
        <div className="absolute inset-0 bg-ink/40" aria-hidden="true" onClick={close} />
        <div ref={box} {...dialog} aria-modal="true" style={drag ? { transform: `translateY(${drag}px)` } : undefined}
          className="absolute inset-x-0 bottom-0 flex max-h-[90vh] flex-col overflow-y-auto rounded-t-card bg-surface pb-[env(safe-area-inset-bottom)] shadow-xl outline-none">
          <div className="flex justify-center pt-2" aria-hidden="true"
            onTouchStart={(e) => { dragFrom.current = e.touches[0].clientY; }}
            onTouchMove={(e) => { if (dragFrom.current != null) setDrag(Math.max(0, e.touches[0].clientY - dragFrom.current)); }}
            onTouchEnd={() => { const d = drag; dragFrom.current = null; setDrag(0); if (d > 80) close(); }}>
            <span className="h-1.5 w-10 rounded-full bg-hairline" />
          </div>
          {body}
        </div>
      </div>
    ),
    document.body,
  );
}
