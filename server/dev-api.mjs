import "dotenv/config";
import cors from "cors";
import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { smtpReady } from "./lib/smtpSend.mjs";
import { gmailSendConfigured } from "./lib/gmailSend.mjs";
import { mailTransportName, sendPlainMail } from "./lib/notifyMail.mjs";
import {
  dropboxConfigured,
  ensureJobFolderStructure,
  uploadTenderDocumentToJob,
  saveRfqEmailCopyToDropbox,
  uploadReceivedQuotePdfToJob,
  uploadImapReplyQuotePdfToSharedQuotes
} from "./lib/dropboxClient.mjs";
import { runDeadlineReminders } from "./lib/rfqReminders.mjs";
import { getServiceSupabase } from "./lib/supabaseService.mjs";
import { buildexactConfigured } from "./lib/buildexactClient.mjs";
import { sendReminderForRfqId } from "./lib/sendOneReminder.mjs";
import { handleBuildexactWebhook } from "./lib/buildexactWebhook.mjs";
import { registerModule4Routes } from "./lib/module4Routes.mjs";
import { registerModule5Routes } from "./lib/module5Routes.mjs";
import { registerModule6Routes } from "./lib/module6Routes.mjs";
import { registerInductionRoutes } from "./lib/inductionRoutes.mjs";
import { registerJobsApiRoutes } from "./lib/jobsApiRoutes.mjs";
import { resolveInboundRfqMatch, generateOutboundMessageId } from "./lib/imapQuoteMatch.mjs";
import { registerBlueprintRoutes } from "./lib/blueprintRoutes.mjs";
import { upsertJobKnowledge } from "./lib/jobResolver.mjs";

console.log("[blue-leaf-api] booting…");

/** Railway/cloud pass PORT; local dev uses PORT_API or 8787. */
const PORT = Number(process.env.PORT ?? process.env.PORT_API ?? 8787);
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]?.trim?.());
  if (missing.length) {
    console.warn("[blue-leaf-api] Missing env:", missing.join(", "));
  }
}

requireEnv(["ANTHROPIC_API_KEY"]);

function envBool(v, defaultValue = false) {
  if (v == null || v === "") return defaultValue;
  return String(v).toLowerCase() === "true" || v === "1";
}

function imapConfig() {
  const host = process.env.IMAP_HOST?.trim();
  const user = process.env.IMAP_USER?.trim();
  const pass = process.env.IMAP_PASS?.trim();
  if (!host || !user || !pass) return null;
  const port = Number(process.env.IMAP_PORT) || 993;
  const secure = envBool(process.env.IMAP_SECURE, port === 993);
  return { host, port, secure, auth: { user, pass } };
}

function formatImapAddresses(list) {
  if (!Array.isArray(list) || !list.length) return "";
  return list
    .map((a) => {
      if (!a) return "";
      const addr = a.address || "";
      const name = (a.name || "").trim();
      if (name && addr) return `${name} <${addr}>`;
      return addr || name;
    })
    .filter(Boolean)
    .join(", ");
}

const IMAP_LAST_UID_SETTING_KEY = "imap_quote_last_uid";

function normalizeLooseText(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function safeIsoDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function maybeFirstAddress(parsed) {
  const from = parsed?.from?.value;
  if (!Array.isArray(from) || !from.length) return "";
  return normEmail(from[0]?.address || "");
}

async function readSourceToBuffer(source) {
  if (!source) return Buffer.alloc(0);
  if (Buffer.isBuffer(source)) return source;
  if (source instanceof Uint8Array) return Buffer.from(source);
  if (typeof source === "string") return Buffer.from(source);
  const chunks = [];
  for await (const chunk of source) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function loadImapLastUid(sb) {
  const { data, error } = await sb.from("user_settings").select("value").eq("key", IMAP_LAST_UID_SETTING_KEY).maybeSingle();
  if (error) throw new Error(error.message || "Could not load IMAP cursor.");
  const n = Number(data?.value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

async function saveImapLastUid(sb, uid) {
  const v = Number(uid);
  if (!Number.isFinite(v) || v < 0) return;
  const { error } = await sb.from("user_settings").upsert(
    {
      key: IMAP_LAST_UID_SETTING_KEY,
      value: String(Math.floor(v)),
      updated_at: new Date().toISOString()
    },
    { onConflict: "key" }
  );
  if (error) throw new Error(error.message || "Could not save IMAP cursor.");
}

async function fetchOpenRfqCandidates(sb) {
  const { data, error } = await sb
    .from("rfqs")
    .select(
      `id, job_id, subcontractor_id, trade, status, email_body, sent_message_id, jobs(address), subcontractors(email, business_name, contact)`
    )
    .in("status", ["sent", "reminded", "received", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1200);
  if (error) throw new Error(error.message || "Could not load RFQ candidates.");
  return data || [];
}

async function upsertUnmatchedQuoteEmail(sb, payload) {
  const externalId = String(payload.external_id || "").trim();
  if (externalId) {
    const { data: existing } = await sb
      .from("unmatched_quote_emails")
      .select("id")
      .eq("external_id", externalId)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return existing;
  }
  const { data, error } = await sb
    .from("unmatched_quote_emails")
    .insert({
      source: "imap",
      external_id: externalId || null,
      from_email: payload.from_email || null,
      subject: payload.subject || null,
      body_preview: payload.body_preview || null,
      matched_job_id: payload.matched_job_id || null,
      matched_rfq_id: payload.matched_rfq_id || null
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message || "Could not write unmatched_quote_emails row.");
  return data;
}

async function extractQuoteFromPdf(pdfBuffer, label = "") {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  const pageCount = (pdfBuffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  if (pageCount > 100) {
    console.warn(`[quote-extraction] ${label} has ${pageCount} pages — skipping (Claude limit is 100 pages)`);
    return null;
  }
  try {
    const client = new Anthropic({ apiKey: key, maxRetries: 0 });
    const b64 = pdfBuffer.toString("base64");
    const completion = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 }, citations: { enabled: false } },
          { type: "text", text: 'You are extracting the total price from an Australian subcontractor quote PDF.\n\nReturn ONLY valid JSON, no markdown, no explanation:\n{"trade":"string","company":"string","total_ex_gst":number,"total_inc_gst":number,"gst":number,"items":[{"description":"string","amount":number}]}\n\nRules for totals:\n- Look for a summary/totals section near the bottom of the document.\n- total_inc_gst: the grand total INCLUDING GST (labelled "Total", "Total inc GST", "Amount due", "Grand Total" etc.).\n- gst: the GST amount (labelled "GST" or "Tax").\n- total_ex_gst: the subtotal BEFORE GST (labelled "Subtotal", "Ex GST", "Net"). If not shown explicitly, calculate: total_inc_gst / 1.1.\n- All values are numbers only — no $ signs, no commas.\n- Use null for any field genuinely not found.' }
        ]
      }]
    });
    const raw = completion.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    console.log(`[quote-extraction] ${label} raw response:`, raw.slice(0, 300));
    const clean = raw.replace(/```(?:json)?\s*([\s\S]*?)```/, "$1").trim();
    const s = clean.indexOf("{");
    const e = clean.lastIndexOf("}");
    if (s === -1 || e <= s) {
      console.warn(`[quote-extraction] ${label} no JSON object in response`);
      return null;
    }
    return JSON.parse(clean.slice(s, e + 1));
  } catch (err) {
    console.warn(`[quote-extraction] ${label}`, err?.message || err);
    return null;
  }
}

function extractAmountFromEmailText(text) {
  if (!text) return null;
  const patterns = [
    /total\s*(?:ex\.?\s*gst|excl\.?\s*gst|excluding\s*gst)?\s*:?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:our\s+)?(?:quote|price|fee|proposal)\s*(?:is\s*|:)?\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i,
    /\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\+\s*gst|ex\.?\s*gst|excl)/i,
    /amount\s*:?\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseFloat(m[1].replace(/,/g, ""));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

async function processIncomingQuoteMessage(sb, msg, rfqRows) {
  const sourceBuf = await readSourceToBuffer(msg.source);
  const parsed = await simpleParser(sourceBuf);
  const fromEmail = maybeFirstAddress(parsed);
  const subject = String(parsed?.subject || msg?.envelope?.subject || "").trim();
  const textBody = String(parsed?.text || "").trim();
  const bodyForLog = textBody || String(parsed?.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const externalId = String(parsed?.messageId || `imap-uid-${msg.uid}`).trim();

  // Deduplicate — if this message_id is already in correspondence, skip entirely
  if (externalId && !externalId.startsWith("imap-uid-")) {
    const { count } = await sb
      .from("correspondence")
      .select("id", { count: "exact", head: true })
      .eq("message_id", externalId);
    if (count > 0) return { matched: true, skipped: "duplicate", uid: msg.uid };
  }

  const best = resolveInboundRfqMatch(parsed, rfqRows);
  if (!best) {
    await upsertUnmatchedQuoteEmail(sb, {
      external_id: externalId,
      from_email: fromEmail,
      subject,
      body_preview: bodyForLog.slice(0, 2000)
    });
    // Still log to correspondence as unmatched inbound so nothing is silently lost
    await sb.from("correspondence").insert({
      job_id: null,
      rfq_id: null,
      subcontractor_id: null,
      direction: "inbound",
      subject: subject || "(no subject)",
      body: bodyForLog.slice(0, 16000),
      sent_at: safeIsoDate(msg.internalDate || parsed?.date || new Date()),
      logged_by: "imap-unmatched",
      message_id: externalId
    }).then(() => {}).catch(() => {});
    return { matched: false, uid: msg.uid };
  }

  const rfq = best.rfq;
  const sentAt = safeIsoDate(msg.internalDate || parsed?.date || new Date());
  const jobAddress = String(rfq?.jobs?.address || "").trim();

  const pdfRows = [];
  for (const att of parsed.attachments || []) {
    const fName = String(att?.filename || "quote.pdf").trim();
    const ct = String(att?.contentType || "").toLowerCase();
    const isPdf =
      ct.includes("pdf") ||
      ct.includes("application/octet-stream") ||
      /\.pdf$/i.test(fName);
    if (!isPdf) continue;
    const raw = att?.content;
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.isBuffer(raw?.data) ? raw.data : Buffer.from(raw || []);
    if (!buf.length) continue;
    pdfRows.push({ filename: fName, size: buf.length, buffer: buf });
  }

  const uploadedMeta = [];
  if (pdfRows.length && jobAddress && dropboxConfigured()) {
    for (const row of pdfRows) {
      try {
        const { path, sharedUrl } = await uploadImapReplyQuotePdfToSharedQuotes(
          jobAddress,
          row.filename,
          row.buffer
        );
        uploadedMeta.push({
          filename: row.filename,
          size: row.size,
          dropbox_path: path,
          url: sharedUrl
        });
      } catch (e) {
        console.warn("[imap-quote-pdf-upload]", row.filename, e?.message || e);
      }
    }
  } else if (pdfRows.length && !dropboxConfigured()) {
    console.warn("[imap-quote-pdf-upload] Dropbox not configured — PDF attachments not stored.");
  } else if (pdfRows.length && !jobAddress) {
    console.warn("[imap-quote-pdf-upload] Missing job address — cannot upload quote PDFs.");
  }

  // Async Claude extraction — runs after Dropbox upload, errors are non-fatal
  let extraction = null;
  if (pdfRows.length > 0) {
    extraction = await extractQuoteFromPdf(pdfRows[0].buffer, pdfRows[0].filename).catch(() => null);
  }
  // Fall back chain: ex_gst from PDF → inc_gst/1.1 from PDF → email text scan
  const quotedAmount = extraction?.total_ex_gst
    ? Number(extraction.total_ex_gst)
    : extraction?.total_inc_gst
      ? Math.round((Number(extraction.total_inc_gst) / 1.1) * 100) / 100
      : extractAmountFromEmailText(textBody);

  const { error: corrErr } = await sb.from("correspondence").insert({
    job_id: rfq.job_id,
    rfq_id: rfq.id,
    subcontractor_id: rfq.subcontractor_id,
    direction: "inbound",
    subject: subject || "(no subject)",
    body: bodyForLog.slice(0, 16000),
    sent_at: sentAt,
    logged_by: "imap-bot",
    message_id: externalId,
    attachments: uploadedMeta.length ? uploadedMeta : []
  });
  if (corrErr) throw new Error(corrErr.message || "Could not write correspondence row.");

  const updatePatch = {
    status: "received",
    received_at: sentAt
  };
  const first = uploadedMeta[0];
  if (first?.url) {
    updatePatch.quote_pdf_path = first.dropbox_path;
    updatePatch.dropbox_pdf_url = first.url;
    updatePatch.quote_pdf_url = first.url;
  }
  if (quotedAmount != null && Number.isFinite(quotedAmount) && quotedAmount > 0) {
    updatePatch.quoted_amount = quotedAmount;
    updatePatch.quote_extracted_at = new Date().toISOString();
    if (extraction) updatePatch.quote_extraction = extraction;
  }

  const { error: rfqErr } = await sb.from("rfqs").update(updatePatch).eq("id", rfq.id);
  if (rfqErr) throw new Error(rfqErr.message || "Could not update RFQ status.");

  // Write job knowledge for Blueprint
  if (rfq.job_id && quotedAmount != null) {
    const subName = rfq.subcontractors?.business_name || fromEmail || "unknown";
    const trade = extraction?.trade || rfq.trade || "";
    const itemList = (extraction?.items || []).map((i) => i.description).filter(Boolean).join(", ");
    await upsertJobKnowledge({
      job_id: rfq.job_id,
      address: jobAddress,
      kind: "quote",
      content: `Quote received from ${subName} for ${trade}: $${quotedAmount} ex GST.${itemList ? ` Items: ${itemList}.` : ""}`,
      data: { rfq_id: rfq.id, subcontractor: subName, trade, quoted_amount: quotedAmount, extraction },
      source_id: rfq.id
    });
  }

  return { matched: true, rfqId: rfq.id, uid: msg.uid };
}

const EXTRACTION_TRADE_KEYS = [
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

function emptyTradeBlock() {
  return { scope_summary: "", specific_items: [], missing_info: "" };
}

function normalizeTradeBlock(v) {
  if (v == null) return emptyTradeBlock();
  if (typeof v === "string") {
    return { scope_summary: v.trim(), specific_items: [], missing_info: "" };
  }
  if (typeof v === "object") {
    return {
      scope_summary: String(v.scope_summary ?? "").trim(),
      specific_items: Array.isArray(v.specific_items)
        ? v.specific_items.map((x) => String(x).trim()).filter(Boolean)
        : [],
      missing_info: v.missing_info == null ? "" : String(v.missing_info).trim()
    };
  }
  return emptyTradeBlock();
}

function normalizeExtractionResponse(parsed) {
  const building_specs = {
    external_walls: "",
    roof_type: "",
    window_type: "",
    glazing_spec: "",
    insulation: "",
    facade_features: "",
    energy_rating: ""
  };
  const bs = parsed?.building_specs;
  if (bs && typeof bs === "object") {
    for (const k of Object.keys(building_specs)) {
      building_specs[k] = bs[k] == null ? "" : String(bs[k]).trim();
    }
  }

  const trade_notes = {};
  for (const k of EXTRACTION_TRADE_KEYS) {
    trade_notes[k] = normalizeTradeBlock(parsed?.trade_notes?.[k]);
  }

  const numOrNull = (v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    project_address: String(parsed?.project_address ?? parsed?.address ?? "").trim(),
    project_type: String(parsed?.project_type ?? "unknown").trim() || "unknown",
    storeys: String(parsed?.storeys ?? "").trim(),
    floor_area_m2: numOrNull(parsed?.floor_area_m2),
    site_area_m2: numOrNull(parsed?.site_area_m2),
    building_specs,
    trade_notes,
    coverage_gaps: Array.isArray(parsed?.coverage_gaps)
      ? parsed.coverage_gaps.map(String)
      : [],
    key_project_notes: String(parsed?.key_project_notes ?? "").trim(),
    client_name: String(parsed?.client_name ?? "").trim(),
    architect_name: String(parsed?.architect_name ?? "").trim()
  };
}

const extractionMasterPrompt = `Blue Leaf Building (Adelaide SA). Read the attached tender PDF. Output JSON only — no markdown, no prose outside JSON.

{
  "project_address": "",
  "project_type": "new build | renovation | extension | knockdown rebuild",
  "storeys": "",
  "floor_area_m2": null,
  "site_area_m2": null,
  "building_specs": {
    "external_walls": "",
    "roof_type": "",
    "window_type": "",
    "glazing_spec": "",
    "insulation": "",
    "facade_features": "",
    "energy_rating": ""
  },
  "trade_notes": {
    "excavation": { "scope_summary": "", "specific_items": [], "missing_info": "" },
    "demolition": { "scope_summary": "", "specific_items": [], "missing_info": "" },
    "termite_protection": { "scope_summary": "", "specific_items": [], "missing_info": "" },
    "footings_concrete_formwork": { "scope_summary": "", "specific_items": [], "missing_info": "" },
    "plumbing": { "scope_summary": "", "specific_items": [], "missing_info": "" },
    "electrical": { "scope_summary": "", "specific_items": [], "missing_info": "" },
    "internal_linings": { "scope_summary": "", "specific_items": [], "missing_info": "" },
    "stairs": { "scope_summary": "", "specific_items": [], "missing_info": "" },
    "tiling": { "scope_summary": "", "specific_items": [], "missing_info": "" },
    "flooring": { "scope_summary": "", "specific_items": [], "missing_info": "" },
    "metal_roofing": { "scope_summary": "", "specific_items": [], "missing_info": "" }
  },
  "coverage_gaps": [],
  "key_project_notes": ""
}

Output rules:
- building_specs: one short factual line per field from docs; empty string if absent.
- trade_notes: every key above required. scope_summary = short dot-point lines only (max ~6 lines), trade-specific facts from docs — no paragraphs, no generic filler across trades.
- Last line of scope_summary must be one line only: standard code + short title (e.g. AS 3660.1 — Termite management; AS/NZS 3000 — Wiring rules). No extra sentence on that line.
- specific_items: brief extra bullets if needed; else [].
- missing_info: critical gap for quoting that trade; else "".
- coverage_gaps: short strings for missing docs/info only.
- key_project_notes: max 2 short sentences, Australian English, from docs only.
- Only document-backed facts; else "", [], or null.`;

/** After a 429, wait and retry at most this many times (so up to 3 total API calls). */
const RFQ_EXTRACT_429_MAX_RETRIES = 2;

function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Seconds to wait before retrying (Anthropic may send retry-after-ms or Retry-After).
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After
 */
function retryAfterSecondsFromAnthropicHeaders(headers) {
  if (!headers || typeof headers !== "object") return 30;
  const ram = headers["retry-after-ms"];
  if (ram != null && String(ram).trim() !== "") {
    const ms = parseFloat(String(ram));
    if (!Number.isNaN(ms) && ms >= 0) return Math.max(1, Math.ceil(ms / 1000));
  }
  const ra = headers["retry-after"] ?? headers["Retry-After"];
  if (ra != null && String(ra).trim() !== "") {
    const asNum = parseFloat(String(ra));
    if (!Number.isNaN(asNum) && asNum >= 0) return Math.max(1, Math.ceil(asNum));
    const deadline = Date.parse(String(ra));
    if (!Number.isNaN(deadline)) {
      const sec = Math.ceil((deadline - Date.now()) / 1000);
      return Math.max(1, sec);
    }
  }
  return 30;
}

function parseExtractionFromCompletion(completion) {
  const textOut = completion.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const trimmed = textOut.trim();

  let jsonSlice = trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) jsonSlice = fence[1].trim();

  const braceStart = jsonSlice.indexOf("{");
  const braceEnd = jsonSlice.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    jsonSlice = jsonSlice.slice(braceStart, braceEnd + 1);
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch (_e) {
    const err = new Error("Could not parse model response as JSON");
    err.debugExcerpt = trimmed.slice(0, 2500);
    throw err;
  }

  return normalizeExtractionResponse(parsed);
}

const app = express();
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "Buildexact-Signature", "X-Buildexact-Signature"],
    optionsSuccessStatus: 204,
    credentials: false
  })
);

app.post(
  "/api/webhooks/buildexact",
  express.raw({ type: "*/*", limit: "2mb" }),
  (req, res, next) => {
    handleBuildexactWebhook(req, res).catch((err) => {
      console.error("[buildexact webhook]", err);
      if (!res.headersSent) res.status(200).json({ ok: false, error: "handler_error" });
      else next();
    });
  }
);

const JSON_BODY_LIMIT = process.env.BLUEPRINT_BODY_LIMIT || "100mb";
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use((err, _req, res, next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      error: `Upload too large for Blueprint API. Limit is ${JSON_BODY_LIMIT}. Try a smaller PDF or paste the key section.`
    });
  }
  return next(err);
});

registerModule4Routes(app);
registerModule5Routes(app);
registerModule6Routes(app);
registerBlueprintRoutes(app);
registerInductionRoutes(app);
registerJobsApiRoutes(app);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: MODEL, time: new Date().toISOString() });
});

app.post("/api/subcontractor/lookup", async (req, res) => {
  try {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) {
      return res.status(500).json({
        ok: false,
        error: "ANTHROPIC_API_KEY not configured."
      });
    }

    const business_name = String(req.body?.business_name || "").trim();
    const email = String(req.body?.email || "").trim();
    const trade = String(req.body?.trade || "").trim();
    const suburb = String(req.body?.suburb || "").trim();
    const state = String(req.body?.state || "SA").trim() || "SA";

    if (!business_name || !email) {
      return res.status(400).json({
        ok: false,
        error: "business_name and email are required."
      });
    }

    const lookupSchemaHint = `
Return ONLY JSON (no markdown) with exact keys:
{
  "contact": string|null,
  "mobile": string|null,
  "abn": string|null,
  "address": string|null,
  "suburb": string|null,
  "postcode": string|null,
  "state": string|null,
  "could_not_find": string[]
}

Rules:
- Use web search to verify details for the exact business.
- If uncertain, set value to null and add the field key to could_not_find.
- Do not guess phone, ABN, or address details.
- Keep could_not_find to only: contact, mobile, abn, address, suburb, postcode, state.
`;

    const client = new Anthropic({ apiKey: key });
    const completion = await client.messages.create({
      model: MODEL,
      max_tokens: 1400,
      temperature: 0.1,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Research this subcontractor for Blue Leaf Building.\n` +
                `Business Name: ${business_name}\n` +
                `Email: ${email}\n` +
                `Trade: ${trade || "not specified"}\n` +
                `Suburb hint: ${suburb || "unknown"}\n` +
                `State hint: ${state}\n\n` +
                lookupSchemaHint
            }
          ]
        }
      ]
    });

    const textOut = completion.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    let jsonSlice = textOut;
    const fence = textOut.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence?.[1]) jsonSlice = fence[1].trim();
    const braceStart = jsonSlice.indexOf("{");
    const braceEnd = jsonSlice.lastIndexOf("}");
    if (braceStart !== -1 && braceEnd > braceStart) {
      jsonSlice = jsonSlice.slice(braceStart, braceEnd + 1);
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonSlice);
    } catch (_error) {
      return res.status(502).json({
        ok: false,
        error: "Claude lookup JSON parse failed.",
        debug: textOut.slice(0, 1500)
      });
    }

    const fields = ["contact", "mobile", "abn", "address", "suburb", "postcode", "state"];
    const normalized = {};
    for (const field of fields) {
      const value = parsed?.[field];
      normalized[field] =
        typeof value === "string" ? value.trim() || null : value == null ? null : String(value);
    }
    if (!normalized.state) normalized.state = state || "SA";

    const allowedMissing = new Set(fields);
    const missingRaw = Array.isArray(parsed?.could_not_find) ? parsed.could_not_find : [];
    const could_not_find = missingRaw
      .map((f) => String(f).trim())
      .filter((f) => allowedMissing.has(f));

    return res.json({
      ok: true,
      ...normalized,
      could_not_find,
      model: MODEL
    });
  } catch (err) {
    console.error("[subcontractor/lookup]", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Subcontractor lookup failed."
    });
  }
});

/** One PDF per request — keeps Anthropic input under context limits when the client runs sequential extracts. */
const RFQ_EXTRACT_MAX_FILES = 1;
/** Warn when decoded PDF exceeds this size (bytes); model may still truncate or fail. */
const RFQ_EXTRACT_LARGE_FILE_BYTES = 8 * 1024 * 1024;

app.post("/api/rfq/extract", async (req, res) => {
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return res.status(500).json({
        ok: false,
        error:
          "ANTHROPIC_API_KEY not configured — add it to your .env and restart npm run dev."
      });
    }

    const files = req.body?.files;
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ ok: false, error: "Provide files[]." });
    }
    if (files.length !== RFQ_EXTRACT_MAX_FILES) {
      return res.status(400).json({
        ok: false,
        error: `Send exactly one PDF per request (files.length must be ${RFQ_EXTRACT_MAX_FILES}).`
      });
    }

    const f = files[0];
    if (!f?.dataBase64 || !f?.name) {
      return res.status(400).json({ ok: false, error: "Each file needs name & dataBase64." });
    }
    const mime = f.mimeType || "application/pdf";
    if (!String(mime).includes("pdf")) {
      return res.status(400).json({
        ok: false,
        error: `${f.name}: only PDF uploads are supported in this MVP.`
      });
    }

    let decoded;
    try {
      decoded = Buffer.from(String(f.dataBase64).trim(), "base64");
    } catch {
      return res.status(400).json({ ok: false, error: `${f.name}: invalid base64.` });
    }
    if (!decoded?.length) {
      return res.status(400).json({ ok: false, error: `${f.name}: empty file after decode.` });
    }

    // Count PDF pages — Claude rejects anything over 100 pages with a 400 error.
    // Regex counts /Type /Page dictionary entries (not /Pages which is the catalogue).
    const pageCount = (decoded.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    if (pageCount > 100) {
      return res.status(400).json({
        ok: false,
        error: `${f.name} has ${pageCount} pages — Claude's PDF limit is 100 pages. Split the document or use a smaller version.`
      });
    }

    const streamWarnings = [];
    if (decoded.length > RFQ_EXTRACT_LARGE_FILE_BYTES) {
      streamWarnings.push(
        `${f.name} is ${(decoded.length / (1024 * 1024)).toFixed(1)} MB (over 8 MB). Extraction may be partial or fail due to model context limits.`
      );
    }

    const docs = [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: f.dataBase64
        },
        citations: { enabled: false }
      }
    ];

    const client = new Anthropic({ apiKey: key, maxRetries: 0 });

    const userContent = [
      ...docs,
      {
        type: "text",
        text: `Tender PDF — ${f.name} (Adelaide SA).\n\n${extractionMasterPrompt}`
      }
    ];

    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");

    for (const message of streamWarnings) {
      res.write(`${JSON.stringify({ event: "warning", message })}\n`);
      if (typeof res.flush === "function") res.flush();
    }

    let completion;
    let rateLimitRetriesUsed = 0;
    while (true) {
      try {
        completion = await client.messages.create(
          {
            model: MODEL,
            max_tokens: 4096,
            temperature: 0.2,
            messages: [{ role: "user", content: userContent }]
          },
          { maxRetries: 0 }
        );
        break;
      } catch (err) {
        const status = err?.status;
        if (status === 429 && rateLimitRetriesUsed < RFQ_EXTRACT_429_MAX_RETRIES) {
          const retryInSeconds = retryAfterSecondsFromAnthropicHeaders(err.headers);
          res.write(`${JSON.stringify({ event: "rate_limit", retryInSeconds })}\n`);
          if (typeof res.flush === "function") res.flush();
          await sleepMs(retryInSeconds * 1000);
          rateLimitRetriesUsed += 1;
          continue;
        }
        const message =
          err?.message ||
          err?.error?.message ||
          "Anthropic extraction failed — check logs.";
        console.error("[rfq/extract]", err);
        res.write(
          `${JSON.stringify({
            event: "result",
            ok: false,
            error: message,
            details: process.env.NODE_ENV === "production" ? undefined : String(err)
          })}\n`
        );
        res.end();
        return;
      }
    }

    try {
      const extraction = parseExtractionFromCompletion(completion);
      res.write(`${JSON.stringify({ event: "result", ok: true, extraction, model: MODEL })}\n`);
      res.end();
    } catch (parseErr) {
      console.error("[rfq/extract] parse", parseErr);
      res.write(
        `${JSON.stringify({
          event: "result",
          ok: false,
          error: parseErr?.message || "Could not parse model response as JSON",
          debug: parseErr?.debugExcerpt
        })}\n`
      );
      res.end();
    }
  } catch (err) {
    console.error("[rfq/extract]", err);
    if (res.headersSent) {
      try {
        res.write(
          `${JSON.stringify({
            event: "result",
            ok: false,
            error: err?.message || String(err)
          })}\n`
        );
        res.end();
      } catch {
        /* ignore */
      }
      return;
    }
    const message =
      err?.message ||
      err?.error?.message ||
      "Anthropic extraction failed — check logs.";
    const status =
      typeof err?.status === "number" && err.status >= 400 ? err.status : 500;
    return res.status(status).json({
      ok: false,
      error: message,
      details: process.env.NODE_ENV === "production" ? undefined : String(err)
    });
  }
});

app.get("/api/integrations/status", (_req, res) => {
  const gmail = gmailSendConfigured();
  const smtp = smtpReady();
  const dropbox = dropboxConfigured();
  res.json({
    ok: true,
    gmail: { configured: gmail, sender: process.env.GMAIL_SENDER_EMAIL?.trim() || null },
    smtp: { configured: smtp },
    dropbox: { configured: dropbox },
    buildexact: { configured: buildexactConfigured() },
    mail: { ready: gmail || smtp, transport: mailTransportName() }
  });
});

app.post("/api/dropbox/ensure-job-folders", async (req, res) => {
  try {
    if (!dropboxConfigured()) {
      return res.status(503).json({
        ok: false,
        error:
          "Dropbox not configured — set DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN (run `node scripts/dropbox-auth.mjs`)."
      });
    }
    const jobAddress = req.body?.jobAddress?.trim();
    const trades = Array.isArray(req.body?.trades) ? req.body.trades : [];
    if (!jobAddress) {
      return res.status(400).json({ ok: false, error: "jobAddress required." });
    }
    const out = await ensureJobFolderStructure({ jobAddress, trades });
    return res.json({ ok: true, ...out });
  } catch (err) {
    console.error("[dropbox/ensure-job-folders]", err);
    return res.status(502).json({
      ok: false,
      error: err?.message || "Dropbox folder creation failed."
    });
  }
});

app.post("/api/dropbox/upload-tender-document", async (req, res) => {
  try {
    if (!dropboxConfigured()) {
      return res.status(503).json({
        ok: false,
        error:
          "Dropbox not configured — set DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN (run `node scripts/dropbox-auth.mjs`)."
      });
    }
    const jobAddress = req.body?.jobAddress?.trim();
    const fileName = req.body?.fileName?.trim();
    const dataBase64 = req.body?.dataBase64;
    const hints = typeof req.body?.hints === "string" ? req.body.hints : "";
    const documentCategory =
      typeof req.body?.documentCategory === "string" ? req.body.documentCategory.trim() : "";
    if (!jobAddress || !fileName || typeof dataBase64 !== "string" || !dataBase64.length) {
      return res.status(400).json({ ok: false, error: "jobAddress, fileName, and dataBase64 required." });
    }
    let buffer;
    try {
      buffer = Buffer.from(dataBase64, "base64");
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid base64 payload." });
    }
    if (!buffer.length) {
      return res.status(400).json({ ok: false, error: "Empty file after decode." });
    }
    const out = await uploadTenderDocumentToJob({
      jobAddress,
      fileName,
      buffer,
      hints,
      documentCategory: documentCategory || undefined
    });
    return res.json({ ok: true, path: out.path_lower || out.path_display || null, result: out });
  } catch (err) {
    console.error("[dropbox/upload-tender-document]", err);
    return res.status(502).json({
      ok: false,
      error: err?.message || "Dropbox tender upload failed."
    });
  }
});

app.post("/api/dropbox/save-rfq-email-copy", async (req, res) => {
  try {
    if (!dropboxConfigured()) {
      return res.status(503).json({
        ok: false,
        error:
          "Dropbox not configured — set DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN (run `node scripts/dropbox-auth.mjs`)."
      });
    }
    const jobAddress = req.body?.jobAddress?.trim();
    const trade = String(req.body?.trade || "").trim();
    const businessName = String(req.body?.businessName || "").trim();
    const textBody = typeof req.body?.textBody === "string" ? req.body.textBody : "";
    if (!jobAddress || !trade) {
      return res.status(400).json({ ok: false, error: "jobAddress and trade required." });
    }
    const out = await saveRfqEmailCopyToDropbox({
      jobAddress,
      trade,
      businessName: businessName || "UNKNOWN",
      textBody
    });
    return res.json({ ok: true, path: out.path_lower || out.path_display || null, result: out });
  } catch (err) {
    console.error("[dropbox/save-rfq-email-copy]", err);
    return res.status(502).json({
      ok: false,
      error: err?.message || "Dropbox RFQ copy save failed."
    });
  }
});

app.post("/api/dropbox/save-quote-pdf", async (req, res) => {
  try {
    if (!dropboxConfigured()) {
      return res.status(503).json({
        ok: false,
        error:
          "Dropbox not configured — set DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN (run `node scripts/dropbox-auth.mjs`)."
      });
    }
    const jobAddress = req.body?.jobAddress?.trim();
    const trade = String(req.body?.trade || "").trim();
    const businessName = String(req.body?.businessName || "").trim();
    const originalFileName = String(req.body?.originalFileName || "quote.pdf").trim();
    const dataBase64 = req.body?.dataBase64;
    if (!jobAddress || !trade || typeof dataBase64 !== "string" || !dataBase64.length) {
      return res.status(400).json({ ok: false, error: "jobAddress, trade, and dataBase64 required." });
    }
    let buffer;
    try {
      buffer = Buffer.from(dataBase64, "base64");
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid base64 payload." });
    }
    if (!buffer.length) {
      return res.status(400).json({ ok: false, error: "Empty file after decode." });
    }
    const out = await uploadReceivedQuotePdfToJob({
      jobAddress,
      trade,
      businessName: businessName || "UNKNOWN",
      originalFileName,
      buffer
    });
    return res.json({ ok: true, path: out.path_lower || out.path_display || null, result: out });
  } catch (err) {
    console.error("[dropbox/save-quote-pdf]", err);
    return res.status(502).json({
      ok: false,
      error: err?.message || "Dropbox quote PDF save failed."
    });
  }
});

app.post("/api/cron/rfq-reminders", async (_req, res) => {
  try {
    const days = Number(process.env.REMINDER_DAYS_BEFORE) || 2;
    const result = await runDeadlineReminders({ daysBefore: days });
    return res.json(result);
  } catch (err) {
    console.error("[cron/rfq-reminders]", err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

/** Unmatched quote emails (requires service role + migration 003). */
app.post("/api/rfq/remind-one", async (req, res) => {
  const rfqId = req.body?.rfqId?.trim?.();
  if (!rfqId) {
    return res.status(400).json({ ok: false, error: "rfqId required." });
  }
  try {
    const out = await sendReminderForRfqId(rfqId, {
      signatureFooter: String(req.body?.signatureFooter || "").trim(),
      signatureLogoDataUrl: String(req.body?.signatureLogoDataUrl || "").trim()
    });
    return res.json({ ...out, mail_ready: true, transport: mailTransportName() });
  } catch (err) {
    console.error("[rfq/remind-one]", err);
    const status = /not found|only be sent|already sent|no email/i.test(err?.message || "")
      ? 400
      : 502;
    return res.status(status).json({ ok: false, error: err?.message || String(err) });
  }
});

app.get("/api/quote-tracker/unmatched", async (_req, res) => {
  const sb = getServiceSupabase();
  if (!sb) {
    return res.json({
      ok: true,
      serviceConfigured: false,
      items: [],
      note: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the API to load unmatched rows."
    });
  }
  const { data, error } = await sb
    .from("unmatched_quote_emails")
    .select("*")
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
  return res.json({ ok: true, serviceConfigured: true, items: data || [] });
});

app.post("/api/rfq/send", async (req, res) => {
  try {
    const msgs = req.body?.messages;
    const transport = mailTransportName();

    if (!transport) {
      return res.status(500).json({
        ok: false,
        mail_ready: false,
        smtp_ready: false,
        gmail_ready: false,
        error:
          "Mail not configured — add Gmail OAuth (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER_EMAIL) or SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM, …) in `.env`, then restart the API."
      });
    }

    if (!Array.isArray(msgs) || msgs.length === 0) {
      return res.status(400).json({ ok: false, error: "messages[] required." });
    }

    const sb = getServiceSupabase();
    const results = [];

    for (const m of msgs) {
      const to = m?.to?.trim();
      const subject = m?.subject?.trim();
      const body = m?.body;
      const html = m?.html;
      if (!to || !subject || typeof body !== "string") {
        return res.status(400).json({
          ok: false,
          mail_ready: true,
          smtp_ready: smtpReady(),
          gmail_ready: gmailSendConfigured(),
          transport,
          error: `Invalid message payload (${to || "missing recipient"}).`,
          results
        });
      }

      try {
        const msgId = generateOutboundMessageId();
        const headers = { "Message-ID": msgId };
        await sendPlainMail({
          to,
          subject,
          text: body,
          html: typeof html === "string" && html.trim() ? html.trim() : undefined,
          headers
        });
        let jobId = String(m.jobId || "").trim();
        const rfqId = String(m.rfqId || "").trim();
        const subId = String(m.subcontractor_id || "").trim();
        if (sb && rfqId) {
          const { data: rRow } = await sb.from("rfqs").select("job_id, subcontractor_id").eq("id", rfqId).maybeSingle();
          if (rRow?.job_id && !jobId) jobId = rRow.job_id;
          const scId = subId || (rRow?.subcontractor_id ? String(rRow.subcontractor_id) : "");
          await sb
            .from("rfqs")
            .update({
              sent_message_id: msgId,
              status: "sent",
              sent_at: new Date().toISOString()
            })
            .eq("id", rfqId);
          const { error: cErr } = await sb.from("correspondence").insert({
            job_id: jobId || null,
            rfq_id: rfqId,
            subcontractor_id: scId || null,
            direction: "outbound",
            subject,
            body,
            sent_at: new Date().toISOString(),
            message_id: msgId.replace(/^<|>$/g, ""),
            logged_by: "rfq-send"
          });
          if (cErr) console.warn("[rfq-send] correspondence", cErr.message);
        }
        results.push({ ok: true, to, transport, messageId: msgId });
      } catch (e) {
        console.error("[rfq-send]", e);
        results.push({
          ok: false,
          to,
          error: e?.message || "Send failed"
        });
        const detail = `${to}: ${results.at(-1)?.error}`;
        return res.status(502).json({
          ok: false,
          mail_ready: true,
          smtp_ready: smtpReady(),
          gmail_ready: gmailSendConfigured(),
          transport,
          error: `Stopped after send failure (${detail}). Earlier messages were sent.`,
          partial: true,
          results
        });
      }
    }

    return res.status(200).json({
      ok: true,
      mail_ready: true,
      smtp_ready: smtpReady(),
      gmail_ready: gmailSendConfigured(),
      transport,
      results
    });
  } catch (err) {
    console.error("[rfq/send]", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Bulk send crashed — check logs."
    });
  }
});

/** List recent INBOX messages via IMAP (imapflow). Optional — requires IMAP_* env. */
app.get("/api/mail/inbox", async (req, res) => {
  const cfg = imapConfig();
  if (!cfg) {
    return res.status(503).json({
      ok: false,
      imap_ready: false,
      error:
        "IMAP not configured — set IMAP_HOST, IMAP_PORT, IMAP_SECURE, IMAP_USER, and IMAP_PASS in `.env`."
    });
  }

  const limit = Math.min(50, Math.max(1, Number(req.query?.limit) || 20));

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth
  });

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    const exists = client.mailbox?.exists ?? 0;
    const messages = [];
    if (exists > 0) {
      const start = Math.max(1, exists - limit + 1);
      for await (const msg of client.fetch(`${start}:${exists}`, {
        uid: true,
        envelope: true,
        internalDate: true
      })) {
        const env = msg.envelope;
        messages.push({
          uid: msg.uid,
          date:
            msg.internalDate instanceof Date
              ? msg.internalDate.toISOString()
              : env?.date || null,
          subject: env?.subject != null ? String(env.subject) : "",
          from: formatImapAddresses(env?.from),
          to: formatImapAddresses(env?.to)
        });
      }
    }
    messages.reverse();
    await client.logout();
    return res.json({ ok: true, imap_ready: true, totalInInbox: exists, messages });
  } catch (err) {
    console.error("[imap-inbox]", err);
    try {
      await client.logout();
    } catch (_e) {
      /* ignore */
    }
    return res.status(502).json({
      ok: false,
      imap_ready: true,
      error: err?.message || "IMAP fetch failed — check host, port, and credentials."
    });
  }
});

let imapQuotePollBusy = false;

async function pollImapForQuoteReplies() {
  if (imapQuotePollBusy) return { ok: true, skipped: "busy" };
  const cfg = imapConfig();
  if (!cfg) return { ok: true, skipped: "imap_not_configured" };
  const sb = getServiceSupabase();
  if (!sb) return { ok: true, skipped: "service_supabase_not_configured" };

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth
  });

  imapQuotePollBusy = true;
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    const exists = Number(client.mailbox?.exists || 0);
    let lastUid = await loadImapLastUid(sb);
    if (lastUid == null) {
      await saveImapLastUid(sb, exists);
      await client.logout();
      return { ok: true, initialized: true, lastUid: exists, checked: 0, matched: 0, unmatched: 0 };
    }
    if (exists <= lastUid) {
      await client.logout();
      return { ok: true, checked: 0, matched: 0, unmatched: 0, lastUid };
    }

    const candidates = await fetchOpenRfqCandidates(sb);
    const maxPerPoll = Math.min(200, Math.max(1, Number(process.env.IMAP_POLL_MAX_PER_RUN) || 80));
    const rows = [];
    for await (const msg of client.fetch(`${lastUid + 1}:*`, {
      uid: true,
      envelope: true,
      internalDate: true,
      source: true
    })) {
      rows.push(msg);
      if (rows.length >= maxPerPoll) break;
    }

    let matched = 0;
    let unmatched = 0;
    let highestUid = lastUid;
    for (const msg of rows) {
      highestUid = Math.max(highestUid, Number(msg.uid) || 0);
      try {
        const out = await processIncomingQuoteMessage(sb, msg, candidates);
        if (out.matched) matched += 1;
        else unmatched += 1;
      } catch (e) {
        console.error("[imap-quote-process]", e);
      }
    }
    if (highestUid > lastUid) await saveImapLastUid(sb, highestUid);
    await client.logout();
    return { ok: true, checked: rows.length, matched, unmatched, lastUid: highestUid };
  } catch (err) {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    imapQuotePollBusy = false;
  }
}

app.post("/api/imap/quote-poll", async (_req, res) => {
  try {
    const out = await pollImapForQuoteReplies();
    return res.json(out);
  } catch (err) {
    console.error("[imap-quote-poll]", err);
    return res.status(502).json({ ok: false, error: err?.message || "IMAP quote poll failed." });
  }
});

/** Re-extract quote amount from an already-received quote PDF stored in Dropbox */
app.post("/api/rfq/:rfqId/reextract-amount", async (req, res) => {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "Server DB not configured." });

  const { data: rfq, error: rfqErr } = await sb
    .from("rfqs")
    .select("id, quote_pdf_url, dropbox_pdf_url, quote_pdf_path, trade, quote_extraction")
    .eq("id", req.params.rfqId)
    .maybeSingle();
  if (rfqErr || !rfq) return res.status(404).json({ ok: false, error: rfqErr?.message || "RFQ not found." });

  const pdfPath = rfq.quote_pdf_path;
  if (!pdfPath && !rfq.quote_pdf_url && !rfq.dropbox_pdf_url) {
    return res.status(400).json({ ok: false, error: "No quote PDF on this RFQ." });
  }

  // Download via Dropbox sharing API (works without files.content.read scope)
  let pdfBuffer;
  try {
    const { getDropboxAccessToken, dropboxDownloadSharedLink } = await import("./lib/dropboxClient.mjs");
    const token = await getDropboxAccessToken();
    const sharedUrl = rfq.quote_pdf_url || rfq.dropbox_pdf_url;
    console.log("[reextract] Downloading via Dropbox shared link");
    pdfBuffer = await dropboxDownloadSharedLink(token, sharedUrl);
    console.log("[reextract] Downloaded", pdfBuffer.length, "bytes");
  } catch (e) {
    return res.status(502).json({ ok: false, error: `Could not download PDF: ${e.message}` });
  }

  const pageCount = (pdfBuffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log("[reextract] PDF page count:", pageCount);
  if (pageCount > 100) {
    return res.status(422).json({ ok: false, error: `PDF has ${pageCount} pages — Claude's limit is 100. The quote total must be entered manually.`, pageCount });
  }

  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  if (!hasAnthropicKey) {
    return res.status(422).json({ ok: false, error: "ANTHROPIC_API_KEY not set on server — cannot extract." });
  }

  const extraction = await extractQuoteFromPdf(pdfBuffer, `rfq-${req.params.rfqId}`);
  if (!extraction) return res.status(422).json({ ok: false, error: "Extraction returned no data. Check server logs for details." });

  const exGst = extraction.total_ex_gst ? Number(extraction.total_ex_gst) : null;
  const incGst = extraction.total_inc_gst ? Number(extraction.total_inc_gst) : null;
  const quotedAmount = exGst && exGst > 0
    ? exGst
    : incGst && incGst > 0
      ? Math.round((incGst / 1.1) * 100) / 100
      : null;

  if (!quotedAmount || !Number.isFinite(quotedAmount) || quotedAmount <= 0) {
    return res.status(422).json({ ok: false, error: "Could not find a valid total in the PDF.", extraction });
  }

  // Store both ex and inc GST amounts back into the extraction for display
  if (!extraction.total_ex_gst && quotedAmount) extraction.total_ex_gst = quotedAmount;
  if (!extraction.total_inc_gst && quotedAmount) extraction.total_inc_gst = Math.round(quotedAmount * 1.1 * 100) / 100;

  await sb.from("rfqs").update({
    quoted_amount: quotedAmount,
    quote_extracted_at: new Date().toISOString(),
    quote_extraction: extraction
  }).eq("id", rfq.id);

  return res.json({ ok: true, quoted_amount: quotedAmount, total_inc_gst: extraction.total_inc_gst, extraction });
});

if (envBool(process.env.REMINDER_CRON_ENABLED, false)) {
  const dayMs = 24 * 60 * 60 * 1000;
  const tick = () => {
    const days = Number(process.env.REMINDER_DAYS_BEFORE) || 2;
    runDeadlineReminders({ daysBefore: days })
      .then((r) => console.log("[rfq-reminders]", r))
      .catch((e) => console.error("[rfq-reminders]", e));
  };
  setInterval(tick, dayMs);
  setTimeout(tick, 45_000);
  console.log("[blue-leaf-api] REMINDER_CRON_ENABLED: daily deadline reminders (~2 days before).");
}

if (envBool(process.env.IMAP_POLL_ENABLED, true)) {
  const pollMs = Math.max(60_000, Number(process.env.IMAP_POLL_INTERVAL_MS) || 15 * 60 * 1000);
  const tick = () => {
    pollImapForQuoteReplies()
      .then((r) => {
        if (!r?.skipped) console.log("[imap-quote-poll]", r);
      })
      .catch((e) => console.error("[imap-quote-poll]", e));
  };
  setInterval(tick, pollMs);
  setTimeout(tick, 20_000);
  console.log(`[blue-leaf-api] IMAP_POLL_ENABLED: polling inbox every ${Math.round(pollMs / 60000)} min.`);
}

// Serve built frontend in production (Railway). In local dev, Vite handles the frontend.
const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, "../dist");
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res) => res.sendFile(join(distPath, "index.html")));
}

app.listen(PORT, () => {
  console.log(`[blue-leaf-api] Listening on ${PORT}`);
});
