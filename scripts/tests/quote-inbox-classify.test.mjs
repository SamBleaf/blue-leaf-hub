// classifyInboundQuoteEmail — junk-vs-quote gate for the inbound-quote IMAP poller / Quote Inbox.
// Cases are the REAL live rows from the ~76-row Quote Inbox (2026-07): client-portal variation
// notifications + hardening test artifacts polluting the badge, with the one genuine quote kept.
// Run: node scripts/tests/quote-inbox-classify.test.mjs
import { classifyInboundQuoteEmail } from "../../server/lib/quoteInboxClassify.mjs";

let pass = 0, fail = 0;
function is(email, expected, name) {
  const got = classifyInboundQuoteEmail(email).category;
  if (got === expected) pass++;
  else { fail++; console.error(`  ✗ ${name}\n      expected ${expected}, got ${got}`); }
}

// ── Test artifacts that must be SKIPPED (the bulk of the junk) ──
is({ fromEmail: "admin@blueleafbuilding.com.au", subject: "Client approved a variation — BLH TEST W18 NOTIFY 1782999317959 2 Forrest Ave" }, "test_artifact", "portal variation notify carrying a BLH TEST marker");
is({ fromEmail: "someone@example.com", subject: "__DRYRUN_ 21 Folkstone Rd" }, "test_artifact", "__DRYRUN_ artifact");
is({ fromEmail: "someone@example.com", subject: "__DEMO 21 Folkstone Rd, Brighton" }, "test_artifact", "__DEMO artifact");
is({ fromEmail: "someone@example.com", subject: "BLH TEST W18 something" }, "test_artifact", "BLH TEST prefix");
is({ fromEmail: "x@y.com", subject: "Re: W18 NOTIFY 1782999317959" }, "test_artifact", "bare W18 NOTIFY timestamp marker");

// ── Client-portal notifications that must be SKIPPED (never subcontractor quotes) ──
is({ fromEmail: "admin@blueleafbuilding.com.au", subject: "Client approved a variation — 2 Forrest Avenue, Marino" }, "portal_notification", "genuine portal variation-approval notify");
is({ fromEmail: "admin@blueleafbuilding.com.au", subject: "Client marked payment sent — 2 Forrest Avenue" }, "portal_notification", "portal payment-sent notify");
is({ fromEmail: "admin@blueleafbuilding.com.au", subject: "Client signed a document — 2 Forrest Avenue" }, "portal_notification", "portal document-signed notify");
is({ fromEmail: "admin@blueleafbuilding.com.au", subject: "New portal message — 2 Forrest Avenue" }, "portal_notification", "portal new-message notify");

// ── Self-sent from the company domain that must be SKIPPED ──
// The one row that "looked real" was Sam's own Quote-Request thread echoing back into the inbox —
// still not a subcontractor's quote (a sub never emails from @blueleafbuilding.com.au).
is({ fromEmail: "sam@blueleafbuilding.com.au", subject: "Re: Quote Request – 2 Forrest Avenue, Marino – Excavation" }, "self_sent", "self-sent Quote Request from sam@");
is({ fromEmail: "estimating@mail.blueleafbuilding.com.au", subject: "quote attached" }, "self_sent", "company subdomain is still self-sent");

// ── Real subcontractor quotes that must be KEPT (fall through to "quote") ──
is({ fromEmail: "estimating@abcexcavations.com.au", subject: "Re: RFQ — Excavation & Footings — 2 Forrest Avenue, Marino" }, "quote", "genuine RFQ reply from an external sub");
is({ fromEmail: "joe@spellacyplumbing.com", subject: "Quote QU-0592 2 Forrest Ave Marino" }, "quote", "external plumber quote");
is({ fromEmail: "quotes@bluewaterbuilding.com.au", subject: "Quotation for 2 Forrest Avenue" }, "quote", "similarly-named external domain is NOT our company domain");
// A genuine quote whose BODY mentions a variation must NOT be mis-hit — the portal net is subject-anchored.
is({ fromEmail: "sub@trade.com", subject: "Quote — 2 Forrest Ave", body: "Priced as per plans; any variation to be agreed in writing." }, "quote", "quote body mentioning 'variation' stays a quote");

console.log(`quote-inbox-classify: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
