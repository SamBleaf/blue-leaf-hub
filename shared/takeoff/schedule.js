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
import { calibrationOrderReady, latestPageCalibrations, pointsWithinCalibration, segmentLengthMm } from "./calibration.js";
import { evaluateSplit, lengthFlags, manualPieceResult, measuredRunResult, normaliseFlashingRules } from "./flashing.js";
import { profileGeometryKey, profileProblems } from "./profile.js";

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
  measurement_invalid: "This measurement is invalid.",
});

/** Spec identity for grouping: method + product/finish/BMT/colour + profile geometry. */
export function materialSpecKey(material) {
  const s = material.spec || {};
  let profileKey = null;
  if (material.profile) {
    try { profileKey = profileGeometryKey(material.profile); } catch { profileKey = `invalid:${material.id}`; }
  }
  return stableStringify({
    method: `${material.methodKey}@${material.methodVersion}`,
    // Without a drawn profile the NAME is what tells the supplier which part it is
    // (e.g. "Stop end LH" vs "Stop end RH" in the same colour) — never merge those.
    item: material.profile ? null : String(material.name || "").trim().toLowerCase() || `id:${material.id}`,
    product: s.product || null,
    productCode: s.productCode || null,
    finish: s.finish || null,
    bmt: s.bmt ?? null,
    colour: s.colour || null,
    colourCode: s.colourCode || null,
    profile: profileKey,
  });
}

export function bucketKey(specKey, finishedLengthMm) {
  return `${specKey}|${finishedLengthMm}`;
}

/** Material-level problems (profile + spec completeness). */
export function materialProblems(material) {
  const out = [];
  const s = material.spec || {};
  if (!s.product || !s.finish || s.bmt == null || s.bmt === "" || !s.colour) out.push("material_incomplete");
  if (material.methodKey === "flashing_runs" || material.profile) {
    if (!material.profile || profileProblems(material.profile).length) out.push("profile_invalid");
  }
  return out;
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

  let pieces = [{ finishedLengthMm: result.finishedLengthMm, quantity: result.quantity, handlingFlag: result.handlingFlag, ceilingExceeded: result.ceilingExceeded }];
  let split = null;
  if (contribution.split) {
    const sp = contribution.split;
    // A split is tied to the exact finished length it was made against (one piece only).
    const stale = result.quantity !== 1 || sp.sourceFinishedMm !== result.finishedLengthMm;
    let ev;
    try {
      ev = evaluateSplit({ requiredFinishedMm: result.finishedLengthMm, pieces: sp.pieces, laps: sp.laps }, rules);
    } catch (e) {
      ev = { valid: false, children: [], problems: [e.message], coverageMm: 0, overcoverageMm: 0 };
    }
    split = { ...ev, stale, version: sp.version || 1 };
    if (stale) problems.push("split_stale");
    if (!ev.valid) problems.push("split_invalid");
    // Applying a split REPLACES the unsplit contribution — never both.
    pieces = ev.children.map((c) => ({ finishedLengthMm: c.finishedLengthMm, quantity: 1, handlingFlag: c.handlingFlag, ceilingExceeded: c.ceilingExceeded }));
  }
  if (pieces.some((p) => p.ceilingExceeded)) problems.push("ceiling_exceeded");
  return { ...base, kind: m.kind, result, split, pieces, problems: [...new Set(problems)], explanation: explain(result) };
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
  const contributions = (ws.contributions || []).filter((c) => !c.archived).map((c) => computeContribution(c, ctx));
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
  const scheduleLines = [...lines.values()].sort((a, b) => (a.specKey === b.specKey ? b.finishedLengthMm - a.finishedLengthMm : a.specKey < b.specKey ? -1 : 1));
  return {
    contributions,
    scheduleLines,
    materialProblems: Object.fromEntries(matProblems),
    totalLm: totalLinearMetres(scheduleLines),
    orderReady: scheduleLines.length > 0 && scheduleLines.every((l) => l.problems.length === 0),
  };
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
    const q = c.pieces.filter((p) => bucketKey(line.specKey, p.finishedLengthMm) === line.bucketKey).reduce((a, p) => a + p.quantity, 0);
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
    if (m.kind !== "run" || m.archived) continue;
    const cur = view.calibrations.find((c) => c.id === m.calibrationId);
    if (!cur) continue;
    const newest = latestPageCalibrations(view.calibrations, cur.documentId, cur.pageIndex).find((c) => (c.regionLabel || "") === (cur.regionLabel || ""));
    if (!newest || newest.id === cur.id) continue;
    const rules = mats.get(byMeasurement.get(m.id)?.jobMaterialId)?.rules;
    let before = null, after = null;
    try { before = measuredRunResult(segmentLengthMm(cur, m.points[0], m.points[1]), rules); } catch { /* invalid under old */ }
    try { after = measuredRunResult(segmentLengthMm(newest, m.points[0], m.points[1]), rules); } catch { /* invalid under new */ }
    out.push({ measurement: m, from: cur, to: newest, before, after });
  }
  return out;
}

