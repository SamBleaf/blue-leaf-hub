// =============================================================================
// engine/openingSelectors.js — HUB 031: what the opening rules ask the span tables (jamb studs per side, lintel size),
// with the roof the office described on the Walls card (rules.roofMass, rlwMm, rafterSpacingMm, windClass, storey,
// lintelProduct) and, for one opening, the roof width it carries if the office tapped the lintel and changed it.
// Nothing is defaulted: a blank is passed on as blank and the selectors say "needs roof information".
// =============================================================================
import { loadsAboveOf, selectJambs, selectLintel } from "../standards/index.js";

/** @returns {{ jambs:(q:object)=>object, lintels:(q:object)=>object }} */
export function openingSelectors({ rules, parts, opening }) {
  const r = rules || {};
  // Sam, 18 Nov 2026: what is above these walls (roof | floorRoof | engineer); absent = roof, today's sizing
  const loadsAbove = loadsAboveOf(r);
  const roof = { roofMass: r.roofMass, rlwMm: opening?.loadRlwMm || r.rlwMm, spacingMm: r.rafterSpacingMm, windClass: r.windClass, storey: loadsAbove === "roof" ? "single_upper" : "lower" };
  const s = parts?.studs?.section || {};
  const stud = { depthMm: Number(s.depthMm), widthMm: Number(s.widthMm), grade: parts?.studs?.grade };
  return {
    loadsAbove,
    jambs: (q) => selectJambs({ stud, ...roof, jambHeightMm: q.jambHeightMm, openingWidthMm: q.openingWidthMm }),
    lintels: (q) => selectLintel({ product: r.lintelProduct === "MGP10" ? "MGP10" : "SmartLVL13", ...roof, loadsAbove, floorWidthMm: r.floorWidthMm, spanMm: q.spanMm, maxThicknessMm: stud.depthMm, maxDepthMm: q.maxDepthMm }),
  };
}
