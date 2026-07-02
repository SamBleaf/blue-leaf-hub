---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 06-04: Lock and Manage a Schedule Baseline

**Module:** Operations → Schedule Manager → Gantt  
**SOP ID:** 06-04  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin

## 2. When to use it
Once the construction schedule has been agreed and work is about to start (or has just started). Locking the baseline records the original planned dates for every task so that schedule drift can be measured over time.

Do this before any actual construction begins — ideally on the day of groundbreaking or site establishment.

## 3. What this does
Takes a snapshot of the current `start_date` and `end_date` of every task and stores them as `baseline_start_date` and `baseline_end_date`. Records the lock timestamp on the project (`schedule_baseline_locked_at`).

After locking:
- The Gantt shows a **ghost bar** (semi-transparent) at the original baseline position alongside the current bar — making drift visually obvious
- A "Baseline locked [date]" banner appears at the top of the schedule
- Drag and drop / resize on the Gantt is disabled (to prevent accidental edits while locked)
- The baseline dates are preserved even when dates are later changed (showing variance)

**The baseline is a snapshot, not a constraint.** Tasks can still be updated via the task detail panel. The baseline just shows where you started.

## 4. Before you start
- The schedule should be finalised before locking — every task reviewed and dates confirmed
- Confirm with the project manager or director that the programme is ready to go live
- If you have already locked a baseline and want to re-lock, you must reset first (see step-by-step below)

## 5. Step-by-step process

**Locking the baseline:**
1. Navigate to Operations → Schedule for the project
2. Review the schedule — it should be final before locking
3. Click **Lock Baseline** (button in the Gantt toolbar or dashboard)
4. Confirm when prompted
5. A "Baseline locked [date]" banner appears at the top of the Gantt

**Viewing baseline drift:**
1. After locking, any task that has moved will show:
   - Current bar at the updated position
   - Ghost bar (original baseline position, semi-transparent, behind the current bar)
   - The drift is the visual gap between ghost bar and current bar

**Resetting (unlocking) the baseline:**
1. Click **Reset baseline** in the "Baseline locked" banner
2. Confirm the reset
3. Ghost bars disappear; drag and drop re-enabled
4. Locking again after a reset takes a fresh snapshot of current dates

**When to reset the baseline:**
Reset is a significant decision. Do it only if:
- There was a major scope change that fundamentally changed the build programme
- The original baseline was set incorrectly (before the schedule was finalised)
- An approved EOT has shifted all dates and you want to re-baseline from the new programme

Do NOT reset just because a few tasks have drifted — that drift is the point. It shows you where you're behind.

## 6. What happens next
After locking:
- Ghost bars appear on the Gantt for every task (at their original positions)
- Drag and drop is disabled on the Gantt
- You can still edit task dates via the task detail panel — which will create visible drift between ghost and current bars
- The EOT workflow (SOP 06-05) records delays formally — applying an EOT shifts task dates but the ghost bars remain at the original locked position

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Locking the baseline too early (before schedule is final) | Wanting to track early | Finalise the schedule first. Once locked, every change looks like drift. |
| Resetting after seeing too much red | Uncomfortable with the data | Drift is information. The baseline exists to show reality. |
| Regenerating the schedule with baseline locked | Wanting to use AI again | Unlock baseline first, regenerate, lock again |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Lock Baseline button not visible | You may need to scroll up on the Gantt toolbar; also check you have Admin permissions (not Staff) |
| Ghost bars not showing after locking | Refresh the page. Ghost bars rely on `baseline_start_date` being set — verify in DB that `schedule_tasks.baseline_start_date` is populated |
| Drag and drop still works after locking | Check `projects.schedule_baseline_locked_at` in DB — if it's null, the lock didn't save |

## 9. Related modules
- [Schedule Manager overview](06-01_schedule_overview.md) — SOP 06-01
- [Edit a schedule](06-03_edit_schedule.md) — SOP 06-03 (task detail editing still works when locked)
- [Extension of Time (EOT)](06-05_eot.md) — SOP 06-05 (formal delay recording)

## 10. Screenshot placeholders
- [ ] "Baseline locked [date]" banner at top of Gantt
- [ ] Ghost bars visible alongside current task bars (after a task has been moved post-lock)
- [ ] Lock Baseline button location in the Gantt toolbar

## 11. Automation notes
- Lock: `POST /api/schedule/:projectId/baseline/lock` — iterates all active tasks, sets `baseline_start_date = start_date` and `baseline_end_date = end_date`, then updates `projects.schedule_baseline_locked_at = now()`
- Reset: `DELETE /api/schedule/:projectId/baseline` — clears `baseline_start_date`, `baseline_end_date` on all tasks, clears `projects.schedule_baseline_locked_at`
- Frontend detects locked state from `projects.schedule_baseline_locked_at` — shows banner and disables drag/drop when non-null

## 12. Edge cases and limits
- The lock endpoint processes tasks in a batch; if some tasks fail to update, the lock timestamp may still be set — verify all tasks have `baseline_start_date` after locking
- Regenerating a schedule (SOP 06-02) while the baseline is locked will overwrite baseline dates with the regenerated task dates — always unlock before regenerating
- After reset, `baseline_start_date` and `baseline_end_date` are set to NULL on all tasks — the ghost bars disappear immediately on next page load
- A project with zero tasks can still have a baseline locked (no harm done, but it is meaningless)

## 13. Owner of the process
Admin  
Next review: 2026-12-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A project with a generated schedule (at least 5 tasks)
- [ ] Baseline is NOT currently locked for this project

### Test cases

**TC-01 — Lock baseline**
1. Navigate to Schedule for the project
2. Click Lock Baseline → confirm when prompted
3. Expected: "Baseline locked [today's date]" banner appears at the top of the Gantt
4. Expected DB: `projects.schedule_baseline_locked_at` = approximately now
5. Expected DB: all `schedule_tasks` for this project have `baseline_start_date` and `baseline_end_date` set (matching their current `start_date` and `end_date`)
- [ ] Pass  [ ] Fail

**TC-02 — Ghost bars appear after locking**
1. After locking, observe the Gantt
2. Expected: semi-transparent ghost bars visible behind task bars (or at same position if no drift yet)
3. Expected: no console errors
- [ ] Pass  [ ] Fail

**TC-03 — Drift shows when task is moved after baseline**
1. After locking, open a task detail and change the start date by 7 days
2. Save
3. Expected: Gantt shows the ghost bar at the original position AND the current bar at the new (shifted) position
- [ ] Pass  [ ] Fail

**TC-04 — Reset baseline**
1. Click Reset baseline in the banner → confirm
2. Expected: banner disappears; ghost bars disappear
3. Expected DB: `projects.schedule_baseline_locked_at = NULL`
4. Expected DB: `schedule_tasks.baseline_start_date = NULL` for all tasks in this project
- [ ] Pass  [ ] Fail

**TC-05 — Re-lock after reset takes new snapshot**
1. After resetting, move a task forward 3 days via task detail
2. Lock the baseline again
3. Expected DB: `baseline_start_date` for that task reflects the NEW (shifted) position, not the original pre-reset position
- [ ] Pass  [ ] Fail

**Feature case — Drag and drop disabled when locked**
1. With baseline locked, attempt to drag a task bar in the Gantt
2. Expected: the task does not move — drag and drop is disabled while locked
3. Unlock the baseline and try dragging again
4. Expected: drag and drop works normally after unlock
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Lock sets baseline_start_date and baseline_end_date on all tasks
- [ ] Lock timestamp recorded on project
- [ ] Ghost bars visible on Gantt after locking
- [ ] Reset clears all baseline data
- [ ] Re-lock captures current (post-edit) dates, not original ones
- [ ] Drag disabled when locked, re-enabled after unlock
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
