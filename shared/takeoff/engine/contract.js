// =============================================================================
// shared/takeoff/engine/contract.js — the generic takeoff engine contract (TC-R04 06).
//
// measurement geometry → METHOD calculation → installed DEMANDS → (assembly components) → STOCK ALLOCATION
// → PURCHASE LINES → order snapshot.   Pure data + small helpers; no DB, no DOM, no eval, no LLM.
//
// Every method module (engine/timber.js, cladding.js, supports.js, flashingPath.js …) returns a MethodResult:
//   { demands: Demand[], layout: object|null, problems: Problem[], status: Statuses, explain: string[] }
// and every linear stock purchase goes through engine/allocator.js (one shared cutting/packing allocator).
//
// Units: dimensions in mm (numbers, unrounded geometry), areas in m² only at display/purchase boundaries.
// =============================================================================

/** Purchase / demand units. A demand never silently changes unit; unit is part of purchase identity. */
export const UNITS = Object.freeze(["piece", "lm", "m2", "sheet", "bar", "box", "bag", "roll", "pack", "cartridge", "ml"]);

/** Length kinds (13 + B6): what a length means — prevents double allowances. */
export const LENGTH_KINDS = Object.freeze({
  TIGHT: "tight",               // measured, before any allowance (flashing +200 applies once)
  FINISHED: "finished",         // finished cut / order length as entered (no allowance)
  CUT: "cut",                   // a required cut length that still needs stock selection (timber, aluminium)
  ORDERED_STOCK: "orderedStock" // the user already knows the stock length to buy (bypasses everything)
});

/** Three independent statuses (06). Never collapse them into one boolean. */
export const QUANTITY_STATUS = Object.freeze(["incomplete", "estimate", "calculated", "reviewed"]);
export const INSTALLATION_STATUS = Object.freeze(["unspecified", "source-pending", "supported-by-selected-rule", "project-detail-supplied", "out-of-scope"]);
export const PROCUREMENT_STATUS = Object.freeze(["draft", "missing-product", "unavailable-stock", "stale", "ready"]);

/**
 * A Demand: one installed requirement before stock selection.
 * @typedef {{
 *   id: string,                      // STABLE: derived from source ids + role + station/cell (never random)
 *   materialId: string,              // job material (takeoff_job_materials.id) it belongs to
 *   role: string,                    // e.g. "rafter", "stud", "sheet", "course-board", "support", "fixing", "jamb-left"
 *   kind: "linear"|"sheet"|"count"|"area"|"volume",
 *   unit: string,                    // one of UNITS
 *   lengthMm?: number,               // linear: required cut/finished length
 *   widthMm?: number, heightMm?: number, // sheet: required cut size (sheet stock is chosen by the method)
 *   quantity: number,                // pieces / m² / ml …
 *   lengthKind?: string,             // LENGTH_KINDS
 *   identity: object,                // procurement identity (what physically must be bought); NOT usage notes
 *   stockPolicy?: object,            // linear: StockPolicy for allocation
 *   noSplice?: boolean,              // linear: must be ONE continuous piece (structural members, aluminium runs)
 *   label?: string,                  // human label ("W01 left jamb", "Rafter @ 3,600")
 *   sourceRefs: Array<{ measurementId?: string, role?: string, station?: number, cell?: string, openingId?: string, wallId?: string }>,
 *   provenance: "calculated"|"manual",
 *   problems?: Problem[]
 * }} Demand
 *
 * @typedef {{ code: string, message: string, blocking?: boolean, refs?: object[] }} Problem
 *
 * A StockPolicy for linear materials.
 * @typedef {{
 *   kind: "grid"|"list"|"fixed"|"random",
 *   minMm?: number, incrementMm?: number, maxMm?: number|null,   // grid: max(min, ceil(L/inc)*inc) ≤ max
 *   unavailableMm?: number[],                                     // grid: lengths removed by availability
 *   lengthsMm?: number[],                                         // list: available stock lengths
 *   lengthMm?: number,                                            // fixed: one stock length (e.g. 6500 aluminium)
 *   orderIncrementM?: number,                                     // random-length LM supply ordering increment
 *   kerfMm?: number, endTrimMm?: number, finalEndAcceptable?: boolean, kerfConfirmed?: boolean,
 *   minRetainedOffcutMm?: number, sharePieces?: boolean           // false = one stock piece per demand (structural default)
 * }} StockPolicy
 */

/** Stable id from parts (deterministic, readable). */
export const demandId = (...parts) => parts.filter((p) => p !== undefined && p !== null && p !== "").join(":");

/** Deterministic JSON for identity keys (sorted keys, numbers rounded to 0.001 mm). */
export function identityKey(obj) {
  const norm = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return Math.round(v * 1000) / 1000;
    if (Array.isArray(v)) return v.map(norm);
    if (typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])]));
    return v;
  };
  return JSON.stringify(norm(obj));
}

export const problem = (code, message, extra = {}) => ({ code, message, blocking: extra.blocking !== false, ...extra });

/** Empty MethodResult. */
export function emptyResult() {
  return { demands: [], layout: null, problems: [], status: { quantity: "incomplete", installation: "unspecified", procurement: "draft" }, explain: [] };
}

/** Numerical tolerance for transformed-coordinate noise ONLY (never hides a real 0.1 mm overrun). */
export const EPS_MM = 1e-6;
export const ceilTol = (x) => Math.ceil(x - EPS_MM);
