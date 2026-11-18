// =============================================================================
// engine/openingRules.js — HUB 031 (Sam, 17 Nov 2026): the framing around a window or door, worked out for you.
// Pure, no I/O. Sam's rules (docs/takeoff/OWNER_ANSWERS_17NOV.md) override the plans:
//   - kings, jacks, and COUNTED cripples above and below at the wall's own stud centres, sill and head trimmers;
//   - heights are measured from the FLOOR (the wall's stud cut sits on a bottom plate, so stud-base = floor − plate);
//   - the jamb count per side INCLUDES the king and the stud under the lintel (so jacks = jambs − 1);
//   - wide openings can need stacked trimmers; a manual framing detail on an opening always wins (the caller never
//     calls this for an opening that has one);
//   - a cavity slider is framed with jamb studs, a lintel and head trim, and the pocket end gets 2 full studs.
// The result is a normal framing `detail` (members + below/above regions) for computeStudWall, plus how many full-height
// studs stand each side and how thick the jack stack is. Nothing is guessed silently: every value that is not from a
// cited table or from Sam is a named constant below, marked [Default, needs Sam], and the opening says what it used.
// =============================================================================

/** The jamb count (king + jacks) is never fewer than this per side: a king and one jack under the lintel (today's 2 each side). */
export const OPENING_JAMBS_MIN = 2;
/** A cavity slider's pocket end gets this many full-height studs (Sam, 17 Nov 2026). */
export const CAVITY_POCKET_END_STUDS = 2;
/**
 * [Default, needs Sam] How many trimmers stack by clear opening width (sill and head). Sam: "wide openings can need
 * stacked trimmers (AS1684)". Sam's PDFs are the span tables only, which don't carry the stacking clause, so these
 * breakpoints are a stand-in until he sets them from the clause. Said on every opening that uses a stack.
 */
export const TRIMMER_STACK_RULE = Object.freeze([
  Object.freeze({ upToMm: 1500, count: 1 }),
  Object.freeze({ upToMm: 2700, count: 2 }),
  Object.freeze({ upToMm: Infinity, count: 3 }),
]);
export const TRIMMER_STACK_SOURCE = "Blue Leaf default, breakpoints not yet confirmed from AS 1684 (Sam to set)";
export const trimmerStackCount = (widthMm) => TRIMMER_STACK_RULE.find((r) => widthMm <= r.upToMm).count;

/** Where an opening's lintel sits (Sam, 18 Nov 2026): under the top plate (the default), or up in the roof or the floor frame. */
export const LINTEL_POSITIONS = Object.freeze(["underTopPlate", "roofFrame", "floorFrame"]);
/** A cripple shorter than this isn't a stud: solid blocking is counted instead. Blue Leaf default, to confirm. */
export const MIN_CRIPPLE_MM = 50;
export const OPENING_RULE_REF = "Opening rules (HUB 031)";
const EPS = 1e-6;
const fmt = (n) => Math.round(n).toLocaleString("en-AU");

/**
 * @param {object} a
 * @param {{ id:string, label:string, type:string, xLeftMm:number, xRightMm:number, sillMm:number, headMm:number,
 *   fullHeight?:boolean, cavity?:{ leafMm:number, pocket:"left"|"right" }|null, lintel?:object|null, load?:object|null }} a.opening
 *   sill and head measured from the FLOOR
 * @param {{ studLengthMm:number, bottomPlateMm:number, trimmerMm:number, studWidthMm:number, loadBearing:boolean|null,
 *   plateIdentity:object, plateStock:object, lintelTreatment:string|null,
 *   jambs:(q:object)=>{ outcome:string, jambsPerSide:number|null, basis:string, reasons?:string[] },
 *   lintels:(q:object)=>{ outcome:string, section?:string, depthMm?:number, breadthMm?:number, plies?:number, grade?:string, basis?:string, extraBearingMm?:number, reasons?:string[] } }} a.ctx
 * @returns {{ detail:object, sides:{left:number,right:number}, jackMm:{left:number,right:number},
 *   levels:{ sillMm:number, headMm:number }, rule:object, notes:Array<{code:string,message:string}> }}
 */
export function expandOpening({ opening: o, ctx }) {
  const { studLengthMm: H, bottomPlateMm: bp, trimmerMm: tt, studWidthMm: sw } = ctx;
  const notes = [];
  const name = o.label || o.id;
  const W = o.xRightMm - o.xLeftMm;
  const cavity = o.cavity && o.cavity.leafMm > 0 ? o.cavity : null;
  const pocket = cavity ? cavity.pocket || "right" : null;
  // levels: from the floor → from the stud base (the top of the bottom plate), which is where the engine measures
  const sillFloor = Math.max(0, o.sillMm);
  const sillSB = Math.max(0, sillFloor - bp);
  const headSB = o.fullHeight ? H : Math.min(H, o.headMm - bp);
  // what the engine is given: levels from the stud base (a head above the studs is the engine's own clip note, not hidden here)
  const levels = { sillMm: sillSB, headMm: o.fullHeight ? H : o.headMm - bp };
  const hasSill = sillSB > EPS && !cavity;
  const loadBearing = ctx.loadBearing;   // true | false | null (unknown)

  // ── jambs per side (king + jacks) ───────────────────────────────────────────────────────────────────────────────
  let table = { outcome: "not_needed", jambsPerSide: null, basis: "" };
  if (loadBearing !== false) table = ctx.jambs({ openingWidthMm: W, jambHeightMm: H, opening: o });
  const tableOk = table.outcome === "ok" && table.jambsPerSide >= 1;
  const jambs = Math.max(OPENING_JAMBS_MIN, tableOk ? table.jambsPerSide : OPENING_JAMBS_MIN);
  // said once for the item (the caller keeps a note once however many openings give it)
  if (loadBearing !== false && !tableOk) notes.push({ code: "jambs_minimum_used", blocking: false, message: `Jambs are ${OPENING_JAMBS_MIN} each side (a king and one jack, the minimum). ${table.reasons?.[0] || table.basis || "The roof isn't described yet, so the jamb table wasn't used."}` });
  // the doorway end of a slider (or either end of anything else): king + (jambs − 1) jacks. The pocket end: 2 full studs
  const endsOf = () => {
    const full = { kings: 1, jacks: jambs - 1 };
    if (!cavity) return { left: full, right: full };
    const pocketEnd = { kings: CAVITY_POCKET_END_STUDS, jacks: 0 };
    return pocket === "left" ? { left: pocketEnd, right: full } : { left: full, right: pocketEnd };
  };
  const ends = endsOf();
  const jackMm = { left: ends.left.jacks * sw, right: ends.right.jacks * sw };
  const sides = { left: ends.left.kings, right: ends.right.kings };
  const jackQty = ends.left.jacks + ends.right.jacks;

  // ── head: a lintel carries the roof; trimmers frame the head of a wall that doesn't (and a slider has both) ─────
  const needsLintel = (loadBearing !== false) || !!cavity;
  // lintel position: a lintel moved up into the roof or floor frame isn't checked against the free height above the head;
  // the head is then framed with ONE head trimmer and cripples up to the top plate. Only where there is a lintel to move.
  const position = LINTEL_POSITIONS.includes(o.lintelPosition) ? o.lintelPosition : "underTopPlate";
  const aloft = position !== "underTopPlate" && needsLintel && !o.fullHeight;
  const stack = trimmerStackCount(W);
  let lintel = { status: "not_needed" };
  let lintelDepthMm = 0;
  if (needsLintel && !o.fullHeight) {
    const typed = o.lintel && o.lintel.depthMm > 0 && o.lintel.breadthMm > 0 ? o.lintel : null;
    let pick = null;
    if (typed) {
      pick = { source: "typed", section: `${typed.depthMm}x${typed.breadthMm}`, depthMm: typed.depthMm, breadthMm: typed.breadthMm, plies: typed.plies || 1,
        grade: String(typed.grade || "").toUpperCase() || ctx.lintelGrade || null,
        ...(ctx.loadsAbove === "engineer" || typed.perEngineer === true ? { perEngineer: true } : {}),
        basis: ctx.loadsAbove === "engineer" || typed.perEngineer === true ? "per engineer, not checked against a table" : "typed by the office" };
    } else if (aloft && position === "floorFrame") {
      // the floor-load lintel tables (SmartLVL 13 guide, lintels supporting floor loads) are not mapped: never invented
      lintel = { status: "engineer", reason: "size from the engineer (floor load)" };
    } else if (loadBearing === false && cavity) {
      lintel = { status: "unsized", reason: "this wall doesn't carry the roof, so there is no span table to use: type the head size" };
    } else {
      const r = ctx.lintels({ spanMm: W, maxDepthMm: aloft ? null : H - headSB, opening: o });
      if (r.outcome === "ok") pick = { source: "table", section: r.section, depthMm: r.depthMm, breadthMm: r.breadthMm, plies: r.plies || 1, grade: r.grade, basis: r.basis, extraBearingMm: r.extraBearingMm || 0, ...(r.note ? { note: r.note } : {}) };
      else lintel = { status: r.outcome === "engineer" ? "engineer" : "unsized", reason: r.reasons?.[0] || r.basis || "needs roof information" };
    }
    if (pick) {
      lintelDepthMm = pick.depthMm;
      lintel = { status: pick.source === "typed" ? "typed" : "sized", ...pick };
      const free = H - headSB;
      if (!aloft && pick.depthMm > free + EPS) {
        lintel.noFit = { neededMm: pick.depthMm, freeMm: Math.max(0, free) };
        notes.push({ code: "lintel_no_fit", blocking: false, message: `${name}: a ${pick.depthMm} deep lintel won't fit. Only ${fmt(Math.max(0, free))} mm is free above the head. Lower the window, or put it in the roof or floor frame.` });
      }
      // bearing: a lintel table may ask for more than the 35 mm minimum on the jacks
      const bearing = Math.min(ends.left.jacks, ends.right.jacks) * sw;
      if (!cavity && pick.extraBearingMm > 0 && bearing < 35 + pick.extraBearingMm) {
        notes.push({ code: "lintel_bearing", blocking: false, message: `${name}: this lintel size needs ${35 + pick.extraBearingMm} mm of bearing; the jacks give ${fmt(bearing)} mm. Add bearing or a bigger jamb.` });
      }
    }
    if (aloft) {
      notes.push({ code: "lintel_aloft", blocking: false, message: position === "roofFrame"
        ? `${name}: lintel in the roof frame — check the roof frame layout with the truss supplier.`
        : `${name}: lintel in the floor frame, ${pick ? "check the floor frame layout and the floor load with the engineer." : "size from the engineer (floor load)."}` });
    }
    if (!pick) {
      notes.push({ code: "lintel_not_sized", blocking: false, message: `${name}: lintel not sized (${lintel.reason}). It would be ${fmt(W + jackMm.left + jackMm.right)} mm long; the studs, trimmers and cripples around it are counted.` });
    }
  } else if (needsLintel && o.fullHeight && loadBearing !== false) {
    lintel = { status: "engineer", reason: "a full-height opening in a wall that carries the roof needs an engineered beam" };
    notes.push({ code: "lintel_not_sized", blocking: false, message: `${name}: a full-height opening in a wall that carries the roof needs an engineered beam. Enter its size with the engineer or supplier.` });
  }

  // ── trimmers ────────────────────────────────────────────────────────────────────────────────────────────────────
  const wantHeadTrim = !o.fullHeight && (loadBearing === false || !!cavity || aloft);
  // a lintel up in the roof or floor frame leaves the head trimmer carrying only the cripples above it: one, not a stack
  const headTrim = wantHeadTrim ? (aloft && loadBearing !== false && !cavity ? 1 : stack) : 0;
  const sillTrim = hasSill ? stack : 0;
  if ((headTrim > 1 || sillTrim) && stack > 1) notes.push({ code: "trimmer_stack_default", blocking: false, message: `Wide openings get stacked trimmers (${TRIMMER_STACK_RULE.slice(0, -1).map((r) => `${r.count} up to ${fmt(r.upToMm)}`).join(", ")}, then ${TRIMMER_STACK_RULE[TRIMMER_STACK_RULE.length - 1].count}). ${TRIMMER_STACK_SOURCE}.` });

  // ── members ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const members = [];
  const plate = { identity: ctx.plateIdentity, stock: ctx.plateStock };
  if (jackQty > 0) members.push({ id: "jack", role: "jack", quantity: jackQty, lengthFrom: "headLevel", addMm: 0, sameAsStud: true });
  const headLen = W + jackMm.left + jackMm.right;
  if (lintel.status === "sized" || lintel.status === "typed") {
    const grade = lintel.grade || null;
    members.push({ id: "lintel", role: "lintel", quantity: lintel.plies || 1, lengthFrom: "openingWidth", addMm: jackMm.left + jackMm.right,
      identity: { section: lintel.section, grade, treatment: ctx.lintelTreatment || null }, stock: ctx.lintelStock || { maxMm: null, unavailableMm: [] } });
  }
  if (headTrim) members.push({ id: "head-trim", role: "head trimmer", quantity: headTrim, lengthFrom: "openingWidth", addMm: jackMm.left + jackMm.right, ...plate });
  if (sillTrim) members.push({ id: "sill-trim", role: "sill trimmer", quantity: sillTrim, lengthFrom: "openingWidth", addMm: 0, ...plate });

  // ── cripples at the wall's own centres, above and below ─────────────────────────────────────────────────────────
  // below: from the bottom plate up to the underside of the sill trimmers; above: from the top of the lintel or the head
  // trimmers to the top plate. When the lintel isn't sized its depth isn't known, so the cripples above aren't counted
  // (said in the lintel note) rather than guessed.
  const belowMm = sillSB;
  const belowDed = sillTrim * tt;
  const aboveRegion = H - headSB;
  const lintelKnown = lintel.status === "sized" || lintel.status === "typed" || lintel.status === "not_needed";
  const aboveDed = aloft ? headTrim * tt : (lintelDepthMm || headTrim * tt);
  // aloft: the cripples above the head trimmer reach the underside of the top plate; too short to be studs → solid blocking
  const aloftFree = aboveRegion - aboveDed;
  const aloftBlock = aloft && aloftFree > EPS && aloftFree < MIN_CRIPPLE_MM;
  if (aloftBlock) {
    members.push({ id: "head-blocking", role: "head block", quantity: 1, lengthFrom: "openingWidth", addMm: jackMm.left + jackMm.right, ...plate });
    notes.push({ code: "lintel_aloft_blocking", blocking: false, message: `${name}: only ${fmt(aloftFree)} mm above the head trimmer, too short for cripples. Solid blocking is counted instead.` });
  }
  const detail = {
    source: "explicit", ref: OPENING_RULE_REF, generated: true, members,
    ...(belowMm > EPS ? { belowSill: belowMm - belowDed > EPS ? { required: true, deductionMm: belowDed } : { required: false } } : {}),
    ...(aboveRegion > EPS ? { aboveHead: (lintelKnown || aloft) && !aloftBlock && aboveRegion - aboveDed > EPS ? { required: true, deductionMm: aboveDed } : { required: false } } : {}),
  };

  const rule = {
    source: "rule", ref: OPENING_RULE_REF, loadBearing, widthMm: W, cavity: cavity ? { leafMm: cavity.leafMm, pocket } : null, fullHeight: !!o.fullHeight,
    jambsPerSide: jambs, jambTable: table.outcome === "not_needed" ? null : { outcome: table.outcome, basis: table.basis || null, jambsPerSide: table.jambsPerSide ?? null },
    kings: { left: ends.left.kings, right: ends.right.kings }, jacks: { left: ends.left.jacks, right: ends.right.jacks }, jackLengthMm: headSB,
    ...(ctx.loadsAbove && ctx.loadsAbove !== "roof" ? { loadsAbove: ctx.loadsAbove } : {}), lintel, position: aloft ? position : "underTopPlate", trimmers: { head: headTrim, sill: sillTrim, stack }, headLevelMm: o.fullHeight ? H + bp : o.headMm, headFromStudBaseMm: headSB, sillFromStudBaseMm: sillSB,
  };
  return { detail, sides, jackMm, levels, rule, notes, headLenMm: headLen };
}
