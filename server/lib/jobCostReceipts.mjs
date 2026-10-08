/**
 * jobCostReceipts — shared logic for capturing a supplier invoice / receipt against ANY carpentry job
 * (the internal houses + real client jobs): Haiku-OCR the file, then on confirm upload it to Dropbox and
 * insert the amount as a carpentry_job_cost so it drops into the job's material tally. Used by the Hub
 * (carpentryRoutes, Supabase auth) and the Worker PWA (workforceRoutes, worker-token, leading-hand-gated)
 * so every surface behaves identically.
 *
 * Storage: Dropbox /BLUE LEAF BUILDING/RECIEPTS (note: the live folder is spelled "RECIEPTS"), one file per
 * receipt named "<D.M.YYYY> <supplier>.<ext>" where the date is the INVOICE date off the receipt (confirmed
 * by the operator), e.g. "4.10.2026 bunnings.jpg". The Dropbox path is stored in carpentry_job_costs.receipt_path
 * (migration 204 column; the Supabase bucket from that migration is now vestigial — only legacy rows use it).
 * Upload happens on SAVE (after the operator confirms the amount + date + supplier) so there are no orphan
 * files and the filename is exact.
 */
import { extractInvoiceHaiku } from "./financeRoutes.mjs";
import { translateDbError, rowToCamel } from "./apiResponse.mjs";
import { GST_RATE } from "./constants.mjs";
import {
  dropboxConfigured, getDropboxAccessToken, dropboxUploadBuffer, getOrCreateSharedLinkForPath,
} from "./dropboxClient.mjs";

export const RECEIPT_BUCKET = "job-cost-receipts";          // legacy Supabase bucket (back-compat view only)
export const RECEIPTS_DROPBOX_BASE = "/BLUE LEAF BUILDING/RECIEPTS"; // live folder spelling is "RECIEPTS"
const COST_TYPES = ["material", "subcontract", "other"];
const round2 = (v) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? Math.round(Number(v) * 100) / 100 : null);
// Neutralise SQL LIKE wildcards (\ % _) so an invoice number / supplier containing them matches literally
// (case-insensitively) under ilike, instead of being treated as a pattern.
const likeEscape = (s) => String(s).replace(/[\\%_]/g, (c) => `\\${c}`);

// Filename: "<D.M.YYYY> <supplier>.<ext>" from the confirmed invoice date + supplier (Sam's spec, e.g.
// "4.10.2026 bunnings.jpg"). Falls back to today's date / "receipt" when a part is missing.
function receiptFileName(costDate, supplierName, mime) {
  let d = (costDate && /^\d{4}-\d{2}-\d{2}/.test(String(costDate))) ? new Date(`${String(costDate).slice(0, 10)}T12:00:00`) : new Date();
  if (Number.isNaN(d.getTime())) d = new Date(); // well-formed but invalid date (e.g. 2026-13-45) → fall back to today
  const datePart = `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  const supplier = String(supplierName || "receipt").toLowerCase().replace(/[^a-z0-9 &._-]+/g, "").trim().replace(/\s+/g, " ").slice(0, 60) || "receipt";
  let ext = mime === "application/pdf" ? "pdf" : ((String(mime || "").split("/")[1] || "jpg").replace(/[^a-z0-9]/g, "") || "jpg");
  if (ext === "jpeg") ext = "jpg";
  return `${datePart} ${supplier}.${ext}`;
}

/**
 * Haiku OCR only (no storage). Returns { ok:true, data:{ supplierName, amountExGst, amountTotal,
 * invoiceDate, suggestedDescription, extractionOk } } or { ok:false, status, error }. The caller confirms
 * the amount + date, then calls saveReceiptCost (which uploads + inserts).
 */
export async function extractReceipt({ fileBase64, mimeType } = {}) {
  if (!fileBase64) return { ok: false, status: 400, error: "fileBase64 is required." };
  const mime = String(mimeType || "").toLowerCase();
  if (!(mime === "application/pdf" || mime.startsWith("image/"))) {
    return { ok: false, status: 400, error: "Only a PDF or image invoice is supported." };
  }
  const b64 = String(fileBase64).replace(/^data:[^;]+;base64,/, "");
  const exd = await extractInvoiceHaiku(b64, mime);
  const exGst = round2(exd?.amount_ex_gst);
  const total = round2(exd?.amount_total);
  const amountExGst = exGst != null ? exGst : (total != null ? round2(total / (1 + GST_RATE)) : null);
  return {
    ok: true,
    data: {
      supplierName: exd?.supplier_name || null,
      amountExGst,
      amountTotal: total,
      invoiceDate: exd?.invoice_date || null,
      invoiceNumber: exd?.invoice_number || null,
      suggestedDescription: exd?.supplier_name || "Supplier invoice",
      extractionOk: !exd?.error,
    },
  };
}

/**
 * Insert the carpentry_job_cost then file the confirmed receipt to Dropbox and point the row at it.
 * Returns { ok:true, cost, receiptWarning? } or { ok:false, status, error }. The cost row is written
 * FIRST (money is the source of truth and its validation guards job existence), so a failed save —
 * bad job, bad fields — never leaves an orphan file in Dropbox. If the file can't be filed (Dropbox
 * not configured, upload/link failure) the cost still stands with a receiptWarning for the UI.
 */
export async function saveReceiptCost(sb, jobId, body = {}) {
  const { fileBase64, mimeType, costDate, supplierName } = body;

  // Validate the file up front (cheap, no side effects) so a bad file never creates a cost row.
  let buffer = null;
  let mime = null;
  if (fileBase64) {
    mime = String(mimeType || "").toLowerCase();
    if (!(mime === "application/pdf" || mime.startsWith("image/"))) {
      return { ok: false, status: 400, error: "Only a PDF or image invoice is supported." };
    }
    const b64 = String(fileBase64).replace(/^data:[^;]+;base64,/, "");
    buffer = Buffer.from(b64, "base64");
    if (!buffer.length) return { ok: false, status: 400, error: "Empty file." };
    if (buffer.length > 15 * 1024 * 1024) return { ok: false, status: 413, error: "File too large (max 15MB)." };
  }

  // 1) Insert the cost (validates fields + job existence). Nothing has been uploaded yet, so any
  //    failure here leaves no orphan file.
  const res = await insertJobCost(sb, jobId, { ...body, receiptPath: null });
  if (!res.ok) return res;
  let cost = res.cost;
  let receiptWarning = null;

  // 2) File the receipt to Dropbox and link it onto the row. Fail-soft — the cost already stands.
  if (buffer) {
    if (!dropboxConfigured()) {
      receiptWarning = "Dropbox isn't configured — the cost was saved but the file wasn't filed.";
    } else {
      try {
        const token = await getDropboxAccessToken();
        const name = receiptFileName(costDate, supplierName, mime);
        const meta = await dropboxUploadBuffer(token, `${RECEIPTS_DROPBOX_BASE}/${name}`, buffer, { autorename: true });
        const receiptPath = meta?.path_display || meta?.path_lower || `${RECEIPTS_DROPBOX_BASE}/${name}`;
        const { data: updated, error: upErr } = await sb
          .from("carpentry_job_costs")
          .update({ receipt_path: receiptPath, updated_at: new Date().toISOString() })
          .eq("id", cost.id)
          .select("*")
          .single();
        if (upErr) receiptWarning = "The cost and file were saved but couldn't be linked — open the cost to re-attach it.";
        else cost = rowToCamel(updated);
      } catch (e) {
        console.error("[jobCostReceipts] Dropbox upload failed", e?.message);
        receiptWarning = "The cost was saved but the file couldn't be filed to Dropbox — try re-uploading it.";
      }
    }
  }

  return { ok: true, cost, ...(receiptWarning ? { receiptWarning } : {}) };
}

/**
 * Resolve a viewable URL for a stored receipt. Dropbox paths (absolute, start with "/") → a team shared
 * link; legacy Supabase bucket paths → a signed URL. Returns { ok:true, url } or { ok:false, status, error }.
 */
export async function resolveReceiptLink(sb, receiptPath) {
  if (!receiptPath) return { ok: false, status: 404, error: "No receipt on this cost." };
  try {
    if (String(receiptPath).startsWith("/")) {
      const token = await getDropboxAccessToken();
      const url = await getOrCreateSharedLinkForPath(token, receiptPath);
      return { ok: true, url };
    }
    // Legacy Supabase-stored receipt.
    const { data, error } = await sb.storage.from(RECEIPT_BUCKET).createSignedUrl(receiptPath, 3600);
    if (error || !data?.signedUrl) return { ok: false, status: 502, error: "Couldn't open the receipt." };
    return { ok: true, url: data.signedUrl };
  } catch (e) {
    console.error("[jobCostReceipts] resolveReceiptLink", e?.message);
    return { ok: false, status: 502, error: "Couldn't open the receipt." };
  }
}

/**
 * Soft duplicate check for a scanned invoice, scoped to one job. Returns
 * { duplicate:true, matchType:"invoice"|"fuzzy", existing:{…camelCase cost…} } or { duplicate:false }.
 * STRONG match = same invoice number + supplier (near-certain, the invoice # the OCR read). FUZZY fallback
 * = same supplier + cost_date + amount (catches a re-scan when no number was printed / OCR missed it).
 * Advisory only — the caller surfaces it as a warning the operator can override; it NEVER blocks a save
 * (genuine same-supplier same-day receipts exist). Mirrors the Finance is_duplicate flag (financeRoutes).
 * `invoice_number` lives behind migration 205; if that column is absent the strong query errors and we
 * fall through to the fuzzy check (fail-soft — a missing column never breaks a scan).
 */
export async function findPossibleDuplicate(sb, jobId, { invoiceNumber, supplierName, amount, costDate } = {}) {
  if (!sb || !jobId) return { duplicate: false };
  const supplier = supplierName ? String(supplierName).trim() : "";
  try {
    // Strong: same invoice number + supplier on this job. Selects invoice_number, so this whole query
    // errors (and is skipped) until migration 205 adds the column — then the fuzzy check below still runs.
    const invNo = invoiceNumber ? String(invoiceNumber).trim() : "";
    if (invNo && supplier) {
      const { data, error } = await sb.from("carpentry_job_costs")
        .select("id, supplier_name, invoice_number, amount, cost_date, description, source")
        .eq("job_id", jobId).ilike("invoice_number", likeEscape(invNo)).ilike("supplier_name", likeEscape(supplier)).limit(1);
      if (!error && data?.length) return { duplicate: true, matchType: "invoice", existing: rowToCamel(data[0]) };
    }
    // Fuzzy: same supplier + date + amount on this job. Does NOT reference invoice_number, so it works
    // even before migration 205 (catches a re-scan of a receipt with no printed number).
    const amt = round2(amount);
    if (supplier && costDate && amt != null) {
      const { data, error } = await sb.from("carpentry_job_costs")
        .select("id, supplier_name, amount, cost_date, description, source")
        .eq("job_id", jobId).ilike("supplier_name", likeEscape(supplier)).eq("cost_date", costDate).eq("amount", amt).limit(1);
      if (!error && data?.length) return { duplicate: true, matchType: "fuzzy", existing: rowToCamel(data[0]) };
    }
  } catch (e) {
    console.error("[jobCostReceipts] findPossibleDuplicate", e?.message);
  }
  return { duplicate: false };
}

/**
 * Validate + insert a carpentry_job_cost row (adds straight to the job's material tally). Returns
 * { ok:true, cost } (camelCase) or { ok:false, status, error }. receiptPath/supplierName are only written
 * when provided, so this stays safe before migration 204 adds those columns. Also used by the plain
 * (typed, no-file) /costs endpoint.
 */
export async function insertJobCost(sb, jobId, body = {}) {
  const {
    costType, description, amount, costDate, source = "manual", sourceReference,
    carpentryJobBudgetId, carpentryBudgetLineItemId, receiptPath, supplierName, invoiceNumber,
  } = body;

  if (!costType) return { ok: false, status: 400, error: "costType is required." };
  if (!COST_TYPES.includes(costType)) return { ok: false, status: 400, error: `costType must be one of: ${COST_TYPES.join(", ")}.` };
  if (!description) return { ok: false, status: 400, error: "description is required." };
  if (amount == null || Number(amount) < 0 || Number.isNaN(Number(amount))) return { ok: false, status: 400, error: "amount must be a non-negative number." };

  const { data: job } = await sb.from("carpentry_jobs").select("id").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, status: 404, error: "Carpentry job not found." };

  const now = new Date().toISOString();
  const row = {
    job_id:           jobId,
    cost_type:        costType,
    description:      String(description).trim(),
    amount:           Number(amount),
    source:           ["manual", "xero"].includes(source) ? source : "manual",
    source_reference: sourceReference ? String(sourceReference).trim() : null,
    cost_date:        costDate || now.slice(0, 10),
    ...(carpentryJobBudgetId ? { carpentry_job_budget_id: carpentryJobBudgetId } : {}),
    ...(carpentryBudgetLineItemId ? { carpentry_budget_line_item_id: carpentryBudgetLineItemId } : {}),
    ...(receiptPath ? { receipt_path: String(receiptPath) } : {}),
    ...(supplierName ? { supplier_name: String(supplierName).trim() } : {}),
    ...(invoiceNumber ? { invoice_number: String(invoiceNumber).trim() } : {}),
    created_at:       now,
    updated_at:       now,
  };
  let { data: cost, error } = await sb.from("carpentry_job_costs").insert(row).select("*").single();
  // Fail-soft if migration 205 (invoice_number) isn't applied yet: drop that one field and retry so the
  // cost still saves (money matters most — the duplicate flag just won't persist until the column lands).
  if (error && row.invoice_number && /invoice_number/i.test(error.message || "")) {
    delete row.invoice_number;
    ({ data: cost, error } = await sb.from("carpentry_job_costs").insert(row).select("*").single());
  }
  if (error) return { ok: false, status: 502, error: translateDbError(error) };
  return { ok: true, cost: rowToCamel(cost) };
}
