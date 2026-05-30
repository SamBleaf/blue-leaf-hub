// jobFactRegistry.mjs — the single naming authority for canonical facts.
// See docs/agent_knowledge/MASTER_DATA_DICTIONARY.md (Parts 2-5).
//
// Every fact: canonical key, family, spine, data type, confirmation tier, and its
// STORAGE location (which table.column holds the value). The facts service reads/
// writes exclusively through this map so no module keeps its own copy.
//
// type:  'static'    — set once, rarely changes
//        'versioned' — changes over time (logged to job_fact_history)
//        'generated' — a function of other facts; NEVER stored as editable
// tier:  'consequential' — wrong value → harm/lost income/dispute/compliance → ALWAYS confirm
//        'internal'      — low impact → auto-apply at >=0.90 confidence
// store: { table, column } for stored facts; null for generated (use `compute`).
//        table 'jobs' is keyed by jobs.id; 'project_metrics' is keyed by job_id (upsert).
//
// v1 registers the highest-value / highest-blast-radius facts. Extend as modules migrate.

export const FAMILIES = [
  "identity", "facts", "relationships", "metrics", "risks", "business_intelligence", "site_intelligence",
];

/** @type {Array<{key:string,label:string,family:string,spine:string,type:string,tier:string,store:{table:string,column:string}|null,compute?:string,sourceDocs?:string[],consumers?:string[]}>} */
export const FACT_REGISTRY = [
  // ── Identity (job spine) ────────────────────────────────────────────────────
  { key: "address", label: "Site address", family: "identity", spine: "job", type: "versioned", tier: "consequential",
    store: { table: "jobs", column: "address" }, sourceDocs: ["contract"], consumers: ["all"] },
  { key: "address_suburb", label: "Suburb", family: "identity", spine: "job", type: "versioned", tier: "internal",
    store: { table: "jobs", column: "address_suburb" }, consumers: ["marketing", "lookup"] },
  { key: "client_name", label: "Client name", family: "identity", spine: "job", type: "versioned", tier: "consequential",
    store: { table: "jobs", column: "client_name" }, consumers: ["finance", "portal", "marketing"] },
  { key: "project_type", label: "Project type", family: "identity", spine: "job", type: "versioned", tier: "consequential",
    store: { table: "jobs", column: "project_type" }, consumers: ["whs", "schedule", "cost", "reporting"] },
  { key: "architect_name", label: "Architect", family: "relationships", spine: "job", type: "versioned", tier: "internal",
    store: { table: "jobs", column: "architect_name" }, consumers: ["fee_proposal", "whs", "marketing"] },
  { key: "client_email", label: "Client email", family: "relationships", spine: "job", type: "versioned", tier: "consequential",
    store: { table: "jobs", column: "client_email" }, consumers: ["portal", "claims", "variations"] },
  { key: "client_phone", label: "Client phone", family: "relationships", spine: "job", type: "versioned", tier: "consequential",
    store: { table: "jobs", column: "client_phone" }, consumers: ["portal"] },

  // ── Building facts (job spine, project_metrics) ─────────────────────────────
  { key: "storeys", label: "Storeys", family: "facts", spine: "job", type: "static", tier: "consequential",
    store: { table: "project_metrics", column: "storeys" }, sourceDocs: ["architectural", "structural"],
    consumers: ["whs", "schedule", "cost", "rfq", "portal", "marketing"] },
  { key: "floor_area_m2", label: "Floor area (m²)", family: "facts", spine: "job", type: "static", tier: "internal",
    store: { table: "project_metrics", column: "floor_area_m2" }, sourceDocs: ["architectural"], consumers: ["cost", "rfq", "carpentry"] },
  { key: "roof_area_m2", label: "Roof area (m²)", family: "facts", spine: "job", type: "static", tier: "internal",
    store: { table: "project_metrics", column: "roof_area_m2" }, sourceDocs: ["architectural"], consumers: ["cost", "rfq"] },
  { key: "frame_type", label: "Frame type", family: "facts", spine: "job", type: "static", tier: "consequential",
    store: { table: "project_metrics", column: "frame_type" }, sourceDocs: ["structural", "architectural"], consumers: ["whs", "rfq", "cost"] },
  { key: "roof_structure_type", label: "Roof structure", family: "facts", spine: "job", type: "static", tier: "consequential",
    store: { table: "project_metrics", column: "roof_structure_type" }, sourceDocs: ["architectural"], consumers: ["whs", "rfq"] },
  { key: "roof_type", label: "Roof cladding/type", family: "facts", spine: "job", type: "static", tier: "consequential",
    store: { table: "project_metrics", column: "roof_type" }, sourceDocs: ["architectural"], consumers: ["whs", "rfq", "marketing"] },
  { key: "wall_type", label: "Wall type", family: "facts", spine: "job", type: "static", tier: "internal",
    store: { table: "project_metrics", column: "wall_type" }, sourceDocs: ["architectural"], consumers: ["cost", "rfq"] },
  { key: "site_slope", label: "Site slope", family: "facts", spine: "job", type: "static", tier: "consequential",
    store: { table: "project_metrics", column: "site_slope" }, sourceDocs: ["survey", "architectural"], consumers: ["whs", "cost"] },
  { key: "has_suspended_slab", label: "Suspended slab", family: "facts", spine: "job", type: "static", tier: "consequential",
    store: { table: "project_metrics", column: "has_suspended_slab" }, sourceDocs: ["structural"], consumers: ["whs", "cost"] },
  { key: "has_retaining_walls", label: "Retaining walls", family: "facts", spine: "job", type: "static", tier: "consequential",
    store: { table: "project_metrics", column: "has_retaining_walls" }, sourceDocs: ["architectural", "geotech"], consumers: ["whs", "cost"] },
  { key: "has_basement", label: "Basement", family: "facts", spine: "job", type: "static", tier: "consequential",
    store: { table: "project_metrics", column: "has_basement" }, sourceDocs: ["architectural"], consumers: ["whs", "cost"] },
  { key: "has_structural_steel", label: "Structural steel", family: "facts", spine: "job", type: "static", tier: "consequential",
    store: { table: "project_metrics", column: "has_structural_steel" }, sourceDocs: ["structural"], consumers: ["whs", "rfq"] },
  { key: "has_demolition", label: "Demolition required", family: "facts", spine: "job", type: "static", tier: "consequential",
    store: { table: "project_metrics", column: "has_demolition" }, sourceDocs: ["architectural"], consumers: ["whs", "schedule"] },
  { key: "building_age", label: "Building age", family: "facts", spine: "job", type: "static", tier: "consequential",
    store: { table: "project_metrics", column: "building_age" }, sourceDocs: ["specification"], consumers: ["whs"] },
  { key: "bal_rating", label: "BAL rating", family: "facts", spine: "job", type: "static", tier: "consequential",
    store: { table: "project_metrics", column: "bal_rating" }, sourceDocs: ["bal_report"], consumers: ["whs", "rfq", "compliance"] },
  { key: "energy_rating", label: "Energy rating", family: "facts", spine: "job", type: "static", tier: "consequential",
    store: { table: "project_metrics", column: "energy_rating" }, sourceDocs: ["energy_report"], consumers: ["compliance"] },
  { key: "building_height_m", label: "Building height (m)", family: "facts", spine: "job", type: "static", tier: "consequential",
    store: { table: "project_metrics", column: "building_height_m" }, sourceDocs: ["architectural"], consumers: ["whs", "compliance"] },

  // ── Metrics (job spine) ─────────────────────────────────────────────────────
  { key: "original_contract_value", label: "Original contract value", family: "metrics", spine: "job", type: "static", tier: "consequential",
    store: { table: "jobs", column: "original_contract_value" }, sourceDocs: ["contract"], consumers: ["finance", "margin"] },
  { key: "contract_value", label: "Contract value", family: "metrics", spine: "job", type: "generated", tier: "consequential",
    store: null, compute: "contractValue", consumers: ["finance", "wipaa", "portal", "director"] },
  { key: "actual_costs", label: "Actual costs", family: "metrics", spine: "job", type: "generated", tier: "consequential",
    store: null, compute: "actualCosts", consumers: ["finance", "margin", "cost"] },
  { key: "forecast_margin_pct", label: "Forecast margin %", family: "metrics", spine: "job", type: "generated", tier: "consequential",
    store: null, compute: "forecastMarginPct", consumers: ["finance", "director"] },

  // ── Business intelligence ───────────────────────────────────────────────────
  { key: "target_margin_pct", label: "Target margin %", family: "business_intelligence", spine: "job", type: "versioned", tier: "consequential",
    store: { table: "jobs", column: "target_margin_pct" }, consumers: ["finance", "pretender"] },
];

// Remove any accidental duplicate-key entries (keep first).
const _seen = new Set();
const _registry = FACT_REGISTRY.filter((f) => {
  if (_seen.has(f.key)) return false;
  _seen.add(f.key);
  return true;
});

const _byKey = new Map(_registry.map((f) => [f.key, f]));

export function getFactDef(key) {
  return _byKey.get(key) || null;
}
export function allFacts() {
  return _registry.slice();
}
export function factsForSpine(spine) {
  return _registry.filter((f) => f.spine === spine);
}
export function factsForTable(table) {
  return _registry.filter((f) => f.store && f.store.table === table);
}
export function isGenerated(key) {
  const f = _byKey.get(key);
  return !!f && f.type === "generated";
}
export function tierOf(key) {
  const f = _byKey.get(key);
  return f ? f.tier : null;
}
