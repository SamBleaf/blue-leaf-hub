// =============================================================================
// shared/takeoff/methods.js — code-owned, versioned calculation method registry.
//
// Materials (DATA) name a method by key + version; methods (CODE) declare their parameter
// fields, units, bounds, required measurement roles and outputs. Users never write formulas
// and no method source lives in the database.
//
// status "production" = available in the release-one UI.
// status "contract"   = executable contract + tests only; NOT offered as a working feature.
// =============================================================================
import { TakeoffValidationError, ceilToIncrement, isFiniteNumber, requirePositive } from "./units.js";
import { FLASHING_RULE_DEFAULTS, manualPieceResult, measuredRunResult, normaliseFlashingRules } from "./flashing.js";

const deg2rad = (d) => (d * Math.PI) / 180;

function field(key, label, unit, { min = 0, max = Infinity, default: def, required = true, integer = false } = {}) {
  return { key, label, unit, min, max, default: def, required, integer };
}

/** Validate params against a method's declared fields (fills defaults). */
export function validateParams(method, params = {}) {
  const out = {};
  for (const f of method.fields) {
    let v = params[f.key];
    if (v === undefined || v === null || v === "") v = f.default;
    if (v === undefined || v === null) {
      if (f.required) throw new TakeoffValidationError(`${f.label} is required.`, f.key);
      continue;
    }
    if (Array.isArray(f.default) || f.unit === "mm[]") {
      if (!Array.isArray(v)) throw new TakeoffValidationError(`${f.label} must be a list.`, f.key);
      out[f.key] = v;
      continue;
    }
    if (!isFiniteNumber(v)) throw new TakeoffValidationError(`${f.label} must be a number.`, f.key);
    if (v < f.min || v > f.max) throw new TakeoffValidationError(`${f.label} must be between ${f.min} and ${f.max} ${f.unit}.`, f.key);
    if (f.integer && !Number.isInteger(v)) throw new TakeoffValidationError(`${f.label} must be a whole number.`, f.key);
    out[f.key] = v;
  }
  return out;
}

// ── flashing_runs@1 — measured straight runs → finished pieces ────────────────
const flashingRuns = {
  key: "flashing_runs",
  version: 1,
  status: "production",
  label: "Flashing — measured runs, counts and manual lengths",
  // Runs use this method; count/manual measurements on a flashing material are finished pieces
  // (finished_piece_count@1 semantics: no allowance, no rounding).
  roles: ["run", "count", "manual"],
  fields: [
    field("allowanceMm", "Measured allowance (total per run)", "mm", { min: 0, max: 2000, default: FLASHING_RULE_DEFAULTS.allowanceMm }),
    field("incrementMm", "Round up to", "mm", { min: 1, max: 6000, default: FLASHING_RULE_DEFAULTS.incrementMm }),
    field("handlingThresholdMm", "Handling flag above", "mm", { min: 1, max: 30000, default: FLASHING_RULE_DEFAULTS.handlingThresholdMm }),
    field("orderCeilingMm", "Order ceiling (longest piece)", "mm", { min: 1, max: 30000, default: FLASHING_RULE_DEFAULTS.orderCeilingMm }),
  ],
  outputs: ["pieces"],
  /** @param {{rawLengthMm:number}} input */
  calculate(input, params) {
    return measuredRunResult(input.rawLengthMm, normaliseFlashingRules(validateParams(this, params)));
  },
};

// ── finished_piece_count@1 — manual / counted finished pieces ─────────────────
const finishedPieceCount = {
  key: "finished_piece_count",
  version: 1,
  status: "production",
  label: "Finished pieces — manual or counted",
  roles: ["count", "manual"],
  fields: flashingRuns.fields.filter((f) => f.key !== "allowanceMm" && f.key !== "incrementMm"),
  outputs: ["pieces"],
  calculate(input, params) {
    const p = validateParams(this, params);
    return manualPieceResult(input.finishedLengthMm, input.quantity, { ...FLASHING_RULE_DEFAULTS, ...p });
  },
};

// ── repeated_members@1 (CONTRACT) — studs/rafters/battens at centres ──────────
const repeatedMembers = {
  key: "repeated_members",
  version: 1,
  status: "contract",
  label: "Repeated members at centres (later)",
  roles: ["distribution", "member"],
  fields: [
    field("centresMm", "Centres", "mm", { min: 1, max: 6000 }),
    field("pitchDeg", "Pitch", "deg", { min: 0, max: 75, default: 0 }),
    field("allowanceMm", "Allowance per member", "mm", { min: 0, max: 2000, default: 0 }),
    field("incrementMm", "Stock increment", "mm", { min: 1, max: 6000, default: 600 }),
    field("minStockMm", "Shortest stock", "mm", { min: 0, max: 30000, default: 0, required: false }),
    field("maxStockMm", "Longest stock", "mm", { min: 0, max: 30000, required: false }),
  ],
  outputs: ["count", "memberLength", "positions"],
  /**
   * @param {{runMm:number, memberLengthMm:number, lengthKind:"projection"|"true", stockLengthsMm?:number[]}} input
   */
  calculate(input, params) {
    const p = validateParams(this, params);
    requirePositive(input.runMm, "Distribution run");
    requirePositive(input.memberLengthMm, "Member length");
    const count = memberCount(input.runMm, p.centresMm);
    const positions = memberPositions(input.runMm, p.centresMm);
    const trueLengthMm = input.lengthKind === "projection" ? input.memberLengthMm / Math.cos(deg2rad(p.pitchDeg)) : input.memberLengthMm;
    const needMm = trueLengthMm + p.allowanceMm;
    const stock = stockLength(needMm, { incrementMm: p.incrementMm, stockLengthsMm: input.stockLengthsMm, minStockMm: p.minStockMm, maxStockMm: p.maxStockMm });
    return { count, positions, trueLengthMm, requiredLengthMm: needMm, ...stock };
  },
};

/** Endpoints included: ceil(run/centres) + 1. Zero-length runs are invalid. */
export function memberCount(runMm, centresMm) {
  requirePositive(runMm, "Distribution run");
  requirePositive(centresMm, "Centres");
  return ceilToIncrement(runMm, centresMm) / centresMm + 1;
}

/** Members at 0, c, 2c… with the final member AT the run end — never beyond it. */
export function memberPositions(runMm, centresMm) {
  const n = memberCount(runMm, centresMm);
  const out = [];
  for (let i = 0; i < n - 1; i++) out.push(i * centresMm);
  out.push(runMm);
  return out;
}

/**
 * Stock selection. Explicit sorted stock list wins; otherwise round up to the increment within
 * [min, max]. Nothing fits → unavailable (never clamp to longest, never auto-splice).
 */
export function stockLength(needMm, { incrementMm = 600, stockLengthsMm, minStockMm = 0, maxStockMm } = {}) {
  requirePositive(needMm, "Required length");
  if (Array.isArray(stockLengthsMm) && stockLengthsMm.length) {
    const sorted = stockLengthsMm.filter(isFiniteNumber).slice().sort((a, b) => a - b);
    const fit = sorted.find((s) => s >= needMm - 1e-6);
    return fit ? { stockLengthMm: fit, available: true } : { stockLengthMm: null, available: false, reason: "No listed stock length is long enough." };
  }
  let len = ceilToIncrement(needMm, incrementMm);
  if (minStockMm && len < minStockMm) len = ceilToIncrement(minStockMm, incrementMm);
  if (maxStockMm && len > maxStockMm) return { stockLengthMm: null, available: false, reason: "Longer than the longest available stock." };
  return { stockLengthMm: len, available: true };
}

// ── sheet_wall@1 (CONTRACT) — simple blank wall sheet count ───────────────────
const sheetWall = {
  key: "sheet_wall",
  version: 1,
  status: "contract",
  label: "Wall sheeting — simple blank wall (later)",
  roles: ["wall"],
  fields: [
    field("effectiveCoverMm", "Effective cover", "mm", { min: 1, max: 3000 }),
    field("maxSheetHeightMm", "Available sheet height", "mm", { min: 1, max: 30000 }),
  ],
  outputs: ["sheets"],
  /** @param {{wallLengthMm:number, wallHeightMm:number, verticalJointRule?:object|null}} input */
  calculate(input, params) {
    const p = validateParams(this, params);
    requirePositive(input.wallLengthMm, "Wall length");
    requirePositive(input.wallHeightMm, "Wall height");
    if (input.wallHeightMm > p.maxSheetHeightMm + 1e-6 && !input.verticalJointRule) {
      return { status: "needs_rule", sheets: null, message: "Wall is taller than the available sheet and no reviewed joint rule exists." };
    }
    return { status: "ok", sheets: ceilToIncrement(input.wallLengthMm, p.effectiveCoverMm) / p.effectiveCoverMm, sheetHeightMm: input.wallHeightMm };
  },
};

// ── area_to_linear@1 (CONTRACT) — net area / effective cover ──────────────────
const areaToLinear = {
  key: "area_to_linear",
  version: 1,
  status: "contract",
  label: "Area to linear metres (later)",
  roles: ["area"],
  fields: [
    field("effectiveCoverM", "Effective cover", "m", { min: 0.001, max: 5 }),
    field("wastePct", "Waste", "%", { min: 0, max: 100, default: 0 }),
    field("roundToM", "Round up to", "m", { min: 0, max: 100, default: 0 }),
  ],
  outputs: ["linearMetres"],
  /** @param {{netAreaM2:number, nominalWidthM?:number}} input  (nominal width is informational only) */
  calculate(input, params) {
    const p = validateParams(this, params);
    requirePositive(input.netAreaM2, "Net area");
    const base = Number((input.netAreaM2 / p.effectiveCoverM).toFixed(6));
    const withWaste = Number((base * (1 + p.wastePct / 100)).toFixed(6));
    const rounded = p.roundToM ? Number((Math.ceil(withWaste / p.roundToM - 1e-9) * p.roundToM).toFixed(6)) : withWaste;
    return { baseLinearM: base, withWasteM: withWaste, orderLinearM: rounded };
  },
};

// ── TC-R04 generic methods (calculation in shared/takeoff/engine/*, dispatched by engine/dispatch.js) ──
// Registry entries declare roles, families and outputs only. Historical versions above are NOT redefined.
const generic = (key, version, label, families, roles, outputs) => Object.freeze({ key, version, status: "production", label, families, roles, fields: [], outputs, generic: true });
const GENERIC = [
  generic("repeated_members", 2, "Timber — repeated members (rafters, joists, battens)", ["timber"], ["distribution", "member", "manual", "count"], ["linearDemands"]),
  generic("wall_frame", 1, "Timber — stud wall frame", ["timber"], ["wall", "opening", "distribution", "manual"], ["linearDemands"]),
  generic("linear_stock", 1, "Linear stock — plates, noggins, trim, aluminium profiles", ["timber", "aluminium"], ["primary", "path", "opening", "wall", "manual", "count", "offcut"], ["linearDemands", "allocation"]),
  generic("sheet_layout", 2, "Cladding — sheet layout (Axon, Rendex)", ["cladding", "foam"], ["wall", "opening", "surface"], ["sheetDemands", "layout"]),
  generic("course_layout", 1, "Cladding — horizontal/vertical courses (Linea, Stria, timber boards)", ["cladding", "timber-cladding"], ["wall", "opening", "surface"], ["linearDemands", "layout"]),
  generic("panel_grid", 1, "Cladding — expressed-joint panel grid (Matrix)", ["cladding"], ["wall", "opening", "surface"], ["sheetDemands", "layout"]),
  generic("aac_panel_layout", 1, "AAC panels (Walsc, Hebel)", ["aac"], ["wall", "opening", "surface"], ["sheetDemands", "layout"]),
  generic("area_to_linear", 2, "Timber cladding — area to LM (random lengths)", ["timber-cladding"], ["wall", "opening", "surface", "manual"], ["lmDemand"]),
  generic("support_grid", 1, "Supports / battens for a wall", ["batten", "timber"], ["wall", "opening"], ["linearDemands", "layout"]),
  generic("accessory_routes", 1, "Accessories (trims, membrane, tape, sealant, fixings)", ["accessory"], ["wall", "opening"], ["mixedDemands"]),
];

export const METHODS = Object.freeze({
  "flashing_runs@1": flashingRuns,
  "finished_piece_count@1": finishedPieceCount,
  "repeated_members@1": repeatedMembers,
  "sheet_wall@1": sheetWall,
  "area_to_linear@1": areaToLinear,
  ...Object.fromEntries(GENERIC.map((m) => [`${m.key}@${m.version}`, m])),
});

export function methodId(key, version) {
  return `${key}@${version}`;
}

/** Look up a method; throws for unknown keys (never eval, never fall back). */
export function getMethod(key, version) {
  const m = METHODS[methodId(key, version)];
  if (!m) throw new TakeoffValidationError("That calculation method is not available.");
  return m;
}

export function productionMethods() {
  return Object.values(METHODS).filter((m) => m.status === "production");
}
