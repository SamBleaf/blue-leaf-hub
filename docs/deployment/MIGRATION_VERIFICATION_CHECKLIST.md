# Migration Verification Checklist

> Goal: confirm prod Supabase schema matches what branch `portal-v2` expects **before**
> pointing the API at it. Migrations are additive and idempotent-by-convention, but
> verify-then-apply — never blind-apply.

## 1. What this branch assumes is LIVE
Base schema through **migration 102** (per repo history), plus the portal-v2 set and
later additions this branch's code reads/writes:

| Migration | Adds | Code depends on it |
|---|---|---|
| 103 (+103b) | Portal v2 tables (`project_client_users`, `client_actions`, `portal_documents`, `portal_meetings`, `client_selections`, `selection_options`, `portal_audit_logs`, `portal_notifications`) + ALTERs | `portalV2Routes`, `portalV2AdminRoutes` |
| 104 | `auth_is_staff()` + deny-clients RLS on business tables | client/staff isolation |
| 108 | Portal status CHECK widen + `portal_claims.paid_to_date` (ecosystem cohesion) | claims/variation states |
| **110** | Portal **dispute** state: `portal_claims.dispute_reason` + status CHECK `disputed`; `project_photos.client_visible` (default false) | portal claim dispute + photo visibility gate |
| **117** | `workforce_crews`, `workforce_crew_members`, `workforce_allocations` (+RLS) | `workforceRoutes` allocations/crews |
| **118** | `workforce_planner_jobs` | workforce planner job colors |
| **119** | `workforce_public_holidays`, `workforce_employee_rdo_dates`, `workforce_rdo_patterns` | workforce non-working days |
| **120** | **DROPs** `leads.ptsa_scope_notes` (dead column; idempotent `IF EXISTS`) | none (cleanup) |
| **121** | `site_diary` RLS (`site_diary_authenticated` + `deny_clients`, uses `auth_is_staff()`) | site diary staff-only isolation |
| **122** | Marketing Command Centre tables + `marketing_content_items` columns | marketing routes |

> **This release adds 8 migrations: 108, 110, 117, 118, 119, 120, 121, 122.** `origin/main`
> already has 109 and 111–116 but is MISSING 108 and 110 — numbering is **non-monotonic**;
> do NOT infer prod state from the highest number, and verify/apply **108 and 110 by name**.
> 109 is carpentry cost (already live), NOT the dispute state — the dispute state is **110**.
> Confirm each of the 8 individually in prod. `scripts/verify_migrations.mjs` now probes all 8
> except 121's RLS (service role bypasses RLS — verify 121 manually).

## 2. How to check prod Supabase (read-only, before anything)
In Supabase SQL editor (prod), run and record results:
- [ ] Tables present:
  `select table_name from information_schema.tables where table_schema='public' and table_name in
  ('project_client_users','client_actions','portal_documents','portal_meetings','client_selections','selection_options','portal_audit_logs','portal_notifications');`
  → expect 8 rows (103 live).
- [ ] RLS helper: `select proname from pg_proc where proname='auth_is_staff';` → 1 row (104 live).
- [ ] 108 columns: `select column_name from information_schema.columns where table_name='portal_claims' and column_name in ('paid_to_date');` → present if 108 live.
- [ ] 110 dispute + photo: `select column_name from information_schema.columns where table_name in ('portal_claims','project_photos') and column_name in ('dispute_reason','client_visible');` → expect 2 rows. Also confirm `portal_claims` status CHECK includes `disputed` — `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='portal_claims'::regclass and contype='c';`
- [ ] 117–119 workforce tables: `select table_name from information_schema.tables where table_schema='public' and table_name in ('workforce_crews','workforce_crew_members','workforce_allocations','workforce_planner_jobs','workforce_public_holidays','workforce_employee_rdo_dates','workforce_rdo_patterns');` → expect 7 rows.
- [ ] 120 (DROP): `select column_name from information_schema.columns where table_name='leads' and column_name='ptsa_scope_notes';` → expect **0 rows** (column dropped = 120 applied).
- [ ] 121 site_diary RLS: `select polname from pg_policies where tablename='site_diary';` → expect `site_diary_authenticated` + `deny_clients`. (RLS — not visible to the service-role probe script; check here in SQL.)
- [ ] 122 marketing: `select table_name from information_schema.tables where table_schema='public' and table_name in ('marketing_content_packages','marketing_weekly_plans','drone_shot_plans','marketing_paid_campaigns','marketing_publish_jobs');` → expect 5 rows; and `select count(*) from marketing_campaign_templates;` → expect 7.
- [ ] **Or run `node scripts/verify_migrations.mjs`** (probes 103/104/108/110/117–120/122 via PostgREST; prints present/missing). It does NOT cover 121 (RLS) — verify that one in SQL per the bullet above.
- [ ] Record the highest applied migration filename actually run on prod (keep a note — there is no migrations table by default; track manually).

## 3. Order to apply any MISSING migrations
Apply strictly ascending, one at a time, in the Supabase SQL editor (skip any already confirmed present in §2):
1. Portal base (if missing): 103 → 103b → 104.
2. **108 → 110** — apply BY NAME (main has 109/111–116 but not 108/110, so a "highest number" view will skip them).
3. **117 → 118 → 119 → 120 → 121** — workforce + diary RLS.
4. **122** — Marketing Command Centre.
- [ ] After each: re-run the relevant §2 probe (or `verify_migrations.mjs`) to confirm it took.

## 4. What NOT to apply twice
- [ ] All 8 release migrations (108,110,117–122) are **idempotent** (verified: `CREATE TABLE/INDEX IF NOT EXISTS`,
      `ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS` + re-create, `ON CONFLICT DO NOTHING`), so a careful
      re-probe-then-apply is safe and a re-run will NOT error. Still, skip any whose §2 probe is already green
      to avoid noise.
- [ ] **122 caveat:** the marketing memo says "122 already applied to **main**" — that refers to the **prod DB**,
      NOT the git branch (122 is NOT on `origin/main`). Confirm 122's objects exist in **prod** via §2; if present, skip;
      if absent, apply it (idempotent, so harmless even if partially present).

## 5. Screenshot / log BEFORE deploy
- [ ] **Take a Supabase backup / PITR snapshot** (or note the automatic backup timestamp) — this is the rollback point.
- [ ] Screenshot the §2 probe results (table list, `auth_is_staff` row, CHECK defs).
- [ ] Save the manual note of "highest migration applied on prod = NNN" with date.
- [ ] Record which migrations you applied during this release (for the changelog).

## Verdict gate
Deploy only when: all §2 probes match §1 expectations (or the gaps in §3 have been applied
and re-probed green), and a pre-deploy backup point exists.
