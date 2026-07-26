/**
 * quoteInboxSuggest.mjs — best-guess match for a Quote Inbox row (unmatched quote email).
 *
 * The AUTO matcher already declined these (a wrong auto-match is worse than none), so here we compute
 * a human-facing SUGGESTION with a heuristic confidence, reusing the same exported matcher primitives:
 *   sender email → the sub's open RFQ(s)  (strongest), then an address hint in the subject → the job.
 * The UI pre-ticks a high-confidence suggestion; staff always confirm.
 */
import { findSenderSubcontractorCandidates, extractAddressHintFromSubject, fuzzyAddressMatch } from "./imapQuoteMatch.mjs";

// "Open" = out for a quote (could still receive one). Excludes declined/awarded etc.
const OPEN_RFQ_STATUSES = ["sent", "received", "reminded", "followed_up", "quoted"];

/** Load open RFQs (sub + job address joined) once, for a batch of rows. */
export async function loadOpenRfqsForSuggest(sb) {
  if (!sb) return [];
  const { data } = await sb
    .from("rfqs")
    .select("id, job_id, trade, subcontractor_id, status, subcontractors(business_name, email), jobs(address)")
    .in("status", OPEN_RFQ_STATUSES);
  return data || [];
}

function subName(r) { return r?.subcontractors?.business_name || "this subcontractor"; }

function mk(rfq, confidence, reason, { rfqUncertain = false } = {}) {
  return {
    jobId: rfq.job_id,
    jobAddress: rfq.jobs?.address || "",
    rfqId: rfqUncertain ? null : rfq.id,       // null when we know the job but not the exact RFQ/trade
    trade: rfq.trade || "",
    subName: rfq.subcontractors?.business_name || "",
    confidence,                                 // 0..1 heuristic
    reason,
  };
}

/** Best suggestion for one unmatched row, or null. */
export function suggestForRow(row, openRfqs) {
  const fromEmail = row?.from_email || "";
  const subject = String(row?.subject || "");
  const rows = openRfqs || [];

  // 1) Sender email → subcontractor's open RFQ(s) — the strongest, most common signal.
  const bySender = findSenderSubcontractorCandidates(fromEmail, rows);
  if (bySender.length === 1) {
    return mk(bySender[0], 0.94, "Sender matches this subcontractor's open RFQ");
  }
  if (bySender.length > 1) {
    const hint = extractAddressHintFromSubject(subject);
    const narrowed = hint ? bySender.filter((r) => fuzzyAddressMatch(r?.jobs?.address || "", hint)) : [];
    if (narrowed.length === 1) return mk(narrowed[0], 0.85, "Sender + address in the subject");
    return mk(bySender[0], 0.6, `Sender matches ${subName(bySender[0])} — confirm the trade`, { rfqUncertain: true });
  }

  // 2) No sender match — address hint in the subject → a job.
  const hint = extractAddressHintFromSubject(subject);
  if (hint) {
    const jobHit = rows.find((r) => fuzzyAddressMatch(r?.jobs?.address || "", hint));
    if (jobHit) return mk(jobHit, 0.45, "Address in the subject line", { rfqUncertain: true });
  }
  return null;
}

/** Attach a `suggestion` to each row (loads open RFQs once). Fail-soft: no suggestion on any error. */
export async function attachSuggestions(sb, rows) {
  try {
    const openRfqs = await loadOpenRfqsForSuggest(sb);
    return (rows || []).map((r) => ({ ...r, suggestion: suggestForRow(r, openRfqs) }));
  } catch {
    return (rows || []).map((r) => ({ ...r, suggestion: null }));
  }
}
