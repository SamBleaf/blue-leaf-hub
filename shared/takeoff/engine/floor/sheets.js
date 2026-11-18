// =============================================================================
// shared/takeoff/engine/floor/sheets.js — Floor frame Phase 2: the Structaflor main-floor sheet layout and count (Sam, 18 Nov 2026).
// Plan: docs/takeoff/FLOOR_FRAMING_PLAN.md section 7 (Sam's answers in section 0 win).
//
// PURE. Works in the truss frame of geometry.js (u across the trusses, v along them). Sheets run ACROSS the trusses, so a sheet's length is along u
// and the rows stack along v from the outline's first edge, one sheet width apart; the last row is ripped to what is left.
//   Joints     every end joint (between two pieces of one row) lands on a truss line; alternate rows start with a half sheet (1800), then full sheets,
//              and the joints of adjacent rows are at least 600 apart. A row no longer than one sheet is one piece (no joint, no offset).
//   Cutting    each row is the strip of the floor outline, less openings and wet areas; a void or wet area that fills the whole strip splits the row into
//              segments, a partly covered strip is laid over the notch (counted at its longest length: the cut is waste).
//   Counting   whole-length pieces are whole sheets; cut pieces are packed into sheets by the shared linear allocator (the cutting-plan way, one saw cut
//              each, a pack within PACK_FIT_TOLERANCE_MM of full is accepted); the last part-width row is ripped into strips, strips side by side in one sheet.
//              With offcut reuse off every piece takes its own sheet. Waste % is added AFTER the packed count and rounded up to a whole sheet.
// Wet areas are laid in phase 3 (Scyon): here they are only taken out of the main floor.
// =============================================================================
import { allocateLinear } from "../allocator.js";
import { floorFrame, mergeIntervals, spansAt, ringAreaMm2 } from "./geometry.js";

/** Sam, 18 Nov 2026: the default Structaflor sheet (3600 x 800; 3600 x 600 is the option). */
export const STRUCTAFLOR = Object.freeze({ lengthMm: 3600, widthsMm: [800, 600], defaultWidthMm: 800 });
/** Plan 7.7: n pieces from one sheet need n-1 cuts, so an exact fit (1800 + 1800) comes up a saw cut short; a pack within this of full is accepted (the last piece is cut to fit on site). */
export const PACK_FIT_TOLERANCE_MM = 10;
/** Saw cut allowance between two pieces cut from one sheet. */
export const SHEET_CUT_MM = 5;
/** Joints of adjacent rows are at least this far apart (Sam). */
export const STAGGER_MIN_MM = 600;
/** A half sheet starts alternate rows. */
export const HALF_SHEET_MM = 1800;
/** A last piece under this is avoided by moving the joint back one truss. */
export const MIN_END_PIECE_MM = 300;
/** Rip allowance (cut edge and tongue loss): strips per sheet = floor((width - this) / strip width). */
export const RIP_ALLOWANCE_MM = 10;
/** A leftover row narrower than this is tracing noise, not a row (same reading as the 5 mm truss tolerance). */
export const ROW_TOLERANCE_MM = 5;
/** Sam, 18 Nov 2026: waste is 5% by default, applied after offcut reuse and rounded up to whole sheets; editable per job. */
export const DEFAULT_WASTE_PCT = 5;

/** Thickness comes from the truss centres: Structaflor 19 mm at 450 (and closer), 22 mm at 600. */
export const structaflorThicknessMm = (centresMm) => (Number(centresMm) <= 450 ? 19 : 22);
export const structaflorName = (lengthMm, widthMm, thicknessMm) => `STRUCTAFLOR ${lengthMm}x${widthMm}x${thicknessMm}`;

const round1 = (n) => Math.round(n * 10) / 10;
const swapUV = (ring) => ring.map((p) => ({ u: p.v, v: p.u }));
const subtract = (base, cuts) => {
  const out = [];
  const cs = [...cuts].sort((x, y) => x[0] - y[0]);
  for (const [a, b] of base) {
    let cur = a;
    for (const [c0, c1] of cs) { if (c1 <= cur || c0 >= b) continue; if (c0 > cur) out.push([cur, c0]); cur = Math.max(cur, c1); }
    if (cur < b) out.push([cur, b]);
  }
  return out.filter(([a, b]) => b - a > 1);
};

/** Pack cut lengths into sheets of one length with the shared allocator (the cutting-plan way). Returns the number of sheets. */
function packSheets(lengths, sheetLengthMm) {
  if (!lengths.length) return 0;
  const identity = { family: "floor-sheet", lengthMm: sheetLengthMm };
  const policy = { kind: "list", lengthsMm: [sheetLengthMm + PACK_FIT_TOLERANCE_MM], kerfMm: SHEET_CUT_MM, kerfConfirmed: true, finalEndAcceptable: true, sharePieces: true };
  const sorted = [...lengths].sort((a, b) => b - a);
  const r = allocateLinear(sorted.map((len, i) => ({ id: `p${i}`, kind: "linear", unit: "piece", lengthMm: len, lengthKind: "cut", quantity: 1, identity, stockPolicy: policy, label: `p${i}` })), { nodeBudget: 50_000 });
  const g = r.groups[0];
  return (g?.bars || []).length + (g?.unavailable || []).length;
}

/**
 * @param {{ outline, voids?, wets?, rules?, lines: Array<{uMm:number}>, minU:number, centresMm:number }} input  plan-frame millimetres (the frame layout's own voids / wets / truss lines)
 * @returns {object|null} null when there is no main floor to sheet
 */
export function layoutSheets(input) {
  const rules = input.rules || {};
  const problems = [];
  const note = (code, message) => problems.push({ code, message, blocking: false });
  const L = STRUCTAFLOR.lengthMm;
  const W = rules.sheetWidthMm === 600 ? 600 : STRUCTAFLOR.defaultWidthMm;
  let wastePct = rules.wastePct == null || rules.wastePct === "" ? DEFAULT_WASTE_PCT : Number(rules.wastePct);
  if (!(wastePct >= 0 && wastePct <= 50)) { note("floor_sheet_waste_invalid", `Waste must be 0 to 50%, so ${DEFAULT_WASTE_PCT}% was used.`); wastePct = DEFAULT_WASTE_PCT; }
  const reuse = rules.reuseOffcuts !== false;
  const centres = Number(input.centresMm);
  const thicknessMm = structaflorThicknessMm(centres);
  if (centres > 600) note("floor_sheet_centres", `Structaflor is only listed for 450 and 600 centres. ${centres} centres uses the 22 mm sheet: confirm the thickness with the supplier.`);

  const F = floorFrame(input.outline, rules);
  const loc = (pts) => pts.map((p) => F.toLocal(p));
  const O = loc(input.outline);
  const cutRings = [...(input.voids || []), ...(input.wets || [])].map((s) => loc(s.points));
  const minV = Math.min(...O.map((p) => p.v)), maxV = Math.max(...O.map((p) => p.v));
  const us = (input.lines || []).map((l) => input.minU + l.uMm).sort((a, b) => a - b);
  const breaks = [...O, ...cutRings.flat()].map((p) => p.v);
  const scan = (ring, v) => spansAt(swapUV(ring), v);

  // rows and their segments
  const rows = [];
  for (let k = 0; ; k++) {
    const v0 = minV + k * W;
    if (v0 >= maxV - ROW_TOLERANCE_MM) break;
    const v1 = Math.min(v0 + W, maxV);
    const edges = [v0, v1, ...breaks.filter((b) => b > v0 + 0.5 && b < v1 - 0.5)].sort((a, b) => a - b);
    let ivs = [];
    for (let i = 0; i + 1 < edges.length; i++) {
      if (edges[i + 1] - edges[i] < 0.5) continue;
      const mid = (edges[i] + edges[i + 1]) / 2;
      const cut = mergeIntervals(cutRings.flatMap((r) => scan(r, mid)));
      ivs = ivs.concat(subtract(scan(O, mid), cut));
    }
    rows.push({ k, v0, v1, widthMm: v1 - v0, segments: mergeIntervals(ivs).filter(([a, b]) => b - a > 1) });
  }

  // fill: joints on truss lines, alternate starts, adjacent rows at least STAGGER_MIN_MM apart
  let prev = [], minStagger = Infinity, offTruss = 0, closeJoints = 0, openingEnds = 0;
  const pieces = [];
  for (const row of rows) {
    const parityB = row.k % 2 === 1;
    const joints = [];
    const outlineEnds = scan(O, (row.v0 + row.v1) / 2).flat();
    for (const [a, b] of row.segments) {
      // a sheet end beside a void or wet edge that is not on a truss line needs blocking there
      for (const e of [a, b]) if (!outlineEnds.some((o) => Math.abs(o - e) < 2) && !us.some((x) => Math.abs(x - e) < 2)) openingEnds++;
      let pos = a, first = true;
      const own = [];
      const passes = (x) => prev.every((p) => Math.abs(p - x) >= STAGGER_MIN_MM - 1e-6);
      while (b - pos > L + ROW_TOLERANCE_MM) {
        const target = pos + (first && parityB ? HALF_SHEET_MM : L);
        let cands = us.filter((x) => x >= pos + MIN_END_PIECE_MM - 1e-6 && x <= Math.min(pos + L, b - MIN_END_PIECE_MM) + 1e-6);
        if (!cands.length) cands = us.filter((x) => x > pos + 1 && x <= Math.min(pos + L, b - 1) + 1e-6);
        let x;
        if (!cands.length) { x = Math.min(pos + L, b - 1); offTruss++; }
        else {
          cands.sort((p, q) => Math.abs(p - target) - Math.abs(q - target) || p - q);
          x = cands.find(passes);
          if (x === undefined) { x = cands[0]; closeJoints++; }
        }
        own.push(x); pos = x; first = false;
      }
      // a last piece under 300 mm: move the last joint back one truss where that keeps the stagger
      if (own.length && b - pos < MIN_END_PIECE_MM) {
        const j = own[own.length - 1], before = own.length > 1 ? own[own.length - 2] : a;
        const back = us.filter((x) => x > before + MIN_END_PIECE_MM - 1e-6 && x < j - 1e-6 && b - x <= L + ROW_TOLERANCE_MM && passes(x)).pop();
        if (back !== undefined) own[own.length - 1] = back;
      }
      const cuts = [a, ...own, b];
      for (let i = 0; i + 1 < cuts.length; i++) pieces.push({ row: row.k, uA: cuts[i], uB: cuts[i + 1], v0: row.v0, v1: row.v1, widthMm: row.widthMm, lengthMm: cuts[i + 1] - cuts[i] });
      joints.push(...own);
    }
    for (const j of joints) for (const p of prev) minStagger = Math.min(minStagger, Math.abs(j - p));
    prev = joints;
  }
  if (closeJoints) note("floor_sheet_stagger", `${closeJoints} sheet joint${closeJoints === 1 ? " is" : "s are"} under ${STAGGER_MIN_MM} mm from the joint in the next row: this outline leaves no better truss line. Check the layout on site.`);
  if (offTruss) note("floor_sheet_joint_off_truss", `${offTruss} sheet joint${offTruss === 1 ? " has" : "s have"} no truss line to land on at this centres. Check the layout on site.`);

  if (openingEnds) note("floor_sheet_opening_edge", `${openingEnds} sheet end${openingEnds === 1 ? "" : "s"} beside a stair void or wet area ${openingEnds === 1 ? "isn't" : "aren't"} on a truss line. Add blocking under ${openingEnds === 1 ? "it" : "them"} on site.`);

  // counting
  const ripped = (p) => p.widthMm < W - ROW_TOLERANCE_MM;
  const whole = pieces.filter((p) => !ripped(p) && p.lengthMm >= L - PACK_FIT_TOLERANCE_MM);
  const cut = pieces.filter((p) => !ripped(p) && p.lengthMm < L - PACK_FIT_TOLERANCE_MM);
  const strips = pieces.filter(ripped);
  const lanes = (w) => Math.max(1, Math.floor((W - RIP_ALLOWANCE_MM) / w));
  const stripSheets = (reuseOn) => {
    const byWidth = new Map();
    for (const s of strips) { const key = Math.round(s.widthMm); byWidth.set(key, [...(byWidth.get(key) || []), s]); }
    let n = 0;
    for (const [w, list] of byWidth) {
      const k = lanes(w);
      // a strip is only ever a lane of the sheet it is ripped from, so lanes (not sheets) are packed, then k lanes to a sheet
      n += Math.ceil((reuseOn ? packSheets(list.map((s) => Math.min(s.lengthMm, L)), L) : list.length) / k);
    }
    return n;
  };
  const packed = { whole: whole.length, cut: packSheets(cut.map((p) => p.lengthMm), L), strips: stripSheets(true) };
  packed.total = packed.whole + packed.cut + packed.strips;
  const unreused = whole.length + cut.length + stripSheets(false);
  const packedSheets = reuse ? packed.total : unreused;
  const orderedSheets = Math.ceil(packedSheets * (1 + wastePct / 100) - 1e-9);
  const areaMm2 = ringAreaMm2(input.outline) - [...(input.voids || []), ...(input.wets || [])].reduce((a, s) => a + ringAreaMm2(s.points), 0);
  const laidM2 = Math.round((areaMm2 / 1e6) * 100) / 100;
  if (!(areaMm2 > 1e4) || !pieces.length) return null;

  const corner = (u, v) => { const q = F.fromLocal({ u, v }); return { x: round1(q.x), y: round1(q.y) }; };
  return {
    sheet: { lengthMm: L, widthMm: W, thicknessMm, name: structaflorName(L, W, thicknessMm) },
    rows: rows.length, rippedRowWidthMm: strips.length ? round1(strips[0].widthMm) : null,
    packed, packedNoReuseSheets: unreused, reuseOffcuts: reuse, packedSheets, wastePct, orderedSheets, laidM2,
    minStaggerMm: Number.isFinite(minStagger) ? round1(minStagger) : null,
    summary: `${orderedSheets} sheets (${laidM2} m² laid, waste ${wastePct}%)`,
    pieces: pieces.map((p) => ({ row: p.row + 1, lengthMm: round1(p.lengthMm), widthMm: round1(p.widthMm), corners: [corner(p.uA, p.v0), corner(p.uB, p.v0), corner(p.uB, p.v1), corner(p.uA, p.v1)] })),
    // for the tests: each row's joints (u across the trusses, relative to the first truss)
    rowJoints: rows.map((r) => pieces.filter((p) => p.row === r.k).map((p) => p.uB).filter((u) => r.segments.every(([, b]) => Math.abs(u - b) > 1e-6)).map((u) => round1(u - input.minU))),
    problems,
  };
}
