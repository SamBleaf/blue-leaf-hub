// =============================================================================
// shared/takeoff/engine/floor/framing.js — Floor frame (floor_framing@1): geometry -> demands.
//
// Takes the floor already resolved to millimetres (dispatch.js reads the traced areas through the calibration) and returns the
// standard MethodResult { demands, layout, problems, status, explain }. The demands then go through the ONE stock allocator and
// the normal purchase lines, exactly like wall framing:
//   floor truss       count demand per distinct length (supplier-made, never run through the allocator)
//   floor strongback  linear, the Strongbacks part (120 x 35 by default), pieces share stock lengths
//   floor beam        linear, LVL, one identity per size (the size is set per beam)
//   floor trimmer     linear, LVL, one identity per size (set per stair void)
// Role names start with "floor " so the supplier order (supplierOrder.js) files them under FLOOR TRUSSES / STRONGBACKS / BEAMS / TRIMMERS
// and never under LINTELS or HD & SILL TR.
// Pure: no DB, no DOM.
// =============================================================================
import { demandId } from "../contract.js";
import { timberIdentity, timberStockPolicy } from "../timber.js";
import { FLOOR_PART_LABELS } from "../families.js";
import { formatMm } from "../../units.js";
import { layoutFloor, sizeParts } from "./geometry.js";

const fmt = (mm) => formatMm(mm, 1);
const sectionOf = (p) => (p.section?.depthMm && p.section?.widthMm ? `${p.section.depthMm}x${p.section.widthMm}` : null);

/** The truss's procurement identity: supplier-made, bought per length, never a catalogue product. */
export const FLOOR_TRUSS_IDENTITY = Object.freeze({ family: "floorTruss", id: "floor-truss", name: "Floor truss" });

/**
 * @param {{ materialId:string, n:object, rules?:object, outline:Array<{x:number,y:number}>, voids?:Array<object>, refs?:Array<object> }} input
 *   n = the item's normalised spec (components.strongback / beam / trimmer)
 */
export function computeFloorFraming(input) {
  const { materialId, n, refs = [] } = input;
  const rules = input.rules || {};
  const lay = layoutFloor({ outline: input.outline, voids: input.voids, rules });
  const problems = [...lay.problems];
  const demands = [];
  const explain = [];
  const parts = n.components;
  const sourceRefs = refs;
  if (!lay.totals) return { demands, layout: null, problems, status: { quantity: "incomplete", installation: "source-pending", procurement: "draft" }, explain };

  // stock for a part: the owner timber grid restricted by the part's own longest length and not-stocked lengths
  const policy = (part, sharePieces) => timberStockPolicy({ grade: parts[part].grade, maxMm: parts[part].stock?.maxMm ?? null, unavailableMm: parts[part].stock?.unavailableMm || [], sharePieces });
  const identity = (part, section, component) => timberIdentity({ section, grade: parts[part].grade, treatment: parts[part].treatment, species: parts[part].species, supplier: parts[part].supplierName, component });
  const linear = (part, role, id, lengthMm, quantity, section, component, label, share) => ({
    id: demandId(materialId, role, id), materialId, role, kind: "linear", unit: "piece", lengthMm, quantity, lengthKind: "cut", identity: identity(part, section, component),
    stockPolicy: policy(part, share), noSplice: true, label, sourceRefs, provenance: "calculated",
  });

  // trusses: one count per distinct length (supplier layout; ordered as made)
  for (const g of lay.trussesByLength) {
    demands.push({ id: demandId(materialId, "floor-truss", g.lengthMm), materialId, role: "floor truss", kind: "count", unit: "piece", quantity: g.count, lengthMm: g.lengthMm,
      identity: FLOOR_TRUSS_IDENTITY, label: `${g.count} × floor truss ${fmt(g.lengthMm)} mm at ${lay.totals.centresMm} centres`,
      itemDescription: `Floor truss ${fmt(g.lengthMm)} mm (per truss layout, supplier to confirm)`, sourceRefs, provenance: "calculated" });
  }

  // strongbacks: a run longer than the longest stock is cut into stock-length pieces (joined over a truss, no lap allowed for in P1)
  const sbSection = sectionOf(parts.strongback);
  const sbMax = parts.strongback.stock?.maxMm ?? null;
  const pieces = (mm) => {
    if (!(sbMax > 0) || mm <= sbMax + 1e-6) return [mm];
    const out = [];
    let left = mm;
    while (left > sbMax + 1e-6) { out.push(sbMax); left -= sbMax; }
    if (left > 1e-6) out.push(left);
    return out;
  };
  let joined = 0;
  const strongback = (kind, id, mm, label) => {
    const ps = pieces(mm);
    if (ps.length > 1) joined += ps.length - 1;
    ps.forEach((len, i) => demands.push(linear("strongback", "floor strongback", `${kind}-${id}-${i}`, len, 1, sbSection, "floorStrongback", `${label}${ps.length > 1 ? ` (piece ${i + 1} of ${ps.length})` : ""}`, true)));
  };
  for (const e of lay.endStrongbacks) strongback("end", e.edgeId, e.lengthMm, `End strongback, edge ${e.n}`);
  lay.midRows.forEach((row, ri) => row.runs.forEach((run, k) => strongback("mid", `${ri}-${k}`, run.lengthMm, `Mid-span strongback, row ${ri + 1}${row.runs.length > 1 ? ` run ${k + 1}` : ""}`)));
  if (joined) problems.push({ code: "floor_strongback_joined", message: `${joined} strongback join${joined === 1 ? "" : "s"} over a truss (a run is longer than the longest stock length). No lap is added.`, blocking: false });

  // beams: one demand per marked edge, its own size
  for (const b of lay.beams) demands.push(linear("beam", "floor beam", b.edgeId, b.lengthMm, 1, b.size, "floorBeam", `Beam on edge ${b.n} (${b.size})`, false));
  // trimmers: per stair void
  for (const t of lay.trimmers) demands.push(linear("trimmer", "floor trimmer", `${t.voidId}-${t.kind}-${t.at}`, t.lengthMm, 1, t.size, "floorTrimmer", `${t.voidName} ${t.kind} trimmer (${t.size})`, false));

  explain.push(`Floor frame: ${fmt(lay.frame.widthMm)} wide across the trusses, trusses span ${fmt(lay.frame.spanMm)} at ${lay.totals.centresMm} centres = ${lay.totals.trussCount} trusses (a truss on the far edge always)`);
  explain.push(`Strongbacks: ${lay.totals.endStrongbackLm} lm at truss ends with no beam, ${lay.totals.midStrongbackLm} lm mid-span (${lay.totals.strongbackRows} row${lay.totals.strongbackRows === 1 ? "" : "s"}${rules.strongbackRows == null ? ", from the span" : ", set for this job"})`);
  if (lay.beams.length) explain.push(`Beams: ${lay.beams.map((b) => `edge ${b.n} ${b.size} ${(b.lengthMm / 1000).toFixed(2)} m`).join(", ")}`);
  if (lay.trimmers.length) explain.push(`Trimmers: ${lay.voids.filter((v) => v.stair).length} stair void(s), ${lay.totals.trimmerLm} lm`);
  problems.push({ code: "floor_supplier_layout", message: "The truss supplier designs the floor truss layout and spans. These counts are for ordering and checking, and the supplier confirms the final lengths.", blocking: false });
  const strongbackSize = sbSection ? sizeParts(sbSection) : null;
  if (strongbackSize) explain.push(`${FLOOR_PART_LABELS.strongback}: ${sbSection.replace("x", " x ")} (confirm with the truss supplier; set from the truss layout)`);

  return {
    demands,
    layout: { method: "floor_framing@1", ...lay },
    problems,
    status: { quantity: problems.some((p) => p.blocking) ? "incomplete" : "calculated", installation: "source-pending", procurement: "draft" },
    explain,
  };
}
