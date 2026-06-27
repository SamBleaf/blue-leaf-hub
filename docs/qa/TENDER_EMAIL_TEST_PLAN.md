# Tender Email Test Plan

**Status:** Phase 1 — expected behaviour defined; implementation in Phase 3  
**Matcher:** [`server/lib/imapQuoteMatch.mjs`](../../server/lib/imapQuoteMatch.mjs)  
**Poll handler:** [`server/dev-api.mjs`](../../server/dev-api.mjs) `processIncomingQuoteMessage`  
**Test runner (planned):** `scripts/test-imap-quote-match.mjs`

---

## How to use this document

Each scenario has:

- **Expected** — intended behaviour per source-of-truth model
- **Current** — what code does today (as of 2026-06-22 audit)
- **Gap** — DRIFT/BUG id if they differ
- **Test** — fixture-based unit (U), integration (I), or E2E (E)

**Rule:** Do not force tests to pass by weakening expectations. Log gaps in [BUG_REGISTER.md](./BUG_REGISTER.md).

---

## Matcher priority (reference)

1. `in_reply_to` — `In-Reply-To` / `References` vs `rfqs.sent_message_id`
2. `subject_address` — fuzzy address in subject vs `jobs.address` (score ≥ 4)
3. `sender_subcontractor` — exact `from` email vs `subcontractors.email`

---

## Scenarios

| # | Scenario | Expected | Current | Gap | Test |
|---|----------|----------|---------|-----|------|
| 1 | **Exact In-Reply-To** — supplier replies with `In-Reply-To` matching outbound `sent_message_id` | Match correct `rfqs` row; reason `in_reply_to`; update `rfqs` + propagate to `rfq_recipients` | Match `rfqs`; **no** recipient propagation | DRIFT-002 | U |
| 2 | **References chain** — match via `References` header containing original Message-ID | Same as #1 | Same as #1 (References parsed by `collectInboundMessageIds`) | DRIFT-002 | U |
| 3 | **Subject contains project address** — `RFQ - 12 Smith St - Electrical` | Match RFQ for job at that address; reason `subject_address` | Matches if fuzzy score ≥ 4; **no** job-id disambiguation if address collision | DRIFT-010 | U |
| 4 | **Sender matches subcontractor email** — reply from `subcontractors.email` | Match RFQ for that sub on correct job | First open RFQ with matching sub email wins | DRIFT-010 | U |
| 5 | **Supplier replies from admin/account email** (e.g. `accounts@supplier.com`) | **Unmatched** unless thread or address match — do not guess | May match wrong RFQ via sender if admin email happens to match a sub record | — | U — document business rule |
| 6 | **Forwarded quote, changed subject** — no threading headers | **Unmatched** → manual queue | May match via address/sender heuristics (risky) | — | U |
| 7 | **Quote PDF attached, no RFQ ID in subject** | Match via thread if available; else address/sender with confidence threshold; else unmatched | Same matchers; PDF processed after match | — | U + I |
| 8 | **Revised quote for same RFQ** — second reply same thread | Match same `rfqs`; update amounts/PDF; idempotent on `message_id` | Re-match updates `rfqs`; duplicate `message_id` skipped | — | U + I |
| 9 | **Multiple RFQs for same supplier** — same sub, different jobs/trades | Match by thread first; else highest subject_address score for correct job; never cross jobs | Sender match returns **first** candidate | DRIFT-010 | U |
| 10 | **Multiple suppliers for same trade** — same job | Thread match to correct recipient's `rfqs` row | Thread works if `sent_message_id` set per row | DRIFT-001 for package sends | U |
| 11 | **Quote for wrong project** — similar address different job | **Must not auto-match** — unmatched queue | Fuzzy address may false-positive | — | U |
| 12 | **No confident match** | Insert `unmatched_quote_emails`; inbound `correspondence` with `imap-unmatched` | Implemented | — | U + I |
| 13 | **Manual resolve** — admin assigns unmatched to `rfqId` | Update `rfqs`, propagate recipients, soft-resolve unmatched, auditable | Updates `rfqs` only; deletes unmatched row | DRIFT-003, DRIFT-009 | I + E |
| 14 | **Duplicate email** — same `message_id` polled twice | Skip second processing; no duplicate `correspondence` | Dedupe via `correspondence.message_id` check | — | I |
| 15 | **Poll re-run idempotent** — same UID range reprocessed | No duplicate rows | UID cursor advances; unmatched may re-upsert on `external_id` only | partial | I |
| 16 | **Failed PDF parse** — corrupt or non-quote PDF | `rfqs.status = received`; amount null; log reason | Status received; amount from email text fallback or null | — | I |
| 17 | **Attachment exists, amount extraction fails** | `received` + PDF stored; `quoted_amount` null | Implemented (non-fatal extraction) | — | I |
| 18 | **Supplier sends quote on different thread** — new subject, no headers | Unmatched unless address+trade score uniquely identifies | Heuristic match possible (risk) | — | U |
| 19 | **Supplier sends to Paul/Sam separately** — different staff inboxes | Match by RFQ/job regardless of which inbox received (if polled) | Single IMAP account polled — both arrive if forwarded to same inbox | — | document |
| 20 | **Collision: same project name in two jobs** — e.g. two "Brighton" jobs | Thread or unique address token required; else unmatched | Subject_address may mis-match | DRIFT-010 | U |

---

## Outbound send scenarios (pre-requisite for inbound)

| # | Scenario | Expected | Current | Gap |
|---|----------|----------|---------|-----|
| O1 | RfqEngine `POST /api/rfq/send` | `rfqs.sent_message_id` set; outbound `correspondence` | Implemented | — |
| O2 | Package `POST .../scopes/:tradeId/send` | Same threading metadata on `rfqs` | **No** `sent_message_id` | DRIFT-001 |
| O3 | Package send to email-only recipient | Trackable for inbound match | `rfq_recipients` only, no `rfqs` | DRIFT-004 |
| O4 | Query follow-up `force: true` | New thread or re-use Message-ID policy documented | Resets `sent`; may overwrite `sent_at` on received RFQ | — |

---

## Unmatched workflow scenarios (Phase 5 E2E)

| # | Scenario | Expected | Test type |
|---|----------|----------|-----------|
| U1 | Inbound cannot match | Row in `unmatched_quote_emails` | I |
| U2 | Appears in admin queue | `GET /api/quote-tracker/unmatched` | E |
| U3 | Admin assigns to RFQ | `POST /api/unmatched-quotes/resolve` | E |
| U4 | `rfqs` quote status updated | status `received` | E |
| U5 | `rfq_recipients` updated | status `received`, amounts | E (after Phase 4) |
| U6 | TenderBoard ring updates | % received increases | E |
| U7 | Unmatched row resolved | `resolved_at` set OR deleted per policy | E |
| U8 | Auditable | `correspondence.logged_by = manual-match` + resolve metadata | E |

---

## Fixture structure (Phase 3)

```js
// scripts/test-imap-quote-match.mjs
const fixture = {
  parsed: { from: { value: [{ address: "sparky@example.com" }] }, subject: "...", inReplyTo: "...", references: "...", attachments: [] },
  rfqRows: [{ id, job_id, trade, sent_message_id, jobs: { address }, subcontractors: { email } }],
};
const result = resolveInboundRfqMatch(fixture.parsed, fixture.rfqRows);
// assert result?.reason === "in_reply_to"
```

Integration tests use seeded `__E2E_` or `__RFQ_TEST_` rows — never live IMAP.

---

## Pass criteria for Phase 3

| Metric | Target |
|--------|--------|
| Scenarios defined | 20/20 |
| Unit tests implemented | 20/20 |
| Passing on current code | Document actual count; ≥15 expected to pass after DRIFT-001 fix |
| Gaps logged | All failures → BUG_REGISTER |

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-22 | Phase 1 — 20 inbound + outbound + unmatched scenarios |
