import Anthropic from "@anthropic-ai/sdk";
import { callAI } from "./aiGateway.mjs";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { config as dotenvConfig } from "dotenv";
import { getServiceSupabase } from "./supabaseService.mjs";
import { requireAuth } from "./requireAuth.mjs";
import { translateDbError } from "./apiResponse.mjs";
import { upsertNormalizedCost } from "./normalizedCosts.mjs";
import { checkProjectInsights } from "./projectInsights.mjs";
import PDFDocument from "pdfkit";
import { pullBuildexactEstimate } from "./buildexactDeepIntegration.mjs";
import { buildexactConfigured } from "./buildexactClient.mjs";
import { sendPlainMail } from "./notifyMail.mjs";

const { parsed: _dotenv = {} } = dotenvConfig();
function anthropicApiKey() {
  return process.env.ANTHROPIC_API_KEY?.trim() || _dotenv.ANTHROPIC_API_KEY?.trim();
}
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

// ── Trade inference ───────────────────────────────────────────────────────────

/**
 * Infer trade_category_id for a document.
 * 1. Check supplier_trade_defaults (if auto_tag=true, return immediately)
 * 2. Otherwise, ask Claude to classify based on supplier name + description
 * Returns { trade_category_id, ai_trade_confidence, source }
 */
async function inferTradeCategory(sb, { supplierAbn, supplierName, description }, tradeCategories) {
  // Step 1: Check supplier defaults (auto-tag path)
  if (supplierAbn) {
    const { data: def } = await sb.from("supplier_trade_defaults")
      .select("trade_category_id, auto_tag")
      .eq("supplier_abn", supplierAbn.replace(/\s/g, ""))
      .maybeSingle();
    if (def?.auto_tag && def.trade_category_id) {
      return { trade_category_id: def.trade_category_id, ai_trade_confidence: 100, source: "supplier_default" };
    }
  }

  // Step 2: AI inference (Haiku — cheap, fast)
  if (!supplierName) return { trade_category_id: null, ai_trade_confidence: null, source: null };
  try {
    const categoryList = tradeCategories
      .filter(c => c.is_active !== false)
      .map(c => `${c.id}: ${c.name}`)
      .join("\n");
    const client = new Anthropic({ apiKey: anthropicApiKey() });
    const msg = await callAI(client, {
      model: MODEL_FAST,
      max_tokens: 128,
      messages: [{
        role: "user",
        content: `You are classifying a construction invoice into a trade category for a residential builder.

Supplier name: ${supplierName}
Invoice description: ${description || "not provided"}

Trade categories:
${categoryList}

Return JSON only: {"trade_category_id": "<uuid from the list above>", "confidence": <0-100>}
Pick the single best matching category. If genuinely unclear, return confidence below 50.`
      }]
    }, { module: "financeRoutes" });
    const text = msg.content[0]?.text || "";
    const m = text.match(/\{[\s\S]*?\}/);
    if (m) {
      const p = JSON.parse(m[0]);
      if (p.trade_category_id && tradeCategories.find(c => c.id === p.trade_category_id)) {
        return { trade_category_id: p.trade_category_id, ai_trade_confidence: p.confidence, source: "ai" };
      }
    }
  } catch (e) {
    console.error("[finance] Trade inference error", e?.message);
  }
  return { trade_category_id: null, ai_trade_confidence: null, source: null };
}

/**
 * On document approval: increment confirmed_count for the supplier's trade assignment.
 * Sets auto_tag=true when confirmed_count reaches 3.
 */
async function recordTradeConfirmation(sb, { supplierAbn, supplierName, tradeCategoryId }) {
  if (!supplierAbn || !tradeCategoryId) return;
  const abn = supplierAbn.replace(/\s/g, "");
  const { data: existing } = await sb.from("supplier_trade_defaults")
    .select("id, confirmed_count, trade_category_id")
    .eq("supplier_abn", abn)
    .maybeSingle();

  if (existing) {
    // Only increment if the confirmed trade matches (or update if it changed)
    const newCount = existing.trade_category_id === tradeCategoryId
      ? (existing.confirmed_count || 0) + 1
      : 1; // supplier changed trade — reset count
    await sb.from("supplier_trade_defaults").update({
      trade_category_id: tradeCategoryId,
      confirmed_count: newCount,
      auto_tag: newCount >= 3,
      last_confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", existing.id);
  } else {
    await sb.from("supplier_trade_defaults").insert({
      supplier_abn: abn,
      supplier_name: supplierName || "",
      trade_category_id: tradeCategoryId,
      confirmed_count: 1,
      auto_tag: false,
      last_confirmed_at: new Date().toISOString()
    });
  }
}

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
    const job = jobs.find(j => normRef(j.arch_ref) === ref || normRef(j.id) === ref);
    if (job) return { job_id: job.id, match_method: "exact_job_ref", match_confidence: 100 };
  }

  if (extracted_address) {
    const na = normAddr(extracted_address);
    const exact = jobs.find(j => normAddr(j.address) === na);
    if (exact) return { job_id: exact.id, match_method: "exact_address", match_confidence: 100 };
  }

  // Tier 1.5 — Supplier default (sub has only ever worked on one active job)
  if (supplier_name && subcontractors.length) {
    const sup = subcontractors.find(s => similarity(s.business_name, supplier_name) > 0.82);
    if (sup?.default_job_id) return { job_id: sup.default_job_id, match_method: "supplier_default", match_confidence: 90 };
  }

  // Tier 1b — Token overlap: street number + meaningful tokens must all appear in job address
  // Catches "110 Coach Rd" matching "110 Coach Road, Skye VIC" even with abbreviation differences
  if (extracted_address) {
    const tokens = normAddr(extracted_address).split(" ").filter(t => t.length > 2);
    if (tokens.length >= 2) {
      // Score = proportion of extracted tokens found in the normalised job address
      let best = null, bestScore = 0;
      for (const job of jobs) {
        const jn = normAddr(job.address);
        const matched = tokens.filter(t => jn.includes(t)).length;
        const score = matched / tokens.length;
        if (score > bestScore) { bestScore = score; best = job; }
      }
      // Street number always present in extracted tokens → require high overlap
      if (bestScore >= 0.65) {
        return { job_id: best.id, match_method: "fuzzy_address", match_confidence: Math.round(bestScore * 100) };
      }
    }
  }

  // Tier 2 — Fuzzy (Levenshtein; catches typos and partial abbreviations)
  if (extracted_address) {
    let best = null, bestScore = 0;
    for (const job of jobs) {
      const score = addrSimilarity(job.address, extracted_address);
      if (score > bestScore) { bestScore = score; best = job; }
    }
    if (bestScore >= 0.78) return { job_id: best.id, match_method: "fuzzy_address", match_confidence: Math.round(bestScore * 100) };
  }

  if (supplier_name) {
    let best = null, bestScore = 0;
    for (const sub of subcontractors) {
      const score = similarity(sub.business_name || "", supplier_name);
      if (score > bestScore) { bestScore = score; best = sub; }
    }
    if (bestScore >= 0.78 && best?.default_job_id) {
      return { job_id: best.default_job_id, match_method: "fuzzy_supplier", match_confidence: Math.round(bestScore * 100) };
    }
  }

  // Tier 3 — AI (only when fuzzy can't decide; costs money, use sparingly)
  if ((extracted_address || supplier_name) && jobs.length) {
    try {
      const client = new Anthropic({ apiKey: anthropicApiKey() });
      const jobList = jobs.slice(0, 30).map(j => `ID:${j.id} | ${j.address} | ref:${j.arch_ref || ""}`).join("\n");
      const msg = await callAI(client, {
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
      }, { module: "financeRoutes" });
      const text = msg.content[0]?.text || "";
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (parsed.job_id && parsed.confidence >= 65) {
          const found = jobs.find(j => j.id === parsed.job_id);
          if (found) return { job_id: found.id, match_method: "ai", match_confidence: parsed.confidence };
        }
      }
    } catch {
      // AI tier failed — fall through to unmatched
    }
  }

  return { job_id: null, match_method: null, match_confidence: 0 };
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
  "extracted_address": "the DELIVERY or SITE address where materials/services were delivered — look for fields labelled 'Deliver To', 'Site', 'Job Address', 'Ship To', 'Delivery Address'. This is NOT the supplier's own address. Return null if no delivery address found.",
  "extracted_job_ref": "job number or reference code else null",
  "extracted_po_number": "PO or purchase order number else null",
  "description": "one sentence: what was invoiced"
}`;

async function claudeExtract(base64, mime, model) {
  const client = new Anthropic({ apiKey: anthropicApiKey() });
  const isImage = mime?.startsWith("image/");
  const contentBlock = isImage
    ? { type: "image", source: { type: "base64", media_type: mime, data: base64 } }
    : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };

  const msg = await callAI(client, {
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: [contentBlock, { type: "text", text: EXTRACT_PROMPT }] }]
  }, { module: "financeRoutes" });

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
  // ── Trade categories ──────────────────────────────────────────────────────
  app.get("/api/finance/trade-categories", requireAuth, async (_req, res) => {
    const sb = getServiceSupabase();
    const { data, error } = await sb.from("trade_categories")
      .select("id, name, sort_order, category_type")
      .eq("is_active", true)
      .order("sort_order");
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, categories: data || [] });
  });

  // ── Assign trade to document (manual override) ───────────────────────────
  app.put("/api/finance/documents/:id/trade", requireAuth, async (req, res) => {
    const { trade_category_id } = req.body || {};
    if (!trade_category_id) return res.status(400).json({ ok: false, error: "trade_category_id required" });
    const sb = getServiceSupabase();
    const { data, error } = await sb.from("financial_documents")
      .update({ trade_category_id, updated_at: new Date().toISOString() })
      .eq("id", req.params.id).select().single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, document: data });
  });

  // ── Upload + extract + match ──────────────────────────────────────────────
  app.post("/api/finance/documents", requireAuth, async (req, res) => {
    const { filename, mimeType, data: fileBase64, source = "upload" } = req.body || {};
    if (!filename || !fileBase64) return res.status(400).json({ ok: false, error: "filename and data required" });

    const sb = getServiceSupabase();

    // Load context for matching + trade inference
    const [jobsRes, subsRes, tradeCatsRes] = await Promise.all([
      sb.from("jobs").select("id, address, arch_ref").not("address", "is", null),
      sb.from("subcontractors").select("id, business_name, default_job_id"),
      sb.from("trade_categories").select("id, name, is_active").eq("is_active", true).order("sort_order")
    ]);
    const jobs = jobsRes.data || [];
    const subcontractors = subsRes.data || [];
    const tradeCategories = tradeCatsRes.data || [];

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

    // Matching cascade + trade inference (run in parallel)
    const [match, tradeInference] = await Promise.all([
      matchDocument(extracted, { jobs, subcontractors }),
      tradeCategories.length
        ? inferTradeCategory(sb, {
            supplierAbn: extracted.supplier_abn,
            supplierName: extracted.supplier_name,
            description: extracted.description
          }, tradeCategories)
        : Promise.resolve({ trade_category_id: null, ai_trade_confidence: null })
    ]);

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
    const autoApprove = AUTO_APPROVE_THRESHOLD > 0 && total <= AUTO_APPROVE_THRESHOLD && match.match_confidence === 100;
    const status = match.job_id
      ? (autoApprove ? "approved" : "pending_approval")
      : "unmatched";

    const { data: doc, error } = await sb.from("financial_documents").insert({
      source,
      original_filename: filename,
      dropbox_path,
      job_id: match.job_id,
      match_method: match.match_method,
      match_confidence: match.match_confidence,
      trade_category_id: tradeInference.trade_category_id,
      ai_trade_confidence: tradeInference.ai_trade_confidence,
      ai_job_match_confidence: match.match_confidence,
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
      const { error: auditErr } = await sb.from("financial_approvals").insert({ document_id: doc.id, action: "auto_approved" });
      if (auditErr) console.error("[finance] auto-approval audit insert failed:", auditErr.message);
    }

    res.json({ ok: true, document: doc });
  });

  // ── List documents ────────────────────────────────────────────────────────
  app.get("/api/finance/documents", requireAuth, async (req, res) => {
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
  app.get("/api/finance/stats", requireAuth, async (req, res) => {
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

  app.get("/api/finance/documents/unmatched-count", requireAuth, async (_req, res) => {
    const sb = getServiceSupabase();
    const { count, error } = await sb
      .from("financial_documents")
      .select("id", { count: "exact", head: true })
      .is("job_id", null)
      .not("status", "in", '("rejected","void")');
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, count: count ?? 0 });
  });

  // ── Update (rematch / notes) ──────────────────────────────────────────────
  app.patch("/api/finance/documents/:id", requireAuth, async (req, res) => {
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
  app.post("/api/finance/documents/:id/approve", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { comment, trade_category_id: bodyTrade } = req.body || {};
    const sb = getServiceSupabase();

    const { data: doc } = await sb.from("financial_documents")
      .select("*")
      .eq("id", id).single();
    if (!doc) return res.status(404).json({ ok: false, error: "Not found" });
    if (!doc.job_id) return res.status(400).json({ ok: false, error: "Document must be matched to a job before approval" });

    // Allow trade to be patched in the approval payload (UI sends it)
    const finalTradeId = bodyTrade || doc.trade_category_id;
    if (!finalTradeId) {
      return res.status(400).json({ ok: false, error: "Trade category is required before approval. Select the trade this invoice belongs to." });
    }

    // Persist trade if it was supplied in the request (override AI suggestion)
    if (bodyTrade && bodyTrade !== doc.trade_category_id) {
      await sb.from("financial_documents")
        .update({ trade_category_id: bodyTrade, updated_at: new Date().toISOString() })
        .eq("id", id);
      doc.trade_category_id = bodyTrade;
    }

    let newDropboxPath = doc.dropbox_path;
    let newStatus = "approved";

    // Fetch job for Dropbox filing
    let jobAddress = null, isGeneralJob = false;
    if (doc.job_id) {
      const { data: job } = await sb.from("jobs").select("address").eq("id", doc.job_id).single();
      jobAddress = job?.address || null;
      isGeneralJob = jobAddress?.toLowerCase() === "blue leaf building";
    }

    // AU financial year: July 1 – June 30. Determine correct receipts folder.
    function auFinancialYear() {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1; // 1-based
      return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
    }

    // Move to correct Dropbox folder on approval
    if (doc.dropbox_path && jobAddress && dropboxConfigured()) {
      try {
        const token = await getDropboxAccessToken();
        const fname = doc.dropbox_path.split("/").pop();
        let targetFolder;
        if (isGeneralJob) {
          // General business receipts → /BLUE LEAF BUILDING/RECEIPTS/YYYY-YYYY
          targetFolder = `/BLUE LEAF BUILDING/RECEIPTS/${auFinancialYear()}`;
        } else {
          targetFolder = `${sharedJobRootPath(jobAddress)}/INTERNAL/INVOICES`;
        }
        newDropboxPath = await moveDropboxFile(token, doc.dropbox_path, `${targetFolder}/${fname}`);
        newStatus = "filed";
      } catch (e) {
        console.error("[finance] Dropbox move error", e?.message);
      }
    }

    const { data: updated, error } = await sb.from("financial_documents")
      .update({ status: newStatus, dropbox_path: newDropboxPath, updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) return res.status(500).json({ ok: false, error: translateDbError(error) });

    await sb.from("financial_approvals").insert({ document_id: id, action: "approved", comment });

    // Update supplier trade learning (increment confirmed_count, auto_tag at ≥ 3)
    await recordTradeConfirmation(sb, {
      supplierAbn: doc.supplier_abn,
      supplierName: doc.supplier_name,
      tradeCategoryId: finalTradeId
    });

    // Update normalized_costs with actual amount
    if (doc.job_id && doc.trade_category_id) {
      const sb2 = getServiceSupabase();
      // Re-fetch total approved amount for this job + trade (sum, not just this invoice)
      const { data: approved } = await sb2.from("financial_documents")
        .select("amount_ex_gst")
        .eq("job_id", doc.job_id)
        .eq("trade_category_id", doc.trade_category_id)
        .in("status", ["approved", "filed", "xero_synced"]);
      const totalActual = (approved || []).reduce((s, d) => s + Number(d.amount_ex_gst || 0), 0);

      // Get trade name
      const { data: tradeCat } = await sb2.from("trade_categories").select("name").eq("id", doc.trade_category_id).maybeSingle();

      await upsertNormalizedCost(sb2, {
        jobId: doc.job_id,
        tradeCategoryId: doc.trade_category_id,
        tradeCategoryName: tradeCat?.name,
        field: "actual",
        amount: totalActual,
      }).catch(e => console.warn("[approval] normalized_costs:", e.message));
    }

    // Fire-and-forget: generate project insight for margin / trade variance
    if (doc.job_id) {
      checkProjectInsights(doc.job_id, "invoice_approved", getServiceSupabase(), process.env.ANTHROPIC_API_KEY)
        .catch(e => console.warn("[insights] invoice_approved:", e.message));
    }

    res.json({ ok: true, document: updated });
  });

  // ── Reject ────────────────────────────────────────────────────────────────
  app.post("/api/finance/documents/:id/reject", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { comment } = req.body || {};
    const sb = getServiceSupabase();

    const { data, error } = await sb.from("financial_documents")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) return res.status(500).json({ ok: false, error: translateDbError(error) });

    await sb.from("financial_approvals").insert({ document_id: id, action: "rejected", comment });
    res.json({ ok: true, document: data });
  });

  // ── Hold ──────────────────────────────────────────────────────────────────
  // Places an invoice on hold with a mandatory reason and optional follow-up date.
  // The invoice stays visible in the Approval Queue until Approved or Rejected.
  app.post("/api/finance/documents/:id/hold", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { hold_reason, follow_up_date } = req.body || {};
    if (!hold_reason?.trim()) {
      return res.status(400).json({ ok: false, error: "hold_reason is required before placing a document on hold." });
    }
    const sb = getServiceSupabase();

    const { data: current } = await sb.from("financial_documents")
      .select("status").eq("id", id).single();
    if (!current) return res.status(404).json({ ok: false, error: "Document not found." });
    if (!["pending_approval", "unmatched"].includes(current.status)) {
      return res.status(400).json({ ok: false, error: "Only documents in pending_approval or unmatched status can be placed on hold." });
    }

    const updates = {
      status: "on_hold",
      dispute_reason: hold_reason.trim(),
      dispute_follow_up_date: follow_up_date || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await sb.from("financial_documents")
      .update(updates).eq("id", id).select().single();
    if (error) return res.status(500).json({ ok: false, error: translateDbError(error) });

    await sb.from("financial_approvals").insert({
      document_id: id,
      action: "on_hold",
      comment: hold_reason.trim()
    });

    res.json({ ok: true, document: data });
  });

  // ── Jobs list (for re-match dropdown) ────────────────────────────────────
  app.get("/api/finance/jobs", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const { data, error } = await sb.from("jobs")
      .select("id, address, arch_ref, status, contract_value, estimated_total_cost, progress_billed")
      .not("address", "is", null)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, jobs: data || [] });
  });

  // ── Update job WIP fields ─────────────────────────────────────────────────
  app.patch("/api/finance/jobs/:id", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const allowed = ["contract_value", "estimated_total_cost", "progress_billed"];
    const updates = {};
    for (const k of allowed) {
      if (k in req.body) updates[k] = req.body[k] === "" ? null : Number(req.body[k]) || null;
    }
    if (!Object.keys(updates).length) return res.json({ ok: true });
    const { data, error } = await sb.from("jobs").update(updates).eq("id", req.params.id).select(
      "id, address, arch_ref, status, contract_value, estimated_total_cost, progress_billed"
    ).single();
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, job: data });
  });

  // ── WIPAA: served by GET /api/finance/jobs/:jobId/wipaa/current in financeCCRoutes.mjs ──

  // ── Xero status (Phase 2 stub) ────────────────────────────────────────────
  app.get("/api/finance/xero/status", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    const { data } = await sb.from("xero_credentials").select("tenant_name, expires_at").limit(1).single();
    res.json({ ok: true, connected: !!data, tenant: data?.tenant_name || null });
  });

  // ── Invoice email poller ──────────────────────────────────────────────────
  const INVOICE_SUBJECT_RE = /invoice|receipt|statement|remittance|bill|tax\s+invoice/i;
  const INVOICE_ATTACHMENT_MIMES = new Set([
    "application/pdf",
    "image/jpeg", "image/jpg", "image/png", "image/heic", "image/webp", "image/gif",
  ]);

  function invoiceImapConfigs() {
    const host = process.env.IMAP_HOST?.trim();
    if (!host) return [];
    const port = Number(process.env.IMAP_PORT) || 993;
    const tls = process.env.IMAP_SECURE !== "false";
    const base = { host, port, secure: tls, logger: false };
    const candidates = [
      { ...base, auth: { user: process.env.IMAP_USER?.trim(), pass: process.env.IMAP_PASS?.trim() }, cursorKey: "imap_invoice_last_uid" },
      { ...base, auth: { user: process.env.IMAP2_USER?.trim(), pass: process.env.IMAP2_PASS?.trim() }, cursorKey: "imap_invoice_last_uid_2" },
    ];
    return candidates.filter(c => c.auth.user && c.auth.pass);
  }

  async function loadInvoiceUid(sb, cursorKey) {
    const { data } = await sb.from("user_settings").select("value").eq("key", cursorKey).maybeSingle();
    const n = Number(data?.value);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  }

  async function saveInvoiceUid(sb, cursorKey, uid) {
    const v = Math.floor(Number(uid));
    if (!Number.isFinite(v) || v < 0) return;
    await sb.from("user_settings").upsert(
      { key: cursorKey, value: String(v), updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  }

  let invoicePollBusy = false;
  let lastInvoicePollResults = [];

  async function pollOneAccount(cfg, sb, jobs, subcontractors, tradeCategories = []) {
    const client = new ImapFlow(cfg);
    let processed = 0, skipped = 0, failed = 0;
    try {
      await client.connect();
      await client.mailboxOpen("INBOX");

      let lastUid = await loadInvoiceUid(sb, cfg.cursorKey);
      if (lastUid == null) {
        const uidNext = Number(client.mailbox?.uidNext || 0);
        await saveInvoiceUid(sb, cfg.cursorKey, uidNext > 0 ? uidNext - 1 : Number(client.mailbox?.exists || 0));
        await client.logout();
        return { account: cfg.auth.user, ok: true, initialized: true, at: new Date().toISOString() };
      }

      const msgs = [];
      for await (const msg of client.fetch(`${lastUid + 1}:*`, { uid: true, envelope: true, source: true }, { uid: true })) {
        const parsed = await simpleParser(msg.source);
        msgs.push({ uid: msg.uid, parsed });
        if (msgs.length >= 50) break;
      }

      let highestUid = lastUid;
      for (const msg of msgs) {
        highestUid = Math.max(highestUid, Number(msg.uid) || 0);
        try {
          const parsed = msg.parsed;
          const subject = parsed.subject || "";
          const from = parsed.from?.text || "";
          const messageId = (parsed.messageId || `imap-inv-uid-${msg.uid}`).trim();
          const receivedAt = (parsed.date || new Date()).toISOString();

          const attachments = (parsed.attachments || []).filter(a => {
            const mime = (a.contentType || "").toLowerCase().split(";")[0].trim();
            const fname = (a.filename || "").toLowerCase();
            return INVOICE_ATTACHMENT_MIMES.has(mime) ||
              fname.endsWith(".pdf") || fname.endsWith(".jpg") || fname.endsWith(".jpeg") ||
              fname.endsWith(".png") || fname.endsWith(".heic");
          });

          if (!attachments.length && !INVOICE_SUBJECT_RE.test(subject)) { skipped++; continue; }
          if (!attachments.length) { skipped++; continue; }

          for (const att of attachments) {
            const mime = att.contentType?.split(";")[0]?.trim() || "application/octet-stream";
            const filename = att.filename || `attachment-${msg.uid}.pdf`;

            const { data: existing } = await sb.from("financial_documents")
              .select("id").eq("email_message_id", messageId).eq("original_filename", filename).maybeSingle();
            if (existing) { skipped++; continue; }

            const base64 = att.content.toString("base64");
            const extracted = await extractDocument(base64, mime);
            const [match, tradeInference] = await Promise.all([
              matchDocument(extracted, { jobs, subcontractors }),
              tradeCategories.length
                ? inferTradeCategory(sb, {
                    supplierAbn: extracted.supplier_abn,
                    supplierName: extracted.supplier_name,
                    description: extracted.description
                  }, tradeCategories)
                : Promise.resolve({ trade_category_id: null, ai_trade_confidence: null })
            ]);

            let is_duplicate = false;
            if (extracted.invoice_number && extracted.supplier_name) {
              const { data: dup } = await sb.from("financial_documents")
                .select("id").ilike("invoice_number", extracted.invoice_number.trim())
                .ilike("supplier_name", extracted.supplier_name.trim())
                .maybeSingle();
              if (dup) is_duplicate = true;
            }

            const { error: insertErr } = await sb.from("financial_documents").insert({
              source: "email",
              original_filename: filename,
              email_message_id: messageId,
              email_from: from,
              email_subject: subject,
              email_received_at: receivedAt,
              ...extracted,
              job_id: match.job_id || null,
              match_method: match.match_method,
              match_confidence: match.match_confidence,
              trade_category_id: tradeInference.trade_category_id,
              ai_trade_confidence: tradeInference.ai_trade_confidence,
              ai_job_match_confidence: match.match_confidence,
              is_duplicate,
              status: match.job_id ? "pending_approval" : "unmatched",
            });

            if (insertErr) {
              if (insertErr.code === "23505") { skipped++; }
              else { console.error("[invoice-imap] insert error:", insertErr.message); failed++; }
            } else {
              processed++;
              console.log(`[invoice-imap] stored: ${filename} from ${from} (${match.match_method}) [${cfg.auth.user}]`);
            }
          }
        } catch (e) {
          console.error("[invoice-imap] msg error uid", msg.uid, e?.message);
          failed++;
        }
      }

      if (highestUid > lastUid) await saveInvoiceUid(sb, cfg.cursorKey, highestUid);
      await client.logout();
      return { account: cfg.auth.user, ok: true, processed, skipped, failed, at: new Date().toISOString() };
    } catch (err) {
      try { await client.logout(); } catch { /* ignore */ }
      console.error(`[invoice-imap] poll error [${cfg.auth.user}]:`, err?.message);
      return { account: cfg.auth.user, ok: false, error: err?.message, at: new Date().toISOString() };
    }
  }

  async function pollInvoiceEmails() {
    if (invoicePollBusy) return { ok: true, skipped: "busy" };
    const configs = invoiceImapConfigs();
    if (!configs.length) return { ok: true, skipped: "imap_not_configured" };
    const sb = getServiceSupabase();
    if (!sb) return { ok: true, skipped: "supabase_not_configured" };

    invoicePollBusy = true;
    try {
      const [jobsRes, subsRes, tradeCatsRes] = await Promise.all([
        sb.from("jobs").select("id, address, arch_ref").not("address", "is", null),
        sb.from("subcontractors").select("id, business_name, email").not("business_name", "is", null),
        sb.from("trade_categories").select("id, name, is_active").eq("is_active", true).order("sort_order")
      ]);
      const jobs = jobsRes.data || [];
      const subcontractors = subsRes.data || [];
      const tradeCategories = tradeCatsRes.data || [];

      const results = [];
      for (const cfg of configs) {
        const r = await pollOneAccount(cfg, sb, jobs, subcontractors, tradeCategories);
        results.push(r);
      }
      lastInvoicePollResults = results;
      const totals = results.reduce((a, r) => ({ processed: a.processed + (r.processed || 0), skipped: a.skipped + (r.skipped || 0), failed: a.failed + (r.failed || 0) }), { processed: 0, skipped: 0, failed: 0 });
      return { ok: true, accounts: results, ...totals, at: new Date().toISOString() };
    } finally {
      invoicePollBusy = false;
    }
  }

  app.post("/api/finance/imap/poll", requireAuth, async (_req, res) => {
    try {
      const out = await pollInvoiceEmails();
      return res.json(out);
    } catch (err) {
      return res.status(502).json({ ok: false, error: err?.message });
    }
  });

  app.get("/api/finance/imap/status", requireAuth, (_req, res) => {
    const cfgs = invoiceImapConfigs();
    res.json({
      ok: true,
      configured: cfgs.length > 0,
      accounts: cfgs.map(c => c.auth.user),
      busy: invoicePollBusy,
      last: lastInvoicePollResults,
    });
  });

  // Auto-poll every 15 minutes
  if (invoiceImapConfigs().length) {
    console.log("[blue-leaf-api] IMAP_POLL_ENABLED: polling inbox every 15 min.");
    setTimeout(async () => {
      try { await pollInvoiceEmails(); } catch { /* ignore */ }
      setInterval(async () => {
        try { await pollInvoiceEmails(); } catch { /* ignore */ }
      }, 15 * 60 * 1000);
    }, 10_000);
  }

  // ── Fee proposal accepted → auto-set original_contract_value on job ─────────
  app.post("/api/finance/fee-proposals/:proposalId/accept", requireAuth, async (req, res) => {
    const { proposalId } = req.params;
    const sb = getServiceSupabase();
    const { data: proposal, error: pErr } = await sb.from("fee_proposals")
      .select("id, job_id, data, status, fee_schedule")
      .eq("id", proposalId).single();
    if (pErr || !proposal) return res.status(404).json({ ok: false, error: "Proposal not found" });

    await sb.from("fee_proposals")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", proposalId);

    let contractValue = null;
    if (proposal.job_id) {
      const totalExGst = Number(
        proposal.data?.total_ex_gst ||
        proposal.data?.totalExGst ||
        proposal.data?.contract_value_ex_gst ||
        0
      );
      if (totalExGst > 0) {
        const { data: job } = await sb.from("jobs")
          .select("original_contract_value").eq("id", proposal.job_id).single();
        if (!job?.original_contract_value) {
          // 1. Write to jobs (existing behaviour)
          await sb.from("jobs").update({
            original_contract_value: totalExGst,
            contract_value: totalExGst,
            updated_at: new Date().toISOString()
          }).eq("id", proposal.job_id);
          contractValue = totalExGst;

          // 2. Also propagate to projects table so the client portal shows the correct value.
          // projects.job_id is the FK — look up via that column.
          const { data: proj } = await sb.from("projects")
            .select("id, contract_value").eq("job_id", proposal.job_id).maybeSingle();
          if (proj && !proj.contract_value) {
            await sb.from("projects").update({
              contract_value: totalExGst,
              updated_at: new Date().toISOString()
            }).eq("id", proj.id);
          }
        }
      }
    }

    res.json({ ok: true, proposalId, job_id: proposal.job_id, contract_value_set: contractValue });
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function daysSince(dateStr) {
    if (!dateStr) return Infinity;
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  }

  function budgetStatus(budgetAmount, actualAmount) {
    if (!budgetAmount || budgetAmount <= 0) return "ok";
    const pct = actualAmount / budgetAmount;
    if (pct > 1) return "over";
    if (pct >= 0.9) return "watch";
    return "ok";
  }

  async function getAdminEmail(sb) {
    const env = process.env.ADMIN_EMAIL?.trim();
    if (env) return env;
    const { data } = await sb.from("profiles").select("email").eq("role", "admin").limit(1).maybeSingle();
    return data?.email || null;
  }

  // ── SECTION 1 — Command Centre Aggregate ─────────────────────────────────────
  // NOTE: The full command-centre route lives in financeCCRoutes.mjs.
  //       This duplicate was removed — it queried non-existent column "total_amount"
  //       and would have been shadowed anyway since financeCCRoutes registers last.

  // REMOVED: app.get("/api/finance/jobs/:id/command-centre") — see financeCCRoutes.mjs

  // ── Budget seed (legacy — full budget CRUD in financeCCRoutes.mjs) ────────────

  app.post("/api/finance/jobs/:id/budget/seed", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { id } = req.params;
    try {
      const { data: job } = await sb.from("jobs")
        .select("buildexact_job_id").eq("id", id).maybeSingle();
      const bxJobId = job?.buildexact_job_id;
      if (!bxJobId) return res.status(400).json({ error: "No Buildexact job linked" });
      if (!buildexactConfigured()) return res.status(400).json({ error: "Buildxact is not configured — set BUILDEXACT_USERNAME and BUILDEXACT_API_KEY." });

      const { estimate } = await pullBuildexactEstimate(bxJobId);
      const categories = estimate?.categories || [];

      const { data: tradeCategories } = await sb.from("trade_categories").select("id, name");

      let seeded = 0;
      const skipped = [];

      for (const cat of categories) {
        const catName = (cat.name || "").toLowerCase().trim();
        const match = (tradeCategories || []).find((tc) =>
          tc.name.toLowerCase() === catName ||
          tc.name.toLowerCase().includes(catName) ||
          catName.includes(tc.name.toLowerCase()),
        );
        if (!match) { skipped.push(cat.name); continue; }

        const budgetAmount = Number(cat.subtotal_ex_gst ?? cat.subtotal ?? 0);
        const { data: existing } = await sb.from("job_budgets")
          .select("id, original_budget")
          .eq("job_id", id).eq("trade_category_id", match.id).maybeSingle();

        if (existing) {
          await sb.from("job_budgets").update({
            budget_amount: budgetAmount,
            seeded_from: "buildxact",
            seeded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);
        } else {
          await sb.from("job_budgets").insert({
            job_id: id,
            trade_category_id: match.id,
            budget_amount: budgetAmount,
            original_budget: budgetAmount,
            seeded_from: "buildxact",
            seeded_at: new Date().toISOString(),
          });
        }
        seeded++;
      }

      res.json({ ok: true, seeded, skipped });
    } catch (err) {
      console.error("[finance/budget/seed]", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/finance/jobs/:id/budget/:trade_category_id", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { id, trade_category_id } = req.params;
    const { budget_amount, forecast_amount, forecast_notes, reason } = req.body;
    if (!reason) return res.status(400).json({ error: "reason is required" });
    try {
      const { data: existing, error: fetchErr } = await sb.from("job_budgets")
        .select("*").eq("job_id", id).eq("trade_category_id", trade_category_id).maybeSingle();
      if (fetchErr || !existing) return res.status(404).json({ error: "Budget row not found" });

      const updates = { updated_at: new Date().toISOString() };
      const historyRows = [];

      if (budget_amount !== undefined && Number(budget_amount) !== Number(existing.budget_amount)) {
        historyRows.push({
          job_budget_id: existing.id,
          field_changed: "budget_amount",
          previous_value: existing.budget_amount,
          new_value: Number(budget_amount),
          reason,
          changed_by: req.caller.id,
        });
        updates.budget_amount = Number(budget_amount);
      }
      if (forecast_amount !== undefined && Number(forecast_amount) !== Number(existing.forecast_amount)) {
        historyRows.push({
          job_budget_id: existing.id,
          field_changed: "forecast_amount",
          previous_value: existing.forecast_amount,
          new_value: Number(forecast_amount),
          reason,
          changed_by: req.caller.id,
        });
        updates.forecast_amount = Number(forecast_amount);
      }
      if (forecast_notes !== undefined) updates.forecast_notes = forecast_notes;

      const { data: updated } = await sb.from("job_budgets").update(updates)
        .eq("id", existing.id).select().maybeSingle();

      if (historyRows.length) {
        await sb.from("job_budget_history").insert(historyRows);
      }

      res.json({ ok: true, row: updated });
    } catch (err) {
      console.error("[finance/budget/edit]", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/finance/jobs/:id/budget/history", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { id } = req.params;
    try {
      const { data, error } = await sb.from("job_budget_history")
        .select(`*, job_budgets!inner(job_id, trade_category_id, trade_categories(name))`)
        .eq("job_budgets.job_id", id)
        .order("changed_at", { ascending: false });
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true, history: data || [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── SECTION 3 — Progress Claims ───────────────────────────────────────────────

  app.get("/api/finance/jobs/:id/claims", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { id } = req.params;
    try {
      const { data: claims, error } = await sb.from("progress_claims")
        .select("*, progress_claim_payments(*)")
        .eq("job_id", id).order("claim_number", { ascending: true });
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true, claims: claims || [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/finance/jobs/:id/claims/schedule", requireAuth, (_req, res) => {
    res.json({
      ok: true,
      stages: [
        { stage: "deposit",              label: "Deposit",              pct_typical: 5  },
        { stage: "slab",                 label: "Slab",                 pct_typical: 10 },
        { stage: "frame",                label: "Frame",                pct_typical: 15 },
        { stage: "lock_up",              label: "Lock Up",              pct_typical: 35 },
        { stage: "fixing",               label: "Fixing",               pct_typical: 25 },
        { stage: "practical_completion", label: "Practical Completion", pct_typical: 10 },
      ],
    });
  });

  app.post("/api/finance/jobs/:id/claims", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { id } = req.params;
    const { stage, description, amount_ex_gst, claim_reference, issued_date, due_date } = req.body;
    if (!amount_ex_gst) return res.status(400).json({ error: "amount_ex_gst is required" });
    try {
      const { data: maxRow } = await sb.from("progress_claims")
        .select("claim_number").eq("job_id", id)
        .order("claim_number", { ascending: false }).limit(1).maybeSingle();
      const claimNumber = (maxRow?.claim_number || 0) + 1;

      const { data, error } = await sb.from("progress_claims").insert({
        job_id: id,
        claim_number: claimNumber,
        stage: stage || "custom",
        description: description || null,
        amount_ex_gst: Number(amount_ex_gst),
        claim_reference: claim_reference || null,
        issued_date: issued_date || null,
        due_date: due_date || null,
        status: "draft",
        created_by: req.caller.id,
      }).select().maybeSingle();
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true, claim: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/finance/jobs/:id/claims/:cid", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { cid } = req.params;
    const { stage, description, amount_ex_gst, claim_reference, issued_date, due_date } = req.body;
    try {
      const { data: existing } = await sb.from("progress_claims")
        .select("status").eq("id", cid).maybeSingle();
      if (!existing) return res.status(404).json({ error: "Claim not found" });
      if (existing.status !== "draft") return res.status(400).json({ error: "Only draft claims can be edited" });

      const updates = { updated_at: new Date().toISOString() };
      if (stage !== undefined) updates.stage = stage;
      if (description !== undefined) updates.description = description;
      if (amount_ex_gst !== undefined) updates.amount_ex_gst = Number(amount_ex_gst);
      if (claim_reference !== undefined) updates.claim_reference = claim_reference;
      if (issued_date !== undefined) updates.issued_date = issued_date;
      if (due_date !== undefined) updates.due_date = due_date;

      const { data, error } = await sb.from("progress_claims").update(updates)
        .eq("id", cid).select().maybeSingle();
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true, claim: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/finance/jobs/:id/claims/:cid/send", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { id, cid } = req.params;
    try {
      const { data: claim } = await sb.from("progress_claims")
        .select("*").eq("id", cid).maybeSingle();
      if (!claim) return res.status(404).json({ error: "Claim not found" });
      if (claim.status !== "draft") return res.status(400).json({ error: "Only draft claims can be sent" });

      const today = new Date().toISOString().slice(0, 10);
      const dueDate = claim.due_date || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

      const { data: updated } = await sb.from("progress_claims").update({
        status: "issued",
        issued_date: claim.issued_date || today,
        due_date: dueDate,
        updated_at: new Date().toISOString(),
      }).eq("id", cid).select().maybeSingle();

      const { data: job } = await sb.from("jobs").select("address").eq("id", id).maybeSingle();
      const adminEmail = await getAdminEmail(sb);
      if (adminEmail) {
        await sendPlainMail({
          to: adminEmail,
          subject: `Progress Claim #${claim.claim_number} — ${job?.address || id}`,
          text: [
            `Progress Claim #${claim.claim_number} has been issued.`,
            `Stage: ${claim.stage || "—"}`,
            `Amount (inc GST): $${(Number(claim.amount_ex_gst) * 1.1).toFixed(2)}`,
            `Due: ${dueDate}`,
            claim.description ? `\nDescription: ${claim.description}` : "",
          ].filter(Boolean).join("\n"),
        }).catch((e) => console.warn("[finance/claims/send] email failed:", e.message));
      }

      res.json({ ok: true, claim: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/finance/jobs/:id/claims/:cid/pay", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { cid } = req.params;
    const { payment_amount, payment_date, payment_reference, payment_method } = req.body;
    if (!payment_amount || !payment_date) return res.status(400).json({ error: "payment_amount and payment_date are required" });
    try {
      const { data: claim } = await sb.from("progress_claims")
        .select("*, progress_claim_payments(payment_amount)").eq("id", cid).maybeSingle();
      if (!claim) return res.status(404).json({ error: "Claim not found" });

      const { data: payment, error: payErr } = await sb.from("progress_claim_payments").insert({
        progress_claim_id: cid,
        payment_amount: Number(payment_amount),
        payment_date,
        payment_reference: payment_reference || null,
        payment_method: payment_method || null,
        recorded_by: req.caller.id,
      }).select().maybeSingle();
      if (payErr) return res.status(400).json({ error: payErr.message });

      const totalPaid = (claim.progress_claim_payments || []).reduce((s, p) => s + Number(p.payment_amount || 0), 0)
        + Number(payment_amount);
      const amountIncGst = Number(claim.amount_ex_gst) * 1.1;

      let newStatus = claim.status;
      if (totalPaid >= amountIncGst) newStatus = "paid";
      else if (totalPaid > 0) newStatus = "partially_paid";

      const { data: updatedClaim } = await sb.from("progress_claims").update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      }).eq("id", cid).select().maybeSingle();

      res.json({ ok: true, payment, claim: updatedClaim });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/finance/jobs/:id/claims/:cid/void", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { cid } = req.params;
    try {
      const { data, error } = await sb.from("progress_claims").update({
        status: "void",
        updated_at: new Date().toISOString(),
      }).eq("id", cid).select().maybeSingle();
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true, claim: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── SECTION 4 — Variations ────────────────────────────────────────────────────

  app.get("/api/finance/jobs/:id/variations", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { id } = req.params;
    try {
      const { data, error } = await sb.from("job_variations")
        .select("*").eq("job_id", id).order("variation_number", { ascending: true });
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true, variations: data || [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/finance/jobs/:id/variations/recipes", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { id } = req.params;
    try {
      const { data: job } = await sb.from("jobs")
        .select("buildexact_job_id").eq("id", id).maybeSingle();
      if (!job?.buildexact_job_id) return res.json({ ok: true, recipes: [] });
      if (!buildexactConfigured()) return res.json({ ok: true, recipes: [] });

      const { estimate } = await pullBuildexactEstimate(job.buildexact_job_id);
      const recipes = (estimate?.categories || []).map((cat) => ({
        category_name: cat.name,
        total: cat.subtotal_ex_gst ?? cat.subtotal ?? 0,
        items: (cat.active_items || []).map((item) => ({
          name: item.description || item.name || "",
          unit_rate: item.rate ?? item.unitRate ?? null,
          unit: item.unit ?? null,
          quantity: item.quantity ?? null,
          total: item.total ?? item.lineTotal ?? null,
        })),
      }));

      res.json({ ok: true, recipes });
    } catch (err) {
      console.error("[finance/variations/recipes]", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/finance/jobs/:id/variations", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { id } = req.params;
    const { title, description, amount_ex_gst, cost_to_builder, trade_category_id, line_items, eot_days } = req.body;
    if (!title) return res.status(400).json({ error: "title is required" });
    if (amount_ex_gst === undefined) return res.status(400).json({ error: "amount_ex_gst is required" });
    try {
      const { data: maxRow } = await sb.from("job_variations")
        .select("variation_number").eq("job_id", id)
        .order("variation_number", { ascending: false }).limit(1).maybeSingle();
      const variationNumber = (maxRow?.variation_number || 0) + 1;

      const { data, error } = await sb.from("job_variations").insert({
        job_id: id,
        variation_number: variationNumber,
        title,
        description: description || null,
        amount_ex_gst: Number(amount_ex_gst),
        cost_to_builder: cost_to_builder != null ? Number(cost_to_builder) : null,
        trade_category_id: trade_category_id || null,
        line_items: line_items || [],
        eot_days: Number(eot_days || 0),
        status: "draft",
        created_by: req.caller.id,
      }).select().maybeSingle();
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true, variation: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/finance/jobs/:id/variations/:vid", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { vid } = req.params;
    const { title, description, amount_ex_gst, cost_to_builder, trade_category_id, line_items, eot_days } = req.body;
    try {
      const { data: existing } = await sb.from("job_variations")
        .select("status").eq("id", vid).maybeSingle();
      if (!existing) return res.status(404).json({ error: "Variation not found" });
      if (existing.status !== "draft") return res.status(400).json({ error: "Only draft variations can be edited" });

      const updates = { updated_at: new Date().toISOString() };
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (amount_ex_gst !== undefined) updates.amount_ex_gst = Number(amount_ex_gst);
      if (cost_to_builder !== undefined) updates.cost_to_builder = cost_to_builder != null ? Number(cost_to_builder) : null;
      if (trade_category_id !== undefined) updates.trade_category_id = trade_category_id;
      if (line_items !== undefined) updates.line_items = line_items;
      if (eot_days !== undefined) updates.eot_days = Number(eot_days);

      const { data, error } = await sb.from("job_variations").update(updates)
        .eq("id", vid).select().maybeSingle();
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true, variation: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/finance/jobs/:id/variations/:vid/send", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { id, vid } = req.params;
    const { client_email, client_name } = req.body;
    if (!client_email) return res.status(400).json({ error: "client_email is required" });
    try {
      const { data: variation } = await sb.from("job_variations")
        .select("*").eq("id", vid).maybeSingle();
      if (!variation) return res.status(404).json({ error: "Variation not found" });
      if (variation.status !== "draft") return res.status(400).json({ error: "Only draft variations can be sent" });

      const { data: job } = await sb.from("jobs").select("address").eq("id", id).maybeSingle();

      const { data: updated } = await sb.from("job_variations").update({
        status: "sent_to_client",
        sent_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", vid).select().maybeSingle();

      const amountIncGst = (Number(variation.amount_ex_gst) * 1.1).toFixed(2);
      const bodyLines = [
        `Dear ${client_name || "Client"},`,
        ``,
        `Please find below details for Variation #${variation.variation_number} on your project at ${job?.address || id}.`,
        ``,
        `Title: ${variation.title}`,
        variation.description ? `Description: ${variation.description}` : "",
        `Amount (inc GST): $${amountIncGst}`,
        variation.eot_days > 0 ? `Extension of time: ${variation.eot_days} day(s)` : "",
        ``,
        `Please reply to this email to approve or decline this variation.`,
      ].filter((l) => l !== null && l !== undefined).join("\n");

      await sendPlainMail({
        to: client_email,
        subject: `Variation #${variation.variation_number} — ${job?.address || id} — Action Required`,
        text: bodyLines,
      }).catch((e) => console.warn("[finance/variations/send] email failed:", e.message));

      res.json({ ok: true, variation: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/finance/jobs/:id/variations/:vid/sign", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { id, vid } = req.params;
    try {
      const { data: variation } = await sb.from("job_variations")
        .select("*").eq("id", vid).maybeSingle();
      if (!variation) return res.status(404).json({ error: "Variation not found" });
      if (variation.status !== "sent_to_client") return res.status(400).json({ error: "Variation must be sent to client before signing" });

      const { data: signed } = await sb.from("job_variations").update({
        status: "signed",
        signed_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", vid).select().maybeSingle();

      // Recompute contract_value — only signed variations count
      const { data: job } = await sb.from("jobs")
        .select("id, contract_value, original_contract_value").eq("id", id).maybeSingle();

      const originalContractValue = job?.original_contract_value ?? job?.contract_value ?? 0;

      const { data: signedVars } = await sb.from("job_variations")
        .select("amount_ex_gst").eq("job_id", id).eq("status", "signed");
      const signedSum = (signedVars || []).reduce((s, v) => s + Number(v.amount_ex_gst || 0), 0);
      const newContractValue = Number(originalContractValue) + signedSum;

      await sb.from("jobs").update({
        original_contract_value: Number(originalContractValue),
        contract_value: newContractValue,
        updated_at: new Date().toISOString(),
      }).eq("id", id);

      // Fire-and-forget: note the signed variation for Blueprint + Command Centre context
      checkProjectInsights(id, "variation_signed", sb, process.env.ANTHROPIC_API_KEY)
        .catch(e => console.warn("[insights] variation_signed:", e.message));

      res.json({ ok: true, variation: signed, new_contract_value: newContractValue });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/finance/jobs/:id/variations/:vid/reject", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { vid } = req.params;
    const { rejection_reason } = req.body;
    try {
      const { data, error } = await sb.from("job_variations").update({
        status: "rejected",
        rejection_reason: rejection_reason || null,
        updated_at: new Date().toISOString(),
      }).eq("id", vid).select().maybeSingle();
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true, variation: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/finance/jobs/:id/variations/:vid/void", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { vid } = req.params;
    try {
      const { data, error } = await sb.from("job_variations").update({
        status: "void",
        updated_at: new Date().toISOString(),
      }).eq("id", vid).select().maybeSingle();
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true, variation: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── SECTION 5 — WIPAA Review ──────────────────────────────────────────────────

  app.post("/api/finance/jobs/:id/wipaa/review", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { id } = req.params;
    const { forecast_total_cost, pct_complete, notes } = req.body;
    if (forecast_total_cost === undefined) return res.status(400).json({ error: "forecast_total_cost is required" });
    try {
      const { data: job } = await sb.from("jobs")
        .select("contract_value, original_contract_value").eq("id", id).maybeSingle();
      if (!job) return res.status(404).json({ error: "Job not found" });

      const [svRes, ciRes, acRes] = await Promise.all([
        sb.from("job_variations").select("amount_ex_gst").eq("job_id", id).eq("status", "signed"),
        sb.from("progress_claims").select("amount_ex_gst").eq("job_id", id).not("status", "in", "(draft,void)"),
        sb.from("financial_documents").select("approved_amount").eq("job_id", id)
          .in("status", ["approved", "filed", "xero_synced"]).not("approved_amount", "is", null),
      ]);

      const signedVarsSum = (svRes.data || []).reduce((s, r) => s + Number(r.amount_ex_gst || 0), 0);
      const claimsIssuedSum = (ciRes.data || []).reduce((s, r) => s + Number(r.amount_ex_gst || 0), 0);
      const actualCostsSum = (acRes.data || []).reduce((s, r) => s + Number(r.approved_amount || 0), 0);

      const contractValue = Number(job.original_contract_value || job.contract_value || 0) + signedVarsSum;
      const pct = Number(pct_complete || 0);
      const forecastCost = Number(forecast_total_cost);

      const wipaValue = contractValue * (pct / 100) - claimsIssuedSum;
      const projectedMarginPct = contractValue > 0 && forecastCost > 0
        ? ((contractValue - forecastCost) / contractValue * 100)
        : null;

      const today = new Date().toISOString().slice(0, 10);

      const { data: review, error: revErr } = await sb.from("wipaa_reviews").insert({
        job_id: id,
        review_date: today,
        reviewed_by: req.caller.id,
        contract_value: contractValue,
        forecast_total_cost: forecastCost,
        cost_to_date: actualCostsSum,
        progress_billed: claimsIssuedSum,
        pct_complete: pct,
        wipaa_value: wipaValue,
        projected_margin_pct: projectedMarginPct,
        notes: notes || null,
      }).select().maybeSingle();
      if (revErr) return res.status(400).json({ error: revErr.message });

      await sb.from("jobs").update({
        forecast_total_cost: forecastCost,
        last_wipaa_review_date: today,
        updated_at: new Date().toISOString(),
      }).eq("id", id);

      const { data: updatedJob } = await sb.from("jobs")
        .select("id, address, forecast_total_cost, last_wipaa_review_date, contract_value, original_contract_value")
        .eq("id", id).maybeSingle();

      res.json({ ok: true, review, job: updatedJob });
    } catch (err) {
      console.error("[finance/wipaa/review]", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/finance/jobs/:id/wipaa/history", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { id } = req.params;
    try {
      const { data, error } = await sb.from("wipaa_reviews")
        .select("*").eq("job_id", id).order("review_date", { ascending: false });
      if (error) return res.status(400).json({ error: error.message });
      res.json({ ok: true, reviews: data || [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── NPS ────────────────────────────────────────────────────────────────────

  app.post("/api/finance/jobs/:id/nps", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { id } = req.params;
    const { score, comment, surveyed_by } = req.body || {};
    if (score === undefined || Number(score) < 0 || Number(score) > 10) {
      return res.status(400).json({ error: "score must be 0–10" });
    }
    const { data, error } = await sb.from("job_nps_scores").insert({
      job_id:      id,
      score:       Number(score),
      comment:     comment || null,
      surveyed_by: surveyed_by || null,
      recorded_by: req.user?.id || null,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    // Fire insight check — NPS threshold gate is inside checkProjectInsights
    checkProjectInsights(id, "nps_submitted", sb, process.env.ANTHROPIC_API_KEY,
      { score: Number(score), comment: comment || null })
      .catch(e => console.warn("[insights] nps_submitted:", e.message));
    res.json({ ok: true, nps: data });
  });

  app.get("/api/finance/jobs/:id/nps", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const { data, error } = await sb.from("job_nps_scores")
      .select("*").eq("job_id", req.params.id)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  });

  // ── Insight dismiss ────────────────────────────────────────────────────────

  app.put("/api/insights/:id/dismiss", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ error: "DB not configured" });
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: "Invalid insight ID" });
    const { data, error } = await sb.from("cost_intelligence_insights")
      .update({
        is_dismissed:  true,
        dismissed_by:  req.caller?.id || null,
        dismissed_at:  new Date().toISOString(),
      })
      .eq("id", req.params.id)
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, insight: data });
  });
}
