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
  "location", "site",
];

/** @type {Array<{key:string,label:string,family:string,spine:string,type:string,tier:string,store:{table:string,column:string}|null,compute?:string,sourceDocs?:string[],consumers?:string[]}>} */
export const FACT_REGISTRY = [
  // ── Identity (job spine) ────────────────────────────────────────────────────
  { key: "address", label: "Site address", family: "identity", spine: "job", type: "versioned", tier: "consequential",
    store: { table: "jobs", column: "address" }, sourceDocs: ["contract"], consumers: ["all"] },
  { key: "address_suburb", label: "Suburb", family: "identity", spine: "job", type: "versioned", tier: "internal",
    store: { table: "jobs", column: "address_suburb" }, consumers: ["marketing", "lookup"] },
  { key: "address_normalised", label: "Normalised address (match key)", family: "identity", spine: "job", type: "versioned", tier: "internal",
    store: { table: "jobs", column: "address_normalised" }, consumers: ["lookup", "buildexact", "dedup"] },
  { key: "address_postcode", label: "Postcode", family: "identity", spine: "job", type: "versioned", tier: "internal",
    store: { table: "jobs", column: "address_postcode" }, consumers: ["marketing", "lookup"] },
  { key: "address_state", label: "State", family: "identity", spine: "job", type: "versioned", tier: "internal",
    store: { table: "jobs", column: "address_state" }, consumers: ["marketing", "lookup"] },
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
  // Foundation type drives WHS controls (excavation/formwork) + cost — 🔴 (§26 frame/slab family).
  // Column added by mig 069 (project_metrics.foundation_type).
  { key: "foundation_type", label: "Foundation type", family: "facts", spine: "job", type: "static", tier: "consequential",
    store: { table: "project_metrics", column: "foundation_type" }, sourceDocs: ["structural", "geotech"], consumers: ["whs", "cost"] },
  // Planning/compliance overlays — wrong value → non-compliant build/WHS gaps. §26 lists
  // "bushfire/flood overlay" as 🔴. Columns added by mig 069 (project_metrics.{bushfire,flood,heritage}_overlay).
  { key: "bushfire_overlay", label: "Bushfire overlay", family: "facts", spine: "job", type: "static", tier: "consequential",
    store: { table: "project_metrics", column: "bushfire_overlay" }, sourceDocs: ["bal_report", "planning"], consumers: ["whs", "compliance", "rfq"] },
  { key: "flood_overlay", label: "Flood overlay", family: "facts", spine: "job", type: "static", tier: "consequential",
    store: { table: "project_metrics", column: "flood_overlay" }, sourceDocs: ["planning", "survey"], consumers: ["whs", "compliance"] },
  { key: "heritage_overlay", label: "Heritage overlay", family: "facts", spine: "job", type: "static", tier: "consequential",
    store: { table: "project_metrics", column: "heritage_overlay" }, sourceDocs: ["planning"], consumers: ["compliance"] },
  // Internal area / count metrics extracted from plans (Phase 4). Pure cost-estimation
  // inputs — none drive WHS/compliance/money, so tier 'internal' (auto-apply at >=0.90).
  // Columns all exist on project_metrics (mig 032). Registered so the plan-extraction
  // writer can route them through setFact with provenance.
  { key: "garage_area_m2", label: "Garage area (m²)", family: "facts", spine: "job", type: "static", tier: "internal",
    store: { table: "project_metrics", column: "garage_area_m2" }, sourceDocs: ["architectural"], consumers: ["cost", "rfq"] },
  { key: "alfresco_area_m2", label: "Alfresco area (m²)", family: "facts", spine: "job", type: "static", tier: "internal",
    store: { table: "project_metrics", column: "alfresco_area_m2" }, sourceDocs: ["architectural"], consumers: ["cost", "rfq"] },
  { key: "deck_area_m2", label: "Deck area (m²)", family: "facts", spine: "job", type: "static", tier: "internal",
    store: { table: "project_metrics", column: "deck_area_m2" }, sourceDocs: ["architectural"], consumers: ["cost", "rfq"] },
  { key: "wall_area_m2", label: "Wall area (m²)", family: "facts", spine: "job", type: "static", tier: "internal",
    store: { table: "project_metrics", column: "wall_area_m2" }, sourceDocs: ["architectural"], consumers: ["cost", "rfq"] },
  { key: "wet_areas", label: "Wet areas (count)", family: "facts", spine: "job", type: "static", tier: "internal",
    store: { table: "project_metrics", column: "wet_areas" }, sourceDocs: ["architectural"], consumers: ["cost", "rfq"] },
  { key: "number_of_windows", label: "Number of windows", family: "facts", spine: "job", type: "static", tier: "internal",
    store: { table: "project_metrics", column: "number_of_windows" }, sourceDocs: ["architectural"], consumers: ["cost", "rfq"] },
  { key: "number_of_doors", label: "Number of doors", family: "facts", spine: "job", type: "static", tier: "internal",
    store: { table: "project_metrics", column: "number_of_doors" }, sourceDocs: ["architectural"], consumers: ["cost", "rfq"] },
  { key: "has_raked_ceilings", label: "Raked ceilings", family: "facts", spine: "job", type: "static", tier: "internal",
    store: { table: "project_metrics", column: "has_raked_ceilings" }, sourceDocs: ["architectural"], consumers: ["cost"] },
  { key: "has_skillion_roof", label: "Skillion roof", family: "facts", spine: "job", type: "static", tier: "internal",
    store: { table: "project_metrics", column: "has_skillion_roof" }, sourceDocs: ["architectural"], consumers: ["cost", "rfq"] },

  // ── Metrics (job spine) ─────────────────────────────────────────────────────
  // Deal-value estimate carried from the lead at conversion (Phase 2). Internal tier:
  // it's a sales/forecasting figure, NOT the contract money. The consequential money
  // facts are original_contract_value / contract_value (set at WIN by Phase 5) — keep
  // estimated_value separate so the carry never touches them.
  { key: "estimated_value", label: "Estimated value (lead)", family: "metrics", spine: "job", type: "versioned", tier: "internal",
    store: { table: "jobs", column: "estimated_value" }, consumers: ["sales", "pipeline", "reporting"] },
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

  // ── Location (derived from address via Mapbox geocoding) ────────────────────
  // All geo facts are `generated` (derived from the `address` fact) and `internal`
  // tier (spatial coordinates have no direct financial/compliance consequence on
  // their own — wrong coords are correctable without harm). They are stored on jobs
  // so they can be read by any module without re-geocoding.
  // `compute:"geocode"` signals that geocodeService.mjs produces these values.
  { key: "geo_lat", label: "Latitude", family: "location", spine: "job", type: "generated", tier: "internal",
    store: { table: "jobs", column: "geo_lat" }, compute: "geocode",
    consumers: ["marketing", "ops", "sales", "workforce", "scheduling"] },
  { key: "geo_lng", label: "Longitude", family: "location", spine: "job", type: "generated", tier: "internal",
    store: { table: "jobs", column: "geo_lng" }, compute: "geocode",
    consumers: ["marketing", "ops", "sales", "workforce", "scheduling"] },
  { key: "geo_confidence", label: "Geocode confidence", family: "location", spine: "job", type: "generated", tier: "internal",
    store: { table: "jobs", column: "geo_confidence" }, compute: "geocode",
    consumers: ["marketing", "ops", "sales"] },
  { key: "geo_geocoded_at", label: "Geocoded at", family: "location", spine: "job", type: "generated", tier: "internal",
    store: { table: "jobs", column: "geo_geocoded_at" }, compute: "geocode",
    consumers: ["ops"] },
  { key: "geo_place_id", label: "Mapbox place ID", family: "location", spine: "job", type: "generated", tier: "internal",
    store: { table: "jobs", column: "geo_place_id" }, compute: "geocode",
    consumers: ["ops", "site_intelligence"] },
  { key: "geo_precision", label: "Geocode precision grain", family: "location", spine: "job", type: "generated", tier: "internal",
    store: { table: "jobs", column: "geo_precision" }, compute: "geocode",
    consumers: ["marketing", "ops", "sales"] },

  // ── Site intelligence (derived from coordinates via free government + Mapbox layers) ──
  // All site facts are `generated` (derived from geo_lat/geo_lng via siteEnrichmentService.mjs)
  // and `internal` tier — they are advisory signals for a human, never authoritative
  // compliance/planning determinations. `compute:"enrich"` signals the producer.
  // Columns added by mig 135 to both jobs + leads.
  { key: "site_council", label: "Council / LGA", family: "site", spine: "job", type: "generated", tier: "internal",
    store: { table: "jobs", column: "site_council" }, compute: "enrich",
    consumers: ["sales", "estimating"] },
  { key: "site_bushfire_prone", label: "Bushfire-prone overlay (y/n)", family: "site", spine: "job", type: "generated", tier: "internal",
    store: { table: "jobs", column: "site_bushfire_prone" }, compute: "enrich",
    consumers: ["sales", "estimating"] },
  { key: "site_zone", label: "P&D Code zone", family: "site", spine: "job", type: "generated", tier: "internal",
    store: { table: "jobs", column: "site_zone" }, compute: "enrich",
    consumers: ["sales", "estimating"] },
  { key: "site_slope_band", label: "Slope band", family: "site", spine: "job", type: "generated", tier: "internal",
    store: { table: "jobs", column: "site_slope_band" }, compute: "enrich",
    consumers: ["sales", "estimating"] },
  { key: "site_complexity", label: "Site complexity (derived)", family: "site", spine: "job", type: "generated", tier: "internal",
    store: { table: "jobs", column: "site_complexity" }, compute: "enrich",
    consumers: ["sales", "estimating"] },
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
