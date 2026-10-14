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
import { formatMm, stableStringify } from "../units.js";
import { calibrationOrderReady, pointToMm, pointsWithinCalibration, polylineLengthMm } from "../calibration.js";
import { identityKey } from "./contract.js";
import { FAMILIES, familyIdentity, familyProblems, normaliseFamilySpec } from "./families.js";
import { computeManualTimber, computeNoggins, computePlates, computeRepeatedMembers, computeStudWall, computeTrim, repeatedPositions, timberIdentity } from "./timber.js";
import { allocateLinear } from "./allocator.js";
import { selectStock } from "./stock.js";
import { buildWall, wallAreas } from "./wall.js";
import { aacPanelLayout, areaToLinear, courseLayout, panelGrid, sheetLayout } from "./cladding.js";
import { supportGrid } from "./supports.js";
import { accessoryRoutes } from "./accessories.js";

const UNIT_INTEGER = new Set(["piece", "sheet", "bar", "box", "bag", "roll", "pack", "cartridge"]);
const fmt = (mm) => formatMm(mm, 1);

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
  return { lengthMm: polylineLengthMm(cal, m.points), problems, cal };
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
  const missing = kind === "rect" ? !inp.heightMm : kind === "rake" ? !(inp.startHeightMm && inp.endHeightMm)
    : kind === "gable" ? !(inp.eavesHeightMm && inp.apexHeightMm && inp.apexXMm != null) : !(Array.isArray(inp.polygon) && inp.polygon.length >= 3);
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
  for (const o of list || []) out[o.station] = o.removed ? { remove: true } : o.lengthMm ? { member: { mode: "entered", lengthMm: o.lengthMm } } : {};
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
  if (mat.methodKey === "repeated_members") {
    const dist = items.filter((x) => x.role === "distribution" || (x.role === "primary" && ["run", "polyline", "distribution"].includes(x.m.kind)));
    const member = items.find((x) => x.role === "member" || x.m.kind === "member")?.m || null;
    if (!dist.length) { sink.problems.push({ code: "distribution_missing", message: "Draw the distribution run the members are spaced along.", blocking: true }); return results; }
    const mem = memberInput(n, rules, member, ctx, sink);
    if (!mem) return results;
    const segments = dist.map(({ m }) => ({ id: m.id, measurementId: m.id, runMm: lengthOf(m), ...(m.inputs ? { startOffsetMm: m.inputs.startOffsetMm, endOffsetMm: m.inputs.endOffsetMm, includeStart: m.inputs.includeStart, includeEnd: m.inputs.includeEnd } : {}) }))
      .filter((s) => s.runMm != null);
    if (!segments.length) return results;
    const overrides = Object.assign({}, ...dist.map(({ m }) => overridesFrom(m.inputs?.overrides)));
    results.push(computeRepeatedMembers({ ...base, purpose: PURPOSE_ROLE[n.purpose] || "member", segments, centresMm: rules.centresMm ?? 600, spacing: rules.spacing || "fixed",
      startOffsetMm: rules.startOffsetMm ?? 0, endOffsetMm: rules.endOffsetMm ?? 0, includeStart: rules.includeStart !== false, includeEnd: rules.includeEnd !== false,
      plies: n.plies || 1, member: mem, overrides }));
    return results;
  }
  if (mat.methodKey === "wall_frame") {
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
    return results;
  }
  // linear_stock@1 — plates / noggins / trim / other members + manual/count entries
  const walls = items.filter((x) => x.m.kind === "wall");
  const runs = items.filter((x) => ["run", "polyline"].includes(x.m.kind));
  if (n.purpose === "plates") {
    const layers = (rules.plateLayers || ["bottom", "top"]).map((tag) => ({ tag }));
    for (const { m } of [...walls, ...runs]) {
      const runMm = m.kind === "wall" ? resolveWall(m, ctx).wall.widthMm : lengthOf(m);
      if (runMm) results.push(computePlates({ ...base, wallId: m.id, measurementId: m.id, runMm, layers, allowanceMm: n.endAllowanceMm || 0 }));
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
    for (const { m } of runs) { const L = lengthOf(m); if (L) segments.push({ id: m.id, measurementId: m.id, lengthMm: L }); }
    if (segments.length) results.push(computeTrim({ ...base, segments, joinsAllowed: rules.joinsAllowed === true, cutAllocation: rules.cutAllocation === true }));
  }
  const manual = items.filter((x) => x.m.kind === "manual" || x.m.kind === "count");
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
      if (t.lengthMm != null) cut(`${mat.id}:${m.id}:run`, t.lengthMm, m.label || `Run ${fmt(t.lengthMm)}`, [{ measurementId: m.id }], "run");
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
    id: p.id || "custom", family: CATALOGUE_FAMILY[n.family] || n.family, manufacturer: p.manufacturer, name: p.name,
    sku: (p.skus || []).find((x) => x.lengthMm === L)?.sku || (lengths.length === 1 ? p.sku : null) || null,
    finish: p.finish, coating: n.coating, endMatched: n.endCondition === "end-matched",
    dimensionsMm: { length: L, width: p.widthMm, thickness: p.thicknessMm }, effectiveCoverMm: p.effectiveCoverMm,
  }));
}

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
    const opts = { materialId: mat.id, wallId: tag, orientation: n.orientation };
    let r;
    if (mat.methodKey === "sheet_layout") r = sheetLayout(wallGeom, w.openings, variants, { ...opts, datumMm: rules.datumMm, heightAllowanceMm: rules.heightAllowanceMm, jointRows: rules.jointRows });
    else if (mat.methodKey === "course_layout") r = courseLayout(wallGeom, w.openings, variants, { ...opts, datumMm: rules.datumMm, joints: rules.joints });
    else if (mat.methodKey === "panel_grid") r = panelGrid(wallGeom, w.openings, variants[0], { ...opts, orientation: undefined, jointGapMm: n.product?.gapMm ?? rules.jointGapMm, minStripMm: rules.minStripMm });
    else if (mat.methodKey === "aac_panel_layout") r = aacPanelLayout(wallGeom, w.openings, variants, { ...opts, adhesiveJointMm: rules.adhesiveJointMm, minStripMm: rules.minStripMm });
    else if (mat.methodKey === "area_to_linear") {
      const areas = wallAreas(wallGeom, w.openings);
      r = areaToLinear({ materialId: mat.id, sourceId: m.id, netAreaM2: areas.netM2, product: variants[0], spareRate: (n.spareRate || 0) / 100, orderIncrementM: n.orderIncrementM ?? undefined,
        orientation: n.orientation, sourceRefs: [{ measurementId: m.id, wallId: m.id }] });
    } else if (mat.methodKey === "support_grid") {
      r = supportGrid({ id: tag, polygon: built.polygon }, w.openings, { id: mat.id, materialId: mat.id, orientation: n.orientation === "horizontal" ? "horizontal" : "vertical",
        identity: familyIdentity(n), stockPolicy: n.product?.lengthsMm?.length ? { kind: "list", lengthsMm: n.product.lengthsMm, sharePieces: false } : undefined,
        maxSpacingMm: rules.maxSpacingMm, startOffsetMm: rules.startOffsetMm, endOffsetMm: rules.endOffsetMm, requiredStationsMm: rules.requiredStationsMm,
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
  return results;
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

/**
 * Turn one material's demands into purchase lines: allocate linear stock (one allocator), keep sheets by size,
 * sum everything else per (identity, unit). Returns lines + the allocation + the cut-list appendix.
 */
function purchaseLines(mat, n, demands, matKey, sink) {
  const lines = new Map();
  const add = (key, unit, qty, finishedLengthMm, item, demandIds, identity) => {
    const bucketKey = `${matKey}|${key}`;
    let l = lines.get(bucketKey);
    if (!l) {
      l = { bucketKey, specKey: stableStringify({ material: matKey, identity: identityKey(identity ?? null), unit }), materialKey: matKey, generic: true, family: n.family, unit,
        finishedLengthMm: finishedLengthMm ?? null, quantity: 0, exact: 0, item, jobMaterialIds: [mat.id], contributionIds: [], demandIds: [], problems: [], notes: [], handlingFlag: false, ceilingExceeded: false };
      lines.set(bucketKey, l);
    }
    l.exact += qty;
    for (const d of demandIds) l.demandIds.push(d);
  };
  const allocatable = (d) => d.kind === "linear" && d.stockPolicy && d.stockPolicy.kind !== "random" && d.lengthKind !== "orderedStock" && d.unit !== "lm";
  const linear = demands.filter(allocatable);
  const appendix = { aluminium: [], timber: [], layouts: [] };
  let allocation = null;
  const barOwner = new Map(); // purchase bucket → demand ids of the cuts it carries (for contribution attribution)
  if (linear.length) {
    const offcuts = sink.offcuts.filter((o) => o.materialId === mat.id).map((o) => ({ id: o.id, lengthMm: o.lengthMm, identity: linear[0].identity, label: o.label }));
    allocation = allocateLinear(linear, { existingOffcuts: offcuts });
    const unit = n.family === "aluminium" ? "bar" : "piece";
    for (const g of allocation.groups) {
      for (const u of g.unavailable || []) sink.problems.push({ code: "unavailable_stock", message: `${demands.find((d) => d.id === u.demandId)?.label || u.demandId}: ${u.message || u.reason}`, blocking: true });
      for (const b of g.bars) {
        if (b.source !== "new") continue;
        const ids = b.cuts.map((c) => c.demandId);
        add(`${unit}|${b.stockLengthMm}|${g.identityKey}`, unit, 1, b.stockLengthMm, { description: `${describeIdentity(n)} — ${fmt(b.stockLengthMm)} mm length${n.family === "aluminium" ? " (no joins)" : ""}`, stockLengthMm: b.stockLengthMm }, ids, linear.find((d) => d.id === ids[0])?.identity);
        barOwner.set(`${unit}|${b.stockLengthMm}|${g.identityKey}`, [...(barOwner.get(`${unit}|${b.stockLengthMm}|${g.identityKey}`) || []), ids[0]]);
      }
    }
    if (n.family === "aluminium") {
      for (const g of allocation.groups) {
        appendix.aluminium.push({ stockLengthMm: n.stockLengthMm, kerfMm: n.kerfMm, kerfConfirmed: !!n.kerfConfirmed, endTrimMm: n.endTrimMm || 0, barCount: g.barCount,
          lowerBound: g.lowerBound ?? null, proven: !!g.proven, unavailable: (g.unavailable || []).map((u) => ({ demandId: u.demandId, reason: u.message || u.reason, label: demands.find((d) => d.id === u.demandId)?.label })),
          bars: g.bars.map((b, i) => ({ n: i + 1, source: b.source, offcutLabel: b.offcutId ? offcuts.find((o) => o.id === b.offcutId)?.label : null, cuts: b.cuts.map((c) => ({ label: c.label, lengthMm: c.lengthMm })),
            residualMm: b.residualMm, residualUsable: !!b.residualUsable, kerfLossMm: b.kerfLossMm })) });
      }
    } else {
      const rows = new Map();
      for (const g of allocation.groups) for (const b of g.bars) for (const c of b.cuts) {
        const k = `${c.lengthMm}|${b.stockLengthMm}`;
        const r = rows.get(k) || { cutMm: c.lengthMm, stockMm: b.source === "new" ? b.stockLengthMm : null, qty: 0, labels: [] };
        r.qty += 1; if (c.label) r.labels.push(c.label);
        rows.set(k, r);
      }
      for (const g of allocation.groups) for (const u of g.unavailable || []) {
        const d = demands.find((x) => x.id === u.demandId);
        rows.set(`u|${u.demandId}`, { cutMm: d?.lengthMm, stockMm: null, qty: d?.quantity || 1, labels: [d?.label].filter(Boolean) });
      }
      appendix.timber.push({ rows: [...rows.values()].sort((a, b) => b.cutMm - a.cutMm) });
    }
  }
  for (const d of demands) {
    if (allocatable(d)) continue;
    if (d.kind === "linear" && d.unit === "lm") {
      add(`lm|${identityKey(d.identity)}`, "lm", d.quantity, null, { description: `${describeIdentity(n)} — random lengths (LM)`, note: "Estimate — total LM, not a piece count" }, [d.id], d.identity);
      continue;
    }
    if (d.kind === "linear") {
      // ordered stock (the user's own supplier cut list) or a linear demand with no policy: buy as entered
      const L = d.lengthMm;
      if (d.lengthKind !== "orderedStock" && d.stockPolicy == null && n.family === "timber") {
        const s = selectStock(L, { kind: "grid", minMm: 1200, incrementMm: 600, maxMm: n.stock?.maxMm ?? null, unavailableMm: n.stock?.unavailableMm || [] });
        if (s.stockMm == null) { sink.problems.push({ code: "unavailable_stock", message: `${d.label || "A piece"}: ${s.message}`, blocking: true }); continue; }
        add(`piece|${s.stockMm}|${identityKey(d.identity)}`, "piece", d.quantity, s.stockMm, { description: `${describeIdentity(n)} — ${fmt(s.stockMm)} mm length`, stockLengthMm: s.stockMm }, [d.id], d.identity);
      } else add(`piece|${L}|${identityKey(d.identity)}`, d.unit === "bar" ? "bar" : "piece", d.quantity, L, { description: `${describeIdentity(n)} — ${fmt(L)} mm length${d.lengthKind === "orderedStock" ? " (as entered)" : ""}`, stockLengthMm: L }, [d.id], d.identity);
      continue;
    }
    if (d.unit === "sheet" || d.kind === "sheet") {
      const L = d.identity?.stockLengthMm ?? d.heightMm, Wd = d.identity?.stockWidthMm ?? d.widthMm;
      const what = [d.identity?.manufacturer, d.identity?.name, d.identity?.sku ? `SKU ${d.identity.sku}` : null].filter(Boolean).join(" ") || describeIdentity(n);
      add(`sheet|${L}|${Wd}|${identityKey(d.identity)}`, "sheet", d.quantity, L ?? null, { description: `${what}${L ? ` — ${fmt(L)}${Wd ? ` × ${fmt(Wd)}` : ""} mm` : ""}`, stockLengthMm: L ?? null, widthMm: Wd ?? null, sku: d.identity?.sku || null }, [d.id], d.identity);
      continue;
    }
    const u = d.unit || "piece";
    add(`${u}|${d.lengthMm ?? ""}|${identityKey(d.identity)}`, u, d.quantity, u === "piece" || u === "bar" ? d.lengthMm ?? null : null,
      { description: d.itemDescription || d.label || describeIdentity(n), stockLengthMm: d.lengthMm ?? null }, [d.id], d.identity);
  }
  for (const l of lines.values()) {
    // purchase quantities are whole units; LM rounds up to whole metres after any supplier increment (never down)
    l.quantity = Math.max(UNIT_INTEGER.has(l.unit) ? 1 : 0, Math.ceil(l.exact - 1e-9));
    if (l.unit === "lm" && Math.abs(l.quantity - l.exact) > 1e-9) l.item = { ...l.item, note: `${l.exact.toFixed(2)} LM calculated, ordered as ${l.quantity} LM` };
    if (l.unit === "piece" && n.family === "timber" && l.finishedLengthMm == null) l.problems.push("A timber line has no stock length.");
  }
  return { lines: [...lines.values()], allocation, appendix, barOwner };
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
    if (m.kind === "offcut" && m.inputs?.status !== "consumed") offcuts.push({ id: m.id, materialId: m.inputs?.materialId, lengthMm: m.inputs?.lengthMm, label: m.inputs?.label || m.label || "offcut" });
  }
  const c2 = { ...ctx, openingsByWall };
  const out = { contributions: [], lines: [], unplaced: [], results: {} };
  // actual layout joints per wall measurement (from cladding already computed) — feed accessory joint routes
  const jointsByWall = new Map();
  const layoutInfoFor = (wallMeasId) => ({ joints: jointsByWall.get(wallMeasId) || [] });
  const ordered = [...materials].sort((a, b) => Number(a.spec?.family === "accessory") - Number(b.spec?.family === "accessory"));
  for (const mat of ordered) {
    const mine = contributions.filter((c) => c.jobMaterialId === mat.id);
    const items = mine.map((c) => ({ c, role: c.role || "primary", m: ctx.measurementsById.get(c.measurementId) })).filter((x) => x.m);
    const sink = { problems: [], measProblems: new Map(), offcuts, wallTags: new Map(), layoutInfoFor };
    const names = items.filter((x) => x.m.kind === "wall").map((x) => ({ id: x.m.id, name: x.m.inputs?.name || x.m.label || "Wall" }));
    for (const w of names) sink.wallTags.set(w.id, names.filter((o) => o.name === w.name).length > 1 ? `${w.name} (${String(w.id).slice(0, 4)})` : w.name);
    let n = null, methodResults = [];
    const matProblems = familyProblems(mat.spec).map((p) => ({ ...p, blocking: true }));
    try {
      n = normaliseFamilySpec(mat.spec);
      if (n.family === "timber") methodResults = runTimber(mat, n, items, c2, sink);
      else if (n.family === "aluminium") methodResults = runAluminium(mat, n, items, c2, sink);
      else methodResults = runWallMethod(mat, n, items, c2, sink);
    } catch (e) {
      if (e?.name !== "TakeoffValidationError") throw e;
      sink.problems.push({ code: "invalid_input", message: e.message, blocking: true });
    }
    const demands = methodResults.flatMap((r) => r.demands || []);
    for (const r of methodResults) {
      const wid = r.layout?.wallMeasurementId;
      if (!wid || !Array.isArray(r.layout?.joints)) continue;
      const list = jointsByWall.get(wid) || [];
      for (const j of r.layout.joints) (j.segments || []).forEach((sg, k) => list.push({ id: `${mat.id.slice(0, 6)}-j${j.index}-${k}`, orientation: j.orientation, kind: "joint", atMm: j.atMm, fromMm: sg.startMm, toMm: sg.endMm }));
      jointsByWall.set(wid, list);
    }
    const methodProblems = methodResults.flatMap((r) => r.problems || []);
    const matKey = genericMaterialKey(mat);
    let pl = { lines: [], allocation: null, appendix: { aluminium: [], timber: [], layouts: [] }, barOwner: new Map() };
    if (n) {
      try { pl = purchaseLines(mat, n, demands, matKey, sink); } catch (e) {
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
        pl.appendix.layouts.push({ wallLabel: r.layout.wallLabel, grossM2: r.layout.areas?.grossM2 ?? null, openingM2: r.layout.areas?.openingM2 ?? null, netM2: r.layout.areas?.netM2 ?? null,
          rows: [...counts.entries()].map(([description, qty]) => ({ description, qty })), notes: (r.explain || []).slice(0, 6) });
      }
    }
    const blocking = [...matProblems, ...sink.problems, ...methodProblems].filter((p) => p.blocking !== false);
    const advisory = [...sink.problems, ...methodProblems].filter((p) => p.blocking === false);
    // a measurement with scale/plan problems blocks its lines exactly like a flashing run
    const measCodes = new Set();
    for (const v of sink.measProblems.values()) for (const p of v) measCodes.add(p);
    for (const l of pl.lines) {
      for (const p of blocking) if (!l.problems.includes(p.message)) l.problems.push(p.message);
      for (const p of measCodes) if (!l.problems.includes(p)) l.problems.push(p);
      for (const p of advisory) l.notes.push(p.message);
    }
    // contribution attribution: each purchase unit belongs to the contribution of the (first) demand it serves
    const demandMeas = new Map(demands.map((d) => [d.id, d.sourceRefs?.[0]?.measurementId || d.sourceRefs?.[0]?.wallId || null]));
    const contribOfMeas = new Map(mine.map((c) => [c.measurementId, c.id]));
    const perContribution = new Map(mine.map((c) => [c.id, []]));
    for (const l of pl.lines) {
      const owners = new Map();
      for (const did of l.demandIds) {
        const cid = contribOfMeas.get(demandMeas.get(did)) || mine[0]?.id;
        if (cid) owners.set(cid, (owners.get(cid) || 0) + 1);
      }
      // split the WHOLE purchase quantity across the contributions that need it (largest share first, stable)
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
    for (const { c, m } of items) {
      const pieces = perContribution.get(c.id) || [];
      const problems = [...(sink.measProblems.get(m.id) || [])];
      const res = { contributionId: c.id, measurementId: c.measurementId, jobMaterialId: mat.id, kind: m.kind, role: c.role || "primary", pieces, problems, explanation: null, generic: true };
      out.contributions.push(res);
      // a measurement that should feed purchases but produced none (and has problems) is a missing requirement
      if (!pieces.length && problems.length) out.unplaced.push({ contributionId: c.id, jobMaterialId: mat.id, specKey: matKey, problems, explanation: null });
    }
    const quantityStatus = blocking.length ? "incomplete" : methodResults.some((r) => r.status?.quantity === "estimate") ? "estimate" : "calculated";
    const installs = methodResults.map((r) => r.status?.installation).filter(Boolean);
    const procurement = matProblems.length ? "missing-product" : blocking.some((p) => p.code === "unavailable_stock") ? "unavailable-stock" : blocking.length || !pl.lines.length ? "draft" : "ready";
    out.results[mat.id] = {
      family: n?.family || mat.spec?.family, methodKey: mat.methodKey, methodVersion: mat.methodVersion, materialKey: matKey,
      status: { quantity: quantityStatus, installation: installs.includes("source-pending") ? "source-pending" : installs[0] || "unspecified", procurement },
      problems: [...blocking, ...advisory], explain: methodResults.flatMap((r) => r.explain || []),
      layouts: methodResults.map((r) => r.layout).filter(Boolean), demands, allocation: pl.allocation, appendix: pl.appendix,
    };
    out.lines.push(...pl.lines);
  }
  return out;
}
