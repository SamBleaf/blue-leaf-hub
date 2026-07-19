---
sop_version: 1.0
last_reviewed: 2026-07-14
app_version: main
screenshot_status: placeholders_only
owner: Director / Admin
test_status: untested
---

# SOP 14-04: Logging Time Against Sub-tasks (Worker app)

**Module:** Cost Intelligence — Earned-Value Costing  
**SOP ID:** 14-04  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Site workers and leading hands logging their hours on the **Worker app** (the phone PWA). No office access or admin role is needed — anyone rostered on site logs their own time here.

## 2. When to use it
- At the end of a work day (or as you go) to record what you worked on and for how long
- Whenever a carpentry job wants time split by **sub-task** (e.g. wall framing vs truss/roof framing) rather than just by main category
- On any site — sub-tasks appear automatically where the office has set them up; everywhere else you log exactly as you always have

## 3. What this does
Lets you record your hours against the actual task you did, not just the broad category. On a carpentry job where the office has confirmed sub-tasks, tapping a main category (like "First fix / framing") opens a short list of the real tasks under it, and you pick the one you worked on (like "Wall framing"). That extra detail is what lets the office see the true cost of each task type. Where no sub-tasks have been set up, nothing changes — you log at category level the same way as before.

## 4. Before you start
- The Worker app is installed / open and you are signed in
- You know the **day** and the **site** you worked on
- For sub-tasks to appear, the office must have **confirmed the sub-task mapping** on that carpentry job's Budget tab (SOP 14-03). If they haven't, that category logs at category level.
- Builder (non-carpentry) sites always log at category level — they have no sub-tasks

## 5. Step-by-step process

1. Open the Worker app and go to **Log hours**
2. Pick the **day** you are logging
3. Pick the **site** you worked on
4. Tap **Add what you worked on** — the 8 main categories appear
5. Tap the category you worked in:
   - **If the carpentry job has confirmed sub-tasks for that category:** a chooser opens (e.g. *"First fix / framing — pick the task"*). You **must** pick the sub-task you did (e.g. **Wall framing**) — the category can't be logged on its own, and the app won't let you submit until a sub-task is chosen. This is what attributes your hours to the right budget sub-task (mig 147).
   - **If the category has no confirmed sub-tasks:** it is added at category level, exactly as before — no extra step.
6. Enter your **hours** for that entry
7. Repeat for each thing you worked on. If you did **two sub-tasks under the same parent** (e.g. Wall framing *and* Truss framing), add them as **two separate entries** — do not roll them into one
8. Submit / save your timesheet for the day

> 💡 **Tip:** If you expected a task chooser and it did not appear, that category has no confirmed sub-tasks yet — log it at category level and let the office know if it should be split.

[insert screenshot: Log hours screen with day + site picked and the "Add what you worked on" button]
[insert screenshot: the 8 main categories list]
[insert screenshot: the sub-task chooser ("First fix / framing — pick the task") with Wall framing highlighted]

## 6. What happens next
- Each entry is saved as a timesheet line. When you picked a sub-task, the line carries a `budget_line_item_id` linking it to that sub-task on the job's budget
- The office sees your hours against the sub-task on the job's **Budget** tab, where it lands as **loaded** actual cost against the margin gauge (SOP 14-03)
- The chosen sub-task shows in the **Task** column on the Approvals screen so the office can approve without expanding each row (SOP 14-05)
- Once the job is complete, the sub-task time feeds the **Pricing Intelligence** board (SOP 14-05)
- Nothing you log here is client-facing

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Two sub-tasks logged as one entry | Trying to save taps | Log each sub-task as its own entry — combining them hides the true cost of each task type |
| Picking the wrong sub-task | Similar names in the chooser | Read the task name before tapping; if you pick wrong, correct the entry before submitting |
| Expecting sub-tasks on every site | Builder sites and un-mapped categories have none | Sub-tasks only appear where the office has confirmed them on a carpentry job — otherwise log at category level (this is normal) |
| Logging against the wrong site | The wrong site was picked at the top | Check the day + site at the top of the screen before adding entries |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| No task chooser appears on a carpentry job | The office has not confirmed the sub-task mapping yet | The category logs at category level for now; ask the office to confirm the mapping (SOP 14-03) |
| The chooser is empty | Sub-tasks were set up but then deleted/rolled back to the parent | Log at category level; the office may need to re-confirm the mapping |
| My sub-task hours don't show in the office totals | The timesheet wasn't submitted, or was later reassigned | Confirm you submitted the day; check with the office whether it was reassigned on approval |
| Categories look different than last week | The office added or confirmed sub-tasks | This is expected — pick the specific task that matches what you did |

## 9. Related modules
- [Carpentry Budget, Sub-task Mapping & Margin Gauge](cost_intel_carpentry_budget_margin.md) — SOP 14-03 (the office confirms the sub-tasks you see here)
- [Pricing Intelligence & Approvals task view](cost_intel_pricing_intelligence.md) — SOP 14-05 (where your sub-task hours are approved and analysed)
- [Workforce overview](../10_workforce/workforce_overview.md) — SOP 10-01
- [Add a photo when completing a site task](../10_workforce/add_completion_photo.md) — SOP 10-03

## 10. Screenshot placeholders
[insert screenshot: Worker app Log hours — day + site selected]
[insert screenshot: the 8 main categories under "Add what you worked on"]
[insert screenshot: sub-task chooser for a category with confirmed sub-tasks]
[insert screenshot: a submitted day showing two separate sub-task entries under one parent category]

## 11. Automation notes
- API endpoints:
  - `GET /api/worker/jobs/:id/subtasks` — returns the confirmed sub-tasks for a job/category; drives the chooser. Returns nothing (log at category level) when the office has not confirmed a mapping
  - `POST /api/worker/timesheets` — saves the timesheet entries; when a sub-task was chosen the entry carries `budget_line_item_id`
- The `budget_line_item_id` links the hours to `carpentry_budget_line_items` (migration 140), which is what surfaces the hours against the sub-task on the office Budget tab (`carpentry_job_costs.carpentry_budget_line_item_id`, migration 142)
- Sub-tasks only appear after the office confirms the mapping (SOP 14-03) — the confirmed flag is the gate
- Builder (non-carpentry) sites have no sub-tasks and always log at category level

## 12. Edge cases and limits
- **Un-mapped categories log at category level** — the entry simply has no `budget_line_item_id`; this is valid and expected
- **Two sub-tasks under one parent are separate entries** — the app does not collapse them; logging them as one loses per-task cost
- If the office **deletes** a sub-task after you logged against it, the reassignment happens on their side (line rolls back to the parent); your hours are not lost
- The chooser only lists **confirmed** sub-tasks for the **specific category** tapped — it will not show sub-tasks from other categories
- Builder sites and any carpentry job without a confirmed mapping behave exactly as before this feature (no regression)

## 13. Owner of the process
Director / Admin (the office owns the sub-task mapping; workers own their own hours)  
Next review: 2028-01-14

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** This section contains every test that must be executed to verify this feature works correctly. Run these tests in order. Record pass/fail against each item. If any test fails, document the failure and do not mark `test_status: passed` in the frontmatter.

### Pre-test setup
- [ ] A carpentry job with a **confirmed** sub-task mapping exists (set up via SOP 14-03) — at least one category with two sub-tasks under one parent
- [ ] A second carpentry job (or a builder site) with **no** confirmed sub-tasks, for the category-level path
- [ ] Signed in to the Worker app as a site worker
- [ ] Migrations 140 and 142 applied

### Test cases

**TC-01 — Happy path (log against a sub-task)**
1. Open Worker app → **Log hours**; pick the day and the carpentry site with confirmed sub-tasks
2. Tap **Add what you worked on** → tap the category that has sub-tasks (e.g. "First fix / framing")
3. Expected UI: the sub-task chooser opens ("… — pick the task")
4. Tap a sub-task (e.g. **Wall framing**), enter hours, and submit
5. Expected API: `GET /api/worker/jobs/:id/subtasks` returned the sub-tasks; `POST /api/worker/timesheets` was called
6. Expected DB: the timesheet entry carries `budget_line_item_id` for the chosen sub-task
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field (no hours)**
1. Start a sub-task entry as in TC-01 but leave **hours** blank
2. Attempt to submit
3. Expected result: a validation prompt for hours; the entry is not saved
4. Expected DB: no timesheet line created for the blank entry
- [ ] Pass  [ ] Fail

**TC-03 — Two sub-tasks under one parent stay separate**
1. Log **Wall framing** (2h) and **Truss framing** (3h) under the same parent category, as two entries
2. Submit
3. Expected UI: two distinct entries shown, not merged
4. Expected DB: two timesheet lines, each with its own `budget_line_item_id`; hours not summed into one line
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role / not the worker**
1. Confirm the sub-task log flow is only reachable inside the authenticated Worker app
2. Call `POST /api/worker/timesheets` with no auth
3. Expected result: 401 (worker endpoints require worker auth); no timesheet created
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (office sees the sub-task)**
1. Complete TC-01
2. In the office, open the job's **Budget** tab
3. Expected: the logged hours appear as **actual** against the chosen sub-task and move the margin gauge fill
4. Open Workforce → Timesheets → **Approvals**
5. Expected: the **Task** column shows the chosen sub-task (e.g. Wall framing), not just the main category (SOP 14-05)
- [ ] Pass  [ ] Fail

**TC-06 — Category with no confirmed sub-tasks logs at category level**
1. On the job/site with **no** confirmed mapping, tap a category under "Add what you worked on"
2. Expected UI: **no** chooser opens — the category is added directly (category-level, as before)
3. Enter hours and submit
4. Expected DB: the timesheet line has **no** `budget_line_item_id` (null)
- [ ] Pass  [ ] Fail

**TC-07 — Sub-tasks only appear after office confirmation**
1. On a carpentry job where the mapping was seeded but **not** confirmed, tap the relevant category
2. Expected: no chooser (category-level logging), because `GET /api/worker/jobs/:id/subtasks` returns nothing until confirmation
3. Have the office confirm the mapping (SOP 14-03), reload, and tap the category again
4. Expected: the chooser now appears
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Sub-task chooser appears only for categories with a confirmed mapping
- [ ] A sub-task entry saves with `budget_line_item_id`; category-level entries save with none
- [ ] Two sub-tasks under one parent are stored as separate lines
- [ ] Hours surface against the sub-task on the office Budget tab and the Approvals Task column
- [ ] Unauthenticated worker API calls return 401
- [ ] No console errors observed during testing
- [ ] No unexpected network errors (check browser devtools Network tab)
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
