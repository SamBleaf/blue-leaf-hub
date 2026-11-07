# Master Register R03 — release-blocker & security review pack

Read-only verification to run **before** any production apply. Nothing here changes production. Migrations 212, 213 and 214 are **prepared, not applied**. Do not apply without explicit Blue Leaf approval.

## 1. Dependency presence (read-only — run first on production)

The register depends on earlier migrations. All of these must be present before 212/213:

```sql
SELECT to_regclass('public.client_selections') IS NOT NULL                                             AS has_103_client_selections,
       to_regprocedure('public.auth_is_staff()') IS NOT NULL                                           AS has_104_auth_is_staff,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads'    AND column_name='selections_schedule')    AS has_188_selections_schedule,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='is_preconstruction')      AS has_199_is_preconstruction,
       to_regclass('public.internal_categories') IS NOT NULL                                           AS has_200_internal_categories,
       to_regclass('public.room_scope_items') IS NOT NULL                                              AS has_212_room_scope_items,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='register_meta')          AS has_213_register_meta;
```

**Sandbox result (a fully-applied reference DB):** `has_103=t has_104=t has_188=t has_199=t has_200=t has_212=t has_213=t`.

**`has_104` is the load-bearing one.** `auth_is_staff()` is created only in migration 104. Every register table's client-isolation is a RESTRICTIVE `deny_clients USING (auth_is_staff())` policy. If 104 is absent on production:
- 213 **silently skips** its `room_scope_items` `deny_clients` policy (it RAISEs a NOTICE and the migration still succeeds), and
- no register table has a restrictive deny — so a portal client holding a real Supabase `authenticated` JWT (the anon key ships in the browser bundle) could read internal register rows directly through PostgREST.

Repo memory flags migrations 103 and 104 as **unverified on production**. Resolve `has_104` before trusting any of the isolation below. `has_103` (and 199) likewise gate 212/213.

## 2. RLS exposure check (read-only)

### 2a. Register tables — each internal table must carry a RESTRICTIVE deny_clients

```sql
SELECT tablename, policyname, permissive, roles, qual
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('client_selections','room_scope_items','projects','job_events','lead_documents','internal_categories')
ORDER BY tablename, permissive DESC, policyname;
```

**Sandbox result (expected-good):** each of the six tables has `deny_clients [RESTRICTIVE / authenticated] USING auth_is_staff()`. Permissive policies alongside it (`auth_internal`/`auth_users USING true`, and `projects.authenticated_all_projects USING (auth.uid() IS NOT NULL)`) are harmless because a RESTRICTIVE policy ANDs with them — staff pass, clients are denied. If a table here has **no** RESTRICTIVE row on production, it is exposed; apply the migration that adds it (212/213/214) and re-check.

### 2b. Whole-surface sweep — any RLS table a client JWT could read

The query the 214 header ships excludes `%auth.uid()%`, which also hides a dangerous `USING (auth.uid() IS NOT NULL)` blanket policy. Use this refined version, which excludes **only** self-row `auth.uid() = <col>` policies (the legitimate "read your own row" pattern):

```sql
SELECT p.tablename, p.policyname, COALESCE(p.qual, p.with_check, '?') AS predicate
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = p.schemaname
WHERE p.schemaname='public' AND c.relrowsecurity AND p.permissive='PERMISSIVE'
  AND (p.roles @> ARRAY['authenticated']::name[] OR p.roles @> ARRAY['public']::name[])
  AND COALESCE(p.qual, p.with_check, '') !~* 'auth_is_staff'
  AND COALESCE(p.qual, '') !~* 'auth\.uid\(\)\s*=\s*[a-z_]'
  AND NOT EXISTS (SELECT 1 FROM pg_policies r WHERE r.schemaname='public' AND r.tablename=p.tablename AND r.permissive='RESTRICTIVE')
ORDER BY 1;
```

**Sandbox result (104 + 212 + 213 + 214 applied):** zero rows. On production **before** 214, expect `internal_categories (auth_users: true)` to appear (the issue 214 fixes). Any other table that appears is a pre-existing exposure outside the register's scope — report it, don't fix it here.

### 2c. Confirm no portal endpoint leaks internal columns

`job_events` metadata and `client_selections` rows carry internal columns (`approval_evidence`, `pricing_ref`, `technical_evidence`). Confirm no `requirePortalAuth` (client-facing) route does `select('*')` on `job_events` or returns raw register rows. (Staff routes are fine; the concern is only client-reachable endpoints.)

## 3. Migration 214 — internal_categories client-access fix (a separate security change)

- **File:** `supabase/migrations/214_internal_categories_deny_clients.sql`. **Independent of the register** — it fixes a gap migration 200 left: `internal_categories` shipped a permissive `auth_users FOR ALL TO authenticated USING (true)` with no restrictive partner, so any logged-in user, **including a portal client**, could read *and update* Blue Leaf's internal cost categories.
- **Effect:** adds `deny_clients AS RESTRICTIVE FOR ALL TO authenticated USING (auth_is_staff()) WITH CHECK (auth_is_staff())`. Additive; no data change; the existing permissive policy stays.
- **Dependencies:** migration 104 (`auth_is_staff()`) and 200 (`internal_categories`). The migration no-ops with a NOTICE if the table is absent and RAISEs if `auth_is_staff()` is missing (apply 104 first).
- **Rollback:** `DROP POLICY IF EXISTS deny_clients ON public.internal_categories;` (restores the pre-214 state exactly).
- **Affected roles:** `authenticated` clients lose direct read/write (intended); staff (`auth_is_staff()` true) unchanged; `service_role` bypasses RLS (the Hub API is unaffected); `anon` was never the `authenticated` role.
- **Rollback tested (sandbox):** client select/update 6/6 before → 0/0 after; staff unchanged; re-apply idempotent; rollback restores. Includes its own read-only PRE-CHECK (use §2b above, which is stricter).

## 4. Migration dependencies & policy effects (212 / 213)

- **212 `room_scope_items` + `client_selections` provenance:** adds the internal scope table and `client_visible` (default **true** for pre-existing rows, so no existing selection is hidden), plus the unique indexes `client_selections_register_item_uq` / `room_scope_items_register_item_uq`. Portal client reads filter `client_visible` (with a 42703 fallback if the column is missing). **Apply 212 before 213** — `register_apply`'s `ON CONFLICT` targets these indexes and fails at the first edit otherwise.
- **213 R03:** register columns on `client_selections`; `room_scope_items.item_kind` + readiness columns; `projects.register_meta`; `leads/jobs.delivery_model`; `lead_documents` issue columns + the immutability trigger + the "one current issue per type" and "unique (type, version)" indexes; `register_apply` and `register_issue_document` (SECURITY INVOKER, `service_role` only, REVOKEd from PUBLIC/anon/authenticated); `register_touch_updated_at` triggers; RESTRICTIVE `deny_clients` on `room_scope_items` (skipped with a NOTICE if `auth_is_staff()` is absent — see §1). Each `ADD COLUMN IF NOT EXISTS` / `CREATE OR REPLACE` is re-runnable.
- **Verification + rollback:** both migrations end with a VERIFICATION block (213's: every row reads true) and a ROLLBACK block. **Roll back 213 before 212.** Both rollbacks are exercised by `scripts/tests/register-migration-212.test.mjs` and `register-migration-213.test.mjs` on a disposable Postgres (213 now 74/74, including the promotion-robustness regression).
- **After applying on production:** `NOTIFY pgrst, 'reload schema';` (PostgREST schema-cache; a stale cache shows "column … not in schema cache").

## 5. Apply order (when approved)

1. Read-only §1, §2b, and `SELECT to_regprocedure('public.auth_is_staff()')` on production. Confirm `has_103/104/188/199` true and §2b shows only `internal_categories` (or nothing).
2. **214** (security, independent) → run its VERIFICATION + §2b again (now zero rows) → `NOTIFY pgrst, 'reload schema';`.
3. On a **staging / branch database** first: **212 then 213** → run each VERIFICATION block → `NOTIFY pgrst`. Then production, with approval, same order.
4. Ship the code with the **feature switch off** (no behaviour change) before or after the migrations; turn on `REGISTER_PILOT_LEADS=<lead id>` for the pilot only.

No step issues anything to a client; portal visibility remains staff-gated throughout.

## 6. Post-review hardening (Tab 25 independent review)

- **213 now FAILS CLOSED on RLS (blocker 1).** If `auth_is_staff()` is absent, 213 `RAISE EXCEPTION` and aborts (no window where `room_scope_items` is client-readable), and it asserts the RESTRICTIVE `deny_clients` policy exists before proceeding. So §1's `has_104` is now enforced by the migration itself — but still run the read-only check first to avoid a failed apply.
- **document_type preflight (issue 7) — run this read-only on production before applying 213:**
  ```sql
  SELECT DISTINCT document_type FROM public.lead_documents
  WHERE document_type IS NOT NULL AND document_type NOT IN (
    'brief','blueprint','survey','quote','contract','ptsa_signed',
    'concept_agreement','concept_drawings','working_drawings','construction_contract','invoice','other',
    'client_brief','architect_brief','selections_schedule','register_baseline',
    'consultant_document','supplier_document')
  ORDER BY 1;
  ```
  Expected: **zero rows.** Any value returned must be added to the CHECK list in 213 (or the data reconciled) before applying — 213 now runs this same check internally and aborts, naming the offending value, rather than failing mid-apply on the constraint.
- **Contract-baseline protection (blocker 2).** 213 adds `baselined_at` to `room_scope_items` and `client_selections`; `recordBaseline` stamps the current register, and `register_apply` refuses a delete or a substantive change (description / disposition / kind / category / quantity) to a baselined scope/requirement row unless the op carries a `variation_ref` (clerical fields stay editable). Rollback drops the new columns (already in the ROLLBACK block).

## 7. Verification run (2026-11-07) — release-readiness

- **Preflight validated + packaged.** §1, §2a, §2b and §6 (plus a function-privilege check) are consolidated, ready-to-paste and read-only in `docs/master_register/PRODUCTION_PREFLIGHT.sql`. Run against the fully-applied sandbox reference DB on 2026-11-07, every block returned the expected-good result: §1 all deps `t`; §2a all six register tables carry `deny_clients [RESTRICTIVE / authenticated] USING auth_is_staff()`; §2b **zero rows**; §6 **zero rows**; `baselined_at` present on both tables; `register_apply` + `register_issue_document` are `prosecdef=f` and EXECUTE-able by `service_role` only (not anon/authenticated). **This is the baseline to compare production against — the queries were NOT run against production (that requires credentials held only in the deploy env / Railway, never in this repo); a human runs `PRODUCTION_PREFLIGHT.sql` with prod access.**
- **Document-issue failure path is now fault-injected** (supersedes the earlier "reviewed, not fault-injected" residual). `scripts/tests/register-doc-issue-failinject.test.mjs` (`npm run test:register-doc-failinject`, 15/15) runs the real `issueDocument()` against the sandbox and forces `register_issue_document` to fail *after* both the PDF and DOCX are uploaded. It proves, against real storage: a hard RPC error removes **both** objects and throws `DocumentError(400, ISSUE)`; `ok:false` version-conflict cleans each attempt's pair and finally throws `409 VERSION` with **no leaked orphan** across the retry; another `ok:false` reason throws `409 ISSUE` carrying the reason; and a DOCX-upload failure rolls back the already-stored PDF (`502 STORAGE`) — the half-store guard. "Nothing was issued" is literally true in every branch.
- **Full suite (2026-11-07):** 180 unit+migration (R02 15 · R03 model 31 · flag 7 · promotion 22 · mig-212 18 · mig-213 87) + e2e 70 + portal-race 6 + doc-failinject 15 = **271 passed, 0 failed**; ESLint zero-warnings clean; Vite build clean.
