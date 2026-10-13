// =============================================================================
// shared/takeoff/calibration.js — two-axis (Horizontal + Vertical) plan calibration.
//
// Scales are mm per PDF user unit along the calibration basis axes. Calibration identity is
// document + page + optional region + revision; a calibration is never edited in place once
// measurements use it (the server creates a new revision). This module is pure maths.
// =============================================================================
import { TakeoffValidationError, isFiniteNumber, requirePositive } from "./units.js";
import { deltaInBasis, normRotation, normaliseRect, pointInRect } from "./geometry.js";

export const CALIBRATION_SCHEMA_VERSION = 1;
/** Default axis-agreement + verification tolerance (fraction). */
export const DEFAULT_TOLERANCE = 0.005;
/** Sanity bounds on mm-per-PDF-unit (1:1 at 72dpi ≈ 0.35; 1:1000 ≈ 353). */
const MIN_SCALE = 1e-4;
const MAX_SCALE = 1e5;

export const CALIBRATION_MODES = Object.freeze({ UNIFORM: "uniform", SEPARATE: "separate" });
export const CALIBRATION_STATUS = Object.freeze({ READY: "ready", NEEDS_REVIEW: "needs_review", UNVERIFIED: "unverified" });

/**
 * Axis scale from two tapped points + the printed dimension. The secondary coordinate of the
 * second point is LOCKED to the first's in the basis (the UI enforces this while tapping), so
 * only the primary-axis projection counts.
 * @param {"horizontal"|"vertical"} axis
 */
export function axisScale(axis, p1, p2, knownMm, basisRotation) {
  requirePositive(knownMm, axis === "horizontal" ? "Horizontal dimension" : "Vertical dimension");
  if (![p1?.x, p1?.y, p2?.x, p2?.y].every(isFiniteNumber)) throw new TakeoffValidationError("Calibration points are invalid.");
  const { dx, dy } = deltaInBasis(p2.x - p1.x, p2.y - p1.y, basisRotation);
  const span = Math.abs(axis === "horizontal" ? dx : dy);
  if (!(span > 0)) throw new TakeoffValidationError("The two calibration points are on top of each other — tap two points further apart.");
  const scale = knownMm / span;
  if (scale < MIN_SCALE || scale > MAX_SCALE) throw new TakeoffValidationError("That scale is outside the possible range — check the dimension you typed.");
  return scale;
}

/**
 * Lock the second tapped point so the pair is exactly horizontal/vertical ON SCREEN at the
 * calibration basis rotation (the endpoint's secondary coordinate is held). PDF-space in/out.
 * @param {"horizontal"|"vertical"} axis
 */
export function lockSecondaryAxis(axis, p1, p2, basisRotation) {
  const r = normRotation(basisRotation);
  const sideways = r === 90 || r === 270;
  const keepY = (axis === "horizontal") !== sideways;
  return keepY ? { x: p2.x, y: p1.y } : { x: p1.x, y: p2.y };
}

/** abs(sx-sy)/mean(sx,sy). */
export function axisDiscrepancy(sx, sy) {
  return Math.abs(sx - sy) / ((sx + sy) / 2);
}

/**
 * Build a calibration from both axis references. Above tolerance a normal save is refused
 * unless the user explicitly chose "Drawing stretched: use separate X/Y scales".
 */
export function buildCalibration({ basisRotation = 0, horizontal, vertical, mode, tolerance = DEFAULT_TOLERANCE, region = null }) {
  const rot = normRotation(basisRotation);
  const sx = axisScale("horizontal", horizontal?.p1, horizontal?.p2, horizontal?.knownMm, rot);
  const sy = axisScale("vertical", vertical?.p1, vertical?.p2, vertical?.knownMm, rot);
  const discrepancy = axisDiscrepancy(sx, sy);
  const withinTolerance = discrepancy <= tolerance + 1e-12;
  let chosen = mode || (withinTolerance ? CALIBRATION_MODES.UNIFORM : null);
  if (!withinTolerance && chosen !== CALIBRATION_MODES.SEPARATE) {
    return { ok: false, reason: "axis_mismatch", sx, sy, discrepancy, tolerance,
      message: `Horizontal and vertical scales differ by ${(discrepancy * 100).toFixed(2)}%. Re-tap, or choose "Drawing stretched: use separate X/Y scales".` };
  }
  if (chosen !== CALIBRATION_MODES.UNIFORM && chosen !== CALIBRATION_MODES.SEPARATE) chosen = CALIBRATION_MODES.UNIFORM;
  const uniform = (sx + sy) / 2;
  return {
    ok: true,
    calibration: {
      schemaVersion: CALIBRATION_SCHEMA_VERSION,
      basisRotation: rot,
      mode: chosen,
      sx: chosen === CALIBRATION_MODES.UNIFORM ? uniform : sx,
      sy: chosen === CALIBRATION_MODES.UNIFORM ? uniform : sy,
      measuredSx: sx,
      measuredSy: sy,
      discrepancy,
      tolerance,
      horizontal: { p1: { ...horizontal.p1 }, p2: { ...horizontal.p2 }, knownMm: horizontal.knownMm },
      vertical: { p1: { ...vertical.p1 }, p2: { ...vertical.p2 }, knownMm: vertical.knownMm },
      region: region ? normaliseRect(region) : null,
      status: CALIBRATION_STATUS.UNVERIFIED,
      verification: null,
    },
  };
}

/**
 * True when a "check" dimension re-uses the horizontal or vertical reference pair (either point
 * order, within 0.5 PDF units) — that would not be an independent check.
 */
export function verificationReusesReference(cal, check) {
  const near = (a, b) => a && b && Math.hypot(a.x - b.x, a.y - b.y) <= 0.5;
  const same = (ref) => ref && ((near(check?.p1, ref.p1) && near(check?.p2, ref.p2)) || (near(check?.p1, ref.p2) && near(check?.p2, ref.p1)));
  return !!(same(cal.horizontal) || same(cal.vertical));
}

/** Real-world length (mm) of a PDF-space segment under a calibration. */
export function segmentLengthMm(cal, a, b) {
  const { dx, dy } = deltaInBasis(b.x - a.x, b.y - a.y, cal.basisRotation);
  if (cal.mode === CALIBRATION_MODES.SEPARATE) return Math.hypot(dx * cal.sx, dy * cal.sy);
  return Math.hypot(dx, dy) * cal.sx;
}

/** Sum of consecutive segment lengths (a polyline). */
export function polylineLengthMm(cal, points) {
  let t = 0;
  for (let i = 1; i < points.length; i++) t += segmentLengthMm(cal, points[i - 1], points[i]);
  return t;
}

/**
 * Independent check against a third printed dimension. <= tolerance → ready; otherwise
 * needs_review (visual inspection allowed, order-ready measured results blocked).
 */
export function verifyCalibration(cal, { p1, p2, expectedMm }) {
  requirePositive(expectedMm, "Check dimension");
  const observedMm = segmentLengthMm(cal, p1, p2);
  const error = Math.abs(observedMm - expectedMm) / expectedMm;
  const passed = error <= (cal.tolerance ?? DEFAULT_TOLERANCE) + 1e-12;
  return {
    ...cal,
    status: passed ? CALIBRATION_STATUS.READY : CALIBRATION_STATUS.NEEDS_REVIEW,
    verification: { p1: { ...p1 }, p2: { ...p2 }, expectedMm, observedMm, error, passed },
  };
}

/** A run must lie wholly inside the calibration's region (null region = whole page). */
export function pointsWithinCalibration(cal, points) {
  if (!cal.region) return true;
  return points.every((p) => pointInRect(p, cal.region));
}

/** Is this calibration usable for order-ready measured results? */
export function calibrationOrderReady(cal) {
  return !!cal && cal.status === CALIBRATION_STATUS.READY;
}

/**
 * Calibrations that apply to a document page: the newest revision per region label (unsaved
 * local ones, flagged `pending`, win). Pages and regions never share scales.
 */
export function latestPageCalibrations(calibrations, documentId, pageIndex) {
  const latest = new Map();
  for (const c of calibrations || []) {
    if (c.documentId !== documentId || c.pageIndex !== pageIndex) continue;
    const key = c.regionLabel || "";
    const cur = latest.get(key);
    if (!cur || c.pending || (!cur.pending && (c.calibrationRevision || 0) >= (cur.calibrationRevision || 0))) latest.set(key, c);
  }
  return [...latest.values()];
}
