# W17 Workforce — UI & Worker-App Specification

**Status:** Planning gate (UI/UX) — 2026-06-26 · **Owner:** Claude (Workforce stream). Planning only — no code/schema/route/UI changes; nothing committed.
**Pairs with:** [W17_WORKFORCE_PREBUILD_READINESS_GATE.md](./W17_WORKFORCE_PREBUILD_READINESS_GATE.md) (technical control) · this doc = the screen-by-screen UX so implementation invents no screens.
**Build loop:** `phase → test → regression → report → Sam approval → next phase`.

**Product principles (preserved):** workers stay simple · admin gets planning/control · timesheets = labour actuals SoT · approved timesheets feed Buildxact · allocations advisory only · site tasks are field tasks (not timesheets) · RDO/public holidays are display rules (not payroll accrual) · Xero = payroll/leave SoT · Buildxact sync protected.

---

## 0. Pre-spec code/diff check (CLEAN)
No implementation started (only the readiness-gate doc is new). Cursor has not edited `WorkerTasks.jsx` (clean) or protected worker/Buildxact files. W17-P2 targets (`SnapshotTab` 741-809, `completion-snapshot` 578-626) clean. `workforceRoutes.mjs`/`Workforce.jsx`/`WorkforceTeam.jsx` = the closed W16/W17-P1 work.

## 1. Executive summary
Two surfaces: the **admin Workforce console** (`/workforce`, desktop-first, admin+supervisor) and the **Worker PWA** (`/worker`, mobile-first, token auth). W17-P2→P8 refine these without new modules. The console gains a **Planner** tab (P4) and small overlays (P5 RDO, P7 QC badge); the worker app gains **category filtering + correct task-audience** (P3), **building voice-to-task** (P6), and a **leading-hand QC** view (P7). Workers stay 4 screens; admins get the planning/control. No screen is invented during build — every screen is specced here with states + tests.

## 2. Final admin Workforce navigation
**Target tab order:** `Approvals · Snapshot · Planner · Mass Fill · History · Team` — **Settings deferred** (rationale below).

| Tab | Purpose | Primary user | Data shown | Allowed actions | Forbidden | Routes | Tests |
|---|---|---|---|---|---|---|---|
| **Approvals** | Review/approve/reject submitted timesheets | Admin (approve), Supervisor (review/reject) | Pending timesheets, hours, carpentry-job attribution | Approve (admin), Reject (admin/super), attribute carpentry job | Supervisor approve; edit worker hours | `GET /timesheets/pending`, `POST …/:id/approve`, `…/reject`, `PATCH …/:id/carpentry-job` | W17-REG-01 |
| **Snapshot** | Weekly "who logged / missing / status / hours" review | Office/admin | Employee×working-days grid + hours + status | Week nav, read | Any write | `GET /completion-snapshot` | W17-REQ-TS-01..06 |
| **Planner** *(P4 new)* | Advisory who's-on-which-site per day | Admin/supervisor | Employee×Mon-Sun allocation grid | Create/edit/delete allocation (advisory) | Timesheet/Buildxact effect; drag-drop | `GET/POST/PUT/DELETE /workforce/allocations` (W16) | W17-REQ-PLAN-01..04 |
| **Mass Fill** | Bulk timesheet entry for a date/project | Admin/supervisor | Employee list + entry form | Bulk upsert entries | Approve; Buildxact | `POST /timesheets/mass-fill` | W17-REG (unchanged) |
| **History** | Approval audit + CSV export | Admin/supervisor | Past timesheets, filters | Export CSV (admin sees cost) | Edit approved | `GET /timesheets`, `…/export.csv` | W17-REG (unchanged) |
| **Team** | Employee directory, worker links, crews | Admin | Employees, is_leading_hand, worker-link, crews | CRUD employee, rotate worker-link, crew CRUD | Timesheet/Buildxact | `…/employees*`, `…/worker-link`, `…/crews*` | W17-REG-02 |

**Settings — DEFER (recommendation):** the global app Settings page already owns workforce settings (`GET/PUT /api/workforce/settings`: working_days, BX sync mode, cost codes). Adding a Workforce **Settings tab** now = scope creep + a second settings home. **Decision:** keep workforce settings in global Settings; crew config lives in **Team**; P5 RDO/holiday admin = a small panel reachable from **Team** (or a lightweight "Calendar" sub-view), not a top-level tab. Revisit a Settings tab only if Sam wants RDO+crew+sync consolidated post-launch.

## 3. Final Worker PWA navigation
**Bottom nav (4, unchanged):** `Today · Log Hours · My Week · Tasks`.

| Screen | Worker sees | Leading hand sees extra | Admin/supervisor preview sees | Reads | Writes | Must NOT write |
|---|---|---|---|---|---|---|
| **Today** (`WorkerHome`) | Greeting, today's hours, open-task count, today's allocation (advisory) | same | the selected worker's Today (read-only) | `GET /worker/me`, `…/allocations/today` | — | anything |
| **Log Hours** (`WorkerLogHours`) | Day picker, hours per job, submit | same | read-only view | `GET /worker/jobs`, `…/timesheets/:date` | `POST/PUT /worker/timesheets` *(PROTECTED — not changed in W17)* | approvals, Buildxact |
| **My Week** (`WorkerWeek`) | Week of logged days, missing flags | same | read-only | `GET /worker/timesheets` | — | approvals |
| **Tasks** (`WorkerTasks`) | Job picker → category → task list; complete worker tasks | **+ supervisor/QC tasks + QC checklist** (P7) | the selected worker's exact task set (read-only) | `GET /worker/jobs`, `…/tasks`, `POST …/tasks/:id/complete`, `…/photos` | task complete + completion photo/note | timesheets; supervisor-task completion (normal worker) |

**WorkerLogHours submit flow is PROTECTED — this spec does not change it.**

## 4. Role / permission matrix
| Capability | Admin | Supervisor | Employee (office) | Worker (token) | Leading hand (worker + is_leading_hand) |
|---|---|---|---|---|---|
| Access `/workforce` console | ✓ | ✓ | ✕ | ✕ | ✕ |
| Approve timesheet | ✓ | ✕ | ✕ | ✕ | ✕ |
| Reject / mass-fill / attribute job | ✓ | ✓ | ✕ | ✕ | ✕ |
| Planner allocation CRUD | ✓ | ✓ | ✕ | ✕ | ✕ |
| Preview-as-worker (read-only) | ✓ | ✓ | ✕ | ✕ | ✕ |
| Log own hours | ✕ | ✕ | ✕ | ✓ | ✓ |
| See worker tasks (`task_audience='worker'`) | preview | preview | ✕ | ✓ | ✓ |
| See supervisor/QC tasks (`task_audience='supervisor'`) | console | console | ✕ | **✕** | **✓** |
| Complete QC task | — | console | ✕ | ✕ | ✓ |
Auth: console = `requireAuth`+`requireRole`; worker = `workerAuth` (magic-link token via `workerFetch`). Leading hand = `employees.is_leading_hand` (worker token, elevated visibility only).

## 5. Snapshot weekly review UI spec (P2)
- **Default week:** Mon/Tue/Wed → previous week; Thu–Sun → current. Manual ←/→ nav + "This week".
- **Employee row:** name (+ "(casual)" tag); one cell per working day (from `working_days`); trailing **Missing** count (red if >0, green 0).
- **Day cell:** state glyph + hours sub-label/tooltip. Backwards-compatible: tolerate legacy string OR `{state,status,hours}` object.
- **State map:** approved→green ✓ · submitted→blue ○ (pending) · rejected→amber ↩ · missing→red · · na→grey – . *(RDO/holiday grey cells are P5, not P2.)*
- **Hours:** show `hours` per cell (e.g. small "8.0"); header shows "{n} of {N} have missing days".
- **Mobile/tablet:** horizontal scroll table (`overflow-x-auto`); sticky employee column; tap cell → tooltip with status+hours.
- **Empty:** "No active employees." **Error:** "Could not load the snapshot." **Loading:** "Loading snapshot…".
- **Smoke:** previous week shows each employee's per-day status + hours; approved vs submitted visibly distinct; missing count matches; nav works.

## 6. Worker Tasks job/category UI spec (P3)
- **Flow:** open Tasks → select **job** (picker from `GET /worker/jobs`) → job type resolved (building/carpentry) → select **category** (dropdown) → task list for that site → complete allowed tasks.
- **Building vs carpentry view:** same layout; job picker indicates type; query branches on `project_id` vs `carpentry_job_id`.
- **Category dropdown:** "All categories" + the mig-114 labour streams (first_fix_framing, cladding, second_fix, …) + general/defect/safety/materials/inspection.
- **Filters:** All / Open / Urgent / Done (existing tabs) — additive to category.
- **Visibility:** open/in-progress tasks that are unassigned OR assigned-to-me, plus done; **normal worker sees only `task_audience='worker'`**; **supervisor/QC tasks hidden**; **leading hand also sees `task_audience='supervisor'`**.
- **Empty:** "No tasks for this site/category." **Error:** "Couldn't load tasks." **Loading:** skeleton list.
- **Smoke:** add a carpentry site_task → appears for the assigned worker on that carpentry job; a `supervisor` task does NOT appear for a normal worker; category filter narrows correctly.

## 7. Worker preview / admin impersonation spec (P3)
**Goal:** admin/supervisor sees exactly what a chosen worker would see for a chosen job — without a worker token.
**Recommended mechanism:** a **read-only, console-authed** route `GET /api/workforce/employees/:id/task-preview?jobId=&jobType=` (`requireAuth`+`requireRole(admin,supervisor)`) that runs the **same** selection logic as `GET /api/worker/tasks` for that `employeeId` (same `task_audience`+`is_leading_hand`+assigned_to+job filters). Reuse/extend the existing `GET /api/workforce/employees/:id/preview@675` rather than inventing a parallel engine.
- **Do NOT** use a `previewEmployeeId` smuggled into the worker token path (avoids confusing preview with real worker-token auth).
- **UI:** in **Team** (or a "Preview as worker" control), pick employee + job → render the worker Tasks list **read-only** with a clear banner: "Preview — read-only; not the worker's live session." No complete/photo actions in preview.
- **Why:** the earlier "carpentry task not showing in preview" came from (a) the missing `task_audience` server filter and (b) preview not impersonating the selected employee/job — both fixed by this route + the P3 filter.

## 8. Planner UI spec (P4)
- **Grid:** rows = active employees; columns = Mon–Sun of the selected week; ← / → / "This week" nav.
- **Cell:** one allocation/employee/day → shows project or carpentry-job label (XOR); empty = unallocated.
- **Actions:** click empty cell → create (pick project XOR carpentry job + optional crew/notes); click filled → edit/delete. **Duplicate-date conflict** surfaced inline (the `UNIQUE(employee_id, allocation_date)` constraint) with a clear message.
- **Constraints:** no drag/drop, no worker prefill, no RDO overlay (P5 adds grey cells later). **Advisory only — never creates timesheets or touches Buildxact.**
- **Empty/error/loading + smoke:** create/edit/delete an allocation; confirm timesheets unaffected; duplicate-date shows conflict.

## 9. RDO / public-holiday UI spec (P5, display-only)
- **Manage public holidays:** small admin panel (under Team or a "Calendar" sub-view) — list + add/edit/delete `{date, name, state}`.
- **Manage employee RDO dates:** per-employee date list (add/remove) in the same panel or the employee drawer.
- **Snapshot/Planner grey cells:** holiday/RDO days render grey "–" with tooltip ("Public holiday: …" / "RDO"); they do **not** count as missing.
- **Workers:** normal workers may see RDO/holiday as greyed/non-working in My Week/Today (display only) — **no accrual, no Xero, no payroll effect.**
- **Empty/error/loading + smoke:** add a holiday + an RDO → grey cells appear in Snapshot/Planner; missing count ignores them; no timesheet/cost change.

## 10. Voice-to-task UI spec (P6, building projects)
- **Entry point:** "Paste transcript → draft tasks" button on `OperationsProjectDetail` (building project), mirroring the carpentry flow. Carpentry flow unchanged (reuse only).
- **Flow:** paste Plaud transcript → "Generate draft tasks" (calls building `…/from-transcript`, reusing `voiceTasks.splitTranscriptToTasks`) → review list (edit title/priority/category, dedupe, deselect) → **Save selected** → creates `site_tasks` (`created_via='voice_note'`). Cancel discards (nothing saved).
- **Token/cost:** Haiku, capped tokens; do not store raw long transcripts on every task (store concise task fields). No Plaud API in v1 (paste only).
- **Empty/error/loading + smoke:** paste → draft → save selected → tasks appear in the site/worker task list; cancel saves nothing.

## 11. Leading-hand QC UI spec (P7)
- **Where:** a **QC** section in Worker **Tasks** visible only when `is_leading_hand` (supervisor-audience tasks), plus an incomplete-QC **warning badge** on `CarpentryJobDetail`.
- **Normal worker:** QC tasks hidden (the P3 `task_audience` filter).
- **QC categories:** First fix/framing · Roof/trusses · Box gutter framing · External cladding · Fixing/second fix · Decking/external works · Defects/handover.
- **Per QC item:** title, optional **photo + note** (required where practical — encourage, don't hard-fail), complete toggle.
- **Incomplete QC = warning, not hard block** (does not block timesheets/handover; surfaces a badge so it's visible). Reuse `SITE_TASK_STAGES`/`apply-template` + `task_audience='supervisor'`.
- **Empty/error/loading + smoke:** apply QC template → leading hand sees QC → normal worker doesn't → incomplete QC shows a badge, never blocks.

## 12. Mobile / PWA constraints
- Worker app mobile-first: fixed bottom nav, `env(safe-area-inset-*)`, ≥44px tap targets, large legible type.
- Offline/poor-signal: show cached last-load + a clear offline banner; **never** silently drop a Log-Hours submit (protected flow — unchanged here).
- PWA auth: magic-link token captured/stored by `workerFetch` must survive home-screen install (protected — not modified).
- Snapshot/Planner (admin) are desktop-first but must horizontal-scroll cleanly on tablet.

## 13. Empty / error / loading states (global rules)
- **Loading:** lightweight text/skeleton, never a blank spinner that can hang (cf. the field-app `supabaseConfigured` bug — always resolve loading in `finally`).
- **Error:** plain-English message + retry where safe; never raw Postgres strings.
- **Empty:** explicit, friendly copy per screen (specified per section above).
- **Auth-expired (worker):** prompt to re-open the magic link, not a crash.

## 14. Manual smoke checklist by screen
```
Snapshot:    prev-week default · per-day status+hours · approved≠submitted · missing count · week nav · mobile scroll
Worker Tasks: job pick · category filter · worker sees only worker tasks · leading hand sees QC · complete worker task · supervisor task hidden
Preview:     admin picks employee+job → sees that worker's real task set, read-only banner, no actions
Planner:     create/edit/delete allocation · XOR job picker · duplicate-date conflict · no timesheet effect
RDO/Holiday: add holiday+RDO → grey cells in Snapshot/Planner · not counted missing · no payroll effect
Voice:       paste → draft → edit/dedupe → save selected → tasks appear · cancel saves nothing
QC:          leading hand sees QC · normal worker doesn't · incomplete = badge not block
Launch:      magic-link · install · log hours · week view · building+carpentry tasks · Snapshot review · approve · BX sync regression · RDO visible · Planner smoke
```

## 15. Test IDs mapped to UI behaviours
| ID | UI behaviour |
|---|---|
| W17-REQ-TS-01..06 | Snapshot: prev-week · missing visible · approved/submitted/rejected distinct · hours/day · week nav · working_days controls days |
| W17-REQ-TASK-01..06 | Tasks: building view · carpentry view · category dropdown · worker-audience filter · leading-hand visibility · complete-gating |
| W17-REQ-PREVIEW-01..02 *(new)* | Preview returns the impersonated worker's exact set · read-only (no writes) |
| W17-REQ-PLAN-01..04 | Planner: create · edit · delete · duplicate-date conflict (advisory, no timesheet effect) |
| W17-REQ-RDO-01..02 | RDO/holiday CRUD · grey cells render + not counted missing |
| W17-REQ-VOICE-01..03 | Draft from transcript · save selected → site_tasks · cancel saves nothing |
| W17-REQ-QC-01..03 | QC visible to leading hand · hidden from normal worker · incomplete = warning not block |
| W17-REQ-LAUNCH-01..03 | Magic-link+install smoke · building+carpentry tasks visible · Snapshot review + approve + BX sync regression |
| W17-REG-01..05 | Regression: Approvals tab · Team tab · W15 · W16 · Buildxact sync static guard |
*(W17-REQ-PREVIEW-01..02 is the only new ID; everything else reuses the planned IDs.)*

## 16. Exact W17-P2 implementation prompt update (UI-complete)
> Implement **W17-P2 Snapshot weekly review** (surgical). **Pre-edit:** `git status --short`; `git diff -- server/lib/workforceRoutes.mjs src/pages/Workforce.jsx`; confirm W16 routes, Team tab, approve/sync, `syncTimesheetToBuildexact`, `approveSingleTimesheet`, WorkerLogHours, workerFetch untouched; if the completion-snapshot handler or SnapshotTab shows active edits you can't merge, **stop and report**.
> **Backend — `completion-snapshot` handler only:** each `days[date]` → `{ state, status, hours }`. `state ∈ approved|submitted|rejected|missing|na` (split `done`→approved/submitted by raw `timesheets.status`; returned→rejected); `status` = raw status or null; `hours` = Σ `timesheet_entries.hours` for that employee+day (0 if none). Keep working_days, weekStart query, done/missing counts, week_start/week_end/dates/employees. Read-only.
> **Frontend — `SnapshotTab` only:** normalise each day tolerating **string OR object** (backwards-compat). Per §5: state map (approved✓green · submitted○blue · rejected↩amber · missing·red · na–grey), hours/day sub-label or tooltip, previous-week default Mon–Wed (Thu–Sun current), keep nav + Missing column + the "{n} of {N} missing" header, mobile horizontal-scroll with sticky employee column. Empty/error/loading per §13. No RDO/holiday states.
> **Forbidden:** worker app, Buildxact sync, approve/sync routes, allocations, Planner, RDO, QC, voice, Mass-Fill/Approvals/History/Team. No reformat/refactor of the two files.
> **Tests:** `scripts/batch-a/w17-snapshot-review.mjs` + `run-w17-snapshot-review.mjs` (markers `__BLH TEST__` via `buildTestJobAddress()`); `package.json` `test:w17-snapshot-review`(+`:write`); cases W17-REQ-TS-01..06 + W17-REG-01..05.
> **Gate:** `test:w17-snapshot-review:write` · `test:w16-allocation-baseline:write` (14/14) · `test:w15-timesheet-auth:write` (19/19) · `npm run build` · `npm run test:cleanup-artifacts` (DRY-RUN ONLY). Narrow doc appends. No commit/deploy. Report-back + footer; await Sam closure.

## 17. Go/no-go checklist before implementation
```
[ ] Admin nav final (Approvals·Snapshot·Planner·Mass Fill·History·Team; Settings deferred) — Sam confirms
[ ] Worker nav final (Today·Log Hours·My Week·Tasks) — Sam confirms
[ ] Role/permission matrix accepted
[ ] Preview mechanism accepted (read-only console route; not worker-token previewEmployeeId)
[ ] Snapshot UI accepted (state map + hours + prev-week default)
[ ] Worker Tasks UI accepted (category + audience filter + leading-hand)
[ ] Planner/RDO/Voice/QC UI accepted at their phase starts
[ ] Test IDs mapped (incl. new W17-REQ-PREVIEW-01..02)
[ ] Protected paths + Buildxact sync untouched
[ ] W17-P2 implementation prompt (§16) accepted → start P2 only
```

---
*Planning artifact. Implementation of W17-P2 begins only on Sam's explicit go-ahead, one phase at a time. Open decisions for Sam: (1) defer the Workforce Settings tab? (2) preview via a dedicated read-only console route?*
