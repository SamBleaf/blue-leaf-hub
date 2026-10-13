// =============================================================================
// shared/takeoff/units.js — numeric helpers shared by client + server.
//
// Environment-neutral ESM: no DB, auth, DOM or Node built-ins. All physical lengths are
// millimetres; piece quantities are positive integers. FLOAT_EPS_MM absorbs floating-point
// noise ONLY (e.g. 4300.0000000004 from a hypot) — it is never a tolerance that can
// under-order: anything genuinely above an increment boundary still rounds up.
// =============================================================================

/** Floating-point noise allowance in mm (one micron is far below any real measurement). */
export const FLOAT_EPS_MM = 1e-6;

export class TakeoffValidationError extends Error {
  /** @param {string} message plain-English, safe to show a user  @param {string} [field] */
  constructor(message, field) {
    super(message);
    this.name = "TakeoffValidationError";
    this.field = field || null;
  }
}

/** True for a finite number (not NaN/±Infinity, not a numeric string). */
export function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/** Require a finite number > 0 (mm or similar). Throws TakeoffValidationError. */
export function requirePositive(v, label = "Value") {
  if (!isFiniteNumber(v) || v <= 0) throw new TakeoffValidationError(`${label} must be a number greater than 0.`, label);
  return v;
}

/** Require a finite number >= 0. */
export function requireNonNegative(v, label = "Value") {
  if (!isFiniteNumber(v) || v < 0) throw new TakeoffValidationError(`${label} must be 0 or more.`, label);
  return v;
}

/** Require a whole number >= 1 (piece quantity). Fractions are rejected, never rounded. */
export function requireQuantity(v, label = "Quantity") {
  if (!Number.isInteger(v) || v < 1) throw new TakeoffValidationError(`${label} must be a whole number of 1 or more.`, label);
  return v;
}

/**
 * Round UP to the next multiple of `increment`, treating values within FLOAT_EPS_MM of a
 * boundary as on it. ceilToIncrement(4500, 100) = 4500; ceilToIncrement(4500.4, 100) = 4600.
 */
export function ceilToIncrement(valueMm, incrementMm) {
  requirePositive(incrementMm, "Increment");
  if (!isFiniteNumber(valueMm)) throw new TakeoffValidationError("Length must be a finite number.");
  const steps = Math.ceil((valueMm - FLOAT_EPS_MM) / incrementMm);
  // Integer increments (the norm) stay exact; non-integer increments are fixed to 6 dp.
  const out = steps * incrementMm;
  return Number.isInteger(incrementMm) ? out : Number(out.toFixed(6));
}

/** mm → metres with fixed 3 dp (decimal-safe for whole-mm inputs). */
export function mmToM(mm) {
  return Math.round(mm) === mm ? mm / 1000 : Number((mm / 1000).toFixed(6));
}

/** Sum of whole-mm lengths × integer quantities, returned as metres (3 dp). */
export function totalLinearMetres(lines) {
  let mm = 0;
  for (const l of lines) mm += l.finishedLengthMm * l.quantity;
  return Number((mm / 1000).toFixed(3));
}

/** Format mm with thousands separators for display: 4600 → "4,600". */
export function formatMm(mm, maxDecimals = 2) {
  if (!isFiniteNumber(mm)) return "—";
  return mm.toLocaleString("en-AU", { maximumFractionDigits: maxDecimals });
}

/** Stable JSON (sorted keys) for hashing/grouping identities. */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}
