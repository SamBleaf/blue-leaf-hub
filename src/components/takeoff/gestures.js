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
// The tracker is framework-free; React components wire it to an element via attach().
// =============================================================================

export const TAP_SLOP_PX = 8;
const TAP_MAX_MS = 600;
export const PRECISE_HOLD_MS = 500; // a deliberate hold — a short rest before a pan stays a pan (R04b R21)

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
 * }} handlers  (points are element-relative CSS px)
 *
 * Precision placement (R04 F08, only when onPrecise is given): in "tap" mode, holding ONE finger still for
 * PRECISE_HOLD_MS enters "precise": the finger then moves a crosshair (shown magnified by the caller) instead
 * of panning, and lifting places the point exactly there (onTap). A second finger cancels it.
 */
export function createGestureTracker(handlers) {
  const pointers = new Map(); // id → {x,y}
  let state = "idle";         // idle | pending | panning | pinching | draining
  let start = null;           // {x,y,t}
  let last = null;            // last single-pointer position
  let pinchPrev = null;       // {dist, cx, cy}
  let el = null;
  let holdTimer = null;
  const clearHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };

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
    state = "idle"; start = null; last = null; pinchPrev = null;
    if (wasActive) handlers.onGestureEnd?.();
  };

  function down(ev) {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    if (handlers.shouldIgnore?.(ev)) return;
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
      state = "idle"; start = null; last = null;
      handlers.onPrecise?.("end", p);
      handlers.onTap?.(p, ev);
      return;
    }
    clearHold();
    if (state === "pending" && pointers.size === 0) {
      const quick = performance.now() - start.t <= TAP_MAX_MS;
      const still = Math.hypot(p.x - start.x, p.y - start.y) <= TAP_SLOP_PX;
      state = "idle"; start = null; last = null;
      if (quick && still) handlers.onTap?.(p, ev);
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
        el = null;
      };
    },
    /** For tests / route exits: drop everything without emitting a tap. */
    reset() { pointers.clear(); end(); },
    get state() { return state; },
    get pointerCount() { return pointers.size; },
  };
}

/** Clamp a value. */
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
