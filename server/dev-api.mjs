import "dotenv/config";
import cors from "cors";
import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { callAI } from "./lib/aiGateway.mjs";
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
import { driveConfigured, uploadCsvToSheet } from "./lib/googleDriveClient.mjs";
import { runDeadlineReminders } from "./lib/rfqReminders.mjs";
import { runGhostCheck } from "./lib/tradeCommitment.mjs";
import { runLeadTimeNotifications } from "./lib/scheduleReminders.mjs";
import { getServiceSupabase } from "./lib/supabaseService.mjs";
import { buildexactConfigured } from "./lib/buildexactClient.mjs";
import { sendReminderForRfqId } from "./lib/sendOneReminder.mjs";
import { handleBuildexactWebhook } from "./lib/buildexactWebhook.mjs";
import { registerModule4Routes } from "./lib/module4Routes.mjs";
import { registerModule5Routes } from "./lib/module5Routes.mjs";
import { registerModule6Routes } from "./lib/module6Routes.mjs";
import { registerInductionRoutes } from "./lib/inductionRoutes.mjs";
import { registerJobsApiRoutes } from "./lib/jobsApiRoutes.mjs";
import { registerBuildexactIntegrationRoutes } from "./lib/buildexactIntegrationRoutes.mjs";
import { resolveInboundRfqMatch, generateOutboundMessageId } from "./lib/imapQuoteMatch.mjs";
import { registerBlueprintRoutes } from "./lib/blueprintRoutes.mjs";
import { registerSalesRoutes } from "./lib/salesRoutes.mjs";
import { registerFinanceRoutes } from "./lib/financeRoutes.mjs";
import { registerFinanceCCRoutes } from "./lib/financeCCRoutes.mjs";
import { registerCompanyCostModelRoutes } from "./lib/companyCostModelRoutes.mjs";
// DEREGISTERED (Phase -1 cleanup): jobFinanceRoutes was fully shadowed by financeRoutes +
// financeCCRoutes (Express ignores param names, so its :id routes duplicated existing paths).
// Its only non-shadowed endpoint, PUT /wipaa/forecast, was unused by the app. See
// docs/agent_knowledge/IMPLEMENTATION_PLAN.md (Phase -1). File retained for reference.
// import { registerJobFinanceRoutes } from "./lib/jobFinanceRoutes.mjs";
import { registerPortalRoutes } from "./lib/portalRoutes.mjs";
import { registerPortalV2Routes } from "./lib/portalV2Routes.mjs";
import { registerPortalV2AdminRoutes } from "./lib/portalV2AdminRoutes.mjs";
import { runPortalNightlySync } from "./lib/portalSync.mjs";
import { registerAuthRoutes } from "./lib/authRoutes.mjs";
import { registerSupervisorRoutes } from "./lib/supervisorRoutes.mjs";
import { registerRfqPackageRoutes } from "./lib/rfqPackageRoutes.mjs";
import { registerRfqTradeRoutes } from "./lib/rfqTradeRoutes.mjs";
import { registerCostIntelligenceRoutes } from "./lib/costIntelligenceRoutes.mjs";
import { registerMarketingRoutes } from "./lib/marketingRoutes.mjs";
import { registerAdminRoutes } from "./lib/adminRoutes.mjs";
import { registerWorkforceRoutes } from "./lib/workforceRoutes.mjs";
import { registerMarketingIntelligenceRoutes } from "./lib/marketingIntelligenceRoutes.mjs";
import { registerCrmRoutes } from "./lib/crmRoutes.mjs";
import { registerWhsEngineRoutes } from "./lib/whs/whsEngineRoutes.mjs";
import { registerCarpentryRoutes } from "./lib/carpentryRoutes.mjs";
import { registerProcurementRoutes } from "./lib/procurementRoutes.mjs";
import { registerFactsRoutes } from "./lib/factsRoutes.mjs";
import { registerControlTowerRoutes } from "./lib/controlTower/controlTowerRoutes.mjs";
import { upsertJobKnowledge } from "./lib/jobResolver.mjs";
import { processExtraction } from "./lib/rfqScopePipeline.mjs";
import { requireAuth, requireRole } from "./lib/requireAuth.mjs";
import { captureResendId } from "./lib/rfqEngagement.mjs";
import dns from "node:dns";

console.log("[blue-leaf-api] booting…");

/** Railway/cloud pass PORT; local dev uses PORT_API or 8787. */
const PORT = Number(process.env.PORT ?? process.env.PORT_API ?? 8787);
const MODEL       = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";
const MODEL_FAST  = "claude-haiku-4-5-20251001"; // simple structured extractions

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
    const completion = await callAI(client, {
      model: MODEL_FAST, // simple structured extraction — haiku is sufficient
      max_tokens: 1024,
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 }, citations: { enabled: false } },
          { type: "text", text: 'You are extracting the total price from an Australian subcontractor quote PDF.\n\nReturn ONLY valid JSON, no markdown, no explanation:\n{"trade":"string","company":"string","total_ex_gst":number,"total_inc_gst":number,"gst":number,"items":[{"description":"string","amount":number}]}\n\nRules for totals:\n- Look for a summary/totals section near the bottom of the document.\n- total_inc_gst: the grand total INCLUDING GST (labelled "Total", "Total inc GST", "Amount due", "Grand Total" etc.).\n- gst: the GST amount (labelled "GST" or "Tax").\n- total_ex_gst: the subtotal BEFORE GST (labelled "Subtotal", "Ex GST", "Net"). If not shown explicitly, calculate: total_inc_gst / 1.1.\n- All values are numbers only — no $ signs, no commas.\n- Use null for any field genuinely not found.' }
        ]
      }]
    }, { module: "devApi" });
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

// Strip quoted reply history from an inbound plain-text email so the correspondence
// log shows only what the sender typed THIS time. Cuts at the first common "quoted
// original" marker (Gmail/Apple "On … wrote:", Outlook "-----Original Message-----" /
// "From:"-header block / "____" divider, forwarded-message banner) and any trailing
// run of ">"-quoted lines. Falls back to the original if the whole message was quotes.
export function stripQuotedReply(text) {
  const src = String(text || "");
  if (!src.trim()) return src;
  const lines = src.split(/\r?\n/);
  const markers = [
    /^On .+ wrote:\s*$/i, // Gmail / Apple Mail attribution line
    /^-{2,}\s*Original Message\s*-{2,}/i, // Outlook classic
    /^_{5,}\s*$/, // Outlook horizontal divider
    /^Begin forwarded message:/i,
    /^>{1,}\s?/ // a quoted ">" line
  ];
  let cut = -1;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (!ln) continue;
    // "From:" alone is too eager mid-body — only treat it as the start of a quoted
    // Outlook header block when a Sent:/To:/Date:/Subject: line follows within 3 lines.
    if (/^From:\s*.+/i.test(ln)) {
      const look = lines.slice(i + 1, i + 4).join("\n");
      if (/^\s*(Sent|To|Date|Subject):/im.test(look)) { cut = i; break; }
      continue;
    }
    if (markers.some((re) => re.test(ln))) { cut = i; break; }
  }
  let kept = cut >= 0 ? lines.slice(0, cut) : lines;
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  const out = kept.join("\n").trim();
  return out || src.trim();
}

async function processIncomingQuoteMessage(sb, msg, rfqRows) {
  const sourceBuf = await readSourceToBuffer(msg.source);
  const parsed = await simpleParser(sourceBuf);
  const fromEmail = maybeFirstAddress(parsed);
  const subject = String(parsed?.subject || msg?.envelope?.subject || "").trim();
  const textBody = String(parsed?.text || "").trim();
  // Store only the freshly-typed reply in correspondence — drop the quoted thread history.
  const bodyForLog = stripQuotedReply(
    textBody || String(parsed?.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  );
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
  // Site & civil
  "site_establishment",
  "excavation",
  "demolition",
  "termite_protection",
  // Structure
  "concrete_footings",
  "footings_concrete_formwork", // legacy alias — kept for backwards compat
  "structural_steel",
  "carpentry",
  // Envelope
  "external_cladding",
  "windows_skylights",
  "roof_plumber",
  "metal_roofing", // legacy alias — kept for backwards compat
  "masonry",
  "glazing",
  // Mechanical / electrical
  "electrical_data",
  "electrical", // legacy alias
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

function emptyTradeBlock() {
  return { scope_summary: "", specific_items: [], missing_info: "" };
}

function normalizeTradeBlock(v) {
  if (v == null) return emptyTradeBlock();
  if (typeof v === "string") {
    return { scope_summary: v.trim(), specific_items: [], missing_info: "", scope_of_works: [] };
  }
  if (typeof v === "object") {
    const arr = (k) =>
      Array.isArray(v[k]) ? v[k].map((x) => String(x).trim()).filter(Boolean) : [];
    const scope_of_works = arr("scope_of_works");
    const scope_summary =
      String(v.scope_summary ?? "").trim() ||
      scope_of_works.join("\n");
    return {
      project_information: arr("project_information"),
      scope_of_works: scope_of_works.length ? scope_of_works : [],
      confirm_items: arr("confirm_items"),
      assumptions: arr("assumptions"),
      tender_requirements: arr("tender_requirements"),
      submission_requirements: arr("submission_requirements"),
      standards: arr("standards").slice(0, 1),
      missing_items: arr("missing_items"),
      scope_summary,
      specific_items: Array.isArray(v.specific_items)
        ? v.specific_items.map((x) => String(x).trim()).filter(Boolean)
        : scope_of_works,
      missing_info:
        v.missing_info == null
          ? arr("missing_items").join("; ")
          : String(v.missing_info).trim()
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
  // Merge legacy aliases so both old and new keys are populated
  if (!trade_notes.footings_concrete_formwork?.scope_of_works?.length && trade_notes.concrete_footings?.scope_of_works?.length) {
    trade_notes.footings_concrete_formwork = trade_notes.concrete_footings;
  }
  if (!trade_notes.metal_roofing?.scope_of_works?.length && trade_notes.roof_plumber?.scope_of_works?.length) {
    trade_notes.metal_roofing = trade_notes.roof_plumber;
  }
  if (!trade_notes.electrical?.scope_of_works?.length && trade_notes.electrical_data?.scope_of_works?.length) {
    trade_notes.electrical = trade_notes.electrical_data;
  }

  const numOrNull = (v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const project_context = {
    project_information: [],
    assumptions_site_conditions: []
  };
  const pc = parsed?.project_context;
  if (pc && typeof pc === "object") {
    if (Array.isArray(pc.project_information)) {
      project_context.project_information = pc.project_information.map(String).filter(Boolean);
    }
    if (Array.isArray(pc.assumptions_site_conditions)) {
      project_context.assumptions_site_conditions = pc.assumptions_site_conditions
        .map(String)
        .filter(Boolean);
    }
  }

  const base = {
    project_address: String(parsed?.project_address ?? parsed?.address ?? "").trim(),
    project_type: String(parsed?.project_type ?? "unknown").trim() || "unknown",
    storeys: String(parsed?.storeys ?? "").trim(),
    floor_area_m2: numOrNull(parsed?.floor_area_m2),
    site_area_m2: numOrNull(parsed?.site_area_m2),
    building_specs,
    project_context,
    trade_notes,
    coverage_gaps: Array.isArray(parsed?.coverage_gaps)
      ? parsed.coverage_gaps.map(String)
      : [],
    key_project_notes: String(parsed?.key_project_notes ?? "").trim(),
    client_name: String(parsed?.client_name ?? "").trim(),
    architect_name: String(parsed?.architect_name ?? "").trim()
  };

  return processExtraction(base, EXTRACTION_TRADE_KEYS);
}

const TRADE_NOTE_SHAPE = `{
      "project_information": [],
      "scope_of_works": [],
      "confirm_items": [],
      "assumptions": [],
      "tender_requirements": [],
      "submission_requirements": [],
      "standards": [],
      "missing_items": []
    }`;

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
  "project_context": {
    "project_information": [],
    "assumptions_site_conditions": []
  },
  "trade_notes": {
    "site_establishment": ${TRADE_NOTE_SHAPE},
    "excavation": ${TRADE_NOTE_SHAPE},
    "demolition": ${TRADE_NOTE_SHAPE},
    "termite_protection": ${TRADE_NOTE_SHAPE},
    "concrete_footings": ${TRADE_NOTE_SHAPE},
    "structural_steel": ${TRADE_NOTE_SHAPE},
    "carpentry": ${TRADE_NOTE_SHAPE},
    "external_cladding": ${TRADE_NOTE_SHAPE},
    "windows_skylights": ${TRADE_NOTE_SHAPE},
    "roof_plumber": ${TRADE_NOTE_SHAPE},
    "masonry": ${TRADE_NOTE_SHAPE},
    "glazing": ${TRADE_NOTE_SHAPE},
    "electrical_data": ${TRADE_NOTE_SHAPE},
    "lighting_automation": ${TRADE_NOTE_SHAPE},
    "plumbing": ${TRADE_NOTE_SHAPE},
    "sanitary_ware": ${TRADE_NOTE_SHAPE},
    "heating_cooling": ${TRADE_NOTE_SHAPE},
    "solar_batteries": ${TRADE_NOTE_SHAPE},
    "insulation": ${TRADE_NOTE_SHAPE},
    "internal_linings": ${TRADE_NOTE_SHAPE},
    "plastering_rendering": ${TRADE_NOTE_SHAPE},
    "painting": ${TRADE_NOTE_SHAPE},
    "stairs": ${TRADE_NOTE_SHAPE},
    "joinery": ${TRADE_NOTE_SHAPE},
    "tiling": ${TRADE_NOTE_SHAPE},
    "flooring": ${TRADE_NOTE_SHAPE},
    "window_furnishings": ${TRADE_NOTE_SHAPE},
    "garage_door": ${TRADE_NOTE_SHAPE},
    "appliances": ${TRADE_NOTE_SHAPE},
    "door_hardware": ${TRADE_NOTE_SHAPE},
    "fixtures_fittings": ${TRADE_NOTE_SHAPE},
    "landscaping": ${TRADE_NOTE_SHAPE},
    "paving": ${TRADE_NOTE_SHAPE},
    "fencing": ${TRADE_NOTE_SHAPE},
    "pool_works": ${TRADE_NOTE_SHAPE},
    "site_cleaner": ${TRADE_NOTE_SHAPE}
  },
  "coverage_gaps": [],
  "key_project_notes": ""
}

Output rules:
- building_specs: one short factual line per field from docs; empty string if absent.
- project_context.assumptions_site_conditions: site-wide context ONLY (demolition status, slope, access, retaining, benchmarks, geotech ref, neighbour constraints, existing services, working hours). Never put pricing actions here.
- trade_notes: TRADE-SPECIFIC only. Each trade gets pricing lines that trade would quote.
- scope_of_works: max 8 concise action lines per trade. One idea per line. Price instructions only (e.g. "Excavate slab and setdown to structural drawings"). No duplicates.
- confirm_items: project-specific items that could easily be missed or assumed excluded — phrase as confirmations the subcontractor should explicitly include in their quote (e.g. "Off-form concrete retaining walls to drawings", "Raked ceiling framing to architect's details"). Max 4 per trade.
- assumptions: trade-specific site/condition notes for that subcontractor only. Not duplicated in scope_of_works.
- standards: at most ONE applicable Australian standard per trade (e.g. "AS 3660.1 — Termite management"). Do NOT repeat in scope_of_works.
- tender_requirements / submission_requirements: short bullet lists (lump sum ex GST, exclusions in writing) — only if doc-backed or standard practice.
- missing_items: only critical gaps preventing a quote for THAT trade. Do not invent. Empty [] if none.
- Leave ALL arrays [] if that trade is not evidenced in the PDFs. Do not invent scope.
- coverage_gaps: ONLY cross-references in the document text to missing attachments (max 5). No speculation.
- key_project_notes: max 2 short sentences from docs only.
- Only document-backed facts; else "", [], or null.

Trade-specific notes to guide extraction:
- carpentry: Watch for raked/vaulted ceilings, LVL specifications, exposed beams, complex roof geometry.
- concrete_footings: Note if off-form concrete retaining walls, coloured slab, polished concrete, or suspended slab is specified.
- excavation: Flag rock excavation risk if geotech report referenced. Note slope and site fall.
- masonry: Distinguish face brick (external) vs feature internal masonry vs blockwork. Note brick tie requirements.
- electrical_data: Separate rough-in from fit-off if possible. Note if EV charger, data points, security specified.
- plumbing: Note hot water system type, gas lines, stormwater. Confirm if sanitary ware is separate trade.
- joinery: Note kitchen, laundry, wardrobes, vanities. Confirm if stone benchtops are included or separate supply.
- glazing: Note frameless shower screens, glass balustrades, feature glazing — distinguish from windows_skylights (frame + glass packages).
- heating_cooling: Note ducted vs split system, number of zones or heads specified.
- roof_plumber: Note custom box gutters, internal gutters, parapet flashings, skylights.
- insulation: Note wall, ceiling, and underfloor requirements. Note BAL rating impact if specified.`;

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
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
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
app.use(express.json({
  limit: JSON_BODY_LIMIT,
  // Capture the raw request bytes so signed-webhook handlers (e.g. /api/webhooks/resend) can verify
  // an HMAC/Svix signature over the EXACT payload. Cheap (one Buffer ref per request) and only read
  // by those handlers; everything else uses the parsed req.body as before.
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));
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
registerBuildexactIntegrationRoutes(app);
registerModule6Routes(app);
registerBlueprintRoutes(app);
registerInductionRoutes(app);
registerJobsApiRoutes(app);
registerSalesRoutes(app);
registerFinanceRoutes(app);
registerFinanceCCRoutes(app);
registerCompanyCostModelRoutes(app);
// registerJobFinanceRoutes(app);  // DEREGISTERED (Phase -1) — fully shadowed; see import note above
// v2 BEFORE legacy: /api/portal/my-projects and /api/portal/app/* must win over
// the legacy /api/portal/:token catch-all (which would treat "my-projects" as a token).
registerPortalV2Routes(app);
registerPortalRoutes(app);
registerPortalV2AdminRoutes(app);
registerAuthRoutes(app);
registerSupervisorRoutes(app);
registerRfqPackageRoutes(app);
registerRfqTradeRoutes(app);
registerCostIntelligenceRoutes(app);
registerMarketingRoutes(app);
registerAdminRoutes(app);
registerWorkforceRoutes(app);
registerMarketingIntelligenceRoutes(app);
registerCrmRoutes(app);
registerWhsEngineRoutes(app);
registerCarpentryRoutes(app);
registerProcurementRoutes(app);
registerFactsRoutes(app);
registerControlTowerRoutes(app);

app.get("/api/health",(_req, res) => {
  res.json({ ok: true, model: MODEL, time: new Date().toISOString() });
});

app.get("/api/health/ffmpeg", async (_req, res) => {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execP = promisify(exec);
  for (const bin of ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "ffmpeg"]) {
    try {
      const { stdout } = await execP(`"${bin}" -version`);
      const versionLine = stdout.split("\n")[0] || stdout.trim();
      return res.json({ ok: true, bin, version: versionLine });
    } catch { /* try next */ }
  }
  // Fallback: @ffmpeg-installer/ffmpeg bundled binary
  try {
    const { path: ffmpegPath } = await import("@ffmpeg-installer/ffmpeg");
    const { stdout } = await execP(`"${ffmpegPath}" -version`);
    const versionLine = stdout.split("\n")[0] || stdout.trim();
    return res.json({ ok: true, bin: ffmpegPath, version: versionLine, source: "npm" });
  } catch { /* not available */ }
  return res.status(503).json({ ok: false, error: "ffmpeg not found on PATH" });
});

app.post("/api/subcontractors/csv-template-sheet", async (req, res) => {
  if (!driveConfigured()) {
    return res.status(503).json({ ok: false, error: "Google Drive not configured." });
  }
  try {
    const csv = String(req.body?.csv || "").trim();
    if (!csv) return res.status(400).json({ ok: false, error: "csv required." });
    const stamp = new Date().toISOString().slice(0, 10);
    const sheet = await uploadCsvToSheet(`Blue Leaf subcontractors import template ${stamp}.csv`, csv);
    return res.json({ ok: true, ...sheet });
  } catch (err) {
    console.error("[subcontractors/csv-template-sheet]", err);
    return res.status(502).json({ ok: false, error: err?.message || "Could not create Google Sheet template." });
  }
});

// ── Subcontractor email MX-validation guard (Feature 2) ───────────────────────
// MX-check the email's domain so staff get a WARNING (never a block) when a domain can't receive
// mail. Result is persisted on subcontractors.email_mx_valid so a red badge can show in the list +
// RFQ recipient picker. (5 of 26 trades on a live RFQ had dead/suppressed addresses.)
//
// Semantics of the returned value:
//   true  — domain has MX (or A/AAAA fallback) records → mailable.
//   false — domain resolves but has NO mail records, OR the domain plainly doesn't exist (ENOTFOUND
//           / ENODATA) → almost certainly undeliverable. WARN, do not block.
//   null  — "not checked": a transient DNS error / timeout, or unparseable input. Treated as unknown
//           so a DNS hiccup never marks a good address bad and never blocks a save.

function emailDomainOf(email) {
  const e = String(email || "").trim().toLowerCase();
  // Require exactly one '@' and a plausible domain (a dotted label, no spaces).
  const parts = e.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || !domain) return null;
  if (/\s/.test(domain)) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  return domain;
}

/**
 * MX-check a single email's domain with a hard 3s timeout. Returns true | false | null (see above).
 * Never throws — a DNS error or timeout resolves to null ("not checked"), never to a block.
 */
async function checkEmailMx(email) {
  const domain = emailDomainOf(email);
  if (!domain) return null; // unparseable → unknown, not "invalid"

  const TIMEOUT_MS = 3000;
  const resolveMx = () =>
    new Promise((resolve) => {
      let settled = false;
      const t = setTimeout(() => {
        if (!settled) { settled = true; resolve({ valid: null }); } // timeout → unknown
      }, TIMEOUT_MS);
      dns.resolveMx(domain, (errMx, addresses) => {
        if (settled) return;
        if (!errMx && Array.isArray(addresses) && addresses.length > 0) {
          settled = true; clearTimeout(t); resolve({ valid: true });
          return;
        }
        // No MX: some valid domains accept mail on their A record (implicit MX). ENOTFOUND/ENODATA
        // mean the domain has no DNS at all → undeliverable. Other errors → unknown.
        const noSuchDomain = errMx && (errMx.code === "ENOTFOUND" || errMx.code === "ENODATA");
        dns.resolve(domain, (errA, aRecs) => {
          if (settled) return;
          settled = true; clearTimeout(t);
          if (!errA && Array.isArray(aRecs) && aRecs.length > 0) { resolve({ valid: true }); return; }
          if (noSuchDomain || (errA && (errA.code === "ENOTFOUND" || errA.code === "ENODATA"))) {
            resolve({ valid: false }); // domain has no mail/A records → undeliverable
            return;
          }
          resolve({ valid: null }); // transient → unknown
        });
      });
    });

  try {
    const { valid } = await resolveMx();
    return valid;
  } catch {
    return null; // never block on a DNS error
  }
}

// Validate + persist MX result for ONE subcontractor. Called by the frontend after a create/edit
// save (the save itself stays client-side via Supabase RLS). requireAuth-gated.
// Only re-checks when the email actually changed (the client passes the saved email).
app.post("/api/subcontractors/:id/mx-check", requireAuth, async (req, res) => {
  try {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Database not configured." });
    const id = String(req.params.id || "").trim();
    const email = String(req.body?.email || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "Subcontractor id required." });
    if (!email) return res.status(400).json({ ok: false, error: "email required." });

    // Skip the DNS round-trip if the stored email already matches and was checked — unless forced.
    const force = req.body?.force === true;
    const { data: existing } = await sb
      .from("subcontractors")
      .select("email, email_mx_valid, email_mx_checked_at")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return res.status(404).json({ ok: false, error: "Subcontractor not found." });

    if (!force && existing.email === email && existing.email_mx_checked_at) {
      return res.json({ ok: true, emailMxValid: existing.email_mx_valid, checkedAt: existing.email_mx_checked_at, skipped: true });
    }

    const valid = await checkEmailMx(email);
    const checkedAt = new Date().toISOString();
    const { error: upErr } = await sb
      .from("subcontractors")
      .update({ email_mx_valid: valid, email_mx_checked_at: checkedAt })
      .eq("id", id);
    if (upErr) return res.status(500).json({ ok: false, error: "Could not save MX result." });

    return res.json({ ok: true, emailMxValid: valid, checkedAt });
  } catch (e) {
    console.error("[subcontractors/mx-check]", e);
    return res.status(500).json({ ok: false, error: e?.message || "MX check failed." });
  }
});

// Admin backfill: re-MX-check every subcontractor sequentially (each with its own 3s timeout).
// requireAuth + admin role. Sequential so a large directory never opens hundreds of DNS sockets.
app.post("/api/subcontractors/mx-recheck-all", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "Database not configured." });
    const { data: subs, error } = await sb
      .from("subcontractors")
      .select("id, email")
      .not("email", "is", null);
    if (error) return res.status(500).json({ ok: false, error: "Could not load subcontractors." });

    let checked = 0, invalid = 0, unknown = 0;
    for (const sub of subs || []) {
      const email = String(sub.email || "").trim();
      if (!email) continue;
      const valid = await checkEmailMx(email); // sequential, per-row 3s timeout
      await sb
        .from("subcontractors")
        .update({ email_mx_valid: valid, email_mx_checked_at: new Date().toISOString() })
        .eq("id", sub.id);
      checked += 1;
      if (valid === false) invalid += 1;
      else if (valid === null) unknown += 1;
    }
    return res.json({ ok: true, checked, invalid, unknown });
  } catch (e) {
    console.error("[subcontractors/mx-recheck-all]", e);
    return res.status(500).json({ ok: false, error: e?.message || "Recheck failed." });
  }
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
    const completion = await callAI(client, {
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
    }, { module: "devApi" });

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
        completion = await callAI(
          client,
          {
            model: MODEL,
            max_tokens: 16000,
            temperature: 0.2,
            messages: [{ role: "user", content: userContent }]
          },
          { module: "devApi" },
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

  // Google OAuth (shared creds used by Drive, GSC, GA4, GBP)
  const googleConfigured = !!(
    process.env.GOOGLE_DRIVE_CLIENT_ID &&
    process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN
  );

  // Google Marketing Intelligence — additional env vars on top of base Google OAuth
  const gscConfigured    = googleConfigured && !!process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL;
  const ga4Configured    = googleConfigured && !!process.env.GA4_PROPERTY_ID;
  const gbpConfigured    = googleConfigured && !!process.env.GBP_LOCATION_ID;

  // Meta (Instagram + Facebook)
  const metaConfigured   = !!process.env.META_ACCESS_TOKEN;
  const metaIgUserId     = process.env.META_IG_USER_ID?.trim() || null;
  const metaPageId       = process.env.META_PAGE_ID?.trim()    || null;

  // Resend (mailing list / CRM email)
  const resendConfigured = !!process.env.RESEND_API_KEY;

  res.json({
    ok: true,
    gmail:    { configured: gmail, sender: process.env.GMAIL_SENDER_EMAIL?.trim() || null },
    smtp:     { configured: smtp },
    dropbox:  { configured: dropbox },
    buildexact: { configured: buildexactConfigured() },
    mail:     { ready: gmail || smtp, transport: mailTransportName() },
    google:   {
      oauthConfigured: googleConfigured,
      drive:         googleConfigured,
      gsc:           gscConfigured,
      ga4:           ga4Configured,
      gbp:           gbpConfigured,
      siteUrl:       process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim() || null,
      ga4PropertyId: process.env.GA4_PROPERTY_ID?.trim()                || null,
      gbpLocationId: process.env.GBP_LOCATION_ID?.trim()                || null,
    },
    meta:   { configured: metaConfigured, igUserId: metaIgUserId, pageId: metaPageId },
    resend: { configured: resendConfigured },
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

app.post("/api/cron/lead-time-notifications", async (req, res) => {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });
  try {
    const simulateDate = req.body?.simulateDate?.trim?.() || undefined;
    const result = await runLeadTimeNotifications(sb, { simulateDate });
    return res.json(result);
  } catch (err) {
    console.error("[cron/lead-time-notifications]", err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// ── CI-3.2: Nightly AI insights batch ────────────────────────────────────────
// Client Portal v2 nightly sync: schedule→milestones + selections overdue.
// Secured by an optional shared secret: when CRON_SECRET is set, callers must
// present it (x-cron-secret header or ?secret=). Mutates every project, so this
// must not be open once a secret is configured at cron-job.org.
app.post("/api/cron/portal-sync", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers["x-cron-secret"] || req.query?.secret;
    if (provided !== secret) return res.status(403).json({ ok: false, error: "Forbidden" });
  }
  try {
    const result = await runPortalNightlySync();
    return res.json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "portal-sync failed" });
  }
});

app.post("/api/cron/cost-insights", async (_req, res) => {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return res.status(503).json({ ok: false, error: "ANTHROPIC_API_KEY not set" });

  try {
    // 1. Fetch all active jobs
    const { data: activeJobs, error: jobsErr } = await sb.from("jobs")
      .select("id, address, status")
      .not("status", "in", '("practical_completion","archived","cancelled")');

    if (jobsErr) throw new Error(jobsErr.message);
    if (!activeJobs || activeJobs.length === 0) {
      return res.json({ ok: true, jobs_processed: 0, insights_upserted: 0 });
    }

    const BATCH_SIZE = 5;
    const INSIGHT_EXPIRES_DAYS = 30;
    const SKIP_IF_RECENT_DAYS = 7;
    const now = new Date();
    const recentCutoff = new Date(now.getTime() - SKIP_IF_RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const expiresAt = new Date(now.getTime() + INSIGHT_EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString();

    let totalInsightsUpserted = 0;
    let jobsProcessed = 0;

    // Process jobs in batches of up to 5
    for (let batchStart = 0; batchStart < activeJobs.length; batchStart += BATCH_SIZE) {
      const batch = activeJobs.slice(batchStart, batchStart + BATCH_SIZE);

      // Filter out jobs that already have a recent un-expired insight (within last 7 days)
      const { data: recentInsights } = await sb.from("cost_intelligence_insights")
        .select("job_id")
        .in("job_id", batch.map(j => j.id))
        .gte("generated_at", recentCutoff)
        .eq("is_dismissed", false);

      const recentJobIds = new Set((recentInsights || []).map(r => r.job_id));
      const jobsToProcess = batch.filter(j => !recentJobIds.has(j.id));
      if (jobsToProcess.length === 0) continue;

      // Fetch data for each job in this batch
      const jobPayloads = [];
      for (const job of jobsToProcess) {
        const [budgetsRes, costsRes, metricsRes] = await Promise.all([
          sb.from("job_budgets")
            .select("trade_category_id, budget_amount, trade_categories(name)")
            .eq("job_id", job.id),
          sb.from("normalized_costs")
            .select("trade_category_id, actual_amount, quoted_amount, budget_amount, variation_amount, final_amount, trade_categories(name)")
            .eq("job_id", job.id),
          sb.from("project_metrics")
            .select("floor_area_m2, project_type, storeys")
            .eq("job_id", job.id)
            .maybeSingle(),
        ]);

        // Compute budget vs actual per trade
        const budgetMap = new Map((budgetsRes.data || []).map(b => [
          b.trade_category_id,
          { name: b.trade_categories?.name || b.trade_category_id, budget: Number(b.budget_amount || 0) }
        ]));
        const tradeVariances = [];
        for (const nc of (costsRes.data || [])) {
          const actual = Number(nc.final_amount || nc.actual_amount || 0);
          const budget = budgetMap.get(nc.trade_category_id)?.budget || Number(nc.budget_amount || 0);
          if (actual > 0 || budget > 0) {
            const variancePct = budget > 0 ? ((actual - budget) / budget) * 100 : null;
            tradeVariances.push({
              trade: nc.trade_categories?.name || nc.trade_category_id,
              budget: Math.round(budget),
              actual: Math.round(actual),
              quoted: Math.round(Number(nc.quoted_amount || 0)),
              variation: Math.round(Number(nc.variation_amount || 0)),
              variance_pct: variancePct != null ? Math.round(variancePct * 10) / 10 : null,
            });
          }
        }

        jobPayloads.push({
          job_id: job.id,
          address: job.address,
          status: job.status,
          floor_area_m2: metricsRes.data?.floor_area_m2 || null,
          project_type: metricsRes.data?.project_type || null,
          trade_variances: tradeVariances,
        });
      }

      if (jobPayloads.length === 0) continue;

      // Call Claude Haiku once for this batch
      const prompt = `You are a financial analyst for Blue Leaf Building (custom home builder). Analyse these active construction jobs and generate concise financial insights. For each job that has a notable issue, return a JSON array of insight objects: [{job_id, insight_type, severity, title, body}]. Focus on: budget overruns >10%, trades tracking significantly above/below historical norms, underclaim patterns (cost_to_date >> progress_billed). Maximum 2 insights per job. Only flag real issues — don't generate insights for healthy jobs. Return empty array if no issues.\n\nJobs data:\n${JSON.stringify(jobPayloads, null, 2)}\n\nValid insight_type values: "budget_risk", "trend", "similarity", "overrun_pattern", "benchmark", "underclaim"\nValid severity values: "info", "warning", "alert"\nReturn ONLY a valid JSON array, no other text.`;

      let batchInsights = [];
      try {
        const client = new Anthropic({ apiKey, maxRetries: 1 });
        const resp = await callAI(client, {
          model: process.env.CLAUDE_MODEL || "claude-haiku-4-5",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }, { module: "cronCostInsights" });

        const raw = resp.content.find(b => b.type === "text")?.text?.trim() || "[]";
        const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) batchInsights = parsed;
      } catch (aiErr) {
        console.warn("[cron/cost-insights] AI call failed:", aiErr.message);
        // Continue — skip AI for this batch rather than failing the whole run
      }

      // Upsert each insight
      for (const insight of batchInsights) {
        const { job_id, insight_type, severity, title, body } = insight;
        if (!job_id || !insight_type || !severity || !title || !body) continue;

        // Validate values
        const validTypes = ["budget_risk", "trend", "similarity", "overrun_pattern", "benchmark", "underclaim"];
        const validSeverities = ["info", "warning", "alert"];
        if (!validTypes.includes(insight_type) || !validSeverities.includes(severity)) continue;

        const generatedAt = now.toISOString();
        const { error: upsertErr } = await sb.from("cost_intelligence_insights").insert({
          job_id,
          trade_category_id: insight.trade_category_id || null,
          insight_type,
          severity,
          title: String(title).slice(0, 120),
          body: String(body).slice(0, 500),
          trigger_type: "nightly_batch",
          generated_at: generatedAt,
          expires_at: expiresAt,
        });

        if (upsertErr) {
          // Unique constraint = already exists, not a real error
          if (!upsertErr.message?.includes("unique")) {
            console.warn("[cron/cost-insights] insert error:", upsertErr.message);
          }
        } else {
          totalInsightsUpserted++;
        }
      }

      jobsProcessed += jobsToProcess.length;
    }

    return res.json({ ok: true, jobs_processed: jobsProcessed, insights_upserted: totalInsightsUpserted });
  } catch (err) {
    console.error("[cron/cost-insights]", err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

// ── WIPAA first-Friday scheduler ──────────────────────────────────────────────
function isFirstFriday(date = new Date()) {
  // Must be a Friday (getDay() === 5) and day of month <= 7
  return date.getDay() === 5 && date.getDate() <= 7;
}

app.post("/api/cron/wipaa-review-tasks", async (_req, res) => {
  const sb = getServiceSupabase();
  if (!sb) return res.status(503).json({ ok: false, error: "DB not configured" });

  try {
    const today = new Date();

    if (!isFirstFriday(today)) {
      return res.json({ ok: true, skipped: true, reason: "not first Friday" });
    }

    // Start of current month (UTC midnight)
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

    // Fetch all active jobs
    const { data: activeJobs, error: jobsErr } = await sb.from("jobs")
      .select("id, address, status")
      .not("status", "in", '("archived","cancelled")');

    if (jobsErr) throw new Error(jobsErr.message);
    if (!activeJobs || activeJobs.length === 0) {
      return res.json({ ok: true, jobs_needing_review: [] });
    }

    // Check for existing wipaa_reviews this month for each job
    const { data: existingReviews } = await sb.from("wipaa_reviews")
      .select("job_id")
      .in("job_id", activeJobs.map(j => j.id))
      .gte("review_date", startOfMonth);

    const reviewedJobIds = new Set((existingReviews || []).map(r => r.job_id));
    const jobsNeedingReview = activeJobs
      .filter(j => !reviewedJobIds.has(j.id))
      .map(j => ({ job_id: j.id, job_address: j.address, status: j.status }));

    console.log(`[cron/wipaa-review-tasks] First Friday of month. Jobs needing WIPAA review: ${jobsNeedingReview.length}`);

    return res.json({ ok: true, jobs_needing_review: jobsNeedingReview });
  } catch (err) {
    console.error("[cron/wipaa-review-tasks]", err);
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
    // force:true lets an INTENTIONAL re-send/follow-up (a Query, or re-sending after fixing a bounced
    // address) bypass the "already sent" idempotency guard below. Initial sends omit it, so accidental
    // double-sends are still prevented.
    const forceResend = req.body?.force === true;
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

    // Deduplicate by (to, subject, rfqId) — prevents double-inserts when the same
    // rfq appears twice in the package (e.g. duplicate trade rows).
    const seen = new Set();
    const dedupedMsgs = msgs.filter((m) => {
      const key = `${String(m?.to || "").trim()}|${String(m?.subject || "").trim()}|${String(m?.rfqId || "")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (const m of dedupedMsgs) {
      const to = m?.to?.trim();
      const subject = m?.subject?.trim();
      const body = m?.body;
      const html = m?.html;
      // Optional PDF attachments (e.g. architectural plans, for subbies who don't use Dropbox).
      // Client sends base64; decode to Buffers and cap total ~22MB to stay under provider limits.
      let attachments;
      if (Array.isArray(m?.attachments) && m.attachments.length) {
        let totalBytes = 0;
        attachments = m.attachments
          .map((a) => {
            const buf = Buffer.from(String(a?.contentBase64 || ""), "base64");
            totalBytes += buf.length;
            return { filename: a?.filename || "document.pdf", content: buf, mimeType: a?.mimeType || "application/pdf" };
          })
          .filter((a) => a.content.length > 0);
        if (totalBytes > 22 * 1024 * 1024) {
          return res.status(413).json({
            ok: false, mail_ready: true, transport,
            error: `Attachments too large (${(totalBytes / 1048576).toFixed(1)} MB) — keep under 22 MB or rely on the Dropbox link.`,
            results
          });
        }
      }
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

      // Idempotency guard — never re-email a subcontractor who already has a SENT rfq for this
      // job. Prevents double-sends when the user retries a send after a partial failure.
      const jobIdM = String(m?.jobId || "").trim();
      const subIdM = String(m?.subcontractor_id || "").trim();
      if (!forceResend && sb && jobIdM && subIdM) {
        try {
          const { data: prior } = await sb
            .from("rfqs")
            .select("id")
            .eq("job_id", jobIdM)
            .eq("subcontractor_id", subIdM)
            .eq("status", "sent")
            .limit(1);
          if (prior && prior.length) {
            results.push({ ok: true, to, skipped: true });
            continue;
          }
        } catch (idemErr) {
          console.warn("[rfq-send] idempotency check", idemErr?.message || idemErr);
        }
      }

      try {
        const msgId = generateOutboundMessageId();
        const headers = { "Message-ID": msgId };
        // Capture the Resend message id (null for gmail/smtp) so the Resend webhook can attribute
        // delivery/open/click/bounce events to this RFQ (rfqs.resend_email_id).
        const { resendId } = await sendPlainMail({
          to,
          subject,
          text: body,
          html: typeof html === "string" && html.trim() ? html.trim() : undefined,
          headers,
          attachments
        });
        let jobId = String(m.jobId || "").trim();
        const rfqId = String(m.rfqId || "").trim();
        const subId = String(m.subcontractor_id || "").trim();
        if (sb && rfqId) {
          const { data: rRow } = await sb.from("rfqs").select("job_id, subcontractor_id").eq("id", rfqId).maybeSingle();
          if (rRow?.job_id && !jobId) jobId = rRow.job_id;
          const scId = subId || (rRow?.subcontractor_id ? String(rRow.subcontractor_id) : "");
          // Status update uses ONLY pre-102 columns so it ALWAYS persists, even before migration
          // 102 is applied by hand. The idempotency guard keys on status==='sent'; if this update
          // were lost (because resend_email_id rode along on an unknown column and PostgREST 400'd
          // the whole statement), a re-send could DOUBLE-EMAIL a live subbie. So keep it decoupled.
          const { error: upErr } = await sb
            .from("rfqs")
            .update({
              sent_message_id: msgId,
              status: "sent",
              sent_at: new Date().toISOString()
            })
            .eq("id", rfqId);
          if (upErr) console.warn("[rfq-send] rfqs status update:", upErr.message);
          // Resend id captured SEPARATELY (best-effort, try/catch'd) so a not-yet-applied migration
          // 102 can never take down the status update above.
          if (resendId) await captureResendId(sb, rfqId, resendId);
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
        // serverLogged tells the client whether THIS server already wrote the correspondence
        // row, so the client can skip its fallback insert and avoid duplicate rows.
        results.push({ ok: true, to, transport, messageId: msgId, serverLogged: Boolean(sb && rfqId) });
      } catch (e) {
        console.error("[rfq-send]", e);
        results.push({
          ok: false,
          to,
          error: e?.message || "Send failed"
        });
        const detail = `${to}: ${results.at(-1)?.error}`;
        const sentOk = results.filter((r) => r.ok).length;
        const isAuth = /invalid_grant|invalid_token|unauthorized|invalid_client|token/i.test(
          results.at(-1)?.error || ""
        );
        const summary =
          sentOk > 0
            ? `Stopped after a send failure (${detail}). ${sentOk} message(s) sent before it; the remaining were NOT sent.`
            : isAuth
              ? `No emails were sent — the mail account could not authenticate (${detail}). This is usually an expired Gmail token: re-run \`npm run auth:gmail\`, update GMAIL_REFRESH_TOKEN, then retry.`
              : `No emails were sent — the first message failed (${detail}).`;
        return res.status(502).json({
          ok: false,
          mail_ready: true,
          smtp_ready: smtpReady(),
          gmail_ready: gmailSendConfigured(),
          transport,
          error: summary,
          sentCount: sentOk,
          partial: sentOk > 0,
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
    const sb = getServiceSupabase();
    runGhostCheck(sb)
      .then(r => console.log("[trade-ghost-check]", r))
      .catch(e => console.error("[trade-ghost-check]", e));
    runLeadTimeNotifications(sb)
      .then(r => console.log("[lead-time-notifications]", r))
      .catch(e => console.error("[lead-time-notifications]", e));
  };
  setInterval(tick, dayMs);
  setTimeout(tick, 45_000);
  console.log("[blue-leaf-api] REMINDER_CRON_ENABLED: daily deadline reminders (~2 days before).");
}

// Portal nightly sync on its OWN daily timer, DECOUPLED from REMINDER_CRON — so the
// client Journey advances and the finance reconciliation / client-identity backfill
// self-heal in prod BY DEFAULT (no extra env flag, doesn't enable the reminder jobs).
// Idempotent + best-effort. Disable with PORTAL_SYNC_ENABLED=false.
if (envBool(process.env.PORTAL_SYNC_ENABLED, true)) {
  const portalDayMs = 24 * 60 * 60 * 1000;
  const portalTick = () => {
    runPortalNightlySync()
      .then((r) => console.log("[portal-sync]", r))
      .catch((e) => console.error("[portal-sync]", e));
  };
  setInterval(portalTick, portalDayMs);
  setTimeout(portalTick, 60_000);
  console.log("[blue-leaf-api] PORTAL_SYNC_ENABLED: daily portal sync (milestones, selections, finance reconcile).");
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

// ── Email open tracking pixel ────────────────────────────────────────────────
// Serves a 1×1 transparent GIF and records the open event in email_delivery_events.
// URL is embedded in HTML emails as <img src="/api/track/email/{trackingId}" width="1" height="1">.
const TRACKING_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);
app.get("/api/track/email/:trackingId", async (req, res) => {
  res.set({
    "Content-Type": "image/gif",
    "Content-Length": TRACKING_PIXEL.length,
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Pragma": "no-cache"
  });
  res.end(TRACKING_PIXEL);

  // Async — don't block the response
  const { trackingId } = req.params;
  const sb = getServiceSupabase();
  if (!sb || !trackingId) return;
  try {
    const now = new Date().toISOString();
    const { data: existing } = await sb
      .from("email_delivery_events")
      .select("id, open_count, first_opened_at")
      .eq("tracking_id", trackingId)
      .maybeSingle();
    if (existing) {
      await sb.from("email_delivery_events").update({
        first_opened_at: existing.first_opened_at || now,
        open_count: (existing.open_count || 0) + 1
      }).eq("id", existing.id);
    }
  } catch (e) {
    console.error("[track/email]", e?.message);
  }
});

// Serve built frontend in production (Railway). In local dev, Vite handles the frontend.
const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, "../dist");
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  // The Worker PWA has its own entry document (worker.html → /manifest.json, start_url "/worker")
  // so an iPhone "Add to Home Screen" from /worker installs the Blue Leaf Building identity, not
  // the Hub. The vercel.json rewrite that did this is inert on Railway, so the Express server must
  // do it. Must come BEFORE the SPA catch-all, which would otherwise return Hub index.html.
  const workerHtml = join(distPath, "worker.html");
  if (existsSync(workerHtml)) {
    app.get(["/worker", "/worker/*"], (_req, res) => res.sendFile(workerHtml));
  }
  app.get("*", (req, res) => res.sendFile(join(distPath, "index.html")));
}

// ── Global crash guards ──────────────────────────────────────────────────────
// A single unhandled async error (a background poll, a webhook, a stray promise)
// must NEVER take the whole API down — that 502s every route, including unrelated
// ones. Log loudly and keep serving. The failing operation is lost; the server lives.
process.on("unhandledRejection", (reason, promise) => {
  console.error("[crash-guard] Unhandled promise rejection — server kept alive:", reason, promise);
});
process.on("uncaughtException", (err, origin) => {
  console.error(`[crash-guard] Uncaught exception (${origin}) — server kept alive:`, err);
});

app.listen(PORT, () => {
  console.log(`[blue-leaf-api] Listening on ${PORT}`);
});
