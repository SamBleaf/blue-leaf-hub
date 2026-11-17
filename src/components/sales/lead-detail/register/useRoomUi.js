/**
 * useRoomUi — small hooks shared by the Rooms list and the room screen (REGISTER_SCREENS_SPEC.md S2, S3, S3p).
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

/** localStorage / sessionStorage, never throwing (private mode, blocked storage, previews). */
export function storeGet(key, fallback = null, session = false) {
  try { const s = session ? window.sessionStorage : window.localStorage; const v = s.getItem(key); return v == null ? fallback : v; } catch { return fallback; }
}
export function storeSet(key, value, session = false) {
  try { const s = session ? window.sessionStorage : window.localStorage; if (value == null) s.removeItem(key); else s.setItem(key, String(value)); } catch { /* private mode */ }
}
