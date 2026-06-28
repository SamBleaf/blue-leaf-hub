# Release Lock Batch — Result

> **Date:** 2026-06-28 · **Branch:** `portal-v2` · Deployment-only, no code changes this batch.

## Local verification
| Check | Result |
|---|---|
| `npm run build` | ✅ built in ~3.2s (only pre-existing chunk-size warning) |
| `node --check server/lib/operationsRoutes.mjs` | ✅ |
| `node --check server/lib/workforceRoutes.mjs` | ✅ |
| `eslint --no-ignore` (both changed server files) | ✅ clean |

No new edits made this batch. Two release docs + this result created under `docs/deployment/`.

## Clean staging groups (NOT staged — prepare only)
**Group A — ops cron secret fix (P0)**
```
git add server/lib/operationsRoutes.mjs
# commit: fix(ops): require CRON_SECRET on trade-ghost-check cron
```
**Group B — workforce hardening (P0/P1)**
```
git add server/lib/workforceRoutes.mjs
# commit: fix(workforce): deployment hardening batch 1 (job visibility, per-entry hours, approval idempotency, non-director cost leak)
# NOTE: its result doc lives in docs/ui-redesign/ which is GITIGNORED — not committable.
#       The committable audit (Group C) documents these fixes.
```
**Group C — deployment docs**
```
git add docs/deployment/ docs/qa/WORKFORCE_DEPLOYMENT_AUDIT.md
# commit: docs(deployment): release lock + whole-hub push + migration/release checklists + workforce audit
```
**Group D — UNRELATED redesign work — DO NOT bundle with A/B/C** (owner's separate commit)
```
# modified:
src/App.jsx  src/components/AppShell.jsx  src/pages/FinanceManager.jsx
src/pages/OperationsList.jsx  src/pages/OperationsProjectDetail.jsx
src/pages/Procurement.jsx  src/pages/ScheduleManager.jsx  src/pages/TenderBoard.jsx
src/pages/Workforce.jsx  src/ui-review/UiReviewIndex.jsx
src/ui-review/fixtures/{finance,operations,procurement,schedule,tender}.js
e2e/ui-review/routes.mjs
# untracked:
src/components/finance/FinanceKpiStrip.jsx  src/components/operations/
src/components/procurement/ProcurementItemCard.jsx  src/components/procurement/ProcurementKpiStrip.jsx
src/components/schedule/ScheduleLookahead.jsx  src/components/tender/  src/components/workforce/
src/lib/operationsDashboard.js  src/lib/tenderDashboard.js
src/ui-review/pages/H3RedesignMockup.jsx  src/ui-review/pages/OpsRedesignMockup.jsx
```
> `docs/ui-redesign/` is gitignored — nothing under it is committable (includes H4-A + workforce hardening result docs). Expected.

## Remaining human actions (in order)
1. **Set `CRON_SECRET`** in Railway; add `x-cron-secret` header to all cron-job.org jobs. (`RELEASE_LOCK_CHECKLIST.md` §2)
2. **Verify/apply prod Supabase migrations** per `MIGRATION_VERIFICATION_CHECKLIST.md` + take a pre-deploy backup snapshot.
3. **Field smoke** `/field/whs`, `/field/diary` (real browser). (checklist §4)
4. **Workforce smoke** — 403 on non-visible job, idempotent re-approve, supervisor cost null. (checklist §5)
5. **Client portal smoke** — own-project isolation, no financial leak. (checklist §6)
6. **Commit Groups A/B/C**, keep D separate, push → Railway/Vercel deploy. (checklist §8)
7. **Post-deploy checks** (checklist §9).

## Verdict: **BLOCKED — on operational gates only (code is READY TO DEPLOY)**
No code blockers remain (build/lint/syntax green; P0/P1 fixed in prior batches). The blocker
is the unfinished operational prerequisites above — specifically (1) `CRON_SECRET` not yet set
and (2) prod migration state not yet verified. Once §1–§5 pass, this is **READY TO DEPLOY**.
