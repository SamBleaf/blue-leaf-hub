/**
 * leadContractEvidence.mjs — the one place that decides whether a lead has its signed building contract on
 * file, and whether an upload really is a PDF. Evidence needs no column of its own: it is a lead_documents
 * row with document_type 'construction_contract' and a real storage_path (allowed since mig 194).
 */

export const CONTRACT_DOC_TYPE = "construction_contract";

/**
 * True when the lead has evidence on file. A failed read counts as no evidence, so the Won gate fails closed.
 * It trusts the row and doesn't re-check storage: only the Hub can write these rows (mig 217 refuses browser tokens).
 */
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

// Bytes the PDF format treats as white space. Readers tolerate these before the header and after the last %%EOF.
const isPdfSpace = (byte) => [0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20].includes(byte);
const PDF_EOF_WINDOW = 1024;

/**
 * Decode an uploaded base64 file (with or without a data-URL prefix) and confirm it is shaped like a complete
 * PDF. Returns the Buffer, or null when it is not one. The header must open the file and the last %%EOF must
 * close it, with only padding after it. A signed or incrementally saved PDF holds an earlier %%EOF, so a marker
 * somewhere in the file proves nothing. This catches wrong files and cut-off uploads. It can't detect a
 * deliberately forged PDF: it reads the file's shape, not its signatures.
 */
export function decodePdfUpload(base64) {
  if (typeof base64 !== "string" || !base64) return null;
  const raw = base64.includes(",") ? base64.split(",").pop() : base64;
  const buffer = Buffer.from(raw, "base64");
  if (!buffer.length) return null;
  let start = 0;
  while (start < buffer.length && isPdfSpace(buffer[start])) start += 1;
  if (!/^%PDF-\d\.\d/.test(buffer.subarray(start, start + 8).toString("latin1"))) return null;
  const eof = buffer.lastIndexOf("%%EOF");
  if (eof < 0) return null;
  const tail = buffer.subarray(eof + "%%EOF".length);
  if (tail.length > PDF_EOF_WINDOW || !tail.every(isPdfSpace)) return null;
  return buffer;
}
