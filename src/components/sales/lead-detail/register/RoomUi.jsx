/**
 * RoomUi — the small presentational pieces the Rooms list and the room screen share (REGISTER_SCREENS_SPEC.md S2, S3,
 * S3p): chips, a segmented control, menus that are popovers on a tablet and bottom sheets on a phone, a toast with Undo,
 * and text boxes that keep what is being typed. No data access and no register rules here.
 *
 * Targets are at least 44 px at every width (build contract); phone text inputs are 16 px so iOS doesn't zoom.
 *
 * Layers: a menu's Escape goes through useEscapeLayer, so only the top layer closes (a ⋯ inside the edit drawer closes
 * the ⋯, not the drawer or the full-width workspace). The phone bottom sheet is portalled to <body> above the room
 * footer and the Hub nav, and carries data-layer="sheet"; a tap inside any data-layer="sheet" (the Needs action sheet
 * opened from inside a menu) never counts as a tap outside the menu.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyFlag, useEscapeLayer } from "../../../../lib/overlayFlag.js";
import { segmentColumns, useDialogFocus } from "./useRoomUi.js";

// Measure before paint in the browser; a plain effect where there is no window (server rendering, tests).
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const chipBase = "focus-ring inline-flex min-h-[44px] items-center gap-1 rounded-full border px-3.5 text-left text-[15px] leading-tight sm:text-sm disabled:cursor-not-allowed disabled:opacity-50";
const CHIP_TONES = {
  on: "border-primary bg-primary font-bold text-white",
  off: "border-hairline bg-surface text-ink hover:bg-page",
  muted: "border-hairline bg-page text-muted",
  bad: "border-red-300 bg-red-50 font-bold text-red-700",
  add: "border-dashed border-primary bg-surface font-bold text-primary hover:bg-primary/5",
};

/**
 * One tappable choice. A chosen chip shows ✓ on a primary fill (spec S3 "Saving"). tone "bad" is a stored value that
 * isn't allowed (engineered stone): it is chosen, so it reads as pressed, and its name says it can't be used.
 */
export function ChoiceChip({ on = false, tone, onClick, disabled, children, title, ariaLabel, testId }) {
  const t = tone || (on ? "on" : "off");
  const pressed = tone === "add" ? undefined : tone === "bad" ? true : on;
  return (
    <button type="button" aria-pressed={pressed} disabled={disabled} onClick={onClick} title={title} aria-label={ariaLabel || (tone === "bad" ? title : undefined)}
      className={`${chipBase} ${CHIP_TONES[t] || CHIP_TONES.off}`} data-testid={testId}>
      {on && t === "on" && <span aria-hidden="true">✓</span>}{children}
    </button>
  );
}

/** A row of chips that wraps, with an optional small label above it. */
export function ChipLine({ heading, children, labelId }) {
  return (
    <div role="group" aria-label={heading || undefined} aria-labelledby={labelId}>
      {heading && <p className="mb-1.5 text-xs text-muted">{heading}</p>}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/**
 * A segmented control: one choice of a few, each segment at least 44 px tall. An option is [key, text] or
 * [key, text, ariaLabel] (a short phone label with its full words for screen readers).
 */
export function Segmented({ options, value, onChange, disabled, label, full = false, minSegment = 0, testId }) {
  // A control that can wrap draws its dividers as 1 px gaps over the hairline, so a second row is ruled too.
  const wraps = !!minSegment && options.length >= 4;
  return (
    <div role="group" aria-label={label} data-testid={testId}
      className={`grid overflow-hidden rounded-lg border border-hairline ${wraps ? "gap-px bg-hairline" : "bg-surface"} ${full ? "w-full" : "w-full sm:w-auto sm:min-w-[24rem]"}`}
      style={{ gridTemplateColumns: segmentColumns(options.length, minSegment) }}>
      {options.map(([key, text, aria], i) => {
        const on = value === key;
        return (
          <button key={key} type="button" aria-pressed={on} aria-label={aria || undefined} disabled={disabled} onClick={() => onChange(key)}
            className={`min-h-[44px] px-2 text-[15px] sm:text-sm ${i && !wraps ? "border-l border-hairline" : ""} ${on ? "bg-primary font-bold text-white" : "bg-surface text-ink hover:bg-page"} disabled:cursor-not-allowed disabled:opacity-60`}>
            {text}
          </button>
        );
      })}
    </div>
  );
}

export function DotsIcon() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>;
}
export function PlusIcon() {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
}

/** A 44 px icon button (⋯ and friends). */
export function IconButton({ label, onClick, children, buttonRef, disabled, expanded, className = "" }) {
  return (
    <button ref={buttonRef} type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={expanded} disabled={disabled} onClick={onClick}
      className={`focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-page hover:text-ink disabled:opacity-40 ${className}`}>
      {children || <DotsIcon />}
    </button>
  );
}

/**
 * A menu or small panel. On a tablet or desktop it opens under its button (the caller wraps both in a `relative` box);
 * on a phone it is a bottom sheet: drag handle, at most 90% of the height, swipe down or tap the scrim to close.
 * The sheet is portalled to <body> (z 60, the Needs action level), so no sticky bar or footer it was opened from caps it,
 * and the room footer and the Hub nav can't cover its buttons. Focus moves in on open and back to the trigger on close.
 */
export function Popover({ open, onClose, narrow, title, anchorRef, children, align = "right", wide = false }) {
  const panel = useRef(null);
  const start = useRef(null);
  const [dy, setDy] = useState(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = useCallback(() => closeRef.current?.(), []);
  const portal = !!narrow && typeof document !== "undefined";
  useEscapeLayer(!!open, close);
  useBodyFlag("register-overlay-open", !!(open && narrow));
  useDialogFocus(panel, !!open, anchorRef);
  useEffect(() => {
    if (!open || narrow) return undefined;
    const onDown = (e) => {
      const t = e.target;
      if (panel.current?.contains(t) || anchorRef?.current?.contains(t)) return;
      // A sheet opened from inside this menu (the ⚑ on an appliance chip) is portalled away, but it is part of the menu.
      if (t?.closest?.('[data-layer="sheet"]')) return;
      close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open, narrow, anchorRef, close]);
  if (!open) return null;
  if (narrow) {
    const drag = {
      onTouchStart: (e) => { start.current = e.touches[0].clientY; },
      onTouchMove: (e) => { if (start.current != null) setDy(Math.max(0, e.touches[0].clientY - start.current)); },
      onTouchEnd: () => { if (dy > 80) close(); setDy(0); start.current = null; },
    };
    const sheet = (
      <div className="fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title || "Menu"} data-layer="sheet" data-testid="room-sheet">
        <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 h-full w-full cursor-default bg-ink/40" onClick={close} />
        <div ref={panel} tabIndex={-1} className="relative max-h-[90vh] overflow-y-auto rounded-t-2xl bg-surface pb-[max(16px,env(safe-area-inset-bottom))] shadow-xl outline-none"
          style={dy ? { transform: `translateY(${dy}px)` } : undefined}>
          <div {...drag} className="sticky top-0 z-10 bg-surface px-4 pb-2 pt-2">
            <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-hairline" />
            {title && <p className="text-base font-bold text-ink">{title}</p>}
          </div>
          <div className="px-3">{children}</div>
        </div>
      </div>
    );
    return portal ? createPortal(sheet, document.body) : sheet;
  }
  return (
    <div ref={panel} role="dialog" aria-label={title || "Menu"} tabIndex={-1}
      className={`absolute top-full z-30 mt-1 ${wide ? "w-[min(26rem,calc(100vw-2rem))]" : "w-[min(20rem,calc(100vw-2rem))]"} rounded-card border border-hairline bg-surface p-1.5 text-left shadow-lg outline-none ${align === "left" ? "left-0" : "right-0"}`}>
      {title && <p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-muted">{title}</p>}
      {children}
    </div>
  );
}

/**
 * One line in a menu: 44 px, a tick when it is the current choice, ▸ when it opens more. Passing checked (true or false)
 * makes it a radio item (kind "checkbox" for an on/off item) that tells a screen reader whether it is the current one.
 */
export function MenuItem({ children, onClick, danger, checked, kind = "radio", chevron, disabled, hint, testId }) {
  const stateful = typeof checked === "boolean";
  const role = stateful ? (kind === "checkbox" ? "menuitemcheckbox" : "menuitemradio") : "menuitem";
  return (
    <button type="button" role={role} aria-checked={stateful ? checked : undefined} disabled={disabled} onClick={onClick} data-testid={testId}
      className={`flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[15px] sm:text-sm ${danger ? "text-red-700" : "text-ink"} hover:bg-page disabled:cursor-not-allowed disabled:opacity-40`}>
      <span className="min-w-0 flex-1">{children}{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
      {checked && <span aria-hidden="true" className="font-bold text-primary">✓</span>}
      {chevron && <span aria-hidden="true" className="text-muted">▸</span>}
    </button>
  );
}
export function MenuDivider() { return <div role="separator" className="my-1 border-t border-hairline" />; }

/** A confirmation inside a menu or sheet: the sentence, then the buttons (the risky one first, in red). */
export function Confirm({ text, confirmLabel, onConfirm, onCancel, cancelLabel = "Cancel", danger = true }) {
  return (
    <div className="space-y-3 p-2">
      <p className="text-[15px] leading-snug text-ink sm:text-sm">{text}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={onConfirm} className={`min-h-[44px] rounded-lg px-4 text-sm font-bold text-white ${danger ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:opacity-90"}`}>{confirmLabel}</button>
        <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg border border-hairline px-4 text-sm font-bold text-ink hover:bg-page">{cancelLabel}</button>
      </div>
    </div>
  );
}

/**
 * The toast: one line and Undo. It sits near the top, under the app header and the room bar, so it never covers the
 * sticky "Next" footer, the tick-mode bar or the Hub's bottom nav.
 */
export function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-4 top-[124px] z-50 mx-auto flex max-w-md items-center gap-3 rounded-card bg-ink px-4 py-1.5 text-sm text-white shadow-lg md:top-[68px]" data-testid="room-toast">
      <span className="min-w-0 flex-1 py-2">{toast.text}</span>
      {toast.undo && <button type="button" onClick={() => { toast.undo(); onClose(); }} className="min-h-[44px] shrink-0 px-2 font-bold text-white underline">Undo</button>}
      <button type="button" aria-label="Dismiss" onClick={onClose} className="min-h-[44px] min-w-[44px] shrink-0 px-1 text-white/70 hover:text-white">✕</button>
    </div>
  );
}

/**
 * A text box over a stored value: it holds what is being typed (so a space between words isn't eaten) and takes up the
 * stored value only when that really changes.
 */
export function DraftInput({ value, onCommit, tidy = (v) => String(v || "").trim(), ...rest }) {
  const [draft, setDraft] = useState(value || "");
  if (tidy(draft) !== tidy(value || "")) setDraft(value || "");
  return <input {...rest} value={draft} onChange={(e) => { setDraft(e.target.value); onCommit(e.target.value); }} />;
}

/**
 * A name box: each change with words in it is saved at once; emptied, it keeps the last name (shown again on blur), so a
 * room is never left without a name and the box can still be cleared to retype.
 */
export function NameInput({ value, onCommit, onDone, ...rest }) {
  const [draft, setDraft] = useState(value || "");
  const [seen, setSeen] = useState(value || "");
  if ((value || "") !== seen) {
    setSeen(value || "");
    if (String(draft).trim() !== String(value || "").trim()) setDraft(value || "");
  }
  return (
    <input {...rest} value={draft} enterKeyHint="done"
      onChange={(e) => { setDraft(e.target.value); if (e.target.value.trim()) onCommit(e.target.value); }}
      onBlur={() => { if (!draft.trim()) setDraft(value || ""); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); onDone?.(); } }} />
  );
}

/** A small spinner for a button that is waiting on a save. */
export function Spinner() {
  return <span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}

/** A textarea that grows with its words, from minHeight to maxLines, then scrolls. */
export function AutoTextarea({ value, onChange, textareaRef, minHeight = 72, maxLines = 4, lineHeight = 22, ...rest }) {
  const own = useRef(null);
  const ref = textareaRef || own;
  useBrowserLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const max = maxLines * lineHeight + 22;
    el.style.height = `${Math.max(minHeight, Math.min(el.scrollHeight, max))}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [value, ref, minHeight, maxLines, lineHeight]);
  return <textarea ref={ref} value={value} onChange={onChange} {...rest} />;
}
