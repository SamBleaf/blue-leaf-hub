// =============================================================================
// shared/takeoff/engine/floor/geometry.js — Floor frame geometry (Sam, 18 Nov 2026; plan docs/takeoff/FLOOR_FRAMING_PLAN.md, Phase 1).
//
// PURE and deterministic: plain millimetre polygons in, a layout out. No calibration, no DOM, no I/O. dispatch.js converts the
// traced plan points to millimetres (plan frame: x along the scale's horizontal, y up, origin = the floor outline's first corner),
// calls layoutFloor, and turns the result into demands. Everything returned is in that same plan frame, so the plan overlay and the
// tests read it directly.
//
// Rules (Sam's answers 18 Nov 2026 win over the plan where they differ):
//   Trusses    span the short way by default ("Span the short way" / "Span the long way"), at the chosen centres (450 default).
//              First truss on the first edge, then every `centres`, and ALWAYS a truss on the far edge:
//              count = ceil((width - 5 mm) / centres) + 1 (5 mm tracing tolerance; a short last bay is fine; flooring is cut off flush at the overhang).
//              Each line is clipped to the outline and to the voids; a truss a void interrupts becomes two shorter trusses that end
//              at the header trimmers (flagged for the truss supplier). Lengths are rounded UP to the next 10 mm.
//   Beams      ring / perimeter beams are marked per edge, each with a size the user picks (no default): an edge marked with no size
//              is a blocking problem, never a guess.
//   Strongback 120 x 35 along every truss end with no beam (one run per edge); mid-span rows from the span rule:
//              up to 3.5 m none, over 3.5 up to 6.5 m one row at midspan, over 6.5 m three rows (quarter points); 0 to 3 rows
//              can be set per job (rules.strongbackRows).
//   Trimmers   a stair void gets 2 header trimmers (across the trusses, snapped outward to the truss lines either side) and 2 side
//              trimmers (the void's length plus a bearing allowance each end). A plain opening gets none.
// =============================================================================

export const FLOOR_LIMITS = Object.freeze({ centresMinMm: 200, centresMaxMm: 1200, outlinePoints: 200 });
/** Mid-span strongback span rule (the supplier's guide; settings, not hard-coded in the maths). */
export const STRONGBACK_SPAN_RULE = Object.freeze({ noneMaxMm: 3500, oneMaxMm: 6500 });
/** A stair trimmer bears on its headers by this much each end (the plan's default allowance). */
export const TRIMMER_BEARING_MM = 45;
/** Truss lengths are ordered in whole 10 mm steps (rounded up; within 0.5 mm of a step counts as on it). */
export const TRUSS_LENGTH_STEP_MM = 10;
/** A mid-span row's points join one run while they sit within this of each other along the span. */
export const ROW_TOLERANCE_MM = 50;
/** Truss pieces shorter than this are not trusses (a header trimmer carries the floor there). */
export const MIN_TRUSS_MM = 300;
/** An edge within this many degrees of the truss direction is a side edge (parallel to the trusses); anything else is an end edge. */
export const SIDE_EDGE_DEG = 3;
/** The beam sizes offered as chips (LVL, set per beam by the user; the engineer decides). */
export const BEAM_SIZE_CHIPS = Object.freeze(["400x63", "445x63"]);
/** The stair trimmer sizes offered as chips (default 445 x 63). */
export const TRIMMER_SIZE_CHIPS = Object.freeze(["445x63", "400x63"]);
export const TRIMMER_DEFAULT_SIZE = "445x63";
/** A beam marked with no size yet. */
export const BEAM_UNSIZED = "unsized";
/** Sam, 18 Nov 2026: a traced width within this of a centres multiple does not add a truss (tracing noise: 5,405 mm at 450 is 12 bays, not 13). */
export const TRUSS_COUNT_TOLERANCE_MM = 5;
/** Sam, 18 Nov 2026: edges are labelled A, B, C ... (Z then AA, AB ...) on the plan, the sheet and the order notes, never by outline edge number. */
export function edgeLabel(n) {
  let i = Math.max(1, Math.floor(n)), s = "";
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

import { pointToMm } from "../../calibration.js";

const TOL = 1e-6;
const hypot = Math.hypot;
const round3 = (n) => Math.round(n * 1000) / 1000;

/** "445x63", "445 × 63" -> "445x63" (depth x thickness); null when it isn't a size. */
export function parseSize(text) {
  const m = /^\s*(\d{2,4}(?:\.\d+)?)\s*[x×X*]\s*(\d{2,3}(?:\.\d+)?)\s*$/.exec(String(text ?? ""));
  return m ? `${Number(m[1])}x${Number(m[2])}` : null;
}
/** "445x63" -> { depthMm: 445, widthMm: 63 }. */
export function sizeParts(size) {
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(String(size ?? ""));
  return m ? { depthMm: Number(m[1]), widthMm: Number(m[2]) } : null;
}

export function ringAreaMm2(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; }
  return Math.abs(a) / 2;
}

function cross(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
function segmentsCross(p1, p2, p3, p4) {
  const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
  return ((d1 > TOL && d2 < -TOL) || (d1 < -TOL && d2 > TOL)) && ((d3 > TOL && d4 < -TOL) || (d3 < -TOL && d4 > TOL));
}
/** Does the ring cross itself (a figure of eight)? Touching corners are not counted; crossing sides are. */
export function ringSelfIntersects(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    if (segmentsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
  }
  return false;
}
/** Is point p inside (or on the edge of) the ring? (even-odd) */
export function pointInRing(pts, p) {
  let inside = false;
  const n = pts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = pts[i], b = pts[j];
    // on an edge counts as inside
    if (Math.abs(cross(a, b, p)) < 1e-3 && p.x >= Math.min(a.x, b.x) - 1e-3 && p.x <= Math.max(a.x, b.x) + 1e-3 && p.y >= Math.min(a.y, b.y) - 1e-3 && p.y <= Math.max(a.y, b.y) + 1e-3) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The sorted v-intervals a ring covers along the line `u` (a scan line across the span axis); half-open at the ring's own u extremes. */
export function spansAt(ring, u) {
  const vs = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (Math.abs(a.u - b.u) < TOL) continue;
    const lo = Math.min(a.u, b.u), hi = Math.max(a.u, b.u);
    if (u >= lo && u < hi) vs.push(a.v + ((u - a.u) * (b.v - a.v)) / (b.u - a.u));
  }
  vs.sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i + 1 < vs.length; i += 2) if (vs[i + 1] - vs[i] > TOL) out.push([vs[i], vs[i + 1]]);
  return out;
}
export function mergeIntervals(list) {
  const s = [...list].sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const iv of s) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1] + TOL) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}
/** Spans of a ring along a truss line: the union of just either side of it, so a line ON an edge still gets the floor beside it. */
function spansOnLine(ring, u) {
  const e = 1e-3;
  return mergeIntervals([...spansAt(ring, u - e), ...spansAt(ring, u + e)]);
}

/**
 * The truss frame: v runs ALONG the trusses (their span), u ACROSS them (the spacing axis).
 * `span` is "short" (default) or "long"; `angleDeg` (plan angle of the trusses) overrides both when given.
 */
export function trussFrame(outline, { span = "short", angleDeg = null } = {}) {
  let alpha;
  if (Number.isFinite(angleDeg)) alpha = (angleDeg * Math.PI) / 180;
  else {
    // reference axis = the longest outline edge; the extents along and across it say which way is short
    let best = -1, phi = 0;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      const L = hypot(b.x - a.x, b.y - a.y);
      if (L > best + 1e-9) { best = L; phi = Math.atan2(b.y - a.y, b.x - a.x); }
    }
    const dir = { x: Math.cos(phi), y: Math.sin(phi) }, perp = { x: -dir.y, y: dir.x };
    const ext = (ax) => { const xs = outline.map((p) => p.x * ax.x + p.y * ax.y); return Math.max(...xs) - Math.min(...xs); };
    const along = ext(dir), across = ext(perp);
    const alongIsShort = along <= across + 1e-9;
    alpha = (span === "long" ? !alongIsShort : alongIsShort) ? phi : phi + Math.PI / 2;
  }
  let dir = { x: Math.cos(alpha), y: Math.sin(alpha) }, perp = { x: -Math.sin(alpha), y: Math.cos(alpha) };
  // a fixed reading direction, so the "first" truss is always on the left (or bottom) edge whichever way the outline was drawn
  if (perp.x < -1e-9 || (Math.abs(perp.x) <= 1e-9 && perp.y < 0)) perp = { x: -perp.x, y: -perp.y };
  if (dir.y < -1e-9 || (Math.abs(dir.y) <= 1e-9 && dir.x < 0)) dir = { x: -dir.x, y: -dir.y };
  alpha = Math.atan2(dir.y, dir.x);
  return {
    alpha, dir, perp,
    toLocal: (p) => ({ u: p.x * perp.x + p.y * perp.y, v: p.x * dir.x + p.y * dir.y }),
    fromLocal: (q) => ({ x: q.u * perp.x + q.v * dir.x, y: q.u * perp.y + q.v * dir.y }),
  };
}

/** The truss frame for an outline and the item's rules (shared by the frame layout and the sheet layout, so both read the same axes). */
export const floorFrame = (outline, rules = {}) => trussFrame(outline, { span: rules.span === "long" ? "long" : "short", angleDeg: rules.trussAngleDeg == null ? null : Number(rules.trussAngleDeg) });

const ceil10 = (L) => Math.ceil((L - 0.5) / TRUSS_LENGTH_STEP_MM) * TRUSS_LENGTH_STEP_MM;

/**
 * Lay out a floor frame.
 * @param {{ outline: Array<{x:number,y:number}>, voids?: Array<{id:string,name?:string,stair?:boolean,points:Array<{x:number,y:number}>}>, rules?: object,
 *   stockMaxMm?: number|null }} input  millimetres, plan frame
 * @returns {object} { problems, notes, outline, edges, lines, trusses, trussesByLength, voids, beams, endStrongbacks, midRows, trimmers, totals }
 */
export function layoutFloor(input) {
  const rules = input.rules || {};
  const problems = [];
  const fail = (code, message) => problems.push({ code, message, blocking: true });
  const note = (code, message) => problems.push({ code, message, blocking: false });
  const outline = input.outline || [];
  const empty = (extra = {}) => ({ problems, edges: [], lines: [], trusses: [], trussesByLength: [], voids: [], wets: [], beams: [], endStrongbacks: [], midRows: [], trimmers: [], totals: null, ...extra });
  if (outline.length < 3) { fail("floor_outline_missing", "Draw the floor outline first."); return empty(); }
  if (outline.length > FLOOR_LIMITS.outlinePoints) { fail("floor_outline_invalid", `A floor outline can have ${FLOOR_LIMITS.outlinePoints} corners at most.`); return empty(); }
  if (ringSelfIntersects(outline)) { fail("floor_outline_invalid", "The floor outline crosses itself. Redraw it, tapping the corners in order."); return empty(); }
  if (ringAreaMm2(outline) < 1e4) { fail("floor_outline_invalid", "That floor outline has no area. Redraw it round the floor."); return empty(); }
  const centres = Number(rules.centresMm ?? 450);
  if (!(centres >= FLOOR_LIMITS.centresMinMm && centres <= FLOOR_LIMITS.centresMaxMm)) {
    fail("floor_centres_invalid", `Truss centres must be between ${FLOOR_LIMITS.centresMinMm} and ${FLOOR_LIMITS.centresMaxMm} mm.`);
    return empty();
  }

  const F = floorFrame(outline, rules);
  const loc = (p) => ({ ...F.toLocal(p), x: p.x, y: p.y });
  const O = outline.map(loc);
  const minU = Math.min(...O.map((p) => p.u)), maxU = Math.max(...O.map((p) => p.u));
  const minV = Math.min(...O.map((p) => p.v)), maxV = Math.max(...O.map((p) => p.v));
  const widthU = maxU - minU;

  /** Is this shape wholly inside the floor outline (every corner and edge midpoint inside, no edge crossing the outline)? */
  const insideOutline = (pts) => pts.every((p, k) => pointInRing(outline, p) && pointInRing(outline, { x: (p.x + pts[(k + 1) % pts.length].x) / 2, y: (p.y + pts[(k + 1) % pts.length].y) / 2 }))
    && !pts.some((p, k) => outline.some((o, m) => segmentsCross(p, pts[(k + 1) % pts.length], o, outline[(m + 1) % outline.length])));

  // ── voids ──
  const voids = [];
  const vIn = Array.isArray(input.voids) ? input.voids : [];
  vIn.forEach((v, i) => {
    const name = v.name || `Opening ${i + 1}`;
    const pts = v.points || [];
    if (pts.length >= 3 && ringSelfIntersects(pts)) { fail("floor_void_invalid", `${name}: the outline crosses itself. Redraw it.`); return; }
    if (pts.length < 3 || ringAreaMm2(pts) < 1e3) { fail("floor_void_invalid", `${name}: that opening has no area. Redraw it.`); return; }
    if (!insideOutline(pts)) { fail("floor_void_outside", `${name} is outside the floor outline. Move it inside, or redraw the outline.`); return; }
    const ring = pts.map(loc);
    voids.push({ id: v.id, name, stair: v.stair !== false, ring, points: pts, u0: Math.min(...ring.map((p) => p.u)), u1: Math.max(...ring.map((p) => p.u)),
      v0: Math.min(...ring.map((p) => p.v)), v1: Math.max(...ring.map((p) => p.v)), areaMm2: ringAreaMm2(pts) });
  });
  for (let i = 0; i < voids.length; i++) for (let j = i + 1; j < voids.length; j++) {
    const a = voids[i], b = voids[j];
    if (a.u0 < b.u1 - TOL && b.u0 < a.u1 - TOL && a.v0 < b.v1 - TOL && b.v0 < a.v1 - TOL) fail("floor_void_overlap", `${a.name} and ${b.name} overlap. Move one of them.`);
  }

  // ── wet areas (Sam, 18 Nov 2026, P2): drawn like stair voids, must lie inside the outline (the void check), never over a void or each other ──
  const wets = [];
  (Array.isArray(input.wets) ? input.wets : []).forEach((w, i) => {
    const name = w.name || `Wet area ${i + 1}`;
    const pts = w.points || [];
    if (pts.length >= 3 && ringSelfIntersects(pts)) { fail("floor_wet_invalid", `${name}: the outline crosses itself. Redraw it.`); return; }
    if (pts.length < 3 || ringAreaMm2(pts) < 1e3) { fail("floor_wet_invalid", `${name}: that wet area has no area. Redraw it.`); return; }
    if (!insideOutline(pts)) { fail("floor_wet_outside", `${name} is outside the floor outline. Move it inside, or redraw the outline.`); return; }
    const ring = pts.map(loc);
    wets.push({ id: w.id, name, ring, points: pts, u0: Math.min(...ring.map((p) => p.u)), u1: Math.max(...ring.map((p) => p.u)),
      v0: Math.min(...ring.map((p) => p.v)), v1: Math.max(...ring.map((p) => p.v)), areaMm2: ringAreaMm2(pts) });
  });
  const boxHit = (a, b) => a.u0 < b.u1 - TOL && b.u0 < a.u1 - TOL && a.v0 < b.v1 - TOL && b.v0 < a.v1 - TOL;
  for (let i = 0; i < wets.length; i++) {
    for (let j = i + 1; j < wets.length; j++) if (boxHit(wets[i], wets[j])) fail("floor_wet_overlap", `${wets[i].name} and ${wets[j].name} overlap. Move one of them.`);
    for (const v of voids) if (boxHit(wets[i], v)) fail("floor_wet_overlap", `${wets[i].name} overlaps ${v.name}. Move one of them.`);
  }

  // ── truss lines ──
  const count = Math.ceil((widthU - TRUSS_COUNT_TOLERANCE_MM) / centres - 1e-9) + 1;
  // the grid, plus a truss on every OUTLINE edge that runs along the trusses (a step in an L-shaped floor needs its edge truss too)
  const us = [];
  for (let k = 0; k < count; k++) us.push(k === count - 1 ? maxU : minU + k * centres);
  for (let i = 0; i < O.length; i++) {
    const a = O[i], b = O[(i + 1) % O.length];
    const L = hypot(b.x - a.x, b.y - a.y);
    if (L > TOL && Math.abs(b.v - a.v) / L >= Math.cos((SIDE_EDGE_DEG * Math.PI) / 180) && Math.abs(a.u - b.u) < 1) us.push((a.u + b.u) / 2);
  }
  us.sort((x, y) => x - y);
  const lines = [];
  for (const u of us) if (!lines.length || u - lines[lines.length - 1].u > 1) lines.push({ k: lines.length, u });
  const trusses = [];
  for (const ln of lines) {
    const base = spansOnLine(O, ln.u);
    ln.pieces = [];
    const cuts = voids.filter((v) => ln.u >= v.u0 - 0.5 && ln.u <= v.u1 + 0.5).map((v) => {
      const s = Math.min(Math.max(ln.u, v.u0 + 1e-3), v.u1 - 1e-3);
      return { v, spans: mergeIntervals([...spansAt(v.ring, s - 1e-3), ...spansAt(v.ring, s + 1e-3)]) };
    });
    for (const [a, b] of base) {
      let cur = a, startCut = false;
      const hits = cuts.flatMap((c) => c.spans.filter(([c0, c1]) => c0 < b - TOL && c1 > a + TOL).map(([c0, c1]) => ({ c0, c1, id: c.v.id }))).sort((x, y) => x.c0 - y.c0);
      const add = (v0, v1, sC, eC) => {
        const len = v1 - v0;
        if (len < MIN_TRUSS_MM) { if (len > TOL) note("floor_truss_short_piece", `A piece of truss line ${ln.k + 1} only ${Math.round(len)} mm long beside an opening isn't counted as a truss; the trimmer carries the floor there.`); return; }
        ln.pieces.push({ v0, v1, lengthMm: ceil10(len), interrupted: sC || eC });
      };
      for (const h of hits) {
        if (h.c0 > cur + TOL) add(cur, h.c0, startCut, true);
        cur = Math.max(cur, h.c1); startCut = true;
      }
      if (cur < b - TOL) add(cur, b, startCut, false);
    }
    for (const pc of ln.pieces) {
      const a = F.fromLocal({ u: ln.u, v: pc.v0 }), b = F.fromLocal({ u: ln.u, v: pc.v1 });
      trusses.push({ line: ln.k + 1, a, b, lengthMm: pc.lengthMm, interrupted: pc.interrupted });
    }
  }
  const byLen = new Map();
  for (const t of trusses) byLen.set(t.lengthMm, (byLen.get(t.lengthMm) || 0) + 1);
  const trussesByLength = [...byLen.entries()].map(([lengthMm, n]) => ({ lengthMm, count: n })).sort((x, y) => y.lengthMm - x.lengthMm);
  const interruptedCount = trusses.filter((t) => t.interrupted).length;
  if (interruptedCount) note("floor_truss_interrupted", `${interruptedCount} truss${interruptedCount === 1 ? " is" : "es are"} cut short by an opening and end at its trimmers. Truss layout by the supplier.`);

  // ── edges: end edges (trusses end on them) and side edges (the outer truss sits along them) ──
  const beamsIn = rules.beams && typeof rules.beams === "object" ? rules.beams : {};
  const edges = [];
  for (let i = 0; i < O.length; i++) {
    const a = O[i], b = O[(i + 1) % O.length];
    const L = hypot(b.x - a.x, b.y - a.y);
    if (L < TOL) continue;
    const along = Math.abs(b.v - a.v) / L;   // 1 = parallel to the trusses
    const kind = along >= Math.cos((SIDE_EDGE_DEG * Math.PI) / 180) ? "side" : "end";
    edges.push({ id: `e${i}`, n: i + 1, label: "", a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, lengthMm: round3(L), kind });
  }
  // labels: the truss-end edges first (A, B, C ... in outline order), then any side edge, so a label depends only on the shape
  [...edges.filter((e) => e.kind === "end"), ...edges.filter((e) => e.kind !== "end")].forEach((e, i) => { e.label = edgeLabel(i + 1); });
  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const beams = [], endStrongbacks = [];
  for (const e of edges) {
    const raw = beamsIn[e.id];
    if (raw !== undefined && raw !== null && raw !== false && raw !== "") {
      const size = raw === BEAM_UNSIZED ? null : parseSize(raw);
      e.beam = size || BEAM_UNSIZED;
      if (!size) fail("floor_beam_unsized", raw === BEAM_UNSIZED ? `Edge ${e.label} has a beam with no size. Choose its size (400x63, 445x63, or type one).` : `Edge ${e.label}: "${String(raw).slice(0, 20)}" isn't a beam size like 445x63.`);
      else beams.push({ edgeId: e.id, n: e.n, label: e.label, size, lengthMm: e.lengthMm, a: e.a, b: e.b, kind: e.kind });
    } else if (e.kind === "end") endStrongbacks.push({ edgeId: e.id, n: e.n, label: e.label, lengthMm: e.lengthMm, a: e.a, b: e.b });
  }
  for (const id of Object.keys(beamsIn)) if (!edgeById.has(id)) note("floor_beam_stale", "A beam was marked on an edge that no longer exists (the outline was redrawn). Mark the beams again.");

  // ── mid-span strongbacks ──
  const longest = trusses.reduce((m, t) => Math.max(m, t.lengthMm), 0);
  const ruleRows = rules.strongbackRows == null || rules.strongbackRows === "" ? null : Math.round(Number(rules.strongbackRows));
  const autoRows = longest <= STRONGBACK_SPAN_RULE.noneMaxMm ? 0 : longest <= STRONGBACK_SPAN_RULE.oneMaxMm ? 1 : 3;
  if (rules.strongbackRows != null && rules.strongbackRows !== "" && !(Number.isInteger(ruleRows) && ruleRows >= 0 && ruleRows <= 3 && Number(rules.strongbackRows) === ruleRows)) note("floor_strongback_rows_invalid", "Strongback rows must be 0 to 3, so the span rule was used instead.");
  const rows = Number.isInteger(ruleRows) && ruleRows >= 0 && ruleRows <= 3 ? ruleRows : autoRows;
  const rowFractions = rows === 0 ? [] : rows === 1 ? [0.5] : rows === 2 ? [1 / 3, 2 / 3] : [0.25, 0.5, 0.75];
  const ruleOverride = Number.isInteger(ruleRows) && ruleRows >= 0 && ruleRows <= 3;
  const midRows = [];
  for (const f of rowFractions) {
    let open = [];
    const runs = [];
    for (const ln of lines) {
      const pts = ln.pieces.filter((pc) => ruleOverride || pc.v1 - pc.v0 > STRONGBACK_SPAN_RULE.noneMaxMm).map((pc) => ({ line: ln.k, u: ln.u, v: pc.v0 + f * (pc.v1 - pc.v0) }));
      const next = [];
      const used = new Set();
      for (const pt of pts) {
        const run = open.find((r, idx) => !used.has(idx) && r.lastLine === ln.k - 1 && Math.abs(r.lastV - pt.v) <= ROW_TOLERANCE_MM);
        if (run) { used.add(open.indexOf(run)); run.pts.push(pt); run.lastLine = ln.k; run.lastV = pt.v; next.push(run); } else { const r = { pts: [pt], lastLine: ln.k, lastV: pt.v }; runs.push(r); next.push(r); }
      }
      open = next;
    }
    const rr = runs.filter((r) => r.pts.length >= 2).map((r) => {
      let len = 0;
      for (let i = 1; i < r.pts.length; i++) len += hypot(r.pts[i].u - r.pts[i - 1].u, r.pts[i].v - r.pts[i - 1].v);
      return { fraction: f, lengthMm: round3(len), points: r.pts.map((p) => F.fromLocal({ u: p.u, v: p.v })) };
    });
    midRows.push({ fraction: f, runs: rr });
  }

  // ── trimmers (stair voids) ──
  const trimmers = [];
  const trimSizes = rules.trimmerSizes && typeof rules.trimmerSizes === "object" ? rules.trimmerSizes : {};
  for (const v of voids) {
    if (!v.stair) continue;
    const size = parseSize(trimSizes[v.id]) || TRIMMER_DEFAULT_SIZE;
    let uA = minU, uB = maxU;
    for (const ln of lines) { if (ln.u <= v.u0 + 0.5) uA = ln.u; }
    for (const ln of [...lines].reverse()) { if (ln.u >= v.u1 - 0.5) uB = ln.u; }
    const headerLen = uB - uA;
    const sideLen = v.v1 - v.v0 + 2 * TRIMMER_BEARING_MM;
    for (const [vv, tag] of [[v.v0, "head"], [v.v1, "foot"]]) {
      trimmers.push({ voidId: v.id, voidName: v.name, kind: "header", at: tag, size, lengthMm: round3(headerLen), a: F.fromLocal({ u: uA, v: vv }), b: F.fromLocal({ u: uB, v: vv }) });
    }
    for (const [uu, tag] of [[v.u0, "left"], [v.u1, "right"]]) {
      trimmers.push({ voidId: v.id, voidName: v.name, kind: "side", at: tag, size, lengthMm: round3(sideLen), a: F.fromLocal({ u: uu, v: v.v0 - TRIMMER_BEARING_MM }), b: F.fromLocal({ u: uu, v: v.v1 + TRIMMER_BEARING_MM }) });
    }
  }
  for (const v of voids) {
    if (!v.stair && trusses.some((t) => t.interrupted)) note("floor_opening_no_trimmers", `${v.name} has no trimmers, so the trusses cut by it end unsupported. Make it a stair void, or add trimmers by hand.`);
  }

  const outlineArea = ringAreaMm2(outline);
  const voidArea = voids.reduce((a, v) => a + v.areaMm2, 0);
  const wetArea = wets.reduce((a, w) => a + w.areaMm2, 0);
  const sumBy = (list, key) => { const m = new Map(); for (const x of list) m.set(x[key], (m.get(x[key]) || 0) + x.lengthMm); return [...m.entries()].map(([k, mm]) => ({ size: k, lm: round3(mm / 1000) })).sort((a, b) => (a.size < b.size ? -1 : 1)); };
  const midLm = round3(midRows.reduce((a, r) => a + r.runs.reduce((s, x) => s + x.lengthMm, 0), 0) / 1000);
  const endLm = round3(endStrongbacks.reduce((a, e) => a + e.lengthMm, 0) / 1000);
  const totals = {
    trussCount: trusses.length, trussLines: lines.length, centresMm: centres, longestSpanMm: longest,
    floorAreaM2: round3((outlineArea - voidArea) / 1e6),
    mainAreaM2: round3((outlineArea - voidArea - wetArea) / 1e6), wetM2: round3(wetArea / 1e6), outlineAreaM2: round3(outlineArea / 1e6), openingsM2: round3(voidArea / 1e6),
    endStrongbackLm: endLm, midStrongbackLm: midLm, strongbackLm: round3(endLm + midLm), strongbackRows: rows, strongbackRowsAuto: autoRows,
    beamLm: round3(beams.reduce((a, b) => a + b.lengthMm, 0) / 1000), beamsBySize: sumBy(beams, "size"),
    trimmerLm: round3(trimmers.reduce((a, t) => a + t.lengthMm, 0) / 1000), trimmersBySize: sumBy(trimmers, "size"),
  };
  return {
    problems, outline: O.map((p) => ({ x: p.x, y: p.y })), frame: { alphaDeg: round3((F.alpha * 180) / Math.PI), minU, maxU, minV, maxV, widthMm: round3(widthU), spanMm: round3(maxV - minV) },
    edges, lines: lines.map((l) => ({ k: l.k + 1, uMm: round3(l.u - minU), pieces: l.pieces.length })), trusses, trussesByLength,
    voids: voids.map((v) => ({ id: v.id, name: v.name, stair: v.stair, points: v.points, areaM2: round3(v.areaMm2 / 1e6) })),
    wets: wets.map((w) => ({ id: w.id, name: w.name, points: w.points, areaM2: round3(w.areaMm2 / 1e6) })),
    beams, endStrongbacks, midRows, trimmers, totals,
  };
}

/** A PDF point's inverse: plan-frame mm (x, y up from `origin`) back to a PDF point, for drawing the layout on the plan. `pointToMm` is the forward map. */
export function mmToPoint(cal, origin, q) {
  const e0 = pointToMm(cal, origin, { x: origin.x + 1, y: origin.y });
  const e1 = pointToMm(cal, origin, { x: origin.x, y: origin.y + 1 });
  const det = e0.x * e1.y - e1.x * e0.y;
  if (!det) return { x: origin.x, y: origin.y };
  return { x: origin.x + (q.x * e1.y - e1.x * q.y) / det, y: origin.y + (e0.x * q.y - q.x * e0.y) / det };
}
