---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: placeholders_only
owner: Admin
test_status: static_pass
---

# SOP 05-05: View the Global Gantt Across All Projects

**Module:** Operations Manager → Global Gantt  
**SOP ID:** 05-05  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Admin, Supervisor

## 2. When to use it
When you need to see every active project's schedule on a single timeline — to spot clashes, plan trade movements between sites, and understand the whole pipeline at once.

## 3. What this does
Shows all projects and all their (non-deleted) schedule tasks on one combined Gantt timeline, colour-coded by project, filterable by trade. It's the cross-project view that the per-project schedule (SOP 06-01) cannot give you.

## 4. Before you start
- You are logged in
- Projects have schedules with tasks

## 5. Step-by-step process

1. Go to **Operations** (`/operations`)
2. Scroll to the **All Projects — Schedule** panel (collapsible global Gantt section on the dashboard — not a separate route)
3. Expand the panel if collapsed — all projects' tasks load onto one timeline, ordered by start date
4. Use the **trade filter** to show only one trade across all sites (e.g. all "Concrete" tasks everywhere)
5. Use the **month zoom** to widen or narrow the time window
6. Each bar is colour-coded by project so you can tell sites apart
7. To edit a task, open that project's schedule from the project card (SOP 06-03) — the global panel is read-only aggregation

> **Note:** A conflict badge on this panel links to the trade-conflict banner (SOP 05-06).

## 6. What happens next

- The view is read-only — it aggregates data, it doesn't change it
- Tasks come from `schedule_tasks` where `deleted_at IS NULL`, ordered by start date
- This is the input to trade conflict detection (SOP 05-06)

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Reading it as one project | Bars look similar | Use the project colour coding and the trade filter to separate sites |
| Expecting edits here | Wrong view | Edit tasks in the per-project schedule (SOP 06-03), not the global view |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Supabase not configured" (503) | Server env vars missing |
| A project's tasks missing | Tasks may be soft-deleted, or the project has no schedule yet |
| Timeline too dense | Apply a trade filter or narrow the month zoom |

## 9. Related modules
- [Identify trade conflicts across projects](operations_trade_conflicts.md) — SOP 05-06
- [Schedule Manager overview](../06_scheduling/06-01_schedule_overview.md) — SOP 06-01

## 10. Screenshot placeholders
[insert screenshot: global Gantt with multiple projects]
[insert screenshot: trade filter applied]

## 11. Automation notes
- API: `GET /api/operations/global-tasks` (requires auth) → `{ ok: true, projects: [...], tasks: [...] }`
- Projects: `id, address`
- Tasks: `id, project_id, name, phase, start_date, end_date, percent_complete, task_type, is_hold_point, assignee_trade, trade` where `deleted_at IS NULL`, ordered by `start_date` ascending
- Colour coding by project handled client-side

## 12. Edge cases and limits
- Tasks with no start date sort last (nullsFirst: false)
- Soft-deleted tasks are excluded
- The endpoint returns ALL tasks across ALL projects — large portfolios produce large payloads; filtering is client-side

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in
- [ ] At least 2 projects with schedule tasks

### Test cases

**TC-01 — Global Gantt loads (happy path)**
1. Open the Global Gantt
2. Expected: tasks from multiple projects render on one timeline
3. Expected: `GET /api/operations/global-tasks` returns `{ ok: true, projects, tasks }`
- [ ] Pass  [ ] Fail

**TC-02 — Tasks ordered by start date**
1. Inspect the returned tasks
2. Expected: ordered ascending by `start_date`, null start dates last
- [ ] Pass  [ ] Fail

**TC-03 — Soft-deleted tasks excluded**
1. Soft-delete a task (set `deleted_at`) in one project
2. Reload the global Gantt
3. Expected: that task no longer appears
- [ ] Pass  [ ] Fail

**TC-04 — Trade filter**
1. Apply a trade filter (e.g. Concrete)
2. Expected: only tasks with that `assignee_trade`/`trade` show across all projects
- [ ] Pass  [ ] Fail

**TC-05 — Auth required**
1. Call the endpoint without auth
2. Expected: rejected (401/redirect)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Global Gantt aggregates all projects
- [ ] Ordering correct
- [ ] Deleted tasks excluded
- [ ] Trade filter works
- [ ] Auth required
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
