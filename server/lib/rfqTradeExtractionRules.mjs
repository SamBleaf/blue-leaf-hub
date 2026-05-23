/**
 * Per-trade scope extraction rules — trade-specific pricing lines only.
 */

export const TRADE_EXTRACTION_RULES = {
  excavation: {
    keywords: ["excavat", "footing", "bulk earth", "cut", "fill", "setdown", "spoil", "subgrade", "bench", "geotech", "benchmark", "retaining", "demolition", "access", "services"],
    ignore: ["kitchen", "joinery", "tile", "cabinet", "paint", "lighting", "gpo", "plasterboard", "gyprock", "roof sheet", "waterproof membrane"],
    doc_types: ["civil", "structural", "site", "geotechnical"]
  },
  demolition: {
    keywords: ["demolition", "strip out", "remove", "asbestos", "clear site", "existing structure"],
    ignore: ["kitchen", "tile", "electrical", "plumbing fit", "roof"],
    doc_types: ["demolition", "site", "architectural"]
  },
  termite_protection: {
    keywords: ["termite", "pest", "barrier", "penetration", "slab", "as 3660"],
    ignore: ["excavat", "kitchen", "tile"],
    doc_types: ["structural", "specification"]
  },
  footings_concrete_formwork: {
    keywords: ["concrete", "footing", "slab", "formwork", "reinforcement", "pour", "rebate", "penetration", "structural"],
    ignore: ["kitchen", "tile", "paint", "electrical", "cabinet"],
    doc_types: ["structural", "engineering"]
  },
  plumbing: {
    keywords: ["plumbing", "hydraulic", "sewer", "stormwater", "hot water", "gas", "fixture", "rough in", "fit off", "pipe"],
    ignore: ["electrical", "kitchen selection", "tile", "roof", "framing"],
    doc_types: ["hydraulic", "plumbing", "services"]
  },
  electrical: {
    keywords: ["electrical", "lighting", "gpo", "switch", "fan", "ev charger", "solar", "battery", "switchboard", "data", "cable"],
    ignore: ["excavat", "concrete", "tile", "waterproof", "framing", "kitchen"],
    doc_types: ["electrical", "lighting schedule", "services"]
  },
  internal_linings: {
    keywords: ["plasterboard", "gyprock", "lining", "ceiling", "bulkhead", "raked", "wet area", "fire rated", "cornice"],
    ignore: ["plumbing", "excavat", "roof", "tile grout"],
    doc_types: ["architectural", "internal"]
  },
  stairs: {
    keywords: ["stair", "handrail", "balustrade", "flight"],
    ignore: ["kitchen", "tile floor", "excavat"],
    doc_types: ["architectural"]
  },
  tiling: {
    keywords: ["tile", "tiling", "grout", "wet area", "waterproof", "floor finish"],
    ignore: ["electrical", "excavat", "framing", "kitchen cabinet"],
    doc_types: ["finishes", "architectural"]
  },
  flooring: {
    keywords: ["floor", "timber floor", "carpet", "vinyl", "floating", "subfloor"],
    ignore: ["roof", "excavat", "electrical"],
    doc_types: ["finishes"]
  },
  metal_roofing: {
    keywords: ["roof", "colorbond", "gutter", "downpipe", "flashing", "valley", "parapet", "box gutter", "sarking", "fascia"],
    ignore: ["kitchen", "tile", "internal", "plumbing fit"],
    doc_types: ["roof", "architectural"]
  },
  waterproofing: {
    keywords: ["waterproof", "membrane", "wet area", "bathroom", "balcony"],
    ignore: ["kitchen", "electrical", "roof sheet"],
    doc_types: ["wet area", "specification"]
  },
  scaffolding: {
    keywords: ["scaffold", "edge protection", "hoarding", "access"],
    ignore: ["kitchen", "tile"],
    doc_types: ["site"]
  },
  painting: {
    keywords: ["paint", "coating", "finish coat", "primer"],
    ignore: ["excavat", "concrete pour"],
    doc_types: ["finishes"]
  },
  carpentry_joinery: {
    keywords: ["frame", "framing", "timber frame", "wall frame", "roof truss", "carpentry"],
    ignore: ["tile", "paint colour", "electrical"],
    doc_types: ["structural", "architectural"]
  },
  glazing_windows: {
    keywords: ["window", "glazing", "door", "aluminium", "skylight"],
    ignore: ["excavat", "tile"],
    doc_types: ["window schedule", "architectural"]
  },
  hvac: {
    keywords: ["air condition", "hvac", "duct", "heating", "cooling", "split system"],
    ignore: ["excavat", "tile"],
    doc_types: ["services", "mechanical"]
  },
  landscaping: {
    keywords: ["landscape", "irrigation", "planting", "lawn", "garden"],
    ignore: ["internal", "kitchen"],
    doc_types: ["landscape"]
  },
  stormwater: {
    keywords: ["stormwater", "drainage", "osd", "pit", "pipe drain"],
    ignore: ["kitchen", "tile"],
    doc_types: ["civil", "hydraulic"]
  }
};

export function rulesForTrade(tradeId) {
  return (
    TRADE_EXTRACTION_RULES[tradeId] || {
      keywords: [],
      ignore: [],
      doc_types: []
    }
  );
}
