import * as XLSX from "xlsx";

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

/**
 * @param {Buffer} buffer
 * @param {string} [filenameHint] - original filename, e.g. "Q1191-CategoriesAndItems-20260512.xlsx"
 */
export function parseXLSX(buffer, filenameHint = "") {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
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
      if (total == null || total <= 0) continue;
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
        units,
        uom,
        unit_cost,
        total
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
