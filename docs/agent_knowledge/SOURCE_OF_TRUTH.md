# Blue Leaf Hub — Source of Truth

> Field-level canonical authority is `MASTER_DATA_DICTIONARY.md`. This doc is the entity/lifecycle/module view; where they differ, the dictionary wins.

> Last updated: 2026-05-21
> Critical document. Every data point must have exactly one authoritative source.

---

## Core Entities

### Job / Tender
**Source of truth**: `jobs` table
- `jobs.address` — canonical address. Syncs **one-way only** to `projects.address` via the migration-036 trigger (jobs → projects). Editing `projects.address` does NOT flow back to `jobs`.
- `jobs.contract_value` — contract value is currently **dual-sourced** (a known conflict): the migration-034 trigger stores it on `jobs.contract_value`, but the live finance KPI routes recompute it from `original_contract_value` + signed variations and distrust the stored value. The target is a single **Generated** fact. See `MASTER_DATA_DICTIONARY.md` §17/§20/§29.
- `jobs.original_contract_value` — set once on win. Never updated by variations.
- `jobs.buildexact_job_id` — Buildexact reference. Primary sync point.
- `jobs.lead_id` — link back to Sales lead (nullable, backfilled).
- `jobs.won_at`, `jobs.lost_at` — definitive win/loss timestamps.

**Until reconciled:** follow what the finance KPI routes do (recompute from `original_contract_value` + signed variations). Do **not** assume the stored `jobs.contract_value` is authoritative — it's the unresolved side of a known dual-source conflict.

---

### Project (Operations)
**Source of truth**: `projects` table
- `projects.address` — comes from `jobs.address` via the migration-036 trigger, which is **one-way only** (jobs → projects). Edits here do NOT propagate back to `jobs`. Do NOT manually maintain separately — change `jobs.address` instead.
- `projects.job_id` — links to the winning tender. Foreign key.
- `projects.portal_token` — generated UUID for client portal access. Unique per project.
- `projects.buildexact_job_id` — redundant with `jobs.buildexact_job_id`. Watch for drift.
- `projects.schedule_baseline_locked_at` — when baseline was locked.

**Risk**: `buildexact_job_id` exists on both `jobs` and `projects`. These should match. There is no enforced sync. Manual checks needed.

---

### Schedule
**Source of truth**: `schedule_tasks` table
- Tasks with `deleted_at IS NULL` are the live schedule (partial index on active rows).
- `schedule_version` on tasks — incremented during regeneration soft-delete cycle.
- Baseline is stored as `baseline_start_date`, `baseline_end_date` on each task.
- Dependencies: `task_dependencies` JSONB (typed: FS/SS/FF/SF + lag) is authoritative. `depends_on` (legacy array) is fallback. System reads `task_dependencies` first.

**DO NOT** compute schedule health from `projects` table — always compute from `schedule_tasks` with `deleted_at IS NULL`.

---

### Leads
**Source of truth**: `leads` table
- Stage: `leads.stage` — canonical pipeline stage.
- Qualifying score: qualifying scores live as `qualify_*` columns on `leads` (migration 016) — `qualify_budget`, `qualify_timeframe`, `qualify_site`, `qualify_decision_maker`, and a generated `qualify_score`.
- Applied suggestions from transcripts: `lead_conversations.applied_suggestions` JSONB.

---

### Subcontractors
**Source of truth**: `subcontractors` table
- Trade: `subcontractors.trade` (text) AND `subcontractors.trade_category_id` (FK to `trade_categories` — migration 040 backfill).
- `trade_category_id` is more reliable for reporting; `trade` text field is legacy.

---

### Trade Categories (Financial)
**Source of truth**: `trade_categories` table (37 Buildxact master categories)
- Every financial document, budget line, and variation should reference `trade_category_id`.
- `trade_master_library` (37 trades) is a separate concept — this is for RFQ scope templates, not financial categorisation.

**Risk**: Two trade systems exist:
1. `trade_categories` — 37 categories for financial tracking (Buildxact-aligned)
2. `trade_master_library` — 37 trades with RFQ scope templates for tendering
These are distinct but overlapping. They are now **formally linked**: migration 043 added a `trade_category_id` FK on `trade_master_library` (and `rfq_trade_scopes`). `trade_categories` is canonical; watch for confusion where free-text trade fields still bypass the FK.

---

### Contract Value
**Status**: `jobs.contract_value` is currently **dual-sourced** (known conflict, not yet resolved)
- `jobs.original_contract_value` — original, never touched after win
- `jobs.contract_value` — the migration-034 trigger **stores** it, but the live finance KPI routes **recompute** it from `original_contract_value` + signed variations and **distrust the stored value**
- Target state: a single **Generated** fact (one recompute mechanism, the other dropped) — see `MASTER_DATA_DICTIONARY.md` §17/§20/§29
- Until reconciled, follow what the finance KPI routes do (recompute); do not assume the stored `jobs.contract_value` is authoritative

---

### Invoices / Financial Documents
**Source of truth**: `financial_documents` table
- Approval state: `financial_approvals` rows linked to document.
- `financial_documents.status` — `pending`, `approved`, `on_hold`, `rejected`
- A document is only "approved" when a `financial_approvals` row exists with the approved status.

---

### Progress Claims
**Source of truth**: `progress_claims` table
- Claim schedule: JSONB rows per trade
- Payment tracking: `progress_claim_payments` (separate table per payment received)
- `percentage_claimed` field type was fixed in migration 040 (was overflowing with numeric(5,2) — now numeric(8,2))

---

### Fee Proposals
**Source of truth**: `fee_proposals` table
- PDF stored in Dropbox: `fee_proposals.dropbox_pdf_path`
- Google Doc: `fee_proposals.google_doc_url`
- Status synced to Buildexact: `fee_proposals.buildexact_sync_status`

**Risk**: Fee proposal data also partially lives in localStorage (DOCX template). Template is stored as base64 under `blhub_fee_proposal_docx_template_b64`. This is the only client-only data store. If localStorage is cleared, template must be re-uploaded.

---

## Naming Conventions

| Entity | ID field | FK convention |
|--------|----------|--------------|
| jobs | `id` (UUID) | `job_id` on child tables |
| projects | `id` (UUID) | `project_id` on child tables |
| leads | `id` (UUID) | `lead_id` on child tables |
| rfq_packages | `id` (UUID) | `package_id` on child tables |
| schedule_tasks | `id` (UUID) | referenced in `task_dependencies.taskId` (camelCase — JSONB) |

**Note**: `task_dependencies` JSONB uses camelCase keys (`taskId`, `type`, `lag`). All other FKs use snake_case.

---

## Dangerous Assumptions to Avoid

1. **Don't assume lead_id is always set on jobs** — it's nullable (backfilled for old records).
2. **Don't assume buildexact_job_id is unique** — no DB constraint enforces uniqueness.
3. **Don't assume portal_token is always set** — only set when portal is enabled for that project.
4. **Don't read trade from text field alone** — `trade` text on subcontractors is legacy; prefer `trade_category_id`.
5. **Don't assume `jobs.contract_value` is authoritative** — it's dual-sourced (034 trigger stores it; finance KPI routes recompute and distrust it). Follow the finance routes' recompute until it becomes a single Generated fact (`MASTER_DATA_DICTIONARY.md` §17/§20/§29).
6. **Don't show deleted schedule tasks** — always filter `deleted_at IS NULL`.
7. **Don't assume DOCX template exists server-side** — it only exists in client localStorage.
8. **Don't write concurrent Dropbox reads** — always sequential for-loop, never Promise.all.
