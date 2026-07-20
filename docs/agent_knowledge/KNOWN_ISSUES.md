# Blue Leaf Hub — Known Issues & Technical Debt

> Last updated: 2026-05-21 · **Reconciled 2026-07-19** (see banner). Full current backlog: `docs/UNRESOLVED_WORK_INVENTORY.md`.
> Maintained continuously. Mark resolved issues with [RESOLVED] + date.

> **RECONCILE 2026-07-19 (verified against prod):**
> - **ISSUE-001 [RESOLVED]** — `vercel.json` now points at `blue-leaf-hub-production.up.railway.app` (prod API works).
> - **ISSUE-004 [DORMANT]** — `jobs.buildexact_job_id` has **0** populated rows, so no duplication can occur today; the structural column-on-both remains as latent debt, not a live bug.
> - **ISSUE-005 (RLS) [anon exposure CLOSED]** — the raw anon key (unauthenticated) reads 0 rows from every sensitive table (employees/timesheets/jobs/leads/…). No anonymous leak. Residual: a full `TO authenticated` policy audit still needs SQL access (low practical risk — app is API/service-role mediated).
> - **ISSUE-002 / ISSUE-003 [STILL OPEN]** — AGENT_OVERVIEW schema doc is now ~108 migrations behind (mig 148); the dual trade taxonomy (`trade_categories` vs `trade_master_library`) still has no FK link. Genuine, low-urgency.

---

## CRITICAL — Must Fix Before Production Handoff

### ISSUE-001: Vercel Production Rewrite Placeholder — **[RESOLVED 2026-07-19]** (real Railway host in `vercel.json`)
**Severity**: CRITICAL (breaks all API calls in production)
**File**: `vercel.json`
**Detail**: The `/api/:path*` rewrite destination still contains `YOUR-RAILWAY-HOST` placeholder. This means all production API calls will fail until the actual Railway hostname is substituted.
**Fix**: Replace `YOUR-RAILWAY-HOST` with actual Railway deployment URL after Railway deploy.
**Risk**: Zero API functionality in production.

---

### ISSUE-002: AGENT_OVERVIEW.md Schema Documentation Stale
**Severity**: HIGH (misleads agents)
**File**: `AGENT_OVERVIEW.md`
**Detail**: States migrations run from `001_blue_leaf_schema.sql` to `013_job_knowledge_estimate_quotes.sql` — but the actual migration set runs to `040_trade_library_seed_email_tracking.sql`. The doc is ~27 migrations behind reality.
**Fix**: Update AGENT_OVERVIEW.md to reference current migration count (040) and list key tables added in 014–040.
**Risk**: Any agent relying on AGENT_OVERVIEW.md for schema knowledge will have an incomplete picture.

---

## HIGH — Significant Risk or Impact

### ISSUE-003: Dual Trade System — No Formal Link
**Severity**: HIGH
**Tables**: `trade_categories` vs `trade_master_library`
**Detail**: Two separate trade reference tables exist:
- `trade_categories` (37 entries) — Buildxact financial categorisation, used for invoice matching and budget tracking
- `trade_master_library` (37 entries) — RFQ scope templates for tendering
Both have 37 Buildxact-aligned trades. They should represent the same trade taxonomy but have no FK relationship between them. Drift is possible.
**Risk**: A trade named differently in each table breaks reporting linkages. `subcontractors.trade_category_id` uses `trade_categories`; `schedule_tasks.trade_master_id` uses `trade_master_library`. These are different IDs.
**Fix**: Add a `trade_category_id` FK on `trade_master_library` or create a shared canonical trade taxonomy table.

---

### ISSUE-004: buildexact_job_id Duplicated on Jobs and Projects
**Severity**: HIGH
**Tables**: `jobs.buildexact_job_id`, `projects.buildexact_job_id`
**Detail**: Buildexact job ID is stored on both `jobs` and `projects`. There is no enforced sync. If one is updated, the other may drift.
**Fix**: Remove `buildexact_job_id` from `projects` — derive it via `projects.job_id → jobs.buildexact_job_id` JOIN. Or add a trigger to sync them.
**Risk**: Buildexact sync may use wrong ID for a project.

---

### ISSUE-005: RLS Policies Are Intentionally Broad
**Severity**: HIGH (security)
**Detail**: Many RLS policies use `USING (true)` for anon access — especially in earlier migrations. This means unauthenticated API calls (or leaked anon keys) can read sensitive data.
**Affected**: `jobs`, `subcontractors`, `rfqs`, `fee_proposals`, `projects`, `schedule_tasks` and many others.
**Fix**: Audit all RLS policies. Tighten to `auth.uid() IS NOT NULL` for authenticated-only tables. Keep public only for `site_inductions` (the induction form is genuinely public).
**Risk**: Data exposure if anon key is discovered.

---

### ISSUE-006: No Automated Test Suite
**Severity**: HIGH (operational risk)
**Detail**: Zero automated tests exist. All verification is manual. Any refactor or migration has no safety net.
**Fix**: At minimum, add API route integration tests for critical flows: RFQ send, win/loss, schedule generation, finance approval.
**Risk**: Regressions go undetected until discovered in production.

---

### ISSUE-007: module6Routes.mjs Monolith
**Severity**: MEDIUM-HIGH
**File**: `server/lib/module6Routes.mjs` (1848 lines)
**Detail**: The entire Operations API (schedule, WHS, site diary, inductions, global Gantt, trade conflicts, project analytics) is in one file. Difficult to maintain, test, or onboard into.
**Fix**: Split into `scheduleRoutes.mjs`, `whsRoutes.mjs`, `siteDiaryRoutes.mjs`, `operationsAnalyticsRoutes.mjs`.
**Note**: Do not split until stable — refactor risk must be justified.

---

## MEDIUM — Technical Debt or UX Issues

### ISSUE-008: DOCX Template Stored in localStorage
**Severity**: MEDIUM
**Detail**: The fee proposal Word template is stored as base64 in browser localStorage under `blhub_fee_proposal_docx_template_b64`. If a user clears localStorage, or uses a different browser, the template is gone.
**Fix**: Store template server-side in Dropbox or Supabase Storage. Allow upload + download.
**Risk**: Users lose their template unexpectedly.

---

### ISSUE-009: Blueprint Files Fail Lint
**Severity**: MEDIUM
**Detail**: `npm run lint` fails on some Blueprint files due to `process` references (Node.js globals in browser context) and other warnings. The zero-warnings policy (`--max-warnings 0`) means the lint gate is broken.
**Fix**: Resolve each lint error in Blueprint files or configure eslint to ignore specific globals in those files.

---

### ISSUE-010: lead_id on Jobs is Nullable — Historical Data Gap
**Severity**: MEDIUM
**Tables**: `jobs.lead_id`
**Detail**: `lead_id` FK on `jobs` was added in migration 035, after many jobs already existed. Migration attempted a backfill by address match but this is imperfect. Historical jobs may have no lead link.
**Impact**: Lead-to-project conversion funnel reporting will be incomplete for historical data.

---

### ISSUE-011: Quote Tracker Route Silently Redirects
**Severity**: MEDIUM (UX)
**Detail**: The old `/tender-manager/quote-tracker` route now redirects to `/tender-manager/rfq-packages`. No user-facing notification explains this. Users with bookmarks will be redirected silently.
**Fix**: The redirect is intentional and correct. Ensure all internal navigation has been updated. Consider removing the redirect after all users adapt.

---

### ISSUE-012: percentage_claimed Overflow (Fixed in Migration 040)
**Severity**: MEDIUM (now resolved in DB, but old records may be affected)
**Tables**: `progress_claims.percentage_claimed`
**Detail**: Column was `numeric(5,2)` — overflows above 999.99%. Fixed to `numeric(8,2)` in migration 040.
**Risk**: Old claim records created before migration 040 may have invalid data if percentages exceeded 5-digit representation.
**Action**: Verify existing `progress_claims` data after migration 040 is applied.

---

### ISSUE-013: Concurrent Dropbox Reads Break for Smart Sync Files
**Severity**: MEDIUM (known, documented)
**Detail**: Using `Promise.all` for Dropbox File object reads fails for online-only files (Smart Sync). Must use sequential `for...of` loop.
**Status**: Pattern documented in CLAUDE.md and memory. Must be applied every time Dropbox files are read.

---

### ISSUE-014: Portal Token Security Model
**Severity**: MEDIUM (security design)
**Detail**: The client portal uses a UUID token as the sole authentication mechanism. Anyone with the link can view the portal. There is no token expiry, revocation mechanism, or rate limiting.
**Risk**: Shared links (e.g., forwarded emails) give permanent access to project data.
**Fix**: Add token expiry option, revocation endpoint in portal admin, and consider adding a client name/PIN confirmation step.

---

## LOW — Future Improvement

### ISSUE-015: scheduleUtils.js — task_dependencies vs depends_on Dual Support
**Severity**: LOW
**Detail**: The system supports both `task_dependencies` (JSONB typed) and the legacy `depends_on` (simple array). This dual support adds complexity to every dependency calculation.
**Plan**: Sprint 3 — migrate all dependencies to `task_dependencies` JSONB and remove `depends_on` support.

---

### ISSUE-016: Home.jsx Dashboard Is Minimal
**Severity**: LOW
**Detail**: The `/home` page is a basic placeholder. It doesn't show pipeline summary, active projects count, pending actions, or financial headlines.
**Plan**: Sprint 4 or later — build a proper command dashboard for admins.

---

### ISSUE-017: Supervisor Home Is Separate Entry Point
**Severity**: LOW
**Detail**: `SupervisorHome.jsx` at `/supervisor` is a separate minimal page — not integrated with the main AppShell. Role routing sends supervisors here. May be confusing or underbuilt.
**Plan**: Review whether `SupervisorHome` should be merged into the main `/home` with role-filtered content.

---

### ISSUE-018: Xero Integration Planned But Not Built
**Severity**: LOW (future feature)
**Tables**: `xero_credentials` (exists in migration 020)
**Detail**: Xero credential storage is in the DB. The integration UI exists in settings. Actual Xero sync (invoice push, payment pull) is not yet implemented.

---

### ISSUE-019: Email Delivery Tracking Is Pixel-Based Only
**Severity**: LOW
**Tables**: `email_delivery_events`
**Detail**: Email open tracking uses a 1x1 pixel. This is blocked by most modern email clients (Gmail, Apple Mail) by default. Delivery tracking reliability is low.
**Fix**: Track link clicks (portal views) instead of pixel opens — already partially captured.

---

### ISSUE-020: Cost Intelligence Engine Is Partially Built
**Severity**: LOW
**Tables**: `project_metrics`, `normalized_costs`, `cost_benchmarks`, `cost_intelligence_insights`, `pretender_estimates`
**Detail**: DB schema and some routes exist for cost intelligence. Full benchmarking from historical data and AI insight generation is partially implemented.
**Plan**: Module 7+ — build out cost benchmarking as historical data accumulates.
