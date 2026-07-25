import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { callAI } from "./aiGateway.mjs";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import expressions from "angular-expressions";
import { exec } from "child_process";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { parseCostMetrics, parsePDF, parseSchedItems, parseXLSX, getBuildexactCategoryMapping } from "./buildexactParser.mjs";
import { proposalToDocxData, proposalToApbDocxData, findApbPlaceholders, extractPcSumsFromParse, buildSummaryRowsFromParse, buildInclusionSectionsFromParse, mergeRfqScopeIntoInclusions } from "./feeProposalTransform.mjs";
import { getServiceSupabase } from "./supabaseService.mjs";
import { resolveJobIdByAddress, upsertJobKnowledge } from "./jobResolver.mjs";
import { mailTransportName, sendPlainMail } from "./notifyMail.mjs";
import { wrapPlainTextEmailHtml } from "./signatureEmailHtml.mjs";
import { dropboxConfigured, uploadFeeProposalPdfToPresaleDocs } from "./dropboxClient.mjs";
import { driveConfigured, uploadDocxToDrive, exportDriveFileAsPdf } from "./googleDriveClient.mjs";
import { syncFeeProposalSentToBuildexact } from "./buildexactDeepIntegration.mjs";
import { seedJobBudgetsFromEstimateData } from "./costIntelligenceEstimate.mjs";
import {
  BRANDING_BUCKET,
  BRANDING_EMAIL_LOGO_PATH,
  BRANDING_PRIMARY_LOGO_PATH,
  getBrandingEmailLogo,
  invalidateBrandingLogoCache
} from "./brandingAssets.mjs";
import { requireAuth, requireRole } from "./requireAuth.mjs";

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";

// Candidate soffice paths in priority order
const SOFFICE_CANDIDATES = [
  "/Applications/LibreOffice.app/Contents/MacOS/soffice", // macOS
  "/usr/bin/soffice",
  "/usr/bin/libreoffice",
  "soffice"
];

async function findSoffice() {
  const { promisify } = await import("util");
  const execP = promisify(exec);
  for (const bin of SOFFICE_CANDIDATES) {
    try {
      await execP(`"${bin}" --version`);
      return bin;
    } catch {
      // not found, try next
    }
  }
  return null;
}

async function convertDocxToPdfBuffer(docxBuffer) {
  const soffice = await findSoffice();
  if (!soffice) {
    throw new Error(
      "LibreOffice is not installed. Install it with: brew install --cask libreoffice (macOS) or apt install libreoffice (Linux)"
    );
  }
  const { promisify } = await import("util");
  const execP = promisify(exec);
  const dir = await mkdtemp(join(tmpdir(), "blb-pdf-"));
  const docxPath = join(dir, "proposal.docx");
  try {
    await writeFile(docxPath, docxBuffer);
    await execP(`"${soffice}" --headless --convert-to pdf --outdir "${dir}" "${docxPath}"`);
    const pdfPath = join(dir, "proposal.pdf");
    const pdfBuffer = await readFile(pdfPath);
    return pdfBuffer;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function safeFilePart(s) {
  return String(s || "QUOTE")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "QUOTE";
}

function makeAngularParser(tag) {
  if (tag === ".") return { get: (s) => s };
  const expr = expressions.compile(tag.replace(/('|')/g, "'").replace(/("|")/g, '"'));
  return {
    get(scope, context) {
      let obj = {};
      const list = context.scopeList;
      for (let i = 0; i <= context.num; i++) Object.assign(obj, list[i]);
      return expr(scope, obj);
    }
  };
}

/**
 * Normalises a DOCX template so docxtemplater can parse it reliably.
 * - Converts {{VAR}} (double-brace) → {VAR} (single-brace) in all XML parts.
 * - Replaces hardcoded "Quote NNNN" in page headers with {QUOTE_NUMBER}.
 */
function normaliseDocxTemplate(zip) {
  const xmlFiles = Object.keys(zip.files).filter(
    (n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n) && !zip.files[n].dir
  );
  for (const name of xmlFiles) {
    let text = zip.files[name].asText();
    text = text.replace(/\{\{([A-Z_][A-Z_0-9]*)\}\}/g, "{$1}");
    if (name.includes("header")) {
      text = text.replace(/>Quote\s+\d+</g, ">{QUOTE_NUMBER}<");
    }
    zip.file(name, text);
  }
  return zip;
}

/**
 * @param {import('express').Express} app
 */
export function registerModule5Routes(app) {
  app.post("/api/fee-proposal/parse-xlsx", requireAuth, async (req, res) => {
    try {
      const b64 = String(req.body?.dataBase64 || "").trim();
      if (!b64) return res.status(400).json({ ok: false, error: "dataBase64 required." });
      const buf = Buffer.from(b64, "base64");

      // F7 — Return cached parse result if same file was already processed
      // Requires migration 056 — source_hash column on buildexact_estimates
      const incomingHashXlsx = createHash("sha256").update(buf).digest("hex");
      const sbXlsx = getServiceSupabase();
      if (sbXlsx) {
        const { data: existingParse } = await sbXlsx
          .from("buildexact_estimates")
          .select("*")
          .eq("source_hash", incomingHashXlsx)
          .maybeSingle();
        if (existingParse && !req.query.force) {
          const cachedParsed = {
            quote_number: existingParse.quote_number || "",
            address: existingParse.address || "",
            client_name: existingParse.client_name || "",
            building_type: existingParse.building_type || "",
            date_prepared: existingParse.date_prepared || "",
            net_total: existingParse.net_total || 0,
            markup_amount: existingParse.markup_amount || 0,
            markup_percent: existingParse.markup_percent || 0,
            tax: existingParse.tax || 0,
            estimate_total: existingParse.estimate_total || 0,
            categories: existingParse.categories || []
          };
          cachedParsed.cost_metrics = parseCostMetrics(cachedParsed.categories);
          cachedParsed.pc_sums = extractPcSumsFromParse(cachedParsed);
          cachedParsed.summary_rows = buildSummaryRowsFromParse(cachedParsed);
          cachedParsed.inclusion_sections = buildInclusionSectionsFromParse(cachedParsed);
          return res.json({ ok: true, parsed: cachedParsed, result: existingParse, job_id: existingParse.job_id || null, estimate_id: existingParse.id || null, cached: true });
        }
      }

      const filenameHint = String(req.body?.filename || "").trim();
      const parsed = parseXLSX(buf, filenameHint);
      const scheduleHints = parseSchedItems(parsed.categories);
      const costMetrics = parseCostMetrics(parsed.categories);
      // Enrich with the transformed proposal fields the wizard consumes directly (PC/PS from the
      // Allowance flag, $0-dropped summary, import-driven inclusions with Builders Warranty pinned).
      parsed.cost_metrics = costMetrics;
      parsed.pc_sums = extractPcSumsFromParse(parsed);
      parsed.summary_rows = buildSummaryRowsFromParse(parsed);
      parsed.inclusion_sections = buildInclusionSectionsFromParse(parsed);
      // Resolve job and persist estimate
      const resolved = await resolveJobIdByAddress(parsed.address);
      const job_id = resolved?.job_id || null;
      const sb = getServiceSupabase();
      let estimate_id = null;
      if (sb) {
        const { data: est } = await sb
          .from("buildexact_estimates")
          .insert({
            job_id,
            quote_number: parsed.quote_number || null,
            address: parsed.address || null,
            client_name: parsed.client_name || null,
            building_type: parsed.building_type || null,
            date_prepared: parsed.date_prepared || null,
            net_total: parsed.net_total,
            markup_amount: parsed.markup_amount,
            markup_percent: parsed.markup_percent,
            tax: parsed.tax,
            estimate_total: parsed.estimate_total,
            categories: parsed.categories,
            schedule_hints: scheduleHints.length ? scheduleHints : null,
            cost_metrics: Object.keys(costMetrics).length ? costMetrics : null,
            source: "xlsx",
            source_hash: incomingHashXlsx,
          })
          .select("id")
          .single();
        estimate_id = est?.id || null;
        if (job_id && estimate_id) {
          const catNames = (parsed.categories || []).map((c) => c.name).join(", ");
          await upsertJobKnowledge({
            job_id,
            address: resolved.address,
            kind: "estimate",
            content: `Buildexact estimate for ${parsed.address}: categories ${catNames}. Net total $${parsed.net_total}, estimate total $${parsed.estimate_total}, markup ${parsed.markup_percent}%.`,
            data: { quote_number: parsed.quote_number, net_total: parsed.net_total, estimate_total: parsed.estimate_total, categories: (parsed.categories || []).map((c) => ({ name: c.name, subtotal_ex_gst: c.subtotal_ex_gst, subtotal_inc_gst: c.subtotal_inc_gst })) },
            source_id: estimate_id
          });
        }
        // Seed job_budgets from parsed estimate categories (non-blocking, non-fatal)
        if (job_id && parsed.categories?.length) {
          seedJobBudgetsFromEstimateData({ db: sb, jobId: job_id, categories: parsed.categories })
            .then((r) => console.log(`[fee-proposal/parse-xlsx] job_budgets seeded: ${r.budgets_seeded} rows`))
            .catch((e) => console.warn("[fee-proposal/parse-xlsx] job_budgets seed failed:", e?.message || e));
        }
      }
      return res.json({ ok: true, parsed, job_id, estimate_id });
    } catch (e) {
      console.error("[fee-proposal/parse-xlsx]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Phase 5b — build a job's inclusions: import categories (Builders Warranty pinned) blended with the
  // polished RFQ scope (rfq_trade_scopes.scope_bullets), matched per canonical category. Called by the
  // wizard once a job is linked (the estimateitems export carries no address, so scope can't resolve at
  // parse time). Degrades to import-only inclusions when the job has no RFQ package.
  app.post("/api/fee-proposal/inclusions", requireAuth, async (req, res) => {
    try {
      const jobId = String(req.body?.jobId || "").trim();
      const categories = Array.isArray(req.body?.categories) ? req.body.categories : [];
      let sections = buildInclusionSectionsFromParse({ categories });
      const sb = getServiceSupabase();
      let scopeCats = 0;
      if (sb && jobId) {
        // Model B (rfq_packages → rfq_trade_scopes) was retired in mig 155. Read the go-forward
        // tender_trade_scopes (keyed directly by job, mig 154) for polished per-trade scope bullets.
        // Fail-soft: an empty/absent table just yields import-only inclusions.
        const { data: scopes } = await sb
          .from("tender_trade_scopes")
          .select("trade_label, scope_bullets, trade_category_id, trade_categories ( name )")
          .eq("job_id", jobId);
        const scopeByCategory = new Map();
        for (const ts of scopes || []) {
          const catName = ts.trade_categories?.name || ts.trade_label || "";
          if (!catName) continue;
          const canon = getBuildexactCategoryMapping(catName)?.name || catName;
          const bullets = Array.isArray(ts.scope_bullets) ? ts.scope_bullets.map((b) => String(b)) : [];
          if (!bullets.length) continue;
          scopeByCategory.set(canon, (scopeByCategory.get(canon) || []).concat(bullets));
        }
        scopeCats = scopeByCategory.size;
        sections = mergeRfqScopeIntoInclusions(sections, scopeByCategory);
      }
      return res.json({ ok: true, inclusion_sections: sections, scope_categories: scopeCats });
    } catch (e) {
      console.error("[fee-proposal/inclusions]", e);
      return res.status(500).json({ ok: false, error: e?.message || "Failed to build inclusions" });
    }
  });

  app.post("/api/fee-proposal/parse-pdf", requireAuth, async (req, res) => {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) return res.status(503).json({ ok: false, error: "ANTHROPIC_API_KEY not configured." });
    try {
      const b64 = String(req.body?.dataBase64 || "").trim();
      if (!b64) return res.status(400).json({ ok: false, error: "dataBase64 required." });
      const buf = Buffer.from(b64, "base64");

      // F7 — Return cached parse result if same file was already processed
      // Requires migration 056 — source_hash column on buildexact_estimates
      const incomingHashPdf = createHash("sha256").update(buf).digest("hex");
      const sbPdf = getServiceSupabase();
      if (sbPdf) {
        const { data: existingParse } = await sbPdf
          .from("buildexact_estimates")
          .select("*")
          .eq("source_hash", incomingHashPdf)
          .maybeSingle();
        if (existingParse && !req.query.force) {
          return res.json({ ok: true, result: existingParse, cached: true });
        }
      }

      const client = new Anthropic({ apiKey: key, maxRetries: 0 });
      const runClaudeJson = async (prompt, pdfBase64) => {
        const completion = await callAI(client, {
          model: MODEL,
          max_tokens: 8192,
          temperature: 0.1,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "document",
                  source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
                  citations: { enabled: false }
                },
                { type: "text", text: prompt }
              ]
            }
          ]
        }, { module: "module5Routes" });
        return completion.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
      };
      const parsed = await parsePDF(buf, runClaudeJson);
      const scheduleHintsPdf = parseSchedItems(parsed.categories);
      const costMetricsPdf = parseCostMetrics(parsed.categories);
      const resolved = await resolveJobIdByAddress(parsed.address);
      const job_id = resolved?.job_id || null;
      const sb2 = getServiceSupabase();
      let estimate_id = null;
      if (sb2) {
        const { data: est } = await sb2
          .from("buildexact_estimates")
          .insert({
            job_id,
            quote_number: parsed.quote_number || null,
            address: parsed.address || null,
            client_name: parsed.client_name || null,
            building_type: parsed.building_type || null,
            date_prepared: parsed.date_prepared || null,
            net_total: parsed.net_total,
            markup_amount: parsed.markup_amount,
            markup_percent: parsed.markup_percent,
            tax: parsed.tax,
            estimate_total: parsed.estimate_total,
            categories: parsed.categories,
            schedule_hints: scheduleHintsPdf.length ? scheduleHintsPdf : null,
            cost_metrics: Object.keys(costMetricsPdf).length ? costMetricsPdf : null,
            source: "pdf",
            source_hash: incomingHashPdf,
          })
          .select("id")
          .single();
        estimate_id = est?.id || null;
        if (job_id && estimate_id) {
          const catNames = (parsed.categories || []).map((c) => c.name).join(", ");
          await upsertJobKnowledge({
            job_id,
            address: resolved.address,
            kind: "estimate",
            content: `Buildexact estimate for ${parsed.address}: categories ${catNames}. Net total $${parsed.net_total}, estimate total $${parsed.estimate_total}, markup ${parsed.markup_percent}%.`,
            data: { quote_number: parsed.quote_number, net_total: parsed.net_total, estimate_total: parsed.estimate_total, categories: (parsed.categories || []).map((c) => ({ name: c.name, subtotal_ex_gst: c.subtotal_ex_gst, subtotal_inc_gst: c.subtotal_inc_gst })) },
            source_id: estimate_id
          });
        }
        // Seed job_budgets from parsed estimate categories (non-blocking, non-fatal)
        if (job_id && parsed.categories?.length) {
          seedJobBudgetsFromEstimateData({ db: sb2, jobId: job_id, categories: parsed.categories })
            .then((r) => console.log(`[fee-proposal/parse-pdf] job_budgets seeded: ${r.budgets_seeded} rows`))
            .catch((e) => console.warn("[fee-proposal/parse-pdf] job_budgets seed failed:", e?.message || e));
        }
      }
      return res.json({ ok: true, parsed, job_id, estimate_id });
    } catch (e) {
      console.error("[fee-proposal/parse-pdf]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // ── Template upload / fetch ───────────────────────────────────────────────
  const TEMPLATE_BUCKET = "templates";
  const TEMPLATE_PATH   = "fee-proposal-template.docx";
  const TEMPLATE_PATH_APB = "fee-proposal-template-apb.docx";
  // Dual-version: pick the stored template + render transform by style ('original' | 'apb'). The
  // original keeps Sam's perfected design; the APB version is refined in parallel, then the original
  // is retired.
  const templatePathForStyle = (style) => (style === "apb" ? TEMPLATE_PATH_APB : TEMPLATE_PATH);
  const renderDataForStyle = (style, proposalData) =>
    style === "apb" ? proposalToApbDocxData(proposalData) : proposalToDocxData(proposalData);

  /** Upload DOCX template to Supabase Storage (+ optionally Dropbox). */
  app.post("/api/settings/fee-proposal-template", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
    const b64 = String(req.body?.dataBase64 || "").trim();
    if (!b64) return res.status(400).json({ ok: false, error: "dataBase64 required" });
    let buf;
    try { buf = Buffer.from(b64, "base64"); } catch { return res.status(400).json({ ok: false, error: "Invalid base64" }); }
    if (!buf.length) return res.status(400).json({ ok: false, error: "Empty file" });
    const style = req.body?.style === "apb" ? "apb" : "original";
    const tplPath = templatePathForStyle(style);

    // Supabase Storage upload
    const { error: uploadErr } = await sb.storage
      .from(TEMPLATE_BUCKET)
      .upload(tplPath, buf, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true
      });
    if (uploadErr) return res.status(502).json({ ok: false, error: uploadErr.message });

    // Dropbox backup (non-fatal)
    if (dropboxConfigured()) {
      try {
        const { getDropboxAccessToken, dropboxUploadBuffer } = await import("./dropboxClient.mjs");
        const token = await getDropboxAccessToken();
        await dropboxUploadBuffer(token, `/BLUE LEAF BUILDING/INTERNAL/TEMPLATES/${tplPath}`, buf, { autorename: false });
      } catch (e) {
        console.warn("[fee-proposal-template] Dropbox backup failed:", e?.message || e);
      }
    }

    console.log(`[fee-proposal-template] Uploaded ${buf.length} bytes to Supabase Storage`);
    return res.json({ ok: true, size: buf.length });
  });

  /** Fetch DOCX template from Supabase Storage → returns base64. */
  app.get("/api/settings/fee-proposal-template", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });

    const style = req.query?.style === "apb" ? "apb" : "original";
    const { data, error } = await sb.storage.from(TEMPLATE_BUCKET).download(templatePathForStyle(style));
    if (error) {
      if (error.message?.includes("not found") || error.message?.includes("Object not found")) {
        return res.status(404).json({ ok: false, error: "No template uploaded yet" });
      }
      return res.status(502).json({ ok: false, error: error.message });
    }

    const buf = Buffer.from(await data.arrayBuffer());
    return res.json({ ok: true, dataBase64: buf.toString("base64"), size: buf.length });
  });

  // ── Branding logo upload / fetch ──────────────────────────────────────────

  /**
   * POST /api/settings/branding-logo
   * Body: { filename: "BLB_Icon_Blue.png"|"BLB_Primary_Logo_White.png", dataBase64: string }
   * Uploads a branding asset to Supabase Storage bucket "branding".
   */
  app.post("/api/settings/branding-logo", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
    const filename = String(req.body?.filename || BRANDING_EMAIL_LOGO_PATH).trim();
    const b64 = String(req.body?.dataBase64 || "").trim();
    if (!b64) return res.status(400).json({ ok: false, error: "dataBase64 required" });
    let buf;
    try { buf = Buffer.from(b64, "base64"); } catch { return res.status(400).json({ ok: false, error: "Invalid base64" }); }
    if (!buf.length) return res.status(400).json({ ok: false, error: "Empty file" });

    const contentType = filename.endsWith(".svg") ? "image/svg+xml" : "image/png";
    const { error } = await sb.storage.from(BRANDING_BUCKET).upload(filename, buf, { contentType, upsert: true });
    if (error) return res.status(502).json({ ok: false, error: error.message });

    invalidateBrandingLogoCache();
    console.log(`[branding] Uploaded ${filename} (${buf.length} bytes) to Supabase Storage`);
    return res.json({ ok: true, filename, size: buf.length });
  });

  /**
   * GET /api/settings/branding-logo?file=BLB_Icon_Blue.png
   * Returns { ok, dataBase64, size } for the requested brand asset.
   * Defaults to BLB_Icon_Blue.png (email logo).
   */
  app.get("/api/settings/branding-logo", requireAuth, async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
    const filename = String(req.query?.file || BRANDING_EMAIL_LOGO_PATH).trim();

    const { data, error } = await sb.storage.from(BRANDING_BUCKET).download(filename);
    if (error) {
      if (error.message?.includes("not found") || error.message?.includes("Object not found")) {
        return res.status(404).json({ ok: false, error: "Logo not uploaded yet" });
      }
      return res.status(502).json({ ok: false, error: error.message });
    }

    const buf = Buffer.from(await data.arrayBuffer());
    return res.json({ ok: true, filename, dataBase64: buf.toString("base64"), size: buf.length });
  });

  // ── Email signature (account-wide, persisted on company_profile) ──────────
  // The signature was previously localStorage-only, so a send from a browser without it fell back
  // to the default. Persisting it here makes every send path read the same saved signature.
  app.get("/api/settings/email-signature", requireAuth, async (_req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
    try {
      const { data, error } = await sb.from("company_profile").select("email_signature").limit(1);
      if (error) {
        // Column missing (pre-migration 157) — behave as "nothing saved" so the client uses its cache.
        if (/email_signature/i.test(String(error.message || ""))) return res.json({ ok: true, signature: null });
        return res.status(502).json({ ok: false, error: error.message });
      }
      return res.json({ ok: true, signature: data?.[0]?.email_signature || null });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || "Could not load the signature." });
    }
  });

  app.put("/api/settings/email-signature", requireAuth, requireRole("admin"), async (req, res) => {
    const sb = getServiceSupabase();
    if (!sb) return res.status(503).json({ ok: false, error: "DB unavailable" });
    const incoming = req.body?.signature;
    if (!incoming || typeof incoming !== "object") return res.status(400).json({ ok: false, error: "signature object required" });
    // Store text fields only — never the (large) logo data URL; the logo lives in branding storage.
    const pick = (k) => (typeof incoming[k] === "string" ? incoming[k] : "");
    const signature = {
      fullName: pick("fullName"),
      title: pick("title"),
      mobile: pick("mobile"),
      website: pick("website"),
      postalAddress: pick("postalAddress"),
      legalDisclaimer: pick("legalDisclaimer")
    };
    try {
      // company_profile is a single-company row: update the first row if present, else insert one.
      const { data: existing, error: readErr } = await sb.from("company_profile").select("id").limit(1);
      if (readErr) {
        if (/email_signature/i.test(String(readErr.message || ""))) return res.status(503).json({ ok: false, error: "Run migration 157 (company_profile.email_signature) first." });
        return res.status(502).json({ ok: false, error: readErr.message });
      }
      if (existing?.[0]?.id) {
        const { error } = await sb.from("company_profile").update({ email_signature: signature, updated_at: new Date().toISOString() }).eq("id", existing[0].id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("company_profile").insert({ email_signature: signature });
        if (error) throw error;
      }
      return res.json({ ok: true, signature });
    } catch (e) {
      if (/email_signature/i.test(String(e?.message || ""))) return res.status(503).json({ ok: false, error: "Run migration 157 (company_profile.email_signature) first." });
      return res.status(500).json({ ok: false, error: e?.message || "Could not save the signature." });
    }
  });

  app.post("/api/fee-proposal/generate-docx", requireAuth, async (req, res) => {
    try {
      let templateBase64 = String(req.body?.templateBase64 || "").trim();
      const proposalData = req.body?.proposalData;
      const style = req.body?.style === "apb" ? "apb" : "original";

      // Auto-fetch template from Supabase Storage if not provided by client
      if (!templateBase64) {
        const sb = getServiceSupabase();
        if (sb) {
          const { data, error } = await sb.storage.from(TEMPLATE_BUCKET).download(templatePathForStyle(style));
          if (!error && data) {
            const buf = Buffer.from(await data.arrayBuffer());
            templateBase64 = buf.toString("base64");
          }
        }
      }

      if (!templateBase64) {
        return res.status(400).json({ ok: false, error: style === "apb" ? "No APB template uploaded yet — upload the APB DOCX template in Settings." : "No template available — upload a DOCX template in Settings first." });
      }
      if (!proposalData || typeof proposalData !== "object") {
        return res.status(400).json({ ok: false, error: "proposalData object required." });
      }
      const zip = normaliseDocxTemplate(new PizZip(Buffer.from(templateBase64, "base64")));
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        parser: makeAngularParser,
        nullGetter: () => ""
      });
      const renderData = renderDataForStyle(style, proposalData);
      if (style === "apb") {
        const ph = findApbPlaceholders(renderData);
        if (ph.length) return res.status(400).json({ ok: false, error: `APB version has unfilled placeholders — fill these first: ${ph.join(", ")}` });
      }
      doc.render(renderData);
      const out = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
      const fn = String(req.body?.filename || "Fee-Proposal.docx").replace(/[^\w.\- ]+/g, "") || "Fee-Proposal.docx";
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${fn}"`);
      return res.send(out);
    } catch (e) {
      console.error("[fee-proposal/generate-docx]", e);
      const msg = e?.properties?.errors ? JSON.stringify(e.properties.errors) : e?.message || String(e);
      return res.status(502).json({ ok: false, error: msg });
    }
  });

  app.post("/api/fee-proposal/upload-to-drive", requireAuth, async (req, res) => {
    if (!driveConfigured()) {
      return res.status(503).json({ ok: false, error: "Google Drive not configured. Add GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN to .env, then run: npm run auth:drive" });
    }
    try {
      let templateBase64 = String(req.body?.templateBase64 || "").trim();
      const proposalData = req.body?.proposalData;
      const quoteNumber = String(req.body?.quoteNumber || "Draft").trim();
      const style = req.body?.style === "apb" ? "apb" : "original";
      // Auto-fetch template from Supabase Storage if not provided by client
      if (!templateBase64) {
        const sbStorage = getServiceSupabase();
        if (sbStorage) {
          const { data: tplData, error: tplErr } = await sbStorage.storage.from(TEMPLATE_BUCKET).download(templatePathForStyle(style));
          if (!tplErr && tplData) templateBase64 = Buffer.from(await tplData.arrayBuffer()).toString("base64");
        }
      }
      if (!templateBase64) {
        return res.status(400).json({ ok: false, error: style === "apb" ? "No APB template uploaded yet — upload the APB DOCX template in Settings." : "No template available — upload a DOCX template in Settings first." });
      }
      if (!proposalData || typeof proposalData !== "object") {
        return res.status(400).json({ ok: false, error: "proposalData required." });
      }
      // Generate DOCX
      const zip = normaliseDocxTemplate(new PizZip(Buffer.from(templateBase64, "base64")));
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        parser: makeAngularParser,
        nullGetter: () => ""
      });
      const renderData = renderDataForStyle(style, proposalData);
      if (style === "apb") {
        const ph = findApbPlaceholders(renderData);
        if (ph.length) return res.status(400).json({ ok: false, error: `APB version has unfilled placeholders — fill these first: ${ph.join(", ")}` });
      }
      doc.render(renderData);
      const docxBuffer = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
      // Upload to Google Drive as a Google Doc (editable)
      const filename = `${safeFilePart(quoteNumber)}-Fee-Proposal.docx`;
      const { fileId, editUrl } = await uploadDocxToDrive(filename, docxBuffer);
      return res.json({ ok: true, fileId, editUrl });
    } catch (e) {
      console.error("[fee-proposal/upload-to-drive]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/fee-proposal/docx-to-pdf", requireAuth, async (req, res) => {
    try {
      const driveFileId = String(req.body?.driveFileId || "").trim();
      const docxBase64 = String(req.body?.docxBase64 || "").trim();
      const jobAddress = String(req.body?.jobAddress || "").trim();
      const quoteNumber = String(req.body?.quoteNumber || "").trim();
      const proposalId = String(req.body?.proposalId || "").trim();
      if (!driveFileId && !docxBase64) {
        return res.status(400).json({ ok: false, error: "driveFileId or docxBase64 required." });
      }
      let pdfBuffer;
      if (driveFileId) {
        // Export from Google Drive — highest quality (same renderer as Google Docs)
        pdfBuffer = await exportDriveFileAsPdf(driveFileId);
      } else {
        const docxBuffer = Buffer.from(docxBase64, "base64");
        pdfBuffer = await convertDocxToPdfBuffer(docxBuffer);
      }
      let dropboxPdfPath = null;
      const cleanQn = String(quoteNumber || "Draft").trim();
      let filename = `Fee proposal - ${cleanQn}.pdf`;
      if (dropboxConfigured() && jobAddress) {
        try {
          const up = await uploadFeeProposalPdfToPresaleDocs(jobAddress, filename, pdfBuffer);
          dropboxPdfPath = up?.path_display || up?.path_lower || null;
        } catch (upErr) {
          console.warn("[fee-proposal/docx-to-pdf] Dropbox upload failed:", upErr?.message);
        }
      }
      if (proposalId) {
        const sb = getServiceSupabase();
        if (sb && dropboxPdfPath) {
          await sb
            .from("fee_proposals")
            .update({ dropbox_pdf_path: dropboxPdfPath, updated_at: new Date().toISOString() })
            .eq("id", proposalId);
        }
      }
      return res.json({
        ok: true,
        pdfBase64: pdfBuffer.toString("base64"),
        filename,
        dropbox_pdf_path: dropboxPdfPath
      });
    } catch (e) {
      console.error("[fee-proposal/docx-to-pdf]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/fee-proposal/send", requireAuth, async (req, res) => {
    if (!mailTransportName()) {
      return res.status(503).json({ ok: false, error: "Mail not configured." });
    }
    try {
      const to = String(req.body?.to || "").trim();
      const cc = String(req.body?.cc || "").trim();
      const bcc = String(req.body?.bcc || "").trim();
      const sendCopy = Boolean(req.body?.sendCopy);
      const proposalId = String(req.body?.proposalId || "").trim();
      const jobId = String(req.body?.jobId || "").trim();
      const address = String(req.body?.address || "").trim();
      const quoteNumber = String(req.body?.quoteNumber || "").trim();
      const subject = String(req.body?.subject || `Fee Proposal - ${address || quoteNumber || "Project"}`).trim();
      const pdfBase64 = String(req.body?.pdfBase64 || "").trim();
      const docxBase64 = String(req.body?.docxBase64 || "").trim();
      const fileBase64 = pdfBase64 || docxBase64;
      if (!to || !fileBase64) return res.status(400).json({ ok: false, error: "to and pdfBase64 required." });
      const isPdf = Boolean(pdfBase64);
      const baseText = String(req.body?.body || "Please find attached our fee proposal.").trim();
      const footer = String(req.body?.signatureFooter || "").trim();
      // Auto-fetch email logo from Supabase Storage if not provided by client
      const logoFromClient = String(req.body?.signatureLogoDataUrl || "").trim();
      const logo = logoFromClient || await getBrandingEmailLogo(getServiceSupabase()).catch(() => "");
      const text = footer ? `${baseText}\n\n${footer}` : baseText;
      const html = logo || footer ? wrapPlainTextEmailHtml(baseText, { footerText: footer, logoDataUrl: logo }) : undefined;
      const buf = Buffer.from(fileBase64, "base64");
      const cleanQn = String(quoteNumber || "Draft").trim();
      const attachFilename = isPdf ? `Fee proposal - ${cleanQn}.pdf` : "Fee-Proposal.docx";
      const attachMime = isPdf
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      const SENDER = process.env.SMTP_FROM || process.env.GMAIL_SENDER_EMAIL || "info@blueleafbuilding.com.au";

      // Build recipients — sendCopy BCCs the sender
      const bccFinal = [bcc, sendCopy ? SENDER : ""].filter(Boolean).join(", ");

      await sendPlainMail({
        to,
        ...(cc ? { cc } : {}),
        ...(bccFinal ? { bcc: bccFinal } : {}),
        subject,
        text,
        html,
        attachments: [{ filename: attachFilename, mimeType: attachMime, content: buf }]
      });

      const sb = getServiceSupabase();

      // Update fee_proposal status
      let proposalForBuildexact = null;
      if (proposalId && sb) {
        const { data: updatedProposal } = await sb.from("fee_proposals").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          sent_to_email: to,
          buildexact_status: "sent",
          buildexact_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq("id", proposalId).select("job_id, buildexact_job_id, buildexact_estimate_id").single();
        proposalForBuildexact = updatedProposal || null;
      }

      // Log to correspondence
      if (sb && jobId) {
        await sb.from("correspondence").insert({
          job_id: jobId,
          direction: "outbound",
          subject,
          body: text.slice(0, 16000),
          sent_at: new Date().toISOString(),
          logged_by: "fee-proposal-send"
        }).then(() => {}).catch(() => {});
      }

      let buildexactJobId = proposalForBuildexact?.buildexact_job_id;
      if (!buildexactJobId && sb && proposalForBuildexact?.job_id) {
        const { data: jobRow } = await sb.from("jobs").select("buildexact_job_id").eq("id", proposalForBuildexact.job_id).maybeSingle();
        buildexactJobId = jobRow?.buildexact_job_id || "";
      }
      const buildexactEstimateId = proposalForBuildexact?.buildexact_estimate_id;
      if (buildexactJobId && buildexactEstimateId) {
        syncFeeProposalSentToBuildexact({ buildexactJobId, estimateId: buildexactEstimateId })
          .catch((err) => console.warn("[buildexact] fee proposal sent sync:", err?.message || err));
      }

      return res.json({ ok: true });
    } catch (e) {
      console.error("[fee-proposal/send]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
