// =============================================================================
// shared/takeoff/engine/sheetCutPlan.js — sharing cladding sheets across a wall (Hub review HUB 016, 20 Oct 2026).
//
// Owner rule (Sam): the LONG edges of a sheet stay factory — tongue on one side, groove on the other — so a sheet keeps
// its width; the other direction can be cut however you like. So:
//   * a full-width piece is a cross-cut slice of a stock sheet: slices are packed into the listed stock lengths by the
//     shared linear allocator (one saw cut per piece), e.g. five 590 mm upper pieces from one 3,000 sheet;
//   * a narrow piece (an end strip) keeps the factory edge on the side that meets its neighbour and is ripped from a
//     slice; the rip's remainder keeps the OTHER factory edge and is reused only by a narrow piece needing exactly that
//     edge (nothing is turned over), e.g. the opposite end of a wall. Anything else is refused with its reason.
// Pure and deterministic for any input order. Pieces are never split; a piece longer than every listed sheet is the
// caller's (sheet_too_tall) problem and must not be passed in.
// =============================================================================
import { EPS_MM } from "./contract.js";
import { allocateLinear } from "./allocator.js";

/** Saw-cut allowance per cut when the product hasn't saved its own (conservative: never orders short). */
export const SHEET_KERF_DEFAULT_MM = 5;

/**
 * @param {{ pieces: Array<{cellId:string, widthMm:number, lengthMm:number, keep:"full"|"left"|"right"|"none"}>,
 *   lengthsMm: number[], sheetWidthMm: number, coverMm: number, kerfMm?: number }} p
 * @returns {{ sheets: Array<{id:string, stockLengthMm:number, cellIds:string[], residualMm:number}>,
 *   fromOffcut: Array<{cellId:string, fromCellId:string}>, lanes: Array<{fromCellId:string, edge:string, widthMm:number, lengthMm:number, usedMm:number, cellIds:string[]}>,
 *   rejected: Array<{cellId:string, fromCellId:string, reason:string}>, unplaced: string[], kerfMm:number }}
 */
export function planSheets({ pieces, lengthsMm, sheetWidthMm, coverMm, kerfMm = SHEET_KERF_DEFAULT_MM }) {
  const kerf = Number.isFinite(kerfMm) && kerfMm >= 0 ? kerfMm : SHEET_KERF_DEFAULT_MM;
  const order = (a, b) => b.lengthMm - a.lengthMm || b.widthMm - a.widthMm || (a.cellId < b.cellId ? -1 : a.cellId > b.cellId ? 1 : 0);
  const narrow = pieces.filter((p) => p.widthMm < coverMm - EPS_MM && p.keep !== "full").sort(order);
  const slices = pieces.filter((p) => !(p.widthMm < coverMm - EPS_MM && p.keep !== "full")).map((p) => ({ cellId: p.cellId, lengthMm: p.lengthMm }));
  const lanes = [], fromOffcut = [], rejected = [], unplaced = [];
  for (const p of narrow) {
    const room = (l) => l.lengthMm - l.usedMm - (l.cellIds.length ? kerf : 0);
    const fitsSize = (l) => l.widthMm >= p.widthMm - EPS_MM && room(l) >= p.lengthMm - EPS_MM;
    // a lane ripped for a piece that needed NO factory edge can keep either edge (the piece came off whichever side) —
    // it takes the edge of the first edged piece cut from it (HUB 016b review)
    const edgeOk = (l) => p.keep === "none" || l.edge === p.keep || l.edge === "both";
    const ok = lanes.filter((l) => fitsSize(l) && edgeOk(l)).sort((a, b) => a.widthMm - b.widthMm || room(a) - room(b) || (a.fromCellId < b.fromCellId ? -1 : 1));
    if (ok.length) {
      const l = ok[0];
      l.usedMm += (l.cellIds.length ? kerf : 0) + p.lengthMm;
      l.cellIds.push(p.cellId);
      if (l.edge === "both" && p.keep !== "none") l.edge = p.keep;
      fromOffcut.push({ cellId: p.cellId, fromCellId: l.fromCellId });
      continue;
    }
    const near = lanes.find((l) => fitsSize(l) && !edgeOk(l));
    if (near) rejected.push({ cellId: p.cellId, fromCellId: near.fromCellId, reason: "factory-edge" });
    // its own cross-cut slice, ripped to width; the rip keeps the other long factory edge
    slices.push({ cellId: p.cellId, lengthMm: p.lengthMm });
    const w = sheetWidthMm - p.widthMm - kerf;
    if (w > EPS_MM) lanes.push({ fromCellId: p.cellId, edge: p.keep === "left" ? "right" : p.keep === "right" ? "left" : "both", widthMm: w, lengthMm: p.lengthMm, usedMm: 0, cellIds: [] });
  }
  for (const l of lanes) if (l.edge === "both") l.edge = "none";
  const sheets = [];
  if (slices.length) {
    const identity = { family: "cladding-sheet", widthMm: sheetWidthMm };
    const policy = { kind: "list", lengthsMm: [...lengthsMm].sort((a, b) => a - b), kerfMm: kerf, kerfConfirmed: true, finalEndAcceptable: true, sharePieces: true };
    // the allocator's usual budget, also for a whole-material plan: a bigger search made a 20-wall job ~6x slower to
    // recalculate on every edit, and the cross-wall plan is only used when it beats the walls' own plans anyway
    const nodeBudget = 50_000;
    const r = allocateLinear(slices.map((s) => ({ id: s.cellId, kind: "linear", unit: "piece", lengthMm: s.lengthMm, lengthKind: "cut", quantity: 1, identity, stockPolicy: policy, label: s.cellId })), { nodeBudget });
    const bars = (r.groups[0]?.bars || []).map((b) => ({ stockLengthMm: b.stockLengthMm, cellIds: b.cuts.map((c) => c.demandId).sort(), residualMm: b.residualMm }));
    // a slice within one saw cut of a stock length (e.g. 2,996 on a 3,000 sheet) takes that sheet whole: its trim cut
    // falls in the waste at the end. Never dropped from the order (HUB 016b review: it used to be left off, ordering short).
    const stock = [...lengthsMm].sort((a, b) => a - b);
    for (const u of r.groups[0]?.unavailable || []) {
      const L = stock.find((x) => x >= u.lengthMm - EPS_MM);
      if (L == null) { unplaced.push(u.demandId); continue; }
      bars.push({ stockLengthMm: L, cellIds: [u.demandId], residualMm: Math.max(0, L - u.lengthMm - kerf) });
    }
    // one rule for every listed length: a sheet holding ONE slice is the shortest listed length that holds it (its
    // trim cut, if any, falls in the waste) — so 2,447 takes a 2,450 sheet just as 2,996 takes a 3,000 sheet
    const lenOf = new Map(slices.map((x) => [x.cellId, x.lengthMm]));
    for (const b of bars) {
      if (b.cellIds.length !== 1) continue;
      const len = lenOf.get(b.cellIds[0]);
      const L = stock.find((x) => x >= len - EPS_MM);
      if (L != null && L < b.stockLengthMm - EPS_MM) { b.stockLengthMm = L; b.residualMm = Math.max(0, L - len - kerf); }
    }
    bars.sort((a, b) => (a.cellIds[0] < b.cellIds[0] ? -1 : a.cellIds[0] > b.cellIds[0] ? 1 : 0));
    bars.forEach((b, i) => sheets.push({ id: `S${i + 1}`, ...b }));
  }
  return { sheets, fromOffcut, lanes, rejected, unplaced: unplaced.sort(), kerfMm: kerf };
}
