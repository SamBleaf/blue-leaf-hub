# /sprint — Sprint scope and build

Plan, scope, and optionally build the next sprint for Blue Leaf Hub. Always scope before building.

## Project context

**Blue Leaf Hub** — internal ops platform for Blue Leaf Building (residential construction builder, Australia). Four live modules:
- **Sales Manager** — APB 8-stage lead pipeline, qualifying scorecard, meeting transcript → Blueprint AI analysis, Blueprint Insight chat coaching
- **Tender Manager** — RFQ engine, Claude extraction, PO generation, Buildexact sync, fee proposal DOCX/PDF workflow
- **Operations Manager** — Projects list, per-project schedule management, site diary, WHS, subcontractor compliance
- **Subcontractors** — Trade directory, compliance tracking, sortable sheet view

**Tech stack:** React + React Router v6, Vite, Tailwind CSS (custom tokens), Express API (Railway), Supabase (Postgres + Auth), Claude AI (Anthropic). Deploy: Vercel (SPA) + Railway (API).

**Key conventions:**
- ESLint zero warnings, Vite build must pass before any commit
- No raw hex in JSX — use Tailwind tokens or `scheduleUtils` colour helpers
- No DB migrations without noting them clearly for user to apply in Supabase dashboard
- Blueprint API pattern: `POST /api/blueprint/chat` body `{ messages, hubContext }` → returns `{ reply }` (not `response` or `message`)
- `dotenv.config()` won't override shell env vars — use: `const { parsed: _env = {} } = dotenvConfig(); const key = process.env.KEY?.trim() || _env.KEY?.trim()`
- Commit message: imperative mood, co-authored by Claude Sonnet 4.6

**Colour system (phase-semantic, construction-native):**
All four schedule views (Dashboard, Gantt, Sheet, Calendar) use `PHASE_COLOR_MAP` from `src/lib/scheduleUtils.js`. Status layered on top via `getTaskGanttStyles()`. Never use hash-based or arbitrary colours for schedule tasks.

**Schedule Manager — Sprint 1 features (built):**
- Phase semantic colour coding (PHASE_COLOR_MAP + status modifiers)
- Gantt column toggle (show/hide left panel, persisted in localStorage)
- Right-click context menu on Gantt bars (complete / open / delete)
- Right-edge drag resize (distinguished from move: start unchanged = resize, recompute duration_days)

**gantt-task-react notes:**
- Custom `TaskListHeader`/`TaskListTable` must be module-level stable functions (not inline)
- `listCellWidth=""` hides the left panel entirely
- `onDateChange` fires for both drag-move and right-edge resize
- Context menu row: `Math.floor((clientY - containerTop - 52 - 50) / 40)` → `ganttTasks[rowIndex]`

**Supabase migrations applied:** 001–017. Next is 018 (Sprint 2).

---

## Sprint backlog (in priority order)

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

---

## Steps when /sprint is called

1. **Identify sprint** — ask which sprint number to work on, or default to the next unbuilt one.

2. **Scope session** — present the full plan for that sprint with options for any design decisions. Wait for user approval on each decision point before writing code.

3. **Pre-build check** — run `/check` to confirm the codebase is clean before starting.

4. **Build** — implement the agreed scope. Follow the repo conventions above:
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
