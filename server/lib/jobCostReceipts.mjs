/**
 * jobCostReceipts — shared logic for capturing a supplier invoice against a carpentry job
 * (the internal house jobs especially): store the PDF/photo, Haiku-OCR it, and insert the
 * confirmed amount as a carpentry_job_cost row. Used by BOTH the Hub house view (carpentryRoutes,
 * Supabase-auth) and the Worker PWA (workforceRoutes, worker-token auth, admin/supervisor-gated) so
 * the two paths behave identically. Migration 204 adds carpentry_job_costs.receipt_path/supplier_name
 * + the private 'job-cost-receipts' bucket.
 *
 * Each function takes the service-role supabase client and returns a plain result object
 * ({ ok, status, error } on failure) so the caller owns the HTTP response shape.
 */
import { extractInvoiceHaiku } from "./financeRoutes.mjs";
import { translateDbError, rowToCamel } from "./apiResponse.mjs";

export const RECEIPT_BUCKET = "job-cost-receipts";
const COST_TYPES = ["material", "subcontract", "other"];
const round2 = (v) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? Math.round(Number(v) * 100) / 100 : null);

/**
 * Store an uploaded / phone-scanned invoice in the receipts bucket and Haiku-OCR it. Does NOT create
 * the cost row — the caller confirms the amount, then calls insertJobCost with { receiptPath, ... }.
 * Returns { ok:true, data:{ receiptPath, supplierName, amountExGst, amountTotal, invoiceDate,
 * suggestedDescription, extractionOk } } or { ok:false, status, error }.
 */
export async function storeAndScanReceipt(sb, jobId, { fileBase64, mimeType, filename } = {}) {
  if (!fileBase64) return { ok: false, status: 400, error: "fileBase64 is required." };
  const mime = String(mimeType || "").toLowerCase();
  if (!(mime === "application/pdf" || mime.startsWith("image/"))) {
    return { ok: false, status: 400, error: "Only a PDF or image invoice is supported." };
  }
  const { data: job } = await sb.from("carpentry_jobs").select("id").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, status: 404, error: "Carpentry job not found." };

  const b64 = String(fileBase64).replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(b64, "base64");
  if (!buffer.length) return { ok: false, status: 400, error: "Empty file." };
  if (buffer.length > 15 * 1024 * 1024) return { ok: false, status: 413, error: "File too large (max 15MB)." };

  // Store: [bucket]/carpentry_jobs/[jobId]/[date]-[epoch]-[sanitised-filename]
  const ext = mime === "application/pdf" ? "pdf" : ((mime.split("/")[1] || "jpg").replace(/[^a-z0-9]/g, "") || "jpg");
  const base = String(filename || `invoice.${ext}`).replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase().slice(0, 60);
  const safe = base.endsWith(`.${ext}`) ? base : `${base}.${ext}`;
  const path = `carpentry_jobs/${jobId}/${new Date().toISOString().slice(0, 10)}-${Date.now()}-${safe}`;
  const { error: upErr } = await sb.storage.from(RECEIPT_BUCKET).upload(path, buffer, { contentType: mime, upsert: false });
  if (upErr) {
    const msg = /not found|does not exist|bucket/i.test(upErr.message || "")
      ? "Receipts storage isn't set up yet — apply migration 204 (the job-cost-receipts bucket)."
      : translateDbError(upErr);
    return { ok: false, status: 502, error: msg };
  }

  // Haiku OCR — token-conservative, best-effort. The caller confirms before the cost is saved.
  const exd = await extractInvoiceHaiku(b64, mime);
  const exGst = round2(exd?.amount_ex_gst);
  const total = round2(exd?.amount_total);
  // ex-GST is the stored basis — prefer a captured ex-GST figure, else derive from the inc-GST total.
  const amountExGst = exGst != null ? exGst : (total != null ? round2(total / 1.1) : null);

  return {
    ok: true,
    data: {
      receiptPath: path,
      supplierName: exd?.supplier_name || null,
      amountExGst,
      amountTotal: total,
      invoiceDate: exd?.invoice_date || null,
      suggestedDescription: exd?.supplier_name || "Supplier invoice",
      extractionOk: !exd?.error,
    },
  };
}

/**
 * Validate + insert a carpentry_job_cost row (adds straight to the job's material tally). Returns
 * { ok:true, cost } (camelCase) or { ok:false, status, error }. receiptPath/supplierName are only
 * written when provided, so this stays safe before migration 204 adds those columns.
 */
export async function insertJobCost(sb, jobId, body = {}) {
  const {
    costType, description, amount, costDate, source = "manual", sourceReference,
    carpentryJobBudgetId, carpentryBudgetLineItemId, receiptPath, supplierName,
  } = body;

  if (!costType) return { ok: false, status: 400, error: "costType is required." };
  if (!COST_TYPES.includes(costType)) return { ok: false, status: 400, error: `costType must be one of: ${COST_TYPES.join(", ")}.` };
  if (!description) return { ok: false, status: 400, error: "description is required." };
  if (amount == null || Number(amount) < 0 || Number.isNaN(Number(amount))) return { ok: false, status: 400, error: "amount must be a non-negative number." };

  const { data: job } = await sb.from("carpentry_jobs").select("id").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, status: 404, error: "Carpentry job not found." };

  const now = new Date().toISOString();
  const { data: cost, error } = await sb
    .from("carpentry_job_costs")
    .insert({
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
      created_at:       now,
      updated_at:       now,
    })
    .select("*")
    .single();
  if (error) return { ok: false, status: 502, error: translateDbError(error) };
  return { ok: true, cost: rowToCamel(cost) };
}
