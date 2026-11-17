// =============================================================================
// standards/index.js — HUB 031 (Sam, 17 Nov 2026): the cited span tables the opening rules read — jamb studs per side
// and lintel size — and nothing else. Pure, no I/O.
//
// Tables (every one in data/, with its source, edition and page; see standards/README.md):
//   AS 1684.2 N1/N2 Supplement 4 (2006), MGP10:  T17 / T18 lintels (sheet / tile), T11 jamb studs, T7 / T36 studs
//   Smart10 LVL Stud Design Guide (Mar 2024):    jamb studs, common studs (un-notched, 20 mm notched), lintels
//   SmartLVL 13 Design Guide (E1 2021):          single span lintels, single/upper storey
//
// FAIL CLOSED (the rule Sam set on the last release): a size or a jamb count is only ever read from a table row for
// inputs the office actually gave. Anything missing is "needs_roof" (never a default), anything outside a table's
// published scope (wind class, storey, roof width, span) is "engineer" (never a nearest size), and a stud that isn't in
// the jamb table's list of sections is "not_in_table". The roof width and spacing round UP to the next column, the
// conservative way; above the last column is engineer.
// =============================================================================
import MGP10 from "./data/as1684-mgp10-n1n2.js";
import SMART10 from "./data/smart10-2024.js";
import SMARTLVL13 from "./data/smartlvl13-e1-2021.js";

/** The roof load widths the tables are laid out in (mm). The card offers exactly these; "Not sure" leaves openings at "needs roof information". */
export const ROOF_LOAD_WIDTHS_MM = Object.freeze([1500, 3000, 4500, 6000, 7500]);
/** Rafter or truss spacings the lintel tables have columns for (mm). */
export const ROOF_SPACINGS_MM = Object.freeze([600, 1200]);
/** Where a lintel size is looked up. First is the default (Sam's lintels are LVL). */
export const LINTEL_PRODUCTS = Object.freeze([["SmartLVL13", "SmartLVL 13 (LVL)"], ["MGP10", "Pine MGP10"]]);

/** Wind classes each table family covers (single or upper storey). Anything else is an engineer's or the supplier's. */
export const TABLE_WIND = Object.freeze({ MGP10: ["N1", "N2"], SmartLVL13: ["N1", "N2", "N3", "N4"], Smart10: ["N1", "N2", "N3", "N4"] });
/** The edition each table family is read from, shown on every size and jamb count it gives. */
export const TABLE_SOURCES = Object.freeze({
  MGP10: { name: "AS 1684.2 N1/N2 Supplement 4", edition: "2006", grade: "MGP10" },
  SmartLVL13: { name: "SmartLVL 13 Design Guide", edition: "E1 2021", grade: "LVL13" },
  Smart10: { name: "Smart10 LVL Stud Design Guide", edition: "Mar 2024", grade: "LVL Smart 10" },
});
/** Every mapped table: id → { id, source, edition, page(s) } for the SOP and the tests. */
export function tableRecord() {
  const out = [];
  for (const [fam, d] of [["MGP10", MGP10], ["Smart10", SMART10], ["SmartLVL13", SMARTLVL13]]) {
    for (const t of Object.values(d.tables)) {
      const c = t.citation || {};
      out.push({ id: t.id, family: fam, source: TABLE_SOURCES[fam].name, edition: TABLE_SOURCES[fam].edition, page: c.page ?? c.pdfPage ?? c.pdfPages ?? null, guidePage: c.guidePage ?? c.guidePages ?? null, rows: t.rows.length });
    }
  }
  return out;
}

const up = (values, q) => values.find((v) => v >= q) ?? null;   // the next column up, null above the last
const cite = (fam, id, page) => `${TABLE_SOURCES[fam].name} (${TABLE_SOURCES[fam].edition}), ${id}, page ${page}`;
const needs = (...reasons) => ({ outcome: "needs_roof", reasons, basis: "" });
const engineer = (basis, ...reasons) => ({ outcome: "engineer", reasons, basis });

/** The wind class gate shared by every lookup: missing → needs, outside the table → engineer. */
function windGate(fam, windClass) {
  if (!windClass) return needs("the wind class isn't set");
  if (!TABLE_WIND[fam].includes(windClass)) return engineer(`wind class ${windClass} is outside ${TABLE_SOURCES[fam].name}`, `${windClass} isn't in the ${TABLE_SOURCES[fam].name} tables (${TABLE_WIND[fam].join(", ")} only): needs an engineer or the supplier`);
  return null;
}
function storeyGate(storey) {
  if (storey && storey !== "single_upper") return engineer("lower storey is not built", "a lower storey needs an engineer or the supplier (not built yet)");
  return null;
}

/**
 * Which jamb table a stud is read against: "Smart10" for LVL Smart 10 studs, "MGP10" for MGP10 sawn pine; anything else
 * (another grade or product) has no jamb table here.
 */
export function jambFamilyOf(stud) {
  const grade = String(stud?.grade || "");
  if (/smart\s*10/i.test(grade)) return "Smart10";
  if (/^mgp\s*10$/i.test(grade.trim())) return "MGP10";
  return null;
}

/**
 * Jamb studs per side for an opening (the count INCLUDES the king and the stud under the lintel: Sam, 17 Nov 2026).
 * @param {{ stud:{ depthMm:number, widthMm:number, grade:string }, roofMass?:"sheet"|"tile", rlwMm?:number, windClass?:string, storey?:string,
 *   jambHeightMm:number, openingWidthMm:number }} q   stud.widthMm is the stud's breadth along the wall (35 for a 90 × 35)
 * @returns {{ outcome:"ok"|"needs_roof"|"engineer"|"not_in_table", jambsPerSide:number|null, section?:string, basis:string, reasons?:string[], table?:string }}
 */
export function selectJambs(q) {
  const fam = jambFamilyOf(q.stud);
  if (!fam) return { outcome: "not_in_table", jambsPerSide: null, basis: "", reasons: [`${q.stud?.grade || "this stud"} has no jamb table here: enter the jamb count from the supplier's table`] };
  const g = storeyGate(q.storey) || windGate(fam, q.windClass);
  if (g) return { ...g, jambsPerSide: null };
  if (q.roofMass !== "sheet" && q.roofMass !== "tile") return { ...needs("the roof covering (sheet or tile) isn't set"), jambsPerSide: null };
  if (!(q.rlwMm > 0)) return { ...needs("the roof width the wall carries isn't set"), jambsPerSide: null };
  const table = fam === "MGP10" ? MGP10.tables.T11 : SMART10.tables["S10-JAMB"];
  const rlw = up(ROOF_LOAD_WIDTHS_MM, q.rlwMm);
  if (rlw == null) return { ...engineer(`roof width ${q.rlwMm} is above the ${ROOF_LOAD_WIDTHS_MM.at(-1)} the table goes to`, `a roof width over ${ROOF_LOAD_WIDTHS_MM.at(-1)} needs an engineer or the supplier`), jambsPerSide: null };
  const col = table.columns.findIndex((c) => c.roof === q.roofMass && (c.rlwMm ?? c.rlw) === rlw);
  const sec = `${q.stud.depthMm}x${q.stud.widthMm}`;
  const configs = [...new Set(table.rows.filter((r) => r.depthMm === q.stud.depthMm && r.breadthMm === q.stud.widthMm).map((r) => r.jambsPerSide ?? r.plies))].sort((a, b) => a - b);
  const page = fam === "MGP10" ? table.citation.page : `${table.citation.pdfPage} (guide p. ${table.citation.guidePage})`;
  const basisOf = (extra) => `${cite(fam, table.id, page)}, ${q.roofMass} roof, roof width ${rlw}${extra ? `, ${extra}` : ""}`;
  if (!configs.length) return { outcome: "not_in_table", jambsPerSide: null, basis: basisOf(""), reasons: [`${sec} isn't a jamb stud section in ${cite(fam, table.id, page)}: enter the jamb count from the supplier's table`], table: table.id };
  for (const n of configs) {
    const row = table.rows.filter((r) => r.depthMm === q.stud.depthMm && r.breadthMm === q.stud.widthMm && (r.jambsPerSide ?? r.plies) === n && r.heightMm >= q.jambHeightMm)
      .sort((a, b) => a.heightMm - b.heightMm)[0];
    if (!row) continue;   // this arrangement can't reach the wall height
    const cap = row.maxOpeningMm[col];
    if (cap != null && cap >= q.openingWidthMm) {
      return { outcome: "ok", jambsPerSide: n, section: sec, table: table.id, basis: basisOf(`${n}/${sec} to ${row.heightMm} high carries a ${cap} opening`) };
    }
  }
  return { ...engineer(basisOf(`no ${sec} arrangement carries a ${q.openingWidthMm} opening at ${q.jambHeightMm} high`), `a ${q.openingWidthMm} opening is beyond the ${sec} jamb table at this roof: needs an engineer or the supplier`), jambsPerSide: null, table: table.id, section: sec };
}

/**
 * The smallest lintel that spans an opening, from one product's table.
 * @param {{ product:"SmartLVL13"|"MGP10", roofMass?:"sheet"|"tile", rlwMm?:number, spacingMm?:number, windClass?:string, storey?:string,
 *   spanMm:number, maxThicknessMm?:number, maxDepthMm?:number }} q   maxThicknessMm = the wall's thickness (a 2/45 lintel is 90 across; wider doesn't fit the frame); maxDepthMm = the free height above the head
 * @returns {{ outcome:"ok"|"needs_roof"|"engineer", section?:string, depthMm?:number, breadthMm?:number, plies?:number, grade?:string,
 *   extraBearingMm?:number, maxSpanMm?:number, basis:string, reasons?:string[] }}
 */
export function selectLintel(q) {
  const fam = q.product === "MGP10" ? "MGP10" : "SmartLVL13";
  const g = storeyGate(q.storey) || windGate(fam, q.windClass);
  if (g) return g;
  if (q.roofMass !== "sheet" && q.roofMass !== "tile") return needs("the roof covering (sheet or tile) isn't set");
  if (!(q.rlwMm > 0)) return needs("the roof width this opening carries isn't set");
  if (!(q.spacingMm > 0)) return needs("the rafter or truss spacing isn't set");
  const rlw = up(ROOF_LOAD_WIDTHS_MM, q.rlwMm);
  if (rlw == null) return engineer(`roof width ${q.rlwMm} is above the ${ROOF_LOAD_WIDTHS_MM.at(-1)} the table goes to`, `a roof width over ${ROOF_LOAD_WIDTHS_MM.at(-1)} needs an engineer or the supplier`);
  const sp = up(ROOF_SPACINGS_MM, q.spacingMm);
  if (sp == null) return engineer(`spacing ${q.spacingMm} is above the ${ROOF_SPACINGS_MM.at(-1)} the table goes to`, `a spacing over ${ROOF_SPACINGS_MM.at(-1)} needs an engineer or the supplier`);
  let table, page, rows;
  if (fam === "MGP10") {
    table = q.roofMass === "sheet" ? MGP10.tables.T17 : MGP10.tables.T18;
    page = table.citation.page;
    const col = table.columns.findIndex((c) => c.rlw === rlw && c.spacing === sp);
    rows = table.rows.map((r) => ({ ...r, span: r.maxSpanMm[col], extra: 0 }));
  } else {
    table = SMARTLVL13.tables["L13-LINTEL"];
    page = `${table.citation.pdfPages.join(" and ")} (guide pp. ${table.citation.guidePages.join(" and ")})`;
    const col = table.columns.findIndex((c) => c.rlwMm === rlw && c.spacingMm === sp);
    const mass = q.roofMass === "sheet" ? 40 : 90;
    rows = table.rows.filter((r) => r.massKgM2 === mass).map((r) => ({ ...r, span: r.spansMm[col], extra: r.extraBearingMm[col] }));
  }
  const basis = `${cite(fam, table.id, page)}, ${q.roofMass} roof, roof width ${rlw}, spacing ${sp}`;
  // which member to suggest: spans the opening, no thicker than the wall; then the way Sam orders (x45 sections first,
  // one member before a laminated pair, then the shallowest). With the free height above the head given, the first that fits
  // under it wins (a laminated pair can fit where a single deep member can't); if none fits, the best overall comes back
  // and the caller says it doesn't fit.
  const rank = (a, b) => (a.breadthMm === 45 ? 0 : 1) - (b.breadthMm === 45 ? 0 : 1) || a.plies - b.plies || a.depthMm - b.depthMm || a.breadthMm - b.breadthMm;
  const passing = rows.filter((r) => (!(q.maxThicknessMm > 0) || r.breadthMm * r.plies <= q.maxThicknessMm) && r.span != null && r.span >= q.spanMm).sort(rank);
  const pick = (q.maxDepthMm > 0 ? passing.find((r) => r.depthMm <= q.maxDepthMm) : null) || passing[0];
  if (pick) {
    const r = pick;
    return { outcome: "ok", section: `${r.depthMm}x${r.breadthMm}`, depthMm: r.depthMm, breadthMm: r.breadthMm, plies: r.plies, grade: TABLE_SOURCES[fam].grade, extraBearingMm: r.extra || 0,
      maxSpanMm: r.span, basis: `${basis} → ${r.plies > 1 ? `${r.plies}/` : ""}${r.depthMm}x${r.breadthMm} spans ${r.span}`, table: table.id };
  }
  return engineer(basis, `a ${q.spanMm} span is beyond the ${fam === "MGP10" ? "pine" : "LVL"} lintel table at this roof: needs an engineer or the supplier`);
}
