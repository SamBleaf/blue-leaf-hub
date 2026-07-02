---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin / Staff
test_status: static_pass
---

# SOP 06-03: Edit a Schedule

**Module:** Operations → Schedule Manager → Gantt / Sheet  
**SOP ID:** 06-03  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Staff (project managers)

## 2. When to use it
When individual task dates, durations, phases, or completion percentages need updating. Use this instead of regenerating the whole schedule when only specific tasks need adjustment.

## 3. What this does
Allows you to update any field on a schedule task — name, phase, dates, duration, completion percentage, notes — without replacing the whole schedule. Supports four editing methods: task detail panel, drag and drop, right-edge resize, and Sheet inline editing.

## 4. Before you start
- A project with a generated schedule must exist
- If the baseline is locked, drag and drop is disabled; use the task detail panel to edit dates, or unlock the baseline first (SOP 06-04)
- Check the Dep Map (SOP 06-06) before deleting a task that other tasks may depend on

## 5. Step-by-step process

### Option A — Edit via Task Detail (most fields)
1. On the Gantt: right-click a task bar → click **Open detail**
2. Or on the Sheet: click the task row to open its detail panel
3. A panel slides in from the right showing all task fields
4. Edit any field: name, phase, start date, end date, duration, completion %, notes
5. Click **Save**

### Option B — Drag and drop (date shifting, Gantt only)
1. On the Gantt: click and hold the task bar (not the right edge)
2. Drag left or right to change the start date
3. Release — the task date updates immediately
4. A ripple cascade preview appears if dependent tasks would be affected (see SOP 06-08)

### Option C — Right-edge resize (duration, Gantt only)
1. On the Gantt: hover over the right edge of a task bar until the resize cursor (←→) appears
2. Click and drag left (shorter) or right (longer) to change the duration
3. Release — the end date updates accordingly
4. If the task has dependents, a ripple cascade preview appears

### Option D — Sheet view inline editing
1. On the Sheet tab: click directly into a cell to edit it inline
2. Editable fields: name, start date, end date, duration, completion %
3. Press Enter or Tab to save

### Adding a new task
1. In the Sheet view, click **+ Add task** or the add row button at the bottom of a phase section
2. Fill in: name (required), phase, start date, end date
3. Duration is calculated automatically from start and end date
4. Save

### Deleting a task
1. Right-click the task in the Gantt → **Delete**
2. Or in the Sheet: use the row actions menu → Delete
3. Deletion is a soft-delete (`deleted_at` set) — tasks are not permanently removed

### Updating completion percentage
1. Open the task detail (right-click → Open detail, or click in Sheet)
2. Set the **Completion %** slider or number field (0–100)
3. Save
4. A task at 100% shows as complete (grey background + green progress bar)

## 6. What happens next
After saving an edit:
- The Gantt and Sheet update immediately to reflect the new values
- If the task has dependents, the ripple cascade preview may appear — review and confirm or cancel (SOP 06-08)
- The Dashboard recalculates phase progress and days-to-PC automatically on the next page load

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Changing a task that has dependents without checking the ripple | Editing quickly | Always watch for the ripple cascade preview — it shows which tasks will be affected |
| Setting end_date before start_date | Data entry error | The system will warn or recalculate duration — check the dates are logical |
| Deleting a task that other tasks depend on | Didn't check dependencies | Check the Dep Map (SOP 06-06) before deleting a task |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Changes not saving | Check network connection; the PATCH call should complete within 2 seconds |
| Drag and drop not working in Gantt | Check if the baseline is locked — locked schedules disable drag and drop; unlock first or use task detail |
| Task appears in wrong phase in Gantt | The phase field on the task controls which colour group it appears in — open task detail and update the phase |

## 9. Related modules
- [Schedule Manager overview](06-01_schedule_overview.md) — SOP 06-01
- [Lock a baseline](06-04_baseline_lock.md) — SOP 06-04
- [Dependency Map](06-06_dependency_map.md) — SOP 06-06
- [Drag and resize tasks](06-07_drag_resize.md) — SOP 06-07
- [Ripple cascade](06-08_ripple_cascade.md) — SOP 06-08

## 10. Screenshot placeholders
- [ ] Task detail panel (slide-in from right) with all editable fields visible
- [ ] Gantt task bar mid-drag showing date tooltip
- [ ] Right-edge resize cursor on a task bar
- [ ] Sheet view with an inline edit cell active

## 11. Automation notes
- Edit task: `PATCH /api/schedule/task/:id` — accepts any subset of task fields
- For drag/drop: sends `{ start_date, end_date, duration_days }` in the PATCH
- For resize: if `newStartDate === task.start_date`, it's a resize — sends `{ end_date, duration_days }`; otherwise it's a drag — sends `{ start_date, end_date }`
- Delete: `DELETE /api/schedule/task/:id` — sets `deleted_at = now()`, NOT a hard delete
- Add task: `POST /api/schedule/:projectId/task`

## 12. Edge cases and limits
- Setting `pct_complete = 100` visually marks the task as complete but does not lock it — it can still be edited
- Duration is always recalculated server-side as `daysBetween(start_date, end_date) + 1` on save; manual `duration_days` values are overridden
- If a task has no dependents, no ripple modal appears after drag/resize — changes apply immediately
- Sheet inline editing may not be available for all fields; use the task detail panel for phase changes

## 13. Owner of the process
Admin / Staff  
Next review: 2026-12-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A project exists with a generated schedule
- [ ] At least 5 tasks visible in the Gantt
- [ ] Baseline is NOT locked

### Test cases

**TC-01 — Edit task via task detail**
1. Right-click a task in the Gantt → Open detail
2. Change the task name to "Edited Task Name"
3. Change completion % to 50
4. Click Save
5. Expected: Gantt bar reflects 50% progress fill
6. Expected DB: `schedule_tasks` row updated with new name and `percent_complete = 50`
- [ ] Pass  [ ] Fail

**TC-02 — Drag task in Gantt**
1. Click and drag a task bar 7 days to the right
2. Expected: bar moves visually and date updates
3. Expected DB: `start_date` and `end_date` both shifted by 7 days
4. Expected: `duration_days` unchanged (it's a move, not a resize)
- [ ] Pass  [ ] Fail

**TC-03 — Resize task in Gantt**
1. Hover over the right edge of a task bar
2. Drag right to extend duration by 5 days
3. Expected: bar stretches
4. Expected DB: `end_date` extended by 5 days; `start_date` unchanged; `duration_days` increased by 5
- [ ] Pass  [ ] Fail

**TC-04 — Complete task shows correct styling**
1. Set a task's completion to 100% via task detail
2. Expected: task bar shows grey background with green progress fill in Gantt
3. Expected: Sheet view shows a completion indicator (green dot or similar) for this task
- [ ] Pass  [ ] Fail

**TC-05 — Soft delete — task not permanently gone**
1. Right-click a task → Delete
2. Expected: task disappears from Gantt and Sheet views
3. Expected DB: `schedule_tasks` row has `deleted_at` set (NOT deleted from DB)
- [ ] Pass  [ ] Fail

**Feature case — Add a new task via Sheet view**
1. Navigate to the Sheet tab
2. Click "+ Add task" at the bottom of any phase section
3. Fill in: name = "Test New Task", phase = "frame", start date = today, end date = today + 5 days
4. Save
5. Expected: new task appears in the Sheet with 6 days duration
6. Expected: new task also appears in the Gantt view in the correct phase colour (orange for frame)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Task edits save to DB correctly
- [ ] Drag and resize update the correct fields
- [ ] Deletion is soft (deleted_at set, row not gone)
- [ ] Completion % styling works in Gantt and Sheet
- [ ] Add task flow works end-to-end
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
