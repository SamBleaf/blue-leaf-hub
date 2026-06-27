# W17-P4b — Planner drag-drop + colour redesign — BUILD PLAN

**Status:** 📋 Plan for review. **No code yet.** Build starts only on Sam's approval of this plan.
**Supersedes:** the W17-P4 "no drag/drop in P4" default (P4-minimum stays as the committed, accepted base; this is a follow-on phase that replaces the Planner's inline "allocation bar" editor with a drag-and-drop, colour-coded model).
**Owner:** Workforce stream (Sam-directed). Cursor continues general hardening in parallel — coordinate on `package.json`/lock + migration number.
**Cadence:** one combined build → test → regression → report → Sam review (per Sam's "one phase, all at once" choice).

---

## 1. Goal

Make the Planner genuinely usable for moving shifts around: a **colour-coded legend of current jobs** above the employee × week grid, where you **drag a job colour into a worker's day** to assign, **drag a shift** to move it, **drag a shift sideways across the week** to duplicate/deduct across days, and remove with an **×**. Every job keeps its own colour everywhere so the week reads at a glance. Remains **advisory only** (no timesheets/approvals/Buildxact) and **admin/supervisor only**.

## 2. Locked decisions (from Sam, 2026-06-27)

| # | Decision | Implication |
|---|----------|-------------|
| D1 | **@dnd-kit** drag engine | New frontend dependency (`@dnd-kit/core` + `@dnd-kit/utilities`, ~10kb). Touch + mouse + keyboard. Touches `package.json`/lock |
| D2 | **Pick + save a colour per job** | **Backend addition required**: migration `118_workforce_planner_job_colors` + colour GET/PUT routes. Hybrid: auto-default colour until a colour is picked + saved |
| D3 | **Drag the chip's edge across days** (Excel-style fill) | Custom pointer tracking over cells during a fill-drag; covers "duplicate" (drag out) and "deduct" (drag back) |
| D4 | **One phase, all at once** | Deliver migration + colour routes + full DnD UI + tests + docs in a single build + review |

## 3. Architecture overview

- **Frontend:** rewrite `src/pages/workforce/WorkforcePlannerTab.jsx` around `@dnd-kit`. A draggable **job legend**, droppable **day cells**, draggable **shift chips**. A small colour helper `src/lib/plannerColors.js` (palette + deterministic auto-assignment). Optional small sub-components (`PlannerLegend`, `PlannerCell`) kept in the workforce folder if the file gets large.
- **Backend (allocations):** **reuse** the existing W16 routes unchanged — `POST` (create), `PUT` (move: change employee/date), `DELETE` (remove). No change to allocation routes.
- **Backend (colours):** **new** — migration 118 + two additive routes in `workforceRoutes.mjs`.
- **Data:** one allocation per (employee, day) stays enforced by `workforce_allocations`' unique constraint (mig 117). Colour is per-job, stored in the new table, defaulted client-side until set.

## 4. Backend — migration 118 (`workforce_planner_job_colors`)

Isolated, additive — does **not** add a colour column to the canonical `projects`/`carpentry_jobs` tables (a planner display preference is not a canonical job fact; keeps it out of the Canonical Data Law surface).

```sql
-- supabase/migrations/118_workforce_planner_job_colors.sql
create table if not exists workforce_planner_job_colors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  carpentry_job_id uuid references carpentry_jobs(id) on delete cascade,
  color text not null,                         -- palette key, e.g. 'blue' | 'teal' | hex
  created_by uuid,
  updated_at timestamptz not null default now(),
  constraint wpjc_one_job check (
    (project_id is not null and carpentry_job_id is null) or
    (project_id is null and carpentry_job_id is not null)
  )
);
create unique index if not exists wpjc_project_uniq    on workforce_planner_job_colors(project_id)        where project_id is not null;
create unique index if not exists wpjc_carpentry_uniq  on workforce_planner_job_colors(carpentry_job_id)  where carpentry_job_id is not null;
alter table workforce_planner_job_colors enable row level security;  -- deny-all; service-role via API only (mirrors mig 117)
```

> Migration is **applied manually by Sam** (standing rule). Until applied, the colour routes degrade gracefully (see §9) and the Planner uses auto-colours only. **Verify 118 is still free before applying** (Cursor may also be adding migrations).

## 5. Backend — colour routes (additive, in `workforceRoutes.mjs`)

Both `requireAuth` + `requireRole("admin","supervisor")`, near the allocation routes. **No protected path touched.**

| Method | Path | Body / behaviour |
|--------|------|------------------|
| `GET` | `/api/workforce/job-colors` | Returns `{ colors: [{ projectId?, carpentryJobId?, color }] }` (all saved colours). If the table is missing → returns `{ colors: [] }` (graceful) |
| `PUT` | `/api/workforce/job-colors` | Body `{ projectId? \| carpentryJobId?, color }` (XOR). Upsert one job's colour. 400 on non-XOR; 409/clean upsert on conflict |

## 6. Backend — allocation operations (REUSE, no change)

| Planner gesture | Existing route | Notes |
|-----------------|----------------|-------|
| Assign (legend → cell) | `POST /api/workforce/allocations` | `{ allocationDate, employeeId, projectId\|carpentryJobId }`. 409 `DUPLICATE_ALLOCATION` if occupied |
| Move (chip → empty cell) | `PUT /api/workforce/allocations/:id` | `{ allocationDate, employeeId }` only — job unchanged, so the PUT cross-type merge quirk is **not** hit |
| Move (chip → occupied cell) | **swap** = `DELETE` + `POST` ×2 (or temp-date PUT) | See §8; unique(employee,date) forbids two-in-a-cell mid-swap |
| Fill across days | `POST` per newly-covered day | One create per day the drag covers |
| Deduct (drag back) | `DELETE` per uncovered day | Remove days the drag retracts from |
| Remove (× / drag-off) | `DELETE /api/workforce/allocations/:id` | |

## 7. Frontend — structure

- **`@dnd-kit/core`**: `DndContext` wrapping the tab; `useDraggable` on legend job-chips + shift chips; `useDroppable` on each day cell; `DragOverlay` for the floating chip.
- **`src/lib/plannerColors.js`** (new helper): the 10-colour palette (curated, accessible, dark-mode-safe), `autoColorForJob(jobKey, activeJobKeys)` (deterministic by index in the active list), `resolveColor(jobKey, savedColors)` (saved override → else auto).
- **`WorkforcePlannerTab.jsx`** (rewrite): legend (draggable + per-job colour swatch → palette popover → `PUT job-colors`), week grid (droppable cells, draggable chips), fill-drag pointer tracking, notes popover on chip click, the advisory banner + week nav retained from P4.

## 8. Interaction model (detailed)

1. **Assign** — drag a legend job-chip onto a cell. Empty → `POST`. Occupied → replace (delete existing + post new) with the new job.
2. **Move** — drag a shift chip onto another cell. Empty → `PUT {employeeId, allocationDate}`. Occupied → **swap** the two cells' jobs (delete both, recreate both swapped; surface partial-failure).
3. **Fill across days (D3)** — press a shift chip and drag sideways within the **same employee row**; every day the pointer crosses is marked covered. On release: `POST` for newly-covered days, `DELETE` for days retracted ("deduct"). The origin day is preserved.
4. **Remove** — hover a chip → **×** (click) deletes; (optional) drag a chip onto a small trash drop-zone.
5. **Notes** — click (not drag) a chip → tiny popover to edit optional notes (`PUT notes`) + a remove button. This replaces the disliked allocation bar without losing notes.
6. **Colour pick (D2)** — click a job's swatch in the legend → 10-colour palette popover → `PUT job-colors` → all that job's chips recolour live.

## 9. Colour system

- **Palette:** 10 curated, distinct, dark-mode-safe colours (blue, teal, amber, purple, coral, pink, green, gray, plus 2). Each = a fill tint + a text/contrast pair.
- **Auto-default:** a job with no saved colour gets one deterministically by its index in the active-jobs list, so the legend is never colourless.
- **Manual override (saved):** picking a colour writes `workforce_planner_job_colors`; saved colours win over auto.
- **Graceful degradation:** if migration 118 isn't applied yet, `GET job-colors` returns `[]` and `PUT` fails softly — the Planner still works with auto-colours, no errors shown.
- **>10 active jobs:** palette cycles; the legend label disambiguates collisions. (Noted as acceptable; revisit if it bites.)

## 10. File scope (allowed)

```
supabase/migrations/118_workforce_planner_job_colors.sql        (new)
server/lib/workforceRoutes.mjs                                   (additive: 2 colour routes only)
src/pages/workforce/WorkforcePlannerTab.jsx                      (rewrite to DnD)
src/lib/plannerColors.js                                         (new helper)
package.json + package-lock.json                                 (add @dnd-kit/core + @dnd-kit/utilities)
scripts/batch-a/w17-planner-dnd.mjs + run-w17-planner-dnd.mjs    (new tests)
docs/qa/{W17_WORKFORCE_REMAINING_PHASE_PLANS, WORKFLOW_TEST_MATRIX, 30_DAY_HARDENING_TRACKER, BUG_REGISTER, workflows/15_*}.md
```

## 11. Rules / protected paths / coordination

- **Do not touch** (protected): `syncTimesheetToBuildexact`, `approveSingleTimesheet`, `/timesheets/:id/approve|/sync|/sync-pending`, `/api/worker/timesheets`, `WorkerLogHours.jsx`, `workerFetch.js`, `buildexactClient.mjs`, `buildexactDeepIntegration.mjs`. The colour routes are additive and far from these.
- **Allocation routes**: reuse only — no change to POST/PUT/DELETE allocations.
- **Cursor coordination**: `package.json`/lock + the migration number are the collision risks — re-diff before editing, append-only on shared docs, never revert Cursor's work. No commit, no deploy.
- **Advisory-only invariant** must hold: the Planner calls only `/api/workforce/allocations*`, `/api/workforce/job-colors`, `/api/workforce/employees`, `/api/operations/projects`, `/api/carpentry/jobs` — never a timesheet/approve/sync/Buildxact path (tested).

## 12. Build order (within the single phase)

1. Migration 118 file (Sam applies) + colour routes + graceful fallback.
2. `plannerColors.js` palette + helpers.
3. Add `@dnd-kit` deps.
4. Rewrite `WorkforcePlannerTab.jsx`: legend + droppable grid + chips (assign + move first).
5. Swap-on-occupied, then fill-across-days + deduct (the hardest), then notes popover + colour picker.
6. Tests + manual smoke + regression + docs.

## 13. Test plan — `w17-planner-dnd` (W17-REQ-PLAN-DnD-NN)

Backend operations are API-tested; drag gestures themselves are static-wired + manual-smoke (can't drive pointer DnD in Node).

| ID | Assertion | Mode |
|----|-----------|------|
| DnD-01 | Legend wiring: `@dnd-kit` imported, legend renders active jobs, colour swatch + picker present | static |
| DnD-02 | Assign: `POST` allocation creates a row for employee/day (project XOR carpentry) | write |
| DnD-03 | Move (empty): `PUT {employeeId, allocationDate}` moves the shift; job preserved | write |
| DnD-04 | Move (occupied) = swap: two cells exchange jobs; both survive | write |
| DnD-05 | Fill across days: N posts create N days; deduct deletes retracted days | write |
| DnD-06 | Remove: `DELETE` removes the shift; gone on reload | write |
| DnD-07 | Colour persistence: `PUT/GET job-colors` upserts + returns; XOR enforced; one-per-job | write (skips clean if mig 118 not applied) |
| DnD-08 | Advisory-only: Planner calls allocation/colour/list routes only — no timesheet/approve/sync/Buildxact | static |
| DnD-09 | Duplicate guard intact: a collision still returns 409 `DUPLICATE_ALLOCATION` | write |
| DnD-10 | Admin/supervisor only: colour routes + tab gated; employee → 403 on colour PUT | write |

All `--write` artifacts use `__BLH TEST__` via `buildTestJobAddress()`. DnD-07 **gap-documents** (not fails) if migration 118 isn't applied yet.

## 14. Manual smoke (browser, can't be automated)

Drag legend→cell (assign) · drag chip→empty (move) · drag chip→occupied (swap) · drag across the week (fill) · drag back (deduct) · × (remove) · click chip (notes popover) · pick a job colour (persists + recolours) · prev/this/next week · advisory banner present · admin-only.

## 15. Regression gate

`test:w17-planner-dnd:write` + `test:w17-planner-baseline:write` (the prior 12) + `test:w16-allocation-baseline:write` (14) + `test:w15-timesheet-auth:write` (19) + `npm run build` + `npm run lint` + `npm run test:cleanup-artifacts` (dry-run only, never `--confirm`).

## 16. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Fill-across-days pointer tracking (D3) is the trickiest part | Build assign+move first (green), then layer fill; cover days as a Set on dragOver, reconcile on drop |
| Swap-on-occupied vs unique(employee,date) constraint | delete-both + recreate-both-swapped; surface partial-failure + reload |
| `@dnd-kit` touch + PWA bundle | ~10kb, well under the 4 MiB workbox cap; @dnd-kit is touch-first |
| Migration 118 number / `package.json` collide with Cursor | Re-diff immediately before editing; verify 118 free before apply |
| Colour feature half-works before mig 118 applied | Graceful degradation to auto-colours; DnD-07 gap-documents |
| Non-atomic multi-step ops (swap, fill) | Always `loadAllocations()` after; show clear error; advisory-only so no money/timesheet risk |

## 17. Open questions / defaults (confirm or accept)

1. **Move onto an occupied cell** → default **swap** (vs replace, vs block). Accept swap?
2. **Fill scope** → default **same employee row only** (cross-row drag = move to another person). Accept?
3. **Notes** → keep, via a click-popover on the chip (not the old bar). Accept (vs drop notes for v1)?
4. **>10 active jobs** → palette cycles + labels disambiguate. Accept (vs a bigger palette)?

(Reasonable defaults chosen; I'll proceed on these unless you say otherwise.)

## 18. Definition of done

Legend with per-job colours (auto-default + pick/save) · colour-coded grid chips · drag-to-assign · drag-to-move · swap-on-occupied · drag-across-to-fill (+ deduct) · remove · notes popover · advisory-only preserved · admin/supervisor only · `w17-planner-dnd` green + baseline 12 + W16 14 + W15 19 + build + lint + cleanup all green · migration 118 written (awaiting Sam apply) · 5 docs updated · adversarial read-only verification of the advisory boundary + protected paths.

## 19. Footer

```
Next safe action:
Review this build plan + the 4 open-question defaults, then approve W17-P4b build.

Blocked by:
W17-P4b plan approval (+ Sam applies migration 118 for colour persistence to go live).

Code changed: no
Tests changed: no
Docs changed: yes (this plan)
```
