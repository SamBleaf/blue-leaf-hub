// =============================================================================
// shared/takeoff/engine/cladding.js — cladding layout methods (TC-R04 04 §C1–C6, 12 Rendex).
//
//   sheet_layout@2      Axon vertical sheets and Rendex EPS sheets: occupied cells, each strip sized by
//                       its maximum top (rakes), shortest sufficient LISTED height, explicit joint rows
//                       for a second course — otherwise blocked. Never one sheet per width by assumption.
//   course_layout@1     Linea / Stria / timber courses (horizontal) or boards (vertical): effective cover,
//                       only full-band openings remove length, joints only where a reviewed rule and its
//                       predicates (min piece, supports, factory ends, stagger, opening clearance) permit.
//   panel_grid@1        Matrix expressed-joint grid: ceil((W+g)/(p+g)) per axis, occupied cells; cut and
//                       narrow strips (boundary bands, outline/opening cuts) flagged for detail review.
//   aac_panel_layout@1  AAC (Walsc / Hebel) vertical panels: one manufacturer + system per layout, whole
//                       panels, adhesive joint as a system parameter, every unknown component explicit.
//   area_to_linear@2    timber random-length LM estimate = net area / effective cover (+ spare, increment).
//
// Every method returns a contract MethodResult (engine/contract.js). Purchase mode is conservative: a
// partly occupied cell consumes a whole sheet/panel, no offcut reuse, no cross-course sharing. Spares and
// pack rounding happen at purchase level, not here. Unknown installation rows, yields and spacings are
// never invented — they come back as explicit unresolved problems or need reviewed input; while any is
// open, or the assembly does not state the method/products/orientation it covers, installation is never
// "supported-by-selected-rule". Problems carry `axis` ("quantity" | "installation" | "procurement"); only
// blocking QUANTITY problems withhold demands. Inputs are validated, never thrown on.
// =============================================================================
import { EPS_MM, UNITS, demandId, emptyResult, identityKey, problem } from "./contract.js";
import { planSheets } from "./sheetCutPlan.js";
import { ceilToIncrement, formatMm, isFiniteNumber } from "../units.js";
import {
  jointSpans, lineSpans, materialPieces, normaliseOpenings, piecesExtent, projectIntervals, subtractIntervals,
  surfaceModel, transposeSurface, wallAreas,
} from "./wall.js";

/** Generated cells/courses/pieces allowed per wall (06 proposed safeguard); excess is rejected, never truncated. */
export const MAX_ELEMENTS_PER_WALL = 5000;

/** Opening deduction policies for layouts: geometry-based cells (default) or none (explicit conservative). */
export const OPENING_POLICIES = Object.freeze(["geometry", "none"]);

export const CLADDING_METHODS = Object.freeze({
  SHEET: "sheet_layout@2", COURSE: "course_layout@1", GRID: "panel_grid@1", AAC: "aac_panel_layout@1", AREA: "area_to_linear@2",
});

const qty = (code, message, extra = {}) => problem(code, message, { axis: "quantity", ...extra });
const note = (code, message, extra = {}) => problem(code, message, { axis: "quantity", blocking: false, ...extra });
const inst = (code, message, extra = {}) => problem(code, message, { axis: "installation", blocking: false, ...extra });
const proc = (code, message, extra = {}) => problem(code, message, { axis: "procurement", ...extra });
const isPos = (v) => isFiniteNumber(v) && v > 0;
const isNonNeg = (v) => isFiniteNumber(v) && v >= 0;
const mm = (v) => `${formatMm(v)} mm`;
const m2 = (v) => `${formatMm(v, 3)} m²`;
const blocked = (res) => res.problems.some((p) => p.blocking && p.axis === "quantity");

const STOCK_UNAVAILABLE = new Set(["sheet_too_tall", "panel_too_tall"]);
const MISSING_PRODUCT = new Set(["product_missing", "joint_product_missing"]);
/** Open review flags and unresolved installation inputs: a selected rule cannot claim the assembly verified. */
const INSTALLATION_GAPS = new Set([
  "narrow_strip", "cut_panel_needs_review", "opening_panel_detail_required",
  "fixing_row_missing", "rails_unresolved", "control_joints_not_entered", "orientation_permission_unknown", "component_out_of_scope",
]);
/** Units bought as whole things: a reviewed manual quantity in these must be a whole number. */
const DISCRETE_UNITS = new Set(["piece", "sheet", "bar", "box", "bag", "roll", "pack", "cartridge"]);
const objOr = (v) => (v && typeof v === "object" ? v : {});

// ── products and identity ────────────────────────────────────────────────────

function familyMessage(family, method) {
  if (family === "aac") return "AAC panels are their own manufacturer system — use the AAC panel layout.";
  if (family === "eps-cladding") return "Rendex/foam cladding is a distinct family — use the sheet layout; AAC and board recipes never apply.";
  return `The ${method} method does not take "${family ?? "unknown"}" products.`;
}

/**
 * One product, or several stock-length variants of the SAME product (e.g. Axon 133 smooth 2450/2750/3000).
 * Everything except SKU and length must match; dimensions (and effective cover when needed) must be
 * entered — never inferred from nominal width or another product.
 */
function readVariants(product, { families, requireCover, method, mixedCode = "mixed_product_variants" }) {
  const list = Array.isArray(product) ? product : product ? [product] : [];
  if (!list.length) return { variants: [], problems: [qty("product_missing", "Choose the product before calculating.")] };
  const problems = [];
  for (const rec of list) {
    if (!families.includes(rec?.family)) { problems.push(qty("wrong_family", familyMessage(rec?.family, method), { refs: [{ productId: rec?.id ?? null }] })); continue; }
    const d = rec.dimensionsMm || {};
    const missing = ["length", "width", "thickness"].filter((k) => !isPos(d[k])).map((k) => `${k} (mm)`);
    if (requireCover && !isPos(rec.effectiveCoverMm)) missing.push("effective cover (mm)");
    if (missing.length) {
      problems.push(qty("product_parameter_missing", `${rec.name || rec.id || "Product"} is missing ${missing.join(", ")} — enter it from the exact product data; it is never inferred.`, { refs: [{ productId: rec.id ?? null, missing }] }));
    } else if (requireCover && rec.effectiveCoverMm > d.width + EPS_MM) {
      problems.push(qty("product_parameter_invalid", `${rec.name || rec.id || "Product"}: effective cover ${mm(rec.effectiveCoverMm)} is wider than the ${mm(d.width)} piece itself — check the product data.`, { refs: [{ productId: rec.id ?? null }] }));
    }
  }
  if (problems.length) return { variants: [], problems };
  const sig = (r) => identityKey({
    family: r.family, manufacturer: r.manufacturer ?? null, name: r.name ?? null, profile: r.profile ?? null, finish: r.finish ?? null,
    width: r.dimensionsMm.width, thickness: r.dimensionsMm.thickness, cover: r.effectiveCoverMm ?? null, coating: r.coating ?? null,
    species: r.species ?? null, grade: r.grade ?? null, treatment: r.treatment ?? null, endMatched: r.endMatched === true,
    orientations: Array.isArray(r.permittedOrientations) ? [...r.permittedOrientations].sort() : null,
  });
  const lengths = list.map((r) => r.dimensionsMm.length);
  if (new Set(list.map(sig)).size > 1 || new Set(lengths).size !== lengths.length) {
    const names = [...new Set(list.map((r) => `${r.manufacturer ?? ""} ${r.name ?? r.id}`.trim()))].join(" / ");
    return { variants: [], problems: [qty(mixedCode, `These products cannot be combined in one layout (${names}) — only stock lengths of one exact product, system, profile, finish and thickness may be offered together.`)] };
  }
  const variants = list.map((rec) => ({ rec, lengthMm: rec.dimensionsMm.length })).sort((a, b) => a.lengthMm - b.lengthMm);
  return { variants, base: variants[0].rec, problems };
}

/** Procurement identity: what physically must be bought (never usage notes). */
function stockIdentity(rec, { orientation = null, unit, stockLengthMm = null, stockWidthMm = null }) {
  return {
    family: rec.family ?? null, manufacturer: rec.manufacturer ?? null, supplier: rec.supplier ?? null, sku: rec.sku ?? null,
    name: rec.name ?? null, profile: rec.profile ?? rec.name ?? null, finish: rec.finish ?? null, coating: rec.coating ?? null,
    species: rec.species ?? null, grade: rec.grade ?? null, treatment: rec.treatment ?? null,
    endCondition: rec.endMatched === true ? "end-matched" : rec.endCondition ?? null,
    thicknessMm: rec.dimensionsMm?.thickness ?? null, stockWidthMm, stockLengthMm, orientation, unit,
  };
}

/** Identity for an accessory: its selected product, or an unresolved placeholder that can never pool. */
function accessoryIdentity(role, rec, { orientation = null, unit }) {
  if (rec) return stockIdentity(rec, { orientation, unit, stockLengthMm: rec.dimensionsMm?.length ?? null, stockWidthMm: rec.dimensionsMm?.width ?? null });
  return stockIdentity({ family: `unresolved:${role}` }, { orientation, unit });
}

// ── installation rule selector ───────────────────────────────────────────────

/**
 * Installation status for a selected assembly + conditions (06 three statuses; never inferred).
 * The assembly must be for this method, product family, exact product variants and (when given) the
 * installation orientation — a mismatch is "unspecified"; an assembly that does not STATE its method,
 * product variants or orientation cannot be shown to cover the selection and stays source-pending.
 * Rows must be "active" (reviewed), not superseded, and match every condition; all required selectors
 * must be supplied. A reviewed project detail ({ ref, reviewer }) or an explicit out-of-scope choice wins.
 * @param {{ assembly?: object, conditions?: object, projectDetail?: { ref: string, reviewer: string }, outOfScope?: boolean }} [installation]
 * @param {{ method?: string, productIds?: string[], families?: string[], orientation?: string }} [ctx]
 * @returns {{ status: string, rule: object|null, problems: object[] }}
 */
export function selectInstallationRule(installation, ctx) {
  const problems = [];
  const { assembly, conditions: rawConditions, projectDetail, outOfScope } = objOr(installation);
  const { method, productIds = [], families = [], orientation } = objOr(ctx);
  const conditions = objOr(rawConditions);
  if (outOfScope === true) return { status: "out-of-scope", rule: null, problems };
  if (projectDetail) {
    if (projectDetail.ref && projectDetail.reviewer) return { status: "project-detail-supplied", rule: null, problems };
    problems.push(inst("project_detail_incomplete", "A project installation detail needs its document reference and reviewer."));
  }
  if (!assembly || typeof assembly !== "object") return { status: "unspecified", rule: null, problems };
  const mismatch = (code, message) => {
    problems.push(problem(code, message, { axis: "installation" }));
    return { status: "unspecified", rule: null, problems };
  };
  if (method && assembly.method && assembly.method !== method) return mismatch("assembly_method_mismatch", `Assembly ${assembly.id} is for ${assembly.method}, not ${method}.`);
  if (assembly.family && families.some((f) => f !== assembly.family)) {
    return mismatch("assembly_family_mismatch", `Assembly ${assembly.id} is for ${assembly.family} products — AAC, foam and board assemblies are never shared.`);
  }
  if (Array.isArray(assembly.productVariantIds) && productIds.some((id) => !assembly.productVariantIds.includes(id))) {
    return mismatch("assembly_product_mismatch", `Assembly ${assembly.id} does not cover the selected product — brands and wall systems are never mixed.`);
  }
  if (orientation && assembly.orientation && assembly.orientation !== orientation) {
    return mismatch("assembly_orientation_mismatch", `Assembly ${assembly.id} is for ${assembly.orientation} installation, not ${orientation} — each orientation has its own assembly.`);
  }
  const unstated = [
    method && !assembly.method ? "method" : null,
    productIds.length && !Array.isArray(assembly.productVariantIds) ? "product variants" : null,
    orientation && !assembly.orientation ? "orientation" : null,
  ].filter(Boolean);
  if (unstated.length) {
    problems.push(inst("assembly_coverage_unstated", `Assembly ${assembly.id} does not state its ${unstated.join(", ")} — it cannot be shown to cover this selection, so installation stays source-pending.`, { refs: [{ assemblyId: assembly.id ?? null, unstated }] }));
  }
  const missing = (assembly.requiredSelectors || []).filter((s) => conditions[s] === undefined || conditions[s] === null || conditions[s] === "");
  if (missing.length) problems.push(inst("installation_selectors_missing", `Installation conditions still needed: ${missing.join(", ")}.`, { refs: [{ assemblyId: assembly.id, missing }] }));
  const rows = (assembly.activeInstallationRows || []).filter((r) => r && r.verificationState === "active" && !r.supersededBy
    && Object.entries(r.conditions || {}).every(([k, v]) => conditions[k] === v));
  if (!missing.length && !unstated.length && rows.length === 1) return { status: "supported-by-selected-rule", rule: rows[0], problems };
  if (rows.length > 1) problems.push(inst("installation_rule_ambiguous", `More than one reviewed row matches ${assembly.id} — narrow the conditions.`));
  else if (!rows.length) problems.push(inst("installation_rule_missing", `No reviewed installation row is active for ${assembly.id} under these conditions — installation stays source-pending.`));
  return { status: "source-pending", rule: null, problems };
}

// ── shared plumbing ──────────────────────────────────────────────────────────

function prepare(wall, openings, opts, res) {
  if (!wall?.polygon) {
    res.problems.push(...(wall?.problems || []), qty("wall_invalid", "The wall shape is missing or invalid — fix it before calculating."));
    return null;
  }
  const policy = opts.openingPolicy ?? "geometry";
  if (!OPENING_POLICIES.includes(policy)) {
    res.problems.push(qty("opening_policy_invalid", `Opening policy must be one of: ${OPENING_POLICIES.join(", ")}.`));
    return null;
  }
  const norm = normaliseOpenings(wall, openings);
  res.problems.push(...norm.problems);
  return {
    wallId: opts.wallId ?? wall.id ?? "wall",
    measurementId: wall.measurementId ?? null,
    policy,
    openings: norm.openings,
    surface: surfaceModel(wall, policy === "none" ? [] : norm.openings),
    areas: wallAreas(wall, openings),
  };
}

function installationFor(opts, method, records, res, orientation) {
  const sel = selectInstallationRule(opts.installation, {
    method, productIds: records.map((r) => r.id), families: [...new Set(records.map((r) => r.family))], orientation,
  });
  res.problems.push(...sel.problems);
  return sel;
}

/** sourceRefs for a generated element: the wall, plus every opening its rectangle touches (id order). */
function refsFor(ctx, cell, rect) {
  const head = { wallId: ctx.wallId, cell };
  if (ctx.measurementId) head.measurementId = ctx.measurementId;
  const refs = [head];
  if (rect) {
    const touched = ctx.openings.filter((o) => o.x0 < rect.x1 && o.x1 > rect.x0 && o.y0 < rect.y1 && o.y1 > rect.y0).map((o) => o.id);
    for (const openingId of touched.sort((a, b) => String(a).localeCompare(String(b)))) refs.push({ wallId: ctx.wallId, cell, openingId });
  }
  return refs;
}

function finalise(res, { quantityOk = "calculated", records = [], installation = { status: "unspecified" } }) {
  const qtyBlocked = blocked(res);
  if (qtyBlocked) res.demands = [];
  let installationStatus = installation.status;
  if (installationStatus === "supported-by-selected-rule" && res.problems.some((p) => INSTALLATION_GAPS.has(p.code))) installationStatus = "source-pending";
  let procurement = "draft";
  if (res.problems.some((p) => STOCK_UNAVAILABLE.has(p.code))) procurement = "unavailable-stock";
  else if (!qtyBlocked) {
    if (res.problems.some((p) => MISSING_PRODUCT.has(p.code)) || res.demands.some((d) => !d.identity?.sku)) procurement = "missing-product";
    else if (!res.problems.some((p) => p.axis === "procurement" && p.blocking) && records.length && records.every((r) => r?.supplierAvailability === "confirmed")) procurement = "ready";
  }
  res.status = { quantity: qtyBlocked ? "incomplete" : quantityOk, installation: installationStatus, procurement };
  return res;
}

/**
 * Bands along one axis for panels of `pitch` separated by joints of `gap`, phased from `origin`, over
 * [start, end]. Panels are trimmed to the extent. Per C4 the boundary never receives an automatic outer
 * joint: when the wall edge falls inside a joint, an extra "edge-in-joint" band (fixed-grid width 0) is
 * required. Returns null when the count would exceed MAX_ELEMENTS_PER_WALL.
 */
function gridBands(start, end, origin, pitch, gap) {
  const period = pitch + gap;
  if ((end - start) / period > MAX_ELEMENTS_PER_WALL) return null;
  const bands = [];
  for (let k = Math.floor((start - origin) / period); ; k++) {
    const ps = origin + k * period, pe = ps + pitch;
    if (ps >= end - EPS_MM) break;
    const zs = Math.max(ps, start), ze = Math.min(pe, end);
    if (ze - zs > EPS_MM) bands.push({ index: k, zoneStart: zs, zoneEnd: ze, panelStart: ps, panelEnd: pe, widthMm: ze - zs, kind: ze - zs >= pitch - EPS_MM ? "full" : "cut" });
    if (gap > 0) {
      const gs = Math.max(pe, start), ge = Math.min(pe + gap, end);
      if (ge - gs > EPS_MM && (gs <= start + EPS_MM || ge >= end - EPS_MM)) {
        const idx = gs <= start + EPS_MM ? k : k + 1;
        const ps2 = origin + idx * period;
        bands.push({ index: idx, zoneStart: gs, zoneEnd: ge, panelStart: ps2, panelEnd: ps2 + pitch, widthMm: 0, kind: "edge-in-joint" });
      }
    }
  }
  return bands;
}

/** Shortest top course an automatic joint may leave (until a product saves its own minimum piece). */
export const AUTO_JOINT_MIN_TOP_MM = 100;

/**
 * HUB 015: the minimum horizontal joints for a wall taller than the tallest listed sheet, from a joint RULE (gap +
 * detail reference, no heights). Joint k sits one usable sheet length (tallest − height allowance) above the last
 * course start; a top course thinner than AUTO_JOINT_MIN_TOP_MM moves the joint down (with a note to check). Returns
 * null when there is no complete rule, explicit heights are given, or no joint is needed.
 */
export function autoJointRows(spec, lo, hi, tallestMm, allowanceMm, res, wallId = "wall") {
  if (!spec || typeof spec !== "object" || (Array.isArray(spec.atMm) && spec.atMm.length)) return null;
  if (!isNonNeg(spec.gapMm) || typeof spec.detailRef !== "string" || !spec.detailRef.trim() || !isFiniteNumber(tallestMm)) return null;
  const usable = tallestMm - (allowanceMm || 0);
  if (!(usable > spec.gapMm + AUTO_JOINT_MIN_TOP_MM)) return null;
  const at = [];
  let start = lo, moved = false;
  while (hi - start > usable + EPS_MM && at.length < 50) {
    let a = start + usable;
    if (hi - (a + spec.gapMm) < AUTO_JOINT_MIN_TOP_MM - EPS_MM) { a = hi - spec.gapMm - AUTO_JOINT_MIN_TOP_MM; moved = true; }
    at.push(Math.round(a * 1000) / 1000);
    start = a + spec.gapMm;
  }
  if (!at.length) return null;
  if (moved && res) res.problems.push(qty("auto_joint_lowered", `${wallId}: the automatic joint was lowered so the top course is at least ${mm(AUTO_JOINT_MIN_TOP_MM)} — check the minimum piece for this product.`, { blocking: false }));
  return { ...spec, atMm: at };
}

/** Explicit joint rows → course bands along the sheet-length axis (null + problem when invalid). */
function jointRowBands(spec, lo, hi, res) {
  if (spec === undefined || spec === null) return [{ index: 0, zoneStart: lo, zoneEnd: hi }];
  const sorted = Array.isArray(spec.atMm) ? [...spec.atMm].sort((a, b) => a - b) : [];
  const gap = spec.gapMm;
  const ok = sorted.length > 0 && sorted.every(isFiniteNumber) && isNonNeg(gap)
    && sorted[0] > lo + EPS_MM && sorted[sorted.length - 1] + gap < hi - EPS_MM
    && sorted.every((v, i) => i === 0 || v > sorted[i - 1] + gap + EPS_MM);
  if (!ok) {
    res.problems.push(qty("joint_rows_invalid", "A joint row needs explicit position(s) inside the wall and the joint gap from the selected detail — a 'joint allowed' flag is not a layout."));
    return null;
  }
  const bounds = [lo, ...sorted.flatMap((v) => [v, v + gap]), hi];
  return Array.from({ length: sorted.length + 1 }, (_, i) => ({ index: i, zoneStart: bounds[2 * i], zoneEnd: bounds[2 * i + 1] }));
}

function strictlyInside(values, lo, hi) {
  return Array.isArray(values) && values.length > 0 && values.every((v) => isFiniteNumber(v) && v > lo + EPS_MM && v < hi - EPS_MM);
}

/** Flags for cut / edge-in-joint boundary bands: geometry fitting never proves a strip installable. */
function stripFlags(bands, { axis, minStripMm, wallId, gapMm, what }) {
  const out = [];
  for (const b of bands) {
    if (b.kind === "full") continue;
    const ref = { wallId, axis, band: b.index, widthMm: b.widthMm };
    if (b.kind === "edge-in-joint") {
      out.push(inst("narrow_strip", `${wallId}: the wall edge (${axis}) falls inside a ${mm(gapMm)} joint — it needs a narrow strip or a changed grid/stock format. Review the detail.`, { refs: [ref] }));
    } else if (minStripMm === undefined || minStripMm === null) {
      out.push(inst("cut_panel_needs_review", `${wallId}: a ${what} cut to ${mm(b.widthMm)} (${axis}) needs the system's minimum-piece and edge-fixing check — none is entered.`, { refs: [ref] }));
    } else if (b.widthMm < minStripMm - EPS_MM) {
      out.push(inst("narrow_strip", `${wallId}: a ${mm(b.widthMm)} ${what} strip (${axis}) is narrower than the ${mm(minStripMm)} minimum — review the detail.`, { refs: [ref] }));
    }
  }
  return out;
}

/**
 * How an occupied grid cell is cut INSIDE its band zone — by the wall outline or by openings — or null when
 * its material fills the zone (boundary bands are flagged separately by stripFlags). minWidthMm is the
 * narrowest leg: the cut extent, the material beside each opening, and between neighbouring openings.
 * "irregular" = a raked/stepped outline cut, whose minimum piece cannot be read off one dimension.
 */
function cellCut(surface, rect, ext) {
  const w = ext.x1 - ext.x0, h = ext.y1 - ext.y0;
  const tol = EPS_MM * (w + h);
  const holes = surface.holes.filter((o) => o.x0 < ext.x1 - EPS_MM && o.x1 > ext.x0 + EPS_MM && o.y0 < ext.y1 - EPS_MM && o.y1 > ext.y0 + EPS_MM);
  const narrowed = w < rect.x1 - rect.x0 - EPS_MM || h < rect.y1 - rect.y0 - EPS_MM;
  if (!narrowed && !holes.length && ext.area >= w * h - tol) return null;
  const outline = piecesExtent(materialPieces({ ...surface, holes: [] }, ext));
  const legs = holes.flatMap((o) => [o.x0 - ext.x0, ext.x1 - o.x1, o.y0 - ext.y0, ext.y1 - o.y1]);
  for (const p of holes) {
    for (const q of holes) {
      if (p.y0 < q.y1 && q.y0 < p.y1) legs.push(q.x0 - p.x1);
      if (p.x0 < q.x1 && q.x0 < p.x1) legs.push(q.y0 - p.y1);
    }
  }
  return {
    reason: outline.area < w * h - tol ? "irregular" : "cut",
    minWidthMm: Math.min(w, h, ...legs.filter((v) => v > EPS_MM)), cutWidthMm: w, cutHeightMm: h,
  };
}

function lineDemands(ctx, { materialId, role, key, spans, identity, label, toRect }) {
  return spans.map(([a, b], j) => ({
    id: demandId(materialId, ctx.wallId, role, `${key}s${j}`), materialId, role, kind: "linear", unit: "piece",
    lengthMm: b - a, quantity: 1, lengthKind: "tight", identity, label: `${label} (${mm(b - a)})`,
    sourceRefs: refsFor(ctx, `${key}s${j}`, toRect(a, b)), provenance: "calculated",
  }));
}

/** Reviewed scope a component group can be given instead of a quantity (10: visible, never silent). */
const COMPONENT_SCOPES = Object.freeze(["not-required", "by-others", "excluded"]);

/**
 * Component groups that are supplied as reviewed manual quantities or a reviewed scope (these always win),
 * calculated, explicitly not required, or left UNRESOLVED with a problem (never zero). A manual entry
 * needs a unique id, a quantity (whole for counted units), a unit and authority; a scope entry
 * ({ group, scope: "not-required"|"by-others"|"excluded", authority }) records who decided. By-others /
 * excluded components leave the assembly incomplete, so a selected rule cannot claim it verified.
 */
function componentOutputs(res, ctx, { family, materialId, groups, reviewed }) {
  const manual = new Map(), scoped = new Map(), conflicted = new Set();
  const ids = new Set();
  for (const [i, entry] of (Array.isArray(reviewed) ? reviewed : []).entries()) {
    if (!groups.some((g) => g.group === entry?.group)) {
      res.problems.push(note("component_not_applicable", `"${entry?.group}" is not a ${family} component and was ignored — AAC, foam and board recipes are never shared.`, { refs: [{ group: entry?.group ?? null }] }));
      continue;
    }
    const key = `${entry.group}:${entry.id ?? `#${i}`}`;
    const authorised = Boolean(entry.authority?.ref && entry.authority?.reviewer) && !ids.has(key);
    if (entry.scope !== undefined) {
      if (!COMPONENT_SCOPES.includes(entry.scope) || entry.quantity !== undefined || !authorised) {
        res.problems.push(note("manual_component_invalid", `The reviewed ${entry.group} scope must be one of ${COMPONENT_SCOPES.join(", ")} (no quantity), with its source reference and reviewer.`, { refs: [{ group: entry.group }] }));
        continue;
      }
      ids.add(key);
      if (scoped.has(entry.group)) conflicted.add(entry.group);
      scoped.set(entry.group, entry);
      continue;
    }
    const whole = !DISCRETE_UNITS.has(entry.unit) || Number.isInteger(entry.quantity);
    if (!isPos(entry.quantity) || !whole || !UNITS.includes(entry.unit) || !authorised) {
      res.problems.push(note("manual_component_invalid", `The reviewed ${entry.group} quantity needs a unique entry with a quantity (whole number for ${entry.unit ?? "counted"} units), a unit, its source reference and reviewer.`, { refs: [{ group: entry.group }] }));
      continue;
    }
    ids.add(key);
    manual.set(entry.group, [...(manual.get(entry.group) || []), { ...entry, key: entry.id ?? `#${i}` }]);
  }
  for (const group of scoped.keys()) {
    if (manual.has(group) || conflicted.has(group)) {
      conflicted.add(group);
      res.problems.push(note("manual_component_invalid", `${ctx.wallId} ${group}: conflicting reviewed entries (a quantity and a scope, or two scopes) — both were ignored.`, { refs: [{ group }] }));
    }
  }
  return groups.map((g) => {
    const entries = conflicted.has(g.group) ? null : manual.get(g.group);
    const scope = conflicted.has(g.group) ? null : scoped.get(g.group);
    if (scope) {
      const reason = `${scope.authority.ref} (${scope.authority.reviewer})`;
      if (scope.scope !== "not-required") {
        res.problems.push(inst("component_out_of_scope", `${ctx.wallId} ${g.group}: ${scope.scope} per ${reason} — not ordered here, and the assembly stays incomplete.`, { refs: [{ group: g.group }] }));
      }
      return { group: g.group, state: scope.scope, reason, demandIds: [] };
    }
    if (!entries && g.notRequired) return { group: g.group, state: "not-required", reason: g.notRequired, demandIds: [] };
    if (entries) {
      const ds = entries.map((e) => ({
        id: demandId(materialId, ctx.wallId, g.group, "manual", e.key), materialId, role: g.group,
        kind: e.unit === "m2" ? "area" : e.unit === "ml" ? "volume" : e.unit === "lm" ? "linear" : "count",
        unit: e.unit, quantity: e.quantity, identity: { ...accessoryIdentity(g.group, null, { unit: e.unit }), ...(e.identity || {}) },
        label: `${ctx.wallId} ${g.group} — reviewed ${e.authority.ref} (${e.authority.reviewer})`,
        sourceRefs: refsFor(ctx, g.group), provenance: "manual",
      }));
      res.demands.push(...ds);
      return { group: g.group, state: "manual", demandIds: ds.map((d) => d.id) };
    }
    const calc = g.calculate ? g.calculate() : null;
    if (calc) {
      res.demands.push(...calc);
      return { group: g.group, state: "calculated", demandIds: calc.map((d) => d.id) };
    }
    res.problems.push(g.unresolved);
    return { group: g.group, state: "unresolved", reason: g.unresolved.message, demandIds: [] };
  });
}

/** Coating demand = NET finish area (never ordered panel area); yield stays an explicit gap. */
function coatingDemand(res, ctx, { materialId, role, system, panelM2 }) {
  res.problems.push(proc("coating_yield_unresolved", `${ctx.wallId} ${role}: ${m2(ctx.areas.netM2)} net finish area (not the ${m2(panelM2)} of ordered panels). Converting it to product needs the system's reviewed yield.`, { blocking: false }));
  return [{
    id: demandId(materialId, ctx.wallId, role, "net"), materialId, role, kind: "area", unit: "m2", quantity: ctx.areas.netM2,
    identity: { ...accessoryIdentity(role, null, { unit: "m2" }), name: `${system} ${role}` }, label: `${ctx.wallId} ${role} — net finish area`,
    sourceRefs: refsFor(ctx, role), provenance: "calculated",
  }];
}

// ── C1 / Rendex: sheet layout ────────────────────────────────────────────────

/**
 * sheet_layout@2 — vertical sheets (Axon) or Rendex EPS sheets on one wall.
 * Columns are effective-cover strips from the datum (default: wall start); each joint-row band is a course.
 * A cell with any clad material consumes one whole sheet; an empty cell consumes none. Each cell takes the
 * shortest listed variant ≥ its cut length (max top − min base inside the cell, so rakes use each strip's
 * maximum) + explicit allowance. Too tall with no explicit joint rows → blocked with a proposal.
 * Demand widthMm is the cut across the cover, heightMm the cut along the sheet length.
 * @param {object} wall  buildWall result
 * @param {object[]} openings raw openings (normaliseOpenings shape)
 * @param {object|object[]} product catalogue record, or stock-length variants of one product
 * @param {{ materialId?: string, wallId?: string, orientation?: "vertical"|"horizontal", datumMm?: number,
 *   heightAllowanceMm?: number, openingPolicy?: "geometry"|"none", lapDirection?: string,
 *   jointRows?: { atMm: number[], gapMm: number, detailRef?: string, product?: object },
 *   installation?: object, reviewedComponents?: object[] }} [opts]  reviewedComponents as for aacPanelLayout (Rendex groups:
 *   fixings, joint-treatment, mesh, basecoat, finish-coat). Rendex needs coating (factory|applicator) and
 *   permittedOrientations; an explicit list is enforced for every orientation.
 */
export function sheetLayout(wall, openings, product, rawOpts) {
  const method = CLADDING_METHODS.SHEET;
  const opts = objOr(rawOpts);
  const res = emptyResult();
  const ctx = prepare(wall, openings, opts, res);
  const prod = readVariants(product, { families: ["cladding", "eps-cladding"], requireCover: true, method });
  res.problems.push(...prod.problems);
  const records = prod.variants.map((v) => v.rec);
  const orientation = opts.orientation ?? "vertical";
  const installation = installationFor(opts, method, records, res, orientation);
  const base = prod.base;
  const allowance = opts.heightAllowanceMm ?? 0;
  if (base) {
    const listed = Array.isArray(base.permittedOrientations) ? base.permittedOrientations : null;
    if (!["vertical", "horizontal"].includes(orientation)) res.problems.push(qty("orientation_invalid", "Sheet orientation must be vertical or horizontal."));
    else if (listed ? !listed.includes(orientation) : orientation !== "vertical") {
      res.problems.push(qty("orientation_not_permitted", `${base.name} is not listed for ${orientation} installation.`));
    } else if (!listed && base.family === "eps-cladding") {
      res.problems.push(inst("orientation_permission_unknown", `${base.name || base.id}: the system's permitted orientation is not entered — sheets are counted for ${orientation} installation, but installation cannot be verified until it is.`, { refs: [{ productId: base.id ?? null, missing: ["permittedOrientations"] }] }));
    }
    if (base.family === "eps-cladding" && !["factory", "applicator"].includes(base.coating)) {
      res.problems.push(qty("product_parameter_missing", `${base.name || base.id} needs its coating system: factory-coated or applicator-coated.`, { refs: [{ productId: base.id ?? null, missing: ["coating"] }] }));
    }
  }
  if (!isNonNeg(allowance)) res.problems.push(qty("allowance_invalid", "Height allowance must be 0 mm or more."));
  if (!ctx || !base || blocked(res)) return finalise(res, { records, installation });

  const vertical = orientation === "vertical";
  const frame = vertical ? ctx.surface : transposeSurface(ctx.surface);
  const toWall = (r) => (vertical ? r : { x0: r.y0, y0: r.x0, x1: r.y1, y1: r.x1 });
  const bb = frame.bbox;
  const cover = base.effectiveCoverMm;
  const datum = opts.datumMm ?? bb.x0;
  if (!isFiniteNumber(datum)) res.problems.push(qty("datum_invalid", "The sheet datum must be a number (mm along the wall)."));
  // HUB 015: a product joint rule (gap + detail, no heights) places the minimum joints itself when the wall is
  // taller than the tallest listed sheet — explicit joint heights always win
  const auto = autoJointRows(opts.jointRows, bb.y0, bb.y1, prod.variants[prod.variants.length - 1]?.lengthMm, allowance, res, ctx.wallId);
  const ruleOnly = (j) => j && typeof j === "object" && !(Array.isArray(j.atMm) && j.atMm.length) && isNonNeg(j.gapMm) && typeof j.detailRef === "string" && !!j.detailRef.trim();
  const jointSpec = auto || (ruleOnly(opts.jointRows) ? undefined : opts.jointRows);   // a rule with no joint needed = one course
  const rows = jointRowBands(jointSpec, bb.y0, bb.y1, res);
  const cols = isFiniteNumber(datum) ? gridBands(bb.x0, bb.x1, datum, cover, 0) : [];
  if (!cols || (rows && cols.length * rows.length > MAX_ELEMENTS_PER_WALL)) {
    res.problems.push(qty("too_many_elements", `${ctx.wallId} would generate more than ${MAX_ELEMENTS_PER_WALL} sheets — split the wall.`));
  }
  if (blocked(res)) return finalise(res, { records, installation });

  const materialId = opts.materialId ?? base.id ?? "material";
  const cells = [], tooTall = [], offcuts = [];
  let layoutCutMm2 = 0, stockMm2 = 0;
  for (const row of rows) {
    for (const col of cols) {
      const rect = { x0: col.zoneStart, x1: col.zoneEnd, y0: row.zoneStart, y1: row.zoneEnd };
      const id = `c${col.index}r${row.index}`;
      const ext = piecesExtent(materialPieces(frame, rect));
      if (!ext) { cells.push({ id, col: col.index, row: row.index, rect: toWall(rect), occupied: false }); continue; }
      const cutW = ext.x1 - ext.x0, cutL = ext.y1 - ext.y0, need = cutL + allowance;
      const v = prod.variants.find((x) => x.lengthMm >= need - EPS_MM);
      cells.push({
        id, col: col.index, row: row.index, rect: toWall(rect), occupied: true, cutWidthMm: cutW, cutLengthMm: cutL, requiredLengthMm: need,
        materialAreaMm2: ext.area, productId: v?.rec.id ?? null, sku: v?.rec.sku ?? null, stockLengthMm: v?.lengthMm ?? null,
      });
      if (!v) { tooTall.push({ cell: id, requiredMm: need, rowStart: row.zoneStart }); continue; }
      const sheetW = v.rec.dimensionsMm.width;
      layoutCutMm2 += ext.area;
      stockMm2 += sheetW * v.lengthMm;
      // offcuts: the length remainder (full sheet width) and the strip ripped off a cut-down cover — the
      // physical lap beyond the effective cover belongs to the installed sheet, never to an offcut
      if (v.lengthMm - cutL > EPS_MM) offcuts.push({ cellId: id, widthMm: sheetW, lengthMm: v.lengthMm - cutL, allocated: false });
      if (cover - cutW > EPS_MM) offcuts.push({ cellId: id, widthMm: cover - cutW, lengthMm: cutL, allocated: false });
      res.demands.push({
        id: demandId(materialId, ctx.wallId, "sheet", id), materialId, role: "sheet", kind: "sheet", unit: "sheet",
        widthMm: cutW, heightMm: cutL, quantity: 1,
        identity: stockIdentity(v.rec, { orientation, unit: "sheet", stockLengthMm: v.lengthMm, stockWidthMm: sheetW }),
        label: `${ctx.wallId} strip ${col.index + 1}${rows.length > 1 ? ` course ${row.index + 1}` : ""} — ${v.rec.sku ?? v.rec.name} ${mm(v.lengthMm)}`,
        sourceRefs: refsFor(ctx, id, toWall(rect)), provenance: "calculated",
      });
    }
  }
  if (tooTall.length) {
    const tallest = prod.variants[prod.variants.length - 1].lengthMm;
    const at = Math.min(...tooTall.map((t) => t.rowStart)) + tallest - allowance;
    res.problems.push(qty("sheet_too_tall", `${ctx.wallId}: ${tooTall.length} cell(s) need up to ${mm(Math.max(...tooTall.map((t) => t.requiredMm)))} but the tallest listed sheet is ${mm(tallest)}. Choose a taller listed sheet or add an explicit joint row with its detail (e.g. at ${mm(at)}) — one sheet per strip is never assumed.`,
      { refs: tooTall.map((t) => ({ wallId: ctx.wallId, cell: t.cell, requiredMm: t.requiredMm })), suggestedJointAtMm: at, listedLengthsMm: prod.variants.map((x) => x.lengthMm) }));
  }

  const joints = [];
  const jointOrientation = vertical ? "horizontal" : "vertical";
  if (rows.length > 1) {
    const spec = jointSpec;
    const identity = accessoryIdentity(`${jointOrientation}-joint`, spec.product, { orientation: jointOrientation, unit: "piece" });
    if (!spec.product) res.problems.push(proc("joint_product_missing", `${ctx.wallId}: the ${jointOrientation} joint accessory product is not selected.`, { blocking: false }));
    rows.slice(0, -1).forEach((row, i) => {
      const spans = jointSpans(frame, row.zoneEnd, spec.gapMm);
      const toRect = (a, b) => toWall({ x0: a, x1: b, y0: row.zoneEnd, y1: row.zoneEnd + spec.gapMm });
      joints.push({ index: i, orientation: jointOrientation, atMm: row.zoneEnd, gapMm: spec.gapMm, detailRef: spec.detailRef ?? null, source: auto ? "auto" : "explicit", segments: spans.map(([a, b]) => ({ startMm: a, endMm: b })) });
      res.demands.push(...lineDemands(ctx, { materialId, role: `${jointOrientation}-joint`, key: `j${i}`, spans, identity, label: `${ctx.wallId} ${jointOrientation} joint ${i + 1}`, toRect }));
    });
  }

  let components = [];
  if (base.family === "eps-cladding") {
    const system = `${base.manufacturer ?? ""} ${base.name ?? ""}`.trim();
    const factory = base.coating === "factory";
    const pending = (group, what) => note("component_unresolved", `${ctx.wallId} ${group}: ${what} — enter a reviewed quantity or the exact system's rule (unknown is not zero).`, { refs: [{ group }] });
    components = componentOutputs(res, ctx, {
      family: "eps-cladding", materialId, reviewed: opts.reviewedComponents,
      groups: [
        { group: "fixings", unresolved: inst("fixing_row_missing", `${ctx.wallId}: no reviewed fixing/washer row is active for ${system} — fixings are unresolved, not zero.`) },
        { group: "joint-treatment", unresolved: pending("joint-treatment", "joint foam/treatment needs the system's joint detail and yield") },
        { group: "mesh", unresolved: pending("mesh", factory
          ? "a factory-coated system may still need joint mesh — its joint detail decides"
          : "mesh coverage policy (full wall vs joint strips) is not selected") },
        { group: "basecoat", ...(factory ? { notRequired: "factory-coated: no site basecoat ordered twice" } : { calculate: () => coatingDemand(res, ctx, { materialId, role: "basecoat", system, panelM2: stockMm2 / 1e6 }) }) },
        { group: "finish-coat", ...(factory ? { notRequired: "factory-coated: finish already applied" } : { calculate: () => coatingDemand(res, ctx, { materialId, role: "finish-coat", system, panelM2: stockMm2 / 1e6 }) }) },
      ],
    });
  }

  // HUB 016: fibre-cement sheets are SHARED across the wall — cut across their length only, long factory edges kept —
  // so the order is the planned stock sheets, never one sheet per cell (a foam system keeps one per cell)
  let cutPlan = null;
  const cellSheets = res.demands.filter((d) => d.role === "sheet");
  if (base.family === "cladding" && cellSheets.length) {
    const byCell = new Map(cells.filter((c) => c.occupied && c.stockLengthMm).map((c) => [c.id, c]));
    const occ = new Set([...byCell.values()].map((c) => `${c.col}:${c.row}`));
    const pieces = [...byCell.values()].map((c) => {
      const left = occ.has(`${c.col - 1}:${c.row}`), right = occ.has(`${c.col + 1}:${c.row}`);
      return { cellId: c.id, widthMm: c.cutWidthMm, lengthMm: c.requiredLengthMm, keep: left && right ? "full" : left ? "left" : right ? "right" : "none" };
    });
    const sheetW = prod.variants[0].rec.dimensionsMm.width;
    const plan = planSheets({ pieces, lengthsMm: prod.variants.map((x) => x.lengthMm), sheetWidthMm: sheetW, coverMm: cover, kerfMm: opts.sheetCut?.kerfMm });
    const demandOfCell = new Map(cellSheets.map((d) => [d.id, d]));
    res.demands = res.demands.filter((d) => d.role !== "sheet");
    stockMm2 = 0;
    const name = (id) => { const c = byCell.get(id); return `strip ${c.col + 1}${rows.length > 1 ? ` course ${c.row + 1}` : ""}`; };
    const fromOffcutOf = new Map(plan.fromOffcut.map((f) => [f.cellId, f.fromCellId]));
    for (const sh of plan.sheets) {
      const v = prod.variants.find((x) => Math.abs(x.lengthMm - sh.stockLengthMm) < EPS_MM) || prod.variants[prod.variants.length - 1];
      const riders = plan.lanes.filter((l) => sh.cellIds.includes(l.fromCellId)).flatMap((l) => l.cellIds);
      const all = [...sh.cellIds, ...riders];
      const refs = all.flatMap((id) => demandOfCell.get(demandId(materialId, ctx.wallId, "sheet", id))?.sourceRefs || []);
      stockMm2 += sheetW * v.lengthMm;
      res.demands.push({
        id: demandId(materialId, ctx.wallId, "sheet", sh.cellIds[0]), materialId, role: "sheet", kind: "sheet", unit: "sheet",
        widthMm: sheetW, heightMm: v.lengthMm, quantity: 1,
        identity: stockIdentity(v.rec, { orientation, unit: "sheet", stockLengthMm: v.lengthMm, stockWidthMm: sheetW }),
        label: `${ctx.wallId} sheet ${sh.id.slice(1)} — ${v.rec.sku ?? v.rec.name} ${mm(v.lengthMm)}: ${all.length > 3 ? `${all.length} pieces` : all.map(name).join(", ")}`,
        sourceRefs: refs, provenance: "calculated",
      });
      for (const id of all) { const c = byCell.get(id); c.sheetId = sh.id; c.source = fromOffcutOf.has(id) ? "offcut" : "sheet"; c.sharedWith = all.filter((x) => x !== id); c.stockLengthMm = v.lengthMm; c.sku = v.rec.sku ?? null; c.productId = v.rec.id ?? null; }
    }
    // what is left: each sheet's end beyond its cuts (full width) and each rip's unused part — listed, never counted as reused
    offcuts.length = 0;
    for (const sh of plan.sheets) if (sh.residualMm > EPS_MM) offcuts.push({ cellId: sh.cellIds[sh.cellIds.length - 1], sheetId: sh.id, widthMm: sheetW, lengthMm: sh.residualMm, allocated: false });
    for (const l of plan.lanes) {
      const left = l.lengthMm - l.usedMm - (l.cellIds.length ? plan.kerfMm : 0);
      if (l.cellIds.length === 0) offcuts.push({ cellId: l.fromCellId, sheetId: byCell.get(l.fromCellId)?.sheetId || null, widthMm: l.widthMm, lengthMm: l.lengthMm, allocated: false, edge: l.edge });
      else if (left > EPS_MM) offcuts.push({ cellId: l.fromCellId, sheetId: byCell.get(l.fromCellId)?.sheetId || null, widthMm: l.widthMm, lengthMm: left, allocated: false, edge: l.edge });
    }
    cutPlan = { kerfMm: plan.kerfMm, sheets: plan.sheets.map((sh) => ({ id: sh.id, stockLengthMm: sh.stockLengthMm, cellIds: sh.cellIds, residualMm: sh.residualMm })),
      fromOffcut: plan.fromOffcut, rejected: plan.rejected };
  }

  const sheets = res.demands.filter((d) => d.role === "sheet");
  const bySku = {};
  for (const d of sheets) bySku[d.identity.sku ?? d.identity.name] = (bySku[d.identity.sku ?? d.identity.name] || 0) + 1;
  res.layout = {
    method, wallId: ctx.wallId, family: base.family, orientation, datumMm: datum, coverMm: cover, heightAllowanceMm: allowance,
    openingPolicy: ctx.policy, lapDirection: opts.lapDirection ?? null, stockLengthsMm: prod.variants.map((x) => x.lengthMm),
    openings: ctx.openings, columns: cols, courses: rows, cells, joints, potentialOffcuts: offcuts, cutPlan, components,
    areas: { grossM2: ctx.areas.grossM2, openingM2: ctx.areas.openingM2, netM2: ctx.areas.netM2, layoutCutM2: layoutCutMm2 / 1e6, stockM2: stockMm2 / 1e6 },
    summary: { sheets: sheets.length, bySku },
  };
  const occupiedCells = cells.filter((c) => c.occupied && c.stockLengthMm).length;
  res.explain.push(cutPlan
    ? `${ctx.wallId}: ${cols.length} strip(s) at ${mm(cover)} effective cover × ${rows.length} course(s) → ${occupiedCells} piece(s) cut from ${sheets.length} sheet(s): sheets are only cut across their length (the long factory edges stay), ${mm(cutPlan.kerfMm)} per saw cut; empty cells use none.`
    : `${ctx.wallId}: ${cols.length} strip(s) at ${mm(cover)} effective cover × ${rows.length} course(s) → ${sheets.length} occupied cell(s) = ${sheets.length} sheet(s); empty cells use none.`,
    `Each piece is its cut + ${mm(allowance)} allowance; a raked strip is sized by its highest point.`,
    cutPlan ? "A ripped strip's offcut keeps its other factory edge, so it is only reused where that edge fits. Spares and pack rounding are applied at purchase level."
      : "No offcut reuse: potential offcuts are listed separately. Spares and pack rounding are applied at purchase level.",
  );
  return finalise(res, { records, installation });
}

// ── C2 / C3: courses and boards ──────────────────────────────────────────────

/** Joint-rule predicates this layout applies; descriptive keys are carried, anything else is refused. */
const JOINT_RULE_KEYS = new Set(["orientation", "mode", "stationsMm", "centresMm", "originMm", "minPieceMm", "factoryEndsAtJoints", "minStaggerMm", "openingClearanceMm"]);
const JOINT_RULE_NOTES = new Set(["id", "ref", "detailRef", "label", "notes", "authority", "source", "reviewer"]);

function readJointRule(j, orientation, profiles, res) {
  if (j === undefined || j === null) return null;
  const rule = objOr(j);
  if (rule.orientation !== orientation) {
    res.problems.push(qty("joint_rule_orientation_mismatch", `This joint rule is for ${rule.orientation ?? "an unstated"} orientation; ${orientation} boards need their own reviewed joint arrangement — joints are never interchangeable between orientations.`));
    return null;
  }
  const unknown = Object.keys(rule).filter((k) => !JOINT_RULE_KEYS.has(k) && !JOINT_RULE_NOTES.has(k));
  if (unknown.length) {
    res.problems.push(qty("joint_rule_unsupported", `This joint rule has predicate(s) the layout cannot apply (${unknown.join(", ")}) — an assembly predicate is never silently ignored; lay the boards out manually.`));
    return null;
  }
  const optNonNeg = (v) => v === undefined || v === null || isNonNeg(v);
  const stationsOk = Array.isArray(rule.stationsMm) && rule.stationsMm.length <= MAX_ELEMENTS_PER_WALL && rule.stationsMm.every(isFiniteNumber);
  const gridOk = isPos(rule.centresMm) && (rule.originMm === undefined || isFiniteNumber(rule.originMm));
  if (!["on-support", "off-support"].includes(rule.mode) || (rule.mode === "on-support" && !stationsOk && !gridOk)
    || !optNonNeg(rule.minPieceMm) || !optNonNeg(rule.minStaggerMm) || !optNonNeg(rule.openingClearanceMm)) {
    res.problems.push(qty("joint_rule_invalid", "A joint rule needs mode on-support (with support stations or centres) or off-support; minimum piece, stagger and opening clearance must be 0 mm or more."));
    return null;
  }
  if (rule.mode === "off-support") {
    const plain = profiles.filter((p) => p.base.endMatched !== true);
    if (plain.length) {
      res.problems.push(qty("off_support_joint_not_permitted", `${plain.map((p) => p.base.name || p.base.id).join(", ")} is not end-matched — off-support joints are only permitted for end-matched products; ordinary boards join over supports.`));
      return null;
    }
  }
  return {
    ...rule, minPieceMm: rule.minPieceMm ?? 0, minStaggerMm: rule.minStaggerMm ?? 0, openingClearanceMm: rule.openingClearanceMm ?? null,
    factoryEndsAtJoints: rule.factoryEndsAtJoints === true,
  };
}

/**
 * Divide one required run [a, b] into board pieces at PERMITTED joints only. `forbidden` lists open
 * intervals where no joint may fall (stagger against the adjacent course, clearance around openings).
 * Returns { pieces: [{ start, end, startEnd, endEnd }] } or { reason } when no legal layout exists.
 */
function splitRun(a, b, maxStock, stockLengths, rule, bbStart, forbidden) {
  const L = b - a;
  if (L <= maxStock + EPS_MM) return { pieces: [{ start: a, end: b, startEnd: "cut", endEnd: "cut" }] };
  if (!rule) return { reason: "no-joint-rule" };
  const min = rule.minPieceMm;
  const isStock = (len) => stockLengths.some((s) => Math.abs(s - len) <= EPS_MM);
  const allowed = (s) => !forbidden.some(([z0, z1]) => s > z0 + EPS_MM && s < z1 - EPS_MM);
  let points = null;
  if (rule.mode === "off-support") {
    // End-matched: joints anywhere outside the forbidden zones; joint-to-joint pieces are whole boards and
    // the first/last share the remainder. The first piece f is the largest legal value (deterministic).
    const n0 = Math.ceil((L - EPS_MM) / maxStock);
    for (let n = n0; n <= n0 + 2 && !points; n++) {
      const R = L - (n - 2) * maxStock;
      const lo = Math.max(min, EPS_MM, R - maxStock), hi = Math.min(maxStock, R - Math.max(min, EPS_MM));
      if (hi < lo - EPS_MM) continue;
      let free = [[lo, Math.max(lo, hi)]];
      for (const [z0, z1] of forbidden) {
        for (let i = 0; i <= n - 2; i++) {
          const c0 = z0 - a - i * maxStock, c1 = z1 - a - i * maxStock;
          free = free.flatMap(([s, e]) => [[s, Math.min(e, c0)], [Math.max(s, c1), e]].filter(([u, v]) => v >= u));
        }
      }
      if (!free.length) continue;
      const f = Math.max(...free.map(([, e]) => e));
      points = [a, ...Array.from({ length: n - 1 }, (_, i) => a + f + i * maxStock), b];
    }
  } else {
    let stations = rule.stationsMm;
    if (!Array.isArray(stations)) {
      const origin = rule.originMm ?? bbStart, c = rule.centresMm;
      if (L / c > MAX_ELEMENTS_PER_WALL) return { reason: "too-many-stations" };
      stations = [];
      for (let i = Math.ceil((a - origin) / c); origin + i * c < b; i++) stations.push(origin + i * c);
    }
    const inside = stations.filter((s) => s > a + EPS_MM && s < b - EPS_MM && allowed(s));
    const P = [a, ...[...new Set(inside)].sort((x, y) => x - y), b];
    const best = P.map(() => Infinity), prev = P.map(() => -1);
    best[0] = 0;
    for (let i = 1; i < P.length; i++) {
      for (let j = i - 1; j >= 0; j--) {
        const len = P[i] - P[j];
        if (len > maxStock + EPS_MM) break;
        if (len < min - EPS_MM || best[j] + 1 >= best[i]) continue;
        if (rule.factoryEndsAtJoints && j > 0 && i < P.length - 1 && !isStock(len)) continue;
        best[i] = best[j] + 1; prev[i] = j;
      }
    }
    if (best[P.length - 1] < Infinity) {
      points = [];
      for (let i = P.length - 1; i >= 0; i = prev[i]) { points.unshift(P[i]); if (i === 0) break; }
    }
  }
  if (!points) return { reason: "no-legal-joint" };
  const jointEnd = rule.factoryEndsAtJoints ? "joint-factory" : "joint";
  return {
    pieces: points.slice(0, -1).map((s, i) => ({ start: s, end: points[i + 1], startEnd: i === 0 ? "cut" : jointEnd, endEnd: i === points.length - 2 ? "cut" : jointEnd })),
  };
}

/**
 * course_layout@1 — horizontal courses (C2) or vertical boards (C3) on one wall.
 * Courses stack from the datum by EFFECTIVE cover (a repeating `sequence` supports mixed widths, the last
 * course cut). Per course: material in the band is projected onto the length axis — only an opening that
 * spans the full band removes length; partial-height openings notch a board. Runs longer than the longest
 * board are divided only at joints the explicit rule permits (orientation-specific; off-support joints
 * only for end-matched products) and its predicates allow — minimum piece, support stations, factory ends,
 * stagger from the adjacent course's joints and clearance around openings — else needs-layout. Stagger is
 * resolved course by course (greedy), so an infeasible course reports needs-layout rather than guessing.
 * One board per piece (no sharing by default).
 * @param {object} wall  buildWall result
 * @param {object[]} openings raw openings
 * @param {object|object[]|{ sequence: Array<object|object[]> }} product board record, length variants of one
 *   board, or a repeating sequence of profiles (bottom/left first)
 * @param {{ orientation: "horizontal"|"vertical", materialId?: string, wallId?: string, datumMm?: number,
 *   openingPolicy?: "geometry"|"none", installation?: object,
 *   joints?: { orientation: "horizontal"|"vertical", mode: "on-support"|"off-support", stationsMm?: number[],
 *     centresMm?: number, originMm?: number, minPieceMm?: number, factoryEndsAtJoints?: boolean,
 *     minStaggerMm?: number, openingClearanceMm?: number } }} opts
 */
export function courseLayout(wall, openings, product, rawOpts) {
  const method = CLADDING_METHODS.COURSE;
  const opts = objOr(rawOpts);
  const res = emptyResult();
  const ctx = prepare(wall, openings, opts, res);
  const families = ["cladding", "timber", "timber-cladding"];
  const seq = product && !Array.isArray(product) && Array.isArray(product.sequence) ? product.sequence : [product];
  const profiles = seq.map((p) => readVariants(p, { families, requireCover: true, method }));
  for (const p of profiles) res.problems.push(...p.problems);
  if (!seq.length) res.problems.push(qty("product_missing", "Choose the board profile(s) before calculating."));
  const records = profiles.flatMap((p) => p.variants.map((v) => v.rec));
  const orientation = opts.orientation;
  const installation = installationFor(opts, method, records, res, orientation);
  if (!["horizontal", "vertical"].includes(orientation)) {
    res.problems.push(qty("orientation_required", "Choose horizontal courses or vertical boards — each has its own installation assembly."));
  }
  for (const p of profiles) {
    if (p.base && Array.isArray(p.base.permittedOrientations) && !p.base.permittedOrientations.includes(orientation)) {
      res.problems.push(qty("orientation_not_permitted", `${p.base.name} is not listed for ${orientation} installation.`));
    }
  }
  if (!ctx || blocked(res)) return finalise(res, { records, installation });
  const rule = readJointRule(opts.joints, orientation, profiles, res);
  const horizontal = orientation === "horizontal";
  const frame = horizontal ? ctx.surface : transposeSurface(ctx.surface);
  const toWall = (r) => (horizontal ? r : { x0: r.y0, y0: r.x0, x1: r.y1, y1: r.x1 });
  const bb = frame.bbox;
  const datum = opts.datumMm ?? bb.y0;
  if (!isFiniteNumber(datum) || datum > bb.y0 + EPS_MM) {
    res.problems.push(qty("datum_above_base", "The course datum must be at or below the clad base (courses stack up from it)."));
  }
  if (blocked(res)) return finalise(res, { records, installation });

  const covers = profiles.map((p) => p.base.effectiveCoverMm);
  const pattern = covers.reduce((s, c) => s + c, 0);
  const prefix = covers.map((_, i) => covers.slice(0, i).reduce((s, c) => s + c, 0));
  const startOf = (k) => datum + Math.floor(k / covers.length) * pattern + prefix[k % covers.length];
  const materialId = opts.materialId ?? profiles[0].base.id ?? "material";
  const role = horizontal ? "course-board" : "vertical-board";
  const courses = [], needsLayout = [], jointsByCourse = new Map();
  let elements = 0, cutMm = 0, stockMm = 0;
  let k = Math.max(0, Math.floor((bb.y0 - datum) / pattern) * covers.length);
  for (; startOf(k) < bb.y1 - EPS_MM; k++) {
    const prof = profiles[k % covers.length];
    const ya = startOf(k), yb = ya + prof.base.effectiveCoverMm;
    if (yb <= bb.y0 + EPS_MM) continue;
    if (++elements > MAX_ELEMENTS_PER_WALL) break;
    const pieces = materialPieces(frame, { x0: bb.x0, x1: bb.x1, y0: ya, y1: yb });
    const course = { index: k, axis: horizontal ? "y" : "x", bandStartMm: ya, bandEndMm: yb, coverMm: prof.base.effectiveCoverMm, profileId: prof.base.id ?? null, segments: [] };
    courses.push(course);
    const ext = piecesExtent(pieces);
    if (!ext) { course.empty = true; continue; }
    course.baseCutMm = ext.y0 - ya > EPS_MM ? ext.y0 - ya : 0;
    course.topCutMm = yb - ext.y1 > EPS_MM ? yb - ext.y1 : 0;
    course.notchOpeningIds = frame.holes.filter((h) => h.y0 < yb - EPS_MM && h.y1 > ya + EPS_MM && (h.y0 > ya + EPS_MM || h.y1 < yb - EPS_MM)).map((h) => h.id);
    const maxStock = prof.variants[prof.variants.length - 1].lengthMm;
    const forbidden = !rule ? [] : [
      ...(rule.minStaggerMm > 0 ? (jointsByCourse.get(k - 1) || []).map((J) => [J - rule.minStaggerMm, J + rule.minStaggerMm]) : []),
      ...(rule.openingClearanceMm === null ? [] : frame.holes.filter((h) => h.y0 < yb - EPS_MM && h.y1 > ya + EPS_MM)
        .map((h) => [h.x0 - rule.openingClearanceMm, h.x1 + rule.openingClearanceMm])),
    ];
    const joints = [];
    jointsByCourse.set(k, joints);
    for (const [si, [a, b]] of projectIntervals(pieces, "x").entries()) {
      const split = splitRun(a, b, maxStock, prof.variants.map((v) => v.lengthMm), rule, bb.x0, forbidden);
      const segment = { startMm: a, endMm: b, lengthMm: b - a, pieces: [] };
      course.segments.push(segment);
      if (!split.pieces) { needsLayout.push({ wallId: ctx.wallId, course: k, startMm: a, endMm: b, reason: split.reason }); continue; }
      elements += split.pieces.length;
      split.pieces.forEach((p, pi) => {
        const len = p.end - p.start;
        const v = prof.variants.find((x) => x.lengthMm >= len - EPS_MM);
        const pid = `k${k}s${si}p${pi}`;
        if (p.startEnd !== "cut") joints.push(p.start);
        cutMm += len;
        stockMm += v.lengthMm;
        segment.pieces.push({ id: pid, startMm: p.start, endMm: p.end, lengthMm: len, startEnd: p.startEnd, endEnd: p.endEnd, sku: v.rec.sku ?? null, stockLengthMm: v.lengthMm });
        res.demands.push({
          id: demandId(materialId, ctx.wallId, role, pid), materialId, role, kind: "linear", unit: "piece", lengthMm: len, quantity: 1, lengthKind: "cut",
          identity: stockIdentity(v.rec, { orientation, unit: "piece", stockLengthMm: v.lengthMm, stockWidthMm: v.rec.dimensionsMm.width }),
          stockPolicy: { kind: "fixed", lengthMm: v.lengthMm, sharePieces: false }, noSplice: true,
          label: `${ctx.wallId} ${horizontal ? "course" : "board column"} ${k + 1} piece ${pi + 1} — ${mm(len)} from ${v.rec.sku ?? v.rec.name} ${mm(v.lengthMm)}`,
          sourceRefs: refsFor(ctx, pid, toWall({ x0: p.start, x1: p.end, y0: ya, y1: yb })), provenance: "calculated",
        });
      });
    }
  }
  if (elements > MAX_ELEMENTS_PER_WALL) res.problems.push(qty("too_many_elements", `${ctx.wallId} would generate more than ${MAX_ELEMENTS_PER_WALL} courses/boards — split the wall.`));
  if (needsLayout.length) {
    res.problems.push(qty("needs_layout", `${ctx.wallId}: ${needsLayout.length} run(s) are longer than the longest listed board and no permitted joint position exists — add the reviewed joint rule for this orientation or lay the boards out manually.`, { refs: needsLayout }));
  }
  const counted = courses.filter((c) => !c.empty).length;
  res.layout = {
    method, wallId: ctx.wallId, orientation, datumMm: datum, openingPolicy: ctx.policy, jointRule: rule,
    sequence: profiles.map((p) => ({ productId: p.base.id ?? null, coverMm: p.base.effectiveCoverMm, stockLengthsMm: p.variants.map((v) => v.lengthMm) })),
    openings: ctx.openings, courses,
    areas: { grossM2: ctx.areas.grossM2, openingM2: ctx.areas.openingM2, netM2: ctx.areas.netM2 },
    summary: { courses: counted, boards: res.demands.length, cutLm: cutMm / 1000, stockLm: stockMm / 1000 },
  };
  res.explain.push(
    `${ctx.wallId}: ${counted} ${horizontal ? "course(s)" : "board column(s)"} at effective cover ${covers.map(mm).join(" / ")} from the datum (conservative ceil(clad extent / cover); nominal width is never used).`,
    "Only an opening spanning a full course band removes length; partial openings notch the board.",
    rule ? `Long runs divide only at ${rule.mode} joints${rule.factoryEndsAtJoints ? " with factory ends" : ""}${rule.minStaggerMm > 0 ? `, staggered ≥ ${mm(rule.minStaggerMm)} from the adjacent course` : ""}${rule.openingClearanceMm === null ? "" : `, ≥ ${mm(rule.openingClearanceMm)} clear of openings`}.` : "No joint rule: runs longer than the longest board need layout.",
    "One board per piece — no cross-course reuse until a cut plan allocates it.",
  );
  return finalise(res, { records, installation });
}

// ── C4: Matrix expressed-joint grid ─────────────────────────────────────────

/**
 * panel_grid@1 — expressed-joint panel grid (Matrix). Per axis the panel count is ceil((W+g)/(p+g)) with
 * no automatic outer joint; boundary panels are trimmed to the extent. Occupied cells consume one panel.
 * Cut or edge-in-joint strips are flagged for minimum-piece / edge-fixing review; joint lines between
 * panels become demands (backing strips / joint accessories) and layout routes for supports and sealant.
 * @param {object} wall  buildWall result
 * @param {object[]} openings raw openings
 * @param {object} product one panel record (catalogue shape)
 * @param {{ jointGapMm: number, orientation?: "portrait"|"landscape", boundaryGaps?: "none"|"both",
 *   originXMm?: number, originYMm?: number, minStripMm?: number, materialId?: string, wallId?: string,
 *   openingPolicy?: "geometry"|"none", installation?: object,
 *   jointProducts?: { horizontal?: object, vertical?: object } }} opts
 */
export function panelGrid(wall, openings, product, rawOpts) {
  const method = CLADDING_METHODS.GRID;
  const opts = objOr(rawOpts);
  const res = emptyResult();
  const ctx = prepare(wall, openings, opts, res);
  const prod = Array.isArray(product) && product.length > 1
    ? { variants: [], problems: [qty("mixed_product_variants", "A panel grid uses one panel format — choose one SKU.")] }
    : readVariants(product, { families: ["cladding"], requireCover: false, method });
  res.problems.push(...prod.problems);
  const records = prod.variants.map((v) => v.rec);
  const installation = installationFor(opts, method, records, res);
  const base = prod.base;
  const g = opts.jointGapMm;
  if (!isNonNeg(g)) res.problems.push(qty("joint_gap_required", "Enter the expressed-joint width from the selected assembly — it is never defaulted or added to the panel size."));
  const boundary = opts.boundaryGaps ?? "none";
  if (!["none", "both"].includes(boundary)) res.problems.push(qty("boundary_gaps_invalid", "Boundary gap convention must be none or both."));
  let orientation = opts.orientation;
  if (base) {
    const d = base.dimensionsMm;
    if (orientation === undefined && d.width === d.length) orientation = "portrait";
    const listed = Array.isArray(base.permittedOrientations) ? base.permittedOrientations : null;
    if (!["portrait", "landscape"].includes(orientation)) res.problems.push(qty("orientation_required", "Choose portrait or landscape panels."));
    else if (d.width !== d.length && (listed ? !listed.includes(orientation) : orientation === "landscape")) {
      res.problems.push(qty("orientation_not_permitted", `${base.name} is not listed for ${orientation} installation.`));
    }
  }
  if (opts.minStripMm !== undefined && !isNonNeg(opts.minStripMm)) res.problems.push(qty("min_strip_invalid", "Minimum strip must be 0 mm or more."));
  if (!ctx || !base || blocked(res)) return finalise(res, { records, installation });

  const portrait = orientation === "portrait";
  const pw = portrait ? base.dimensionsMm.width : base.dimensionsMm.length;
  const ph = portrait ? base.dimensionsMm.length : base.dimensionsMm.width;
  const s = ctx.surface, bb = s.bbox, inset = boundary === "both" ? g : 0;
  const xs = bb.x0 + inset, xe = bb.x1 - inset, ys = bb.y0 + inset, ye = bb.y1 - inset;
  const ox = opts.originXMm ?? xs, oy = opts.originYMm ?? ys;
  if (xe - xs <= EPS_MM || ye - ys <= EPS_MM || !isFiniteNumber(ox) || !isFiniteNumber(oy)) {
    res.problems.push(qty("grid_invalid", `${ctx.wallId}: the grid origin or boundary gaps leave no panel area.`));
    return finalise(res, { records, installation });
  }
  const cols = gridBands(xs, xe, ox, pw, g), rows = gridBands(ys, ye, oy, ph, g);
  if (!cols || !rows || cols.length * rows.length > MAX_ELEMENTS_PER_WALL) {
    res.problems.push(qty("too_many_elements", `${ctx.wallId} would generate more than ${MAX_ELEMENTS_PER_WALL} panels — split the wall.`));
    return finalise(res, { records, installation });
  }
  const materialId = opts.materialId ?? base.id ?? "material";
  const minStrip = opts.minStripMm ?? null;
  const cells = [], review = [], narrow = [];
  let layoutCutMm2 = 0;
  for (const row of rows) {
    for (const col of cols) {
      const rect = { x0: col.zoneStart, x1: col.zoneEnd, y0: row.zoneStart, y1: row.zoneEnd };
      const id = `c${col.index}r${row.index}`;
      const ext = piecesExtent(materialPieces(s, rect));
      const cut = ext ? cellCut(s, rect, ext) : null;
      cells.push({ id, col: col.index, row: row.index, rect, occupied: !!ext, colKind: col.kind, rowKind: row.kind, cutWidthMm: ext ? ext.x1 - ext.x0 : 0, cutHeightMm: ext ? ext.y1 - ext.y0 : 0, cut: cut?.reason ?? null });
      if (!ext) continue;
      layoutCutMm2 += ext.area;
      if (cut) {
        const ref = { wallId: ctx.wallId, cell: id, ...cut };
        if (cut.reason === "irregular" || minStrip === null) review.push(ref);
        else if (cut.minWidthMm < minStrip - EPS_MM) narrow.push(ref);
      }
      res.demands.push({
        id: demandId(materialId, ctx.wallId, "panel", id), materialId, role: "panel", kind: "sheet", unit: "sheet",
        widthMm: ext.x1 - ext.x0, heightMm: ext.y1 - ext.y0, quantity: 1,
        identity: stockIdentity(base, { orientation, unit: "sheet", stockLengthMm: base.dimensionsMm.length, stockWidthMm: base.dimensionsMm.width }),
        label: `${ctx.wallId} panel col ${col.index + 1} row ${row.index + 1}${col.kind !== "full" || row.kind !== "full" ? " (cut)" : ""}`,
        sourceRefs: refsFor(ctx, id, rect), provenance: "calculated",
      });
    }
  }
  const flagOpts = { minStripMm: opts.minStripMm, wallId: ctx.wallId, gapMm: g, what: "panel" };
  res.problems.push(...stripFlags(cols, { ...flagOpts, axis: "width" }), ...stripFlags(rows, { ...flagOpts, axis: "height" }));
  if (review.length) {
    res.problems.push(inst("cut_panel_needs_review", `${ctx.wallId}: ${review.length} panel(s) are cut by the wall outline or openings${minStrip === null ? " and no minimum strip is entered" : " (raked/stepped pieces)"} — they need the minimum-piece and edge-fixing check; fitting is not proof of installability.`, { refs: review }));
  }
  if (narrow.length) {
    res.problems.push(inst("narrow_strip", `${ctx.wallId}: ${narrow.length} panel(s) cut around the outline or openings leave material narrower than the ${mm(minStrip)} minimum — review the detail.`, { refs: narrow }));
  }

  const joints = [];
  const T = transposeSurface(s);
  for (const [orient, bands, surf, toRect] of [
    ["vertical", cols, T, (at) => (a, b) => ({ x0: at, x1: at + g, y0: a, y1: b })],
    ["horizontal", rows, s, (at) => (a, b) => ({ x0: a, x1: b, y0: at, y1: at + g })],
  ]) {
    const jp = opts.jointProducts?.[orient];
    if (bands.length > 1 && !jp) res.problems.push(proc("joint_product_missing", `${ctx.wallId}: the ${orient} joint backing/accessory product is not selected.`, { blocking: false }));
    const identity = accessoryIdentity(`${orient}-joint`, jp, { orientation: orient, unit: "piece" });
    bands.slice(0, -1).forEach((band, i) => {
      const at = band.panelEnd;
      const spans = jointSpans(surf, at, g);
      joints.push({ orientation: orient, index: i, atMm: at, gapMm: g, segments: spans.map(([a, b]) => ({ startMm: a, endMm: b })) });
      res.demands.push(...lineDemands(ctx, { materialId, role: `${orient}-joint`, key: `${orient[0]}${i}`, spans, identity, label: `${ctx.wallId} ${orient} joint ${i + 1}`, toRect: toRect(at) }));
    });
  }
  const panels = res.demands.filter((d) => d.role === "panel").length;
  res.layout = {
    method, wallId: ctx.wallId, openingPolicy: ctx.policy, openings: ctx.openings,
    grid: { productId: base.id ?? null, sku: base.sku ?? null, orientation, panelWidthMm: pw, panelHeightMm: ph, jointGapMm: g, boundaryGaps: boundary, originXMm: ox, originYMm: oy, columns: cols, rows },
    cells, joints,
    areas: { grossM2: ctx.areas.grossM2, openingM2: ctx.areas.openingM2, netM2: ctx.areas.netM2, layoutCutM2: layoutCutMm2 / 1e6, stockM2: (panels * pw * ph) / 1e6 },
    summary: { columns: cols.length, rows: rows.length, panels },
  };
  res.explain.push(
    `${ctx.wallId}: ${cols.length} column(s) × ${rows.length} row(s) of ${mm(pw)} × ${mm(ph)} panels with ${mm(g)} joints (ceil((W+g)/(p+g)) per axis, boundary gaps: ${boundary}) → ${panels} occupied cell(s) = ${panels} panel(s).`,
    "A boundary strip is never assumed installable just because it fits — cut and narrow strips need the minimum-piece / edge-fixing check.",
  );
  return finalise(res, { records, installation });
}

// ── C5: AAC panels ───────────────────────────────────────────────────────────

/**
 * aac_panel_layout@1 — vertical AAC panels for ONE manufacturer + wall system (e.g. Walsc External Wall
 * System 50 or Hebel PowerPanel50; never mixed). Columns = physical panel width + the system's approved
 * adhesive joint (a required system parameter, not a movement gap); control joints break the grid. Each
 * column's separate runs (split only by full-width openings) take one whole panel each — no offcut reuse,
 * no inferred lintels. Rails, fixings, adhesive, mesh, control-joint materials, reinforcement treatment and
 * coating are separate outputs: calculated from reviewed input, reviewed manual, or explicitly unresolved.
 * @param {object} wall  buildWall result
 * @param {object[]} openings raw openings
 * @param {object|object[]} product AAC record, or length variants of one system/thickness
 * @param {{ adhesiveJointMm: number, orientation?: "vertical", minStripMm?: number,
 *   controlJoints?: { atMm: number[], widthMm: number, product?: object },
 *   rails?: { atMm: number[], authority: { ref: string, reviewer: string }, product?: object },
 *   reviewedComponents?: Array<{ group: string, id?: string, quantity?: number, unit?: string, scope?: "not-required"|"by-others"|"excluded",
 *     identity?: object, authority: { ref: string, reviewer: string } }>,
 *   materialId?: string, wallId?: string, openingPolicy?: "geometry"|"none", installation?: object }} opts
 */
export function aacPanelLayout(wall, openings, product, rawOpts) {
  const method = CLADDING_METHODS.AAC;
  const opts = objOr(rawOpts);
  const res = emptyResult();
  const ctx = prepare(wall, openings, opts, res);
  const prod = readVariants(product, { families: ["aac"], requireCover: false, method, mixedCode: "mixed_aac_systems" });
  res.problems.push(...prod.problems);
  const records = prod.variants.map((v) => v.rec);
  const installation = installationFor(opts, method, records, res, opts.orientation ?? "vertical");
  const base = prod.base;
  if ((opts.orientation ?? "vertical") !== "vertical") {
    res.problems.push(qty("aac_orientation_requires_detail", "Horizontal AAC panels need the system's exact horizontal-installation detail or reviewed manual quantities."));
  }
  const adhesive = opts.adhesiveJointMm;
  if (!isNonNeg(adhesive)) {
    res.problems.push(qty("adhesive_joint_required", "Enter the system's approved adhesive/joint width — it is a system parameter, not an automatic 10 mm movement gap."));
  }
  if (opts.minStripMm !== undefined && !isNonNeg(opts.minStripMm)) res.problems.push(qty("min_strip_invalid", "Minimum strip must be 0 mm or more."));
  const cj = opts.controlJoints;
  const bb = ctx?.surface.bbox;
  if (cj && bb && (!strictlyInside(cj.atMm, bb.x0, bb.x1) || !isNonNeg(cj.widthMm))) {
    res.problems.push(qty("control_joints_invalid", "Control joints need positions inside the wall and the system's joint width."));
  }
  if (!ctx || !base || blocked(res)) return finalise(res, { records, installation });

  const system = `${base.manufacturer ?? ""} ${base.name ?? ""}`.trim();
  const width = base.dimensionsMm.width;
  const cjs = cj ? [...cj.atMm].sort((a, b) => a - b) : [];
  const cjCuts = cjs.map((x) => [x - cj.widthMm / 2, x + cj.widthMm / 2]);
  const segments = subtractIntervals([[bb.x0, bb.x1]], cjCuts);
  const materialId = opts.materialId ?? base.id ?? "material";
  const columns = [], tooTall = [], detailCols = [];
  let elements = 0, panelMm2 = 0, layoutCutMm2 = 0;
  for (const [si, [x0, x1]] of segments.entries()) {
    const bands = gridBands(x0, x1, x0, width, adhesive);
    elements += bands ? bands.length : Infinity;
    if (elements > MAX_ELEMENTS_PER_WALL) {
      res.problems.push(qty("too_many_elements", `${ctx.wallId} would generate more than ${MAX_ELEMENTS_PER_WALL} panels — split the wall.`));
      return finalise(res, { records, installation });
    }
    res.problems.push(...stripFlags(bands, { axis: "width", minStripMm: opts.minStripMm, wallId: ctx.wallId, gapMm: adhesive, what: "panel" }));
    for (const col of bands) {
      const rect = { x0: col.zoneStart, x1: col.zoneEnd, y0: bb.y0, y1: bb.y1 };
      const pieces = materialPieces(ctx.surface, rect);
      const runs = projectIntervals(pieces, "y");
      const column = { segment: si, index: col.index, kind: col.kind, zoneStartMm: col.zoneStart, zoneEndMm: col.zoneEnd, panels: [] };
      columns.push(column);
      const atOpenings = ctx.surface.holes.filter((h) => h.x0 < col.zoneEnd && h.x1 > col.zoneStart).map((h) => h.id);
      if (runs.length && atOpenings.length) detailCols.push({ wallId: ctx.wallId, segment: si, column: col.index, openingIds: atOpenings });
      runs.forEach(([a, b], pi) => {
        const len = b - a;
        const ext = piecesExtent(pieces.filter((p) => p.y0 >= a - EPS_MM && p.y1 <= b + EPS_MM));
        const v = prod.variants.find((x) => x.lengthMm >= len - EPS_MM);
        const id = `s${si}c${col.index}p${pi}`;
        column.panels.push({ id, startMm: a, endMm: b, lengthMm: len, cutWidthMm: ext.x1 - ext.x0, sku: v?.rec.sku ?? null, stockLengthMm: v?.lengthMm ?? null });
        if (!v) { tooTall.push({ wallId: ctx.wallId, cell: id, requiredMm: len }); return; }
        panelMm2 += width * v.lengthMm;
        layoutCutMm2 += ext.area;
        res.demands.push({
          id: demandId(materialId, ctx.wallId, "aac-panel", id), materialId, role: "aac-panel", kind: "sheet", unit: "sheet",
          widthMm: ext.x1 - ext.x0, heightMm: len, quantity: 1,
          identity: stockIdentity(v.rec, { orientation: "vertical", unit: "sheet", stockLengthMm: v.lengthMm, stockWidthMm: width }),
          label: `${ctx.wallId} AAC panel ${id} — ${mm(len)} from ${v.rec.sku ?? v.rec.name} ${mm(v.lengthMm)}`,
          sourceRefs: refsFor(ctx, id, { x0: col.zoneStart, x1: col.zoneEnd, y0: a, y1: b }), provenance: "calculated",
        });
      });
    }
  }
  if (tooTall.length) {
    res.problems.push(qty("panel_too_tall", `${ctx.wallId}: ${tooTall.length} panel run(s) are longer than the longest listed ${system} panel (${mm(prod.variants[prod.variants.length - 1].lengthMm)}) — stacking needs the system's exact horizontal-joint detail.`, { refs: tooTall }));
  }
  if (detailCols.length) {
    res.problems.push(inst("opening_panel_detail_required", `${ctx.wallId}: panels at openings in ${detailCols.length} column(s) are counted as whole panels (cut, or separate above/below) — head/sill/jamb support needs the system's exact detail (no lintel is inferred).`, { refs: detailCols }));
  }

  const T = transposeSurface(ctx.surface);
  const pending = (group, what) => note("component_unresolved", `${ctx.wallId} ${group}: ${what} — enter a reviewed quantity (unknown is not zero).`, { refs: [{ group }] });
  const railsCalc = () => {
    const r = opts.rails;
    if (!r) return null;
    if (!strictlyInside(r.atMm, bb.y0, bb.y1) || !r.authority?.ref || !r.authority?.reviewer) {
      res.problems.push(note("rails_layout_invalid", "A rail layout needs row heights inside the wall plus the reviewed source reference and reviewer."));
      return null;
    }
    const identity = accessoryIdentity("rail", r.product, { orientation: "horizontal", unit: "piece" });
    if (!r.product) res.problems.push(proc("joint_product_missing", `${ctx.wallId}: the ${system} rail product is not selected.`, { blocking: false }));
    return r.atMm.flatMap((y, i) => lineDemands(ctx, {
      materialId, role: "rail", key: `r${i}`, spans: subtractIntervals(lineSpans(ctx.surface, y), cjCuts), identity,
      label: `${ctx.wallId} rail @ ${mm(y)} (${r.authority.ref})`, toRect: (a, b) => ({ x0: a, x1: b, y0: y, y1: y }),
    }));
  };
  const cjCalc = () => {
    if (!cjs.length) return null;
    const identity = accessoryIdentity("control-joint", cj.product, { orientation: "vertical", unit: "piece" });
    if (!cj.product) res.problems.push(proc("joint_product_missing", `${ctx.wallId}: the ${system} control-joint material is not selected.`, { blocking: false }));
    return cjs.flatMap((x, i) => lineDemands(ctx, {
      materialId, role: "control-joint", key: `cj${i}`, spans: lineSpans(T, x), identity,
      label: `${ctx.wallId} control joint @ ${mm(x)}`, toRect: (a, b) => ({ x0: x, x1: x, y0: a, y1: b }),
    }));
  };
  const components = componentOutputs(res, ctx, {
    family: "aac", materialId, reviewed: opts.reviewedComponents,
    groups: [
      { group: "rails", calculate: railsCalc, unresolved: note("rails_unresolved", `${ctx.wallId}: ${system} rail spacing is not seeded — enter a reviewed rail layout (rows + authority) or a reviewed rail quantity.`) },
      { group: "fixings", unresolved: inst("fixing_row_missing", installation.rule
        ? `${ctx.wallId}: the selected ${system} row is active but its fixing quantity has not been applied — enter a reviewed quantity.`
        : `${ctx.wallId}: no reviewed fixing row is active for ${system} — fixings are unresolved (not zero) until the exact current guide row is reviewed.`) },
      { group: "adhesive", unresolved: pending("adhesive", "bags need the system's reviewed yield; the adhesive joint width sets the layout only") },
      { group: "mesh", unresolved: pending("mesh", "mesh needs the selected coating system's coverage policy") },
      { group: "control-joint", calculate: cjCalc, unresolved: inst("control_joints_not_entered", `${ctx.wallId}: no control joints entered — confirm movement-joint positions from the ${system} guide (limits are never inferred).`) },
      { group: "reinforcement-treatment", unresolved: pending("reinforcement-treatment", "cut-reinforcement treatment needs the system's reviewed yield") },
      { group: "coating", calculate: () => coatingDemand(res, ctx, { materialId, role: "coating", system, panelM2: panelMm2 / 1e6 }) },
    ],
  });
  const panels = res.demands.filter((d) => d.role === "aac-panel").length;
  res.layout = {
    method, wallId: ctx.wallId, system, manufacturer: base.manufacturer ?? null, panelWidthMm: width, adhesiveJointMm: adhesive,
    controlJoints: cjs.map((x) => ({ atMm: x, widthMm: cj.widthMm })), openingPolicy: ctx.policy, openings: ctx.openings,
    stockLengthsMm: prod.variants.map((x) => x.lengthMm), columns, components,
    areas: { grossM2: ctx.areas.grossM2, openingM2: ctx.areas.openingM2, netM2: ctx.areas.netM2, layoutCutM2: layoutCutMm2 / 1e6, panelM2: panelMm2 / 1e6 },
    summary: { panels },
  };
  res.explain.push(
    `${ctx.wallId}: ${system} ${mm(width)} panels + ${mm(adhesive)} approved adhesive joint across ${segments.length} control-joint segment(s) → ${panels} whole panel(s), shortest listed length per run.`,
    "Conservative: whole panels, no offcut reuse, no inferred lintels; unknown rails/fixings/adhesive/mesh/treatment stay unresolved.",
    `Coating is the net finish area (${m2(ctx.areas.netM2)}), not ordered panel area.`,
  );
  return finalise(res, { records, installation });
}

// ── C6: timber area → LM ─────────────────────────────────────────────────────

/** Product families area_to_linear@2 accepts (random-length timber supply only). */
const AREA_FAMILIES = Object.freeze(["timber-cladding", "timber"]);

/**
 * area_to_linear@2 — random-length timber cladding estimate (C6).
 *   baseLM = netArea / effectiveCover(m);  withSpare = baseLM × (1 + spareRate);
 *   orderLM = ceil(withSpare / orderIncrementM) × orderIncrementM.
 * Effective cover is used directly — no further lap is ever deducted. Always an ESTIMATE, never a board
 * count; a missing supplier increment blocks ordering. A product's own cover is used unless a differing
 * entered cover is marked as an explicit job override. Only timber products (or no product, with an
 * entered cover) — sheets, panels and AAC are never converted to LM.
 * @param {{ netAreaM2: number, coverMm?: number, spareRate?: number, orderIncrementM?: number, product?: object,
 *   coverOverride?: boolean, materialId?: string, sourceId?: string, sourceRefs?: object[], orientation?: string }} input
 */
export function areaToLinear(rawInput) {
  const method = CLADDING_METHODS.AREA;
  const input = objOr(rawInput);
  const res = emptyResult();
  const { netAreaM2, spareRate = 0, orderIncrementM, product = null } = input;
  if (product !== null && !AREA_FAMILIES.includes(product?.family)) {
    res.problems.push(qty("wrong_family", `${product?.name ?? product?.id ?? "This product"} is not a random-length timber board — sheets, panels and fixed-length boards are counted by their own layout, never as LM.`));
  }
  const sourceRefs = input.sourceRefs?.length ? input.sourceRefs : [{ role: "area", ...(input.sourceId ? { measurementId: input.sourceId } : {}) }];
  const productCover = product?.effectiveCoverMm;
  const coverMm = input.coverMm ?? productCover;
  if (isPos(productCover) && isPos(input.coverMm) && Math.abs(productCover - input.coverMm) > EPS_MM && input.coverOverride !== true) {
    res.problems.push(qty("cover_mismatch", `Entered cover ${mm(input.coverMm)} differs from ${product.name ?? "the product"}'s effective cover ${mm(productCover)} — use the product's value or mark the entry as a job override.`));
  }
  if (!isPos(netAreaM2)) res.problems.push(qty("area_invalid", "Net cladding area must be greater than 0 m²."));
  if (!isPos(coverMm)) res.problems.push(qty("cover_required", "Effective cover is required from the supplier/product — it is never taken from the nominal width."));
  if (!isNonNeg(spareRate)) res.problems.push(qty("spare_invalid", "Spare allowance must be 0 or more (e.g. 0.1 = 10%)."));
  if ("lapMm" in input || "overlapMm" in input) res.problems.push(note("overlap_ignored", "Effective cover already allows for the lap — no further overlap is deducted."));
  if (orderIncrementM === undefined || orderIncrementM === null) {
    res.problems.push(proc("order_increment_required", "Enter the supplier's ordering increment (m) before this can be ordered."));
  } else if (!isPos(orderIncrementM)) res.problems.push(qty("order_increment_invalid", "Ordering increment must be greater than 0 m."));
  const records = product ? [product] : [];
  if (blocked(res)) return finalise(res, { quantityOk: "estimate", records });

  const baseLm = (netAreaM2 * 1000) / coverMm;
  const spareLm = baseLm * spareRate;
  const withSpareLm = baseLm + spareLm;
  const orderLm = isPos(orderIncrementM) ? ceilToIncrement(withSpareLm, orderIncrementM) : null;
  const materialId = input.materialId ?? product?.id ?? "material";
  res.demands.push({
    id: demandId(materialId, input.sourceId ?? "area", "board-lm"), materialId, role: "board-lm", kind: "linear", unit: "lm",
    quantity: orderLm ?? withSpareLm,
    identity: product
      ? stockIdentity(product, { orientation: input.orientation ?? null, unit: "lm", stockWidthMm: product.dimensionsMm?.width ?? null })
      : accessoryIdentity("board-lm", null, { orientation: input.orientation ?? null, unit: "lm" }),
    stockPolicy: { kind: "random", orderIncrementM: orderIncrementM ?? null },
    label: `Random-length boards — ${formatMm(orderLm ?? withSpareLm, 3)} LM (estimate)`,
    sourceRefs, provenance: "calculated",
  });
  res.layout = { method, netAreaM2, coverMm, baseLm, spareRate, spareLm, withSpareLm, orderIncrementM: orderIncrementM ?? null, orderLm };
  res.explain.push(
    `${formatMm(netAreaM2, 3)} m² ÷ ${formatMm(coverMm / 1000, 3)} m effective cover = ${formatMm(baseLm, 3)} LM`,
    `+ ${formatMm(spareRate * 100, 2)}% spare (${formatMm(spareLm, 3)} LM) = ${formatMm(withSpareLm, 3)} LM`,
    orderLm === null ? "Supplier increment not entered — not orderable yet." : `Rounded up to the ${formatMm(orderIncrementM, 3)} m supplier increment = ${formatMm(orderLm, 3)} LM`,
    "Estimate only — not a board count. Use course layout for fixed or no-joint lengths.",
  );
  return finalise(res, { quantityOk: "estimate", records });
}
