/**
 * leadContractEvidence.mjs — the one place that decides whether a lead has its signed building contract on
 * file, and whether an upload really is a PDF. Evidence needs no column of its own: it is a lead_documents
 * row with document_type 'construction_contract' and a real storage_path (allowed since mig 194).
 */

export const CONTRACT_DOC_TYPE = "construction_contract";

/** True when the lead has evidence on file. A failed read counts as no evidence, so the Won gate fails closed. */
export async function contractEvidencePresent(sb, leadId) {
  const { data, error } = await sb.from("lead_documents").select("id")
    .eq("lead_id", leadId).eq("document_type", CONTRACT_DOC_TYPE)
    .not("storage_path", "is", null).neq("storage_path", "").limit(1);
  if (error) {
    console.warn("[contract-evidence] read failed:", error.message);
    return false;
  }
  return (data || []).length > 0;
}

/** Returns the lead with the derived `contract_evidence_present` boolean attached. */
export async function withContractEvidence(sb, lead) {
  if (!lead) return lead;
  return { ...lead, contract_evidence_present: await contractEvidencePresent(sb, lead.id) };
}

/**
 * Decode an uploaded base64 file (with or without a data-URL prefix) and confirm it looks like a complete
 * PDF. Returns the Buffer, or null when it is not one. Checks the header and the end-of-file marker, which
 * catches the usual wrong uploads (Word files, photos) and truncated files.
 */
export function decodePdfUpload(base64) {
  if (typeof base64 !== "string" || !base64) return null;
  const raw = base64.includes(",") ? base64.split(",").pop() : base64;
  const buffer = Buffer.from(raw, "base64");
  if (!buffer.length) return null;
  if (!buffer.subarray(0, 1024).includes("%PDF-")) return null;
  if (!buffer.includes("%%EOF")) return null;
  return buffer;
}
