// =============================================================================
// shared/takeoff/engine/floor/framing.js — Floor frame (floor_framing@1): geometry -> demands.
//
// Takes the floor already resolved to millimetres (dispatch.js reads the traced areas through the calibration) and returns the
// standard MethodResult { demands, layout, problems, status, explain }. The demands then go through the ONE stock allocator and
// the normal purchase lines, exactly like wall framing:
//   floor truss       count demand per distinct length (supplier-made, never run through the allocator)
//   floor strongback  linear, the Strongbacks part (140 x 35 by default, from the truss depth: Pryda Table 9), pieces share stock lengths,
//                     joins lapped two truss spaces (Pryda p27)
//   floor tie         linear 90 x 35 lateral ties at 3,000 max centres when there is no ceiling under (Pryda p13, p28)
//   floor beam        linear, LVL, one identity per size (the size is set per beam)
//   floor trimmer     the STAIR BEAMS (role id kept so saved jobs load), linear LVL 400x45 / 400x63, one identity per size (set per stair void)
//   floor fixing      joist brackets, nails, strap braces counted from the layout (fixings.js)
// Role names start with "floor " so the supplier order (supplierOrder.js) files them under FLOOR TRUSSES / STRONGBACKS / BEAMS / TRIMMERS
// and never under LINTELS or HD & SILL TR.
// Pure: no DB, no DOM.
// =============================================================================
import { demandId } from "../contract.js";
import { timberIdentity, timberStockPolicy } from "../timber.js";
import { FLOOR_PART_LABELS } from "../families.js";
import { formatMm } from "../../units.js";
import { floorFrame, layoutFloor, sizeParts, strongbackSizeForDepth, trussDepthOf, NO_CEILING_TIE_SIZE, STRONGBACK_LAP_SPACES, LONG_SPAN_NOTE_MM, WET_SET_DOWN_DEPTH_MM } from "./geometry.js";
import { floorFixings } from "./fixings.js";
import { DEFAULT_WASTE_PCT, layoutSheets } from "./sheets.js";
import { floorAccessories } from "./accessories.js";

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
  const lay = layoutFloor({ outline: input.outline, voids: input.voids, wets: input.wets, rules });
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
  const depthMm = trussDepthOf(rules);
  // Sam, 21 Nov 2026: trusses in wet areas are set down (355 deep, a 45 mm set-down). A note on the truss order only, no quantity change.
  const wetNote = lay.wets.length ? `Wet areas: set-down trusses ${WET_SET_DOWN_DEPTH_MM} deep (45 mm set-down) — ${lay.wets.map((w) => w.name).join(", ")}` : null;
  for (const g of lay.trussesByLength) {
    demands.push({ id: demandId(materialId, "floor-truss", g.lengthMm), materialId, role: "floor truss", kind: "count", unit: "piece", quantity: g.count, lengthMm: g.lengthMm,
      identity: FLOOR_TRUSS_IDENTITY, label: `${g.count} × floor truss ${fmt(g.lengthMm)} mm at ${lay.totals.centresMm} centres`,
      itemDescription: `Floor truss ${fmt(g.lengthMm)} mm (per truss layout, supplier to confirm)`, ...(wetNote ? { supplierNote: wetNote } : {}), sourceRefs, provenance: "calculated" });
  }

  // strongbacks: a run longer than the longest stock is cut into stock-length pieces joined over a truss. Pryda p27: a join is "overlapped by
  // two truss spacing for best performance", so every join adds 2 x the truss centres to the run.
  const sbSection = sectionOf(parts.strongback);
  const sbMax = parts.strongback.stock?.maxMm ?? null;
  const lapMm = STRONGBACK_LAP_SPACES * Number(lay.totals.centresMm);
  const pieces = (mm) => {
    if (!(sbMax > 0) || mm <= sbMax + 1e-6) return { ps: [mm], joins: 0 };
    const lap = Math.min(lapMm, sbMax / 2);
    const joins = Math.ceil((mm - sbMax) / (sbMax - lap) - 1e-9);
    const ps = [];
    let left = mm + joins * lap;
    while (left > sbMax + 1e-6) { ps.push(sbMax); left -= sbMax; }
    if (left > 1e-6) ps.push(left);
    return { ps, joins: ps.length - 1, lap };
  };
  let joined = 0, lapTotalMm = 0;
  const strongback = (kind, id, mm, label, section = sbSection, role = "floor strongback", component = "floorStrongback") => {
    const { ps, joins, lap } = pieces(mm);
    if (joins > 0) { joined += joins; lapTotalMm += joins * lap; }
    ps.forEach((len, i) => demands.push(linear("strongback", role, `${kind}-${id}-${i}`, len, 1, section, component, `${label}${ps.length > 1 ? ` (piece ${i + 1} of ${ps.length})` : ""}`, true)));
  };
  for (const e of lay.endStrongbacks) strongback("end", e.edgeId, e.lengthMm, `End strongback, edge ${e.label}`);
  lay.midRows.forEach((row, ri) => row.runs.forEach((run, k) => strongback("mid", `${ri}-${k}`, run.lengthMm, `Mid-span strongback, row ${ri + 1}${row.runs.length > 1 ? ` run ${k + 1}` : ""}`)));
  // no ceiling under (Sam, 21 Nov 2026; Pryda p13, p28): 90 x 35 lateral ties on the bottom chord at 3,000 max centres, laid like the mid-span rows
  (lay.tieRows || []).forEach((row, ri) => row.runs.forEach((run, k) => strongback("tie", `${ri}-${k}`, run.lengthMm, `Lateral tie, row ${ri + 1}${row.runs.length > 1 ? ` run ${k + 1}` : ""}`, NO_CEILING_TIE_SIZE, "floor tie", "floorTie")));
  lay.totals.strongbackJoins = joined; lay.totals.strongbackLapLm = Math.round(lapTotalMm) / 1000;
  if (joined) problems.push({ code: "floor_strongback_joined", message: `${joined} strongback join${joined === 1 ? "" : "s"} over a truss (a run is longer than the longest stock length), each lapped two truss spaces (${lapMm} mm), ${lay.totals.strongbackLapLm} lm of lap added (Pryda p27).`, blocking: false });

  // beams: one demand per marked edge, its own size
  for (const b of lay.beams) demands.push(linear("beam", "floor beam", b.edgeId, b.lengthMm, 1, b.size, "floorBeam", `Beam on edge ${b.label} (${b.size})`, false));
  // stair beams (internal role "floor trimmer"): per stair void
  for (const t of lay.trimmers) demands.push(linear("trimmer", "floor trimmer", `${t.voidId}-${t.kind}-${t.at}`, t.lengthMm, 1, t.size, "floorTrimmer", `${t.voidName} ${t.kind} stair beam (${t.size})`, false));

  // Phase 2 (Sam, 18 Nov 2026): the main floor (outline less openings and wet areas) is Structaflor, or Hebel PowerFloor (Phase 3, Sam 19 Nov 2026)
  const hebel = rules.floorMaterial === "hebel";
  const sh = layoutSheets({ outline: input.outline, voids: lay.voids, wets: lay.wets, rules, lines: lay.lines, minU: lay.frame.minU, centresMm: lay.totals.centresMm, product: hebel ? "hebel" : "structaflor" });
  const sheetDemand = (s, count, label) => ({ id: demandId(materialId, "floor-sheet", s.sheet.name), materialId, role: "floor sheet", kind: "count", unit: "piece", quantity: count, lengthMm: s.sheet.lengthMm,
    identity: { family: "floorSheet", id: s.sheet.name.toLowerCase().replace(/\s+/g, "-"), name: s.sheet.name }, label, itemDescription: s.sheet.name, sourceRefs, provenance: "calculated" });
  const seen = new Set();
  const addNotes = (list) => { for (const p of list) if (!seen.has(p.message)) { seen.add(p.message); problems.push(p); } };
  const overlayCJ = [];
  if (sh) {
    lay.sheets = sh;
    addNotes(sh.problems);
    if (sh.orderedSheets > 0) demands.push(sheetDemand(sh, sh.orderedSheets, `${sh.orderedSheets} × ${sh.sheet.name} (${sh.packedSheets} packed + ${sh.wastePct}% waste, ${sh.laidM2} m² laid)`));
    explain.push(`Flooring: ${sh.sheet.name}, ${sh.rows} rows across the trusses, ${sh.packedSheets} sheets ${sh.reuseOffcuts ? "with offcuts reused" : "with no offcut reuse"}, +${sh.wastePct}% waste = ${sh.summary}`);
    overlayCJ.push(...(sh.controlJoints || []));
    if (hebel) addNotes([{ code: "floor_hebel_height", message: "Hebel raises the floor 75 mm.", blocking: false }]);
  }
  // Phase 3: Scyon Secura in each wet area (the guide's layout in the floor's own truss frame), waste applied once over all wet areas after offcut reuse
  const F = floorFrame(input.outline, rules);
  const wetSheets = [];
  for (const w of lay.wets) {
    const ws = layoutSheets({ outline: w.points, voids: [], wets: [], rules: { ...rules, wastePct: 0 }, lines: lay.lines, minU: lay.frame.minU, centresMm: lay.totals.centresMm, product: "scyon", frame: F });
    if (ws) { wetSheets.push({ id: w.id, name: w.name, ...ws }); addNotes(ws.problems.map((p) => ({ ...p, message: wetSheets.length > 1 || lay.wets.length > 1 ? `${w.name}: ${p.message}` : p.message }))); overlayCJ.push(...(ws.controlJoints || [])); }
  }
  let wastePct = rules.wastePct == null || rules.wastePct === "" ? DEFAULT_WASTE_PCT : Number(rules.wastePct);
  if (!(wastePct >= 0 && wastePct <= 50)) wastePct = DEFAULT_WASTE_PCT;
  if (wetSheets.length) {
    const packed = wetSheets.reduce((t, x) => t + x.packedSheets, 0);
    const ordered = Math.ceil(packed * (1 + wastePct / 100) - 1e-9);
    const s0 = wetSheets[0];
    lay.wetSheets = wetSheets;
    lay.scyon = { sheet: s0.sheet, packedSheets: packed, wastePct, orderedSheets: ordered, laidM2: Math.round(wetSheets.reduce((t, x) => t + x.laidM2, 0) * 100) / 100, reuseOffcuts: s0.reuseOffcuts, summary: `${ordered} sheets (${wetSheets.reduce((t, x) => t + x.laidM2, 0).toFixed(2)} m² laid, waste ${wastePct}%)` };
    if (ordered > 0) demands.push(sheetDemand(s0, ordered, `${ordered} × ${s0.sheet.name} (${packed} packed + ${wastePct}% waste, wet areas)`));
    explain.push(`Wet areas: ${s0.sheet.name}, ${packed} sheets ${s0.reuseOffcuts ? "with offcuts reused" : "with no offcut reuse"}, +${wastePct}% waste = ${lay.scyon.summary}`);
    if (Number(lay.totals.centresMm) !== 450) addNotes([{ code: "floor_wet_centres", message: "Wet areas need trusses at 450 — check the truss layout", blocking: false }]);
  }
  const chord = Number(rules.chordWidthMm);
  if ((sh || wetSheets.length) && chord > 0 && chord < 45) addNotes([{ code: "floor_support_width", message: `A support only ${chord} mm wide is under the 45 mm the Hebel and Scyon guides need. Check with the truss supplier.`, blocking: false }]);
  lay.controlJoints = overlayCJ;
  // accessories (Sam, 19 Nov 2026): supplier-style FLOORING ACCESSORIES lines, each with its own short basis note
  lay.accessories = floorAccessories({ main: sh, wets: wetSheets, rules, centresMm: lay.totals.centresMm });
  for (const a of lay.accessories) demands.push({ id: demandId(materialId, "floor-accessory", a.key), materialId, role: "floor accessory", kind: "count", unit: a.unit === "lm" ? "lm" : "box", quantity: a.quantity,
    identity: { family: "floorAccessory", id: a.key, name: a.product }, label: `${a.quantity} × ${a.product}`, itemDescription: a.product, accUnit: a.unit === "lm" ? "lm" : "ea", note: a.note, sourceRefs, provenance: "calculated" });
  // P5 (Sam, 21 Nov 2026: "always nails, with joist brackets"): FLOOR FIXINGS counted from the truss ends, strongback crossings and end strongback edges
  lay.fixings = floorFixings({ layout: lay, trussDepthMm: depthMm });
  for (const f of lay.fixings) demands.push({ id: demandId(materialId, "floor-fixing", f.key), materialId, role: "floor fixing", kind: "count", unit: "box", quantity: f.quantity,
    identity: { family: "floorFixing", id: f.key, name: f.product }, label: `${f.quantity} × ${f.product}`, itemDescription: f.product, accUnit: "ea", note: f.note, sourceRefs, provenance: "calculated" });
  explain.push(`Floor frame: ${fmt(lay.frame.widthMm)} wide across the trusses, trusses span ${fmt(lay.frame.spanMm)} at ${lay.totals.centresMm} centres = ${lay.totals.trussCount} trusses (a truss on the far edge always)`);
  explain.push(`Truss depth ${depthMm} mm${rules.trussDepthMm == null ? " (default)" : ""}; strongback size by Pryda Table 9 would be ${strongbackSizeForDepth(depthMm).replace("x", " x ")}`);
  if (joined) explain.push(`Strongback joins: ${joined}, each overlapped two truss spaces (${lapMm} mm) = ${lay.totals.strongbackLapLm} lm extra (Pryda p27)`);
  if (lay.totals.tieRows) explain.push(`No ceiling under: ${lay.totals.tieRows} row${lay.totals.tieRows === 1 ? "" : "s"} of ${NO_CEILING_TIE_SIZE.replace("x", " x ")} lateral ties at 3,000 max centres = ${lay.totals.tieLm} lm (Pryda p13, p28)`);
  explain.push(`Strongbacks: ${lay.totals.endStrongbackLm} lm at truss ends with no beam, ${lay.totals.midStrongbackLm} lm mid-span (${lay.totals.strongbackRows} row${lay.totals.strongbackRows === 1 ? "" : "s"}${rules.strongbackRows == null ? ", from the span" : ", set for this job"})`);
  if (lay.beams.length) explain.push(`Beams: ${lay.beams.map((b) => `edge ${b.label} ${b.size} ${(b.lengthMm / 1000).toFixed(2)} m`).join(", ")}`);
  if (lay.trimmers.length) explain.push(`Stair beams: ${lay.voids.filter((v) => v.stair).length} stair void(s), ${lay.totals.trimmerLm} lm`);
  if (lay.totals.longestSpanMm > LONG_SPAN_NOTE_MM) problems.push({ code: "floor_long_span", message: "Spans over 6 m: check the truss depth and chords with the supplier.", blocking: false });
  if (sbSection && sbSection !== strongbackSizeForDepth(depthMm) && rules.strongbackSizeSet !== true) problems.push({ code: "floor_strongback_size_table", message: `Pryda Table 9 gives ${strongbackSizeForDepth(depthMm).replace("x", " x ")} strongbacks for ${depthMm} deep trusses; this item has ${sbSection.replace("x", " x ")}. Check with the truss supplier.`, blocking: false });
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
