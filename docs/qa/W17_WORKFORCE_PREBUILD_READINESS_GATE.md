# W17 Workforce — Pre-Build Readiness Gate

**Status:** Planning gate (final) — 2026-06-26 · **Owner:** Claude (Workforce stream) · Cursor continues general hardening in parallel.
**Nature:** Documentation only. No code/schema/UI/route changes were made authoring this. No commit/deploy.
**Build loop (every phase):** `phase → test → regression → report → Sam approval → next phase`. Never one uncontrolled big build.

Related: [W17_WORKFORCE_REMAINING_PHASE_PLANS.md](./W17_WORKFORCE_REMAINING_PHASE_PLANS.md) · [SAM_DECISION_LOG.md](./SAM_DECISION_LOG.md) · [WORKFLOW_OWNERSHIP_MATRIX.md](./WORKFLOW_OWNERSHIP_MATRIX.md) · [workflows/15_WORKFORCE_TIMESHEETS_BUILDXACT_WORK_ORDERS.md](./workflows/15_WORKFORCE_TIMESHEETS_BUILDXACT_WORK_ORDERS.md)

---

## 0. Mandatory pre-build code re-check (2026-06-26 — CLEAN)
| Check | Result |
|---|---|
| Cursor touched Workforce files? | `workforceRoutes.mjs`, `Workforce.jsx`, `WorkforceTeam.jsx` modified = the closed W15/W16/W17-P1 work (additive); `WorkerLogHours.jsx`, `workerFetch.js`, `WorkerTasks.jsx`, buildexact clients = **clean** |
| Protected Buildxact sync paths have diffs? | **No** — `syncTimesheetToBuildexact`/`approveSingleTimesheet`/approve/sync/sync-pending/worker-timesheets/worker-link lines not in any diff hunk |
| W17-P2 target safe to edit? | **Yes** — `completion-snapshot` handler (workforceRoutes 578-626) + `SnapshotTab` (Workforce.jsx 741-809) not in any uncommitted hunk |
| W17-P1 Team tab intact? | **Yes** | W16 allocation backend (mig 117) intact? | **Yes** |
| Whole-tree churn | 49 changed tracked files (Cursor hardening) — none in Workforce protected scope |

**Stop-condition check:** none triggered → safe to begin (P2 first), one phase at a time.

---

## 1. Executive summary
W15 (timesheet→Buildxact), W16-A1 (allocation backend, mig 117), W17-P1 (Team tab) are closed (uncommitted, green). Remaining = the launch-readiness sequence W17-P2→P8, converting the accepted map into a controlled per-phase build. The work is overwhelmingly **smallest-safe extension of existing primitives** (task_audience already exists; voice + QC + allocation primitives already exist); only P5 (RDO/holiday tables) is greenfield. Timesheets stay the labour source of truth, allocations stay advisory, Buildxact sync stays protected, workers stay simple.

## 2. Accepted phase order (do NOT revert to Planner-first)
`W17-P2 Snapshot review → W17-P3 Worker tasks/preview → W17-P4 Planner UI → W17-P5 RDO/holiday → W17-P6 Voice-to-task (building) → W17-P7 Leading-hand QC → W17-P8 Deputy hardening`

## 3. Dependency map
- **P7 → P3** (QC needs the P3 server-side `task_audience` filter + leading-hand visibility).
- **P4 → W16-A1** (Planner UI consumes existing allocation CRUD + mig 117; no new backend).
- **P5** = greenfield (new tables); no dependency, but Snapshot/Planner overlays consume it → comes after P2/P4 exist.
- **P6** reuses the carpentry voice pipeline; independent.
- **P8 → all** (smoke + regression over P2-P7 + W15/W16).

## 4. File ownership map (Workforce stream)
| Area | Files |
|---|---|
| Workforce admin UI | `src/pages/Workforce.jsx` (tabs: Approvals/Snapshot/MassFill/History/Team), `src/pages/WorkforceTeam.jsx`, new `src/pages/workforce/WorkforcePlannerTab.jsx` (P4) |
| Worker PWA | `src/pages/worker/WorkerTasks.jsx` (P3/P7), `WorkerHome.jsx`, `WorkerWeek.jsx` — **`WorkerLogHours.jsx` submit flow is protected** |
| Workforce API | `server/lib/workforceRoutes.mjs` (snapshot/worker-tasks/preview/RDO-CRUD/voice handlers per phase) |
| Voice reuse | `server/lib/voiceTasks.mjs`, `supervisorRoutes.mjs` (`parse-voice`) — reuse only |
| QC reuse | `server/lib/carpentryRoutes.mjs` (`SITE_TASK_STAGES`, `apply-template`), `src/pages/CarpentryJobDetail.jsx` (P7 badge) |
| Schema | `supabase/migrations/` (P5 only: two additive tables) |
| Tests | `scripts/batch-a/w17-*.mjs` + `run-w17-*.mjs`, `package.json` |
| Docs | `docs/qa/*` (narrow append) |

## 5. Cursor coordination rules
- Cursor owns RFQ/procurement/PO/schedule/site-diary/WHS/general regression docs + the 30-day tracker/test-matrix/bug-register.
- **Before each phase:** `git status --short` + `git diff --name-only`. If Cursor has changed a file the phase needs → **stop and report** (do not edit a file Cursor is actively modifying).
- Shared QA docs: **narrow, append-style** edits only; never rewrite; never delete Cursor's notes; re-read latest state before editing.

## 6. Protected paths (no phase may modify without a failing regression + Sam approval)
```
syncTimesheetToBuildexact()              server/lib/buildexactClient.mjs / buildexactDeepIntegration.mjs
approveSingleTimesheet()                 POST /api/workforce/timesheets/:id/approve
POST /api/workforce/timesheets/:id/sync  POST /api/workforce/timesheets/sync-pending
POST|GET /api/worker/timesheets(/:date)  src/pages/worker/WorkerLogHours.jsx (core submit)
src/lib/workerFetch.js (token capture)   POST /api/workforce/employees/:id/worker-link
```
Guard: if any phase needs one of these, run `test:w15-timesheet-auth:write` — on fail, revert + escalate to Sam.

## 7–13. Per-phase blocks
*(scope · forbidden · tests · manual smoke · docs · definition-of-done · stop conditions)*

### W17-P2 — Snapshot weekly review
- **Scope (allowed):** `workforceRoutes.mjs` **completion-snapshot handler only** — per-day value string → `{state,status,hours}` (split `done`→`approved`/`submitted` via raw `timesheets.status`; `hours` = Σ `timesheet_entries.hours`); keep working_days, weekStart, missing count, week_start/end/dates/employees. `Workforce.jsx` **SnapshotTab only** — tolerate both string + object (backwards-compat), show hours/day, state map (approved✓green · submitted○blue · rejected↩amber · missing·red · na–grey), previous-week default Mon–Wed (Thu–Sun = current). Keep week nav + Missing column. New tests + `package.json` + `docs/qa/*`.
- **Forbidden:** Worker PWA, Buildxact sync, approve/sync routes, allocations, Planner, RDO, QC, voice, Mass-Fill/Approvals/History tabs, timesheet writes.
- **Tests (`scripts/batch-a/w17-snapshot-review.mjs` + runner):** W17-REQ-TS-01 prev-week completion by employee/day · -02 missing visible · -03 approved/submitted/rejected distinct · -04 hours/day visible · -05 week nav works · -06 working_days controls visible days · W17-REG-01 Approvals tab loads · -02 Team tab loads · -03 W15 passes · -04 W16 passes · -05 Buildxact sync static guard passes.
- **Manual smoke:** admin → Workforce → Snapshot → previous week shows hours/day + approved/submitted/rejected/missing; missing count matches; nav works.
- **Docs:** append result to W17_WORKFORCE_REMAINING_PHASE_PLANS.md + WORKFLOW_TEST_MATRIX.md + 30_DAY_HARDENING_TRACKER.md.
- **DoD:** scope done; forbidden untouched; tests pass; W15+W16 pass; build passes; cleanup dry-run no deletion; docs appended; report-back done; **Sam approves closure**.
- **Stop if:** protected diff appears, Cursor edits SnapshotTab/completion-snapshot, regression/build fails, or work needs files outside scope.

### W17-P3 — Worker tasks/job/category + preview
- **Scope:** `workforceRoutes.mjs` **worker tasks/jobs/preview handlers only** — (a) `GET /api/worker/tasks` add `task_audience='worker'` filter, allowing `'supervisor'` only when `employees.is_leading_hand`; gate `POST /api/worker/tasks/:id/complete` so workers can't complete supervisor tasks; (b) widen the worker category whitelist to the mig-114 labour streams; (c) preview impersonation via existing `GET /api/workforce/employees/:id/preview` (or a `?previewEmployeeId=` read path) so admin sees the selected worker's real task set. `WorkerTasks.jsx` category dropdown. Tests + package.json + docs.
- **Forbidden:** WorkerLogHours submit, Buildxact sync, timesheet writes, Planner, RDO, voice, QC-template creation beyond the audience gate.
- **Tests (`w17-worker-tasks.mjs`):** worker sees only `worker` tasks; leading-hand sees supervisor too; carpentry + building tasks appear for the right job; category filter; preview returns the impersonated worker's set; complete gated for supervisor tasks. + W15/W16/build regression.
- **Manual smoke:** add a carpentry `site_task` → it appears for the assigned worker; a `supervisor` task does NOT appear for a normal worker; admin preview matches.
- **DoD/Stop:** as P2 (+ stop if WorkerLogHours/workerFetch changes are required).

### W17-P4 — Planner UI minimum
- **Scope:** `Workforce.jsx` (add Planner tab) + new `src/pages/workforce/WorkforcePlannerTab.jsx`; **existing W16 allocation routes only**. Week grid employees×Mon-Sun; create/edit/delete one allocation/employee/day; project XOR carpentry picker; duplicate-date conflict display.
- **Forbidden:** new backend routes, schema changes, drag/drop, RDO, worker prefill, timesheet gates, Buildxact.
- **Tests (`w17-planner-baseline.mjs`):** allocation CRUD via UI path; XOR enforced; duplicate-date conflict surfaced; advisory (no timesheet effect). + regression.
- **Manual smoke:** create/edit/delete an allocation in the week grid; confirm it does not touch timesheets.
- **DoD/Stop:** as P2.

### W17-P5 — RDO/public-holiday display model
- **Scope:** new migration(s) `workforce_public_holidays` + `workforce_employee_rdo_dates`; `workforceRoutes.mjs` **RDO/holiday CRUD only**; grey cells in Snapshot/Planner. **Display-only.**
- **Forbidden:** payroll accrual, Xero sync, timesheet creation, Buildxact sync, worker submit flow.
- **Tests (`w17-rdo-holiday.mjs`):** holiday/RDO CRUD; Snapshot/Planner grey-cell render; zero timesheet/cost impact. + regression.
- **Manual smoke:** add a public holiday + an employee RDO → grey cells show; timesheets unaffected.
- **DoD/Stop:** as P2 (+ stop if a migration would touch existing payroll/timesheet data — see §14).

### W17-P6 — Voice-to-task (building projects)
- **Scope:** building-project mirror route (`POST /api/projects/:id/site-tasks/from-transcript`) reusing `voiceTasks.splitTranscriptToTasks`; `OperationsProjectDetail.jsx` (or a small shared `VoiceTaskImport` component) paste→review→save to `site_tasks`. Touch `voiceTasks.mjs` only if a tiny shared helper is genuinely required.
- **Forbidden:** Plaud API, new voice engine, changing the carpentry transcript path (except regression), saving raw long transcripts onto every task, worker timesheet changes.
- **Tests (`w17-voice-to-task.mjs`):** transcript → draft tasks (no DB write until save); save creates `site_tasks` with `created_via='voice_note'`; carpentry path unchanged. + regression.
- **Manual smoke:** paste a transcript on a building project → review → save selected tasks → they appear in the worker/site task list.
- **DoD/Stop:** as P2.

### W17-P7 — Leading-hand QC v1
- **Scope:** `workforceRoutes.mjs` or `carpentryRoutes.mjs` QC-template apply (only if needed, reusing `SITE_TASK_STAGES`/`apply-template`); `WorkerTasks.jsx` leading-hand QC section; `CarpentryJobDetail.jsx` incomplete-QC warning badge. QC tasks = `task_audience='supervisor'`; visible to `is_leading_hand`. Categories: first-fix/framing, roof/trusses, box-gutter framing, external cladding, fixing/second-fix, decking/external, defects/handover.
- **Forbidden:** large QC engine, hard-blocking timesheets, Buildxact, payroll, duplicate task tables.
- **Tests (`w17-qc-leading-hand.mjs`):** QC template applies as supervisor-audience tasks; leading hand sees QC; normal worker does not; incomplete QC = warning not block. + regression. **Requires P3.**
- **Manual smoke:** apply QC template → leading hand sees QC checklist → normal worker doesn't → incomplete QC shows a badge, doesn't block.
- **DoD/Stop:** as P2.

### W17-P8 — Deputy replacement hardening
- **Scope:** tests, docs, smoke scripts, release-readiness docs. Product code only if a failing P8 test proves a small fix is needed **and Sam approves**.
- **Forbidden:** new features; broad changes.
- **Tests/smoke:** the full checklist in §16. + W15/W16 regression.
- **DoD/Stop:** go/no-go (§19) green; Sam approves cutover.

## 14. P5 migration plan (additive, safe)
Two new tables, manual-apply by Sam (Supabase SQL editor), idempotent (`CREATE TABLE IF NOT EXISTS`), RLS deny-all (service-role only):
- `workforce_public_holidays(id, holiday_date date UNIQUE, name text, state text, timestamps)`
- `workforce_employee_rdo_dates(id, employee_id uuid FK employees ON DELETE CASCADE, rdo_date date, notes text, UNIQUE(employee_id, rdo_date), timestamps)`
**No** alteration of `timesheets`/`timesheet_entries`/`employees` payroll columns. Down-migration provided. **Stop** if any migration step would modify existing payroll/timesheet rows.

## 15. Deployment readiness plan
- Each phase ships only after its DoD (incl. Sam closure). No deploy during the sprint (per repo rule).
- Migrations (P5) applied manually by Sam after review (down-script + pre-apply audit).
- Build (`npm run build`) green every phase; cleanup dry-run shows only `__BLH TEST__` artifacts.
- Final deploy readiness = §16 + §19 green.

## 16. Deputy replacement parallel-run checklist (SAM-W15-002)
```
[ ] worker magic-link smoke           [ ] worker install/PWA smoke
[ ] worker log hours                  [ ] worker week view
[ ] worker sees building tasks        [ ] worker sees carpentry tasks
[ ] leading hand sees QC              [ ] normal worker does NOT see restricted QC
[ ] office reviews previous-week Snapshot   [ ] admin approves timesheet
[ ] Buildxact sync regression green   [ ] RDO/public holidays visible
[ ] Planner allocation smoke          [ ] 1–2 week Deputy parallel-run completed
[ ] go/no-go (§19) green before cutover
```

## 17. Exact implementation prompt — W17-P2
> Implement **W17-P2 Snapshot weekly review** as a surgical patch. **Before editing:** `git status --short`; `git diff -- server/lib/workforceRoutes.mjs`; `git diff -- src/pages/Workforce.jsx`. Confirm W16 allocation routes, W17-P1 Team tab, approval/sync routes, `syncTimesheetToBuildexact`, `approveSingleTimesheet`, WorkerLogHours, workerFetch are untouched. If the diff shows active edits inside the completion-snapshot handler or SnapshotTab you can't safely merge, **stop and report**.
> **Edit only:** (1) `server/lib/workforceRoutes.mjs` → `GET /api/workforce/completion-snapshot` handler only. Extend the read-only response so each `days[date]` is `{ state, status, hours }` — `state ∈ approved|submitted|rejected|missing|na` (split today's `done` into approved/submitted by raw `timesheets.status`; returned→rejected); `status` = raw timesheet status or null; `hours` = Σ `timesheet_entries.hours` for that employee+day (0 if none). Keep working_days, weekStart query, `done`/`missing` counts, week_start/week_end/dates/employees. No writes, no new tables, no change to approve/sync.
> (2) `src/pages/Workforce.jsx` → `SnapshotTab` only. Normalise each day value tolerating **both** legacy string and new object (backwards-compat). Render hours/day (cell sub-label or tooltip). State→UI: approved→green ✓, submitted→blue ○, rejected→amber ↩, missing→red ·, na→grey –. Default to previous week on Mon/Tue/Wed, current week Thu–Sun; keep manual nav + Missing column. No RDO/holiday states.
> **Do NOT touch:** sync/approve/worker/allocation/crew/worker-link routes; Team/Approvals/Mass-Fill/History tabs; WorkforceTeam embedded; approval role gating; Buildxact sync buttons. No reformat/reorder/refactor.
> **Tests:** create `scripts/batch-a/w17-snapshot-review.mjs` + `run-w17-snapshot-review.mjs` (markers `__BLH TEST__` via `buildTestJobAddress()`; never legacy markers), `package.json` `test:w17-snapshot-review` (+`:write`), cases W17-REQ-TS-01..06 + W17-REG-01..05.
> **Regression gate:** `npm run test:w17-snapshot-review:write` · `test:w16-allocation-baseline:write` (14/14) · `test:w15-timesheet-auth:write` (19/19) · `npm run build` · `npm run test:cleanup-artifacts` (DRY-RUN ONLY — never `--confirm`).
> **Docs:** narrow append to the W17 phase plan + test matrix + tracker. **No commit/deploy.** Report-back per §"Report back" + footer; await Sam closure.

## 18. Draft prompts — W17-P3 … P8 (refine at each phase start)
- **P3:** Re-diff. Add `task_audience='worker'` filter to `GET /api/worker/tasks` (allow `supervisor` when `is_leading_hand`); gate `/tasks/:id/complete`; widen worker category whitelist + add `WorkerTasks.jsx` dropdown; preview impersonation via `employees/:id/preview`. Tests `w17-worker-tasks.mjs`. Forbidden: WorkerLogHours/workerFetch/Buildxact/timesheet writes. Regression gate.
- **P4:** Re-diff. New `WorkforcePlannerTab.jsx` + Planner tab on existing W16 allocation routes only. Week grid CRUD, XOR picker, duplicate-date conflict. Tests `w17-planner-baseline.mjs`. Forbidden: new backend/schema/drag-drop/RDO/timesheet. Regression gate.
- **P5:** Re-diff. Additive migrations (§14) + RDO/holiday CRUD + Snapshot/Planner grey cells. Display-only. Tests `w17-rdo-holiday.mjs`. Forbidden: accrual/Xero/timesheet/Buildxact. Sam applies migration. Regression gate.
- **P6:** Re-diff. Building `…/from-transcript` mirror reusing `voiceTasks` + paste/review UI. Tests `w17-voice-to-task.mjs`. Forbidden: Plaud API/new engine/carpentry-path change/raw-transcript-on-task. Regression gate.
- **P7:** Re-diff (needs P3). QC-template apply + leading-hand QC section + incomplete-QC badge using existing primitives. Tests `w17-qc-leading-hand.mjs`. Forbidden: big QC engine/hard-block/duplicate tables. Regression gate.
- **P8:** Re-diff. Full smoke (§16) + regression; product code only on a proven failing test + Sam approval.

## 19. Final go/no-go checklist (before Deputy cutover)
```
[ ] P2–P7 each closed with Sam approval
[ ] W15 19/19 + W16 14/14 green on latest
[ ] build green · cleanup dry-run shows only __BLH TEST__ artifacts
[ ] protected Buildxact sync paths unchanged across all phases
[ ] §16 Deputy parallel-run checklist complete
[ ] migrations (P5) applied + verified by Sam
[ ] docs (test matrix / tracker / bug register / workflow-15) current
[ ] no uncommitted-state risk for go-live (Sam decides commit/deploy timing)
```

---
*Authored as a planning artifact. Implementation of W17-P2 begins only on Sam's explicit go-ahead, one phase at a time.*
