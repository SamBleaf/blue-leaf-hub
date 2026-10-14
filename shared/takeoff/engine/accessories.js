// =============================================================================
// shared/takeoff/engine/accessories.js — accessory_routes@1 (TC-R04 05 B5–B6): starters/trims, vents/closers,
// corner trims, joint strips, membrane, tape, sealant, AAC adhesive, mesh/coatings, cut-end protection and child
// flashings, all measured from the SAME wall geometry as the cladding.
//
// Each group measures its own route (base/top/opening edges, tagged corners, actual layout joints, wall coverage)
// and keeps its own opening policy: openings are a union clipped to the wall (never deducted or edged twice) and the
// membrane never borrows the cladding's net area. Purchase quantities come only from explicit stock/roll/cartridge
// data and REVIEWED yields; an unknown required quantity is "unresolved" (blocking problem, no demand) — never 0.
// Consumables (cartridges, rolls, bags) carry their EXACT quantity per wall and are rounded up once, after job-scope
// aggregation (aggregateConsumables) — never "tubes per wall". Shared corners (trims and their sealant) have
// wall-independent ids so mergeAccessoryResults counts them once.
// Every group is Include / By others / Exclude with a reason; layout.readiness lists missing and omitted groups.
// Child flashings keep their length kind so the measured-run +200 is applied at most once (B6 / 13).
// Pure ESM: no DB, DOM, network or eval.
// =============================================================================
import { TakeoffValidationError, formatMm, isFiniteNumber } from "../units.js";
import { measuredRunResult } from "../flashing.js";
import { EPS_MM, LENGTH_KINDS, UNITS, ceilTol, demandId, emptyResult, identityKey, problem } from "./contract.js";
import { installationStatus, maxStockLengthMm, normaliseOutline, prepareOpenings, segmentCover, surfaceAreas } from "./supports.js";

export const ACCESSORY_ROUTES_METHOD = Object.freeze({ key: "accessory_routes", version: 1 });
export const SCOPE_STATUSES = Object.freeze(["include", "by-others", "exclude"]);
export const FLASHING_EDGES = Object.freeze(["head", "sill", "jamb-left", "jamb-right"]);
const LINEAR_KINDS = Object.freeze(["starter", "closer", "vent", "trim", "joint-strip", "joint-trim"]);
const YIELD_KINDS = Object.freeze(["aac-adhesive", "mesh", "coating", "primer"]);
/** Product/ordering data gaps that leave procurement at "missing-product" (the installed quantity may still be known). */
const MISSING_PRODUCT_CODES = Object.freeze(["product-missing", "flashing-profile-missing", "ventilation-spec-missing", "stock-policy-missing", "roll-length-missing", "sealant-yield-missing"]);
/** Purchase units bought whole: rounded up once, after aggregation. ml / m² / LM stay exact. */
const WHOLE_UNITS = Object.freeze(UNITS.filter((u) => !["lm", "m2", "ml"].includes(u)));

const finite = isFiniteNumber;
const fmt = (mm) => `${formatMm(mm, 1)} mm`;
const nonEmpty = (v) => v !== undefined && v !== null && v !== "";
const kindForUnit = (unit) => (unit === "m2" ? "area" : unit === "ml" ? "volume" : unit === "lm" ? "linear" : "count");
const num = (v) => Number(v.toFixed(3)).toLocaleString("en-AU");

/**
 * Geometric sealant volume (B5): V_ml = crossSectionArea_mm² × routeLength_mm × beadCount / 1000, before any
 * extrusion/application yield. Cross-section: { diameterMm } (round bead), { widthMm, depthMm } or { areaMm2 }.
 */
export function sealantVolumeMl({ diameterMm, widthMm, depthMm, areaMm2, lengthMm, beadCount = 1 }) {
  let area;
  if (finite(areaMm2)) area = areaMm2;
  else if (finite(diameterMm)) area = Math.PI * (diameterMm / 2) ** 2;
  else if (finite(widthMm) && finite(depthMm)) area = widthMm * depthMm;
  else throw new TakeoffValidationError("Sealant bead cross-section is missing.");
  if (!(area > 0)) throw new TakeoffValidationError("Sealant bead cross-section must be greater than 0.");
  if (!finite(lengthMm) || lengthMm < 0) throw new TakeoffValidationError("Sealant route length must be 0 or more.");
  if (!Number.isInteger(beadCount) || beadCount < 1) throw new TakeoffValidationError("Bead count must be a whole number of 1 or more.");
  return (area * lengthMm * beadCount) / 1000;
}

// ── Child flashings (B6) ─────────────────────────────────────────────────────────────────────────────────────

const edgeLength = (b, edge) => (edge === "head" || edge === "sill" ? b.x1 - b.x0 : b.y1 - b.y0);

/**
 * Child flashing demands from openings (B6): EXACTLY one demand per (opening, edge), with wall/opening source ids,
 * the chosen profile revision and the template's length kind.
 *   finished  length = edge + explicit extensions/returns; the schedule adds NO measured-run allowance.
 *   tight     length = the measured edge (+ extensions only when template.extensionsBeyondAllowance === true); the
 *             flashing schedule applies +allowance/rounding exactly once (explained here, never pre-added).
 * Stable ids mean regeneration replaces, never appends. overrides["<openingId>:<edge>"] = { lengthMm, reason } become
 * manual, reviewable differences. manualEquivalents [{ openingId, edge, measurementId, choice }] link a hand-measured
 * flashing: "use-manual" suppresses the generated child; "use-generated" records the replaced measurement; no
 * choice is a blocking possible-double-count. A repeated edge is one edge. Every opening needs its wall id (opening
 * or template) and a unique id on that wall; openings that overlap on one wall are a blocking problem and get no
 * child (their union needs the detail) — never two flashings over the same stretch.
 * template: { id, materialId, lengthKind, edges, profile: { id, revision }, identity, rules?, extensionsMm?: { [edge]: { startMm, endMm } },
 *             extensionsBeyondAllowance?, overrides?, manualEquivalents?, wallId?, authority? }
 */
export function childFlashingDemands(openings, templateIn = {}) {
  const res = emptyResult();
  const { demands, problems, explain } = res;
  const template = templateIn ?? {};
  const materialId = template.materialId ?? template.id ?? "flashing";
  const kind = template.lengthKind;
  let blocked = false;
  const profileOk = nonEmpty(template.profile?.id) && nonEmpty(template.profile?.revision);
  res.status = { quantity: "incomplete", installation: installationStatus(template.authority), procurement: profileOk && template.identity ? "draft" : "missing-product" };
  if (kind !== LENGTH_KINDS.TIGHT && kind !== LENGTH_KINDS.FINISHED) {
    problems.push(problem("flashing-length-kind-missing", "Choose whether generated flashings are tight measured runs (+allowance once) or finished lengths (no allowance)."));
    return res;
  }
  const edges = [...new Set(template.edges || [])];
  if (!edges.length || !edges.every((e) => FLASHING_EDGES.includes(e))) {
    problems.push(problem("flashing-edges-invalid", `Choose the opening edges to flash (${FLASHING_EDGES.join(", ")}).`));
    return res;
  }
  if (!profileOk) problems.push(problem("flashing-profile-missing", "Link a reviewed flashing profile revision before ordering generated flashings."));
  if (!template.identity) problems.push(problem("product-missing", "Select the flashing material before ordering."));
  try {
    const ext = (edge) => {
      const e = template.extensionsMm?.[edge] || {};
      const s = e.startMm ?? 0, t = e.endMm ?? 0;
      if (!(finite(s) && s >= 0 && finite(t) && t >= 0)) throw new TakeoffValidationError(`Flashing ${edge} extensions must be 0 mm or more.`);
      return s + t;
    };
    const anyExt = edges.some((e) => ext(e) > 0);
    if (kind === LENGTH_KINDS.TIGHT && anyExt && typeof template.extensionsBeyondAllowance !== "boolean") {
      problems.push(problem("flashing-extension-ambiguous", "Tight flashing extensions: say whether they are included in the measured-run allowance or additional to it — an allowance is never added twice."));
      return res;
    }
    const addExt = kind === LENGTH_KINDS.FINISHED || template.extensionsBeyondAllowance === true;
    const valid = [], seen = new Set();
    for (const [i, o] of (openings || []).entries()) {
      let n;
      try { n = normaliseOutline(o, `Opening ${o?.id ?? i + 1}`, { positioned: true }); } catch (e) {
        if (!(e instanceof TakeoffValidationError)) throw e;
        problems.push(problem("opening-invalid", e.message, { refs: [{ openingId: o?.id ?? null }] }));
        blocked = true;
        continue;
      }
      const openingId = o.id ?? `opening-${i + 1}`;
      const wallId = o.wallId ?? template.wallId ?? null;
      if (!nonEmpty(wallId)) {
        problems.push(problem("wall-id-missing", `Opening ${openingId}: its wall id is needed — child flashing ids and source refs are derived from it.`, { refs: [{ openingId }] }));
        blocked = true;
        continue;
      }
      if (seen.has(`${wallId}|${openingId}`)) {
        problems.push(problem("opening-duplicate-id", `Two openings on wall ${wallId} are both called ${openingId} — give each its own id.`, { refs: [{ wallId, openingId }] }));
        blocked = true;
        continue;
      }
      seen.add(`${wallId}|${openingId}`);
      if (!n.rect) {
        problems.push(problem("opening-not-rectangular", `Opening ${openingId} is not rectangular — enter its flashing lengths from the detail.`, { refs: [{ wallId, openingId }] }));
        blocked = true;
        continue;
      }
      valid.push({ n, openingId, wallId });
    }
    const overlapping = new Set();
    for (const [i, a] of valid.entries()) {
      for (const b of valid.slice(i + 1)) {
        if (a.wallId !== b.wallId) continue;
        const w = Math.min(a.n.bbox.x1, b.n.bbox.x1) - Math.max(a.n.bbox.x0, b.n.bbox.x0), h = Math.min(a.n.bbox.y1, b.n.bbox.y1) - Math.max(a.n.bbox.y0, b.n.bbox.y0);
        if (w <= EPS_MM || h <= EPS_MM) continue;
        overlapping.add(a).add(b);
        problems.push(problem("openings-overlap", `Openings ${a.openingId} and ${b.openingId} overlap on wall ${a.wallId} — correct them or enter the combined opening's flashings from the detail; neither is generated.`, { refs: [{ wallId: a.wallId, openingId: a.openingId }, { wallId: b.wallId, openingId: b.openingId }] }));
        blocked = true;
      }
    }
    for (const { n, openingId, wallId } of valid.filter((v) => !overlapping.has(v))) {
      for (const edge of edges) {
        const label = `${openingId} ${edge} flashing`;
        const eq = (template.manualEquivalents || []).find((m) => m.openingId === openingId && m.edge === edge);
        if (eq?.choice === "use-manual") { explain.push(`${label}: hand-measured ${eq.measurementId} is used instead — no generated child.`); continue; }
        const calculated = edgeLength(n.bbox, edge) + (addExt ? ext(edge) : 0);
        const ov = template.overrides?.[`${openingId}:${edge}`];
        if (ov && !(finite(ov.lengthMm) && ov.lengthMm > 0)) throw new TakeoffValidationError(`${label}: override length must be greater than 0.`);
        const lengthMm = ov ? ov.lengthMm : calculated;
        const dp = [];
        if (ov) dp.push(problem("override-difference", `${label}: manual ${fmt(ov.lengthMm)} replaces calculated ${fmt(calculated)}${ov.reason ? ` (${ov.reason})` : ""} — review the difference.`, { blocking: false, refs: [{ wallId, openingId, role: edge }] }));
        if (eq && eq.choice !== "use-generated") {
          dp.push(problem("flashing-possible-double-count", `${label}: hand-measured ${eq.measurementId} covers the same edge — choose the generated or the measured flashing.`, { refs: [{ measurementId: eq.measurementId, openingId }] }));
          blocked = true;
        }
        problems.push(...dp);
        const sourceRefs = [{ wallId, openingId, role: edge }, ...(eq?.choice === "use-generated" ? [{ measurementId: eq.measurementId, role: "replaced-manual" }] : [])];
        demands.push({ id: demandId(materialId, "flashing", wallId, openingId, edge), materialId, role: `flashing-${edge}`, kind: "linear", unit: "piece", lengthMm, quantity: 1, lengthKind: kind,
          identity: { ...(template.identity || {}), profileId: template.profile?.id ?? null, profileRevision: template.profile?.revision ?? null },
          label, sourceRefs, provenance: ov ? "manual" : "calculated", ...(dp.length ? { problems: dp } : {}) });
        if (kind === LENGTH_KINDS.TIGHT) {
          const r = measuredRunResult(lengthMm, template.rules);
          explain.push(`${label}: tight ${fmt(lengthMm)} → order ${fmt(r.finishedLengthMm)} (the flashing schedule adds ${fmt(r.allowanceMm)} once and rounds up to ${fmt(r.incrementMm)}).`);
        } else explain.push(`${label}: finished ${fmt(lengthMm)} including its ends/returns — no measured-run allowance.`);
      }
    }
  } catch (e) {
    if (!(e instanceof TakeoffValidationError)) throw e;
    problems.push(problem("invalid-input", e.message));
    return res;
  }
  res.status.quantity = blocked ? "incomplete" : "calculated";
  return res;
}

// ── Route measurement ────────────────────────────────────────────────────────────────────────────────────────

const inSpans = (p, q, W, ops = []) => segmentCover(p, q, W.points, ops).filter((s) => s.state === "in");
const edgesOf = (pts) => pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
/** CCW outline: an edge running +x has the wall above it (base); one running −x has it below (top). */
const baseEdges = (W) => edgesOf(W.points).filter(([p, q]) => q.x - p.x > EPS_MM);
const topEdges = (W) => edgesOf(W.points).filter(([p, q]) => p.x - q.x > EPS_MM);
const isDoor = (o, W) => baseEdges(W).some(([p, q]) => Math.abs(p.y - q.y) <= EPS_MM && Math.abs(o.bbox.y0 - p.y) <= EPS_MM && Math.min(q.x, o.bbox.x1) - Math.max(p.x, o.bbox.x0) > EPS_MM);

function subtractIntervals(lo, hi, cuts) {
  let out = [[lo, hi]];
  for (const [a, b] of cuts) out = out.flatMap(([x, y]) => (b <= x + EPS_MM || a >= y - EPS_MM ? [[x, y]] : [[x, a], [b, y]].filter(([u, v]) => v - u > EPS_MM)));
  return out;
}

/** Outward unit normal of edge p→q of a counter-clockwise outline (interior on the left). */
function outwardNormal(p, q) {
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  return { x: (q.y - p.y) / len, y: -(q.x - p.x) / len };
}

/** Rectangular opening edges with their outward normals. */
const RECT_EDGES = Object.freeze({
  head: { seg: (b) => [{ x: b.x0, y: b.y1 }, { x: b.x1, y: b.y1 }], n: { x: 0, y: 1 } },
  sill: { seg: (b) => [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }], n: { x: 0, y: -1 } },
  "jamb-left": { seg: (b) => [{ x: b.x0, y: b.y0 }, { x: b.x0, y: b.y1 }], n: { x: -1, y: 0 } },
  "jamb-right": { seg: (b) => [{ x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }], n: { x: 1, y: 0 } },
});

/**
 * The part of opening ops[oi]'s edge p→q (outward normal n) that is a real edge of the opening UNION on this wall:
 * inside the wall, not inside another opening's interior, and not a stretch already counted on an earlier opening's
 * coincident edge facing the same way (a duplicated or overlapping opening). Touching openings face opposite ways,
 * so both of their edges are kept (each frame is sealed/flashed). Spans are mm from p.
 */
function unionEdgeSpans(ctx, oi, p, q, n) {
  const { W, ops } = ctx;
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  const ux = (q.x - p.x) / len, uy = (q.y - p.y) / len;
  let spans = segmentCover(p, q, W.points, ops.filter((_, j) => j !== oi)).filter((s) => s.state === "in").map((s) => [s.fromMm, s.toMm]);
  for (let j = 0; j < oi; j++) {
    for (const [a, b] of edgesOf(ops[j].points)) {
      const m = outwardNormal(a, b);
      if (m.x * n.x + m.y * n.y < 1 - 1e-9) continue;
      const off = (c) => Math.abs(ux * (c.y - p.y) - uy * (c.x - p.x));
      if (off(a) > EPS_MM || off(b) > EPS_MM) continue;
      const ta = (a.x - p.x) * ux + (a.y - p.y) * uy, tb = (b.x - p.x) * ux + (b.y - p.y) * uy;
      spans = spans.flatMap(([x, y]) => subtractIntervals(x, y, [[Math.min(ta, tb), Math.max(ta, tb)]]));
    }
  }
  return spans;
}

/**
 * Segments of one named route on a wall: base (less doors when the detail excludes them), top, opening edges,
 * opening perimeter or actual layout joints (never grooves). Each: { key, lengthMm, sourceRefs }.
 */
function routeSegments(route, ctx, g) {
  const { W, ops, wallId, layoutInfo } = ctx;
  const out = [];
  const pick = ops.filter((o) => !Array.isArray(g.openingIds) || g.openingIds.includes(o.id));
  if (route === "base") {
    baseEdges(W).forEach(([p, q], i) => {
      const horizontal = Math.abs(p.y - q.y) <= EPS_MM;
      const doors = g.excludeDoors && horizontal ? pick.filter((o) => isDoor(o, W) && Math.abs(o.bbox.y0 - p.y) <= EPS_MM) : [];
      subtractIntervals(p.x, q.x, doors.map((o) => [o.bbox.x0, o.bbox.x1])).forEach(([a, b], k) => {
        const f = (b - a) / (q.x - p.x);
        out.push({ key: `base${i}:${k}`, lengthMm: Math.hypot(q.x - p.x, q.y - p.y) * f, sourceRefs: [{ wallId, role: "base" }, ...doors.map((o) => ({ wallId, openingId: o.id, role: "door-excluded" }))] });
      });
    });
  } else if (route === "top") {
    topEdges(W).forEach(([p, q], i) => out.push({ key: `top${i}`, lengthMm: Math.hypot(q.x - p.x, q.y - p.y), sourceRefs: [{ wallId, role: "top" }] }));
  } else if (["opening-head", "opening-sill", "opening-jambs", "opening-perimeter"].includes(route)) {
    for (const o of pick) {
      if (route === "opening-sill" && g.excludeDoors && isDoor(o, W)) continue;
      let segs;
      if (route === "opening-perimeter") segs = edgesOf(o.points).map(([p, q], i) => [`e${i}`, p, q, outwardNormal(p, q)]);
      else if (!o.rect) { ctx.unresolved(`Opening ${o.id} is not rectangular — enter its ${route.slice(8)} route from the detail.`, "opening-not-rectangular"); continue; }
      else segs = (route === "opening-jambs" ? ["jamb-left", "jamb-right"] : [route.slice(8)]).map((e) => [e, ...RECT_EDGES[e].seg(o.bbox), RECT_EDGES[e].n]);
      for (const [e, p, q, n] of segs) {
        unionEdgeSpans(ctx, ops.indexOf(o), p, q, n).forEach(([a, b], k) => out.push({ key: `${o.id}:${e}:${k}`, lengthMm: b - a, sourceRefs: [{ wallId, openingId: o.id, role: e }] }));
      }
    }
  } else if (route === "joints") {
    const ids = new Set();
    for (const j of layoutInfo.joints || []) {
      if (!nonEmpty(j?.id) || ids.has(j.id)) throw new TakeoffValidationError(`Every layout joint needs its own id (${nonEmpty(j?.id) ? `${j.id} is repeated` : "one has none"}) — joint demands are named by it.`);
      ids.add(j.id);
      if (j.kind === "groove") continue; // a groove is not a product joint
      if (g.orientation && j.orientation !== g.orientation) continue;
      if (![j.atMm, j.fromMm, j.toMm].every(finite) || !["horizontal", "vertical"].includes(j.orientation)) throw new TakeoffValidationError(`Layout joint ${j.id} needs an orientation, position and extent.`);
      const [p, q] = j.orientation === "horizontal" ? [{ x: j.fromMm, y: j.atMm }, { x: j.toMm, y: j.atMm }] : [{ x: j.atMm, y: j.fromMm }, { x: j.atMm, y: j.toMm }];
      inSpans(p, q, W, ops).forEach((s, k) => out.push({ key: `joint:${j.id}:${k}`, lengthMm: s.toMm - s.fromMm, sourceRefs: [{ wallId, role: `joint:${j.id}` }] }));
    }
  } else throw new TakeoffValidationError(`Unknown accessory route "${route}".`);
  return out;
}

/** Wall side height at the start (x min) or end (x max) — the tagged corner's height when none is entered. */
function sideHeight(W, at) {
  const x = at === "start" ? W.bbox.x0 : W.bbox.x1;
  return inSpans({ x, y: W.bbox.y0 }, { x, y: W.bbox.y1 }, W).reduce((t, s) => t + s.toMm - s.fromMm, 0);
}

/** Corner heights tagged on this wall, deduplicated by corner id (shared corners are ONE trim). */
function cornerSegments(type, ctx) {
  const byId = new Map();
  for (const c of ctx.layoutInfo.corners || []) {
    if (c?.type !== type) continue;
    if (!nonEmpty(c.id)) throw new TakeoffValidationError("A tagged corner needs an id.");
    const height = finite(c.heightMm) ? c.heightMm : c.at === "start" || c.at === "end" ? sideHeight(ctx.W, c.at) : null;
    if (height === null || !(height > 0)) { ctx.unresolved(`Corner ${c.id} has no height — enter it or tag the wall end it sits on.`, "corner-height-missing"); continue; }
    const extra = c.extraMm ?? 0;
    if (!(finite(extra) && extra >= 0)) throw new TakeoffValidationError(`Corner ${c.id} return must be 0 mm or more.`);
    const seg = { key: `corner:${c.id}`, lengthMm: height + extra, sourceRefs: [{ wallId: ctx.wallId, role: `corner:${c.id}` }] };
    const prev = byId.get(c.id);
    if (prev && Math.abs(prev.lengthMm - seg.lengthMm) > EPS_MM) ctx.unresolved(`Corner ${c.id} is tagged twice with different heights.`, "corner-conflict");
    if (!prev) byId.set(c.id, seg);
  }
  return [...byId.values()];
}

/** Clip a polygon to the band y0 ≤ y ≤ y1 and return its x-extent (0 if empty). */
function bandWidth(pts, y0, y1) {
  const clip = (poly, keep, yc) => {
    const out = [];
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length];
      if (keep(p)) out.push(p);
      if (keep(p) !== keep(q)) { const t = (yc - p.y) / (q.y - p.y); out.push({ x: p.x + t * (q.x - p.x), y: yc }); }
    });
    return out;
  };
  const band = clip(clip(pts, (p) => p.y >= y0, y0), (p) => p.y <= y1, y1);
  return band.length ? Math.max(...band.map((p) => p.x)) - Math.min(...band.map((p) => p.x)) : 0;
}

// ── Group handlers ───────────────────────────────────────────────────────────────────────────────────────────

/** Split a cut longer than the longest stock only where the detail permits an overlap joint. */
function splitWithOverlap(lengthMm, maxStock, overlapMm) {
  if (maxStock === null || !(lengthMm > maxStock + EPS_MM)) return { parts: [lengthMm], needsJoint: false };
  if (overlapMm === undefined || overlapMm === null) return { parts: [lengthMm], needsJoint: true };
  if (!(finite(overlapMm) && overlapMm >= 0 && overlapMm < maxStock)) throw new TakeoffValidationError("Joint overlap must be 0 or more and shorter than the stock length.");
  const parts = [];
  let rem = lengthMm;
  while (rem > maxStock + EPS_MM) { parts.push(maxStock); rem = rem - maxStock + overlapMm; }
  parts.push(rem);
  return { parts, needsJoint: false };
}

function linearDemands(g, ctx, segs, wallKeyed = true) {
  const maxStock = maxStockLengthMm(g.stockPolicy);
  if (segs.length && maxStock === null) ctx.problems.push(problem("stock-policy-missing", `${g.label ?? g.id}: stock lengths are not set — choose the product's stock policy before ordering.`));
  const gap = g.endGapMm ?? 0;
  if (!(finite(gap) && gap >= 0)) throw new TakeoffValidationError("End gap must be 0 mm or more.");
  for (const s of segs) {
    const len = s.lengthMm - 2 * gap;
    if (len <= EPS_MM) { ctx.explain.push(`${g.id} ${s.key}: ${fmt(s.lengthMm)} is used up by its end gaps — no piece.`); continue; }
    const split = splitWithOverlap(len, maxStock, g.jointOverlapMm);
    split.parts.forEach((part, i) => {
      const label = `${g.label ?? g.kind} ${s.key}${split.parts.length > 1 ? ` part ${i + 1}/${split.parts.length}` : ""}`;
      const dp = split.needsJoint ? [problem("needs-joint-detail", `${label}: ${fmt(len)} is longer than the longest stock (${fmt(maxStock)}) and the detail permits no joint — joint detail required.`, { refs: s.sourceRefs })] : [];
      if (dp.length) ctx.blocked = true;
      ctx.problems.push(...dp);
      ctx.demands.push({ id: demandId(ctx.materialId(g), g.id, wallKeyed ? ctx.wallId : null, s.key, split.parts.length > 1 ? `p${i}` : null), materialId: ctx.materialId(g), role: g.kind, kind: "linear", unit: "piece",
        lengthMm: part, quantity: 1, lengthKind: LENGTH_KINDS.CUT, identity: g.identity ?? null, stockPolicy: g.stockPolicy, noSplice: true, label, sourceRefs: s.sourceRefs, provenance: "calculated", ...(dp.length ? { problems: dp } : {}) });
    });
    if (split.parts.length > 1) ctx.explain.push(`${g.id} ${s.key}: ${fmt(len)} split into ${split.parts.length} pieces with ${fmt(g.jointOverlapMm)} overlap joints.`);
  }
}

function manualQuantityDemand(g, ctx) {
  const mq = g.manualQuantity;
  if (!mq) return false;
  const authority = typeof mq.authority === "string" ? mq.authority : mq.authority?.ref;
  if (!(finite(mq.quantity) && mq.quantity > 0) || !UNITS.includes(mq.unit) || !nonEmpty(authority)) throw new TakeoffValidationError(`${g.id}: a manual quantity needs a positive quantity, a unit and its authority.`);
  ctx.demands.push({ id: demandId(ctx.materialId(g), g.id, ctx.wallId, "manual"), materialId: ctx.materialId(g), role: g.kind, kind: kindForUnit(mq.unit), unit: mq.unit, quantity: mq.quantity,
    identity: g.identity ?? null, label: `${g.label ?? g.kind} (entered, ${authority})`, sourceRefs: [{ wallId: ctx.wallId, role: g.id }], provenance: "manual" });
  ctx.explain.push(`${g.id}: reviewed manual quantity ${mq.quantity} ${mq.unit} (${authority}).`);
  ctx.state = "manual";
  return true;
}

function membraneGroup(g, ctx) {
  const policy = g.openingPolicy ?? "none";
  const allowance = g.allowanceRate ?? 0;
  if (!(finite(allowance) && allowance >= 0)) throw new TakeoffValidationError("Membrane allowance must be an explicit rate of 0 or more.");
  if (g.mode === "estimate") {
    if (!["none", "deduct"].includes(policy)) throw new TakeoffValidationError("Membrane estimate opening policy must be none or deduct.");
    const reveal = g.revealWrapMm ?? 0;
    if (!(finite(reveal) && reveal >= 0)) throw new TakeoffValidationError("Reveal wrap must be 0 mm or more.");
    const a = ctx.areas();
    // reveal wrap follows the opening UNION's edges on this wall (an overlapped stretch is wrapped once)
    const perim = policy === "deduct" ? routeSegments("opening-perimeter", ctx, {}).reduce((t, s) => t + s.lengthMm, 0) : 0;
    const deductMm2 = policy === "deduct" ? a.openingMm2 - perim * reveal : 0;
    const areaM2 = ((a.grossMm2 - deductMm2) / 1e6) * (1 + allowance);
    const rw = g.rollWidthMm, rl = g.rollLengthMm;
    const rolls = finite(rw) && rw > 0 && finite(rl) && rl > 0 ? (areaM2 * 1e6) / (rw * rl) : null; // exact; rounded once per job
    ctx.demands.push({ id: demandId(ctx.materialId(g), g.id, ctx.wallId, "estimate"), materialId: ctx.materialId(g), role: g.kind, kind: rolls === null ? "area" : "count", unit: rolls === null ? "m2" : "roll",
      quantity: rolls === null ? areaM2 : rolls, identity: g.identity ?? null, label: `${g.label ?? "membrane"} (gross-area estimate)`, sourceRefs: [{ wallId: ctx.wallId, role: g.id }], provenance: "calculated" });
    ctx.explain.push(`${g.id}: estimate = (gross ${(a.grossMm2 / 1e6).toFixed(3)} m²${policy === "deduct" ? ` − openings ${(a.openingMm2 / 1e6).toFixed(3)} m² + reveal wrap ${((perim * reveal) / 1e6).toFixed(3)} m²` : ", openings not deducted (reveals need wrap)"}) × (1 + ${allowance}) = ${areaM2.toFixed(3)} m²${rolls === null ? "" : ` = ${num(rolls)} rolls by area (rounded up once for the job)`}.`);
    ctx.state = "estimate";
    return;
  }
  if (g.mode !== "roll") throw new TakeoffValidationError("Membrane mode must be estimate or roll.");
  if (policy !== "none") { ctx.unresolved(`${g.id}: roll layout keeps the membrane continuous across openings; use estimate mode or a reviewed manual quantity for an opening deduction.`, "membrane-roll-opening-policy"); return; }
  const { courseWidthMm: cw, rollLengthMm: rl } = g;
  const side = g.sideLapMm, end = g.endLapMm, ret = g.returnMm ?? 0;
  if (!["horizontal", "vertical"].includes(g.orientation)) throw new TakeoffValidationError("Membrane roll orientation must be horizontal or vertical.");
  if (!(finite(cw) && cw > 0 && finite(rl) && rl > 0)) { ctx.unresolved(`${g.id}: roll width and roll length are needed for a roll layout.`, "membrane-roll-data-missing"); return; }
  if (!(finite(side) && side >= 0 && side < cw && finite(end) && end >= 0 && end < rl && finite(ret) && ret >= 0)) throw new TakeoffValidationError("Membrane laps must be explicit, 0 or more and smaller than the roll; returns 0 or more.");
  const pts = g.orientation === "horizontal" ? ctx.W.points : ctx.W.points.map((p) => ({ x: p.y, y: p.x }));
  const ys = pts.map((p) => p.y), lo = Math.min(...ys), hi = Math.max(...ys);
  const n = hi - lo <= cw + EPS_MM ? 1 : ceilTol((hi - lo - side) / (cw - side));
  const runs = Array.from({ length: n }, (_, i) => {
    const y0 = lo + i * (cw - side);
    return bandWidth(pts, y0, Math.min(y0 + cw, hi)) + 2 * ret;
  });
  let rolls = 0, left = 0, endLaps = 0;
  for (const run of runs) {
    let need = run;
    while (need > EPS_MM) {
      if (left <= EPS_MM || (need > left + EPS_MM && left <= end + EPS_MM)) { rolls++; left = rl; } // a remainder no longer than the end lap is cut loss
      const take = Math.min(left, need);
      need -= take; left -= take;
      if (need > EPS_MM) { need += end; endLaps++; }
    }
  }
  const seamsMm = runs.slice(1).reduce((t, r, i) => t + Math.min(r, runs[i]), 0) + endLaps * cw;
  ctx.membraneLayouts.set(g.id, { courses: runs.length, runsMm: runs, rolls, seamsMm });
  ctx.demands.push({ id: demandId(ctx.materialId(g), g.id, ctx.wallId, "rolls"), materialId: ctx.materialId(g), role: g.kind, kind: "count", unit: "roll", quantity: rolls, identity: g.identity ?? null,
    label: `${g.label ?? "membrane"} (${n} ${g.orientation} course${n === 1 ? "" : "s"})`, sourceRefs: [{ wallId: ctx.wallId, role: g.id }], provenance: "calculated" });
  ctx.explain.push(`${g.id}: ${n} course${n === 1 ? "" : "s"} of ${fmt(cw)} (${fmt(side)} side laps), runs ${runs.map(fmt).join(", ")}; ${endLaps} end lap${endLaps === 1 ? "" : "s"} of ${fmt(end)} → ${rolls} × ${fmt(rl)} roll${rolls === 1 ? "" : "s"} (cut loss kept).`);
}

function tapeGroup(g, ctx) {
  const routes = g.routes || [];
  if (!routes.length) { ctx.unresolved(`${g.id}: choose the tape routes (opening perimeter, membrane seams).`, "routes-missing"); return; }
  let totalMm = 0;
  const parts = [];
  for (const r of routes) {
    if (r === "opening-perimeter") {
      const segs = routeSegments("opening-perimeter", ctx, g);
      const ret = g.returnPerOpeningMm ?? 0;
      if (!(finite(ret) && ret >= 0)) throw new TakeoffValidationError("Tape return per opening must be 0 mm or more.");
      if (ctx.state === "unresolved") return;
      const n = new Set(segs.map((s) => s.sourceRefs[0].openingId)).size;
      const mm = segs.reduce((t, s) => t + s.lengthMm, 0) + n * ret;
      totalMm += mm; parts.push(`opening perimeters ${fmt(mm)}`);
    } else if (r === "membrane-seams") {
      const m = ctx.membraneLayouts.get(g.membraneGroupId);
      const mm = m ? m.seamsMm : finite(g.seamLengthMm) && g.seamLengthMm >= 0 ? g.seamLengthMm : null;
      if (mm === null) { ctx.unresolved(`${g.id}: membrane seam length is unknown — use a roll-mode membrane layout or enter the seam length.`, "tape-seams-unknown"); return; }
      totalMm += mm; parts.push(`membrane seams ${fmt(mm)}`);
    } else throw new TakeoffValidationError(`Unknown tape route "${r}".`);
  }
  const allowance = g.allowanceRate ?? 0;
  if (!(finite(allowance) && allowance >= 0)) throw new TakeoffValidationError("Tape allowance must be an explicit rate of 0 or more.");
  const needMm = totalMm * (1 + allowance);
  if (needMm <= EPS_MM) { ctx.explain.push(`${g.id}: ${parts.join(" + ")} — no tape needed on this wall.`); return; }
  const rl = g.rollLengthMm;
  const rolls = finite(rl) && rl > 0 ? needMm / rl : null; // exact; rounded once per job
  if (rolls === null) ctx.problems.push(problem("roll-length-missing", `${g.id}: tape roll length is not set — ${(needMm / 1000).toFixed(3)} LM needed.`));
  ctx.demands.push({ id: demandId(ctx.materialId(g), g.id, ctx.wallId, "tape"), materialId: ctx.materialId(g), role: g.kind, kind: rolls === null ? "linear" : "count", unit: rolls === null ? "lm" : "roll",
    quantity: rolls === null ? needMm / 1000 : rolls, identity: g.identity ?? null, label: g.label ?? "tape", sourceRefs: [{ wallId: ctx.wallId, role: g.id }], provenance: "calculated" });
  ctx.explain.push(`${g.id}: ${parts.join(" + ")} × (1 + ${allowance}) = ${fmt(needMm)}${rolls === null ? "" : ` = ${num(rolls)} rolls of ${fmt(rl)} (rounded up once for the job)`}.`);
}

/**
 * Sealant (B5): Σ route length × bead count × cross-section → ml; cartridges = ml ÷ (cartridge ml × application yield),
 * kept exact and rounded once per job. A corner route's bead is emitted per tagged corner with a wall-independent id
 * (like the corner trim), so a corner shared by two walls is sealed once after mergeAccessoryResults.
 */
function sealantGroup(g, ctx) {
  const routes = g.routes || [];
  if (!routes.length) { ctx.unresolved(`${g.id}: name the sealant bead routes.`, "routes-missing"); return; }
  const cart = g.cartridgeMl, y = g.applicationYield;
  const perCartridge = finite(cart) && cart > 0 && finite(y) && y > 0 && y <= 1 ? cart * y : null;
  let wallMl = 0;
  const parts = [], shared = [];
  for (const [ri, r] of routes.entries()) {
    const cs = r.crossSection || {};
    if (!Number.isInteger(r.beadCount) || r.beadCount < 1 || !(finite(cs.areaMm2) || finite(cs.diameterMm) || (finite(cs.widthMm) && finite(cs.depthMm)))) {
      ctx.unresolved(`${g.id} ${r.id ?? r.source}: bead count and cross-section are required — sealant not quantified.`, "sealant-bead-missing");
      return;
    }
    const routeId = r.id ?? `route${ri + 1}`;
    if (r.source === "corners") {
      const segs = ["internal", "external"].filter((t) => !r.cornerType || r.cornerType === t).flatMap((t) => cornerSegments(t, ctx));
      if (ctx.state === "unresolved") return;
      for (const s of segs) shared.push({ key: `${routeId}:${s.key}`, ml: sealantVolumeMl({ ...cs, lengthMm: s.lengthMm, beadCount: r.beadCount }), lengthMm: s.lengthMm, beadCount: r.beadCount, sourceRefs: s.sourceRefs });
      if (!segs.length) parts.push(`${routeId}: no tagged corners on this wall`);
      continue;
    }
    let lengthMm;
    if (r.source === "manual") {
      if (!(finite(r.lengthMm) && r.lengthMm >= 0)) throw new TakeoffValidationError(`${g.id}: manual sealant route needs a length.`);
      lengthMm = r.lengthMm;
    } else lengthMm = routeSegments(r.source, ctx, { ...g, orientation: r.orientation, openingIds: r.openingIds ?? g.openingIds }).reduce((t, s) => t + s.lengthMm, 0);
    if (ctx.state === "unresolved") return; // a partial route total is never a quantity
    const v = sealantVolumeMl({ ...cs, lengthMm, beadCount: r.beadCount });
    wallMl += v;
    parts.push(`${routeId} ${fmt(lengthMm)} × ${r.beadCount} bead${r.beadCount === 1 ? "" : "s"} = ${v.toFixed(1)} ml`);
  }
  const push = (idTail, ml, label, sourceRefs) => {
    if (ml <= EPS_MM) return;
    ctx.demands.push({ id: demandId(ctx.materialId(g), g.id, ...idTail), materialId: ctx.materialId(g), role: g.kind, kind: perCartridge === null ? "volume" : "count", unit: perCartridge === null ? "ml" : "cartridge",
      quantity: perCartridge === null ? ml : ml / perCartridge, identity: g.identity ?? null, label, sourceRefs, provenance: "calculated" });
  };
  push([ctx.wallId, "sealant"], wallMl, g.label ?? "sealant", [{ wallId: ctx.wallId, role: g.id }]);
  for (const s of shared) {
    push([s.key], s.ml, `${g.label ?? "sealant"} ${s.key}`, s.sourceRefs);
    parts.push(`${s.key} ${fmt(s.lengthMm)} × ${s.beadCount} bead${s.beadCount === 1 ? "" : "s"} = ${s.ml.toFixed(1)} ml (shared corner — counted once across walls)`);
  }
  const ml = wallMl + shared.reduce((t, s) => t + s.ml, 0);
  if (perCartridge === null && ml > EPS_MM) ctx.problems.push(problem("sealant-yield-missing", `${g.id}: cartridge size and an explicit application yield are needed to convert ${ml.toFixed(1)} ml into cartridges.`));
  ctx.explain.push(`${g.id}: ${parts.join("; ")} → ${ml.toFixed(1)} ml geometric${perCartridge === null || ml <= EPS_MM ? "" : ` ÷ (${cart} ml × yield ${y}) = ${num(ml / perCartridge)} cartridges (rounded up once for the job)`}.`);
}

function yieldGroup(g, ctx, groups) {
  if (g.kind === "mesh" && g.basis === "joint-lm" && g.additional !== true) {
    const full = groups.find((o) => o !== g && o.kind === "mesh" && (o.scope?.status ?? "include") === "include" && (o.basis === "net-area" || o.basis === "gross-area") && o.coatingSystem === g.coatingSystem);
    if (full) { ctx.unresolved(`${g.id}: full-coverage mesh ${full.id} already covers the joints of ${g.coatingSystem ?? "this coating system"} — remove one, or mark these strips as additional reinforcement.`, "mesh-double-count"); return; }
  }
  const yl = g.yield;
  const reviewed = yl && yl.reviewed === true && finite(yl.per) && yl.per > 0 && UNITS.includes(yl.unit) && nonEmpty(yl.ref);
  if (!reviewed) {
    if (manualQuantityDemand(g, ctx)) return;
    ctx.unresolved(`${g.id}: ${g.kind} not quantified — a reviewed yield (with its source) or a reviewed manual quantity is required; no default usage is assumed.`, `${g.kind}-yield-unresolved`);
    return;
  }
  let basis, unit;
  if (g.basis === "net-area" || g.basis === "gross-area") { const a = ctx.areas(); basis = (g.basis === "net-area" ? a.netMm2 : a.grossMm2) / 1e6; unit = "m²"; }
  else if (g.basis === "joint-lm") { basis = routeSegments("joints", ctx, g).reduce((t, s) => t + s.lengthMm, 0) / 1000; unit = "LM"; }
  else if (g.basis === "cut-ends") {
    if (!(Number.isInteger(ctx.layoutInfo.cutEndCount) && ctx.layoutInfo.cutEndCount >= 0)) { ctx.unresolved(`${g.id}: the number of cut ends is not known.`, "cut-ends-unknown"); return; }
    basis = ctx.layoutInfo.cutEndCount; unit = "cut ends";
  } else throw new TakeoffValidationError(`${g.id}: basis must be net-area, gross-area, joint-lm or cut-ends.`);
  if (basis <= EPS_MM) { ctx.explain.push(`${g.id}: no ${unit} on this wall — nothing to apply.`); return; }
  const qty = basis / yl.per; // exact; whole bags/rolls are rounded once per job (aggregateConsumables)
  ctx.demands.push({ id: demandId(ctx.materialId(g), g.id, ctx.wallId, g.basis), materialId: ctx.materialId(g), role: g.kind, kind: kindForUnit(yl.unit), unit: yl.unit, quantity: qty, identity: g.identity ?? null,
    label: g.label ?? g.kind, sourceRefs: [{ wallId: ctx.wallId, role: g.id }], provenance: "calculated" });
  ctx.explain.push(`${g.id}: ${basis.toFixed(3)} ${unit} ÷ ${yl.per} per ${yl.unit} (${yl.ref}) = ${num(qty)} ${yl.unit}${WHOLE_UNITS.includes(yl.unit) ? " (rounded up once for the job)" : ""}.`);
}

// ── accessory_routes@1 ───────────────────────────────────────────────────────────────────────────────────────

/**
 * accessory_routes@1 — accessory groups of one assembly on one wall (B5/B6). wall.id is required (demand ids derive from it).
 * layoutInfo: { joints?: [{ id (unique), orientation, kind?: "joint"|"groove", atMm, fromMm, toMm }] (actual layout joints),
 *               corners?: [{ id, type: "internal"|"external", heightMm? | at?: "start"|"end", extraMm? }], cutEndCount? }
 * recipe: { id, authority?, groups: [{ id, kind, materialId?, identity, label?, required? = true,
 *   scope?: { status: "include"|"by-others"|"exclude", reason }, stockPolicy?, … kind fields }] }
 * kinds: starter|closer|vent|trim (routes: base/top/opening-head/opening-sill/opening-jambs/opening-perimeter, excludeDoors,
 *   endGapMm, jointOverlapMm), joint-strip|joint-trim (orientation; actual joints only), corner (cornerType),
 *   membrane (mode estimate|roll …), tape (routes, rollLengthMm, allowanceRate), sealant (routes [{ source, beadCount,
 *   crossSection }], cartridgeMl, applicationYield), aac-adhesive|mesh|coating|primer (basis + reviewed yield or
 *   manualQuantity), flashing (template → childFlashingDemands, openingIds?), manual (manualQuantity).
 * Opening routes follow the opening UNION (an overlapped stretch counts once). Cartridges / rolls / bags are exact
 * per wall — round them once per job with aggregateConsumables after mergeAccessoryResults.
 * Returns a MethodResult; layout.groups gives each group's scope/state and layout.readiness the missing and omitted groups.
 */
export function accessoryRoutes(wall, openings = [], layoutInfo = {}, recipeIn = {}) {
  const res = emptyResult();
  const { demands, problems, explain } = res;
  const recipe = recipeIn ?? {};
  const groupsOut = [];
  const authority = recipe.authority;
  try {
    if (!nonEmpty(wall?.id)) throw new TakeoffValidationError("The wall needs an id — accessory demand ids and source refs are derived from it.");
    const W = normaliseOutline(wall, "Wall");
    const wallId = wall.id;
    const ops = prepareOpenings(W, openings, problems);
    let areas = null;
    const ctx = {
      W, ops, wallId, layoutInfo: layoutInfo || {}, problems, explain, demands, membraneLayouts: new Map(),
      areas: () => areas || (areas = surfaceAreas(W, ops)),
      materialId: (g) => g.materialId ?? recipe.materialId ?? g.id,
    };
    const groups = recipe.groups || [];
    const groupIds = groups.map((g) => g?.id);
    if (groupIds.some((id, i) => nonEmpty(id) && groupIds.indexOf(id) !== i)) throw new TakeoffValidationError("Accessory group ids must be unique — demand ids are derived from them.");
    // Membranes first so tape can read their seams.
    const order = [...groups].sort((a, b) => (a?.kind === "membrane" ? 0 : 1) - (b?.kind === "membrane" ? 0 : 1));
    for (const g of order) {
      if (!g || !nonEmpty(g.id) || !nonEmpty(g.kind)) throw new TakeoffValidationError("Every accessory group needs an id and a kind.");
      const status = g.scope?.status ?? "include";
      const required = g.required !== false;
      const entry = { id: g.id, kind: g.kind, scope: status, reason: g.scope?.reason ?? null, required, state: "omitted", demandIds: [] };
      if (!SCOPE_STATUSES.includes(status)) throw new TakeoffValidationError(`${g.id}: scope must be include, by-others or exclude.`);
      if (status !== "include") {
        if (!nonEmpty(g.scope?.reason)) problems.push(problem("scope-reason-missing", `${g.id} is marked ${status} — record the reason.`, { refs: [{ role: g.id }] }));
        explain.push(`${g.id}: ${status}${g.scope?.reason ? ` — ${g.scope.reason}` : ""}; recorded as omitted, not as zero.`);
        groupsOut.push(entry);
        continue;
      }
      const before = demands.length;
      Object.assign(ctx, { state: "calculated", blocked: false });
      ctx.unresolved = (message, code) => { problems.push(problem(code, message, { refs: [{ wallId, role: g.id }] })); ctx.state = "unresolved"; };
      if (LINEAR_KINDS.includes(g.kind)) {
        if ((g.kind === "vent" || g.kind === "closer") && !nonEmpty(g.identity?.ventilationSpec)) problems.push(problem("ventilation-spec-missing", `${g.id}: keep the ventilation and insect/ember specification in the product — it is never inferred.`));
        const joints = g.kind === "joint-strip" || g.kind === "joint-trim";
        if (!joints && !(g.routes || []).length) ctx.unresolved(`${g.id}: choose the edges this ${g.kind} runs along.`, "routes-missing");
        else linearDemands(g, ctx, joints ? routeSegments("joints", ctx, g) : g.routes.flatMap((r) => routeSegments(r, ctx, g)));
      } else if (g.kind === "corner") {
        if (!["internal", "external"].includes(g.cornerType)) throw new TakeoffValidationError(`${g.id}: corner type must be internal or external.`);
        linearDemands(g, ctx, cornerSegments(g.cornerType, ctx), false);
      } else if (g.kind === "membrane") membraneGroup(g, ctx);
      else if (g.kind === "tape") tapeGroup(g, ctx);
      else if (g.kind === "sealant") sealantGroup(g, ctx);
      else if (YIELD_KINDS.includes(g.kind)) yieldGroup(g, ctx, groups);
      else if (g.kind === "flashing") {
        // only openings valid on this wall (invalid / wholly-outside ones are already blocking problems), as selected
        const pick = ops.filter((o) => !Array.isArray(g.openingIds) || g.openingIds.includes(o.id)).map((o) => ({ ...o.raw, id: o.id, wallId: o.raw.wallId ?? wallId }));
        const r = childFlashingDemands(pick, { ...g.template, id: g.id, materialId: ctx.materialId(g), authority: g.template?.authority ?? authority });
        demands.push(...r.demands); problems.push(...r.problems); explain.push(...r.explain);
        if (r.status.quantity !== "calculated") ctx.state = "unresolved";
      } else if (g.kind === "manual") {
        if (!manualQuantityDemand(g, ctx)) ctx.unresolved(`${g.id}: enter the reviewed quantity and its authority.`, "manual-quantity-missing");
      } else ctx.unresolved(`${g.id}: unknown accessory kind "${g.kind}".`, "unknown-accessory-kind");
      if (g.kind !== "flashing" && !g.identity) problems.push(problem("product-missing", `${g.id}: select the product before ordering.`, { refs: [{ role: g.id }] }));
      entry.state = ctx.blocked && ctx.state === "calculated" ? "unresolved" : ctx.state;
      entry.demandIds = demands.slice(before).map((d) => d.id);
      groupsOut.push(entry);
    }
    groupsOut.sort((a, b) => groups.findIndex((g) => g.id === a.id) - groups.findIndex((g) => g.id === b.id));
    const a = ctx.areas();
    res.layout = {
      method: `${ACCESSORY_ROUTES_METHOD.key}@${ACCESSORY_ROUTES_METHOD.version}`, wallId,
      areas: { grossM2: a.grossMm2 / 1e6, openingM2: a.openingMm2 / 1e6, netM2: a.netMm2 / 1e6 },
      membranes: Object.fromEntries(ctx.membraneLayouts),
      groups: groupsOut,
      readiness: {
        missing: groupsOut.filter((x) => x.state === "unresolved").map((x) => x.id),
        omitted: groupsOut.filter((x) => x.state === "omitted").map((x) => ({ id: x.id, scope: x.scope, reason: x.reason, required: x.required })),
      },
    };
    res.layout.readiness.complete = !res.layout.readiness.missing.length && !problems.some((p) => p.blocking);
    const included = groupsOut.filter((x) => x.state !== "omitted");
    res.status = {
      quantity: problems.some((p) => ["opening-invalid", "opening-outside-wall", "opening-duplicate-id"].includes(p.code)) || included.some((x) => x.state === "unresolved") ? "incomplete" : included.some((x) => x.state === "estimate") ? "estimate" : "calculated",
      installation: groupsOut.length && !included.length ? "out-of-scope" : installationStatus(authority),
      procurement: problems.some((p) => MISSING_PRODUCT_CODES.includes(p.code)) ? "missing-product" : "draft",
    };
  } catch (e) {
    if (!(e instanceof TakeoffValidationError)) throw e;
    problems.push(problem("invalid-input", e.message));
    res.status = { quantity: "incomplete", installation: installationStatus(authority), procurement: "draft" };
  }
  return res;
}

const QUANTITY_RANK = ["incomplete", "estimate", "calculated", "reviewed"];
const INSTALLATION_RANK = ["unspecified", "source-pending", "project-detail-supplied", "supported-by-selected-rule"];
const PROCUREMENT_RANK = ["missing-product", "unavailable-stock", "stale", "draft", "ready"];

/**
 * Combine per-wall accessory (or support) results for one job scope. Demands with the same stable id — e.g. a
 * corner trim or corner sealant bead tagged on both walls that share it — are ONE physical item: kept once with
 * merged source refs. Same id with different physical content is a blocking conflict (quantity incomplete). Each
 * status axis takes its weakest value; installation is out-of-scope only when every part is.
 */
export function mergeAccessoryResults(results) {
  const out = emptyResult();
  const byId = new Map();
  const physical = (d) => identityKey({ kind: d.kind, unit: d.unit, lengthMm: d.lengthMm, quantity: d.quantity, lengthKind: d.lengthKind, identity: d.identity });
  for (const r of results || []) {
    for (const d of r.demands) {
      const prev = byId.get(d.id);
      if (!prev) { const copy = { ...d, sourceRefs: [...(d.sourceRefs || [])] }; byId.set(d.id, copy); out.demands.push(copy); continue; }
      if (physical(prev) !== physical(d)) { out.problems.push(problem("shared-id-conflict", `${d.label ?? d.id} is shared between walls but measured differently — reconcile it.`, { refs: [{ role: d.id }] })); continue; }
      const seen = new Set(prev.sourceRefs.map(identityKey));
      for (const s of d.sourceRefs || []) if (!seen.has(identityKey(s))) prev.sourceRefs.push(s);
    }
    out.problems.push(...r.problems);
    out.explain.push(...r.explain);
  }
  const weakest = (rank, axis) => {
    const vals = (results || []).map((r) => r.status?.[axis]).filter((v) => rank.includes(v));
    return vals.length ? rank[Math.min(...vals.map((v) => rank.indexOf(v)))] : out.status[axis];
  };
  const parts = results || [];
  const allOutOfScope = parts.length && parts.every((r) => r.status?.installation === "out-of-scope");
  out.status = {
    quantity: out.problems.some((p) => p.code === "shared-id-conflict") ? "incomplete" : weakest(QUANTITY_RANK, "quantity"),
    installation: allOutOfScope ? "out-of-scope" : weakest(INSTALLATION_RANK, "installation"),
    procurement: weakest(PROCUREMENT_RANK, "procurement"),
  };
  out.layout = { parts: parts.map((r) => r.layout) };
  return out;
}

/**
 * Pool consumable demands (count / volume / area, and random-length LM) across the selected job scope by purchase
 * identity + unit, THEN round whole purchase units (cartridges, rolls, bags …) up ONCE. Per-wall demands carry exact
 * quantities, so ten walls each needing a fifth of a cartridge order two cartridges, not ten ("not arbitrary tubes
 * per wall"). ml / m² / LM stay exact. Fixings box-round through supports.aggregateFixings and linear/sheet pieces go
 * through stock allocation, so both are left out here. Run after mergeAccessoryResults so shared items count once.
 * @returns {Array<{ identityKey: string, identity: object|null, unit: string, exact: number, quantity: number, demandIds: string[] }>}
 */
export function aggregateConsumables(demands) {
  const groups = new Map();
  for (const d of demands || []) {
    if (!d || String(d.role || "").startsWith("fixing") || d.kind === "sheet" || (d.kind === "linear" && d.unit !== "lm")) continue;
    if (!finite(d.quantity) || d.quantity < 0) throw new TakeoffValidationError(`${d.label ?? d.id}: quantity must be a number of 0 or more.`);
    const key = `${d.unit}|${identityKey(d.identity ?? null)}`;
    const g = groups.get(key) || { identityKey: identityKey(d.identity ?? null), identity: d.identity ?? null, unit: d.unit, exact: 0, demandIds: [] };
    g.exact += d.quantity;
    g.demandIds.push(d.id);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, quantity: WHOLE_UNITS.includes(g.unit) ? ceilTol(g.exact) : g.exact }));
}
