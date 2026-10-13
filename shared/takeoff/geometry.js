// =============================================================================
// shared/takeoff/geometry.js — PDF page coordinate transforms.
//
// Measurement geometry is ALWAYS stored in unrotated PDF user-space (the page's own
// coordinate system, y up) plus a 0-based page index and page metadata. Viewport pixels are
// never stored. This module reproduces pdf.js's PageViewport transform exactly (verified
// against pdfjs-dist's own PageViewport in scripts/tests/takeoff-geometry.test.mjs) so the
// vector annotation layer lines up with the raster layer at every rotation / crop-box origin /
// userUnit. devicePixelRatio is a raster concern only and never enters these functions.
// =============================================================================
import { TakeoffValidationError, isFiniteNumber } from "./units.js";

/**
 * @typedef {Object} PageMeta
 * @property {number[]} viewBox  [x0, y0, x1, y1] in PDF user units (crop box; may not start at 0)
 * @property {number}   rotate   intrinsic /Rotate, multiple of 90
 * @property {number}   userUnit PDF /UserUnit (default 1)
 */

/** Normalise any multiple of 90 into 0/90/180/270. */
export function normRotation(r) {
  const n = ((Math.round(r) % 360) + 360) % 360;
  if (n % 90 !== 0) throw new TakeoffValidationError("Rotation must be a multiple of 90°.");
  return n;
}

/** Validate + normalise page metadata. */
export function normalisePageMeta(meta) {
  const vb = meta?.viewBox;
  if (!Array.isArray(vb) || vb.length !== 4 || !vb.every(isFiniteNumber) || vb[2] <= vb[0] || vb[3] <= vb[1]) {
    throw new TakeoffValidationError("Page size information is missing or invalid.");
  }
  const userUnit = meta.userUnit == null ? 1 : meta.userUnit;
  if (!isFiniteNumber(userUnit) || userUnit <= 0) throw new TakeoffValidationError("Page user unit is invalid.");
  return { viewBox: vb.slice(), rotate: normRotation(meta.rotate || 0), userUnit };
}

/**
 * Viewport transform — identical maths to pdf.js PageViewport (rotation = intrinsic + display
 * rotation; scale = CSS px per PDF point BEFORE userUnit). Returns the 6-element affine matrix
 * [a, b, c, d, e, f] mapping PDF user-space → viewport pixels, plus width/height.
 */
export function viewportTransform(pageMeta, { scale = 1, rotation = 0, offsetX = 0, offsetY = 0 } = {}) {
  const { viewBox, userUnit } = normalisePageMeta(pageMeta);
  if (!isFiniteNumber(scale) || scale <= 0) throw new TakeoffValidationError("Zoom must be greater than 0.");
  const s = scale * userUnit;
  const cx = (viewBox[2] + viewBox[0]) / 2;
  const cy = (viewBox[3] + viewBox[1]) / 2;
  let a, b, c, d;
  switch (normRotation(rotation)) {
    case 180: a = -1; b = 0; c = 0; d = 1; break;
    case 90: a = 0; b = 1; c = 1; d = 0; break;
    case 270: a = 0; b = -1; c = -1; d = 0; break;
    default: a = 1; b = 0; c = 0; d = -1; break;
  }
  let offCX, offCY, width, height;
  if (a === 0) {
    offCX = Math.abs(cy - viewBox[1]) * s + offsetX;
    offCY = Math.abs(cx - viewBox[0]) * s + offsetY;
    width = (viewBox[3] - viewBox[1]) * s;
    height = (viewBox[2] - viewBox[0]) * s;
  } else {
    offCX = Math.abs(cx - viewBox[0]) * s + offsetX;
    offCY = Math.abs(cy - viewBox[1]) * s + offsetY;
    width = (viewBox[2] - viewBox[0]) * s;
    height = (viewBox[3] - viewBox[1]) * s;
  }
  const m = [a * s, b * s, c * s, d * s, offCX - a * s * cx - c * s * cy, offCY - b * s * cx - d * s * cy];
  return { matrix: m, width, height };
}

/** Effective display rotation = page /Rotate + user display rotation. */
export function totalRotation(pageMeta, displayRotation = 0) {
  return normRotation((pageMeta.rotate || 0) + displayRotation);
}

export function applyMatrix(m, p) {
  return { x: p.x * m[0] + p.y * m[2] + m[4], y: p.x * m[1] + p.y * m[3] + m[5] };
}

export function invertMatrix(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) throw new TakeoffValidationError("View transform is not invertible.");
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

/** PDF user-space point → viewport pixel. */
export function pdfToScreen(pageMeta, view, p) {
  return applyMatrix(viewportTransform(pageMeta, view).matrix, p);
}

/** Viewport pixel → PDF user-space point. */
export function screenToPdf(pageMeta, view, p) {
  return applyMatrix(invertMatrix(viewportTransform(pageMeta, view).matrix), p);
}

/**
 * Express a PDF-space delta in the calibration basis: the page-aligned axes as the user SAW
 * them when calibrating (basisRotation = total display rotation at calibration time). dx is
 * "Horizontal" on screen, dy "Vertical". Signs are irrelevant to lengths but kept consistent.
 */
export function deltaInBasis(dxPdf, dyPdf, basisRotation) {
  switch (normRotation(basisRotation)) {
    case 90: return { dx: dyPdf, dy: dxPdf };
    case 180: return { dx: -dxPdf, dy: dyPdf };
    case 270: return { dx: -dyPdf, dy: -dxPdf };
    default: return { dx: dxPdf, dy: -dyPdf };
  }
}

export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Axis-aligned rectangle in PDF space: { x0, y0, x1, y1 } with x0<x1, y0<y1. */
export function normaliseRect(r) {
  if (!r || ![r.x0, r.y0, r.x1, r.y1].every(isFiniteNumber)) throw new TakeoffValidationError("Region is invalid.");
  const out = { x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) };
  if (out.x1 - out.x0 <= 0 || out.y1 - out.y0 <= 0) throw new TakeoffValidationError("Region must have a width and height.");
  return out;
}

export function pointInRect(p, r) {
  return p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
}

/** Validate a PDF-space point list (finite, bounded count). */
export function validatePoints(points, { min = 2, max = 1000 } = {}) {
  if (!Array.isArray(points) || points.length < min) throw new TakeoffValidationError(`At least ${min} points are needed.`);
  if (points.length > max) throw new TakeoffValidationError(`A measurement can have at most ${max} points.`);
  for (const p of points) {
    if (!p || !isFiniteNumber(p.x) || !isFiniteNumber(p.y) || Math.abs(p.x) > 1e7 || Math.abs(p.y) > 1e7) {
      throw new TakeoffValidationError("A measurement point is outside the page.");
    }
  }
  return points.map((p) => ({ x: p.x, y: p.y }));
}
