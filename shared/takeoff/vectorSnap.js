// =============================================================================
// shared/takeoff/vectorSnap.js — snap to the architect's own linework (pure, no DOM, no pdf.js import).
//
// extractSegments() reads a pdf.js operator list (constructPath ops) into straight segments in PDF USER SPACE (the
// same y-up space measurements are stored in), applying the CTM. buildSnapIndex() merges collinear pieces, pairs
// parallel segments a wall-thickness apart into wall faces + centrelines, and answers snap / match queries.
// The index lives in memory per page only — never stored. All distances here are PDF units; callers convert to mm
// with the calibration scale (mm per unit).
// =============================================================================

const PATH = { moveTo: 0, lineTo: 1, curveTo: 2, close: 4 };
// Fallback pdf.js 5.x OPS numbers (the caller passes the live OPS so a bump never silently breaks this).
export const DEFAULT_OPS = { save: 10, restore: 11, transform: 12, constructPath: 91, stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27, endPath: 28, setStrokeRGBColor: 58, setStrokeGray: 56, setLineWidth: 2 };

/** Luminance 0–255 of a pdf.js colour arg ('#rrggbb' string or [r,g,b] bytes); unknown = dark (kept). */
function lumOf(a) {
  const v = a?.length === 1 ? a[0] : a;
  if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) {
    return 0.299 * parseInt(v.slice(1, 3), 16) + 0.587 * parseInt(v.slice(3, 5), 16) + 0.114 * parseInt(v.slice(5, 7), 16);
  }
  if (v && typeof v !== "string" && v.length >= 3) return 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2];
  return 0;
}

const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];

/**
 * @param {{fnArray:ArrayLike<number>, argsArray:any[]}} ol  pdf.js operator list
 * @param {object} OPS  pdf.js OPS
 * @param {{minLen?:number}} [opt]  minLen in user units (drops hatch / curve flattening ticks)
 * @returns {Float32Array} flat [x1,y1,x2,y2,lineWidth] per segment
 */
export function extractSegments(ol, OPS = DEFAULT_OPS, { minLen = 1.5, maxLum = 200 } = {}) {
  const out = [];
  const stroke = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];  // [ctm, strokeLum]
  let lw = 1, lum = 0;
  const { fnArray, argsArray } = ol;
  for (let i = 0; i < fnArray.length; i++) {
    const f = fnArray[i];
    if (f === OPS.save) stack.push([ctm, lum]);
    else if (f === OPS.restore) { if (stack.length) [ctm, lum] = stack.pop(); }
    else if (f === OPS.setStrokeRGBColor) lum = lumOf(argsArray[i]);
    else if (f === OPS.setStrokeGray) lum = lumOf(argsArray[i]);
    else if (f === OPS.transform) ctm = mul(ctm, argsArray[i]);
    else if (f === OPS.setLineWidth) lw = argsArray[i][0];
    else if (f === OPS.constructPath) {
      const a = argsArray[i];
      const paint = a[0];
      if (paint === OPS.endPath) continue;
      const isStroke = stroke.has(paint);
      if (isStroke && lum > maxLum) continue; // paper-coloured / very pale texture strokes are not linework
      const isFill = paint === OPS.fill || paint === OPS.eoFill || paint === OPS.fillStroke || paint === OPS.eoFillStroke || paint === OPS.closeFillStroke;
      if (!isStroke && !isFill) continue;
      const d = a[1][0];
      const w = lw * Math.hypot(ctm[0], ctm[1]);
      let cur = null, start = null, j = 0;
      const tx = (x, y) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
      const seg = (p, q) => { if (Math.hypot(q[0] - p[0], q[1] - p[1]) >= minLen) out.push(p[0], p[1], q[0], q[1], isStroke ? w : 0); };
      while (j < d.length) {
        const c = d[j++];
        if (c === PATH.moveTo) { cur = start = tx(d[j], d[j + 1]); j += 2; }
        else if (c === PATH.lineTo) { const p = tx(d[j], d[j + 1]); j += 2; if (cur) seg(cur, p); cur = p; }
        else if (c === PATH.curveTo) { cur = tx(d[j + 4], d[j + 5]); j += 6; }
        else if (c === PATH.close) { if (cur && start) seg(cur, start); cur = start; }
        else break;
      }
    }
  }
  return Float32Array.from(out);
}

const ANG_STEP = Math.PI / 720; // 0.25 degree buckets

/** Merge collinear / overlapping pieces into long lines: [{ax,ay,bx,by,len,w}] with a→b along the line direction. */
export function mergeCollinear(segs, { perpTol = 0.25, gapTol = 0.6, minLen = 4 } = {}) {
  const items = [];
  for (let i = 0; i < segs.length; i += 5) {
    let dx = segs[i + 2] - segs[i], dy = segs[i + 3] - segs[i + 1];
    let ang = Math.atan2(dy, dx);
    if (ang < 0) ang += Math.PI; if (ang >= Math.PI - 1e-9) ang = 0;
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const t1 = segs[i] * ux + segs[i + 1] * uy, t2 = segs[i + 2] * ux + segs[i + 3] * uy;
    const n = -segs[i] * uy + segs[i + 1] * ux;
    items.push({ ang, n, t0: Math.min(t1, t2), t1: Math.max(t1, t2), w: segs[i + 4] });
  }
  // bucket by angle then sort by perpendicular offset
  const buckets = new Map();
  for (const it of items) {
    const k = Math.round(it.ang / ANG_STEP) % 720;
    (buckets.get(k) || buckets.set(k, []).get(k)).push(it);
  }
  const lines = [];
  for (const arr of buckets.values()) {
    arr.sort((a, b) => a.n - b.n);
    let group = [];
    const flush = () => {
      if (!group.length) return;
      group.sort((a, b) => a.t0 - b.t0);
      let cur = null;
      const emit = () => { if (cur && cur.t1 - cur.t0 >= minLen) lines.push(cur); };
      for (const g of group) {
        if (cur && g.t0 <= cur.t1 + gapTol) { cur.t1 = Math.max(cur.t1, g.t1); cur.w = Math.max(cur.w, g.w); cur.nSum += g.n; cur.cnt++; }
        else { emit(); cur = { ang: g.ang, t0: g.t0, t1: g.t1, w: g.w, nSum: g.n, cnt: 1 }; }
      }
      emit();
      group = [];
    };
    let base = -Infinity;
    for (const it of arr) {
      if (it.n - base > perpTol) { flush(); base = it.n; }
      group.push(it);
    }
    flush();
  }
  return lines.map((l) => {
    const ux = Math.cos(l.ang), uy = Math.sin(l.ang), n = l.nSum / l.cnt;
    const px = -uy * n, py = ux * n; // point on the line closest to origin
    return { ax: px + ux * l.t0, ay: py + uy * l.t0, bx: px + ux * l.t1, by: py + uy * l.t1, len: l.t1 - l.t0, w: l.w, ang: l.ang, n, t0: l.t0, t1: l.t1 };
  });
}

/**
 * Drop lines that sit in a dense family of parallel neighbours (deck boards, paving, hatch). A wall face has a few
 * siblings (other face, cavity, dimension ticks); a hatch field has dozens within a wall's thickness band.
 */
export function dropHatch(lines, mmPerUnit, { bandMm = 400, maxSiblings = 6, shortMm = 1500 } = {}) {
  const short = shortMm / mmPerUnit;
  const band = bandMm / mmPerUnit;
  const byAng = new Map();
  for (const l of lines) {
    const k = Math.round(l.ang / ANG_STEP) % 720;
    (byAng.get(k) || byAng.set(k, []).get(k)).push(l);
  }
  const drop = new Set();
  for (const [k, arr0] of byAng) {
    const arr = [...arr0, ...(byAng.get((k + 1) % 720) || [])].sort((a, b) => a.n - b.n);
    for (const A of arr0) {
      if (A.len > short) continue; // only short pieces can be hatch; long runs are real edges even with siblings
      let lo = 0, hi = arr.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].n < A.n - band) lo = m + 1; else hi = m; }
      let cnt = 0;
      for (let i = lo; i < arr.length && arr[i].n <= A.n + band; i++) {
        const B = arr[i];
        if (B === A) continue;
        const ov = Math.min(A.t1, B.t1) - Math.max(A.t0, B.t0);
        if (ov > 0.5 * Math.min(A.len, B.len)) cnt++;
      }
      if (cnt > maxSiblings) drop.add(A);
    }
  }
  return lines.filter((l) => !drop.has(l));
}

/**
 * Pair parallel lines a wall-thickness apart into wall faces + centrelines.
 * @param {number} mmPerUnit  plan scale (mm per PDF unit)
 */
export function detectWalls(lines, mmPerUnit, { minThickMm = 70, maxThickMm = 340, minLenMm = 600 } = {}) {
  const tMin = minThickMm / mmPerUnit, tMax = maxThickMm / mmPerUnit, minLen = minLenMm / mmPerUnit;
  const byAng = new Map();
  for (const l of lines) {
    const k = Math.round(l.ang / ANG_STEP) % 720;
    (byAng.get(k) || byAng.set(k, []).get(k)).push(l);
  }
  const walls = [];
  for (const [k, arr] of byAng) {
    const cand = [...arr, ...(byAng.get((k + 1) % 720) || [])].sort((a, b) => a.n - b.n);
    for (let i = 0; i < arr.length; i++) {
      const A = arr[i];
      for (const B of cand) {
        if (B === A) continue;
        const d = B.n - A.n;
        if (d < tMin || d > tMax) continue;
        const t0 = Math.max(A.t0, B.t0), t1 = Math.min(A.t1, B.t1);
        if (t1 - t0 < minLen) continue;
        const ux = Math.cos(A.ang), uy = Math.sin(A.ang), nm = A.n + d / 2;
        const px = -uy * nm, py = ux * nm;
        walls.push({ ax: px + ux * t0, ay: py + uy * t0, bx: px + ux * t1, by: py + uy * t1, thickness: d, len: t1 - t0, ang: A.ang, n: nm, t0, t1, faceN: [A.n, B.n] });
      }
    }
  }
  return dedupeWalls(walls);
}

function dedupeWalls(walls) {
  walls.sort((a, b) => b.len - a.len);
  const kept = [];
  for (const w of walls) {
    let dup = false;
    for (const k of kept) {
      if (Math.abs(k.ang - w.ang) > 0.01 || Math.abs(k.n - w.n) > 0.4) continue;
      if (Math.min(k.t1, w.t1) - Math.max(k.t0, w.t0) > 0.6 * w.len) { dup = true; break; }
    }
    if (!dup) kept.push(w);
  }
  return kept;
}

// ── snap index + queries ────────────────────────────────────────────────────────────────────────────────────

const CELL = 80; // PDF units per spatial-grid cell
const wallDir = (w) => ({ x: Math.cos(w.ang), y: Math.sin(w.ang) });

/**
 * Build the per-page snap index from merged lines (see mergeCollinear).
 * @param {object[]} lines     merged lines
 * @param {number} mmPerUnit   plan scale
 */
export function buildSnapIndex(lines, mmPerUnit) {
  const kept = dropHatch(lines, mmPerUnit, { maxSiblings: 8 });
  const walls = detectWalls(kept, mmPerUnit);
  const grid = new Map();
  const key = (cx, cy) => cx * 100003 + cy;
  walls.forEach((w, i) => {
    w.i = i;
    const x0 = Math.floor(Math.min(w.ax, w.bx) / CELL), x1 = Math.floor(Math.max(w.ax, w.bx) / CELL);
    const y0 = Math.floor(Math.min(w.ay, w.by) / CELL), y1 = Math.floor(Math.max(w.ay, w.by) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const k = key(cx, cy); (grid.get(k) || grid.set(k, []).get(k)).push(w); }
  });
  return { walls, mmPerUnit, grid, key };
}

function nearWalls(ix, p, r) {
  const out = new Set();
  const x0 = Math.floor((p.x - r) / CELL), x1 = Math.floor((p.x + r) / CELL), y0 = Math.floor((p.y - r) / CELL), y1 = Math.floor((p.y + r) / CELL);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) for (const w of ix.grid.get(ix.key(cx, cy)) || []) out.add(w);
  return [...out];
}

const distSeg = (p, w) => {
  const dx = w.bx - w.ax, dy = w.by - w.ay, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - w.ax) * dx + (p.y - w.ay) * dy) / l2));
  const q = { x: w.ax + t * dx, y: w.ay + t * dy };
  return { q, d: Math.hypot(p.x - q.x, p.y - q.y) };
};

/** Where two wall centrelines cross (each extended by `ext`), or null. */
function crossing(a, b, ext) {
  const ua = wallDir(a), ub = wallDir(b);
  const den = ua.x * ub.y - ua.y * ub.x;
  if (Math.abs(den) < 0.05) return null; // near-parallel
  const dx = b.ax - a.ax, dy = b.ay - a.ay;
  const ta = (dx * ub.y - dy * ub.x) / den; // along a from a.a
  const tb = (dx * ua.y - dy * ua.x) / den;
  const la = Math.hypot(a.bx - a.ax, a.by - a.ay), lb = Math.hypot(b.bx - b.ax, b.by - b.ay);
  if (ta < -ext || ta > la + ext || tb < -ext || tb > lb + ext) return null;
  return { x: a.ax + ua.x * ta, y: a.ay + ua.y * ta };
}

/**
 * The best snap for a point: a centreline corner (crossing, then end) wins, then the nearest point on a centreline, then on a wall face.
 * @param {number} tolUnits  reach in PDF units (screen tolerance ÷ zoom)
 * @returns {{x:number,y:number,kind:"corner"|"centre"|"face"}|null}
 */
export function snapPoint(ix, p, tolUnits) {
  if (!ix?.walls.length) return null;
  const maxT = ix.walls.reduce((m, w) => Math.max(m, w.thickness), 0);
  const near = nearWalls(ix, p, tolUnits + maxT).filter((w) => distSeg(p, w).d <= tolUnits + w.thickness);
  if (!near.length) return null;
  let best = null;
  const take = (c, kind, rank) => {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d > tolUnits) return;
    if (!best || rank < best.rank || (rank === best.rank && d < best.d)) best = { x: c.x, y: c.y, kind, rank, d };
  };
  for (const w of near) { take({ x: w.ax, y: w.ay }, "corner", 0.5); take({ x: w.bx, y: w.by }, "corner", 0.5); }
  for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) { const c = crossing(near[i], near[j], near[i].thickness / 2 + near[j].thickness / 2); if (c) take(c, "corner", 0); }
  if (!best) for (const w of near) take(distSeg(p, w).q, "centre", 1);
  if (!best) {
    for (const w of near) {
      const u = wallDir(w), nx = -u.y, ny = u.x;
      for (const s of [-1, 1]) {
        const off = (s * w.thickness) / 2;
        const f = { ...w, ax: w.ax + nx * off, ay: w.ay + ny * off, bx: w.bx + nx * off, by: w.by + ny * off };
        take(distSeg(p, f).q, "face", 2);
      }
    }
  }
  return best ? { x: best.x, y: best.y, kind: best.kind } : null;
}

/** Nearest centreline corner (crossing or end) to p within tolUnits, or null — used to land wall ends on corners. */
function nearestCorner(ix, p, tolUnits) {
  const s = snapPoint(ix, p, tolUnits);
  return s && s.kind === "corner" ? s : null;
}

export const ON_PLAN_MM = 20;
export const NEAR_PLAN_MM = 100;

/**
 * Match one traced wall (a→b, PDF space) to the detected walls.
 * @returns {{status:"on"|"near"|"none", offsetsMm:[number,number]|null, target:[{x,y},{x,y}]|null, wall:object|null}}
 */
export function matchTraced(ix, a, b, { nearMm = NEAR_PLAN_MM } = {}) {
  const none = { status: "none", offsetsMm: null, target: null, wall: null };
  if (!ix?.walls.length) return none;
  const mm = ix.mmPerUnit, reach = (nearMm * 1.5) / mm;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(len > 0)) return none;
  const ang = ((Math.atan2(b.y - a.y, b.x - a.x) % Math.PI) + Math.PI) % Math.PI;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const cands = [];
  for (const w of nearWalls(ix, mid, len / 2 + reach)) {
    let dAng = Math.abs(w.ang - ang); dAng = Math.min(dAng, Math.PI - dAng);
    if (dAng > 0.05) continue;
    const wu = wallDir(w);
    const perp = (q) => Math.abs((q.x - w.ax) * -wu.y + (q.y - w.ay) * wu.x);
    const dm = perp(mid);
    if (dm > reach) continue;
    cands.push({ w, dm });
  }
  if (!cands.length) return none;
  cands.sort((p, q) => p.dm - q.dm);
  const best = cands[0].w, bu = wallDir(best);
  // coverage: how much of the traced wall lies along walls on that same line
  const ta = a.x * bu.x + a.y * bu.y, tb = b.x * bu.x + b.y * bu.y;
  const lo = Math.min(ta, tb), hi = Math.max(ta, tb);
  const spans = cands.filter((c) => Math.abs(c.w.n - best.n) <= reach / 1.5).map((c) => [Math.max(lo, c.w.t0), Math.min(hi, c.w.t1)]).filter((s) => s[1] > s[0]).sort((p, q) => p[0] - q[0]);
  let covered = 0, curEnd = -Infinity;
  for (const [s0, s1] of spans) { const from = Math.max(s0, curEnd); if (s1 > from) covered += s1 - from; curEnd = Math.max(curEnd, s1); }
  if (covered < 0.5 * (hi - lo)) return none;
  const onLine = (q) => { const t = (q.x - best.ax) * bu.x + (q.y - best.ay) * bu.y; return { x: best.ax + bu.x * t, y: best.ay + bu.y * t }; };
  const refine = (q) => { const pr = onLine(q); return nearestCorner(ix, pr, reach) || pr; };
  const target = [refine(a), refine(b)];
  const offsetsMm = [Math.hypot(target[0].x - a.x, target[0].y - a.y) * mm, Math.hypot(target[1].x - b.x, target[1].y - b.y) * mm];
  const worst = Math.max(...offsetsMm);
  const status = worst <= ON_PLAN_MM ? "on" : worst <= nearMm ? "near" : "none";
  return { status, offsetsMm, target: status === "none" ? null : target.map((t) => ({ x: t.x, y: t.y })), wall: best };
}
