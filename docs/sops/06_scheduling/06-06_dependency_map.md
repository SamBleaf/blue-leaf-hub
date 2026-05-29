---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin / Staff
test_status: static_pass
---

# SOP 06-06: Use the Dependency Map

**Module:** Operations → Schedule Manager → Dep Map tab  
**SOP ID:** 06-06  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Admin, Staff (project managers wanting to understand task relationships)

## 2. When to use it
When you want to understand how tasks are connected — which tasks must finish before others can start, and which tasks would be affected by a delay. Also useful before deleting a task to check if anything depends on it.

## 3. What this does
Shows a network diagram of all schedule tasks and their dependencies. Each task is a node. Arrows show dependency relationships — an arrow from Task A to Task B means "B depends on A" (A must complete before B can start).

## 4. How to use the Dependency Map

1. Navigate to Operations → Schedule → **Dep Map** tab
2. The network diagram loads automatically
3. To navigate: scroll to zoom in/out, drag the canvas to pan
4. Mini-map in the corner shows your position in the full diagram
5. Click any task node to open the task detail panel

**Reading the diagram:**
- Solid arrows = typed dependencies (FS/SS/FF/SF with optional lag days)
- Dashed arrows = legacy dependencies (simple `depends_on` array — no type specified)
- Task nodes are colour-coded by construction phase (same colours as Gantt)
- Red nodes = overdue tasks

**Dependency types:**
| Code | Meaning |
|------|---------|
| FS | Finish-to-Start: B can start after A finishes (most common) |
| SS | Start-to-Start: B can start when A starts |
| FF | Finish-to-Finish: B finishes when A finishes |
| SF | Start-to-Finish: B finishes when A starts |

## 5. Checking what depends on a task before deleting it

1. Find the task in the Dep Map
2. Look at all arrows pointing AWAY from that task — these are tasks that depend on it
3. If any arrows point away (downstream tasks exist), deleting this task will orphan those dependencies
4. Consider updating the orphaned tasks' dependencies to point to a different upstream task before deleting

## 6. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Deleting a task without checking the Dep Map | Not thinking about dependencies | Open the Dep Map before deleting any task with likely dependents (frame, slab, etc.) |
| Confusing FS and SS dependencies | The types look similar | FS = sequential (most common). SS = parallel start. |

## 7. Troubleshooting

| Problem | Solution |
|---------|----------|
| Dep Map shows no nodes | The project may have no tasks, or tasks have no dependency relationships — a schedule with no dependencies will show nodes but no arrows |
| Diagram is very cluttered (many tasks) | Use the mini-map to navigate; zoom in on the section you need |
| Clicking a node doesn't open detail | Check browser console for errors; try a full page reload |

## 8. Automation notes
- Dependency data comes from `GET /api/schedule/:projectId` — `schedule_tasks.depends_on` (array of task IDs) and typed dependencies from `task_dependencies` table if present
- Solid arrows = rows in `task_dependencies` table; dashed arrows = `depends_on` array entries without a typed row
- Rendered with React Flow — nodes are positioned with a force-directed layout algorithm

## 9. Owner of the process
Admin / Staff  
Next review: 2026-11-29

---

## 10. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A project with a schedule that has at least 3 tasks with dependencies

### Test cases

**TC-01 — Dep Map loads with nodes**
1. Navigate to Schedule → Dep Map tab
2. Expected: network diagram loads with task nodes visible
3. Expected: arrows connect tasks that have dependencies
4. Expected: no blank/empty diagram for a project with a full schedule
- [ ] Pass  [ ] Fail

**TC-02 — Nodes are colour-coded by phase**
1. Identify a Frame phase task in the schedule
2. Find its node in the Dep Map
3. Expected: node is orange (Frame phase colour) — matching the Gantt colour
- [ ] Pass  [ ] Fail

**TC-03 — Click node opens task detail**
1. Click any task node in the Dep Map
2. Expected: task detail panel slides in from the right
3. Expected: shows the correct task name and details
- [ ] Pass  [ ] Fail

**TC-04 — Mini-map and zoom work**
1. Scroll to zoom in on the Dep Map
2. Drag the canvas to pan
3. Expected: both work without crashing
4. Expected: mini-map updates to show current viewport position
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Dep Map renders with tasks and arrows
- [ ] Phase colour coding matches Gantt
- [ ] Node click opens task detail
- [ ] Navigation (zoom, pan) works
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
