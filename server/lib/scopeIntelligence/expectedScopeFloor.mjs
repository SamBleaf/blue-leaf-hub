/**
 * Expected-scope floor — the minimum trade set that is effectively ALWAYS present
 * for a given project type. The Scope Intelligence Engine must never silently omit
 * these: a floor trade that the extractor didn't find is surfaced as
 * `expected_missing` (confirm/deny), not dropped.
 *
 * Seed values are Sam-provided (2026-06). The full engine (see
 * docs/agent_knowledge/SCOPE_INTELLIGENCE_ENGINE_AGENT_PROMPT.md) is intended to
 * LEARN proposed additions to this floor from the accuracy cascade; this module is
 * the deterministic seed it starts from.
 *
 * All keys are the canonical 36-trade vocabulary (tradeMasterLibrary.mjs / rfqExtraction.js).
 */

// Set A — new build & renovation
const FLOOR_NEW_BUILD = [
  "excavation",
  "concrete_footings",
  "roof_plumber",
  "electrical_data",
  "plumbing",
  "internal_linings",
  "painting"
];

// Set B — extension / addition = Set A + termite + windows
const FLOOR_EXTENSION = [...FLOOR_NEW_BUILD, "termite_protection", "windows_skylights"];

/** Canonical project_type → floor trade keys. Aliases normalised in floorForProjectType(). */
const FLOOR_BY_PROJECT_TYPE = {
  new_build: FLOOR_NEW_BUILD,
  renovation: FLOOR_NEW_BUILD,
  knockdown_rebuild: FLOOR_NEW_BUILD,
  extension: FLOOR_EXTENSION,
  addition: FLOOR_EXTENSION
};

function normProjectType(projectType) {
  const t = String(projectType || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!t) return "";
  if (t.includes("extension") || t.includes("addition")) return "extension";
  if (t.includes("knockdown") || t.includes("kdr")) return "knockdown_rebuild";
  if (t.includes("reno")) return "renovation";
  if (t.includes("new") || t.includes("custom") || t.includes("build")) return "new_build";
  return t;
}

/**
 * The expected floor trade keys for a project type.
 * Unknown/blank project types return [] (no floor enforced — fail open, not closed).
 * @returns {string[]}
 */
export function floorForProjectType(projectType) {
  const key = normProjectType(projectType);
  return FLOOR_BY_PROJECT_TYPE[key] ? [...FLOOR_BY_PROJECT_TYPE[key]] : [];
}

/**
 * Reconcile an extracted trade-key set against the floor for a project type.
 * @param {string[]} extractedTradeKeys - canonical keys the extractor produced
 * @param {string} projectType
 * @returns {{ expected: string[], satisfied: string[], missing: string[] }}
 */
export function reconcileFloor(extractedTradeKeys, projectType) {
  const expected = floorForProjectType(projectType);
  const present = new Set(extractedTradeKeys || []);
  const satisfied = expected.filter((k) => present.has(k));
  const missing = expected.filter((k) => !present.has(k));
  return { expected, satisfied, missing };
}

export const _internal = { FLOOR_NEW_BUILD, FLOOR_EXTENSION, FLOOR_BY_PROJECT_TYPE, normProjectType };
