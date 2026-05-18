# /sprint — Sprint scope and build

Plan, scope, and optionally build the next sprint for Blue Leaf Hub. Always scope before building.

## Context

Active sprint backlog (in priority order):

### Sprint 2 — Schedule intelligence
- **Baseline / ghost bars** — DB migration 018 (add `baseline_start_date`, `baseline_end_date` to `schedule_tasks`; `schedule_baseline_locked_at` to `projects`). "Lock Baseline" button snapshots current dates. Gantt renders semi-transparent SVG overlay for drifted tasks.
- **EOT (Extension of Time) tracking** — DB migration 018 (new `schedule_eot` table). New "Delays" tab in Schedule Manager. Raise EOT with reason code + days claimed → approve → optionally push schedule forward.

### Sprint 3 — Dependencies overhaul
- Migrate `depends_on` (simple array) → `task_dependencies` JSONB (`[{taskId, type, lag}]`)
- Dependency types: FS / SS / FF / SF + lag days
- Updated TaskDetailPanel dependency editor (table with type + lag per link)
- Dependency Map view (network diagram of task chain)
- Canonical residential construction dependency template embedded in AI schedule generation

### Sprint 4 — Operations Manager overhaul
- Rich project cards with schedule health badge, progress %, next milestone, active trade count
- Card / list toggle (same pattern as Sales Pipeline)
- Global Gantt: all active projects in one Gantt, filterable by trade, colour-coded by project
- Trade conflict detection across projects

### Sprint 5 — Client portal (deferred)
- Token-based shareable schedule link (no login)
- Variation + EOT approval workflow with client sign-off
- Site diary → client update pipeline

## Steps when /sprint is called

1. **Identify sprint** — ask which sprint number to work on, or default to the next unbuilt one.

2. **Scope session** — present the full plan for that sprint with options for any design decisions. Wait for user approval on each decision point before writing code.

3. **Pre-build check** — run `/check` to confirm the codebase is clean before starting.

4. **Build** — implement the agreed scope. Follow the repo conventions:
   - No DB migrations without noting them clearly for the user to apply in Supabase dashboard
   - ESLint zero warnings
   - Vite build must pass before committing
   - Commit message follows repo style

5. **Post-build check** — run `/check` again after implementation.

6. **Ship** — run `/ship` to commit and push.

## Parallel build option

If the user wants to work on Sprint N+1 planning while Sprint N is building, spawn a worktree agent:
- Use `isolation: "worktree"` mode
- The worktree agent builds on an isolated branch
- Report back when done for review before merging to main
