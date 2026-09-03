<!-- Independent security review generated 2026-08-29 (commit 6c78484). Verified findings. Internal — contains live vulnerability detail until remediated. -->


# Blue Leaf Hub — Client Portal Security Review

*Independent application-security review. Scope: the client portal (`server/lib/portalRoutes.mjs`, `portalV2Routes.mjs`, `requirePortalAuth.mjs`, `requireAuth.mjs`) and the Supabase RLS/Storage layer behind it. Repo state verified at commit `6c78484`, migrations `001–195`.*

## (a) Executive summary

**Plain verdict: the portal's application code is genuinely strong — at or above typical off-the-shelf SaaS for the request-handling layer — but the database-permission layer is not yet at parity, and the fix the team already wrote for it contains a real bug that this review caught.**

Two things are true at once, and both matter:

1. **The part an attacker hits first — the API — is solid.** Every portal request is bound to the caller's *own* project, either by a 192-bit unguessable share token or, in the v2 login portal, by a per-project membership check on a real login. I traced every read and write path and found **no cross-client (IDOR) path in the code**. Client logins are explicitly blocked from all staff/admin APIs (`requireAuth.mjs:24`). Client-facing data is deliberately minimized: the v2 portal uses strict field allowlists that never return builder cost, margin, ex-GST, or internal notes, and photos/documents default to private. This is real, verifiable engineering discipline.

2. **The isolation guarantee ultimately rests on database Row-Level Security (RLS), and that layer has known, documented gaps.** The core client tables (messages, decisions, claims, projects, etc.) *are* correctly locked by migration 104's deny-by-default staff-only policy — so the crown-jewel risk (one client reading another client's *personal/financial* data) is architecturally blocked **provided migration 104 is live in production**. But 104 was a one-time sweep, and tables created afterward drifted open. The team's own audit caught this and wrote a remediation (migration 186). During this review I verified 186 line-by-line and found its "C2" block **does not actually close 11 of the tables it targets** — it adds a permissive policy on top of an already-permissive one, which changes nothing. So "we ran the remediation" would currently give false confidence on those 11 tables.

**Is "as secure as off-the-shelf" achievable, and how far off?** Yes, and it's close — roughly **1–2 focused days of database work plus a verification pass**, not a rebuild. The application architecture is already there. What remains is: (i) confirm migration 104 is applied to prod, (ii) fix and apply the corrected 186, (iii) verify a handful of dashboard config settings, and (iv) add a standing check so new tables can't silently reopen the hole. Until those are done and verified, the honest statement to a skeptical reviewer is *"the design is sound and the residual gaps are known, contained, and in active remediation"* — **not** *"it is already fully locked down."* After the remediation lands and an independent pen test confirms it, "as secure as off-the-shelf" becomes a defensible claim.

**On the specific threat that matters most — one client reading another client's PII/financials — the answer is reassuring:** that path is blocked at both the API layer (no IDOR) and the DB layer (mig 104 covers all core portal tables). The residual DB exposures are business-confidential *internal* tables (subcontractor pricing, marketing plans, carpentry job costs) and a storage bucket — serious, but not cross-client personal-data leakage.

---

## (b) Confirmed findings

All findings below were re-verified against the actual code/migrations. Severity assumes migration 104 is applied (which the portal requires to function). "Post-186" notes whether the team's written remediation actually closes it.

### CRITICAL

| # | Title | Location | Concrete risk | Fix |
|---|-------|----------|---------------|-----|
| C-1 | **Remediation migration 186's C2 block is a no-op for 11 tables** — it adds a *permissive* `staff_all` policy without dropping the pre-existing *permissive* `auth_users`/`_authenticated` policy. Postgres OR-combines permissive policies, so `(true OR auth_is_staff()) = true` → still open. | `186_security_remediation.sql:78–96` (C2) vs the pre-existing policies in `154_tender_quote_submissions.sql:128–135` and `122_marketing_command_centre_mvp.sql:252–270` | **Even after the team applies its own security fix**, any logged-in portal client (real `authenticated` JWT) + the public anon key can `GET/POST/PATCH/DELETE` via PostgREST directly on: `rfq_quote_submissions`, `rfq_quote_attachments` (every subcontractor's quoted price across all tenders), `tender_trade_scopes`, `tender_addenda`, `tender_addendum_trades`, `marketing_weekly_plans`, `marketing_paid_campaigns`, `marketing_publish_jobs`, `marketing_content_packages`, `marketing_campaign_templates`, `drone_shot_plans`. Business/commercial confidential + margin exposure; **not** other clients' personal PII. | In 186's C2, either `DROP POLICY IF EXISTS "auth_users"`/`"<t>_authenticated"` for each of the 11 tables **before** creating `staff_all` (as C1 already does for storage on lines 36–38), **or** switch C2's fix to `AS RESTRICTIVE ... deny_clients` (as H1 already does on line 128). A RESTRICTIVE policy AND-s and neutralizes the permissive one. Then re-run the §6 client-JWT curl and confirm 403/empty. |

*Note on why this is critical: it is the finding most likely to cause a real breach **after** everyone believes the system is fixed. The bug is subtle — the same migration handles it correctly in two other blocks (C1 drops first, H1 uses RESTRICTIVE), so C2 is an inconsistency, not a knowledge gap.*

### HIGH

| # | Title | Location | Concrete risk | Fix |
|---|-------|----------|---------------|-----|
| H-1 | **`lead-documents` storage bucket authorized by `bucket_id` alone** (no per-project/staff check), granted to the whole `authenticated` role. Mig 104 never touched `storage.objects`. | `060_lead_notes_documents.sql:90–114`; fixed by `186:36–46` | Any authenticated user, **including any portal client**, can list, download, **and DELETE** every client's signed contracts, PTSA/concept agreements, surveys, and proposals with a 3-line curl. | Apply 186 C1 (staff-only). Confirm `lead-documents` bucket is private (it is, per handoff). The client UI reads these only via server-generated signed URLs, so the lock won't break the client experience. **Post-186: correctly closed.** |
| H-2 | **6 tables have RLS switched off entirely** (no `ENABLE ROW LEVEL SECURITY`, no policy) → reachable by the **bare anon key with no login**, assuming Supabase default grants (no `REVOKE` found in migrations). | `134_geo_facts.sql` (`geocode_cache` — client site addresses/coords), `132_marketing_library.sql`, `102_rfq_engagement_tracking.sql` (`rfq_events`), `041` (`rfq_package_orphans`), `025` (`schedule_eot`), `033` (`trade_master_library`) | An **unauthenticated** attacker with the anon key (shipped in the browser bundle) can read/write these tables directly. `geocode_cache` is the PII-relevant one (client addresses/coordinates). | Apply 186 C2 (enables RLS + `staff_all`). These 6 have **no** lingering permissive policy, so 186 closes them correctly. **Post-186: correctly closed.** Verify with the §6 anon curl. |
| H-3 | **5 tables created after mig 104 carry a permissive `auth_users USING(true)` policy and no `deny_clients`.** | `140:31–34` (`carpentry_budget_line_items` — job costs/margins), `144:50–53`, `145:27–31` (`charge_up_jobs`), `153:23–26` (`task_assignments`), `173:29–32` (`site_task_deletions`) | Any logged-in client (or any authenticated user) can read/write carpentry job cost line items and margins across all jobs via PostgREST. | Apply 186 H1 — it uses **RESTRICTIVE** `deny_clients`, which correctly AND-s over the permissive policy. **Post-186: correctly closed.** |
| H-4 | **`site_reports` has an anonymous full-CRUD policy** re-added by a self-heal step: `"Allow all anon site_reports" FOR ALL USING(true)` with **no `TO` clause** = role `public` (includes `anon`). `deny_clients` is `TO authenticated`, so anon bypasses it. | `074_site_reports_selfheal.sql:37`; fixed by `186:107` | Unauthenticated read/write/delete of WHS incident/site-report records. Not portal PII, but an anonymous data-tampering hole. | Apply 186 C3 (drops the anon policy). **Also patch `074_site_reports_selfheal.sql`** so a future re-run recreates the *staff* policy, not the anon one — otherwise it silently reopens. |
| H-5 | **5 database views run with owner (definer) rights** (no `security_invoker`), bypassing base-table RLS, and carry default `anon`/`authenticated` grants. | `131_v_crm_people.sql` (`v_crm_people` — all lead/contact names/emails/phones), `128` (`v_lead_timeline`), `130` (`v_lead_attribution_roi`), `137` (`v_area_performance`), `014` (`v_procurement_dashboard` — supplier pricing); fixed by `186:146–150` + `REVOKE` | A client JWT (or anon key) calling `GET /rest/v1/v_crm_people` returns the entire CRM contact list despite the base table being locked. *Confidence: medium — depends on the views actually carrying anon/authenticated grants; verify with a curl.* | Apply 186 H2 (`security_invoker=on` + `REVOKE ALL FROM anon, authenticated`). **Post-186: closed.** |
| H-6 | **The `deny_clients` control has no standing enforcement** — mig 104 is a one-time loop, and 6+ later migrations silently reopened the hole (only 121/182/185 remembered the pattern). Nothing prevents table #196 from drifting again. | `104_deny_clients_rls.sql` (the `DO $$ ... relrowsecurity=true` loop); pattern re-added ad hoc in `121`, `182`, `185` | Systemic drift: the fix is per-table and per-author-memory. This is the root cause of C-1/H-2/H-3. | Add a CI or boot-time assertion that fails if any public table reachable by the `authenticated` role lacks a `deny_clients` restrictive policy (or any policy). Ship it as a migration template requirement. **This converts a recurring bug class into an invariant.** |

### MEDIUM

| # | Title | Location | Concrete risk | Fix |
|---|-------|----------|---------------|-----|
| M-1 | **Portal share token transmitted in the URL query string** (`?token=`) on the media proxy, and never expires or rotates. | `portalRoutes.mjs:150` (`req.query.token`); token minted `crypto.randomBytes(24).base64url` with no expiry | The token *is* the credential. In a query string it lands in server/proxy/CDN access logs, browser history, and the `Referer` header on any outbound asset. A leaked media URL = full, permanent read of that client's portal. (Entropy is strong — this is a leakage, not a guessing, risk.) | Serve media via short-lived signed URLs (as the v2 documents flow already does), or move the token to an `Authorization` header / HttpOnly cookie. Add token expiry + one-click rotation. Set `Referrer-Policy: no-referrer` on portal pages. |
| M-2 | **Legacy v1 token routes use `SELECT *` and leak internal fields**, ignoring the v2 allowlist and the `client_visible` photo flag. | `portalRoutes.mjs:814–815` & `961` & `1034–1039` (`cost_delta` ex-GST), `954–955` / `782` / `910` (`SELECT *` on decisions/updates → `risks_blockers`, `decisions_needed`, staff UUIDs); **zero** `client_visible` filters in the whole file (contrast `portalV2Routes.mjs:179,289,785`) | On any **non-v2** project, the client sees builder-internal `cost_delta`/reasoning and non-client-visible (internal/defect) photos. **Mitigated for v2**: `resolveProject` returns null once `portal_v2_enabled` (`portalRoutes.mjs:44`), killing the entire legacy surface. Scoped to the client's own project — over-exposure, not cross-client. | Apply explicit field allowlists to the v1 reads and add `.eq('client_visible', true)`, mirroring v2 — or retire the v1 GET routes once all live portals are v2. |
| M-3 | **No inbound rate limiting** on public `/api/portal/*` endpoints, and `express.json` buffers up to a 100MB body *before* the token is checked. | `server/dev-api.mjs` (no `express-rate-limit`); body limit inherited from Blueprint | The unauthenticated media proxy (each hit triggers a Dropbox fetch) is a cost-amplification target; anonymous POST routes can spam the builder's inbox/DB; large-body POSTs spike memory. Token brute-force is *not* a risk (192-bit). | Add `express-rate-limit` scoped to `/api/portal/*` (tighter on media + anonymous POSTs), and a small dedicated body limit (e.g. 64KB) for the portal router. |

### LOW / INFO

| # | Title | Location | Note |
|---|-------|----------|------|
| L-1 | **Most `/api/portal/admin/*` routes require only `requireAuth`, not `requireRole('admin')`** — only `generate-token` is admin-gated (`portalRoutes.mjs:182` mount vs `:184`). | Any active *staff* (employee/supervisor) can read any project's portal summary (PII, `portal_token`, `contract_value` at `:573`) or post a client message as the builder (`:720`). **Clients are correctly blocked** (`requireAuth` rejects role `client`). Internal horizontal over-permissioning, not client-facing. Fix: `app.use('/api/portal/admin', requireAuth, requireRole('admin'))`. |
| L-2 | **Raw DB error messages returned to portal clients** in v1 catch blocks (`error: e.message`). | `portalRoutes.mjs:176` and throughout v1. v2 uses `translateDbError()`. Leaks schema/driver internals. Return a generic message; log detail server-side. |
| L-3 | **Service-role Supabase client code lives under `src/`** (Vite root), one file even imported client-side. | `src/blueprint/agent/hubDatabase.js:32`, `knowledgeBase.js:11`. **Not a live leak** — it reads `process.env.SUPABASE_SERVICE_ROLE_KEY`, which Vite does *not* inline into browser bundles (only `import.meta.env.VITE_*`). Latent/fragile: a future switch to `import.meta.env.VITE_…` would ship the RLS-bypass key. Move to `server/`; add a build check that fails if the key appears in the emitted bundle. |
| L-4 | **Config amplifier: Supabase self-signup must be OFF.** | Code is clean (`authRoutes.mjs` uses `auth.admin.createUser`; `Login.jsx` uses `signInWithPassword` only — no `signUp`), but the **dashboard** setting "Allow new users to sign up" is not verifiable from the repo. If ON, any internet user self-registers → gets an `authenticated` JWT → every "authenticated-reachable" exposure above (C-1, H-1, H-5) becomes internet-wide instead of invited-clients-only. **Verify OFF and document as a deploy invariant.** |
| ✅ INFO | **Positive control — the portal route layer is sound.** | Verified, not assumed: 192-bit `crypto.randomBytes(24)` tokens; every v1 token route scopes to the token-resolved `project.id` (media checks `photo.project_id === project.id`, `portalRoutes.mjs:172`); v2 `requirePortalAuth` verifies `project_client_users` membership for the specific `:projectId` and fail-closes on `is_active !== true` and non-v2 projects (`requirePortalAuth.mjs:50–80`); v2 field allowlists exclude cost/margin/ex-GST/internal notes (`portalV2Routes.mjs:36–66`); `client_visible` enforced on every v2 photo/document/meeting read; contractual approval on the token surface is hard-disabled (403); `requireAuth` rejects `role:'client'` (`requireAuth.mjs:24`). **No SQL injection surface** — everything uses the parameterized PostgREST builder, no raw SQL. |

**Corrections made to the input findings during verification:**
- The claim that "17 tables are RLS-off and anon-readable" is **imprecise**. Only **6** are genuinely RLS-off/anon-readable (H-2). The other **11** are RLS-*enabled* with a permissive `TO authenticated` policy — reachable by an *authenticated client*, **not** by bare anon (RLS denies anon since no anon policy exists). This distinction matters and is reflected above (C-1 vs H-2).
- The "crown-jewel cross-client PII" finding is **downgraded from critical-as-live to a design-correct/operational-gate item**: core portal tables (`portal_messages`, `portal_decisions`, `portal_claims`, `projects`, etc.) are RLS-enabled in migs 027/103 *before* 104, so 104's loop **does** cover them. Client accounts (103) and the lockdown (104) ship in the same manual batch (099–104), so the dangerous window (accounts live, lockdown not) is operationally avoidable. **Action: confirm 104 is live in prod.**
- Reassuring discovery not in the input: the team **learned the pattern** — every post-104 table *except* the tender/marketing/H1 set (i.e. all the `workforce_*`, `whs_*`, `document_templates`, `tender_email_templates`, `lead_signals`, `lead_touch_events`) enables RLS with **no browser policy** = correct deny-all default. Those are **not** gaps.

---

## (c) Off-the-shelf SaaS benchmark (control-by-control)

| Control | Status | Evidence / gap |
|---|---|---|
| Client authentication | **HAVE** | Supabase JWT; accounts only via `auth.admin.createUser`; no self-signup in code (pending L-4 dashboard confirm). |
| Authorization / access control (API layer) | **HAVE** | `requireAuth` rejects clients; v2 per-project membership check; **no IDOR found**. Equals or beats typical SaaS. |
| Cross-client data isolation (DB / RLS) | **PARTIAL** | Core client tables locked by mig 104 (if applied). Drifts on new tables; 186 needed; **186's C2 buggy (C-1)**. This is the main gap vs off-the-shelf. |
| Field-level data minimization | **PARTIAL** | v2 has strict allowlists (excellent); legacy v1 leaks internal fields (M-2). |
| Storage object authorization | **MISSING → fixed by 186** | Bucket-only policies; any authenticated user can download/delete all clients' files until 186 C1 (H-1). |
| Credential / token lifecycle | **PARTIAL** | Strong entropy; but token-in-URL, no expiry, no rotation (M-1). Off-the-shelf products expire/rotate. |
| Secrets & transport | **HAVE (with a smell)** | Service-role key is server-only in practice; latent `src/` placement (L-3). |
| Rate limiting / abuse protection | **MISSING** | No inbound throttling (M-3). Standard SaaS has this. |
| Audit logging | **HAVE** | `portal_audit_logs` records IP/UA on contractual events; contractual writes are atomic + audited. |
| Least privilege (staff/admin) | **PARTIAL** | Admin routes gated by `requireAuth` not `requireRole` (L-1). |
| Error handling / info leakage | **PARTIAL** | v2 sanitizes via `translateDbError`; v1 returns raw DB errors (L-2). |
| Secure configuration | **UNVERIFIED** | Self-signup setting must be confirmed OFF (L-4); bucket `public` flags confirmed. |
| Vulnerability/drift management | **MISSING** | No standing check that new tables carry `deny_clients` (H-6). |

**Overall:** the API/authn/authz/audit columns are at parity or better; the DB-RLS, storage, rate-limiting, and drift-control columns are the distance to close.

---

## (d) Remediation plan (prioritized; ⚡ = quick win)

**Do first — verification & config (under an hour total):**
1. ⚡ **Confirm mig 104 is live in prod.** `SELECT count(*) FROM pg_policies WHERE policyname='deny_clients';` should be ~100+. *This is the load-bearing assumption behind the whole isolation story.* (~15 min)
2. ⚡ **Confirm Supabase "Allow new users to sign up" = OFF** (L-4) — critical amplifier. (~5 min)
3. ⚡ **Confirm bucket `public` flags**: `lead-documents` private (the real fix), note `marketing-media` is likely public-by-design (its read-lock is cosmetic; the delete-lock still helps). (~15 min)

**The main work — corrected DB remediation (~half day):**
4. **Fix migration 186's C2 bug (C-1)**: for the 11 tender/marketing tables, either `DROP` the permissive `auth_users`/`_authenticated` policy before adding `staff_all`, or use `AS RESTRICTIVE ... deny_clients`. Then apply the whole of 186 (C1/C2/C3/H1/H2) to **staging first**, run the §6 attacker curls (anon + client JWT → empty/403) and the staff positive control, then prod, then `NOTIFY pgrst, 'reload schema'`. Closes H-1, H-2, H-3, H-4, H-5 and C-1 in one pass.
5. **Patch `074_site_reports_selfheal.sql`** so a re-run can't re-open the anon hole (H-4 tail). (~15 min)

**Standing control — stop future drift (~half day):**
6. **Add a CI/boot RLS-coverage assertion (H-6)**: fail the build if any `authenticated`-reachable public table lacks `deny_clients` (or any policy) or has RLS off. Turns the one-time fix into an invariant.

**Hardening — parity polish (~1–2 days total):**
7. ⚡ **Admin routes: `requireRole('admin')` at the mount** (L-1). (~1 hr)
8. ⚡ **Rate limiting on `/api/portal/*`** + a small portal-specific body limit (M-3). (~2 hr)
9. **Token lifecycle** (M-1): signed URLs for media, token out of query string, add expiry + rotation, `Referrer-Policy: no-referrer`. (~1 day)
10. **Legacy v1 hardening** (M-2): field allowlists + `client_visible` filter, or track all live portals to v2 and retire v1. (~half day)
11. ⚡ **Move service-role code out of `src/`** + bundle-scan build check (L-3). (~1 hr)
12. ⚡ **v1 error sanitization** via `translateDbError` (L-2). (~30 min)

**Critical path to parity: items 1–6.** Everything else is defense-in-depth polish that gets the benchmark table to all-green.

---

## (e) The pitch to a skeptical, privacy-focused reviewer

Sam can use these verbatim — each is backed by a specific file:

- **"The layer an attacker actually reaches first is locked down. Every portal request is tied to the caller's own project — by a 192-bit unguessable token or, on login, a per-project membership check — and an independent review found zero cross-client access paths in the code. Client logins are hard-blocked from every staff and admin API."** *(`requireAuth.mjs:24`, `requirePortalAuth.mjs:50–80`; no IDOR in `portalRoutes.mjs`.)*

- **"Client-facing data is minimized by design, not by accident. The portal returns explicit allow-lists of fields — it never sends builder cost, margin, ex-GST figures, or internal notes to a client — and photos and documents are private by default and only shown when a staffer marks them client-visible."** *(`portalV2Routes.mjs:36–66, 179`.)*

- **"The one risk that matters most to a privacy reviewer — one client seeing another client's personal or financial data — is blocked twice: once in the API (no IDOR) and once in the database (a deny-by-default, staff-only rule on every client table). The exposures we're still closing are internal business tables — subcontractor pricing, marketing plans, job costs — not clients' personal information."** *(mig 104 covers all `portal_*` tables from migs 027/103.)*

- **"Our residual risk is entirely at the database-permission layer, it's fully catalogued in our own security audit, and the remediation is written. This review even found a bug in that remediation — a permissive-vs-restrictive policy error that would have left 11 internal tables open — and we're fixing it before we apply it. In other words, we catch our own mistakes before they ship."** *(`SECURITY_AUDIT.md`; `186_security_remediation.sql:78–96`.)*

- **"We're not just patching — we're adding a standing check so a newly created table can never silently reopen the hole. The fix becomes an invariant the build enforces, not a thing someone has to remember."** *(Addresses the root cause: mig 104 was a one-time sweep.)*

- **"We treat 'as secure as off-the-shelf' as a claim to be proven, not asserted. Once the corrected database remediation is applied and verified, we recommend an independent penetration test as the final gate."**

**Independent pen test — warranted? Yes.** It is the right final step and specifically worth commissioning here, because the one class of risk this codebase carries (direct-to-database access with a client JWT + the public anon key) is exactly what a black-box pen tester with a real portal login can prove or disprove in an afternoon. Scope it to run **after** items 1–6 land, and hand the tester a real client account plus the anon key with the explicit brief: "reach any data outside your own project." That converts "we believe it's isolated" into "an outside expert confirmed it" — which is what actually persuades a security-focused partner.

---

*Bottom line for Sam: the portal is well-built where it counts and close to off-the-shelf parity, but do not tell your partner it's fully locked down yet. Tell him the design is sound, the gaps are known and in remediation, this review caught a bug in that remediation before it shipped, and a pen test is booked as the final proof. That's a stronger, more credible story than "it's perfect" — and it's the true one.*