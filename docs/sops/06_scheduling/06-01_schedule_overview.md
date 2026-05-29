---
sop_version: 1.0
last_reviewed: 2026-05-29
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

## 4. How to open Schedule Manager

1. Select a project from the project selector (top of the app)
2. Navigate to **Operations Manager** in the sidebar
3. Click **Schedule** in the Operations sub-navigation
4. The schedule for the selected project loads

## 5. Colour coding — what it means

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
- 🟢 Grey + green progress bar = Complete (≥100%)
- 🔴 Red background = Overdue (past end date, not complete)
- 🟡 Amber background = Critical path task

## 6. What the Schedule Dashboard shows

The Schedule Dashboard (top section when you open Schedule) shows:
- Phase progress bars
- Days remaining until practical completion
- Count of overdue and at-risk tasks
- Procurement status

## 7. Related SOPs
- [Generate a schedule with AI](06-02_generate_schedule.md) — SOP 06-02
- [Edit a schedule](06-03_edit_schedule.md) — SOP 06-03
- [Lock a baseline](06-04_baseline_lock.md) — SOP 06-04
- [Extension of Time (EOT)](06-05_eot.md) — SOP 06-05
- [Dependency Map](06-06_dependency_map.md) — SOP 06-06

## 8. Automation notes
- Dashboard data: `GET /api/schedule/:projectId/dashboard`
- Full schedule (tasks): `GET /api/schedule/:projectId`
- Tasks are stored in `schedule_tasks` with `project_id`, `phase`, `start_date`, `end_date`, `duration_days`, `pct_complete`, `depends_on` (array), `baseline_start_date`, `baseline_end_date`

## 9. Owner of the process
Admin / Staff  
Next review: 2026-11-29

---

## 10. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least 1 project exists with a schedule generated
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
3. Expected: the same tasks appear in each view (Sheet shows the same tasks as Gantt)
- [ ] Pass  [ ] Fail

**TC-03 — Colour coding is consistent**
1. Identify a task in the "Frame" phase on the Gantt
2. Check the same task in the Sheet view
3. Expected: same phase colour (orange) in both views
- [ ] Pass  [ ] Fail

**TC-04 — Dashboard metrics make sense**
1. Open the Schedule Dashboard
2. Expected: "Days to PC" shows a positive number (unless PC has passed)
3. Expected: phase progress bars show percentages 0–100%
4. Expected: no NaN or null values visible to the user
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All 4 tabs load
- [ ] Colour coding consistent
- [ ] Dashboard metrics display correctly
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
