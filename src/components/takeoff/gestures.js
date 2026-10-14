// =============================================================================
// gestures.js — shared pointer-gesture tracker for the plan viewport and the profile editor.
//
// Rules (R03 §3):
//   * "tap" mode: a short single-pointer press places/selects; movement above TAP_SLOP_PX
//     (8 CSS px) turns it into a pan and places nothing.
//   * "pan" mode: every single-pointer movement navigates, never taps.
//   * Two pointers are ALWAYS viewport navigation (pinch + pan) and place nothing — including
//     after one finger lifts first: the remaining finger keeps panning until all are up.
//   * pointercancel / lostpointercapture / a second finger arriving / unmount always leave a
//     valid idle state with no stray tap.
//   * Double-tap (TC-R04 13, opt-in via handlers.onDoubleTap): ONE recogniser, never separate click/dblclick
//     handlers. A tap is recognised only at pointer-up within TAP_SLOP_PX; the first tap fires onTap at once
//     (immediate feedback); a second tap starting within doubleTapMs of the first tap's pointer-up and lifting
//     within doubleTapSlopPx of it fires onDoubleTap INSTEAD of a second onTap — one coalesced endpoint
//     transaction. Pans, pinches, cancels, slow presses and precise placements never pair. Mouse pointers
//     arriving right after a touch tap at the same spot (synthetic compatibility mouse) are ignored.
//     Without onDoubleTap the tracker behaves exactly as before. handlers.onDoubleTap is read at every tap, so a
//     getter can enable it only while a consumer wants it (e.g. drawing a flashing) — while it is absent every tap
//     is an onTap and no pair carries over. Detaching (unmount / page navigation) also drops a pending pair.
// The tracker is framework-free; React components wire it to an element via attach().
// =============================================================================

export const TAP_SLOP_PX = 8;
const TAP_MAX_MS = 600;
export const PRECISE_HOLD_MS = 500; // a deliberate hold — a short rest before a pan stays a pan (R04b R21)
/** Double-tap defaults (TC-R04 13 proposals; tune on a real iPhone via createGestureTracker options). */
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_SLOP_PX = 24;
const SYNTHETIC_MOUSE_MS = 2500; // compatibility mouse events trail a touch by up to ~2.5 s on slow devices

/**
 * @param {{
 *   mode: () => "tap"|"pan",
 *   onTap?: (pt:{x:number,y:number}, ev:PointerEvent) => void,
 *   onPanStart?: () => void,
 *   onPan?: (dx:number, dy:number) => void,
 *   onPinch?: (scaleFactor:number, center:{x:number,y:number}, dx:number, dy:number) => void,
 *   onGestureEnd?: () => void,
 *   shouldIgnore?: (ev:PointerEvent) => boolean,   // e.g. a draggable endpoint handle owns it
 *   onPrecise?: (phase:"start"|"move"|"end"|"cancel", pt:{x:number,y:number}) => void,
 *   onDoubleTap?: (pt:{x:number,y:number}, ev:PointerEvent, info:{first:{x:number,y:number}, intervalMs:number}) => void,
 * }} handlers  (points are element-relative CSS px)
 * @param {{ doubleTapMs?: number, doubleTapSlopPx?: number }} [options]  double-tap window + proximity (only used with onDoubleTap)
 *
 * Precision placement (R04 F08, only when onPrecise is given): in "tap" mode, holding ONE finger still for
 * PRECISE_HOLD_MS enters "precise": the finger then moves a crosshair (shown magnified by the caller) instead
 * of panning, and lifting places the point exactly there (onTap). A second finger cancels it.
 */
export function createGestureTracker(handlers, { doubleTapMs = DOUBLE_TAP_MS, doubleTapSlopPx = DOUBLE_TAP_SLOP_PX } = {}) {
  const pointers = new Map(); // id → {x,y}
  let state = "idle";         // idle | pending | panning | pinching | draining
  let start = null;           // {x,y,t}
  let last = null;            // last single-pointer position
  let pinchPrev = null;       // {dist, cx, cy}
  let el = null;
  let holdTimer = null;
  let lastTap = null;         // {x,y,t,pointerType} — the first tap of a possible double-tap (onDoubleTap only)
  let lastTouchTap = null;    // {x,y,t} — for suppressing synthetic mouse after touch (onDoubleTap only)
  const clearHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };

  /** A recognised tap: pairs with the previous one into a double-tap, else fires onTap immediately. */
  const emitTap = (p, ev, downAt) => {
    if (!handlers.onDoubleTap) { lastTap = null; handlers.onTap?.(p, ev); return; }
    const now = performance.now();
    if (ev.pointerType !== "mouse") lastTouchTap = { x: p.x, y: p.y, t: now };
    const prev = lastTap;
    if (prev && prev.pointerType === ev.pointerType && downAt - prev.t <= doubleTapMs
      && Math.hypot(p.x - prev.x, p.y - prev.y) <= doubleTapSlopPx) {
      lastTap = null;
      handlers.onDoubleTap(p, ev, { first: { x: prev.x, y: prev.y }, intervalMs: downAt - prev.t });
      return;
    }
    lastTap = { x: p.x, y: p.y, t: now, pointerType: ev.pointerType };
    handlers.onTap?.(p, ev);
  };
  const syntheticMouse = (ev) => {
    if (!handlers.onDoubleTap || ev.pointerType !== "mouse" || !lastTouchTap) return false;
    const p = rel(ev);
    return performance.now() - lastTouchTap.t <= SYNTHETIC_MOUSE_MS && Math.hypot(p.x - lastTouchTap.x, p.y - lastTouchTap.y) <= doubleTapSlopPx;
  };

  const rel = (ev) => {
    const r = el.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const pinchInfo = () => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(b.x - a.x, b.y - a.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };
  const end = () => {
    clearHold();
    if (state === "precise") handlers.onPrecise?.("cancel", last);
    const wasActive = state === "panning" || state === "pinching" || state === "draining";
    // a gesture that ends without a tap breaks a double-tap pair; the lostpointercapture that trails every
    // pointerup arrives while idle and must not
    if (state !== "idle") lastTap = null;
    state = "idle"; start = null; last = null; pinchPrev = null;
    if (wasActive) handlers.onGestureEnd?.();
  };

  function down(ev) {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    if (handlers.shouldIgnore?.(ev)) return;
    if (syntheticMouse(ev)) return;
    try { el.setPointerCapture(ev.pointerId); } catch { /* not capturable */ }
    const p = rel(ev);
    pointers.set(ev.pointerId, p);
    if (pointers.size === 1) {
      state = handlers.mode() === "pan" ? "panning" : "pending";
      start = { ...p, t: performance.now() };
      last = p;
      if (state === "panning") handlers.onPanStart?.();
      if (state === "pending" && handlers.onPrecise) {
        holdTimer = setTimeout(() => {
          holdTimer = null;
          if (state === "pending" && pointers.size === 1) { state = "precise"; handlers.onPrecise("start", last); }
        }, PRECISE_HOLD_MS);
      }
    } else if (pointers.size === 2) {
      clearHold();
      if (state === "precise") handlers.onPrecise?.("cancel", last);
      // second finger: cancel any pending tap; navigation only from here on
      if (state !== "panning" && state !== "pinching") handlers.onPanStart?.();
      state = "pinching";
      pinchPrev = pinchInfo();
    }
    ev.preventDefault();
  }

  function move(ev) {
    if (!pointers.has(ev.pointerId)) return;
    const p = rel(ev);
    pointers.set(ev.pointerId, p);
    if (state === "pinching" && pointers.size >= 2) {
      const cur = pinchInfo();
      handlers.onPinch?.(cur.dist / pinchPrev.dist, { x: cur.cx, y: cur.cy }, cur.cx - pinchPrev.cx, cur.cy - pinchPrev.cy);
      pinchPrev = cur;
      return;
    }
    if (state === "precise") { last = p; handlers.onPrecise?.("move", p); return; }
    if (state === "pending") {
      if (Math.hypot(p.x - start.x, p.y - start.y) > TAP_SLOP_PX) {
        clearHold();
        state = "panning";
        handlers.onPanStart?.();
        handlers.onPan?.(p.x - last.x, p.y - last.y);
      }
      last = p;
      return;
    }
    if (state === "panning" || state === "draining") {
      handlers.onPan?.(p.x - last.x, p.y - last.y);
      last = p;
    }
  }

  function up(ev) {
    if (!pointers.has(ev.pointerId)) return;
    const p = rel(ev);
    pointers.delete(ev.pointerId);
    if (state === "precise" && pointers.size === 0) {
      clearHold();
      state = "idle"; start = null; last = null; lastTap = null;
      handlers.onPrecise?.("end", p);
      handlers.onTap?.(p, ev);
      return;
    }
    clearHold();
    if (state === "pending" && pointers.size === 0) {
      const quick = performance.now() - start.t <= TAP_MAX_MS;
      const still = Math.hypot(p.x - start.x, p.y - start.y) <= TAP_SLOP_PX;
      const downAt = start.t;
      state = "idle"; start = null; last = null;
      if (quick && still) emitTap(p, ev, downAt);
      else lastTap = null;
      return;
    }
    if (state === "pinching" && pointers.size === 1) {
      // one finger lifted first: the remaining finger only pans
      state = "draining";
      last = [...pointers.values()][0];
      pinchPrev = null;
      return;
    }
    if (pointers.size === 0) end();
  }

  function cancel(ev) {
    pointers.delete(ev.pointerId);
    if (pointers.size === 0) end();
    else if (state === "pending") state = "draining";
  }

  return {
    attach(element) {
      el = element;
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", cancel);
      el.addEventListener("lostpointercapture", cancel);
      return () => {
        el.removeEventListener("pointerdown", down);
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", cancel);
        el.removeEventListener("lostpointercapture", cancel);
        pointers.clear();
        end();
        lastTap = null;
        el = null;
      };
    },
    /** For tests / route exits: drop everything without emitting a tap. */
    reset() { pointers.clear(); end(); lastTap = null; },
    get state() { return state; },
    get pointerCount() { return pointers.size; },
  };
}

/** Clamp a value. */
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
