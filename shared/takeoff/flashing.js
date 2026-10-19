// =============================================================================
// shared/takeoff/flashing.js — flashing order-length rules (owner-locked defaults).
//
//  * Measured straight run: finished = ceil((raw + allowance) / increment) * increment.
//    Allowance is added ONCE per physical run (never per end, never per split child).
//  * Manual / counted lengths are FINISHED order lengths: no allowance, no rounding.
//  * Handling threshold (default 6000): finished > threshold → flag, keep whole.
//  * Order ceiling (default 9000): finished > ceiling → blocks order-ready export.
//  * Split is explicit: coverage = Σ child finished − Σ joint laps ≥ required finished.
// =============================================================================
import {
  TakeoffValidationError, ceilToIncrement, isFiniteNumber, requireNonNegative, requirePositive, requireQuantity,
} from "./units.js";

export const FLASHING_RULE_DEFAULTS = Object.freeze({
  allowanceMm: 200,
  incrementMm: 100,
  handlingThresholdMm: 6000,
  orderCeilingMm: 9000,
});

/**
 * Blue Leaf's ordering rules for a NEW flashing (Hub review HUB 005, 19 Oct 2026): a 300 mm order step, so a job orders
 * a few standard lengths without much waste. FLASHING_RULE_DEFAULTS stays the R03 calculation default for older data.
 */
export const NEW_FLASHING_RULES = Object.freeze({ ...FLASHING_RULE_DEFAULTS, incrementMm: 300 });

/** Validate + fill a flashing rule set. Never mutates input. */
export function normaliseFlashingRules(rules = {}) {
  const r = { ...FLASHING_RULE_DEFAULTS, ...(rules || {}) };
  requireNonNegative(r.allowanceMm, "Measured allowance");
  requirePositive(r.incrementMm, "Rounding increment");
  requirePositive(r.handlingThresholdMm, "Handling threshold");
  requirePositive(r.orderCeilingMm, "Order ceiling");
  if (r.allowanceMm > 2000) throw new TakeoffValidationError("Measured allowance looks too large (over 2,000 mm).", "Measured allowance");
  if (r.incrementMm > 6000) throw new TakeoffValidationError("Rounding increment looks too large.", "Rounding increment");
  if (r.orderCeilingMm > 30000) throw new TakeoffValidationError("Order ceiling looks too large.", "Order ceiling");
  return {
    allowanceMm: r.allowanceMm,
    incrementMm: r.incrementMm,
    handlingThresholdMm: r.handlingThresholdMm,
    orderCeilingMm: r.orderCeilingMm,
  };
}

/** Finished order length for ONE measured straight run. */
export function measuredFinishedLength(rawLengthMm, rules) {
  const r = normaliseFlashingRules(rules);
  requirePositive(rawLengthMm, "Measured length");
  return ceilToIncrement(rawLengthMm + r.allowanceMm, r.incrementMm);
}

/** Thresholds compare the FINISHED length. */
export function lengthFlags(finishedLengthMm, rules) {
  const r = normaliseFlashingRules(rules);
  return {
    handlingFlag: finishedLengthMm > r.handlingThresholdMm,
    ceilingExceeded: finishedLengthMm > r.orderCeilingMm,
  };
}

/** Full explained result for a measured run: "Measured 4,312 + allowance 200 → order 4,600 mm". */
export function measuredRunResult(rawLengthMm, rules) {
  const r = normaliseFlashingRules(rules);
  const finishedLengthMm = measuredFinishedLength(rawLengthMm, r);
  return {
    source: "measured",
    rawLengthMm,
    allowanceMm: r.allowanceMm,
    incrementMm: r.incrementMm,
    finishedLengthMm,
    quantity: 1,
    ...lengthFlags(finishedLengthMm, r),
  };
}

/**
 * Manual / counted finished length. Never adds allowance and never silently rounds; an optional
 * supplier increment only VALIDATES (returns incrementMismatch) — it does not change the value.
 */
export function manualPieceResult(finishedLengthMm, quantity, rules, { supplierIncrementMm = null } = {}) {
  const r = normaliseFlashingRules(rules);
  requirePositive(finishedLengthMm, "Finished length");
  requireQuantity(quantity);
  let incrementMismatch = false;
  if (supplierIncrementMm != null) {
    requirePositive(supplierIncrementMm, "Supplier increment");
    incrementMismatch = Math.abs(finishedLengthMm / supplierIncrementMm - Math.round(finishedLengthMm / supplierIncrementMm)) > 1e-9;
  }
  return {
    source: "manual",
    rawLengthMm: null,
    allowanceMm: 0,
    incrementMm: null,
    finishedLengthMm,
    quantity,
    incrementMismatch,
    ...lengthFlags(finishedLengthMm, r),
  };
}

/**
 * Explicit split of ONE source run. Child lengths are rounded UP to the rule increment, then
 * coverage is recomputed. The original run's allowance is preserved (already in
 * requiredFinishedMm) — children never get +allowance.
 * @param {{requiredFinishedMm:number, pieces:number[], laps:number[]}} input
 */
export function evaluateSplit({ requiredFinishedMm, pieces, laps }, rules) {
  const r = normaliseFlashingRules(rules);
  requirePositive(requiredFinishedMm, "Required length");
  if (!Array.isArray(pieces) || pieces.length < 2) throw new TakeoffValidationError("A split needs at least two pieces.");
  if (pieces.length > 20) throw new TakeoffValidationError("A split can have at most 20 pieces.");
  if (!Array.isArray(laps) || laps.length !== pieces.length - 1) {
    throw new TakeoffValidationError("Enter a lap for every joint between pieces.");
  }
  const childLengths = pieces.map((p, i) => ceilToIncrement(requirePositive(p, `Piece ${i + 1} length`), r.incrementMm));
  laps.forEach((l, i) => {
    if (!isFiniteNumber(l) || l < 0) throw new TakeoffValidationError(`Joint ${i + 1} lap must be 0 mm or more.`);
    if (l >= Math.min(childLengths[i], childLengths[i + 1])) throw new TakeoffValidationError(`Joint ${i + 1} lap is longer than a piece it joins.`);
  });
  const coverageMm = childLengths.reduce((a, b) => a + b, 0) - laps.reduce((a, b) => a + b, 0);
  const children = childLengths.map((len) => ({ finishedLengthMm: len, quantity: 1, ...lengthFlags(len, r) }));
  const covers = coverageMm >= requiredFinishedMm - 1e-9;
  const anyOverCeiling = children.some((c) => c.ceilingExceeded);
  return {
    requiredFinishedMm,
    children,
    laps: laps.slice(),
    coverageMm,
    overcoverageMm: coverageMm - requiredFinishedMm,
    valid: covers && !anyOverCeiling,
    problems: [
      ...(covers ? [] : [`Pieces cover ${coverageMm.toLocaleString("en-AU")} mm but ${requiredFinishedMm.toLocaleString("en-AU")} mm is needed.`]),
      ...(anyOverCeiling ? [`A piece is longer than the ${r.orderCeilingMm.toLocaleString("en-AU")} mm order ceiling.`] : []),
    ],
  };
}

/**
 * Order-readiness problems for a single schedule contribution (finished pieces).
 * Returns [] when order-ready.
 */
export function pieceOrderProblems(piece, rules) {
  const r = normaliseFlashingRules(rules);
  const out = [];
  if (piece.finishedLengthMm > r.orderCeilingMm) out.push("ceiling_exceeded");
  return out;
}
