# BL-INTERNAL Cost-Category Sub-Layer — System Architect Handover

*Audience: the architect who owns `portal-v2` and will commit this branch (`workforce-module`) and merge it into the main working tree. Everything below was verified against the ACTUAL built code on `workforce-module`, not the plan. Where the built code diverges from the plan or the SOP, it is called out explicitly.*

---

## 1. What this is

BL-INTERNAL is a permanent `carpentry_jobs` row (reference `BL-INTERNAL`, mig 125) that today swallows every non-site hour into one undifferentiated bucket. This build gives it the **same sub-entity backbone BLB Charge Up already has** (mig 145), re-purposed **cost-only** — no charge-out, no margin, no invoice — so internal overhead can be reported by category by AU financial year and quarter. Six seeded categories split by cost source: three **worked** (ATEC / trade school, Logistics, Personal work) are worker-logged on the PWA and valued at booked `timesheet_entries.cost_amount`; three **derived leave** (Annual, Sick, RDO) are computed at report time from the existing leave/RDO spine and **never logged as timesheet rows** (so they can never double-count against the planner or the `UNIQUE(employee_id, date)` timesheet constraint). Full spec/rationale: **`docs/workforce/BLB_INTERNAL_JOB_PLAN.md`** (this doc is the implementation-accurate companion to it).

---

## 2. Exact file list

### New files (all untracked — `git add` them)

| File | Purpose |
|---|---|
| `supabase/migrations/200_internal_categories.sql` | `internal_categories` table + `timesheet_entries.internal_category_id` FK + seed six categories + RLS + self-contained `updated_at` trigger |
| `supabase/migrations/201_leave_type_and_hours.sql` | Adds `leave_type`+`hours` to `workforce_employee_rdo_dates`, `leave_type` to `workforce_day_off_requests`; backfills existing per-employee rows to `'rdo'` |
| `server/lib/financialYear.mjs` | Canonical AU FY+quarter helper (`auFyQuarter`) + per-FY super-guarantee map (`SUPER_GUARANTEE_BY_FY` / `superGuaranteeForFy`) |
| `server/lib/internalCategoryService.mjs` | Cost-only sibling of `chargeUpService`: pure rollups (`rollupEntriesByCategory`, `categoryTotals`, `stripCost`), worked rollup, and the money-critical `computeLeaveCost` (pure) + `deriveLeaveCost` (DB wrapper) |
| `server/lib/internalCategoryRoutes.mjs` | Category CRUD + shifts + untagged + retro-assign endpoints (retro-assign rejects any leave-source target) |
| `src/pages/InternalJobDetail.jsx` | The BL-INTERNAL report page: category KPIs, by-FY table + quarter toggle, untagged retro-assign, estimated/rate-missing badges |
| `src/components/carpentry/InternalCategoryDetailModal.jsx` | Per-category drill-in — **Shifts view only** (no Tasks/Diary/Plans, no charge-out/margin) |
| `docs/sops/10_workforce/internal_cost_categories.md` | SOP 10-07 (Section 14 test script) |
| `docs/workforce/BLB_INTERNAL_JOB_PLAN.md` | The definitive build plan/spec (also untracked — commit it) |
| `docs/workforce/BLB_INTERNAL_HANDOVER.md` | This document |
| `scripts/test/internalLeaveCost.test.mjs` | Pure unit test for `computeLeaveCost` (11 assertions) |
| `scripts/test/internalJobE2E.test.mjs` | Adversarial E2E driving the real route handlers against a mock Supabase (8 scenarios) |

### Modified files

| File | Change | Hotspot? |
|---|---|---|
| **`server/lib/workforceRoutes.mjs`** | `INTERNAL_REFERENCE`/`isInternalJob`/`resolveInternalCategory`; `/subtasks` internal block; `internal_category_id` tagging on all four write paths (worker POST, mass-fill, worker update, submit) + both timesheet-detail read paths; `leave_type`+`hours` capture on day-off approval; new `POST /api/workforce/record-sick-day` | **⚠ SHARED COLLISION-HOTSPOT** — biggest edit (+221 lines) |
| **`server/lib/carpentryRoutes.mjs`** | Imports shared `auFyQuarter` (removes the inline copy); rewrites `GET /api/carpentry/internal-cost-summary` to add the merged category axis for the BL-INTERNAL element only | **⚠ SHARED COLLISION-HOTSPOT** |
| **`server/dev-api.mjs`** | Two lines: import + `registerInternalCategoryRoutes(app)` | **⚠ SHARED COLLISION-HOTSPOT** |
| **`src/lib/constants.js`** | Adds `INTERNAL_REFERENCE`, `LEAVE_TYPES`, `LEAVE_TYPE_LABELS` beside `CHARGE_UP_REFERENCE` | **⚠ SHARED COLLISION-HOTSPOT** |
| **`src/pages/CarpentryJobDetail.jsx`** | One-line branch: `reference === INTERNAL_REFERENCE` → `<InternalJobDetail>` (+ import) | **⚠ SHARED COLLISION-HOTSPOT** |
| `src/pages/worker/WorkerLogHours.jsx` | PWA internal-category picker + `addInternalTask` + submit body `internal_category_id` | no |
| `src/pages/workforce/TimeOffApprovalsTab.jsx` | Approve-with-leave-type modal + "Record sick day" modal | no |
| `docs/sops/SOP_INDEX.md` | +1 row (SOP 10-07), header total 130→131 | no |
| `docs/sops/SOP_CHANGELOG.md` | +1 entry | no |

**`src/App.jsx` and `src/components/AppShell.jsx` are NOT touched.** BL-INTERNAL renders inline through the existing `CarpentryJobDetail` routing switch — no new top-level route or nav entry. This was deliberate (plan §9) to avoid the two hottest merge files in the repo.

---

## 3. Migrations — apply order 200 then 201

Migration tree on this branch is at **196** (`196_job_consents.sql` is the highest existing). 197–199 are intentionally skipped; the new work starts at **200**, so there is **no collision** with any existing migration. Both migrations are idempotent (`create ... if not exists`, `add column if not exists`, `on conflict do nothing`) and self-contained (200's `updated_at` trigger defines its own function — no dependency on mig 145's `set_updated_at()`).

1. **`200_internal_categories.sql`** — creates `internal_categories`, adds `timesheet_entries.internal_category_id` (nullable, `ON DELETE SET NULL`), enables RLS (`authenticated` policy), seeds the six categories against the BL-INTERNAL job (warns, does not fail, if the BL-INTERNAL row is absent), `NOTIFY pgrst`.
2. **`201_leave_type_and_hours.sql`** — adds `leave_type` to `workforce_day_off_requests`; adds `leave_type`+`hours` to `workforce_employee_rdo_dates`; backfills all pre-existing untyped per-employee rows to `leave_type='rdo'`; `NOTIFY pgrst`. `workforce_team_rdo_dates` intentionally gets **no** column (team RDO is `'rdo'` and full-day by definition; costed by read-time fan-out).

Order matters only in that both should be applied together before the feature is exercised; 200 does not depend on 201 or vice-versa, but apply **200 then 201** for cleanliness. Every code path fails soft (returns `migrationPending`/503/empty) if either migration is absent, so applying them out of sync with a deploy will not 500.

---

## 4. Suggested clean commit grouping

The branch is one logical feature; four commits keep schema / backend / frontend / docs+tests reviewable. Example messages:

```
# 1 — schema
git add supabase/migrations/200_internal_categories.sql supabase/migrations/201_leave_type_and_hours.sql
git commit -m "BL-INTERNAL P1: migrations 200/201 — internal_categories + leave typing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"

# 2 — backend
git add server/lib/financialYear.mjs server/lib/internalCategoryService.mjs \
        server/lib/internalCategoryRoutes.mjs server/lib/workforceRoutes.mjs \
        server/lib/carpentryRoutes.mjs server/dev-api.mjs
git commit -m "BL-INTERNAL P2-4: cost-only service + CRUD/report routes + workforce ingest & leave capture

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"

# 3 — frontend
git add src/lib/constants.js src/pages/CarpentryJobDetail.jsx src/pages/InternalJobDetail.jsx \
        src/components/carpentry/InternalCategoryDetailModal.jsx \
        src/pages/worker/WorkerLogHours.jsx src/pages/workforce/TimeOffApprovalsTab.jsx
git commit -m "BL-INTERNAL P5-6: PWA picker, report UI, leave-capture UI

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"

# 4 — docs + tests
git add docs/workforce/ docs/sops/10_workforce/internal_cost_categories.md \
        docs/sops/SOP_INDEX.md docs/sops/SOP_CHANGELOG.md scripts/test/
git commit -m "BL-INTERNAL P7: SOP 10-07 + unit & E2E tests + plan/handover docs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Because five files are collision-hotspots, review the backend commit (#2) and constants/CarpentryJobDetail in #3 against `portal-v2` HEAD before merging — see §2.

---

## 4b. Landing this in the main working tree (READ THIS)

**Why none of these files show up in the main Cursor project yet:** this work lives in a **separate git worktree** —
`~/Desktop/blh-workforce.nosync` on branch **`workforce-module`** (created off `portal-v2`). The main project you have
open in Cursor is `~/Desktop/blue-leaf-hub.nosync` on branch **`portal-v2`**. Same repository, different checkout, so
the main folder can't see these files until the branch is merged. **This is a git branch merge — nothing is hand-copied.**

Everything (all new files **including migrations `200_internal_categories.sql` and `201_leave_type_and_hours.sql`**) is
currently **uncommitted** in the `blh-workforce.nosync` worktree, left for you to commit.

Steps:
1. **Commit on `workforce-module`** — in `~/Desktop/blh-workforce.nosync`, run the four grouped commits in §4 above.
2. **Merge into `portal-v2`** — from the main worktree:
   ```
   cd ~/Desktop/blue-leaf-hub.nosync      # branch portal-v2
   git merge workforce-module
   ```
   The moment this completes, every new file — the migrations, `financialYear.mjs`, `internalCategoryService.mjs`,
   `internalCategoryRoutes.mjs`, `InternalJobDetail.jsx`, etc. — appears in `~/Desktop/blue-leaf-hub.nosync` and in Cursor.
3. **Conflict watch-list** (the five collision-hotspots in §2 — resolve carefully, these are additive so conflicts should
   be small): `server/lib/workforceRoutes.mjs`, `server/lib/carpentryRoutes.mjs`, `server/dev-api.mjs`,
   `src/lib/constants.js`, `src/pages/CarpentryJobDetail.jsx`. `App.jsx`/`AppShell.jsx` are untouched, so they won't conflict.
4. **Migration-number safety:** the shared tree was at **196** when this branched; 200/201 don't collide (197–199 skipped
   intentionally). Confirm nothing else has since minted 200/201 before merging.
5. **After the merge**, apply the migrations to prod in order (§3: **200 then 201**) and run the before-live smoke (§7).
6. **Deploy** the normal way (`git push origin portal-v2:main` per your process). The migrations must be applied to prod
   **before** the deployed code hits the new tables/columns (the code fail-softs if they're absent, but the feature is
   inert until they're live).

---

## 5. Verification status

- **Frontend lint** (`eslint … --max-warnings 0` on all changed `.jsx`/constants): **clean, exit 0**.
- **Backend syntax** (`node --check` on all new + modified `.mjs`): **all OK**.
- **Production build** (`npm run build`): **green** (`✓ built in ~3.8s`; the >500 kB chunk-size notice is the repo's pre-existing warning, not an error).
- **Unit test** — `scripts/test/internalLeaveCost.test.mjs`: **11/11 assertions pass**. Covers all three leave sources (per-employee typed rows, team-RDO fan-out, expanded RDO patterns), PH-collision exclusion, half-day, part-timer non-7.6 hours, dedup (explicit row beats team RDO), null-rate archived employee flagged `rateMissing` (not silent $0), and the three LOCKED formulas exactly (incl. an assertion that RDO is NOT double-super'd).
- **E2E / adversarial critic** — `scripts/test/internalJobE2E.test.mjs`: **9/9 scenarios pass**. Drives the REAL `registerWorkforceRoutes` / `registerInternalCategoryRoutes` / `registerCarpentryRoutes` handlers against an in-memory mock Supabase (no DB, no re-implemented maths). Confirms: approve→typed annual/rdo/unpaid with correct costing; record-sick-day (dup→409, mig 201 absent→503); no-double-count (leave∩PH excluded, half-day 4h + 4h worked = one paid day); worker tag guard rejects a leave-category id (400); retro-assign rejects a leave target (400); **BL-CHARGEUP's `internal-cost-summary` element is byte-identical** while BL-INTERNAL gains the merged category axis; and **scenario 9 = a regression guard for the one bug the adversarial critic found** (see below).
- **One product bug found by the adversarial critic and fixed** (`server/lib/workforceRoutes.mjs`, day-off approve loop): approving leave over a date that **already had** a `workforce_employee_rdo_dates` row hit `UNIQUE(employee_id, rdo_date)` → the handler `continue`d and the day kept its **old/untyped** value → leave approved as *annual* was silently costed as **RDO**. Fixed to **UPDATE** the existing row's `leave_type`/`hours` (and record its id so a later reject still reverts it). Scenario 9 asserts the re-type + correct annual costing.

Run both locally: `node scripts/test/internalLeaveCost.test.mjs && node scripts/test/internalJobE2E.test.mjs`.

---

## 6. AU financial-year + super assumptions (for payroll sanity-check)

Locked money formulas (`internalCategoryService.leaveDayRate` / `computeLeaveCost`):

| Leave type | Formula | Notes |
|---|---|---|
| **RDO** | `hours × break_even_hourly` | `break_even_hourly` already contains super — **never re-add super** |
| **Annual** | `hours × base_hourly × 1.175 × (1 + SG)` | base + 17.5% AL loading + employer super |
| **Sick** | `hours × base_hourly × (1 + SG)` | base + super, no loading |
| **Unpaid** | `$0` | present but zero-cost, never dropped |

- **`base_hourly` EXCLUDES travel allowance** (Sam confirmed) — so `base × 1.175` is a clean base+loading with no travel.
- **Super applies to annual + sick only** (report = cost-to-business). `SG` is a **per-FY lookup** (`server/lib/financialYear.mjs` → `SUPER_GUARANTEE_BY_FY`): **2023-24 = 11.0%, 2024-25 = 11.5%, 2025-26 onward = 12.0%** (default 12% for any unlisted FY). Two accept-the-default fine points for payroll to confirm: SG basis = statutory guarantee rate; super treated as applying **to** the 17.5% loading (loading = OTE, the common case). Both are one-line changes if Blue Leaf differs.
- **Hours** = the row's `hours` if set, else the employee's standard day (`workforce_settings.standard_hours`, fallback 7.6). AU FY = Jul–Jun, label `"2025-26"`; quarters Q1 Jul–Sep … Q4 Apr–Jun. Cost is a wage figure (GST-irrelevant) and is director-gated (`stripCost` / `canViewCost`); hours stay visible to supervisors.

---

## 7. Required before live

1. **Apply migrations to prod in order: 200 then 201.** Nothing was applied during the build.
2. Confirm PostgREST picked up the schema (both migrations end with `NOTIFY pgrst`); if a column reads as missing, run `NOTIFY pgrst, 'reload schema';` (known stale-cache gotcha).
3. **Real-app smoke test** (all four acceptance paths):
   - Approve a day-off request typed **Annual** → open BL-INTERNAL report → the Annual leave row shows a non-zero **annual $** in the correct FY/quarter, flagged *estimated*.
   - **Record sick day** for an employee → BL-INTERNAL report → **sick $** appears (base × (1+SG)).
   - Worker logs hours on **BL-INTERNAL** picking a worked category (e.g. Logistics) → the entry is **tagged** and shows under that category (not `__untagged`).
   - **Retro-assign** an untagged entry to a leave category → **rejected (400)**; to a worked category → succeeds.

---

## 8. Known limitations / v2 deferrals

- **Allocation tagging deferred.** `workforce_allocations` gets no `internal_category_id` in v1. Verified-inert: `resolveAllocChargeUpSite`/`validateChargeUpSite` are gated on `isChargeUpJob`, which is false for BL-INTERNAL, so they never fire for an internal allocation.
- **No tasks / diary / plans on internal categories.** The drill-in modal is Shifts-only by design (cloning those tabs would call non-existent endpoints).
- **Annual-vs-sick split is forward-only.** Mig 201 backfills all pre-existing leave rows to `'rdo'`; prior-FY annual/sick therefore reads as RDO (never blank), and accrues correctly only from typed capture onward.
- **`chargeUpService.auFinancialYear` intentionally NOT unified.** It uses a different label format (`"2025/26"`, no quarters); repointing it would change the charge-up report's emitted label, which the plan forbids. Only the identical-behaviour `auFyQuarter` was promoted to the shared helper.
- **`taskAudit.mjs` echo not extended** (deliberate — internal categories have no billing/audit consequence).
- **SOP doc drift — RESOLVED.** SOP 10-07's front-matter + §5/§8/§12 and the SOP_CHANGELOG have been de-staled to reflect that the leave-capture UI (`TimeOffApprovalsTab.jsx` approve leave-type selector + "Record sick day" button) IS built; a new changelog row records the UI + E2E. Only the *forward-only* note remains (historic untyped leave still reads as RDO — that's expected, not drift).

---

## 9. Rollback

Nothing was applied to prod during the build, so pre-merge rollback is simply discarding the branch. Post-apply rollback:

- **Schema:** `drop table if exists public.internal_categories cascade;` (the `internal_category_id` FK column can be left in place harmlessly, or `alter table public.timesheet_entries drop column if exists internal_category_id;`); `alter table public.workforce_employee_rdo_dates drop column if exists leave_type, drop column if exists hours;` `alter table public.workforce_day_off_requests drop column if exists leave_type;` `drop function if exists public.internal_categories_touch_updated_at();`. Note the 201 backfill (untyped → `'rdo'`) is not reversible, but is inert if the columns are dropped.
- **Code:** revert the four feature commits (or the branch). All new endpoints and UI degrade to no-ops without the columns; the only shared-behaviour change to guard on revert is the `auFyQuarter` extraction in `carpentryRoutes.mjs` (now imported from `financialYear.mjs`) — reverting the backend commit restores the inline copy.
