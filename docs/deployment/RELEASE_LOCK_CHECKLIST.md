# Release Lock Checklist — Blue Leaf Hub

> Branch: `portal-v2` · Verdict carried in: `RELEASE_LOCK_BATCH_RESULT.md`
> Use top-to-bottom. Nothing here changes code — operational gating only.

## 1. Environment variables (confirm in Railway)
Required:
- [ ] `ANTHROPIC_API_KEY`
- [ ] `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (Vercel) + service role key (Railway: `SUPABASE_*`)
- [ ] `CRON_SECRET`  ← **new, gating** (see §2)
- [ ] Mail transport: `RESEND_API_KEY` (preferred) and/or Gmail OAuth vars
- [ ] `DROPBOX_APP_KEY/SECRET/REFRESH_TOKEN` (+ `DROPBOX_NAMESPACE_ID`)
Optional (feature-degrades gracefully if absent):
- [ ] `BUILDEXACT_API_URL/USERNAME/API_KEY/SUBSCRIPTION_KEY`
- [ ] `IMAP_*` (finance inbox), Marketing Intelligence (`GA4_PROPERTY_ID`, GSC, GBP, Meta)
- [ ] Verify live: Settings → integration badges (`GET /api/integrations/status`)

## 2. CRON_SECRET setup (gating — guards are inert without it)
Railway:
- [ ] Add `CRON_SECRET` = a long random string. Redeploy API.

cron-job.org (every Hub cron job):
- [ ] Add request header `x-cron-secret: <same value>` to each job hitting:
  - `POST /api/cron/rfq-reminders`
  - `POST /api/cron/lead-time-notifications`
  - `POST /api/cron/wipaa-review-tasks`
  - `POST /api/cron/portal-sync`
  - `POST /api/cron/cost-insights`
  - `POST /api/cron/trade-ghost-check`  ← newly guarded this release
- [ ] Verify: call one endpoint **without** the header → expect `403 {"ok":false,"error":"Forbidden"}`.
- [ ] Verify: call **with** header → expect `200`.

## 3. Supabase migration verification
- [ ] Complete `MIGRATION_VERIFICATION_CHECKLIST.md` first. Do not deploy until prod DB
      matches this branch's assumptions (portal v2 103/104/108/109 + base through 102; marketing 122 separate).

## 4. Field app smoke (real browser, logged in as admin or supervisor)
- [ ] `/field` loads (mobile viewport ~390px).
- [ ] `/field/whs` renders, no console error, WHS list/empty-state shows.
- [ ] `/field/diary` renders, no console error, diary entry form usable.
- [ ] `/field/jobs` + `/field/tasks` load.

## 5. Workforce smoke (logged in as admin/director)
- [ ] Worker PWA: submit a timesheet against an **assigned** job → success.
- [ ] Worker PWA: attempt submit against a non-visible job UUID → `403 "You don't have access to this job."`
- [ ] Worker PWA: try a negative/0 hours entry → `400` rejected.
- [ ] Approve a submitted timesheet → cost computed, status approved.
- [ ] Re-approve same timesheet (double-click / retry) → `alreadyApproved:true`, no re-stamp, no duplicate Buildexact push.
- [ ] As a **supervisor** (non-director), open project labour view → per-worker `cost` and per-category `total_cost` are blank/null; hours + names show.

## 6. Client portal smoke (as a seeded client)
- [ ] Client login → lands on Home for **their** project only.
- [ ] My Actions / Project Journey / Selections / Documents / Messages load, no console error.
- [ ] Attempt to read another project (different projectId in URL) → blocked/`403`.
- [ ] No financial leak: variation/claim views show inc-GST client figures only (no cost-to-builder/margin).

## 7. Rollback plan
- [ ] Railway keeps the previous deploy — if smoke fails, **Rollback to previous deployment** in Railway (one click).
- [ ] DB: migrations are additive; do **not** auto-rollback schema. If a migration caused the failure, fix forward or restore from the pre-deploy Supabase backup (§MIGRATION checklist step "before deploy").
- [ ] Frontend (Vercel): redeploy previous build if SPA is broken.
- [ ] If a cron mutation misfires: it is idempotent/guarded; disable the cron-job.org job and investigate — no data restore needed for `trade-ghost-check`.

## 8. Deploy action
- [ ] Commit in the clean groups (see `RELEASE_LOCK_BATCH_RESULT.md` §staging). Do **not** bundle redesign work.
- [ ] Push branch → Railway auto-deploys API (`npm run start`); Vercel auto-builds SPA.
- [ ] Confirm Vercel `vercel.json` `/api/:path*` rewrite points at the Railway host.

## 9. Post-deploy checks
- [ ] API health: a known GET (e.g. `/api/integrations/status`) returns 200.
- [ ] Log in as staff → dashboard loads, no console errors.
- [ ] One cron endpoint manual fire with secret → 200.
- [ ] Re-run §4–6 smokes against production.
- [ ] Watch Railway logs ~15 min for unhandled 500s (esp. finance IMAP poller, portal sync).
