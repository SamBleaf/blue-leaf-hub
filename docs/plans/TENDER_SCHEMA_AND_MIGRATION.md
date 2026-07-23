# Tender restructure — FINAL schema, cutover & verification (return-before-code)

**Date:** 2026-07-24 · **Status:** final spec for implementation — folds in both amendment rounds. Companions: [`TENDER_MODULE_RESTRUCTURE.md`](TENDER_MODULE_RESTRUCTURE.md), [`TENDER_MODEL_A_VS_B.md`](TENDER_MODEL_A_VS_B.md). Decision: **Model A invitation spine + structured scopes + addenda + many versioned quote submissions + many attachments; Model B retired last.**

**Hard build constraint:** no real subcontractor emails — all send paths run dry-run/logged until Sam re-enables.

---

## 1. Entity model + THREE independent axes
```
jobs (spine)
 ├── tender_trade_scopes         (job_id, trade_category_id)  — scope bullets/exclusions/questions/due
 ├── rfqs = the INVITATION       (job × sub × trade)          — send/engagement lifecycle
 │     └── rfq_quote_submissions  (many; versioned)            — the commercial quote(s)
 │            └── rfq_quote_attachments (many)                 — PDFs / exclusions / schedules / insurance
 ├── tender_addenda (+ tender_addendum_trades junction)       (job_id, number)
 └── award: rfqs.accepted_submission_id (+ accepted_at/by)
```
**Three separate axes — never merged (amend R2-#2, R2-#3, R2-#10):**
- **Invitation** `rfqs.status`: `queued · sent · reminded · declined · withdrawn`. **No `received`** — "has quotes" is *derived* from submissions.
- **Submission commercial** `rfq_quote_submissions.status`: `received · accepted · declined · superseded`.
- **Submission verification** `rfq_quote_submissions.verification_status`: `unverified · verified · rejected` (+ `verified_at`, `verified_by`).

---

## 2. DDL (final)

### 2a. NEW `rfq_quote_submissions`
`id uuid pk` · `rfq_id uuid NOT NULL → rfqs(id) ON DELETE CASCADE` · `version int NOT NULL` (**UNIQUE(rfq_id, version)**; allocated **transactionally** — advisory lock or `INSERT … SELECT COALESCE(MAX(version),0)+1 … ` inside a serializable txn with retry, never bare MAX+1 — amend R2-#8) · `sub_scope_label text` · `status text NOT NULL default 'received'` (commercial axis) · `verification_status text NOT NULL default 'unverified'` · `verified_at timestamptz` · `verified_by uuid → user_profiles` · `extracted_amount_ex_gst numeric` · `extracted_amount_inc_gst numeric` · `extraction jsonb` · `extraction_confidence numeric` · `tax_basis text` · `confirmed_amount_ex_gst numeric` (commercial source of truth) · `confirmed_by uuid → user_profiles` · `confirmed_at timestamptz` · `correspondence_id uuid → correspondence(id) ON DELETE SET NULL` · `source_message_id text` · `email_from text` · `match_confidence numeric` · `received_at timestamptz` · `created_at timestamptz default now()`.
Indexes: `(rfq_id)`, `(status)`, `(verification_status)`, `(correspondence_id)`.
**Derived in the READ model (not stored editable):**
- `is_verified` = `verification_status = 'verified'`.
- `is_benchmark_eligible` = `is_verified` AND this is the **current non-superseded** version for its `(rfq_id, sub_scope_label)` AND it passes the trade/subsection sanity band. **Separates history from double-counting** (amend R2-#10): every revision is kept + verifiable, but only ONE version per scope feeds Cost Intelligence.

### 2b. NEW `rfq_quote_attachments`
`id uuid pk` · `submission_id uuid NOT NULL → rfq_quote_submissions(id) ON DELETE CASCADE` · `filename text` · `storage_path text` · `pdf_url text` · `is_primary bool default false` · `source_attachment_id text` (email part id — provenance) · `mime_type text` · `size_bytes bigint` · `checksum text` (sha256) · `role text` (`quote·exclusions·schedule·insurance·other`) · `extraction_status text default 'pending'` (`pending·done·failed·na`) · `created_at`. **UNIQUE(submission_id, checksum)** for duplicate protection (amend R2-#7).

### 2c. `rfqs` — extend
ADD `accepted_submission_id uuid → rfq_quote_submissions(id) ON DELETE SET NULL` · `accepted_at timestamptz` · `accepted_by uuid → user_profiles`.
**Award integrity (amend R2-#5):** enforce `accepted_submission_id`'s submission has the **same `rfq_id`** — DB trigger (`BEFORE UPDATE`) or a `CHECK` via a validating function; award performed in ONE transaction that sets the three fields + flips the submission `status='accepted'`. `status` re-scoped to the invitation axis (§1).
Legacy `quoted_amount`/`quote_amount`/`quote_pdf_url` become read-only, kept one release for rollback, dropped in the final migration.

### 2d. NEW `tender_trade_scopes` (new name — avoids the Model-B `rfq_trade_scopes` collision, amend R2-#1)
`id` · `job_id → jobs ON DELETE CASCADE` · `trade_category_id uuid NOT NULL → trade_categories(id)` (**UNIQUE(job_id, trade_category_id)** — keyed by category, not free text) · `trade_label text` (display) · `scope_bullets jsonb` · `exclusions jsonb` · `questions jsonb` · `internal_notes text` · `contractor_notes text` · `due_date date` · `created_at` · `updated_at`.

### 2e. NEW `tender_addenda` + `tender_addendum_trades`
`tender_addenda`: `id` · `job_id → jobs ON DELETE CASCADE` · `number int` (**UNIQUE(job_id, number)**) · `name text` · `storage_path text` · `sent_at timestamptz` · `created_at`.
`tender_addendum_trades` (junction — replaces the `uuid[]` array, amend R2-#6): `addendum_id uuid → tender_addenda(id) ON DELETE CASCADE` · `trade_category_id uuid → trade_categories(id)` · **PRIMARY KEY(addendum_id, trade_category_id)**.

---

## 3. Model B — leave INTACT during transition (amend R2-#1, reversing the earlier rename-first plan)
GPT is right: Quote Tracker + the `rfqQuotePropagation` bridge still **read** Model B, so renaming its tables in migration 1 would break live functionality before feature parity exists. So:
- **Do NOT rename or drop Model B up front.** New tables use non-conflicting names (`tender_trade_scopes`, `tender_addenda`, `tender_addendum_trades`, `rfq_quote_submissions`, `rfq_quote_attachments`).
- Model B (`rfq_packages`/`rfq_trade_scopes`/`rfq_recipients`/`rfq_addenda`) stays fully functional until **all reads have moved** (build step 9).
- Only then: export B (CSV snapshot) → drop in the final migration.

---

## 4. Migration map (ordered)
| # | Migration / step | Contents |
|---|---|---|
| N | `create tender submission model` (DDL) | create the 5 new tables (§2a–2e) + `rfqs` award columns; all FKs/ON DELETE/UNIQUE/indexes above; the same-rfq award trigger. **Model B untouched.** |
| N+1 | `backfill` (idempotent script — amend R2-#9) | see §5 |
| N+2 | `ingestion cutover` (code+config — amend R2-#4) | see §6 |
| … | build steps 4–9 (read APIs → UI → matcher → award → board → migrate Direct/Unmatched) | |
| final | `retire Model B` | snapshot + drop `rfq_packages*` / `rfq_trade_scopes` / `rfq_recipients` / `rfq_addenda`; drop legacy `rfqs` quote columns |

## 5. Backfill — idempotent + per-record verification (amend R2-#9)
**Idempotent:** re-runnable; upsert submissions on a natural key (`rfq_id` + a deterministic `backfill_key` = source message-id or `legacy:v1`), skip existing; never create a 2nd v1 for the same rfq on re-run.
**Per-record mapping:** each `rfqs` row with a quote → one submission (version 1): `quoted_amount`→extracted, `quote_amount`→confirmed (+`confirmed_at` from `received_at`, `verification_status='verified'` where a human amount existed); each quote PDF → one `rfq_quote_attachments` (checksum computed, `is_primary=true`, `role='quote'`); currently-accepted rfqs → set `accepted_submission_id`/`accepted_at`. Recover the **2 Forrest Ave cabinetry** submission from correspondence.
**Verification checklist (all must pass in a dry-run report before the write is committed):**
1. Per-record: every `rfqs` with a quote has exactly one v1 submission; **no rfq has two v1s** (idempotency proof).
2. Accepted: every rfq with legacy `status='accepted'` has a non-null `accepted_submission_id` pointing at a **same-rfq** submission with `status='accepted'`.
3. Amounts: each submission's `confirmed_amount` == the legacy accepted amount; Σ confirmed == pre-migration accepted total (reconcile).
4. PDFs: every legacy `quote_pdf_url` has a matching attachment row; zero orphan attachments; no duplicate `(submission_id, checksum)`.
5. Duplicate source messages: submissions sharing a `source_message_id` are flagged for human split-review, not silently merged.
6. Counts: `submissions == (rfqs with a quote) + 1 (cabinetry)`.

## 6. Ingestion cutover — the inbound poller (amend R2-#4)
The IMAP quote poller currently writes only legacy `rfqs` quote columns; after backfill it must write **submissions**. Cutover, deployed atomically with N+1:
1. **Pause** the quote poller (flag) before backfill.
2. Run + verify the backfill (§5).
3. **Switch the write adapter:** poller now creates a `rfq_quote_submission` (+ attachments, checksummed, deduped) per inbound email — default one submission/email, never overwriting an earlier submission; stamps `correspondence_id`/`source_message_id`/`match_confidence`. It also mirrors `confirmed_amount`→legacy `rfqs.quote_amount` for one release (rollback safety) until the UI/award read the submission model.
4. **Resume** the poller. (Optional belt-and-braces: dual-write both for the first release.)

## 7. Award atomicity (amend R2-#5)
Accepting a submission runs in ONE transaction: set `rfqs.accepted_submission_id` + `accepted_at` + `accepted_by`, flip that submission `status='accepted'`, and (optionally) `superseded` any prior accepted submission for the rfq. The same-rfq trigger rejects a cross-rfq pointer.

## 8. Build order (unchanged intent; B retired last)
1. Deployment certainty (Railway healthy). 2. **Schema migration N.** 3. **Backfill N+1 + verify (§5).** 4. **Ingestion cutover N+2 (§6).** 5. New read APIs (submission read model — before UI). 6. Grouped Tender Detail. 7. Correction + verification controls. 8. Award flow (§7). 9. Board consolidation + Quote Inbox. 10. Migrate Direct-RFQ + Unmatched → **retire Model B (final migration).** Deploy per phase, test on completion, commit where practical, SOPs updated each phase, no live emails.

## 9. Round-2 amendments — where each lands
1 §3 (don't rename B; `tender_*` names) · 2 §1+§2a (verification_status/at/by) · 3 §1 (no `received` on invitation) · 4 §6 (poller cutover) · 5 §2c+§7 (same-rfq + accepted_at/by + atomic) · 6 §2e (junction table) · 7 §2b (source id/mime/size/checksum/role/extraction_status + unique) · 8 §2a (transactional version) · 9 §5 (idempotent + per-record checklist) · 10 §2a (is_verified vs is_benchmark_eligible).

## 10. Gate
This is the final DDL + cutover + verification checklist. On your go I proceed into implementation at build step 2 (migration N) — deploy/test per phase, no live subcontractor emails.
