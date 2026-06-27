import {
  collectInboundMessageIds,
  resolveInboundRfqMatchWithMeta,
  maybeFirstAddress,
} from "./imapQuoteMatch.mjs";

/** @returns {boolean} */
export function isRfqMatchDebugEnabled() {
  return /^(1|true|yes)$/i.test(String(process.env.RFQ_MATCH_DEBUG || "").trim());
}

function summarizeAttachments(parsed) {
  const atts = parsed?.attachments || [];
  return {
    attachment_count: atts.length,
    attachment_types: atts.map((a) => String(a?.contentType || a?.filename || "unknown").slice(0, 120))
  };
}

function summarizeCandidates(rfqRows) {
  return (rfqRows || []).slice(0, 30).map((r) => ({
    rfq_id: r.id,
    job_id: r.job_id,
    trade: r.trade,
    has_sent_message_id: Boolean(r.sent_message_id),
    address: r.jobs?.address ? String(r.jobs.address).slice(0, 100) : null,
    sub_email: r.subcontractors?.email || null
  }));
}

/**
 * Resolve inbound RFQ match with structured trace for RFQ_MATCH_DEBUG logging.
 * @returns {{ match: { rfq, reason } | null, trace: object }}
 */
export function resolveInboundRfqMatchWithTrace(parsed, rfqRows, context = {}) {
  const emailUid = context.email_uid ?? null;
  const trace = {
    email_uid: emailUid,
    from_email: maybeFirstAddress(parsed),
    subject: String(parsed?.subject || "").slice(0, 500),
    message_id: parsed?.messageId || null,
    in_reply_to: parsed?.inReplyTo ?? null,
    references: parsed?.references ?? null,
    inbound_thread_ids: collectInboundMessageIds(parsed),
    ...summarizeAttachments(parsed),
    candidate_rfq_count: (rfqRows || []).length,
    candidate_rfq_ids: (rfqRows || []).slice(0, 50).map((r) => r.id),
    candidates: summarizeCandidates(rfqRows),
    linked_recipient_id: null,
    linked_package_id: null,
    match_method: null,
    match_reason: null,
    ambiguity: null,
    confidence: null,
    matched_rfq_id: null,
    result: null,
    rows_updated: null
  };

  const { match, ambiguity } = resolveInboundRfqMatchWithMeta(parsed, rfqRows);
  if (match) {
    trace.match_method = match.reason;
    trace.confidence =
      match.reason === "in_reply_to" ? "high" : match.reason === "subject_address" ? "medium" : "low";
    trace.match_reason =
      match.reason === "in_reply_to"
        ? "In-Reply-To/References matched rfqs.sent_message_id"
        : match.reason === "subject_address"
          ? "Subject address fuzzy match (unique score >= 4)"
          : "Sender email matched single open RFQ subcontractor";
    trace.matched_rfq_id = match.rfq.id;
    trace.result = "matched";
    return { match, trace };
  }

  trace.result = "unmatched";
  if (ambiguity) {
    trace.ambiguity = ambiguity;
    trace.match_reason =
      ambiguity === "ambiguous_sender"
        ? "Multiple open RFQs for sender; no unique subject/address match"
        : "Multiple RFQs matched subject/address equally";
  } else {
    trace.match_reason = "No thread, subject/address, or sender match";
  }
  return { match: null, trace };
}

/** Enrich trace with package recipient link after DB lookup. */
export function enrichTraceWithRecipientLink(trace, recipientRow) {
  if (!recipientRow) return trace;
  return {
    ...trace,
    linked_recipient_id: recipientRow.id || null,
    linked_package_id: recipientRow.package_id || null
  };
}

/** One-line JSON log when RFQ_MATCH_DEBUG=true */
export function logRfqMatchTrace(trace) {
  if (!isRfqMatchDebugEnabled()) return;
  console.log("[rfq-match]", JSON.stringify(trace));
}
