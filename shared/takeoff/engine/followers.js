// =============================================================================
// shared/takeoff/engine/followers.js — battens, foam tape and H-flashing worked out AUTOMATICALLY from a
// cladding's own layout (wall-by-wall plan step 4, Sam's rules 21 Oct 2026). Nothing to set up: they follow the
// cladding's walls in the same calculation and go on the schedule and order under the cladding's own section.
//
//   Axon (vertical sheets, sheet_layout)
//     uprights    both wall ends, every vertical sheet join and 600 centres set out from the first sheet (no gap
//                 over 600), clipped at openings; a piece longer than the batten joins over a horizontal batten
//     horizontals along the bottom, along the top (sloped on a gable / outline top) and behind every H joint; a
//                 piece longer than the batten joins over an upright (errs slightly over, never under)
//     openings    both sides and the head of every window and door, plus the sill on windows (not doors); the head /
//                 sill only where the wall goes on above / below it
//     foam tape   behind every vertical sheet join, full height, stopping at openings and at the H-flashing;
//                 metres for the WHOLE JOB (every Axon cladding) → whole 25 m rolls (Hardie 50 mm Foam Back Sealing
//                 Tape, code 304560) — pooled in dispatch.js buyPooledFollowers
//     H-flashing  every horizontal joint by the metre, cut from 3,000 lengths with offcuts shared across walls (and
//                 across every Axon cladding of the job), no lap (Hardie 9 mm Alum Horizontal H Flashing, code 305613)
//   Two battens closer than a batten face (70 mm) are one: a join beats a wall end; a spacing batten that close to
//   either moves halfway between its neighbours; an opening / H-joint batten lying on another batten is dropped.
//   Linea / Stria (course_layout)   battens across the boards at 600 centres (boards flat → uprights; boards
//                                   standing → horizontals), plus a sloped batten along a gable / outline top
//   Timber cladding                 the same at 450 centres
//
// Battens are the catalogue's Hardie Cavity Batten, cut from its listed stock lengths with offcuts shared across
// every wall of the material (one allocator group). Direct-fixed cladding (route "direct") gets no battens. Batten-to-
// stud fixings are "not counted" and never block the order. A wall that already has a batten material set up by hand
// keeps it (no automatic battens there); a hand-made accessory set keeps the H joints when it has a joint strip or
// decided them, and the foam tape only when it holds the joint foam tape itself (code 304560) — never for its window /
// wrap tape.
// Pure ESM: no DB, DOM, network or eval.
// =============================================================================
import { formatMm } from "../units.js";
import { EPS_MM, LENGTH_KINDS, demandId, problem } from "./contract.js";
import { normaliseOutline, prepareOpenings, requiredStations, segmentCover } from "./supports.js";
import { CATALOGUE_SEED } from "../products/seed.js";

/** Bumped when the automatic battens / tape / H-flashing rules change (their order lines are then reviewed). */
export const FOLLOWERS_VERSION = 1;
export const AXON_CENTRES_MM = 600;
export const BOARD_CENTRES_MM = 600;
export const TIMBER_CENTRES_MM = 450;
/** Sam's product details (jameshardie.com.au, 21 Oct 2026). */
export const FOAM_TAPE = Object.freeze({ code: "304560", name: "Hardie™ 50mm Foam Back Sealing Tape", rollMm: 25000 });
export const H_FLASHING = Object.freeze({ code: "305613", name: "Hardie™ 9mm Alum Horizontal H Flashing", lengthMm: 3000 });
export const BATTEN_PRODUCT_ID = "hardie-405307";
/** What each follower is called on the schedule, the order and the supplier PDF (with its product code). */
export const FOLLOWER_KINDS = Object.freeze(["battens", "hflashing", "tape"]);

const fmt = (v) => formatMm(Math.round(v * 10) / 10, 1);
const round3 = (v) => Math.round(v * 1000) / 1000;
const BATTEN_REC = CATALOGUE_SEED.products.find((p) => p.id === BATTEN_PRODUCT_ID) || null;
/** Every listed stock length of the Cavity Batten (same maker, name and section). */
const BATTEN_LENGTHS = BATTEN_REC ? [...new Set(CATALOGUE_SEED.products.filter((p) => p.family === "batten" && p.manufacturer === BATTEN_REC.manufacturer && p.name === BATTEN_REC.name
  && p.dimensionsMm?.width === BATTEN_REC.dimensionsMm.width && p.dimensionsMm?.thickness === BATTEN_REC.dimensionsMm.thickness).map((p) => p.dimensionsMm.length))].sort((a, b) => a - b) : [];
export const BATTEN = Object.freeze({
  name: BATTEN_REC?.name || "Hardie Cavity Batten", code: BATTEN_REC?.sku || null, widthMm: BATTEN_REC?.dimensionsMm?.width ?? 70,
  thicknessMm: BATTEN_REC?.dimensionsMm?.thickness ?? 19, lengthsMm: Object.freeze(BATTEN_LENGTHS.length ? BATTEN_LENGTHS : [3000]),
});
const BATTEN_IDENTITY = Object.freeze({ family: "batten", follower: "battens", manufacturer: BATTEN_REC?.manufacturer || "James Hardie", name: BATTEN.name, sku: BATTEN.code,
  widthMm: BATTEN.widthMm, thicknessMm: BATTEN.thicknessMm });
const H_IDENTITY = Object.freeze({ family: "accessory", follower: "hflashing", manufacturer: "James Hardie", name: H_FLASHING.name, sku: H_FLASHING.code });
const TAPE_IDENTITY = Object.freeze({ family: "accessory", follower: "tape", manufacturer: "James Hardie", name: FOAM_TAPE.name, sku: FOAM_TAPE.code, rollMm: FOAM_TAPE.rollMm });
const BATTEN_POLICY = Object.freeze({ kind: "list", lengthsMm: BATTEN.lengthsMm, kerfMm: 0, finalEndAcceptable: true, sharePieces: true });
const H_POLICY = Object.freeze({ kind: "fixed", lengthMm: H_FLASHING.lengthMm, kerfMm: 0, finalEndAcceptable: true, sharePieces: true });
export const FOLLOWER_TEXT = Object.freeze({
  battens: `${BATTEN.name} ${BATTEN.widthMm} × ${BATTEN.thicknessMm}${BATTEN.code ? `, code ${BATTEN.code}` : ""}`,
  hflashing: `${H_FLASHING.name}, code ${H_FLASHING.code}`,
  tape: `${FOAM_TAPE.name}, ${FOAM_TAPE.rollMm / 1000} m roll, code ${FOAM_TAPE.code}`,
});

/**
 * Which automatic followers a cladding material gets (null = none). Sam's rules: Axon sheets → battens + foam tape +
 * H-flashing; Linea / Stria boards → battens across the boards at 600; timber cladding → the same at 450. Direct fix
 * (rules.route "direct") → no battens. Matrix, AAC and foam get none.
 */
export function followerRule(mat, n) {
  if (!mat || !n) return null;
  const battens = mat.rules?.route !== "direct";
  const across = n.orientation === "horizontal" ? "vertical" : "horizontal";   // battens run across the boards
  let rule = null;
  if (n.family === "cladding" && mat.methodKey === "sheet_layout" && n.orientation !== "horizontal") rule = { kind: "axon", centresMm: AXON_CENTRES_MM, battens, extras: true, across: "both" };
  else if (n.family === "cladding" && mat.methodKey === "course_layout") rule = { kind: "boards", centresMm: BOARD_CENTRES_MM, battens, extras: false, across };
  else if (n.family === "timber-cladding" && ["course_layout", "area_to_linear"].includes(mat.methodKey)) rule = { kind: "timber", centresMm: TIMBER_CENTRES_MM, battens, extras: false, across };
  return rule && (rule.battens || rule.extras) ? rule : null;
}

/** Plain words for what a rule does (the Supports tab, the cladding card, the SOP). */
export function followerRuleText(rule) {
  if (!rule) return null;
  if (rule.kind === "axon") return `uprights at both ends, every sheet join and ${fmt(rule.centresMm)} centres; bottom, top and every H joint; round each window and door`;
  return `${rule.across === "vertical" ? "upright" : "horizontal"} battens across the boards at ${fmt(rule.centresMm)} centres`;
}

// ── geometry helpers (local wall mm: x along the wall, y up) ────────────────────────────────────────────────

/** Polygon edges (CCW) with their outward normal: "top" faces up, "bottom" faces down, else "side". */
function edgesOf(pts) {
  return pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ny = len ? -(b.x - a.x) / len : 0;   // outward normal of a CCW edge is (dy, −dx)/len
    return { a, b, len, kind: ny > 0.2 ? "top" : ny < -0.2 ? "bottom" : "side", horizontal: Math.abs(b.y - a.y) <= EPS_MM };
  }).filter((e) => e.len > EPS_MM);
}

/** Parts of a→b NOT inside any opening (closed rectangle — a batten ON an opening's edge stops there too). */
function outsideOpenings(a, b, ops) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const cuts = [];
  for (const o of ops) {
    // Liang–Barsky clip of the segment against the closed opening rectangle
    let t0 = 0, t1 = 1;
    const dx = b.x - a.x, dy = b.y - a.y;
    const tests = [[-dx, a.x - o.bbox.x0], [dx, o.bbox.x1 - a.x], [-dy, a.y - o.bbox.y0], [dy, o.bbox.y1 - a.y]];
    let hit = true;
    for (const [p, q] of tests) {
      if (Math.abs(p) <= 1e-12) { if (q < -EPS_MM) { hit = false; break; } continue; }
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
      if (t0 > t1) { hit = false; break; }
    }
    if (hit && (t1 - t0) * len > EPS_MM) cuts.push([t0 * len, t1 * len]);
  }
  cuts.sort((p, q) => p[0] - q[0]);
  const out = [];
  let cur = 0;
  for (const [s, e] of cuts) { if (s - cur > EPS_MM) out.push([cur, s]); cur = Math.max(cur, e); }
  if (len - cur > EPS_MM) out.push([cur, len]);
  return out;
}

/** Parts of a→b inside the wall and outside opening interiors (a line on an opening's edge is not cut by it). */
function insideWall(a, b, W, ops) {
  return segmentCover(a, b, W.points, ops).filter((s) => s.state === "in" && s.toMm - s.fromMm > EPS_MM).map((s) => [s.fromMm, s.toMm]);
}

/**
 * Split a piece of length `len` so no part is longer than the longest stock: at the farthest join position (`at`,
 * distances along the piece — the crossing battens' centrelines) that keeps the part within stock, else at the stock
 * length (a butt join). A crossing batten up to half its face past the stock length still takes the join: the piece
 * ends at the stock length, on that batten's face.
 */
function splitPiece(len, at, maxMm, faceMm = 0) {
  if (len <= maxMm + EPS_MM) return { parts: [[0, len]], butt: false };
  const cands = [...new Set(at.map(round3))].filter((c) => c > EPS_MM && c < len - EPS_MM).sort((p, q) => p - q);
  const parts = [];
  let cur = 0, butt = false;
  while (len - cur > maxMm + EPS_MM) {
    let next = null;
    for (const c of cands) if (c > cur + EPS_MM && c <= cur + maxMm + faceMm / 2 + EPS_MM) next = Math.min(c, cur + maxMm);
    if (next === null || next <= cur + EPS_MM) { next = cur + maxMm; butt = true; }
    parts.push([cur, next]);
    cur = next;
  }
  parts.push([cur, len]);
  return { parts, butt };
}

const along = (a, b, t) => { const L = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: a.x + ((b.x - a.x) * t) / L, y: a.y + ((b.y - a.y) * t) / L }; };
/** Distances along a→b at which it crosses the vertical lines x = xs (for joins over an upright). */
function crossingsX(a, b, xs) {
  const dx = b.x - a.x, L = Math.hypot(b.x - a.x, b.y - a.y);
  if (Math.abs(dx) <= EPS_MM) return [];
  return xs.map((x) => ((x - a.x) / dx) * L).filter((t) => t > EPS_MM && t < L - EPS_MM);
}
/** Distances along a vertical a→b at which it crosses the horizontal lines y = ys. */
const crossingsY = (a, b, ys) => ys.map((y) => (y - a.y) * Math.sign(b.y - a.y || 1)).filter((t) => t > EPS_MM && t < Math.abs(b.y - a.y) - EPS_MM);

// ── one wall ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Battens, foam tape and H-flashing for ONE wall of a cladding material.
 * @param {{ polygon: {x:number,y:number}[] }} wall  the wall outline (buildWall polygon, local mm)
 * @param {object[]} openings  the wall's openings ({ id, label, type, xMm, sillMm, widthMm, heightMm })
 * @param {object} layout  the cladding's own layout on this wall (sheet_layout: columns, courses, joints, datumMm)
 * @param {{ rule: object, materialId: string, wallTag: string, measurementId: string, battens?: boolean, tape?: boolean, hFlashing?: boolean }} opts
 *   battens / tape / hFlashing false = left out on this wall (direct fix, or set up by hand)
 * @returns {{ demands: object[], problems: object[], explain: string[], layout: object }}
 */
export function wallFollowers(wall, openings, layout, opts) {
  const { rule, materialId, wallTag, measurementId } = opts;
  const out = { demands: [], problems: [], explain: [], layout: { version: FOLLOWERS_VERSION, rule: rule.kind, centresMm: rule.centresMm, across: rule.across,
    battens: { state: opts.battens === false ? "off" : "auto", lines: [], totalMm: 0, fixings: "not-counted" }, tape: { state: rule.extras && opts.tape !== false ? "auto" : "off", runs: [], totalMm: 0 },
    hFlashing: { state: rule.extras && opts.hFlashing !== false ? "auto" : "off", runs: [], totalMm: 0 } } };
  let W, ops;
  try {
    W = normaliseOutline({ polygon: wall.polygon }, "Wall");
    const probs = [];
    ops = prepareOpenings(W, (openings || []).map((o) => ({ id: o.id, xMm: o.xMm, sillMm: o.sillMm, widthMm: o.widthMm, heightMm: o.heightMm, type: o.type || "window", label: o.label || null })), probs);
  } catch (e) {
    if (e?.name !== "TakeoffValidationError") throw e;
    return out;   // the cladding itself reports a bad outline; nothing to follow
  }
  const { x0, x1, y0, y1 } = W.bbox;
  const ref = (extra = {}) => [{ wallId: wallTag, measurementId, ...extra }];
  const nameOf = (o) => o.raw?.label || String(o.id).slice(0, 6);
  const maxBatten = Math.max(...BATTEN.lengthsMm);
  const horizJoints = rule.kind === "axon" ? (layout?.joints || []).filter((j) => j.orientation === "horizontal") : [];
  const jointYs = horizJoints.map((j) => j.atMm + (j.gapMm || 0) / 2);

  // ── battens ──
  if (out.layout.battens.state === "auto") {
    const pieces = [];   // { key, kind, a, b, orientation, label, joinAt: "x" (joins over uprights) | "y" (over horizontals) }
    // a line cut by openings (or by the outline) is named by what it stops at: "below W1", "left of D1", "between W1 and W2"
    const openingAt = (pt) => ops.find((o) => pt.x >= o.bbox.x0 - 0.5 && pt.x <= o.bbox.x1 + 0.5 && pt.y >= o.bbox.y0 - 0.5 && pt.y <= o.bbox.y1 + 0.5);
    const pieceName = (a, b, spans, k, orientation) => {
      const n = spans.length;
      const gap = (i) => { const o = i >= 0 && i + 1 < n ? openingAt(along(a, b, (spans[i][1] + spans[i + 1][0]) / 2)) : null; return o ? nameOf(o) : null; };
      const before = gap(k - 1), after = gap(k);
      const [lo, hi] = orientation === "vertical" ? ["below", "above"] : ["left of", "right of"];
      if (before && after) return `between ${before} and ${after}`;
      if (after) return `${lo} ${after}`;
      if (before) return `${hi} ${before}`;
      return orientation === "vertical" ? (k === 0 ? "bottom piece" : k === n - 1 ? "top piece" : `piece ${k + 1} of ${n}`) : (k === 0 ? "left piece" : k === n - 1 ? "right piece" : `piece ${k + 1} of ${n}`);
    };
    const addLine = (key, kind, a, b, spans, label, orientation, joinAt) => spans.forEach(([s, e], k) => pieces.push({ key: `${key}:p${k}`, kind, a: along(a, b, s), b: along(a, b, e), orientation,
      label: spans.length > 1 ? `${label}, ${pieceName(a, b, spans, k, orientation)}` : label, joinAt }));
    // two battens closer than a batten's own face (70 mm) can't both be fixed. A sheet join and a wall end that close are
    // ONE batten, at the join (e.g. a join 30 mm from the wall end). A spacing batten that would land that close to a join
    // or an end moves halfway between its neighbours instead: the same count, still no gap over the centres
    const mergeStations = (stations) => {
      const rank = (st) => (st.kinds.includes("required") ? 3 : st.kinds.includes("end") ? 2 : 1);
      const near = (p, q) => p && q && Math.abs(p.atMm - q.atMm) < BATTEN.widthMm - EPS_MM;
      const kept = [];
      for (const st of [...stations].sort((p, q) => p.atMm - q.atMm)) {
        const prev = kept[kept.length - 1];
        if (near(prev, st) && rank(st) > 1 && rank(prev) > 1 && rank(st) !== rank(prev)) { if (rank(st) > rank(prev)) kept[kept.length - 1] = st; continue; }
        kept.push(st);
      }
      for (let i = 1; i + 1 < kept.length; i++) {
        if (rank(kept[i]) === 1 && ((rank(kept[i - 1]) > 1 && near(kept[i - 1], kept[i])) || (rank(kept[i + 1]) > 1 && near(kept[i], kept[i + 1])))) {
          kept[i] = { ...kept[i], atMm: round3((kept[i - 1].atMm + kept[i + 1].atMm) / 2) };
        }
      }
      return kept;
    };
    let uprightXs = [];
    const uprightLines = (xs, kind) => {
      for (const x of xs) {
        const a = { x, y: y0 }, b = { x, y: y1 };
        addLine(`u@${round3(x)}`, kind, a, b, insideWall(a, b, W, ops), `upright at ${fmt(x - x0)}`, "vertical", "y");
      }
    };
    const edgeLines = (which, { slopedOnly = false } = {}) => {
      const eds = edgesOf(W.points).map((ed, i) => ({ ed, i })).filter(({ ed }) => ed.kind === which && !(slopedOnly && ed.horizontal));
      const sloped = eds.filter(({ ed }) => !ed.horizontal).map(({ ed }) => { const [a, b] = ed.a.x <= ed.b.x ? [ed.a, ed.b] : [ed.b, ed.a]; return b.y > a.y ? "rising" : "falling"; });
      // a gable's two rakes read "left rake" / "right rake"; any other sloped edge is "sloped top" (numbered if several)
      const gableRakes = sloped.length === 2 && sloped[0] !== sloped[1];
      let k = 0;
      for (const { ed, i } of eds) {
        // left → right so a sloped top reads in the same direction as the wall
        const [a, b] = ed.a.x <= ed.b.x ? [ed.a, ed.b] : [ed.b, ed.a];
        let label = which;
        if (!ed.horizontal) {
          label = gableRakes && which === "top" ? (b.y > a.y ? "left rake" : "right rake") : `sloped ${which}${sloped.length > 1 ? ` ${k + 1}` : ""}`;
          k++;
        }
        addLine(`${which}${i}`, which, a, b, outsideOpenings(a, b, ops), label, ed.horizontal ? "horizontal" : "sloped", "x");
      }
    };
    const horizontalLines = (ys, kind, labelOf) => {
      ys.forEach((y, i) => {
        const a = { x: x0, y }, b = { x: x1, y };
        addLine(`${kind}${i}`, kind, a, b, insideWall(a, b, W, ops), labelOf(y, i), "horizontal", "x");
      });
    };
    if (rule.kind === "axon") {
      const joins = (layout?.columns || []).slice(0, -1).map((c) => c.zoneEnd).filter((v) => v > x0 + EPS_MM && v < x1 - EPS_MM);
      const st = requiredStations({ fromMm: x0, toMm: x1, requiredMm: joins.map((at) => ({ atMm: at, ref: "sheet join" })), maxSpacingMm: rule.centresMm, phaseMm: Number.isFinite(layout?.datumMm) ? layout.datumMm : x0 });
      uprightXs = mergeStations(st.stations).map((s) => s.atMm);
      uprightLines(uprightXs, "upright");
      edgeLines("bottom");
      edgeLines("top");
      horizontalLines(jointYs, "joint", (y, i) => `behind H joint ${i + 1}`);
      // round each opening: both sides and the head; the sill on windows (a door has none). The head and the sill go only
      // where there is cladding above / below them (a door or window up to the wall top has no head batten on the top)
      for (const o of ops) {
        if (!o.rect) continue;
        const { x0: ox0, x1: ox1, y0: oy0, y1: oy1 } = o.bbox;
        const door = (o.raw?.type || "window") === "door";
        const others = ops.filter((x) => x !== o);
        const mk = (edge, a, b, orientation, probeDy = 0) => addLine(`${o.id}:${edge}`, edge === "left" || edge === "right" ? "jamb" : edge, a, b,
          insideWall({ x: a.x, y: a.y + probeDy }, { x: b.x, y: b.y + probeDy }, W, others),
          `${nameOf(o)} ${edge === "left" ? "left side" : edge === "right" ? "right side" : edge}`, orientation, orientation === "vertical" ? "y" : "x");
        mk("left", { x: ox0, y: oy0 }, { x: ox0, y: oy1 }, "vertical");
        mk("right", { x: ox1, y: oy0 }, { x: ox1, y: oy1 }, "vertical");
        mk("head", { x: ox0, y: oy1 }, { x: ox1, y: oy1 }, "horizontal", 1);
        if (!door) mk("sill", { x: ox0, y: oy0 }, { x: ox1, y: oy0 }, "horizontal", -1);
      }
    } else if (rule.across === "vertical") {
      // boards laid flat → upright battens at centres (both ends included), plus a sloped batten along a raked top
      const st = requiredStations({ fromMm: x0, toMm: x1, maxSpacingMm: rule.centresMm, phaseMm: x0 });
      uprightXs = mergeStations(st.stations).map((s) => s.atMm);
      uprightLines(uprightXs, "upright");
      edgeLines("top", { slopedOnly: true });
    } else {
      // boards standing up → horizontal battens at centres from the base, the bottom and top edges themselves
      const st = requiredStations({ fromMm: y0, toMm: y1, maxSpacingMm: rule.centresMm, phaseMm: y0 });
      horizontalLines(mergeStations(st.stations).filter((s) => !s.kinds.includes("end")).map((s) => s.atMm), "across", (y) => `across at ${fmt(y - y0)}`);
      edgeLines("bottom");
      edgeLines("top");
    }
    // the same physical batten is counted once: a batten behind an H joint or round an opening that lies within a
    // batten's face (70 mm) of a batten already on that line, along its whole length (e.g. a window edge 30 mm from a
    // full-height upright, a head on the H-joint batten, a sill on the bottom batten)
    const kept = [];
    const lineOf = (p) => (p.orientation === "vertical" ? { at: p.a.x, lo: Math.min(p.a.y, p.b.y), hi: Math.max(p.a.y, p.b.y) }
      : p.orientation === "horizontal" ? { at: p.a.y, lo: Math.min(p.a.x, p.b.x), hi: Math.max(p.a.x, p.b.x) } : null);
    const tier = (p) => (["jamb", "head", "sill"].includes(p.kind) ? 2 : p.kind === "joint" ? 1 : 0);
    for (const p of pieces.map((x, i) => ({ x, i })).sort((a, b) => tier(a.x) - tier(b.x) || a.i - b.i).map(({ x }) => x)) {
      const L = lineOf(p);
      if (L && tier(p) > 0) {
        const host = kept.find((k) => { const K = lineOf(k); return K && k.orientation === p.orientation && Math.abs(K.at - L.at) < BATTEN.widthMm - EPS_MM && K.lo <= L.lo + 0.5 && K.hi >= L.hi - 0.5; });
        if (host) continue;
      }
      kept.push(p);
    }
    // lengths over the longest batten: Axon horizontals join over an upright, Axon uprights over a horizontal batten
    let butt = 0;
    const lines = [];
    for (const p of kept) {
      const len = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y);
      const at = rule.kind !== "axon" && p.orientation !== "sloped" ? [] : p.joinAt === "x" ? crossingsX(p.a, p.b, uprightXs) : crossingsY(p.a, p.b, jointYs);
      const sp = splitPiece(len, at, maxBatten, BATTEN.widthMm);
      if (sp.butt) butt++;
      sp.parts.forEach(([s, e], j) => {
        const a = along(p.a, p.b, s), b = along(p.a, p.b, e), L = round3(e - s);
        if (L <= EPS_MM) return;
        const key = `${p.key}${sp.parts.length > 1 ? `:s${j + 1}` : ""}`;
        const id = demandId(materialId, wallTag, "batten", key);
        const label = `${wallTag} batten — ${p.label}${sp.parts.length > 1 ? ` (${j + 1} of ${sp.parts.length})` : ""}`;
        lines.push({ demandId: id, kind: p.kind, orientation: p.orientation, a: { x: round3(a.x), y: round3(a.y) }, b: { x: round3(b.x), y: round3(b.y) }, lengthMm: L, label });
        out.demands.push({ id, materialId, role: "batten", follower: "battens", kind: "linear", unit: "piece", lengthMm: L, quantity: 1, lengthKind: LENGTH_KINDS.CUT,
          identity: BATTEN_IDENTITY, stockPolicy: BATTEN_POLICY, noSplice: true, itemDescription: FOLLOWER_TEXT.battens, label,
          sourceRefs: ref({ role: "batten" }), provenance: "calculated" });
      });
    }
    out.layout.battens.lines = lines;
    out.layout.battens.totalMm = round3(lines.reduce((t, l) => t + l.lengthMm, 0));
    const openingNames = rule.kind === "axon" && ops.length ? ` round ${ops.map(nameOf).join(", ")}` : "";
    out.explain.push(`${wallTag}: ${lines.length} batten piece${lines.length === 1 ? "" : "s"}, ${(out.layout.battens.totalMm / 1000).toFixed(2)} m — ${followerRuleText(rule)}${openingNames}. Batten fixings to the studs are not counted.`);
    if (butt) out.explain.push(`${wallTag}: ${butt} batten run${butt === 1 ? " is" : "s are"} longer than a ${fmt(maxBatten)} batten and join${butt === 1 ? "s" : ""} end to end.`);
  }

  // ── foam tape: behind every vertical sheet join, full height, stopping at openings and at the H-flashing ──
  if (out.layout.tape.state === "auto") {
    const joins = (layout?.columns || []).slice(0, -1).map((c) => c.zoneEnd).filter((v) => v > x0 + EPS_MM && v < x1 - EPS_MM);
    const rows = Array.isArray(layout?.courses) && layout.courses.length ? layout.courses : [{ zoneStart: y0, zoneEnd: y1 }];
    for (const x of joins) {
      for (const r of rows) {
        const a = { x, y: r.zoneStart }, b = { x, y: r.zoneEnd };
        // a join running down an opening's edge has sheet on one side only — no tape there (closed opening)
        for (const [s0, e0] of insideWall(a, b, W, ops)) {
          const pa = along(a, b, s0), pb = along(a, b, e0);
          for (const [s, e] of outsideOpenings(pa, pb, ops)) {
            const ya = pa.y + s, yb = pa.y + e;
            out.layout.tape.runs.push({ a: { x: round3(x), y: round3(ya) }, b: { x: round3(x), y: round3(yb) }, lengthMm: round3(yb - ya) });
          }
        }
      }
    }
    const total = round3(out.layout.tape.runs.reduce((t, r) => t + r.lengthMm, 0));
    out.layout.tape.totalMm = total;
    if (total > EPS_MM) {
      out.demands.push({ id: demandId(materialId, wallTag, "foam-tape"), materialId, role: "foam-tape", follower: "tape", kind: "count", unit: "roll", quantity: total / FOAM_TAPE.rollMm, tapeMm: total,
        identity: TAPE_IDENTITY, itemDescription: FOLLOWER_TEXT.tape, label: `${wallTag} foam tape — ${(total / 1000).toFixed(2)} m behind the vertical sheet joins`, sourceRefs: ref({ role: "foam-tape" }), provenance: "calculated" });
    }
  }

  // ── H-flashing: every horizontal joint by the metre, 3,000 lengths, no lap ──
  if (out.layout.hFlashing.state === "auto") {
    horizJoints.forEach((j, i) => {
      const y = j.atMm + (j.gapMm || 0) / 2;
      (j.segments || []).forEach((sg, k) => {
        const len = round3(sg.endMm - sg.startMm);
        if (len <= EPS_MM) return;
        out.layout.hFlashing.runs.push({ a: { x: round3(sg.startMm), y: round3(y) }, b: { x: round3(sg.endMm), y: round3(y) }, lengthMm: len });
        const sp = splitPiece(len, [], H_FLASHING.lengthMm);
        sp.parts.forEach(([s, e], p) => {
          const L = round3(e - s);
          const id = demandId(materialId, wallTag, "h-flashing", `j${i}s${k}${sp.parts.length > 1 ? `p${p + 1}` : ""}`);
          out.demands.push({ id, materialId, role: "h-flashing", follower: "hflashing", kind: "linear", unit: "piece", lengthMm: L, quantity: 1, lengthKind: LENGTH_KINDS.CUT,
            identity: H_IDENTITY, stockPolicy: H_POLICY, noSplice: true, itemDescription: FOLLOWER_TEXT.hflashing,
            label: `${wallTag} H-flashing — joint ${i + 1}${(j.segments || []).length > 1 ? ` part ${k + 1}` : ""}${sp.parts.length > 1 ? ` length ${p + 1}/${sp.parts.length}` : ""}`,
            sourceRefs: ref({ role: "h-flashing" }), provenance: "calculated" });
        });
      });
    });
    out.layout.hFlashing.totalMm = round3(out.layout.hFlashing.runs.reduce((t, r) => t + r.lengthMm, 0));
  }
  if (rule.extras) {
    const tapeM = (out.layout.tape.totalMm / 1000).toFixed(2), hM = (out.layout.hFlashing.totalMm / 1000).toFixed(2);
    out.explain.push(`${wallTag}: ${out.layout.tape.state === "auto" ? `foam tape ${tapeM} m behind the vertical sheet joins` : "foam tape from the accessory set"}; ${out.layout.hFlashing.state === "auto" ? `H-flashing ${hM} m on the horizontal joints` : "H joints from the accessory set"}.`);
  }
  return out;
}

/** A follower problem in the engine's shape (non-blocking notes only: followers never hold up the order). */
export const followerNote = (code, message, refs) => problem(code, message, { blocking: false, ...(refs ? { refs } : {}) });
