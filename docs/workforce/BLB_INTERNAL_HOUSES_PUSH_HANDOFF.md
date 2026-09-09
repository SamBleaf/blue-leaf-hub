# BL-INTERNAL Houses / Finance→Carpentry / Planner — Push & Deploy Handoff

**For:** the agent/dev with GitHub push access. **From:** the Workforce agent (built in the `blh-workforce.nosync` worktree; the build environment had no GitHub creds so it could not push).
**Date:** 2026-09-05. **Full plan:** `docs/workforce/BLB_INTERNAL_CARPENTRY_FINANCE_PLAN.md` (§0 = locked decisions). **SOP:** `docs/sops/10_workforce/internal_cost_categories.md` (v2.0).

---

## TL;DR — two steps, nothing else needed

Everything is committed on **`portal-v2`** (local, in `~/Desktop/blue-leaf-hub.nosync`), rebased onto current `main`, working tree clean, and already verified green. Just:

**1. Push (deploy the code):**
```bash
cd ~/Desktop/blue-leaf-hub.nosync
git push origin portal-v2:main
```
`portal-v2` is **6 commits ahead of `origin/main`** (5 feature commits + this handoff doc). It was rebased onto the latest `main` (`f50dafc`, "Sales pipeline Phase 0") with **zero file overlap**, so the push is a clean fast-forward.

**2. Apply migrations in Supabase SQL editor, IN ORDER:**
```
200 → 201 → 202 → 203
```
- **200 / 201** were already pending from the earlier BL-INTERNAL cost-category feature (see that feature's handover).
- **202 / 203** are new (this build).
- All are **idempotent** (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING` / `CREATE OR REPLACE` / guarded `to_regclass`) — safe to re-run.
- The code is **fail-soft**: it guards every new table/column, so deploying the push **before** the migrations are applied will NOT break existing carpentry / workforce / PWA / finance. Features just stay inert until their migration lands.
- **Phase 0 (the finance→carpentry fix) needs NO migration** — it goes live on push and fixes cost visibility for **all** carpentry jobs.

> You do **not** need to build/test — already verified (below). No `.env` / prod-DB action beyond the two migration files.

---

## Verification (already done, re-verified on the rebased tree)
- `npm run build` — ✓ (only the pre-existing >500 kB chunk warning).
- `node scripts/test/internalJobE2E.test.mjs` — **14/14** (incl. finance read-through / no-double-count / house glance / planner Logistics auto-tag / move-RPC carries both sub-tags / fail-soft).
- `node scripts/test/internalLeaveCost.test.mjs` — **11/11**.
- `npm run lint` (frontend) + `eslint --no-ignore` (changed server files) — clean.
- Adversarial review gate — **0 product bugs**.

---

## The 5 feature commits (oldest → newest)
| Commit | What |
|---|---|
| `ceb66a6` | **migrations 202/203** — 202 seeds `BL-JOSH-HOUSE`/`BL-SAM-HOUSE` cost-only carpentry_jobs + archives the `personal_work` internal category; 203 adds `workforce_allocations.internal_category_id` + fixes the mig-143 move RPC to re-insert BOTH `charge_up_job_id` and `internal_category_id`. |
| `b5c5446` | **finance→carpentry read-through** — carpentry `/summary`+`/budget`+`/costs` now read approved carpentry-tagged `financial_documents` (status `approved/filed/xero_synced`, ex-GST), folded into material actuals by cost category (name→budget-line UUID), unmatched → `financeUnlinked` bucket, finance rows shown read-only. Disjoint from `carpentry_job_costs` (no double-count). No migration. Also adds `labourHours`/`labourByCategory` for the glance view. |
| `cd75b1a` | **house glance view + Internal list grouping** — new `InternalHouseJobDetail.jsx` (hours + labour$ + material$ by category + tasks; no budget/variance); `CarpentryJobDetail` branches the two house refs to it; `CarpentryDashboard` groups internal jobs under an "Internal" heading; house refs added to `constants.js`. |
| `196a7a0` | **planner 3-option picker + Logistics auto-tag** — `WorkforcePlannerTab` "Blue Leaf Internal" opens a picker {Logistics / Josh / Sam}; Josh/Sam bind their `carpentry_job_id`, Logistics stamps `internal_category_id` on the allocation + the PWA autofills it. `workforceRoutes` + `internalCategoryRoutes` + `WorkerLogHours` wiring. Fail-soft pre-mig-203. |
| `bad4802` | **tests + SOP + plan doc** — E2E scenarios 11–14; SOP 10-07 v2.0 + 10-05 cross-ref + index/changelog; plan doc. |

**Shared-hotspot files touched** (all already merged into `portal-v2`, no outstanding conflicts): `server/lib/carpentryRoutes.mjs`, `server/lib/workforceRoutes.mjs`, `server/lib/internalCategoryRoutes.mjs`, `src/lib/constants.js`, `src/pages/CarpentryJobDetail.jsx`, `src/pages/CarpentryDashboard.jsx`, `src/pages/workforce/WorkforcePlannerTab.jsx`, `src/pages/worker/WorkerLogHours.jsx`. `App.jsx`/`AppShell.jsx` NOT touched.

---

## Post-deploy smoke (after push + migrations)
1. **Finance→carpentry:** allocate a supplier invoice to a carpentry job in Finance → it now appears in that job's Cost/Budget and tallies under the matching material category. (Works for real client jobs too — this is the headline bug fix.)
2. **Houses:** open Josh's / Sam's house (Carpentry → "Internal" group) → glance view shows hours + labour$ + material$ by category + tasks. Allocate an invoice to a house in Finance (manual — the inbound auto-matcher only matches Buildexact-linked jobs) → material$ appears.
3. **Planner:** drop "Blue Leaf Internal" on a shift → pick Logistics / Josh / Sam. Logistics-tagged shift autofills the category in the worker PWA; Josh/Sam log against their job.

---

## Rollback
- **Code:** `git reset --hard f50dafc` on `portal-v2` (or revert the 5 feature commits) and force-push, before anyone else builds on top.
- **DB (only if applied):** 202/203 are additive. To undo: `ALTER TABLE workforce_allocations DROP COLUMN IF EXISTS internal_category_id;`; delete/deactivate the two house `carpentry_jobs` rows; `UPDATE internal_categories SET status='active' WHERE slug='personal_work'` (un-archive). The mig-143 RPC fix is a strict improvement (previously dropped `charge_up_job_id`) — leave it.

## Coordination notes
- Built in worktree `~/Desktop/blh-workforce.nosync` on branch `workforce-module` (== these commits). Safe to `git worktree remove` / prune once pushed.
- No other branch/worktree was modified. `origin/main` was still `f50dafc` at handoff time — if it has since moved, rebase `portal-v2` again before pushing (the feature files are carpentry/workforce/finance/internal + migrations 202/203, so conflicts are unlikely outside `SOP_CHANGELOG`/`SOP_INDEX`).
