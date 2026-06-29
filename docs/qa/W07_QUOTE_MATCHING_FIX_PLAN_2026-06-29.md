# W07 Quote-Email Matching — Fix Plan (Spaellacy incident)

**Date:** 2026-06-29 · **Status:** PLAN — no code yet · **Basis:** 6-lens parallel code investigation + W07 prior hardening.
**Governs:** the live failure where multiple subbie quotes were received but only Spaellacy was ingested, and it
filed under the wrong trade (Andrew Evans Plumbing). Builds on [07_RFQ_SEND_QUOTE_MATCHING.md](./workflows/07_RFQ_SEND_QUOTE_MATCHING.md).

---

## 1. Root causes (all verified-from-code)

| # | Symptom | Root cause | Evidence |
|---|---|---|---|
| **A** | Emails "weren't being dragged in" | **IMAP cursor/UID bug (NEW — not in any doc).** Quote poller calls `client.fetch('${lastUid+1}:*', {uid:true,…})` with **no 3rd options arg**, so the range is treated as **sequence numbers, not UIDs**; cursor is also initialised to the mailbox **count** not a UID. After the first poll the gate `exists <= lastUid` is ~always true → `checked:0`, silently ingests nothing. Finance invoice poller does it correctly. | `dev-api.mjs:2208-2246` vs `financeRoutes.mjs:1171-1184`; `imapflow…:2824` |
| **B** | Quotes not matched | **Thread match dead under Resend.** Resend strips the outbound `Message-ID` (`resendSend.mjs:49-58`), so `rfqs.sent_message_id` never reaches the reply's `In-Reply-To` → the only high-confidence, identity-correct tier never fires. (Known: W07-DRIFT-005.) | `resendSend.mjs:49-58`; `imapQuoteMatch.mjs:41-54` |
| **C** | Spaellacy → wrong trade (Andrew Evans Plumbing) | **Address-only fuzzy match + copy-from-matched-row.** With A/B dead and sender ≠ sub email, matcher falls to tier-2 scoring on **job address only** (+weak trade-word bonus), picks the top RFQ on that job, then copies `subcontractor_id`/`trade`/`job_id` from that **wrong** row into correspondence. Trade/company is never taken from the sender. | `imapQuoteMatch.mjs:88-117`; `dev-api.mjs:438-449` |
| **D** | "A colleague replied from a different mailbox" (your hypothesis — **confirmed**) | **Cross-sender structurally unhandled.** Tier-3 matches **only** `from[0].address == subcontractors.email` (one column). No reply-to, CC/To, domain, shared-inbox, or forward handling. | `imapQuoteMatch.mjs:119-142`; `dev-api.mjs:196` |

Plus: first-poll backlog skip (existing inbox never read), unmatched correspondence written with `job_id/rfq_id = null` → invisible in the UI, and unmatched PDFs are dropped (only a text preview kept).

## 2. Already done — DO NOT redo (your hardening)

- **Ambiguity guards**: matcher refuses to guess on ties → unmatched (`imapQuoteMatch.mjs:148-176`; W07-DRIFT-006 "fixed").
- **Match tracing**: `RFQ_MATCH_DEBUG=true` emits per-email JSON (`rfqMatchTrace.mjs`, wired in poller). **Use this first.**
- **Propagation** rfqs→recipients/scopes/packages (`rfqQuotePropagation.mjs`); **quoted-reply stripping**, **message-id dedup**, **unmatched dedup**; **auth** on inbox/unmatched/poll endpoints.
- **Decided by Sam (do not reverse):** SAM-W07-002 = email-only recipients are manual-resolve only; SAM-W07-001 = Resend-first. W07 §23: **no matcher/transport changes without explicit approval.**

## 3. Matching strategy (the principle)

**Trade/company comes ONLY from the matched RFQ recipient — never inferred from email/PDF.** Resolve the **company first** by robust signals, then the **trade** within that company; if either is uncertain → **unmatched queue for human assignment. A wrong auto-match is worse than unmatched.**

Ordered signals (short-circuit on unique high-confidence hit):
- **L1 — Durable RFQ token (new):** inject `X-BlueLeaf-RFQ-ID` header (Resend passes non-Message-ID headers) + a visible `Ref: BLH-RFQ-<id>` line. Match header → regex token from subject/body (survives FWD/RE/quoting). Transport-proof, identity-correct, sender-independent — **fixes the colleague/shared-inbox/forward cases.**
- **L2 — Thread:** keep In-Reply-To vs sent_message_id (dead under Resend until L1; also try Resend's provider id).
- **L3 — Company by domain → disambiguate by trade:** sender/CC/To domain vs invited subs on open RFQs; unique company on one job → pick its RFQ by trade; else unmatched. (Exclude free-mail domains.)
- **L4 — Exact sender (hardened):** keep, extend address pool to CC/To/reply-to, but only as a company signal.
- **L5 — Subject+address (demoted):** only to disambiguate *within* an already company-resolved set, or require unique address **and** unique trade. **No more address-only cross-sub auto-attribution** (the bug).
- **Post-match guard (new, cheap):** if sender domain / AI-extracted trade contradict the matched RFQ → abort write, route to unmatched "possible wrong bucket." Would have caught Spaellacy-under-plumbing.

## 4. Fix plan (prioritised)

**Safe, no-approval-needed (do first):**
1. **P0 — Cursor/UID fix** (`dev-api.mjs:2208-2248`): pass `{uid:true}` 3rd arg; init cursor to `uidNext-1`; advance only on success. Mirrors finance poller. *This is the dominant "not dragged in" fix.*
2. **Turn on `RFQ_MATCH_DEBUG=true`** + one manual `POST /api/imap/quote-poll` to capture real traces of the Spaellacy-incident emails.

**Needs Sam's GO (W07 §23 — matcher/transport):**
3. Demote address-only matching (C fix) — uncertain cross-sub → unmatched.
4. Post-match sanity guard (cheap, high value).
5. L1 durable RFQ token (header + Ref line + migration) — the big cross-sender fix.
6. L3 domain/CC company tier (brushes SAM-W07-002 — see decisions).

**Independent quick wins:**
7. Preserve unmatched PDFs + show subject/body/PDF in the resolve modal; re-extract amount on resolve (DRIFT-008/013).
8. TenderDetail Accept reads `quote_amount OR quoted_amount` so a matched IMAP quote can actually be accepted (DRIFT-014).

## 5. E2E scenarios (for the test pass after fixes)
Cursor-ingests-N (not 0) · different-person-same-company · shared-inbox (accounts@) · two-trades-one-company ·
**wrong-bucket regression (Spaellacy→Andrew Evans)** · should-be-unmatched (free-mail, no token) ·
Resend-thread-dead→token-rescue · forward/RE subject · reply-all/CC · backfill+dedup · accept-after-match.

## 6. Open decisions for Sam
1. **Approve the matcher/transport changes** (items 3-6)? W07 §23 gate.
2. **L1 token:** OK to add `X-BlueLeaf-RFQ-ID` header + a visible `Ref:` line to outbound RFQ emails/SOPs (needs a live Resend header-passthrough test)?
3. **SAM-W07-002:** relax for the **domain** case (match a colleague at the same company) while keeping email-only recipients manual-resolve? Or keep domain matching within `rfqs` candidates only?
4. **Free-mail domains** (gmail/outlook/bigpond): route to unmatched if not token-matched — confirm.
5. **Backlog backfill** after the cursor fix: ingest the already-received quotes (dedup-protected)? Which date range?
6. **Wrong-vs-unmatched principle:** accept more human resolves in exchange for zero wrong-bucket filings — confirm.
7. **Unmatched PDF holding folder** (no job address yet): OK to store under a generic Dropbox "UNMATCHED QUOTES" folder?

---
Code changed: no · Tests changed: no · Docs changed: yes (this file).
Next safe action: do #1 (cursor fix) + #2 (tracing) — no approval needed — then decide #3-6.
