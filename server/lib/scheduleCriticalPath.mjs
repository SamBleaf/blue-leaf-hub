import { toYmd } from "./dateYmd.mjs";

function taskDurationDays(t) {
  const s = toYmd(t.start_date);
  const e = toYmd(t.end_date || t.start_date);
  if (!s || !e) return 0;
  const a = new Date(`${s}T12:00:00`).getTime();
  const b = new Date(`${e}T12:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
}

/**
 * Longest-duration path on dependency DAG (approximate critical path).
 * @param {{ id: string, depends_on?: string[], start_date?: string, end_date?: string }[]} tasks
 * @returns {Set<string>}
 */
export function computeCriticalPathTaskIds(tasks) {
  const byId = new Map((tasks || []).map((t) => [t.id, t]));
  const memo = new Map();

  function longestFrom(tid) {
    if (memo.has(tid)) return memo.get(tid);
    const t = byId.get(tid);
    if (!t) return { score: 0, path: [] };
    const preds = (t.depends_on || []).filter((pid) => byId.has(pid));
    let best = { score: 0, path: [] };
    for (const p of preds) {
      const r = longestFrom(p);
      if (r.score > best.score) best = r;
    }
    const myDur = taskDurationDays(t);
    const out = { score: best.score + myDur, path: [...best.path, tid] };
    memo.set(tid, out);
    return out;
  }

  let global = { score: -1, path: [] };
  for (const t of tasks) {
    const r = longestFrom(t.id);
    if (r.score > global.score) global = r;
  }
  return new Set(global.path);
}

/**
 * Mark is_critical_path on task objects (does not persist).
 * @param {object[]} tasks
 */
export function attachCriticalPathFlags(tasks) {
  const ids = computeCriticalPathTaskIds(tasks);
  return (tasks || []).map((t) => ({ ...t, is_critical_path: ids.has(t.id) }));
}
