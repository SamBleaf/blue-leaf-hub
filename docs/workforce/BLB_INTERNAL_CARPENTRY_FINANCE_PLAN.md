# BL-INTERNAL / Josh's & Sam's House / Finance→Carpentry — Planning Doc

*Synthesis of R1–R5 read-only maps. All file:line cites inherited from the subsystem maps (verified there by code-read); nothing below is stated as fact beyond what the maps confirmed. "CONFIRMED" = code-read; "DECISION" = needs Sam.*

---

## 0. FINAL PLAN — decisions LOCKED (Sam, 2026-09-05) — authoritative; supersedes the open questions in §7

**Locked decisions:**
1. **Josh's house & Sam's house = two cost-only `carpentry_jobs`** (charge-up *style*: no Buildxact, **no allowance/budget**, track actuals only). Real jobs so finance invoices + timesheet hours attach directly. Refs `BL-JOSH-HOUSE` / `BL-SAM-HOUSE`.
2. **Detail screen = a bespoke Charge-Up-style glance panel** (total hours + labour $ + material $ by cost category + tasks done). NOT the standard budget/variance tabs, NOT the existing ChargeUpJobDetail (that's for BL-CHARGEUP sites).
3. **Finance→carpentry fix = read-through** (no migration): carpentry `/summary` + `/budget` also read approved carpentry `financial_documents` grouped by category. Benefits ALL carpentry jobs. Ships first.
4. **Planner "Blue Leaf Internal" = 3-option picker** (Logistics / Josh's / Sam's), **full Charge-Up parity incl. Logistics auto-tag** (Model C): new `workforce_allocations.internal_category_id` + PWA autofill. Josh/Sam bind their real `carpentry_job_id`.
5. **"Personal work" internal category → archived** (history stays on BL-INTERNAL, non-destructive). ATEC excluded from the planner picker. BL-INTERNAL stays a live target for Logistics + the leave categories.
6. **Carpentry list groups** Josh/Sam (+ BL-INTERNAL/BL-CHARGEUP) under an **"Internal"** heading. Invoices = **inbound supplier costs** only (no charge-out).

**Migrations:** next free = **202**. Plan uses **202** (seed the two house `carpentry_jobs`) and **203** (`workforce_allocations.internal_category_id` + fix the mig-143 move RPCs to carry both `charge_up_job_id` AND `internal_category_id`). The finance fix needs **no** migration.

**Final phased build (each phase self-contained; ⚠️ = shared-hotspot file, flag at merge):**
- **Phase 0 — Finance→Carpentry read-through (Issue 3).** `/summary` + `/budget` also sum approved carpentry `financial_documents` (name→material-budget-line UUID resolve; job-level total is category-blind); surface finance invoices as read-only rows in `/costs`; double-count guard vs manual `carpentry_job_costs`. ⚠️`carpentryRoutes.mjs`. No migration. *Delivers the material-$ glance for every carpentry job incl. the houses.*
- **Phase 1 — Seed the two house jobs.** Mig **202**: insert `BL-JOSH-HOUSE`/`BL-SAM-HOUSE` (`project_type='other'`, `status='active'`, `on conflict (reference) do nothing`). No budget lines. Verify PWA Site-dropdown visibility (real jobs → auto-appear).
- **Phase 2 — Charge-Up-style house glance view.** New `InternalHouseJobDetail.jsx` (hours + labour $ + material $ by category + tasks done; no budget/variance), reads `/summary`+`/costs`+tasks (finance $ arrives via Phase 0). Branch in ⚠️`CarpentryJobDetail.jsx` for the two refs; add refs to ⚠️`constants.js`.
- **Phase 3 — Planner 3-option picker + Logistics auto-tag (Model C).** Mig **203** (alloc column + mig-143 RPC fix). ⚠️`workforceRoutes.mjs` (resolveAllocInternalCategory, ALLOCATION_SELECT embed, formatAllocation echo, set on POST/assign/PUT + worker today/week echo). ⚠️`WorkforcePlannerTab.jsx` ("Blue Leaf Internal" grouped entry → {Logistics→BL-INTERNAL+internal_category_id, Josh/Sam→their job}; clone the charge-up site bottom-sheet). `WorkerLogHours.jsx` prefill `internalCategoryId` from the allocation.
- **Phase 4 — Carpentry-list "Internal" grouping.** Group Josh/Sam/BL-INTERNAL/BL-CHARGEUP under an "Internal" header in ⚠️`CarpentryDashboard.jsx`.
- **Phase 5 — Cleanup + SOPs + tests.** Archive "Personal work" category; exclude ATEC from the planner internal picker. SOP updates (10-05/10-07 + carpentry/finance). Adversarial E2E: finance invoice → carpentry summary+glance shows it (right category, no double-count); house hours+material glance; planner Logistics drop → PWA autofill; move-RPC preserves both sub-tags; Personal-work archived.

**Notes:** finance inbound auto-matcher only matches jobs with a `buildexact_job_id` (`financeRoutes.mjs:1422`) → the houses never auto-match; **manual allocation only** (fine). Houses must NOT use a ref that hits the ChargeUp/Internal detail branch — they get their OWN branch (Phase 2).

---

## 1. Executive summary

Sam wants three things: (1) Josh's house + Sam's house as standard carpentry jobs under Blue Leaf Internal with budget/tasks/invoices/hours and PWA support, no Buildxact quote; (2) the Planner's "Blue Leaf Internal" chip to offer a 3-option picker (Logistics / Josh's / Sam's) exactly like the Charge Up site picker; (3) finance-allocated invoices to actually show up in the carpentry job's Cost/Budget and tally against the allowance.

**The one modeling decision that ties all three together: make Josh's house and Sam's house first-class `carpentry_jobs` rows (Model A), not Charge-Up-style "sites".** Only real jobs can carry a budget and receive finance invoice allocations (a charge_up "site" can do neither — R4, R5). Once they are real jobs, Issue 1 is mostly free, Issue 3's fix automatically flows invoices into their budgets, and Issue 2 becomes a grouped-picker UI in the planner (with one optional new column if Sam wants the "Logistics" option to auto-tag like Charge Up). Issue 3 is a hard blocker on Issue 1's "track invoices" ask and should ship first.

---

## 2. Issue 3 — Finance → Carpentry bug (CONFIRMED root cause + recommended fix)

### Root cause (CONFIRMED by R2, R3, R4)
The finance write-side and the carpentry read-side touch **completely disjoint tables**:

- **Finance writes only `financial_documents` / `financial_approvals`.** Allocate sets `carpentry_job_id` + `carpentry_cost_category` + `status='pending_approval'` (`financeRoutes.mjs:713-723`). Approve moves the file, audits, and pushes an *external* Buildexact PO (`financeRoutes.mjs:969-1087`, PO push `616-674`). The `normalized_costs` write is guarded by `doc.job_id` so it is **skipped for carpentry docs** (`financeRoutes.mjs:1052`). Repo-wide grep: **zero `carpentry_job_costs` inserts from finance** (R3).
- **Carpentry reads material actuals only from `carpentry_job_costs`** (+ labour from approved timesheets), never from `financial_documents`:
  - `/summary`: `otherActual = SUM(carpentry_job_costs.amount)` (`carpentryRoutes.mjs:2254-2260`).
  - `/budget`: `materialActualTotal = SUM(carpentry_job_costs.amount)`, per-line keyed on `carpentry_job_costs.carpentry_job_budget_id` (`carpentryRoutes.mjs:2069-2075, 2106-2108`).
  - `grep financial_documents` across `carpentryRoutes.mjs` / `subtaskRollup.mjs` / `carpentryStages.mjs` → **zero matches** (R2).

**The disconnect:** summary/budget READ `carpentry_job_costs`; finance WRITES only `financial_documents`. Nothing bridges them, so an allocated invoice is invisible to the carpentry budget and never tallies against the allowance.

### Cost-category alignment (important nuance — CONFIRMED)
`financial_documents.carpentry_cost_category` (mig 089) is **free text**, and the finance picker is populated from `carpentry_job_budgets.category_name WHERE cost_type='material'` (`financeRoutes.mjs:736-743`) — so the **label already matches** a real material budget line. **But** per-line actuals join on the budget-row **UUID** (`carpentry_job_costs.carpentry_job_budget_id`), not the name. So the fix must resolve name → UUID via `SELECT id FROM carpentry_job_budgets WHERE job_id=? AND category_name=? AND cost_type='material'`; `UNIQUE(job_id, category_name)` (mig 067:19) makes that lookup deterministic (R2, R3). Job-level totals need no category (they're category-blind SUMs).

### Recommended fix: R3 Option (i) — read-through, no schema migration
Have `/summary` and `/budget` **also read approved carpentry `financial_documents`**:
`SELECT carpentry_cost_category, amount_ex_gst FROM financial_documents WHERE carpentry_job_id=:id AND status IN ('approved','filed','xero_synced')`, add the sum into `otherActual`/`materialActualTotal`, and group by category (resolved → budget-line UUID) to feed `materialActualByLine`.

**Why (i) over write-through (ii):**
- No schema migration; `financial_documents` stays the single source of truth (consistent with how tender actuals flow via `normalized_costs` rather than being copied — R3).
- No idempotency/lifecycle hazard: un-allocate, re-allocate, reject, and amount edits are reflected live because status/`carpentry_job_id` are read at query time. Write-through (ii) would need a widened `source` CHECK (currently `('manual','xero')`, mig 065:83-84 → a **mig 202**), a stable upsert key on `source_reference=doc.id`, and delete/update sync on every finance lifecycle event (R3).

**Pair with two small additions:** (a) surface finance-allocated invoices as read-only rows in the `/costs` list tab so they're visible, not just summed; (b) a guard/comment so the same invoice is never entered both as a manual `carpentry_job_cost` and a finance doc (double-count avoidance — R3).

**Migration needed for the recommended fix: none.** Only fall to mig 202 (widen `source` CHECK) if Sam later prefers write-through.

---

## 3. Josh's / Sam's house — model options

R5's three models, condensed. **Recommended: Model A** (real jobs + planner UI-grouping), optionally adding Model C's one column for full Charge-Up parity on the Logistics option.

| | **Model A — two real `carpentry_jobs` + planner UI grouping** ✅ | **Model C — A + `workforce_allocations.internal_category_id`** | **Model B — Charge-Up-style sub-sites under BL-INTERNAL** ❌ |
|---|---|---|---|
| "Personal work" internal_category | Retire/archive it; history stays on BL-INTERNAL (non-destructive; `InternalJobDetail` still renders archived-but-costed rows) | Same as A | Splits into two "site" rows; BL-INTERNAL then carries **two parallel sub-axes** (categories + sites) — confusing |
| Budget | ✅ real jobs → `carpentry_job_budgets` + line items + `/budget` | ✅ same as A | ❌ sites have **no** per-site budget (`carpentry_job_budgets` is job-keyed) |
| Tasks | ✅ standard `site_tasks.carpentry_job_id`, no new work | ✅ same | ⚠️ site-owned tasks/diary only (mig 151) |
| Invoices | ✅ finance can allocate to `carpentry_job_id` today | ✅ same | ❌ **finance cannot allocate to a charge_up site** (only `carpentry_job_id`, mig 088) |
| PWA | ✅ appears in Site dropdown automatically, standard logging path, **no PWA changes** | ✅ + planner-prefill of Logistics | ⚠️ needs internal-site picker wiring |
| Planner | Josh/Sam are ordinary legend chips (or grouped under an "Internal" header in UI); Logistics = plain BL-INTERNAL allocation, worker picks category in PWA | Josh/Sam bind `carpentry_job_id`; **Logistics binds `internal_category_id` on the allocation** → chip shows "Logistics", PWA autofills (true Charge-Up parity) | Single uniform picker writing one id (cleanest picker, but fails Issue 1) |
| R3 interaction | ✅ strong — invoices land in each house's budget automatically once R3 lands | ✅ same | ❌ R3 targets `carpentry_job_id`; would never reach per-site costs |
| Cost | Lowest | A + 1 migration + assign-endpoint + PWA autofill | Medium, but structurally can't deliver Issue 1 |

**Recommendation (R5):** Ship **Model A** as the spine. Add **Model C's** single `workforce_allocations.internal_category_id` column **only if** Sam wants dropping "Blue Leaf Internal → Logistics" on the planner to pre-tag the shift and have the PWA autofill it. **Avoid Model B** — a charge_up "site" is explicitly *not* a `carpentry_jobs` row (mig 145) and cannot carry a budget or receive an invoice, so it fails the headline of Issue 1 (R4, R5).

**No-Buildxact budget gap (CONFIRMED, R2/R4):** the only UI path to create budget lines is the XLSX import; `/budget/seed` has delete-missing semantics (`carpentryRoutes.mjs:1510-1511`) so it's unsafe for incremental use, and `/budget/line-items` requires an existing parent line. Giving the two houses a budget requires **either** a hand-built estimate XLSX (existing path works today) **or** a new manual "add budget category" endpoint + small UI. See Q4.

---

## 4. Planner BL-INTERNAL 3-option picker

Under **Model A**, the picker is a **grouped legend entry / UI chooser** in `WorkforcePlannerTab.jsx`:
- **Josh's house / Sam's house** → allocate to their real jobs (`carpentry:<id>`, ordinary allocations). Chip shows the job label; PWA autofills the job naturally because it's a real job.
- **Logistics** → plain BL-INTERNAL allocation as today (worker still picks the internal category in the PWA).

**If Sam wants full Charge-Up parity on Logistics (Model C), files/functions to touch (mirroring the Charge Up site-picker flow, R1):**
- **Migration (mig 202):** `ALTER TABLE workforce_allocations ADD COLUMN internal_category_id uuid REFERENCES internal_categories(id) ON DELETE SET NULL;` + index; keep outside the XOR check (like `charge_up_job_id`, mig 146). **Also fix mig 143 RPCs** (see hotspot bug below).
- **`workforceRoutes.mjs`:** new `resolveAllocInternalCategory()` sibling of `resolveAllocChargeUpSite` (`620-626`) — reuse existing `resolveInternalCategory` (`603-613`); echo `internalCategoryId`+label in `formatAllocation` (`553-577`); embed/attach in `ALLOCATION_SELECT` (`545-551`) like `attachChargeUpSites` (`630-643`); set the column guarded in POST `/allocations` (`1789-1832`), `assign` (`1906-1948`), PUT (`1834-1883`); echo on worker `/allocations/today` (`3729`) + `/week` (`3751`).
- **`WorkforcePlannerTab.jsx`:** add `internalJKey` sibling of `chargeUpJKey` (`221-224`) matching `INTERNAL_REFERENCE` (`constants.js:885`); fetch options from the **already-existing** `GET /api/carpentry/jobs/:id/internal-categories` (`internalCategoryRoutes.mjs:30-41`), filter `costSource==='timesheet'` + active; generalize `needsSite`/`assignFromLegend` (`290-307`); clone the bottom-sheet picker (`854-878`); thread the id through fill/fillDown/dup state; chip label (`767`).
- **`WorkerLogHours.jsx`:** add `setInternalCategoryId(al.internalCategoryId)` at the prefill block (`131-144`), paralleling the `chargeUpJobId` line (`140`).

**Option-set curation (DECISION, R1/R5):** today's *worked* internal categories are {ATEC, Logistics, Personal work} (mig 200), but Sam's planner list is {Logistics, Josh's, Sam's}. Under Model A the houses leave the category axis (they become jobs), "Personal work" is retired, and ATEC must be excluded from the planner picker.

**Pre-existing hotspot bug to fix here (R1, CONFIRMED):** the atomic move RPC `workforce_allocation_move` (mig 143:67-71) re-inserts the displaced shift **without `charge_up_job_id`**, and the move endpoint has no post-stamp on the RPC path — so swapping a charge-up shift onto an occupied cell loses the displaced site once mig 143 is applied. Any new `internal_category_id` inherits the identical gap. Fix the mig-143 RPCs to carry both columns.

---

## 5. End-to-end linkage map — every element that must connect

For each house (Josh's, Sam's) as a real `carpentry_jobs` row:

1. **Carpentry job** — `carpentry_jobs` row (seed migration mirroring mig 125, or UI create); stable `BL-*` reference recommended; standard tab layout (do NOT give it a reference that hits the `ChargeUpJobDetail`/`InternalJobDetail` branch, `CarpentryJobDetail.jsx:2403-2404`).
2. **↔ Budget lines** — `carpentry_job_budgets` (category, cost_type, budget_ex_gst) + `carpentry_budget_line_items` sub-tasks. **Needs a no-Buildxact create path** (XLSX or new manual endpoint).
3. **↔ Cost categories** — the `cost_type='material'` budget lines are the buckets finance invoices hit; `UNIQUE(job_id, category_name)` anchors name→UUID resolution.
4. **↔ Finance invoices** — `financial_documents.carpentry_job_id` + `carpentry_cost_category` (allocate `financeRoutes.mjs:713-723`); **surfaced into budget/summary only after the Issue 3 read-through fix.** Note: inbound-email auto-matcher only considers jobs with a `buildexact_job_id` (`financeRoutes.mjs:1422`) → these houses **never auto-match**, manual allocation only (R4).
5. **↔ Timesheets / hours** — `timesheets.carpentry_job_id` → approved `timesheet_entries` roll into labour actuals by `task_category` / `budget_line_item_id`. Hours only tally against a budget line if a labour line with matching `workforce_task_category` exists (R4).
6. **↔ Allocations (planner)** — `workforce_allocations.carpentry_job_id` (Model A). Optionally `internal_category_id` for the Logistics option (Model C).
7. **↔ PWA** — houses appear in the Site dropdown automatically (`/api/worker/projects` returns all carpentry jobs, no status filter — `workforceRoutes.mjs:2388-2396`); standard category grid; submit `POST /api/worker/timesheets`. **No PWA change** for Model A.
8. **↔ Report** — the BL-INTERNAL `internal-cost-summary` report loses "Personal work" as a live category (retired); house costs now live in each house job's own budget-vs-actual. **Decide** whether the internal report should also surface the two house jobs, or whether they're viewed purely as normal carpentry jobs (Q5).

---

## 6. Draft phased build plan

Migrations 200/201 exist; next free number is **202**. Shared-hotspot files flagged ⚠️.

**Phase 0 — Issue 3 read-through fix (ship first; unblocks Issue 1's invoices).**
Add `financial_documents` reads to `/summary` and `/budget` with name→budget-line-UUID resolution; add finance rows to `/costs` list; double-count guard. Touch ⚠️`carpentryRoutes.mjs`. **No migration.** Self-contained; benefits all carpentry jobs immediately.

**Phase 1 — Stand up the two house jobs.**
Seed migration (mig 202) inserting `BL-JOSH-HOUSE` / `BL-SAM-HOUSE` `carpentry_jobs` (mirror mig 125, `on conflict (reference) do nothing`), `project_type='other'`, `status='active'`. Confirm they render with standard tabs (not the ChargeUp/Internal branch). Verify PWA visibility. No ⚠️ hotspots.

**Phase 2 — No-Buildxact budget entry (only if Sam wants variance analysis).**
Either document the hand-built-XLSX path, or build a single-row `POST /api/carpentry/jobs/:id/budget/line` + "Add category" UI (avoid the delete-missing `/budget/seed`). Touch ⚠️`carpentryRoutes.mjs`, `CarpentryJobDetail.jsx`.

**Phase 3 — Planner 3-option picker (Model A grouping).**
Group Josh/Sam/Logistics under the "Blue Leaf Internal" legend entry in ⚠️`WorkforcePlannerTab.jsx`; Josh/Sam route to their job keys, Logistics stays a plain BL-INTERNAL allocation. Possibly touch ⚠️`constants.js` for reference constants. No migration if Model A only.

**Phase 4 — (Optional, Model C) Logistics auto-tag parity.**
Mig 202-sibling `workforce_allocations.internal_category_id` + fix mig-143 RPCs; resolver + serialization + assign/PUT/move in ⚠️`workforceRoutes.mjs`; picker wiring in ⚠️`WorkforcePlannerTab.jsx`; PWA autofill in `WorkerLogHours.jsx`.

**Phase 5 — Cleanup / data decision.**
Archive the "Personal work" internal_category; exclude ATEC from the planner picker; decide on historical-hours migration (Q1).

---

## 7. Questions for Sam

1. **House model — real jobs vs sub-buckets?** Josh's/Sam's house as their own `carpentry_jobs` (full budget + invoice allocation) vs Charge-Up-style sites (no budget, no invoices). **Recommended default: real jobs (Model A).** Only this satisfies "track invoices … with budget".

2. **Planner parity depth for "Logistics"?** When you drop "Blue Leaf Internal → Logistics" on the planner, should the shift *carry* the Logistics tag and have the PWA autofill it (→ Model C, new column + mig 202), or is it fine for the worker to still pick "Logistics" in the PWA (→ Model A, no schema change)? **Recommended default: Model A now; add C later if the autofill matters.** (Josh/Sam autofill fine either way — they're real jobs.)

3. **Finance fix — read-through vs write-through?** Read live from `financial_documents` (no migration, auto-reflects un-allocate/reject) vs mirror each approved invoice into `carpentry_job_costs` (needs `source` CHECK widened + idempotency + lifecycle sync). **Recommended default: read-through (R3 Option i).**

4. **Do the houses get a budget allowance, and how?** With no Buildxact quote: hand-enter budget categories (build a small manual "add category" path so hours + invoices tally against an allowance) vs run budget-less (costs tracked, no variance). **Recommended default: build the manual budget-line path** so Issue 1's "budget" is real. Alternatively, hand-built XLSX import works today with zero new code.

5. **Retire "Personal work" category, and migrate its history?** Archive it (keep past hours on BL-INTERNAL as history) vs migrate historical "Personal work" hours onto the new house jobs vs keep it for genuinely-personal non-house work. **Recommended default: archive it, leave history on BL-INTERNAL** (non-destructive).

6. **"Track invoices" = inbound supplier costs, or issuing bills out?** Inbound supplier invoices costed against the house (finance allocation, covered by Issue 3) vs issuing an invoice to bill someone (needs a charge-out layer BL-INTERNAL deliberately drops). **Recommended default: inbound only.**

7. **Carpentry-list visibility?** Should Josh's/Sam's house show inline in the main carpentry job list next to client jobs (`CarpentryDashboard.jsx:725`), or be grouped/hidden under an "Internal" heading? **Recommended default: group under an "Internal" heading** to avoid cluttering the client pipeline.

8. **Confirm BL-INTERNAL stays a live allocation target** for Logistics + the leave categories after the two houses move out to their own jobs. **Recommended default: yes.**