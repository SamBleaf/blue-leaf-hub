// =============================================================================
// tenderSubmissions — write helpers for the quote-submission model (mig 154).
// Reused by: the inbound quote poller (dual-write cutover), the correction UI, and the
// future matcher. A submission is a versioned commercial quote for an rfq (invitation);
// creating one NEVER overwrites an earlier version. Spec: docs/plans/TENDER_SCHEMA_AND_MIGRATION.md.
// =============================================================================
import crypto from "node:crypto";
import { dropboxDownloadBuffer } from "./dropboxClient.mjs";

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// Create a NEW submission version for an rfq. Idempotent per (rfq_id, source_message_id) so a
// re-polled email doesn't duplicate. Version allocated with retry against UNIQUE(rfq_id, version)
// (handles a concurrent insert race without a raw transaction — amendment #8).
export async function createInboundSubmission(sb, {
  rfqId, extractedAmountExGst = null, extraction = null, correspondenceId = null,
  sourceMessageId = null, emailFrom = null, matchConfidence = null, receivedAt = null,
  subScopeLabel = null, status = "received",
}) {
  if (!rfqId) throw new Error("rfqId is required");
  if (sourceMessageId) {
    const { data: dup } = await sb.from("rfq_quote_submissions")
      .select("id, version").eq("rfq_id", rfqId).eq("source_message_id", sourceMessageId).maybeSingle();
    if (dup) return { submission: dup, created: false };
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: mx } = await sb.from("rfq_quote_submissions")
      .select("version").eq("rfq_id", rfqId).order("version", { ascending: false }).limit(1).maybeSingle();
    const version = (Number(mx?.version) || 0) + 1;
    const { data, error } = await sb.from("rfq_quote_submissions").insert({
      rfq_id: rfqId, version, status, verification_status: "unverified",
      extracted_amount_ex_gst: extractedAmountExGst, tax_basis: "ex_gst",
      extraction, correspondence_id: correspondenceId, source_message_id: sourceMessageId,
      email_from: emailFrom, match_confidence: matchConfidence, received_at: receivedAt,
      sub_scope_label: subScopeLabel,
    }).select("id, version").single();
    if (!error) return { submission: data, created: true };
    if (error.code === "23505") continue;   // version race — recompute + retry
    throw error;
  }
  throw new Error("Could not allocate a submission version after retries.");
}

// Attach a file to a submission. Dedupes by (submission_id, checksum) when a checksum can be
// computed (dropboxToken + storagePath). Best-effort checksum — never blocks the write.
export async function addSubmissionAttachment(sb, {
  submissionId, filename = null, storagePath = null, pdfUrl = null, isPrimary = false,
  role = "quote", dropboxToken = null,
}) {
  let checksum = null, sizeBytes = null;
  if (dropboxToken && storagePath) {
    try { const buf = await dropboxDownloadBuffer(dropboxToken, storagePath); checksum = sha256(buf); sizeBytes = buf.length; }
    catch { /* best-effort */ }
  }
  if (checksum) {
    const { data: dup } = await sb.from("rfq_quote_attachments")
      .select("id").eq("submission_id", submissionId).eq("checksum", checksum).maybeSingle();
    if (dup) return { attachment: dup, created: false };
  }
  const { data, error } = await sb.from("rfq_quote_attachments").insert({
    submission_id: submissionId, filename, storage_path: storagePath, pdf_url: pdfUrl,
    is_primary: !!isPrimary, role, mime_type: "application/pdf", size_bytes: sizeBytes,
    checksum, extraction_status: "na",
  }).select("id").single();
  if (error) throw error;
  return { attachment: data, created: true };
}
