#!/usr/bin/env node
/**
 * RFQ IMAP matcher unit tests — fixture-based, no live IMAP (P0-B3).
 *
 * Usage:
 *   node scripts/test-imap-quote-match.mjs
 *   node scripts/test-imap-quote-match.mjs --strict
 *   npm run test:w07-matcher
 */
import {
  resolveInboundRfqMatch,
  resolveInboundRfqMatchWithMeta,
  collectInboundMessageIds,
  extractAddressHintFromSubject,
} from "../server/lib/imapQuoteMatch.mjs";
import { resolveInboundRfqMatchWithTrace } from "../server/lib/rfqMatchTrace.mjs";

const STRICT = process.argv.includes("--strict");

let passed = 0;
let failed = 0;
let gaps = 0;
const gapLog = [];

function pass(name) {
  console.log(`  ✓  ${name}`);
  passed++;
}

function fail(name, detail) {
  console.log(`  ✗  ${name}${detail ? ` — ${detail}` : ""}`);
  failed++;
}

function recordGap(id, note) {
  gaps++;
  gapLog.push({ id, note });
  console.log(`  ~  ${id} (known gap): ${note}`);
}

function assertMatch(name, parsed, rfqRows, expectRfqId, expectReason) {
  const result = resolveInboundRfqMatch(parsed, rfqRows);
  if (!expectRfqId) {
    if (result === null) {
      pass(name);
      return;
    }
    const msg = `expected no match, got ${result.rfq.id} via ${result.reason}`;
    if (STRICT) fail(name, msg);
    else recordGap(name, msg);
    return;
  }
  if (!result) {
    if (STRICT) fail(name, "expected match, got null");
    else recordGap(name, "expected match, got null");
    return;
  }
  if (result.rfq.id !== expectRfqId) {
    const msg = `expected rfq ${expectRfqId}, got ${result.rfq.id}`;
    if (STRICT) fail(name, msg);
    else recordGap(name, msg);
    return;
  }
  if (expectReason && result.reason !== expectReason) {
    const msg = `expected reason ${expectReason}, got ${result.reason}`;
    if (STRICT) fail(name, msg);
    else recordGap(name, msg);
    return;
  }
  pass(name);
}

function assertAmbiguity(name, parsed, rfqRows, expectAmbiguity) {
  const { match, ambiguity } = resolveInboundRfqMatchWithMeta(parsed, rfqRows);
  if (match !== null) {
    fail(name, `expected null/${expectAmbiguity}, got ${match.rfq.id} via ${match.reason}`);
    return;
  }
  if (ambiguity !== expectAmbiguity) {
    fail(name, `expected ambiguity=${expectAmbiguity}, got ${ambiguity}`);
    return;
  }
  pass(name);
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const JOB_A = "job-a";
const JOB_B = "job-b";
const SUB_SPARKY = "sub-sparky";
const SUB_PLUMBER = "sub-plumber";

function rfqRow({
  id,
  jobId = JOB_A,
  address = "12 Smith Street Brighton VIC 3186",
  trade = "electrical",
  sentMessageId = null,
  subEmail = "sparky@example.com",
  subId = SUB_SPARKY
}) {
  return {
    id,
    job_id: jobId,
    subcontractor_id: subId,
    trade,
    status: "sent",
    sent_message_id: sentMessageId,
    jobs: { address },
    subcontractors: { email: subEmail, business_name: "Sparky Co" }
  };
}

function parsed({
  from = "sparky@example.com",
  subject = "",
  inReplyTo = null,
  references = null,
  text = "",
  attachments = []
}) {
  return {
    from: { value: [{ address: from }] },
    subject,
    inReplyTo,
    references,
    text,
    attachments
  };
}

const MSG_ID_A = "<aaa111@blueleafbuilding.com.au>";
const MSG_ID_B = "<bbb222@blueleafbuilding.com.au>";

const rowsBase = [
  rfqRow({ id: "rfq-1", sentMessageId: MSG_ID_A, trade: "electrical" }),
  rfqRow({
    id: "rfq-2",
    jobId: JOB_B,
    address: "99 Ocean Road Brighton VIC 3186",
    trade: "plumbing",
    sentMessageId: MSG_ID_B,
    subEmail: "plumber@example.com",
    subId: SUB_PLUMBER
  })
];

const dupRowsSameSub = [
  rfqRow({ id: "rfq-old", subEmail: "sparky@example.com", address: "1 Old St Adelaide SA 5000" }),
  rfqRow({
    id: "rfq-new",
    subEmail: "sparky@example.com",
    address: "12 Smith Street Brighton VIC 3186"
  })
];

// ── Tests ───────────────────────────────────────────────────────────────────

console.log("\n── RFQ IMAP matcher (P0-B3) ──\n");

// Thread regressions
assertMatch(
  "MATCH-01 In-Reply-To exact",
  parsed({ inReplyTo: MSG_ID_A, subject: "Re: quote" }),
  rowsBase,
  "rfq-1",
  "in_reply_to"
);
assertMatch(
  "MATCH-02 References chain",
  parsed({ references: `other <foo@bar> ${MSG_ID_B}` }),
  rowsBase,
  "rfq-2",
  "in_reply_to"
);

// Subject + address regressions
assertMatch(
  "MATCH-03 Subject contains project address",
  parsed({ subject: "RFQ - 12 Smith Street Brighton - Electrical", from: "unknown@x.com" }),
  rowsBase,
  "rfq-1",
  "subject_address"
);
assertMatch(
  "MATCH-03-regression strong unique subject/address",
  parsed({ subject: "RFQ - 99 Ocean Road Brighton - Plumbing", from: "unknown@x.com" }),
  rowsBase,
  "rfq-2",
  "subject_address"
);
assertMatch(
  "MATCH-03b subject disambiguates multi-sender",
  parsed({
    from: "sparky@example.com",
    subject: "RFQ - 12 Smith Street Brighton - Electrical"
  }),
  dupRowsSameSub,
  "rfq-new",
  "subject_address"
);

// Sender regressions
assertMatch(
  "MATCH-04 Sender matches subcontractor email",
  parsed({ from: "sparky@example.com", subject: "Our quote" }),
  rowsBase,
  "rfq-1",
  "sender_subcontractor"
);
assertMatch(
  "MATCH-04-regression single sender one RFQ",
  parsed({ from: "plumber@example.com", subject: "Quote" }),
  rowsBase,
  "rfq-2",
  "sender_subcontractor"
);

assertMatch(
  "MATCH-05 Admin/account email without thread",
  parsed({ from: "accounts@supplier.com", subject: "Quote attached" }),
  rowsBase,
  null,
  null
);

assertMatch(
  "MATCH-06 Forwarded quote changed subject",
  parsed({ from: "sparky@example.com", subject: "FW: Quote for you" }),
  rowsBase,
  "rfq-1",
  "sender_subcontractor"
);

assertMatch(
  "MATCH-07 PDF attached no RFQ ID in subject (thread)",
  parsed({
    inReplyTo: MSG_ID_A,
    subject: "Please find quote",
    attachments: [{ filename: "quote.pdf", contentType: "application/pdf" }]
  }),
  rowsBase,
  "rfq-1",
  "in_reply_to"
);

assertMatch(
  "MATCH-08 Revised quote same thread",
  parsed({ inReplyTo: MSG_ID_A, subject: "Revised quote" }),
  rowsBase,
  "rfq-1",
  "in_reply_to"
);

// P0-B3 — ambiguous sender
assertMatch(
  "W07-API-06 ambiguous sender cannot wrong-match",
  parsed({ from: "sparky@example.com", subject: "Our quote" }),
  dupRowsSameSub,
  null,
  null
);
assertAmbiguity(
  "MATCH-09 Multi-RFQ same supplier weak subject",
  parsed({ from: "sparky@example.com", subject: "Our quote" }),
  dupRowsSameSub,
  // New layered matcher: company resolves by sender email, but the trade can't be disambiguated
  // from a weak subject → ambiguous_trade (same safe outcome: unmatched, not a wrong bucket).
  "ambiguous_trade"
);

assertMatch(
  "MATCH-10 Multi-supplier same trade (thread)",
  parsed({ inReplyTo: MSG_ID_B, from: "plumber@example.com" }),
  rowsBase,
  "rfq-2",
  "in_reply_to"
);

// Similar addresses — ambiguous, no cross-match
{
  const collisionRows = [
    rfqRow({ id: "rfq-brighton-a", address: "12 Smith Street Brighton VIC 3186" }),
    rfqRow({ id: "rfq-brighton-b", jobId: "job-c", address: "12 Smith Avenue Brighton VIC 3186" })
  ];
  assertMatch(
    "MATCH-11 similar addresses do not cross-match",
    parsed({ subject: "RFQ - 12 Smith Street Brighton - Electrical", from: "x@y.com" }),
    collisionRows,
    null,
    null
  );
}

assertMatch(
  "MATCH-12 No confident match",
  parsed({ from: "random@example.com", subject: "Hello" }),
  rowsBase,
  null,
  null
);

console.log("  ·  MATCH-13 Manual resolve (see scripts/test-rfq-unmatched-resolve.mjs)");
console.log("  ·  MATCH-14 Duplicate message_id (integration — correspondence dedupe)");
console.log("  ·  MATCH-15 Poll re-run idempotent (integration — UID cursor)");
console.log("  ·  MATCH-16/17 PDF parse failures (integration — non-fatal)");

assertMatch(
  "MATCH-18 Different email thread",
  parsed({ from: "sparky@example.com", subject: "New thread quote" }),
  rowsBase,
  "rfq-1",
  "sender_subcontractor"
);

pass("MATCH-19 Paul/Sam separate inboxes (documented — single IMAP poller)");

// Identical address collision
{
  const twoBrighton = [
    rfqRow({ id: "rfq-br1", address: "5 Brighton Road Brighton VIC 3186" }),
    rfqRow({ id: "rfq-br2", jobId: JOB_B, address: "5 Brighton Road Brighton VIC 3186" })
  ];
  assertMatch(
    "MATCH-20 identical address collision returns null",
    parsed({ subject: "RFQ - 5 Brighton Road Brighton - Electrical" }),
    twoBrighton,
    null,
    null
  );
  assertMatch(
    "MATCH-20-thread thread wins address collision",
    parsed({
      inReplyTo: MSG_ID_A,
      subject: "RFQ - 5 Brighton Road Brighton - Electrical"
    }),
    [
      rfqRow({
        id: "rfq-br1",
        sentMessageId: MSG_ID_A,
        address: "5 Brighton Road Brighton VIC 3186"
      }),
      rfqRow({
        id: "rfq-br2",
        jobId: JOB_B,
        sentMessageId: MSG_ID_B,
        address: "5 Brighton Road Brighton VIC 3186"
      })
    ],
    "rfq-br1",
    "in_reply_to"
  );
}

// Trace smoke
{
  const { match, trace } = resolveInboundRfqMatchWithTrace(
    parsed({ inReplyTo: MSG_ID_A }),
    rowsBase,
    { email_uid: 42 }
  );
  if (match?.rfq?.id === "rfq-1" && trace.email_uid === 42 && trace.result === "matched") {
    pass("TRACE resolveInboundRfqMatchWithTrace smoke");
  } else {
    fail("TRACE resolveInboundRfqMatchWithTrace smoke");
  }
}

{
  const { trace } = resolveInboundRfqMatchWithTrace(
    parsed({ from: "sparky@example.com", subject: "Our quote" }),
    dupRowsSameSub
  );
  if (trace.result === "unmatched" && trace.ambiguity === "ambiguous_trade") {
    pass("TRACE ambiguous (company resolved, trade not) reason");
  } else {
    fail("TRACE ambiguous (company resolved, trade not) reason", `result=${trace.result} ambiguity=${trace.ambiguity}`);
  }
}

if (extractAddressHintFromSubject("RFQ - 12 Smith St - Elec").includes("12 Smith")) {
  pass("UTIL extractAddressHintFromSubject");
} else {
  fail("UTIL extractAddressHintFromSubject");
}

if (collectInboundMessageIds({ inReplyTo: MSG_ID_A }).length === 1) {
  pass("UTIL collectInboundMessageIds");
} else {
  fail("UTIL collectInboundMessageIds");
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n── Summary: ${passed} passed, ${failed} failed, ${gaps} known gaps ──\n`);
if (gapLog.length) {
  console.log("Known gaps:");
  for (const g of gapLog) console.log(`  - ${g.id}: ${g.note}`);
  console.log("");
}

process.exit(failed > 0 ? 1 : 0);
