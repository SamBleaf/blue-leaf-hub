/** Durable RFQ Ref token for outbound emails — survives replies and forwards (L1 matcher tier). */

export function rfqRefLine(rfqId) {
  const id = String(rfqId || "").trim();
  if (!id) return null;
  const tok = id.length > 8 ? id.slice(0, 8) : id;
  return `Ref: BLH-RFQ-${tok}`;
}

/** Append Ref line to plain-text body unless a BLH-RFQ token is already present. */
export function appendRfqRefToBody(body, rfqId) {
  const text = String(body ?? "");
  if (!String(rfqId || "").trim()) return text;
  if (/BLH-RFQ-[0-9a-f]{8,36}/i.test(text)) return text;
  const ref = rfqRefLine(rfqId);
  if (!ref) return text;
  return `${text.trimEnd()}\n\n${ref}`;
}

/** Non-Message-ID headers for Resend/Gmail/SMTP — paired with visible Ref line in body. */
export function rfqRefHeaders(rfqId) {
  const id = String(rfqId || "").trim();
  if (!id) return {};
  return { "X-BlueLeaf-RFQ-ID": id };
}
