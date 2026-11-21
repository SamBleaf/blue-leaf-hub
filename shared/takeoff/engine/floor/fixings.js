// =============================================================================
// shared/takeoff/engine/floor/fixings.js — Floor frame P5: FLOOR FIXINGS (Sam, 21 Nov 2026: "always nails, with joist brackets"). PURE.
// Source: Pryda "Specification Guide for Floor and Rafter Truss Systems" (April 2012). Counted from the layout (geometry.js trussEnds,
// endStrongbacks, midRows), never from an area rate. Every pack size not stated by Sam or the guide is a named constant marked "assumed — confirm".
//   Truss end on a wall plate (edge with no beam)   2 skew nails 75 x 3.15 per truss end (p30)
//   Truss end on a beam, or at a stair beam         1 joist bracket per truss end: Pryda framing bracket FB94152 for 90 mm trusses (p30)
//                                                   bracket nails: Pryda 35 x 3.15 timber connector nails, 18 into the carrying beam + 3 into
//                                                   the truss per bracket (Table 12, FB94152 row)
//   Mid-span strongback to each truss it crosses     3 nails (trusses 250 deep and over) or 2 (200 deep), 75 mm framing nails (Table 9, p27)
//   End strongback to each truss end                 2 nails 75 x 3.15 per truss end (p29 end bracing detail)
//   End bracing (p28-29): diagonal strap braces at the end bays of an edge with an end strongback, 2 per edge, Pryda SB103 30 x 1.0 from a coil;
//                                                   each brace takes 2/3.15 x 35 nails at each end = 4 connector nails per brace (into the 35 x 3.15 count)
//   Lateral ties (no ceiling under)                 same nailing as a mid-span strongback: 3 nails per truss crossing (250 deep and over) or 2 (200 deep), 75 mm framing nails
//   The 35 x 3.15 connector nails (clouts) are ordered in boxes of 9000 (Sam, 21 Nov 2026), the count shown in the note.
// =============================================================================
export const SKEW_NAILS_PER_PLATE_END = 2;            // Pryda p30
export const STRONGBACK_NAILS_PER_END = 2;            // Pryda p29
export const BRACKET_NAILS_INTO_BEAM = 18;            // Pryda Table 12, FB94152
export const BRACKET_NAILS_INTO_TRUSS = 3;            // Pryda Table 12, FB94152
export const MIDSPAN_NAILS_DEEP = 3;                  // Pryda Table 9: trusses 250 deep and over
export const MIDSPAN_NAILS_SHALLOW = 2;               // Pryda Table 9: 200 deep
export const MIDSPAN_DEEP_FROM_MM = 250;
export const STRAP_BRACES_PER_EDGE = 2;               // Pryda p28: end bays only
export const BRACE_NAILS_PER_END = 2;                 // Pryda p29: 2/3.15 x 35 nails at each end of a strap brace
export const BRACE_ENDS = 2;
/** Connector nails (clouts, 35 x 3.15) come in boxes of 9000 — Sam, 21 Nov 2026: "I think they are 9000 boxes". assumed — confirm. */
export const CONNECTOR_NAIL_BOX = 9000;
/** Nail pack / box sizes are not known: the order shows nail COUNTS (EA). assumed — confirm a box size before boxing them. */
export const NAIL_PACK_SIZE = null;                   // assumed — confirm
export const FIX_NAMES = Object.freeze({
  nail75: "NAILS 75 x 3.15 (framing, plain count)",
  bracket: "PRYDA FRAMING BRACKET FB94152 (90 mm trusses)",
  nail35: `PRYDA TIMBER CONNECTOR NAILS 35 x 3.15 (box of ${CONNECTOR_NAIL_BOX})`,
  brace: "PRYDA STRAP BRACE SB103 30 x 1.0 (cut from a coil)",
});

/**
 * @param {{ layout: object, trussDepthMm: number }} input  layout = layoutFloor's result
 * @returns {Array<{ key, product, unit: "EA", quantity: number, note: string, nailCount?: number }>}  (nail35 quantity = BOXES of 9000, nailCount = the nails)
 */
export function floorFixings({ layout, trussDepthMm }) {
  const out = [];
  const push = (key, product, quantity, note) => { if (quantity > 0) out.push({ key, product, unit: "EA", quantity, note }); };
  const te = layout?.trussEnds;
  if (!te) return out;
  const plate = te.plateEnds, brackets = te.beamEnds + te.stairBeamEnds;
  const crossings = layout.totals?.midCrossings || 0;
  const midEach = trussDepthMm >= MIDSPAN_DEEP_FROM_MM ? MIDSPAN_NAILS_DEEP : MIDSPAN_NAILS_SHALLOW;
  // end strongbacks run along the edges with no beam, so their truss ends are the wall-plate ends
  const skew = plate * SKEW_NAILS_PER_PLATE_END;
  const endSb = (layout.endStrongbacks || []).length ? plate * STRONGBACK_NAILS_PER_END : 0;
  const mid = crossings * midEach;
  // no ceiling under: lateral ties are nailed like the mid-span strongbacks (Sam, 21 Nov 2026)
  const tieCrossings = (layout.tieRows || []).reduce((a, r) => a + r.runs.reduce((s2, x) => s2 + x.crossings, 0), 0);
  const tie = tieCrossings * midEach;
  const parts = [];
  if (skew) parts.push(`${skew} skew nails (${SKEW_NAILS_PER_PLATE_END} × ${plate} truss ends on a wall plate, Pryda p30)`);
  if (endSb) parts.push(`${endSb} end strongback to truss ends (${STRONGBACK_NAILS_PER_END} × ${plate}, p29)`);
  if (mid) parts.push(`${mid} mid-span strongbacks (${midEach} × ${crossings} truss crossings at ${trussDepthMm} deep, Table 9)`);
  if (tie) parts.push(`${tie} lateral ties (${midEach} × ${tieCrossings} truss crossings at ${trussDepthMm} deep, no ceiling under)`);
  push("nail75", FIX_NAMES.nail75, skew + endSb + mid + tie, `${skew + endSb + mid + tie} nails: ${parts.join(" + ")}`);
  const stair = te.stairBeamEnds, onBeam = te.beamEnds;
  push("bracket", FIX_NAMES.bracket, brackets, `${brackets} joist bracket${brackets === 1 ? "" : "s"}, 1 per truss end: ${onBeam} on beams + ${stair} at stair beams (Pryda p30, 90 mm trusses)`);
  const per = BRACKET_NAILS_INTO_BEAM + BRACKET_NAILS_INTO_TRUSS;
  const edges = (layout.endStrongbacks || []).length;
  const braces = edges * STRAP_BRACES_PER_EDGE;
  const bracketNails = brackets * per, braceNails = braces * BRACE_NAILS_PER_END * BRACE_ENDS, nails35 = bracketNails + braceNails;
  const n35 = [];
  if (bracketNails) n35.push(`${bracketNails} bracket nails (${per} per bracket: ${BRACKET_NAILS_INTO_BEAM} into the carrying beam + ${BRACKET_NAILS_INTO_TRUSS} into the truss, Pryda Table 12)`);
  if (braceNails) n35.push(`${braceNails} strap brace nails (${BRACE_NAILS_PER_END * BRACE_ENDS} per brace: 2/3.15 x 35 each end, ${braces} braces, Pryda p29)`);
  if (nails35 > 0) out.push({ key: "nail35", product: FIX_NAMES.nail35, unit: "EA", quantity: Math.ceil(nails35 / CONNECTOR_NAIL_BOX - 1e-9), nailCount: nails35,
    note: `${nails35} nails in boxes of ${CONNECTOR_NAIL_BOX} (box size from Sam, 21 Nov 2026, "I think": confirm): ${n35.join(" + ")}` });
  push("brace", FIX_NAMES.brace, braces, `${braces} braces: ${STRAP_BRACES_PER_EDGE} per edge with an end strongback (${edges} edge${edges === 1 ? "" : "s"}): cut from a coil, one diagonal at each end bay; 2/3.15 x 35 nails each end (Pryda p29), counted in the connector nails`);
  return out;
}
