/**
 * RFQ trade keys (match Claude extraction + Supabase normalisation).
 * Re-exports RFQ_TRADE_ORDER as TRADE_ORDER for existing imports.
 */

import { RFQ_TRADE_ORDER } from "./rfqExtraction.js";

export const TRADE_ORDER = RFQ_TRADE_ORDER;

export const TRADE_LABEL = {
  excavation: "Excavation",
  demolition: "Demolition",
  termite_protection: "Termite Protection",
  footings_concrete_formwork: "Footings / Concrete / Formwork",
  plumbing: "Plumbing",
  electrical: "Electrical",
  internal_linings: "Internal Linings",
  stairs: "Stairs",
  tiling: "Tiling",
  flooring: "Flooring",
  metal_roofing: "Metal Roofing"
};

export const STANDARD_ASSUMPTION =
  "Please note: All works reasonably associated with your trade are assumed to be included in your quote unless specifically and explicitly excluded in writing. Any exclusions must be listed clearly in your submission.";

/** Map free-text subcontractor `trade` to canonical RFQ key. */
export const SUB_TRADE_ALIAS_TO_CANONICAL = [
  [["excavation", "bulk earthworks", "earthworks"], "excavation"],
  [["demolition", "strip out"], "demolition"],
  [
    ["termite", "termite protection", "pest", "pest control", "flick"],
    "termite_protection"
  ],
  [
    ["concrete", "concreting", "formwork", "footing", "slab", "footings / concrete"],
    "footings_concrete_formwork"
  ],
  [["plumbing", "hydraulic", "hydraulics"], "plumbing"],
  [["electrical", "solar", "sparky", "data", "electrician", "electrical / solar"], "electrical"],
  [["lining", "linings", "plasterboard", "gyprock", "plaster", "internal linings"], "internal_linings"],
  [["stair", "stairs"], "stairs"],
  [["tile", "tiling", "tiler"], "tiling"],
  [["flooring", "floors", "timber flooring", "floating floor", "flooring installer"], "flooring"],
  [["roof", "roofing", "metal roofing", "colorbond"], "metal_roofing"]
];

/** Fallback scope lines if extraction empty — plain English, no standards in bullets (composer adds optional compliance line). */
export const TRADE_TEMPLATES = {
  excavation: {
    scopeBullets: [
      "Bulk earthworks and footing excavations to engineer's levels and drawings",
      "Spoil off-site, benching where needed, protect existing services, leave clean for inspection"
    ]
  },
  demolition: {
    scopeBullets: [
      "Strip-out and demolition per demolition plan; protect what stays",
      "Cap services where needed; clear debris and leave site tidy"
    ]
  },
  termite_protection: {
    scopeBullets: [
      "Termite management system including slab penetrations and paperwork for handover"
    ]
  },
  footings_concrete_formwork: {
    scopeBullets: [
      "Formwork, steel and pours for footings, slab, rebates and penetrations per structural drawings",
      "Finishes and curing to spec; strip forms when safe"
    ]
  },
  plumbing: {
    scopeBullets: [
      "Rough-in and fit-off; fixtures, hot water, gas if on drawings",
      "Test, certify, and coordinate with other trades for penetrations"
    ]
  },
  electrical: {
    scopeBullets: [
      "Rough-in and fit-off; switchboard; solar or EV if shown on drawings",
      "Test and commission ready for fit-off"
    ]
  },
  internal_linings: {
    scopeBullets: [
      "Wall and ceiling linings including wet areas and stopping level per spec",
      "Cornices and bulkheads where drawn"
    ]
  },
  stairs: {
    scopeBullets: [
      "Stair flight, barriers and handrails per drawings and statutory requirements"
    ]
  },
  tiling: {
    scopeBullets: [
      "Waterproofing and tiling to wet areas and schedules; trims and grout as specified"
    ]
  },
  flooring: {
    scopeBullets: [
      "Subfloor prep and flooring install per manufacturer and project schedule"
    ]
  },
  metal_roofing: {
    scopeBullets: [
      "Sheet roof, sarking, fascia, gutters and flashings; coordinate roof penetrations"
    ]
  }
};

export function normalizeTradeKey(text) {
  if (!text) return null;
  const s = String(text).toLowerCase().replace(/\s+/g, " ").trim();
  for (const [aliases, canon] of SUB_TRADE_ALIAS_TO_CANONICAL) {
    if (aliases.some((a) => s === a || s.includes(a))) return canon;
  }
  return null;
}

export function subcontractorsForTrade(canonicalTradeId, subcontractors, limit = 999) {
  if (!canonicalTradeId) return [];
  const matches = subcontractors.filter(
    (sub) => normalizeTradeKey(sub.trade) === canonicalTradeId
  );
  const sorted = matches.slice().sort((a, b) => {
    const ae = !!a.email?.trim();
    const be = !!b.email?.trim();
    if (ae !== be) return ae ? -1 : 1;
    const ra = a.rating == null ? -1 : Number(a.rating);
    const rb = b.rating == null ? -1 : Number(b.rating);
    if (ra !== rb) return rb - ra;
    const da = new Date(a.created_at || 0).getTime();
    const db = new Date(b.created_at || 0).getTime();
    return da - db;
  });
  const unique = [];
  const seen = new Set();
  for (const row of sorted) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    unique.push(row);
    if (unique.length >= limit) break;
  }
  return unique;
}
