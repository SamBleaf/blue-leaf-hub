/** Canonical trade keys aligned with Claude extraction JSON + RFQ Engine. */

export const RFQ_TRADE_ORDER = [
  "excavation",
  "demolition",
  "termite_protection",
  "footings_concrete_formwork",
  "plumbing",
  "electrical",
  "internal_linings",
  "stairs",
  "tiling",
  "flooring",
  "metal_roofing"
];

export function emptyTradeNote() {
  return { scope_summary: "", specific_items: [], missing_info: "" };
}

function normalizeOneTradeNote(raw) {
  if (raw == null) return emptyTradeNote();
  if (typeof raw === "string") {
    return { scope_summary: raw.trim(), specific_items: [], missing_info: "" };
  }
  if (typeof raw === "object") {
    return {
      scope_summary: String(raw.scope_summary ?? "").trim(),
      specific_items: Array.isArray(raw.specific_items)
        ? raw.specific_items.map((x) => String(x).trim()).filter(Boolean)
        : [],
      missing_info: raw.missing_info == null ? "" : String(raw.missing_info).trim()
    };
  }
  return emptyTradeNote();
}

function legacyTradeNotesToNew(flat) {
  const out = {};
  for (const id of RFQ_TRADE_ORDER) {
    out[id] = emptyTradeNote();
  }
  if (!flat || typeof flat !== "object") return out;
  const mapLegacyKey = {
    concrete_formwork: "footings_concrete_formwork",
    electrical_solar: "electrical"
  };
  for (const [k, v] of Object.entries(flat)) {
    const key = mapLegacyKey[k] || k;
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

  return {
    project_address,
    project_type: String(raw.project_type ?? "unknown").trim() || "unknown",
    storeys: String(raw.storeys ?? "").trim(),
    floor_area_m2: numOrNull(floorRaw),
    site_area_m2: numOrNull(siteRaw),
    building_specs,
    trade_notes,
    coverage_gaps: Array.isArray(raw.coverage_gaps)
      ? raw.coverage_gaps.map(String)
      : Array.isArray(raw.missing_critical)
        ? raw.missing_critical.map(String)
        : [],
    key_project_notes: String(raw.key_project_notes ?? "").trim(),
    client_name: String(raw.client_name ?? "").trim(),
    architect_name: String(raw.architect_name ?? "").trim()
  };
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

  const gapSet = new Set();
  for (const x of list) {
    for (const g of x.coverage_gaps || []) {
      const s = String(g).trim();
      if (s) gapSet.add(s);
    }
  }
  merged.coverage_gaps = [...gapSet];

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

  return merged;
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

/** Turn scope_summary + specific_items into bullet lines for UI / email. */
export function bulletsFromTradeNote(note) {
  const n = note && typeof note === "object" ? note : emptyTradeNote();
  const fromSummary = linesFromScopeSummary(n.scope_summary);
  const items = (n.specific_items || []).map((l) => String(l).trim()).filter(Boolean);
  return [...fromSummary, ...items];
}
