---
sop_version: 1.0
last_reviewed: 2026-05-29
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
When you drag or resize a task that has downstream dependencies. The ripple cascade is automatic — it appears whenever a date change would affect other tasks.

## 3. What this does
When you move a task, the system checks if any other tasks depend on it. If they do, it calculates how much their dates would need to shift to maintain the same relative time gap, then shows you a preview of all the affected tasks before making any changes.

You review the list, confirm or cancel, and the changes apply atomically — either all tasks shift or none do.

## 4. Step-by-step process

**Triggering a ripple:**
1. Drag or resize a task in the Gantt
2. If the task has dependents, a **Ripple Cascade Warning** modal appears automatically
3. The modal shows:
   - The task you moved
   - All downstream tasks that would be affected
   - The date shift each would receive (e.g. "Frame: 2026-07-15 → 2026-07-22 (+7 days)")
4. Review the list:
   - If the changes look right → click **Apply changes**
   - If something looks wrong → click **Cancel** and adjust dates manually instead

**What happens after applying:**
- All listed tasks have their dates shifted
- The Gantt re-renders with all tasks at their new positions
- The moved task and its downstream tasks are all updated in a single batch

## 5. Tasks NOT affected by ripple

A task is only included in the ripple if it is in the `depends_on` array of the moved task (or transitively dependent). Tasks that happen to overlap in time but are not explicitly linked will NOT be rippled.

## 6. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Cancelling the ripple then manually updating each dependent task | Doesn't trust the preview | The preview shows exactly which tasks will change — if it looks right, apply it |
| Not reading the ripple list | Clicking Apply too fast | The ripple may shift tasks you weren't expecting — read the list |
| Moving a task when many cascades are at risk | Large programme change | For major shifts affecting many tasks, consider using the task detail to edit dates directly with more control |

## 7. Troubleshooting

| Problem | Solution |
|---------|----------|
| Ripple modal doesn't appear after drag | The task may have no dependents — check the Dep Map (SOP 06-06) |
| Ripple shifts the wrong tasks | Check the `depends_on` data in the Dep Map — the wrong dependencies may be set |
| After applying ripple, some tasks didn't shift | These tasks may not have been in the `depends_on` chain — they were correctly excluded |

## 8. Automation notes
- Ripple preview: `POST /api/schedule/:projectId/ripple-check` with `{ taskId, newStartDate, newEndDate }` — returns a list of all transitively dependent tasks with their projected new dates
- The preview is calculated by `previewRipple()` in `scheduleUtils.js` — walks the dependency graph starting from the moved task
- Apply: done client-side by sending individual `PATCH /api/schedule/task/:id` calls for each affected task (or a batch update)
- The ripple cascade only follows explicit `depends_on` entries — it does not infer dependencies from date proximity

## 9. Owner of the process
Admin / Staff  
Next review: 2026-11-29

---

## 10. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A project with a schedule where at least 3 tasks have explicit dependencies (Task B depends on Task A, Task C depends on Task B)
- [ ] Know the current dates of all tasks in the dependency chain

### Test cases

**TC-01 — Ripple cascade appears on drag**
1. Drag Task A (which has Task B and C depending on it) 7 days to the right
2. Expected: Ripple Cascade Warning modal appears
3. Expected: modal lists Task B and Task C with their projected new dates
4. Expected: each listed task shows old date → new date and +N days
- [ ] Pass  [ ] Fail

**TC-02 — Apply ripple shifts all dependent tasks**
1. From TC-01, click Apply changes
2. Expected: Gantt shows Task A, B, and C all 7 days later than before
3. Expected DB: `start_date` and `end_date` of Task B and Task C each shifted by the same amount as Task A
- [ ] Pass  [ ] Fail

**TC-03 — Cancel ripple leaves tasks unchanged**
1. Drag Task A to trigger the ripple modal
2. Click Cancel
3. Expected: Task A returns to its original position
4. Expected DB: no task dates changed
- [ ] Pass  [ ] Fail

**TC-04 — Tasks without dependency NOT rippled**
1. Create a task (Task D) that has no dependency on Task A
2. Drag Task A 3 days to the right
3. Expected: ripple modal does NOT list Task D (it has no dependency)
4. After applying: Task D's dates are unchanged
- [ ] Pass  [ ] Fail

**TC-05 — Transitive ripple (A → B → C → D)**
1. Ensure a chain of 4 tasks each depending on the previous
2. Drag the first task 5 days
3. Expected: ripple shows all 3 downstream tasks (B, C, D)
4. After applying: all 4 tasks shifted by 5 days
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Ripple modal appears when dependent tasks exist
- [ ] Apply shifts all dependent tasks correctly
- [ ] Cancel reverts to original position
- [ ] Non-dependent tasks not affected
- [ ] Transitive chains cascaded correctly
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
