// =============================================================================
// shared/takeoff/engine/stock.js — which NEW stock length a linear need buys (TC-R04 03 §T3, 11, 12 §Timber stock).
//
// A StockPolicy (engine/contract.js) names the permitted new stock lengths:
//   grid   timber: max(min, ceil(L / inc) × inc) = min + n·inc — owner-confirmed 1200 + 600n for every supplier
//          (12). The minimum must be a whole number of increments (otherwise the two forms disagree).
//          `unavailableMm` may only REMOVE grid lengths (the next available grid length is taken); an
//          off-grid entry is ignored, never introduced. `maxMm` is explicit; null = no product maximum
//          (no arbitrary 6 m cap). min/increment are never defaulted here — the caller states them.
//   list   the supplier's listed stock lengths.
//   fixed  one stock length (e.g. 6500 mm aluminium bars, 11).
// A need longer than every permitted length is UNAVAILABLE (stockMm null): never clamped down, never
// spliced. The finished cut length is not changed to the stock length. Kerf / end-trim / end-condition
// fields are validated here but applied by engine/allocator.js. Grid rounding tolerates EPS_MM in MILLIMETRES
// (the allocator's fit test uses the same tolerance), never a fraction of the increment. Pure; no DB/DOM/network.
// =============================================================================
import { EPS_MM } from "./contract.js";
import { isFiniteNumber } from "../units.js";

/** Policy kinds this module can select stock for ("random" LM supply is ordered by LM, not cut-allocated). */
export const STOCK_POLICY_KINDS = Object.freeze(["grid", "list", "fixed"]);

/** Safeguard: a bounded grid may enumerate at most this many lengths (rejects e.g. a 0.001 mm increment). */
export const MAX_GRID_LENGTHS = 10000;

/**
 * Numeric-precision guard, not a product limit: at 1,000 km a float64 can no longer resolve EPS_MM, so longer
 * lengths (and stock lengths) are rejected as invalid input instead of being compared — or stepped — wrongly.
 */
export const MAX_LENGTH_MM = 1e9;

const RATIO_EPS = 1e-9; // float noise when stepping k × increment
const lengthKey = (mm) => Math.round(mm * 1000); // 0.001 mm, as identityKey
const positive = (v) => isFiniteNumber(v) && v > 0 && v < MAX_LENGTH_MM;
/** First grid length ≥ needMm: max(min, ceil(L / inc) · inc), noise tolerance EPS_MM in millimetres. */
const gridBase = (needMm, p) => Math.max(p.minMm, Math.ceil((needMm - EPS_MM) / p.incrementMm) * p.incrementMm);
const nonNegativeOrUnset = (v) => v === undefined || v === null || (isFiniteNumber(v) && v >= 0);
const boolOrUnset = (v) => v === undefined || v === null || typeof v === "boolean"; // unset → false
const invalid = (message) => ({ code: "invalid-policy", message });

/** Problems with the stock-SELECTION part of a policy, or null. */
function selectionProblem(policy) {
  if (!policy || typeof policy !== "object") return invalid("No stock policy is set for this material.");
  switch (policy.kind) {
    case "grid": {
      if (!positive(policy.minMm) || !positive(policy.incrementMm)) return invalid("A stock grid needs a minimum and an increment greater than 0 (and shorter than 1,000 km).");
      // T3's max(min, ceil(L/inc)·inc) and 12's min + n·inc only agree when min is a whole number of increments;
      // any other grid is undefined by the spec (and would skip its own minimum), so it is refused, not guessed
      const steps = policy.minMm / policy.incrementMm;
      if (Math.abs(steps - Math.round(steps)) > RATIO_EPS * Math.max(1, steps)) {
        return invalid("The grid minimum must be a whole number of increments (e.g. 1200 with 600 steps) — use a stock list for other lengths.");
      }
      const max = policy.maxMm;
      if (max !== undefined && max !== null) {
        if (!positive(max)) return invalid("The longest available stock length must be greater than 0.");
        if (max < policy.minMm - EPS_MM) return invalid("The longest available stock length is shorter than the grid minimum.");
        if ((max - policy.minMm) / policy.incrementMm > MAX_GRID_LENGTHS) return invalid("The stock grid is too fine to list.");
      }
      if (policy.unavailableMm !== undefined && policy.unavailableMm !== null
        && (!Array.isArray(policy.unavailableMm) || !policy.unavailableMm.every(isFiniteNumber))) return invalid("Unavailable lengths must be a list of numbers.");
      return null;
    }
    case "list":
      if (!Array.isArray(policy.lengthsMm) || !policy.lengthsMm.length || !policy.lengthsMm.every(positive)) return invalid("A stock list needs at least one length greater than 0 (and shorter than 1,000 km).");
      return null;
    case "fixed":
      if (!positive(policy.lengthMm)) return invalid("A fixed stock length must be greater than 0 (and shorter than 1,000 km).");
      return null;
    default:
      return { code: "unsupported-policy", message: `Stock policy "${policy.kind}" cannot be cut-allocated (random-length supply is ordered by LM).` };
  }
}

/**
 * Validate a whole StockPolicy: stock selection plus the cutting-loss fields the allocator applies
 * (kerfMm, endTrimMm, minRetainedOffcutMm ≥ 0; finalEndAcceptable / kerfConfirmed / sharePieces booleans).
 * @param {object} policy  StockPolicy
 * @returns {{ code: string, message: string } | null}
 */
export function stockPolicyProblem(policy) {
  const sel = selectionProblem(policy);
  if (sel) return sel;
  if (!nonNegativeOrUnset(policy.kerfMm)) return invalid("Saw kerf must be 0 or more.");
  if (!nonNegativeOrUnset(policy.endTrimMm)) return invalid("End trim must be 0 or more.");
  if (!nonNegativeOrUnset(policy.minRetainedOffcutMm)) return invalid("The keep-offcuts-from length must be 0 or more.");
  if (!boolOrUnset(policy.finalEndAcceptable) || !boolOrUnset(policy.kerfConfirmed) || !boolOrUnset(policy.sharePieces)) return invalid("Cutting settings must be yes/no values.");
  return null;
}

/** Grid lengths ≥ needMm in ascending order (unbounded when maxMm is null, up to the MAX_LENGTH_MM guard). */
function* gridFrom(needMm, p) {
  const inc = p.incrementMm;
  const off = new Set((p.unavailableMm || []).map(lengthKey));
  const max = p.maxMm === undefined || p.maxMm === null ? MAX_LENGTH_MM : p.maxMm;
  let len = gridBase(needMm, p);
  for (;;) {
    if (len > max + EPS_MM || len >= MAX_LENGTH_MM) return;
    if (!off.has(lengthKey(len))) yield len;
    len = Math.max(p.minMm, (Math.floor(len / inc + RATIO_EPS) + 1) * inc);
  }
}

/**
 * Permitted NEW stock lengths ≥ needMm, ascending. A grid without maxMm is an endless sequence, so callers
 * must stop on their own condition. Yields nothing for an invalid policy or need.
 * @param {number} needMm
 * @param {object} policy  StockPolicy
 * @returns {Generator<number>}
 */
export function* stockLengthsFrom(needMm, policy) {
  if (!isFiniteNumber(needMm) || needMm < 0 || needMm >= MAX_LENGTH_MM || selectionProblem(policy)) return;
  if (policy.kind === "grid") { yield* gridFrom(needMm, policy); return; }
  const lengths = policy.kind === "fixed" ? [policy.lengthMm] : [...new Set(policy.lengthsMm)].sort((a, b) => a - b);
  for (const len of lengths) if (len >= needMm - EPS_MM) yield len;
}

/**
 * Every permitted new stock length, ascending; null when unbounded (grid with no maximum); [] when the
 * policy is invalid or availability removed every length.
 * @param {object} policy  StockPolicy
 * @returns {number[] | null}
 */
export function permittedStockLengths(policy) {
  if (selectionProblem(policy)) return [];
  if (policy.kind === "grid" && (policy.maxMm === undefined || policy.maxMm === null)) return null;
  return [...stockLengthsFrom(0, policy)];
}

/**
 * Smallest permitted new stock length for one required piece (03 §T3 / 12): grid → max(min, ceil(L/inc)·inc),
 * skipping unavailable grid lengths; list → smallest listed ≥ L; fixed → the length if ≥ L.
 * Longer than every permitted length → { stockMm: null } (never clamped, never spliced).
 * reason: "grid" | "grid-next-available" | "list" | "fixed" | "exceeds-max" | "no-available-length"
 *       | "invalid-need" | "invalid-policy" | "unsupported-policy".
 * @param {number} needMm  required piece length (> 0; end allowances already applied)
 * @param {object} policy  StockPolicy
 * @returns {{ stockMm: number|null, reason: string, message: string }}
 */
export function selectStock(needMm, policy) {
  if (!positive(needMm)) return { stockMm: null, reason: "invalid-need", message: "The required length must be a number greater than 0 (and shorter than 1,000 km)." };
  const bad = selectionProblem(policy);
  if (bad) return { stockMm: null, reason: bad.code, message: bad.message };
  const first = stockLengthsFrom(needMm, policy).next();
  if (policy.kind === "grid") {
    const base = gridBase(needMm, policy);
    if (first.done) {
      const max = policy.maxMm === undefined || policy.maxMm === null ? MAX_LENGTH_MM : policy.maxMm;
      const overMax = base > max + EPS_MM || base >= MAX_LENGTH_MM;
      return { stockMm: null, reason: overMax ? "exceeds-max" : "no-available-length",
        message: overMax ? `Needs ${base} mm stock; the longest available is ${max} mm. Unavailable — no clamping or splice.`
          : `No available grid length from ${base} mm up to ${policy.maxMm} mm. Unavailable — no clamping or splice.` };
    }
    return first.value === base ? { stockMm: base, reason: "grid", message: `${base} mm grid length.` }
      : { stockMm: first.value, reason: "grid-next-available", message: `${base} mm is unavailable; next available grid length ${first.value} mm.` };
  }
  if (first.done) return { stockMm: null, reason: "exceeds-max", message: `No permitted stock length is ${needMm} mm or longer. Unavailable — no splice.` };
  return { stockMm: first.value, reason: policy.kind, message: `${first.value} mm ${policy.kind === "fixed" ? "fixed" : "listed"} stock length.` };
}
