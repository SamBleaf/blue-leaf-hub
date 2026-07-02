---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin / Staff
test_status: static_pass
---

# SOP 06-01: Schedule Manager — Overview

**Module:** Operations → Schedule Manager  
**SOP ID:** 06-01  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Staff (project managers, directors)

## 2. When to use it
Every time you need to view, manage, or update a construction schedule for an active project. The Schedule Manager is the source of truth for all construction timelines.

## 3. What this does
The Schedule Manager shows the full construction timeline for a project across four views:

| Tab | What it shows |
|-----|--------------|
| **Gantt** | Bar chart timeline — tasks as horizontal bars, drag and resize to edit dates |
| **Sheet** | Spreadsheet-style list — all tasks with start/end dates, duration, phase, completion % |
| **Delays** | Extension of Time (EOT) claims — raised, approved, applied delays |
| **Dep Map** | Dependency Map — network diagram showing task relationships |

## 4. Before you start
- At least one project must exist in the system
- The project should have a schedule generated (SOP 06-02) before the Schedule Manager shows meaningful data
- Log in as Admin or Staff

## 5. Step-by-step process

**Opening Schedule Manager:**
1. Select a project from the project selector (top of the app)
2. Navigate to **Operations Manager** in the sidebar
3. Click **Schedule** in the Operations sub-navigation
4. The schedule for the selected project loads in the Gantt view by default

**Switching views:**
1. Click the tab labels — **Gantt**, **Sheet**, **Delays**, **Dep Map** — to switch between views
2. All four views show the same underlying task data; only the presentation changes

**Reading the colour coding:**

Tasks are colour-coded by construction phase. The same colours appear in all four views.

| Colour | Phase |
|--------|-------|
| Slate | Pre-construction |
| Brown | Site prep |
| Warm grey | Site / Slab |
| Orange | Frame |
| Deep blue | Roofing |
| Teal | Lock-up |
| Amber | Rough-in |
| Lime | Insulation |
| Purple | Wall lining |
| Rose | Painting |
| Sky | Fitout |
| Amber-brown | Floor coverings |
| Emerald | Completion |

**Status modifiers** (override phase colour):
- Grey + green progress bar = Complete (100%)
- Red background = Overdue (past end date, not complete)
- Amber background = Critical path task

## 6. What happens next
After opening Schedule Manager you will see the Gantt view with all tasks loaded. From here you can:
- Generate a schedule if none exists (SOP 06-02)
- Edit tasks by dragging, resizing, or opening the task detail panel (SOP 06-03)
- Lock a baseline once the programme is finalised (SOP 06-04)
- Raise an EOT if a delay event occurs (SOP 06-05)
- Review task dependencies in the Dep Map (SOP 06-06)

The Schedule Dashboard (top section) shows:
- Phase progress bars
- Days remaining until practical completion
- Count of overdue and at-risk tasks
- Procurement status

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Looking at the wrong project | Multiple projects open in different tabs | Always confirm the project name shown in the header before editing anything |
| Expecting colour coding in the Sheet view to match exact Gantt bar colours | Different rendering | Both views use the same phase colour system — small rendering differences are normal |
| Confusing the Dashboard "Days to PC" with the project contract end date | Different fields | "Days to PC" is calculated from the last task's end date in the schedule, not the contract date |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Schedule Manager shows "No schedule" | Navigate to the Gantt tab and click Generate Schedule (SOP 06-02) |
| Tasks not loading | Check network connection; verify the project has `schedule_tasks` rows in DB |
| Colour coding missing (all grey) | The task `phase` field may be blank — open each task and set the phase |
| "Days to PC" shows NaN or negative | All tasks may be marked complete, or the schedule hasn't been generated |

## 9. Related modules
- [Generate a schedule with AI](06-02_generate_schedule.md) — SOP 06-02
- [Edit a schedule](06-03_edit_schedule.md) — SOP 06-03
- [Lock a baseline](06-04_baseline_lock.md) — SOP 06-04
- [Extension of Time (EOT)](06-05_eot.md) — SOP 06-05
- [Dependency Map](06-06_dependency_map.md) — SOP 06-06
- [Drag and resize tasks](06-07_drag_resize.md) — SOP 06-07
- [Ripple cascade](06-08_ripple_cascade.md) — SOP 06-08

## 10. Screenshot placeholders
- [ ] Schedule Manager — Gantt view with colour-coded tasks (full project)
- [ ] Schedule Manager — Sheet view showing same tasks as Gantt
- [ ] Schedule Dashboard — phase progress bars and "Days to PC"
- [ ] Tab row — Gantt / Sheet / Delays / Dep Map

## 11. Automation notes
- Dashboard data: `GET /api/schedule/:projectId/dashboard`
- Full schedule (tasks): `GET /api/schedule/:projectId`
- Tasks are stored in `schedule_tasks` with `project_id`, `phase`, `start_date`, `end_date`, `duration_days`, `percent_complete`, `depends_on` (array), `baseline_start_date`, `baseline_end_date`
- Phase labels are loaded from `GET /api/schedule/meta/:projectId` → `phaseLabels`

## 12. Edge cases and limits
- A project with no tasks shows an empty Gantt and a "Generate Schedule" prompt
- If all tasks are complete, "Days to PC" shows 0 or a negative number (project finished)
- Projects with more than ~200 tasks may see slower Gantt rendering — no hard limit enforced
- The Schedule Manager requires a project to be selected; navigating to `/operations/schedule` without a project ID redirects to the project list

## 13. Owner of the process
Admin / Staff  
Next review: 2026-12-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least 1 project exists with a schedule generated (at least 5 tasks)
- [ ] Logged in as Admin

### Test cases

**TC-01 — Schedule Manager loads**
1. Select a project with a schedule
2. Navigate to Operations → Schedule
3. Expected: Gantt tab loads with tasks visible
4. Expected: colour-coded bars appear in phase colours
5. Expected: no console errors
- [ ] Pass  [ ] Fail

**TC-02 — Tab switching works**
1. On the Schedule Manager, click each tab: Gantt, Sheet, Delays, Dep Map
2. Expected: each tab loads without error
3. Expected: the same tasks appear in the Gantt and Sheet views
- [ ] Pass  [ ] Fail

**TC-03 — Colour coding is consistent across Gantt and Sheet**
1. Identify a task in the "Frame" phase on the Gantt
2. Check the same task in the Sheet view
3. Expected: same phase colour (orange) in both views
- [ ] Pass  [ ] Fail

**TC-04 — Dashboard metrics make sense**
1. Open the Schedule Dashboard (top of the Schedule Manager)
2. Expected: "Days to PC" shows a number (positive if project is not yet complete)
3. Expected: phase progress bars show percentages 0–100%
4. Expected: no NaN or null values visible to the user
- [ ] Pass  [ ] Fail

**TC-05 — Status modifiers display correctly**
1. Set a task's completion to 100%
2. Observe the Gantt
3. Expected: that task shows grey background with green progress bar
4. Set a task's end date to yesterday and leave completion at 0%
5. Expected: that task shows red background (overdue)
- [ ] Pass  [ ] Fail

**Feature case — Lens / filter chips narrow the task list**
1. In the Gantt toolbar, click a lens filter (e.g. "Delayed")
2. Expected: only tasks matching the filter criterion are shown
3. Click "All" to clear the filter
4. Expected: all tasks return
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All 4 tabs load without error
- [ ] Colour coding consistent across views
- [ ] Dashboard metrics display correctly
- [ ] Status modifiers (complete/overdue) render correctly
- [ ] Lens filter chips work
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
