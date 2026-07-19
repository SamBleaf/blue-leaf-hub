// =============================================================================
// Sub-task actual rollup — pure. Rolls approved timesheet entries up by the sub-task
// identity (task_category, canonical_key), so the budget can show a real ACTUAL against
// each budget sub-task (not just the coarse 8-key category). Part of the budget-spine
// alignment (mig 147: timesheet_entries.canonical_key).
//
// entry shape: { task_category, canonical_key, cost_amount, hours }
//   canonical_key null → coarse/untagged labour (rolls to the category, not a sub-task)
// key = `${task_category}|${canonical_key}`
// =============================================================================
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function subtaskKey(taskCategory, canonicalKey) {
  return `${taskCategory ?? ""}|${canonicalKey ?? ""}`;
}

// → { [`${task_category}|${canonical_key}`]: { cost, hours } } for entries WITH a canonical_key.
export function rollupSubtaskActuals(entries = []) {
  const out = {};
  for (const e of entries) {
    const canon = e.canonical_key ?? e.canonicalKey ?? null;
    if (!canon) continue;                       // untagged labour rolls to the category, not a sub-task
    const k = subtaskKey(e.task_category ?? e.taskCategory, canon);
    if (!out[k]) out[k] = { cost: 0, hours: 0 };
    out[k].cost += Number(e.cost_amount ?? e.costAmount) || 0;
    out[k].hours += Number(e.hours) || 0;
  }
  for (const k of Object.keys(out)) { out[k].cost = round2(out[k].cost); out[k].hours = round2(out[k].hours); }
  return out;
}
