---
sop_version: 1.1
last_reviewed: 2026-07-02
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

Dependency types:
| Code | Meaning |
|------|---------|
| FS | Finish-to-Start: B can start after A finishes (most common) |
| SS | Start-to-Start: B can start when A starts |
| FF | Finish-to-Finish: B finishes when A finishes |
| SF | Start-to-Finish: B finishes when A starts |

Visual distinction:
- Solid arrows = typed dependencies (FS/SS/FF/SF with optional lag days) from the `task_dependencies` table
- Dashed arrows = legacy dependencies from the `depends_on` array on `schedule_tasks` (no type specified)

## 4. Before you start
- The project must have a generated schedule with at least some tasks
- Some tasks must have dependency relationships set — a schedule with no dependencies shows nodes but no arrows

## 5. Step-by-step process

**Opening the Dependency Map:**
1. Navigate to Operations → Schedule → **Dep Map** tab
2. The network diagram loads automatically — nodes are positioned using a force-directed layout

**Navigating the diagram:**
1. Scroll to zoom in and out
2. Drag the canvas (empty area between nodes) to pan
3. Use the mini-map in the corner to see your position in the full diagram

**Reading the diagram:**
1. Each node is a task, colour-coded by its construction phase (same colours as the Gantt)
2. Red nodes = overdue tasks
3. Arrows show the direction of dependency (from the upstream task to the downstream task)
4. Solid arrow = typed dependency with a specified type (FS/SS/FF/SF)
5. Dashed arrow = simple `depends_on` entry with no type

**Clicking a node:**
1. Click any task node in the Dep Map
2. A task detail panel slides in from the right
3. Shows the correct task name and all details

**Checking what depends on a task before deleting it:**
1. Find the task node in the Dep Map
2. Look at all arrows pointing AWAY from that node — these are tasks that depend on it
3. If any arrows point away (downstream tasks exist), deleting this task will orphan those dependencies
4. Consider updating the orphaned tasks' dependencies to point to a different upstream task before deleting

## 6. What happens next
The Dep Map is read-only — you cannot create or edit dependencies directly in this view. Use the task detail panel (SOP 06-03) to add or remove dependency links.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Deleting a task without checking the Dep Map | Not thinking about dependencies | Open the Dep Map before deleting any task that likely has dependents (frame, slab, etc.) |
| Confusing FS and SS dependencies | The types look similar | FS = sequential (most common — A finishes before B starts). SS = parallel start. |
| Expecting the Dep Map to update instantly after editing tasks | Brief cache delay | Refresh the Dep Map tab after saving dependency changes |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Dep Map shows no nodes | The project may have no tasks — generate a schedule first (SOP 06-02) |
| Dep Map shows nodes but no arrows | Tasks have no dependency relationships set — a valid state for a schedule where all tasks are independent |
| Diagram is cluttered (many tasks, overlapping nodes) | Use the mini-map to navigate; zoom in on the section you need |
| Clicking a node doesn't open the task detail panel | Check browser console for errors; try a full page reload |

## 9. Related modules
- [Schedule Manager overview](06-01_schedule_overview.md) — SOP 06-01
- [Edit a schedule](06-03_edit_schedule.md) — SOP 06-03 (editing dependencies)
- [Ripple cascade](06-08_ripple_cascade.md) — SOP 06-08 (how dependencies drive date cascades)

## 10. Screenshot placeholders
- [ ] Dep Map with a full project schedule — nodes colour-coded by phase, arrows connecting dependent tasks
- [ ] Mini-map in corner showing position in full diagram
- [ ] Solid vs dashed arrow comparison (typed vs legacy dependency)
- [ ] Task detail panel opened from a node click

## 11. Automation notes
- Dependency data comes from `GET /api/schedule/:projectId` — `schedule_tasks.depends_on` (array of task IDs) and typed dependencies from `task_dependencies` table if present
- Solid arrows = rows in `task_dependencies` table; dashed arrows = `depends_on` array entries without a typed row
- Rendered with React Flow — nodes are positioned with a force-directed layout algorithm

## 12. Edge cases and limits
- A project with no tasks shows an empty Dep Map — no error, just an empty canvas
- Tasks with `deleted_at` set are excluded from the Dep Map (same as the Gantt and Sheet)
- Very large schedules (100+ tasks, many dependencies) may render slowly — consider zooming in on the relevant section rather than viewing the full diagram
- The Dep Map does not currently support editing dependency types inline — use the task detail panel for that

## 13. Owner of the process
Admin / Staff  
Next review: 2026-12-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A project with a schedule that has at least 3 tasks with explicit dependencies (e.g. Task B depends on Task A, Task C depends on Task B)

### Test cases

**TC-01 — Dep Map loads with nodes and arrows**
1. Navigate to Schedule → Dep Map tab
2. Expected: network diagram loads with task nodes visible
3. Expected: arrows connect tasks that have dependencies
4. Expected: no blank/empty diagram for a project with a full schedule that has dependencies
- [ ] Pass  [ ] Fail

**TC-02 — Nodes are colour-coded by phase**
1. Identify a Frame phase task in the schedule (Gantt view shows orange)
2. Find its node in the Dep Map
3. Expected: node is orange — matching the Gantt phase colour
- [ ] Pass  [ ] Fail

**TC-03 — Click node opens task detail panel**
1. Click any task node in the Dep Map
2. Expected: task detail panel slides in from the right
3. Expected: shows the correct task name and details for the clicked node
- [ ] Pass  [ ] Fail

**TC-04 — Mini-map and zoom navigation work**
1. Scroll to zoom in on the Dep Map
2. Drag the canvas to pan
3. Expected: both zoom and pan work without crashing
4. Expected: mini-map updates to show the current viewport position
- [ ] Pass  [ ] Fail

**TC-05 — Solid vs dashed arrows distinguish dependency types**
1. Set up one task with a typed FS dependency (via task detail panel)
2. Set up another task with only a `depends_on` entry (legacy / no type)
3. Open the Dep Map
4. Expected: the typed dependency shows as a solid arrow
5. Expected: the legacy dependency shows as a dashed arrow
- [ ] Pass  [ ] Fail

**Feature case — Red node for overdue task**
1. Identify a task with `end_date` in the past and `percent_complete` < 100
2. Open the Dep Map
3. Expected: that task's node appears red (overdue status)
4. Other non-overdue nodes expected to appear in their normal phase colour
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Dep Map renders with tasks and dependency arrows
- [ ] Phase colour coding matches Gantt
- [ ] Node click opens correct task detail
- [ ] Zoom and pan navigation work
- [ ] Solid vs dashed arrows correctly distinguish typed vs legacy dependencies
- [ ] Overdue task nodes are red
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
