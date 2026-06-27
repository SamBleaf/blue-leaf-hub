/**
 * jobRecordsFiler.mjs — central job record-keeping filer.
 *
 * Every module that produces a job document, financial record, or piece of
 * correspondence files it HERE, into the canonical INTERNAL/<category> folder under
 * the job's shared Dropbox root:
 *   /BLUE LEAF BUILDING/PROJECTS/BLUE LEAF BUILDING/[JOB ADDRESS]/INTERNAL/<category>/
 *
 * Design rules:
 *  - ONE place decides WHERE a record lives (RECORD_FOLDERS) — modules pass a
 *    semantic category, never a hard-coded path.
 *  - Sequential upload, idempotent folder creation (Dropbox law: never Promise.all).
 *  - Best-effort + never throws into the caller — Dropbox is a non-fatal mirror.
 *  - Optional `register`: also writes a canonical `job_documents` row, so the filed
 *    record becomes exposable to the client portal (this is what lets a filed
 *    contract/variation/claim appear in the client's Documents tab).
 *
 * @see docs/records/JOB_RECORDS_FILING_PLAN.md for the full architecture + rollout.
 */
import {
  dropboxConfigured,
  getDropboxAccessToken,
  sharedJobRootPath,
  ensureParentFoldersForFile,
  dropboxUploadBuffer,
} from "./dropboxClient.mjs";
import { getServiceSupabase } from "./supabaseService.mjs";

/**
 * Canonical INTERNAL subfolder per record category. The single source of truth for
 * the job records taxonomy. Existing folders (QUOTES/P.O/INVOICES/RFQ/PRESALE DOCS/
 * LEAD DOCS/PORTAL) are kept verbatim; the rest are new record branches.
 */
export const RECORD_FOLDERS = {
  contract:       "INTERNAL/CONTRACT",
  plans:          "INTERNAL/APPROVED PLANS",
  permit:         "INTERNAL/PERMITS & APPROVALS",
  engineering:    "INTERNAL/ENGINEERING & REPORTS",
  selections:     "INTERNAL/SELECTIONS",
  rfq:            "INTERNAL/RFQ",
  quote:          "INTERNAL/QUOTES",
  purchase_order: "INTERNAL/P.O",
  variation:      "INTERNAL/VARIATIONS",
  progress_claim: "INTERNAL/PROGRESS CLAIMS",
  invoice:        "INTERNAL/INVOICES",
  site_diary:     "INTERNAL/SITE DIARY",
  site_photo:     "INTERNAL/SITE PHOTOS",
  schedule:       "INTERNAL/SCHEDULE",
  whs:            "INTERNAL/WHS",
  induction:      "INTERNAL/WHS/INDUCTIONS",
  correspondence: "INTERNAL/CORRESPONDENCE",
  certificate:    "INTERNAL/CERTIFICATES & HANDOVER",
  presale:        "INTERNAL/PRESALE DOCS",
  lead:           "INTERNAL/LEAD DOCS",
  portal:         "INTERNAL/PORTAL",
};

/** All INTERNAL branches, parent-before-child, for folder scaffolding. */
export const INTERNAL_RECORD_BRANCHES = [
  "INTERNAL",
  "INTERNAL/CONTRACT",
  "INTERNAL/APPROVED PLANS",
  "INTERNAL/PERMITS & APPROVALS",
  "INTERNAL/ENGINEERING & REPORTS",
  "INTERNAL/SELECTIONS",
  "INTERNAL/RFQ",
  "INTERNAL/QUOTES",
  "INTERNAL/P.O",
  "INTERNAL/VARIATIONS",
  "INTERNAL/PROGRESS CLAIMS",
  "INTERNAL/INVOICES",
  "INTERNAL/SITE DIARY",
  "INTERNAL/SITE PHOTOS",
  "INTERNAL/SCHEDULE",
  "INTERNAL/WHS",
  "INTERNAL/WHS/INDUCTIONS",
  "INTERNAL/CORRESPONDENCE",
  "INTERNAL/CERTIFICATES & HANDOVER",
  "INTERNAL/PRESALE DOCS",
  "INTERNAL/LEAD DOCS",
  "INTERNAL/PORTAL",
];

/** job_documents.document_type per record category (069 enum vocabulary). */
const DOC_TYPE = {
  contract: "contract",
  variation: "variation_doc",
  progress_claim: "progress_claim",
  invoice: "invoice",
  plans: "architectural",
  engineering: "engineering",
  permit: "permit",
  certificate: "certificate",
  selections: "specification",
  presale: "fee_proposal",
  quote: "quote",
};

/** portal_documents.folder per record category (matches the 103 folder CHECK). */
const PORTAL_FOLDER = {
  contract: "contract",
  variation: "variations",
  progress_claim: "progress_claims",
  plans: "approved_plans",
  engineering: "engineering",
  selections: "selections",
  certificate: "certificates",
  invoice: "progress_claims",
};

function sanitizeFileName(name) {
  const base = String(name || "document")
    .trim()
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return base || "document";
}

/**
 * File a record into INTERNAL/<category>, and optionally register it as a
 * job_documents row (so the client portal can expose it).
 *
 * @param {object} a
 * @param {string} a.jobAddress  job address (resolves the Dropbox job root)
 * @param {string} [a.jobId]     jobs.id — required when register=true
 * @param {string} a.category    key of RECORD_FOLDERS
 * @param {string} a.fileName    file name (extension included)
 * @param {Buffer} a.buffer      file bytes
 * @param {boolean} [a.register] also write a job_documents row
 * @param {string} [a.title]     job_documents title (defaults to fileName)
 * @param {string} [a.documentType] override job_documents.document_type
 * @returns {Promise<{ok:boolean, storagePath?:string, jobDocumentId?:string|null, skipped?:string, error?:string}>}
 */
export async function fileJobRecord({ jobAddress, jobId, category, fileName, buffer, register = false, exposeToPortal = false, title, documentType }) {
  try {
    if (!dropboxConfigured()) return { ok: false, skipped: "dropbox-not-configured" };
    if (!jobAddress || !buffer) return { ok: false, error: "jobAddress and buffer are required" };
    const sub = RECORD_FOLDERS[category];
    if (!sub) return { ok: false, error: `unknown record category: ${category}` };

    const rel = `${sharedJobRootPath(jobAddress)}/${sub}/${sanitizeFileName(fileName)}`;
    const token = await getDropboxAccessToken();
    await ensureParentFoldersForFile(token, rel);
    const meta = await dropboxUploadBuffer(token, rel, buffer, { autorename: true });
    const storagePath = meta?.path_display || meta?.path_lower || rel;

    let jobDocumentId = null;
    if (register && jobId) {
      const sb = getServiceSupabase();
      if (sb) {
        const { data, error } = await sb
          .from("job_documents")
          .insert({
            job_id: jobId,
            document_type: documentType || DOC_TYPE[category] || "other",
            title: title || sanitizeFileName(fileName),
            storage_provider: "dropbox",
            storage_path: storagePath,
            status: "current",
          })
          .select("id")
          .maybeSingle();
        if (error) console.warn("[jobRecordsFiler] job_documents register skipped:", error.message);
        else jobDocumentId = data?.id || null;
      }
    }

    // Optionally surface the filed doc directly in the client's Documents tab (a
    // client-visible portal_documents row) — so a variation/claim PDF appears
    // automatically instead of waiting for a manual expose-document click.
    if (exposeToPortal && jobId && storagePath) {
      const sbx = getServiceSupabase();
      if (sbx) {
        const { data: proj } = await sbx.from("projects").select("id, portal_v2_enabled").eq("job_id", jobId).maybeSingle();
        if (proj && proj.portal_v2_enabled === true) {
          await sbx.from("portal_documents").insert({
            project_id: proj.id,
            job_document_id: jobDocumentId || null,
            folder: PORTAL_FOLDER[category] || "approved_plans",
            title: title || sanitizeFileName(fileName),
            storage_provider: "dropbox",
            storage_path: storagePath,
            client_visible: true,
          }).then(() => {}, (e) => console.warn("[jobRecordsFiler] portal expose skipped:", e?.message || e));
        }
      }
    }
    return { ok: true, storagePath, jobDocumentId };
  } catch (e) {
    console.warn("[jobRecordsFiler] fileJobRecord:", e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}
