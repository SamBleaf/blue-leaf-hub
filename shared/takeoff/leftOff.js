// =============================================================================
// shared/takeoff/leftOff.js — HUB 029: nothing measured is left off an order without a word (Sam, 25 Oct 2026: "the order
// is practically orderable"; plan docs/hub_review/ORDER_BLOCKERS_PLAN.md part 4). A measured item of the order's section
// that is HELD (a blocking problem, or every line it has is held), has no line on this order and nothing placed or
// exported for it, is "left off": the export names it and needs one explicit "Order without …" before it can go. A
// deliberate subset of READY lines is never asked about. The server (buildExportSnapshot) and the review mock both use
// this, so they refuse exactly the same orders. Pure: no DB/DOM/network.
// =============================================================================
import { isGenericMaterial } from "./engine/dispatch.js";
import { materialSection } from "./sections.js";
import { fixesFor } from "./fixes.js";

/**
 * @param {object} snapshot   the workspace snapshot (materials, measurements, contributions)
 * @param {object} computed   computeWorkspace(snapshot)
 * @param {{ category: string|null, lineMaterialIds: Iterable<string>, cover?: Map<string, {placed:number, exported:number}>|null }} opts
 * @returns {Array<{ materialId: string, materialName: string, walls: string|null, reason: string }>}
 */
export function leftOffItems(snapshot, computed, { category, lineMaterialIds, cover = null }) {
  if (!category) return [];
  const onOrder = new Set(lineMaterialIds || []);
  const measById = new Map((snapshot.measurements || []).map((m) => [m.id, m]));
  const out = [];
  for (const m of snapshot.materials || []) {
    if (m.archived || !isGenericMaterial(m) || materialSection(m) !== category || onOrder.has(m.id)) continue;
    const mine = (snapshot.contributions || []).filter((c) => c.jobMaterialId === m.id && !c.archived);
    const mr = computed.materialResults?.[m.id];
    if (!mine.length || !mr) continue;
    const own = (computed.scheduleLines || []).filter((l) => l.jobMaterialIds.includes(m.id));
    const blocking = (mr.problems || []).find((p) => p.blocking !== false && p.code !== "nothing_measured");
    if (!blocking && !(own.length > 0 && own.every((l) => l.problems.length > 0))) continue;
    if (own.some((l) => { const cv = cover?.get?.(l.bucketKey); return cv && cv.placed + cv.exported > 0; })) continue;
    const walls = [...new Set(mine.map((c) => measById.get(c.measurementId)).filter((x) => x && x.kind === "wall").map((x) => x.inputs?.name || x.label || "Wall"))];
    // the reason as its fix row words it on the card and the line ("Wall 3 has no Wall height"), else the problem's own words
    const row = fixesFor(computed, snapshot, { materialId: m.id })[0];
    const reason = String(row?.reason || blocking?.message || own.find((l) => l.problems.length)?.problems[0] || "it can't be ordered yet").replace(/\.$/, "");
    // its walls as the fix rows name them ("Walls 1, 3–6"); a name the rows can't compact is listed as it is
    const named = row?.materialId === m.id && row.walls ? row.walls : walls.length ? walls.slice(0, 6).join(", ") + (walls.length > 6 ? ` and ${walls.length - 6} more` : "") : null;
    out.push({ materialId: m.id, materialName: m.name, walls: named, reason });
  }
  return out;
}

/** The readiness problem for one left-off item (the client offers "Order without …" for exactly these). */
export const leftOffProblem = (x) => `Order without ${x.materialName}${x.walls ? ` (${x.walls})` : ""}: ${x.reason}.`;
/** Is this readiness problem a left-off one (so the client can tell it from the others)? */
export const isLeftOffProblem = (p) => /^Order without /.test(String(p));
