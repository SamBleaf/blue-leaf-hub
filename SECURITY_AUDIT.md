# Blue Leaf Hub — Client Portal Security Audit

**Date:** 2026-08-24
**Scope:** `blue-leaf-hub.nosync` (React/Vite + Express service-role API + Supabase Postgres/Storage). 185 migrations, branch `portal-v2`.
**Threat model:** a legitimate portal **client** with a valid Supabase JWT (role `client`) talking directly to the Supabase REST/Storage/RPC APIs, and an **anonymous** attacker holding only the public anon key (which ships in the browser bundle). The UI is treated as non-security. Report only — no code was changed.

> **Note on the attached `hub-backup-system.zip`:** that archive contains only the nightly backup system (3 shell scripts + a GitHub Actions workflow). It has no portal, RLS or database policies to audit, and its secrets are all injected via `${{ secrets.* }}` — no hardcoded credentials. The real subject of this audit is the Hub application repository on disk. The backup scripts are assessed briefly under **INFO-1**.

---

## 1. Executive summary

**Overall risk: HIGH.** The portal team did the hard part well — migration 104 (`deny_clients`) is a solid, correct lockdown that closes direct client access to the crown-jewel tables (jobs, projects, fee proposals, financials, CRM, correspondence, portal_*), and the portal v2 server API is genuinely well-scoped against IDOR. **But the lockdown has four systematic gaps**, all of the same shape: `deny_clients` was a one-time sweep over public **tables** that existed in August's migration 104, and it never covered (a) Supabase **Storage**, (b) tables created **after** it, (c) tables with **RLS switched off**, or (d) **views** and the **anon** role. Each gap re-opens a class of data the lockdown was meant to protect.

### Findings by severity

| Severity | Count | Findings |
|---|---|---|
| CRITICAL | 3 | C1 Storage buckets world-readable/deletable by any logged-in user · C2 17 tables with RLS disabled (anon + client CRUD) · C3 `site_reports` anonymous CRUD |
| HIGH | 3 | H1 5 post-104 tables missing `deny_clients` (client CRUD) · H2 5 RLS-bypassing views · H3 self-signup amplifier (config) |
| MEDIUM | 2 | M1 webhooks fail-open when secret unset · M2 legacy share-token in URL |
| LOW / INFO | 4 | L1 anon attribution insert · L2 1-hour staff signed URLs · INFO-1 backup system · INFO-2 what's working |

### The 3 most urgent fixes

1. **Lock down Storage (C1).** Replace the `bucket_id = '…'`-only policies on `storage.objects` for `lead-documents` and `marketing-media` with staff-only (`auth_is_staff()`) policies. Right now **any portal client can download and *delete* every client's signed contracts, site surveys and photos** with a three-line curl. This is the single highest-impact issue.
2. **Enable RLS on the 17 disabled tables + fix `site_reports` (C2, C3).** These are readable/writable by an **anonymous** holder of the public anon key — no login at all — including confidential subcontractor pricing, tender scopes, client addresses and WHS incident reports.
3. **Add `deny_clients` to the 5 post-104 tables and make it a migration checklist item (H1).** Then adopt the pattern permanently so table #186 doesn't reopen the hole.

---

## 2. How the access model actually works (read this first)

Understanding three facts makes every finding below obvious:

1. **Clients are real `authenticated` users.** Portal v2 issues clients genuine Supabase accounts (`auth.admin.createUser`). Their JWT carries the `authenticated` Postgres role — the *same role staff get*. The only thing that distinguishes a client is `user_profiles.role = 'client'`.
2. **The whole security model is `deny_clients`.** Migration `104_deny_clients_rls.sql` loops over every table that had RLS enabled *at that moment* and adds a **RESTRICTIVE** policy `USING (public.auth_is_staff())`. Restrictive policies AND with the permissive ones, so a client (`auth_is_staff() = false`) is denied. This is correct and works — **for the tables and roles it actually covers.**
3. **What `deny_clients` does *not* cover:**
   - `storage.objects` (it only touched the `public` schema) → **C1**
   - tables created in migrations 105–185 (the loop already ran) → **H1** (and the team's own migrations 121/182/185 prove they know this, but missed 5)
   - tables with **RLS disabled** (the loop only touches `relrowsecurity = true`) → **C2**
   - **views** (owner-rights, no RLS) → **H2**
   - the **`anon` role** — `deny_clients` is `TO authenticated`, so a bare anon-key request is never restricted by it → **C3**, and it makes **C2** anonymously exploitable.

The anon/authenticated roles hold table privileges by default (proven by the fact that the staff frontend reads `jobs`, `leads`, `fee_proposals` etc. directly through the anon-key client and relies solely on RLS to gate them). So "RLS off" or "no restrictive policy for this role" means "open via the REST API."

---

## 3. RLS matrix (Phase 2)

169 tables were modelled to final state by replaying all 185 migrations (including policies created inside `DO $$` blocks and migration 104's dynamic sweep). Full per-table JSON is in the audit worktree; the security-relevant categories:

### 3a. Tables reachable by an attacker (the findings)

| Table | RLS | Permissive policy | `deny_clients`? | Who can reach it | Finding |
|---|---|---|---|---|---|
| `storage.objects` (bucket `lead-documents`) | on | `SELECT/INSERT/DELETE TO authenticated USING bucket_id` | **no** | any authenticated (incl. client) | **C1** |
| `storage.objects` (bucket `marketing-media`) | on | `SELECT/INSERT/DELETE TO authenticated USING bucket_id` | **no** | any authenticated (incl. client) | **C1** |
| `rfq_quote_submissions` | **off** | — | — | **anon** + authenticated | **C2** |
| `rfq_quote_attachments` | **off** | — | — | **anon** + authenticated | **C2** |
| `tender_trade_scopes` | **off** | — | — | **anon** + authenticated | **C2** |
| `tender_addenda` | **off** | — | — | **anon** + authenticated | **C2** |
| `tender_addendum_trades` | **off** | — | — | **anon** + authenticated | **C2** |
| `geocode_cache` | **off** | — | — | **anon** + authenticated | **C2** |
| `marketing_weekly_plans` | **off** | — | — | **anon** + authenticated | **C2** |
| `marketing_paid_campaigns` | **off** | — | — | **anon** + authenticated | **C2** |
| `marketing_publish_jobs` | **off** | — | — | **anon** + authenticated | **C2** |
| `marketing_content_packages` | **off** | — | — | **anon** + authenticated | **C2** |
| `marketing_campaign_templates` | **off** | — | — | **anon** + authenticated | **C2** |
| `marketing_library` | **off** | — | — | **anon** + authenticated | **C2** |
| `drone_shot_plans` | **off** | — | — | **anon** + authenticated | **C2** |
| `schedule_eot` | **off** | — | — | **anon** + authenticated | **C2** |
| `rfq_events` | **off** | — | — | **anon** + authenticated | **C2** |
| `rfq_package_orphans` | **off** | — | — | **anon** + authenticated | **C2** |
| `trade_master_library` | **off** | — | — | **anon** + authenticated | **C2** |
| `site_reports` | on | `"Allow all anon site_reports" FOR ALL TO public USING(true)` (mig 074) | present but `TO authenticated` only | **anon** (public) + authenticated | **C3** |
| `carpentry_budget_line_items` | on | `auth_users FOR ALL TO authenticated USING(true)` | **no** (created mig 140 > 104) | any authenticated (incl. client) | **H1** |
| `carpentry_job_stage_schedule` | on | `auth_users … USING(true)` | **no** (mig 144) | any authenticated (incl. client) | **H1** |
| `charge_up_jobs` | on | `auth_users … USING(true)` | **no** (mig 145) | any authenticated (incl. client) | **H1** |
| `task_assignments` | on | `auth_users … USING(true)` | **no** (mig 153) | any authenticated (incl. client) | **H1** |
| `site_task_deletions` | on | `auth_users … USING(true)` | **no** (mig 173) | any authenticated (incl. client) | **H1** |

### 3b. Views — RLS-bypassing (H2)

| View | Migration | `security_invoker`? | Underlying sensitive tables |
|---|---|---|---|
| `v_crm_people` | 131 | no | `leads`, `crm_contacts` (all names/emails/phones) |
| `v_lead_timeline` | 128 | no | `lead_activities`, `lead_notes`, `lead_conversations`, `crm_interactions`, `email_send_recipients` |
| `v_lead_attribution_roi` | 130 | no | `leads`, attribution + revenue |
| `v_area_performance` | 137 | no | leads/jobs aggregates |
| `v_procurement_dashboard` | 014 | no | procurement / supplier pricing |

### 3c. Properly protected (representative — no action needed)

- **97 tables** are RLS-on with a `deny_clients` restrictive policy (via the mig-104 sweep or an explicit re-add in migs 121/182/185). This includes every crown-jewel table: `jobs`, `projects`, `fee_proposals`, `financial_documents`, `financial_approvals`, `progress_claims`, `correspondence`, `crm_contacts`, `crm_interactions`, `leads`, `lead_activities`, `cost_intelligence`, `purchase_orders`, `rfqs`, `subcontractors`, `xero_invoices`, `xero_contacts`, `lead_meetings`, all `portal_*`, `site_diary`, etc. A client JWT is correctly denied on all of these. **`leads`/`lead_activities` were briefly anon-open (mig 016) but mig 044 dropped those policies — they are safe in final state.**
- **~34 tables** are RLS-on with **no permissive policy at all** (deny-all to anon & authenticated; reachable only via the service-role server). Includes `timesheets`, `timesheet_entries`, `employees`, `suppliers`, `lead_documents`, `procurement_items`, all `workforce_*`, all `whs_*`, `document_templates`, `invitations`, `project_client_users`, `user_profiles` (client may read own row only). Safe from clients. *(Functional note only: because these are deny-all, any staff feature that reads them must go through the server, not the anon-key client — verify Workforce/WHS screens still populate.)*

---

## 4. Findings

Ordered by severity. Each has location, exploit scenario, and the exact fix.

---

### 🔴 CRITICAL

---

#### C1 — Storage buckets `lead-documents` & `marketing-media` are readable *and deletable* by any authenticated user (including every portal client)

**Location:** `supabase/migrations/060_lead_notes_documents.sql:80-115`, `supabase/migrations/047_marketing_media_storage_rls.sql:1-60`

The `storage.objects` policies scope access by bucket only, to the whole `authenticated` role:

```sql
CREATE POLICY "lead_documents_authenticated_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lead-documents');          -- no per-user / per-folder scoping
CREATE POLICY "lead_documents_authenticated_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lead-documents');          -- any authenticated user can delete anything
```

Migration 104's `deny_clients` sweep only touched the `public` schema, so it never restricted `storage.objects`. When these policies were written (June), the only `authenticated` users were staff, so "TO authenticated" meant "staff." Portal v2 (August, migs 103/104) then minted **client** accounts with the same `authenticated` role — silently converting these into "any client" policies.

`lead-documents` holds site surveys, **signed PTSA / concept agreements**, and fee-proposal DOCX/PDFs (`server/lib/salesRoutes.mjs:786`, `:1275`; `server/lib/dropboxClient.mjs:859`). `marketing-media` holds project photos/videos.

**Exploit scenario:** Client A logs into their portal, opens dev tools, and copies their Supabase access token + the public anon key (both already in the page). They then call the Storage API directly:

```bash
# List every file in the leads bucket (all clients, all leads)
curl "$SUPABASE_URL/storage/v1/object/list/lead-documents" \
  -H "Authorization: Bearer $CLIENT_JWT" -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" -d '{"prefix":"","limit":1000}'
# → download any object
curl "$SUPABASE_URL/storage/v1/object/lead-documents/leads/<other-client-id>/2026-08-01-contract.pdf" \
  -H "Authorization: Bearer $CLIENT_JWT" -H "apikey: $ANON_KEY" -o stolen.pdf
# → or DELETE every file in the bucket (destructive)
curl -X DELETE "$SUPABASE_URL/storage/v1/object/lead-documents/leads/<victim>/contract.pdf" \
  -H "Authorization: Bearer $CLIENT_JWT" -H "apikey: $ANON_KEY"
```

Client A now has every other client's contracts and surveys, and can wipe the bucket.

**Fix** — replace the broad policies with staff-only, and route all legitimate client file access through the server (which already uses signed URLs — `portalV2Routes.mjs:772`). The portal never reads these buckets with a client JWT, so this is non-breaking.

```sql
-- lead-documents
DROP POLICY IF EXISTS "lead_documents_authenticated_read"   ON storage.objects;
DROP POLICY IF EXISTS "lead_documents_authenticated_upload" ON storage.objects;
DROP POLICY IF EXISTS "lead_documents_authenticated_delete" ON storage.objects;
CREATE POLICY "lead_documents_staff_all" ON storage.objects
  FOR ALL TO authenticated
  USING  (bucket_id = 'lead-documents' AND public.auth_is_staff())
  WITH CHECK (bucket_id = 'lead-documents' AND public.auth_is_staff());

-- marketing-media (keep the anon thumbnails-only read policy as-is)
DROP POLICY IF EXISTS "authenticated_read"   ON storage.objects;
DROP POLICY IF EXISTS "authenticated_upload" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_delete" ON storage.objects;
CREATE POLICY "marketing_media_staff_all" ON storage.objects
  FOR ALL TO authenticated
  USING  (bucket_id = 'marketing-media' AND public.auth_is_staff())
  WITH CHECK (bucket_id = 'marketing-media' AND public.auth_is_staff());
```

Confirm both buckets are **private** (they are created private for `site-media`/`job-plans`; verify `lead-documents` and `marketing-media` in the dashboard have `public = false`).

---

#### C2 — 17 tables have RLS **disabled** → readable/writable by anyone with the public anon key

**Location:** table definitions in migs 025, 033, 039, 095, 102, 122, 132, 134, 154 (RLS never enabled — verified no `ENABLE ROW LEVEL SECURITY` in any migration for these).

Full list: `rfq_quote_submissions`, `rfq_quote_attachments`, `tender_trade_scopes`, `tender_addenda`, `tender_addendum_trades`, `rfq_events`, `rfq_package_orphans`, `geocode_cache`, `marketing_weekly_plans`, `marketing_paid_campaigns`, `marketing_publish_jobs`, `marketing_content_packages`, `marketing_campaign_templates`, `marketing_library`, `drone_shot_plans`, `schedule_eot`, `trade_master_library`.

Because RLS is off and the anon/authenticated roles hold default table privileges, PostgREST serves these tables to **anyone**, no login required. Sensitivity highlights:

- **`rfq_quote_submissions`** — subcontractors' confidential quoted amounts (`confirmed_amount_ex_gst` = "commercial source of truth"), extraction JSON, verification status. This is other-party commercial-in-confidence data.
- **`tender_trade_scopes`** — `internal_notes`, `contractor_notes`, scope/exclusions per job.
- **`geocode_cache`** — normalised client addresses → lat/lng (client home locations).
- **`marketing_*`** — campaign strategy, spend, publish queue.

**Exploit scenario (anonymous — worst case):** anyone who views the site grabs the anon key from the JS bundle and dumps subcontractor pricing across every tender:

```bash
curl "$SUPABASE_URL/rest/v1/rfq_quote_submissions?select=*" -H "apikey: $ANON_KEY"
# → every subcontractor quote amount in the business. No auth.
curl "$SUPABASE_URL/rest/v1/geocode_cache?select=query_normalised,lat,lng" -H "apikey: $ANON_KEY"
# → client addresses + coordinates
# writes work too:
curl -X DELETE "$SUPABASE_URL/rest/v1/tender_trade_scopes?id=eq.<uuid>" -H "apikey: $ANON_KEY"
```

**Fix** — enable RLS and add a staff-only policy to each. (These are all internal/staff data; none are client-facing, so staff-only is correct. If any table is written by an anonymous public form, add a narrowly-scoped `anon`-insert policy instead.)

```sql
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rfq_quote_submissions','rfq_quote_attachments','tender_trade_scopes',
    'tender_addenda','tender_addendum_trades','rfq_events','rfq_package_orphans',
    'geocode_cache','marketing_weekly_plans','marketing_paid_campaigns',
    'marketing_publish_jobs','marketing_content_packages','marketing_campaign_templates',
    'marketing_library','drone_shot_plans','schedule_eot','trade_master_library'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY staff_all ON public.%I FOR ALL TO authenticated
                      USING (public.auth_is_staff()) WITH CHECK (public.auth_is_staff())$p$, t);
  END LOOP;
END $$;
```

> Note: the server uses the service-role key and bypasses RLS, so enabling RLS here does **not** break any server route. Only verify that nothing reads these tables through the anon-key **frontend** client (none do — all access is server-side).

---

#### C3 — `site_reports` (WHS incident reports) is open to **anonymous** full CRUD

**Location:** `supabase/migrations/074_site_reports_selfheal.sql:36-37`

Migration 044 correctly removed the legacy `"Allow all anon site_reports"` policy. Migration 074 (a "self-heal" that re-creates the table if a DB drifted) **re-introduced it**:

```sql
DROP POLICY IF EXISTS "Allow all anon site_reports" ON site_reports;
CREATE POLICY "Allow all anon site_reports" ON site_reports FOR ALL USING (true) WITH CHECK (true);
--                                                          ^ no TO clause → defaults to PUBLIC (includes anon)
```

`site_reports` does have a `deny_clients` restrictive policy from the 104 sweep, but that policy is `TO authenticated` — it never applies to the `anon` role. So an anonymous request matches the permissive `USING(true)` with nothing to restrict it. Columns: `report_type`, `severity` (`low…critical`), `title`, `description`, `corrective_action`, `reported_by`, `photo_paths`, `project_id` — i.e. **WHS incident / injury records**.

**Exploit scenario:**

```bash
curl "$SUPABASE_URL/rest/v1/site_reports?select=*" -H "apikey: $ANON_KEY"
# → every safety incident report, no login
curl -X DELETE "$SUPABASE_URL/rest/v1/site_reports?id=eq.<uuid>" -H "apikey: $ANON_KEY"
# → anonymous can destroy incident records (WHS compliance exposure)
```

**Fix:**

```sql
DROP POLICY IF EXISTS "Allow all anon site_reports" ON public.site_reports;
-- authenticated_all_site_reports (mig 044) + deny_clients (mig 104) already correctly gate staff/clients.
-- If the self-heal migration is ever re-run, it must NOT recreate the anon policy.
```

Also patch `074_site_reports_selfheal.sql` so a future re-run doesn't reopen it (replace the anon policy block with the staff pattern).

---

### 🟠 HIGH

---

#### H1 — 5 tables created after migration 104 are missing `deny_clients` → any logged-in client has full CRUD

**Location:**
- `supabase/migrations/140_carpentry_budget_line_items.sql` — `carpentry_budget_line_items`
- `supabase/migrations/144_carpentry_stage_schedule.sql` — `carpentry_job_stage_schedule`
- `supabase/migrations/145_charge_up_jobs.sql` — `charge_up_jobs`
- `supabase/migrations/153_task_assignments.sql` — `task_assignments`
- `supabase/migrations/173_site_task_deletions.sql` — `site_task_deletions`

Each has `CREATE POLICY "auth_users" … FOR ALL TO authenticated USING (true) WITH CHECK (true)` and **no** `deny_clients`. Migration 104's sweep had already run, and unlike migs 182/185 (which correctly re-add `deny_clients` and even cite this exact hazard in their comments), these five forgot it. A client passes `USING(true)`.

Data exposed: internal carpentry **budget line items** (costs/margins), stage schedules, charge-up site→hours→invoice mapping, worker→task assignments (employee data), and task-deletion audit rows. All are also **writable** by the client (`WITH CHECK (true)`), so a client can insert/alter/delete internal cost and schedule data.

**Exploit scenario:**

```bash
curl "$SUPABASE_URL/rest/v1/carpentry_budget_line_items?select=*" \
  -H "Authorization: Bearer $CLIENT_JWT" -H "apikey: $ANON_KEY"
# → all carpentry budget lines (internal costs) for every job
curl -X DELETE "$SUPABASE_URL/rest/v1/carpentry_job_stage_schedule?id=eq.<uuid>" \
  -H "Authorization: Bearer $CLIENT_JWT" -H "apikey: $ANON_KEY"
# → client deletes another job's schedule
```

**Fix** — add the standard restrictive policy to each:

```sql
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'carpentry_budget_line_items','carpentry_job_stage_schedule',
    'charge_up_jobs','task_assignments','site_task_deletions'
  ] LOOP
    EXECUTE format($p$CREATE POLICY deny_clients ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
                      USING (public.auth_is_staff()) WITH CHECK (public.auth_is_staff())$p$, t);
  END LOOP;
END $$;
```

**Process fix (the real remediation):** add a step to the migration checklist / `/check` — *"any new RLS-enabled table with a permissive `authenticated` policy must also add `deny_clients`"* — and consider replacing the one-time 104 sweep with an idempotent function run at the end of every migration. Migs 182/185 already model the correct per-table pattern.

---

#### H2 — 5 views run with owner privileges and bypass RLS; if granted to `authenticated` they leak all leads/CRM to any client

**Location:** `128_lead_timeline_view.sql`, `130_attribution_roi.sql`, `131_v_crm_people.sql`, `137_area_performance_view.sql`, `014_schedule_templates.sql` (`v_procurement_dashboard`).

None of these views set `security_invoker = on`, so they execute with the **view owner's** rights (postgres, which bypasses RLS on the underlying tables). The underlying tables (`leads`, `crm_contacts`, `lead_activities`, etc.) are correctly protected by `deny_clients`, but a view over them is not — RLS is evaluated against the *owner*, not the caller. If Supabase's default `GRANT SELECT … TO authenticated` applies to these views (it applies to views created by the migration role by default), a client can read them and sidestep every table policy.

The app itself only ever reads these views through the **service-role** server (`salesRoutes.mjs:667`, `crmRoutes.mjs:377`, `marketingIntelligenceRoutes.mjs:547/689`, `marketingAreaPerformanceRoutes.mjs:91`) — it does **not** need `authenticated`/`anon` to have any grant. So both fixes below are non-breaking.

**Exploit scenario:**

```bash
curl "$SUPABASE_URL/rest/v1/v_crm_people?select=*" \
  -H "Authorization: Bearer $CLIENT_JWT" -H "apikey: $ANON_KEY"
# → if the grant is present: every lead + CRM contact (name/email/phone/source) — RLS bypassed
```

**Fix** — do both: make the views invoker-rights (so RLS applies) *and* revoke the API-role grants (defence in depth):

```sql
ALTER VIEW public.v_crm_people            SET (security_invoker = on);
ALTER VIEW public.v_lead_timeline         SET (security_invoker = on);
ALTER VIEW public.v_lead_attribution_roi  SET (security_invoker = on);
ALTER VIEW public.v_area_performance      SET (security_invoker = on);
ALTER VIEW public.v_procurement_dashboard SET (security_invoker = on);

REVOKE ALL ON public.v_crm_people, public.v_lead_timeline, public.v_lead_attribution_roi,
              public.v_area_performance, public.v_procurement_dashboard
  FROM anon, authenticated;
```

*(If any of these views is genuinely meant to be client-facing in future, prefer `security_invoker = on` + a policy on the base table, not a raw grant.)*

---

#### H3 — Verify Supabase self-signup is disabled (amplifier for C1/C2/H1/H2)

**Location:** `server/lib/authRoutes.mjs:57,308` (accounts created only via `auth.admin.createUser`), `src/pages/Login.jsx:93` (frontend uses `signInWithPassword` only — no `signUp`).

The application never exposes self-registration, which is good. But whether an **anonymous internet user can self-register** is a Supabase project setting (Auth → *Allow new users to sign up*), not visible in code. If that toggle is **on**, anyone can create an account, obtain an `authenticated` JWT, and thereby promote every "any authenticated user" finding (C1 storage, H1 tables, H2 views) from "any client" to "anyone on the internet." That is why C1/H1/H2 are only one config-toggle away from CRITICAL.

**Fix / verify:** In the Supabase dashboard, confirm **Allow new users to sign up = OFF** (invite/admin-create only), and that email confirmation is required for any flow that does create users. Document this as a deployment invariant.

---

### 🟡 MEDIUM

---

#### M1 — Webhooks accept unsigned payloads when their secret env var is unset (fail-open)

**Location:** `server/lib/buildexactWebhook.mjs:20` (`if (!secret) return { ok: true, skipped: true }`), `server/lib/calcomWebhook.mjs:161-166` (`if (!secret) console.warn(… accepting unverified …)`).

Both webhook verifiers correctly use HMAC + `crypto.timingSafeEqual` **when a secret is configured**, but **fail open** if `BUILDEXACT_WEBHOOK_SECRET` / `CAL_WEBHOOK_SECRET` is missing. These endpoints are public (`/api/webhooks/*`) and create/modify leads, bookings and estimate records. On any deploy where the secret wasn't set (staging, a fresh Railway environment, a forgotten var), an attacker who knows the URL can inject fabricated bookings/leads.

**Exploit scenario:** POST a crafted cal.com booking payload to `/api/webhooks/calcom` on an environment where `CAL_WEBHOOK_SECRET` is unset → a fake lead/meeting is created with no signature.

**Fix** — fail **closed**: if the secret is unset, reject (or refuse to register the route) rather than accepting. e.g.:

```js
if (!secret) return res.status(503).json({ ok: false, error: "webhook not configured" });
```

and add a startup assertion that these secrets exist in production.

---

#### M2 — Legacy portal share-token is a long-lived bearer credential carried in the URL

**Location:** `server/lib/requirePortalAuth.mjs:96-118`, token minted at `server/lib/portalRoutes.mjs:219` (`crypto.randomBytes(24).toString("base64url")`).

The token itself is strong (192-bit random — not brute-forceable) and the middleware correctly makes token access **read-only** (all contractual writes require `requirePortalWrite`/`requirePortalLogin`, a genuinely good fail-safe). The residual risk is that the token lives **in the URL path** (`/api/portal/:token/…` and the shareable portal link), so it leaks through browser history, `Referer` headers to any third-party asset, server logs, and chat/email forwarding — and it never expires. A leaked link exposes project financials (`contract_value`) and client PII (`portal_client_email`, address) to anyone.

**Fix:** add an expiry / revocation column to `portal_token`, prefer the authenticated v2 flow for anything sensitive, exclude `contract_value` and email from the anonymous-token payload (return them only on the JWT path), and set `Referrer-Policy: no-referrer` on portal pages.

---

### 🟢 LOW / INFO

- **L1 — anon INSERT on `attribution_events`** (`062_*`, `public_insert_attribution TO anon`). Intended for website attribution tracking, but unbounded: anon can insert arbitrary rows (data pollution / storage inflation). Add basic rate-limiting or a server-mediated insert. Low impact (insert-only, no read).
- **L2 — 1-hour signed URLs for staff document access** (`server/lib/salesRoutes.mjs:792`, `createSignedUrl(..., 3600)`). Staff-side only; the client portal correctly uses 60s (`portalV2Routes.mjs:792`). Consider shortening the staff TTL, but low risk.
- **INFO-1 — Backup system (`hub-backup-system.zip`)**. Reviewed: `backup-db.sh`, `backup-storage.sh`, `upload-offsite.sh`, `hub-backup.yml`. No hardcoded secrets — all injected via `${{ secrets.* }}`; plaintext dumps are `rm`'d after GPG-AES256 encryption; `.github/workflows/` is gitignored in the Hub repo. Clean. Operational note only: the `SUPABASE_DB_URL` and S3 keys stored as GitHub Actions secrets grant full-database read; anyone with write access to that repo's Actions (or the ability to open a workflow-running PR) can exfiltrate a full DB dump. Keep the repo private, restrict Actions secrets, and consider a read-replica/limited role for the dump.
- **INFO-2 — What's working (do not regress):**
  - `requireAuth` (`server/lib/requireAuth.mjs:24`) explicitly rejects `role === 'client'`, so clients cannot reach any staff API — a clean, central control.
  - Portal v2 routes (`server/lib/portalV2Routes.mjs`) are consistently scoped: every sub-resource query is `.eq("id", …).eq("project_id", req.portalSession.projectId)` with `client_visible` checks, and `requirePortalAuth` validates `project_client_users` membership per `projectId`. I found **no IDOR** in the portal API — `/media/:photoId`, `/documents/:docId/download`, `/variations/:decisionId`, `/documents/:docId/sign` all re-check project ownership.
  - `admin_delete_projects` is `SECURITY DEFINER`, `search_path` pinned, and `EXECUTE` is revoked from `PUBLIC` and granted only to `service_role` — not callable by clients.
  - All 8 `SECURITY DEFINER` functions pin `search_path`; none use string-concatenated dynamic SQL (no SQL-injection surface found).
  - `.env` is gitignored and untracked; no service-role key, DB password, or provider secret appears in tracked files or 639 commits of history (the only JWT-shaped strings in history are a truncated docs example and an intentional `MALFORMED_JWT` test fixture). Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` ship to the browser, as intended.

---

## 5. Prioritised remediation checklist

Work top to bottom. Items 1–4 are the ones an attacker can use today.

- [ ] **1. (C1)** Replace `storage.objects` policies for `lead-documents` and `marketing-media` with `auth_is_staff()`-gated staff-only policies. Confirm both buckets are private.
- [ ] **2. (C3)** Drop `"Allow all anon site_reports"`; patch `074_site_reports_selfheal.sql` so it can't reappear.
- [ ] **3. (C2)** Enable RLS + add `staff_all` policy on all 17 disabled tables (SQL in C2).
- [ ] **4. (H1)** Add `deny_clients` to the 5 post-104 tables (SQL in H1).
- [ ] **5. (H3)** Verify Supabase **Allow new users to sign up = OFF**; document as a deploy invariant.
- [ ] **6. (H2)** Set `security_invoker = on` and `REVOKE … FROM anon, authenticated` on the 5 views.
- [ ] **7. (M1)** Make both webhook verifiers fail **closed** when their secret is unset; assert secrets at startup.
- [ ] **8. (M2)** Add expiry/revocation to portal share-tokens; drop `contract_value`/email from the anonymous-token payload; set `Referrer-Policy: no-referrer`.
- [ ] **9. (Process)** Add a `/check` rule: every new RLS-enabled table with a permissive `authenticated` policy must also carry `deny_clients`. Prefer converting mig 104's one-time sweep into a re-runnable function invoked at each migration's end.
- [ ] **10. (L1/L2)** Rate-limit/serverside `attribution_events` inserts; shorten staff signed-URL TTL.
- [ ] **11. After deploying 1–6, run `NOTIFY pgrst, 'reload schema';`** in Supabase so PostgREST picks up the policy/RLS changes, then run the verification plan in §6.

---

## 6. Verification test plan

For every CRITICAL/HIGH fix, the exact request that must return **empty or 403/401 after the fix** (it returns data *before*). Set up once:

```bash
SUPABASE_URL="https://<your-ref>.supabase.co"     # from VITE_SUPABASE_URL
ANON_KEY="<public anon key from the JS bundle>"    # VITE_SUPABASE_ANON_KEY
# CLIENT_JWT: log into a real client portal, copy the access_token from
#   localStorage key sb-<ref>-auth-token (or the Authorization header on any /api/portal/app call)
CLIENT_JWT="<a genuine role=client access token>"
```

**C1 — storage buckets (client JWT):**
```bash
# BEFORE: lists other clients' files. AFTER: {"error":"..."} / empty / 403.
curl -s "$SUPABASE_URL/storage/v1/object/list/lead-documents" \
  -H "Authorization: Bearer $CLIENT_JWT" -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" -d '{"prefix":"","limit":100}'
curl -s "$SUPABASE_URL/storage/v1/object/list/marketing-media" \
  -H "Authorization: Bearer $CLIENT_JWT" -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" -d '{"prefix":"","limit":100}'
# expect: empty array [] or 403 after fix
```

**C2 — RLS-disabled tables (ANON only — no JWT):**
```bash
for t in rfq_quote_submissions tender_trade_scopes geocode_cache marketing_weekly_plans schedule_eot; do
  echo "== $t =="
  curl -s "$SUPABASE_URL/rest/v1/$t?select=*&limit=1" -H "apikey: $ANON_KEY"
done
# BEFORE: returns rows. AFTER: [] or {"code":"42501"/permission-denied}. Also retry with -H "Authorization: Bearer $CLIENT_JWT" → must also be empty.
```

**C3 — site_reports (ANON only):**
```bash
curl -s "$SUPABASE_URL/rest/v1/site_reports?select=*&limit=1" -H "apikey: $ANON_KEY"
# BEFORE: WHS incident rows. AFTER: [] / permission denied.
# also confirm write is blocked:
curl -s -X POST "$SUPABASE_URL/rest/v1/site_reports" -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" -d '{"project_id":"00000000-0000-0000-0000-000000000000","report_type":"hazard","title":"pentest"}'
# AFTER: 401/403, no row created.
```

**H1 — post-104 tables (client JWT):**
```bash
for t in carpentry_budget_line_items carpentry_job_stage_schedule charge_up_jobs task_assignments site_task_deletions; do
  echo "== $t =="
  curl -s "$SUPABASE_URL/rest/v1/$t?select=*&limit=1" \
    -H "Authorization: Bearer $CLIENT_JWT" -H "apikey: $ANON_KEY"
done
# BEFORE: rows. AFTER: [] for all five.
```

**H2 — views (client JWT):**
```bash
for v in v_crm_people v_lead_timeline v_lead_attribution_roi v_area_performance v_procurement_dashboard; do
  echo "== $v =="
  curl -s "$SUPABASE_URL/rest/v1/$v?select=*&limit=1" \
    -H "Authorization: Bearer $CLIENT_JWT" -H "apikey: $ANON_KEY"
done
# BEFORE: leaks leads/CRM. AFTER: [] or permission denied.
```

**Positive control (must KEEP working after all fixes):** a **staff** JWT must still read its data, and the client portal must still function end-to-end.
```bash
STAFF_JWT="<a role=admin/employee access token>"
curl -s "$SUPABASE_URL/rest/v1/carpentry_budget_line_items?select=id&limit=1" \
  -H "Authorization: Bearer $STAFF_JWT" -H "apikey: $ANON_KEY"     # → returns a row (auth_is_staff passes)
# And in the app: log in as a client → Home, Documents (download), Variations, Messages all load.
```

**H3 — self-signup:**
```bash
curl -s -X POST "$SUPABASE_URL/auth/v1/signup" -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" -d '{"email":"pentest+1@example.com","password":"Test123!pentest"}'
# EXPECT: signup disabled error. If it returns a user/session, self-signup is ON — fix immediately (H3).
```

---

*End of report. Findings are based on static analysis of migrations 001–185 and the Express/React source; items marked "if granted" (H2) and the anon-reachability of C2 should be confirmed live with the curls above, since a handful of grant states depend on the Supabase project's default privileges, which are not expressible in the migration files.*
