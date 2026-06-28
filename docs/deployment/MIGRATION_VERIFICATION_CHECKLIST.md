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
| 108 | Portal status CHECK widen + `paid_to_date` (ecosystem cohesion) | claims/variation states |
| 109 | Claim dispute state | `portal_claims` dispute |
| 122 | Marketing Command Centre tables (applied to main separately) | marketing routes — verify if marketing is in this deploy |

> Note: the live main line was last recorded at **102**; 103/104/108/109 were authored on
> the portal track. Confirm each individually in prod — do not assume.

## 2. How to check prod Supabase (read-only, before anything)
In Supabase SQL editor (prod), run and record results:
- [ ] Tables present:
  `select table_name from information_schema.tables where table_schema='public' and table_name in
  ('project_client_users','client_actions','portal_documents','portal_meetings','client_selections','selection_options','portal_audit_logs','portal_notifications');`
  → expect 8 rows (103 live).
- [ ] RLS helper: `select proname from pg_proc where proname='auth_is_staff';` → 1 row (104 live).
- [ ] 108 columns: `select column_name from information_schema.columns where table_name='portal_claims' and column_name in ('paid_to_date');` → present if 108 live.
- [ ] 109: confirm `portal_claims` status CHECK includes `disputed` —
  `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='portal_claims'::regclass and contype='c';`
- [ ] Marketing (only if deploying marketing): check 122's tables exist (per marketing memo, 8/8 already verified on main).
- [ ] Record the highest applied migration filename actually run on prod (keep a note — there is no migrations table by default; track manually).

## 3. Order to apply any MISSING migrations
Apply strictly ascending, one at a time, in the Supabase SQL editor:
1. 103 → 103b → 104 → 108 → 109 (skip any already confirmed present in §2).
2. 122 only if marketing is part of this release **and** not already on prod.
- [ ] After each: re-run the relevant §2 probe to confirm it took.

## 4. What NOT to apply twice
- [ ] Do **not** re-run a migration whose §2 probe already shows its objects exist —
      re-running non-idempotent `CREATE TABLE`/`ALTER ... ADD COLUMN` without `IF NOT EXISTS`
      will error and may abort a transaction mid-way.
- [ ] 104 RLS policies: re-creating an existing policy errors — skip if `auth_is_staff` + policies present.
- [ ] 122 was already applied to main — do not apply again on the same DB.

## 5. Screenshot / log BEFORE deploy
- [ ] **Take a Supabase backup / PITR snapshot** (or note the automatic backup timestamp) — this is the rollback point.
- [ ] Screenshot the §2 probe results (table list, `auth_is_staff` row, CHECK defs).
- [ ] Save the manual note of "highest migration applied on prod = NNN" with date.
- [ ] Record which migrations you applied during this release (for the changelog).

## Verdict gate
Deploy only when: all §2 probes match §1 expectations (or the gaps in §3 have been applied
and re-probed green), and a pre-deploy backup point exists.
