/**
 * Runtime trade registry — hydrated from /api/rfq/trade-config (trade master library).
 * Subcontractor records are contacts only; trade logic lives here.
 */

const STATIC_LABELS = {
  // Site & civil
  site_establishment: "Site Establishment",
  excavation: "Excavation",
  demolition: "Demolition",
  termite_protection: "Termite Protection",
  // Structure
  concrete_footings: "Concrete & Footings",
  footings_concrete_formwork: "Footings / Concrete / Formwork", // legacy
  structural_steel: "Structural Steel",
  carpentry: "Carpentry",
  // Envelope
  external_cladding: "External Cladding",
  windows_skylights: "Windows / Skylights",
  roof_plumber: "Roof Plumber",
  metal_roofing: "Metal Roofing", // legacy alias
  masonry: "Masonry",
  glazing: "Glazing",
  // Mechanical / electrical
  electrical_data: "Electrical & Data",
  electrical: "Electrical", // legacy alias
  lighting_automation: "Lighting & Automation",
  plumbing: "Plumbing",
  sanitary_ware: "Sanitary Ware",
  heating_cooling: "Heating & Cooling",
  solar_batteries: "Solar & Batteries",
  // Interior fit-out
  insulation: "Insulation",
  internal_linings: "Internal Linings",
  plastering_rendering: "Plastering & Rendering",
  painting: "Painting",
  stairs: "Stairs",
  joinery: "Joinery",
  tiling: "Tiling",
  flooring: "Flooring",
  window_furnishings: "Window Furnishings",
  garage_door: "Garage Door",
  appliances: "Appliances",
  door_hardware: "Door Hardware",
  fixtures_fittings: "Fixtures & Fittings",
  // External
  landscaping: "Landscaping",
  paving: "Paving",
  fencing: "Fencing",
  pool_works: "Pool Works",
  site_cleaner: "Site Cleaner"
};

// Canonical display order — no legacy aliases, used for UI trade checkboxes
export const TRADE_DISPLAY_ORDER = [
  "site_establishment", "excavation", "demolition", "termite_protection",
  "concrete_footings", "structural_steel", "carpentry",
  "external_cladding", "windows_skylights", "roof_plumber", "masonry", "glazing",
  "electrical_data", "lighting_automation", "plumbing", "sanitary_ware",
  "heating_cooling", "solar_batteries",
  "insulation", "internal_linings", "plastering_rendering", "painting",
  "stairs", "joinery", "tiling", "flooring",
  "window_furnishings", "garage_door", "appliances", "door_hardware", "fixtures_fittings",
  "landscaping", "paving", "fencing", "pool_works", "site_cleaner"
];

// Legacy alias keys — kept for backward compat with stored data, excluded from UI
export const TRADE_LEGACY_ALIASES = {
  footings_concrete_formwork: "concrete_footings",
  metal_roofing: "roof_plumber",
  electrical: "electrical_data"
};

const STATIC_ALIASES = [
  [["site establishment", "site setup", "establishment"], "site_establishment"],
  [["excavation", "bulk earthworks", "earthworks", "civil"], "excavation"],
  [["demolition", "strip out", "demo"], "demolition"],
  [["termite", "termite protection", "pest", "pest control", "flick anticimex"], "termite_protection"],
  [["concrete", "concreting", "footings", "slab", "concrete & footings", "footings / concrete"], "concrete_footings"],
  [["structural steel", "steel", "steelwork"], "structural_steel"],
  [["carpentry", "carpenter", "framing", "timber framing", "frame"], "carpentry"],
  [["cladding", "external cladding", "weathertex", "scyon", "james hardie"], "external_cladding"],
  [["windows", "skylights", "window", "glazier", "glazing company"], "windows_skylights"],
  [["roof plumber", "roofing", "metal roofing", "colorbond", "roof plumbing"], "roof_plumber"],
  [["masonry", "bricklayer", "brick", "brickwork", "blockwork", "stonework"], "masonry"],
  [["glazing", "glass", "frameless", "balustrade", "shower screen"], "glazing"],
  [["electrical", "electrician", "sparky", "electrical & data", "data"], "electrical_data"],
  [["lighting", "automation", "smart home", "clipsal", "c-bus"], "lighting_automation"],
  [["plumbing", "hydraulic", "hydraulics", "plumber"], "plumbing"],
  [["sanitary ware", "sanitaryware", "tapware", "fixtures"], "sanitary_ware"],
  [["heating", "cooling", "hvac", "air conditioning", "aircon", "refrigeration"], "heating_cooling"],
  [["solar", "batteries", "solar & batteries", "pvs"], "solar_batteries"],
  [["insulation", "insulate"], "insulation"],
  [["lining", "linings", "plasterboard", "gyprock", "internal linings"], "internal_linings"],
  [["plastering", "rendering", "plaster", "texture coat", "tyrolean"], "plastering_rendering"],
  [["painting", "painter", "paint"], "painting"],
  [["stair", "stairs", "staircase"], "stairs"],
  [["joinery", "kitchen", "wardrobes", "cabinetry", "cabinet maker"], "joinery"],
  [["tile", "tiling", "tiler"], "tiling"],
  [["flooring", "floors", "timber flooring", "floating floor", "vinyl", "carpet"], "flooring"],
  [["window furnishings", "blinds", "shutters", "curtains"], "window_furnishings"],
  [["garage door", "panel lift"], "garage_door"],
  [["appliances", "appliance"], "appliances"],
  [["door hardware", "hardware", "locksmith"], "door_hardware"],
  [["fixtures", "fittings", "fixtures & fittings"], "fixtures_fittings"],
  [["landscaping", "landscape", "gardens", "turf"], "landscaping"],
  [["paving", "pavers", "driveway", "concrete paving"], "paving"],
  [["fencing", "fence", "pool fence", "boundary fence"], "fencing"],
  [["pool", "pool works", "spa"], "pool_works"],
  [["site cleaner", "cleaning", "final clean", "builder clean"], "site_cleaner"]
];

let registry = {
  hydrated: false,
  byId: {},
  labels: { ...STATIC_LABELS },
  templates: {},
  aliasEntries: [...STATIC_ALIASES],
  trade_order: [...TRADE_DISPLAY_ORDER]
};

export function getTradeRegistry() {
  return registry;
}

export function hydrateTradeRegistry(config) {
  if (!config) return registry;
  const byId = config.byId || Object.fromEntries((config.trades || []).map((t) => [t.trade_id, t]));
  const labels = { ...STATIC_LABELS, ...(config.labels || {}) };
  for (const t of config.trades || []) {
    if (t.trade_id && t.trade_name) labels[t.trade_id] = t.trade_name;
  }
  const aliasEntries = [];
  for (const t of config.trades || []) {
    for (const a of t.subcontractor_aliases || []) {
      aliasEntries.push([[a], t.trade_id]);
    }
  }
  registry = {
    hydrated: true,
    byId,
    labels,
    templates: config.templates || {},
    aliasEntries: aliasEntries.length ? aliasEntries : registry.aliasEntries,
    trade_order: config.trade_order?.length ? config.trade_order : Object.keys(labels)
  };
  return registry;
}

export function registerAdHocTrade(tradeId, tradeName) {
  const id = String(tradeId || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  const name = String(tradeName || id).trim();
  if (!id) return null;
  registry.labels[id] = name;
  registry.byId[id] = {
    trade_id: id,
    trade_name: name,
    email_opener: `We are seeking your price for ${name.toLowerCase()} works`,
    scope_bullets: [`${name} package per tender drawings and specifications.`],
    subcontractor_aliases: [name.toLowerCase(), id.replace(/_/g, " ")]
  };
  registry.templates[id] = { scopeBullets: registry.byId[id].scope_bullets };
  registry.aliasEntries.push([[name.toLowerCase()], id]);
  if (!registry.trade_order.includes(id)) registry.trade_order.push(id);
  return registry.byId[id];
}

export function getTradeLabel(tradeId) {
  return registry.labels[tradeId] || STATIC_LABELS[tradeId] || tradeId;
}

export function normalizeTradeKeyFromRegistry(text) {
  if (!text) return null;
  const s = String(text).toLowerCase().replace(/\s+/g, " ").trim();
  for (const [aliases, canon] of registry.aliasEntries) {
    if (aliases.some((a) => s === a || s.includes(a))) return canon;
  }
  if (registry.labels[s]) return s;
  return null;
}

export async function fetchAndHydrateTradeRegistry() {
  const res = await fetch("/api/rfq/trade-config");
  const json = await res.json().catch(() => ({}));
  if (res.ok && json.ok) hydrateTradeRegistry(json);
  return registry;
}
