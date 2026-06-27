/**
 * Resolve submitted quote PDF for PO issue email attachment (W11).
 * Non-blocking: returns null attachment + warning when unavailable.
 */
import {
  dropboxConfigured,
  dropboxDownloadBuffer,
  dropboxDownloadSharedLink,
  getDropboxAccessToken,
} from "./dropboxClient.mjs";

function quoteFileNameFromPath(path) {
  const p = String(path || "").trim().replace(/\\/g, "/");
  if (!p) return "submitted-quote.pdf";
  const base = p.split("/").pop() || "submitted-quote.pdf";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

function formatReceivedDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-AU");
  } catch {
    return "";
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} rfqId
 */
export async function resolveRfqQuotePdfForPo(sb, rfqId) {
  const id = String(rfqId || "").trim();
  if (!id || !sb) {
    return { attachment: null, reference: null, warning: null };
  }

  const { data: rfq, error } = await sb
    .from("rfqs")
    .select("id, trade, quote_pdf_path, quote_pdf_url, dropbox_pdf_url, received_at, quote_amount")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!rfq) {
    return { attachment: null, reference: null, warning: "RFQ not found for quote attachment" };
  }

  const hasPath = Boolean(String(rfq.quote_pdf_path || "").trim());
  const hasUrl = Boolean(String(rfq.quote_pdf_url || rfq.dropbox_pdf_url || "").trim());
  const fileName = hasPath ? quoteFileNameFromPath(rfq.quote_pdf_path) : hasUrl ? "submitted-quote.pdf" : "Unavailable";
  const referenceBase = {
    fileName,
    receivedDate: formatReceivedDate(rfq.received_at),
    acceptedAmountExGst:
      rfq.quote_amount != null && Number(rfq.quote_amount) > 0 ? Number(rfq.quote_amount) : null,
    attachmentStatus: "Not available",
  };

  const pdfPath = String(rfq.quote_pdf_path || "").trim();
  const sharedUrl = String(rfq.quote_pdf_url || rfq.dropbox_pdf_url || "").trim();

  if (!pdfPath && !sharedUrl) {
    return {
      attachment: null,
      reference: referenceBase,
      warning: "No quote PDF path or URL on RFQ",
    };
  }

  if (!dropboxConfigured()) {
    return {
      attachment: null,
      reference: {
        ...referenceBase,
        fileName: quoteFileNameFromPath(pdfPath || sharedUrl),
      },
      warning: "Dropbox not configured — quote PDF not attached",
    };
  }

  let buffer = null;
  let lastErr = "";
  try {
    const token = await getDropboxAccessToken();
    if (pdfPath) {
      try {
        buffer = await dropboxDownloadBuffer(token, pdfPath);
      } catch (e) {
        lastErr = e?.message || String(e);
      }
    }
    if (!buffer?.length && sharedUrl) {
      try {
        buffer = await dropboxDownloadSharedLink(token, sharedUrl);
      } catch (e) {
        lastErr = e?.message || String(e);
      }
    }
  } catch (e) {
    lastErr = e?.message || String(e);
  }

  if (!buffer?.length) {
    return {
      attachment: null,
      reference: {
        ...referenceBase,
        fileName: quoteFileNameFromPath(pdfPath || sharedUrl),
      },
      warning: lastErr ? `Quote PDF download failed: ${lastErr}` : "Quote PDF download failed",
    };
  }

  return {
    attachment: {
      filename: fileName,
      content: buffer,
      mimeType: "application/pdf",
    },
    reference: {
      ...referenceBase,
      fileName: quoteFileNameFromPath(pdfPath || sharedUrl),
      attachmentStatus: "Included with PO email",
    },
    warning: null,
  };
}
