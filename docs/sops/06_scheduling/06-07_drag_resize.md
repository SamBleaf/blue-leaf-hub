---
sop_version: 1.0
last_reviewed: 2026-05-29
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
When you need to quickly adjust a task's dates in the Gantt without opening the task detail panel. Faster than editing dates manually.

**Only available when the baseline is NOT locked.** If the baseline is locked, unlock it first (SOP 06-04) or use the task detail to edit dates.

## 3. Drag (move the whole task)

**What it does:** Shifts both the start date and end date forward or backward by the same number of days. The duration stays the same.

**How to do it:**
1. Click and hold anywhere on the task bar (not the right edge)
2. Drag left or right
3. A date tooltip shows the new start date as you drag
4. Release to confirm — the task moves to the new dates

**Effect on the database:**
- `start_date` and `end_date` both shift by the same number of days
- `duration_days` is unchanged

## 4. Resize (change the duration)

**What it does:** Extends or shortens the task by moving the end date. The start date stays fixed. The duration changes.

**How to do it:**
1. Hover over the right edge of the task bar until the cursor changes to a resize arrow (←→)
2. Click and drag right to extend, left to shorten
3. Release to confirm

**Effect on the database:**
- `end_date` changes
- `start_date` is unchanged
- `duration_days` is recalculated as the new number of days between start and end

## 5. Ripple cascade after drag/resize

If the task you moved or resized has downstream dependencies, a **Ripple Cascade Warning** may appear. See SOP 06-08.

## 6. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Drag not working | Baseline may be locked | Check the baseline banner — if locked, unlock first |
| Accidentally resizing instead of dragging | Cursor near the right edge | Move the cursor away from the right edge before dragging |
| Moving a critical path task without considering downstream effects | Quick edit | Watch for the ripple cascade preview |

## 7. Troubleshooting

| Problem | Solution |
|---------|----------|
| Task snaps back after release | The PATCH call may have failed — check browser network tab |
| Resize cursor doesn't appear | Hover directly over the right edge of the bar (not the middle) |
| Drag results in wrong date | The Gantt timeline zoom level affects precision — zoom in for finer control |

## 8. Automation notes
- Both drag and resize use `PATCH /api/schedule/task/:id`
- Distinguishing drag from resize (client-side): if `newStartDate === task.start_date`, it's a resize (only `end_date` and `duration_days` sent); otherwise it's a drag (both `start_date` and `end_date` sent)
- After the PATCH, `onDateChange` callback fires and triggers a ripple check if the task has `depends_on` entries

## 9. Owner of the process
Admin / Staff  
Next review: 2026-11-29

---

## 10. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Project with a schedule
- [ ] Baseline is NOT locked
- [ ] At least 2 tasks visible with known dates

### Test cases

**TC-01 — Drag task moves both dates**
1. Note a task's current start_date and end_date
2. Drag the task bar 5 days to the right
3. Expected: both start_date and end_date shift 5 days forward
4. Expected: duration_days is unchanged
5. Expected DB: verify via `SELECT start_date, end_date, duration_days FROM schedule_tasks WHERE id = '<id>'`
- [ ] Pass  [ ] Fail

**TC-02 — Resize task changes duration**
1. Note a task's current start_date, end_date, and duration_days
2. Resize the right edge of the task bar to extend by 3 days
3. Expected: end_date moves 3 days forward
4. Expected: start_date unchanged
5. Expected DB: `duration_days` increased by 3
- [ ] Pass  [ ] Fail

**TC-03 — Drag disabled when baseline is locked**
1. Lock the baseline (SOP 06-04)
2. Attempt to drag a task bar
3. Expected: drag does not work — task stays in place
- [ ] Pass  [ ] Fail

**TC-04 — Drag shows date tooltip**
1. Begin dragging a task bar
2. Expected: a tooltip appears showing the new start date as you drag
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Drag moves both dates, duration unchanged
- [ ] Resize changes end_date only, updates duration_days
- [ ] Drag disabled when baseline locked
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
