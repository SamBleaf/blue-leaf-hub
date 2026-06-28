# Marketing — Migration 122 Staging Apply Procedure

**Doc ID:** MARKETING-STAGING-MIGRATION-122-PROCEDURE
**Date:** 2026-06-28
**Branch:** `marketing-run-a` · **Worktree:** `~/Desktop/blh-marketing.nosync` (isolated)
**Mode:** Procedure reference only. **Do not apply to production.**

> This document describes how to safely apply `supabase/migrations/122_marketing_command_centre_mvp.sql`
> to a dedicated **staging** Supabase project for the Marketing Command Centre smoke verification.
> See `docs/planning/MARKETING_BATCH_4A_STAGING_STRATEGY.md` §5 for the rationale.

---

## STOP CONDITIONS — abort if any apply

- You cannot confirm the target is a **staging-only** Supabase project (never the production ref/URL)
- A `.env.sandbox` or `.env.staging` does not exist, or it contains production credentials
- The migration number 122 is already applied to the target (check first — see §4)
- Migration 122 has been renumbered to accommodate a conflict (apply the new number instead)
- You are unsure which Supabase project you are connected to
- Any other blocker from `docs/planning/MARKETING_BATCH_4A_STAGING_STRATEGY.md` §9

**When stopped:** write a result note, change nothing.

---

## 1. Prerequisites

Before beginning:

1. A dedicated non-production Supabase project is provisioned and accessible.
2. A local `.env.sandbox` (gitignored, never committed) contains staging credentials only — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optionally `SUPABASE_DB_PASSWORD`.
3. You have confirmed the staging project ref is **not** the same as the production project ref.
4. You have confirmed the target does not already have migration 122 applied (§4).

---

## 2. Choose a schema path

### Option A — Schema clone (recommended for a marketing-only smoke)

1. In the **staging** Supabase dashboard: Settings → Database → **Backups / Restore** (or use `pg_dump --schema-only` from the production connection string).
2. Restore a schema-only (no row data) copy of production onto the staging project.
3. Apply only migration `122_marketing_command_centre_mvp.sql` (§3 below).

*Why preferred:* faster, avoids re-applying 120+ migrations, gives you a realistic schema baseline.

### Option B — Fresh project + full migration chain

1. Start with a fresh staging Supabase project (empty DB).
2. Apply migrations **001 through 121 in order**. The SQL files are in `supabase/migrations/`. There is no `db:migrate` CLI in this repo — paste each file into the staging SQL editor **in order**.
3. Apply migration 122 (§3 below).

*When to use:* if a schema clone is not available or if you need an end-to-end chain test. Slower but complete.

---

## 3. Apply migration 122

**Method: staging Supabase SQL editor (canonical path for this repo)**

1. Open the **staging** Supabase project dashboard.
2. Navigate to **SQL Editor**.
3. Open the file `supabase/migrations/122_marketing_command_centre_mvp.sql` in a text editor.
4. Paste the entire file contents into the SQL editor.
5. Click **Run**.
6. Confirm the output shows no errors.

**Idempotency:** Migration 122 is safe to re-run — all DDL uses `IF NOT EXISTS`, policies use `DROP POLICY IF EXISTS` + recreate, seed data uses `ON CONFLICT DO NOTHING`. If a run is interrupted, re-paste and re-run.

**Alternative: guarded apply script (advanced)**

If you prefer a script path over manual paste, use the existing `apply-migration-117.mjs` pattern:

```bash
# Set SUPABASE_URL and SUPABASE_DB_PASSWORD to STAGING values only, then:
SUPABASE_URL=https://YOUR_STAGING_REF.supabase.co \
SUPABASE_DB_PASSWORD=YOUR_STAGING_PASSWORD \
node scripts/apply-migration-117.mjs
```

**Do not create a new apply script that reads `.env` without explicit overrides** — the worktree has no `.env` and must not pick up production credentials by accident.

---

## 4. Pre-apply check — confirm 122 is not already applied

Before applying, run this read-only query in the staging SQL editor:

```sql
-- Check for any existing table that 122 creates:
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'marketing_content_packages'
) AS already_applied;
```

- Result `already_applied = false` → safe to apply.
- Result `already_applied = true` → migration has already run; skip to §5 verification.

**If migration number 122 is already claimed on this target by a different migration:** stop, check `portal-v2` branch state, confirm the correct next free number, renumber the file before applying.

---

## 5. Post-apply verification (read-only SQL)

Run these queries in the staging SQL editor to confirm the migration applied correctly:

```sql
-- 1. Confirm 7 campaign templates seeded
SELECT count(*) AS template_count
FROM marketing_campaign_templates;
-- Expected: 7

-- 2. Confirm stub tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'marketing_content_packages',
  'marketing_weekly_plans',
  'drone_shot_plans',
  'marketing_paid_campaigns',
  'marketing_publish_jobs'
)
ORDER BY table_name;
-- Expected: 5 rows

-- 3. Confirm required columns on marketing_content_items
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'marketing_content_items'
AND column_name IN (
  'package_id', 'operational_labels', 'risk_level',
  'generation_metadata', 'scheduled_at', 'evergreen_score'
)
ORDER BY column_name;
-- Expected: 6 rows

-- 4. Confirm publish_mode column on social_post_publishes
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'social_post_publishes'
AND column_name = 'publish_mode';
-- Expected: 1 row

-- 5. Confirm RLS enabled on new tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
  'marketing_content_packages',
  'marketing_weekly_plans',
  'drone_shot_plans',
  'marketing_paid_campaigns',
  'marketing_publish_jobs'
)
ORDER BY tablename;
-- Expected: 5 rows, all rowsecurity = true
```

All 5 queries must return expected results before proceeding to smoke verification.

---

## 6. PostgREST schema cache reload

Migration 122 ends with `NOTIFY pgrst, 'reload schema'`. If the staging stack honours Postgres NOTIFY, the schema reloads automatically. If new columns are not visible via the REST API:

1. In the staging Supabase dashboard → **API → Restart** (or the equivalent reload button), OR
2. Restart the staging API service if self-hosted.

Symptom if cache is stale: REST API returns 400 on columns that exist in the DB but are not yet in the schema cache.

---

## 7. After verification passes

Once all §5 queries confirm success:

1. Note the staging project ref and the timestamp of apply (for the result doc).
2. Proceed to create `.env.sandbox` from `.env.sandbox.example` with staging credentials.
3. Boot the app against staging (Batch 4C scope).
4. Run the SOP 18-08 smoke checklist and `scripts/marketing-smoke-check.mjs`.

---

## 8. Reference

| Item | Path |
|---|---|
| Migration file | `supabase/migrations/122_marketing_command_centre_mvp.sql` |
| Strategy doc | `docs/planning/MARKETING_BATCH_4A_STAGING_STRATEGY.md` |
| Env template | `.env.sandbox.example` |
| Smoke SOP | `docs/sops/18_marketing_agent/18-08_staging_runtime_smoke_checklist.md` |
| Smoke harness | `scripts/marketing-smoke-check.mjs` |
| Prior apply script pattern | `scripts/apply-migration-117.mjs` |
