import * as XLSX from "xlsx";

// Canonical 37-category mapping aligned with Buildxact master template (migration 031).
// Format: [displayName, phase, tradeKey, hasQuoteLine]
// phase values: site_prep | foundations | frame | lock_up | fix_out | external
// tradeKey maps to the trade_categories.name — used for budget/invoice matching.
const CATEGORY_MAPPING = [
  // ── Canonical 37 categories (must match trade_categories table exactly) ──────
  ["Preliminaries",          "site_prep",   "preliminaries",    false],
  ["Hire Items",             "site_prep",   "hire",             true],
  ["Site Establishment",     "site_prep",   "site_establishment", false],
  ["Demolition / Civil",     "site_prep",   "demolition",       true],
  ["Concrete & Footings",    "foundations", "concrete",         true],
  ["Termite Protection",     "foundations", "termite",          true],
  ["Structural Steel",       "frame",       "steel",            true],
  ["Carpentry",              "frame",       "carpentry",        true],
  ["Windows / Skylights",    "lock_up",     "windows",          true],
  ["External Cladding",      "lock_up",     "cladding",         true],
  ["Roof Plumber",           "lock_up",     "roofing",          true],
  ["Masonry",                "lock_up",     "masonry",          true],
  ["Electrical & Data",      "fix_out",     "electrical",       true],
  ["Lighting & Automation",  "fix_out",     "lighting",         true],
  ["Plumbing",               "fix_out",     "plumbing",         true],
  ["Sanitary Ware",          "fix_out",     "sanitary",         true],
  ["Stairs",                 "frame",       "stairs",           true],
  ["Insulation",             "fix_out",     "insulation",       true],
  ["Internal Linings",       "fix_out",     "linings",          true],
  ["Tiler",                  "fix_out",     "tiling",           true],
  ["Joinery",                "fix_out",     "joinery",          true],
  ["Painting",               "fix_out",     "painting",         true],
  ["Garage Door",            "lock_up",     "garage_door",      true],
  ["Plastering & Rendering", "fix_out",     "plastering",       true],
  ["Flooring",               "fix_out",     "flooring",         true],
  ["Window Furnishings",     "fix_out",     "blinds",           true],
  ["Appliances",             "fix_out",     "appliances",       true],
  ["Door Hardware",          "fix_out",     "door_hardware",    true],
  ["Fixtures & Fittings",    "fix_out",     "fixtures",         true],
  ["Glazing",                "lock_up",     "glazing",          true],
  ["Solar & Batteries",      "fix_out",     "solar",            true],
  ["Heating & Cooling",      "fix_out",     "hvac",             true],
  ["Landscaping",            "external",    "landscaping",      true],
  ["Paving",                 "external",    "paving",           true],
  ["Fencing",                "external",    "fencing",          true],
  ["Pool Works",             "external",    "pool",             true],
  ["Site Cleaner",           "fix_out",     "cleaning",         true],

  // ── Backward-compatible aliases (common Buildxact export variants) ──────────
  ["Earthworks",                    "site_prep",   "demolition",  true],
  ["Demolition",                    "site_prep",   "demolition",  true],
  ["Civil Works",                   "site_prep",   "demolition",  true],
  ["Footings & Slabs",              "foundations", "concrete",    true],
  ["Footings",                      "foundations", "concrete",    true],
  ["Concrete",                      "foundations", "concrete",    true],
  ["Slab",                          "foundations", "concrete",    true],
  ["Hydraulics — Sub-Slab",         "foundations", "plumbing",    true],
  ["Hydraulics - Sub Slab",         "foundations", "plumbing",    true],
  ["Steel Work",                    "frame",       "steel",       true],
  ["Structural Steel Work",         "frame",       "steel",       true],
  ["Framing",                       "frame",       "carpentry",   true],
  ["Timber Framing",                "frame",       "carpentry",   true],
  ["Scaffolding",                   "frame",       "hire",        true],
  ["Windows & External Doors",      "lock_up",     "windows",     true],
  ["Windows",                       "lock_up",     "windows",     true],
  ["Skylights",                     "lock_up",     "windows",     true],
  ["Brickwork",                     "lock_up",     "masonry",     true],
  ["Blockwork",                     "lock_up",     "masonry",     true],
  ["Roofing",                       "lock_up",     "roofing",     true],
  ["Roof Plumbing",                 "lock_up",     "roofing",     true],
  ["Hydraulics — Rough-in",         "fix_out",     "plumbing",    true],
  ["Hydraulics - Rough in",         "fix_out",     "plumbing",    true],
  ["Hydraulics — Fit-off",          "fix_out",     "plumbing",    true],
  ["Hydraulics - Fit off",          "fix_out",     "plumbing",    true],
  ["Plumbing Rough-in",             "fix_out",     "plumbing",    true],
  ["Plumbing Fit-off",              "fix_out",     "plumbing",    true],
  ["Electrical — Rough-in",         "fix_out",     "electrical",  true],
  ["Electrical - Rough in",         "fix_out",     "electrical",  true],
  ["Electrical — Fit-off",          "fix_out",     "electrical",  true],
  ["Electrical - Fit off",          "fix_out",     "electrical",  true],
  ["Electrical",                    "fix_out",     "electrical",  true],
  ["Data & Communications",         "fix_out",     "electrical",  true],
  ["Plasterboard",                  "fix_out",     "linings",     true],
  ["Plasterboard & Linings",        "fix_out",     "linings",     true],
  ["Tiling",                        "fix_out",     "tiling",      true],
  ["Tiles",                         "fix_out",     "tiling",      true],
  ["Kitchen",                       "fix_out",     "joinery",     true],
  ["Cabinetry",                     "fix_out",     "joinery",     true],
  ["Kitchen & Cabinetry",           "fix_out",     "joinery",     true],
  ["Stone Benchtops",               "fix_out",     "joinery",     true],
  ["Shower Screens & Mirrors",      "fix_out",     "fixtures",    true],
  ["Blinds",                        "fix_out",     "blinds",      true],
  ["Window Treatments",             "fix_out",     "blinds",      true],
  ["Air Conditioning",              "fix_out",     "hvac",        true],
  ["HVAC",                          "fix_out",     "hvac",        true],
  ["Heating & Cooling Systems",     "fix_out",     "hvac",        true],
  ["Waterproofing",                 "fix_out",     "waterproofing", true],
  ["External Works",                "external",    "landscaping", true],
  ["Concrete — Driveways & Paths",  "external",    "paving",      true],
  ["Concrete - Driveways & Paths",  "external",    "paving",      true],
  ["Driveways & Paths",             "external",    "paving",      true],
  ["Pool",                          "external",    "pool",        true],
  ["Swimming Pool",                 "external",    "pool",        true],
  ["Rendering",                     "fix_out",     "plastering",  true],
  ["Plaster & Render",              "fix_out",     "plastering",  true],
  ["Cleaning",                      "fix_out",     "cleaning",    true],
  ["Masonary",                      "lock_up",     "masonry",     true],   // common Buildxact typo of Masonry
  ["Outdoor Works",                 "external",    "landscaping", true],
  ["Outdoor Works Supply",          "external",    "landscaping", true],
];

function normCategoryName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[—–-]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getBuildexactCategoryMapping(categoryName) {
  const norm = normCategoryName(categoryName);
  let best = null;
  for (const [name, phase, tradeKey, hasQuoteLine] of CATEGORY_MAPPING) {
    const n = normCategoryName(name);
    if (!n) continue;
    if (norm === n || norm.includes(n) || n.includes(norm)) {
      const score = Math.min(norm.length, n.length);
      if (!best || score > best.score) best = { name, phase, tradeKey, hasQuoteLine, score };
    }
  }
  return best ? { name: best.name, phase: best.phase, tradeKey: best.tradeKey, hasQuoteLine: best.hasQuoteLine } : null;
}

/**
 * Resolve a Buildxact category name OR a free-text trade label to the canonical
 * trade_categories.id (Phase 6 — trade taxonomy convergence). FK-first, additive:
 *
 *   1. getBuildexactCategoryMapping() maps the input to a canonical trade name
 *      (the existing fuzzy/alias path), then we look that canonical name up in
 *      trade_categories by EXACT case-insensitive match → trade_category_id.
 *   2. Fallback: EXACT case-insensitive match of the RAW input against
 *      trade_categories.name (handles values that are already a canonical name but
 *      have no CATEGORY_MAPPING alias).
 *
 * Returns the uuid string, or null if nothing resolves exactly — callers must keep
 * any existing `trade` text write and leave trade_category_id NULL rather than
 * guess (spend attribution; a NULL is cheaper than a wrong category). The fuzzy
 * getBuildexactCategoryMapping path is preserved as the canonical-name source —
 * this only adds the FK lookup on top of it; nothing here removes the name-based
 * behaviour relied on elsewhere.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb  service-role client
 * @param {string} tradeText  Buildxact category name or free-text trade label
 * @returns {Promise<string|null>} trade_category_id, or null when no EXACT match
 */
export async function resolveTradeCategoryId(sb, tradeText) {
  const raw = String(tradeText || "").trim();
  if (!sb || !raw) return null;
  try {
    const { data, error } = await sb
      .from("trade_categories")
      .select("id, name");
    if (error || !Array.isArray(data) || !data.length) return null;

    const eq = (a, b) => normCategoryName(a) === normCategoryName(b);

    // 1. Canonical-name resolution via the existing Buildxact category mapping.
    const mapping = getBuildexactCategoryMapping(raw);
    if (mapping?.name) {
      const viaMapping = data.find((c) => eq(c.name, mapping.name));
      if (viaMapping) return viaMapping.id;
    }
    // 2. Fallback: exact (case-insensitive) match on the raw input itself.
    const direct = data.find((c) => eq(c.name, raw));
    return direct ? direct.id : null;
  } catch (e) {
    console.warn("[buildexactParser] resolveTradeCategoryId:", e?.message || e);
    return null;
  }
}

function cellStr(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

/** Parse currency like $357,233.28 or 357233.28 */
export function parseMoney(s) {
  const t = cellStr(s).replace(/[$]/g, "").replace(/\s/g, "");
  if (!t || t === "-" || /^[\s-]+$/.test(t)) return null;
  const neg = t.startsWith("(") && t.endsWith(")");
  const n = parseFloat(t.replace(/,/g, "").replace(/[()]/g, ""));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

function rowText(row) {
  return (Array.isArray(row) ? row : []).map(cellStr).filter(Boolean).join(" | ");
}

/** Single-spaced join for label matching across merged cells. */
function rowJoinSpaces(row) {
  return (Array.isArray(row) ? row : [])
    .map(cellStr)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function findRowContaining(rows, re) {
  for (let i = 0; i < rows.length; i++) {
    const line = rowText(rows[i]);
    if (re.test(line)) return i;
  }
  return -1;
}

/** Match Q1191 from title row */
function extractQuoteNumber(rows) {
  for (const row of rows.slice(0, 25)) {
    const line = rowText(row);
    const m = line.match(/\b(Q\d{3,})\b/i);
    if (m) return m[1].toUpperCase();
  }
  return "";
}

function extractAddressFromTitle(rows) {
  for (const row of rows.slice(0, 25)) {
    const line = rowText(row);
    const m = line.match(/\bQ\d{3,}\s*[-–—]\s*(.+)$/i);
    if (m) return m[1].trim();
  }
  return "";
}

function extractField(rows, pattern) {
  for (const row of rows) {
    const j = rowText(row);
    const m = j.match(pattern);
    if (m?.[1]) return String(m[1]).split("|")[0].trim();
  }
  return "";
}

function extractAfterLabel(rows, labelRe) {
  for (const row of rows) {
    const cells = Array.isArray(row) ? row : [];
    for (let c = 0; c < cells.length; c++) {
      const t = cellStr(cells[c]);
      if (labelRe.test(t)) {
        for (let d = c + 1; d < cells.length; d++) {
          const v = cellStr(cells[d]);
          if (v) return v;
        }
      }
    }
  }
  return "";
}

function scanKeyValueMoney(rows, key) {
  const re = new RegExp(`${key}\\s*[:]?`, "i");
  for (const row of rows) {
    const cells = Array.isArray(row) ? row : [];
    const joined = rowText(row);
    if (!re.test(joined)) continue;
    for (let i = cells.length - 1; i >= 0; i--) {
      const m = parseMoney(cells[i]);
      if (m != null) return m;
    }
  }
  return null;
}

/**
 * Extract currency after a label on the same logical row, e.g. "Net Total: $357,233.28"
 * or label in one cell and amount in a later cell.
 */
function extractMoneyAfterLabel(rows, labelPattern) {
  const inline = new RegExp(`${labelPattern}\\s*:?\\s*\\$?\\s*\\(?([0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\)?`, "i");
  for (const row of rows) {
    const cells = Array.isArray(row) ? row : [];
    const line = rowJoinSpaces(row);
    const m = line.match(inline);
    if (m) {
      const n = parseMoney(m[1]);
      if (n != null) return n;
    }
    const labelRe = new RegExp(`^${labelPattern}\\s*:?$`, "i");
    let labelCol = -1;
    for (let c = 0; c < cells.length; c++) {
      if (labelRe.test(cellStr(cells[c]).trim())) {
        labelCol = c;
        break;
      }
    }
    if (labelCol >= 0) {
      for (let d = labelCol + 1; d < cells.length; d++) {
        const n = parseMoney(cells[d]);
        if (n != null) return n;
      }
    }
    if (new RegExp(labelPattern, "i").test(line)) {
      for (let i = cells.length - 1; i >= 0; i--) {
        const n = parseMoney(cells[i]);
        if (n != null) return n;
      }
    }
  }
  return null;
}

/** Free text after "Label:" on a row (Customer, Building Type, Date Prepared). */
function extractTextAfterLabel(rows, labelPattern) {
  const inline = new RegExp(`${labelPattern}\\s*:\\s*(.+)$`, "i");
  for (const row of rows) {
    const line = rowJoinSpaces(row);
    const m = line.match(inline);
    if (m?.[1]) {
      return m[1].trim();
    }
  }
  const cellLabel = new RegExp(`^${labelPattern}\\s*:?$`, "i");
  for (const row of rows) {
    const cells = Array.isArray(row) ? row : [];
    for (let c = 0; c < cells.length; c++) {
      if (cellLabel.test(cellStr(cells[c]).trim())) {
        for (let d = c + 1; d < cells.length; d++) {
          const v = cellStr(cells[d]).trim();
          if (v && !/^\$[\d,.-]+$/.test(v)) return v;
        }
      }
    }
  }
  return "";
}

function extractCustomerName(rows) {
  // Buildexact puts "Customer:" label on one row and the name 1-2 rows later in the same column
  // (do NOT use inline extraction — other labels like "Estimate Details:" appear on the same row)
  const custIdx = findRowContaining(rows, /\bCustomer\b/i);
  if (custIdx >= 0) {
    const labelRow = Array.isArray(rows[custIdx]) ? rows[custIdx] : [];
    // Find which column the "Customer:" label is in
    let labelCol = -1;
    for (let c = 0; c < labelRow.length; c++) {
      if (/\bCustomer\b/i.test(cellStr(labelRow[c]))) { labelCol = c; break; }
    }
    // Look in the next 1-5 rows for a non-empty value in or near the same column
    for (let offset = 1; offset <= 5; offset++) {
      const nextRow = rows[custIdx + offset];
      if (!Array.isArray(nextRow)) continue;
      const colVal = labelCol >= 0 ? cellStr(nextRow[labelCol]) : "";
      if (colVal && !/^(net|markup|tax|estimate|building|date)/i.test(colVal)) return colVal;
      // Also check adjacent columns
      for (let c = Math.max(0, labelCol - 1); c <= Math.min(labelCol + 2, nextRow.length - 1); c++) {
        const v2 = cellStr(nextRow[c]);
        if (v2 && !/^(net|markup|tax|estimate|building|date|customer|ph:|email:)/i.test(v2)) return v2;
      }
    }
  }
  return "";
}

// Buildexact EstimateReport column layout (0-indexed):
//   A=0  B=1  C=2  D=3  ...  L=11  ...  T=19  ...  W=22  ...  AA=26  ...  AG=32  ...  AK=36  ...  AP=41
// Category rows: A=number, D=name, AK=subtotal
// Line item rows: C=code(x.y), L=description, T=type, W=units, AA=uom, AG=unit_cost, AP=total
const COL_CAT_NUM  = 0;   // A
const COL_CAT_NAME = 3;   // D
const COL_CAT_TOT  = 36;  // AK
const COL_ITEM_CODE = 2;  // C
const COL_ITEM_DESC = 11; // L
const COL_ITEM_TYPE = 19; // T
const COL_ITEM_UNITS = 22; // W
const COL_ITEM_UOM  = 26; // AA
const COL_ITEM_UCOST = 32; // AG
const COL_ITEM_TOT  = 41; // AP

function isCategoryRow(row) {
  const a = cellStr(row?.[COL_CAT_NUM]).replace(/[$,\s]/g, "");
  if (!/^\d+$/.test(a)) return false;              // col A must be a pure integer (may be currency-formatted as "$1")
  const name = cellStr(row?.[COL_CAT_NAME]);
  if (!name || name.length < 2) return false;       // col D must have a name
  // Category total in col AK — accept money value or " - " (zero-dollar category)
  const akVal = cellStr(row?.[COL_CAT_TOT]);
  const money = parseMoney(akVal);
  return money != null || /^\s*-\s*$/.test(akVal);
}

function isLineItemRow(row) {
  const code = cellStr(row?.[COL_ITEM_CODE]);
  if (!/^\d+\.\d+/.test(code)) return false;       // col C must be x.y code
  return true;
}

// Detect the Buildxact "Estimate Items" export — a flat sheet (usually "Data") with NAMED columns
// incl. CategoryDescription / Allowance (the explicit PC/PS flag) / TotalIncMarkupAndTax (per-line
// inc markup+tax). This export is preferred: PC/PS detection and category inc-GST subtotals are
// exact (summed per line, no ratio hack). Returns {sheetName, headerRow, header} or null.
function findEstimateItemsSheet(wb) {
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "", raw: false });
    for (let i = 0; i < Math.min(6, rows.length); i++) {
      const h = (rows[i] || []).map((c) => String(c).trim());
      if (h.includes("CategoryDescription") && h.includes("TotalIncMarkupAndTax")) {
        return { sheetName: sn, headerRow: i, header: h };
      }
    }
  }
  return null;
}

// Parse the Estimate Items "Data" sheet into the SAME shape parseXLSX returns for the report export,
// PLUS per-item `allowance` ("PC"|"PS"|"") and `total_inc_gst`. Category subtotals are summed from
// per-line values (exact), never derived via a ratio. The Data sheet carries no address/client, so
// those resolve from the linked job downstream; the quote number comes from the filename.
function parseEstimateItemsWorkbook(wb, found, filenameHint = "") {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[found.sheetName], { header: 1, defval: "", raw: false });
  const H = found.header;
  const col = (n) => H.indexOf(n);
  const cCat = col("CategoryDescription");
  const cDisp = col("DisplayedOrder");
  const cCode = col("Code");
  const cDesc = col("Description");
  const cType = col("Type");
  const cAllow = col("Allowance");
  const cUnits = col("Units");
  const cUom = col("UOM");
  const cUnitCost = col("UnitCost");
  const cTotal = col("Total");
  const cTotalInc = col("TotalIncMarkupAndTax");

  const catMap = new Map();
  let order = 0;
  for (let i = found.headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length === 0) continue;
    const catName = cellStr(row[cCat]).trim();
    if (!catName) continue;
    if (!catMap.has(catName)) {
      catMap.set(catName, { number: ++order, name: catName, subtotal: 0, subtotal_ex_gst: 0, subtotal_inc_gst: 0, active_items: [] });
    }
    const cat = catMap.get(catName);
    const desc = cellStr(row[cDesc]).trim();
    if (!desc) continue; // category-header / blank row — subtotals come from the item lines below
    const total = parseMoney(row[cTotal]);
    const totalInc = parseMoney(row[cTotalInc]);
    const isMeta = /\bSCHED\b/i.test(desc) || /COST\s+METRIC/i.test(desc);
    // Skip only TRUE zero lines — keep a line if EITHER the ex-markup cost OR the client-facing
    // inc-markup+tax figure carries value (supplier-direct / client-supplied lines have cost 0 but a
    // real sell price; dropping them would understate the total and lose PC/PS sums).
    if (!isMeta && (total == null || total <= 0) && (totalInc == null || totalInc <= 0)) continue;
    const allowRaw = cellStr(row[cAllow]).trim().toUpperCase();
    cat.active_items.push({
      code: cellStr(row[cDisp]) || cellStr(row[cCode]),
      description: desc,
      type: cellStr(row[cType]),
      allowance: allowRaw === "PC" || allowRaw === "PS" ? allowRaw : "",
      units: parseFloat(String(row[cUnits] || "").replace(/,/g, "")) || null,
      uom: cellStr(row[cUom]),
      unit_cost: parseMoney(row[cUnitCost]) ?? null,
      total: total ?? 0,
      total_inc_gst: totalInc ?? null
    });
    if (!isMeta) {
      if (total != null) cat.subtotal_ex_gst += total;
      if (totalInc != null) cat.subtotal_inc_gst += totalInc;
    }
  }

  const categories = [...catMap.values()].map((c) => ({
    ...c,
    subtotal: Math.round(c.subtotal_ex_gst * 100) / 100,
    subtotal_ex_gst: Math.round(c.subtotal_ex_gst * 100) / 100,
    subtotal_inc_gst: Math.round(c.subtotal_inc_gst * 100) / 100
  }));
  const net_total = Math.round(categories.reduce((s, c) => s + (c.subtotal_ex_gst || 0), 0) * 100) / 100;
  const estimate_total = Math.round(categories.reduce((s, c) => s + (c.subtotal_inc_gst || 0), 0) * 100) / 100;
  const qnFromFile = filenameHint ? (filenameHint.match(/(Q\d+)/i)?.[1]?.toUpperCase() || "") : "";
  return {
    quote_number: qnFromFile,
    address: "",
    client_name: "",
    arch_ref: "",
    eng_ref: "",
    building_type: "",
    date_prepared: "",
    net_total,
    markup_amount: 0,
    markup_percent: 0,
    tax: Math.max(0, Math.round((estimate_total - net_total) * 100) / 100),
    estimate_total,
    source_format: "estimateitems",
    categories
  };
}

/**
 * @param {Buffer} buffer
 * @param {string} [filenameHint] - original filename, e.g. "Q1191-CategoriesAndItems-20260512.xlsx"
 */
export function parseXLSX(buffer, filenameHint = "") {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ei = findEstimateItemsSheet(wb);
  if (ei) return parseEstimateItemsWorkbook(wb, ei, filenameHint);
  const name = wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });

  // Prefer quote number from filename (e.g. Q1191 from "Q1191-CategoriesAndItems-...")
  const qnFromFile = filenameHint ? (filenameHint.match(/^(Q\d+)/i)?.[1]?.toUpperCase() || "") : "";
  const quote_number = qnFromFile || extractQuoteNumber(rows) || "";
  const address = extractAddressFromTitle(rows) || extractField(rows, /Address\s*[:]\s*(.+)/i) || "";

  const client_name = extractCustomerName(rows);

  const building_type =
    extractTextAfterLabel(rows, "Building\\s+Type") ||
    extractField(rows, /Building\s*Type\s*[:]\s*(.+)/i) ||
    extractAfterLabel(rows, /Building\s*Type/i) ||
    "";
  const date_prepared =
    extractTextAfterLabel(rows, "Date\\s+Prepared") ||
    extractField(rows, /Date\s*Prepared\s*[:]\s*(.+)/i) ||
    extractAfterLabel(rows, /Date\s*Prepared/i) ||
    "";

  const net_total =
    extractMoneyAfterLabel(rows, "Net\\s+Total") ??
    scanKeyValueMoney(rows, "Net\\s*Total") ??
    scanKeyValueMoney(rows, "Sub\\s*Total") ??
    scanKeyValueMoney(rows, "Subtotal");
  const markup_amount =
    extractMoneyAfterLabel(rows, "\\bMarkup\\b") ??
    scanKeyValueMoney(rows, "Markup") ??
    scanKeyValueMoney(rows, "Mark\\s*Up");
  const tax =
    extractMoneyAfterLabel(rows, "\\bGST\\b") ??
    extractMoneyAfterLabel(rows, "\\bTax\\b") ??
    scanKeyValueMoney(rows, "\\bGST\\b") ??
    scanKeyValueMoney(rows, "\\bTax\\b");
  const estimate_total =
    extractMoneyAfterLabel(rows, "Estimate\\s+Total") ??
    extractMoneyAfterLabel(rows, "Grand\\s+Total") ??
    extractMoneyAfterLabel(rows, "Total\\s+Inc\\.?\\s*GST") ??
    scanKeyValueMoney(rows, "Estimate\\s*Total") ??
    scanKeyValueMoney(rows, "Grand\\s*Total") ??
    scanKeyValueMoney(rows, "Total\\s*Inc") ??
    (net_total != null && tax != null ? Math.round((net_total + (markup_amount ?? 0) + tax) * 100) / 100 : null) ??
    scanKeyValueMoney(rows, "Total");

  let markup_percent = null;
  if (net_total && markup_amount != null && net_total > 0) {
    markup_percent = Math.round((markup_amount / net_total) * 10000) / 100;
  }

  const categories = [];
  let current = null;

  for (const row of rows) {
    if (!Array.isArray(row) || row.length === 0) continue;
    if (isCategoryRow(row)) {
      if (current) categories.push(current);
      const num = parseInt(cellStr(row[COL_CAT_NUM]).replace(/[$,\s]/g, ""), 10);
      const nameCat = cellStr(row[COL_CAT_NAME]);
      const subtotal = parseMoney(row[COL_CAT_TOT]) ?? 0;
      const subtotal_ex_gst = subtotal;
      const subtotal_inc_gst = Math.round(subtotal_ex_gst * 1.1 * 100) / 100;
      current = {
        number: num,
        name: nameCat,
        subtotal,
        subtotal_ex_gst,
        subtotal_inc_gst,
        active_items: []
      };
    } else if (current && isLineItemRow(row)) {
      const total = parseMoney(row[COL_ITEM_TOT]);
      const rawDesc = cellStr(row[COL_ITEM_DESC]);
      const isMetaItem = /\bSCHED\b/i.test(rawDesc) || /COST\s+METRIC/i.test(rawDesc);
      if (!isMetaItem && (total == null || total <= 0)) continue;
      const code = cellStr(row[COL_ITEM_CODE]);
      const description = cellStr(row[COL_ITEM_DESC]);
      const type = cellStr(row[COL_ITEM_TYPE]) || "";
      const units = parseFloat(String(row[COL_ITEM_UNITS] || "").replace(/,/g, "")) || null;
      const uom = cellStr(row[COL_ITEM_UOM]) || "";
      const unit_cost = parseMoney(row[COL_ITEM_UCOST]) ?? null;
      current.active_items.push({
        code,
        description,
        type,
        allowance: "",       // PC/PS flag is absent from the report export — only the estimateitems export carries it
        units,
        uom,
        unit_cost,
        total,
        total_inc_gst: null  // report export has no per-line inc-GST; category inc-GST is ratio-derived below
      });
    }
  }
  if (current) categories.push(current);

  // Recalculate inc GST per category using the full estimate ratio (includes markup + GST)
  // so category inc GST amounts sum correctly to the estimate total shown to clients.
  const netForRatio = net_total ?? 0;
  const estForRatio = estimate_total ?? 0;
  if (netForRatio > 0 && estForRatio > 0) {
    const ratio = estForRatio / netForRatio;
    for (const cat of categories) {
      cat.subtotal_inc_gst = Math.round(cat.subtotal_ex_gst * ratio * 100) / 100;
    }
  }

  return {
    quote_number,
    address,
    client_name,
    arch_ref: "",
    eng_ref: "",
    building_type,
    date_prepared,
    net_total: net_total ?? 0,
    markup_amount: markup_amount ?? 0,
    markup_percent: markup_percent ?? 0,
    tax: tax ?? 0,
    estimate_total: estimate_total ?? 0,
    source_format: "report",
    categories
  };
}

/**
 * @param {Buffer} buffer
 * @param {(prompt: string, pdfBase64: string) => Promise<string>} runClaudeJson
 */
export async function parsePDF(buffer, runClaudeJson) {
  const b64 = buffer.toString("base64");
  const prompt = `Extract all cost categories and their active line items (where total > $0) from this Buildexact estimate PDF. Return ONLY valid JSON (no markdown) with this exact shape:
{
  "quote_number": string,
  "address": string,
  "client_name": string,
  "building_type": string,
  "date_prepared": string,
  "net_total": number,
  "markup_amount": number,
  "markup_percent": number,
  "tax": number,
  "estimate_total": number,
  "categories": [
    {
      "number": number,
      "name": string,
      "subtotal": number,
      "active_items": [
        { "code": string, "description": string, "type": string, "units": number|null, "uom": string, "unit_cost": number|null, "total": number }
      ]
    }
  ]
}
Only include line items with dollar total > 0. Use 0 for unknown numerics.`;

  const raw = await runClaudeJson(prompt, b64);
  let jsonSlice = raw.trim();
  const fence = jsonSlice.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) jsonSlice = fence[1].trim();
  const braceStart = jsonSlice.indexOf("{");
  const braceEnd = jsonSlice.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) jsonSlice = jsonSlice.slice(braceStart, braceEnd + 1);
  const parsed = JSON.parse(jsonSlice);
  const categories = Array.isArray(parsed.categories) ? parsed.categories : [];
  for (const cat of categories) {
    const st = Number(cat.subtotal);
    if (!Number.isFinite(st)) continue;
    if (cat.subtotal_ex_gst == null) cat.subtotal_ex_gst = st;
    if (cat.subtotal_inc_gst == null) cat.subtotal_inc_gst = Math.round(st * 1.1 * 100) / 100;
  }
  return {
    quote_number: String(parsed.quote_number || ""),
    address: String(parsed.address || ""),
    client_name: String(parsed.client_name || ""),
    arch_ref: "",
    eng_ref: "",
    building_type: String(parsed.building_type || ""),
    date_prepared: String(parsed.date_prepared || ""),
    net_total: Number(parsed.net_total) || 0,
    markup_amount: Number(parsed.markup_amount) || 0,
    markup_percent: Number(parsed.markup_percent) || 0,
    tax: Number(parsed.tax) || 0,
    estimate_total: Number(parsed.estimate_total) || 0,
    categories
  };
}

function firstArrayPayload(json) {
  if (Array.isArray(json)) return json;
  return json?.items || json?.estimateItems || json?.EstimateItems || json?.lineItems || json?.data || json?.value || [];
}

function pick(obj, keys, fallback = "") {
  for (const key of keys) {
    const v = obj?.[key];
    if (v != null && v !== "") return v;
  }
  return fallback;
}

function itemAmount(item) {
  const n = Number(pick(item, ["total", "Total", "amount", "Amount", "lineTotal", "LineTotal", "subtotal", "Subtotal"], 0));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalise Buildxact estimateitems / estimates API payloads into parseXLSX-compatible categories.
 * API shape varies by account/version, so this accepts both flat line arrays and category arrays.
 */
export function normaliseBuildexactEstimatePayload(payload, opts = {}) {
  const source = Array.isArray(payload?.categories) ? payload.categories : firstArrayPayload(payload);
  const categoryMap = new Map();

  const addItem = (catNameRaw, catNumberRaw, rawItem = {}) => {
    const catName = String(catNameRaw || "Buildexact").trim() || "Buildexact";
    const catNumber = Number(catNumberRaw);
    const key = `${Number.isFinite(catNumber) ? catNumber : ""}:${catName.toLowerCase()}`;
    if (!categoryMap.has(key)) {
      categoryMap.set(key, {
        number: Number.isFinite(catNumber) ? catNumber : categoryMap.size + 1,
        name: catName,
        subtotal: 0,
        subtotal_ex_gst: 0,
        subtotal_inc_gst: 0,
        active_items: []
      });
    }
    const cat = categoryMap.get(key);
    const total = itemAmount(rawItem);
    const description = String(pick(rawItem, ["description", "Description", "name", "Name", "itemName", "ItemName", "title", "Title"], catName)).trim();
    const line = {
      id: String(pick(rawItem, ["id", "Id", "itemId", "ItemId", "estimateItemId", "EstimateItemId"], "")),
      code: String(pick(rawItem, ["code", "Code", "itemCode", "ItemCode", "number", "Number"], "")),
      description,
      type: String(pick(rawItem, ["type", "Type", "itemType", "ItemType"], "")),
      units: Number(pick(rawItem, ["units", "Units", "quantity", "Quantity", "qty", "Qty"], 0)) || null,
      uom: String(pick(rawItem, ["uom", "Uom", "unit", "Unit", "unitOfMeasure", "UnitOfMeasure"], "")),
      unit_cost: Number(pick(rawItem, ["unit_cost", "unitCost", "UnitCost", "rate", "Rate"], 0)) || null,
      total
    };
    cat.active_items.push(line);
    cat.subtotal += total;
    cat.subtotal_ex_gst += total;
    cat.subtotal_inc_gst += Math.round(total * 1.1 * 100) / 100;
  };

  for (const row of source || []) {
    const nested = row?.active_items || row?.lineItems || row?.items || row?.estimateItems || row?.costs || row?.children;
    const categoryName = pick(row, ["categoryName", "CategoryName", "category", "Category", "name", "Name", "title", "Title"], "");
    const categoryNumber = pick(row, ["categoryNumber", "CategoryNumber", "categoryNo", "number", "Number"], "");
    if (Array.isArray(nested)) {
      for (const item of nested) addItem(categoryName, categoryNumber, item);
    } else {
      addItem(
        pick(row, ["categoryName", "CategoryName", "category", "Category", "sectionName", "SectionName"], categoryName || "Buildexact"),
        categoryNumber,
        row
      );
    }
  }

  const categories = [...categoryMap.values()].map((cat) => ({
    ...cat,
    subtotal: Math.round(cat.subtotal * 100) / 100,
    subtotal_ex_gst: Math.round(cat.subtotal_ex_gst * 100) / 100,
    subtotal_inc_gst: Math.round(cat.subtotal_inc_gst * 100) / 100
  }));
  const estimateTotal = Number(pick(payload, ["estimate_total", "estimateTotal", "EstimateTotal", "total", "Total"], 0)) || categories.reduce((s, c) => s + Number(c.subtotal_inc_gst || 0), 0);
  return {
    quote_number: String(opts.quoteNumber || pick(payload, ["quote_number", "quoteNumber", "QuoteNumber", "number", "Number"], "")),
    address: String(opts.address || pick(payload, ["address", "Address", "jobAddress", "JobAddress"], "")),
    client_name: String(opts.clientName || pick(payload, ["client_name", "clientName", "ClientName", "customerName", "CustomerName"], "")),
    arch_ref: "",
    eng_ref: "",
    building_type: String(pick(payload, ["building_type", "buildingType", "BuildingType"], "")),
    date_prepared: String(pick(payload, ["date_prepared", "datePrepared", "DatePrepared", "createdAt", "CreatedAt"], "")),
    net_total: categories.reduce((s, c) => s + Number(c.subtotal_ex_gst || 0), 0),
    markup_amount: 0,
    markup_percent: 0,
    tax: Math.max(0, estimateTotal - categories.reduce((s, c) => s + Number(c.subtotal_ex_gst || 0), 0)),
    estimate_total: Math.round(estimateTotal * 100) / 100,
    categories
  };
}

export function parseSchedItems(categories = []) {
  const out = [];
  for (const cat of categories || []) {
    const mapping = getBuildexactCategoryMapping(cat.name);
    for (const item of cat.active_items || []) {
      const desc = String(item.description || "");
      if (!/\bSCHED\b/i.test(desc)) continue;
      const taskName = desc.split(/SCHED/i)[0].trim() || cat.name || "Schedule task";
      const durationValue = Number(item.units) || 0;
      const uom = String(item.uom || "").toLowerCase();
      const durationDays = uom.includes("week") ? durationValue * 7 : durationValue;
      out.push({
        task_name: taskName,
        duration_days: Math.max(0, Math.round(durationDays)),
        phase: mapping?.phase || normCategoryName(cat.name).replace(/\s+/g, "_") || "general",
        trade_key: mapping?.tradeKey || "",
        buildexact_item_code: item.code || item.id || "",
        buildexact_item_id: item.id || "",
        category_name: cat.name || ""
      });
    }
  }
  return out;
}

export function parseCostMetrics(categories = []) {
  const metrics = {};
  for (const cat of categories || []) {
    for (const item of cat.active_items || []) {
      const desc = String(item.description || "");
      if (!/COST\s+METRIC/i.test(desc)) continue;
      const m = desc.match(/\[([^\]]+)\]/);
      if (!m?.[1]) continue;
      const key = m[1].toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (!key) continue;
      const value = Number(item.units);
      if (Number.isFinite(value)) metrics[key] = value;
    }
  }
  return metrics;
}
