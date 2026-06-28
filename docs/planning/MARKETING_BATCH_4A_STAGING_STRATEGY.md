# Marketing Batch 4A — Staging / Sandbox & Runtime Verification Strategy

**Doc ID:** MARKETING-BATCH-4A-STAGING-STRATEGY
**Date:** 2026-06-28
**Branch:** `marketing-run-a` · **Worktree:** `~/Desktop/blh-marketing.nosync` (isolated)
**Mode:** Planning / risk-review only. No code, no migration apply, no app boot, no production.
**Purpose:** Define exactly how to safely verify the completed Marketing Command Centre worktree at runtime, without ever touching production.

> Aligns with and extends the existing sandbox pattern in `docs/qa/EXTERNAL_SANDBOX_LIVE_FIRE_01.md` (Tier-1 local / Tier-2 cloud). This doc does **not** invent a parallel scheme — it adds the marketing-specific DB + AI requirements that the hardening sandbox did not need.

---

## 1. Current state summary

| Item | State |
|---|---|
| Branch / worktree | `marketing-run-a` / `blh-marketing.nosync` (isolated, tree clean) |
| Completed | Run A `6d3bbe7` · Run B `a381482` · Run C1 `8110883` · Batch 2 `770cea3` · Readiness `fc98cf7` · Batch 3 `9905151` |
| Marketing surfaces | 10 routes (`/marketing` … `/attribution`) + Legacy Studio; ~15 API endpoints under the `/api/marketing` admin gate |
| Migration 122 | **Exists, NOT applied anywhere.** Idempotent, additive, **non-destructive** (verified: only `DROP POLICY IF EXISTS` inside the idempotent RLS block; no DROP TABLE/COLUMN, no TRUNCATE, no DELETE). Ends with `NOTIFY pgrst, 'reload schema'`. |
| Runtime verification | **0% — deferred at every run.** All 6 result docs end "runtime smokes deferred (no safe staging)". |
| Production risk | **None to date** — no run booted the app, applied a migration, or used a production `.env`. The marketing worktree has **no `.env`**. |

**The single blocker across all six runs is the same:** there is no safe environment to apply 122 and boot the app. Everything else is code-complete and static-clean.

---

## 2. Why staging is now the priority

Every marketing surface that matters (Planner, Studio, Approval Queue, Calendar, Vault, Evergreen, Intelligence) depends on migration 122 tables/columns. Until 122 is applied to a **non-production** DB and the app runs against it, we are shipping behind clearly-labelled **demo fallbacks** — which by design *mask* real data-shape and query bugs.

Adding more features now would:
- Stack more unverified code on an unverified base (compounding risk at merge).
- Grow the demo-fallback surface that hides real failures.
- Delay the one thing that converts "code-complete" into "proven".

**Rule for Batch 4 onward: no new marketing feature work until the §6 smoke checklist passes on staging.** Batch 4A is this plan; Batch 4B executes the safe scaffolding; Batch 4C (future) runs the smokes once Sam provisions the DB.

---

## 3. Staging / sandbox requirements

A safe environment must satisfy **all** of the following. If any is unmet, the execution agent stops (see §9).

| Requirement | Detail |
|---|---|
| **Separate Supabase project** | A dedicated non-prod Supabase project (or sanctioned scratch). **Never** the production project ref. This is the hard prerequisite marketing adds beyond the hardening sandbox (which reused the shared DB). |
| **`.env.sandbox` / `.env.staging`** | A non-committed env file (gitignored: `.env.*`) holding only staging values. The worktree currently has none. |
| **No reused production credentials** | Production `SUPABASE_*`, Buildxact, Dropbox, Gmail, Resend, IMAP keys must not appear in the staging env. |
| **Integrations blanked or sinked** | Mail → Ethereal/Mailtrap sink; Buildxact/Dropbox/Gmail/IMAP blank → graceful no-op (already proven in `EXTERNAL_SANDBOX_LIVE_FIRE_01`). |
| **No live Buildxact** | `BUILDEXACT_*` blank. Marketing does not call Buildxact, so blank is sufficient. |
| **No live Dropbox** | `DROPBOX_*` blank. Marketing media uses Supabase Storage, not Dropbox. |
| **No live Gmail/IMAP** | `GMAIL_*` / `IMAP_*` blank. Marketing has no inbound mail dependency. |
| **No live Resend** | Blank, **or** a Resend test key restricted to a test domain. Not required for the marketing smoke (no campaign send in scope). |
| **No external publishing APIs** | `META_*`, GA4/GSC/GBP blank. Manual-publish logging writes to the DB only; no external post is in scope. |
| **AI: test key or disabled** | Either a low-limit `ANTHROPIC_API_KEY` (to smoke real generation) **or** AI left blank (demo-only smoke — validates UI + persistence, not live generation). Decide per §4. |
| **Test users** | One admin and one non-admin user seeded in the staging Supabase Auth, for the role-gate test. |

---

## 4. Environment variable plan

Groups required — **do not print or paste real secret values into any doc, log, or commit.** The execution agent creates a committable **`.env.sandbox.example`** with placeholders only; Sam fills real values into a local `.env.sandbox` (gitignored).

| Group | Variables (placeholders) | Staging setting |
|---|---|---|
| Supabase (server) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Staging project only |
| Supabase (frontend) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Staging project only |
| App/API URL | `VITE_API_URL` / app base URL | Staging API host (never prod) |
| AI | `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` | Low-limit test key **or** blank (demo-only) |
| Email | `RESEND_API_KEY`, `SMTP_*`, `GMAIL_*` | Blank, or SMTP→Ethereal sink |
| Buildexact | `BUILDEXACT_API_URL/USERNAME/API_KEY/SUBSCRIPTION_KEY` | Blank (no-op) |
| Dropbox | `DROPBOX_APP_KEY/SECRET/REFRESH_TOKEN/NAMESPACE_ID` | Blank (no-op) |
| IMAP | `IMAP_HOST/PORT/SECURE/USER/PASS` | Blank |
| Marketing Intelligence ext. | `META_*`, `GA4_PROPERTY_ID`, `GOOGLE_SEARCH_CONSOLE_SITE_URL`, `GBP_LOCATION_ID` | Blank |
| Feature flags | none required | Marketing is admin-gated by role, not by flag — no new flag needed |

**Guard:** the marketing app degrades gracefully on blank integration creds (`getServiceSupabase()` returns null → endpoints return demo/503; AI blank → demo drafts). The only group that must be real-and-staging is **Supabase**.

---

## 5. Migration apply strategy

Migration `122_marketing_command_centre_mvp.sql` — apply path:

1. **Staging only.** Apply via the **staging Supabase SQL editor** (paste file contents), or a copy of the existing one-off apply script (`scripts/apply-migration-117.mjs` pattern) pointed at the **staging** connection string. Never against production. There is no `supabase` CLI or `db:migrate` script in this repo (confirmed), so manual paste is the canonical path per CLAUDE.md.
2. **Dependency order.** A *fresh* staging project needs migrations **001 → 122 in order** before 122 will apply (122 ALTERs `marketing_campaigns`, `marketing_content_items`, `marketing_media_assets`, `social_post_publishes`, which earlier migrations create). Two options for Sam:
   - **(A) Schema clone:** restore a schema-only (no data) copy of prod, then apply only 122.
   - **(B) Fresh project:** apply `supabase/migrations/*` 001→121 in order, then 122.
   Option A is faster and lower-risk for a marketing-only smoke.
3. **Verify number still free.** Confirm no `122_*` already applied to the target and that `portal-v2` has not since claimed 122. If taken, renumber to the next free integer **before** applying (and update the readiness pack).
4. **Idempotency.** Re-running 122 must be a no-op (all `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` / `DROP POLICY IF EXISTS`+recreate). Safe to re-apply if interrupted.
5. **Post-apply verification (read-only SQL):**
   - `SELECT count(*) FROM marketing_campaign_templates;` → **7**
   - Stub tables exist: `marketing_content_packages`, `marketing_weekly_plans`, `drone_shot_plans`, `marketing_paid_campaigns`, `marketing_publish_jobs`
   - New columns exist: `marketing_content_items.package_id / operational_labels / risk_level / generation_metadata / scheduled_at / evergreen_score`; `social_post_publishes.publish_mode`
   - RLS enabled + `*_authenticated` policy on each new table
6. **No destructive statements.** Confirmed by inspection — only additive DDL + the idempotent policy drop/recreate. No data loss possible.
7. **PostgREST reload.** 122 ends with `NOTIFY pgrst, 'reload schema'`; if the staging stack does not honour it, restart PostgREST / the Supabase API so new columns are visible to the REST layer.

---

## 6. Smoke checklist (actionable verification plan)

Run after 122 is applied to staging and the app is booted against the staging env. Source: SOP `18-08`. Each row = one pass/fail.

**Access gates**
- [ ] `/marketing/*` hidden from non-admin (sidebar + route guard); direct nav redirects to `/home`
- [ ] `GET /api/marketing/command-centre` returns 401 without an auth token

**Per-route load (no console error, real data not demo banner)**
- [ ] `/marketing` Command Centre snapshot tiles
- [ ] `/marketing/planner` loads current week; 7 templates; template → campaign + slots; CTA passes `campaign_id`+`week_start`
- [ ] `/marketing/studio` media-first Creator; media picker; `?asset_id=` seeds asset + analysis; angles from `analysis.content_opportunities`; IG/FB drafts; labels/risk; Save to Library; Send package
- [ ] `/marketing/studio/legacy` "Legacy Studio (temporary)" banner; **generate/stream/save still works**; `?asset_id=` rehydrates
- [ ] `/marketing/approval` lists `in_review`; approve/request_changes/reject cascade to child items
- [ ] `/marketing/calendar` week view; scheduled items on correct day; Mark as posted → `social_post_publishes` (`publish_mode=manual`)
- [ ] `/marketing/vault` grid + stage/type/analysis/project filters; Create from this → `?asset_id=`
- [ ] `/marketing/evergreen` items `evergreen_score>0`, sorted desc; mark/adjust updates list
- [ ] `/marketing/intelligence` pipeline tiles + next actions reflect real counts; demo banner absent
- [ ] `/marketing/attribution` source breakdown; 30/90/180 window; unknown bucket; capture gaps

**Flow integrity (end-to-end)**
- [ ] Package persistence: Send package → `marketing_content_packages` + child items
- [ ] Approval → Calendar: approved package becomes schedule-ready → schedule → Mark as posted → published
- [ ] Evergreen marking persists and reappears with new score
- [ ] Attribution display reflects a seeded known-source lead and an unknown-source lead

**Regression**
- [ ] Legacy generate/save creates a `marketing_content_items` row (no regression)
- [ ] Reserved stubs (`/automation` etc.) return 501 without shadowing real routes

---

## 7. Test data plan (minimum seed)

Seed in the staging DB (use a clear test marker, e.g. topic/name prefix `BLH MKT TEST`):

| # | Record | Purpose |
|---|---|---|
| 1 | One test project / job | FK target for media + scheduling |
| 2 | One media asset **with `analysis.content_opportunities`** | Creator angle derivation + Vault analysed filter |
| 3 | One campaign from a template (+ its slots) | Planner + Calendar slots |
| 4 | One content package (`status=in_review`) with 2 child items (IG+FB) | Approval Queue |
| 5 | Draft content items across statuses (draft / in_review / approved) | Intelligence pipeline tiles |
| 6 | One approved item with `scheduled_at` this week | Calendar scheduled display |
| 7 | One manual publish log row (`publish_mode=manual`) | Calendar published + publish-log |
| 8 | One item `evergreen_score>0` | Evergreen Library |
| 9 | One lead with a known source (`lead_source`/`first_touch_source=instagram`) | Attribution source breakdown |
| 10 | One lead with **no** source | Attribution unknown bucket |
| 11 | Admin test user | All admin flows |
| 12 | Non-admin test user | Role-gate test |

Records 4–8 can be produced *through the UI* during the smoke (preferred — exercises the write paths) or pre-seeded via SQL if isolating read paths.

---

## 8. Verification evidence plan

Capture and attach to `MARKETING_BATCH_4B_STAGING_EXECUTION_RESULT.md` (or a 4C smoke result):

- **Route pass/fail table** — one row per §6 item, Pass/Fail/Blocked + note
- **Screenshots** — each of the 10 routes rendering real (non-demo) data; the Creator mid-flow; Approval decision; Calendar published state
- **API response summaries** — `command-centre`, `intelligence`, `attribution`, `packages`, `calendar` (shape + key fields, secrets redacted)
- **Migration confirmation** — the §5.5 read-only query outputs (7 templates, tables, columns, RLS)
- **Role-gate confirmation** — non-admin blocked (UI screenshot + API 401/403)
- **Defect list** — each failure with route, expected, actual, repro
- **Final decision** — **ACCEPT** (all green → clear to plan merge) or **BLOCK** (defects → fix list)

---

## 9. Safety guards for the execution agent (Batch 4B/4C stop conditions)

The later Sonnet execution agent must **stop and report** (touch nothing) if **any** holds:

- No `.env.sandbox` / `.env.staging` present, or it points at (or is ambiguous about) production
- Production env detected (prod Supabase ref/URL, real integration creds)
- Migration target uncertain (cannot confirm the connection is the staging project)
- Migration appears destructive on inspection (it is not today — re-confirm before apply)
- Migration number 122 conflict on the target (already applied differently, or claimed on `portal-v2`)
- Non-admin can reach `/marketing/*` (security regression → stop, report)
- Legacy Studio generate/save broken
- Package / Calendar / Approval flow broken
- Any external integration call would actually fire (real email, real Dropbox/BX, real social post)
- Booting the app would touch production (no staging API/DB confirmed)

On any stop: write the result doc with the trigger, change nothing else.

---

## 10. Recommended Batch 4B execution scope (for Sonnet)

**Safe scaffolding only — zero feature/product code, no migration apply, no boot.** Batch 4B prepares; the actual smoke run (Batch 4C) waits on Sam's staging DB.

1. **`.env.sandbox.example`** — committable template, placeholders only (the §4 groups), with inline comments on staging-only / blank / sink. No real secrets.
2. **Migration apply procedure** — a documented manual procedure (preferred) **or** a guarded apply script that (a) refuses to run unless an explicit `--staging` connection is passed, (b) prints the target host for confirmation, (c) never reads the worktree's absent `.env`. Document the §5 verification queries.
3. **Smoke harness (only if safe)** — a read-only checklist runner / script skeleton that, given a staging base URL + admin token, hits the GET endpoints and prints a pass/fail table. Must make **no writes** and **no external calls**; default to inert if no staging URL is supplied.
4. **`MARKETING_BATCH_4B_STAGING_EXECUTION_RESULT.md`** — what scaffolding was created, what remains gated on Sam.
5. **No feature work.** No edits to marketing components/routes/schema.

Model for 4B: **Sonnet** (mechanical scaffolding + docs), only after Sam approves this strategy.

---

## 11. Decision required from Sam

To unblock Batch 4C (the actual runtime smoke), Sam must provide / confirm:

1. **A staging Supabase project** — dedicated non-prod (schema clone of prod *or* fresh + migrations 001→121 applied).
2. **Staging credentials** — `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `VITE_SUPABASE_*` for that project (into a local gitignored `.env.sandbox`, never committed).
3. **Confirmation integrations are disabled/sinked** — Buildxact/Dropbox/Gmail/IMAP/Resend/Meta/Google blank or sink; AI either a low-limit test key or intentionally blank (demo-only smoke).
4. **Admin + non-admin test users** — seeded in the staging Auth (details or a seed plan).
5. **Explicit permission to apply migration 122 to staging only** — and confirmation 122 is still the correct free number at apply time.

Items 1–2 are the gating prerequisites; 3–5 can follow quickly once the project exists.

---

Next safe action: Sam reviews `MARKETING_BATCH_4A_STAGING_STRATEGY.md`, provides/approves staging details, then runs Batch 4B on Sonnet.

Recommended next model: Sonnet, only after Sam approves the staging strategy.

Code changed: no
Tests changed: no
Docs changed: yes
