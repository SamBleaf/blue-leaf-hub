// =============================================================================
// shared/takeoff/engine/dispatch.js — generic method dispatch (TC-R04 06): job material + its measurements →
// method module → Demands → stock allocation → purchase lines (schedule lines) + per-material results.
//
// Flashing keeps schedule.js's own path. Every other family (engine/families.js) comes through here:
//   timber      repeated_members@2 (rafters/joists/battens), wall_frame@1 (studs), linear_stock@1 (plates,
//               noggins, trim, other members, manual/count entries)
//   aluminium   linear_stock@1 — window three-edge preset per opening + measured runs, pooled into 6500 bars
//   cladding    sheet_layout@2 / course_layout@1 / panel_grid@1 / aac_panel_layout@1 / area_to_linear@2
//   batten      support_grid@1;  accessory  accessory_routes@1
// Linear demands with a stock policy go through ONE allocator (engine/allocator.js). A purchase line is
// (procurement identity, unit, stock size) — units are never added together. A measurement that cannot be
// turned into demands is a missing requirement (blocks ordering), never zero.
// Pure: same function on client (live preview) and server (authoritative). No DB/DOM/network/eval.
// =============================================================================
import { TakeoffValidationError, formatMm, stableStringify } from "../units.js";
import { calibrationOrderReady, pointToMm, pointsWithinCalibration, polylineLengthMm } from "../calibration.js";
import { identityKey } from "./contract.js";
import { FAMILIES, familyIdentity, familyProblems, normaliseFamilySpec, stockIdentityKey } from "./families.js";
import { computeManualTimber, computeNoggins, computePlates, computeRepeatedMembers, computeStudWall, computeTrim, repeatedPositions, timberIdentity } from "./timber.js";
import { allocateLinear } from "./allocator.js";
import { selectStock } from "./stock.js";
import { buildWall, wallAreas } from "./wall.js";
import { aacPanelLayout, areaToLinear, courseLayout, panelGrid, shareSheetsAcrossWalls, sheetLayout } from "./cladding.js";
import { supportGrid } from "./supports.js";
import { accessoryRoutes } from "./accessories.js";
import { FOLLOWERS_VERSION, FOLLOWER_KINDS, FOLLOWER_TEXT, FOAM_TAPE, followerNote, followerRule, wallFollowers } from "./followers.js";
import { CATALOGUE_SEED } from "../products/seed.js";

const UNIT_INTEGER = new Set(["piece", "sheet", "bar", "box", "bag", "roll", "pack", "cartridge"]);
/**
 * Generated pieces per takeoff (06 proposed 5,000 per wall / 50,000 per job "from evidence"). Measured 2026-10-14:
 * 49,510 generated studs take ~2.4 s per calculation on the server, and a save calculates up to three times — so the
 * job limit is 20,000 (~1 s). Excess is refused with split guidance, never truncated.
 */
export const JOB_GENERATED_LIMIT = 20000;
const fmt = (mm) => formatMm(mm, 1);

/** Measurement kinds each generic method READS. Anything else assigned to the material would be silently ignored —
 *  so it is refused by the server and flagged by the engine (never dropped). */
export function methodReads(mat) {
  const fam = mat?.spec?.family;
  if (fam === "timber") {
    if (mat.methodKey === "repeated_members") return ["distribution", "run", "polyline", "member", "manual", "count"];
    if (mat.methodKey === "wall_frame") return ["wall", "manual", "count"];
    const purpose = mat.spec?.purpose;
    if (purpose === "plates") return ["wall", "run", "polyline", "manual", "count"];
    if (purpose === "noggins") return ["wall", "manual", "count"];
    return ["run", "polyline", "manual", "count"];
  }
  if (fam === "aluminium") return ["opening", "run", "polyline", "manual", "offcut"];
  return ["wall"];
}

/** Is this a TC-R04 family material (anything but flashing)? */
export function isGenericMaterial(mat) {
  return !!mat?.spec?.family && FAMILIES.includes(mat.spec.family);
}

/** What the material IS for procurement (identity + method) — a change here makes its draft order lines stale. */
export function genericMaterialKey(mat) {
  let id;
  try { id = familyIdentity(mat.spec); } catch { id = `invalid:${mat.id}`; }
  return stableStringify({ method: `${mat.methodKey}@${mat.methodVersion}`, identity: id });
}

// ── measurement resolution ───────────────────────────────────────────────────

/** Calibrated length of a plan-traced measurement (+ the same scale/plan problems flashing runs get). */
function tracedLength(m, ctx) {
  const problems = [];
  const cal = m.calibrationId ? ctx.calibrationsById.get(m.calibrationId) : null;
  if (!cal) return { lengthMm: null, problems: ["calibration_missing"] };
  if (!Array.isArray(m.points) || m.points.length < 2) return { lengthMm: null, problems: ["measurement_invalid"] };
  if (!pointsWithinCalibration(cal, m.points)) problems.push("outside_region");
  if (ctx.latestCalibration && ctx.latestCalibration(cal)?.id !== cal.id) problems.push("calibration_superseded");
  if (!calibrationOrderReady(cal)) problems.push("calibration_not_ready");
  const doc = ctx.documentsById?.get(m.documentId);
  if (doc && doc.status !== "current") problems.push("plan_superseded");
  // each straight leg separately: a corner in a timber/aluminium run is a JOINT (one piece per leg), never one bent member
  const legs = m.points.slice(1).map((p, i) => polylineLengthMm(cal, [m.points[i], p])).filter((L) => L > 1e-6);
  return { lengthMm: polylineLengthMm(cal, m.points), legs, problems, cal };
}

/** Wall measurement → { wall (wall.js input), openings, label, problems }. Entered numbers are authoritative. */
function resolveWall(m, ctx) {
  const inp = { ...(m.inputs || {}) };
  const problems = [];
  let widthMm = inp.widthMm;
  if (Array.isArray(m.points) && m.points.length >= 2) {
    const t = tracedLength(m, ctx);
    problems.push(...t.problems);
    if (inp.kind === "polygon" && t.cal && m.points.length >= 3) {
      // traced elevation outline: local wall mm, x along the wall, y up from the lowest point
      const q = m.points.map((p) => pointToMm(t.cal, m.points[0], p));
      const minX = Math.min(...q.map((p) => p.x)), maxY = Math.max(...q.map((p) => p.y));
      inp.polygon = q.map((p) => ({ x: p.x - minX, y: maxY - p.y }));
    } else if (t.lengthMm != null) widthMm = t.lengthMm;
  }
  const kind = inp.kind || "rect";
  // a rake / gable may legitimately start at 0 (triangular) — only an ABSENT height is missing
  const has = (v) => v != null && v !== "";
  const missing = kind === "rect" ? !inp.heightMm : kind === "rake" ? !(has(inp.startHeightMm) && has(inp.endHeightMm))
    : kind === "gable" ? !(has(inp.eavesHeightMm) && inp.apexHeightMm && inp.apexXMm != null) : !(Array.isArray(inp.polygon) && inp.polygon.length >= 3);
  if (!widthMm && kind !== "polygon") problems.push("wall_incomplete");
  if (missing) problems.push("wall_incomplete");
  const openings = (ctx.openingsByWall.get(m.id) || []).map((o) => {
    const x = o.inputs || {};
    return { id: o.id, label: x.label || null, type: x.type || "window", xMm: x.xMm, sillMm: x.sillMm, widthMm: x.widthMm, heightMm: x.heightMm,
      x0: x.xMm, y0: x.sillMm, x1: x.xMm + x.widthMm, y1: x.sillMm + x.heightMm, detail: x.detail || null };
  });
  const wall = { id: m.id, kind, widthMm, heightMm: inp.heightMm, startHeightMm: inp.startHeightMm, endHeightMm: inp.endHeightMm,
    eavesHeightMm: inp.eavesHeightMm, apexXMm: inp.apexXMm, apexHeightMm: inp.apexHeightMm, points: inp.polygon };
  return { wall, openings, label: inp.name || m.label || "Wall", heightSource: inp.heightSource || "entered", problems };
}

// ── method adapters: material + its contributions → MethodResult(s) ──────────

const sectionText = (n) => (n.section?.depthMm && n.section?.widthMm ? `${n.section.depthMm}x${n.section.widthMm}` : null);
const timberId = (n) => timberIdentity({ section: sectionText(n), grade: n.grade, treatment: n.treatment, species: n.species, supplier: n.supplierName });
const timberStock = (n) => ({ maxMm: n.stock?.maxMm ?? null, unavailableMm: n.stock?.unavailableMm || [] });
const PURPOSE_ROLE = { rafters: "rafter", joists: "joist", battens: "member" };

function memberInput(n, rules, memberMeas, ctx, sink) {
  const allowanceMm = n.endAllowanceMm || 0;
  if (rules.lengthSource === "entered") return { mode: "entered", lengthMm: rules.enteredLengthMm, allowanceMm };
  if (!memberMeas) { sink.problems.push({ code: "member_missing", message: "Measure one member (the member line) or enter the cut length.", blocking: true }); return null; }
  const t = tracedLength(memberMeas, ctx);
  sink.measProblems.set(memberMeas.id, t.problems);
  if (t.lengthMm == null) return null;
  return { measurementId: memberMeas.id, mode: rules.lengthSource === "true" ? "true" : "projected", lengthMm: t.lengthMm, pitchDeg: rules.pitchDeg ?? null, allowanceMm };
}

function overridesFrom(list) {
  const out = {};
  for (const o of list || []) {
    if (o.removed) { out[o.station] = { remove: true }; continue; }
    const ov = {};
    if (o.lengthMm) ov.member = { mode: "entered", lengthMm: o.lengthMm };
    if (o.duplicate) ov.duplicate = o.duplicate;
    out[o.station] = ov;
  }
  return out;
}

/**
 * Distribution runs → engine segments. Runs that meet end-to-end (same page, endpoints within 1 mm, collinear) are ONE
 * run (03 T1: a shared end is one member, one grid); a run that retraces another on the same line is flagged — it would
 * double every member. Each remaining run restarts its own grid.
 */
function connectedRuns(ms, ctx, sink, lengthOf) {
  const geo = ms.map((m) => {
    const cal = m.calibrationId ? ctx.calibrationsById.get(m.calibrationId) : null;
    const pts = Array.isArray(m.points) && m.points.length >= 2 ? [m.points[0], m.points[m.points.length - 1]] : null;
    const mm = cal && pts ? pts.map((p) => pointToMm(cal, pts[0], p)) : null;
    return { m, cal, pts, L: lengthOf(m), dir: mm ? Math.atan2(mm[1].y - mm[0].y, mm[1].x - mm[0].x) : null };
  }).filter((g) => g.L != null);
  const near = (g, p, q) => g.cal && g.cal.id && (() => { const d = pointToMm(g.cal, p, q); return Math.hypot(d.x, d.y) <= 1; })();
  const parallel = (a, b) => { const d = Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); return d < 0.01 || Math.abs(d - Math.PI) < 0.01; };
  const used = new Set(), out = [];
  for (const g of geo) {
    if (used.has(g.m.id)) continue;
    used.add(g.m.id);
    const chain = [g];
    let grew = true;
    while (grew) {
      grew = false;
      for (const h of geo) {
        if (used.has(h.m.id) || !h.pts || !g.pts || h.m.calibrationId !== g.m.calibrationId || !parallel(h.dir, g.dir)) continue;
        const ends = chain.flatMap((c) => c.pts);
        if (h.pts.some((p) => ends.some((e) => near(h, p, e)))) { chain.push(h); used.add(h.m.id); grew = true; }
      }
    }
    if (chain.length === 1) out.push({ id: g.m.id, measurementId: g.m.id, runMm: g.L, ...(g.m.inputs ? { startOffsetMm: g.m.inputs.startOffsetMm, endOffsetMm: g.m.inputs.endOffsetMm, includeStart: g.m.inputs.includeStart, includeEnd: g.m.inputs.includeEnd } : {}) });
    else out.push({ id: chain.map((c) => c.m.id).join("+"), parts: chain.map((c) => ({ measurementId: c.m.id, runMm: c.L })) });
  }
  // a run lying ON another run (same line, overlapping) would count its members twice
  for (let i = 0; i < geo.length; i++) for (let j = i + 1; j < geo.length; j++) {
    const a = geo[i], b = geo[j];
    if (!a.cal || !b.cal || a.m.calibrationId !== b.m.calibrationId || !parallel(a.dir, b.dir)) continue;
    const mid = { x: (b.pts[0].x + b.pts[1].x) / 2, y: (b.pts[0].y + b.pts[1].y) / 2 };
    const ab = pointToMm(a.cal, a.pts[0], a.pts[1]), am = pointToMm(a.cal, a.pts[0], mid);
    const len = Math.hypot(ab.x, ab.y), t = (am.x * ab.x + am.y * ab.y) / (len * len), off = Math.abs(am.x * ab.y - am.y * ab.x) / len;
    if (off <= 5 && t > 0.001 && t < 0.999) sink.problems.push({ code: "distribution_overlap", message: "Two distribution runs lie on top of each other — every member there would be counted twice. Remove the duplicate run.", blocking: true });
  }
  return out;
}

function runTimber(mat, n, items, ctx, sink) {
  const rules = mat.rules || {};
  const identity = timberId(n);
  // a schedule/engineer source counts only WITH its reference; otherwise the size is a manual selection
  const scheduled = n.sizing?.provenance && n.sizing.provenance !== "manual" && n.sizing.reference;
  const base = { materialId: mat.id, identity, stock: timberStock(n), sizing: scheduled ? { source: "projectSchedule", ref: n.sizing.reference } : { source: "manual" } };
  const results = [];
  const lengthOf = (m) => { const t = tracedLength(m, ctx); sink.measProblems.set(m.id, t.problems); return t.lengthMm; };
  const legsOf = (m) => { const t = tracedLength(m, ctx); sink.measProblems.set(m.id, t.problems); return t.legs || []; };
  const manualItems = items.filter((x) => x.m.kind === "manual" || x.m.kind === "count");
  if (mat.methodKey === "repeated_members") {
    const dist = items.filter((x) => x.role === "distribution" || (x.role === "primary" && ["run", "polyline", "distribution"].includes(x.m.kind)));
    const member = items.find((x) => x.role === "member" || x.m.kind === "member")?.m || null;
    if (!dist.length) {
      // entered lengths alone are a valid takeoff ("Add lengths"); a member line without its run is not
      if (!manualItems.length || member) sink.problems.push({ code: "distribution_missing", message: "Draw the distribution run the members are spaced along.", blocking: true });
    } else {
      const mem = memberInput(n, rules, member, ctx, sink);
      const segments = mem ? connectedRuns(dist.map(({ m }) => m), ctx, sink, lengthOf) : [];
      if (segments.length) {
        const overrides = Object.assign({}, ...dist.map(({ m }) => overridesFrom(m.inputs?.overrides)));
        results.push(computeRepeatedMembers({ ...base, purpose: PURPOSE_ROLE[n.purpose] || "member", segments, centresMm: rules.centresMm ?? 600, spacing: rules.spacing || "fixed",
          startOffsetMm: rules.startOffsetMm ?? 0, endOffsetMm: rules.endOffsetMm ?? 0, includeStart: rules.includeStart !== false, includeEnd: rules.includeEnd !== false,
          plies: n.plies || 1, member: mem, overrides }));
      }
    }
  } else if (mat.methodKey === "wall_frame") {
    for (const { m } of items.filter((x) => x.m.kind === "wall")) {
      const w = resolveWall(m, ctx);
      sink.measProblems.set(m.id, w.problems.filter((p) => p !== "wall_incomplete"));
      if (!w.wall.widthMm) { sink.problems.push({ code: "wall_incomplete", message: `${w.label}: enter or trace the wall length.`, blocking: true }); continue; }
      const studLen = rules.studHeightMm || w.wall.heightMm;
      if (!studLen) { sink.problems.push({ code: "wall_incomplete", message: `${w.label}: enter the stud cut length or frame height.`, blocking: true }); continue; }
      // frame height needs BOTH plate build-ups entered (T4 explicit) — never assumed 0
      if (rules.heightMode === "frame" && !(rules.bottomPlateMm > 0 && rules.topPlateMm > 0)) {
        sink.problems.push({ code: "plates_missing", message: `${w.label}: enter the bottom and top plate thickness to turn the frame height into a stud length.`, blocking: true });
        continue;
      }
      const height = rules.heightMode === "frame"
        ? { mode: "frameHeight", frameHeightMm: studLen, bottomPlateMm: rules.bottomPlateMm, topPlateMm: rules.topPlateMm }
        : { mode: "studCut", studLengthMm: studLen };
      results.push(computeStudWall({ ...base, wallId: m.id, measurementId: m.id, wallLengthMm: w.wall.widthMm, centresMm: rules.centresMm ?? 600, spacing: rules.spacing || "fixed",
        startOffsetMm: rules.startOffsetMm ?? 0, endOffsetMm: rules.endOffsetMm ?? 0, includeStart: rules.includeStart !== false, includeEnd: rules.includeEnd !== false,
        plies: n.plies || 1, allowanceMm: n.endAllowanceMm || 0, height,
        openings: w.openings.map((o) => ({ id: o.id, xLeftMm: o.xMm, xRightMm: o.xMm + o.widthMm, sillMm: o.sillMm, headMm: o.sillMm + o.heightMm, ...(o.detail ? { detail: o.detail } : {}) })) }));
    }
  } else {
    // linear_stock@1 — plates / noggins / trim / other members + manual/count entries
    const walls = items.filter((x) => x.m.kind === "wall");
    const runs = items.filter((x) => ["run", "polyline"].includes(x.m.kind));
    if (n.purpose === "plates") {
      const layers = (Array.isArray(rules.plateLayers) && rules.plateLayers.length ? rules.plateLayers : ["bottom", "top"]).map((tag) => ({ tag: String(tag) }));
      for (const { m } of walls) {
        const runMm = resolveWall(m, ctx).wall.widthMm;
        if (runMm) results.push(computePlates({ ...base, wallId: m.id, measurementId: m.id, runMm, layers, allowanceMm: n.endAllowanceMm || 0 }));
      }
      for (const { m } of runs) {
        const legs = legsOf(m);
        legs.forEach((runMm, k) => results.push(computePlates({ ...base, wallId: legs.length > 1 ? `${m.id}:${k + 1}` : m.id, measurementId: m.id, runMm, layers, allowanceMm: n.endAllowanceMm || 0 })));
      }
    } else if (n.purpose === "noggins") {
      if (!n.section?.widthMm) sink.problems.push({ code: "material_incomplete", message: "Enter the stud/noggin section so the clear bays can be worked out.", blocking: true });
      for (const { m } of n.section?.widthMm ? walls : []) {
        const w = resolveWall(m, ctx);
        if (!w.wall.widthMm) continue;
        const pos = repeatedPositions({ runMm: w.wall.widthMm, centresMm: rules.centresMm ?? 600, includeStart: true, includeEnd: true });
        results.push(computeNoggins({ ...base, wallId: m.id, stations: pos.map((p) => ({ positionMm: p, widthMm: n.section.widthMm })),
          rows: rules.nogginRows ?? undefined, rowsSource: rules.nogginRows ? "entered" : undefined,
          openings: w.openings.map((o) => ({ id: o.id, xLeftMm: o.xMm, xRightMm: o.xMm + o.widthMm })), allowanceMm: n.endAllowanceMm || 0 }));
      }
    } else if (runs.length) {
      const segments = [];
      for (const { m } of runs) {
        const legs = legsOf(m);
        legs.forEach((L, k) => segments.push({ id: legs.length > 1 ? `${m.id}:${k + 1}` : m.id, measurementId: m.id, lengthMm: L }));
      }
      if (segments.length) results.push(computeTrim({ ...base, segments, joinsAllowed: rules.joinsAllowed === true, cutAllocation: rules.cutAllocation === true }));
    }
  }
  // entered / counted lengths are valid for EVERY timber method (extra members, trimmers …) — never silently dropped
  const manual = manualItems;
  if (manual.length) {
    results.push(computeManualTimber({ ...base, role: n.purpose, allowanceMm: n.endAllowanceMm || 0, entries: manual.map(({ m }) => (m.kind === "count"
      ? { id: m.id, kind: "count", measurementId: m.id, lengthMm: m.finishedLengthMm, markers: (m.points || []).map((_, i) => ({ id: `${m.id}:${i}` })) }
      : m.inputs?.orderedStock ? { id: m.id, kind: "orderedStock", measurementId: m.id, quantity: m.quantity, stockLengthMm: m.finishedLengthMm, source: "entered" }
        : { id: m.id, kind: "cut", measurementId: m.id, quantity: m.quantity, lengthMm: m.finishedLengthMm })) }));
  }
  if (!results.length && !sink.problems.length) sink.problems.push({ code: "nothing_measured", message: "Nothing measured for this timber yet.", blocking: false });
  return results;
}

/** Aluminium: window preset cuts per opening + measured/entered runs, as cut demands for the bar allocator. */
function runAluminium(mat, n, items, ctx, sink) {
  const identity = { family: "aluminium", ...familyIdentity(n) };
  const policy = { kind: "fixed", lengthMm: n.stockLengthMm, kerfMm: n.kerfMm ?? 0, endTrimMm: n.endTrimMm || 0, finalEndAcceptable: n.finalEndAcceptable !== false,
    kerfConfirmed: !!n.kerfConfirmed, minRetainedOffcutMm: n.minRetainedOffcutMm ?? 300, sharePieces: true };
  const wp = n.windowPreset || {};
  const demands = [];
  const cut = (id, lengthMm, label, refs, role) => demands.push({ id, materialId: mat.id, role, kind: "linear", unit: "bar", lengthMm, quantity: 1, lengthKind: "cut",
    identity, stockPolicy: policy, noSplice: true, label, sourceRefs: refs, provenance: "calculated" });
  for (const { m } of items) {
    if (m.kind === "opening") {
      const o = m.inputs || {};
      const tag = o.label || `Opening ${String(m.id).slice(0, 4)}`;
      const refs = [{ measurementId: m.id, openingId: m.id, wallId: m.parentId || null }];
      const jamb = o.heightMm + (wp.jambAllowanceTotalMm ?? 100);
      if (wp.left !== false) cut(`${mat.id}:${m.id}:left`, jamb, `${tag} left jamb`, refs, "jamb-left");
      if (wp.right !== false) cut(`${mat.id}:${m.id}:right`, jamb, `${tag} right jamb`, refs, "jamb-right");
      if (wp.bottom !== false) cut(`${mat.id}:${m.id}:bottom`, o.widthMm + (wp.bottomAllowanceMm || 0), `${tag} bottom`, refs, "sill");
      if (wp.head === true) cut(`${mat.id}:${m.id}:head`, o.widthMm + (wp.headAllowanceMm || 0), `${tag} head`, refs, "head");
    } else if (m.kind === "run" || m.kind === "polyline") {
      const t = tracedLength(m, ctx);
      sink.measProblems.set(m.id, t.problems);
      (t.legs || []).forEach((L, k, all) => cut(`${mat.id}:${m.id}:run${all.length > 1 ? k + 1 : ""}`, L, `${m.label || "Run"}${all.length > 1 ? ` leg ${k + 1}` : ""} ${fmt(L)}`, [{ measurementId: m.id }], "run"));
    } else if (m.kind === "manual") {
      for (let i = 0; i < (m.quantity || 1); i++) cut(`${mat.id}:${m.id}:${i}`, m.finishedLengthMm, m.label || `Cut ${fmt(m.finishedLengthMm)}`, [{ measurementId: m.id }], "cut");
    }
  }
  if (!demands.length) sink.problems.push({ code: "nothing_measured", message: "Add openings or runs for this aluminium.", blocking: false });
  if (n.kerfMm == null || !n.kerfConfirmed) sink.problems.push({ code: "kerf_unconfirmed", message: "Saw kerf not confirmed — the cutting plan is an estimate until it is.", blocking: true });
  return [{ demands, layout: null, problems: [], status: { quantity: "calculated", installation: "unspecified", procurement: "draft" }, explain: [] }];
}

// job family → the catalogue family the layout methods accept (12: Rendex foam is its own "eps-cladding")
const CATALOGUE_FAMILY = { cladding: "cladding", aac: "aac", foam: "eps-cladding", "timber-cladding": "timber-cladding", batten: "batten" };

/** The job's product snapshot as catalogue records — one per listed stock length (same product, own SKU). */
function productVariants(n) {
  const p = n.product || {};
  const lengths = p.lengthsMm?.length ? p.lengthsMm : p.lengthMm ? [p.lengthMm] : [null];
  return lengths.map((L) => ({
    id: (p.skus || []).find((x) => x.lengthMm === L)?.id || p.id || "custom", family: CATALOGUE_FAMILY[n.family] || n.family, manufacturer: p.manufacturer, name: p.name,
    sku: (p.skus || []).find((x) => x.lengthMm === L)?.sku || (lengths.length === 1 ? p.sku : null) || null,
    finish: p.finish, coating: n.coating, endMatched: n.endCondition === "end-matched",
    dimensionsMm: { length: L, width: p.widthMm, thickness: p.thicknessMm }, effectiveCoverMm: p.effectiveCoverMm,
  }));
}

/** HUB 016b: fibre-cement sheets are shared across every wall of the material unless it is switched off. */
export const sharesAcrossWalls = (mat) => mat?.rules?.shareSheetsAcrossWalls !== false;

function runWallMethod(mat, n, items, ctx, sink) {
  const rules = mat.rules || {};
  const results = [];
  for (const { m } of items.filter((x) => x.m.kind === "wall")) {
    const w = resolveWall(m, ctx);
    sink.measProblems.set(m.id, w.problems.filter((p) => p !== "wall_incomplete"));
    if (w.problems.includes("wall_incomplete")) { sink.problems.push({ code: "wall_incomplete", message: `${w.label}: enter the wall length and heights.`, blocking: true }); continue; }
    const built = buildWall({ ...w.wall, measurementId: m.id });
    if (!built.polygon) { sink.problems.push(...built.problems.map((p) => ({ ...p, blocking: true, message: `${w.label}: ${p.message}` }))); continue; }
    const wallGeom = built;
    // readable AND unique per material: the wall label (+ short id when two walls share a name) names cells/demands
    const tag = sink.wallTags.get(m.id);
    const variants = productVariants(n);
    // the SELECTED installation assembly (never auto-approved): with no reviewed rows it stays source-pending
    const assembly = n.assemblyId ? CATALOGUE_SEED.assemblyCandidates.find((a) => a.id === n.assemblyId) || { id: n.assemblyId } : null;
    const installation = { assembly, conditions: rules.installConditions, projectDetail: rules.projectDetail, outOfScope: rules.installationOutOfScope === true };
    const opts = { materialId: mat.id, wallId: tag, orientation: n.orientation, installation };
    let r;
    // a datum set on ONE wall applies to that wall only (rules.datumByWall); rules.datumMm is the material default
    const datumMm = rules.datumByWall?.[m.id] ?? rules.datumMm;
    if (mat.methodKey === "sheet_layout") r = sheetLayout(wallGeom, w.openings, variants, { ...opts, datumMm, heightAllowanceMm: rules.heightAllowanceMm, jointRows: rowsFor(rules.jointRows, built.bbox, n.orientation === "horizontal") });
    else if (mat.methodKey === "course_layout") r = courseLayout(wallGeom, w.openings, variants, { ...opts, datumMm, joints: rules.joints });
    else if (mat.methodKey === "panel_grid") r = panelGrid(wallGeom, w.openings, variants[0], { ...opts, orientation: ["portrait", "landscape"].includes(rules.panelOrientation) ? rules.panelOrientation : undefined, jointGapMm: n.product?.gapMm ?? rules.jointGapMm, minStripMm: rules.minStripMm });
    else if (mat.methodKey === "aac_panel_layout") r = aacPanelLayout(wallGeom, w.openings, variants, { ...opts, adhesiveJointMm: rules.adhesiveJointMm, minStripMm: rules.minStripMm,
      controlJoints: rules.controlJoints, rails: rules.rails, reviewedComponents: rules.reviewedComponents });
    else if (mat.methodKey === "area_to_linear") {
      const areas = wallAreas(wallGeom, w.openings);
      r = areaToLinear({ materialId: mat.id, sourceId: m.id, netAreaM2: areas.netM2, product: variants[0], spareRate: (n.spareRate || 0) / 100, orderIncrementM: n.orderIncrementM ?? undefined,
        orientation: n.orientation, sourceRefs: [{ measurementId: m.id, wallId: m.id }] });
      // the exact LM (with spare) travels on the demand: the material's total is rounded once, not per wall
      for (const d of r.demands || []) if (d.unit === "lm" && Number.isFinite(r.layout?.withSpareLm)) d.exactLm = r.layout.withSpareLm;
    } else if (mat.methodKey === "support_grid") {
      r = supportGrid({ id: tag, polygon: built.polygon }, w.openings, { id: mat.id, materialId: mat.id, orientation: n.orientation === "horizontal" ? "horizontal" : "vertical",
        identity: familyIdentity(n), stockPolicy: n.product?.lengthsMm?.length ? { kind: "list", lengthsMm: n.product.lengthsMm, sharePieces: false } : undefined,
        maxSpacingMm: rules.maxSpacingMm, startOffsetMm: rules.startOffsetMm, endOffsetMm: rules.endOffsetMm,
        // stations the cladding NEEDS (its vertical sheet joints on this wall) plus any entered ones — never snapped away
        requiredStationsMm: [...(Array.isArray(rules.requiredStationsMm) ? rules.requiredStationsMm : []),
          ...(n.orientation === "horizontal" ? [] : sink.sheetJointsFor(m.id).map((atMm) => ({ atMm, ref: "sheet joint" })))],
        existing: rules.existing === true, fixing: rules.fixing, fixingScope: rules.fixingScope }, {});
    } else if (mat.methodKey === "accessory_routes") {
      // B5: the recipe's groups follow this wall's real routes; joints come from the cladding laid out on the SAME wall
      const recipe = rules.recipe && Array.isArray(rules.recipe.groups) ? rules.recipe : null;
      if (!recipe || !recipe.groups.length) { sink.problems.push({ code: "recipe_missing", message: "Add the accessory items (starters, trims, joints, sealant …) and their routes.", blocking: true }); continue; }
      const groups = recipe.groups.map((g) => ({ ...g, materialId: mat.id, identity: g.identity || { ...familyIdentity(n), item: g.id, kind: g.kind } }));
      r = accessoryRoutes({ id: tag, polygon: built.polygon }, w.openings, sink.layoutInfoFor(m.id), { ...recipe, id: recipe.id || mat.id, groups });
    } else { sink.problems.push({ code: "method_unavailable", message: "This calculation isn't available yet.", blocking: true }); continue; }
    r.layout = { ...(r.layout || {}), wallId: m.id, wallMeasurementId: m.id, wallLabel: w.label, heightSource: w.heightSource, wall: { polygon: built.polygon, bbox: built.bbox }, openings: w.openings,
      areas: r.layout?.areas || safeAreas(wallGeom, w.openings) };
    results.push(r);
  }
  if (!results.length && !sink.problems.length) sink.problems.push({ code: "nothing_measured", message: "Add a wall for this material.", blocking: false });
  // HUB 016b: one cut plan for ALL the walls of a sheet material — offcuts from one wall serve another (off = per wall)
  if (mat.methodKey === "sheet_layout" && sharesAcrossWalls(mat)) sink.sharedAcrossWalls = !!shareSheetsAcrossWalls(results);
  // wall-by-wall step 4: battens, foam tape and H-flashing follow the cladding's own layout on every wall
  const rule = followerRule(mat, n);
  if (rule) addFollowers(mat, rule, results, sink);
  return results;
}

/**
 * The automatic followers of a cladding (engine/followers.js) on each of its walls, in the same calculation: their
 * demands join the cladding's own (so they sit under the cladding on the schedule and the order) and the wall's layout
 * carries them for the Supports tab. A wall whose cladding is blocked gets none until it is fixed; a wall whose sheets
 * are all cut from another wall's sheets or offcuts (HUB 016b) still gets its own. A wall that already has battens /
 * tape / H joints set up by hand keeps those — the automatic ones are left off there, with a note.
 */
function addFollowers(mat, rule, results, sink) {
  for (const r of results) {
    const lay = r.layout;
    const wid = lay?.wallMeasurementId;
    if (!wid || !Array.isArray(lay.wall?.polygon) || r.status?.quantity === "incomplete") continue;
    // nothing of this cladding on the wall at all (no piece of its own, none borrowed): nothing to follow
    if (!(r.demands || []).length && !(lay.cells || []).some((c) => c.occupied)) continue;
    const tag = sink.wallTags.get(wid) || lay.wallLabel || "Wall";
    const hand = sink.handMadeOn(wid);
    const battens = rule.battens && !hand.battens.length;
    const tape = rule.extras && !hand.tape.length;
    // a joint product already chosen for the joint rows is bought as itself — never a second H-flashing as well
    const jointBought = (r.demands || []).some((d) => d.role === "horizontal-joint" && !isUnresolved(d.identity));
    const hFlashing = rule.extras && !hand.joints.length && !jointBought;
    const f = wallFollowers({ polygon: lay.wall.polygon }, lay.openings, lay, { rule, materialId: mat.id, wallTag: tag, measurementId: wid, battens, tape, hFlashing });
    // the joint the sheet layout couldn't buy (no joint product) is now the H-flashing — never both
    if (hFlashing) {
      r.demands = r.demands.filter((d) => !(d.role === "horizontal-joint" && isUnresolved(d.identity)));
      r.problems = r.problems.filter((p) => p.code !== "joint_product_missing");
    }
    r.demands.push(...f.demands);
    r.explain.push(...f.explain);
    const list = (set) => [...set].join(", ");
    f.layout.battens.state = !rule.battens ? "direct" : hand.battens.length ? "hand-made" : "auto";
    if (hand.battens.length && rule.battens) {
      f.layout.battens.by = hand.battens;
      r.problems.push(followerNote("followers_hand_made", `${tag}: battens come from ${list(hand.battens)} (set up by hand), so the automatic battens from ${mat.name} aren't added on this wall — nothing is counted twice.`, [{ wallId: tag, measurementId: wid }]));
    }
    if (rule.extras && (hand.tape.length || hand.joints.length)) {
      const what = [hand.tape.length ? "foam tape" : null, hand.joints.length ? "H-flashing" : null].filter(Boolean).join(" and ");
      const by = [...new Set([...hand.tape, ...hand.joints])];
      if (hand.tape.length) { f.layout.tape.state = "hand-made"; f.layout.tape.by = hand.tape; }
      if (hand.joints.length) { f.layout.hFlashing.state = "hand-made"; f.layout.hFlashing.by = hand.joints; }
      r.problems.push(followerNote("followers_hand_made", `${tag}: ${by.join(", ")} (set up by hand) already covers the ${what}, so the automatic ${what} from ${mat.name} ${what.includes(" and ") ? "aren't" : "isn't"} added on this wall — nothing is counted twice.`, [{ wallId: tag, measurementId: wid }]));
    }
    if (jointBought && rule.extras) f.layout.hFlashing.state = "joint-product";
    lay.followers = f.layout;
  }
}

/**
 * What a hand-made accessory set on a wall already covers. H joints: a joint strip / trim in its recipe, or a decided
 * "Joint / backing strips" choice on its card (include / by others / exclude; "Not decided" isn't one). Foam tape: only
 * an item that IS the joint foam tape (code 304560, or named Foam Back Sealing Tape) — a set's window / wrap tape runs
 * round openings or along membrane seams, never behind the sheet joins, so it never stands in for it.
 */
function accessoryDecides(m) {
  const groups = Array.isArray(m.rules?.recipe?.groups) ? m.rules.recipe.groups : [];
  const scope = m.rules?.scope && typeof m.rules.scope === "object" ? m.rules.scope : {};
  const decided = (v) => ["include", "by-others", "exclude"].includes(v);
  const isFoamTape = (...vals) => vals.some((v) => (typeof v === "string" || typeof v === "number") && (String(v).trim() === FOAM_TAPE.code || /foam\s*back\s*seal/i.test(String(v))));
  const id = (g) => (g?.identity && typeof g.identity === "object" ? g.identity : {});
  return {
    tape: groups.some((g) => isFoamTape(id(g).sku, id(g).product, id(g).productCode, id(g).name, g?.productCode, g?.label))
      || isFoamTape(m.spec?.productCode, m.spec?.product?.sku, m.spec?.product?.name),
    joints: groups.some((g) => g?.kind === "joint-strip" || g?.kind === "joint-trim") || decided(scope.joints),
  };
}

/** A material-wide joint row applies only to walls it actually falls inside (a short wall keeps one course). */
function rowsFor(jr, b, horizontal) {
  if (!jr || !Array.isArray(jr.atMm) || !b) return jr;
  const [lo, hi] = horizontal ? [b.x0, b.x1] : [b.y0, b.y1];
  const at = jr.atMm.filter((v) => v > lo && v + (jr.gapMm || 0) < hi);
  if (at.length) return { ...jr, atMm: at };
  // HUB 015: none of the material's heights fall in this wall — keep its joint RULE (gap + detail) so a taller wall
  // still gets automatic joints; without a complete rule there is nothing to apply
  return Number.isFinite(jr.gapMm) && typeof jr.detailRef === "string" && jr.detailRef.trim() ? { ...jr, atMm: [] } : undefined;
}

function safeAreas(wall, openings) {
  try { return wallAreas(wall, openings); } catch { return null; }
}

// ── demands → purchase lines ─────────────────────────────────────────────────

function describeIdentity(n) {
  if (n.family === "timber") return [n.section?.depthMm && n.section?.widthMm ? `${n.section.depthMm} × ${n.section.widthMm}` : "section?", n.grade, n.species, n.treatment].filter(Boolean).join(" ");
  if (n.family === "aluminium") return `${n.profile?.shape || "profile"} ${n.profile?.aMm} × ${n.profile?.bMm} × ${n.profile?.tMm}${n.finish ? ` ${n.finish}` : ""}${n.colour ? ` ${n.colour}` : ""}`;
  const p = n.product || {};
  return [p.manufacturer, p.name, p.sku ? `SKU ${p.sku}` : null, p.thicknessMm ? `${p.thicknessMm} thick` : null].filter(Boolean).join(" ");
}

const isUnresolved = (identity) => !identity || String(identity.family || "").startsWith("unresolved:");
const timberText = (id) => [id.section ? String(id.section).replace("x", " × ") : "section?", id.grade, id.species, id.treatment].filter(Boolean).join(" ");

/** What the supplier reads for a purchase line: the line's OWN item (never the parent product for a component). */
function itemText(d, n, recipeLabels, { thickness = false } = {}) {
  const id = d.identity || {};
  if (id.item) return `${recipeLabels.get(id.item) || id.item}${n.product?.name ? ` (${n.product.name})` : ""}`;
  const named = [id.manufacturer, id.name, id.sku ? `SKU ${id.sku}` : null, thickness && id.thicknessMm ? `${id.thicknessMm} thick` : null].filter(Boolean).join(" ");
  if (named) return named;
  if (id.family === "timber") return timberText(id);
  return describeIdentity(n);
}

/**
 * Turn one material's demands into purchase lines: allocate linear stock (one allocator), keep sheets by size,
 * sum everything else per (identity, unit). Then spares (once per material, shown) and full packs. Demands whose
 * product is not selected (identity "unresolved:…") are never bought as something else: they are listed as NOT on
 * the order. Returns lines + the allocation + the cut-list appendix + the omitted items.
 */
function purchaseLines(mat, n, demands, matKey, sink) {
  const lines = new Map();
  const demById = new Map(demands.map((d) => [d.id, d]));
  const recipeLabels = new Map((mat.rules?.recipe?.groups || []).map((g) => [g.id, g.label || g.kind || g.id]));
  const add = (key, unit, qty, finishedLengthMm, item, demandIds, identity) => {
    // the material id is part of the bucket: two materials with the same product never share (or corrupt) a line
    const bucketKey = `${matKey}|${mat.id}|${key}`;
    let l = lines.get(bucketKey);
    if (!l) {
      l = { bucketKey, specKey: stableStringify({ material: matKey, identity: identityKey(identity ?? null), unit }), materialKey: matKey, generic: true, family: n.family, unit,
        finishedLengthMm: finishedLengthMm ?? null, quantity: 0, exact: 0, item, jobMaterialIds: [mat.id], contributionIds: [], demandIds: [], problems: [], notes: [], handlingFlag: false, ceilingExceeded: false };
      // wall-by-wall step 4: an automatic batten / tape / H-flashing line of this cladding (kept apart for its own spares)
      if (FOLLOWER_KINDS.includes(identity?.follower)) l.follower = identity.follower;
      lines.set(bucketKey, l);
    }
    l.exact += qty;
    for (const d of demandIds) l.demandIds.push(d);
  };
  const omitted = [];
  const usable = demands.filter((d) => {
    if (!isUnresolved(d.identity)) return true;
    omitted.push(d.label || d.role || "item");
    return false;
  });
  const allocatable = (d) => d.kind === "linear" && d.stockPolicy && d.stockPolicy.kind !== "random" && d.lengthKind !== "orderedStock" && d.unit !== "lm";
  const linear = usable.filter(allocatable);
  const appendix = { aluminium: [], timber: [], layouts: [] };
  let allocation = null;
  if (linear.length) {
    // an offcut is offered only to the product it was cut from (identity stamped when recorded) and never longer
    // than the stock it came from — a typo can't zero the bar order
    const maxStock = n.family === "aluminium" ? n.stockLengthMm : n.stock?.maxMm ?? null;
    const offcuts = [];
    for (const o of sink.offcuts.filter((x) => x.materialId === mat.id)) {
      if (o.identityKey && o.identityKey !== stockIdentityKey(mat.spec)) { sink.problems.push({ code: "offcut_other_product", message: `Offcut ${o.label} was recorded for a different profile or finish — it isn't used for ${mat.name}.`, blocking: false }); continue; }
      if (maxStock && o.lengthMm > maxStock) { sink.problems.push({ code: "offcut_too_long", message: `Offcut ${o.label} (${fmt(o.lengthMm)} mm) is longer than the ${fmt(maxStock)} mm stock it came from — check the length.`, blocking: true }); continue; }
      offcuts.push({ id: o.id, lengthMm: o.lengthMm, identity: linear[0].identity, label: o.label });
    }
    const offcutById = new Map(offcuts.map((o) => [o.id, o]));
    allocation = allocateLinear(linear, { existingOffcuts: offcuts });
    const unit = n.family === "aluminium" ? "bar" : "piece";
    for (const g of allocation.groups) {
      for (const u of g.unavailable || []) sink.problems.push({ code: "unavailable_stock", message: `${demById.get(u.demandId)?.label || u.demandId}: ${u.message || u.reason}`, blocking: true });
      for (const b of g.bars) {
        if (b.source !== "new") continue;
        const ids = b.cuts.map((c) => c.demandId);
        const first = demById.get(ids[0]);
        add(`${unit}|${b.stockLengthMm}|${g.identityKey}`, unit, 1, b.stockLengthMm,
          { description: `${first?.itemDescription || itemText(first || {}, n, recipeLabels)} — ${fmt(b.stockLengthMm)} mm length${n.family === "aluminium" ? " (no joins)" : ""}`, stockLengthMm: b.stockLengthMm }, ids, first?.identity);
      }
    }
    if (n.family === "aluminium") {
      for (const g of allocation.groups) {
        appendix.aluminium.push({ stockLengthMm: n.stockLengthMm, kerfMm: n.kerfMm, kerfConfirmed: !!n.kerfConfirmed, endTrimMm: n.endTrimMm || 0, barCount: g.barCount,
          lowerBound: g.lowerBound ?? null, proven: !!g.proven, unavailable: (g.unavailable || []).map((u) => ({ demandId: u.demandId, reason: u.message || u.reason, label: demById.get(u.demandId)?.label })),
          bars: g.bars.map((b, i) => ({ n: i + 1, source: b.source, offcutLabel: b.offcutId ? offcutById.get(b.offcutId)?.label : null, cuts: b.cuts.map((c) => ({ label: c.label, lengthMm: c.lengthMm })),
            residualMm: b.residualMm, residualUsable: !!b.residualUsable, kerfLossMm: b.kerfLossMm })) });
      }
    } else {
      // one cut list for the material's own pieces, and (wall-by-wall step 4) one each for its automatic battens and
      // H-flashing — a batten and an H-flashing of the same length are never one row
      const lists = new Map();
      const listOf = (g) => {
        const d = demById.get(g.bars[0]?.cuts[0]?.demandId || g.unavailable?.[0]?.demandId);
        const f = FOLLOWER_KINDS.includes(d?.follower) ? d.follower : "";
        if (!lists.has(f)) lists.set(f, { title: f === "battens" ? `battens cut list (${FOLLOWER_TEXT.battens})` : f === "hflashing" ? `H-flashing cut list (${FOLLOWER_TEXT.hflashing})` : n.family === "timber" ? "timber cut list" : "cut list", rows: new Map() });
        return lists.get(f).rows;
      };
      for (const g of allocation.groups) {
        const rows = listOf(g);
        for (const b of g.bars) for (const c of b.cuts) {
          const k = `${c.lengthMm}|${b.stockLengthMm}`;
          const r = rows.get(k) || { cutMm: c.lengthMm, stockMm: b.source === "new" ? b.stockLengthMm : null, qty: 0, labels: [] };
          r.qty += 1; if (c.label) r.labels.push(c.label);
          rows.set(k, r);
        }
        for (const u of g.unavailable || []) {
          const d = demById.get(u.demandId);
          rows.set(`u|${u.demandId}`, { cutMm: d?.lengthMm, stockMm: null, qty: d?.quantity || 1, labels: [d?.label].filter(Boolean) });
        }
      }
      // labels in natural order ("Rafter @ 600" before "@ 1,200") so a site reader can follow the stations
      const natural = (a, b) => String(a).localeCompare(String(b), "en", { numeric: true });
      for (const [f, l] of [...lists.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a < b ? -1 : 1))) {
        appendix.timber.push({ ...(f || n.family !== "timber" ? { title: l.title } : {}), rows: [...l.rows.values()].map((r) => ({ ...r, labels: [...r.labels].sort(natural) })).sort((a, b) => b.cutMm - a.cutMm) });
      }
    }
  }
  for (const d of usable) {
    if (allocatable(d)) continue;
    if (d.kind === "linear" && d.unit === "lm") {
      // exact LM (incl. spare) is summed per material and rounded ONCE below — never per wall then again
      add(`lm|${identityKey(d.identity)}`, "lm", d.exactLm ?? d.quantity, null, { description: `${itemText(d, n, recipeLabels, { thickness: true })} — random lengths (LM)`, note: "Estimate — total LM, not a piece count" }, [d.id], d.identity);
      continue;
    }
    if (d.kind === "linear") {
      // ordered stock (the user's own supplier cut list) or a linear demand with no policy: buy as entered
      const L = d.lengthMm;
      if (d.lengthKind !== "orderedStock" && d.stockPolicy == null && n.family === "timber") {
        const s = selectStock(L, { kind: "grid", minMm: 1200, incrementMm: 600, maxMm: n.stock?.maxMm ?? null, unavailableMm: n.stock?.unavailableMm || [] });
        if (s.stockMm == null) { sink.problems.push({ code: "unavailable_stock", message: `${d.label || "A piece"}: ${s.message}`, blocking: true }); continue; }
        add(`piece|${s.stockMm}|${identityKey(d.identity)}`, "piece", d.quantity, s.stockMm, { description: `${itemText(d, n, recipeLabels)} — ${fmt(s.stockMm)} mm length`, stockLengthMm: s.stockMm }, [d.id], d.identity);
      } else add(`piece|${L}|${identityKey(d.identity)}`, d.unit === "bar" ? "bar" : "piece", d.quantity, L, { description: `${itemText(d, n, recipeLabels)} — ${fmt(L)} mm length${d.lengthKind === "orderedStock" ? " (as entered)" : ""}`, stockLengthMm: L }, [d.id], d.identity);
      continue;
    }
    if (d.unit === "sheet" || d.kind === "sheet") {
      const L = d.identity?.stockLengthMm ?? d.heightMm, Wd = d.identity?.stockWidthMm ?? d.widthMm;
      add(`sheet|${L}|${Wd}|${identityKey(d.identity)}`, "sheet", d.quantity, L ?? null, { description: `${itemText(d, n, recipeLabels)}${L ? ` — ${fmt(L)}${Wd ? ` × ${fmt(Wd)}` : ""} mm` : ""}`, stockLengthMm: L ?? null, widthMm: Wd ?? null, sku: d.identity?.sku || null }, [d.id], d.identity);
      continue;
    }
    const u = d.unit || "piece";
    add(`${u}|${d.lengthMm ?? ""}|${identityKey(d.identity)}`, u, d.quantity, u === "piece" || u === "bar" ? d.lengthMm ?? null : null,
      // counted items keep their own entered label (e.g. "Cladding screws 8g × 40 (entered, quote Q-123)")
      { description: d.itemDescription || (d.identity?.item ? itemText(d, n, recipeLabels) : d.label) || itemText(d, n, recipeLabels), stockLengthMm: d.lengthMm ?? null }, [d.id], d.identity);
  }
  const all = [...lines.values()];
  for (const l of all) {
    if (l.unit === "lm") {
      // one rounding for the job: supplier increment first, then whole metres (order lines hold whole units)
      const inc = n.orderIncrementM > 0 ? n.orderIncrementM : null;
      const byInc = inc ? Math.ceil(l.exact / inc - 1e-9) * inc : l.exact;
      l.quantity = Math.ceil(byInc - 1e-9);
      if (Math.abs(l.quantity - l.exact) > 1e-9) l.item = { ...l.item, note: `${l.exact.toFixed(2)} LM calculated${inc ? ` → ${byInc.toFixed(2)} LM in ${inc} m steps` : ""}, ordered as ${l.quantity} LM` };
    } else l.quantity = Math.max(UNIT_INTEGER.has(l.unit) ? 1 : 0, Math.ceil(l.exact - 1e-9));
    if (l.unit === "piece" && n.family === "timber" && l.finishedLengthMm == null) l.problems.push("A timber line has no stock length.");
    if (l.follower === "battens" || l.follower === "hflashing") {
      const ds = l.demandIds.map((id) => demById.get(id)).filter(Boolean);
      const fitted = ds.reduce((t, d) => t + (d.lengthMm || 0) * (d.quantity || 1), 0) / 1000;
      const walls = new Set(ds.map((d) => d.sourceRefs?.[0]?.measurementId || d.sourceRefs?.[0]?.wallId)).size;
      l.item = { ...l.item, note: l.follower === "battens"
        ? `${fitted.toFixed(2)} m of battens on ${walls} wall${walls === 1 ? "" : "s"}, cut with offcuts shared across the walls · fixings to the studs not counted`
        : `${fitted.toFixed(2)} m of horizontal joints on ${walls} wall${walls === 1 ? "" : "s"}, cut with offcuts shared across the walls, no lap` };
    }
  }
  // spares (02 §6): ONE spare count for the material (ceil of total × rate), spread over its lines by largest share —
  // shown separately, never hidden in the layout count. Random-length LM already carries its spare. The automatic
  // battens and H-flashing (step 4) each get their OWN spare count at the material's rate; foam tape takes its spare
  // on the metres before they are rounded into rolls.
  const spareRate = n.spareRate > 0 ? n.spareRate / 100 : 0;
  const spareable = all.filter((l) => UNIT_INTEGER.has(l.unit) && l.follower !== "tape");
  for (const l of all.filter((x) => x.follower === "tape")) {
    const exactM = (l.exact * FOAM_TAPE.rollMm) / 1000;
    const rolls = Math.max(1, Math.ceil(l.exact * (1 + spareRate) - 1e-9));
    const spare = rolls - Math.max(1, Math.ceil(l.exact - 1e-9));
    l.quantity = rolls;
    if (spare > 0) l.spareQuantity = spare;
    l.item = { ...l.item, note: `${exactM.toFixed(2)} m behind the vertical sheet joins${spareRate ? ` + ${n.spareRate}% spare = ${(exactM * (1 + spareRate)).toFixed(2)} m` : ""} → ${rolls} roll${rolls === 1 ? "" : "s"} of ${FOAM_TAPE.rollMm / 1000} m` };
  }
  if (spareRate && spareable.length) {
    const byUnit = new Map();
    for (const l of spareable) { const k = `${l.unit}|${l.follower || ""}`; byUnit.set(k, [...(byUnit.get(k) || []), l]); }
    for (const group of byUnit.values()) {
      const total = group.reduce((a, l) => a + l.quantity, 0);
      let left = Math.ceil(total * spareRate - 1e-9);
      const shares = group.map((l) => ({ l, raw: (left * l.quantity) / total })).sort((a, b) => (b.raw - Math.floor(b.raw)) - (a.raw - Math.floor(a.raw)) || b.l.quantity - a.l.quantity || (a.l.bucketKey < b.l.bucketKey ? -1 : 1));
      for (const sh of shares) { sh.n = Math.floor(sh.raw); left -= sh.n; }
      for (const sh of shares) { if (left <= 0) break; sh.n += 1; left -= 1; }
      for (const sh of shares) {
        if (!sh.n) continue;
        sh.l.spareQuantity = sh.n; sh.l.quantity += sh.n;
        const of = sh.l.follower === "battens" ? "of the battens" : sh.l.follower === "hflashing" ? "of the H-flashing" : "of the material";
        sh.l.item = { ...sh.l.item, note: [sh.l.item?.note, `incl. ${sh.n} spare (${n.spareRate}% ${of})`].filter(Boolean).join(" · ") };
      }
    }
  }
  // full packs only when the supplier requires them (a published pack size alone never forces it — 06)
  const pack = n.product?.fullPackRequired && n.product?.packQuantity > 1 ? n.product.packQuantity : null;
  if (pack) for (const l of spareable.filter((x) => !x.follower)) {   // the cladding's pack size is never the battens'
    const packed = Math.ceil(l.quantity / pack - 1e-9) * pack;
    if (packed !== l.quantity) { l.item = { ...l.item, note: [l.item?.note, `rounded up to full packs of ${pack} (+${packed - l.quantity})`].filter(Boolean).join(" · ") }; l.quantity = packed; }
  }
  if (omitted.length) {
    const names = [...new Set(omitted)];
    sink.problems.push({ code: "component_not_selected", blocking: false,
      message: `Not on this order — product not selected: ${names.slice(0, 6).join("; ")}${names.length > 6 ? ` +${names.length - 6} more` : ""}. Order these separately or choose their products.` });
  }
  return { lines: all, allocation, appendix, omitted: [...new Set(omitted)] };
}

// ── dependency key (06 identity & invalidation) ──────────────────────────────

const fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };

/**
 * Everything a material's quantities were worked out from: its spec/rules/method, every contributing measurement
 * (geometry + inputs + scale), the openings of its walls and its recorded offcuts. A draft order line made under one
 * key is stale under another — even when the totals happen to come out the same.
 */
function dependencyKey(mat, items, ctx, openingsByWall, offcuts, extra = null) {
  const cal = (id) => { const c = id ? ctx.calibrationsById.get(id) : null; return c ? { id: c.id, sx: c.sx, sy: c.sy, status: c.status } : null; };
  const meas = items.map(({ m, role }) => ({ id: m.id, role, kind: m.kind, points: m.points || null, inputs: m.inputs || null, cal: cal(m.calibrationId),
    finishedLengthMm: m.finishedLengthMm ?? null, quantity: m.quantity ?? null,
    openings: m.kind === "wall" ? (openingsByWall.get(m.id) || []).map((o) => ({ id: o.id, inputs: o.inputs })) : undefined }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  return fnv(stableStringify({ method: `${mat.methodKey}@${mat.methodVersion}`, spec: mat.spec, rules: mat.rules || {}, meas,
    offcuts: offcuts.filter((o) => o.materialId === mat.id), extra }));
}

// ── workspace entry point ─────────────────────────────────────────────────────

/**
 * Compute every generic material of a workspace.
 * @param {object[]} materials  generic job materials
 * @param {object[]} contributions  non-archived contributions of those materials
 * @param {object} ctx  { measurementsById, calibrationsById, documentsById, latestCalibration }
 * @returns {{ contributions: object[], lines: object[], unplaced: object[], results: Object<string, object> }}
 */
export function computeGenericMaterials(materials, contributions, ctx) {
  const openingsByWall = new Map();
  const offcuts = [];
  for (const m of ctx.measurementsById.values()) {
    if (m.kind === "opening" && m.parentId) openingsByWall.set(m.parentId, [...(openingsByWall.get(m.parentId) || []), m]);
    if (m.kind === "offcut" && m.inputs?.status !== "consumed") offcuts.push({ id: m.id, materialId: m.inputs?.materialId, lengthMm: m.inputs?.lengthMm, label: m.inputs?.label || m.label || "offcut", identityKey: m.inputs?.identityKey || null });
  }
  const c2 = { ...ctx, openingsByWall };
  const out = { contributions: [], lines: [], unplaced: [], results: {} };
  // actual layout joints per wall measurement (from cladding already computed) — feed accessory joint routes
  const jointsByWall = new Map();
  const layoutInfoFor = (wallMeasId) => ({ joints: jointsByWall.get(wallMeasId) || [] });
  // supports then accessories run AFTER the cladding on the same wall: they take its real panel joints
  const rank = (m) => (m.spec?.family === "accessory" ? 2 : m.spec?.family === "batten" ? 1 : 0);
  const ordered = [...materials].sort((a, b) => rank(a) - rank(b));
  const sheetJointsByWall = new Map(); // wall measurement → vertical sheet-joint x positions (support stations, 05 B1)
  // wall-by-wall step 4: battens / tape / H joints already set up BY HAND on a wall (older jobs) — the cladding's
  // automatic ones are left off that wall so nothing is counted twice. Existing (not bought) supports don't count.
  const matById = new Map(materials.map((m) => [m.id, m]));
  const handMade = new Map();
  for (const c of contributions) {
    const m = matById.get(c.jobMaterialId), meas = ctx.measurementsById.get(c.measurementId);
    const fam = m?.spec?.family;
    if (meas?.kind !== "wall" || (fam !== "batten" && fam !== "accessory")) continue;
    const h = handMade.get(c.measurementId) || { battens: new Set(), tape: new Set(), joints: new Set() };
    if (fam === "batten" && m.rules?.existing !== true) h.battens.add(m.name || "a batten material");
    if (fam === "accessory") { const dec = accessoryDecides(m); if (dec.tape) h.tape.add(m.name || "an accessory set"); if (dec.joints) h.joints.add(m.name || "an accessory set"); }
    handMade.set(c.measurementId, h);
  }
  const handMadeOn = (wallMeasId) => { const h = handMade.get(wallMeasId); return { battens: h ? [...h.battens].sort() : [], tape: h ? [...h.tape].sort() : [], joints: h ? [...h.joints].sort() : [] }; };
  let generated = 0;
  // wall-by-wall step 4 (Sam: "rounded up once per job"): the foam tape and the H-flashing of EVERY Axon cladding on the
  // job are one product each — they are pooled here and bought once, after the loop (buyPooledFollowers)
  const pool = [];
  for (const mat of ordered) {
    const mine = contributions.filter((c) => c.jobMaterialId === mat.id);
    const items = mine.map((c) => ({ c, role: c.role || "primary", m: ctx.measurementsById.get(c.measurementId) })).filter((x) => x.m);
    const sink = { problems: [], measProblems: new Map(), offcuts, wallTags: new Map(), layoutInfoFor, sheetJointsFor: (id) => sheetJointsByWall.get(id) || [], handMadeOn };
    const names = items.filter((x) => x.m.kind === "wall").map((x) => ({ id: x.m.id, name: x.m.inputs?.name || x.m.label || "Wall" }));
    for (const w of names) sink.wallTags.set(w.id, names.filter((o) => o.name === w.name).length > 1 ? `${w.name} (${String(w.id).slice(0, 4)})` : w.name);
    let n = null, methodResults = [];
    const matProblems = familyProblems(mat.spec).map((p) => ({ ...p, blocking: true }));
    try {
      n = normaliseFamilySpec(mat.spec);
      // nothing measured for this material yet: not an error, not "calculated" — just nothing to work out
      if (!items.length) sink.problems.push({ code: "nothing_measured", message: "Nothing measured for this material yet.", blocking: false });
      else if (n.family === "timber") methodResults = runTimber(mat, n, items, c2, sink);
      else if (n.family === "aluminium") methodResults = runAluminium(mat, n, items, c2, sink);
      else methodResults = runWallMethod(mat, n, items, c2, sink);
    } catch (e) {
      // a malformed setting (wrong type from an old/edited record) is a problem on THIS material, never a crash
      if (e?.name !== "TakeoffValidationError" && !(e instanceof TypeError) && !(e instanceof RangeError)) throw e;
      sink.problems.push({ code: "invalid_input", message: e?.name === "TakeoffValidationError" ? e.message : `${mat.name}: a setting has the wrong form and couldn't be worked out — check its setup.`, blocking: true });
    }
    const demands = methodResults.flatMap((r) => r.demands || []);
    generated += demands.reduce((a, d) => a + (UNIT_INTEGER.has(d.unit) && d.kind !== "volume" && d.kind !== "area" ? Math.max(1, Math.ceil(d.quantity || 1)) : 1), 0);
    if (generated > JOB_GENERATED_LIMIT) {
      throw new TakeoffValidationError(`This takeoff generates more than ${JOB_GENERATED_LIMIT.toLocaleString("en-AU")} pieces (stopped at ${mat.name}) — check the centres and lengths, or split the job into more than one takeoff.`);
    }
    // a measurement this method doesn't read is a missing requirement, never a silent zero
    const reads = new Set(methodReads(mat));
    for (const { m } of items) {
      if (reads.has(m.kind)) continue;
      sink.measProblems.set(m.id, [...(sink.measProblems.get(m.id) || []), "measurement_unused"]);
      sink.problems.push({ code: "measurement_unused", message: `A ${m.kind} measurement is assigned to ${mat.name} but this material can't use it — remove it or assign it to the right material.`, blocking: true });
    }
    for (const r of methodResults) {
      const wid = r.layout?.wallMeasurementId;
      // vertical sheets: every boundary between strips is a joint that must land on a support
      if (wid && r.layout?.method === "sheet_layout@2" && r.layout.orientation !== "horizontal" && Array.isArray(r.layout.columns)) {
        sheetJointsByWall.set(wid, [...(sheetJointsByWall.get(wid) || []), ...r.layout.columns.slice(0, -1).map((c) => c.zoneEnd)]);
      }
      if (!wid || !Array.isArray(r.layout?.joints)) continue;
      const list = jointsByWall.get(wid) || [];
      for (const j of r.layout.joints) (j.segments || []).forEach((sg, k) => list.push({ id: `${mat.id.slice(0, 6)}-j${j.index}-${k}`, orientation: j.orientation, kind: "joint", atMm: j.atMm, fromMm: sg.startMm, toMm: sg.endMm }));
      jointsByWall.set(wid, list);
    }
    // "base studs only; opening framing incomplete" (T4) does not stop ordering the BASE studs — it stays visible on the
    // line and keeps the quantity status incomplete; the opening framing is added once its detail is entered
    const methodProblems = methodResults.flatMap((r) => r.problems || []).map((p) => (p.code === "opening_framing_incomplete" ? { ...p, blocking: false, framingGap: true } : p));
    const matKey = genericMaterialKey(mat);
    // accessories also depend on the cladding layout joints of their walls
    const wallsOf = items.filter((x) => x.m.kind === "wall").map((x) => x.m.id);
    const depKey = dependencyKey(mat, items, ctx, openingsByWall, offcuts, mat.spec?.family === "accessory" ? wallsOf.map((id) => jointsByWall.get(id) || [])
      : mat.spec?.family === "batten" ? wallsOf.map((id) => sheetJointsByWall.get(id) || [])
      : mat.methodKey === "sheet_layout" ? { sheetPlan: sink.sharedAcrossWalls ? 2 : 1 } : null);   // HUB 016/016b: plan 2 = shared across walls; lines saved under the other plan are reviewed
    // the automatic battens / tape / H-flashing have their OWN key: the rules version and what is set up by hand on each
    // wall too — so they can change without making the cladding's own lines stale (and the other way round)
    const followerKey = methodResults.some((r) => r.layout?.followers) ? fnv(`${depKey}|${stableStringify({ followers: FOLLOWERS_VERSION, hand: wallsOf.map((id) => handMadeOn(id)) })}`) : null;
    let pl = { lines: [], allocation: null, appendix: { aluminium: [], timber: [], layouts: [] }, omitted: [] };
    const pooled = demands.filter((d) => POOLED_FOLLOWERS.has(d.follower));
    if (n) {
      try { pl = purchaseLines(mat, n, pooled.length ? demands.filter((d) => !POOLED_FOLLOWERS.has(d.follower)) : demands, matKey, sink); } catch (e) {
        if (e?.name !== "TakeoffValidationError") throw e;
        sink.problems.push({ code: "invalid_input", message: e.message, blocking: true });
      }
    }
    for (const r of methodResults) {
      if (r.layout?.wallId && (r.layout.cells || r.layout.courses || r.layout.lines || r.layout.panels)) {
        const counts = new Map();
        for (const d of r.demands || []) {
          const k = d.itemDescription || d.label || describeIdentity(n);
          if (d.unit === "sheet" || d.kind === "sheet") counts.set(k, (counts.get(k) || 0) + d.quantity);
        }
        // where the elevation came from, said plainly (same wording as the wall editor) — never "surveyed"
        const wm = ctx.measurementsById.get(r.layout.wallMeasurementId);
        const traced = Array.isArray(wm?.points) && wm.points.length >= 2;
        const source = wm?.inputs?.kind === "polygon" && traced ? "Traced elevation outline" : traced ? "Derived from plan + entered heights" : "Entered length and heights";
        pl.appendix.layouts.push({ wallLabel: r.layout.wallLabel, source, grossM2: r.layout.areas?.grossM2 ?? null, openingM2: r.layout.areas?.openingM2 ?? null, netM2: r.layout.areas?.netM2 ?? null,
          rows: [...counts.entries()].map(([description, qty]) => ({ description, qty })), notes: (r.explain || []).slice(0, 6) });
      }
    }
    const blocking = [...matProblems, ...sink.problems, ...methodProblems].filter((p) => p.blocking !== false);
    const advisory = [...sink.problems, ...methodProblems].filter((p) => p.blocking === false);
    // a measurement with scale/plan problems blocks its lines exactly like a flashing run
    const measCodes = new Set();
    for (const v of sink.measProblems.values()) for (const p of v) measCodes.add(p);
    for (const l of pl.lines) {
      const key = l.follower && followerKey ? followerKey : depKey;
      l.dependencyKey = key;
      l.item = { ...(l.item || {}), dependencyKey: key };
      for (const p of blocking) if (!l.problems.includes(p.message)) l.problems.push(p.message);
      for (const p of measCodes) if (!l.problems.includes(p)) l.problems.push(p);
      for (const p of advisory) l.notes.push(p.message);
    }
    // contribution attribution: each purchase unit belongs to the contribution of the (first) demand it serves
    // wall-level demands (supports, accessories, sheets) name their wall by its readable TAG — map it back to the wall
    const tagToMeas = new Map([...sink.wallTags.entries()].map(([id, tag]) => [tag, id]));
    const demandMeas = new Map(demands.map((d) => { const r = d.sourceRefs?.[0] || {}; return [d.id, r.measurementId || tagToMeas.get(r.wallId) || r.wallId || null]; }));
    const contribOfMeas = new Map(mine.map((c) => [c.measurementId, c.id]));
    const perContribution = new Map(mine.map((c) => [c.id, []]));
    const contribOf = (did) => contribOfMeas.get(demandMeas.get(did)) || mine[0]?.id;
    for (const l of pl.lines) attributeLine(l, contribOf, perContribution);
    const resById = new Map();
    for (const { c, m } of items) {
      const pieces = perContribution.get(c.id) || [];
      const problems = [...(sink.measProblems.get(m.id) || [])];
      const res = { contributionId: c.id, measurementId: c.measurementId, jobMaterialId: mat.id, kind: m.kind, role: c.role || "primary", pieces, problems, explanation: null, generic: true };
      out.contributions.push(res);
      resById.set(c.id, res);
      // a measurement that should feed purchases but produced none (and has problems) is a missing requirement
      if (!pieces.length && problems.length) out.unplaced.push({ contributionId: c.id, jobMaterialId: mat.id, specKey: matKey, problems, explanation: null });
    }
    const quantityStatus = blocking.length || !demands.length || methodProblems.some((p) => p.framingGap) ? "incomplete" : methodResults.some((r) => r.status?.quantity === "estimate") ? "estimate" : "calculated";
    const installs = methodResults.map((r) => r.status?.installation).filter(Boolean);
    // before anything is measured: a SELECTED (unreviewed) assembly is source-pending; no assembly is unspecified
    if (!installs.length && n?.assemblyId) installs.push("source-pending");
    const procurement = matProblems.length ? "missing-product" : blocking.some((p) => p.code === "unavailable_stock") ? "unavailable-stock" : blocking.length || !pl.lines.length ? "draft" : "ready";
    out.results[mat.id] = {
      family: n?.family || mat.spec?.family, methodKey: mat.methodKey, methodVersion: mat.methodVersion, materialKey: matKey,
      status: { quantity: quantityStatus, installation: installs.includes("source-pending") ? "source-pending" : installs[0] || "unspecified", procurement },
      problems: [...blocking, ...advisory], explain: methodResults.flatMap((r) => r.explain || []),
      layouts: methodResults.map((r) => r.layout).filter(Boolean), demands, allocation: pl.allocation, appendix: pl.appendix,
    };
    out.lines.push(...pl.lines);
    if (pooled.length && n) pool.push({ mat, n, matKey, demands: pooled, key: followerKey || depKey, blocking, advisory, measCodes, contribOf, resById, ownLines: pl.lines });
  }
  if (pool.length) buyPooledFollowers(pool, out);
  return out;
}

/** The followers bought ONCE for the whole job, whichever cladding they come from (Sam, 21 Oct 2026). */
const POOLED_FOLLOWERS = new Set(["tape", "hflashing"]);

/**
 * Split a purchase line's WHOLE quantity across the contributions whose demands it serves (largest share first,
 * stable) and record them on the line. `contribOf(demandId)` names the contribution.
 */
function attributeLine(l, contribOf, perContribution) {
  const owners = new Map();
  for (const did of l.demandIds) {
    const cid = contribOf(did);
    if (cid) owners.set(cid, (owners.get(cid) || 0) + 1);
  }
  let left = l.quantity;
  const total = [...owners.values()].reduce((a, b) => a + b, 0) || 1;
  const shares = [...owners.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([cid, k], i, arr) => {
    const q = i === arr.length - 1 ? left : Math.min(left, Math.round((l.quantity * k) / total));
    left -= q;
    return [cid, q];
  });
  for (const [cid, q] of shares) {
    if (q <= 0) continue;
    perContribution.get(cid)?.push({ bucketKey: l.bucketKey, quantity: q, finishedLengthMm: l.finishedLengthMm });
    if (!l.contributionIds.includes(cid)) l.contributionIds.push(cid);
  }
  delete l.demandIds;
}

/**
 * Wall-by-wall step 4: the foam tape (metres → whole 25 m rolls) and the H-flashing (one cutting plan, offcuts shared,
 * no lap) of every Axon cladding on the job, worked out ONCE for the job — two Axon products on one job never round up
 * twice. Each line sits under the first cladding that has it (its section on the schedule and the order) and names the
 * others; each wall's share is attributed to its own cladding's contribution. Spares at the highest rate among them.
 * With one cladding this is exactly that cladding's own tape and H-flashing.
 */
function buyPooledFollowers(pool, out) {
  const perContribution = new Map(pool.flatMap((e) => [...e.resById.keys()].map((cid) => [cid, []])));
  const elsewhere = new Map();   // pool entry → [{ what, owner }] (the tape / H-flashing bought under another cladding)
  for (const kind of ["hflashing", "tape"]) {
    const entries = pool.filter((e) => e.demands.some((d) => d.follower === kind));
    if (!entries.length) continue;
    const owner = entries[0];
    const demands = entries.flatMap((e) => e.demands.filter((d) => d.follower === kind));
    const entryOf = new Map(entries.flatMap((e) => e.demands.map((d) => [d.id, e])));
    const spareRate = Math.max(...entries.map((e) => (Number(e.n.spareRate) > 0 ? Number(e.n.spareRate) : 0)));
    const sink = { problems: [], offcuts: [] };
    let pl;
    try { pl = purchaseLines(owner.mat, { ...owner.n, spareRate }, demands, owner.matKey, sink); } catch (e) {
      if (e?.name !== "TakeoffValidationError") throw e;
      // never a silent gap: every cladding whose tape / H-flashing couldn't be worked out is held up with the reason
      for (const x of entries) {
        out.results[x.mat.id].problems.push({ code: "invalid_input", message: e.message, blocking: true });
        for (const l of x.ownLines) if (!l.problems.includes(e.message)) l.problems.push(e.message);
      }
      continue;
    }
    const res = out.results[owner.mat.id];
    if (pl.allocation) res.allocation = res.allocation ? { ...res.allocation, groups: [...res.allocation.groups, ...pl.allocation.groups] } : pl.allocation;
    res.appendix.timber.push(...pl.appendix.timber);
    for (const l of pl.lines) {
      const from = [owner, ...entries.slice(1).filter((e) => l.demandIds.some((did) => entryOf.get(did) === e))];
      l.jobMaterialIds = from.map((e) => e.mat.id);
      const key = from.length === 1 ? owner.key : fnv(from.map((e) => e.key).join("|"));
      l.dependencyKey = key;
      l.item = { ...(l.item || {}), dependencyKey: key };
      if (from.length > 1) { const parts = String(l.item.note || "").split(" · ").filter(Boolean); parts.splice(1, 0, `for ${from.map((e) => e.mat.name).join(" and ")}, worked out once for the job`); l.item.note = parts.join(" · "); }
      for (const e of from) {
        for (const p of e.blocking) if (!l.problems.includes(p.message)) l.problems.push(p.message);
        for (const p of e.measCodes) if (!l.problems.includes(p)) l.problems.push(p);
        for (const p of e.advisory) if (!l.notes.includes(p.message)) l.notes.push(p.message);
      }
      for (const p of sink.problems) (p.blocking === false ? l.notes : l.problems).push(p.message);
      attributeLine(l, (did) => entryOf.get(did)?.contribOf(did), perContribution);
    }
    for (const e of entries.slice(1)) elsewhere.set(e, [...(elsewhere.get(e) || []), { what: kind === "tape" ? "foam tape" : "H-flashing", owner: owner.mat.name }]);
    out.lines.push(...pl.lines);
  }
  for (const e of pool) for (const [cid, r] of e.resById) r.pieces.push(...(perContribution.get(cid) || []));
  // a contribution that now has pieces isn't missing any more
  const placed = new Set([...perContribution].filter(([, v]) => v.length).map(([cid]) => cid));
  out.unplaced = out.unplaced.filter((u) => !placed.has(u.contributionId));
  // the other claddings say where their tape and H-flashing went
  for (const [e, list] of elsewhere) {
    const byOwner = new Map();
    for (const x of list) byOwner.set(x.owner, [...(byOwner.get(x.owner) || []), x.what]);
    const msg = `${e.mat.name}: ${[...byOwner].map(([o, w]) => `its ${w.join(" and ")} ${w.length > 1 ? "are" : "is"} ordered once for the job with ${o}`).join("; ")}.`;
    out.results[e.mat.id].problems.push(followerNote("followers_pooled", msg));
    for (const l of e.ownLines) if (!l.notes.includes(msg)) l.notes.push(msg);
  }
}
