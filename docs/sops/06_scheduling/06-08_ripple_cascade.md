---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin / Staff
test_status: static_pass
---

# SOP 06-08: Ripple Cascade — Propagate Date Changes to Dependent Tasks

**Module:** Operations → Schedule Manager → Gantt  
**SOP ID:** 06-08  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Staff

## 2. When to use it
When you drag or resize a task that has downstream dependencies. The ripple cascade is automatic — it appears whenever a date change would affect other tasks in the dependency chain.

## 3. What this does
When you move a task, the system checks if any other tasks depend on it. If they do, it calculates how much their dates would need to shift to maintain the same relative time gap, then shows you a preview of all the affected tasks before making any changes.

You review the list, confirm or cancel, and the changes apply as a batch — either all tasks shift or none do.

A task is only included in the ripple if it is in the `depends_on` array of the moved task (or is transitively dependent via a chain). Tasks that happen to overlap in time but are not explicitly linked are NOT rippled.

## 4. Before you start
- The project must have tasks with explicit dependency relationships set
- Check the Dep Map (SOP 06-06) to understand the dependency chain before making a large move
- The baseline should be unlocked for drag-triggered ripples (ripples via task detail panel work regardless of lock state)

## 5. Step-by-step process

**Triggering a ripple:**
1. Drag or resize a task in the Gantt (SOP 06-07)
2. If the task has dependents, a **Ripple Cascade Warning** modal appears automatically
3. The modal shows:
   - The task you moved
   - All downstream tasks that would be affected (transitively)
   - The date shift each would receive (e.g. "Frame: 2026-07-15 → 2026-07-22 (+7 days)")
4. Review the list carefully

**Confirming or cancelling:**
- If the changes look correct → click **Apply changes**
  - All listed tasks have their dates shifted
  - The Gantt re-renders with all tasks at their new positions
- If something looks wrong → click **Cancel**
  - The moved task returns to its original position
  - No task dates are changed

## 6. What happens next
After clicking Apply:
- All listed downstream tasks are updated with their new dates (batch PATCH calls)
- The Gantt re-renders showing all tasks at their new positions
- The moved task and all affected downstream tasks appear at their updated positions
- The Dep Map will reflect the updated dates on next load

After clicking Cancel:
- The task you dragged reverts to its original position
- No changes are saved to the database

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Cancelling the ripple then manually updating each dependent task | Doesn't trust the preview | The preview shows exactly which tasks will change — if it looks right, apply it. Manual updates risk creating inconsistent gaps. |
| Not reading the ripple list before clicking Apply | Clicking Apply too quickly | The ripple may shift tasks you weren't expecting — read the full list before confirming |
| Moving a task when many cascades are at risk of large shifts | Large programme change | For major shifts affecting many tasks, consider using the task detail panel to edit dates with more precise control |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Ripple modal doesn't appear after drag | The task may have no dependents — check the Dep Map (SOP 06-06) to confirm dependency links |
| Ripple shifts the wrong tasks | Check the `depends_on` data in the Dep Map — the wrong dependencies may be set |
| After applying ripple, some tasks didn't shift | These tasks were not in the `depends_on` chain and were correctly excluded from the ripple |

## 9. Related modules
- [Edit a schedule](06-03_edit_schedule.md) — SOP 06-03 (task detail editing, alternative to drag)
- [Dependency Map](06-06_dependency_map.md) — SOP 06-06 (understanding the dependency chain before a large ripple)
- [Drag and resize tasks](06-07_drag_resize.md) — SOP 06-07 (the interactions that trigger the ripple)

## 10. Screenshot placeholders
- [ ] Ripple Cascade Warning modal showing affected tasks with old and new dates
- [ ] Gantt view after a ripple is applied — multiple task bars shifted right together
- [ ] Gantt view after a ripple is cancelled — task reverted to original position

## 11. Automation notes
- Ripple preview: `POST /api/schedule/:projectId/ripple-check` with `{ taskId, newStartDate, newEndDate }` — returns a list of all transitively dependent tasks with their projected new dates
- The preview is calculated by `previewRipple()` in `scheduleUtils.js` — walks the dependency graph starting from the moved task and calculates the date shift for each downstream task
- Apply: done client-side by sending individual `PATCH /api/schedule/task/:id` calls for each affected task listed in the ripple preview
- The ripple cascade only follows explicit `depends_on` entries — it does not infer dependencies from date proximity or phase order

## 12. Edge cases and limits
- The ripple traverses `task_dependencies` (typed) first; if no typed rows exist for a task, it falls back to the legacy `depends_on` array treated as FS+0
- Very long chains (10+ tasks) may cause the ripple modal to list many tasks — review all of them before applying
- If two tasks both depend on the moved task, both appear in the ripple list and both are shifted
- Cancelled ripples do not save any changes; the moved task reverts to its original start/end dates
- If the PATCH for one task in a batch fails, that individual task may not shift — check all tasks in the ripple list after applying

## 13. Owner of the process
Admin / Staff  
Next review: 2026-12-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A project with a schedule where at least 3 tasks have explicit dependencies (Task B `depends_on` Task A, Task C `depends_on` Task B)
- [ ] Know the current dates of all tasks in the dependency chain
- [ ] Baseline is NOT locked

### Test cases

**TC-01 — Ripple cascade modal appears on drag**
1. Drag Task A (which has Task B and C depending on it) 7 days to the right
2. Expected: Ripple Cascade Warning modal appears automatically
3. Expected: modal lists Task B and Task C with their projected new dates
4. Expected: each listed task shows old date → new date and "+7 days"
- [ ] Pass  [ ] Fail

**TC-02 — Apply ripple shifts all dependent tasks**
1. From TC-01, click Apply changes
2. Expected: Gantt shows Task A, B, and C all 7 days later than before
3. Expected DB: `start_date` and `end_date` of Task B and Task C each shifted by 7 days
- [ ] Pass  [ ] Fail

**TC-03 — Cancel ripple leaves all tasks unchanged**
1. Drag Task A to trigger the ripple modal
2. Click Cancel
3. Expected: Task A reverts to its original position in the Gantt
4. Expected DB: no task dates changed (Task A, B, C all at original dates)
- [ ] Pass  [ ] Fail

**TC-04 — Tasks without explicit dependency are NOT rippled**
1. Identify a task (Task D) that does NOT have a `depends_on` entry pointing to Task A
2. Drag Task A 3 days to the right
3. Expected: ripple modal does NOT list Task D
4. After applying: Task D's dates are unchanged
- [ ] Pass  [ ] Fail

**TC-05 — Transitive ripple follows the full chain (A → B → C → D)**
1. Ensure a chain of 4 tasks: D depends on C, C depends on B, B depends on A
2. Drag Task A 5 days to the right
3. Expected: ripple modal lists Task B, C, and D (all 3 downstream tasks)
4. After applying: all 4 tasks (A, B, C, D) are shifted by 5 days
- [ ] Pass  [ ] Fail

**Feature case — Large shift triggers ripple on a branching dependency tree**
1. Set up Task A with Task B and Task C both depending on it (branching, not linear)
2. Drag Task A 10 days to the right
3. Expected: ripple modal lists BOTH Task B and Task C with +10 days each
4. After applying: Task B and Task C are both 10 days later; Task A is 10 days later
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Ripple modal appears automatically when dependent tasks exist
- [ ] Apply shifts all listed dependent tasks correctly
- [ ] Cancel reverts the moved task to original position, no DB changes
- [ ] Non-dependent tasks are not included in the ripple
- [ ] Transitive chains (A→B→C→D) are fully cascaded
- [ ] Branching dependencies ripple to all branches
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
