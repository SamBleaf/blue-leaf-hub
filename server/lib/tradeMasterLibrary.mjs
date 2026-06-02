/**
 * Canonical trade master library — Blue Leaf standard + Buildxact estimate mapping.
 */
import { getBuildexactCategoryMapping } from "./buildexactParser.mjs";

/** AI extraction canonical keys (must match dev-api + rfqExtraction.js RFQ_TRADE_ORDER). */
export const RFQ_TRADE_ORDER = [
  // Site & civil
  "site_establishment",
  "excavation",
  "demolition",
  "termite_protection",
  // Structure
  "concrete_footings",
  "structural_steel",
  "carpentry",
  // Envelope
  "external_cladding",
  "windows_skylights",
  "roof_plumber",
  "masonry",
  "glazing",
  // Mechanical / electrical
  "electrical_data",
  "lighting_automation",
  "plumbing",
  "sanitary_ware",
  "heating_cooling",
  "solar_batteries",
  // Interior fit-out
  "insulation",
  "internal_linings",
  "plastering_rendering",
  "painting",
  "stairs",
  "joinery",
  "tiling",
  "flooring",
  "window_furnishings",
  "garage_door",
  "appliances",
  "door_hardware",
  "fixtures_fittings",
  // External
  "landscaping",
  "paving",
  "fencing",
  "pool_works",
  "site_cleaner"
];

/** @typedef {{ trade_id: string, trade_name: string, trade_category: string, subcategory?: string, buildxact_category?: string, buildxact_trade_key?: string, quote_required?: boolean, priority?: number, contractor_tags?: string[], default_rfq_template?: string[], default_attachments?: string[] }} TradeMasterRow */

export const TRADE_LABELS = {
  // ── Canonical IDs (match frontend TRADE_DISPLAY_ORDER in rfqTradeRegistry.js) ──
  site_establishment: "Site Establishment",
  excavation: "Excavation",
  demolition: "Demolition / Civil",
  termite_protection: "Termite Treatment",
  concrete_footings: "Concrete & Footings",
  structural_steel: "Structural Steel",
  carpentry: "Carpentry",
  external_cladding: "External Cladding",
  windows_skylights: "Windows / Skylights",
  roof_plumber: "Roof Plumber",
  masonry: "Masonry",
  glazing: "Glazing",
  electrical_data: "Electrical & Data",
  lighting_automation: "Lighting & Automation",
  plumbing: "Plumbing",
  sanitary_ware: "Sanitary Ware",
  heating_cooling: "Heating & Cooling",
  solar_batteries: "Solar & Batteries",
  insulation: "Insulation",
  internal_linings: "Internal Linings",
  plastering_rendering: "Plastering & Rendering",
  painting: "Painting",
  stairs: "Stairs",
  joinery: "Joinery",
  tiling: "Tiling",
  flooring: "Floor Coverings",
  window_furnishings: "Window Furnishings",
  garage_door: "Garage Door",
  appliances: "Appliances",
  door_hardware: "Door Hardware",
  fixtures_fittings: "Fixtures & Fittings",
  landscaping: "Landscaping",
  paving: "Paving",
  fencing: "Fencing",
  pool_works: "Pool Works",
  site_cleaner: "Site Cleaner",
  // ── Legacy IDs — kept for backward compat with old DB data ──
  footings_concrete_formwork: "Concrete & Footings",
  scaffolding: "Scaffolding",
  carpentry_joinery: "Framing / Carpentry",
  carpentry_fitout: "Joinery / Fit-out Carpentry",
  metal_roofing: "Roofing",
  roof_plumbing: "Roof Plumbing",
  glazing_windows: "Windows & Glazing",
  brickwork: "Brickwork / Masonry",
  rendering: "Render",
  electrical: "Electrical",
  hvac: "Heating & Cooling",
  solar: "Solar & Batteries",
  waterproofing: "Waterproofing",
  stone_benchtops: "Stone Benchtops",
  shower_screens: "Shower Screens",
  mirrors: "Mirrors",
  balustrade: "Balustrades",
  driveways: "Driveways & Paving",
  retaining_walls: "Retaining Walls",
  pergolas: "Pergolas",
  decking: "Decking",
  pool: "Pool Works",
  stormwater: "Stormwater / Drainage",
  garage_doors: "Garage Doors",
  cabinetry: "Cabinetry / Kitchen",
  plastering: "Plastering",
  suspended_ceilings: "Suspended Ceilings",
  skylights: "Skylights",
  blinds_curtains: "Window Furnishings",
  cleaning: "Final Clean",
  site_safety: "Site Safety / Hoarding",
  fixtures: "Fixtures & Fittings",
  sanitary: "Sanitary Ware",
  lighting: "Lighting & Automation",
  demolition_civil: "Demolition / Civil & Earthworks",
  tiler: "Tiling",
  preliminaries: "Preliminaries (PC only)"
};

/** Buildxact tradeKey (buildexactParser CATEGORY_MAPPING) → canonical RFQ package trade_id */
export const BUILDXACT_KEY_TO_RFQ = {
  preliminaries: null,
  hire: "site_establishment",
  site_establishment: "site_establishment",
  demolition: "demolition",
  concrete: "concrete_footings",
  termite: "termite_protection",
  steel: "structural_steel",
  carpentry: "carpentry",
  windows: "windows_skylights",
  cladding: "external_cladding",
  roofing: "roof_plumber",
  masonry: "masonry",
  electrical: "electrical_data",
  lighting: "lighting_automation",
  plumbing: "plumbing",
  sanitary: "sanitary_ware",
  stairs: "stairs",
  insulation: "insulation",
  linings: "internal_linings",
  tiling: "tiling",
  waterproofing: "tiling",
  joinery: "joinery",
  painting: "painting",
  garage_door: "garage_door",
  plastering: "plastering_rendering",
  flooring: "flooring",
  blinds: "window_furnishings",
  appliances: "appliances",
  door_hardware: "door_hardware",
  fixtures: "fixtures_fittings",
  glazing: "glazing",
  solar: "solar_batteries",
  hvac: "heating_cooling",
  landscaping: "landscaping",
  paving: "paving",
  fencing: "fencing",
  pool: "pool_works",
  cleaning: "site_cleaner"
};

// One row per canonical trade_id (matching RFQ_TRADE_ORDER / rfqExtraction.js).
// [trade_id, trade_name, trade_category, subcategory, buildxact_category, buildxact_trade_key, quote_required, priority]
const SEED_ROWS = [
  // Site & civil
  ["site_establishment", "Site Establishment", "site_works", "establishment", "Site Establishment", "site_establishment", false, 40],
  ["excavation", "Excavation", "site_works", "earthworks", "Demolition / Civil", "demolition", true, 90],
  ["demolition", "Demolition / Civil", "site_works", "demolition", "Demolition / Civil", "demolition", true, 88],
  ["termite_protection", "Termite Treatment", "substructure", "termite", "Termite Protection", "termite", true, 85],
  // Structure
  ["concrete_footings", "Concrete & Footings", "substructure", "concrete", "Concrete & Footings", "concrete", true, 92],
  ["structural_steel", "Structural Steel", "frame", "steel", "Structural Steel", "steel", true, 80],
  ["carpentry", "Carpentry", "frame", "framing", "Carpentry", "carpentry", true, 95],
  // Envelope
  ["external_cladding", "External Cladding", "envelope", "cladding", "External Cladding", "cladding", true, 86],
  ["windows_skylights", "Windows / Skylights", "envelope", "windows", "Windows / Skylights", "windows", true, 88],
  ["roof_plumber", "Roof Plumber", "envelope", "roof", "Roof Plumber", "roofing", true, 90],
  ["masonry", "Masonry", "envelope", "masonry", "Masonry", "masonry", true, 84],
  ["glazing", "Glazing", "envelope", "glass", "Glazing", "glazing", true, 72],
  // Mechanical / electrical
  ["electrical_data", "Electrical & Data", "services", "electrical", "Electrical & Data", "electrical", true, 94],
  ["lighting_automation", "Lighting & Automation", "services", "lighting", "Lighting & Automation", "lighting", false, 58],
  ["plumbing", "Plumbing", "services", "hydraulics", "Plumbing", "plumbing", true, 94],
  ["sanitary_ware", "Sanitary Ware", "fitout", "sanitary", "Sanitary Ware", "sanitary", false, 55],
  ["heating_cooling", "Heating & Cooling", "services", "hvac", "Heating & Cooling", "hvac", true, 82],
  ["solar_batteries", "Solar & Batteries", "services", "solar", "Solar & Batteries", "solar", true, 70],
  // Interior fit-out
  ["insulation", "Insulation", "fitout", "insulation", "Insulation", "insulation", true, 78],
  ["internal_linings", "Internal Linings", "fitout", "linings", "Internal Linings", "linings", true, 88],
  ["plastering_rendering", "Plastering & Rendering", "fitout", "plaster", "Plastering & Rendering", "plastering", true, 80],
  ["painting", "Painting", "fitout", "paint", "Painting", "painting", true, 90],
  ["stairs", "Stairs", "fitout", "stairs", "Stairs", "stairs", true, 74],
  ["joinery", "Joinery", "fitout", "joinery", "Joinery", "joinery", true, 86],
  ["tiling", "Tiling", "fitout", "tiles", "Tiler", "tiling", true, 88],
  ["flooring", "Floor Coverings", "fitout", "floors", "Flooring", "flooring", true, 87],
  ["window_furnishings", "Window Furnishings", "fitout", "blinds", "Window Furnishings", "blinds", true, 70],
  ["garage_door", "Garage Door", "envelope", "garage", "Garage Door", "garage_door", true, 72],
  ["appliances", "Appliances", "fitout", "appliances", "Appliances", "appliances", false, 50],
  ["door_hardware", "Door Hardware", "fitout", "hardware", "Door Hardware", "door_hardware", false, 48],
  ["fixtures_fittings", "Fixtures & Fittings", "fitout", "fixtures", "Fixtures & Fittings", "fixtures", false, 52],
  // External
  ["landscaping", "Landscaping", "external", "landscape", "Landscaping", "landscaping", true, 85],
  ["paving", "Paving", "external", "paving", "Paving", "paving", true, 80],
  ["fencing", "Fencing", "external", "fence", "Fencing", "fencing", true, 78],
  ["pool_works", "Pool Works", "external", "pool", "Pool Works", "pool", true, 55],
  ["site_cleaner", "Site Cleaner", "completion", "clean", "Site Cleaner", "cleaning", true, 88]
];

/** @returns {TradeMasterRow[]} */
export function getTradeMasterSeed() {
  return SEED_ROWS.map(([trade_id, trade_name, trade_category, subcategory, buildxact_category, buildxact_trade_key, quote_required, priority]) => ({
    trade_id,
    trade_name,
    trade_category,
    subcategory: subcategory || "",
    buildxact_category,
    buildxact_trade_key,
    quote_required: Boolean(quote_required),
    priority: Number(priority) || 50,
    contractor_tags: [],
    default_rfq_template: [],
    default_attachments: ["Plans", "Specifications"],
    default_trade_notes: "",
    is_active: true
  }));
}

export function tradeLabel(tradeId) {
  return TRADE_LABELS[tradeId] || tradeId;
}

export function rfqTradeIdFromBuildxactKey(tradeKey) {
  if (!tradeKey) return null;
  return BUILDXACT_KEY_TO_RFQ[tradeKey] || null;
}

export function rfqTradeIdFromBuildxactCategoryName(categoryName) {
  const m = getBuildexactCategoryMapping(categoryName);
  if (!m?.tradeKey) return null;
  return rfqTradeIdFromBuildxactKey(m.tradeKey);
}

/** @param {import('@supabase/supabase-js').SupabaseClient} db */
export async function loadTradeMaster(db) {
  try {
    const { loadRfqTradeLibraryFromCostIntelligence } = await import("./costIntelligenceEstimate.mjs");
    const fromCi = await loadRfqTradeLibraryFromCostIntelligence(db);
    if (fromCi?.length) return fromCi;
  } catch (e) {
    console.warn("[trade-master] cost intelligence library fallback:", e?.message || e);
  }
  const { data, error } = await db
    .from("trade_master_library")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: false });
  if (error) throw error;
  if (data?.length) return data;
  return getTradeMasterSeed();
}

/** @param {import('@supabase/supabase-js').SupabaseClient} db */
export async function seedTradeMasterLibrary(db) {
  const rows = getTradeMasterSeed().map((r) => ({
    ...r,
    updated_at: new Date().toISOString()
  }));
  const { error } = await db.from("trade_master_library").upsert(rows, { onConflict: "trade_id" });
  if (error) throw error;
  return { seeded: rows.length };
}

export function quoteRequiredTradeIds(libraryRows) {
  return libraryRows.filter((r) => r.quote_required !== false).map((r) => r.trade_id);
}
