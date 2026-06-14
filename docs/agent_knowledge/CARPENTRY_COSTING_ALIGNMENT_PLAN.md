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

## Build plan (AFTER verification)
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
