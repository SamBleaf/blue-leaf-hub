// =============================================================================
// shared/takeoff/engine/junctions.js — wall junctions (T, L, X) found from where the traced walls start and finish.
// Plan: docs/takeoff/WALL_JUNCTIONS_PLAN.md. Pure: no DB/DOM/network.
//
// A traced wall is two points in PDF space on a page (measurement.points, with its calibration). The caller turns them
// into real mm in ONE frame per (document, page, calibration) and hands each group in here. Nothing is stored: every
// junction is worked out again from the points, so moving a wall moves its junctions.
//
//   T  the END of a wall B lies on the RUN of another wall A (within the tolerance), not at A's ends. A is the
//      continuous wall: it gets two junction studs, one each side of B (against B's two faces). Also found when A is
//      traced as two collinear legs that meet at B's end (the T sits on the join of the two legs).
//      Owner rule A (Sam, 18 Nov 2026): plus junction BLOCKS, 300 mm long, laminated in pairs at 900 centres up the wall, in the
//      90 mm space between the two junction studs (2 x ceil(wall height / 900) of them: 6 for 2.4 to 2.7 m, 8 for 3.0 m).
//   L  ends meet ends at an angle (a corner). DIRECTION-BASED (owner rule B): a wall that STARTS at the corner gets a second stud
//      for the internal-corner plasterboard fixing (3 studs a corner in all); a wall that ENDS there has its normal end stud only.
//      Both start or both end: the LONGER wall gets the second stud. A per-corner override swaps which wall. Collinear joins
//      (under the angle test) are not corners and are not reported.
//   X  two walls cross each other's runs. Reported only; never counted.
// =============================================================================

/** Defaults Sam confirms (plan §3). */
export const JUNCTION_DEFAULTS = Object.freeze({
  /** Walls closer to parallel than this are not a junction (an in-line join or an overlap). */
  minAngleDeg: 20,
  /** Two legs that leave a node within this of opposite directions are one continuous wall. */
  collinearDeg: 10,
});

/** Owner rule A: junction blocks (300 mm long, laminated in pairs, at 900 centres up the continuous wall). */
export const JUNCTION_BLOCK = Object.freeze({ lengthMm: 300, centresMm: 900 });
/** Pairs of blocks up a wall of this height: ceil(height / 900). */
export const blockPairsFor = (heightMm) => (Number(heightMm) > 0 ? Math.max(1, Math.ceil(Number(heightMm) / JUNCTION_BLOCK.centresMm - 1e-9)) : 0);
/** Height of the middle of each pair above the stud base: the wall split into equal bands of at most 900, a pair in the middle of each. */
export const blockCentresFor = (heightMm) => { const n = blockPairsFor(heightMm); return Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) * Number(heightMm)) / n * 10) / 10); };
/** Blocks (not pairs) at one junction: 2 x ceil(height / 900). */
export const blockCountFor = (heightMm) => 2 * blockPairsFor(heightMm);

/** The wall ids named inside an override key (junctionsOff / cornersSwapped), so a key for a deleted wall can be dropped. */
export function overrideKeyWallIds(key) {
  const k = String(key || "");
  const t = /^(.+):[01]@(.+)$/.exec(k);
  if (t) return [t[1], ...t[2].split("+")];
  if (k.startsWith("corner:")) return k.slice(7).split("|").map((e) => e.slice(0, e.lastIndexOf(":")));
  return [];
}

const EPS = 1e-6;
const r1 = (v) => Math.round(v * 10) / 10;
const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y });
const dot = (p, q) => p.x * q.x + p.y * q.y;
const cross = (p, q) => p.x * q.y - p.y * q.x;

function prep(w) {
  const d = sub(w.b, w.a);
  const L = Math.hypot(d.x, d.y);
  return L > EPS ? { id: w.id, a: w.a, b: w.b, L, u: { x: d.x / L, y: d.y / L } } : null;
}

/**
 * Find the junctions among the straight walls of ONE frame (one page, one scale).
 * @param {Array<{ id:string, a:{x:number,y:number}, b:{x:number,y:number} }>} walls  endpoints in mm, a = first traced point
 * @param {{ thicknessMm:number, studWidthMm:number, toleranceMm?:number, minAngleDeg?:number, collinearDeg?:number, cornersSwapped?:string[] }} o
 *   thicknessMm: the wall thickness (the stud's depth, 90); studWidthMm: the stud's width along the wall (45).
 *   toleranceMm: how far a wall's end may sit off another wall's centreline and still meet it (default: the thickness,
 *   so an end traced to either face of the plan's wall counts).
 * @returns {{ junctions: object[], corners: object[], crossings: object[] }}
 *   junction: { id, nodeId, kind:"T", continuousId, buttingId, end:0|1, stationMm, angleDeg, halfSpanMm, split, dropEnd, studsAtMm:[left,right] }
 *   (stations run along the continuous wall from its first point; id = `${buttingId}:${end}@${continuousId}` and is the override key;
 *   a wall traced in two legs gives one junction per leg with the SAME id `${buttingId}:${end}@${leg1}+${leg2}`; dropEnd = which end of
 *   THIS leg sits on the join, whose end stud the T replaces)
 *   corner: { id, kind:"L", wallIds, pointMm, angleDeg, studWallId|null, studEnd, offsetMm, why, swapped, multi }  (id = override key)
 */
export function findJunctions(walls, o = {}) {
  const thick = Number(o.thicknessMm) > 0 ? Number(o.thicknessMm) : 90;
  const studW = Number(o.studWidthMm) > 0 ? Number(o.studWidthMm) : 45;
  const tol = Number(o.toleranceMm) > 0 ? Number(o.toleranceMm) : thick;
  const minSin = Math.sin(((o.minAngleDeg ?? JUNCTION_DEFAULTS.minAngleDeg) * Math.PI) / 180);
  const colCos = Math.cos(((o.collinearDeg ?? JUNCTION_DEFAULTS.collinearDeg) * Math.PI) / 180);
  const ws = (walls || []).map(prep).filter(Boolean).sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  const endPt = (w, e) => (e === 0 ? w.a : w.b);
  const awayDir = (w, e) => (e === 0 ? w.u : { x: -w.u.x, y: -w.u.y }); // from the end, along the wall's body

  const junctions = [];
  const seenJ = new Set();
  const addT = (A, B, e, p, split, legs = null, dropEnd = null) => {
    const sinT = Math.abs(cross(A.u, B.u));
    if (sinT < minSin) return;
    // where B's centreline meets A's centreline (B's end may sit off A's centreline by up to the tolerance)
    const dB = awayDir(B, e);
    const k = -cross(A.u, sub(p, A.a)) / cross(A.u, dB);
    const q = { x: p.x + dB.x * k, y: p.y + dB.y * k };
    // a wall traced in two legs is ONE continuous wall: the station is not clamped to the leg, so the studs of the two legs
    // line up either side of the butting wall (a stud beyond a leg's end belongs to the other leg)
    const s = split ? dot(sub(p, A.a), A.u) : dot(sub(q, A.a), A.u);
    const halfSpan = thick / 2 / sinT;
    const d = halfSpan + studW / 2;
    // one override key per junction: butting wall + its end + the continuous wall (a two-leg wall: both legs, so they switch together)
    const id = `${B.id}:${e}@${legs ? legs.join("+") : A.id}`;
    const seenKey = `${id}|${A.id}`;
    if (seenJ.has(seenKey)) return;
    seenJ.add(seenKey);
    junctions.push({ id, nodeId: `${B.id}:${e}`, kind: "T", continuousId: A.id, buttingId: B.id, end: e, dropEnd, stationMm: r1(s),
      angleDeg: r1((Math.asin(Math.min(1, sinT)) * 180) / Math.PI), halfSpanMm: r1(halfSpan), split: !!split, studsAtMm: [r1(s - d), r1(s + d)] });
  };

  const inT = new Set(); // wall ends that belong to a T (so they are never also reported as a corner)
  const ends = ws.flatMap((w) => [[w, 0], [w, 1]]);
  for (const [B, e] of ends) {
    const p = endPt(B, e);
    // 1. the end lies on another wall's run, clear of that wall's own ends
    for (const A of ws) {
      if (A === B) continue;
      const rel = sub(p, A.a);
      const s = dot(rel, A.u);
      if (Math.abs(cross(A.u, rel)) > tol + EPS) continue;
      if (!(s > tol + EPS && s < A.L - tol - EPS)) continue;
      if (Math.abs(cross(A.u, B.u)) < minSin) continue;
      addT(A, B, e, p, false);
      inT.add(`${B.id}:${e}`);
    }
    // 2. the end meets the join of two collinear legs of one continuous wall (a wall traced in two pieces)
    const near = ends.filter(([W, f]) => W !== B && Math.hypot(...Object.values(sub(endPt(W, f), p))) <= tol + EPS);
    const dB = awayDir(B, e);
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
      const [W1, f1] = near[i], [W2, f2] = near[j];
      if (W1 === W2) continue;
      if (dot(awayDir(W1, f1), awayDir(W2, f2)) > -colCos) continue;      // not one straight line through the node
      if (Math.abs(cross(W1.u, dB)) < minSin) continue;                   // B runs along that line: a longer wall, not a T
      const legs = [W1.id, W2.id].sort();
      addT(W1, B, e, p, true, legs, f1); addT(W2, B, e, p, true, legs, f2);
      inT.add(`${B.id}:${e}`); inT.add(`${W1.id}:${f1}`); inT.add(`${W2.id}:${f2}`);
    }
  }

  // L corners: ends within the tolerance of each other that are not part of a T; one entry per set of walls. A collinear join
  // (the walls under the angle test) is not a corner and is not reported. Direction-based second stud (owner rule B).
  const swapped = new Set(Array.isArray(o.cornersSwapped) ? o.cornersSwapped : []);
  const cornerOffset = thick + studW / 2;           // near face one wall thickness from the wall's first point: just past the butting wall
  const corners = [];
  const seenC = new Set();
  for (const [B, e] of ends) {
    if (inT.has(`${B.id}:${e}`)) continue;
    const p = endPt(B, e);
    const group = ends.filter(([W, f]) => !inT.has(`${W.id}:${f}`) && (W === B && f === e || (W !== B && Math.hypot(...Object.values(sub(endPt(W, f), p))) <= tol + EPS)));
    if (group.length < 2) continue;
    const key = group.map(([W, f]) => `${W.id}:${f}`).sort().join("|");
    if (seenC.has(key)) continue;
    seenC.add(key);
    const wallIds = [...new Set(group.map(([W]) => W.id))];
    if (wallIds.length < 2) continue;
    const id = `corner:${key}`;
    const base = { id, kind: "L", wallIds, pointMm: { x: r1(p.x), y: r1(p.y) }, offsetMm: r1(cornerOffset) };
    if (group.length > 2) { corners.push({ ...base, angleDeg: null, studWallId: null, studEnd: null, why: null, swapped: false, multi: true }); continue; }
    const [[W1, f1], [W2, f2]] = group;
    const sinC = Math.abs(cross(W1.u, W2.u));
    if (sinC < minSin) continue;                                  // a collinear join: one wall traced in two pieces, not a corner
    // the wall that STARTS here (its first traced point) gets the 2 studs; both start or both end: the longer wall (a tie: the lower id)
    let pick, why;
    if (f1 === 0 && f2 === 1) { pick = [W1, f1]; why = "starts"; }
    else if (f1 === 1 && f2 === 0) { pick = [W2, f2]; why = "starts"; }
    else { pick = W1.L > W2.L + EPS ? [W1, f1] : W2.L > W1.L + EPS ? [W2, f2] : (W1.id < W2.id ? [W1, f1] : [W2, f2]); why = "longer"; }
    const isSwapped = swapped.has(id);
    if (isSwapped) pick = pick[0] === W1 ? [W2, f2] : [W1, f1];
    corners.push({ ...base, angleDeg: r1((Math.asin(Math.min(1, sinC)) * 180) / Math.PI), studWallId: pick[0].id, studEnd: pick[1], why, swapped: isSwapped, multi: false });
  }

  // X crossings: the runs cross well inside both walls (neither end on the other)
  const crossings = [];
  for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
    const A = ws[i], B = ws[j];
    const den = cross(A.u, B.u);
    if (Math.abs(den) < minSin) continue;
    const sA = cross(sub(B.a, A.a), B.u) / den;
    const sB = cross(sub(B.a, A.a), A.u) / den;
    if (sA > tol && sA < A.L - tol && sB > tol && sB < B.L - tol) {
      crossings.push({ id: `cross:${A.id}+${B.id}`, kind: "X", wallIds: [A.id, B.id], stationMm: r1(sA) });
    }
  }
  // blocks: a T on a two-leg wall is ONE junction, so its blocks are counted once, on the leg the butting wall actually lands on
  const byId = new Map();
  for (const j of junctions) byId.set(j.id, [...(byId.get(j.id) || []), j]);
  for (const list of byId.values()) {
    const onLeg = (j) => { const L = ws.find((w) => w.id === j.continuousId)?.L ?? 0; return j.stationMm >= -EPS && j.stationMm <= L + EPS; };
    const owner = [...list].sort((p, q) => Number(onLeg(q)) - Number(onLeg(p)) || (p.continuousId < q.continuousId ? -1 : 1))[0];
    for (const j of list) j.ownsBlocks = j === owner;
  }
  return { junctions, corners, crossings };
}
