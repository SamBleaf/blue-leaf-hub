# Carpentry Worker-Tasks — Fix + Capability Plan

**Branch:** `carpentry/worker-tasks` (isolated worktree `blh-carpentry.nosync`, off `portal-v2`)
**Date:** 2026-06-28 · **Author:** Claude (W17 worker-tasks owner)
**Status:** PLAN — no product code changed yet. Split into **freeze-safe bug fixes** vs **freeze-gated capability build**.
**Grounded in:** live DB diagnosis + code read + the W17 spec pack (`W17_WORKFORCE_UI_AND_WORKER_APP_SPEC.md` etc.) + the deployed PWA/gamify code.

---

## 0. Current state (what's actually deployed) — the "get up to date" summary
- **Worker PWA** (`/worker`, magic-link token, 4 fixed screens: Today · Log Hours · My Week · Tasks). **Restrained gamify** (deployed, `origin/main` @ `395a581`): progress-ring donut, haptic on complete/reorder, per-category progress bars ("Nice work" at 100%), whole-list payoff banner ("N tasks smashed"), animated ticks. **No points/streaks/badges/leaderboards** — deliberately cut. Any change must speak this language, not add scoring.
- **Role model:** the PWA knows **worker vs leading_hand** (`employees.is_leading_hand`), NOT the office "supervisor". The office **supervisor is a desktop role** (`/supervisor`, Supabase JWT). Field access = token; office = login + `requireRole('admin','supervisor')`. `site_tasks.task_audience` gates visibility (worker sees `worker`; leading hand sees `worker`+`supervisor`/QC).
- **Worker completion already captures photo + note** (`WorkerTasks.jsx` completion sheet → `completion_photo_url` + `completion_notes`). ✅ Built.
- **Schema is ready — NO MIGRATION NEEDED.** `site_tasks` already has: `assigned_to`, `completed_by`, `completed_at`, `completion_photo_url`, `completion_notes`, `sort_order`, `task_audience`, `category`, `priority`, `status`, `created_via`.
- **Diary** (`CarpentryJobDetail.jsx` "Tasks for workers") reads `GET /api/carpentry/jobs/:id/tasks`.

---

## 1. Bug ① — Diary "Tasks for workers" empty while PWA shows the full list (P1) — **freeze-safe fix**
**Root cause (CONFIRMED live):** the server route `server/lib/carpentryRoutes.mjs:986-1003` selects
`"*, employees!assigned_to(id,name), employees!completed_by(id,name)"`. Each embed works alone, but **together PostgREST collides on the auto-alias** →
`error 42712: table name "site_tasks_employees_1" specified more than once` → the route **502s for every carpentry job** → the Diary renders "No tasks yet." The **data is fine** (job `848eb79e` "54 Gladstone Rd" has 22 correctly-linked worker tasks) and the **worker PWA is fine** (it doesn't use this dual-embed).
**Fix (1 line + client read):** alias the two embeds so they don't collide:
```js
.select("*, assigned:employees!assigned_to(id, name), completer:employees!completed_by(id, name)")
```
Client (`CarpentryJobDetail.jsx`) then reads `task.assigned?.name` / `task.completer?.name` (used by the sign-off review, §2b). **No schema, no new capability — a hardening bug fix.**
**Test first:** `GET /api/carpentry/jobs/:id/tasks` returns the 21 open tasks (200, not 502) for a seeded carpentry job with `assigned_to`/`completed_by` set. Add to a carpentry-tasks test.

## 2. Bug ③ — task not editable after adding (P2) — **freeze-safe fix**
**Root cause (CONFIRMED):** in `CarpentryJobDetail.jsx` a task row's `onClick` is `toggleDone` (marks done); the only other control is the ✕ delete. There is **no edit handler/modal**.
**Fix:** clicking a task (or a pencil affordance) opens an **edit sheet** to change title / category / priority, saved via the existing `PATCH /api/carpentry/tasks/:id` (confirm its allow-list includes `title,category,priority` — extend if needed; the worker route's allow-list already does). Keep the done-toggle as a distinct control (checkbox), so click-to-edit doesn't fight complete. Small UI addition, no schema.

---

## 3. Capabilities (② + differentiation) — **freeze-gated build (needs your greenlight); NO migrations**
All fields exist; this is wiring + UI, but it is **new capability**, so it's parked under the freeze until you greenlight.

| # | Capability | What exists | What's needed | Lift |
|---|-----------|-------------|---------------|------|
| **2a** | Diary shows the SAME list as PWA + **drag-reorder** | after ① fix, diary shows tasks; `sort_order` exists; PWA already drags | add DnD to the diary rows → `PATCH sort_order` (mirror PWA) | S |
| **2b** | **Sign-off review** in diary (who/when/photo/notes) | route embeds `completer` + `completion_photo_url` + `completion_notes` (after ① fix) | render per-task: completed-by name, date+time, photo thumbnail (signed URL), notes | S–M |
| **2c** | Worker adds **photo + comment** on completion | **ALREADY BUILT** in the worker PWA completion sheet | verify + surface those in 2b; likely no new worker-side work | (done) |
| **2d** | **Assign a worker to a task from the PWA** (leading hand on-site) | `assigned_to` settable from desktop (Operations/Carpentry "Assign to"); **not** from PWA | leading-hand-only "assign" affordance on a task row → worker-token route to set `assigned_to` (guard: `is_leading_hand`) | M |

### Supervisor-vs-worker differentiation (your "not much difference" observation)
**Reframe:** in the PWA it's **worker vs leading_hand**, and today a leading hand's app is just a worker's + "+Add task" + drag handle + QC visibility → hence "not much difference." Meaningful differentiation (recommended, freeze-gated):
- **Leading hand gets a light "crew/team" layer**: assign tasks to crew (2d), see per-task **sign-off status** (who's done what), and **QC sign-off** surfacing — while the **plain worker app stays dead-simple** (complete + photo + note only). That is the real worker↔leading-hand distinction the spec intends but hasn't fully surfaced.
- The **office supervisor** experience is the **desktop `/supervisor` + the Carpentry diary** (this plan's 2a/2b give them the review surface) — separate from the PWA.

---

## 4. Recommended batching
1. **Batch F (freeze-safe, do now with approval):** ① embed-alias fix + ③ edit sheet + a carpentry-tasks regression test (① returns 200 not 502; edit persists). These are bug fixes — no schema, no new capability.
2. **Batch C (capability, needs greenlight):** 2a diary reorder → 2b sign-off review → 2d PWA leading-hand assign → the leading-hand differentiation layer. No migrations. Test-first each.

## 5. Open questions for you (before Batch C)
1. **One completion photo or several?** `completion_photo_url` is a single URL today. Multiple photos = a small schema add (a `site_task_photos` table) — the only place a migration would be needed. Keep single for v1?
2. **"Supervisors in the PWA assign workers"** — do you mean the **leading hand** assigns from the PWA (2d), or a **new supervisor PWA view**? (Office supervisors are desktop today.)
3. **Diary review** — read-only sign-off review, or also editable/reorderable there? (You said "drag to reorder the same as PWA" + "review who signed off" — so both, per 2a+2b.)
4. **Gamify** — keep the restrained set (ring/haptic/bars/payoff), or is there a bigger gamify direction you want defined? (No gamify design exists in the specs; only the light code set.)

## 6. Coordination / no-touch
- Isolated on `carpentry/worker-tasks`. Files in scope: `server/lib/carpentryRoutes.mjs`, `src/pages/CarpentryJobDetail.jsx`, `src/pages/worker/WorkerTasks.jsx`, a carpentry-tasks test. **No overlap with the geocoding agent (ops/sales)** or the ops-redesign work — **won't push near them.**
- **No migrations** → no migration-number conflict with anyone.

---
**Recommendation:** approve **Batch F** (① + ③ — pure bug fixes, safe under freeze) so the Diary works + tasks are editable now; and **greenlight Batch C** (capabilities, no schema) when you're ready — answering Q1–Q4 first.
