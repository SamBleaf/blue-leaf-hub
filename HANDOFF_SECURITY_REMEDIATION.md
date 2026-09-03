# Handoff — Portal Security Remediation

**From:** security-audit agent · **Date:** 2026-08-30
**Repo:** `~/Desktop/blue-leaf-hub.nosync` · **Branch:** `portal-v2` (tracks `origin/main`)
**Read first:** [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md) (full findings, exploit curls, fix SQL) — this handoff is the *action layer* on top of it.

---

## TL;DR

A security audit of the Supabase RLS / Storage / portal layer found **3 CRITICAL + 3 HIGH + 2 MEDIUM** issues, all one shape: migration 104's `deny_clients` client-lockdown is correct but never covered Storage, post-104 tables, RLS-off tables, views, or the `anon` role. A remediation migration [`supabase/migrations/186_security_remediation.sql`](supabase/migrations/186_security_remediation.sql) is **written and verified but NOT applied and NOT committed**. Your job: apply it safely (staging → verify → prod), then close the handful of findings it deliberately doesn't cover.

### Status board

| Item | State | Owner action |
|---|---|---|
| `SECURITY_AUDIT.md` | ✅ written (untracked) | reference only |
| `186_security_remediation.sql` (C1,C2,C3,H1,H2) | ✅ written, ⛔ **not applied**, ⛔ **not committed** | **apply to staging → verify → prod** |
| Patch `074_site_reports_selfheal.sql` (C3 recurrence) | ❌ not done | do it |
| H3 — Supabase self-signup config | ❌ not checked (dashboard, not code) | verify OFF |
| M1 — webhooks fail-open when secret unset | ❌ not fixed (code) | fail-closed |
| M2 — legacy share-token in URL | ❌ not fixed (code) | scope + expire |
| L1/L2 — anon attribution insert, 1h staff URLs | ❌ not fixed (low) | optional |
| Process fix — `deny_clients` on every new table | ❌ not done | add `/check` rule |

Nothing has been committed or applied. `git status` should show `SECURITY_AUDIT.md`, `HANDOFF_SECURITY_REMEDIATION.md`, and `supabase/migrations/186_security_remediation.sql` as untracked, plus the pre-existing dirty files (`FinanceManager.jsx`, `carpentrySiteFacts.*`) that are **not ours — don't touch them**.

---

## The mental model you must load before touching anything

1. **Portal clients are real Supabase `authenticated` users.** Their JWT carries the same `authenticated` Postgres role as staff. The only differentiator is `user_profiles.role = 'client'`.
2. **The entire client boundary is `public.auth_is_staff()`** (defined in mig 104, `SECURITY DEFINER`, `search_path` pinned). Migration 104 added a RESTRICTIVE `deny_clients` policy `USING (auth_is_staff())` to every then-existing RLS table. Restrictive ANDs with permissive → clients denied. This works **only** for the tables/roles it covered.
3. **The four gaps 186 fixes** are all "104 didn't reach here": Storage objects (C1), tables born after 104 (H1), tables with RLS *off* (C2), and the `anon` role / views (C3, H2). `deny_clients` is `TO authenticated`, so a bare **anon-key** request is never restricted by it — that's why C2/C3 are anonymously exploitable.
4. **The server uses the service-role key and bypasses RLS entirely.** So every fix here is non-breaking for server routes by construction. The only breakage risk is code that reads Supabase *directly from the browser* (anon key + user JWT) — which is why the two BLOCKERs below were checked.

---

## ⚠️ The single biggest gotcha: file-state ≠ live-state

The audit is **static** — it reasons over the 185 migration *files*, which are the intended final state. **The production database may not match**, because migrations here are applied by hand via the Supabase SQL editor and several are known to be lagging (per project memory, migs like 182/184/185 "await Sam applying"). Consequences:

- If **mig 104 itself was never applied to prod**, then `deny_clients` doesn't exist and *far more* than these findings are exposed. **Verify 104 is live first** (`SELECT count(*) FROM pg_policies WHERE policyname='deny_clients';` should be ~100+).
- Some vulnerable tables (mig 140/144/145/153/173/182/185) may not exist yet on prod if their migration is unapplied — 186's `IF NOT EXISTS`/`ALTER TABLE` guards handle absence gracefully, but a missing table will error on `ALTER TABLE ... ENABLE RLS`. Reconcile the applied-migration list before running 186.
- **Before running 186, dump the live policy state** so you can diff after:
  ```sql
  SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
  FROM pg_policies ORDER BY 1,2,3;
  SELECT c.relname, c.relrowsecurity FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'
  ORDER BY 1;
  ```

---

## What 186 does, and what was verified

Covers **C1** (staff-lock Storage `lead-documents` + `marketing-media`), **C2** (enable RLS + staff policy on 17 RLS-off tables), **C3** (drop the anon `site_reports` policy), **H1** (add `deny_clients` to 5 post-104 tables), **H2** (`security_invoker=on` + revoke on 5 views). Full per-finding rationale + exploit curls are in `SECURITY_AUDIT.md`.

**Pre-flight verification already done for you** (so you can apply with confidence):
- **BLOCKER-1 — Storage lockdown safe.** `lead-documents`: zero frontend/client reads (server + 60s portal signed URLs only). `marketing-media`: read only from the **staff-only** Marketing module (`src/components/marketing/*`); uploads use the staff JWT so `auth_is_staff()` passes.
- **BLOCKER-2 — RFQ tables safe.** `rfq_quote_submissions`/`rfq_quote_attachments`: no `src/` access; all writes via `server/lib/tenderSubmissions.mjs` + `tenderRoutes.mjs` (service role); no anon/portal writer.
- Views are plain (not materialized); `v_area_performance` JOINs `v_lead_attribution_roi` and 186 sets `security_invoker` on **both**, so RLS cascades. Storage policy names `authenticated_read/upload/delete` are unique to `marketing-media` (mig 047), so the DROPs are surgical.

**Two caveats to carry forward (not blockers):**
1. **`marketing-media` is almost certainly a *public* bucket** (created manually, UI uses `getPublicUrl()` everywhere — only works on public buckets). If so, 186's marketing-media **read** lock is *cosmetic* — public-bucket reads bypass storage RLS. The upload/delete-to-staff lock is still a real improvement. To actually protect those photos you'd set the bucket `public=false` + move the UI to signed URLs (bigger change; may be undesirable if photos are intentionally web-public). **`lead-documents` is private → its lock is real and is the critical fix.** Confirm both buckets' `public` flag in the dashboard before/after.
2. **Re-run footgun in the C1 block:** the two new `CREATE POLICY` names (`lead_documents_staff_all`, `marketing_media_staff_all`) aren't guarded with `DROP POLICY IF EXISTS`. First run is fine; a *re-run* errors and rolls back the txn. If you want idempotency, add `DROP POLICY IF EXISTS "<name>" ON storage.objects;` before each CREATE.

---

## Your task list (in order)

1. **Reconcile applied migrations** with the file list (see "file-state ≠ live-state"). Confirm mig 104 is live. Snapshot `pg_policies`.
2. **Apply 186 to a branch/scratch Supabase project or staging first.** Not prod.
3. **Run the verification suite** (`SECURITY_AUDIT.md` §6): the anon-key and client-JWT curls must now return `[]`/`401`/`403`; then the **positive control** — a staff JWT must still read the tables, and a client must be able to walk the portal end-to-end (Home, Documents download, Variations, Messages). Getting a client + staff test token: log into the respective portal/app and copy `access_token` from the `sb-<ref>-auth-token` localStorage key (E2E creds exist per project memory).
4. **Apply to prod**, then **`NOTIFY pgrst, 'reload schema';`** (PostgREST caches schema — skipping this yields phantom PGRST errors; see the PGRST204 memory).
5. **Re-run the §6 curls against prod.** Diff `pg_policies` vs the pre-snapshot.
6. **Patch `074_site_reports_selfheal.sql`** so a future self-heal re-run recreates a *staff* policy, not the anon `USING(true)` one (this is what reopened C3). Otherwise C3 silently comes back the next time that migration runs.
7. **Close the findings 186 doesn't cover** (below).
8. **Commit** (see below) once verified. Consider spawning follow-up tasks for the non-code items.

### Findings NOT in 186 — you still own these

- **H3 (config, HIGH):** In Supabase dashboard → Auth, confirm **"Allow new users to sign up" = OFF**. If ON, anyone can self-register → get an `authenticated` JWT → the storage/table/view exposure becomes internet-wide. Verify with the signup curl in §6. Document as a deploy invariant.
- **M1 (code, MEDIUM):** `server/lib/buildexactWebhook.mjs:20` (`if (!secret) return {ok:true, skipped:true}`) and `server/lib/calcomWebhook.mjs:161` fail **open** when their secret env var is unset. Make them fail **closed** (503) + assert `BUILDEXACT_WEBHOOK_SECRET` / `CAL_WEBHOOK_SECRET` exist at startup in prod.
- **M2 (code, MEDIUM):** Legacy portal share-token (`server/lib/requirePortalAuth.mjs` Path B; minted `portalRoutes.mjs:219`) is a non-expiring bearer credential in the URL. Add expiry/revocation, drop `contract_value`/email from the anonymous-token payload, set `Referrer-Policy: no-referrer` on portal pages. (Token entropy is fine — 24 random bytes.)
- **L1/L2 (low):** rate-limit anon `attribution_events` inserts; shorten the 1h staff signed-URL TTL (`salesRoutes.mjs:792`).
- **Process (the durable fix):** add a `/check` rule — *every new RLS-enabled table with a permissive `authenticated` policy must also add `deny_clients`* — or convert mig 104's one-time sweep into a re-runnable function called at the end of each migration. Migs 182/185 already model the correct per-table pattern; H1 is the proof this keeps happening.

---

## Definition of done

- [ ] 104 confirmed live; migration file/live-state reconciled; `pg_policies` snapshotted.
- [ ] 186 applied to staging, §6 curls pass (attacker → empty/403), positive control passes (staff reads + client portal works).
- [ ] 186 applied to prod; `NOTIFY pgrst,'reload schema'` run; §6 re-verified on prod.
- [ ] `marketing-media` and `lead-documents` `public` flags confirmed; decision recorded on whether marketing-media should be made private.
- [ ] `074_site_reports_selfheal.sql` patched.
- [ ] H3 verified OFF; M1 fail-closed; M2 scoped (or explicitly deferred with a ticket).
- [ ] Process rule added.
- [ ] Committed with the audit + this handoff.

---

## Do NOT

- ❌ Apply 186 straight to prod without the staging + verification pass. It touches policies on the single prod DB.
- ❌ Commit/stage the unrelated dirty files (`src/pages/FinanceManager.jsx`, `server/lib/whs/carpentrySiteFacts.mjs`, `src/lib/carpentrySiteFacts.js`) — they belong to other in-flight work.
- ❌ Send any live subcontractor/client emails while testing tender/quote paths (tender build is mid-flight per project memory).
- ❌ Make code changes to "fix" the app to compensate for RLS — the server already bypasses RLS via service role; if something breaks after 186 it's a *direct browser read* that needs rerouting through the server, not a policy loosening.
- ❌ Loosen a policy to make a curl pass. If the positive control fails, the fix is to route that read through the service-role server, or (only for a genuine client-facing need) add a *project-scoped* policy — never `USING(true)`.

---

## Fast file index

| Thing | Path |
|---|---|
| Full audit + exploit curls + fix SQL | `SECURITY_AUDIT.md` |
| Remediation migration | `supabase/migrations/186_security_remediation.sql` |
| Staff check (the whole model) | `supabase/migrations/104_deny_clients_rls.sql` → `public.auth_is_staff()` |
| C3 recurrence source | `supabase/migrations/074_site_reports_selfheal.sql:36-37` |
| Client boundary middleware | `server/lib/requireAuth.mjs:24` (rejects role=client), `server/lib/requirePortalAuth.mjs` |
| Portal API (well-scoped, no IDOR — don't regress) | `server/lib/portalV2Routes.mjs` |
| Storage bad policies (C1) | `060_lead_notes_documents.sql:80-115`, `047_marketing_media_storage_rls.sql` |
| Webhooks (M1) | `server/lib/buildexactWebhook.mjs:20`, `server/lib/calcomWebhook.mjs:161` |

**Suggested commit (after verification):**
```
security: RLS/Storage remediation (mig 186) + audit + handoff

Closes C1 (storage buckets client-readable/deletable), C2 (17 RLS-off
tables anon-exposed), C3 (site_reports anon CRUD), H1 (5 post-104 tables
missing deny_clients), H2 (RLS-bypassing views). H3/M1/M2 tracked separately.
```
