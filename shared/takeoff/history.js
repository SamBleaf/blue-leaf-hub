// =============================================================================
// shared/takeoff/history.js — bounded undo/redo stack for editor sessions.
// A numeric commit is ONE command. Pure data; the UI keeps the stack in state.
// =============================================================================

export const MIN_UNDO_DEPTH = 30;

/** @template T @param {T} initial @param {number} [limit] */
export function createHistory(initial, limit = 50) {
  return { past: [], present: initial, future: [], limit: Math.max(limit, MIN_UNDO_DEPTH) };
}

export function pushHistory(h, next) {
  if (next === h.present) return h;
  const past = [...h.past, h.present];
  if (past.length > h.limit) past.splice(0, past.length - h.limit);
  return { ...h, past, present: next, future: [] };
}

export function undo(h) {
  if (!h.past.length) return h;
  const prev = h.past[h.past.length - 1];
  return { ...h, past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redo(h) {
  if (!h.future.length) return h;
  const [next, ...rest] = h.future;
  return { ...h, past: [...h.past, h.present], present: next, future: rest };
}

export const canUndo = (h) => h.past.length > 0;
export const canRedo = (h) => h.future.length > 0;
