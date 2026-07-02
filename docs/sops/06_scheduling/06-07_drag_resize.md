---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin / Staff
test_status: static_pass
---

# SOP 06-07: Drag and Resize Tasks in the Gantt

**Module:** Operations → Schedule Manager → Gantt  
**SOP ID:** 06-07  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Admin, Staff

## 2. When to use it
When you need to quickly adjust a task's dates in the Gantt without opening the task detail panel. Faster than editing dates manually for simple moves or duration changes.

**Only available when the baseline is NOT locked.** If the baseline is locked, unlock it first (SOP 06-04) or use the task detail panel to edit dates.

## 3. What this does
Provides two direct-manipulation interactions on Gantt task bars:
- **Drag** — moves the whole task bar left or right, shifting start and end dates by the same number of days while keeping the duration unchanged
- **Resize** — drags the right edge of the bar to extend or shorten the task, changing the end date and recalculating duration

Both interactions fire a PATCH call to update the task in the database and trigger a ripple cascade check if the task has dependent tasks.

## 4. Before you start
- Navigate to Operations → Schedule → Gantt tab
- Confirm the baseline is NOT locked (check for the "Baseline locked" banner — if present, unlock first via SOP 06-04)
- Know the current dates of the task you want to adjust

## 5. Step-by-step process

**Drag (move the whole task):**
1. Click and hold anywhere on the task bar (not the right edge)
2. Drag left or right
3. A date tooltip shows the new start date as you drag
4. Release to confirm — the task moves to the new dates
5. If the task has dependents, a ripple cascade preview appears (SOP 06-08)

What changes in the database:
- `start_date` and `end_date` both shift by the same number of days
- `duration_days` is unchanged

**Resize (change the duration):**
1. Hover over the right edge of the task bar until the cursor changes to a resize arrow (←→)
2. Click and drag right to extend, left to shorten
3. Release to confirm
4. If the task has dependents, a ripple cascade preview appears (SOP 06-08)

What changes in the database:
- `end_date` changes
- `start_date` is unchanged
- `duration_days` is recalculated as the new number of days between start and end

## 6. What happens next
After dragging or resizing:
- The Gantt bar updates immediately to reflect the new position/size
- If the task has dependents, the Ripple Cascade Warning modal appears showing all affected downstream tasks and their projected new dates (SOP 06-08)
- You can confirm the ripple (all dependent tasks shift) or cancel (task reverts to original position)
- If the task has no dependents, the change applies instantly with no modal

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Drag not working | Baseline may be locked | Check the baseline banner — if locked, unlock first (SOP 06-04) |
| Accidentally resizing instead of dragging | Cursor is near the right edge | Move the cursor to the middle of the bar before starting the drag |
| Moving a critical path task without considering downstream effects | Quick edit | Watch for the ripple cascade preview and read the affected task list before confirming |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Task snaps back after release | The PATCH call may have failed — check the browser network tab for an error response |
| Resize cursor (←→) doesn't appear | Hover directly over the right edge of the bar (not the middle or left side) |
| Drag results in an unexpected date | The Gantt timeline zoom level affects precision — zoom in for finer day-by-day control |

## 9. Related modules
- [Edit a schedule](06-03_edit_schedule.md) — SOP 06-03 (task detail panel method for editing dates)
- [Lock a baseline](06-04_baseline_lock.md) — SOP 06-04 (must be unlocked for drag/resize to work)
- [Ripple cascade](06-08_ripple_cascade.md) — SOP 06-08 (what happens to dependent tasks after a drag or resize)

## 10. Screenshot placeholders
- [ ] Gantt task bar mid-drag showing the date tooltip
- [ ] Resize cursor (←→) visible at the right edge of a task bar
- [ ] Ripple Cascade Warning modal after a drag (showing affected downstream tasks)

## 11. Automation notes
- Both drag and resize use `PATCH /api/schedule/task/:id`
- Distinguishing drag from resize (client-side logic in `ScheduleGantt.jsx`): if `newStartDate === task.start_date`, it's a resize — sends only `{ end_date, duration_days }` in the PATCH; otherwise it's a drag — sends `{ start_date, end_date, duration_days }`
- After the PATCH, the `onDateChange` callback fires and triggers a ripple preview check via `POST /api/schedule/:projectId/ripple-check` if the task has `depends_on` entries

## 12. Edge cases and limits
- If the Gantt zoom is set to "Year" or higher, dragging snaps to week boundaries — zoom in to "Month" or "Day" for precise day-level control
- Dragging a task before its start date (into the past) is allowed — the system does not enforce "no past dates" on task updates
- A task with no dependencies never triggers the ripple modal — the PATCH applies directly and the Gantt re-renders
- If the resize cursor does not appear on mobile/tablet, use the task detail panel to edit dates instead

## 13. Owner of the process
Admin / Staff  
Next review: 2026-12-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Project with a generated schedule
- [ ] Baseline is NOT locked
- [ ] At least 2 tasks visible with known dates

### Test cases

**TC-01 — Drag task moves both dates, duration unchanged**
1. Note a task's current `start_date`, `end_date`, and `duration_days`
2. Drag the task bar 5 days to the right
3. Expected: both `start_date` and `end_date` shift 5 days forward
4. Expected: `duration_days` is unchanged
5. Expected DB: verify via `SELECT start_date, end_date, duration_days FROM schedule_tasks WHERE id = '<id>'`
- [ ] Pass  [ ] Fail

**TC-02 — Resize task changes end_date and duration**
1. Note a task's current `start_date`, `end_date`, and `duration_days`
2. Resize the right edge of the task bar to extend by 3 days
3. Expected: `end_date` moves 3 days forward
4. Expected: `start_date` unchanged
5. Expected DB: `duration_days` increased by 3
- [ ] Pass  [ ] Fail

**TC-03 — Drag disabled when baseline is locked**
1. Lock the baseline (SOP 06-04)
2. Attempt to drag a task bar in the Gantt
3. Expected: drag does not work — task stays in its original position
4. Expected: no PATCH call fired to the API
- [ ] Pass  [ ] Fail

**TC-04 — Drag shows date tooltip**
1. Begin dragging a task bar
2. Expected: a tooltip appears showing the new start date as you drag
3. Expected: tooltip updates in real time as you move the cursor left or right
- [ ] Pass  [ ] Fail

**TC-05 — Resize cursor appears on right edge only**
1. Hover over the middle of a task bar
2. Expected: cursor is the default move/grab cursor (not the resize cursor)
3. Hover over the right edge of the task bar
4. Expected: cursor changes to the resize arrow (←→)
- [ ] Pass  [ ] Fail

**Feature case — Ripple cascade triggered by drag**
1. Ensure Task A has Task B as a dependent (Task B `depends_on` Task A)
2. Drag Task A 7 days to the right
3. Expected: Ripple Cascade Warning modal appears listing Task B with its projected new dates
4. Click Apply changes
5. Expected: both Task A and Task B are now 7 days later in the Gantt and in DB
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Drag moves both dates; duration unchanged
- [ ] Resize changes end_date and duration_days; start_date unchanged
- [ ] Drag disabled when baseline locked
- [ ] Date tooltip appears during drag
- [ ] Resize cursor appears only on right edge
- [ ] Ripple modal triggers and applies correctly on drag
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
