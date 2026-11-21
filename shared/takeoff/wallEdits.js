// =============================================================================
// shared/takeoff/wallEdits.js — the geometry behind three Walls (HUB 028) edits on the plan (Sam, 21 Nov 2026):
//   1. split a traced wall at a point (double-tap it in Select), so each piece can have its own stud centres;
//   2. wet areas → 450: which walls run along / inside a wet area, and where a wall that is only partly wet is split;
//   3. the records a split makes (pieces, the openings and bracing marks that move to the new piece, the run's tap order).
// Pure: no DB / DOM / network. Plan points are PDF points on one page; every distance is worked out in real mm with the
// wall's own calibration (an affine scale, so a point a fraction along the traced line is that fraction of its length).
// =============================================================================

import { pointToMm, polylineLengthMm } from "./calibration.js";
import { bracingOf, plyWidthOf, setPlyWholeWall } from "./bracing.js";
import { centreZonesOf, hasWetZones, withCentreZones } from "./centreZones.js";

export const WALL_SPLIT_RULE = Object.freeze({
  /** Each piece of a split wall is at least this long (a sliver is never a wall). */
  minPieceMm: 300,
  /** A split point lands on the nearest 10 mm along the wall (unless it snapped to the plan). */
  stepMm: 10,
});

/** Sam, 21 Nov 2026: a wall within 150 mm of a wet area's edge, for 300 mm or more (or lying inside it), is a wet-area wall. */
export const WET_AREA_RULE = Object.freeze({ bandMm: 150, minOverlapMm: 300, sampleMm: 10, centresMm: 450 });

const EPS = 0.5;

// ── along a traced wall ─────────────────────────────────────────────────────────────────────────────────────

/** Where a plan point falls along a two-point wall: { stationMm (clamped to the wall), lengthMm, offMm (square off the line) }. */
export function wallStationAt(points, cal, p) {
  const L = polylineLengthMm(cal, points);
  const b = pointToMm(cal, points[0], points[1]);
  const q = pointToMm(cal, points[0], p);
  if (!(L > 0)) return { stationMm: 0, lengthMm: 0, offMm: Math.hypot(q.x, q.y) };
  const t = (q.x * b.x + q.y * b.y) / (L * L);
  return { stationMm: Math.min(Math.max(t, 0), 1) * L, lengthMm: L, offMm: Math.abs(q.x * b.y - q.y * b.x) / L };
}

/** The plan point `stationMm` along a two-point wall. */
export function pointAtStation(points, cal, stationMm) {
  const L = polylineLengthMm(cal, points);
  const t = L > 0 ? stationMm / L : 0;
  return { x: points[0].x + (points[1].x - points[0].x) * t, y: points[0].y + (points[1].y - points[0].y) * t };
}

/** What sits along a wall and can't be cut by a split: its openings and its bracing marks (a whole-wall ply run is laid out again). */
export function wallObstacles(wallInputs, openings = []) {
  const out = [];
  for (const o of openings) {
    const x = o?.inputs || {};
    if (!(Number(x.widthMm) > 0)) continue;
    out.push({ kind: "opening", id: o.id, name: x.label || "An opening", x0: Number(x.xMm) || 0, x1: (Number(x.xMm) || 0) + Number(x.widthMm) });
  }
  for (const m of bracingOf(wallInputs)) {
    if (m.type === "ply" && m.whole) continue;
    const w = m.type === "ply" ? plyWidthOf(m) : Number(m.spanMm) || 0;
    out.push({ kind: "bracing", id: m.id, name: m.type === "ply" ? "A brace sheet" : "A cross brace", x0: Number(m.xMm) || 0, x1: (Number(m.xMm) || 0) + w });
  }
  return out;
}

/**
 * Can the wall be split at `atMm`? null when it can, else the plain reason ("D1 crosses that point. …").
 * @param {number} atMm  @param {number} lengthMm  @param {Array<{name:string,x0:number,x1:number}>} obstacles
 */
export function splitProblem(atMm, lengthMm, obstacles = [], { minPieceMm = WALL_SPLIT_RULE.minPieceMm } = {}) {
  if (!(lengthMm > 0)) return "This wall has no length yet. Scale the page first.";
  if (atMm < minPieceMm - EPS || lengthMm - atMm < minPieceMm - EPS) return `That's too close to the end of the wall. Each piece needs at least ${minPieceMm} mm.`;
  const hit = obstacles.find((o) => o.x0 < atMm - EPS && o.x1 > atMm + EPS);
  if (hit) return `${hit.name} crosses that point. Split the wall beside ${hit.kind === "opening" ? "it" : "the bracing"}.`;
  return null;
}

/**
 * Split ONE traced wall at one or more stations (mm from its first point). The first piece keeps the wall's id (so its
 * junction switches and links stay); every later piece is a new wall. Every piece keeps every setting; `splitOf` ties the
 * pieces together (the engine frames them as one continuous wall where they meet in line). Openings move to the piece that
 * holds them (offset from that piece's start); bracing marks too; a whole-wall ply run is laid out again on each piece.
 * @param {{ wall:{id:string, points:object[], inputs:object}, openings?:object[], cal:object, stationsMm:number[],
 *   newId:()=>string, names:string[], minPieceMm?:number }} a  names = the names for the new pieces, in order
 * @returns {{ ok:false, error:string } | { ok:true, pieces:Array<{ id:string, points:object[], inputs:object, startMm:number, lengthMm:number }>,
 *   openings:Array<{ before:object, next:object }> }}
 */
export function splitWall({ wall, openings = [], cal, stationsMm, newId, names = [], minPieceMm = WALL_SPLIT_RULE.minPieceMm }) {
  if (!wall || !Array.isArray(wall.points) || wall.points.length !== 2 || wall.inputs?.kind === "polygon") return { ok: false, error: "Only a straight traced wall can be split." };
  const L = polylineLengthMm(cal, wall.points);
  const at = [...new Set((stationsMm || []).map((s) => Math.round(s * 10) / 10))].sort((p, q) => p - q);
  if (!at.length) return { ok: false, error: "Tap where the wall should be split." };
  const obstacles = wallObstacles(wall.inputs, openings);
  for (let i = 0; i < at.length; i++) {
    const err = splitProblem(at[i], L, obstacles, { minPieceMm });
    if (err) return { ok: false, error: err };
    if (i && at[i] - at[i - 1] < minPieceMm - EPS) return { ok: false, error: `Those split points are too close together. Each piece needs at least ${minPieceMm} mm.` };
  }
  const bounds = [0, ...at, L];
  const splitOf = typeof wall.inputs?.splitOf === "string" && wall.inputs.splitOf ? wall.inputs.splitOf : wall.id;
  const base = { ...(wall.inputs || {}) };
  delete base.bracing;
  const marks = bracingOf(wall.inputs);
  const whole = marks.some((m) => m.type === "ply" && m.whole);
  const pieces = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const s = bounds[i], e = bounds[i + 1];
    const id = i === 0 ? wall.id : newId();
    const inputs = { ...base, splitOf, ...(i > 0 ? { name: names[i - 1] || `${base.name || "Wall"} (${i + 1})` } : {}) };
    // bracing marks on this piece, measured from its own start
    const mine = marks.filter((m) => !(m.type === "ply" && m.whole)).filter((m) => m.xMm >= s - EPS && m.xMm < e - EPS).map((m) => ({ ...m, xMm: Math.round(m.xMm - s) }));
    let inp = mine.length ? { ...inputs, bracing: mine } : inputs;
    if (whole) { const r = setPlyWholeWall(inp, e - s, true); if (r.ok) inp = r.inputs; }
    pieces.push({ id, points: [pointAtStation(wall.points, cal, s), pointAtStation(wall.points, cal, e)], inputs: inp, startMm: s, lengthMm: e - s });
  }
  const moved = [];
  for (const o of openings) {
    const x = Number(o.inputs?.xMm) || 0;
    const k = pieces.findIndex((p) => x >= p.startMm - EPS && x < p.startMm + p.lengthMm - EPS);
    if (k <= 0) continue;
    const p = pieces[k];
    moved.push({ before: o, next: { ...o, parentId: p.id, inputs: { ...o.inputs, xMm: Math.round((x - p.startMm) * 1000) / 1000 } } });
  }
  return { ok: true, pieces, openings: moved };
}

/**
 * A run's tap order after a wall of it is split into `count` + 1 pieces: the new pieces come straight after the wall, and every
 * later wall of the run moves up. Returns { seqs: the new pieces' seq, bumped: [{ before, next }] } (nothing when the wall has no run).
 */
export function runSeqAfterSplit(runWalls, wall, count) {
  const seq = Number(wall?.inputs?.seq);
  if (!wall?.inputs?.runId || !Number.isInteger(seq)) return { seqs: [], bumped: [] };
  const bumped = (runWalls || []).filter((w) => w.id !== wall.id && Number(w.inputs?.seq) > seq)
    .map((w) => ({ before: w, next: { ...w, inputs: { ...w.inputs, seq: w.inputs.seq + count } } }));
  return { seqs: Array.from({ length: count }, (_, i) => seq + i + 1), bumped };
}

// ── wet areas ───────────────────────────────────────────────────────────────────────────────────────────────

function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0), 1) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function distToBoundary(p, poly) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distToSegment(p, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

/**
 * Which walls are wet-area walls, all in ONE real-mm frame (one page). A wall is wet where its centreline is inside a wet area or
 * within `bandMm` of its edge; a wet stretch shorter than `minOverlapMm` doesn't count (a wall that only butts the room). The
 * band is taken back off where a wet stretch stops part-way along a wall, so the split lands on the room's edge (or the corner).
 * A dry stretch shorter than a piece is never left (it goes to 450 with the rest), nor is a split put through an opening or a
 * bracing mark (it moves to that obstacle's edge, so the obstacle is on the wet piece).
 * @param {{ walls:Array<{ id:string, a:{x,y}, b:{x,y}, obstacles?:Array<{x0:number,x1:number}> }>, areas:Array<{ id:string, points:Array<{x,y}> }>,
 *   bandMm?:number, minOverlapMm?:number, minPieceMm?:number, sampleMm?:number }} o
 * @returns {Array<{ id:string, lengthMm:number, status:"none"|"whole"|"partial", wetMm:Array<[number,number]>, splitsMm:number[], pieces:Array<{ startMm:number, endMm:number, wet:boolean }> }>}
 */
export function wetAreaWalls({ walls, areas, bandMm = WET_AREA_RULE.bandMm, minOverlapMm = WET_AREA_RULE.minOverlapMm, minPieceMm = WALL_SPLIT_RULE.minPieceMm, sampleMm = WET_AREA_RULE.sampleMm }) {
  const polys = (areas || []).map((a) => a.points).filter((p) => Array.isArray(p) && p.length >= 3);
  return (walls || []).map((w) => {
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const none = { id: w.id, lengthMm: L, status: "none", wetMm: [], splitsMm: [], pieces: [{ startMm: 0, endMm: L, wet: false }] };
    if (!(L > 0) || !polys.length) return none;
    const ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L;
    const wetAt = (s) => { const p = { x: w.a.x + ux * s, y: w.a.y + uy * s }; return polys.some((poly) => pointInPolygon(p, poly) || distToBoundary(p, poly) <= bandMm + 1e-6); };
    const n = Math.max(1, Math.ceil(L / sampleMm));
    let runs = [], start = null, last = null;
    for (let i = 0; i <= n; i++) {
      const s = Math.min(i * sampleMm, L);
      if (wetAt(s)) { if (start === null) start = s; last = s; } else if (start !== null) { runs.push([start, last]); start = null; }
    }
    if (start !== null) runs.push([start, last]);
    // the band comes back off where a wet stretch stops part-way along the wall (never at the wall's own ends)
    runs = runs.map(([s, e]) => [s > EPS ? Math.min(s + bandMm, e) : 0, e < L - EPS ? Math.max(e - bandMm, s) : L]).filter(([s, e]) => e - s >= minOverlapMm - EPS);
    if (!runs.length) return none;
    // short dry stretches go wet: between two wet stretches, and at either end of the wall
    const merged = [];
    for (const r of runs) { const p = merged[merged.length - 1]; if (p && r[0] - p[1] < minPieceMm) p[1] = r[1]; else merged.push([...r]); }
    if (merged[0][0] < minPieceMm) merged[0][0] = 0;
    if (L - merged[merged.length - 1][1] < minPieceMm) merged[merged.length - 1][1] = L;
    // a split never cuts an opening or a bracing mark: it moves to that obstacle's far edge, so the obstacle is on the wet piece
    const obs = w.obstacles || [];
    for (const r of merged) {
      for (const o of obs) {
        if (r[0] > 0 && o.x0 < r[0] - EPS && o.x1 > r[0] + EPS) r[0] = o.x0;
        if (r[1] < L && o.x0 < r[1] - EPS && o.x1 > r[1] + EPS) r[1] = o.x1;
      }
      r[0] = r[0] < minPieceMm ? 0 : Math.round(r[0] / WALL_SPLIT_RULE.stepMm) * WALL_SPLIT_RULE.stepMm;
      r[1] = L - r[1] < minPieceMm ? L : Math.round(r[1] / WALL_SPLIT_RULE.stepMm) * WALL_SPLIT_RULE.stepMm;
    }
    // moving an edge can make two wet stretches meet, or leave a short dry piece between them
    const wet = [];
    for (const r of merged) { const p = wet[wet.length - 1]; if (p && r[0] - p[1] < minPieceMm) p[1] = Math.max(p[1], r[1]); else wet.push([...r]); }
    if (wet.length === 1 && wet[0][0] === 0 && wet[0][1] === L) return { id: w.id, lengthMm: L, status: "whole", wetMm: wet, splitsMm: [], pieces: [{ startMm: 0, endMm: L, wet: true }] };
    const cuts = [...new Set(wet.flat().filter((x) => x > EPS && x < L - EPS))].sort((p, q) => p - q);
    const bounds = [0, ...cuts, L];
    const pieces = bounds.slice(0, -1).map((s, i) => ({ startMm: s, endMm: bounds[i + 1], wet: wet.some(([a, b]) => s >= a - EPS && bounds[i + 1] <= b + EPS) }));
    return { id: w.id, lengthMm: L, status: "partial", wetMm: wet, splitsMm: cuts, pieces };
  });
}

/**
 * What "Set wet-area walls to 450" does to each wall, from wetAreaWalls' answer and each wall's own inputs:
 *   set:     a wet wall following the item → 450 (marked as set by the wet areas)
 *   hand:    a wet wall with centres set by hand to something else → kept, and asked about (never changed silently)
 *   revert:  a wall set to 450 by the wet areas that no longer touches one → back to the item's centres
 *   zone:    Sam, 22 Nov 2026: a wall only partly along a wet area → [{ id, wetMm }]: 450 along the wet stretch only, the wall stays
 *            ONE wall (no split, so an opening such as a cavity slider can still sit anywhere along it)
 *   clearZones: walls whose wet-area sections no longer match a wet area (whole now, or dry) → those sections come off
 * @param {Array<{ id:string, status:string, wetMm?:Array<[number,number]> }>} plan
 * @param {Map<string,{ studCentresMm?:number, studCentresFrom?:string, centreZones?:object[] }>} inputsById
 */
export function wetCentresChanges(plan, inputsById, { centresMm = WET_AREA_RULE.centresMm } = {}) {
  const out = { set: [], hand: [], revert: [], zone: [], clearZones: [], already: [] };
  for (const r of plan) {
    const inp = inputsById.get(r.id) || {};
    const own = Number(inp.studCentresMm) > 0 ? Number(inp.studCentresMm) : null;
    const byWet = inp.studCentresFrom === "wet";
    const wetZ = hasWetZones(inp);
    if (r.status === "whole") {
      if (wetZ) out.clearZones.push(r.id);
      if (own === centresMm) out.already.push(r.id);
      else if (own == null || byWet) out.set.push(r.id);
      else out.hand.push(r.id);
    } else {
      if (byWet) out.revert.push(r.id);
      if (r.status === "partial" && !(own === centresMm && !byWet)) out.zone.push({ id: r.id, wetMm: r.wetMm });
      else if (wetZ) out.clearZones.push(r.id);
    }
  }
  return out;
}

/** A wall's inputs with its centres set by the wet areas (450, marked) or put back to the item's (both keys deleted). */
export function withWetCentres(inputs, on, centresMm = WET_AREA_RULE.centresMm) {
  const rest = { ...(inputs || {}) };
  delete rest.studCentresMm; delete rest.studCentresFrom;
  return on ? { ...rest, studCentresMm: centresMm, studCentresFrom: "wet" } : rest;
}

// ── joining walls back into one ─────────────────────────────────────────────────────────────────────────────

/**
 * Sam, 22 Nov 2026: join walls that meet end to start in a straight line (e.g. pieces of a split) back into ONE wall, so an opening
 * (a cavity slider) can sit across where they met. The joined wall keeps the first piece's settings; a piece at other centres keeps
 * them as a centre section of the joined wall (so the studs come out the same); each piece's own sections, bracing marks and
 * openings move along by where the piece starts. Pieces of different heights are refused (that is two walls).
 * @param {{ walls:Array<{ id:string, points:Array<{x,y}>, inputs:object }>, openingsByWall?:Map<string, object[]>, cal:object, itemCentresMm:number }} o
 * @returns {{ ok:true, wall:object, openings:Array<{ before, next }>, removed:string[], notes:string[] } | { ok:false, error:string }}
 */
export function joinWalls({ walls, openingsByWall = new Map(), cal, itemCentresMm }) {
  const ws = (walls || []).filter((w) => w && Array.isArray(w.points) && w.points.length === 2);
  if (ws.length < 2) return { ok: false, error: "Select two or more walls in a line to join them." };
  const o = { x: 0, y: 0 };
  const seg = ws.map((w) => { const a = pointToMm(cal, o, w.points[0]), b = pointToMm(cal, o, w.points[1]); const L = Math.hypot(b.x - a.x, b.y - a.y); return { w, a, b, L, u: { x: (b.x - a.x) / L, y: (b.y - a.y) / L } }; });
  if (seg.some((s) => !(s.L > 0))) return { ok: false, error: "A wall with no length can't be joined." };
  const meets = (p, q) => Math.hypot(p.b.x - q.a.x, p.b.y - q.a.y) <= 5 && p.u.x * q.u.x + p.u.y * q.u.y >= Math.cos((10 * Math.PI) / 180);
  const heads = seg.filter((q) => !seg.some((p) => p !== q && meets(p, q)));
  if (heads.length !== 1) return { ok: false, error: "Those walls don't meet end to end in one straight line, so they can't be one wall." };
  const chain = [heads[0]];
  while (chain.length < seg.length) {
    const nx = seg.find((q) => !chain.includes(q) && meets(chain[chain.length - 1], q));
    if (!nx) return { ok: false, error: "Those walls don't meet end to end in one straight line, so they can't be one wall." };
    chain.push(nx);
  }
  const h0 = Number(chain[0].w.inputs?.heightMm);
  if (chain.some((s) => Number(s.w.inputs?.heightMm) !== h0)) return { ok: false, error: "Those walls have different heights. Set them the same first (a height change is two walls)." };
  const first = chain[0].w;
  const ownC = (w) => (Number(w.inputs?.studCentresMm) > 0 ? Number(w.inputs.studCentresMm) : itemCentresMm);
  const baseC = ownC(first);
  const notes = [];
  const zones = [];
  const marks = [];
  const moved = [];
  let off = 0;
  for (const [i, s] of chain.entries()) {
    const w = s.w;
    const c = ownC(w);
    const pieceZones = centreZonesOf(w.inputs, s.L).map((z) => ({ ...z, fromMm: z.fromMm + off, toMm: z.toMm + off }));
    if (c !== baseC) {
      // the piece's own centres become a section, around any sections it already had
      let at = off;
      for (const z of [...pieceZones].sort((p, q) => p.fromMm - q.fromMm)) { if (z.fromMm - at >= 1) zones.push({ fromMm: at, toMm: z.fromMm, centresMm: c, ...(w.inputs?.studCentresFrom === "wet" ? { from: "wet" } : {}) }); at = z.toMm; }
      if (off + s.L - at >= 1) zones.push({ fromMm: at, toMm: off + s.L, centresMm: c, ...(w.inputs?.studCentresFrom === "wet" ? { from: "wet" } : {}) });
    }
    zones.push(...pieceZones);
    if (i > 0 && (w.inputs?.doubleTopPlate ?? null) !== (first.inputs?.doubleTopPlate ?? null)) notes.push(`${w.inputs?.name || "A wall"} had its own top plate setting; the joined wall takes ${first.inputs?.name || "the first wall"}'s.`);
    for (const m of bracingOf(w.inputs)) if (!(m.type === "ply" && m.whole)) marks.push({ ...m, xMm: Math.round(m.xMm + off) });
    if (i > 0) for (const op of openingsByWall.get(w.id) || []) moved.push({ before: op, next: { ...op, parentId: first.id, inputs: { ...op.inputs, xMm: Math.round(((Number(op.inputs?.xMm) || 0) + off) * 1000) / 1000 } } });
    off += s.L;
  }
  const merged = zones.map((z) => ({ ...z, fromMm: Math.round(z.fromMm * 10) / 10, toMm: Math.round(z.toMm * 10) / 10 })).filter((z) => z.toMm - z.fromMm >= 1);
  let inputs = { ...(first.inputs || {}) };
  delete inputs.bracing;
  if (marks.length) inputs.bracing = marks;
  inputs = withCentreZones(inputs, merged);
  if (bracingOf(first.inputs).some((m) => m.type === "ply" && m.whole)) { const r = setPlyWholeWall(inputs, off, true); if (r.ok) inputs = r.inputs; }
  return { ok: true, wall: { ...first, points: [first.points[0], chain[chain.length - 1].w.points[1]], inputs }, openings: moved, removed: chain.slice(1).map((s) => s.w.id), notes, lengthMm: off };
}
