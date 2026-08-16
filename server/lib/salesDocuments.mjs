// salesDocuments.mjs — the STAPLE document engine for the Sales module (Sam's canonical method,
// generalised from the fee-proposal generator). Every Sales document type is:
//   1. a hand-designed DOCX template (in the Supabase 'templates' bucket, with a bundled fallback),
//   2. a merge-data builder,
// rendered by docTemplates.renderDocxTemplate, then saved to the lead's documents and openable in
// Google Docs for final edits (googleDriveClient.uploadDocxToDrive) — exactly the fee-proposal flow.
//
// To add a new document type: design the DOCX (with {FIELD} + {#SECTION}…{/SECTION} placeholders),
// upload it to the templates bucket, and add a registry entry below with its buildData() function.

import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { renderDocxTemplate } from "./docTemplates.mjs";
import { incGst } from "./constants.mjs";

const TEMPLATE_BUCKET = "templates";
const __dirname = dirname(fileURLToPath(import.meta.url));

const money = (ex) => (ex == null || ex === "" ? "to be confirmed" : "$" + Math.round(incGst(ex)).toLocaleString("en-AU") + " inc GST");
const sanitize = (s) => String(s || "doc").replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-") || "doc";

// ── Merge-data builders (one per document type) ──────────────────────────────
function buildConceptAgreementData(lead, { designer } = {}) {
  const clientName = (lead.name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "").trim();
  const designerName = designer ? `${designer.first_name || ""} ${designer.last_name || ""}`.trim() : "your recommended designer";
  return {
    CLIENT_NAME: clientName || "[Client]",
    DATE: new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }),
    PROJECT_TYPE: lead.project_type || "",
    SITE_ADDRESS: (lead.site_address || lead.suburb || "").trim(),
    DESIGNER_NAME: designerName,
    DESIGNER_COMPANY: designer?.company || "",
    CONCEPT_FEE: money(lead.concept_fee),
    DESIGN_PACKAGE_FEE: money(lead.design_package_fee),
  };
}

// ── The registry ─────────────────────────────────────────────────────────────
export const SALES_DOC_TYPES = {
  concept_agreement: {
    label: "Concept agreement",
    templatePath: "concept-agreement-template.docx",              // in the 'templates' Supabase bucket
    bundledFallback: join(__dirname, "../../public/templates/concept-agreement-template.docx"),
    documentType: "concept_agreement",                            // lead_documents.document_type
    buildData: buildConceptAgreementData,
    filename: (lead) => `Concept-Agreement-${sanitize(lead.name || lead.id)}.docx`,
  },
};

export function isSalesDocType(docType) { return Object.prototype.hasOwnProperty.call(SALES_DOC_TYPES, docType); }

/** Load a doc template: request override → 'templates' bucket → bundled fallback. Returns a Buffer. */
export async function loadDocTemplate(sb, docType, overrideBase64) {
  if (overrideBase64) return Buffer.from(overrideBase64, "base64");
  const def = SALES_DOC_TYPES[docType];
  if (!def) throw new Error(`Unknown document type: ${docType}`);
  if (sb) {
    try {
      const { data } = await sb.storage.from(TEMPLATE_BUCKET).download(def.templatePath);
      if (data) return Buffer.from(await data.arrayBuffer());
    } catch { /* fall through to the bundled fallback */ }
  }
  if (def.bundledFallback && fs.existsSync(def.bundledFallback)) return fs.readFileSync(def.bundledFallback);
  throw new Error(`No template for "${docType}" — upload ${def.templatePath} to the templates bucket.`);
}

/** Render a Sales document to a DOCX buffer. ctx carries extras (e.g. { designer }). */
export async function renderSalesDoc(sb, docType, lead, ctx = {}, overrideBase64) {
  const def = SALES_DOC_TYPES[docType];
  if (!def) throw new Error(`Unknown document type: ${docType}`);
  const templateBytes = await loadDocTemplate(sb, docType, overrideBase64);
  const buffer = renderDocxTemplate(templateBytes, def.buildData(lead, ctx));
  return { buffer, filename: def.filename(lead), documentType: def.documentType };
}
