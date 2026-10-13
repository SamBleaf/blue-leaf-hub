// =============================================================================
// profileEditorModel.js — pure helpers behind ProfileEditor (no React, no DOM).
//
//   * layoutProfile — screen layout of a canonical profile at a zoom: polyline, coated band
//     (offset toward the coated side), end-treatment glyphs, and labels. Leg labels sit on the
//     NON-coated side, corner labels outside each fold, treatment labels beyond the end; each
//     is pushed clear of the profile and of earlier labels, with a leader line when pushed.
//   * hitTest — what a tap selects (label > corner/end > leg).
//   * fitView / zoomAt / panBy / screenToMm — viewport maths.
//   * sketchLegs / sketchToProfile — tapped grid points → canonical profile (lengths to 5 mm,
//     headings to 15°). The sketch only gives the shape; typed values are authoritative.
//
// Layout space is CSS px, y DOWN, origin at the profile's first vertex. The component adds
// the pan translation with an SVG transform, so panning never re-runs the layout.
// =============================================================================
import {
  normaliseProfile, profileVertices, treatmentGlyphs, includedAngle, formatMm,
  MAX_PROFILE_SEGMENTS, TakeoffValidationError,
} from "../../../shared/takeoff/index.js";

export const SKETCH_GRID_MM = 10;
export const SKETCH_LENGTH_STEP_MM = 5;
export const SKETCH_ANGLE_STEP_DEG = 15;
export const MIN_SCALE = 0.02; // px per mm
export const MAX_SCALE = 40;
const FIT_MAX_SCALE = 8;

export const LABEL_H = 20;
const CHAR_W = 7;          // generous average glyph width at 12px Lato
const LABEL_PAD_X = 6;
const LEG_GAP = 8;         // label clearance from its own leg
export const COAT_OFFSET_PX = 4.5;
const SEG_CLEAR = 5;       // label clearance from any profile line (covers the coated band)

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const normDeg = (d) => ((d % 360) + 360) % 360;
/** Wrap to (−180, 180]. */
const norm180 = (d) => { const x = normDeg(d); return x > 180 ? x - 360 : x; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const unit = (v) => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
const rotate = (v, d) => { const c = Math.cos(rad(d)), s = Math.sin(rad(d)); return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }; };
const flipSide = (s) => (s === "left" ? "right" : "left");

/** Unit normal on `side` of a screen-space (y down) direction. Left of travel = (uy, −ux). */
export function screenSideNormal(u, side) {
  return side === "left" ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x };
}

/** Display: 90 → "90", 112.5 → "112.5". */
export function formatAngle(d) {
  return String(Math.round(d * 10) / 10);
}

/** Parse a typed number: tolerates spaces, thousands commas and a trailing "mm"/"°". NaN if not a number. */
export function parseNumberInput(raw) {
  if (typeof raw !== "string") return NaN;
  const s = raw.replace(/\s+/g, "").replace(/(mm|°|deg)$/i, "").replace(/,/g, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}

export function treatmentText(t) {
  if (!t || t.type === "none") return "plain";
  return `${t.type === "closed_hem" ? "hem" : "return"} ${formatMm(t.widthMm)} mm ${t.side}`;
}

// ── geometry primitives ──────────────────────────────────────────────────────

export function labelSize(text) {
  return { w: text.length * CHAR_W + LABEL_PAD_X * 2, h: LABEL_H };
}
const boxAt = (c, size) => ({ x: c.x - size.w / 2, y: c.y - size.h / 2, w: size.w, h: size.h });
const inflate = (b, d) => ({ x: b.x - d, y: b.y - d, w: b.w + d * 2, h: b.h + d * 2 });
/** Half-extent of a box along a unit direction (support function). */
const support = (size, v) => Math.abs(v.x) * (size.w / 2) + Math.abs(v.y) * (size.h / 2);

/** Does segment a→b touch rectangle r? (Liang–Barsky clip.) */
export function segmentHitsBox(a, b, r) {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - r.x, r.x + r.w - a.x, a.y - r.y, r.y + r.h - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}
export function boxesOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function distToBox(p, b) {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}
/** Point where the ray from the box centre toward `to` leaves the box (leader-line end). */
function boxEdgeToward(box, to) {
  const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const dx = to.x - c.x, dy = to.y - c.y;
  const tx = dx ? box.w / 2 / Math.abs(dx) : Infinity, ty = dy ? box.h / 2 / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty, 1);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/**
 * Offset polyline toward each segment's `normals[i]` by d px: mitred joins, bevelled on the
 * outside of very sharp folds so the band never spikes.
 */
export function offsetPolyline(pts, normals, d) {
  if (pts.length < 2) return [];
  const out = [{ x: pts[0].x + normals[0].x * d, y: pts[0].y + normals[0].y * d }];
  for (let j = 1; j < pts.length - 1; j++) {
    const n1 = normals[j - 1], n2 = normals[j], p = pts[j];
    const denom = 1 + n1.x * n2.x + n1.y * n2.y;
    const u2 = unit({ x: pts[j + 1].x - p.x, y: pts[j + 1].y - p.y });
    const inside = n1.x * u2.x + n1.y * u2.y > 0; // the next leg heads toward the offset side
    if (denom > 0.22 || inside) {
      const k = d / Math.max(denom, 0.22);
      out.push({ x: p.x + (n1.x + n2.x) * k, y: p.y + (n1.y + n2.y) * k });
    } else {
      out.push({ x: p.x + n1.x * d, y: p.y + n1.y * d }, { x: p.x + n2.x * d, y: p.y + n2.y * d });
    }
  }
  const last = pts.length - 1;
  out.push({ x: pts[last].x + normals[last - 1].x * d, y: pts[last].y + normals[last - 1].y * d });
  return out;
}

// ── label placement ───────────────────────────────────────────────────────────

/** Do segments p1→p2 and p3→p4 cross or touch? */
export function segmentsCross(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
/** Leader without its first 4 px (which start on the anchor's own line). */
export function leaderTail(leader) {
  const { from, to } = leader;
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (len <= 4) return null;
  return [{ x: from.x + ((to.x - from.x) / len) * 4, y: from.y + ((to.y - from.y) / len) * 4 }, to];
}
function collisions(cand, obstacles) {
  let n = 0;
  const b = inflate(cand.box, SEG_CLEAR);
  for (const [a, c] of obstacles.segs) if (segmentHitsBox(a, c, b)) n++;
  const b2 = inflate(cand.box, 2);
  for (const o of obstacles.boxes) if (boxesOverlap(b2, o)) n++;
  // a leader that crosses another line would point at the wrong leg
  const tail = cand.leader && leaderTail(cand.leader);
  if (tail) for (const [a, c] of obstacles.segs) if (segmentsCross(tail[0], tail[1], a, c)) n++;
  return n;
}
/** First collision-free candidate (candidates are in preference order), else the fewest collisions. */
function pick(cands, obstacles) {
  let best = null, bestN = Infinity;
  for (const c of cands) {
    const n = collisions(c, obstacles);
    if (n === 0) return c;
    if (n < bestN) { best = c; bestN = n; }
  }
  return best;
}
function withLeader(c, anchor, pushed) {
  return { ...c, leader: pushed ? { from: anchor, to: boxEdgeToward(c.box, anchor) } : null };
}

/** End-treatment glyph in layout space: SVG path, obstacle segments, outward direction. */
function glyphLayout(g, scale) {
  const at = { x: g.point.x * scale, y: -g.point.y * scale };
  const dir = { x: Math.cos(rad(g.headingDeg)), y: -Math.sin(rad(g.headingDeg)) };
  const n = { x: g.normal.x, y: -g.normal.y };
  const w = clamp(g.widthMm * scale, 10, 40);
  const P = (p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  if (g.type === "closed_hem") {
    // folded flat back on itself: a tight hook on the chosen side, then the return along the leg
    const gap = 5;
    const a2 = { x: at.x + n.x * gap, y: at.y + n.y * gap };
    const tip = { x: a2.x - dir.x * w, y: a2.y - dir.y * w };
    const c1 = { x: at.x + dir.x * 5, y: at.y + dir.y * 5 }, c2 = { x: a2.x + dir.x * 5, y: a2.y + dir.y * 5 };
    return {
      type: g.type, at, dir, n,
      path: `M ${P(at)} C ${P(c1)} ${P(c2)} ${P(a2)} L ${P(tip)}`,
      segs: [[at, c1], [c1, c2], [c2, a2], [a2, tip]],
    };
  }
  // open return: a short 90° return on the chosen side
  const end = { x: at.x + n.x * w, y: at.y + n.y * w };
  return { type: g.type, at, dir, n, path: `M ${P(at)} L ${P(end)}`, segs: [[at, end]] };
}

/**
 * Lay out `profile` at `scale` px/mm. Returns layout-space geometry:
 * { pts, coated, legs[{index,id,a,b,label}], corners[{index,v,label}], ends[{which,p,glyph}] }
 * where label = { text, box:{x,y,w,h}, leader: null | {from,to} }.
 */
export function layoutProfile(profile, scale) {
  const { points } = profileVertices(profile);
  const pts = points.map((p) => ({ x: p.x * scale, y: -p.y * scale }));
  const dirs = [];
  for (let i = 0; i < pts.length - 1; i++) dirs.push(unit({ x: pts[i + 1].x - pts[i].x, y: pts[i + 1].y - pts[i].y }));
  const coatedNormals = dirs.map((u) => screenSideNormal(u, profile.coatedFace));
  const coated = offsetPolyline(pts, coatedNormals, COAT_OFFSET_PX);

  const glyphs = {};
  for (const g of treatmentGlyphs(profile)) glyphs[g.at] = { ...glyphLayout(g, scale), widthMm: g.widthMm, side: g.side };

  const obstacles = { segs: [], boxes: [] };
  for (let i = 0; i < pts.length - 1; i++) obstacles.segs.push([pts[i], pts[i + 1]]);
  for (const g of Object.values(glyphs)) obstacles.segs.push(...g.segs);

  // legs — non-coated side, centred, pushed out (with a leader) when crowded or very short;
  // the coated side (always with a leader, clear of the band) only when the other side is full
  const legs = profile.segments.map((seg, i) => {
    const a = pts[i], b = pts[i + 1], u = dirs[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const text = `L${i + 1} ${formatMm(seg.lengthMm)}`;
    const size = labelSize(text);
    const along = Math.abs(u.x) * size.w + Math.abs(u.y) * size.h;
    const short = len < along + 8;
    const ts = short ? [0.5] : [0.5, 0.3, 0.7];
    const sides = [
      { n: screenSideNormal(u, flipSide(profile.coatedFace)), base: 0, extras: short ? [18, 30, 46, 66] : [0, 14, 28, 46, 66] },
      { n: screenSideNormal(u, profile.coatedFace), base: COAT_OFFSET_PX + 2, extras: [12, 24, 40, 60] },
    ];
    const cands = [];
    for (const { n, base, extras } of sides) {
      for (const extra of extras) {
        for (const t of ts) {
          const anchor = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          const d = LEG_GAP + base + support(size, n) + extra;
          cands.push(withLeader({ box: boxAt({ x: anchor.x + n.x * d, y: anchor.y + n.y * d }, size) }, anchor, extra > 0));
        }
      }
    }
    const chosen = pick(cands, obstacles);
    obstacles.boxes.push(chosen.box);
    return { index: i, id: seg.id, a, b, label: { text, ...chosen } };
  });

  // corners — included angle outside the fold (exterior bisector); straight joins on the coated side
  const corners = profile.bends.map((bend, i) => {
    const v = pts[i + 1], u1 = dirs[i], u2 = dirs[i + 1];
    let e = { x: u1.x - u2.x, y: u1.y - u2.y };
    e = Math.hypot(e.x, e.y) < 1e-6 ? screenSideNormal(u1, profile.coatedFace) : unit(e);
    const text = `${formatAngle(includedAngle(bend.turnDeg))}°`;
    const size = labelSize(text);
    const cands = [];
    for (const r of [8, 18, 32, 50]) {
      for (const rot of [0, 30, -30, 60, -60, 90, -90, 120, -120]) {
        const dir = rotate(e, rot);
        const d = r + support(size, dir);
        cands.push(withLeader({ box: boxAt({ x: v.x + dir.x * d, y: v.y + dir.y * d }, size) }, v, r > 8));
      }
    }
    const chosen = pick(cands, obstacles);
    obstacles.boxes.push(chosen.box);
    return { index: i, v, turnDeg: bend.turnDeg, label: { text, ...chosen } };
  });

  // ends — tap targets always; glyph + label when a treatment is set
  const ends = ["start", "end"].map((which) => {
    const p = which === "start" ? pts[0] : pts[pts.length - 1];
    const g = glyphs[which];
    if (!g) return { which, p, glyph: null };
    const text = `${g.type === "closed_hem" ? "Hem" : "Return"} ${formatMm(g.widthMm)}`;
    const size = labelSize(text);
    const cands = [];
    for (const r of [10, 22, 38]) {
      for (const rot of [0, 35, -35, 70, -70, 110, -110]) {
        const dir = rotate(g.dir, rot);
        const d = r + support(size, dir) + 4;
        cands.push(withLeader({ box: boxAt({ x: g.at.x + dir.x * d, y: g.at.y + dir.y * d }, size) }, g.at, r > 10));
      }
    }
    const chosen = pick(cands, obstacles);
    obstacles.boxes.push(chosen.box);
    return { which, p, glyph: { ...g, label: { text, ...chosen } } };
  });

  return { scale, pts, coated, legs, corners, ends };
}

/**
 * What a tap at layout-space `pt` selects: { kind:"leg", id } | { kind:"corner", index } |
 * { kind:"end", which } | null. Labels win, then corners/ends near their point, then legs.
 */
export function hitTest(layout, pt, radius = 22) {
  let best = null, bestD = Infinity;
  const consider = (d, target) => { if (d <= radius && d < bestD) { best = target; bestD = d; } };
  for (const l of layout.legs) consider(distToBox(pt, l.label.box) - 6, { kind: "leg", id: l.id });
  for (const c of layout.corners) consider(distToBox(pt, c.label.box) - 6, { kind: "corner", index: c.index });
  for (const e of layout.ends) if (e.glyph) consider(distToBox(pt, e.glyph.label.box) - 6, { kind: "end", which: e.which });
  for (const c of layout.corners) consider(Math.hypot(pt.x - c.v.x, pt.y - c.v.y) - 8, { kind: "corner", index: c.index });
  for (const e of layout.ends) {
    consider(Math.hypot(pt.x - e.p.x, pt.y - e.p.y) - 8, { kind: "end", which: e.which });
    if (e.glyph) for (const [a, b] of e.glyph.segs) consider(distToSegment(pt, a, b) - 4, { kind: "end", which: e.which });
  }
  for (const l of layout.legs) consider(distToSegment(pt, l.a, l.b), { kind: "leg", id: l.id });
  return best;
}

// ── viewport ──────────────────────────────────────────────────────────────────

/** Bounds (mm, y up) of the profile's vertices and end-treatment extents. */
export function profileBoundsMm(profile) {
  const { points } = profileVertices(profile);
  const all = [...points];
  for (const g of treatmentGlyphs(profile)) all.push({ x: g.point.x + g.normal.x * g.widthMm, y: g.point.y + g.normal.y * g.widthMm });
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/**
 * View that centres `bounds` in a `size` px viewport with room for labels; `inset` reserves
 * px on any edge (e.g. under overlay buttons).
 * view = { scale (px/mm), tx, ty }: screen = (tx + x·scale, ty − y·scale).
 */
export function fitView(bounds, size, inset = {}, pad = null) {
  const { top = 0, right = 0, bottom = 0, left = 0 } = inset;
  const w = (size?.w || 0) - left - right, h = (size?.h || 0) - top - bottom;
  if (w <= 0 || h <= 0) return { scale: 1, tx: 0, ty: 0 };
  const padX = pad ?? clamp(w * 0.18, 44, 84), padY = pad ?? clamp(h * 0.14, 36, 64);
  const spanX = Math.max(bounds.maxX - bounds.minX, 1e-6), spanY = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const s = clamp(Math.min(Math.max(w - 2 * padX, 40) / spanX, Math.max(h - 2 * padY, 40) / spanY), MIN_SCALE, FIT_MAX_SCALE);
  const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
  return { scale: s, tx: left + w / 2 - cx * s, ty: top + h / 2 + cy * s };
}

/** Layout-space extents of everything drawn: profile, coated band, glyphs and label boxes. */
export function layoutExtents(L) {
  const xs = [], ys = [];
  const add = (p) => { xs.push(p.x); ys.push(p.y); };
  L.pts.forEach(add);
  L.coated.forEach(add);
  const labels = [...L.legs.map((l) => l.label), ...L.corners.map((c) => c.label), ...L.ends.filter((e) => e.glyph).map((e) => e.glyph.label)];
  for (const { box } of labels) { add(box); add({ x: box.x + box.w, y: box.y + box.h }); }
  for (const e of L.ends) if (e.glyph) for (const [a, b] of e.glyph.segs) { add(a); add(b); }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/**
 * Label-aware zoom-to-fit: fit the geometry, measure how far labels/glyphs overhang it at that
 * zoom, then refit with that overhang reserved (labels are fixed px, so iterate twice).
 */
export function fitProfileView(profile, size, inset = {}) {
  const bounds = profileBoundsMm(profile);
  let view = fitView(bounds, size, inset);
  if (!(size?.w > 0 && size?.h > 0)) return view;
  const margin = 10;
  for (let pass = 0; pass < 2; pass++) {
    const s = view.scale;
    const e = layoutExtents(layoutProfile(profile, s));
    const g = { minX: bounds.minX * s, maxX: bounds.maxX * s, minY: -bounds.maxY * s, maxY: -bounds.minY * s };
    view = fitView(bounds, size, {
      top: (inset.top || 0) + Math.max(0, g.minY - e.minY) + margin,
      right: (inset.right || 0) + Math.max(0, e.maxX - g.maxX) + margin,
      bottom: (inset.bottom || 0) + Math.max(0, e.maxY - g.maxY) + margin,
      left: (inset.left || 0) + Math.max(0, g.minX - e.minX) + margin,
    }, 0);
  }
  return view;
}

/** Zoom by `factor` keeping screen point `c` fixed. */
export function zoomAt(view, factor, c) {
  const s = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  const k = s / view.scale;
  return { scale: s, tx: c.x - (c.x - view.tx) * k, ty: c.y - (c.y - view.ty) * k };
}
export const panBy = (view, dx, dy) => ({ ...view, tx: view.tx + dx, ty: view.ty + dy });
export const screenToMm = (view, p) => ({ x: (p.x - view.tx) / view.scale, y: (view.ty - p.y) / view.scale });

/** Visible grid lines (screen px) — finest step ≥ 12 px drawn from SKETCH_GRID_MM upward. */
export function gridLines(view, size) {
  const steps = [SKETCH_GRID_MM, 50, 100, 500, 1000, 5000];
  const step = steps.find((st) => st * view.scale >= 12) || steps[steps.length - 1];
  const major = step * 5;
  const x0 = -view.tx / view.scale, x1 = (size.w - view.tx) / view.scale;
  const y0 = (view.ty - size.h) / view.scale, y1 = view.ty / view.scale;
  const v = [], h = [];
  for (let x = Math.ceil(x0 / step) * step; x <= x1 && v.length < 400; x += step) v.push({ at: view.tx + x * view.scale, major: Math.abs(x % major) < 1e-6 });
  for (let y = Math.ceil(y0 / step) * step; y <= y1 && h.length < 400; y += step) h.push({ at: view.ty - y * view.scale, major: Math.abs(y % major) < 1e-6 });
  return { v, h, stepMm: step };
}

// ── sketch ────────────────────────────────────────────────────────────────────

export const snapToGrid = (p, grid = SKETCH_GRID_MM) => ({ x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid });

/**
 * Tapped points (mm, y up) → legs. Each leg runs from the previous SNAPPED vertex to the next
 * tap (so rounding never accumulates): length to the nearest 5 mm, heading to the nearest 15°.
 * Taps that give a zero-length leg or fold straight back (180° turn) are skipped.
 */
export function sketchLegs(points, maxLegs = MAX_PROFILE_SEGMENTS) {
  const lengths = [], headings = [];
  if (!points?.length) return { lengths, headings, turns: [], vertices: [] };
  let cur = { x: points[0].x, y: points[0].y };
  const vertices = [cur];
  for (let i = 1; i < points.length && lengths.length < maxLegs; i++) {
    const dx = points[i].x - cur.x, dy = points[i].y - cur.y;
    const len = Math.round(Math.hypot(dx, dy) / SKETCH_LENGTH_STEP_MM) * SKETCH_LENGTH_STEP_MM;
    if (len <= 0) continue;
    const hd = normDeg(Math.round(deg(Math.atan2(dy, dx)) / SKETCH_ANGLE_STEP_DEG) * SKETCH_ANGLE_STEP_DEG);
    if (headings.length && Math.abs(norm180(hd - headings[headings.length - 1])) >= 180) continue;
    lengths.push(len);
    headings.push(hd);
    const round6 = (v) => Math.round(v * 1e6) / 1e6;
    cur = { x: round6(cur.x + len * Math.cos(rad(hd))), y: round6(cur.y + len * Math.sin(rad(hd))) };
    vertices.push(cur);
  }
  const turns = headings.slice(1).map((h, i) => norm180(h - headings[i]));
  return { lengths, headings, turns, vertices };
}

/** Sketch → canonical profile (no end treatments; coated face carried over). */
export function sketchToProfile(points, { coatedFace = "left" } = {}) {
  const r = sketchLegs(points);
  if (!r.lengths.length) throw new TakeoffValidationError("Tap at least two points to draw a leg.");
  return normaliseProfile({
    initialDirectionDeg: r.headings[0],
    segments: r.lengths.map((lengthMm) => ({ lengthMm })),
    bends: r.turns.map((turnDeg) => ({ turnDeg })),
    start: { type: "none" },
    end: { type: "none" },
    coatedFace,
  });
}
