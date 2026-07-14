---
sop_version: 1.0
last_reviewed: 2026-07-14
app_version: main
screenshot_status: placeholders_only
owner: Director / Admin
test_status: untested
---

# SOP 14-05: Pricing Intelligence & Approvals Task View

**Module:** Cost Intelligence — Earned-Value Costing  
**SOP ID:** 14-05  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Directors and admins. Supervisors also use the **Approvals** screen (to approve/reject crew timesheets). The **Pricing Intelligence** board is Director-only (it shows cost and margin data).

## 2. When to use it
- **Approvals:** every time you review and approve the crew's timesheets — daily or weekly. The Task column lets you mass-approve while still seeing what everyone worked on.
- **Pricing Intelligence:** periodically (monthly/quarterly), and especially **before quoting a new job** — to see which types of work actually make or lose money and correct your pricing at the source.

## 3. What this does
Two views built on the sub-task data the crew logs:
- **Approvals Task column** — shows each timesheet's task **inline** on the main table, so you can approve a full day of timesheets without expanding every row. Where a worker picked a sub-task, it shows the **sub-task** (e.g. "Wall framing"), not just the broad category.
- **Pricing Intelligence board** — a cross-job view that ranks your work by the **realised margin** you actually made on it, per task type. It turns "I think we lose money on wall framing" into a number you can act on when you quote.

## 4. Before you start
- You are signed in with an **admin** (Director) role for the Pricing board; admin or supervisor for Approvals
- The **Company Cost Model is synced** (Settings → Company Cost Model) — otherwise actual cost shows as *base-rate* (raw pay) instead of *overhead-loaded*, and the board labels it as such
- The Pricing board is only meaningful once **completed** carpentry jobs have logged (loaded) time — it is a compounding asset that fills in as jobs finish (see §12)

## 5. Step-by-step process

### Approve timesheets with the Task column
1. Go to **Workforce → Timesheets → Approvals**
2. The pending list shows a **Task** column: each row's task(s) are visible inline — the chosen sub-task where one was picked, else the main category. Multiple tasks on one day are stacked with their hours.
3. Review each row's task + hours without expanding. To see full detail (notes, photos, carpentry-job attribution), click **View** or the row to expand.
4. Approve a single row with the green **✓**, reject with **✗**, or tick **Select all** and use the bulk actions to mass-approve.

[insert screenshot: Approvals table with the Task column showing sub-task labels]

### Read the Pricing Intelligence board
1. Go to **Carpentry** (dashboard). Below the stats, expand the **Pricing intelligence** panel.
2. It lists each task type with **Jobs**, **Hours**, **Charged (sell)**, **Actual cost**, and **Realised margin** — ranked **worst margin first** so the money-losers surface at the top. Green ≥ target (25%), amber within 5 points, red below.
3. Use the toggles:
   - **Completed jobs** (default) vs **All jobs** — Completed is the honest signal (full sell vs full cost); All includes in-progress jobs, which read high until their hours land.
   - **Main categories** vs **Sub-tasks** — Sub-tasks is the wall-vs-truss view; it only shows work that was tracked at sub-task level.
4. Read the basis label (top right): *overhead-loaded cost* (good) or *base-rate cost* (cost model not synced).
5. Act on it: a task type running below target is a candidate to **reprice** in your estimating.

[insert screenshot: Pricing intelligence panel expanded, Completed jobs + Sub-tasks, worst-first]

## 6. What happens next
- Approving a timesheet computes its **loaded** actual cost and (if enabled) pushes a Work Order to Buildexact
- Approved sub-task hours feed the job's **Budget** margin gauge (SOP 14-03) and, once the job completes, the **Pricing Intelligence** board
- The board's insights are **advisory** — they inform how you quote the next job. Nothing here is client-facing or auto-applied to a price.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Trusting the board with too little data | It renders even with one or two jobs | Treat early numbers as directional; it firms up as completed jobs accumulate |
| Reading "All jobs" as final | In-progress jobs have full sell but partial cost | Use **Completed jobs** for the true margin; "All" is a work-in-progress peek |
| Confusing loaded vs base cost | The cost model wasn't synced | Check the basis label; sync the Company Cost Model so cost is overhead-loaded |
| Expecting a full sub-task board immediately | Sub-task grain needs confirmed sub-tasks + logged time | It fills in as new jobs (e.g. Naldera) are tracked at sub-task level |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| Pricing panel is empty | No completed jobs with logged time yet | Switch to **All jobs** to see work in progress, or wait until jobs complete |
| Sub-task view is empty but Main categories has data | No jobs tracked at sub-task level yet | Confirm sub-task mappings (SOP 14-03) and have the crew log against sub-tasks (SOP 14-04) |
| Basis says "base-rate cost" | Company Cost Model not synced | Settings → Company Cost Model → sync; actuals then load with on-costs + overhead |
| A task type is missing from the board | No sell budgeted and/or no cost logged against it | Expected — a stream appears once it has budget and/or logged actuals |
| Task column shows the main category, not the sub-task | The worker didn't pick a sub-task (or none were confirmed) | This is correct — it falls back to the main category when no sub-task was chosen |

## 9. Related modules
- [Carpentry Budget, Sub-task Mapping & Margin Gauge](cost_intel_carpentry_budget_margin.md) — SOP 14-03 (the sell + confirmed sub-tasks the board reads)
- [Logging Time Against Sub-tasks (Worker app)](cost_intel_log_time_subtasks.md) — SOP 14-04 (the actuals the board reads)
- [Workforce overview](../10_workforce/workforce_overview.md) — SOP 10-01 (approving timesheets)

## 10. Screenshot placeholders
[insert screenshot: Approvals table with the inline Task column]
[insert screenshot: a multi-task day stacked in the Task column]
[insert screenshot: Pricing intelligence panel — Main categories, Completed jobs]
[insert screenshot: Pricing intelligence panel — Sub-tasks grain, showing wall vs roof framing]
[insert screenshot: basis label showing "overhead-loaded cost"]

## 11. Automation notes
- API endpoints:
  - `GET /api/workforce/timesheets/pending` — returns pending timesheets; each entry now carries a resolved `taskLabel` (the sub-task label where one was chosen, else the main category)
  - `GET /api/carpentry/pricing/streams?scope=&grain=` — the pricing board data. `scope` = `completed` (default) | `all`; `grain` = `category` (default) | `subtask`. Admin/supervisor only. Returns `{ streams, scope, grain, basis, targetPct }`
- **Realised margin** = (charged − actual **loaded** cost) ÷ charged, where actual cost is the sum of approved `timesheet_entries.cost_amount` (labour, overhead-loaded) grouped by task type, plus tagged `carpentry_job_costs` (material) in the sub-task view
- **Sub-task grain** groups by `carpentry_budget_line_items.canonical_key` (confirmed line items) and folds in both labour (timesheets tagged with `budget_line_item_id`) and material (`carpentry_job_costs.carpentry_budget_line_item_id`, migration 142) actuals
- The **base-rate vs loaded** basis is derived from whether the Company Cost Model is synced (`getCostModel`)
- **No Buildexact backfill:** Buildexact's labour actuals are largely the Hub's own loaded timesheets pushed back as Work Orders — importing them would double-count. The board is fed only by Hub-logged actuals.

## 12. Edge cases and limits
- **Completed vs all scope:** "Completed jobs" is the honest realised-margin signal; "All jobs" inflates margin on in-progress jobs (full sell, partial cost) and is labelled as such
- **Loaded vs base basis:** when the cost model is unsynced, cost is raw pay — margins read high; the basis label flags this
- **Sub-task grain requires the full chain:** confirmed sub-tasks (SOP 14-03) + time logged against them (SOP 14-04); until then the Sub-tasks view is empty and Main categories carries the signal
- **Realised margin is null where no cost is logged** — a stream with sell but zero actual shows "—", not 100% margin
- **Advisory only:** the board never changes a price automatically; a human decides how to reprice
- **Approvals Task column falls back gracefully** — category-level entries (no sub-task) show the main category; there is no regression for builder sites

## 13. Owner of the process
Director / Admin  
Next review: 2028-01-14

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Migrations 140, 141, 142 applied; Company Cost Model synced
- [ ] At least one carpentry job with a confirmed sub-task mapping (SOP 14-03) and approved timesheets logged against a sub-task (SOP 14-04)
- [ ] At least one **completed** carpentry job with logged (loaded) time, for the Pricing board
- [ ] A pending (submitted, not yet approved) timesheet exists, for the Approvals view
- [ ] Signed in as an admin (Director) for the Pricing board; admin/supervisor for Approvals

### Test cases

**TC-01 — Happy path (Approvals Task column)**
1. Go to Workforce → Timesheets → **Approvals**
2. Expected UI: the table has a **Task** column; a row where the worker chose a sub-task shows the **sub-task** label (e.g. "Wall framing"), not the parent category
3. Expected API: `GET /api/workforce/timesheets/pending` returned entries with `taskLabel` populated
4. A row with a category-level entry shows the **main category** in the Task column
- [ ] Pass  [ ] Fail

**TC-02 — Happy path (Pricing board loads + ranks)**
1. Go to Carpentry → expand **Pricing intelligence**
2. Expected UI: streams listed with Jobs/Hours/Charged/Actual cost/Realised margin, ranked worst-margin-first; margin colour-coded vs the 25% target
3. Expected API: `GET /api/carpentry/pricing/streams?scope=completed&grain=category` returned `{ streams, scope, grain, basis, targetPct }`
- [ ] Pass  [ ] Fail

**TC-03 — Scope + grain toggles**
1. Toggle **All jobs** → the data reloads (in-progress jobs included); footer notes in-progress reads high
2. Toggle **Sub-tasks** → the board regroups by canonical sub-task (`grain=subtask`); the column header reads "Sub-task"
3. Expected API: the query string reflects the chosen `scope`/`grain` on each toggle
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role (Pricing board gated)**
1. Call `GET /api/carpentry/pricing/streams` as a non-admin/supervisor (e.g. a plain worker/user token)
2. Expected result: 403 (admin/supervisor only); the panel is not rendered for non-Director roles in the UI
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (end-to-end)**
1. Approve the pending sub-task timesheet from the Approvals screen
2. Open the job's Budget tab → the sub-task's actual cost has increased and moved the margin gauge (SOP 14-03)
3. On a completed job, confirm the Pricing board's **Sub-tasks** view shows that sub-task's realised margin
- [ ] Pass  [ ] Fail

**TC-06 — Empty states are honest**
1. With no completed jobs that have logged time, the **Completed jobs** view shows the "switch to All jobs" empty message
2. The **Sub-tasks** view, with no sub-task-tracked jobs, shows the "fills in as jobs are tracked at sub-task level" message — it does **not** show a fabricated 100% margin
- [ ] Pass  [ ] Fail

**TC-07 — Basis label reflects the cost model**
1. With the Company Cost Model synced, the basis label reads **"overhead-loaded cost"**
2. (If testable) with the cost model unsynced, it reads **"base-rate cost"** and margins are understood to be un-loaded
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Approvals Task column shows the sub-task inline (main category as fallback), no expand needed
- [ ] Pricing board loads, ranks worst-first, and colour-codes vs target
- [ ] Scope (completed/all) and grain (category/subtask) toggles refetch and regroup correctly
- [ ] Pricing endpoint returns 403 for non-admin/supervisor
- [ ] Realised margin is null ("—") where no cost is logged (never a fake 100%)
- [ ] Basis label matches cost-model sync state
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
