// classifyInboundQuoteEmail — is this inbound email plausibly a subcontractor QUOTE, or is it junk
// that must never reach the Quote Inbox (unmatched_quote_emails)?
//
// The office mailbox the IMAP quote-poller reads also receives (a) client-portal notifications —
// the portal emails admin@ on every client action ("Client approved a variation — …", "Client
// signed a document — …") — and (b) hardening test artifacts (BLH TEST / __DRYRUN / __DEMO). None
// of these are subcontractor quotes, yet the poller was writing every no-RFQ-match email to the
// Quote Inbox, so the badge sat at ~76 rows of almost-entirely junk (live check, 2026-07).
//
// Direct mirror of financeRoutes.classifyInboxDoc (the finance poller's invoice-vs-quote gate): a
// deterministic net over the signals the poller actually has (from address, subject, body) that
// only classifies AWAY from "quote" on a CLEAR junk signal. Safer to keep a stray email for manual
// triage than to silently drop a real subcontractor quote — anything that still looks like a quote
// falls through to "quote" and is captured exactly as before.
//
// Returns { category, reason }:
//   "quote"               → ingest (write the unmatched row)                    ← the default
//   "test_artifact"       → skip: BLH TEST / __DRYRUN / __DEMO / hardening markers
//   "portal_notification" → skip: client-portal notification (variation approval, signing, …)
//   "self_sent"           → skip: sent from our own company domain (never a sub quote)

// The company's own email domain(s). A genuine subcontractor quote always originates from the sub's
// own domain — anything from ours is a self-send / notification, not a quote.
export const COMPANY_EMAIL_DOMAINS = ["blueleafbuilding.com.au"];

// Test-artifact markers, matched ANYWHERE in the from/subject/body (unanchored — a marker sits
// mid-subject, e.g. "Client approved a variation — BLH TEST W18 NOTIFY 1782999317959"). Kept in
// step with scripts/lib/testArtifactPrefixes.mjs, which anchors ^ for Dropbox folder names; here
// the marker is embedded, so we search rather than anchor.
const TEST_MARKER_RE = /BLH\s*TEST|__BLH[ _]?TEST|__HARDENING\s*TEST|__DRYRUN|__DEMO|__E2E|__RFQ\s*TEST|__BATCH|__P0A5|\bW\d+\s+NOTIFY\b/i;

// Client-portal notification subjects the office mailbox receives (see portalV2Routes.mjs — the
// portal emails admin@ on client actions). All start with "Client …" or "New portal message …" and
// are never subcontractor quotes. Anchored to the subject start so a quote whose BODY happens to
// mention a variation is not mis-hit.
const PORTAL_NOTIFY_SUBJECT_RE = /^\s*(?:client (?:approved|declined|marked|signed|confirmed|can'?t)\b|new portal message\b|a variation needs your approval\b)/i;

/**
 * @param {{ fromEmail?: string, subject?: string, body?: string }} email
 * @param {{ companyDomains?: string[] }} [opts]
 * @returns {{ category: "quote"|"test_artifact"|"portal_notification"|"self_sent", reason: string }}
 */
export function classifyInboundQuoteEmail(
  { fromEmail = "", subject = "", body = "" } = {},
  { companyDomains = COMPANY_EMAIL_DOMAINS } = {}
) {
  const from = String(fromEmail || "").toLowerCase().trim();
  const subj = String(subject || "");
  const hay = `${from} ${subj} ${String(body || "")}`;

  // 1. Test artifacts — highest confidence. Marker may sit anywhere in from/subject/body.
  if (TEST_MARKER_RE.test(hay)) {
    return { category: "test_artifact", reason: "test marker (BLH TEST / __DRYRUN / __DEMO …)" };
  }

  // 2. Client-portal notifications — subject-driven (builder notifications, never a quote).
  if (PORTAL_NOTIFY_SUBJECT_RE.test(subj)) {
    return { category: "portal_notification", reason: "client-portal notification subject" };
  }

  // 3. Self-sent from our own company domain — a subcontractor quote never comes from us.
  const domain = from.includes("@") ? from.split("@").pop() : "";
  if (domain && companyDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return { category: "self_sent", reason: `sent from company domain @${domain}` };
  }

  return { category: "quote", reason: "" };
}

/**
 * Convenience boolean — true only for emails that plausibly ARE subcontractor quotes.
 * @param {{ fromEmail?: string, subject?: string, body?: string }} email
 * @param {{ companyDomains?: string[] }} [opts]
 */
export function shouldIngestUnmatchedQuote(email, opts) {
  return classifyInboundQuoteEmail(email, opts).category === "quote";
}
