# Workforce + Worker PWA — Deploy Handoff (for the system architect)
**Date:** 2026-06-22  
**Author:** deployability remediation pass  
**Goal:** ship the Workforce-module deployability fixes (audit gate: ≥90/100). Two deploy blockers + a batch of security/UX hardening.

---

## 1. Where the code is
- **Already pushed to `origin/main`.** All 4 commits below are ancestors of `origin/main` (tip `c94463a`); local branch `portal-v2` == `origin/main`. **No push or merge needed** — deploying `main` ships them.
- ⚠️ They are **bundled with other concurrent work** on `main` (portal v2, field-app `/field`, Documents & Templates). Deploying `main` ships all of it together — coordinate with whoever owns that work; this handover covers only the workforce commits listed below.
- **Repo:** `SamBleaf/blue-leaf-hub` (working copy: `~/Desktop/blue-leaf-hub.nosync`).

### Commits (oldest → newest)
| Hash | Summary |
|---|---|
| `6e84a39` | deploy blockers — `/worker` PWA route + workforce RLS lockdown (migration 111) |
| `d810913` | batch 1 — worker security & server hardening (token header, cost strip, rate gate, BX unitCost, route gates) |
| `27996f3` | batch 2 — worker app error states & sync recovery |
| `85f978d` | batch 3 — cost-estimate clarity, worker-link visibility, offline banner |

### Files changed (11 files, +262/−56)
```
server/dev-api.mjs                 server/lib/workforceRoutes.mjs
server/lib/carpentryRoutes.mjs     src/lib/workerFetch.js
src/pages/Workforce.jsx            src/pages/WorkforceTeam.jsx
src/pages/worker/WorkerHome.jsx    src/pages/worker/WorkerTasks.jsx
src/pages/worker/WorkerWeek.jsx    src/components/worker/WorkerLayout.jsx
supabase/migrations/111_workforce_rls_lockdown.sql
```

---

## 2. Database
- **Migration `111_workforce_rls_lockdown.sql` — APPLIED** (confirmed by Sam, 2026-06-22). Drops the wide-open `auth_users_*` RLS policies on the 5 workforce tables; RLS stays enabled (deny-all to anon/authenticated); all access is server service-role. No further DB action needed.
- No other migrations introduced by this work.

## 3. Environment / config
- **No new environment variables required.**
- Existing optional kill-switch `BUILDEXACT_COMPLETE_ORDERS` (default on) is unaffected.
- The `/worker` route fix depends on the SPA build producing `dist/worker.html` — `npm run build` already emits it (confirmed in dist). No config change.

## 4. Deploy steps
1. Code is on `origin/main` already — just deploy `main` (no push/merge needed).
2. **API (Railway):** redeploy from `main` — `npm run start` (unchanged start command). The `/worker` Express route lives in `server/dev-api.mjs`.
3. **SPA:** rebuild + deploy (`npm run build`) so the updated `workerFetch.js` (token-in-header) and worker pages ship, and `dist/worker.html` is present for the new route to serve.
4. Both halves must ship together (the `/worker` server route serves the built `worker.html`).

## 5. Post-deploy smoke test (curl, ~30s)
```bash
# 1. Worker app served with WORKER identity (was serving the Hub before)
curl -s https://blueleafhub.com.au/worker | grep -o '<title>[^<]*</title>'
#   expect: <title>Blue Leaf Building</title>
curl -s https://blueleafhub.com.au/worker | grep -o 'manifest[^>]*'
#   expect: manifest" href="/manifest.json"   (NOT /manifest.webmanifest)

# 2. Hub still correct at root
curl -s https://blueleafhub.com.au/ | grep -o '<title>[^<]*</title>'
#   expect: <title>Blue Leaf Hub</title>

# 3. Worker API still auth-gated
curl -s -o /dev/null -w '%{http_code}\n' https://blueleafhub.com.au/api/worker/me   # expect 401

# 4. RLS lockdown — anon cannot read employees (needs the anon key; expect [] or empty)
#    Full check: with a portal-CLIENT JWT, `select worker_token from employees` must return nothing.
```

## 6. What this changes (behaviour)
- **PWA install** from `/worker` now installs the *Blue Leaf Building* worker identity (start_url `/worker`), not the Hub.
- **Worker token** is sent in the `x-worker-token` header and stripped from the URL after first open (no more token in logs/history). The server still accepts `?token=` for the initial magic-link open.
- **No pay data to workers/supervisors:** `cost_amount` removed from worker `/me` + `/timesheets/:date`; `hourly_rate` gated to admins on `/timesheets/pending`.
- **Buildexact Labour line** `unitCost` now derived from the booked cost (reconciles to `totalCost`, no longer coupled to the editable `hourly_rate`). `totalCost` (the actual) is unchanged.
- **Worker app** surfaces expired-link / failed-save / offline states (previously silent dead-ends); admin History gets a **Force re-sync** for stuck `needs_review` rows.
- **Route gates** added to bulk site-task create + carpentry task write routes.

## 7. Rollback
Revert the 4 commits (`git revert 85f978d 27996f3 d810913 6e84a39`) and redeploy. Migration 111 is safe to leave in place (locking RLS does not break the service-role server); only revert it if a client app genuinely needs direct `employees` access (none currently does).

## 8. Manual follow-ups (not blocking deploy, owned outside this pass)
- **iPhone install test** (must do once after deploy): install from `/worker`, confirm the worker timesheet opens (not the admin `/login`). See the test guide.
- **Worker links for Ben Regan & Max Waller** — issue via Team Directory (now flagged "⚠ no link yet").
- **CJB-005 Buildexact link** — handled separately by Sam (out of scope here).
- **Deferred:** invite-email HTML-escape (lives in `authRoutes.mjs`, being edited by the portal work — fold in there); maskable PWA icon split (needs a padded art asset; no iOS impact).

---
*All changes were verified locally: lint clean, production build passes, server boots clean, and a live worker E2E confirmed the token-header path + cost-strip + `/worker` routing.*
