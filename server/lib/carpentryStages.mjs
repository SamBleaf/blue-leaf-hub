// =============================================================================
// Carpentry stage taxonomy (Workforce Pipeline / Schedule Intelligence v1)
// Formalises the existing earned-value spine (carpentry_budget_line_items.canonical_key
// + timesheet_entries.task_category) into a consistent, ordered set of standard stages,
// so hours/durations/gaps compare consistently across jobs. Code-only mapping — no
// migration. Extend by adding to STAGES + the maps; do NOT depend on free-text.
//
// NOTE: one taxonomy stage may occur several times within a job (separate framing areas,
// split stages, returns). The calc layer keys stage *instances* by (job, stage) for v1;
// full stage-instance management is a FUTURE_TODO item — this structure does not prevent it.
// =============================================================================

// Ordered standard stages (drives sequencing + inter-stage gap direction).
export const STAGES = [
  { key: "mobilisation",   label: "Mobilisation & setup",     order: 10 },
  { key: "floor_system",   label: "Floor system",             order: 20 },
  { key: "wall_framing",   label: "Wall framing",             order: 30 },
  { key: "roof_framing",   label: "Roof framing",             order: 40 },
  { key: "steel_coord",    label: "Structural steel coord.",  order: 50 },
  { key: "windows_doors",  label: "Windows & external doors", order: 60 },
  { key: "wrap_membrane",  label: "Wrap & membranes",         order: 70 },
  { key: "battens_cavity", label: "Battens & cavity",         order: 80 },
  { key: "cladding",       label: "External cladding",        order: 90 },
  { key: "eaves_trims",    label: "Eaves & external trims",   order: 100 },
  { key: "first_fix",      label: "First-fix carpentry",      order: 110 },
  { key: "second_fix",     label: "Second-fix carpentry",     order: 120 },
  { key: "decks_external", label: "Decks & external",         order: 130 },
  { key: "defects_returns",label: "Defects & returns",        order: 140 },
  { key: "variations",     label: "Variations & extras",      order: 150 },
];
const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));
export const stageMeta = (key) => STAGE_BY_KEY[key] || null;
export const stageLabel = (key) => STAGE_BY_KEY[key]?.label || key || "Unstaged";
export const stageOrder = (key) => STAGE_BY_KEY[key]?.order ?? 999;

// Fine sub-task (canonical_key) → standard stage.
const CANONICAL_TO_STAGE = {
  wall_framing: "wall_framing",
  roof_framing: "roof_framing",
  window_installation: "windows_doors",
  floor_framing: "floor_system",
  battening: "battens_cavity",
  wrapping: "wrap_membrane",
  prep: "cladding",
  cladding_installation: "cladding",
  soffit_linings: "eaves_trims",
  doors: "second_fix",
  skirts_trim: "second_fix",
  brios: "second_fix",
  // material framing supply keys (rarely on a timesheet, but keep consistent)
  wall_frames: "wall_framing",
  floor_frames: "floor_system",
  roof_frame: "roof_framing",
};

// Coarse workforce task_category → standard stage (fallback when no canonical_key).
const TASKCAT_TO_STAGE = {
  first_fix_framing: "wall_framing",   // representative framing stage
  cladding: "cladding",
  second_fix: "second_fix",
  outdoor_works: "decks_external",
  formwork_slab_prep: "floor_system",
  site_labouring: "mobilisation",
  site_cleanup: "defects_returns",
  // supervision → excluded from production comparison (see isProductionCategory)
};

// Categories whose hours must NOT be counted as direct production labour.
const NON_PRODUCTION_TASKCAT = new Set(["supervision"]);
export const isProductionCategory = (taskCategory) => !NON_PRODUCTION_TASKCAT.has(String(taskCategory || ""));

// Resolve a timesheet entry (fine canonical_key preferred, coarse task_category fallback)
// to a standard stage key, or null when it can't be mapped (→ reported as unmatched, never
// silently folded into another stage).
export function resolveStage({ canonicalKey, taskCategory } = {}) {
  if (canonicalKey && CANONICAL_TO_STAGE[canonicalKey]) return CANONICAL_TO_STAGE[canonicalKey];
  if (taskCategory && TASKCAT_TO_STAGE[taskCategory]) return TASKCAT_TO_STAGE[taskCategory];
  return null;
}

export { CANONICAL_TO_STAGE, TASKCAT_TO_STAGE };
