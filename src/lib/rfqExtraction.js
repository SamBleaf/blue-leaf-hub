/** Canonical trade keys aligned with Claude extraction JSON + RFQ Engine. */
import { processExtraction, bulletsFromStructuredNote } from "./rfqScopePipeline.js";

// Canonical UI display order — no legacy aliases; used for trade checkboxes and email composer
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

// All keys including legacy aliases — used only for normalizing stored extraction data
export const RFQ_ALL_TRADE_KEYS = [
  ...RFQ_TRADE_ORDER,
  "footings_concrete_formwork", // legacy → concrete_footings
  "metal_roofing",              // legacy → roof_plumber
  "electrical"                  // legacy → electrical_data
];

export function emptyTradeNote() {
  return {
    project_information: [],
    scope_of_works: [],
    confirm_items: [],
    assumptions: [],
    tender_requirements: [],
    submission_requirements: [],
    standards: [],
    missing_items: [],
    scope_summary: "",
    specific_items: [],
    missing_info: ""
  };
}

function normalizeOneTradeNote(raw) {
  if (raw == null) return emptyTradeNote();
  if (typeof raw === "string") {
    return { ...emptyTradeNote(), scope_summary: raw.trim() };
  }
  if (typeof raw === "object") {
    const arr = (k) =>
      Array.isArray(raw[k]) ? raw[k].map((x) => String(x).trim()).filter(Boolean) : [];
    const scope_of_works = arr("scope_of_works");
    return {
      ...emptyTradeNote(),
      project_information: arr("project_information"),
      scope_of_works,
      confirm_items: arr("confirm_items"),
      assumptions: arr("assumptions"),
      tender_requirements: arr("tender_requirements"),
      submission_requirements: arr("submission_requirements"),
      standards: arr("standards").slice(0, 1),
      missing_items: arr("missing_items"),
      scope_summary: String(raw.scope_summary ?? "").trim() || scope_of_works.join("\n"),
      specific_items: Array.isArray(raw.specific_items)
        ? raw.specific_items.map((x) => String(x).trim()).filter(Boolean)
        : scope_of_works,
      missing_info:
        raw.missing_info == null ? arr("missing_items").join("; ") : String(raw.missing_info).trim()
    };
  }
  return emptyTradeNote();
}

// Maps old extraction keys to canonical keys
const LEGACY_KEY_MAP = {
  concrete_formwork: "concrete_footings",
  footings_concrete_formwork: "concrete_footings",
  metal_roofing: "roof_plumber",
  electrical: "electrical_data",
  electrical_solar: "electrical_data"
};

function legacyTradeNotesToNew(flat) {
  const out = {};
  for (const id of RFQ_TRADE_ORDER) {
    out[id] = emptyTradeNote();
  }
  if (!flat || typeof flat !== "object") return out;
  for (const [k, v] of Object.entries(flat)) {
    const key = LEGACY_KEY_MAP[k] || k;
    if (RFQ_TRADE_ORDER.includes(key)) {
      out[key] = normalizeOneTradeNote(v);
    }
  }
  return out;
}

const emptyBuildingSpecs = () => ({
  external_walls: "",
  roof_type: "",
  window_type: "",
  glazing_spec: "",
  insulation: "",
  facade_features: "",
  energy_rating: ""
});

export function coerceExtraction(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      project_address: "",
      project_type: "unknown",
      storeys: "",
      floor_area_m2: null,
      site_area_m2: null,
      building_specs: emptyBuildingSpecs(),
      trade_notes: Object.fromEntries(RFQ_TRADE_ORDER.map((k) => [k, emptyTradeNote()])),
      coverage_gaps: [],
      key_project_notes: "",
      client_name: "",
      architect_name: ""
    };
  }

  const trade_notes = {};
  if (raw.trade_notes && typeof raw.trade_notes === "object") {
    const firstVal = raw.trade_notes[RFQ_TRADE_ORDER[0]];
    const looksLegacy =
      typeof firstVal === "string" ||
      (raw.trade_notes.excavation != null && typeof raw.trade_notes.excavation === "string");
    const base = looksLegacy ? legacyTradeNotesToNew(raw.trade_notes) : {};
    for (const id of RFQ_TRADE_ORDER) {
      trade_notes[id] = normalizeOneTradeNote(
        looksLegacy ? base[id] : raw.trade_notes[id]
      );
    }
  } else {
    for (const id of RFQ_TRADE_ORDER) {
      trade_notes[id] = emptyTradeNote();
    }
  }

  const bs = raw.building_specs && typeof raw.building_specs === "object" ? raw.building_specs : {};
  const building_specs = { ...emptyBuildingSpecs() };
  for (const k of Object.keys(emptyBuildingSpecs())) {
    building_specs[k] = bs[k] == null ? "" : String(bs[k]).trim();
  }

  const floorRaw = raw.floor_area_m2;
  const siteRaw = raw.site_area_m2;
  const numOrNull = (v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const project_address = String(
    raw.project_address ?? raw.address ?? ""
  ).trim();

  const project_context = {
    project_information: [],
    assumptions_site_conditions: []
  };
  if (raw.project_context && typeof raw.project_context === "object") {
    if (Array.isArray(raw.project_context.project_information)) {
      project_context.project_information = raw.project_context.project_information.map(String).filter(Boolean);
    }
    if (Array.isArray(raw.project_context.assumptions_site_conditions)) {
      project_context.assumptions_site_conditions = raw.project_context.assumptions_site_conditions
        .map(String)
        .filter(Boolean);
    }
  }

  const base = {
    project_address,
    project_type: String(raw.project_type ?? "unknown").trim() || "unknown",
    storeys: String(raw.storeys ?? "").trim(),
    floor_area_m2: numOrNull(floorRaw),
    site_area_m2: numOrNull(siteRaw),
    building_specs,
    project_context,
    trade_notes,
    coverage_gaps: (Array.isArray(raw.coverage_gaps)
      ? raw.coverage_gaps
      : Array.isArray(raw.missing_critical)
        ? raw.missing_critical
        : []
    ).map(String).filter(Boolean).slice(0, 6),
    key_project_notes: String(raw.key_project_notes ?? "").trim(),
    client_name: String(raw.client_name ?? "").trim(),
    architect_name: String(raw.architect_name ?? "").trim()
  };

  return processExtraction(base, RFQ_TRADE_ORDER);
}

/**
 * Merge several per-file extraction payloads (already document-shaped) into one view model.
 * Scalar fields: first non-empty / first finite number across files in order.
 * Arrays: concatenate and dedupe; trade scope lines dedupe case-insensitively by line.
 * @param {object[]} rawParts
 */
export function mergeExtractions(rawParts) {
  const parts = (Array.isArray(rawParts) ? rawParts : []).filter((x) => x && typeof x === "object");
  if (parts.length === 0) return coerceExtraction(null);
  const list = parts.map((p) => coerceExtraction(p));
  if (list.length === 1) return list[0];

  const firstNonEmptyString = (pick) => {
    for (const x of list) {
      const s = String(pick(x) ?? "").trim();
      if (s) return s;
    }
    return "";
  };

  const firstFiniteNumber = (pick) => {
    for (const x of list) {
      const v = pick(x);
      if (v == null || v === "") continue;
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  const merged = coerceExtraction(null);
  merged.project_address = firstNonEmptyString((x) => x.project_address);
  merged.project_type = firstNonEmptyString((x) => x.project_type) || "unknown";
  merged.storeys = firstNonEmptyString((x) => x.storeys);
  merged.floor_area_m2 = firstFiniteNumber((x) => x.floor_area_m2);
  merged.site_area_m2 = firstFiniteNumber((x) => x.site_area_m2);
  merged.client_name = firstNonEmptyString((x) => x.client_name);
  merged.architect_name = firstNonEmptyString((x) => x.architect_name);

  const bsKeys = Object.keys(merged.building_specs);
  for (const k of bsKeys) {
    merged.building_specs[k] = firstNonEmptyString((x) => x.building_specs?.[k]);
  }

  // Fuzzy-dedup coverage gaps: normalise to first ~6 words for near-duplicate detection
  function gapKey(s) {
    return s.toLowerCase()
      .replace(/\b(not\s+)?(included|provided|present|attached|available|in\s+this\s+document)\b.*$/i, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ").slice(0, 6).join(" ");
  }
  const gapKeySeen = new Set();
  const gapList = [];
  for (const x of list) {
    for (const g of x.coverage_gaps || []) {
      const s = String(g).trim();
      if (!s) continue;
      const key = gapKey(s);
      if (gapKeySeen.has(key)) continue;
      gapKeySeen.add(key);
      gapList.push(s);
      if (gapList.length >= 6) break;
    }
    if (gapList.length >= 6) break;
  }
  merged.coverage_gaps = gapList;

  const kpnSeen = new Set();
  const kpnParts = [];
  for (const x of list) {
    const s = String(x.key_project_notes || "").trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (kpnSeen.has(key)) continue;
    kpnSeen.add(key);
    kpnParts.push(s);
  }
  merged.key_project_notes = kpnParts.join(" ");

  const dedupeScopeLines = (summaryBlocks) => {
    const seen = new Set();
    const out = [];
    for (const block of summaryBlocks) {
      for (const line of String(block || "")
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)) {
        const key = line.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(line);
      }
    }
    return out.join("\n");
  };

  for (const tid of RFQ_TRADE_ORDER) {
    const summaries = [];
    const itemOrder = [];
    const itemSeen = new Set();
    const missSet = new Set();
    for (const x of list) {
      const tn = x.trade_notes?.[tid] || emptyTradeNote();
      if (tn.scope_summary?.trim()) summaries.push(tn.scope_summary);
      for (const it of tn.specific_items || []) {
        const s = String(it).trim();
        if (s && !itemSeen.has(s)) {
          itemSeen.add(s);
          itemOrder.push(s);
        }
      }
      if (tn.missing_info?.trim()) missSet.add(tn.missing_info.trim());
    }
    merged.trade_notes[tid] = {
      scope_summary: dedupeScopeLines(summaries),
      specific_items: itemOrder,
      missing_info: [...missSet].join("; ")
    };
  }

  const allIds = [...new Set(list.flatMap((x) => Object.keys(x.trade_notes || {})))];
  return processExtraction(merged, allIds.length ? allIds : RFQ_TRADE_ORDER);
}

/** Split scope_summary into lines (newlines, or •-separated blocks). */
function linesFromScopeSummary(scopeSummary) {
  const raw = String(scopeSummary || "").trim();
  if (!raw) return [];
  if (/[•\u2022]/.test(raw)) {
    const segs = raw
      .split(/\s*[•\u2022]\s*/)
      .map((l) => l.replace(/\r/g, "").replace(/^[\s*-]+/, "").trim())
      .filter(Boolean);
    if (segs.length > 1) return segs;
  }
  return raw
    .split(/\n+/)
    .map((l) => l.replace(/^[\s•*-]+/, "").trim())
    .filter(Boolean);
}

/** Turn structured scope into bullet lines for UI / email. */
export function bulletsFromTradeNote(note) {
  const n = note && typeof note === "object" ? note : emptyTradeNote();
  if (n.scope_of_works?.length) return bulletsFromStructuredNote(n);
  const fromSummary = linesFromScopeSummary(n.scope_summary);
  const items = (n.specific_items || []).map((l) => String(l).trim()).filter(Boolean);
  return [...fromSummary, ...items];
}
