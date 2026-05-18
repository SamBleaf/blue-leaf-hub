import Anthropic from "@anthropic-ai/sdk";
import { getServiceSupabase } from "./supabaseService.mjs";
import {
  dropboxConfigured,
  getDropboxAccessToken,
  dropboxUploadBuffer,
  sharedJobRootPath,
  DROPBOX_PRIVATE_INTERNAL_BASE
} from "./dropboxClient.mjs";

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
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

// ── Claude OCR extraction ─────────────────────────────────────────────────────

async function extractDocument(fileBase64, mimeType, filename) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const isImage = mimeType?.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  if (!isImage && !isPdf) {
    return { supplier_name: null, error: "Unsupported file type" };
  }

  const contentBlock = isImage
    ? { type: "image", source: { type: "base64", media_type: mimeType, data: fileBase64 } }
    : { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } };

  const prompt = `Extract structured data from this invoice or receipt. Return ONLY a JSON object with these exact fields:

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
  "extracted_address": "any project/site address in the document else null",
  "extracted_job_ref": "any job number or reference code else null",
  "extracted_po_number": "any PO or purchase order number else null",
  "description": "one sentence: what was invoiced"
}`;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: [contentBlock, { type: "text", text: prompt }] }]
  });

  const text = msg.content[0]?.text || "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { supplier_name: null, raw_extracted: text };
  try {
    return { ...JSON.parse(m[0]), raw_extracted: text };
  } catch {
    return { supplier_name: null, raw_extracted: text };
  }
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

    // Claude extraction
    let extracted = {};
    try {
      extracted = await extractDocument(fileBase64, mimeType, filename);
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
      .select("*, jobs(address, job_reference)")
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
      .select("*, jobs(address)")
      .eq("id", id).single();
    if (!doc) return res.status(404).json({ ok: false, error: "Not found" });
    if (!doc.job_id) return res.status(400).json({ ok: false, error: "Document must be matched to a job before approval" });

    let newDropboxPath = doc.dropbox_path;
    let newStatus = "approved";

    // Move to correct job folder on Dropbox
    if (doc.dropbox_path && doc.jobs?.address && dropboxConfigured()) {
      try {
        const token = await getDropboxAccessToken();
        const jobAddr = doc.jobs.address;
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
