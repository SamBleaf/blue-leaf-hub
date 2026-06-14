# Carpentry Labour → Buildexact Category Alignment

> **Status:** DESIGN captured + **gated on a verification step**. No build yet (Sam: "land one test push first, then build").
> **Goal:** approved carpentry hours push into the **correct sub-category of that job's Buildexact quote** (its actual costings), not a generic global cost code.
> **Decided 2026-06-14 (Sam).**

---

## The gap (today)
- On import, the Hub **already pulls the Buildexact quote categories** into `carpentry_job_budgets` (`category_name`, `budget_ex_gst`, `cost_type`). Good.
- But `matchTaskCategory()` **collapses every category onto one of 9 fixed Hub tasks** (`first_fix_framing`, `cladding`, …). So a worker only ever picks from 9 generic tasks.
- The Buildexact push (`syncTimesheetToBuildexact`) tags the labour entry with a **global cost code** (`workforce_settings.cost_code_<task>` → CARP-001…), **not** the job's specific quote category.
- Result: "Ground Floor Framing", "Roof Framing", "Pergola" all squash into "First fix / framing" and push to one generic code → hours don't land against the right line in Buildexact actuals.

## The model (decided)
1. **Task list = the job's Buildexact quote categories** (per job, from `carpentry_job_budgets`), not the 9 global tasks.
2. **Selection step when a job is added to Workforce** — tick which categories are **labour-relevant**; drop the **supply / material** ones that aren't (a quote has supply-only lines that no one logs hours against).
3. **Future depth:** break each quote category into finer **sub-tasks** — e.g. "Cladding & Soffit Lining" → *wall cladding type* · *soffit linings* · … . Categories become headers; sub-tasks are what hours log against.
4. Approved hours for a category (or sub-task) push to **that** Buildexact cost category.

## How Buildexact records labour (Sam, 2026-06-14)
A Buildexact labour actual is **name + date + hours + the correct category** — there is **NO employee-ID match**. So:
- The push is **name-based**: send the employee's **name**, not an ID. `buildexact_employee_id` is optional metadata (sent only if a standard API call turns out to use it); it **must never block a push** (the old "No Buildexact employee ID" gate was wrong and is removed).
- Buildexact organises cost by **Category → Sub Category**, and each recipe/cost line has a **Type (Material/Labour)** and an **"Actuals Category"**. **The "Actuals Category" is where a labour actual lands** — that is the alignment target. The carpentry quote's labour categories (already pulled into `carpentry_job_budgets`) are these.

## The blocker — verify FIRST (why we don't build the mapping yet)
**No timesheet has ever successfully pushed to Buildexact (0/6).** The estimate API returns categories **by name only** (`costCategory` empty on live accounts; no per-line code/ID), and the `labourentries` endpoint contract is **unverified** (earlier flagged as possibly not exposed). We don't yet know the exact field that drives the **Actuals Category** on a pushed labour entry. Build the per-job mapping on the wrong field → hours hit the wrong cost line → corrupt costings.

So: **land one real labour push, observe how it attaches to an Actuals Category, THEN build the mapping.**

### Test-push runbook (Sam)
1. (Optional) Team Directory → an employee → Buildexact Employee ID — **not required** (labour is name-based); only set it if we later find a standard API call that uses it.
2. Make sure a carpentry (or construction) job has its **Buildexact job ID** set (carpentry jobs created from a BX quote already have it).
3. **Mass Fill** (or worker PWA) → log a small amount of hours against that job → **Approve** (Auto fires the push; or hit **Sync to Buildexact**).
4. Read the server log line **`[workforce/buildexact-sync] PUSHED …`** — it logs the **exact payload sent** (now `employeeName` + date + hours + category) + **Buildexact's full response**. On failure it logs **`PUSH FAILED`** with the real Buildexact error.
5. In **Buildexact**, check **which Actuals Category** the labour landed in (or whether the endpoint even accepted it).
6. Tell me: did it land? which field drove the Actuals Category — the `costCode`, a category name, a cost-item / estimate-line id? → that determines the mapping (and whether `labourentries` is even the right endpoint).

## ⚠️ VERIFICATION RESULT (2026-06-14, read-only API probe) — BLOCKER
Probed the live Buildexact API (read-only) against real jobs:
- ❌ `GET /jobs/{id}/labourentries` → **404 "Resource not found"** on every job. **The endpoint the Hub's push assumed does NOT exist.** Same for `/jobs/{id}/{costs,actuals,actualcosts,labour,labourcosts,timesheets,timeentries,costentries,bills,transactions}` — all 404.
- ✅ `GET /jobs/{id}/purchaseorders` → 200 (50 POs on the test job). **POs are the only job-level "actual" the API exposes.**
- ⚠️ `GET /timesheets`, `/employees`, `/costcategories` (top-level) → 200 but **empty body `{}`** — this account has no BX employees, no BX timesheets, no global cost categories via the API (consistent with labour having always lived in Deputy, never Buildexact). POST-ability unknown/untested.
- ✅ Per-job estimate **categories** are still readable via `getEstimatesByJob`/`pullBuildexactEstimate` (parent-header names) — so the *category list* exists per job; what's missing is a way to **post a labour actual against one**.

**Conclusion:** there is **no proven Buildexact API path to push approved labour as an actual cost.** The whole "auto-push labour to BX actuals via `labourentries`" premise (from the original audit) is built on an endpoint that isn't there. **This must be resolved before any further build.** (Doing the test push first caught this *before* building the per-job category feature on a dead endpoint.)

### ✅ MECHANISM RESOLVED (2026-06-14) — labour = a Work Order against the cost category
Per the Buildxact Help Center, the **Deputy↔Buildxact** integration works like this:
- A Buildxact **Job** = a Deputy **Location**; the job's **Cost Categories** = Deputy **Areas**.
- Staff log hours against an Area (= cost category). On approval, **the cost syncs into Buildxact as a Work Order** against that Job Cost Category. The worker is auto-added to Buildxact **contacts** on first approval.

So Deputy never used a labour endpoint — **approved hours become a Work Order** (the only writable job actual). And the Hub **already wraps the exact endpoint**:
```
createPurchaseOrder({
  jobId, orderType: 'Work', contactId?, description?,
  items: [{ costItemType: 'Labour', description, quantity, unitCost, totalCost, uom, itemCode?, notes? }]
})
→ POST /jobs/purchaseorders/create   (verified live: GET /jobs/{id}/purchaseorders returns POs;
                                       deletePurchaseOrder exists for cleanup of 'Unsent' orders)
```
**This IS the carpentry alignment** the user asked for: Cost Category = the quote sub-category = the Deputy "Area" = the Work-Order line's category. The pieces line up.

**Remaining detail (nail at build time):** exactly which field attaches a Work-Order *line* to a specific **cost category** (likely `itemCode` or a costCategory field on the item — estimate items expose `costCategory`). Confirm with one test Work Order create + delete (delete works for 'Unsent').

**Corrected build:** replace the dead `POST /jobs/{id}/labourentries` push with `createPurchaseOrder({ orderType:'Work', items:[{costItemType:'Labour', …}] })`, the line tagged to the job's cost category. Aggregation granularity (one Work Order per timesheet? per job+category per pay period?) is a design choice — Deputy aggregated per Area.

> Alternative to evaluate later: Buildxact's **new native Timesheets** feature (`/timesheets` endpoint exists but empty; API-create support unconfirmed). Work Orders are the proven path today.

## Build plan (AFTER the mechanism is resolved)
- **Schema:** add a per-job labour-category store the timesheet entry can reference. Likely:
  - `carpentry_job_budgets`: add `is_labour_relevant boolean` (the selection) + (if BX needs it) the category's `buildexact_cost_code` / `buildexact_cost_item_id`.
  - timesheet entries: store the chosen carpentry budget category (new nullable `carpentry_budget_id` / category ref) so carpentry entries aren't limited to the 9-value `task_category` enum.
  - (Future) a `carpentry_budget_subtasks` table for the finer breakdown.
- **Selection UI:** when a carpentry job enters Workforce, an admin ticks the labour-relevant categories (default: `cost_type='labour'` pre-ticked, supply/material unticked).
- **Logging UI:** worker PWA + Mass Fill task dropdown, *for a carpentry job*, shows that job's selected categories (later: sub-tasks) instead of the 9 global tasks. Construction jobs keep the 9.
- **Push:** for a carpentry entry, send the entry's resolved Buildexact category via **the field verified in the runbook** (instead of the global cost code).
- Budget-vs-actual rollup keys on the per-job category (no longer the lossy 9-way collapse).

## What stays the same
- OT/double-time cost computation (hours-based, category-agnostic).
- The carpentry job ↔ Buildexact job link (`carpentry_jobs.buildexact_job_id`, address fallback).
- Construction-job timesheets (9 standard tasks + global codes) — unchanged unless we later unify.
