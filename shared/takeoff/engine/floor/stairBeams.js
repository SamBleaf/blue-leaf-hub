// =============================================================================
// shared/takeoff/engine/floor/stairBeams.js — Floor frame P5b: stair beam sizing from the SmartLVL 13 table (Sam, 21 Nov 2026:
// "can't you use the LVL span tables to establish the correct sizing? that should be built in"). PURE.
//
// Table: SmartLVL 13 Design Guide (E1 2021), "Single span floor bearers supporting floor loads only", floor mass 40 kg/m2,
// L13-FLOOR-BEARER in standards/data/smartlvl13-e1-2021.js (generated; pdf page 16, guide page 13).
// Rule: enter at the floor load width (the next column up, never below), read down to a span equal to or greater than the beam's span.
// Candidates in Sam's order, first that spans wins: 400x63, then 2/400x45 (two plies side by side), then 450x63. The single 400x45 is
// not in this table (only 2/400x45), so it is never chosen automatically (it stays a hand pick). If none spans, or the floor load width
// is beyond the table, the size is "Engineer" (no LVL quantity), exactly like a lintel nothing spans.
// =============================================================================
import SMARTLVL13 from "../../standards/data/smartlvl13-e1-2021.js";

export const STAIR_BEAM_TABLE_ID = "L13-FLOOR-BEARER";
export const STAIR_BEAM_CANDIDATES = Object.freeze(["400x63", "2/400x45", "450x63"]);
export const STAIR_BEAM_ENGINEER = "Engineer";
export const STAIR_BEAM_TABLE_LABEL = "SmartLVL 13 single span floor bearer table (guide p13)";
export const STAIR_BEAM_SIDE_NOTE = "Side stair beams carry the header beams as point loads: check with the engineer or LVL supplier.";

const table = () => SMARTLVL13.tables[STAIR_BEAM_TABLE_ID];

/** "2/400x45" -> { plies: 2, section: "400x45" }; "400x63" -> { plies: 1, section: "400x63" }. */
export function sizePlies(size) {
  const m = /^(?:(\d)\/)?(\d+(?:\.\d+)?x\d+(?:\.\d+)?)$/.exec(String(size ?? ""));
  return m ? { plies: m[1] ? Number(m[1]) : 1, section: m[2] } : null;
}

/**
 * @param {{ spanMm: number, flwMm: number }} q  the beam's clear span and the floor load width it carries (half the span of the trusses on it)
 * @returns {{ outcome: "ok"|"engineer", size: string, flwColumnMm: number|null, maxSpanMm: number|null, extraBearingMm: number, reason: string }}
 */
export function sizeStairBeam({ spanMm, flwMm }) {
  const t = table();
  const col = t.floorLwMm.findIndex((c) => c >= Math.max(0, Number(flwMm) || 0) - 1e-6);
  if (col < 0) return { outcome: "engineer", size: STAIR_BEAM_ENGINEER, flwColumnMm: null, maxSpanMm: null, extraBearingMm: 0, reason: `floor load width ${Math.round(flwMm)} is beyond the table's last column (${t.floorLwMm[t.floorLwMm.length - 1]})` };
  for (const size of STAIR_BEAM_CANDIDATES) {
    const row = t.rows.find((r) => r.size === size);
    const max = row?.spansMm[col] ?? null;
    if (max != null && max >= spanMm - 1e-6) return { outcome: "ok", size, flwColumnMm: t.floorLwMm[col], maxSpanMm: max, extraBearingMm: row.extraBearingMm[col] || 0, reason: "" };
  }
  return { outcome: "engineer", size: STAIR_BEAM_ENGINEER, flwColumnMm: t.floorLwMm[col], maxSpanMm: null, extraBearingMm: 0, reason: `none of ${STAIR_BEAM_CANDIDATES.join(", ")} spans ${Math.round(spanMm)} at floor load width column ${t.floorLwMm[col]}` };
}
