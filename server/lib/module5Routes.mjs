import Anthropic from "@anthropic-ai/sdk";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import expressions from "angular-expressions";
import { exec } from "child_process";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { parsePDF, parseXLSX } from "./buildexactParser.mjs";
import { proposalToDocxData } from "./feeProposalTransform.mjs";
import { getServiceSupabase } from "./supabaseService.mjs";
import { resolveJobIdByAddress, upsertJobKnowledge } from "./jobResolver.mjs";
import { mailTransportName, sendPlainMail } from "./notifyMail.mjs";
import { wrapPlainTextEmailHtml } from "./signatureEmailHtml.mjs";
import { dropboxConfigured, uploadFeeProposalPdfToPresaleDocs } from "./dropboxClient.mjs";
import { driveConfigured, uploadDocxToDrive, exportDriveFileAsPdf } from "./googleDriveClient.mjs";

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
  app.post("/api/fee-proposal/parse-xlsx", async (req, res) => {
    try {
      const b64 = String(req.body?.dataBase64 || "").trim();
      if (!b64) return res.status(400).json({ ok: false, error: "dataBase64 required." });
      const buf = Buffer.from(b64, "base64");
      const filenameHint = String(req.body?.filename || "").trim();
      const parsed = parseXLSX(buf, filenameHint);
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
            source: "xlsx"
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
      }
      return res.json({ ok: true, parsed, job_id, estimate_id });
    } catch (e) {
      console.error("[fee-proposal/parse-xlsx]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/fee-proposal/parse-pdf", async (req, res) => {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) return res.status(503).json({ ok: false, error: "ANTHROPIC_API_KEY not configured." });
    try {
      const b64 = String(req.body?.dataBase64 || "").trim();
      if (!b64) return res.status(400).json({ ok: false, error: "dataBase64 required." });
      const buf = Buffer.from(b64, "base64");
      const client = new Anthropic({ apiKey: key, maxRetries: 0 });
      const runClaudeJson = async (prompt, pdfBase64) => {
        const completion = await client.messages.create({
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
        });
        return completion.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
      };
      const parsed = await parsePDF(buf, runClaudeJson);
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
            source: "pdf"
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
      }
      return res.json({ ok: true, parsed, job_id, estimate_id });
    } catch (e) {
      console.error("[fee-proposal/parse-pdf]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.post("/api/fee-proposal/generate-docx", async (req, res) => {
    try {
      const templateBase64 = String(req.body?.templateBase64 || "").trim();
      const proposalData = req.body?.proposalData;
      if (!templateBase64) return res.status(400).json({ ok: false, error: "templateBase64 required." });
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
      doc.render(proposalToDocxData(proposalData));
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

  app.post("/api/fee-proposal/upload-to-drive", async (req, res) => {
    if (!driveConfigured()) {
      return res.status(503).json({ ok: false, error: "Google Drive not configured. Add GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN to .env, then run: npm run auth:drive" });
    }
    try {
      const templateBase64 = String(req.body?.templateBase64 || "").trim();
      const proposalData = req.body?.proposalData;
      const quoteNumber = String(req.body?.quoteNumber || "Draft").trim();
      if (!templateBase64) return res.status(400).json({ ok: false, error: "templateBase64 required." });
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
      doc.render(proposalToDocxData(proposalData));
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

  app.post("/api/fee-proposal/docx-to-pdf", async (req, res) => {
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

  app.post("/api/fee-proposal/send", async (req, res) => {
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
      const logo = String(req.body?.signatureLogoDataUrl || "").trim();
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
      if (proposalId && sb) {
        await sb.from("fee_proposals").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          sent_to_email: to,
          updated_at: new Date().toISOString()
        }).eq("id", proposalId);
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

      return res.json({ ok: true });
    } catch (e) {
      console.error("[fee-proposal/send]", e);
      return res.status(502).json({ ok: false, error: e?.message || String(e) });
    }
  });
}
