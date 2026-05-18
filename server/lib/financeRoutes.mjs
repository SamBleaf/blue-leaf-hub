import Anthropic from "@anthropic-ai/sdk";
import { getServiceSupabase } from "./supabaseService.mjs";
import {
  dropboxConfigured,
  getDropboxAccessToken,
  dropboxUploadBuffer,
  sharedJobRootPath,
  DROPBOX_PRIVATE_INTERNAL_BASE
} from "./dropboxClient.mjs";

const MODEL_FAST = "claude-haiku-4-5-20251001";   // Tier 2: OCR + gaps
const MODEL_SLOW = process.env.CLAUDE_MODEL || "claude-sonnet-4-6"; // Tier 3: ambiguous only
const FINANCE_INBOX_PATH = `${DROPBOX_PRIVATE_INTERNAL_BASE}/FINANCE INBOX`;
const AUTO_APPROVE_THRESHOLD = Number(process.env.FINANCE_AUTO_APPROVE_BELOW ?? 0);

// ── Matching helpers ──────────────────────────────────────────────────────────

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0).map((_, j) => i || j));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function similarity(a, b) {
  const na = String(a || "").toLowerCase().trim();
  const nb = String(b || "").toLowerCase().trim();
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshtein(na, nb) / maxLen;
}

function normAddr(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\bstreet\b/g, "st").replace(/\broad\b/g, "rd")
    .replace(/\bavenue\b/g, "ave").replace(/\bdrive\b/g, "dr")
    .replace(/\bplace\b/g, "pl").replace(/\bclose\b/g, "cl")
    .replace(/\bcourt\b/g, "ct").replace(/\bterrace\b/g, "tce")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function addrSimilarity(a, b) {
  const na = normAddr(a), nb = normAddr(b);
  if (!na || !nb) return 0;
  // Weight: street number match is strong signal
  const partsA = na.split(" ");
  const numA = partsA[0];
  if (numA && nb.startsWith(numA + " ")) {
    return 0.5 + 0.5 * similarity(na, nb);
  }
  return similarity(na, nb);
}

function normRef(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

// ── 4-tier matching cascade ────────────────────────────────────────────────────

async function matchDocument(extracted, { jobs, subcontractors }) {
  const { extracted_job_ref, extracted_po_number, extracted_address, supplier_name } = extracted;

  // Tier 1 — Exact deterministic matches (free, instant, auditable)
  if (extracted_job_ref) {
    const ref = normRef(extracted_job_ref);
    const job = jobs.find(j => normRef(j.job_reference) === ref || normRef(j.id) === ref);
    if (job) return { job_id: job.id, method: "exact_job_ref", confidence: 100 };
  }

  if (extracted_address) {
    const na = normAddr(extracted_address);
    const exact = jobs.find(j => normAddr(j.address) === na);
    if (exact) return { job_id: exact.id, method: "exact_address", confidence: 100 };
  }

  // Tier 1.5 — Supplier default (sub has only ever worked on one active job)
  if (supplier_name && subcontractors.length) {
    const sup = subcontractors.find(s => similarity(s.business_name, supplier_name) > 0.82);
    if (sup?.default_job_id) return { job_id: sup.default_job_id, method: "supplier_default", confidence: 90 };
  }

  // Tier 2 — Fuzzy (pg_trgm equivalent in JS; small dataset so this is fast)
  if (extracted_address) {
    let best = null, bestScore = 0;
    for (const job of jobs) {
      const score = addrSimilarity(job.address, extracted_address);
      if (score > bestScore) { bestScore = score; best = job; }
    }
    if (bestScore >= 0.78) return { job_id: best.id, method: "fuzzy_address", confidence: Math.round(bestScore * 100) };
  }

  if (supplier_name) {
    let best = null, bestScore = 0;
    for (const sub of subcontractors) {
      const score = similarity(sub.business_name || "", supplier_name);
      if (score > bestScore) { bestScore = score; best = sub; }
    }
    if (bestScore >= 0.78 && best?.default_job_id) {
      return { job_id: best.default_job_id, method: "fuzzy_supplier", confidence: Math.round(bestScore * 100) };
    }
  }

  // Tier 3 — AI (only when fuzzy can't decide; costs money, use sparingly)
  if ((extracted_address || supplier_name) && jobs.length) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const jobList = jobs.slice(0, 30).map(j => `ID:${j.id} | ${j.address} | ref:${j.job_reference || ""}`).join("\n");
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 256,
        messages: [{
          role: "user",
          content: `Match this financial document to the most likely construction job.

Document signals:
- Supplier: ${supplier_name || "unknown"}
- Address found: ${extracted_address || "none"}
- Job ref found: ${extracted_job_ref || "none"}

Active jobs:
${jobList}

Return JSON only: {"job_id": "<uuid or null>", "confidence": <0-100>, "reasoning": "<one line>"}
If no reasonable match exists, return job_id: null.`
        }]
      });
      const text = msg.content[0]?.text || "";
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (parsed.job_id && parsed.confidence >= 65) {
          const found = jobs.find(j => j.id === parsed.job_id);
          if (found) return { job_id: found.id, method: "ai", confidence: parsed.confidence };
        }
      }
    } catch {
      // AI tier failed — fall through to unmatched
    }
  }

  return { job_id: null, method: null, confidence: 0 };
}

// HEIC is converted to JPEG client-side before upload (browser canvas API on Safari/iOS).

// ── Tier 1 — Regex extraction (free, instant, no API call) ───────────────────
// Covers ~70% of clean AU invoices/receipts for key fields.

const MONTH_MAP = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };

function parseAuDate(s) {
  if (!s) return null;
  // DD/MM/YYYY or DD-MM-YYYY
  let m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return `${year}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }
  // DD-Mon-YYYY or D Mon YYYY
  m = s.match(/(\d{1,2})[\s\-](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[\s\-,](\d{2,4})/i);
  if (m) {
    const [, d, mo, y] = m;
    const month = MONTH_MAP[mo.slice(0,3).toLowerCase()];
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }
  return null;
}

function parseAmount(s) {
  if (!s) return null;
  const n = Number(String(s).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function regexExtract(text) {
  const t = String(text || "");
  const result = {};

  // ABN: 11 digits, optionally spaced
  const abnM = t.match(/\bABN[:\s#]*([\d]{2}[\s\d]{7,13})/i);
  if (abnM) result.supplier_abn = abnM[1].replace(/\s/g, " ").trim();

  // Invoice / receipt number
  const invM = t.match(/(?:Invoice|Inv|Receipt|Rec|Tax Invoice)[#\s:No.]*([A-Z0-9][A-Z0-9\-\/]{2,20})/i);
  if (invM) result.invoice_number = invM[1].trim();

  // Dates — look for sale/invoice/date labels then grab the nearest date
  const dateM = t.match(/(?:Date|Sale|Issued)[:\s]*(\d{1,2}[\s\-\/][A-Za-z]{3}[\s\-\/]\d{2,4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
  if (dateM) result.invoice_date = parseAuDate(dateM[1]);

  // Due date
  const dueM = t.match(/(?:Due|Payment Due)[:\s]*(\d{1,2}[\s\-\/][A-Za-z]{3}[\s\-\/]\d{2,4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
  if (dueM) result.due_date = parseAuDate(dueM[1]);

  // GST line
  const gstM = t.match(/\bGST\b[:\s]*\$?([\d,]+\.\d{2})/i);
  if (gstM) result.gst_amount = parseAmount(gstM[1]);

  // Total — prefer explicit label
  const totalM = t.match(/(?:TOTAL|Amount Due|Balance Due|Grand Total)[:\s]*(?:AUD)?\s*\$?([\d,]+\.\d{2})/i);
  if (totalM) result.amount_total = parseAmount(totalM[1]);

  // Ex-GST total
  const exM = t.match(/(?:Subtotal|Sub-total|Ex[\s\-]?GST|Ex[\s\-]?Tax)[:\s]*\$?([\d,]+\.\d{2})/i);
  if (exM) result.amount_ex_gst = parseAmount(exM[1]);

  // Derive missing amounts if we have two of three
  if (result.amount_total && result.gst_amount && !result.amount_ex_gst)
    result.amount_ex_gst = Math.round((result.amount_total - result.gst_amount) * 100) / 100;
  if (result.amount_total && result.amount_ex_gst && !result.gst_amount)
    result.gst_amount = Math.round((result.amount_total - result.amount_ex_gst) * 100) / 100;
  // Tax invoice with no GST line: derive from total (1/11 rule)
  if (result.amount_total && !result.gst_amount && /tax invoice/i.test(t))
    result.gst_amount = Math.round(result.amount_total / 11 * 100) / 100;
  if (result.amount_total && result.gst_amount && !result.amount_ex_gst)
    result.amount_ex_gst = Math.round((result.amount_total - result.gst_amount) * 100) / 100;

  // Payment terms
  const termsM = t.match(/(?:Terms?|Payment Terms?)[:\s]*([\w\s]{2,30}(?:days?|COD|EFT|net)[\w\s]{0,10})/i);
  if (termsM) result.payment_terms = termsM[1].trim();

  // PO number
  const poM = t.match(/\bP\.?O\.?[#\s:No.]*([\d]{4,12})\b/i);
  if (poM) result.extracted_po_number = poM[1];

  // Count populated fields
  result._regexFieldCount = Object.keys(result).filter(k => !k.startsWith("_") && result[k] != null).length;
  return result;
}

function criticalFieldCount(data) {
  return [data.supplier_name, data.amount_total, data.invoice_date].filter(Boolean).length;
}

// ── Tier 2 — Haiku vision OCR (fast, cheap; handles images + PDFs) ────────────

const EXTRACT_PROMPT = `Extract structured data from this invoice or receipt. Return ONLY a JSON object:

{
  "supplier_name": "company/person name",
  "supplier_abn": "ABN if present else null",
  "invoice_number": "invoice or receipt number else null",
  "invoice_date": "YYYY-MM-DD else null",
  "due_date": "YYYY-MM-DD else null",
  "amount_ex_gst": number or null,
  "gst_amount": number or null,
  "amount_total": number or null,
  "payment_terms": "e.g. 30 days, COD, or null",
  "extracted_address": "project/site address in document else null",
  "extracted_job_ref": "job number or reference code else null",
  "extracted_po_number": "PO or purchase order number else null",
  "description": "one sentence: what was invoiced"
}`;

async function claudeExtract(base64, mime, model) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const isImage = mime?.startsWith("image/");
  const contentBlock = isImage
    ? { type: "image", source: { type: "base64", media_type: mime, data: base64 } }
    : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };

  const msg = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: [contentBlock, { type: "text", text: EXTRACT_PROMPT }] }]
  });

  const text = msg.content[0]?.text || "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// ── 3-tier extraction cascade ─────────────────────────────────────────────────
// Tier 1: Regex  (free, instant)
// Tier 2: Haiku  (fast, cheap — OCR + fill gaps)
// Tier 3: Sonnet (only when Haiku result is still incomplete)

async function extractDocument(fileBase64, mimeType) {
  const isPdf = mimeType === "application/pdf";
  const isImage = mimeType?.startsWith("image/");
  if (!isImage && !isPdf) return { supplier_name: null, error: "Unsupported file type" };

  const base64 = fileBase64;
  const mime = mimeType;

  // Tier 1 — Regex (PDFs with text layer; images: skip, no text to parse)
  let regexResult = {};
  if (isPdf) {
    // PDFs: Claude will embed text anyway, but we still try regex on anything Claude returns
    // For now, regex runs post-Haiku on the extracted text field
  }

  // Tier 2 — Haiku (primary for all documents)
  let extracted = null;
  try {
    extracted = await claudeExtract(base64, mime, MODEL_FAST);
  } catch (e) {
    console.error("[finance] Haiku extraction error", e?.message);
  }

  // Merge regex into Haiku result (regex wins for numeric fields — deterministic)
  if (extracted) {
    const rx = regexExtract([extracted.supplier_name, extracted.description, extracted.invoice_number].join(" "));
    // Only use regex values if they look plausible and Haiku missed them
    if (!extracted.supplier_abn && rx.supplier_abn) extracted.supplier_abn = rx.supplier_abn;
    if (!extracted.invoice_number && rx.invoice_number) extracted.invoice_number = rx.invoice_number;
    if (!extracted.gst_amount && rx.gst_amount) extracted.gst_amount = rx.gst_amount;
    if (!extracted.amount_total && rx.amount_total) extracted.amount_total = rx.amount_total;
    if (!extracted.amount_ex_gst && rx.amount_ex_gst) extracted.amount_ex_gst = rx.amount_ex_gst;
    if (!extracted.invoice_date && rx.invoice_date) extracted.invoice_date = rx.invoice_date;
    if (!extracted.due_date && rx.due_date) extracted.due_date = rx.due_date;
    if (!extracted.extracted_po_number && rx.extracted_po_number) extracted.extracted_po_number = rx.extracted_po_number;
  }

  // Tier 3 — Sonnet (only if critical fields still missing after Haiku)
  if (!extracted || criticalFieldCount(extracted) < 2) {
    console.log("[finance] Escalating to Sonnet — Haiku result incomplete");
    try {
      extracted = await claudeExtract(base64, mime, MODEL_SLOW) || extracted;
    } catch (e) {
      console.error("[finance] Sonnet extraction error", e?.message);
    }
  }

  return extracted || { supplier_name: null };
}

// ── Dropbox helpers ───────────────────────────────────────────────────────────

async function uploadToInbox(token, buffer, filename) {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const path = `${FINANCE_INBOX_PATH}/${ts}-${safeName}`;
  const meta = await dropboxUploadBuffer(token, path, buffer, { autorename: true });
  return meta?.path_display || path;
}

async function moveDropboxFile(token, fromPath, toPath) {
  const res = await fetch("https://api.dropboxapi.com/2/files/move_v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from_path: fromPath, to_path: toPath, autorename: true })
  });
  const j = await res.json();
  return j?.metadata?.path_display || toPath;
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerFinanceRoutes(app) {
  // ── Upload + extract + match ──────────────────────────────────────────────
  app.post("/api/finance/documents", async (req, res) => {
    const { filename, mimeType, data: fileBase64, source = "upload" } = req.body || {};
    if (!filename || !fileBase64) return res.status(400).json({ ok: false, error: "filename and data required" });

    const sb = getServiceSupabase();

    // Load context for matching
    const [jobsRes, subsRes] = await Promise.all([
      sb.from("jobs").select("id, address, job_reference").not("address", "is", null),
      sb.from("subcontractors").select("id, business_name, default_job_id")
    ]);
    const jobs = jobsRes.data || [];
    const subcontractors = subsRes.data || [];

    // 3-tier extraction (regex → Haiku → Sonnet fallback)
    let extracted = {};
    try {
      extracted = await extractDocument(fileBase64, mimeType);
    } catch (e) {
      console.error("[finance] extraction error", e?.message);
    }

    // Duplicate detection: same invoice # + same supplier already exists
    let is_duplicate = false, duplicate_of = null;
    if (extracted.invoice_number && extracted.supplier_name) {
      const { data: dups } = await sb.from("financial_documents")
        .select("id")
        .ilike("invoice_number", extracted.invoice_number.trim())
        .ilike("supplier_name", extracted.supplier_name.trim())
        .limit(1);
      if (dups?.length) { is_duplicate = true; duplicate_of = dups[0].id; }
    }

    // Matching cascade
    const match = await matchDocument(extracted, { jobs, subcontractors });

    // File to Dropbox inbox
    let dropbox_path = null;
    if (dropboxConfigured()) {
      try {
        const token = await getDropboxAccessToken();
        const buf = Buffer.from(fileBase64, "base64");
        dropbox_path = await uploadToInbox(token, buf, filename);
      } catch (e) {
        console.error("[finance] Dropbox upload error", e?.message);
      }
    }

    // Auto-approve if below threshold and match is exact
    const total = extracted.amount_total || 0;
    const autoApprove = AUTO_APPROVE_THRESHOLD > 0 && total <= AUTO_APPROVE_THRESHOLD && match.confidence === 100;
    const status = match.job_id
      ? (autoApprove ? "approved" : "pending_approval")
      : "unmatched";

    const { data: doc, error } = await sb.from("financial_documents").insert({
      source,
      original_filename: filename,
      dropbox_path,
      job_id: match.job_id,
      match_method: match.method,
      match_confidence: match.confidence,
      status,
      is_duplicate,
      duplicate_of,
      supplier_name: extracted.supplier_name,
      supplier_abn: extracted.supplier_abn,
      invoice_number: extracted.invoice_number,
      invoice_date: extracted.invoice_date,
      due_date: extracted.due_date,
      amount_ex_gst: extracted.amount_ex_gst,
      gst_amount: extracted.gst_amount,
      amount_total: extracted.amount_total,
      payment_terms: extracted.payment_terms,
      extracted_address: extracted.extracted_address,
      extracted_job_ref: extracted.extracted_job_ref,
      extracted_po_number: extracted.extracted_po_number,
      description: extracted.description,
      raw_extracted: extracted.raw_extracted
    }).select().single();

    if (error) return res.status(500).json({ ok: false, error: error.message });

    if (autoApprove) {
      await sb.from("financial_approvals").insert({ document_id: doc.id, action: "auto_approved" });
    }

    res.json({ ok: true, document: doc });
  });

  // ── List documents ────────────────────────────────────────────────────────
  app.get("/api/finance/documents", async (req, res) => {
    const { status, job_id, limit = 100, offset = 0 } = req.query;
    const sb = getServiceSupabase();
    let q = sb.from("financial_documents")
      .select("*")
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);
    if (status && status !== "all") q = q.eq("status", status);
    if (job_id) q = q.eq("job_id", job_id);
    const { data, error } = await q;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, documents: data || [] });
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  app.get("/api/finance/stats", async (req, res) => {
    const sb = getServiceSupabase();
    const { data, error } = await sb.from("financial_documents").select("status, amount_total");
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const counts = {};
    let totalValue = 0;
    for (const row of data || []) {
      counts[row.status] = (counts[row.status] || 0) + 1;
      if (row.status === "filed" || row.status === "approved") totalValue += Number(row.amount_total || 0);
    }
    res.json({ ok: true, counts, totalApprovedValue: totalValue });
  });

  // ── Update (rematch / notes) ──────────────────────────────────────────────
  app.patch("/api/finance/documents/:id", async (req, res) => {
    const { id } = req.params;
    const { job_id, notes, status } = req.body || {};
    const sb = getServiceSupabase();
    const { data: current } = await sb.from("financial_documents").select("job_id, status").eq("id", id).single();
    if (!current) return res.status(404).json({ ok: false, error: "Not found" });

    const updates = { updated_at: new Date().toISOString() };
    if (notes !== undefined) updates.notes = notes;
    if (status !== undefined) updates.status = status;
    if (job_id !== undefined) {
      updates.job_id = job_id;
      updates.match_method = "manual";
      updates.match_confidence = 100;
      if (current.status === "unmatched") updates.status = "pending_approval";
    }

    const { data, error } = await sb.from("financial_documents").update(updates).eq("id", id).select().single();
    if (error) return res.status(500).json({ ok: false, error: error.message });

    if (job_id !== undefined && job_id !== current.job_id) {
      await sb.from("financial_approvals").insert({
        document_id: id, action: "rematched",
        previous_job_id: current.job_id, new_job_id: job_id
      });
    }

    res.json({ ok: true, document: data });
  });

  // ── Approve → file to Dropbox ─────────────────────────────────────────────
  app.post("/api/finance/documents/:id/approve", async (req, res) => {
    const { id } = req.params;
    const { comment } = req.body || {};
    const sb = getServiceSupabase();

    const { data: doc } = await sb.from("financial_documents")
      .select("*")
      .eq("id", id).single();
    if (!doc) return res.status(404).json({ ok: false, error: "Not found" });
    if (!doc.job_id) return res.status(400).json({ ok: false, error: "Document must be matched to a job before approval" });

    let newDropboxPath = doc.dropbox_path;
    let newStatus = "approved";

    // Fetch job address for Dropbox filing
    let jobAddress = null;
    if (doc.job_id) {
      const { data: job } = await sb.from("jobs").select("address").eq("id", doc.job_id).single();
      jobAddress = job?.address || null;
    }

    // Move to correct job folder on Dropbox
    if (doc.dropbox_path && jobAddress && dropboxConfigured()) {
      try {
        const token = await getDropboxAccessToken();
        const jobAddr = jobAddress;
        const invoiceFolder = `${sharedJobRootPath(jobAddr)}/INTERNAL/INVOICES`;
        const fname = doc.dropbox_path.split("/").pop();
        newDropboxPath = await moveDropboxFile(token, doc.dropbox_path, `${invoiceFolder}/${fname}`);
        newStatus = "filed";
      } catch (e) {
        console.error("[finance] Dropbox move error", e?.message);
        // Approval still succeeds, just flag filing failed
      }
    }

    const { data: updated, error } = await sb.from("financial_documents")
      .update({ status: newStatus, dropbox_path: newDropboxPath, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) return res.status(500).json({ ok: false, error: error.message });

    await sb.from("financial_approvals").insert({ document_id: id, action: "approved", comment });

    res.json({ ok: true, document: updated });
  });

  // ── Reject ────────────────────────────────────────────────────────────────
  app.post("/api/finance/documents/:id/reject", async (req, res) => {
    const { id } = req.params;
    const { comment } = req.body || {};
    const sb = getServiceSupabase();

    const { data, error } = await sb.from("financial_documents")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) return res.status(500).json({ ok: false, error: error.message });

    await sb.from("financial_approvals").insert({ document_id: id, action: "rejected", comment });
    res.json({ ok: true, document: data });
  });

  // ── Jobs list (for re-match dropdown) ────────────────────────────────────
  app.get("/api/finance/jobs", async (req, res) => {
    const sb = getServiceSupabase();
    const { data, error } = await sb.from("jobs")
      .select("id, address, job_reference, status")
      .not("address", "is", null)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, jobs: data || [] });
  });

  // ── Xero status (Phase 2 stub) ────────────────────────────────────────────
  app.get("/api/finance/xero/status", async (req, res) => {
    const sb = getServiceSupabase();
    const { data } = await sb.from("xero_credentials").select("tenant_name, expires_at").limit(1).single();
    res.json({ ok: true, connected: !!data, tenant: data?.tenant_name || null });
  });
}
