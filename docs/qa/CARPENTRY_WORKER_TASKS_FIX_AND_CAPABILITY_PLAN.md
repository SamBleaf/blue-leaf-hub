# Carpentry Worker-Tasks — Full Build Plan (handoff)

**Branch:** `carpentry/worker-tasks` (worktree `blh-carpentry.nosync`, off `portal-v2`)
**For:** the build agent picking this up. **Author:** Claude (W17 worker-tasks owner, research + diagnosis).
**Status:** IMPLEMENTATION-READY. **No migrations required** (every field exists). Split into **Batch F (freeze-safe bug fixes)** and **Batch C (freeze-gated capability, still no schema)**.
**Test-first, smallest-safe, match surrounding code. No commits to `main`. Do not push near the geocoding agent (ops/sales) — this branch only touches carpentry/worker files.**

---

## 0. Current state (verified — build on these facts)
- **Data is fine.** `carpentry_job 848eb79e` ("54 Gladstone Rd") has 22 correctly-linked worker tasks (`carpentry_job_id` set, `project_id` null, `task_audience='worker'`, 21 open + 1 wont_do). The **worker PWA reads them correctly**; the **Diary is broken by a query bug** (below).
- **Schema already has:** `site_tasks.assigned_to`, `completed_by`, `completed_at`, `completion_photo_url`, `completion_notes`, `sort_order`, `task_audience`, `category`, `priority`, `status`, `created_via`, `description`, `due_date`. **No migration for anything in this plan** (only exception: multiple-photos, gated on Sam Q1).
- **Worker completion already captures photo + note** (`src/pages/worker/WorkerTasks.jsx` completion sheet → `completion_photo_url` + `completion_notes` via `POST /api/worker/tasks/:id/complete`).
- **Role model:** PWA = `worker` vs `leading_hand` (`employees.is_leading_hand`); office `supervisor` = desktop `/supervisor`. `task_audience` gates visibility server-side (W17-P3, shipped). Keep this — do not invent a PWA "supervisor" role.
- **Gamify is deliberately restrained** (progress ring, haptic, per-category bars, "N tasks smashed" payoff banner — all in `WorkerTasks.jsx`, deployed). Match this language; do **not** add points/streaks/leaderboards.
- **`CarpentryJobDetail.jsx` already imports `@dnd-kit`** (lines 2–4) — DnD scaffolding is present for reorder.

---

## BATCH F — freeze-safe bug fixes (do first)

### F1 — ① Diary "Tasks for workers" is empty (P1)
**Root cause (confirmed live):** `server/lib/carpentryRoutes.mjs:986-1003`, `GET /api/carpentry/jobs/:id/tasks` selects
`"*, employees!assigned_to(id,name), employees!completed_by(id,name)"`. The two `employees` embeds collide on PostgREST's auto-alias → **`error 42712: table name "site_tasks_employees_1" specified more than once`** → route **502s for every carpentry job** → Diary shows "No tasks yet". (Each embed works alone; only the pair fails.)
**Fix — server (`carpentryRoutes.mjs:~991`):** alias the two embeds:
```js
.select("*, assigned:employees!assigned_to(id, name), completer:employees!completed_by(id, name)")
```
**Fix — client (`src/pages/CarpentryJobDetail.jsx`):** where a task's assigned/completed name is read, use the aliased keys after `rowsToCamel`: `task.assigned?.name` and `task.completer?.name` (previously the embed key would have been `task.employees`, which never populated because the query errored).
**Acceptance:** `GET /api/carpentry/jobs/848eb79e-…/tasks` returns 200 with 21 tasks (not 502); the Diary lists the same tasks the worker PWA shows.

### F2 — ③ tasks not editable after adding (P2)
**Root cause (confirmed):** in `CarpentryJobDetail.jsx` a task row's `onClick` is `toggleDone` (marks done); the only other control is ✕ delete. There is **no edit handler/modal**. Also the edit route is incomplete: `PATCH /api/carpentry/tasks/:id` (`carpentryRoutes.mjs:1181`) destructures only `{ status, completionNotes, completionPhotoUrl, priority, category }` — **`title` is not accepted**.
**Fix — server (`carpentryRoutes.mjs:1181` PATCH):** add `title` (and `description`, `sort_order`, `assigned_to` — needed for F/C below) to the accepted body fields, mirroring the worker route's allow-list (`workforceRoutes.mjs:1194` = `["title","description","assigned_to","priority","category","status","due_date","completion_notes","sort_order"]`). Validate `title` non-empty when provided.
**Fix — client:** add an **edit sheet** (bottom-sheet/modal consistent with existing UI) opened by a pencil affordance on the task row (keep the done-checkbox as a separate control so click-to-edit doesn't fight complete). Fields: title, category, priority. Save → `PATCH /api/carpentry/tasks/:id` → update local state (mirror `toggleDone`'s optimistic pattern at ~line 824).
**Acceptance:** clicking the pencil opens the edit sheet pre-filled; saving changes title/category/priority and the row reflects it; the done-toggle still works independently.

### F-TEST — regression (`scripts/batch-a/`)
Add a carpentry-tasks test (mirror the W03 test style): seed a carpentry job + a couple of `site_tasks` (one with `assigned_to` + `completed_by` set). Assert:
1. `GET /api/carpentry/jobs/:id/tasks` → 200 and returns the tasks (this is the F1 regression lock — it would 502 before the alias fix).
2. `PATCH /api/carpentry/tasks/:id { title:"…" }` → 200 and the title persists (F2 lock).
Wire an npm script `test:carpentry-tasks(:write)`. Then `npm run build` + `npm run lint`.

---

## BATCH C — capabilities (freeze-gated; NO migrations except Q1)

### C1 — 2a: Diary shows the same list + drag-reorder
DnD is already imported in `CarpentryJobDetail.jsx`. Wrap the task list in `DndContext`/`SortableContext` (mirror the worker PWA / existing scaffolding); on drag end, `arrayMove` locally + `PATCH /api/carpentry/tasks/:id { sort_order }` for the moved rows (route accepts `sort_order` after F2). Keep category grouping. **Acceptance:** reordering in the Diary persists and the worker PWA reflects the new `sort_order`.

### C2 — 2b: Diary sign-off review (who / when / photo / notes)
After F1, the route returns `task.completer` + `task.completed_at` + `task.completion_photo_url` (sign via existing `signSiteTaskPhotos`) + `task.completion_notes`. Render a **completed-tasks review** section: per done task show completed-by name, date+time, a photo thumbnail (opens full), and the note. Read-only for office review. **Acceptance:** a task completed in the PWA with a photo+note shows that photo, the worker's name, and timestamp in the Diary.

### C3 — 2d: Assign a worker to a task from the PWA (leading hand)
Server: the worker task-update path already accepts `assigned_to` (`workforceRoutes.mjs:1194`) — **confirm the route + add a guard so only `is_leading_hand` workers may set `assigned_to`** (normal worker cannot reassign). PWA: on the leading-hand task row, add an "assign" affordance → a crew picker (employees on the job/crew) → PATCH `assigned_to`. Keep it invisible for normal workers. **Acceptance:** a leading hand can assign a task to a crew member from the PWA; a normal worker has no assign control and is 403 server-side if they try.

### C4 — leading-hand differentiation ("not much difference" fix)
Elevate the **leading-hand** PWA experience while keeping the **plain worker app dead-simple**: leading hand gets (a) assign (C3), (b) a per-task **sign-off status** glance (who's done what on this job), (c) QC-task visibility/sign-off (already gated by `task_audience`). Do **not** add screens (4-screen cap) — these are affordances within Tasks/Today. **Acceptance:** a leading hand's Tasks screen is meaningfully more capable (assign + crew sign-off status) than a worker's; a worker's stays minimal.

Each C item: test-first (extend F-TEST), `build`, `lint`.

---

## Reference (routes / fields the agent will touch)
- `GET /api/carpentry/jobs/:id/tasks` — `carpentryRoutes.mjs:986` (F1 fix here).
- `POST /api/carpentry/jobs/:id/tasks` — `:1008` (create; admin/supervisor).
- `PATCH /api/carpentry/tasks/:id` — `:1181` (extend allow-list: F2).
- `DELETE /api/carpentry/tasks/:id` — delete.
- Worker: `POST /api/worker/tasks/:id/complete` — `workforceRoutes.mjs:2208` (photo+note already). Worker task update allow-list — `:1194` (has `assigned_to`; add leading-hand guard for C3).
- Client: `src/pages/CarpentryJobDetail.jsx` (Diary), `src/pages/worker/WorkerTasks.jsx` (PWA).

## Open questions for Sam (recommended defaults so the agent can proceed if unanswered)
1. **One completion photo or multiple?** → **Default: keep single** (`completion_photo_url`). Multiple = the *only* migration (`site_task_photos` table) — do separately if Sam wants it.
2. **"Supervisors assign in the PWA"** → **Default: the leading hand assigns from the PWA** (C3). Office supervisors assign on desktop (already exists).
3. **Diary review** → **Default: both** — reorder (C1) + read-only sign-off review (C2), per Sam's ask.
4. **Gamify** → **Default: keep the restrained set**; no new scoring unless Sam defines a direction.

## Coordination / definition of done
- Files touched: `carpentryRoutes.mjs`, `workforceRoutes.mjs` (C3 guard only), `CarpentryJobDetail.jsx`, `WorkerTasks.jsx`, a new carpentry-tasks test. **No overlap with the geocoding agent (ops/sales) or the ops-redesign work.** No migrations (except Q1). **Do not push to `main`.**
- DoD: Batch F green (① returns 200, ③ edits persist, test + build + lint pass) → then Batch C per-item green. Commit on `carpentry/worker-tasks`.
