// =============================================================================
// Keeping a flashing draft order in step with the takeoff (Hub review HUB 013 / HUB 020, 20 Oct 2026).
// Pure helpers used by the server (opening the working draft) and the order screen (grouping, what is left off).
// =============================================================================
import { materialSpecKey } from "./schedule.js";

/** P-numbering order of flashing groups — the SAME order the supplier PDF prints (name, then spec). */
export const compareFlashingGroups = (a, b) => a.materialName.localeCompare(b.materialName) || (a.specKey < b.specKey ? -1 : a.specKey > b.specKey ? 1 : 0);

/**
 * What every flashing length of the takeoff still needs on a draft, and why one is left off.
 * need = still required (after placed orders) − already on another order whose supplier PDF was exported.
 * reason: null (can go on the order) | "blocked" (the length has a problem, e.g. missing colour) | "ordered" (placed)
 *         | "on_other_order" (exported on another order, not yet recorded placed) | "none" (nothing needed).
 * @param {{ scheduleLines: object[], status: Map<string, {required:number, ordered:number, remaining:number}>,
 *   cover?: Map<string, {exported:number, placed:number, refs:string[]}>, unplacedSpecKeys?: Set<string> }} p
 */
export function flashingNeeds({ scheduleLines, status, cover = new Map(), unplacedSpecKeys = new Set() }) {
  const out = [];
  for (const l of scheduleLines || []) {
    if (l.generic) continue;
    const st = status.get(l.bucketKey) || { required: l.quantity, ordered: 0, remaining: l.quantity };
    const exportedElsewhere = cover.get(l.bucketKey)?.exported || 0;
    const need = Math.max(0, st.remaining - exportedElsewhere);
    const blocked = (l.problems || []).length > 0 || unplacedSpecKeys.has(l.specKey);
    const reason = blocked ? "blocked" : need > 0 ? null : st.ordered > 0 ? "ordered" : exportedElsewhere > 0 ? "on_other_order" : "none";
    out.push({ bucketKey: l.bucketKey, specKey: l.specKey, materialId: l.jobMaterialIds[0], finishedLengthMm: l.finishedLengthMm, need,
      required: st.required, ordered: st.ordered, exportedElsewhere, reason, refs: cover.get(l.bucketKey)?.refs || [], problems: l.problems || [] });
  }
  return out;
}

/**
 * Refresh a draft's lines from the takeoff. `basis` is what the last refresh set per length (kept on the order).
 * - A line nobody has changed since (quantity == basis) follows the takeoff up AND down.
 * - A line the user changed (including taking it off the order) keeps their number.
 * - A blocked length is never added; one already on the draft stays as it is.
 * - A line that is no longer in the takeoff (its colour, shape or length changed — e.g. the 300 mm order step) follows
 *   the takeoff too when nobody changed it: it goes, and the current length takes its place. One the user changed stays
 *   for the order screen's "needs updating" check.
 * A draft saved before this rule (basis null) counts as untouched, so it is brought fully up to date once.
 * @returns {{ lines: Array<{bucketKey:string, quantity:number, jobMaterialId?:string}>, basis: Record<string, number>,
 *   changes: Array<{bucketKey:string, materialId:string, from:number, to:number}>, changed: boolean }}
 */
export function refreshDraftLines({ lines, basis, needs }) {
  const next = new Map((lines || []).map((l) => [l.bucketKey, { bucketKey: l.bucketKey, quantity: l.quantity, jobMaterialId: l.jobMaterialId || undefined }]));
  const newBasis = {};
  const changes = [];
  for (const n of needs) {
    const have = next.get(n.bucketKey)?.quantity || 0;
    const b = basis ? basis[n.bucketKey] : undefined;
    const untouched = basis == null ? true : b === undefined ? have === 0 : have === b;
    if (n.reason === "blocked" || !untouched) { if (b !== undefined) newBasis[n.bucketKey] = b; else if (have > 0) newBasis[n.bucketKey] = have; continue; }
    const to = n.need;
    if (to !== have) {
      if (to > 0) next.set(n.bucketKey, { bucketKey: n.bucketKey, quantity: to, jobMaterialId: next.get(n.bucketKey)?.jobMaterialId || n.materialId });
      else next.delete(n.bucketKey);
      changes.push({ bucketKey: n.bucketKey, materialId: n.materialId, from: have, to });
    }
    newBasis[n.bucketKey] = to;
  }
  const inTakeoff = new Set(needs.map((n) => n.bucketKey));
  for (const l of lines || []) {
    if (inTakeoff.has(l.bucketKey)) continue;
    const b = basis ? basis[l.bucketKey] : undefined;
    const untouched = basis == null || b === l.quantity;
    if (!untouched) continue;
    next.delete(l.bucketKey);
    changes.push({ bucketKey: l.bucketKey, materialId: l.jobMaterialId || null, from: l.quantity, to: 0 });
  }
  const same = (a, b) => { const ka = Object.keys(a || {}); return a && b && ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]); };
  return { lines: [...next.values()], basis: newBasis, changes, changed: changes.length > 0 || !same(basis, newBasis) };
}

/**
 * The order's flashing lines grouped like the supplier PDF: one group per flashing (spec), P-numbered in the PDF's
 * order, lengths longest first. Only lengths with a quantity (or listed in `keep`) are shown.
 * @param {Record<string, number>} qty bucketKey → quantity on the form
 * @param {object[]} scheduleLines the takeoff's lines
 * @param {Map<string, object>} materialsById
 * @param {Set<string>} [keep] bucketKeys to show even at 0 (taken to 0 on this screen, so it can be undone before saving)
 */
export function flashingOrderGroups(qty, scheduleLines, materialsById, keep = new Set()) {
  const groups = new Map();
  for (const l of scheduleLines || []) {
    if (l.generic) continue;
    const n = qty[l.bucketKey] || 0;
    if (n <= 0 && !keep.has(l.bucketKey)) continue;
    const mat = l.jobMaterialIds.map((id) => materialsById.get(id)).find((m) => m && materialSpecKey(m) === l.specKey) || materialsById.get(l.jobMaterialIds[0]);
    if (!groups.has(l.specKey)) groups.set(l.specKey, { specKey: l.specKey, materialId: mat?.id || l.jobMaterialIds[0], materialName: mat?.name || "Flashing", lines: [] });
    groups.get(l.specKey).lines.push({ line: l, quantity: n });
  }
  return [...groups.values()].sort(compareFlashingGroups).map((g, i) => {
    g.lines.sort((a, b) => b.line.finishedLengthMm - a.line.finishedLengthMm);
    const pieces = g.lines.reduce((a, x) => a + x.quantity, 0);
    const totalLm = Number((g.lines.reduce((a, x) => a + x.quantity * x.line.finishedLengthMm, 0) / 1000).toFixed(3));
    return { ...g, profileId: `P${i + 1}`, pieces, totalLm };
  });
}

/** Strip the server-kept refresh basis from an order's delivery (never shown, never frozen into an export). */
export function withoutBasis(delivery) {
  if (!delivery || typeof delivery !== "object" || !("basis" in delivery)) return delivery || {};
  const { basis: _basis, ...rest } = delivery;
  void _basis;
  return rest;
}
