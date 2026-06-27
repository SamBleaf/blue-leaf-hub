# Workflow 15 — Workforce / Timesheets / Buildxact Work Orders

**Status:** Mapped (2026-06-25) — documentation only  
**Related:** [13_SITE_OPERATIONS_DIARY_MEDIA.md](./13_SITE_OPERATIONS_DIARY_MEDIA.md), [04_ESTIMATE_BUILDXACT_TENDER_SETUP.md](./04_ESTIMATE_BUILDXACT_TENDER_SETUP.md), [BATCH_C_REVIEW_PACK.md](../BATCH_C_REVIEW_PACK.md)

**Starts after:** Team setup (`employees`), worker magic links  
**Hands off to:** Buildxact labour actuals, Finance CC labour views, Carpentry costing (W21)

---

## 1. Business purpose

Replace **Deputy** with Hub-native **timesheets**: worker PWA log → supervisor review → **admin approve** → optional **Buildxact Work Order** push for job costing. Includes site tasks co-located in workforce routes.

**Verified from docs:** `WORKFORCE_DEPLOY_HANDOFF_2026-06-22.md`, `WORKFORCE_DEPLOYMENT_TEST_2026-06-16.md` (NO-GO at test date)

---

## 2. Start trigger

| Trigger | Surface |
|---------|---------|
| Worker logs hours | `/worker/timesheet/log` |
| Worker submits week | Worker PWA |
| Admin approves | `/workforce` Approvals tab |
| Buildxact sync | Auto (if mode) or manual admin sync |
| **NOT on win** | No auto timesheet seed |

---

## 3. End state

| End state | Store |
|-----------|-------|
| Timesheet approved | `timesheets.status = approved` |
| Cost computed | `timesheet_entries.cost_amount` |
| Buildxact WO created | `timesheets.buildexact_work_order_id` |
| WO completed in BX | `buildexact_completed_at` |
| Site task done | `site_tasks.status` + photo |

---

## 4. Primary users

| User | Role |
|------|------|
| Site workers | PWA log/submit |
| Supervisors | Mass fill, reject, carpentry attribute — **cannot approve** |
| Admin | Approve, BX sync, employee CRUD |
| Finance | Labour rollups via project/Finance CC |

---

## 5. Current UI surfaces

| Screen | Route | File |
|--------|-------|------|
| Workforce hub | `/workforce` | Approvals, Snapshot, Mass Fill, History |
| Team directory | `/workforce/team` | `WorkforceTeam.jsx` |
| Worker PWA | `/worker/*` | Log, tasks, week view |
| Ops project labour | `/operations/:projectId` | Labour tab |
| Job Command Centre | `/finance/...` | Labour rollup |
| Carpentry job | `/carpentry/:jobId` | Carpentry labour |

---

## 6. Backend routes / APIs

**Registrar:** `server/lib/workforceRoutes.mjs` (~37 routes)

| Area | Routes |
|------|--------|
| Settings | `GET/PUT /api/workforce/settings` (`buildexact_sync_mode`) |
| Employees | CRUD `/api/workforce/employees`, worker-link |
| Timesheets | pending, approve, reject, unapprove, mass-fill, mass-approve, export |
| Buildxact | `/timesheets/:id/sync`, `/timesheets/sync-pending` (admin) |
| Worker PWA | `/api/worker/me`, projects, jobs, timesheets, tasks, photos |
| Site tasks | `/api/projects/:id/site-tasks` (shared with W13) |
| Labour | `GET /api/projects/:id/labour` |
| **Allocations (W16-A1)** | `GET/POST/PUT/DELETE /api/workforce/allocations`, crews CRUD, `GET /api/worker/allocations/today\|week` |

**Buildxact:** `buildexactClient.mjs` — `createPurchaseOrder` (Work Order type), `completePurchaseOrder`

---

## 7. Database tables

| Table | Migration | Notes |
|-------|-----------|-------|
| `employees` | 059, 084, 086, 100 | Staff + BX contact id |
| `timesheets` | 059, 065, 087, 098 | `project_id`, `carpentry_job_id`, BX WO id |
| `timesheet_entries` | 059 | Hours, categories, photos |
| `workforce_settings` | 059, 084 | Cost codes, BX sync mode |
| `site_tasks` | 059+ | XOR project/carpentry |
| `carpentry_jobs` | 065 | Subsidiary labour spine |
| `workforce_crews` | **117** | Reusable crews (W16-A1) |
| `workforce_crew_members` | **117** | Crew roster |
| `workforce_allocations` | **117** | Daily allocation — advisory, not timesheet gate |

**RLS:** Migration **111** lockdown — API service-role only.

---

## 8. External integrations

| Integration | Status |
|-------------|--------|
| **Buildxact / Buildexact** | **Primary** — Work Orders on approve/sync |
| **Deputy** | **Zero code** — documented replacement |
| **Xero** | **Not connected** to workforce — Finance invoices only |
| **Company cost model** | `costModelService.mjs` on approve |
| **W16 allocations** | **Additive (W16-A1)** — `workforce_allocations` advisory; does not gate timesheets |

---

## 9. Source of truth

| Fact | Store |
|------|-------|
| Hours logged | `timesheet_entries` |
| Approval state | `timesheets.status` |
| Labour cost push | Buildxact WO (external) + `cost_amount` local |
| Site tasks | `site_tasks` |
| Carpentry labour | `carpentry_job_id` spine |
| Daily crew allocation (W16-A1) | `workforce_allocations` — optional; worker timesheet independent |

---

## 10. Happy path

1. Admin sets up employees + worker magic links.
2. Worker selects project (or carpentry job) → logs hours → submits.
3. Admin Approvals tab → approve → cost computed.
4. If auto BX mode → `syncTimesheetToBuildexact` → WO create + complete.
5. Finance/Ops views show approved labour rollup.

---

## 11. Failure paths

| Failure | Evidence |
|---------|----------|
| Supervisor cannot approve | API `requireRole("admin")` — UI gated admin-only (**W15-DRIFT-001 fixed P0-C3**) |
| BX not configured | Sync skipped; flags on timesheet |
| Dual project + carpentry ids | PATCH can set both — attribution risk — **W15-DRIFT-002** |
| Migration 111 not applied | RLS breaks direct Supabase access |
| Deputy cutover | Documented NO-GO parallel-run |

---

## 12. Manual workarounds

- Admin must approve (supervisors reject/mass-fill only).
- Manual "Sync to Buildexact" when sync mode manual.
- Carpentry vs builder jobs — pick correct site in worker picker.

---

## 13. Cross-module dependencies

| Module | Link |
|--------|------|
| W09 | `projects.job_id` for worker project list |
| W13 | Site tasks in same routes file |
| W21 | Carpentry jobs parallel spine |
| Finance | Labour rollups; no Xero timesheet export |
| W04 | `buildexact_job_id` on jobs/projects |

---

## 14. Data ownership

| Table | W15 owns |
|-------|----------|
| `timesheets` / `timesheet_entries` | Workforce |
| `employees` | Workforce |
| `site_tasks` | Shared W13/W15 |
| `workforce_settings` | Workforce |

---

## 15. Current tests

| Test | Status |
|------|--------|
| `test:w15-timesheet-auth:write` | **passes** — 19/19 (P0-C3 Option B) |
| `test:w16-allocation-baseline:write` | **passes** — 14/14 (W16-A1 closed 2026-06-26) |
| E2E worker PWA | **missing** (M9 in deploy checklist) |
| WORKFORCE_DEPLOYMENT_TEST | Manual NO-GO 2026-06-16 |
| SOP 10-* | untested |

---

## 16. Missing tests

| ID | Purpose |
|----|---------|
| W15-API-01 | Worker submit → admin approve |
| W15-API-02 | BX sync creates WO |
| W15-API-03 | Supervisor reject vs approve permission |
| W15-API-04 | Carpentry vs project XOR on site tasks |
| W15-API-05 | Labour rollup excludes double-count |
| W15-E2E-01 | Worker PWA log → approval smoke |

---

## 17. Confirmed drift items

| ID | Risk |
|----|------|
| **W15-DRIFT-001** | Supervisor approve UI/API mismatch — **fixed P0-C3 Option B** |
| **W15-DRIFT-002** | Dual carpentry + project id on timesheets |
| **W15-DRIFT-003** | No E2E; Deputy replacement not production-verified |
| **W15-DRIFT-004** | Xero not receiving timesheets |
| **W15-DRIFT-005** | Site tasks ownership split across modules |

---

## 18. Unconfirmed risks

- BX WO duplicate on re-sync after unapprove.
- Payroll export requirements beyond BX.

---

## 19. P0 candidates

| Item | Notes |
|------|-------|
| W15-API-01 approve baseline | Core loop untested |
| Clarify supervisor approve in UI | Doc/training or API fix — **Sam decision** |
| Migration 111 deploy verification | Ops |

---

## 20. P1/P2 candidates

| Item | Priority |
|------|----------|
| `labourAttribution.mjs` guards on all rollups | P1 |
| Worker PWA E2E | P1 |
| Xero payroll export | P2 (if required) |

---

## 21. Sam decisions needed

| ID | Question | Recommended |
|----|----------|-------------|
| **SAM-W15-001** | Allow supervisor approve? | **Document admin-only until BX trust proven** |
| **SAM-W15-002** | Deputy cutover go-live criteria? | **E2E green + parallel run sign-off** |
| **SAM-W15-003** | Xero integration needed for timesheets? | **Document gap — Finance separate** |

---

## 22. Recommended hardening stance

Test approve → BX sync path before Deputy decommission. Fix UI/API supervisor mismatch per Sam decision. Do not expand payroll integrations during Batch C hardening.

---

## 23. Next safe action

W15-API-01 skeleton; confirm migration 111 applied in prod.

---

## Key questions answered

| Question | Answer |
|----------|--------|
| Timesheets stored? | `timesheets`, `timesheet_entries` |
| Who approves? | **Admin only** (API); UI misleading for supervisors |
| Buildxact Work Orders? | **Yes** — on approve/sync via API |
| Xero payroll? | **No integration** |
| Roles/crew/costing? | `employees`, cost codes in settings, `costModelService` |
| Carpentry vs build jobs? | Separate spines; worker picker lists both |
| Labour → job actuals? | Via BX WO complete + local `cost_amount` |
| Failure states? | Rejected, unapprove, BX sync fail flags, needs_review |

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-25 | W15 mapped — Batch C |


---

## W17-P1 — Team tab (2026-06-26)

Team Directory embedded as fifth Workforce tab (`Approvals`, `Snapshot`, `Mass Fill`, `History`, `Team`). Legacy route `/workforce/team` redirects to `/workforce?tab=Team`. No backend or timesheet/Buildxact changes.

**Remaining Workforce rebuild:** [W17_WORKFORCE_REMAINING_PHASE_PLANS.md](../W17_WORKFORCE_REMAINING_PHASE_PLANS.md) — P2 Snapshot → P3 Worker tasks → P4 Planner → P5 RDO → P6 Voice → P7 QC → P8 Launch.

## W17-P2 — Snapshot weekly review (2026-06-26)

`GET /api/workforce/completion-snapshot` extended (read-only): each per-day value is now `{ state, status, hours }` — `state ∈ approved|submitted|rejected|missing|na` (splits the old `done` into approved/submitted via raw `timesheets.status`; `draft`/other → missing bucket, raw kept in `status`); `hours` = Σ `timesheet_entries.hours`. `done`/`missing` counts unchanged. `SnapshotTab` refined: hours/day, distinct state glyphs, previous-week default (Mon–Wed), tolerant of both legacy string and new object values. **No** timesheet-write / approval / sync / Buildxact change. Tests: `test:w17-snapshot-review` (W17-REQ-TS-01..06 + W17-REG-01..05), green; W15 19/19 + W16 14/14 + build green.

## W17-P3 — Worker tasks/job/category + preview (2026-06-26)

**`GET /api/worker/tasks`** now filters `task_audience` server-side: normal workers see only `'worker'` tasks; `employees.is_leading_hand` also sees `'supervisor'` (QC) tasks — closes the D3 leak where QC tasks surfaced to every worker. **`POST /api/worker/tasks/:id/complete`** is gated so a normal worker cannot complete a supervisor/QC task. The worker category whitelist + the `WorkerTasks` dropdown were widened to the mig-114 carpentry labour streams. New **read-only console preview** route `GET /api/workforce/employees/:id/task-preview` (admin/supervisor; decision: NOT `previewEmployeeId` via the worker token) returns the chosen employee's exact task set for a job, applying the same audience + visibility logic so "preview as worker" matches reality. WorkerLogHours submit / workerFetch / Buildxact sync untouched. Tests: `test:w17-worker-tasks` (W17-REQ-TASK-01..06 + W17-REQ-PREVIEW-01..02 + W17-REG), green; W15 19/19 + W16 14/14 + build green.

**Update (2026-06-26 — W17-P3 Product UI, Sam Option B):** the read-only **"Preview as worker"** panel is now wired in `WorkforceTeam` (header button + per-employee "Preview worker view" repointed from the old broken `/worker?preview` path). It has employee + job pickers side-by-side, a Today summary (today's timesheet via `employees/:id/preview`) alongside the Tasks list (via `task-preview`), and is fully read-only. The preview route now also returns the worker's visible jobs (no-job branch) to populate the picker. Tests `test:w17-worker-tasks` **21/21** (added W17-REQ-PREVIEW-UI + W17-REQ-PREVIEW-03); W15 19/19 + W16 14/14 + build + lint clean. **W17-P3 Product UI complete.**

**Finalised (2026-06-26 — Sam Option B spec):** the panel was converted from a modal to an **inline Team-tab panel** (the employee table hides while previewing), with Sam's read-only banner wording ("Read-only preview. This does not use the worker's live token and cannot submit hours or complete tasks."), a selected worker/job/type summary line, the Today summary (status + hours logged + open-task count), and enriched task rows (priority dot · category · status · assigned/unassigned · QC audience label). No backend change this pass (the preview route already returns the jobs from the prior pass). Tests `test:w17-worker-tasks` **22/22** (W17-REQ-PREVIEW-01 route task set · -02 read-only UI · -03 Team panel · PREVIEW-AUTHZ · PREVIEW-JOBS); W15 19/19 + W16 14/14 + build + lint clean. Only `WorkforceTeam.jsx` + the test were touched.

**W17-P4 Planner UI minimum (2026-06-26 — Sam approved: new tab · employee-first · new component):** a new admin/supervisor **Planner** tab (`src/pages/workforce/WorkforcePlannerTab.jsx`) renders an **employee-first Mon–Sun week grid** over the existing **W16 allocation routes** (`GET/POST/PUT/DELETE /api/workforce/allocations`, migration 117) — no backend or schema change. Per cell you can **create / edit / delete** one allocation per employee/day; the job picker is a single **project XOR carpentry** select (`parseJobSpine` enforces XOR server-side); optional notes; **duplicate employee/date is a hard 409** (`DUPLICATE_ALLOCATION`). Editing a cell uses **edit-by-replace** (DELETE + POST on the same employee/date) because the W16 `PUT` route can't swap a cell between a project and a carpentry job (it merges the unset spine side via `??`) — the PUT route was left untouched. The Planner is **advisory only**: a fixed banner states "Planner is advisory only. It does not create timesheets, approve hours, or sync anything to Buildexact," and the component calls only the allocation/employee/project/carpentry list routes — never a timesheet, approve, sync, or Buildxact path (PLAN-06 verifies both the call boundary and that the protected sync routes are intact). Admin/supervisor only (tab gated by `canPlan` in `Workforce.jsx`; routes use `requireRole("admin","supervisor")`). **No** drag/drop, **no** worker-PWA visibility, **no** RDO overlay this phase (deferred). Tests `test:w17-planner-baseline` **12/12** (W17-REQ-PLAN-01..06); W15 19/19 + W16 14/14 + build + lint clean. Files touched: `Workforce.jsx`, new `WorkforcePlannerTab.jsx`, `w17-planner-baseline.mjs` + runner, `package.json`, docs. **W17-P4 Planner UI minimum complete — awaiting Sam review.**

**W17-P4b + P4c Planner drag-drop + colour + board curation (2026-06-27 — Sam approved):** the inline allocation bar was replaced by a **drag-and-drop, colour-coded** model (`@dnd-kit`). **P4b:** a **job legend** (colour chips, drag source); drag a job → cell = **assign**; drag a shift chip → empty cell = **move** (`PUT employee/date`); drag → occupied cell = **swap** (delete both + recreate swapped, explicit partial-failure guards + reload); drag a chip's edge across the row = **fill / deduct** across days; **×** = remove; click a chip = **notes popover**; click a legend swatch = **pick + save a colour** from a 10-colour palette. **P4c:** **opt-in board curation** — a job shows on the board only if added (`on_board`) **or** it has a shift that week (so nothing scheduled disappears); an **"Add jobs"** search picker toggles membership; **global** (shared board). **Seamless moves:** mutations are **optimistic** (instant) with a **silent reconcile** (no `loading` flash) so the page no longer jumps to the top; every error path reverts via a silent re-fetch. **Data:** new isolated **migration 118** `workforce_planner_jobs` (`color` nullable + `on_board`; deny-all RLS — a UI preference, not a canonical job fact) + 2 additive routes `GET/PUT /api/workforce/planner-jobs` (graceful `503 MIGRATION_PENDING` / empty until applied). The W16 allocation routes are **reused unchanged**; the Planner stays **advisory-only** (calls only allocation/planner-jobs/list routes — DnD-08 verifies, protected sync routes intact) and **admin/supervisor only**. New dependency `@dnd-kit/core` + `@dnd-kit/utilities`. Tests `test:w17-planner-dnd` **19/19 + 2 gaps** (colour + board persist gap-document until migration 118 applied); baseline 12/12 + W16 14/14 + W15 19/19 + build + lint clean. Files: `WorkforcePlannerTab.jsx` (rewrite), new `plannerColors.js`, `workforceRoutes.mjs` (+2 routes), migration 118, `w17-planner-dnd` test + runner, `package.json`. **Manual smoke required** (pointer DnD can't be Node-tested). **Migration 118 awaits manual Sam apply** for colour + board persistence to go live.

**W17-P5 RDO + public-holiday display (2026-06-27 — Sam approved: RDO both manual + recurring · seed SA + manual · display-only):** marks non-working days on the Planner grid (greyed/badged cells that are still allocatable). New **migration 119** — three isolated deny-all tables: `workforce_public_holidays`, `workforce_employee_rdo_dates`, `workforce_rdo_patterns`. Additive admin/supervisor routes: public-holidays CRUD + **`POST /seed-sa`** (computus-generated SA holidays — Easter via the Anonymous Gregorian algorithm + nth-weekday rules), employee-RDO CRUD, RDO-pattern CRUD, and a combined **`GET /api/workforce/non-working-days?from&to`** that returns public holidays + manual RDO dates + **week-index-aligned pattern expansion** (e.g. every 2 weeks on Friday). The Planner loads non-working days per week, greys/badges those cells (Hol / RDO), and offers a **"Days off"** panel (seed SA + add/remove holiday; per-employee one-off date + recurring pattern). **HARD RULE — display only:** no accrual, no Xero, no Buildxact, no timesheet impact; cells do not block allocation. Advisory-only + admin/supervisor only; W16 allocation routes and the protected sync/approve paths untouched (graceful `503 MIGRATION_PENDING` / empty until migration 119 applied). Tests `test:w17-rdo-holiday` **11/11 + 2 gaps** (SA-seed + pattern-expand gap-document until mig 119; the computus + fortnightly-Friday math is independently verified); planner-dnd 19/19 + baseline 12/12 + W16 14/14 + W15 19/19 + build + lint clean. Files: `WorkforcePlannerTab.jsx`, `workforceRoutes.mjs` (+P5 routes), migration 119, `w17-rdo-holiday` test + runner, `package.json`. **Snapshot grey-overlay deferred** to a small P5b follow-on (so RDO/holiday days aren't flagged "missing" there). **Migration 119 awaits manual Sam apply.**

**W17-P5b → P8 build push (2026-06-27 — Sam: "push through P5b to P8 then report"):**
- **P5b Snapshot overlay** — the completion Snapshot (`Workforce.jsx`) now fetches `non-working-days` for the shown week, greys RDO/holiday cells (Hol / RDO), and **excludes them from the displayed "missing" count** (client-side; the server snapshot is unchanged). Display-only.
- **P6 voice-to-tasks for building projects** — mirror of the carpentry path: new `POST /api/projects/:id/site-tasks/from-transcript` (returns DRAFT tasks via `splitTranscriptToTasks`, creates nothing); `OperationsProjectDetail` gets a **"🎤 From transcript"** panel (paste → extract → review/untick → save). Keepers save through the existing `POST /site-tasks/bulk` (`created_via: ai_extraction`). v1 = paste only (no Plaud API). Admin/supervisor only. Tests `test:w17-voice-tasks` (VOICE-01 wiring · 02 validation · 03 authz · 04 AI extraction · 05 bulk-save).
- **P7 leading-hand QC** — new `POST /api/projects/:id/site-tasks/apply-qc-template` creates **7 supervisor-audience inspection tasks** (frame/first-fix, roof/trusses, box-gutter, cladding, fixing/second-fix, decking, defects/handover), **idempotent by title**. `OperationsProjectDetail` gets a **"+ QC checklist"** button + an **incomplete-QC warning** ("Leading-hand QC: x/y done"). The worker view shows a **QC** badge on supervisor tasks. The P3 audience gate already restricts QC tasks to leading hands (visibility + completion). Tests `test:w17-qc` (QC-01 apply · 02 idempotent · 03 authz · 04 audience=supervisor/inspection · 05 wiring).
- **P8 deputy-replacement hardening** — new combined gate `test:w17-workforce-gate` runs the **entire workforce surface** (W15 + W16 + W17 P1–P7) in one pass. **Migrations 118 + 119 are now applied**, so colour/board/days-off persistence + SA-holiday seed + RDO pattern-expansion are **verified live** (the earlier migration gaps are now passing). **Gate: 137 pass / 0 fail / 0 gap.** Protected sync/timesheet/Buildxact + the W16 allocation routes are untouched throughout. Per **SAM-W15-002**, the surface is green and ready for the Deputy **parallel-run** sign-off before decommissioning Deputy. New files: `w17-voice-tasks` + `w17-qc` + `run-w17-workforce-gate` (+ runners), `package.json` scripts. **Manual smoke** (pointer drag/drop + AI transcript extraction) still recommended.
