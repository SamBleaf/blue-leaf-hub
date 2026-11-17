/**
 * useRoomUi — small hooks shared by the Rooms list and the room screen (REGISTER_SCREENS_SPEC.md S2, S3, S3p), and
 * useDialogFocus, which every register menu, sheet and drawer uses to take focus on open and hand it back on close.
 * Per-viewer conveniences only: nothing here is register data, and storage is wrapped so a private window still works.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Phone width (390 pt): bottom sheets instead of popovers, the S3p layout. */
export function useNarrow(max = 639) {
  const query = `(max-width: ${max}px)`;
  const [narrow, setNarrow] = useState(() => { try { return window.matchMedia(query).matches; } catch { return false; } });
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia(query); } catch { return undefined; }
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [query]);
  return narrow;
}

/** One toast at a time: { toast, show(text, undo?, ms?), clear }. */
export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const clear = useCallback(() => { clearTimeout(timer.current); setToast(null); }, []);
  const show = useCallback((text, undo = null, ms = 6000) => {
    clearTimeout(timer.current);
    setToast({ text, undo, at: Date.now() });
    timer.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { toast, show, clear };
}

/**
 * How far a sticky footer must sit above the window's bottom edge to clear the lead page's fixed stage bar
 * ([data-stage-bar], LeadDetail) while that bar is really showing: 0 when it is hidden (on a phone while a room is open),
 * covered (the full-width workspace, a drawer) or absent. The Hub's own bottom nav is cleared by the caller's classes.
 */
export function useStageBarInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        let top = Infinity;
        try {
          document.querySelectorAll("[data-stage-bar] > *").forEach((el) => {
            const r = el.getBoundingClientRect();
            if (!r.height || !r.width) return;
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 12));
            if (hit && el.contains(hit)) top = Math.min(top, r.top);
          });
        } catch { /* no layout */ }
        const next = top === Infinity ? 0 : Math.max(0, Math.round(window.innerHeight - top));
        setInset((p) => (p === next ? p : next));
      });
    };
    measure();
    const later = setTimeout(measure, 400);
    window.addEventListener("resize", measure);
    let mo = null;
    try { mo = new MutationObserver(measure); mo.observe(document.body, { attributes: true }); } catch { /* old browser */ }
    return () => { cancelAnimationFrame(raf); clearTimeout(later); window.removeEventListener("resize", measure); mo?.disconnect(); };
  }, []);
  return inset;
}

/**
 * Where focus goes when a menu or sheet opens: the current choice of a menu (a ticked radio item), else its first item,
 * else the panel itself (give it tabIndex -1).
 */
export function dialogFocusTarget(panel) {
  if (!panel) return null;
  try {
    return panel.querySelector?.('[role^="menuitem"][aria-checked="true"]:not([disabled])')
      || panel.querySelector?.('[role^="menuitem"]:not([disabled])') || panel;
  } catch { return panel; }
}
/**
 * Where focus goes back to when it closes: the element that had it before (else the trigger, fallback), but only when
 * focus was left inside the closed panel or dropped to the page. Someone who has moved on to another field keeps it.
 */
export function focusReturnTarget({ before, fallback, now, panel, body }) {
  const dropped = !now || now === body || now.isConnected === false || (!!panel && typeof panel.contains === "function" && panel.contains(now));
  if (!dropped) return null;
  const usable = (el) => !!el && el !== body && el.isConnected !== false && typeof el.focus === "function";
  if (usable(before)) return before;
  if (usable(fallback)) return fallback;
  return null;
}
/**
 * Menus, sheets and drawers (finding N10): on open, remember what had focus and move it into ref.current (its current
 * or first [role=menuitem], else the panel); on close, hand it back (to fallbackRef, the trigger, when the browser
 * never focused it, as Safari does on a tap). An autofocused field inside keeps its focus.
 */
export function useDialogFocus(ref, open, fallbackRef = null) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const before = document.activeElement;
    const panel = ref?.current || null;
    const fallback = fallbackRef?.current || null;
    if (panel && !panel.contains(document.activeElement)) {
      const target = dialogFocusTarget(panel);
      try { target?.focus?.({ preventScroll: true }); } catch { /* gone */ }
    }
    return () => {
      let target = null;
      try { target = focusReturnTarget({ before, fallback, now: document.activeElement, panel, body: document.body }); } catch { /* no document */ }
      try { target?.focus({ preventScroll: true }); } catch { /* gone */ }
    };
  }, [open, ref, fallbackRef]);
}

/**
 * The grid columns of a segmented control. minSegment (px): when the control is too narrow for every segment at that
 * width, it wraps to two rows of half the segments each (2 × 2 for the Work control), never 3 + 1. Pure CSS, so it
 * follows the column it sits in (the 754 px Hub column, Expand, a drawer) without measuring.
 */
export function segmentColumns(n, minSegment = 0) {
  if (!minSegment || n < 4) return `repeat(${n}, minmax(0, 1fr))`;
  const all = `calc(${(100 / n).toFixed(4)}% - 1px)`;
  const half = `calc(${(100 / Math.ceil(n / 2)).toFixed(4)}% - 1px)`;
  return `repeat(auto-fit, minmax(clamp(${all}, (${n * minSegment}px - 100%) * 999, ${half}), 1fr))`;
}

/** localStorage / sessionStorage, never throwing (private mode, blocked storage, previews). */
export function storeGet(key, fallback = null, session = false) {
  try { const s = session ? window.sessionStorage : window.localStorage; const v = s.getItem(key); return v == null ? fallback : v; } catch { return fallback; }
}
export function storeSet(key, value, session = false) {
  try { const s = session ? window.sessionStorage : window.localStorage; if (value == null) s.removeItem(key); else s.setItem(key, String(value)); } catch { /* private mode */ }
}
