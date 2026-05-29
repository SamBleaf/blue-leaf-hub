---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: placeholders_only
owner: Admin
test_status: static_pass
---

# SOP 05-01: View the Operations Dashboard

**Module:** Operations Manager  
**SOP ID:** 05-01  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
All staff (Admin, Supervisor)

## 2. When to use it
Daily, to see the health of every active project at a glance — progress, overdue tasks, the next milestone, and which trades are currently on site.

## 3. What this does
Lists all projects as cards (or a list) with a live schedule health badge, overall progress percentage, the next upcoming milestone, and the currently active trades. It's the landing page for the Operations module.

## 4. Before you start
- You are logged in (any staff role)
- Projects exist with schedules

## 5. Step-by-step process

1. Go to **Operations** in the sidebar
2. The project list loads, newest first
3. Each project card shows:
   - Address and status
   - **Health badge** — 🟢 green / 🟡 amber / 🔴 red (based on overdue task count)
   - **Progress** — overall % complete across all tasks
   - **Next milestone** — the next upcoming hold point or milestone
   - **Active trades** — trades with tasks currently in progress
4. Click a project to open its detail (SOP 05-02)
5. Use the global Gantt link to see all projects on one timeline (SOP 05-05)

## 6. What happens next

- The dashboard is read-only — viewing changes nothing
- Health is computed live: 🔴 red if 4+ overdue tasks, 🟡 amber if 1–3 overdue, 🟢 green if none
- Progress = average `percent_complete` across the project's non-deleted tasks

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Reading a red badge as "broken" | Misunderstanding | Red means 4+ overdue tasks — open the project to see which tasks slipped |
| Expecting financials here | Wrong module | This is operational health; financials are in the Finance module |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Supabase not configured" (503) | Server env vars missing — contact Admin |
| A project shows 0% but has tasks | Tasks may be soft-deleted (`deleted_at`) or have no `percent_complete` set |
| Health badge seems wrong | Badge is driven by overdue count — check task end dates vs today |

## 9. Related modules
- [Open a project in operations](operations_open_project.md) — SOP 05-02
- [View the global Gantt](operations_global_gantt.md) — SOP 05-05

## 10. Screenshot placeholders
[insert screenshot: operations project list with health badges]

## 11. Automation notes
- API: `GET /api/operations/projects` (requires auth)
- Returns `{ ok: true, projects: [...] }` where each project is enriched with `schedule: { total, done, overdue, overall, nextMilestone, activeTrades, health }`
- Health rule: `overdue >= 4 → "red"`, `overdue >= 1 → "amber"`, else `"green"`
- Tasks read from `schedule_tasks` where `deleted_at IS NULL`
- Overdue = `percent_complete < 100 AND end_date < today`
- Next milestone = earliest future task where `task_type = 'milestone'` or `is_hold_point` and not complete

## 12. Edge cases and limits
- Projects with no tasks show 0% progress and green health (no overdue tasks)
- Soft-deleted tasks are excluded from all counts
- Active trades = distinct trades on tasks with `0 < percent_complete < 100`

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in (any staff role)
- [ ] At least 2 projects, one with overdue tasks, one without

### Test cases

**TC-01 — Dashboard loads (happy path)**
1. Navigate to Operations
2. Expected: project cards render with health, progress, next milestone, active trades
3. Expected: `GET /api/operations/projects` returns `{ ok: true, projects: [...] }`
- [ ] Pass  [ ] Fail

**TC-02 — Health badge: green (no overdue)**
1. Open a project with no overdue tasks
2. Expected: 🟢 green health badge
- [ ] Pass  [ ] Fail

**TC-03 — Health badge: red (4+ overdue)**
1. View a project with 4 or more tasks past their end date and < 100% complete
2. Expected: 🔴 red health badge
- [ ] Pass  [ ] Fail

**TC-04 — Unauthenticated request rejected**
1. Call `GET /api/operations/projects` without an auth token
2. Expected: rejected (401/redirect) — endpoint requires auth
- [ ] Pass  [ ] Fail

**TC-05 — Progress calculation**
1. Open a project where tasks average ~50% complete
2. Expected: overall progress shows ~50%
3. Expected: soft-deleted tasks excluded from the average
- [ ] Pass  [ ] Fail

**TC-06 — Next milestone surfaces correctly**
1. Open a project with an upcoming milestone/hold point
2. Expected: the earliest future incomplete milestone is shown as "next milestone"
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Dashboard loads with enriched schedule data
- [ ] Health badge logic correct (green/amber/red)
- [ ] Progress excludes deleted tasks
- [ ] Auth required
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
