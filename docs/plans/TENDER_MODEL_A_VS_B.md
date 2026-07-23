# Tender data model — A vs B decision doc

**Date:** 2026-07-24 · **Status:** decision doc (planning, no code) · Companion to [`TENDER_MODULE_RESTRUCTURE.md`](TENDER_MODULE_RESTRUCTURE.md) §6.1 (build step 5). Grounded in the mig-030 schema + live row counts (2026-07-24).

## The question
The tender module carries two parallel data models for the same workflow. We must pick ONE canonical structure — chosen on **domain fit + implementation reality**, not on which screen we're keeping. This doc compares them and recommends.

---

## 1. What the model must represent (the domain)
A tender, end to end:
```
Job
 └── Trade scope        (per trade: scope bullets, exclusions, questions, due date, estimate category)
       └── Invitation    (a subcontractor invited to quote that trade — sent / reminded / received)
             └── Quote submission        (a commercial quote; a revision = a new version — MANY per invitation)
                   └── Attachment(s)      (quote PDF + exclusions + schedule + insurance — MANY per submission)
 └── Addenda            (revisions issued to all/affected trades after RFQ)
 └── Award              (the accepted submission → flows to Operations + Cost Intelligence)
```
Plus: every **verified** submission feeds Cost Intelligence (not just the accepted one — restructure §6.6).

---

## 2. Model A — `jobs` + `rfqs`  (mig 001)
One `rfqs` row = **job × subcontractor × trade**, carrying the invitation state *and* the (single) quote: `trade` (free text), `status` (sent/reminded/received/accepted/declined), `sent_at`, `deadline`, `quote_amount` (manual) + `quoted_amount` (extracted), `quote_pdf_url`, engagement columns (mig 102), `trade_category_id` (mig 081).

- **Strengths:** it IS the working system — the IMAP quote poller, Tender Board, Tender Detail, the Win/award wizard, Buildexact sync and Cost Intelligence all read/write `rfqs`. Fully wired, battle-tested, populated.
- **Gaps:** no trade-scope structure (trade is a bare string — no bullets/exclusions/questions); no addenda; **one quote per row** (the lost-cabinetry bug); two ambiguous amount columns; no submission/version concept.

## 3. Model B — `rfq_packages` + `rfq_trade_scopes` + `rfq_recipients` + `rfq_addenda`  (mig 030)
A layered structure: **package** (tender: job_id, extraction_data, suggested_trades, coverage_score) → **trade_scope** (per trade: `scope_bullets`, `exclusions`, `questions`, `internal_notes`, `contractor_notes`, `due_date`, `estimate_category`, `attachments`) → **recipient** (sub per scope: status, sent/follow-up/received timestamps, `quote_amount`, `quote_pdf_path`, `rfq_id → rfqs` bridge) → **addenda** (number, name, file, affected_trades).

- **Strengths (conceptual):** genuinely closer to the domain — first-class **trade scopes** (bullets/exclusions/questions), **addenda**, and recipients separated from scopes. These are things A lacks.
- **Gaps:** **half-adopted and effectively dead** (see §4). The A→B bridge (`rfqQuotePropagation.mjs`) only syncs when a recipient is `rfq_id`-linked; the Quote Tracker Packages tab hangs. And crucially **a recipient still holds ONE quote** (`quote_amount` + `quote_pdf_path`) — **B does not solve the multi-quote problem either.**

---

## 4. Live evidence (the decider) — counts as of 2026-07-24
| | Model A (`rfqs`) | Model B |
|---|---|---|
| Real records | **27 RFQs**, **8 with quotes**, across **8 tendering jobs** | **2 packages** (one is "Debug Pkg Address"; the other "42 Kensington Rd" is stale from 2026-05-22), **3 scopes**, **1 recipient**, **0 recipients with a quote**, **0 addenda** |
| The real completed tender (2 Forrest Ave, 26 RFQs) | ✅ all here | ❌ not in Model B at all |
| Bridge | — | 1 of 1 recipients linked to an rfq, 0 quotes propagated |

**Model B was never adopted for real work.** Every actual tender runs on Model A. There is essentially no Model-B data to lose.

---

## 5. Scorecard
| Axis | Model A | Model B |
|---|---|---|
| Domain fit — job→scope→invitation→quote→award | ⚠️ flat (no scope, no addenda) | ✅ structurally closer (package/scope/recipient/addenda) |
| Trade scopes (bullets/exclusions/questions) | ❌ | ✅ |
| Addenda | ❌ | ✅ |
| Multi-quote per invitation | ❌ | ❌ (same one-quote limit) |
| Implementation completeness / wiring | ✅✅ poller · board · detail · award · Buildxact all on A | ❌ half-wired, bridge fragile, Quote Tracker hangs |
| Live data | ✅✅ 27 RFQs / 8 quotes / all real tenders | ❌ ~1 real recipient, 0 quotes |
| Cost to make canonical | 🟢 low (extend A) | 🔴 high (resurrect B + migrate A→B + rewire poller/board/detail/award/Buildxact) |
| Risk | 🟢 low | 🔴 high (rebuild the working path onto the dead one) |

---

## 6. Recommendation — **synthesis on A's spine** (not "keep A, kill B" and not "resurrect B")
Adopt **Model A as the canonical spine** (it's proven, populated, fully wired) and **absorb Model B's genuinely-useful concepts as extensions** — plus add the submission/version layer that is new to *both*:

**Target canonical model:**
- **`jobs`** — spine (unchanged).
- **`rfqs`** — keep as the **invitation** row (sub × trade × job) + its send/engagement state. This is B's "recipient" and it's already fully wired.
- **NEW `rfq_trade_scopes`** — *lift B's concept, key it to A*: one row per **job × trade** with `scope_bullets`, `exclusions`, `questions`, `internal_notes`, `contractor_notes`, `due_date`, `estimate_category`. Gives A the structured scope it lacks.
- **NEW `rfq_quote_submissions`** (`rfq_id → rfqs`, `version`, `status`, `extracted_amount`+confidence+tax_basis, `confirmed_amount`+by+at, `sub_scope_label`) **+ `quote_attachments`** (`submission_id`, file, `is_primary`) — the multi-quote fix (restructure §6.2). **New to both A and B.**
- **NEW `rfq_addenda`** — *lift B's table concept, key it to `job_id`* (number, name, file, affected_trades, sent_at).
- **Award** = the accepted submission → `rfqs` + Operations + Cost Intelligence.

**Take from B:** the *ideas* — trade scopes, addenda, scope/recipient separation. **Drop from B:** the *tables* (`rfq_packages`, `rfq_trade_scopes`, `rfq_recipients`, `rfq_addenda`) and the fragile A→B bridge.

Why this beats "resurrect B": B's tables are empty and unwired, and B doesn't even solve the multi-quote problem — so choosing B means rebuilding the entire working path (poller/board/detail/award/Buildxact) onto a dead structure *and still* adding the submission layer. Extending A gets the same domain richness at a fraction of the risk.

---

## 7. Retirement of Model B (low-risk — almost no data)
1. Snapshot the 2 packages / 3 scopes / 1 recipient (CSV) for safety — but there's nothing of real value (1 test pkg + 1 stale pkg, 0 quotes).
2. Stop all reads of Model B (Quote Tracker → the new board; the `rfqQuotePropagation` bridge → removed once submissions exist).
3. Confirm feature parity (Unmatched inbox + Direct RFQs moved — restructure §6.4 / build step 7).
4. Drop `rfq_packages` / `rfq_trade_scopes` / `rfq_recipients` / `rfq_addenda` in a later migration.

## 8. Decision
> **Canonical model = Model A spine, extended with B's scope + addenda concepts and a new quote-submission/version + attachments layer. Retire Model B's tables.**

Feeds directly into restructure §6.1–6.2 and build steps 5–7. Open for your sign-off; nothing is built until then.
