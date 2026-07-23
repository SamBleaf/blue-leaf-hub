# Tender Module — Structure Review & Restructure Plan (planning only)

**Date:** 2026-07-22 · **Status:** discovery + proposal, no code written yet · **Data reviewed:** live 2 Forrest Ave, Marino (the only complete real run) + full code map.

---

## 1. The core problem (why everything feels like a double-up)

The tender module runs **two parallel data models for the same job**:

| Model | Tables | Pages that use it |
|---|---|---|
| **A (original)** | `jobs` + `rfqs` (one row per job×sub×trade, with `quote_amount`/`quoted_amount`/`quote_pdf_url`) | Tender Board, Tender Detail, the IMAP quote poller |
| **B (newer)** | `rfq_packages` + `rfq_trade_scopes` + `rfq_recipients` + `rfq_addenda` | "Quote Tracker" (RfqPackageList) + its detail |

A bridge (`rfqQuotePropagation.mjs`) copies an inbound quote from A → B, but only when a recipient row is linked. **The Win wizard even warns in code that the two models can disagree.** Almost every "double-up" you're feeling traces back to this:

- **Tender Board** and **Quote Tracker** are the *same list* (tender jobs + RFQ coverage) rendered from the two different models.
- Quote comparison / award lives in **two** places — the packages "recipients" list *and* Tender Detail's Win wizard — and they can show different numbers.
- There are **two dollar columns** on every RFQ: `quote_amount` (what you type) vs `quoted_amount` (what the AI extracts). Different screens read different columns, so a corrected value doesn't always "stick" everywhere.

**Everything below is downstream of this. The single most valuable structural decision is to collapse to ONE model.**

---

## 2. Current pages (what exists today)

Sidebar **Tendering** → tabs in this order: **RFQ Engine · Quote Tracker · Subcontractors · Tender Board · Cost Intelligence** (+ Fee Proposals, adjacent).

- **RFQ Engine** — 4-step wizard to create + send RFQs (Upload PDFs → facts → recipients → dispatch). *This is the default landing tab — hence your "it loads first" complaint.*
- **Quote Tracker** (= RfqPackageList) — job list with trade-coverage bars + "quotes in" KPIs (model B).
- **Tender Board** — job list grouped by stage + action queue (model A). → opens **Tender Detail** (the per-job trades workspace + Win wizard).
- **Subcontractors** — the directory.
- **Cost Intelligence** — benchmark/pricing analytics.

---

## 3. The three concrete failures you flagged (all confirmed)

### 3a. "RFQ Engine loads first / wrong order"
Two settings force it: the department's `defaultTo` points at `/rfq-engine`, and RFQ Engine is the first tab. **Pure config fix, no route changes** — the natural order is **Tender Board (entry) → Tender Detail → RFQ Engine (a "create/send" action) → Quotes/Award → Cost Intelligence**.

### 3b. The lost cabinetry quote (multi-quote-per-trade)
Root cause is two compounding faults, **not** a DB overwrite:
1. **One email → one RFQ.** The joiner's single email carried two PDFs (cabinetry + benchtops). The matcher scores the email against the sender's open RFQs and returns exactly **one** — the benchtops trade word won; the cabinetry had no home.
2. **First-attachment-only.** Even for the matched RFQ, the poller only ever reads *the first PDF* and writes *the first amount*. The **cabinetry PDF was still uploaded to Dropbox and saved on the `correspondence` row — it physically exists — but nothing ever surfaces it as a quote.**

> **The cabinetry quote was recovered (2026-07-22).** The Joinery RFQ (Allan Carter, `b12088a0`) received TWO inbound emails: `Quote.pdf` (16 Jul, the **cabinetry** quote) then `QU-22138.pdf` (20 Jul, **stone benchtops**, $12,390.94). Both matched the same single Joinery RFQ row; the later stone email **overwrote** `quote_pdf_url`/`quoted_amount`, so the board shows only the stone quote. The cabinetry PDF survives in the `correspondence` row (16 Jul) and in Dropbox at `…/2 FORREST AVENUE…/INTERNAL/QUOTES/QUOTE.PDF`. (Same file was also mis-scanned into Finance, now rejected.)
>
> So the confirmed real-world mechanism is the **"second email overwrites the first on the same (job,sub,trade) RFQ row"** collision — an RFQ row holds exactly one quote. A sub who legitimately quotes **two things** (cabinetry + benchtops) or re-sends a revised quote has nowhere to put the second. **This is the strongest single argument for "a quote is its own row."**

### 3c. Patchy extraction + "can't fix it in the UI"
On 2 Forrest Ave, of ~10 "received" quotes only **8 captured a value+PDF; 6 came in with no amount and no PDF** (Demolition, Electrical, Excavation, Floor Coverings, Internal Linings, Stairs). And the correction tools are thin — Tender Detail lets you edit *only* the quote **amount** and accept/decline. You **cannot** currently:
- fix a mis-classified **trade**, or reassign an RFQ to a different **sub**;
- move a quote that landed on the **wrong trade**;
- reach or choose a **different PDF** as "the quote" (only the first is linked);
- split one email into **two** quotes;
- delete / re-scan a single RFQ's quote;
- reconcile the two amount columns (set one source of truth).

Everything above needs a code/DB change today — which is exactly why it feels "built in code, not editable."

### 3d. Cost Intelligence "can't tell if it's accurate"
Correct — the surfaces are built but the **source tables are empty** until Buildxact estimate sync + approved invoices populate them (the pages literally say "Seed the budget from Buildxact or approve invoices"). **You can't judge accuracy until real cost data flows in** — which ties directly to the Buildxact/Xero data work. Recommend parking accuracy assessment until then.

---

## 3.5 Live UX findings — 2 Forrest Ave walkthrough (viewed 2026-07-22, prod)

Driven page-by-page in the live app (logged in as admin):
- **Tender Board** — heavy **test/duplicate clutter** (multiple "21 Folkestone Rd", "99 Debug St", "Blue Leaf Building") burying the ~1 real job. Cards show RFQs sent / Trades / Quotes % — but **no quote $** on the board, so you can't see money without drilling in.
- **Tender Detail** — the big one: a **flat list, one card per subcontractor with the trade name repeated**. "Concrete & Footings" renders as **three separate cards** (D Wilson, Third Dimension, LOUMA) — you **cannot compare a trade's quotes side by side**, which is the core job of tendering. Live proof of both failure modes on screen: **LOUMA** shows *"Extracted $61,980 — tap to use"* (the value isn't applied until you click — the two-column split), while **Old Red Brick (Demolition)** is **"RECEIVED" with no value and no PDF** (extraction silently failed, no fix path). Header exposes only **Scan inbox**.
- **Quote Tracker** — tabs **Packages · Direct RFQs · Unmatched**; the Packages tab **hangs on a loading spinner** (slow/stuck). It duplicates the Tender Board (same jobs, different model).
- **RFQ Engine** — a **blank "upload PDFs to start a new job" wizard**, and it's the **default landing tab** — you're greeted by "start a new run" instead of "here are your live tenders."
- **Cost Intelligence** — **0 jobs tracked / 0 quote rows** — empty; fed by Buildxact estimate sync + manual entry. Accuracy can't be assessed until real data flows.
- Minor: dev module numbers leak into the UI ("TENDER MANAGER · MODULE 4 / MODULE 5").

## 4. Proposed restructure (phased, lowest-risk first)

### Phase 0 — Reorder + de-dupe + make it editable (no schema change, low risk)
1. **Nav reorder:** `defaultTo` → Tender Board; tab order Board · (Detail) · RFQ Engine · Quote Tracker · Subcontractors · Cost Intelligence. Frame RFQ Engine as the "＋ New RFQ run" action from the board, not the landing page.
2. **Pick ONE board.** Decide whether Tender Board or Quote Tracker is the survivor and retire/redirect the other (they're the same list). Recommend **Tender Board stays** (richer stage/action-queue), fold Quote Tracker's "quotes-in" coverage bars into it.
3. **Editability layer on Tender Detail** (widen the one PATCH): edit an RFQ's **trade** and **subcontractor**, **reassign** a received quote to another trade, **pick which PDF** is the quote, and a per-RFQ **re-scan/reset**. This alone fixes most "hard to rectify" pain without touching the data model.
4. **Surface ALL attachments per RFQ** (they already exist on `correspondence`): show every PDF that came in, so a second quote is never invisible — and can be promoted to its own quote. This recovers 3b's file immediately.

### Phase 1 — One data model + "a quote is its own row" (the real fix)
5. **Collapse A vs B onto one model** so there's one board, one comparison, one award path, one amount.
6. **New `quotes` (or `rfq_quotes`) table:** many quotes per RFQ/recipient, each with its own PDF + amount + optional sub-scope label (e.g. "cabinetry" vs "benchtops") + status. This structurally kills both faults in 3b and lets a sub quote multiple items or revise a quote. The matcher attaches **each PDF** as its own quote instead of first-only.
7. **One amount = source of truth** (retire the `quote_amount` vs `quoted_amount` split; keep provenance: extracted vs confirmed).

### Phase 2 — Extraction quality + cost-intel data
8. Improve the quote matcher/extractor (multi-attachment aware; better "received but $0" handling) and add a manual "this PDF = $X for trade Y" fallback for the ~6 that fail.
9. Populate Cost Intelligence via the Buildxact/invoice pipeline, *then* assess accuracy.

---

## 5. Decisions locked (2026-07-22)

1. **One board:** keep **Tender Board**; retire/redirect Quote Tracker, folding its coverage/unmatched into the board + detail.
2. **Scope:** **plan the whole thing first** (this doc) before any code.
3. **Cabinetry quote:** ✅ retrieved (see §3b).
4. **Live walkthrough:** ✅ done (see §3.5).

## 6. Target design (the full picture)

### 6.1 One data model — chosen by a deliberate domain comparison, not by which screen wins
**Decision gate (do this BEFORE building the model):** compare Model A (`jobs`+`rfqs`) and Model B (`rfq_packages`/`rfq_trade_scopes`/`rfq_recipients`/`rfq_addenda`) at the *domain* level — how well each represents job → trade scope → invited recipient → quote submission → attachment → award — and pick one canonical structure. Do **not** pick it because Tender Board (the UI we're keeping) happens to sit on Model A.
- **Weigh two axes:** (1) domain-fit — B's separation of packages/scopes/recipients/addenda is conceptually closer to a real tender; (2) implementation-completeness — Model A is what the poller, board, detail and award **actually run on** and is fully wired, whereas Model B is **half-adopted and currently broken** (its A→B bridge only syncs when a recipient is linked; the Quote Tracker Packages tab hangs).
- **Current lean (to be validated, not assumed):** take **A's spine as the base** (it's proven + populated) and **absorb B's useful concepts** — trade scopes, recipients as first-class, addenda, and the new quote *submission/version* idea (§6.2). A deliberate synthesis, likely closer to "Model A extended" than "resurrect Model B," but the comparison decides.
- Whatever wins: **one** board, **one** comparison, **one** award path — kill the "quotes disagree between models" footgun the Win wizard warns about in code.

### 6.2 A quote SUBMISSION is its own record — with many attachments (the core fix)
Not "one PDF = one quote" (too crude — a single quote often arrives as several files: the price + exclusions + a product schedule + insurance). The structure is:
```
RFQ recipient (sub × trade)
  └── Quote submission / version   (one commercial quote; a revision = a new version)
        ├── attachment 1 (the quote PDF)
        ├── attachment 2 (exclusions)
        └── attachment 3 (schedule)
```
- New tables **`rfq_quote_submissions`** (`id, rfq_id, version, status [received|accepted|declined|superseded], sub_scope_label, extracted_amount_ex_gst, extracted_amount_inc_gst, extraction_confidence, tax_basis, confirmed_amount_ex_gst, confirmed_by, confirmed_at, received_at, created_at`) + **`quote_attachments`** (`id, submission_id, filename, pdf_path, pdf_url, is_primary`).
- One recipient can hold **many submissions** → the joiner's cabinetry + benchtops are two submissions; a revised quote is a new *version*, not an overwrite; the lost 2 Forrest Ave cabinetry quote gets its own submission. The **accepted** submission flows to award/Operations.
- **Matcher default: one submission per email** — all its PDFs become that submission's attachments (never lose the 2nd file again). A human (or a two-trade heuristic) can **split** an email into multiple submissions when it genuinely holds two commercial quotes, and re-file a submission onto the correct trade's recipient.
- **Amounts — keep BOTH with provenance, don't collapse to one field:** `extracted_amount` (+ confidence + tax basis) stays as the AI suggestion + audit trail; `confirmed_amount` (+ who + when) is the **commercial source of truth** the UI/award/benchmarks read. This replaces today's ambiguous `quote_amount` vs `quoted_amount` split with *clear semantics*, not fewer fields.
- **Every verified submission is also a Cost Intelligence data point** (not just the accepted one) — see §6.6. Accepted → award; all verified → the benchmark model.

### 6.3 Tender Detail — grouped, comparable, editable
- **Group cards by trade** with a trade header; within a trade show its subs as a **comparison** (amount, status, best-price highlight), not repeated headers.
- Per RFQ/quote, make editable via one PATCH surface: **trade**, **subcontractor**, **which PDF is the quote**, **re-file a quote to another trade**, **split one email into two quotes**, **delete/re-scan a quote**, and **add another quote** manually. (Builds on today's `+ Add trade` / `+ Add subcontractor`.)
- Show **all inbound attachments** per RFQ (they already exist on `correspondence`) so nothing is invisible; promote any attachment to a quote.

### 6.4 Tender Board — the entry point (+ retiring Quote Tracker SAFELY)
- **`defaultTo` → `/tender-manager/board`**; nav order: **Tender Board · Quote Inbox (unmatched) · Subcontractors · Cost Intelligence**. **RFQ Engine becomes a prominent "＋ New RFQ" action on the board**, not a permanent nav destination.
- **Board dollars must be a DEFINED figure**, never a vague "quote value" mixed from several returned quotes. Show a labelled metric — e.g. **preferred/accepted tender total** (+ trade **coverage** + what needs chasing + action). Detailed commercial comparison lives in Tender Detail, not the board.
- **Retire Quote Tracker only after its workflows move + parity is confirmed:** (1) move **Unmatched inbound** into a clear **Quote Inbox** (or board alert) with one-action re-match to job+trade+sub; (2) move **Direct RFQs** into the canonical tender flow; (3) confirm feature parity; (4) redirect Quote Tracker → board; (5) remove its old reads later. Do NOT redirect first.
- Add a **test-data filter** so debug jobs ("99 Debug St", the duplicate "21 Folkestone" rows) don't bury real tenders.

### 6.5 Extraction quality + correction
- Multi-attachment-aware extraction (every PDF → a quote row).
- Better "received but $0" handling: flag clearly + a one-click **"enter this quote manually"** for the ~6 that fail, instead of a dead card.
- Keep the unmatched queue, but make re-matching from it one action (assign to job+trade+sub).

### 6.6 Cost Intelligence — feed it EVERY verified quote, not just the accepted one
**Status: BUILT BUT UNVALIDATED.** The page is empty (0 jobs / 0 quote rows). Empty ≠ correct — until real Buildxact estimates + quote data flow through it we cannot verify whether the categories reconcile, matching is accurate, averages are meaningful, or imports duplicate/overwrite. Do not assume its current structure is right; treat it as unproven and validate against live data.

**Current state (confirmed in code):** benchmarks recompute off `normalized_costs`, which holds **one number per job × trade** (`actual_amount || quoted_amount || budget_amount`, `costIntelligenceRoutes.mjs:408`). So the multiple competing subcontractor quotes per trade (e.g. 3 concrete quotes on 2 Forrest Ave) **never reach the benchmark model** — only a single accepted/estimate figure does. We're throwing away most of the price signal.

**Target:** every **received + verified** quote becomes a cost-intelligence data point.
- With `rfq_quotes` (§6.2), each sub's quote for a trade is its own row. **All of them** (not just the accepted one) feed the benchmark pipeline — so a trade with 3 quotes contributes 3 points, not 1. Sample size per trade jumps from ~1 to N-subs, which is exactly what hones the normalised `$/m²` and rate bands.
- **"Verified against the cost metrics in all subsections":** a raw quote isn't blindly trusted. Before a quote is counted as a benchmark point it is reconciled against the trade's **subsection cost metrics** (the Buildxact estimate template's 37 categories / normalized-cost structure) — i.e. the quote is normalised to the same $/unit basis and sanity-checked against the expected band, so an outlier or a mis-extracted number doesn't poison the average. Only quotes that pass verification (and aren't declined/superseded) are ingested.
- **Model:** widen the benchmark source from one `normalized_costs` row per job×trade to a **per-quote** feed — each verified `rfq_quotes` row → a normalised data point tagged (trade, subsection, job, sub, source=quote, status), aggregated into `cost_benchmarks` (avg / p75 / spread) with a proper sample count. Accepted quotes + approved invoices remain the highest-confidence points; unaccepted-but-verified quotes add breadth.
- Still needs **live data volume** (Buildxact estimate sync + real jobs) before accuracy is judged — but this change means each tender yields *many* benchmark points instead of one, so the numbers converge far faster. Ties to the separate Buildxact/Xero work.

## 7. Build sequence (revised — deployment certainty first, model decided before schema)
Front-loaded with the no-schema UI wins (fast relief) and gated so we don't commit a data model prematurely.
1. **Confirm production is healthy + not stale** — Railway up, SPA served (currently degrading — see §8), correct commit live, service worker not serving stale assets, and rule out read-only/permission state. Nothing proceeds on stale-screenshot evidence.
2. **Tender Board = default landing**; RFQ Engine → a prominent **"＋ New RFQ"** action. *(config only)*
3. **Tender Detail grouped by trade**, subs as comparable rows. *(no schema — highest-value UI win)*
4. **Manual correction controls + surface every inbound attachment** (amount, trade, sub, choose PDF, re-file, rescan, manual add) — most of this rides the existing `correspondence` attachments + a widened PATCH, so big relief before any model change.
5. **Model decision gate** — do the §6.1 domain comparison (A vs B) and choose the canonical structure. **No new schema until this is decided.**
6. **Quote submissions + attachments + version history** on the chosen model; matcher writes/updates submissions (default one-per-email, splittable) and **stops overwriting** earlier submissions; extracted + confirmed amounts with provenance (§6.2). Backfill existing quotes + the recovered 2 Forrest Ave cabinetry submission.
7. **Move Quote Inbox (unmatched) + Direct RFQs** into the canonical flow → confirm parity → redirect Quote Tracker → remove old reads.
8. **Cost Intelligence per-quote feed** — verify each submission against its trade/subsection metric and ingest ALL passing (not just accepted) as benchmark points; widen the source from one `normalized_costs` value per job×trade to a per-quote feed with sample counts (§6.6).
9. **Cleanup:** test-data filter, remove dev "MODULE 4/5" labels.
10. **Validate Cost Intelligence** only after real Buildxact + quote data has flowed through it.
Steps 2–4 are independently shippable and deliver the biggest relief with zero schema risk; 5 is a decision, not code; 6–8 are the structural core.

## 8. Open items (not part of the plan)
- **Prod is degraded (2026-07-22, URGENT):** the Node API + Supabase are UP, but the SPA (`/`) serves in 13–16s and intermittently times out → "stuck loading", and the browser falls back to **stale service-worker assets** — which is why today's `+ Add trade`/`+ Add subcontractor` buttons didn't show (stale cache, NOT a code bug or read-only state). Fix on Railway (restart/redeploy; check deploy status + CPU/memory + logs), then hard-refresh / clear the PWA cache. Resolve this BEFORE trusting any live-UI evidence (build step 1).
- **Quote Tracker Packages tab** hangs on a spinner — will be moot once retired, but flag if it's erroring.
- **Dropbox `files.content.read`** still needs the token re-mint (blocks Finance "View PDF"; tender "View quote PDF" uses public share links so is unaffected).

---

## Appendix — key file references
- Nav order: `src/components/AppShell.jsx:105-111,136`
- Two models: `rfqs` (`supabase/migrations/001_blue_leaf_schema.sql:37`) vs `rfq_packages` (`030_rfq_packages.sql`)
- Two amounts: `quote_amount` (`001:45`) vs `quoted_amount` (`013_job_knowledge_estimate_quotes.sql:52`)
- Quote matcher: `server/lib/imapQuoteMatch.mjs`; write path `server/dev-api.mjs:429-542` (first-PDF-only at `:461,:488-495`)
- Editable PATCH (only status/amount/manual): `server/lib/buildexactIntegrationRoutes.mjs:109-139`
- Tender Detail card: `src/pages/TenderDetail.jsx:1540-1669`
- Cost Intelligence empty-states: `src/pages/CostIntelligence.jsx:369,415,450,529,718`
