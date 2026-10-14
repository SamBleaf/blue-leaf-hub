// =============================================================================
// shared/takeoff/schedule.js — workspace → contributions → length schedule → allocation.
//
// One pure implementation used by the UI (live preview) and the server (authoritative
// recalculation; client totals are never trusted).
//
//   measurement   geometry on a plan page (run = exactly 2 points) or a manual/count entry
//   contribution  a measurement assigned to a job material (optional explicit split)
//   piece         finished length × quantity produced by a contribution
//   schedule line pieces grouped ONLY when the full material spec + profile geometry + finished
//                 length match. Different lengths are never merged into "LM".
//   bucket        (spec key, finished length) — the unit of required / ordered / remaining.
// =============================================================================
import { TakeoffValidationError, stableStringify, totalLinearMetres } from "./units.js";
import { calibrationOrderReady, latestPageCalibrations, pointsWithinCalibration, polylineLengthMm, segmentLengthMm } from "./calibration.js";
import { evaluateSplit, lengthFlags, manualPieceResult, measuredRunResult, normaliseFlashingRules } from "./flashing.js";
import { profileGeometryKey, profileProblems } from "./profile.js";
import { fabricationIdentity, specProblems } from "./catalogue.js";
import { computeFlashingPath } from "./engine/flashingPath.js";
import { computeGenericMaterials, genericMaterialKey, isGenericMaterial } from "./engine/dispatch.js";
import { familyProblems } from "./engine/families.js";

export const LIMITS = Object.freeze({
  measurementsPerWorkspace: 500,
  pointsPerGeometry: 1000,
  profileSegments: 100,
  orderLines: 200,
});

export const PROBLEM_TEXT = Object.freeze({
  calibration_missing: "This run has no plan scale.",
  calibration_not_ready: "The plan scale failed its check or has not been checked — recalibrate before ordering.",
  plan_superseded: "The plan this was measured on has been replaced — review it against the new revision.",
  outside_region: "This run goes outside the scaled region.",
  ceiling_exceeded: "A piece is longer than the order ceiling — split it or change the material rule.",
  calibration_superseded: "This page has been re-scaled since this run was measured — review it with the new scale.",
  split_stale: "The run or rules changed after this split — review the split.",
  split_invalid: "The split pieces do not cover the run.",
  profile_invalid: "The flashing profile has a problem.",
  material_incomplete: "Material, finish, BMT or colour is missing.",
  perforation_incomplete: "Perforated — add the supplier product code, or the hole pattern, size, pitch and which legs.",
  line_stale_missing: "This length is no longer in the takeoff (its measurements, split or material changed) — update or remove the line.",
  line_stale_material: "This line's material changed (colour, finish, BMT, perforation or shape) — update or remove the line.",
  line_stale_quantity: "Fewer pieces are needed now than this line orders — update the quantity.",
  measurement_invalid: "This measurement is invalid.",
  ceiling_unknown: "This flashing has no maximum orderable length set up — set it up before ordering.",
  path_in_progress: "This run is still being drawn — finish it before ordering.",
  wall_incomplete: "A wall is missing its length or heights.",
  line_stale_inputs: "What this line was worked out from has changed (measurements, openings, product or rules) — review it and update the line.",
});

/** Stale-line wording for purchase lines (timber, sheets, bars, LM …) — PROBLEM_TEXT talks about flashing lengths. */
export const ITEM_STALE_TEXT = Object.freeze({
  line_stale_missing: "This line is no longer in the takeoff (its measurements, product or stock changed) — update or remove it.",
  line_stale_material: "What this line buys has changed (product, section, grade, finish or stock) — update or remove it.",
  line_stale_quantity: "Fewer are needed now than this line orders — update the quantity.",
  line_stale_inputs: PROBLEM_TEXT.line_stale_inputs,
});

// continuous-path problem codes (engine/flashingPath.js) → the schedule's blocking codes
const PATH_CODE = {
  outside_region: "outside_region", calibration_not_ready: "calibration_not_ready", calibration_missing: "calibration_missing",
  piece_over_max: "ceiling_exceeded", no_legal_split: "ceiling_exceeded", max_unknown: "ceiling_unknown", capacity_invalid: "ceiling_unknown",
  path_zero_length: "measurement_invalid", path_incomplete: "measurement_invalid", path_in_progress: "path_in_progress",
  allowance_overcommitted: "split_invalid",
};

/** Spec identity for grouping: method + full fabrication spec (construction, finish, BMT, colour,
 *  perforation) + profile geometry incl. coated face. Anything that changes what is made changes the key. */
export function materialSpecKey(material) {
  if (isGenericMaterial(material)) return genericMaterialKey(material);
  let profileKey = null;
  if (material.profile) {
    try { profileKey = profileGeometryKey(material.profile); } catch { profileKey = `invalid:${material.id}`; }
  }
  let spec;
  try {
    spec = fabricationIdentity(material.spec);
    if (spec.perforation?.legIds?.length) {
      const idx = (id) => (material.profile?.segments || []).findIndex((sg) => String(sg.id) === String(id));
      spec = { ...spec, perforation: { ...spec.perforation, legIds: spec.perforation.legIds.map((id) => { const i = idx(id); return i >= 0 ? `L${i + 1}` : `missing:${id}`; }).sort() } };
    }
  } catch { spec = `invalid:${material.id}`; }
  return stableStringify({
    method: `${material.methodKey}@${material.methodVersion}`,
    // Without a drawn profile the NAME is what tells the supplier which part it is
    // (e.g. "Stop end LH" vs "Stop end RH" in the same colour) — never merge those.
    item: material.profile ? null : String(material.name || "").trim().toLowerCase() || `id:${material.id}`,
    spec,
    profile: profileKey,
  });
}

export function bucketKey(specKey, finishedLengthMm) {
  return `${specKey}|${finishedLengthMm}`;
}

/** Material-level problems (profile + spec completeness, perforation definition). */
export function materialProblems(material) {
  if (isGenericMaterial(material)) return familyProblems(material.spec).length ? ["material_incomplete"] : [];
  let out;
  try { out = specProblems(material.spec, material.profile); } catch { out = ["material_incomplete"]; }
  if (material.methodKey === "flashing_runs" || material.profile) {
    if (!material.profile || profileProblems(material.profile).length) out.push("profile_invalid");
  }
  return out;
}

/** What a split was made against. Any change (even one that rounds to the same finished length)
 *  — raw run, calibration revision, rules, quantity — makes the split stale until reviewed. */
export function splitSourceSignature(m, cal, rules, result) {
  return stableStringify({
    kind: m.kind,
    raw: result.rawLengthMm != null ? Math.round(result.rawLengthMm * 10) / 10 : null,
    finished: result.finishedLengthMm,
    quantity: result.quantity,
    // calibrations are immutable (a re-scale is a NEW id), so the id alone identifies the scale — and it is
    // known even when the calibration is saved in the same batch as the split (R04b R11)
    calibration: cal ? cal.id : null,
    rules,
  });
}

/**
 * Compute one contribution. Never throws for user data problems — returns them as problems so
 * the UI can show them in place. Throws only for programming errors.
 */
export function computeContribution(contribution, ctx) {
  const { measurementsById, materialsById, calibrationsById, documentsById } = ctx;
  const m = measurementsById.get(contribution.measurementId);
  const mat = materialsById.get(contribution.jobMaterialId);
  const base = { contributionId: contribution.id, measurementId: contribution.measurementId, jobMaterialId: contribution.jobMaterialId };
  if (!m || !mat) return { ...base, pieces: [], problems: ["measurement_invalid"], explanation: null };
  let rules;
  try { rules = normaliseFlashingRules(mat.rules); } catch (e) { return { ...base, pieces: [], problems: ["measurement_invalid"], explanation: e.message }; }
  const problems = [];
  let result;
  try {
    if (m.kind === "run") {
      if (mat.methodKey === "finished_piece_count") throw new TakeoffValidationError("This material only takes finished lengths — enter or count pieces instead of measuring runs.");
      const cal = m.calibrationId ? calibrationsById.get(m.calibrationId) : null;
      if (!cal) return { ...base, pieces: [], problems: ["calibration_missing"], explanation: null };
      if (!Array.isArray(m.points) || m.points.length !== 2) throw new TakeoffValidationError("A straight run has exactly two points.");
      if (!pointsWithinCalibration(cal, m.points)) problems.push("outside_region");
      if (ctx.latestCalibration && ctx.latestCalibration(cal)?.id !== cal.id) problems.push("calibration_superseded");
      if (!calibrationOrderReady(cal)) problems.push("calibration_not_ready");
      const doc = documentsById?.get(m.documentId);
      if (doc && doc.status !== "current") problems.push("plan_superseded");
      const raw = segmentLengthMm(cal, m.points[0], m.points[1]);
      result = measuredRunResult(raw, rules);
      result.calibration = cal;
    } else if (m.kind === "polyline") {
      // continuous flashing run (TC-R04 13): ONE path, corners are site cuts/folds; explicit splits only
      if (mat.methodKey === "finished_piece_count") throw new TakeoffValidationError("This material only takes finished lengths — enter or count pieces instead of measuring runs.");
      const cal = m.calibrationId ? calibrationsById.get(m.calibrationId) : null;
      if (!cal) return { ...base, pieces: [], problems: ["calibration_missing"], explanation: null };
      if (ctx.latestCalibration && ctx.latestCalibration(cal)?.id !== cal.id) problems.push("calibration_superseded");
      const doc = documentsById?.get(m.documentId);
      if (doc && doc.status !== "current") problems.push("plan_superseded");
      const path = computeFlashingPath({ points: m.points, calibration: cal, splitsMm: m.inputs?.splitsMm || [], splitAnchors: m.inputs?.splitAnchors || undefined,
        rules, runId: m.id, materialId: mat.id, complete: true });
      for (const p of path.problems) {
        if (p.blocking === false) continue;
        const code = PATH_CODE[p.code] || (String(p.code).startsWith("split_") ? "split_invalid" : "measurement_invalid");
        if (!problems.includes(code)) problems.push(code);
      }
      const pieces = path.pieces.map((pc) => ({ finishedLengthMm: pc.orderMm, quantity: 1, handlingFlag: !!pc.handlingFlag, ceilingExceeded: !!pc.overMax }));
      const vs = path.layout?.vertexStationsMm || [];
      const result = { source: "path", rawLengthMm: path.tightTotalMm, finishedLengthMm: pieces.length === 1 ? pieces[0].finishedLengthMm : null, quantity: pieces.length, allowanceMm: rules.allowanceMm };
      const signature = splitSourceSignature(m, cal, rules, result);
      return { ...base, kind: m.kind, result, split: null, pieces, sourceSignature: signature, problems: [...new Set(problems)], explanation: path.explain.join(" "),
        path: { tightTotalMm: path.tightTotalMm, cornersMm: vs.slice(1, -1), splitsMm: path.splitsMm, splits: path.splits, overflow: path.overflow, layout: path.layout,
          pieces: path.pieces.map((pc) => ({ fromMm: pc.fromMm, toMm: pc.toMm, tightMm: pc.tightMm, orderMm: pc.orderMm, overMax: !!pc.overMax, handlingFlag: !!pc.handlingFlag, legalSplitMm: pc.legalSplitMm ?? null, redFromMm: pc.redFromMm ?? null })),
          problems: path.problems } };
    } else if (m.kind === "count") {
      const qty = Array.isArray(m.points) ? m.points.length : 0;
      if (qty < 1) throw new TakeoffValidationError("Tap at least one occurrence.");
      const doc = documentsById?.get(m.documentId);
      if (doc && doc.status !== "current") problems.push("plan_superseded");
      result = manualPieceResult(m.finishedLengthMm, qty, rules);
      result.source = "count";
    } else if (m.kind === "manual") {
      result = manualPieceResult(m.finishedLengthMm, m.quantity, rules);
    } else {
      throw new TakeoffValidationError("Unknown measurement type.");
    }
  } catch (e) {
    if (e instanceof TakeoffValidationError) return { ...base, pieces: [], problems: ["measurement_invalid"], explanation: e.message };
    throw e;
  }

  const signature = splitSourceSignature(m, result.calibration || null, rules, result);
  delete result.calibration;
  let pieces = [{ finishedLengthMm: result.finishedLengthMm, quantity: result.quantity, handlingFlag: result.handlingFlag, ceilingExceeded: result.ceilingExceeded }];
  let split = null;
  if (contribution.split) {
    const sp = contribution.split;
    // How many of this contribution's identical pieces are split (runs: 1; manual/count: 1..quantity).
    const originals = Number.isInteger(sp.originals) && sp.originals >= 1 ? sp.originals : 1;
    // Stale when the source changed at all since the split was made — not just its rounded output.
    const stale = sp.sourceSignature ? sp.sourceSignature !== signature
      : (sp.sourceFinishedMm !== result.finishedLengthMm || result.quantity !== 1);
    let ev;
    try {
      ev = originals > result.quantity
        ? { valid: false, children: [], problems: ["More pieces are split than exist."], coverageMm: 0, overcoverageMm: 0 }
        : evaluateSplit({ requiredFinishedMm: result.finishedLengthMm, pieces: sp.pieces, laps: sp.laps }, rules);
    } catch (e) {
      ev = { valid: false, children: [], problems: [e.message], coverageMm: 0, overcoverageMm: 0 };
    }
    split = { ...ev, stale, originals, version: sp.version || 1 };
    if (stale) problems.push("split_stale");
    if (!ev.valid) problems.push("split_invalid");
    if (ev.valid) {
      // A split REPLACES the originals it splits — never both. Unsplit remainder stays whole.
      const remainder = Math.max(0, result.quantity - originals);
      pieces = [
        ...(remainder ? [{ finishedLengthMm: result.finishedLengthMm, quantity: remainder, handlingFlag: result.handlingFlag, ceilingExceeded: result.ceilingExceeded }] : []),
        ...ev.children.map((c) => ({ finishedLengthMm: c.finishedLengthMm, quantity: originals, handlingFlag: c.handlingFlag, ceilingExceeded: c.ceilingExceeded })),
      ];
    }
    // an invalid split (e.g. more originals than now exist) keeps the ORIGINAL pieces whole and flagged —
    // pieces never silently vanish from the schedule (R04b R1)
  }
  if (pieces.some((p) => p.ceilingExceeded)) problems.push("ceiling_exceeded");
  return { ...base, kind: m.kind, result, split, pieces, sourceSignature: signature, problems: [...new Set(problems)], explanation: explain(result) };
}

/** "Measured 4,312 + allowance 200 → order 4,600 mm" */
export function explain(result) {
  if (!result) return null;
  const f = (n) => n.toLocaleString("en-AU", { maximumFractionDigits: 1 });
  // the raw run keeps 0.1 mm so the sum always explains the rounding (3,000.4 + 200 → 3,300)
  if (result.source === "measured") return `Measured ${f(Math.round(result.rawLengthMm * 10) / 10)} + allowance ${f(result.allowanceMm)} → order ${f(result.finishedLengthMm)} mm`;
  if (result.source === "count") return `Counted ${result.quantity} × ${f(result.finishedLengthMm)} mm (finished length, no allowance)`;
  return `Entered ${result.quantity} × ${f(result.finishedLengthMm)} mm (finished length, no allowance)`;
}

function indexById(list) {
  const m = new Map();
  for (const x of list || []) m.set(x.id, x);
  return m;
}

/**
 * Compute a whole workspace. Returns per-contribution results and schedule lines grouped by
 * (spec, finished length), with material-level problems folded in.
 */
export function computeWorkspace(ws) {
  const ctx = {
    measurementsById: indexById((ws.measurements || []).filter((m) => !m.archived)),
    materialsById: indexById(ws.materials || []),
    calibrationsById: indexById(ws.calibrations || []),
    documentsById: indexById(ws.documents || []),
  };
  // newest calibration revision per (document, page, region) — older ones are superseded
  const newest = new Map();
  for (const c of ws.calibrations || []) {
    const k = `${c.documentId}|${c.pageIndex}|${c.regionLabel || ""}`;
    const cur = newest.get(k);
    if (!cur || c.pending || (!cur.pending && (c.calibrationRevision || 0) > (cur.calibrationRevision || 0))) newest.set(k, c);
  }
  ctx.latestCalibration = (cal) => newest.get(`${cal.documentId}|${cal.pageIndex}|${cal.regionLabel || ""}`);
  if (ctx.measurementsById.size > LIMITS.measurementsPerWorkspace) {
    throw new TakeoffValidationError(`A takeoff can hold at most ${LIMITS.measurementsPerWorkspace} measurements.`);
  }
  const live = (ws.contributions || []).filter((c) => !c.archived);
  const generic = [...ctx.materialsById.values()].filter(isGenericMaterial);
  const genericIds = new Set(generic.map((m) => m.id));
  const contributions = live.filter((c) => !genericIds.has(c.jobMaterialId)).map((c) => computeContribution(c, ctx));
  // TC-R04 families: method dispatch → demands → one allocator → purchase lines (engine/dispatch.js)
  const gen = computeGenericMaterials(generic, live.filter((c) => genericIds.has(c.jobMaterialId)), ctx);
  const matProblems = new Map();
  for (const mat of ctx.materialsById.values()) matProblems.set(mat.id, materialProblems(mat));
  const lines = new Map();
  for (const c of contributions) {
    const mat = ctx.materialsById.get(c.jobMaterialId);
    if (!mat) continue;
    const specKey = materialSpecKey(mat);
    for (const p of c.pieces) {
      const key = bucketKey(specKey, p.finishedLengthMm);
      let line = lines.get(key);
      if (!line) {
        line = { bucketKey: key, specKey, jobMaterialIds: [], finishedLengthMm: p.finishedLengthMm, quantity: 0,
          contributionIds: [], handlingFlag: p.handlingFlag, ceilingExceeded: p.ceilingExceeded, problems: [] };
        lines.set(key, line);
      }
      line.quantity += p.quantity;
      if (!line.contributionIds.includes(c.contributionId)) line.contributionIds.push(c.contributionId);
      if (!line.jobMaterialIds.includes(mat.id)) line.jobMaterialIds.push(mat.id);
      for (const pr of c.problems) if (!line.problems.includes(pr)) line.problems.push(pr);
      for (const pr of matProblems.get(mat.id) || []) if (!line.problems.includes(pr)) line.problems.push(pr);
    }
  }
  const flashingLines = [...lines.values()].sort((a, b) => (a.specKey === b.specKey ? b.finishedLengthMm - a.finishedLengthMm : a.specKey < b.specKey ? -1 : 1));
  const genericLines = gen.lines.sort((a, b) => (a.materialKey === b.materialKey ? (a.unit === b.unit ? (b.finishedLengthMm || 0) - (a.finishedLengthMm || 0) : a.unit < b.unit ? -1 : 1) : a.materialKey < b.materialKey ? -1 : 1));
  const scheduleLines = [...flashingLines, ...genericLines];
  // a measurement that produced NO pieces (invalid run, no scale, …) is a missing requirement, not zero:
  // it is listed and blocks ordering of that material (R04b R1)
  const unplaced = contributions.filter((c) => !c.pieces.length && c.problems.length).map((c) => {
    const mat = ctx.materialsById.get(c.jobMaterialId);
    return { contributionId: c.contributionId, jobMaterialId: c.jobMaterialId, specKey: mat ? materialSpecKey(mat) : null, problems: c.problems, explanation: c.explanation };
  });
  unplaced.push(...gen.unplaced);
  return {
    contributions: [...contributions, ...gen.contributions],
    scheduleLines,
    unplaced,
    materialProblems: Object.fromEntries(matProblems),
    materialResults: gen.results,
    // LM is a flashing total; other units are never added together (see materialResults / line units)
    totalLm: totalLinearMetres(flashingLines),
    orderReady: scheduleLines.length > 0 && scheduleLines.every((l) => l.problems.length === 0) && !unplaced.length,
  };
}

/**
 * Is a saved order line still the same thing it was when chosen? The line, its material and the current
 * schedule bucket must describe the same full spec — otherwise it is STALE and must be updated or removed
 * explicitly (never silently relinked to another material). Returns { stale, problem, current, suggestion }.
 *   suggestion: the current bucket the line's own material now supplies at the same length (for "Update").
 */
export function orderLineState(line, computed, materials) {
  const mats = materials instanceof Map ? materials : new Map((materials || []).map((m) => [m.id, m]));
  const sl = computed.scheduleLines.find((x) => x.bucketKey === line.bucketKey) || null;
  const mat = line.jobMaterialId ? mats.get(line.jobMaterialId) : null;
  const ownKey = mat ? materialSpecKey(mat) : null;
  // generic lines (TC-R04) key the MATERIAL separately from the purchase identity/unit/stock
  const keyOf = (x) => (x.generic ? x.materialKey : x.specKey);
  const suggestion = mat ? computed.scheduleLines.find((x) => keyOf(x) === ownKey && x.jobMaterialIds.includes(mat.id) && x.finishedLengthMm === line.finishedLengthMm
    && (x.unit || "piece") === (line.unit || "piece")) || null : null;
  let problem = null;
  if (!sl) problem = "line_stale_missing";
  else if (line.jobMaterialId && (!mat || ownKey !== keyOf(sl) || !sl.jobMaterialIds.includes(mat.id))) problem = "line_stale_material";
  else if (line.specKey && line.specKey !== sl.specKey) problem = "line_stale_material";
  // generic lines (06): ANY change to what the quantity was worked out from invalidates the draft line, even when the
  // totals come out the same — the line is updated explicitly (same bucket), never silently
  else if (sl.generic && line.item?.dependencyKey && sl.dependencyKey && line.item.dependencyKey !== sl.dependencyKey) problem = "line_stale_inputs";
  else if (line.quantity > sl.quantity) problem = "line_stale_quantity";
  return { stale: !!problem, problem, current: sl,
    suggestion: problem === "line_stale_inputs" ? sl : suggestion && suggestion.bucketKey !== line.bucketKey ? suggestion : null };
}

/**
 * Explicit "Update to current material" for a stale order line (R04b R2). Keeps EVERY piece the line covered:
 * what other materials still supply stays on the old length (attributed to one of them); only the rest moves,
 * ADDED to anything already on the target. qty / chosen are { bucketKey → quantity / jobMaterialId }.
 */
export function reconcileStaleLine(qty, chosen, state) {
  const { line, current, suggestion: to } = state;
  const was = qty[line.bucketKey] || 0;
  const keep = current ? Math.min(was, current.quantity) : 0;
  const other = current?.jobMaterialIds.find((id) => id !== line.jobMaterialId) || null;
  const kept = keep && other ? keep : 0;
  const moved = Math.max(was - kept, 1);
  const q = { ...qty }, c = { ...chosen };
  delete q[line.bucketKey]; delete c[line.bucketKey];
  if (kept) { q[line.bucketKey] = kept; c[line.bucketKey] = other; }
  q[to.bucketKey] = Math.min((q[to.bucketKey] || 0) + moved, to.quantity);
  c[to.bucketKey] = line.jobMaterialId;
  return { qty: q, chosen: c, kept, moved };
}

/** Re-flag thresholds for a finished length under a material's rules (UI helper). */
export function flagsFor(finishedLengthMm, rules) {
  return lengthFlags(finishedLengthMm, normaliseFlashingRules(rules));
}

// ── Required / ordered / remaining ────────────────────────────────────────────

/**
 * @param {Array<{bucketKey:string, quantity:number, contributionIds:string[]}>} scheduleLines   current requirement
 * @param {Array<{bucketKey:string, contributionId:string|null, quantity:number}>} commitments  EFFECTIVE placed allocations only
 *   (draft orders and exports are not commitments; cancelled placements are excluded by the caller).
 */
export function orderStatus(scheduleLines, commitments) {
  const committed = new Map();
  for (const c of commitments || []) committed.set(c.bucketKey, (committed.get(c.bucketKey) || 0) + c.quantity);
  const out = new Map();
  for (const l of scheduleLines) {
    const ordered = committed.get(l.bucketKey) || 0;
    out.set(l.bucketKey, { bucketKey: l.bucketKey, required: l.quantity, ordered, remaining: Math.max(0, l.quantity - ordered), surplus: Math.max(0, ordered - l.quantity) });
  }
  // Committed buckets with no current requirement (measurement changed / removed) → pure surplus.
  for (const [k, q] of committed) {
    if (!out.has(k)) out.set(k, { bucketKey: k, required: 0, ordered: q, remaining: 0, surplus: q, reconcile: true });
  }
  return out;
}

/**
 * Allocate `quantity` pieces of a bucket to stable contributions not already committed.
 * Throws when that would over-allocate the requirement.
 * @param {{bucketKey:string, contributionIds:string[]}} line
 * @param {Array<{contributionId:string, quantity:number}>} contributionPieces  pieces per contribution in this bucket
 * @param {Array<{bucketKey:string, contributionId:string|null, quantity:number}>} commitments
 */
export function allocate(line, quantity, contributionPieces, commitments) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new TakeoffValidationError("Order quantity must be a whole number of 1 or more.");
  const usedBy = new Map();
  for (const c of commitments || []) if (c.bucketKey === line.bucketKey && c.contributionId) usedBy.set(c.contributionId, (usedBy.get(c.contributionId) || 0) + c.quantity);
  let left = quantity;
  const allocations = [];
  for (const cp of contributionPieces) {
    const free = cp.quantity - (usedBy.get(cp.contributionId) || 0);
    if (free <= 0) continue;
    const take = Math.min(free, left);
    allocations.push({ bucketKey: line.bucketKey, contributionId: cp.contributionId, quantity: take });
    left -= take;
    if (!left) break;
  }
  if (left > 0) throw new TakeoffValidationError("That is more than is still needed for this length — another order already covers it.");
  return allocations;
}

/** Pieces per contribution for a bucket, in stable (contribution id) order. */
export function contributionPiecesForBucket(computed, line) {
  const out = [];
  for (const c of computed.contributions) {
    if (!line.contributionIds.includes(c.contributionId)) continue;
    const q = c.pieces.filter((p) => (p.bucketKey ? p.bucketKey === line.bucketKey : bucketKey(line.specKey, p.finishedLengthMm) === line.bucketKey)).reduce((a, p) => a + p.quantity, 0);
    if (q) out.push({ contributionId: c.contributionId, quantity: q });
  }
  return out.sort((a, b) => (a.contributionId < b.contributionId ? -1 : 1));
}

/** Runs whose calibration is not the newest for its document/page/region, with before/after. */
export function rescaleCandidates(view) {
  const mats = new Map(view.materials.map((m) => [m.id, m]));
  const byMeasurement = new Map(view.contributions.map((c) => [c.measurementId, c]));
  const out = [];
  for (const m of view.measurements) {
    if ((m.kind !== "run" && m.kind !== "polyline") || m.archived) continue;
    const cur = view.calibrations.find((c) => c.id === m.calibrationId);
    if (!cur) continue;
    const newest = latestPageCalibrations(view.calibrations, cur.documentId, cur.pageIndex).find((c) => (c.regionLabel || "") === (cur.regionLabel || ""));
    if (!newest || newest.id === cur.id) continue;
    const mat = mats.get(byMeasurement.get(m.id)?.jobMaterialId);
    if (mat && isGenericMaterial(mat)) { out.push({ measurement: m, from: cur, to: newest, before: null, after: null }); continue; }
    const rules = mat?.rules;
    const len = (cal) => (m.kind === "polyline" ? polylineLengthMm(cal, m.points) : segmentLengthMm(cal, m.points[0], m.points[1]));
    let before = null, after = null;
    try { before = measuredRunResult(len(cur), rules); } catch { /* invalid under old */ }
    try { after = measuredRunResult(len(newest), rules); } catch { /* invalid under new */ }
    out.push({ measurement: m, from: cur, to: newest, before, after });
  }
  return out;
}

