/**
 * Build unified RFQ trade config from trade master library (labels, aliases, templates, rules).
 */
import { rulesForTrade, TRADE_EXTRACTION_RULES } from "./rfqTradeExtractionRules.mjs";
import { getTradeMasterSeed, loadTradeMaster, tradeLabel } from "./tradeMasterLibrary.mjs";

const DEFAULT_EMAIL_OPENERS = {
  // Canonical IDs (match TRADE_DISPLAY_ORDER in rfqTradeRegistry.js)
  site_establishment: "We are seeking your price for site establishment works",
  excavation: "We are seeking your price for the excavation and earthworks package",
  demolition: "We are seeking your price for demolition and site clearance works",
  termite_protection: "We are seeking your price for termite management works",
  concrete_footings: "We are seeking your price for concrete, footings and formwork",
  structural_steel: "We are seeking your price for structural steel works",
  carpentry: "We are seeking your price for framing and carpentry works",
  external_cladding: "We are seeking your price for external cladding works",
  windows_skylights: "We are seeking your price for windows, skylights and glazing",
  roof_plumber: "We are seeking your price for roofing and roof plumbing works",
  masonry: "We are seeking your price for brickwork and masonry",
  glazing: "We are seeking your price for glazing and glass works",
  electrical_data: "We are seeking your price for electrical installation works",
  lighting_automation: "We are seeking your price for lighting and home automation",
  plumbing: "We are seeking your price for plumbing and hydraulic works",
  sanitary_ware: "We are seeking your price for sanitary ware and tapware supply",
  heating_cooling: "We are seeking your price for heating and cooling installation",
  solar_batteries: "We are seeking your price for solar and battery installation",
  insulation: "We are seeking your price for insulation works",
  internal_linings: "We are seeking your price for internal linings and plasterboard works",
  plastering_rendering: "We are seeking your price for plastering and rendering works",
  painting: "We are seeking your price for painting works",
  stairs: "We are seeking your price for stair supply and installation",
  joinery: "We are seeking your price for joinery and cabinetry works",
  tiling: "We are seeking your price for tiling and wet area works",
  flooring: "We are seeking your price for floor covering installation",
  window_furnishings: "We are seeking your price for window furnishings supply and installation",
  garage_door: "We are seeking your price for garage door supply and installation",
  appliances: "We are seeking your price for appliance supply",
  door_hardware: "We are seeking your price for door hardware supply",
  fixtures_fittings: "We are seeking your price for fixtures and fittings supply",
  landscaping: "We are seeking your price for landscaping works",
  paving: "We are seeking your price for paving and driveway works",
  fencing: "We are seeking your price for fencing works",
  pool_works: "We are seeking your price for pool and spa works",
  site_cleaner: "We are seeking your price for site cleaning and final clean",
  // Legacy IDs — kept for backward compat with old DB data
  footings_concrete_formwork: "We are seeking your price for concrete, footings and formwork",
  electrical: "We are seeking your price for electrical installation works",
  metal_roofing: "We are seeking your price for roofing works",
  waterproofing: "We are seeking your price for waterproofing works",
  scaffolding: "We are seeking your price for scaffolding and access",
  carpentry_joinery: "We are seeking your price for framing and carpentry works",
  glazing_windows: "We are seeking your price for windows and glazing",
  hvac: "We are seeking your price for heating and cooling installation",
  stormwater: "We are seeking your price for stormwater and drainage works",
  demolition_civil: "We are seeking your price for demolition, civil and earthworks"
};

const SUBCONTRACTOR_ALIASES = {
  // Canonical IDs
  site_establishment: ["site establishment", "site setup", "establishment"],
  excavation: ["excavation", "bulk earthworks", "earthworks", "civil", "excavator"],
  demolition: ["demolition", "strip out", "demo"],
  termite_protection: ["termite", "termite protection", "pest", "pest control", "flick", "anticimex"],
  concrete_footings: ["concrete", "concreting", "formwork", "footing", "slab", "footings", "footings / concrete"],
  structural_steel: ["structural steel", "steel", "steelwork"],
  carpentry: ["carpentry", "framing", "frame", "chippie", "carpenter", "timber framing"],
  external_cladding: ["cladding", "external cladding", "weathertex", "scyon", "james hardie"],
  windows_skylights: ["windows", "skylights", "window", "aluminium windows", "glazier"],
  roof_plumber: ["roof plumber", "roofing", "metal roofing", "colorbond", "roof plumbing"],
  masonry: ["masonry", "brickwork", "brick", "bricklayer", "blockwork"],
  glazing: ["glazing", "glass", "frameless", "balustrade glass", "shower screen"],
  electrical_data: ["electrical", "sparky", "data", "electrician", "electrical & data"],
  lighting_automation: ["lighting", "automation", "smart home", "clipsal", "c-bus"],
  plumbing: ["plumbing", "hydraulic", "hydraulics", "plumber"],
  sanitary_ware: ["sanitary ware", "sanitaryware", "tapware", "fixtures", "sanitary"],
  heating_cooling: ["hvac", "air conditioning", "air con", "mechanical", "heating", "cooling"],
  solar_batteries: ["solar", "batteries", "solar & batteries", "pvs"],
  insulation: ["insulation", "insulate"],
  internal_linings: ["lining", "linings", "plasterboard", "gyprock", "plaster", "internal linings"],
  plastering_rendering: ["plastering", "rendering", "plaster", "texture coat", "tyrolean", "render"],
  painting: ["painting", "painter", "paint"],
  stairs: ["stair", "stairs", "staircase"],
  joinery: ["joinery", "kitchen", "wardrobes", "cabinetry", "cabinet maker", "cabinetry / kitchen"],
  tiling: ["tile", "tiling", "tiler"],
  flooring: ["flooring", "floors", "timber flooring", "floating floor", "vinyl", "carpet"],
  window_furnishings: ["window furnishings", "blinds", "curtains", "window covering"],
  garage_door: ["garage door", "garage doors", "automatic door"],
  appliances: ["appliances", "appliance"],
  door_hardware: ["door hardware", "hardware", "door handle"],
  fixtures_fittings: ["fixtures", "fittings", "fixtures & fittings"],
  landscaping: ["landscaping", "landscape", "gardener"],
  paving: ["paving", "driveway", "driveways", "pavers"],
  fencing: ["fencing", "fence"],
  pool_works: ["pool", "pool works", "spa", "pool builder"],
  site_cleaner: ["cleaning", "final clean", "cleaner", "site clean"],
  // Legacy IDs — kept for backward compat
  footings_concrete_formwork: ["concrete", "concreting", "formwork", "footing", "slab"],
  carpentry_joinery: ["carpentry", "framing", "frame", "chippie"],
  glazing_windows: ["glazing", "windows", "window", "aluminium"],
  metal_roofing: ["roof", "roofing", "metal roofing", "colorbond"],
  waterproofing: ["waterproofing", "waterproofer", "membrane"],
  scaffolding: ["scaffolding", "scaffold", "hire"],
  hvac: ["hvac", "air conditioning", "air con", "mechanical"],
  stormwater: ["stormwater", "drainage", "civil drainage"],
  demolition_civil: ["demolition", "civil", "earthworks", "excavation", "demolition / civil"]
};

/**
 * Map legacy/DB trade IDs → canonical UI trade IDs (matching TRADE_DISPLAY_ORDER in rfqTradeRegistry.js).
 * Used to normalise data from cost_intelligence or old DB seeds.
 */
const LEGACY_TO_CANONICAL = {
  footings_concrete_formwork: "concrete_footings",
  carpentry_joinery: "carpentry",
  carpentry_fitout: "joinery",
  glazing_windows: "windows_skylights",
  metal_roofing: "roof_plumber",
  roof_plumbing: "roof_plumber",
  brickwork: "masonry",
  rendering: "plastering_rendering",
  plastering: "plastering_rendering",
  electrical: "electrical_data",
  lighting: "lighting_automation",
  hvac: "heating_cooling",
  solar: "solar_batteries",
  cabinetry: "joinery",
  garage_doors: "garage_door",
  blinds_curtains: "window_furnishings",
  driveways: "paving",
  pool: "pool_works",
  cleaning: "site_cleaner",
  fixtures: "fixtures_fittings",
  sanitary: "sanitary_ware",
  tiler: "tiling",
  demolition_civil: "excavation" // migration-040 combined trade — maps to excavation; demolition is separate
};

function defaultScopeBullets(tradeId, tradeName) {
  const rules = rulesForTrade(tradeId);
  if (rules.keywords?.length) {
    return [`${tradeName || tradeLabel(tradeId)} package per tender drawings and specifications — price all labour, materials and allowances.`];
  }
  return [`${tradeName || tradeLabel(tradeId)} works per tender documents.`];
}

function rowToConfig(row) {
  const tradeId = row.trade_id;
  const tradeName = row.trade_name || tradeLabel(tradeId);
  const aliases = [
    ...(SUBCONTRACTOR_ALIASES[tradeId] || []),
    tradeName.toLowerCase(),
    tradeId.replace(/_/g, " ")
  ];
  const tmpl = row.default_rfq_template;
  const scopeBullets =
    Array.isArray(tmpl) && tmpl.length
      ? tmpl
      : defaultScopeBullets(tradeId, tradeName);

  return {
    trade_id: tradeId,
    trade_name: tradeName,
    trade_category: row.trade_category || "trade",
    quote_required: row.quote_required !== false,
    is_active: row.is_active !== false,
    priority: row.priority ?? 50,
    email_opener: DEFAULT_EMAIL_OPENERS[tradeId] || `We are seeking your price for ${tradeName.toLowerCase()} works`,
    scope_bullets: scopeBullets,
    default_attachments: row.default_attachments || ["Plans", "Specifications"],
    default_exclusions: row.default_exclusions || [],
    subcontractor_aliases: [...new Set(aliases.map((a) => a.toLowerCase().trim()).filter(Boolean))],
    extraction_rules: row.scope_extraction_rules || rulesForTrade(tradeId),
    recipient_type: row.recipient_type || "subcontractor"
  };
}

/**
 * Canonical trade IDs matching the frontend TRADE_DISPLAY_ORDER in rfqTradeRegistry.js.
 * All of these must resolve in byId for the readiness checker to work.
 */
const CANONICAL_TRADE_IDS = [
  "site_establishment", "excavation", "demolition", "termite_protection", "concrete_footings",
  "structural_steel", "carpentry", "external_cladding", "windows_skylights", "roof_plumber",
  "masonry", "glazing", "electrical_data", "lighting_automation", "plumbing", "sanitary_ware",
  "heating_cooling", "solar_batteries", "insulation", "internal_linings", "plastering_rendering",
  "painting", "stairs", "joinery", "tiling", "flooring", "window_furnishings", "garage_door",
  "appliances", "door_hardware", "fixtures_fittings", "landscaping", "paving", "fencing",
  "pool_works", "site_cleaner"
];

/** @param {import('@supabase/supabase-js').SupabaseClient | null} db */
export async function buildRfqTradeConfig(db) {
  const rows = db ? await loadTradeMaster(db) : getTradeMasterSeed();
  const trades = rows.filter((r) => r.is_active !== false).map(rowToConfig);
  const byId = Object.fromEntries(trades.map((t) => [t.trade_id, t]));

  // Normalise legacy IDs → canonical: if a legacy key maps to a canonical ID
  // and the canonical slot is empty, add an aliased entry.
  for (const [legacyId, canonicalId] of Object.entries(LEGACY_TO_CANONICAL)) {
    if (byId[legacyId] && !byId[canonicalId]) {
      byId[canonicalId] = { ...byId[legacyId], trade_id: canonicalId, trade_name: tradeLabel(canonicalId) || byId[legacyId].trade_name };
    }
  }

  // Ensure every canonical trade ID has at least a minimal stub so the
  // readiness checker knows the trade is "in library".
  for (const canonicalId of CANONICAL_TRADE_IDS) {
    if (!byId[canonicalId]) {
      byId[canonicalId] = rowToConfig({
        trade_id: canonicalId,
        trade_name: tradeLabel(canonicalId) || canonicalId.replace(/_/g, " "),
        trade_category: "trade",
        quote_required: true,
        is_active: true,
        priority: 50
      });
    }
  }

  const labels = {};
  const templates = {};
  const aliasEntries = [];
  for (const t of Object.values(byId)) {
    labels[t.trade_id] = t.trade_name;
    templates[t.trade_id] = { scopeBullets: t.scope_bullets };
    for (const a of t.subcontractor_aliases || []) {
      aliasEntries.push([[a], t.trade_id]);
    }
  }

  return {
    trades: Object.values(byId),
    byId,
    labels,
    templates,
    aliasEntries,
    extraction_rules: TRADE_EXTRACTION_RULES,
    trade_order: CANONICAL_TRADE_IDS.filter((id) => byId[id]?.quote_required !== false)
  };
}

/** Register a new trade into workflow config (ad-hoc subcontractor trade). */
export function registerAdHocTradeConfig(tradeId, tradeName) {
  const id = String(tradeId || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  const name = String(tradeName || id).trim() || id;
  if (!id) return null;
  return rowToConfig({
    trade_id: id,
    trade_name: name,
    trade_category: "trade",
    quote_required: true,
    is_active: true,
    priority: 40,
    default_rfq_template: defaultScopeBullets(id, name)
  });
}
