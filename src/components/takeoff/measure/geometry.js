// =============================================================================
// measure/geometry.js — screen hit-testing and path-station helpers for MeasureScreen (TC-R04 13, 02 §2–3).
// Pure functions. Points are {x,y}; "screen" helpers take CSS-px points from the viewport transform, "path" helpers
// take PDF user-space points + the page calibration and return calibrated mm stations (never screen pixels).
// =============================================================================
import { pathStations, pointAtStation } from "../../../../shared/takeoff/engine/flashingPath.js";

/** Minimum touch target (CSS px) — every tappable thing on the plan uses this radius ×2. */
export const TARGET_PX = 44;
export const HIT_PX = TARGET_PX / 2;

export function distToSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distance from p to a polyline (a single point counts as a point). */
export function distToPolyline(p, pts) {
  if (!pts?.length) return Infinity;
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, distToSeg(p, pts[i - 1], pts[i]));
  return d;
}

/** Nearest point on a polyline: segment index k, parameter t on it, distance and the point itself. */
export function nearestOnPolyline(p, pts) {
  let best = null;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (!best || d < best.d) best = { k, t, d, point: q };
  }
  return best;
}

/**
 * The calibrated station of the path point nearest to `p` (PDF space). The screen transform is a similarity of PDF
 * space, so "nearest on screen" and "nearest in PDF" agree; the station is exact along the segment (affine map).
 * @returns {{ stationMm:number, point:{x,y}, segmentIndex:number }|null}
 */
export function stationNear(points, cal, p) {
  if (!cal || !points || points.length < 2) return null;
  const n = nearestOnPolyline(p, points);
  if (!n) return null;
  const st = pathStations(points, cal);
  return { stationMm: st.cumulativeMm[n.k] + n.t * st.segmentLengthsMm[n.k], point: n.point, segmentIndex: n.k };
}

/** pointAtStation without throwing (stations are clamped onto the path); null when the path can't be measured. */
export function safePointAt(points, cal, stationMm) {
  try {
    const st = pathStations(points, cal);
    return pointAtStation(points, cal, Math.min(Math.max(stationMm, 0), st.totalMm));
  } catch {
    return null;
  }
}

/** Calibrated length of a polyline (null when it can't be measured). */
export function pathLengthMm(points, cal) {
  try { return points?.length >= 2 && cal ? pathStations(points, cal).totalMm : null; } catch { return null; }
}

/**
 * Approved plan locations of splits ({stationMm, x, y}) on the CURRENT geometry — saved next to splitsMm so a later
 * geometry edit can tell a split that kept its cut location from one whose location is no longer on the run (13).
 */
export function anchorsFor(points, cal, splitsMm) {
  const out = [];
  for (const s of splitsMm || []) {
    const q = safePointAt(points, cal, s);
    if (q) out.push({ stationMm: s, x: q.x, y: q.y });
  }
  return out;
}

/** Splits the server accepts: strictly increasing and inside the run (cleanInputs). */
export function splitsInsideRun(splitsMm, totalMm) {
  let prev = 0;
  for (const s of splitsMm || []) {
    if (!Number.isFinite(s) || s < 0.001 || s <= prev || !(s < totalMm)) return false;
    prev = s;
  }
  return true;
}

/** Unit direction of the path at a station, in SCREEN space (for drawing tick / split bars across the line). */
export function screenDirectionAt(points, cal, stationMm, toScreen) {
  const q = safePointAt(points, cal, stationMm);
  if (!q) return { x: 1, y: 0 };
  const a = toScreen(points[q.segmentIndex]), b = toScreen(points[q.segmentIndex + 1] || points[q.segmentIndex]);
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
}

/**
 * The straight legs of a traced path as [start, end] pairs, for materials where a plan corner is a JOINT (walls,
 * timber, aluminium) rather than a site fold (flashing, 13). A vertex where the path keeps (almost) the same
 * direction — an extra tap along a straight wall — is not a corner: those legs merge into one. Zero-length legs are
 * skipped. An exact reversal (out-and-back) is a corner. Collinearity is affine-invariant, so PDF space is fine.
 * @param {Array<{x:number,y:number}>} points
 * @param {{ maxTurnDeg?: number }} [opts]
 * @returns {Array<[{x:number,y:number},{x:number,y:number}]>}
 */
export function straightLegs(points, { maxTurnDeg = 3 } = {}) {
  return runLegs(points, null, { maxTurnDeg }).map((l) => [l.a, l.b]);
}

/**
 * The walls of a Line run (HUB 022): straight legs as straightLegs, each with the wall height in force when its END
 * point was tapped (heights[i] belongs to points[i]; the start point's own height is never used). Taps along a
 * straight wall merge only while the height stays the same, so a straight wall splits where the height changes.
 * Changing the height mid-run never changes a leg that was already drawn.
 * @param {Array<{x:number,y:number}>} points
 * @param {Array<number|null>|null} heights
 * @returns {Array<{ a:{x:number,y:number}, b:{x:number,y:number}, heightMm:number|null }>}
 */
export function runLegs(points, heights, { maxTurnDeg = 3 } = {}) {
  const pts = [], hs = [];
  (points || []).forEach((p, i) => {
    if (pts.length && Math.hypot(p.x - pts[pts.length - 1].x, p.y - pts[pts.length - 1].y) <= 1e-9) return;
    pts.push(p);
    const h = heights?.[i];
    hs.push(typeof h === "number" && Number.isFinite(h) && h > 0 ? h : null);
  });
  if (pts.length < 2) return [];
  const sinMax = Math.sin((maxTurnDeg * Math.PI) / 180);
  const legs = [];
  let start = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const u = { x: pts[i].x - start.x, y: pts[i].y - start.y }, v = { x: pts[i + 1].x - pts[i].x, y: pts[i + 1].y - pts[i].y };
    const lu = Math.hypot(u.x, u.y), lv = Math.hypot(v.x, v.y);
    const straight = u.x * v.x + u.y * v.y > 0 && Math.abs(u.x * v.y - u.y * v.x) / (lu * lv) < sinMax;
    if (!straight || hs[i] !== hs[i + 1]) { legs.push({ a: start, b: pts[i], heightMm: hs[i] }); start = pts[i]; }
  }
  legs.push({ a: start, b: pts[pts.length - 1], heightMm: hs[pts.length - 1] });
  return legs;
}

/**
 * The other straight walls with a corner exactly where point `index` of `wall` is (walls traced in one run share
 * their corner points). Traced elevation outlines (polygon walls) are never linked. @returns {Array<{id, index}>}
 */
export function sharedCorners(measurements, wall, index) {
  const q = wall?.points?.[index];
  if (!q || wall.kind !== "wall" || wall.inputs?.kind === "polygon") return [];
  const out = [];
  for (const m of measurements || []) {
    if (m.id === wall.id || m.kind !== "wall" || m.archived || m.inputs?.kind === "polygon" || m.documentId !== wall.documentId || m.pageIndex !== wall.pageIndex) continue;
    (m.points || []).forEach((p, i) => { if (Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6) out.push({ id: m.id, index: i }); });
  }
  return out;
}

/** Screen-space midpoints of each leg (for "insert a point" markers), skipping legs too short to tap safely. */
export function legMidpoints(points, toScreen, minLegPx = TARGET_PX * 1.5) {
  const out = [];
  for (let k = 0; k < points.length - 1; k++) {
    const a = toScreen(points[k]), b = toScreen(points[k + 1]);
    if (Math.hypot(b.x - a.x, b.y - a.y) < minLegPx) continue;
    out.push({ k, screen: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, pdf: { x: (points[k].x + points[k + 1].x) / 2, y: (points[k].y + points[k + 1].y) / 2 } });
  }
  return out;
}
