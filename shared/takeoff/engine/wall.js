// =============================================================================
// shared/takeoff/engine/wall.js — cladding wall surfaces and openings (TC-R04 04 §C0).
//
// A wall surface lives in LOCAL millimetres: x along the wall from its start, y up from its base/datum.
// Input paths: rectangle (run × entered height), straight rake (start/end heights), gable (eaves height +
// apex x/height) or a traced elevation polygon. Openings are axis-aligned rectangles (x offset, sill,
// width, height) in the same frame.
//
//   gross area   = polygon area
//   opening area = UNION of the openings clipped to the wall (overlaps are never deducted twice)
//   net area     = gross − opening
//
// Exact for any simple polygon: the wall is cut into convex trapezoids (vertical slabs between vertex
// x-coordinates) and every query rectangle is split along opening edges into sub-rectangles that are
// either wholly opening or wholly free, so every clip is convex ∩ rectangle. Geometry is never rounded;
// EPS_MM only absorbs floating-point noise. Invalid input returns problems (never throws). Pure ESM.
// =============================================================================
import { EPS_MM, problem } from "./contract.js";
import { formatMm, isFiniteNumber } from "../units.js";

/** Most vertices a traced wall outline may have (matches the measurement point limit). */
export const MAX_WALL_POINTS = 1000;

/** Most openings one wall may carry (06: 500 authored measurements); excess is rejected, never truncated. */
export const MAX_OPENINGS_PER_WALL = 500;

export const WALL_KINDS = Object.freeze(["rect", "rake", "gable", "polygon"]);

/**
 * Hub review HUB 017: the ONE rule for gable values while a wall is being entered (server, test backend). Only values
 * that are present are checked — a gable whose apex position isn't entered yet is a draft the engine reports as
 * incomplete, never a refused save (refusing it cleared the apex height while Sam moved to the position field).
 * @returns {{ field: string, message: string } | null}
 */
export function gableInputProblem(inputs, widthMm) {
  const i = inputs || {};
  const w = widthMm ?? i.widthMm;
  if (i.apexXMm != null && w && !(i.apexXMm > 0 && i.apexXMm < w)) return { field: "apexXMm", message: "The apex must sit between the two wall ends." };
  if (i.apexHeightMm != null && i.eavesHeightMm != null && !(i.apexHeightMm > i.eavesHeightMm)) return { field: "apexHeightMm", message: "The apex must be higher than the eaves." };
  return null;
}

const qty = (code, message, extra = {}) => problem(code, message, { axis: "quantity", ...extra });
const isPos = (v) => isFiniteNumber(v) && v > 0;
const isNonNeg = (v) => isFiniteNumber(v) && v >= 0;

// ── polygon primitives ───────────────────────────────────────────────────────

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

/** Drop consecutive duplicate vertices (incl. a repeated closing point). */
function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > EPS_MM) out.push(p);
  }
  while (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= EPS_MM) out.pop();
  return out;
}

const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const inBox = (a, b, p) => p.x >= Math.min(a.x, b.x) - EPS_MM && p.x <= Math.max(a.x, b.x) + EPS_MM
  && p.y >= Math.min(a.y, b.y) - EPS_MM && p.y <= Math.max(a.y, b.y) + EPS_MM;

/** True when segments ab and cd share any point (crossing, touching or collinear overlap). */
function segmentsTouch(a, b, c, d) {
  const tol = EPS_MM * (Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(d.x - c.x, d.y - c.y));
  const s = (v) => (Math.abs(v) <= tol ? 0 : Math.sign(v));
  const o1 = s(orient(a, b, c)), o2 = s(orient(a, b, d)), o3 = s(orient(c, d, a)), o4 = s(orient(c, d, b));
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  return (o1 === 0 && inBox(a, b, c)) || (o2 === 0 && inBox(a, b, d)) || (o3 === 0 && inBox(c, d, a)) || (o4 === 0 && inBox(c, d, b));
}

/** Non-adjacent edges touching, or an edge doubling back on its neighbour (a spike). */
function selfIntersects(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], c = pts[(i + 2) % n];
    const u = { x: b.x - a.x, y: b.y - a.y }, v = { x: c.x - b.x, y: c.y - b.y };
    if (Math.abs(u.x * v.y - u.y * v.x) <= EPS_MM * Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) && u.x * v.x + u.y * v.y < 0) return true;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsTouch(a, b, pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

/**
 * Convex trapezoids covering a simple polygon: one per (vertical slab, pair of crossing edges).
 * Each keeps its slab [xa, xb] and lower/upper edge heights at both ends.
 */
function trapezoids(poly) {
  const xs = [...new Set(poly.map((p) => p.x))].sort((a, b) => a - b);
  const edges = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (a.x !== b.x) edges.push(a.x < b.x ? [a, b] : [b, a]);
  }
  const at = ([l, r], x) => (x === l.x ? l.y : x === r.x ? r.y : l.y + ((r.y - l.y) * (x - l.x)) / (r.x - l.x));
  const traps = [];
  for (let k = 0; k + 1 < xs.length; k++) {
    const xa = xs[k], xb = xs[k + 1], xm = (xa + xb) / 2;
    const crossing = edges.filter(([l, r]) => l.x <= xa && r.x >= xb)
      .map((e) => ({ ya: at(e, xa), yb: at(e, xb), ym: at(e, xm) }))
      .sort((u, v) => u.ym - v.ym);
    for (let j = 0; j + 1 < crossing.length; j += 2) {
      const lo = crossing[j], hi = crossing[j + 1];
      traps.push({
        xa, xb, la: lo.ya, lb: lo.yb, ha: hi.ya, hb: hi.yb,
        pts: [{ x: xa, y: lo.ya }, { x: xb, y: lo.yb }, { x: xb, y: hi.yb }, { x: xa, y: hi.ya }],
        x0: xa, x1: xb, y0: Math.min(lo.ya, lo.yb), y1: Math.max(hi.ya, hi.yb),
      });
    }
  }
  return traps;
}

/** Sutherland–Hodgman clip of a CONVEX polygon to an axis-aligned rectangle. */
function clipConvex(pts, r) {
  let out = pts;
  for (const [axis, bound, keepAbove] of [["x", r.x0, true], ["x", r.x1, false], ["y", r.y0, true], ["y", r.y1, false]]) {
    if (!out.length) break;
    const input = out;
    out = [];
    const inside = (p) => (keepAbove ? p[axis] >= bound : p[axis] <= bound);
    const cut = (a, b) => {
      const t = (bound - a[axis]) / (b[axis] - a[axis]);
      return axis === "x" ? { x: bound, y: a.y + t * (b.y - a.y) } : { x: a.x + t * (b.x - a.x), y: bound };
    };
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cut(prev, cur));
    }
  }
  return out;
}

const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Split rect r into disjoint sub-rectangles; keep = "free" (outside every hole) or "covered" (inside one).
 * Vertical slabs between hole x-edges, each holding the exact (touch-merged) union of the holes spanning
 * it — O(n² log n) for n holes, so a wall with many openings stays responsive.
 */
function splitRect(r, holes, keep) {
  const hs = holes.filter((h) => overlaps(h, r));
  if (!hs.length) return keep === "free" ? [r] : [];
  const xs = [...new Set([r.x0, r.x1, ...hs.flatMap((h) => [h.x0, h.x1]).filter((v) => v > r.x0 && v < r.x1)])].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const xa = xs[i], xb = xs[i + 1], cx = (xa + xb) / 2;
    const covered = [];
    for (const [a, b] of hs.filter((h) => cx > h.x0 && cx < h.x1).map((h) => [Math.max(h.y0, r.y0), Math.min(h.y1, r.y1)]).sort((p, q) => p[0] - q[0])) {
      const last = covered[covered.length - 1];
      if (last && a <= last[1]) last[1] = Math.max(last[1], b);
      else covered.push([a, b]);
    }
    let ys = covered;
    if (keep === "free") {
      ys = [];
      let y = r.y0;
      for (const [a, b] of covered) { if (a > y) ys.push([y, a]); y = Math.max(y, b); }
      if (r.y1 > y) ys.push([y, r.y1]);
    }
    for (const [a, b] of ys) if (b > a) out.push({ x0: xa, y0: a, x1: xb, y1: b });
  }
  return out;
}

/** A clipped piece with its area and extent; null when it is only floating-point noise. */
function piece(pts) {
  if (pts.length < 3) return null;
  const b = bboxOf(pts);
  const area = Math.abs(signedArea(pts));
  return area > EPS_MM * (b.x1 - b.x0 + b.y1 - b.y0) ? { pts, area, ...b } : null;
}

function areaInRects(surface, rects) {
  let total = 0;
  for (const r of rects) {
    for (const t of surface.traps) {
      if (!overlaps(t, r)) continue;
      const p = piece(clipConvex(t.pts, r));
      if (p) total += p.area;
    }
  }
  return total;
}

// ── interval helpers ─────────────────────────────────────────────────────────

/** Sort and merge intervals that overlap or touch (within EPS_MM). */
export function mergeIntervals(list) {
  const out = [];
  for (const [a, b] of list.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1])) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + EPS_MM) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Remove every [c0, c1] cut from a list of intervals; slivers ≤ EPS_MM are dropped. */
export function subtractIntervals(list, cuts) {
  let out = list;
  for (const [c0, c1] of cuts) {
    out = out.flatMap(([a, b]) => [[a, Math.min(b, c0)], [Math.max(a, c1), b]].filter(([s, e]) => e - s > EPS_MM));
  }
  return out;
}

function intersectIntervals(p, q) {
  const out = [];
  for (const [a, b] of p) {
    for (const [c, d] of q) {
      const s = Math.max(a, c), e = Math.min(b, d);
      if (e - s > EPS_MM) out.push([s, e]);
    }
  }
  return mergeIntervals(out);
}

// ── public: wall + openings ──────────────────────────────────────────────────

/**
 * Build a wall surface in local mm (x along the wall, y up from its base).
 * @param {{ kind?: "rect"|"rake"|"gable"|"polygon", id?: string, measurementId?: string,
 *   widthMm?: number, heightMm?: number, startHeightMm?: number, endHeightMm?: number,
 *   eavesHeightMm?: number, apexXMm?: number, apexHeightMm?: number, points?: Array<{x:number,y:number}> }} input
 * @returns {{ id: string|null, measurementId: string|null, kind: string, polygon: Array<{x:number,y:number}>|null,
 *   bbox: {x0:number,y0:number,x1:number,y1:number}|null, grossAreaMm2: number|null, problems: object[] }}
 *   polygon is counter-clockwise; null (with a blocking problem) when the input cannot form a valid wall.
 */
export function buildWall(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const kind = input.kind ?? "rect";
  const head = { id: input.id ?? null, measurementId: input.measurementId ?? null, kind };
  // HUB 029: a shape problem names the wall page fields that fix it (refs[0].missing, the same keys as wall_incomplete:
  // widthMm, heightMm, the rake or gable heights, apexXMm, or "outline" for a traced outline to retrace)
  const fail = (code, message, missing) => ({ ...head, polygon: null, bbox: null, grossAreaMm2: null,
    problems: [qty(code, message, missing ? { refs: [{ missing }] } : {})] });
  if (!WALL_KINDS.includes(kind)) return fail("wall_kind_unknown", `Unknown wall shape "${kind}".`);
  let pts;
  if (kind === "polygon") {
    const raw = input.points;
    if (!Array.isArray(raw) || raw.length < 3) return fail("wall_polygon_invalid", "A traced wall needs at least 3 points.", ["outline"]);
    if (raw.length > MAX_WALL_POINTS) return fail("wall_polygon_invalid", `A traced wall can have at most ${MAX_WALL_POINTS} points — split the wall.`, ["outline"]);
    if (!raw.every((p) => p && isFiniteNumber(p.x) && isFiniteNumber(p.y))) return fail("wall_polygon_invalid", "A wall point is not a number.", ["outline"]);
    pts = raw.map((p) => ({ x: p.x, y: p.y }));
  } else {
    const W = input.widthMm;
    if (!isPos(W)) return fail("wall_dimension_invalid", "Wall length must be a number greater than 0.", ["widthMm"]);
    if (kind === "rect") {
      if (!isPos(input.heightMm)) return fail("wall_dimension_invalid", "Wall height must be a number greater than 0.", ["heightMm"]);
      const H = input.heightMm;
      pts = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
    } else if (kind === "rake") {
      const a = input.startHeightMm, b = input.endHeightMm;
      if (!isNonNeg(a) || !isNonNeg(b) || Math.max(a, b) <= 0) {
        const bad = [!isNonNeg(a) && "startHeightMm", !isNonNeg(b) && "endHeightMm"].filter(Boolean);
        return fail("wall_dimension_invalid", "A raked wall needs start and end heights (0 or more, not both 0).", bad.length ? bad : ["startHeightMm", "endHeightMm"]);
      }
      pts = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: b }, { x: 0, y: a }];
    } else {
      const e = input.eavesHeightMm, ax = input.apexXMm, ah = input.apexHeightMm;
      if (!isNonNeg(e)) return fail("wall_dimension_invalid", "Gable eaves height must be 0 or more.", ["eavesHeightMm"]);
      if (!isFiniteNumber(ax) || ax <= 0 || ax >= W) return fail("wall_dimension_invalid", "Gable apex position must be between the two wall ends.", ["apexXMm"]);
      if (!isFiniteNumber(ah) || ah <= e) return fail("wall_dimension_invalid", "Gable apex must be higher than the eaves.", ["apexHeightMm"]);
      pts = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: e }, { x: ax, y: ah }, { x: 0, y: e }];
    }
  }
  const poly = dedupe(pts);
  const far = poly.reduce((f, p) => (Math.hypot(p.x - poly[0].x, p.y - poly[0].y) > Math.hypot(f.x - poly[0].x, f.y - poly[0].y) ? p : f), poly[0]);
  const span = Math.hypot(far.x - poly[0].x, far.y - poly[0].y);
  if (poly.length < 3 || poly.every((p) => Math.abs(orient(poly[0], far, p)) <= EPS_MM * span)) return fail("wall_polygon_invalid", "The wall outline has no area.", ["outline"]);
  if (selfIntersects(poly)) return fail("wall_self_intersecting", "The wall outline crosses or touches itself — retrace it.", ["outline"]);
  const area = signedArea(poly);
  const b = bboxOf(poly);
  if (Math.abs(area) <= EPS_MM * (b.x1 - b.x0 + b.y1 - b.y0)) return fail("wall_polygon_invalid", "The wall outline has no area.", ["outline"]);
  const polygon = area > 0 ? poly : poly.slice().reverse();
  return { ...head, polygon, bbox: b, grossAreaMm2: Math.abs(area), problems: [] };
}

/**
 * Validate openings against a wall. Zero-sized/non-numeric or wholly-outside openings, missing or
 * duplicate ids, polygon-shaped openings (not supported: trace them as rectangles) and more than
 * MAX_OPENINGS_PER_WALL openings are blocking (they need correction). An opening touching the wall boundary
 * is valid; one that extends past it is kept, clipped for area purposes, with a non-blocking
 * "opening_clipped" warning.
 * @param {object} wall   result of buildWall
 * @param {Array<{ id: string, kind?: string, xMm: number, sillMm: number, widthMm: number, heightMm: number }>} openings
 * @returns {{ openings: Array<{ id: string, kind: string, x0: number, y0: number, x1: number, y1: number,
 *   areaMm2: number, wallAreaMm2: number, clipped: boolean }>, problems: object[] }}
 */
export function normaliseOpenings(wall, openings = []) {
  const problems = [];
  if (!wall?.polygon) return { openings: [], problems: [qty("wall_invalid", "Openings need a valid wall.")] };
  if (!Array.isArray(openings)) return { openings: [], problems: [qty("opening_invalid", "Openings must be a list.")] };
  if (openings.length > MAX_OPENINGS_PER_WALL) {
    return { openings: [], problems: [qty("too_many_openings", `A wall can carry at most ${MAX_OPENINGS_PER_WALL} openings (${openings.length} entered) — split the wall.`)] };
  }
  const surface = { traps: trapezoids(wall.polygon) };
  const seen = new Set();
  const out = [];
  for (const o of openings) {
    const id = o?.id;
    if (id === undefined || id === null || id === "") { problems.push(qty("opening_invalid", "Every opening needs an id.")); continue; }
    if (seen.has(id)) { problems.push(qty("opening_duplicate", `Opening ${id} is listed twice.`, { refs: [{ openingId: id }] })); continue; }
    seen.add(id);
    const { xMm, sillMm, widthMm, heightMm } = o;
    if (Array.isArray(o.points)) {
      problems.push(qty("opening_shape_unsupported", `Opening ${id} is a traced polygon — this layout takes rectangular openings only; trace it as rectangles or enter a reviewed manual quantity.`, { refs: [{ openingId: id }] }));
      continue;
    }
    if (![xMm, sillMm].every(isFiniteNumber) || !isPos(widthMm) || !isPos(heightMm)) {
      problems.push(qty("opening_invalid", `Opening ${id} needs a position, sill and a width and height greater than 0.`, { refs: [{ openingId: id }] }));
      continue;
    }
    const rect = { x0: xMm, y0: sillMm, x1: xMm + widthMm, y1: sillMm + heightMm };
    const areaMm2 = widthMm * heightMm;
    const wallAreaMm2 = areaInRects(surface, [rect]);
    if (wallAreaMm2 <= EPS_MM * (widthMm + heightMm)) {
      problems.push(qty("opening_outside_wall", `Opening ${id} is entirely outside the wall — move it onto the wall or delete it.`, { refs: [{ openingId: id }] }));
      continue;
    }
    const clipped = areaMm2 - wallAreaMm2 > EPS_MM * (widthMm + heightMm);
    if (clipped) {
      problems.push(qty("opening_clipped", `Opening ${id} extends past the wall edge; only the part on the wall (${formatMm(wallAreaMm2 / 1e6, 3)} m²) is deducted.`, { blocking: false, refs: [{ openingId: id }] }));
    }
    out.push({ id, kind: o.kind ?? "opening", ...rect, areaMm2, wallAreaMm2, clipped });
  }
  return { openings: out, problems };
}

/**
 * Gross, opening (union, clipped to the wall) and net areas in m² — unrounded.
 * @param {object} wall   result of buildWall
 * @param {object[]} openings raw openings (as for normaliseOpenings)
 * @returns {{ grossM2: number|null, openingM2: number|null, netM2: number|null,
 *   grossAreaMm2: number|null, openingAreaMm2: number|null, netAreaMm2: number|null, problems: object[] }}
 */
export function wallAreas(wall, openings = []) {
  if (!wall?.polygon) {
    return { grossM2: null, openingM2: null, netM2: null, grossAreaMm2: null, openingAreaMm2: null, netAreaMm2: null,
      problems: [...(wall?.problems || []), qty("wall_invalid", "The wall shape is missing or invalid.")] };
  }
  const norm = normaliseOpenings(wall, openings);
  const surface = surfaceModel(wall, norm.openings);
  const openingAreaMm2 = areaInRects(surface, splitRect(surface.bbox, surface.holes, "covered"));
  const netAreaMm2 = wall.grossAreaMm2 - openingAreaMm2;
  return {
    grossM2: wall.grossAreaMm2 / 1e6, openingM2: openingAreaMm2 / 1e6, netM2: netAreaMm2 / 1e6,
    grossAreaMm2: wall.grossAreaMm2, openingAreaMm2, netAreaMm2, problems: norm.problems,
  };
}

// ── public: surface queries used by the layout methods ───────────────────────

/**
 * Pre-computed clad surface: wall trapezoids + opening rectangles (holes).
 * @param {object} wall            result of buildWall (must have a polygon)
 * @param {Array<{id:string,x0:number,y0:number,x1:number,y1:number}>} holes  normalised openings ([] = none deducted)
 */
export function surfaceModel(wall, holes = []) {
  return buildSurface(wall.polygon, holes.map((h) => ({ id: h.id, x0: h.x0, y0: h.y0, x1: h.x1, y1: h.y1 })));
}

function buildSurface(polygon, holes) {
  return { polygon, holes, traps: trapezoids(polygon), bbox: bboxOf(polygon) };
}

/** The same surface with x and y swapped (lets one routine lay out along either axis). */
export function transposeSurface(surface) {
  return buildSurface(surface.polygon.map((p) => ({ x: p.y, y: p.x })), surface.holes.map((h) => ({ id: h.id, x0: h.y0, y0: h.x0, x1: h.y1, y1: h.x1 })));
}

/**
 * Clad material inside a rectangle: (wall ∩ rect) − openings, as disjoint convex pieces
 * [{ pts, area, x0, y0, x1, y1 }]. Empty when the rectangle holds no material.
 */
export function materialPieces(surface, rect) {
  const out = [];
  const traps = surface.traps.filter((t) => overlaps(t, rect));
  if (!traps.length) return out;
  for (const free of splitRect(rect, surface.holes, "free")) {
    for (const t of traps) {
      if (!overlaps(t, free)) continue;
      const p = piece(clipConvex(t.pts, free));
      if (p) out.push(p);
    }
  }
  return out;
}

/** Combined extent and area of pieces, or null when there are none. */
export function piecesExtent(pieces) {
  if (!pieces.length) return null;
  return pieces.reduce((e, p) => ({ x0: Math.min(e.x0, p.x0), y0: Math.min(e.y0, p.y0), x1: Math.max(e.x1, p.x1), y1: Math.max(e.y1, p.y1), area: e.area + p.area }),
    { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, area: 0 });
}

/** Project pieces onto one axis ("x" or "y") → merged [start, end] intervals (exact: pieces are convex). */
export function projectIntervals(pieces, axis = "x") {
  const [lo, hi] = axis === "x" ? ["x0", "x1"] : ["y0", "y1"];
  return mergeIntervals(pieces.map((p) => [p[lo], p[hi]])).filter(([a, b]) => b - a > EPS_MM);
}

/** x-range of [xa, xb] where the linear f (fa→fb) is strictly below/above v. */
function halfRange(xa, xb, fa, fb, v, below) {
  const ok = (f) => (below ? f < v : f > v);
  if (fa === fb) return ok(fa) ? [xa, xb] : null;
  const okA = ok(fa), okB = ok(fb);
  if (okA && okB) return [xa, xb];
  if (!okA && !okB) return null;
  const xc = xa + ((v - fa) * (xb - xa)) / (fb - fa);
  return okA ? [xa, Math.min(xb, xc)] : [Math.max(xa, xc), xb];
}

/**
 * x-intervals of the horizontal line y = v that lie strictly INSIDE the clad material (material both just
 * above and just below; the wall's own edges do not count), less every opening whose closed height range
 * contains v. Use transposeSurface for a vertical line.
 */
export function lineSpans(surface, v) {
  const iv = [];
  for (const t of surface.traps) {
    if (v <= t.y0 || v >= t.y1) continue;
    const a = halfRange(t.xa, t.xb, t.la, t.lb, v, true);
    const b = halfRange(t.xa, t.xb, t.ha, t.hb, v, false);
    if (!a || !b) continue;
    const s = Math.max(a[0], b[0]), e = Math.min(a[1], b[1]);
    if (e - s > EPS_MM) iv.push([s, e]);
  }
  const cuts = surface.holes.filter((h) => h.y0 <= v + EPS_MM && h.y1 >= v - EPS_MM).map((h) => [h.x0, h.x1]);
  return subtractIntervals(mergeIntervals(iv), cuts);
}

/**
 * A joint of width `gap` starting at y = at: the x-intervals where material meets the joint on BOTH sides
 * (inside material at y = at and at y = at + gap). Openings interrupt it.
 */
export function jointSpans(surface, at, gap = 0) {
  const lower = lineSpans(surface, at);
  return gap > 0 ? intersectIntervals(lower, lineSpans(surface, at + gap)) : lower;
}
