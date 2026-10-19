// =============================================================================
// shared/takeoff/engine/flashingPath.js — continuous flashing runs + deliberate splits (TC-R04 13).
//
// One measured polyline P0…Pn is ONE ordered flashing the builder cuts/folds on site. A plan vertex is a change of
// direction — never a separate ordered piece, a supplier fold or a cross-section bend.
//
//   tight length    Σ calibrated segment lengths (page/region X/Y transform via calibration.js — never screen px,
//                   never the endpoint chord). Geometry stays unrounded.
//   ordered piece   ceil((tight + additional extras + A) / R) × R — A once per resultant piece (flashing.js rules).
//                   Finished / ordered-stock length kinds bypass A and rounding.
//   legal capacity  floor(M/R) × R − A − additional extras, M = product hard maximum (rules.orderCeilingMm).
//   overflow        an overlength piece keeps its whole path: red from fromMm + capacity to its end; the legal split
//                   marker is found by cumulative arc length and interpolated inside its segment (plan point + station).
//   splits          explicit stations along the path, separate from plan corners. One tap = one split; nothing splits
//                   automatically and corners are never preferred.
//
// handlingThresholdMm is an amber advisory only. orderCeilingMm: null means "hard maximum not set up": lengths stay
// live, procurement needs product setup. Pure ESM — no DB, DOM, network or eval. computeFlashingPath returns a
// MethodResult (engine/contract.js) plus path fields; throws TakeoffValidationError only for malformed input.
// =============================================================================
import { TakeoffValidationError, ceilToIncrement, formatMm, isFiniteNumber, requireNonNegative, stableStringify } from "../units.js";
import { validatePoints } from "../geometry.js";
import { CALIBRATION_MODES, calibrationOrderReady, pointToMm, pointsWithinCalibration, segmentLengthMm } from "../calibration.js";
import { normaliseFlashingRules } from "../flashing.js";
import { EPS_MM, LENGTH_KINDS, demandId, emptyResult, problem } from "./contract.js";

/**
 * Geometric identity tolerance (06: 0.001 mm internal precision) for "same point", "same station" (a split on a path
 * end or on another split), "on the path" and "exact retrace".
 * Never used for quantities — order lengths and capacity compare with contract EPS_MM only.
 */
export const PATH_TOL_MM = 0.001;
/** Minimum touch target (CSS px) around a split handle (13). */
export const SPLIT_HANDLE_TARGET_PX = 44;

const FLASHING_LENGTH_KINDS = Object.freeze([LENGTH_KINDS.TIGHT, LENGTH_KINDS.FINISHED, LENGTH_KINDS.ORDERED_STOCK]);
const fmt = (mm) => formatMm(mm, 1);

// ── input normalisation ──────────────────────────────────────────────────────

function requireCalibration(cal) {
  const sepOk = cal?.mode !== CALIBRATION_MODES.SEPARATE || (isFiniteNumber(cal.sy) && cal.sy > 0);
  if (!cal || !isFiniteNumber(cal.sx) || cal.sx <= 0 || !sepOk) throw new TakeoffValidationError("This path has no plan scale.");
  return cal;
}

/** flashing.js rules; orderCeilingMm: null = the product's hard maximum is not set up (kept as null). */
function resolveRules(rules) {
  const raw = { ...(rules || {}) };
  const maxUnknown = raw.orderCeilingMm === null;
  if (maxUnknown) delete raw.orderCeilingMm;
  const r = normaliseFlashingRules(raw);
  return maxUnknown ? { ...r, orderCeilingMm: null } : r;
}

function requireKind(kind) {
  if (!FLASHING_LENGTH_KINDS.includes(kind)) throw new TakeoffValidationError("A flashing path length must be tight (measured), finished or ordered stock.");
  return kind;
}

function requireIncludedFlag(v, label) {
  if (typeof v !== "boolean") throw new TakeoffValidationError(`${label}: say whether it is included in the measured allowance or additional.`, label);
  return v;
}

function normaliseJoint(j) {
  if (j == null) return null;
  requireNonNegative(j.lapMm, "Joint lap");
  if (j.carriedBy !== "before" && j.carriedBy !== "after") {
    throw new TakeoffValidationError("Say which piece carries the joint lap (before or after the split) — it is never inferred.", "Joint lap");
  }
  return { lapMm: j.lapMm, carriedBy: j.carriedBy, includedInAllowance: requireIncludedFlag(j.includedInAllowance, "Joint lap") };
}

function normaliseEnd(e, label) {
  if (e == null) return null;
  requireNonNegative(e.mm, label);
  return { mm: e.mm, kind: e.kind ? String(e.kind) : "end-detail", includedInAllowance: requireIncludedFlag(e.includedInAllowance, label) };
}

function normaliseZones(zones) {
  if (zones == null) return [];
  if (!Array.isArray(zones)) throw new TakeoffValidationError("No-joint zones must be a list.");
  return zones.map((z) => {
    if (!z || !isFiniteNumber(z.fromMm) || !isFiniteNumber(z.toMm) || z.toMm <= z.fromMm) {
      throw new TakeoffValidationError("A no-joint zone needs a start and a later end along the path.");
    }
    return { fromMm: z.fromMm, toMm: z.toMm };
  }).sort((a, b) => a.fromMm - b.fromMm);
}

/** Saved split locations. An entry with no plan location (x and y null — a split never placed on the path, as
 *  layout.splits records it) has no approved cut location and is skipped; any other malformed entry throws. */
function normaliseAnchors(list) {
  if (list == null) return [];
  if (!Array.isArray(list)) throw new TakeoffValidationError("Split locations must be a list.");
  return list.filter((a) => a != null && !(a.x == null && a.y == null)).map((a) => {
    if (![a.stationMm, a.x, a.y].every(isFiniteNumber)) throw new TakeoffValidationError("A saved split location is invalid.");
    return { stationMm: a.stationMm, x: a.x, y: a.y };
  });
}

function normaliseInput(input) {
  const {
    runId = null, materialId = null, identity = null, points, calibration = null, splitsMm = [], splitAnchors = null,
    rules = {}, lengthKind = LENGTH_KINDS.TIGHT, jointDetail = null, endDetails = null, noJointZones = null, complete = true,
  } = input || {};
  if (!Array.isArray(points)) throw new TakeoffValidationError("A flashing path needs a list of points.");
  if (!Array.isArray(splitsMm)) throw new TakeoffValidationError("Splits must be a list of stations along the path.");
  return {
    runId, materialId, identity: { ...(identity || {}) }, complete: complete !== false,
    points: points.length ? validatePoints(points, { min: 1 }) : [],
    calibration: calibration ? requireCalibration(calibration) : null,
    splitsMm: splitsMm.slice(),
    anchors: normaliseAnchors(splitAnchors),
    cfg: {
      rules: resolveRules(rules),
      lengthKind: requireKind(lengthKind),
      jointDetail: normaliseJoint(jointDetail),
      endDetails: { start: normaliseEnd(endDetails?.start, "Start end detail"), end: normaliseEnd(endDetails?.end, "End end detail") },
      noJointZones: normaliseZones(noJointZones),
    },
  };
}

// ── length rules ─────────────────────────────────────────────────────────────

function capacity(r, kind, extraMm) {
  if (r.orderCeilingMm == null) return null;
  if (kind !== LENGTH_KINDS.TIGHT) return r.orderCeilingMm - extraMm;
  return Math.floor((r.orderCeilingMm + EPS_MM) / r.incrementMm) * r.incrementMm - r.allowanceMm - extraMm;
}

function orderLength(r, kind, tightMm, extraMm) {
  return kind === LENGTH_KINDS.TIGHT ? ceilToIncrement(tightMm + extraMm + r.allowanceMm, r.incrementMm) : tightMm + extraMm;
}

/**
 * Greatest tight length ONE ordered piece can have: floor(M/R)·R − A − extraMm (13). Finished / ordered-stock lengths
 * are neither allowanced nor rounded, so their capacity is M − extraMm. null when the hard maximum is not set up;
 * a result ≤ 0 is an invalid product configuration.
 * @param {object} rules flashing rules (flashing.js); orderCeilingMm: null = hard maximum unknown
 * @param {{ lengthKind?: string, extraMm?: number }} [opts] extraMm = explicit ADDITIONAL joint/end material on the piece
 * @returns {number|null}
 */
export function legalCapacityMm(rules, { lengthKind = LENGTH_KINDS.TIGHT, extraMm = 0 } = {}) {
  return capacity(resolveRules(rules), requireKind(lengthKind), requireNonNegative(extraMm, "Extra material"));
}

/** Explicit joint laps / end details a piece carries; `additional` ones add material, `included` ones sit inside A. */
function pieceExtras(cfg, isFirst, isLast) {
  const { jointDetail: j, endDetails: e } = cfg;
  const items = [];
  if (isFirst && e.start) items.push({ at: "start", ...e.start });
  if (!isFirst && j?.carriedBy === "after") items.push({ at: "start", kind: "joint-lap", mm: j.lapMm, includedInAllowance: j.includedInAllowance });
  if (!isLast && j?.carriedBy === "before") items.push({ at: "end", kind: "joint-lap", mm: j.lapMm, includedInAllowance: j.includedInAllowance });
  if (isLast && e.end) items.push({ at: "end", ...e.end });
  const sum = (included) => items.filter((x) => x.includedInAllowance === included).reduce((a, x) => a + x.mm, 0);
  return { items, additionalMm: sum(false), includedMm: sum(true) };
}

const inZone = (zones, s) => zones.find((z) => s > z.fromMm + EPS_MM && s < z.toMm - EPS_MM) || null;

/**
 * Station s moved EARLIER out of any no-joint zone; null when no legal station remains inside (fromMm, toMm).
 * Stations within PATH_TOL_MM of a piece end are the same place as that end (a split there would be a 0 mm piece).
 */
function legalStation(zones, s, fromMm, toMm) {
  if (!(s > fromMm + PATH_TOL_MM) || !(s < toMm - PATH_TOL_MM)) return null;
  let x = s;
  for (let z = inZone(zones, x); z; z = inZone(zones, x)) x = z.fromMm;
  return x > fromMm + PATH_TOL_MM ? x : null;
}

// ── path geometry ────────────────────────────────────────────────────────────

/**
 * Stations along a calibrated polyline: real-world length of every segment, the station of every vertex and the
 * total. Consecutive duplicate points give a 0 segment (never interpolated through).
 * @param {Array<{x:number,y:number}>} points PDF user-space points (≥ 1)
 * @param {object} cal calibration (calibration.js)
 * @returns {{ segmentLengthsMm: number[], cumulativeMm: number[], totalMm: number }}
 */
export function pathStations(points, cal) {
  const pts = validatePoints(points, { min: 1 });
  requireCalibration(cal);
  const segmentLengthsMm = [];
  const cumulativeMm = [0];
  let totalMm = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = segmentLengthMm(cal, pts[i - 1], pts[i]);
    segmentLengthsMm.push(len);
    totalMm += len;
    cumulativeMm.push(totalMm);
  }
  return { segmentLengthsMm, cumulativeMm, totalMm };
}

function locate(pts, st, stationMm) {
  if (!isFiniteNumber(stationMm) || stationMm < -EPS_MM || stationMm > st.totalMm + EPS_MM) {
    throw new TakeoffValidationError("That position is not on the path.");
  }
  const s = Math.min(Math.max(stationMm, 0), st.totalMm);
  let k = -1;
  for (let i = 0; i < st.segmentLengthsMm.length; i++) {
    if (!(st.segmentLengthsMm[i] > 0)) continue;
    k = i;
    if (s < st.cumulativeMm[i + 1]) break;
  }
  if (k < 0) return { x: pts[0].x, y: pts[0].y, segmentIndex: 0, t: 0 };
  const t = Math.min(1, Math.max(0, (s - st.cumulativeMm[k]) / st.segmentLengthsMm[k]));
  const a = pts[k], b = pts[k + 1];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, segmentIndex: k, t };
}

/**
 * Plan point at a station (cumulative calibrated arc length), interpolated inside its segment. A station exactly on
 * a corner returns the outgoing segment with t = 0 (the path end returns the last segment with t = 1).
 * @returns {{ x:number, y:number, segmentIndex:number, t:number }} PDF user-space point
 */
export function pointAtStation(points, cal, stationMm) {
  const pts = validatePoints(points, { min: 2 });
  return locate(pts, pathStations(pts, cal), stationMm);
}

function sliceStations(pts, st, fromMm, toMm) {
  const a = locate(pts, st, fromMm), b = locate(pts, st, toMm);
  const out = [{ x: a.x, y: a.y }];
  const push = (p) => { const l = out[out.length - 1]; if (l.x !== p.x || l.y !== p.y) out.push({ x: p.x, y: p.y }); };
  for (let i = 1; i < pts.length - 1; i++) if (st.cumulativeMm[i] > fromMm && st.cumulativeMm[i] < toMm) push(pts[i]);
  push(b);
  return out;
}

/**
 * The sub-polyline between two stations (interpolated ends + the corners between), e.g. a piece or its red overflow.
 * @returns {Array<{x:number,y:number}>} PDF user-space points
 */
export function slicePath(points, cal, fromMm, toMm) {
  const pts = validatePoints(points, { min: 2 });
  if (!isFiniteNumber(fromMm) || !isFiniteNumber(toMm) || toMm <= fromMm) throw new TakeoffValidationError("A path slice needs a start before its end.");
  return sliceStations(pts, pathStations(pts, cal), fromMm, toMm);
}

/** Station where a plan point lies on the path (within PATH_TOL_MM), nearest `nearMm`; null when off the path. */
function locateOnPath(ctx, pt, nearMm) {
  const P = pointToMm(ctx.cal, ctx.pts[0], pt);
  let best = null;
  for (let k = 0; k < ctx.mm.length - 1; k++) {
    const len = ctx.st.segmentLengthsMm[k];
    if (!(len > 0)) continue;
    const A = ctx.mm[k], B = ctx.mm[k + 1];
    const t = Math.min(1, Math.max(0, ((P.x - A.x) * (B.x - A.x) + (P.y - A.y) * (B.y - A.y)) / (len * len)));
    if (Math.hypot(P.x - (A.x + t * (B.x - A.x)), P.y - (A.y + t * (B.y - A.y))) > PATH_TOL_MM) continue;
    const s = ctx.st.cumulativeMm[k] + t * len;
    if (best == null || Math.abs(s - nearMm) < Math.abs(best - nearMm)) best = s;
  }
  return best;
}

/** Pairs of segments that exactly retrace each other (collinear overlap > PATH_TOL_MM). Crossings are not retraces. */
function retraces(ctx) {
  const { mm, st } = ctx;
  const out = [];
  for (let i = 0; i < mm.length - 1; i++) {
    const li = st.segmentLengthsMm[i];
    if (!(li > PATH_TOL_MM)) continue;
    const A = mm[i], ux = (mm[i + 1].x - A.x) / li, uy = (mm[i + 1].y - A.y) / li;
    const off = (P) => Math.abs((P.x - A.x) * uy - (P.y - A.y) * ux);
    const along = (P) => (P.x - A.x) * ux + (P.y - A.y) * uy;
    for (let j = i + 1; j < mm.length - 1; j++) {
      if (!(st.segmentLengthsMm[j] > PATH_TOL_MM)) continue;
      const C = mm[j], D = mm[j + 1];
      if (off(C) > PATH_TOL_MM || off(D) > PATH_TOL_MM) continue;
      const overlapMm = Math.min(li, Math.max(along(C), along(D))) - Math.max(0, Math.min(along(C), along(D)));
      if (overlapMm > PATH_TOL_MM) out.push({ segments: [i, j], overlapMm });
    }
  }
  return out;
}

// ── splits + pieces ──────────────────────────────────────────────────────────

/** Structural checks, anchor rebuild and no-joint zones. Structurally rejected splits do not cut pieces. */
function checkSplits(ctx, splitsMm, anchors) {
  const total = ctx.st.totalMm;
  const records = [];
  const accepted = [];
  let prev = 0;
  const fail = (rec, code) => { rec.ok = false; rec.code = rec.code || code; };
  splitsMm.forEach((given, index) => {
    const rec = { index, givenMm: given, stationMm: given, ok: true, code: null, suggestedMm: null, pieceBefore: null, rebuilt: false, anchor: null };
    records.push(rec);
    if (!isFiniteNumber(given)) return fail(rec, "split_invalid_value");
    const anchor = anchors.find((a) => Math.abs(a.stationMm - given) <= EPS_MM);
    if (anchor) {
      rec.anchor = { x: anchor.x, y: anchor.y };
      const at = locateOnPath(ctx, anchor, given);
      if (at == null) fail(rec, "split_moved");
      else { rec.stationMm = at; rec.rebuilt = Math.abs(at - given) > EPS_MM; }
    }
    const s = rec.stationMm;
    if (s <= PATH_TOL_MM || s >= total - PATH_TOL_MM) return fail(rec, "split_out_of_range");
    if (s <= prev + PATH_TOL_MM) return fail(rec, "split_out_of_order");
    if (rec.ok && inZone(ctx.cfg.noJointZones, s)) {
      fail(rec, "split_in_no_joint_zone");
      rec.suggestedMm = legalStation(ctx.cfg.noJointZones, s, prev, total);
    }
    accepted.push({ index, stationMm: s });
    prev = s;
  });
  return { records, accepted };
}

function buildPieces(ctx, stations) {
  const { cfg, st } = ctx;
  const r = cfg.rules;
  const bounds = [0, ...stations, st.totalMm];
  const n = bounds.length - 1;
  return Array.from({ length: n }, (_, i) => {
    const fromMm = bounds[i], toMm = bounds[i + 1], tightMm = toMm - fromMm;
    const isFirst = i === 0, isLast = i === n - 1;
    const ex = pieceExtras(cfg, isFirst, isLast);
    const orderMm = orderLength(r, cfg.lengthKind, tightMm, ex.additionalMm);
    const capacityMm = capacity(r, cfg.lengthKind, ex.additionalMm);
    const overMax = r.orderCeilingMm == null ? null : orderMm > r.orderCeilingMm + EPS_MM;
    const piece = {
      index: i, fromMm, toMm, tightMm, lengthKind: cfg.lengthKind,
      allowanceMm: cfg.lengthKind === LENGTH_KINDS.TIGHT ? r.allowanceMm : 0,
      extraMm: ex.additionalMm, includedExtraMm: ex.includedMm, extras: ex.items,
      orderMm, handlingFlag: orderMm > r.handlingThresholdMm, overMax, capacityMm,
      redFromMm: null, legalSplitMm: null, maxEndMm: null,
    };
    if (overMax) {
      piece.redFromMm = Math.min(toMm, fromMm + Math.max(0, capacityMm));
      // a NEW split ends this piece with a new joint: capacity of that left part (its own extras, not this end's).
      // When that reaches past this piece's end, the overflow comes from this piece's own end extras (e.g. an
      // additional end return): the last legal break is then where the red starts (never beyond capLeft).
      const capLeft = capacity(r, cfg.lengthKind, pieceExtras(cfg, isFirst, false).additionalMm);
      const reach = fromMm + capLeft < toMm - PATH_TOL_MM ? capLeft : Math.min(capLeft, capacityMm);
      piece.legalSplitMm = legalStation(cfg.noJointZones, fromMm + reach, fromMm, toMm);
      if (!isLast) piece.maxEndMm = legalStation(cfg.noJointZones, fromMm + capacityMm, fromMm, toMm);
    }
    return piece;
  });
}

const SPLIT_TEXT = {
  split_invalid_value: () => "has no valid position — move or remove it.",
  split_out_of_range: (r) => `at ${fmt(r.stationMm)} mm is no longer inside the path — move or remove it.`,
  split_out_of_order: (r) => `at ${fmt(r.stationMm)} mm is not after the previous split — move or remove it.`,
  split_moved: () => "— its approved cut location is no longer on the path after a geometry edit. Choose its position again.",
  split_in_no_joint_zone: (r) => `at ${fmt(r.stationMm)} mm is where the project detail does not allow a joint — ${r.suggestedMm != null ? `move it earlier to ${fmt(r.suggestedMm)} mm` : "resolve it manually"}.`,
  split_beyond_capacity: (r) => `at ${fmt(r.stationMm)} mm makes the piece before it longer than the maximum — ${r.suggestedMm != null ? `move it to ${fmt(r.suggestedMm)} mm or earlier` : "resolve it manually"}.`,
};

/**
 * Display a piece length at the smallest precision (≥ 0.1 mm) at which "tight + extras + allowance → order" still
 * explains the rounding — display rounding never hides a real overrun (8,800.04 + 200 → 9,100).
 */
function explainableTight(pc, r) {
  if (pc.lengthKind !== LENGTH_KINDS.TIGHT) return formatMm(pc.tightMm, 3);
  for (let d = 1; d <= 6; d++) {
    const v = Number(pc.tightMm.toFixed(d));
    if (ceilToIncrement(v + pc.extraMm + pc.allowanceMm, r.incrementMm) === pc.orderMm) return formatMm(v, d);
  }
  return formatMm(pc.tightMm, 6);
}

function explainPath(out, inp, ctx) {
  if (!ctx) return [];
  const r = inp.cfg.rules;
  const tight = inp.cfg.lengthKind === LENGTH_KINDS.TIGHT;
  const legs = ctx.st.segmentLengthsMm.filter((l) => l > PATH_TOL_MM);
  const legText = legs.length > 1 && legs.length <= 12 ? `${legs.map(fmt).join(" + ")} = ` : "";
  const lines = [`Path: ${legs.length} leg${legs.length === 1 ? "" : "s"}, ${legText}${fmt(out.tightTotalMm)} mm ${tight ? "tight" : `${inp.cfg.lengthKind} length`} along the path (plan corners are site cuts/folds — no extra pieces or allowances).`];
  for (const pc of out.pieces) {
    const extras = pc.extraMm ? ` + additional ${pc.extras.filter((x) => !x.includedInAllowance).map((x) => `${x.kind} ${fmt(x.mm)}`).join(" + ")}` : "";
    let line = tight
      ? `Piece ${pc.index + 1} (${fmt(pc.fromMm)} → ${fmt(pc.toMm)} mm): tight ${explainableTight(pc, r)}${extras} + allowance ${fmt(pc.allowanceMm)} → order ${fmt(pc.orderMm)} mm.`
      : `Piece ${pc.index + 1} (${fmt(pc.fromMm)} → ${fmt(pc.toMm)} mm): ${explainableTight(pc, r)} mm${extras} as ${inp.cfg.lengthKind} length → order ${formatMm(pc.orderMm, 3)} mm (no allowance, no rounding).`;
    if (pc.overMax) line += ` Over the ${fmt(r.orderCeilingMm)} mm maximum: overflow ${fmt(pc.redFromMm)} → ${fmt(pc.toMm)} mm${pc.legalSplitMm != null ? `, legal split at ${fmt(pc.legalSplitMm)} mm` : ", no legal split position"}.`;
    if (pc.handlingFlag) line += ` Longer than the ${fmt(r.handlingThresholdMm)} mm handling length (advisory).`;
    lines.push(line);
  }
  if (out.pieces.length > 1) {
    const ordered = out.pieces.reduce((a, pc) => a + pc.orderMm, 0);
    lines.push(`${out.pieces.length} pieces cover the full ${fmt(out.tightTotalMm)} mm measured; ordered ${fmt(ordered)} mm${tight ? ` (${out.pieces.length} × ${fmt(r.allowanceMm)} mm allowance, one per piece)` : ""}.`);
  }
  for (const rec of out.splits) if (rec.rebuilt) lines.push(`Split ${rec.index + 1} station rebuilt ${fmt(rec.givenMm)} → ${fmt(rec.stationMm)} mm after a geometry edit (same cut location).`);
  if (r.orderCeilingMm == null) lines.push("Maximum orderable length is not set up for this product — lengths stay live; ordering waits for product setup.");
  return lines;
}

function statusFor(out, inp, ctx) {
  const codes = new Set(out.problems.map((p) => p.code));
  return {
    quantity: !ctx || !inp.complete || !out.pieces.length ? "incomplete" : calibrationOrderReady(inp.calibration) ? "calculated" : "estimate",
    installation: inp.cfg.jointDetail && out.splits.some((s) => s.pieceBefore != null) ? "project-detail-supplied" : "unspecified",
    procurement: codes.has("max_unknown") || codes.has("capacity_invalid") || codes.has("material_missing") ? "missing-product"
      : out.problems.some((p) => p.blocking) ? "draft" : "ready",
  };
}

function geometryContext(inp, out) {
  if (inp.points.length < 2) { out.problems.push(problem("path_incomplete", "Tap at least two points to measure a flashing path.")); return null; }
  if (!inp.calibration) { out.problems.push(problem("calibration_missing", "This path has no plan scale.")); return null; }
  const pts = inp.points, cal = inp.calibration;
  const st = pathStations(pts, cal);
  out.tightTotalMm = st.totalMm;
  if (!pointsWithinCalibration(cal, pts)) out.problems.push(problem("outside_region", "This path goes outside the scaled region."));
  if (!calibrationOrderReady(cal)) out.problems.push(problem("calibration_not_ready", "The plan scale failed its check or has not been checked — recalibrate before ordering."));
  const zero = st.segmentLengthsMm.map((l, i) => (l <= PATH_TOL_MM ? i : -1)).filter((i) => i >= 0);
  if (zero.length) out.problems.push(problem("zero_length_segment", "Some points repeat the point before — they add no length.", { blocking: false, refs: zero.map((segmentIndex) => ({ segmentIndex })) }));
  if (st.totalMm <= PATH_TOL_MM) { out.problems.push(problem("path_zero_length", "This path has no length.")); return null; }
  return { pts, cal, st, mm: pts.map((p) => pointToMm(cal, pts[0], p)), cfg: inp.cfg };
}

function solve(ctx, inp, out) {
  const { cfg } = ctx;
  const r = cfg.rules;
  const runRef = inp.runId != null ? { measurementId: inp.runId } : {};
  const rt = retraces(ctx);
  if (rt.length) {
    out.problems.push(problem("path_retraced", "Part of this path retraces itself — both passes are measured and summed (nothing is merged or deleted). Check that is intended.",
      { blocking: false, refs: rt.map((x) => ({ ...runRef, segments: x.segments, overlapMm: x.overlapMm })) }));
  }
  const { records, accepted } = checkSplits(ctx, inp.splitsMm, inp.anchors);
  const pieces = buildPieces(ctx, accepted.map((a) => a.stationMm));
  accepted.forEach((a, k) => {
    const rec = records[a.index];
    rec.pieceBefore = k;
    if (pieces[k].overMax && rec.ok) { rec.ok = false; rec.code = "split_beyond_capacity"; rec.suggestedMm = pieces[k].maxEndMm; }
  });
  const piecePs = pieces.map(() => []);
  for (const pc of pieces) {
    const at = { ...runRef, pieceIndex: pc.index };
    const label = `Piece ${pc.index + 1}`;
    if (pc.lengthKind === LENGTH_KINDS.TIGHT && pc.includedExtraMm > r.allowanceMm + EPS_MM) {
      piecePs[pc.index].push(problem("allowance_overcommitted", `${label}: joint/end details marked as included (${fmt(pc.includedExtraMm)} mm) exceed the ${fmt(r.allowanceMm)} mm allowance — mark them additional or reduce them.`, { refs: [at] }));
    }
    if (pc.overMax) {
      piecePs[pc.index].push(problem("piece_over_max", `${label} orders ${fmt(pc.orderMm)} mm — over the ${fmt(r.orderCeilingMm)} mm maximum. The overflow from ${fmt(pc.redFromMm)} mm is shown red${pc.legalSplitMm != null ? `; tap it to split at the legal limit (${fmt(pc.legalSplitMm)} mm)` : ""}.`,
        { refs: [{ ...at, fromMm: pc.redFromMm, toMm: pc.toMm, legalSplitMm: pc.legalSplitMm }] }));
      if (pc.legalSplitMm == null) piecePs[pc.index].push(problem("no_legal_split", `${label} has no legal split position (joint not allowed there, or extras use the capacity) — resolve it manually.`, { refs: [at] }));
    }
    if (pc.handlingFlag) {
      piecePs[pc.index].push(problem("handling_length", `${label} orders ${fmt(pc.orderMm)} mm — longer than the ${fmt(r.handlingThresholdMm)} mm handling length. Advisory only; no split is required.`, { blocking: false, refs: [at] }));
    }
  }
  out.problems.push(...piecePs.flat());
  for (const rec of records) {
    if (rec.code) out.problems.push(problem(rec.code, `Split ${rec.index + 1} ${SPLIT_TEXT[rec.code](rec)}`, { refs: [{ ...runRef, splitIndex: rec.index, stationMm: rec.stationMm, suggestedMm: rec.suggestedMm }] }));
  }

  const at = (s) => locate(ctx.pts, ctx.st, s);
  for (const rec of records) {
    const p = rec.pieceBefore != null ? at(rec.stationMm) : null;
    rec.point = p && { x: p.x, y: p.y };
  }
  const first = pieces.find((pc) => pc.overMax) || null;
  out.pieces = pieces;
  out.splits = records;
  out.splitsMm = records.map((rec) => rec.stationMm);
  out.overflow = first && {
    pieceIndex: first.index, fromMm: first.redFromMm, toMm: first.toMm, overflowMm: first.toMm - first.redFromMm,
    legalSplitMm: first.legalSplitMm, point: first.legalSplitMm != null ? at(first.legalSplitMm) : null,
  };
  out.layout = {
    vertexStationsMm: ctx.st.cumulativeMm.slice(),
    segmentLengthsMm: ctx.st.segmentLengthsMm.slice(),
    // persistence form: split stations + plan locations, separate from corners. A moved-off-path split keeps its
    // APPROVED location so it stays flagged until the builder resolves it.
    splits: records.map((rec) => (rec.code === "split_moved" || !rec.point
      ? { stationMm: rec.givenMm, x: rec.anchor ? rec.anchor.x : null, y: rec.anchor ? rec.anchor.y : null }
      : { stationMm: rec.stationMm, x: rec.point.x, y: rec.point.y })),
    overflowRuns: pieces.filter((pc) => pc.overMax).map((pc) => ({ pieceIndex: pc.index, fromMm: pc.redFromMm, toMm: pc.toMm, points: sliceStations(ctx.pts, ctx.st, pc.redFromMm, pc.toMm) })),
    legalMarkers: pieces.filter((pc) => pc.legalSplitMm != null).map((pc) => ({ pieceIndex: pc.index, stationMm: pc.legalSplitMm, ...at(pc.legalSplitMm) })),
  };
  if (!inp.complete) return;
  // demand ids derive from the parent run and pieces belong to a job material — without them no order line is made
  if (inp.materialId == null) out.problems.push(problem("material_missing", "Choose the flashing product for this run before it can be ordered."));
  if (inp.runId == null) out.problems.push(problem("run_id_missing", "This run has no id yet — save it before ordering (each ordered piece stays linked to its run)."));
  if (inp.materialId == null || inp.runId == null) return;
  out.demands = pieces.map((pc) => ({
    // job material + parent run + piece: one run may feed several flashing materials, and ids must stay unique
    id: demandId(inp.materialId, inp.runId, "flashing-piece", pc.index),
    materialId: inp.materialId,
    role: "flashing-piece",
    kind: "linear",
    unit: "piece",
    lengthMm: pc.orderMm,
    quantity: 1,
    // the allowance is already in lengthMm — downstream must never add it again
    lengthKind: LENGTH_KINDS.FINISHED,
    identity: { ...inp.identity },
    // tight pieces are made to order on the product's R grid up to its hard maximum: one allocation group per product
    // and the allocator itself refuses an overlength piece. Finished / ordered-stock lengths are never re-rounded.
    stockPolicy: cfg.lengthKind === LENGTH_KINDS.TIGHT
      ? { kind: "grid", minMm: r.incrementMm, incrementMm: r.incrementMm, maxMm: r.orderCeilingMm, sharePieces: false }
      : { kind: "fixed", lengthMm: pc.orderMm, sharePieces: false },
    noSplice: true,
    label: `Flashing piece ${pc.index + 1} of ${pieces.length} (${fmt(pc.fromMm)} → ${fmt(pc.toMm)} mm along the run)`,
    sourceRefs: [{ ...runRef, role: "flashing-piece", station: pc.fromMm }],
    provenance: "calculated",
    problems: piecePs[pc.index].filter((p) => p.blocking),
  }));
}

/**
 * Continuous flashing path → ordered pieces (TC-R04 13). The whole measured path is always kept; explicit splits only
 * re-allocate it into pieces, each with its own single allowance.
 * @param {{
 *   points: Array<{x:number,y:number}>, calibration: object|null, splitsMm?: number[], rules?: object,
 *   runId?: string, materialId?: string, identity?: object,
 *   splitAnchors?: Array<{stationMm:number,x:number,y:number}>,  // saved layout.splits: the APPROVED plan location of
 *                                                               // each split; stations are rebuilt from it after edits
 *   lengthKind?: "tight"|"finished"|"orderedStock",            // finished / orderedStock bypass allowance + rounding
 *   jointDetail?: {lapMm:number, carriedBy:"before"|"after", includedInAllowance:boolean}|null,
 *   endDetails?: {start?:{mm:number,kind?:string,includedInAllowance:boolean}, end?:{…}}|null,
 *   noJointZones?: Array<{fromMm:number,toMm:number}>,          // stations where the project detail forbids a joint
 *   complete?: boolean,                                         // false while drawing: no demands yet
 * }} input  rules = flashing.js rules; orderCeilingMm: null = hard maximum not set up
 * @returns MethodResult & { tightTotalMm, pieces, overflow, splitsMm, splits, config, dependencyKey }
 */
export function computeFlashingPath(input) {
  const inp = normaliseInput(input);
  const out = { ...emptyResult(), runId: inp.runId, tightTotalMm: 0, pieces: [], overflow: null, splitsMm: inp.splitsMm.slice(), splits: [], config: inp.cfg, dependencyKey: null };
  const r = inp.cfg.rules;
  if (r.orderCeilingMm == null) {
    out.problems.push(problem("max_unknown", "This flashing product has no maximum orderable length set up — set it up before ordering (drawing can continue)."));
  } else if (capacity(r, inp.cfg.lengthKind, 0) <= EPS_MM) {
    out.problems.push(problem("capacity_invalid", `A ${fmt(r.orderCeilingMm)} mm maximum leaves no room for the ${fmt(r.allowanceMm)} mm allowance — fix the product setup.`));
  }
  if (!inp.complete) out.problems.push(problem("path_in_progress", "Still drawing — finish the path (double-tap or Finish) before it can be ordered."));
  const ctx = geometryContext(inp, out);
  if (ctx) solve(ctx, inp, out);
  else out.splits = inp.splitsMm.map((s, index) => ({ index, givenMm: s, stationMm: s, ok: false, code: "split_unverifiable", suggestedMm: null, pieceBefore: null, rebuilt: false, anchor: null, point: null }));
  out.status = statusFor(out, inp, ctx);
  out.explain = explainPath(out, inp, ctx);
  const c = inp.calibration;
  out.dependencyKey = stableStringify({
    points: inp.points, splitsMm: inp.splitsMm, splitAnchors: inp.anchors, cfg: inp.cfg, complete: inp.complete,
    calibration: c && { id: c.id, sx: c.sx, sy: c.sy, mode: c.mode, basisRotation: c.basisRotation, status: c.status, region: c.region },
  });
  return out;
}

/**
 * Split checks for a path (after a geometry, calibration, rules or split edit). Invalid splits are flagged with a
 * suggested station where one exists — never silently moved.
 * @param {object} input same as computeFlashingPath
 * @returns {{ valid: boolean, splitsMm: number[], splits: object[], problems: object[] }}
 */
export function validateSplits(input) {
  const path = computeFlashingPath({ ...input, complete: true });
  return {
    valid: path.splits.every((s) => s.ok),
    splitsMm: path.splitsMm,
    splits: path.splits,
    problems: path.problems.filter((p) => p.code.startsWith("split_")),
  };
}

// ── split actions (each returns NEW splits/anchors arrays; the previous arrays are the undo state) ────────────────

function placement(path, stationMm, prevMm, nextMm) {
  const cfg = path.config;
  const problems = [];
  const isFirst = prevMm === 0;
  const cap = capacity(cfg.rules, cfg.lengthKind, pieceExtras(cfg, isFirst, false).additionalMm);
  const legalRangeMm = { afterMm: prevMm, upToMm: cap == null ? nextMm : Math.min(nextMm, prevMm + cap) };
  if (!isFiniteNumber(stationMm) || stationMm <= prevMm + PATH_TOL_MM || stationMm >= nextMm - PATH_TOL_MM) {
    problems.push(problem("split_out_of_order", "A split must stay inside the path and between its neighbouring splits."));
  } else if (inZone(cfg.noJointZones, stationMm)) {
    problems.push(problem("split_in_no_joint_zone", "The project detail does not allow a joint there."));
  } else if (cap != null && stationMm - prevMm > cap + EPS_MM) {
    problems.push(problem("split_beyond_capacity", `That makes the piece before the split longer than the maximum — the split can go up to ${fmt(legalRangeMm.upToMm)} mm.`));
  }
  return { problems, legalRangeMm };
}

const acceptedSplits = (path) => path.splits.filter((s) => s.pieceBefore != null);

/**
 * Approved split locations to save with a new splits array (the current layout.splits that have a plan location),
 * minus `dropIndex`: a split the builder just placed again takes its new location from its new station on the next
 * calculation — so a flagged split can be re-approved even at the same station.
 */
const anchorsAfter = (path, dropIndex = -1) => (path.layout?.splits || [])
  .filter((a, i) => i !== dropIndex && a.x != null && a.y != null).map((a) => ({ ...a }));

/**
 * Add a builder-chosen split at a station (blocked — splits unchanged + problem — when beyond legal capacity, in a
 * no-joint zone, outside the path or on an existing split).
 * @returns {{ splitsMm: number[], splitAnchors: object[], problems: object[], legalRangeMm: {afterMm:number, upToMm:number} }}
 */
export function addSplit(path, stationMm) {
  const acc = acceptedSplits(path);
  // an existing split at this station counts as the previous one, so a duplicate is refused (never a 0 mm piece)
  const prevMm = acc.filter((s) => s.stationMm <= stationMm).reduce((a, s) => Math.max(a, s.stationMm), 0);
  const nextMm = acc.filter((s) => s.stationMm > stationMm).reduce((a, s) => Math.min(a, s.stationMm), path.tightTotalMm);
  const res = placement(path, stationMm, prevMm, nextMm);
  const splitAnchors = anchorsAfter(path);
  if (res.problems.length) return { splitsMm: path.splitsMm.slice(), splitAnchors, ...res };
  const after = acc.find((s) => s.stationMm > stationMm);
  const at = after ? after.index : path.splitsMm.length;
  return { splitsMm: [...path.splitsMm.slice(0, at), stationMm, ...path.splitsMm.slice(at)], splitAnchors, ...res };
}

/**
 * "Split at limit": ONE split at the legal marker of the first overlength piece (or `pieceIndex`). The tap position
 * is never used. Returns the splits unchanged when there is nothing to split or no legal marker. Keep saving
 * path.layout.splits as the anchors (the new split gets its plan location on the next calculation).
 * @returns {number[]} new splitsMm
 */
export function splitAtLimit(path, pieceIndex) {
  const pc = pieceIndex == null ? path.pieces.find((p) => p.overMax) : path.pieces[pieceIndex];
  if (!pc || !pc.overMax || pc.legalSplitMm == null) return path.splitsMm.slice();
  const res = addSplit(path, pc.legalSplitMm);
  return res.problems.length ? path.splitsMm.slice() : res.splitsMm;
}

/** Most splits one run may carry (the server refuses more). */
export const MAX_RUN_SPLITS = 20;

/**
 * Hub review HUB 005 — "Split to handling length": replace ALL of a run's splits with the FEWEST even pieces whose
 * ordered length is within the material's handling length (and never over the hard order ceiling). Each piece keeps
 * its own allowance and order rounding, exactly as a hand-placed split would. Corners don't matter (cut/folded on site).
 * Nothing changes when the run already fits, or when no legal layout exists — then `problems` says exactly why.
 * @returns {{ splitsMm: number[], splitAnchors: object[], pieces: number, orderMm: number[], limitMm: number|null, changed: boolean, problems: object[] }}
 */
export function splitToHandling(path) {
  const cfg = path.config;
  const r = cfg.rules;
  const total = path.tightTotalMm;
  const keep = (problems) => ({ splitsMm: path.splitsMm.slice(), splitAnchors: anchorsAfter(path), pieces: path.pieces.length,
    orderMm: path.pieces.map((pc) => pc.orderMm), limitMm: null, changed: false, problems });
  const limits = [r.handlingThresholdMm, r.orderCeilingMm].filter((x) => isFiniteNumber(x) && x > 0);
  if (!limits.length) return keep([problem("handling_unknown", "This flashing has no handling length or maximum set up — set them in its details first.")]);
  const limitMm = Math.min(...limits);
  if (!(total > PATH_TOL_MM)) return keep([problem("path_incomplete", "Finish the run first.")]);
  const tight = cfg.lengthKind === LENGTH_KINDS.TIGHT;
  // greatest tight length one piece may have so that its ORDER length (allowance + rounding + extras) is ≤ the limit
  const capOf = (isFirst, isLast) => {
    const extra = pieceExtras(cfg, isFirst, isLast).additionalMm;
    return tight ? Math.floor((limitMm + EPS_MM) / r.incrementMm) * r.incrementMm - r.allowanceMm - extra : limitMm - extra;
  };
  if (capOf(true, true) <= 0 || capOf(true, false) <= 0 || capOf(false, true) <= 0 || capOf(false, false) <= 0) {
    return keep([problem("handling_too_short", `The ${fmt(limitMm)} mm handling length leaves no room once the ${fmt(r.allowanceMm)} mm allowance and rounding are added — check this flashing's details.`)]);
  }
  for (let n = 1; n <= MAX_RUN_SPLITS + 1; n++) {
    const each = total / n;
    const stations = Array.from({ length: n - 1 }, (_, k) => total * (k + 1) / n);
    const fits = Array.from({ length: n }, (_, k) => each <= capOf(k === 0, k === n - 1) + EPS_MM).every(Boolean);
    if (!fits || stations.some((st) => inZone(cfg.noJointZones, st))) continue;
    if (n === 1 && !path.splitsMm.length) return { ...keep([]), limitMm, problems: [problem("already_within", `This run already orders within the ${fmt(limitMm)} mm handling length — no split needed.`, { blocking: false })] };
    const orderMm = Array.from({ length: n }, (_, k) => orderLength(r, cfg.lengthKind, each, pieceExtras(cfg, k === 0, k === n - 1).additionalMm));
    return { splitsMm: stations, splitAnchors: [], pieces: n, orderMm, limitMm, changed: !sameStations(stations, path.splitsMm), problems: [] };
  }
  const need = Math.ceil(total / Math.max(1, capOf(false, false)));
  return keep([problem("handling_too_many", `Splitting this ${fmt(total)} mm run to ${fmt(limitMm)} mm needs about ${need} pieces — more than the ${MAX_RUN_SPLITS + 1} a run can have${cfg.noJointZones.length ? ", or the joints would land where the project detail allows none" : ""}. Draw it as two runs, or edit the splits by hand.`)]);
}
const sameStations = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < PATH_TOL_MM);

/**
 * Move split `index` (earlier, later or onto a corner). Blocked — splits unchanged + problem — when the piece ending
 * at it would exceed legal capacity, it would pass a neighbouring split, or the project forbids a joint there. A
 * move that lengthens the following piece past the maximum is allowed and shows as red overflow. The moved split's
 * old approved location is dropped from the returned anchors (placing it again — even at the same station — is the
 * builder's new approval, e.g. resolving a split flagged after a geometry edit).
 * @returns {{ splitsMm: number[], splitAnchors: object[], problems: object[], legalRangeMm: {afterMm:number, upToMm:number} }}
 */
export function moveSplit(path, index, toMm) {
  const rec = path.splits[index];
  if (!rec) throw new TakeoffValidationError("That split does not exist.");
  const acc = acceptedSplits(path);
  const prevMm = acc.filter((s) => s.index < index).reduce((a, s) => Math.max(a, s.stationMm), 0);
  const nextMm = acc.filter((s) => s.index > index).reduce((a, s) => Math.min(a, s.stationMm), path.tightTotalMm);
  const res = placement(path, toMm, prevMm, nextMm);
  if (res.problems.length) return { splitsMm: path.splitsMm.slice(), splitAnchors: anchorsAfter(path), ...res };
  const splitsMm = path.splitsMm.slice();
  splitsMm[index] = toMm;
  return { splitsMm, splitAnchors: anchorsAfter(path, index), ...res };
}

/** Move split `index` exactly onto plan corner `vertexIndex` (no automatic preference for corners). */
export function moveSplitToCorner(path, index, vertexIndex) {
  const station = path.layout?.vertexStationsMm?.[vertexIndex];
  if (!isFiniteNumber(station)) throw new TakeoffValidationError("That corner does not exist.");
  return moveSplit(path, index, station);
}

// ── drawing model ────────────────────────────────────────────────────────────

/**
 * Add a tapped vertex to the path being drawn. A point that coincides with the current last point is NOT added, so
 * double-tapping the last point never creates a duplicate vertex or a zero-length segment.
 * @returns {{ points: Array<{x:number,y:number}>, added: boolean }}
 */
export function appendVertex(points, pt, cal) {
  const pts = Array.isArray(points) && points.length ? validatePoints(points, { min: 1 }) : [];
  const [p] = validatePoints([pt], { min: 1 });
  requireCalibration(cal);
  const last = pts[pts.length - 1];
  if (last && segmentLengthMm(cal, last, p) <= PATH_TOL_MM) return { points: pts, added: false };
  return { points: validatePoints([...pts, p], { min: 1 }), added: true };
}

/**
 * Finish the path as ONE flashing (double-tap / double-click / Finish). The endpoint transaction is coalesced: the
 * double-tap's FIRST tap already placed the endpoint (immediate single-tap feedback) or hit the existing last point,
 * so the double-tap's own position is deliberately never taken — passing it would add a second endpoint up to the
 * 24 px double-tap proximity away. Trailing duplicate points are dropped; existing splits are untouched.
 * @returns {{ points: Array<{x:number,y:number}>, finished: boolean, problems: object[] }}
 */
export function finishPath(points, cal) {
  requireCalibration(cal);
  let pts = Array.isArray(points) && points.length ? validatePoints(points, { min: 1 }) : [];
  while (pts.length >= 2 && segmentLengthMm(cal, pts[pts.length - 2], pts[pts.length - 1]) <= PATH_TOL_MM) pts = pts.slice(0, -1);
  if (pts.length < 2) return { points: pts, finished: false, problems: [problem("path_incomplete", "Tap at least two points to measure a flashing path.")] };
  return { points: pts, finished: true, problems: [] };
}

/**
 * What a tap near a flashing path means (13 hit testing). Positions are screen CSS px — the caller maps model points
 * with its viewport transform. Priority: split handle (≥ 44 px target) → existing vertex → red overflow line
 * ("Split at limit", never a new vertex) → add a point. Vertices outrank the red line so double-tapping the last
 * point of an overlength path finishes it instead of splitting it.
 * @param {{x:number,y:number}} tap
 * @param {{ splitHandles?: Array<{x,y,index?}>, vertices?: Array<{x,y,index?}>, overflowRuns?: Array<{pieceIndex:number, points:Array<{x,y}>}> }} targets
 * @returns {{action:"split-handle", index:number}|{action:"vertex", index:number}|{action:"split-at-limit", pieceIndex:number}|{action:"add-point"}}
 */
export function resolvePathTap(tap, { splitHandles = [], vertices = [], overflowRuns = [] } = {}, { handleTargetPx = SPLIT_HANDLE_TARGET_PX, vertexTargetPx = SPLIT_HANDLE_TARGET_PX, lineTargetPx = SPLIT_HANDLE_TARGET_PX } = {}) {
  const nearest = (items, radius) => {
    let best = null;
    items.forEach((h, i) => {
      const d = Math.hypot(h.x - tap.x, h.y - tap.y);
      if (d <= radius && (!best || d < best.d)) best = { d, index: h.index ?? i };
    });
    return best;
  };
  const handle = nearest(splitHandles, Math.max(handleTargetPx, SPLIT_HANDLE_TARGET_PX) / 2);
  if (handle) return { action: "split-handle", index: handle.index };
  const vertex = nearest(vertices, vertexTargetPx / 2);
  if (vertex) return { action: "vertex", index: vertex.index };
  const segDist = (a, b) => {
    const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = L2 ? Math.min(1, Math.max(0, ((tap.x - a.x) * (b.x - a.x) + (tap.y - a.y) * (b.y - a.y)) / L2)) : 0;
    return Math.hypot(tap.x - (a.x + t * (b.x - a.x)), tap.y - (a.y + t * (b.y - a.y)));
  };
  let red = null;
  for (const run of overflowRuns) {
    for (let i = 1; i < run.points.length; i++) {
      const d = segDist(run.points[i - 1], run.points[i]);
      if (d <= lineTargetPx / 2 && (!red || d < red.d)) red = { d, pieceIndex: run.pieceIndex };
    }
  }
  if (red) return { action: "split-at-limit", pieceIndex: red.pieceIndex };
  return { action: "add-point" };
}

// ── persistence compatibility ────────────────────────────────────────────────

/**
 * Backwards-compatible reader. A legacy straight run (kind "run", exactly two points) reads as a two-point polyline
 * with no splits; a "polyline" measurement carries ordered points, its length kind and saved splits — either as the
 * server stores them (inputs.splitsMm + optional inputs.splitAnchors) or as split records [{stationMm, x, y}]
 * (layout.splits). A record holding both forms is refused rather than guessing which is current. Legacy contribution
 * splits (finished children + laps, flashing.js evaluateSplit) are NOT converted into stations — they keep their
 * version-specific reader, and frozen orders are never rewritten.
 * @returns {{ runId, points, splitsMm: number[], splitAnchors: object[], lengthKind: string, legacy: boolean }}
 */
export function pathFromMeasurement(m) {
  if (!m || typeof m !== "object") throw new TakeoffValidationError("This measurement is invalid.");
  if (m.kind === "run") {
    if (!Array.isArray(m.points) || m.points.length !== 2) throw new TakeoffValidationError("A straight run has exactly two points.");
    return { runId: m.id ?? null, points: validatePoints(m.points), splitsMm: [], splitAnchors: [], lengthKind: LENGTH_KINDS.TIGHT, legacy: true };
  }
  if (m.kind === "polyline") {
    const stored = m.inputs?.splitsMm != null;
    if (stored && m.splits != null) throw new TakeoffValidationError("This path stores its splits twice — keep one list.");
    let splitsMm, splitAnchors;
    if (stored) {
      if (!Array.isArray(m.inputs.splitsMm)) throw new TakeoffValidationError("Saved splits must be a list.");
      splitsMm = m.inputs.splitsMm.slice();
      splitAnchors = normaliseAnchors(m.inputs.splitAnchors);
    } else {
      const splits = m.splits == null ? [] : m.splits;
      if (!Array.isArray(splits)) throw new TakeoffValidationError("Saved splits must be a list.");
      splitsMm = splits.map((s) => s?.stationMm);
      splitAnchors = normaliseAnchors(splits);
    }
    return {
      runId: m.id ?? null,
      points: validatePoints(m.points),
      splitsMm,
      splitAnchors,
      lengthKind: requireKind(m.lengthKind || LENGTH_KINDS.TIGHT),
      legacy: false,
    };
  }
  throw new TakeoffValidationError("Unknown measurement type.");
}
