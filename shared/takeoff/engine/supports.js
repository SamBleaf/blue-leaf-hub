// =============================================================================
// shared/takeoff/engine/supports.js — support_grid@1 (TC-R04 05 B1–B4): battens, rails and other support
// layers on ONE wall surface, plus the two independent fixing demands (support-to-frame, cladding-to-support).
//
//   wall polygon + openings (local mm: x along the wall, y up)
//   → required stations: support-range ends, panel joints / mandatory supports, edge-zone transitions
//   → intermediate stations so NO gap exceeds the governing max spacing (selected phase kept when feasible;
//     a required station is never snapped away — conflicts are reported)
//   → each station line clipped to the wall polygon minus opening interiors → actual pieces (an opening splits
//     a support into upper/lower pieces; rakes give varying lengths)
//   → optional opening-perimeter members (jambs/head/sill) deduplicated ONLY against identical physical members
//     of the same layer (independent of drawing order) → split only at approved joints (else needs-joint-detail)
//     → one linear Demand per piece.
//
// Each layer is independent: a cavity layer coincident with studs is still its own purchase; existing supports
// are layout only (never purchased). A panel joint shares one support only when both panel edges fit its face.
// Edge zones are station-axis intervals whose rule row selects BOTH the support pitch and the fixing tuples.
// Fixings are counted from actual geometry (n = ceil(U/p)+1 when both ends are fixed) and box-rounded only after
// job-scope aggregation. An incomplete fixing spec is "fixings not quantified — detail required", never 0.
// Pure ESM: no DB, DOM, network or eval.
// =============================================================================
import { TakeoffValidationError, formatMm, isFiniteNumber } from "../units.js";
import { EPS_MM, LENGTH_KINDS, ceilTol, demandId, emptyResult, identityKey, problem } from "./contract.js";

export const SUPPORT_GRID_METHOD = Object.freeze({ key: "support_grid", version: 1 });
/** Generated elements per wall (06 proposed safeguard). Excess is rejected with split-wall guidance, never truncated. */
export const MAX_ELEMENTS_PER_WALL = 5000;
/** The exact wording B4 requires whenever a fixing quantity cannot be derived. */
export const FIXINGS_NOT_QUANTIFIED = "fixings not quantified — detail required";
/** Purchase identity a fastener must carry before it can be counted (B4: corrosion/material/length/head/substrate). */
export const FIXING_IDENTITY_FIELDS = Object.freeze(["material", "corrosionClass", "lengthMm", "head", "substrate"]);

const finite = isFiniteNumber;
const fmt = (mm) => `${formatMm(mm, 1)} mm`;
const round3 = (v) => Math.round(v * 1000) / 1000;
const cross = (ax, ay, bx, by) => ax * by - ay * bx;
const nonEmpty = (v) => v !== undefined && v !== null && v !== "";

// ── Outline geometry ──────────────────────────────────────────────────────────────────────────────────────────

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Signed distance of c from the line a→b (mm). */
const sideOf = (a, b, c) => cross(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y) / (Math.hypot(b.x - a.x, b.y - a.y) || 1);

function segmentsTouch(a, b, c, d) {
  const o1 = sideOf(a, b, c), o2 = sideOf(a, b, d), o3 = sideOf(c, d, a), o4 = sideOf(c, d, b);
  const opposite = (u, v) => (u > EPS_MM && v < -EPS_MM) || (u < -EPS_MM && v > EPS_MM);
  if (opposite(o1, o2) && opposite(o3, o4)) return true;
  return distToSegment(c, a, b) <= EPS_MM || distToSegment(d, a, b) <= EPS_MM || distToSegment(a, c, d) <= EPS_MM || distToSegment(b, c, d) <= EPS_MM;
}

function selfIntersects(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the closing edge
      if (segmentsTouch(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

/**
 * Normalise a wall or opening outline to a counter-clockwise point list in local wall mm (x along the wall,
 * y up). Accepts `{ polygon: [{x,y}…] }`, `{ x0, y0, x1, y1 }`, `{ xMm, sillMm, widthMm, heightMm }` (wall.js opening
 * form) or — walls only — `{ widthMm, heightMm }` from the origin. With `positioned: true` (openings) a bare width ×
 * height is rejected: an opening without a position is never silently placed at the wall origin.
 * Zero-sized or self-intersecting outlines throw TakeoffValidationError (C0: they require correction).
 * @returns {{ id: string|null, points: {x:number,y:number}[], bbox: {x0:number,y0:number,x1:number,y1:number}, rect: boolean }}
 */
export function normaliseOutline(src, label = "Wall", { positioned = false } = {}) {
  let pts;
  const box = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  if (Array.isArray(src?.polygon)) pts = src.polygon.map((p) => ({ x: p?.x, y: p?.y }));
  else if ([src?.x0, src?.y0, src?.x1, src?.y1].every(finite)) pts = box(Math.min(src.x0, src.x1), Math.min(src.y0, src.y1), Math.max(src.x0, src.x1), Math.max(src.y0, src.y1));
  else if ([src?.xMm, src?.sillMm, src?.widthMm, src?.heightMm].every(finite)) pts = box(src.xMm, src.sillMm, src.xMm + src.widthMm, src.sillMm + src.heightMm);
  else if (finite(src?.widthMm) && finite(src?.heightMm)) {
    if (positioned) throw new TakeoffValidationError(`${label} has a size but no position — enter its xMm and sillMm (or corners).`);
    pts = box(0, 0, src.widthMm, src.heightMm);
  } else throw new TakeoffValidationError(`${label} outline is missing.`);
  if (!pts.every((p) => finite(p.x) && finite(p.y))) throw new TakeoffValidationError(`${label} outline has an invalid point.`);
  pts = pts.filter((p, i) => Math.hypot(p.x - pts[(i + 1) % pts.length].x, p.y - pts[(i + 1) % pts.length].y) > EPS_MM);
  if (pts.length < 3 || pts.length > 1000) throw new TakeoffValidationError(`${label} outline needs 3 to 1,000 distinct points.`);
  const area = signedArea(pts);
  if (Math.abs(area) <= EPS_MM) throw new TakeoffValidationError(`${label} has no area — correct its size.`);
  if (selfIntersects(pts)) throw new TakeoffValidationError(`${label} outline crosses itself — correct it.`);
  if (area < 0) pts.reverse();
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const bbox = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  const rect = pts.length === 4 && pts.every((p, i) => {
    const q = pts[(i + 1) % 4];
    return Math.abs(p.x - q.x) <= EPS_MM || Math.abs(p.y - q.y) <= EPS_MM;
  });
  return { id: src.id ?? null, points: pts, bbox, rect };
}

function onBoundary(p, poly) {
  for (let i = 0; i < poly.length; i++) if (distToSegment(p, poly[i], poly[(i + 1) % poly.length]) <= EPS_MM) return true;
  return false;
}

function crossingInside(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const insideClosed = (p, poly) => onBoundary(p, poly) || crossingInside(p, poly);
const insideOpen = (p, poly) => !onBoundary(p, poly) && crossingInside(p, poly);

/**
 * Portions of the segment P→Q inside the CLOSED wall polygon, split by opening INTERIORS (a support on an
 * opening's edge line is not cut by it). Distances are mm from P. Overlapping openings form one union cut.
 * @returns {Array<{ fromMm: number, toMm: number, state: "in"|"cut"|"out", openingIds: string[] }>} ordered spans
 */
export function segmentCover(p, q, wallPts, openings = []) {
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  if (len <= EPS_MM) return [];
  const ux = (q.x - p.x) / len, uy = (q.y - p.y) / len;
  const ts = [0, len];
  const hits = (poly) => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ex = b.x - a.x, ey = b.y - a.y, apx = a.x - p.x, apy = a.y - p.y;
      const d = cross(ux, uy, ex, ey);
      if (Math.abs(d) <= 1e-12 * Math.hypot(ex, ey)) {
        if (Math.abs(cross(ux, uy, apx, apy)) <= EPS_MM) ts.push(apx * ux + apy * uy, (b.x - p.x) * ux + (b.y - p.y) * uy);
        continue;
      }
      const s = cross(apx, apy, ux, uy) / d;
      if (s >= -1e-9 && s <= 1 + 1e-9) ts.push(cross(apx, apy, ex, ey) / d);
    }
  };
  hits(wallPts);
  for (const o of openings) hits(o.points);
  const cuts = ts.filter((t) => t >= -EPS_MM && t <= len + EPS_MM).map((t) => Math.min(len, Math.max(0, t))).sort((a, b) => a - b);
  const uniq = [];
  for (const t of cuts) if (!uniq.length || t - uniq[uniq.length - 1] > EPS_MM) uniq.push(t);
  uniq[uniq.length - 1] = len;
  const spans = [];
  for (let i = 0; i + 1 < uniq.length; i++) {
    const m = (uniq[i] + uniq[i + 1]) / 2;
    const pt = { x: p.x + m * ux, y: p.y + m * uy };
    let state = "out", openingIds = [];
    if (insideClosed(pt, wallPts)) {
      openingIds = openings.filter((o) => insideOpen(pt, o.points)).map((o) => o.id);
      state = openingIds.length ? "cut" : "in";
    }
    const prev = spans[spans.length - 1];
    if (prev && prev.state === state && (state !== "cut" || prev.openingIds.join() === openingIds.join())) prev.toMm = uniq[i + 1];
    else spans.push({ fromMm: uniq[i], toMm: uniq[i + 1], state, openingIds });
  }
  return spans;
}

function segmentIntersectionX(a, b, c, d) {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const den = cross(rx, ry, sx, sy);
  if (Math.abs(den) <= 1e-12) return null;
  const t = cross(c.x - a.x, c.y - a.y, sx, sy) / den, u = cross(c.x - a.x, c.y - a.y, rx, ry) / den;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? a.x + t * rx : null;
}

/**
 * Exact gross / opening / net areas (mm²): opening area is the UNION of openings clipped to the wall, so
 * overlapping openings are never deducted twice. Integrates exact cross-sections between every vertex and
 * edge-intersection abscissa (the covered length is linear inside each slab).
 */
export function surfaceAreas(wall, openings = []) {
  const grossMm2 = signedArea(wall.points);
  let openingMm2 = 0;
  if (openings.length) {
    const edges = (pts) => pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
    const all = [wall.points, ...openings.map((o) => o.points)];
    const xs = all.flat().map((p) => p.x);
    const wallEdges = edges(wall.points);
    const openingEdges = openings.flatMap((o) => edges(o.points));
    for (const [a, b] of openingEdges) {
      for (const [c, d] of [...wallEdges, ...openingEdges]) {
        const x = segmentIntersectionX(a, b, c, d);
        if (x !== null) xs.push(x);
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i++) {
      const w = xs[i + 1] - xs[i];
      if (w <= EPS_MM) continue;
      const xm = (xs[i] + xs[i + 1]) / 2;
      const spans = segmentCover({ x: xm, y: wall.bbox.y0 }, { x: xm, y: wall.bbox.y1 }, wall.points, openings);
      openingMm2 += spans.filter((s) => s.state === "cut").reduce((t, s) => t + s.toMm - s.fromMm, 0) * w;
    }
  }
  return { grossMm2, openingMm2, netMm2: grossMm2 - openingMm2 };
}

/**
 * Validate openings against a normalised wall. Invalid or wholly-outside openings become blocking problems
 * (C0: they require correction) and are left out of clipping; a boundary-touching opening is valid. A repeated
 * opening id is a blocking problem (ids name demands and source refs); the repeat keeps its geometry under a
 * disambiguated id so clipping stays correct while the user fixes it.
 * @returns {Array<{ id: string, points: object[], bbox: object, rect: boolean, wallId?: string, raw: object }>}
 */
export function prepareOpenings(wall, openings, problems) {
  const out = [];
  const seen = new Map();
  (openings || []).forEach((o, i) => {
    const label = `Opening ${o?.id ?? i + 1}`;
    try {
      const n = normaliseOutline(o, label, { positioned: true });
      const id = o.id ?? `opening-${i + 1}`;
      const repeat = seen.get(String(id)) ?? 0;
      seen.set(String(id), repeat + 1);
      n.id = repeat ? `${id}~${repeat + 1}` : id;
      n.raw = o;
      if (repeat) problems.push(problem("opening-duplicate-id", `Two openings on this wall are both called ${id} — give each its own id.`, { refs: [{ openingId: id }] }));
      if (surfaceAreas(wall, [n]).openingMm2 <= EPS_MM) problems.push(problem("opening-outside-wall", `${label} is wholly outside the wall — correct it.`, { refs: [{ openingId: n.id }] }));
      else out.push(n);
    } catch (e) {
      if (!(e instanceof TakeoffValidationError)) throw e;
      problems.push(problem("opening-invalid", e.message, { refs: [{ openingId: o?.id ?? null }] }));
    }
  });
  return out;
}

// ── Shared status / stock helpers (also used by accessories.js) ────────────────────────────────────────────────

/**
 * Installation status (06) from an authority record `{ kind: "rule"|"project-detail", ref, reviewed }`.
 * Only a REVIEWED rule row supports the selection; anything unsourced stays source-pending/unspecified.
 */
export function installationStatus(authority, { pending = false } = {}) {
  if (!authority) return "unspecified";
  if (authority.kind === "project-detail" && nonEmpty(authority.ref)) return "project-detail-supplied";
  if (authority.kind === "rule" && authority.reviewed === true && nonEmpty(authority.ref)) return pending ? "source-pending" : "supported-by-selected-rule";
  return "source-pending";
}

/**
 * Longest single stock piece a StockPolicy can supply: Infinity when the policy sets no maximum (open grid,
 * random-length LM supply); null when the policy is absent, of an unknown kind or carries a non-positive or
 * non-numeric length (a bad stock list must never silently skip the needs-joint-detail check).
 */
export function maxStockLengthMm(policy) {
  if (!policy) return null;
  const pos = (v) => finite(v) && v > 0;
  if (policy.kind === "fixed") return pos(policy.lengthMm) ? policy.lengthMm : null;
  if (policy.kind === "list") return Array.isArray(policy.lengthsMm) && policy.lengthsMm.length && policy.lengthsMm.every(pos) ? Math.max(...policy.lengthsMm) : null;
  if (policy.kind === "grid") return policy.maxMm == null ? Infinity : pos(policy.maxMm) ? policy.maxMm : null;
  if (policy.kind === "random") return Infinity;
  return null;
}

// ── B1 required stations ─────────────────────────────────────────────────────────────────────────────────────

function normaliseZones(zones, fromMm, toMm, explain) {
  const out = [];
  (zones || []).forEach((z, i) => {
    if (![z?.fromMm, z?.toMm].every(finite) || z.toMm <= z.fromMm) throw new TakeoffValidationError(`Edge zone ${i + 1} needs a start and an end.`);
    if (!finite(z.maxSpacingMm) || z.maxSpacingMm <= 0) throw new TakeoffValidationError(`Edge zone ${i + 1} needs a support spacing greater than 0.`);
    const lo = Math.max(z.fromMm, fromMm), hi = Math.min(z.toMm, toMm);
    if (hi - lo <= EPS_MM) { explain.push(`Edge zone ${z.ruleRef ?? i + 1} lies outside the support range — not applied.`); return; }
    out.push({ index: i, fromMm: lo, toMm: hi, maxSpacingMm: z.maxSpacingMm, ruleRef: z.ruleRef ?? null, phaseMm: finite(z.phaseMm) ? z.phaseMm : lo, fixing: z.fixing ?? null });
  });
  return out;
}

/** The most stringent (smallest spacing) zone covering [a, b] (a point when a === b); null = general area. */
function governingZone(zones, a, b) {
  let best = null;
  for (const z of zones) {
    const hit = a === b ? a >= z.fromMm - EPS_MM && a <= z.toMm + EPS_MM : Math.min(b, z.toMm) - Math.max(a, z.fromMm) > EPS_MM;
    if (hit && (!best || z.maxSpacingMm < best.maxSpacingMm)) best = z;
  }
  return best;
}

/**
 * B1/B2 station set along one axis. Mandatory stations = the range ends, every required station (panel joints,
 * terminal/corner or other mandatory supports) and every edge-zone transition inside the range ("a safe support
 * at transitions"). Between consecutive mandatory stations, intermediates are inserted on the selected phase grid
 * (phaseMm + k·spacing) so no gap exceeds the governing max spacing (the most stringent zone, else the layer).
 * If the phase would put a support closer than minGapMm to a mandatory station, that interval is spaced equally
 * instead and a non-blocking "phase-not-preserved" problem says so; if even equal bays cannot respect both the
 * max spacing and minGapMm, a blocking "spacing-constraints-incompatible" problem is raised. Required stations are
 * NEVER moved or dropped: one outside the range or two closer than minGapMm are reported as blocking problems.
 * A required station may carry minFaceWidthMm (support face both panel edges need: 2 × fastener edge distance +
 * joint gap, from the row) — supportGrid checks it against the layer's face width × plies (B1 shared support).
 * @param {{ fromMm: number, toMm: number, requiredMm?: Array<number|{atMm:number, ref?:string, plies?:number, minFaceWidthMm?:number}>, maxSpacingMm: number,
 *           phaseMm?: number, zones?: Array<{fromMm:number, toMm:number, maxSpacingMm:number, ruleRef?:string, phaseMm?:number}>,
 *           minGapMm?: number, maxStations?: number }} input
 * @returns {{ stations: Array<{ atMm: number, kinds: string[], refs: string[], plies: number, minFaceWidthMm: number|null, zoneRef: string|null, zoneIndex: number|null, maxSpacingMm: number }>,
 *             problems: object[], explain: string[] }}
 */
export function requiredStations({ fromMm, toMm, requiredMm = [], maxSpacingMm, phaseMm, zones = [], minGapMm = 0, maxStations = MAX_ELEMENTS_PER_WALL }) {
  if (!finite(fromMm) || !finite(toMm)) throw new TakeoffValidationError("Support range start and end must be numbers.");
  if (toMm < fromMm - EPS_MM) throw new TakeoffValidationError("Support start/end offsets leave no room on this wall.");
  if (!finite(maxSpacingMm) || maxSpacingMm <= 0) throw new TakeoffValidationError("Support spacing must be greater than 0.");
  if (!finite(minGapMm) || minGapMm < 0) throw new TakeoffValidationError("Minimum support gap must be 0 or more.");
  const problems = [], explain = [];
  const z = normaliseZones(zones, fromMm, toMm, explain);
  const phase = finite(phaseMm) ? phaseMm : fromMm;

  const mandatory = [{ atMm: fromMm, kinds: ["end"], refs: [], plies: 1, minFaceWidthMm: null }];
  if (toMm - fromMm > EPS_MM) mandatory.push({ atMm: toMm, kinds: ["end"], refs: [], plies: 1, minFaceWidthMm: null });
  for (const r of requiredMm || []) {
    const at = typeof r === "number" ? r : r?.atMm;
    const ref = typeof r === "object" && r ? r.ref ?? null : null;
    const plies = typeof r === "object" && r && r.plies != null ? r.plies : 1;
    const face = typeof r === "object" && r && r.minFaceWidthMm != null ? r.minFaceWidthMm : null;
    if (!finite(at)) throw new TakeoffValidationError("A required support station is not a number.");
    if (!Number.isInteger(plies) || plies < 1) throw new TakeoffValidationError("Support plies must be a whole number of 1 or more.");
    if (face !== null && !(finite(face) && face > 0)) throw new TakeoffValidationError("A joint's minimum support face width must be greater than 0.");
    if (at < fromMm - EPS_MM || at > toMm + EPS_MM) {
      problems.push(problem("required-station-outside", `Required support${ref ? ` ${ref}` : ""} at ${fmt(at)} is outside the support range ${fmt(fromMm)}–${fmt(toMm)} — check the offsets or the joint; it was not moved.`, { refs: [{ station: at, role: ref }] }));
      continue;
    }
    mandatory.push({ atMm: at, kinds: ["required"], refs: ref ? [ref] : [], plies, minFaceWidthMm: face });
  }
  for (const zone of z) for (const b of [zone.fromMm, zone.toMm]) if (b > fromMm + EPS_MM && b < toMm - EPS_MM) mandatory.push({ atMm: b, kinds: ["transition"], refs: zone.ruleRef ? [zone.ruleRef] : [], plies: 1, minFaceWidthMm: null });

  mandatory.sort((a, b) => a.atMm - b.atMm);
  const fixed = [];
  for (const m of mandatory) {
    const prev = fixed[fixed.length - 1];
    if (prev && m.atMm - prev.atMm <= EPS_MM) {
      prev.kinds = [...new Set([...prev.kinds, ...m.kinds])];
      prev.refs = [...new Set([...prev.refs, ...m.refs])];
      prev.plies = Math.max(prev.plies, m.plies);
      if (m.minFaceWidthMm !== null) prev.minFaceWidthMm = Math.max(prev.minFaceWidthMm ?? 0, m.minFaceWidthMm);
    } else fixed.push({ ...m });
  }
  for (let i = 0; i + 1 < fixed.length; i++) {
    const gap = fixed[i + 1].atMm - fixed[i].atMm;
    if (gap < minGapMm - EPS_MM) {
      problems.push(problem("required-stations-conflict", `Mandatory supports at ${fmt(fixed[i].atMm)} and ${fmt(fixed[i + 1].atMm)} are ${fmt(gap)} apart, under the ${fmt(minGapMm)} minimum — a double/wider support detail is required; neither was moved.`, { refs: [{ station: fixed[i].atMm }, { station: fixed[i + 1].atMm }] }));
    }
  }

  let estimate = fixed.length;
  for (let i = 0; i + 1 < fixed.length; i++) {
    const g = governingZone(z, fixed[i].atMm, fixed[i + 1].atMm);
    estimate += Math.ceil((fixed[i + 1].atMm - fixed[i].atMm) / (g ? g.maxSpacingMm : maxSpacingMm)) + 1;
  }
  if (estimate > maxStations) {
    problems.push(problem("too-many-elements", `This layer would generate about ${estimate.toLocaleString("en-AU")} supports (limit ${maxStations.toLocaleString("en-AU")}) — split the wall or check the spacing.`));
    return { stations: [], problems, explain };
  }

  const stations = [];
  const stationOf = (at, kinds, refs, plies, minFaceWidthMm = null) => {
    const g = governingZone(z, at, at);
    return { atMm: at, kinds, refs, plies, minFaceWidthMm, zoneRef: g ? g.ruleRef : null, zoneIndex: g ? g.index : null, maxSpacingMm: g ? g.maxSpacingMm : maxSpacingMm };
  };
  let inserted = 0;
  for (let i = 0; i < fixed.length; i++) {
    const a = fixed[i];
    stations.push(stationOf(a.atMm, a.kinds, a.refs, a.plies, a.minFaceWidthMm));
    const b = fixed[i + 1];
    if (!b) break;
    const gap = b.atMm - a.atMm;
    const g = governingZone(z, a.atMm, b.atMm);
    const sp = g ? g.maxSpacingMm : maxSpacingMm;
    if (gap <= sp + EPS_MM) continue;
    const ph = g ? g.phaseMm : phase;
    let pts = [];
    for (let k = Math.ceil((a.atMm + EPS_MM - ph) / sp); ; k++) {
      const at = ph + k * sp;
      if (at >= b.atMm - EPS_MM) break;
      pts.push(at);
    }
    if (minGapMm > 0 && pts.length && (pts[0] - a.atMm < minGapMm - EPS_MM || b.atMm - pts[pts.length - 1] < minGapMm - EPS_MM)) {
      const n = ceilTol(gap / sp);
      pts = Array.from({ length: n - 1 }, (_, k) => a.atMm + ((k + 1) * gap) / n);
      problems.push(problem("phase-not-preserved", `Between ${fmt(a.atMm)} and ${fmt(b.atMm)} the selected ${fmt(sp)} centres would place a support within ${fmt(minGapMm)} of a required support, so ${n} equal bays of ${fmt(gap / n)} were used.`, { blocking: false, refs: [{ station: a.atMm }, { station: b.atMm }] }));
      if (gap / n < minGapMm - EPS_MM) {
        problems.push(problem("spacing-constraints-incompatible", `Between ${fmt(a.atMm)} and ${fmt(b.atMm)} no support layout keeps every gap at most ${fmt(sp)} and at least ${fmt(minGapMm)} — a project detail is required.`, { refs: [{ station: a.atMm }, { station: b.atMm }] }));
      }
    }
    for (const at of pts) stations.push(stationOf(at, ["intermediate"], [], 1));
    inserted += pts.length;
  }
  explain.push(`${stations.length} support station${stations.length === 1 ? "" : "s"} from ${fmt(fromMm)} to ${fmt(toMm)}: ${fixed.length} mandatory (ends, required supports, zone transitions) + ${inserted} inserted so no gap exceeds ${fmt(maxSpacingMm)}${z.length ? ` (${z.map((x) => `${x.ruleRef ?? "zone"} ${fmt(x.fromMm)}–${fmt(x.toMm)} at ≤ ${fmt(x.maxSpacingMm)}`).join("; ")})` : ""}.`);
  return { stations, problems, explain };
}

// ── B4 fixings ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Fixings along one line of usable fixing length U at a pitch: n = ceil(U/p) + 1 when both endpoints must be
 * fixed; ceil(U/p) when only one end is (the other end's fixing belongs to the adjoining line). Float noise only
 * is tolerated (contract.ceilTol).
 */
export function fixingsAlongLine(usableMm, pitchMm, { bothEnds = true } = {}) {
  if (!finite(usableMm) || usableMm < 0) throw new TakeoffValidationError("Usable fixing length must be 0 or more.");
  if (!finite(pitchMm) || pitchMm <= 0) throw new TakeoffValidationError("Fixing pitch must be greater than 0.");
  const bays = Math.max(0, ceilTol(usableMm / pitchMm));
  return bothEnds ? bays + 1 : bays;
}

/** Boxes to order: ceil(total × (1 + spareRate) / boxSize). Apply AFTER aggregating compatible fixings across the job scope. */
export function boxesFor(total, spareRate, boxSize) {
  if (!Number.isInteger(total) || total < 0) throw new TakeoffValidationError("Fixing total must be a whole number of 0 or more.");
  if (!finite(spareRate) || spareRate < 0) throw new TakeoffValidationError("Spare rate must be an explicit number of 0 or more.");
  if (!Number.isInteger(boxSize) || boxSize < 1) throw new TakeoffValidationError("Box size must be a whole number of 1 or more.");
  return Math.max(0, ceilTol((total * (1 + spareRate)) / boxSize));
}

function fixingRuleGaps(rule) {
  const gaps = [];
  if (!rule) return ["no fixing rule selected"];
  const id = rule.identity;
  if (!id || typeof id !== "object") gaps.push("fastener product");
  else for (const f of FIXING_IDENTITY_FIELDS) if (!nonEmpty(id[f])) gaps.push(`fastener ${f}`);
  if (!["pitch", "intersections", "pattern"].includes(rule.mode)) gaps.push("fixing pattern (pitch / intersections / prescribed pattern)");
  if (rule.mode === "pitch" && !(finite(rule.pitchMm) && rule.pitchMm > 0)) gaps.push("fixing pitch");
  if (rule.mode === "intersections" && !Array.isArray(rule.targetsMm)) gaps.push("frame member positions");
  if (rule.mode === "pattern" && !(Number.isInteger(rule.countPerLine) && rule.countPerLine >= 1)) gaps.push("prescribed fixings per member");
  if (rule.mode !== "pattern") for (const k of ["edgeStartMm", "edgeEndMm"]) if (!(finite(rule[k]) && rule[k] >= 0)) gaps.push(`edge distance (${k === "edgeStartMm" ? "start" : "end"})`);
  if (rule.perPoint != null && !(Number.isInteger(rule.perPoint) && rule.perPoint >= 1)) gaps.push("fixings per point");
  if (rule.extraPerLine != null && !(Number.isInteger(rule.extraPerLine) && rule.extraPerLine >= 0)) gaps.push("extra terminal fixings");
  if (rule.omitPerLine != null && !(Number.isInteger(rule.omitPerLine) && rule.omitPerLine >= 0)) gaps.push("corner omissions");
  if (rule.mode === "intersections" && Array.isArray(rule.targetsMm) && !rule.targetsMm.every(finite)) gaps.push("frame member positions (numbers)");
  return gaps;
}

/**
 * Fixings for a set of lines under ONE selected rule tuple (B4). Modes:
 *   pitch          n = fixingsAlongLine(len − edgeStart − edgeEnd, pitch, { bothEnds }) per line
 *   intersections  distinct frame members (targetsMm, along the line axis) crossing the usable part of each line
 *   pattern        the guide's prescribed count per line (countPerLine) — the generic formula is NOT applied
 * pitch/intersections: × perPoint (multiplicity) − omitPerLine (corner omissions); every mode + extraPerLine
 * (terminal fixings). An incomplete rule or fastener identity, a line shorter than its edge distances, or omissions
 * exceeding a line's fixings returns demand null with a "fixings not quantified — detail required" problem — never
 * a zero count. No lines at all is no demand (nothing to fix), not a zero-quantity line.
 * @param {{ id: string, materialId: string, role: string, label: string,
 *           lines: Array<{ id: string, startMm: number, endMm: number, sourceRefs?: object[] }>, rule: object }} input
 * @returns {{ demand: object|null, perLine: Array<{ lineId: string, fixings: number }>, problems: object[] }}
 */
export function fixingsDemand({ id, materialId, role, label, lines, rule }) {
  const gaps = fixingRuleGaps(rule);
  if (gaps.length) return { demand: null, perLine: [], problems: [problem("fixings-not-quantified", `${label}: ${FIXINGS_NOT_QUANTIFIED} (missing ${gaps.join(", ")}).`, { refs: [{ role }] })] };
  if (!lines?.length) return { demand: null, perLine: [], problems: [] };
  const perPoint = rule.perPoint ?? 1, extra = rule.extraPerLine ?? 0, omit = rule.omitPerLine ?? 0;
  const targets = rule.mode === "intersections" ? [...rule.targetsMm].sort((a, b) => a - b).filter((t, i, s) => i === 0 || t - s[i - 1] > EPS_MM) : null;
  const perLine = [], short = [], overOmitted = [];
  for (const l of lines) {
    let n;
    if (rule.mode === "pattern") n = rule.countPerLine;
    else {
      const lo = l.startMm + rule.edgeStartMm, hi = l.endMm - rule.edgeEndMm;
      if (hi - lo < -EPS_MM) { short.push(l.id); continue; }
      n = rule.mode === "pitch"
        ? fixingsAlongLine(Math.max(0, hi - lo), rule.pitchMm, { bothEnds: rule.bothEnds !== false })
        : targets.filter((t) => t >= lo - EPS_MM && t <= hi + EPS_MM).length;
      n = n * perPoint - omit;
      if (n < 0) { overOmitted.push(l.id); continue; }
    }
    perLine.push({ lineId: l.id, fixings: n + extra });
  }
  if (short.length || overOmitted.length) {
    const why = [short.length ? `${short.length} piece${short.length === 1 ? " is" : "s are"} shorter than the rule's edge distances` : null,
      overOmitted.length ? `the row omits more fixings than ${overOmitted.length} piece${overOmitted.length === 1 ? " has" : "s have"}` : null].filter(Boolean).join("; ");
    return { demand: null, perLine, problems: [problem("fixings-not-quantified", `${label}: ${FIXINGS_NOT_QUANTIFIED} (${why}).`, { refs: [...short, ...overOmitted].map((s) => ({ role: s })) })] };
  }
  const seen = new Set(), sourceRefs = [];
  for (const l of lines) for (const r of l.sourceRefs || []) { const k = identityKey(r); if (!seen.has(k)) { seen.add(k); sourceRefs.push(r); } }
  const quantity = perLine.reduce((t, x) => t + x.fixings, 0);
  return {
    demand: { id, materialId, role, kind: "count", unit: "piece", quantity, identity: rule.identity, label: `${label}${rule.ruleRef ? ` (${rule.ruleRef})` : ""}`, sourceRefs, provenance: "calculated" },
    perLine,
    problems: [],
  };
}

/**
 * Aggregate compatible fixing demands across the selected job scope (same purchase identity), THEN box-round.
 * policyFor(identity) → { boxSize, spareRate } | null. Missing pack data is a procurement problem, not a guess.
 * @returns {{ lines: Array<{ identityKey: string, identity: object, fixings: number, demandIds: string[], boxSize: number|null, spareRate: number|null, boxes: number|null }>, problems: object[] }}
 */
export function aggregateFixings(demands, policyFor = () => null) {
  const groups = new Map();
  for (const d of demands || []) {
    if (d?.kind !== "count" || !String(d.role || "").startsWith("fixing")) continue;
    const key = identityKey(d.identity);
    const g = groups.get(key) || { identityKey: key, identity: d.identity, fixings: 0, demandIds: [] };
    g.fixings += d.quantity;
    g.demandIds.push(d.id);
    groups.set(key, g);
  }
  const problems = [];
  const lines = [...groups.values()].map((g) => {
    const policy = policyFor(g.identity);
    if (!policy || !Number.isInteger(policy.boxSize) || policy.boxSize < 1 || !finite(policy.spareRate) || policy.spareRate < 0) {
      problems.push(problem("fixing-pack-missing", `Box size and an explicit spare rate are needed to order ${g.fixings} fixings.`, { refs: g.demandIds.map((d) => ({ role: d })) }));
      return { ...g, boxSize: policy?.boxSize ?? null, spareRate: policy?.spareRate ?? null, boxes: null };
    }
    return { ...g, boxSize: policy.boxSize, spareRate: policy.spareRate, boxes: boxesFor(g.fixings, policy.spareRate, policy.boxSize) };
  });
  return { lines, problems };
}

// ── support_grid@1 ───────────────────────────────────────────────────────────────────────────────────────────

const EDGE_ROLES = Object.freeze({ left: "jamb-left", right: "jamb-right", head: "head", sill: "sill" });

/** Pieces of one station line (absolute coordinates along the line axis) with what bounds each end. */
function linePieces(W, ops, vertical, at, lo, hi) {
  const p = vertical ? { x: at, y: lo } : { x: lo, y: at };
  const q = vertical ? { x: at, y: hi } : { x: hi, y: at };
  const spans = segmentCover(p, q, W.points, ops);
  const bound = (s) => (s && s.state === "cut" ? { type: "opening", ids: s.openingIds } : { type: "wall", ids: [] });
  return spans.flatMap((s, i) => (s.state === "in" ? [{ fromMm: lo + s.fromMm, toMm: lo + s.toMm, start: bound(spans[i - 1]), end: bound(spans[i + 1]) }] : []));
}

/** Movement/floor joints are tagged breaks: a support is never bridged across one. */
function applyBreaks(pieces, breaks) {
  let out = pieces;
  for (const b of breaks || []) {
    if (!finite(b?.atMm)) throw new TakeoffValidationError("A movement/floor joint break needs a position.");
    if (b.gapMm != null && !(finite(b.gapMm) && b.gapMm >= 0)) throw new TakeoffValidationError("A movement/floor joint gap must be 0 mm or more.");
    const half = (b.gapMm ?? 0) / 2;
    out = out.flatMap((pc) => {
      if (b.atMm - half >= pc.toMm - EPS_MM || b.atMm + half <= pc.fromMm + EPS_MM) return [pc];
      const brk = { type: "break", ids: b.ref ? [b.ref] : [] };
      return [{ ...pc, toMm: b.atMm - half, end: brk }, { ...pc, fromMm: b.atMm + half, start: brk }].filter((x) => x.toMm - x.fromMm > EPS_MM);
    });
  }
  return out;
}

/** Detail cut-backs: endCutsMm at the wall boundary, openingGapMm where a piece stops at an opening. */
function applyCuts(pieces, layer) {
  const cuts = layer.endCutsMm || {};
  for (const k of ["start", "end"]) if (cuts[k] != null && !(finite(cuts[k]) && cuts[k] >= 0)) throw new TakeoffValidationError("Support end cut-backs must be 0 mm or more — a support never extends past the wall.");
  const gap = layer.openingGapMm ?? 0;
  const trim = (bd, wallCut) => (bd.type === "wall" ? wallCut ?? 0 : bd.type === "opening" ? gap : 0);
  return pieces.map((pc) => ({ ...pc, fromMm: pc.fromMm + trim(pc.start, cuts.start), toMm: pc.toMm - trim(pc.end, cuts.end) })).filter((pc) => pc.toMm - pc.fromMm > EPS_MM);
}

/** Split one piece at approved joint positions so every part fits the longest stock; null part list = needs detail. */
function splitAtJoints(pc, maxStock, jointPolicy) {
  if (!(pc.toMm - pc.fromMm > maxStock + EPS_MM)) return { parts: [pc], joints: [] };
  const positions = Array.isArray(jointPolicy?.positionsMm) ? [...jointPolicy.positionsMm].filter(finite).sort((a, b) => a - b) : null;
  if (!positions) return { parts: null, joints: [] };
  const parts = [], joints = [];
  let cur = pc.fromMm, start = pc.start;
  while (pc.toMm - cur > maxStock + EPS_MM) {
    const next = positions.filter((x) => x > cur + EPS_MM && x < pc.toMm - EPS_MM && x - cur <= maxStock + EPS_MM).pop();
    if (next === undefined) return { parts: null, joints };
    const j = { type: "joint", ids: jointPolicy.ref ? [jointPolicy.ref] : [] };
    parts.push({ ...pc, fromMm: cur, toMm: next, start, end: j });
    joints.push(next);
    cur = next; start = j;
  }
  parts.push({ ...pc, fromMm: cur, start });
  return { parts, joints };
}

function pieceLabel(vertical, at, pc) {
  const where = [];
  if (pc.start.type === "opening") where.push(`${vertical ? "above" : "right of"} ${pc.start.ids.join("/")}`);
  if (pc.end.type === "opening") where.push(`${vertical ? "below" : "left of"} ${pc.end.ids.join("/")}`);
  return `@ ${fmt(at)}${where.length ? ` — ${where.join(", ")}` : ""}`;
}

/**
 * support_grid@1 — one support layer on one wall (B1–B4).
 * wall: { id (required: demand ids and source refs derive from it), polygon | x0,y0,x1,y1 | widthMm,heightMm }.
 * layer: { id, materialId?, role? = "support", orientation: "vertical"|"horizontal", identity, stockPolicy,
 *   maxSpacingMm, phaseMm?, startOffsetMm? = 0, endOffsetMm? = 0 (centreline offsets along the station axis),
 *   minGapMm? (centrelines closer than this clash, e.g. the section width), requiredStationsMm?: (number|{atMm, ref, plies, minFaceWidthMm})[],
 *   faceWidthMm? (support face; a joint's minFaceWidthMm must fit within faceWidth × plies, else a double/wider support is required),
 *   edgeZones?: [{ fromMm, toMm, maxSpacingMm, ruleRef, phaseMm?, fixing, claddingFixing? }] (station-axis intervals; each row = spacing + fixing tuple),
 *   existing?: boolean (layout only, never purchased), authority?: { kind, ref, reviewed },
 *   endCutsMm?: { start, end } (cut-back at the wall boundary), openingGapMm?, breaks?: [{ atMm, gapMm?, ref }] (movement/floor
 *   joints, along the line axis — never bridged), jointPolicy?: { positionsMm, ref } (approved joints, along the line axis),
 *   minPieceLengthMm?, openingMembers?: { edges: ("left"|"right"|"head"|"sill")[], extendMm?, openingIds? },
 *   attachmentTargetsMm? (frame members crossing each support, along the line axis), supportSpanMm? (max span between
 *   attachments), minAttachments? (narrow strips: attachment count can govern),
 *   fixing?: FixingRule (support-to-frame), fixingScope?: { status: "include"|"by-others"|"exclude", reason },
 *   claddingFixing?: FixingRule|null (cladding-to-support), claddingFixingScope?, claddingLayout?: { rowsMm?, panelJointsMm? }
 *   (along the line axis: cladding fixing rows crossing the supports — the default intersection targets — and panel
 *   edges, which split pitch-mode lines per panel), manualLayout?: { stationsMm, authority } | { count, lengthMm, authority }
 *   (reviewed layout when no spacing row exists — AAC rails) }
 * Returns a MethodResult: one linear "cut" Demand per clipped piece (stockPolicy passed through, noSplice), one count
 * Demand of fixings per rule tuple for each of the two independent B4 demands, layout.lines for the elevation view and
 * layout.fixings recording each fixing demand's scope/state. Cladding-to-support fixings are evaluated only when the
 * layer names them (claddingFixing present — null means "required, not yet specified" — or a claddingFixingScope);
 * otherwise layout.fixings records them as not part of this layer.
 */
export function supportGrid(wall, openings = [], layerIn = {}, opts = {}) {
  const res = emptyResult();
  const { problems, explain, demands } = res;
  const layer = layerIn ?? {};
  const maxElements = opts?.maxElements ?? MAX_ELEMENTS_PER_WALL;
  let blocked = false, fixingsOpen = false, estimate = false;
  const authority = layer.manualLayout?.authority ?? layer.authority;
  try {
    if (!nonEmpty(wall?.id)) throw new TakeoffValidationError("The wall needs an id — support demand ids and source refs are derived from it.");
    if (!nonEmpty(layer.id)) throw new TakeoffValidationError("The support layer needs an id.");
    if (layer.orientation !== "vertical" && layer.orientation !== "horizontal") throw new TakeoffValidationError("Support orientation must be vertical or horizontal.");
    const W = normaliseOutline(wall, "Wall");
    const wallId = wall.id;
    const ops = prepareOpenings(W, openings, problems);
    if (problems.length) blocked = true;
    const vertical = layer.orientation === "vertical";
    const materialId = layer.materialId ?? layer.id;
    const role = layer.role ?? "support";
    const existing = layer.existing === true;
    const [axisLo, axisHi, lineLo, lineHi] = vertical ? [W.bbox.x0, W.bbox.x1, W.bbox.y0, W.bbox.y1] : [W.bbox.y0, W.bbox.y1, W.bbox.x0, W.bbox.x1];
    for (const k of ["startOffsetMm", "endOffsetMm", "openingGapMm", "minGapMm"]) if (layer[k] != null && !(finite(layer[k]) && layer[k] >= 0)) throw new TakeoffValidationError(`${k} must be 0 or more.`);
    if (layer.faceWidthMm != null && !(finite(layer.faceWidthMm) && layer.faceWidthMm > 0)) throw new TakeoffValidationError("Support face width must be greater than 0.");
    const fromMm = axisLo + (layer.startOffsetMm ?? 0), toMm = axisHi - (layer.endOffsetMm ?? 0);
    const maxStock = maxStockLengthMm(layer.stockPolicy);
    res.layout = { method: `${SUPPORT_GRID_METHOD.key}@${SUPPORT_GRID_METHOD.version}`, wallId, layerId: layer.id, orientation: layer.orientation, existing, range: { fromMm, toMm }, stations: [], lines: [], joints: [], fixings: {} };

    // Station set: rule spacing, else a reviewed manual layout, else unresolved (no invented default).
    let stations = null, zones = [], entered = null, countZones = false;
    const manual = layer.manualLayout;
    if (manual) {
      if (!nonEmpty(manual.authority?.ref)) problems.push(problem("manual-layout-authority-missing", "A manual support layout needs its authority (designer / supplier / project detail reference)."));
      if (Array.isArray(manual.stationsMm)) {
        if (!manual.stationsMm.every(finite)) throw new TakeoffValidationError("Manual support stations must be numbers.");
        normaliseZones(layer.edgeZones, fromMm, toMm, explain); // validates; zone rows still select each station's fixing tuple
        zones = layer.edgeZones || [];
        const off = manual.stationsMm.filter((at) => at < axisLo - EPS_MM || at > axisHi + EPS_MM);
        if (off.length) {
          problems.push(problem("manual-station-outside", `Entered support station${off.length === 1 ? "" : "s"} ${off.map(fmt).join(", ")} ${off.length === 1 ? "is" : "are"} off this wall (${fmt(axisLo)}–${fmt(axisHi)}) — correct the layout.`, { refs: off.map((at) => ({ wallId, station: at })) }));
          blocked = true;
        }
        stations = [...new Set(manual.stationsMm)].sort((a, b) => a - b).map((at) => ({ atMm: at, kinds: ["manual"], refs: [], plies: 1, minFaceWidthMm: null, zoneRef: null, zoneIndex: null, maxSpacingMm: null }));
        explain.push(`Manual support layout (${manual.authority?.ref ?? "authority missing"}): ${stations.length} stations as entered — no spacing rule applied.`);
      } else if (Number.isInteger(manual.count) && manual.count >= 1 && finite(manual.lengthMm) && manual.lengthMm > 0) {
        const label = `${role} ${manual.count} × ${fmt(manual.lengthMm)} (entered)`;
        const dp = [];
        if (!existing && maxStock !== null && manual.lengthMm > maxStock + EPS_MM) {
          dp.push(problem("needs-joint-detail", `${label}: ${fmt(manual.lengthMm)} is longer than the longest permitted stock (${fmt(maxStock)}) and an entered count has no approved joint positions — joint detail required.`, { refs: [{ wallId, role: layer.id }] }));
          blocked = true;
        }
        problems.push(...dp);
        entered = { id: existing ? null : demandId(materialId, wallId, layer.id, "manual"), count: manual.count, lengthMm: manual.lengthMm };
        if (!existing) {
          demands.push({ id: entered.id, materialId, role, kind: "linear", unit: "piece", lengthMm: manual.lengthMm, quantity: manual.count, lengthKind: LENGTH_KINDS.CUT,
            identity: layer.identity ?? null, stockPolicy: layer.stockPolicy, noSplice: true, label, sourceRefs: [{ wallId, role: layer.id }], provenance: "manual", ...(dp.length ? { problems: dp } : {}) });
        }
        if ((layer.edgeZones || []).length) {
          countZones = true;
          problems.push(problem("zone-needs-stations", `An entered support count has no positions, so its edge-zone rows (spacing + fixing) cannot be applied — ${FIXINGS_NOT_QUANTIFIED}; enter the station positions instead.`, { refs: [{ wallId, role: layer.id }] }));
          fixingsOpen = true;
        }
        explain.push(`Entered support quantity ${manual.count} × ${fmt(manual.lengthMm)} (${manual.authority?.ref ?? "authority missing"}) — not derived from wall geometry.`);
        estimate = true;
      } else throw new TakeoffValidationError("A manual support layout needs station positions, or a count and a length.");
    } else if (finite(layer.maxSpacingMm)) {
      const r = requiredStations({ fromMm, toMm, requiredMm: layer.requiredStationsMm, maxSpacingMm: layer.maxSpacingMm, phaseMm: layer.phaseMm, zones: layer.edgeZones, minGapMm: layer.minGapMm ?? 0, maxStations: maxElements });
      stations = r.stations; problems.push(...r.problems); explain.push(...r.explain);
      if (r.problems.some((x) => x.blocking)) blocked = true;
      zones = layer.edgeZones || [];
    } else {
      problems.push(problem("support-spacing-unresolved", "Support spacing is not set: select a reviewed rule row, or enter a reviewed designer/supplier layout or per-wall count and length. No default spacing is assumed."));
      blocked = true;
    }

    // B1 shared panel-joint support: both panel edges must fit the support face, else a double/wider support.
    for (const st of stations || []) {
      if (st.minFaceWidthMm == null) continue;
      const ref = st.refs.length ? ` (${st.refs.join(", ")})` : "";
      if (!finite(layer.faceWidthMm)) problems.push(problem("support-face-width-missing", `Joint support at ${fmt(st.atMm)}${ref} needs ${fmt(st.minFaceWidthMm)} of face for both panel edges, but this support's face width is not set — sharing one support is not checked.`, { refs: [{ wallId, station: st.atMm }] }));
      else if (layer.faceWidthMm * st.plies < st.minFaceWidthMm - EPS_MM) problems.push(problem("joint-support-too-narrow", `Joint support at ${fmt(st.atMm)}${ref}: ${st.plies} × ${fmt(layer.faceWidthMm)} face is under the ${fmt(st.minFaceWidthMm)} both panel edges need — a double or wider support is required.`, { refs: [{ wallId, station: st.atMm }] }));
      else continue;
      blocked = true;
    }

    // Station lines → clipped pieces → approved-joint splits → demands.
    const members = [], usedKeys = new Set();
    for (const st of stations || []) {
      let key = `@${round3(st.atMm)}`;
      for (let n = 2; usedKeys.has(key); n++) key = `@${round3(st.atMm)}~${n}`; // stations closer than 0.001 mm still get distinct ids
      usedKeys.add(key);
      let pcs = applyCuts(applyBreaks(linePieces(W, ops, vertical, st.atMm, lineLo, lineHi), layer.breaks), layer);
      if (!pcs.length) explain.push(`Station ${fmt(st.atMm)} lies wholly inside openings or outside the wall — no support.`);
      pcs = pcs.map((pc, k) => ({ ...pc, orientation: layer.orientation, atMm: st.atMm, plies: st.plies, role, zoneIndex: st.zoneIndex, key, index: k, label: pieceLabel(vertical, st.atMm, pc) }));
      members.push(...pcs);
    }
    res.layout.stations = stations || [];

    // Opening perimeter members required by the detail. Longest first, so a member wholly inside another identical-line
    // member is always the one removed — the result never depends on the order the openings were drawn in.
    const om = layer.openingMembers;
    if (om && stations) {
      const ext = om.extendMm ?? 0;
      if (!(finite(ext) && ext >= 0)) throw new TakeoffValidationError("Opening member extension must be 0 or more.");
      const perimeter = [];
      for (const o of ops) {
        if (Array.isArray(om.openingIds) && !om.openingIds.includes(o.id)) continue;
        if (!o.rect) { problems.push(problem("opening-member-needs-detail", `Opening ${o.id} is not rectangular — enter its perimeter supports from the detail.`, { refs: [{ openingId: o.id }] })); blocked = true; continue; }
        for (const edge of om.edges || []) {
          if (!EDGE_ROLES[edge]) throw new TakeoffValidationError(`Unknown opening edge "${edge}".`);
          const vert = edge === "left" || edge === "right";
          const at = { left: o.bbox.x0, right: o.bbox.x1, head: o.bbox.y1, sill: o.bbox.y0 }[edge];
          const [lo, hi] = vert ? [o.bbox.y0 - ext, o.bbox.y1 + ext] : [o.bbox.x0 - ext, o.bbox.x1 + ext];
          const raw = linePieces(W, ops, vert, at, lo, hi);
          const pcs = vert === vertical ? applyBreaks(raw, layer.breaks) : raw; // breaks run across the layer's own line axis
          for (const [k, pc] of pcs.entries()) {
            perimeter.push({ ...pc, orientation: vert ? "vertical" : "horizontal", atMm: at, plies: 1, role: EDGE_ROLES[edge], openingId: o.id, zoneIndex: null, key: `${o.id}:${edge}`, index: k, label: String(o.id) });
          }
        }
      }
      members.push(...perimeter.sort((a, b) => (b.toMm - b.fromMm) - (a.toMm - a.fromMm)));
    }

    // Deduplicate ONLY identical physical members of this layer: same orientation + line, and the perimeter member's
    // extent wholly inside an existing member (identical or the same continuous support). Partial overlaps stay
    // separate and are flagged for review.
    let kept = [];
    for (const m of members) {
      const sameLine = kept.filter((k) => k.orientation === m.orientation && Math.abs(k.atMm - m.atMm) <= EPS_MM);
      const host = sameLine.find((k) => k.fromMm <= m.fromMm + EPS_MM && k.toMm >= m.toMm - EPS_MM);
      if (host && m.openingId) { explain.push(`${m.role} ${m.label} is the same physical member as ${host.role} ${host.label} in this layer — counted once.`); continue; }
      const overlap = sameLine.find((k) => Math.min(k.toMm, m.toMm) - Math.max(k.fromMm, m.fromMm) > EPS_MM);
      if (overlap) problems.push(problem("members-overlap", `${m.role} ${m.label} partly overlaps ${overlap.role} ${overlap.label} on the same line — review the detail.`, { blocking: false }));
      kept.push(m);
    }
    const elementCount = kept.reduce((t, m) => t + m.plies, 0);
    if (elementCount > maxElements) {
      problems.push(problem("too-many-elements", `This layer would generate ${elementCount.toLocaleString("en-AU")} support pieces (limit ${maxElements.toLocaleString("en-AU")}) — split the wall or check the spacing.`));
      blocked = true;
      kept = [];
    }

    // Zone of each member: a station's own zone; a member across the station axis takes the most stringent zone it touches.
    const zoneObjs = (zones || []).map((z, i) => ({ ...z, index: i, fromMm: Math.max(z.fromMm, fromMm), toMm: Math.min(z.toMm, toMm) })).filter((z) => z.toMm - z.fromMm > EPS_MM);
    for (const m of kept) {
      if (m.zoneIndex !== null || !zoneObjs.length) continue;
      const along = m.orientation === layer.orientation;
      const g = along ? governingZone(zoneObjs, m.atMm, m.atMm) : governingZone(zoneObjs, m.fromMm, m.toMm);
      m.zoneIndex = g ? g.index : null;
    }

    if (!existing && (kept.length || entered) && maxStock === null) problems.push(problem("stock-policy-missing", "Support stock lengths are not set or not valid — choose the product's stock policy before ordering."));
    const lines = [];
    for (const m of kept) {
      const split = maxStock === null ? { parts: [m], joints: [] } : splitAtJoints(m, maxStock, layer.jointPolicy);
      const parts = split.parts || [m];
      res.layout.joints.push(...split.joints.map((j) => ({ lineKey: m.key, atMm: j })));
      for (let ply = 1; ply <= m.plies; ply++) {
        parts.forEach((pc, j) => {
          const len = pc.toMm - pc.fromMm;
          const id = existing ? null : demandId(materialId, wallId, layer.id, m.key, m.plies > 1 ? `ply${ply}` : null, `p${m.index}`, parts.length > 1 ? `j${j}` : null);
          const label = `${m.role} ${m.label}${m.plies > 1 ? ` (ply ${ply} of ${m.plies})` : ""}${parts.length > 1 ? ` part ${j + 1}/${parts.length}` : ""}`;
          const dp = [];
          if (!split.parts) {
            dp.push(problem("needs-joint-detail", `${label}: ${fmt(len)} is longer than the longest permitted stock (${fmt(maxStock)}) and no approved joint position reaches it — joint detail required.`, { refs: [{ wallId, station: m.atMm }] }));
            blocked = true;
          }
          if (finite(layer.minPieceLengthMm) && len < layer.minPieceLengthMm - EPS_MM) {
            dp.push(problem("short-support-piece", `${label}: ${fmt(len)} is under the ${fmt(layer.minPieceLengthMm)} minimum — narrow-strip support/attachment detail required.`, { refs: [{ wallId, station: m.atMm }] }));
          }
          problems.push(...dp);
          const sourceRefs = [{ wallId, role: layer.id, station: m.atMm }, ...[...new Set([m.openingId, ...pc.start.ids, ...pc.end.ids].filter((x) => x && ops.some((o) => o.id === x)))].map((oid) => ({ wallId, openingId: oid }))];
          lines.push({ demandId: id, role: m.role, orientation: m.orientation, atMm: m.atMm, fromMm: pc.fromMm, toMm: pc.toMm, lengthMm: len, ply, label, zoneIndex: m.zoneIndex, existing, sourceRefs });
          if (!existing) {
            demands.push({ id, materialId, role: m.role, kind: "linear", unit: "piece", lengthMm: len, quantity: 1, lengthKind: LENGTH_KINDS.CUT, identity: layer.identity ?? null,
              stockPolicy: layer.stockPolicy, noSplice: true, label, sourceRefs, provenance: "calculated", ...(dp.length ? { problems: dp } : {}) });
          }
        });
      }
    }
    if (entered) {
      for (let i = 0; i < entered.count; i++) lines.push({ demandId: entered.id, role, orientation: layer.orientation, atMm: null, fromMm: 0, toMm: entered.lengthMm, lengthMm: entered.lengthMm, ply: 1, label: `${role} entered ${i + 1} of ${entered.count}`, zoneIndex: null, existing, sourceRefs: [{ wallId, role: layer.id }] });
    }
    res.layout.lines = lines;
    if (existing) explain.push(`Existing supports: ${lines.length} piece${lines.length === 1 ? "" : "s"} shown for layout only — not purchased.`);
    else explain.push(`${lines.length} support piece${lines.length === 1 ? "" : "s"}, ${round3(lines.reduce((t, l) => t + l.lengthMm, 0)).toLocaleString("en-AU")} mm installed; each piece is a separate cut demand (no LM ÷ stock shortcut).`);

    // B1 support-span limit and attachment count against the frame members each support crosses.
    const targets = Array.isArray(layer.attachmentTargetsMm) ? [...layer.attachmentTargetsMm].sort((a, b) => a - b) : null;
    if (targets && !targets.every(finite)) throw new TakeoffValidationError("Attachment targets must be numbers.");
    if (!existing && (finite(layer.supportSpanMm) || Number.isInteger(layer.minAttachments))) {
      if (!targets) problems.push(problem("attachment-targets-missing", "A support-span or attachment-count limit is set but the frame members the supports cross are not — span not checked."));
      else {
        for (const l of lines) {
          const pts = targets.filter((x) => x >= l.fromMm - EPS_MM && x <= l.toMm + EPS_MM);
          const span = pts.slice(1).reduce((m, x, i) => Math.max(m, x - pts[i]), 0);
          if (Number.isInteger(layer.minAttachments) && pts.length < layer.minAttachments) problems.push(problem("too-few-attachments", `${l.label}: ${pts.length} attachment${pts.length === 1 ? "" : "s"}, ${layer.minAttachments} required — narrow-strip support detail required.`, { refs: [{ wallId, station: l.atMm }] }));
          if (finite(layer.supportSpanMm) && span > layer.supportSpanMm + EPS_MM) problems.push(problem("support-span-exceeded", `${l.label}: spans ${fmt(span)} between frame members, over the ${fmt(layer.supportSpanMm)} limit — add framing or change the detail.`, { refs: [{ wallId, station: l.atMm }] }));
        }
        if (problems.some((p) => p.code === "too-few-attachments" || p.code === "support-span-exceeded")) blocked = true;
      }
    }

    // B4: two independent fixing demands, each one demand per rule tuple (zone rows carry their own configuration and
    // never borrow the general row). Cladding pitch lines are split per panel at the panel edges.
    const cl = layer.claddingLayout || {};
    for (const [what, arr] of [["fixing rows", cl.rowsMm], ["panel edges", cl.panelJointsMm]]) if (arr != null && !(Array.isArray(arr) && arr.every(finite))) throw new TakeoffValidationError(`Cladding ${what} must be a list of positions in mm.`);
    const fixingKinds = [
      { name: "support-to-frame", lineField: "fixings", role: "fixing-support-to-frame", idPart: "fixings", what: `${role} fixings`, zoneKey: "fixing", rule: layer.fixing, scope: layer.fixingScope, inScope: true, targets, splitAt: null },
      { name: "cladding-to-support", lineField: "claddingFixings", role: "fixing-cladding-to-support", idPart: "cladding-fixings", what: `cladding-to-${role} fixings`, zoneKey: "claddingFixing", rule: layer.claddingFixing, scope: layer.claddingFixingScope,
        inScope: layer.claddingFixing !== undefined || layer.claddingFixingScope != null, targets: cl.rowsMm ? [...cl.rowsMm].sort((a, b) => a - b) : null, splitAt: cl.panelJointsMm ? [...cl.panelJointsMm].sort((a, b) => a - b) : null },
    ];
    for (const fk of fixingKinds) {
      const scope = fk.scope?.status ?? "include";
      if (!["include", "by-others", "exclude"].includes(scope)) throw new TakeoffValidationError(`${fk.what} scope must be include, by-others or exclude.`);
      const record = { scope, reason: fk.scope?.reason ?? null, state: "calculated", demandIds: [] };
      res.layout.fixings[fk.name] = record;
      if (!fk.inScope) { record.state = "not-in-layer"; continue; }
      if (existing || !lines.length) { record.state = existing ? "existing-supports" : "no-supports"; continue; }
      if (scope !== "include") {
        if (!nonEmpty(fk.scope.reason)) problems.push(problem("scope-reason-missing", `${fk.what} marked ${scope} need a reason.`));
        explain.push(`${fk.what} ${scope}: ${fk.scope.reason ?? "no reason given"} — recorded as an omitted scope.`);
        record.state = "omitted";
        continue;
      }
      if (countZones) { record.state = "not-quantified"; continue; }
      const tuples = new Map();
      lines.forEach((l, i) => {
        const zone = l.zoneIndex !== null ? (layer.edgeZones || [])[l.zoneIndex] : null;
        const key = zone ? `zone${l.zoneIndex}` : "general";
        if (!tuples.has(key)) tuples.set(key, { zone, lines: [] });
        tuples.get(key).lines.push({ line: l, id: `L${i}` });
      });
      for (const [key, t] of tuples) {
        const label = `${fk.what} ${t.zone ? `in edge zone ${t.zone.ruleRef ?? key}` : "(general)"}`;
        if (t.zone && t.zone[fk.zoneKey] == null) {
          problems.push(problem("zone-tuple-incomplete", `${label}: the zone row sets spacing ${fmt(t.zone.maxSpacingMm)} but no ${fk.name === "cladding-to-support" ? "cladding " : ""}fixing configuration — ${FIXINGS_NOT_QUANTIFIED}. Spacing and fixing are one indivisible row.`, { refs: [{ wallId, role: t.zone.ruleRef ?? key }] }));
          fixingsOpen = true; record.state = "not-quantified";
          continue;
        }
        const chosen = t.zone ? t.zone[fk.zoneKey] : fk.rule;
        // intersections default to the members this layer crosses (frame for support-to-frame, cladding rows for
        // cladding-to-support) — never to the support spacing
        const rule = chosen?.mode === "intersections" && !Array.isArray(chosen.targetsMm) && fk.targets ? { ...chosen, targetsMm: fk.targets } : chosen;
        const owner = new Map();
        const fixLines = t.lines.flatMap(({ line: l, id }) => {
          const edges = rule?.mode === "pitch" && fk.splitAt ? fk.splitAt.filter((x) => x > l.fromMm + EPS_MM && x < l.toMm - EPS_MM) : [];
          const bounds = [l.fromMm, ...edges, l.toMm];
          return bounds.slice(1).map((end, j) => {
            const fid = edges.length ? `${id}#${j}` : id;
            owner.set(fid, l);
            return { id: fid, startMm: bounds[j], endMm: end, sourceRefs: [{ wallId, role: layer.id, station: l.atMm }] };
          });
        });
        const r = fixingsDemand({ id: demandId(rule?.materialId ?? materialId, wallId, layer.id, fk.idPart, key), materialId: rule?.materialId ?? materialId, role: fk.role, label, lines: fixLines, rule });
        problems.push(...r.problems);
        if (!r.demand) { if (r.problems.length) { fixingsOpen = true; record.state = "not-quantified"; } continue; }
        demands.push(r.demand);
        record.demandIds.push(r.demand.id);
        for (const x of r.perLine) { const l = owner.get(x.lineId); l[fk.lineField] = (l[fk.lineField] ?? 0) + x.fixings; }
        explain.push(`${label}: ${r.demand.quantity} fixings by ${rule.mode}${rule.mode === "pitch" ? ` at ${fmt(rule.pitchMm)}${fk.splitAt ? ", each panel fixed separately" : ""}` : ""}${rule.ruleRef ? ` (${rule.ruleRef})` : ""}.`);
      }
    }
    const unsourcedZone = (layer.edgeZones || []).some((z) => !nonEmpty(z?.ruleRef));
    if (unsourcedZone) problems.push(problem("edge-zone-unsourced", "An edge zone has no rule reference — zone widths belong to a sourced rule, so installation stays source-pending.", { blocking: false }));
    res.status = {
      quantity: blocked || fixingsOpen ? "incomplete" : estimate ? "estimate" : "calculated",
      installation: installationStatus(authority, { pending: unsourcedZone }),
      procurement: !existing && (!layer.identity || problems.some((p) => p.code === "stock-policy-missing")) ? "missing-product" : "draft",
    };
    if (!existing && !layer.identity) problems.push(problem("product-missing", "Select the support product before ordering."));
  } catch (e) {
    if (!(e instanceof TakeoffValidationError)) throw e;
    problems.push(problem("invalid-input", e.message));
    res.status = { quantity: "incomplete", installation: installationStatus(authority), procurement: "draft" };
  }
  return res;
}
