# W18-P0-01 — Portal Migrations 108 + 110 Readiness Gate

**Date:** 2026-06-22  
**Owner:** Cursor (Hub hardening)  
**Status:** **Verified applied** (2026-06-22) — column + CHECK behavioral probes pass on `khehclrwppjvrogyxmdb`. **Do not re-apply.**  
**Related:** [18_CLIENT_PORTAL_LIFECYCLE.md](./workflows/18_CLIENT_PORTAL_LIFECYCLE.md) · W18-DRIFT-002 · [108_portal_ecosystem_cohesion.sql](../../supabase/migrations/108_portal_ecosystem_cohesion.sql) · [110_portal_dispute_and_photo_visibility.sql](../../supabase/migrations/110_portal_dispute_and_photo_visibility.sql)

---

## 1. Executive summary

Migrations **108** and **110** widen CHECK constraints and add columns on **portal shadow tables** so Finance CC void/dispute/partial-pay events can sync to the client portal without silent DB rejections. App code in `portalIntegration.mjs` and `portalV2Routes.mjs` **already expects** these objects.

**Planning probe (2026-06-22):** Connected Supabase project (`khehclrwppjvrogyxmdb` via `.env`) reports:

| Probe | Result |
|-------|--------|
| `portal_claims.paid_to_date` (108) | **present** |
| `project_photos.client_visible` (110) | **present** |
| `portal_claims.dispute_reason` (110) | **present** |

**Interpretation (updated 2026-06-22 CHECK verify):** Columns **and** CHECK constraints **fully applied** on env-connected project `khehclrwppjvrogyxmdb`. **Skip migration apply.** Proceed to W18-P0-02 smoke/tests.

**Risk if unapplied:** Voided variations/claims keep live client action buttons; disputed claims cannot sync; Journey photos may show without staff opt-in; `claim_paid` / `variation_approved` notifications fail silently.

---

## 2. What migration 108 does

**File:** `supabase/migrations/108_portal_ecosystem_cohesion.sql`  
**Label:** Portal ecosystem cohesion (Wave 2/3)  
**Apply method:** Manual — Supabase dashboard SQL editor (per file header)

| Change | Detail |
|--------|--------|
| `portal_decisions` CHECK | Adds `'withdrawn'` to allowed `status` values |
| `portal_claims` CHECK | Adds `'partially_paid'`, `'void'` to allowed `status` values |
| `portal_claims.paid_to_date` | New column `numeric(12,2)` via `ADD COLUMN IF NOT EXISTS` |

**App consumers:** `portalIntegration.mjs` — `syncVariationVoided`, `syncClaimVoided`, `syncClaimPaid`; `portalSync.mjs` nightly void refire.

**Does NOT touch:** Finance CC canonical tables (`job_variations`, `progress_claims`).

---

## 3. What migration 110 does

**File:** `supabase/migrations/110_portal_dispute_and_photo_visibility.sql`

| Change | Detail |
|--------|--------|
| `portal_claims` CHECK | Re-widens to add `'disputed'` (requires 108 applied first or compatible prior CHECK) |
| `portal_claims.dispute_reason` | New nullable `text` column |
| `project_photos.client_visible` | New `boolean DEFAULT false` — **existing rows backfilled to `false`** |
| `portal_notifications` CHECK | Adds `'claim_paid'`, `'variation_approved'` notification types |

**App consumers:** `portalIntegration.mjs` — `syncClaimDisputed`, `syncClaimPaid` notify; `portalV2Routes.mjs` Journey photo filter `.eq("client_visible", true)`; `portalV2AdminRoutes.mjs` photo publish.

**Does NOT touch:** Finance CC canonical tables.

---

## 4. Tables / columns / policies / functions affected

| Object | Migration | Type | Notes |
|--------|-----------|------|-------|
| `portal_decisions.status` CHECK | 108 | constraint modify | Shadow — client variation UI |
| `portal_claims.status` CHECK | 108, 110 | constraint modify | 110 replaces 108 CHECK with superset |
| `portal_claims.paid_to_date` | 108 | column add | Nullable |
| `portal_claims.dispute_reason` | 110 | column add | Nullable |
| `project_photos.client_visible` | 110 | column add | Default `false` |
| `portal_notifications.notification_type` CHECK | 110 | constraint modify | Enables payment/approval notify |

**No new tables.** No RLS policy changes. No functions created. No Finance CC tables altered.

---

## 5. Already applied locally?

| Environment | How checked | 108 | 110 | CHECK defs |
|-------------|-------------|-----|-----|------------|
| Repo `.env` Supabase (`khehclrwppjvrogyxmdb`) | `verify_migrations.mjs` + column probe | **likely yes** (`paid_to_date` ✓) | **likely yes** (`client_visible`, `dispute_reason` ✓) | **unknown** — needs §10 SQL |
| Local dev DB (if different URL) | Not checked separately | **unknown** | **unknown** | **unknown** |

**Note:** `scripts/verify_migrations.mjs` only probes `108 portal_claims.paid_to_date`. It does **not** yet probe 110 columns or CHECK text — extend before apply (see §12).

---

## 6. Already applied live/prod?

**Safely checkable:** Yes — read-only column probes via service role (same as planning run).

**Result (2026-06-22):** Columns for **both** migrations present on env-connected project. Treat as **likely applied** pending CHECK verification.

**Not safely checkable without DBA:** Exact CHECK constraint text, partial apply (column exists but CHECK stale), Railway vs Supabase env drift if multiple projects exist.

**Confirm:** `.env` `SUPABASE_URL` target is the intended production project before trusting probe results.

---

## 7. Data risk assessment

| Risk | Severity | Detail |
|------|----------|--------|
| Silent sync failure (pre-apply) | **High** | App writes `withdrawn`/`void`/`disputed`/`partially_paid` → Postgres CHECK reject → `console.warn` only |
| Journey photos hidden after 110 | **Medium** | `client_visible DEFAULT false` backfills existing `project_photos` to **not visible** until admin re-publishes |
| Re-apply idempotent DDL | **Low** | `DROP CONSTRAINT IF EXISTS` + `ADD COLUMN IF NOT EXISTS` — safe to re-run |
| Finance canonical corruption | **None** | Portal shadow tables only |
| Client sees wrong variation/claim state | **High (pre-apply)** | Voided finance records may still show Approve / Pay buttons |
| Notification insert failure | **Medium (pre-apply)** | `claim_paid` / `variation_approved` types blocked by CHECK |
| Concurrent portal traffic during apply | **Low** | DDL is brief; brief lock on affected tables |

**No destructive data migration** (no DELETE/UPDATE statements in SQL files).

---

## 8. Rollback limitations

| Limitation | Detail |
|------------|--------|
| No down migration | Files are forward-only DDL |
| CHECK narrowing | Reverting CHECKs fails if rows use new statuses (`withdrawn`, `void`, `disputed`, `partially_paid`) |
| Column drop | Dropping `paid_to_date`, `client_visible`, `dispute_reason` loses data |
| Photo visibility | Cannot auto-restore pre-110 visibility intent after backfill to `false` without admin re-tag or SQL update from backup |
| **Practical rollback** | Restore from Supabase point-in-time backup (if enabled) — not scripted in repo |

**Plan assumption:** Apply is one-way; verify before apply rather than rollback after.

---

## 9. Exact SQL apply plan

**Preconditions**

1. Sam approves apply window.
2. Confirm target project in Supabase dashboard matches `.env` production URL.
3. Run §10 pre-check queries — if all pass, **skip to §11** (no apply needed).
4. Confirm migrations **106/107** (architect) did not define conflicting CHECK names — file headers warn to check; grep repo shows no 106/107 portal CHECK overlap in tracked migrations.

**Apply order (only if pre-check fails)**

```text
Step 1 — Supabase Dashboard → SQL Editor → New query
Step 2 — Paste full contents of supabase/migrations/108_portal_ecosystem_cohesion.sql
Step 3 — Run → expect success (idempotent if partial)
Step 4 — Paste full contents of supabase/migrations/110_portal_dispute_and_photo_visibility.sql
Step 5 — Run → expect success
Step 6 — Run §10 post-check queries
Step 7 — Run §11 app smoke + §12 regression tests
```

**Do NOT**

- Apply 110 before 108 on a fresh DB (110 assumes 108's portal_claims evolution path).
- Use `apply-migration-117.mjs` pattern without Sam approval — no script exists yet for 108/110 (create only when approved).
- Apply during active client portal demo without comms if Journey photos may disappear.

**Optional future script:** Mirror `scripts/apply-migration-117.mjs` → `apply-portal-migrations-108-110.mjs` (requires `SUPABASE_DB_PASSWORD`).

---

## 10. Verification queries after apply

Run in Supabase SQL editor (read-only checks first):

```sql
-- ── Column presence ──
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'portal_claims' AND column_name IN ('paid_to_date', 'dispute_reason'))
    OR (table_name = 'project_photos' AND column_name = 'client_visible')
  )
ORDER BY table_name, column_name;

-- ── CHECK constraint definitions ──
SELECT c.conrelid::regclass AS table_name,
       c.conname,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE c.contype = 'c'
  AND t.relname IN ('portal_decisions', 'portal_claims', 'portal_notifications')
ORDER BY table_name, conname;

-- ── Expected substrings in definitions ──
-- portal_decisions_status_check  → 'withdrawn'
-- portal_claims_status_check     → 'partially_paid', 'void', 'disputed'
-- portal_notifications_notification_type_check → 'claim_paid', 'variation_approved'
```

**Functional probe (non-production or test project only):**

```sql
-- Do NOT run on prod with real IDs unless using a test row you will delete.
-- Validates CHECK accepts new statuses (service role bypasses RLS but not CHECK).
BEGIN;
  UPDATE portal_decisions SET status = 'withdrawn'
  WHERE id = (SELECT id FROM portal_decisions LIMIT 1);
ROLLBACK;
```

**PostgREST probe (matches CI script — extend verify_migrations.mjs):**

```bash
node scripts/verify_migrations.mjs   # currently checks 108 paid_to_date only
# Add probes:
#   110 project_photos.client_visible
#   110 portal_claims.dispute_reason
```

---

## 11. App-level smoke tests after apply

| # | Action | Expected |
|---|--------|----------|
| 1 | Finance: void a test variation on a portal-enabled project | Client Actions card closes; no Approve button |
| 2 | Finance: void a test progress claim | Client cannot notify payment |
| 3 | Finance: dispute a test claim (if UI exists) | Portal claim → `disputed`; pay button gone |
| 4 | Portal admin: upload/tag photo with `clientVisible=true` | Photo appears on client Journey |
| 5 | Portal admin: photo without client visible | Photo **not** on Journey |
| 6 | Mark claim paid in Finance | Client receives `claim_paid` notification (in-app; email if configured) |
| 7 | Client portal Journey tab load | No 500; photos respect visibility |
| 8 | Nightly `POST /api/cron/portal-sync` (or wait for cron) | Void refire logs no CHECK errors |

---

## 12. Regression tests to run

| Command | Purpose |
|---------|---------|
| `npm run test:qa-sec-baseline` | Portal admin auth unchanged (23 tests) |
| `npm run test:e2e -- e2e/tests/security/client-isolation.spec.js` | Client scoping + leak scan |
| `npm run test:e2e -- e2e/tests/client-portal/navigation.spec.js` | Client shell smoke |
| `node scripts/verify_migrations.mjs` | Column presence (extend for 110) |

**Planned (not yet implemented):**

| ID | Test |
|----|------|
| W18-MIG-01 | CHECK constraint text matches 108+110 targets |
| W18-API-04 | Notification row created on finance claim_paid event |
| W18-P0-02 | Void variation cannot be approved post-withdraw |

---

## 13. Go / no-go checklist

| # | Gate | Status (2026-06-22) |
|---|------|---------------------|
| 1 | W18 lifecycle map accepted | ✅ |
| 2 | W18-P0-04 generate-token gate shipped | ✅ |
| 3 | Migration SQL files reviewed | ✅ |
| 4 | Apply order documented (108 → 110) | ✅ |
| 5 | Target Supabase project confirmed | ☐ Sam |
| 6 | Pre-check §10 queries run | ☐ partial — columns pass; CHECKs pending |
| 7 | Backup / PITR confirmed available | ☐ Sam |
| 8 | Photo re-publish comms if first-time 110 apply | ☐ if needed |
| 9 | Post-apply smoke §11 | ☐ after apply or verify |
| 10 | Regression §12 green | ☐ after apply or verify |

**Go if:** Pre-check shows missing columns OR CHECK defs missing new values.  
**No-go apply (skip to verification/smoke) if:** All §10 checks pass on target DB.  
**No-go release if:** CHECKs unverified and void/dispute sync untested.

---

## 14. Exact next prompt (if safe)

**If §10 shows migrations NOT fully applied:**

```text
/harden fix W18-P0-01-portal-migrations-108-110

Apply migrations 108 then 110 to Supabase project khehclrwppjvrogyxmdb via SQL editor.
Run §10 verification queries and §11 smoke tests.
Extend scripts/verify_migrations.mjs with 110 probes.
Do not touch Workforce or W17 files.
```

**If §10 shows already applied (current probe suggests this):**

```text
/harden test W18

Add W18-MIG-01 CHECK verification + W18-API-04 notification integration test.
Run portal void/dispute smoke on test project (W18-P0-02).
Close W18-DRIFT-002 if CHECK queries pass.
Do not re-apply migrations.
```

---

## Key questions answered

| Question | Answer |
|----------|--------|
| Idempotent? | **Yes** — `DROP CONSTRAINT IF EXISTS`, `ADD COLUMN IF NOT EXISTS` |
| IF NOT EXISTS? | **Yes** on columns; constraints use drop-then-add |
| Alter existing data? | **110 only** — `client_visible DEFAULT false` backfills existing photo rows |
| New tables? | **No** |
| Modify existing tables? | **Yes** — portal shadow + photos + notifications |
| Finance CC canonical? | **No direct change** — sync hooks write portal shadows |
| Portal shadow only? | **Yes** |
| Client-visible state? | **Yes** — variations, claims, photos, notifications |
| Safe for live Supabase? | **Yes** if pre-checked; brief DDL; photo visibility ops impact |
| Post-apply proof? | §10 SQL + §11 smoke + `verify_migrations.mjs` |

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-22 | **CHECK verification complete** — 108+110 fully applied on env DB; skip apply |
| 2026-06-22 | W18-P0-01 readiness gate — planning pass; column probes on env DB |
