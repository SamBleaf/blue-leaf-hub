---
sop_version: 1.0
last_reviewed: 2026-07-14
app_version: main
screenshot_status: placeholders_only
owner: Director / Admin
test_status: untested
---

# SOP 14-03: Carpentry Budget, Sub-task Mapping & Margin Gauge

**Module:** Cost Intelligence — Earned-Value Costing  
**SOP ID:** 14-03  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Directors and admins who run a carpentry job's money. This is an office task — it decides how the budget is broken up and confirms the sub-task map that field time will later be logged against. Site workers do not use this screen (they log hours in the Worker app — see SOP 14-04).

## 2. When to use it
- After a carpentry job is created and you have the estimate spreadsheet — to seed the budget and sub-tasks
- On any existing carpentry job that pre-dates this feature — to run a one-off re-import so sub-tasks are generated
- Before workers start logging hours — to confirm the sub-task mapping so the right task choices appear in the field
- Any time during the build — to read the margin gauge and per-category table and see whether the job is tracking to target margin
- When a line has been mapped to the wrong sub-task — to reassign it and re-confirm

## 3. What this does
Turns a carpentry estimate into a live budget you can track against real cost. It reads the estimate's leaf lines (the lowest-level priced items) and seeds two things: the budget categories and the sub-task line items underneath them. At the top of the tab a margin gauge shows, for Labour and Material separately, how much margin is left as real cost lands. You then confirm which sub-task each line belongs to — because sub-tasks decide the task list workers see in the field, this mapping is money-tier and must be confirmed by a human before it is treated as canonical. Once confirmed, every hour and invoice that lands is measured against the budget so you can see margin erosion early instead of at closeout.

## 4. Before you start
- You are logged in as **Director** or **Admin**
- Migrations **140** and **141** are applied (they create the sub-task line-item table and the seed path) — without them the sub-task sections will not appear
- The carpentry job exists and you have its estimate **XLSX** export to hand
- For **loaded** (real) actuals, the **Company Cost Model** must be synced (Settings → Company Cost Model). If it is not synced, actual cost falls back to raw pay (no overheads) and the margin gauge will read optimistically. The burn-rate card on the Budget tab shows whether the model is synced.

## 5. Step-by-step process

### Open the Budget tab
1. Go to **Carpentry** in the sidebar
2. Open the job (click the job card)
3. Click the **Budget** tab

### Import the estimate (or re-import)
1. Click **Import estimate XLSX** — the button is always at the **top-right** of the Budget tab (it stays there so you can re-import at any time)
2. Choose the estimate spreadsheet file
3. The import seeds the **budget categories** and, from the estimate's **leaf lines**, the **sub-task line items** underneath them
4. **Existing jobs:** run one re-import. Jobs created before this feature never stored the estimate's leaf lines, so they have categories but no sub-tasks until you re-import once.

> 💡 **Tip:** Re-importing does not wipe your confirmed mapping — it refreshes the budget figures and back-fills any leaf lines that were missing. Confirm the mapping again after a re-import if the estimate structure changed.

### Read the margin gauge (top of the tab)
1. Two "thermometers" sit at the top: **Labour** (target **25%** margin) and **Material** (target **20%**)
2. On each bar:
   - The **bar length** = what we charge — the sell price, ex-GST
   - The **fill** = real cost so far — loaded timesheets plus tagged invoices (this is actual cost, **not** the estimate's cost figure)
   - The **green tail** = the margin still being kept
   - The **dashed line** = the point where cost starts eating into margin (target-margin threshold)
3. A **solid marker** with a **"Proj." badge** = the projected final margin. It **baselines at the target** (25% labour / 20% material) and moves off target only as real approved timesheet cost proves you're tracking under or over — it never reads a phantom 100%.
4. **% complete comes from the job's Schedule** (the stage schedule), not ticked task boxes: a category whose stage is **complete** is 100% done; **not started** is 0%; an **in-progress** stage blends how far through its planned dates it is with how much of the allowable cost has been logged.

### Read the per-sub-task earned value (in the expanded row)
Each sub-task group shows its **sell** (budget), its **actual** (green — real hours logged against that sub-task in the field, mig 147), and the **variance** (red when over). A footer notes any of the category's logged labour **not yet attributed to a sub-task** (older coarse entries) — new hours attribute automatically as the boys log against a sub-task on the app.

### Confirm the sub-task mapping (money-tier — must be confirmed)
1. Expand a category row by clicking its **▶ chevron**
2. The lines appear grouped into **sub-task sections** by their `canonical_key`
3. To move a line to a different sub-task, use its **dropdown** — the change is instant and local (not yet saved)
4. Click **＋ Add sub-task** to create a new sub-task section
5. Click **×** on a section to delete it — its lines **roll back to the parent** category (they are not lost)
6. When the grouping is right, click **Save & confirm ✓**
7. **Nothing persists until you Confirm.** Until then every reassignment, add, and delete lives only in the browser.

### Read the per-category table
1. Below the gauge, each category row shows: **Budget**, **Actual**, **Variance**, **% done** (from the schedule), **Proj. margin**, **Days @ margin**
2. **Proj. margin** turns **amber/red** when the projected margin drops **below target** (25% labour / 20% material) — that is your early warning to act
3. A **`*`** on Proj. margin means the projection is **held at target** — the stage is under way but the logged labour is still too thin to confirm a saving; it sharpens as approved timesheets accrue (so a stage marked complete with almost nothing logged reads 25%, not a phantom 100%)
4. **Days @ margin** reads how many more work-days the remaining budget affords at the current loaded burn rate before the target margin is breached. Note: this is a **whole-team** figure and matches the stage's duration on the Workforce Pipeline calendar.

[insert screenshot: Budget tab with the Labour + Material margin gauges at the top and Import estimate XLSX button top-right]
[insert screenshot: a category row expanded to show sub-task sections grouped by canonical_key, with the Save & confirm ✓ button]
[insert screenshot: the per-category table with an amber/red Proj. margin cell]

## 6. What happens next
- On import, the budget categories and sub-task line items are written for the job (`carpentry_job_budgets`, `carpentry_budget_line_items`)
- On **Save & confirm**, the sub-task mapping is marked confirmed — this is the gate that makes the sub-tasks appear in the **Worker app** (SOP 14-04). Until you confirm, workers log at category level only.
- As workers log hours (SOP 14-04) and invoices are tagged, **Actual** and the **margin gauge fill** update against the budget
- The confirmed sub-task rates feed the **Pricing Intelligence** board (SOP 14-05) once the job is tracked at sub-task level
- No PO, invoice, or client-facing document is created — this is an internal costing tool

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Sub-tasks never appear on an old job | The job predates the feature and its leaf lines were never stored | Run **one re-import** of the estimate XLSX — that back-fills the leaf lines and generates the sub-tasks |
| Reassigning lines but they revert next visit | The change was made but **Save & confirm ✓** was never clicked | Always finish with **Save & confirm ✓** — nothing persists until you confirm |
| Margin gauge reads too healthy | Company Cost Model not synced, so actuals fall back to raw pay (no overheads) | Sync the Cost Model in Settings → Company Cost Model; check the burn-rate card shows "synced" before trusting the gauge |
| Trusting Proj. margin with no work logged | Projection needs a % complete; with none it uses the manual box you filled | Log task completion, or set the manual % honestly — a guessed % gives a guessed projection |
| Deleting a sub-task section and fearing lost lines | The × looks destructive | Deleting a section rolls its lines **back to the parent** category — they are never lost, just un-grouped |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| No sub-task sections when I expand a category | Migrations 140/141 not applied, or the job was never re-imported | Confirm 140/141 applied; run one **Import estimate XLSX** re-import |
| Import runs but Actual stays $0 | No hours or invoices have landed against the budget yet | Actuals populate as workers log time (SOP 14-04) and invoices are tagged — expected on a fresh import |
| Actual looks lower than reality | Cost Model not synced → raw pay used instead of loaded cost | Sync Company Cost Model (Settings) and reload the Budget tab |
| Save & confirm ✓ does nothing | Network error, or you are not Director/Admin | Check the browser console; confirm your role has access to the Budget tab |
| Proj. margin cell not amber/red when it should be | The projection needs a completion % and none is set | Log task completion or enter the manual % so a projection can be computed |

## 9. Related modules
- [Logging time against sub-tasks (Worker app)](cost_intel_log_time_subtasks.md) — SOP 14-04 (the field side of this mapping)
- [Pricing Intelligence & Approvals task view](cost_intel_pricing_intelligence.md) — SOP 14-05 (where confirmed sub-task rates surface)
- [Track carpentry job costs](../15_carpentry/15-05_track_costs.md) — SOP 15-05
- [Run a pre-tender estimate](cost_intel_pretender_estimate.md) — SOP 14-01
- [View cost benchmarks by trade](cost_intel_view_benchmarks.md) — SOP 14-02

## 10. Screenshot placeholders
[insert screenshot: Budget tab initial state — margin gauge (Labour + Material) at top, Import estimate XLSX button top-right, per-category table below]
[insert screenshot: file picker after clicking Import estimate XLSX]
[insert screenshot: an expanded category row showing sub-task sections, the line dropdown, ＋ Add sub-task and × controls, and Save & confirm ✓]
[insert screenshot: per-category table with Budget / Actual / Variance / % done / Proj. margin / Days @ margin columns, one row amber/red]

## 11. Automation notes
- API endpoints:
  - `GET /api/carpentry/jobs/:id/budget` — read the budget, categories, gauge figures
  - `POST /api/carpentry/jobs/:id/budget` — save budget-level edits
  - `POST /api/carpentry/jobs/:id/budget/seed` — import/re-import estimate XLSX → seeds categories + leaf-line sub-tasks
  - `GET /api/carpentry/jobs/:id/budget/line-items` — read the sub-task line items
  - `POST /api/carpentry/jobs/:id/budget/line-items` (+ confirm) — persist the mapping on **Save & confirm ✓**
  - `PATCH /api/carpentry/budget/line-items/:id` — reassign a single line's sub-task
  - `DELETE /api/carpentry/budget/line-items/:id` — delete a sub-task section (lines roll back to parent)
- Tables:
  - `carpentry_job_budgets` (migration **067**) — budget header + per-category figures
  - `carpentry_budget_line_items` (migration **140**) — sub-task line items keyed by `canonical_key`, with a confirmed flag
  - `carpentry_job_costs.carpentry_budget_line_item_id` (migration **142**) — links each logged cost to the sub-task it was booked against
- Loaded actuals draw on the **Company Cost Model** (Settings → Company Cost Model); when not synced, actuals fall back to raw pay
- Confirmation is **money-tier** under the Canonical Data Law — the sub-task mapping is not canonical (and does not surface in the field) until a human clicks **Save & confirm ✓**

## 12. Edge cases and limits
- **Existing jobs must be re-imported once** — leaf lines were not stored before migration 140, so old jobs show categories but no sub-tasks until a re-import
- Deleting a sub-task section never deletes its lines — they **roll back to the parent** category
- Re-importing refreshes budget figures and back-fills missing leaf lines; a changed estimate structure may need the mapping confirmed again
- With **no task completion** logged, the projected margin uses the **manual %** box; with completion logged, the **"Proj." marker** is used instead
- If the Company Cost Model is **not synced**, the gauge fill and Actual use raw pay (no overhead) and will read more favourably than reality
- Nothing in the mapping persists until **Save & confirm ✓** — navigating away discards unsaved reassignments
- The margin gauge targets are fixed: **Labour 25%**, **Material 20%**

## 13. Owner of the process
Director / Admin  
Next review: 2028-01-14

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] Migrations 140, 141, and 142 applied (and 067 for the budget header)
- [ ] Logged in as Director or Admin
- [ ] A carpentry job exists with an estimate XLSX available to import
- [ ] Company Cost Model synced in Settings (so loaded actuals can be verified) — note whether the burn-rate card shows "synced"

### Test cases

**TC-01 — Happy path (import → mapping → confirm)**
1. Open Carpentry → the job → **Budget** tab
2. Click **Import estimate XLSX** (top-right) and select the estimate file
3. Expected UI: budget categories appear and each category can be expanded to sub-task sections grouped by `canonical_key`
4. Expand a category, reassign one line via its dropdown, then click **Save & confirm ✓**
5. Expected UI: the confirmation succeeds and the mapping holds on reload
6. Expected API: `POST /api/carpentry/jobs/:id/budget/seed` on import; `POST /api/carpentry/jobs/:id/budget/line-items` (confirm) on save
7. Expected DB: rows in `carpentry_job_budgets` and `carpentry_budget_line_items` for the job; the reassigned line's sub-task/`canonical_key` is updated and its confirmed flag is set
- [ ] Pass  [ ] Fail

**TC-02 — Empty / missing estimate file**
1. Click **Import estimate XLSX** and cancel the picker (or select an empty/non-estimate file)
2. Expected result: a plain-English error or no-op; no partial budget is created
3. Expected DB: no new `carpentry_budget_line_items` rows from the aborted import
- [ ] Pass  [ ] Fail

**TC-03 — Re-import (duplicate-safe)**
1. Complete TC-01
2. Click **Import estimate XLSX** again with the same file
3. Expected result: budget figures refresh; the previously confirmed mapping is **not** silently wiped (line items are back-filled, not duplicated wholesale)
4. Expected DB: no runaway duplication of `carpentry_budget_line_items` for the same leaf lines
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Log out and log in as a site worker / non-admin role
2. Attempt to open the carpentry job's Budget tab (or call `GET /api/carpentry/jobs/:id/budget` directly)
3. Expected result: the Budget tab / endpoint is not accessible (hidden, 401, or 403)
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (mapping gates the field task list)**
1. Complete TC-01 (mapping confirmed)
2. Call `GET /api/worker/jobs/:id/subtasks` for the same job
3. Expected: the confirmed sub-tasks are returned (they are what the Worker app will show — see SOP 14-04)
4. Now delete a sub-task section (× ) and confirm again; re-call the subtasks endpoint
5. Expected DB: the deleted section's lines have rolled back to the parent (no orphaned `carpentry_budget_line_items`); the subtasks endpoint no longer returns the deleted sub-task
- [ ] Pass  [ ] Fail

**TC-06 — Margin gauge uses loaded cost, not estimate cost**
1. With the Cost Model **synced**, log at least one timesheet against a sub-task (SOP 14-04) and note the gauge fill
2. Expected: the fill reflects **loaded** cost (pay + overheads), not the estimate's cost figure
3. Toggle/observe with the Cost Model **not synced** (or on a job where it isn't): the fill should fall back to raw pay and read more favourably
4. Expected: the burn-rate card reflects the synced/not-synced state
- [ ] Pass  [ ] Fail

**TC-07 — Projected margin threshold colouring**
1. On a category, log enough loaded cost (or set the manual %) so projected margin drops below target (25% labour / 20% material)
2. Expected UI: the **Proj. margin** cell turns amber/red for that category
3. Reduce the cost / raise % complete so projected margin is back above target
4. Expected UI: the cell returns to its normal (non-alarm) colour
- [ ] Pass  [ ] Fail

**TC-08 — Nothing persists before confirm**
1. Expand a category, reassign a line via the dropdown, but do **not** click Save & confirm
2. Navigate away and back to the Budget tab
3. Expected: the reassignment is gone (local-only change discarded); DB `canonical_key` for that line is unchanged
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Import seeds both categories and sub-task line items from the estimate's leaf lines
- [ ] Sub-task mapping only persists (and only surfaces in the field) after Save & confirm ✓
- [ ] Deleting a sub-task section rolls its lines back to the parent (no orphans)
- [ ] Margin gauge fill uses loaded cost when the Cost Model is synced
- [ ] Proj. margin cell colours amber/red below target
- [ ] Wrong-role access is blocked
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
