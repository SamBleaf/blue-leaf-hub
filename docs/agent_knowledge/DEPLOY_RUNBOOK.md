# Blue Leaf Hub — Production Deploy Runbook (2026-06-01)

> Ships the audit fixes + live-test fixes + full-fix pass now on `origin/main` (through commit abf7d61).
> Architecture: **Railway** = API (`npm run start`), **Vercel** = static SPA (rewrites `/api/*` →
> Railway), **Supabase** = prod DB + Auth. Order matters: **migrations first**, then API, then frontend.
> All steps below are yours to run (deploys + prod SQL). Estimated time: ~20–30 min.

---

## 0. Pre-flight
- [x] All fixes committed + pushed to `origin/main` (24 + full-fix commits).
- [ ] Confirm Vercel project + Railway service are connected to `SamBleaf/blue-leaf-hub` (main branch).
- [ ] Have the prod Supabase SQL editor open (the PROD project — **not** the dev `khehclrwppjvrogyxmdb`).

## 1. Apply prod database migrations (do this FIRST)
In the **prod** Supabase SQL editor, run any migrations not yet applied to prod, in order. From this
work the deploy-critical ones are **071, 072, 073, 074** — all written to be **idempotent (safe to
re-run even if already applied)**:
- [ ] `071_jobs_client_contact.sql` — `jobs.client_email` / `client_phone` (ADD COLUMN IF NOT EXISTS). **Required** for the lead→job + RfqEngine fixes.
- [ ] `072_schedule_task_type_check.sql` — widens `schedule_tasks.task_type` CHECK. **Required** for AI/template schedule generation.
- [ ] `073_increment_send_stat.sql` — `increment_send_stat()` RPC. **Required** for CRM email counters.
- [ ] `074_site_reports_selfheal.sql` — re-creates `site_reports` if missing. **Required** for WHS incidents (run it even if you think prod has the table — it's `IF NOT EXISTS`).
- Optional: `069_knowledge_core.sql` (Phase-0 foundation, not yet wired — only if prod doesn't have it; NOT fully idempotent, so apply only if absent). **Skip `070`** (abandoned backfill).

> If a migration errors with "already exists", it's already applied — move on.

## 2. Deploy the API (Railway)
- [ ] If Railway auto-deploys on push, the `main` push already triggered a build — confirm the latest deploy succeeded (logs show the server listening). Otherwise trigger a manual redeploy of `main`.
- [ ] Verify Railway env vars are set for prod, especially:
  - `ANTHROPIC_API_KEY` — **must have credit** (the AI features 500 without it). Confirm the prod key's account is funded.
  - `RESEND_API_KEY` — for CRM campaigns.
  - `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — the **prod** project.
  - Gmail/Dropbox/Buildexact/IMAP keys as already configured.
- [ ] Health check: `GET https://<railway-host>/api/health` → 200.

## 3. Deploy the frontend (Vercel)
- [ ] **Critical:** the committed `vercel.json` rewrite destination is a placeholder (`YOUR-RAILWAY-HOST.up.railway.app`). Ensure the **deployed** Vercel project points `/api/:path*` at the **real** Railway host — either the Vercel project already has the correct value, or update `vercel.json` and push. If `/api/*` 404s after deploy, this is why.
- [ ] Vercel env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (prod).
- [ ] Confirm the latest Vercel deploy (from `main`) is live on the custom domain.

## 4. Supabase Auth (only if not already configured for the prod domain)
- [ ] Site URL + redirect URLs include the Vercel custom domain (so login/redirects work).

## 5. Post-deploy smoke checks (on the live site)
- [ ] Log in.
- [ ] Home dashboard renders; KPIs sane (no −11,832%).
- [ ] Finance → a job's Command Centre loads (200) with sane margins.
- [ ] Sales → **Relationships** + **Contacts** tabs open (the CRM-nav fix).
- [ ] Hard-refresh a deep link (e.g. `/sales/dashboard`) → stays there, no bounce to /home (role-guard fix).
- [ ] Operations → a project's Schedule loads; "Load from template" inserts tasks (C6).
- [ ] WHS → questionnaire pre-fills from project data (H5).
- [ ] Blueprint chat returns a reply (confirms prod Anthropic credit).

## 6. Before live CRM campaigns
- [ ] Verify the sending domain **blueleafbuilding.com.au** in Resend (resend.com/domains) — the live test showed sends are rejected until the domain is verified.

## 7. Rollback (if needed)
- Code: `git revert <bad-commit>` (or redeploy the previous Railway/Vercel build). Don't force-push.
- DB: the migrations are additive/idempotent — no rollback needed. (Don't drop columns/tables.)
