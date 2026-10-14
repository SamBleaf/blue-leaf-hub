// =============================================================================
// measure/tools.js — which measuring tools a material gets, layer colours, the on-device drawing draft and small
// record helpers for MeasureScreen (TC-R04 02 §2–3, 03 T1, 13). Pure + localStorage only (always try/catch).
//
//   flashing           Run (continuous path, 13) · Count · Select · Pan
//   timber repeated    Member · Distribution · Select · Pan            (rafters / joists / battens; no Member when
//                      the cut length is entered)
//   timber studs       Wall · Select · Pan                             (wall_frame)
//   timber plates      Wall · Run · Count · Select · Pan               (linear_stock)
//   timber noggins     Wall · Count · Select · Pan
//   timber trim/other  Run · Count · Select · Pan
//   aluminium          Run · Select · Pan
//   wall families      Wall · Select · Pan                             (cladding, aac, foam, timber-cladding, batten, accessory)
// =============================================================================
import { ceilToIncrement } from "../../../../shared/takeoff/units.js";

/** Layer colours on the plan (measurement layer, not supplier finish — 02 §1). */
export const COLORS = Object.freeze({
  flashing: "#006c9b", overflow: "#dc2626", handling: "#b45309", draft: "#64748b", count: "#16a34a", selected: "#f59e0b",
  halo: "#7dd3fc", wall: "#9a3412", member: "#7c3aed", distribution: "#0d9488", trim: "#006c9b", split: "#0f172a", removed: "#94a3b8",
});

const WALL_FAMILIES = new Set(["cladding", "aac", "foam", "timber-cladding", "batten", "accessory"]);

/** TC-R04 family of a job material (null = flashing). */
export const familyOf = (m) => (m?.spec?.family && m.spec.family !== "flashing" ? m.spec.family : null);
export const isFlashingMaterial = (m) => !!m && !familyOf(m);
/** Materials measured as walls (+ openings) rather than plan lines — same rule as TakeoffApp. */
export const usesWalls = (m) => WALL_FAMILIES.has(m?.spec?.family) || (m?.spec?.family === "timber" && ["studs", "plates", "noggins"].includes(m?.spec?.purpose));

const T = {
  run: { k: "run", label: "Run" }, count: { k: "count", label: "Count" }, select: { k: "select", label: "Select" }, pan: { k: "pan", label: "Pan" },
  wall: { k: "wall", label: "Wall" }, member: { k: "member", label: "Member" }, distribution: { k: "distribution", label: "Distribution" },
};

/** The tool row for a material (first = default). */
export function toolsFor(material) {
  if (!material) return [T.select, T.pan];
  const fam = familyOf(material);
  if (!fam) return [T.run, T.count, T.select, T.pan];
  if (fam === "timber") {
    const p = material.spec?.purpose;
    // an entered cut length needs no member line (03 T2) — only the distribution run is measured
    if (material.methodKey === "repeated_members") return material.rules?.lengthSource === "entered" ? [T.distribution, T.select, T.pan] : [T.member, T.distribution, T.select, T.pan];
    if (p === "studs" || material.methodKey === "wall_frame") return [T.wall, T.select, T.pan];
    if (p === "plates") return [T.wall, T.run, T.count, T.select, T.pan];
    if (p === "noggins") return [T.wall, T.count, T.select, T.pan];
    return [T.run, T.count, T.select, T.pan];
  }
  if (fam === "aluminium") return [T.run, T.select, T.pan];
  if (usesWalls(material)) return [T.wall, T.select, T.pan];
  return [T.select, T.pan];
}

/** Multi-point tools: tap each corner, double-tap (or Finish) to finish. */
export const PATH_TOOLS = new Set(["run", "wall"]);
/** Two-point line tools: the second tap finishes the line. */
export const LINE_TOOLS = new Set(["member", "distribution"]);

/** Plain-English name of a timber purpose's members, for counts ("11 rafters"). */
export function memberNoun(material, n = 2) {
  const p = material?.spec?.purpose;
  const one = p === "rafters" ? "rafter" : p === "joists" ? "joist" : p === "battens" ? "batten" : p === "studs" ? "stud" : "member";
  return n === 1 ? one : `${one}s`;
}

// ── on-device drawing draft (recovers an unfinished path after a reload; never an order line) ────────────────

const DRAFT_PREFIX = "blh-takeoff-measure-draft";
const finite = (v) => typeof v === "number" && Number.isFinite(v);

export const draftKey = ({ workspaceId, materialId, documentId, pageIndex }) =>
  (workspaceId && materialId && documentId != null ? `${DRAFT_PREFIX}:${workspaceId}:${materialId}:${documentId}:${pageIndex}` : null);

/** A stored draft, or null when absent / unreadable / storage blocked. */
export function loadDraft(key) {
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d.tool !== "string" || !Array.isArray(d.points) || !d.points.every((p) => p && finite(p.x) && finite(p.y))) return null;
    return {
      tool: d.tool, points: d.points.map((p) => ({ x: p.x, y: p.y })),
      splitsMm: Array.isArray(d.splitsMm) ? d.splitsMm.filter(finite) : [],
      measurementId: typeof d.measurementId === "string" ? d.measurementId : null,
    };
  } catch {
    return null;
  }
}

/** Store (or clear, for an empty draft). Returns false when this device can't keep it. */
export function saveDraft(key, d) {
  if (!key) return false;
  try {
    if (!d || !d.points?.length) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify({ tool: d.tool, points: d.points, splitsMm: d.splitsMm || [], measurementId: d.measurementId || null, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

// ── display ───────────────────────────────────────────────────────────────────

/**
 * A tight length shown with just enough decimals that "tight + allowance → order" still explains the rounding — display
 * rounding never hides a real overrun (13: 8,800.04 + 200 → 9,100, never "8,800 + 200 → 9,100").
 */
export function explainableMm(tightMm, { allowanceMm = 0, extraMm = 0, incrementMm = 1, orderMm = null, lengthKind = "tight" } = {}) {
  const show = (v, d) => v.toLocaleString("en-AU", { maximumFractionDigits: d });
  if (lengthKind !== "tight" || orderMm == null || !(incrementMm > 0)) return show(Math.round(tightMm * 10) / 10, 1);
  for (let d = 1; d <= 6; d++) {
    const v = Number(tightMm.toFixed(d));
    if (ceilToIncrement(v + extraMm + allowanceMm, incrementMm) === orderMm) return show(v, d); // the engine's own rounding
  }
  return show(tightMm, 6);
}
// ── record helpers ───────────────────────────────────────────────────────────

/**
 * Inputs for a NEW traced wall: rectangular, "Wall N" (unique), and the height last used in this workspace when
 * there is one (02 §3 — never inferred from another job). Heights may be left out while drafting.
 */
export function nextWallInputs(measurements) {
  const walls = (measurements || []).filter((m) => m.kind === "wall" && !m.archived);
  let height = null;
  for (const w of walls) if (finite(w.inputs?.heightMm) && w.inputs.heightMm > 0) height = w.inputs.heightMm;
  const names = new Set(walls.map((w) => String(w.inputs?.name || "").trim().toLowerCase()));
  let n = walls.length + 1;
  while (names.has(`wall ${n}`)) n++;
  return { kind: "rect", ...(height ? { heightMm: height } : {}), name: `Wall ${n}` };
}

/**
 * Change ONE member's override on a distribution run (03 T1): { removed } | { lengthMm } | { duplicate }.
 * Removing clears its length/duplicates (the engine rejects a removed member that is also re-lengthed).
 * Empty overrides are dropped. Returns a new list.
 */
export function withOverride(list, station, patch) {
  const cur = (list || []).find((o) => o.station === station) || { station };
  let next = { ...cur, ...patch };
  if (patch.removed) next = { station, removed: true };
  if (!next.removed) delete next.removed;
  if (!(finite(next.lengthMm) && next.lengthMm > 0)) delete next.lengthMm;
  if (!(Number.isInteger(next.duplicate) && next.duplicate > 0)) delete next.duplicate;
  const rest = (list || []).filter((o) => o.station !== station);
  return Object.keys(next).length > 1 ? [...rest, next] : rest;
}

/** Distribution inputs at creation: the material's current spacing rules, no member changes yet. */
export function distributionInputs(rules) {
  const r = rules || {};
  return {
    startOffsetMm: finite(r.startOffsetMm) ? r.startOffsetMm : 0, endOffsetMm: finite(r.endOffsetMm) ? r.endOffsetMm : 0,
    includeStart: r.includeStart !== false, includeEnd: r.includeEnd !== false, spacing: r.spacing === "equal" ? "equal" : "fixed", overrides: [],
  };
}

/** The job-material record shape the takeoff upserts (same as TakeoffApp matRec). */
export const materialRecord = (m) => ({ id: m.id, name: m.name, methodKey: m.methodKey, methodVersion: m.methodVersion || 1, spec: m.spec, rules: m.rules || {},
  profile: m.profile || null, fromPresetId: m.fromPresetId || null, fromPresetRevision: m.fromPresetRevision || null });
