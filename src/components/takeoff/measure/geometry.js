// =============================================================================
// measure/geometry.js — screen hit-testing and path-station helpers for MeasureScreen (TC-R04 13, 02 §2–3).
// Pure functions. Points are {x,y}; "screen" helpers take CSS-px points from the viewport transform, "path" helpers
// take PDF user-space points + the page calibration and return calibrated mm stations (never screen pixels).
// =============================================================================
import { pathStations, pointAtStation } from "../../../../shared/takeoff/engine/flashingPath.js";
import { pointToMm } from "../../../../shared/takeoff/calibration.js";
import { buildWall, normaliseOpenings } from "../../../../shared/takeoff/engine/wall.js";

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

// ── + Window / + Door on the plan (HUB 022 step 2) ───────────────────────────────────────────────────────────

/**
 * A tap counts as on a wall within this many real mm of it (zoomed right in on a thick wall), or within a finger's
 * width on screen — but never more than OPENING_MAX_MM off it (zoomed right out, a finger covers metres).
 */
export const OPENING_REACH_PX = TARGET_PX;
export const OPENING_REACH_MM = 400;
export const OPENING_MAX_MM = 1000;
const round10 = (v) => Math.round(v / 10) * 10;

/**
 * Where plan point `p` is on a straight traced wall [a, b], in the wall's own real mm: the station along the wall
 * from its start (unclamped: below 0 or past the length when it is beyond an end) and how far it is from the wall.
 * Worked in calibrated mm, so a page with separate X / Y scales projects correctly.
 * @returns {{ stationMm:number, lengthMm:number, offMm:number, segMm:number } | null}
 */
export function wallStation(points, cal, p) {
  if (!cal || points?.length !== 2) return null;
  const [a, b] = points;
  const B = pointToMm(cal, a, b), P = pointToMm(cal, a, p);
  const L = Math.hypot(B.x, B.y);
  if (!(L > 0)) return null;
  const s = (P.x * B.x + P.y * B.y) / L;
  const off = Math.abs(B.x * P.y - B.y * P.x) / L;
  const past = s < 0 ? -s : s > L ? s - L : 0;
  return { stationMm: s, lengthMm: L, offMm: off, segMm: Math.hypot(off, past) };
}

/**
 * The traced wall a tap is on: the nearest within reach (screen px, or real mm), else null.
 * @param {Array<{ id:string, points:Array, cal:object }>} walls straight traced walls (PDF points + their calibration)
 * @param {{ pxPerUnit:number, reachPx?:number, reachMm?:number }} opts pxPerUnit = screen px per PDF unit now
 */
export function nearestWall(walls, p, { pxPerUnit, reachPx = OPENING_REACH_PX, reachMm = OPENING_REACH_MM, maxMm = OPENING_MAX_MM }) {
  let best = null;
  for (const w of walls || []) {
    const st = wallStation(w.points, w.cal, p);
    if (!st) continue;
    const px = distToSeg(p, w.points[0], w.points[1]) * pxPerUnit;
    if (!(st.segMm <= reachMm || (px <= reachPx && st.segMm <= maxMm))) continue;
    if (!best || px < best.px) best = { wall: w, px, station: st };
  }
  return best;
}

/** Two traced walls meet at a corner: an end of one is on (or within a tap's real reach of) an end of the other. */
function wallsMeet(w1, w2, reachMm = OPENING_REACH_MM) {
  for (const p of w1.points) for (const q of w2.points) {
    const m = pointToMm(w1.cal, p, q);
    if (Math.hypot(m.x, m.y) <= reachMm) return true;
  }
  return false;
}

/** Two walls run in one line (no turn between them: a straight wall split where its height changes, HUB 022). */
function inLine(w1, w2, maxTurnDeg = 3) {
  const dir = (w) => { const m = pointToMm(w.cal, w.points[0], w.points[1]); const L = Math.hypot(m.x, m.y) || 1; return { x: m.x / L, y: m.y / L }; };
  const u = dir(w1), v = dir(w2);
  return Math.abs(u.x * v.y - u.y * v.x) < Math.sin((maxTurnDeg * Math.PI) / 180);
}

/**
 * How far (real mm, along wall `w`) an ordinary finger tap can land from where it was meant at the zoom now:
 * OPENING_SLOP_PX on screen, at least OPENING_SLOP_MIN_MM and never more than OPENING_REACH_MM. An end cut back by
 * no more than this is just the end being tapped, not a warning.
 */
export const OPENING_SLOP_PX = 12;
export const OPENING_SLOP_MIN_MM = 20;
export function tapSlopMm(w, pxPerUnit) {
  const st = wallStation(w?.points, w?.cal, w?.points?.[1]);
  const px = st ? Math.hypot(w.points[1].x - w.points[0].x, w.points[1].y - w.points[0].y) * pxPerUnit : 0;
  const pxPerMm = st && px > 0 ? px / st.lengthMm : 0;
  if (!(pxPerMm > 0)) return OPENING_REACH_MM;
  return Math.min(OPENING_REACH_MM, Math.max(OPENING_SLOP_MIN_MM, OPENING_SLOP_PX / pxPerMm));
}

/**
 * An opening from its two end taps on the plan: the wall it goes in, its offset from that wall's start and its width,
 * in real mm to the nearest 10. Both taps must be on that wall: a little past its end, or just round its corner onto
 * the next wall, is fine (the opening goes on the wall that carries most of it; a tap at a corner may be nearer the
 * wall next to it). Anything past the wall's ends is cut back to the wall, so the opening always fits the wall it is
 * saved on. `clipped` says why when more than a finger's slip was cut off: "end" (past a free end), "corner" (round a
 * corner onto `nextWallId`) or "join" (on into `nextWallId`, the next wall in the same line); null otherwise.
 * @returns {{ ok:true, wallId:string, xMm:number, widthMm:number, tappedWidthMm:number, clipped:null|"end"|"corner"|"join", nextWallId:string|null }
 *   | { ok:false, reason:"no_wall"|"other_end_off_wall"|"different_walls"|"across_join"|"off_wall", wallId?:string, otherWallId?:string }}
 */
export function planOpening(walls, p1, p2, opts) {
  const n1 = nearestWall(walls, p1, opts);
  if (!n1) return { ok: false, reason: "no_wall" };
  const n2 = nearestWall(walls, p2, opts);
  if (!n2) return { ok: false, reason: "other_end_off_wall", wallId: n1.wall.id };
  const span = (w) => {
    const a = wallStation(w.points, w.cal, p1), b = wallStation(w.points, w.cal, p2);
    if (!a || !b) return null;
    const lo = Math.min(a.stationMm, b.stationMm), hi = Math.max(a.stationMm, b.stationMm), L = a.lengthMm;
    return { w, a, b, lo, hi, L, on: Math.max(0, Math.min(hi, L) - Math.max(lo, 0)) };
  };
  // every wall with both ends on it: the one carrying most of the opening (the first tap's wall, then the second's, on a tie)
  const pref = (w) => (w.id === n1.wall.id ? 0 : w.id === n2.wall.id ? 1 : 2);
  const fits = walls.filter((w) => nearestWall([w], p1, opts) && nearestWall([w], p2, opts)).map(span).filter(Boolean)
    .sort((x, y) => (Math.abs(y.on - x.on) > 1e-6 ? y.on - x.on : pref(x.w) - pref(y.w)));
  if (!fits.length) {
    const join = n1.wall.id !== n2.wall.id && wallsMeet(n1.wall, n2.wall) && inLine(n1.wall, n2.wall);
    return { ok: false, reason: join ? "across_join" : "different_walls", wallId: n1.wall.id, otherWallId: n2.wall.id };
  }
  const { w, lo, hi, L, on } = fits[0];
  const xMm = round10(Math.max(0, lo));
  let widthMm = round10(on);
  if (xMm + widthMm > L) widthMm = Math.floor((L - xMm) / 10) * 10;   // never past the wall end after rounding
  if (!(widthMm >= 10)) return { ok: false, reason: "off_wall", wallId: w.id };
  const slop = tapSlopMm(w, opts.pxPerUnit);
  const pastEnds = hi - lo - on;   // along this wall, beyond its ends
  // round a corner (or on into the next wall in line): the part along that wall, counted only for a tap at (or past)
  // this wall's end there; a tap beside this wall near its end is just off the wall line
  let next = null, nextMm = 0;
  for (const [p, n] of [[p1, n1], [p2, n2]]) {
    if (n.wall.id === w.id || !wallsMeet(w, n.wall)) continue;
    const st = wallStation(w.points, w.cal, p);
    if (!(st.stationMm <= slop || st.stationMm >= L - slop)) continue;
    const s = span(n.wall);
    if (s && s.on > nextMm) { nextMm = s.on; next = n.wall; }
  }
  const cut = Math.max(pastEnds, nextMm);
  const clipped = !(cut > slop) ? null : nextMm > slop ? (inLine(w, next) ? "join" : "corner") : "end";
  return { ok: true, wallId: w.id, xMm, widthMm, tappedWidthMm: round10(on + cut), clipped, nextWallId: clipped === "corner" || clipped === "join" ? next.id : null };
}

/**
 * Does an opening reach above the top of its straight traced wall anywhere along it (a window taller than the wall,
 * or under a sloping top)? The engine then deducts only the part on the wall (wall.js "opening_clipped"), so the
 * plan says so as it is placed. False when the wall has no usable height yet.
 */
export function openingAboveWall(wallInputs, lengthMm, o) {
  if (!(lengthMm > 0)) return false;
  const i = wallInputs || {};
  const w = buildWall({ kind: i.kind || "rect", widthMm: lengthMm, heightMm: i.heightMm, startHeightMm: i.startHeightMm, endHeightMm: i.endHeightMm,
    eavesHeightMm: i.eavesHeightMm, apexXMm: i.apexXMm, apexHeightMm: i.apexHeightMm });
  if (!w.polygon) return false;
  const r = normaliseOpenings(w, [{ id: "o", xMm: o.xMm, sillMm: o.sillMm, widthMm: o.widthMm, heightMm: o.heightMm }]);
  return r.openings[0]?.clipped === true;
}

/**
 * The part of an opening that is on its wall, as two plan points along the wall (for drawing it on the plan), or null
 * when the wall can't be measured or the opening is off it.
 */
export function openingOnWall(points, cal, xMm, widthMm) {
  const L = pathLengthMm(points, cal);
  if (!(L > 0) || !Number.isFinite(xMm) || !(widthMm > 0)) return null;
  const s0 = Math.max(0, xMm), s1 = Math.min(L, xMm + widthMm);
  if (!(s1 - s0 > 1e-6)) return null;
  const a = safePointAt(points, cal, s0), b = safePointAt(points, cal, s1);
  return a && b ? { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } } : null;
}

/** Rough screen box of a bold plan label (centred on x, baseline at y): about 0.6 em a character. */
export function labelBox(x, y, text, size = 12) {
  const w = String(text || "").length * size * 0.6;
  return { x0: x - w / 2, x1: x + w / 2, y0: y - size * 0.8, y1: y + size * 0.25 };
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
