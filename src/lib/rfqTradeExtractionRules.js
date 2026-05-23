/** Client mirror of server/lib/rfqTradeExtractionRules.mjs */

export const TRADE_EXTRACTION_RULES = {
  excavation: {
    keywords: ["excavat", "footing", "bulk earth", "cut", "fill", "setdown", "spoil", "subgrade", "bench", "geotech", "benchmark", "retaining", "demolition", "access", "services"],
    ignore: ["kitchen", "joinery", "tile", "cabinet", "paint", "lighting", "gpo", "plasterboard", "gyprock", "roof sheet", "waterproof membrane"]
  },
  demolition: {
    keywords: ["demolition", "strip out", "remove", "asbestos", "clear site"],
    ignore: ["kitchen", "tile", "electrical", "plumbing fit", "roof"]
  },
  termite_protection: {
    keywords: ["termite", "pest", "barrier", "penetration", "slab", "as 3660"],
    ignore: ["excavat", "kitchen", "tile"]
  },
  footings_concrete_formwork: {
    keywords: ["concrete", "footing", "slab", "formwork", "reinforcement", "pour", "rebate", "penetration", "structural"],
    ignore: ["kitchen", "tile", "paint", "electrical", "cabinet"]
  },
  plumbing: {
    keywords: ["plumbing", "hydraulic", "sewer", "stormwater", "hot water", "gas", "fixture", "rough in", "fit off", "pipe"],
    ignore: ["electrical", "kitchen selection", "tile", "roof", "framing"]
  },
  electrical: {
    keywords: ["electrical", "lighting", "gpo", "switch", "fan", "ev charger", "solar", "battery", "switchboard", "data", "cable"],
    ignore: ["excavat", "concrete", "tile", "waterproof", "framing", "kitchen"]
  },
  internal_linings: {
    keywords: ["plasterboard", "gyprock", "lining", "ceiling", "bulkhead", "raked", "wet area", "fire rated", "cornice"],
    ignore: ["plumbing", "excavat", "roof", "tile grout"]
  },
  stairs: { keywords: ["stair", "handrail", "balustrade", "flight"], ignore: ["kitchen", "tile floor", "excavat"] },
  tiling: {
    keywords: ["tile", "tiling", "grout", "wet area", "waterproof", "floor finish"],
    ignore: ["electrical", "excavat", "framing", "kitchen cabinet"]
  },
  flooring: {
    keywords: ["floor", "timber floor", "carpet", "vinyl", "floating", "subfloor"],
    ignore: ["roof", "excavat", "electrical"]
  },
  metal_roofing: {
    keywords: ["roof", "colorbond", "gutter", "downpipe", "flashing", "valley", "parapet", "box gutter", "sarking", "fascia"],
    ignore: ["kitchen", "tile", "internal", "plumbing fit"]
  },
  waterproofing: { keywords: ["waterproof", "membrane", "wet area", "bathroom", "balcony"], ignore: ["kitchen", "electrical", "roof sheet"] },
  scaffolding: { keywords: ["scaffold", "edge protection", "hoarding", "access"], ignore: ["kitchen", "tile"] },
  painting: { keywords: ["paint", "coating", "finish coat", "primer"], ignore: ["excavat", "concrete pour"] },
  carpentry_joinery: { keywords: ["frame", "framing", "timber frame", "wall frame", "roof truss", "carpentry"], ignore: ["tile", "paint colour", "electrical"] },
  glazing_windows: { keywords: ["window", "glazing", "door", "aluminium", "skylight"], ignore: ["excavat", "tile"] },
  hvac: { keywords: ["air condition", "hvac", "duct", "heating", "cooling", "split system"], ignore: ["excavat", "tile"] },
  landscaping: { keywords: ["landscape", "irrigation", "planting", "lawn", "garden"], ignore: ["internal", "kitchen"] },
  stormwater: { keywords: ["stormwater", "drainage", "osd", "pit", "pipe drain"], ignore: ["kitchen", "tile"] }
};

export function rulesForTrade(tradeId) {
  return TRADE_EXTRACTION_RULES[tradeId] || { keywords: [], ignore: [] };
}
