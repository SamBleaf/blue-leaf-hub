# W16 — Workforce Current-Code Alignment Plan

**Date:** 2026-06-22  
**Status:** **W16-A1 closed** · **W17-P1 Team tab closed** (2026-06-26) — mig 117 applied; `test:w16-allocation-baseline:write` **14/14 pass**; W15 regression green  
**Remaining phases:** [W17_WORKFORCE_REMAINING_PHASE_PLANS.md](./W17_WORKFORCE_REMAINING_PHASE_PLANS.md)  
**Mode:** `/harden plan W16-workforce-current-code-alignment` → `/harden implement W16-A1`  
**Related workflow:** [15_WORKFORCE_TIMESHEETS_BUILDXACT_WORK_ORDERS.md](./workflows/15_WORKFORCE_TIMESHEETS_BUILDXACT_WORK_ORDERS.md) (W15 — mapped, P0-C3 closed)  
**Prior plans:** [P0_C3_WORKFORCE_APPROVAL_PLAN.md](./P0_C3_WORKFORCE_APPROVAL_PLAN.md), [WORKFORCE_DEPLOY_HANDOFF_2026-06-22.md](../WORKFORCE_DEPLOY_HANDOFF_2026-06-22.md)

**Naming note:** This document uses **W16** as the rebuild-planning ID for Workforce allocation/planner alignment. Batch D workflow **W16 Finance** is unrelated — do not conflate.

---

## Product principle

```
Workers stay simple.
Admin gets the planning/control layer.
Buildxact sync stays protected.
Existing worker timesheet flow remains the base.
```

### Future admin structure (target — not implemented)

1. Planner  
2. Snapshot  
3. Approvals  
4. Team  
5. History / Sync  
6. Settings  

### Future worker app (target — keep small)

1. Today  
2. Log Hours  
3. My Week  
4. Tasks  

---

## 1. Current Workforce source of truth

| Domain | Source of truth | Evidence |
|--------|-----------------|----------|
| Employee roster | `employees` | Verified from code — `workforceRoutes.mjs`, mig 059 |
| Timesheet state | `timesheets.status` | Verified from code + W15 workflow |
| Timesheet line items | `timesheet_entries` | Verified from code |
| Org labour settings | `workforce_settings` (single row) | Verified from code — auto-upsert on GET |
| Buildxact sync mode | `workforce_settings.buildexact_sync_mode` | Verified from code — mig 084 |
| Buildxact WO lifecycle | `timesheets.buildexact_*` columns | Verified from code — mig 087, 098 |
| Worker magic link | `employees.worker_token` | Verified from code — mig 084 |
| Site tasks (worker + ops) | `site_tasks` | Verified from code — shared with W13 |
| Worker photos | Supabase `site-media` bucket via `siteMedia.mjs` | Verified from code — W13 baseline |
| Labour actuals to Finance CC | Live read of approved `timesheet_entries` | Verified from code — `financeCCRoutes.mjs`; BX push is separate |
| **Allocations / crews / planner** | **Does not exist** | Verified from code — no tables or routes |

**Access pattern:** All workforce tables are **API-only** after mig **111** RLS lockdown (service-role via Express). Verified from migration + deploy handoff.

---

## 2. Existing backend routes

**Registrar:** `registerWorkforceRoutes(app)` in `server/lib/workforceRoutes.mjs`, called from `server/dev-api.mjs` line 921.  
**Total routes inspected:** 37 (verified by grep).

### Backend route map

| Route | Method | Purpose | Auth | Role gate | Reads table | Writes table | External side effect | Protect | Notes |
|-------|--------|---------|------|-----------|-------------|--------------|---------------------|---------|-------|
| `/api/workforce/settings` | GET | Read/seed workforce settings | `requireAuth` | any staff | `workforce_settings` | `workforce_settings` (insert if empty) | No | No | Auto-inserts default row |
| `/api/workforce/settings` | PUT | Update hours/cost codes/BX sync mode | `requireAuth` | admin, supervisor | `workforce_settings` | `workforce_settings` | No | No | `buildexact_sync_mode` writable by supervisor — P2 tighten |
| `/api/workforce/employees` | GET | List employees; cost cols admin-only | `requireAuth` | any staff | `employees` | No | No | No | Strips `worker_token`; exposes `has_worker_link` |
| `/api/workforce/completion-snapshot` | GET | Weekly completion grid (Snapshot tab) | `requireAuth` | admin, supervisor | `employees`, `timesheets`, `workforce_settings` | No | No | No | AU week math via `dateYmd.mjs` |
| `/api/workforce/employees` | POST | Create employee | `requireAuth` | admin | `employees` | `employees` | No | No | |
| `/api/workforce/employees/:id` | PUT | Update employee | `requireAuth` | admin | `employees` | `employees` | No | No | |
| `/api/workforce/employees/:id` | DELETE | Deactivate employee | `requireAuth` | admin | `employees` | `employees` | No | No | Soft deactivate |
| `/api/workforce/employees/:id/preview` | GET | Preview employee detail | `requireAuth` | any staff | `employees` | No | No | No | Cost strip for non-admin |
| `/api/workforce/employees/:id/worker-link` | POST | Generate/regenerate magic link | `requireAuth` | admin | `employees` | `employees` (`worker_token`) | No | **Yes** | Returns `/worker?token=…` URL |
| `/api/workforce/timesheets/pending` | GET | Submitted timesheets for approval | `requireAuth` | any staff | `timesheets`, `timesheet_entries`, joins | No | No | No | Read-scope gap — employee can read (P1) |
| `/api/workforce/timesheets` | GET | Filter/list timesheets (History) | `requireAuth` | any staff | `timesheets`, joins | No | No | No | Read-scope gap (P1) |
| `/api/workforce/timesheets/mass-fill` | POST | Office bulk log hours | `requireAuth` | admin, supervisor | `timesheets`, `timesheet_entries` | same | No | No | |
| `/api/workforce/timesheets/mass-approve` | POST | Bulk approve | `requireAuth` | admin | `timesheets`, `timesheet_entries` | same | **Yes** — BX auto if mode=auto | **Yes** | P0-C3 Option B — admin only |
| `/api/workforce/timesheets/:id/approve` | POST | Approve one; compute costs | `requireAuth` | admin | `timesheets`, `timesheet_entries`, `workforce_settings` | same | **Yes** — BX auto if mode=auto | **Yes** | Protected path |
| `/api/workforce/timesheets/:id/sync` | POST | Manual BX retry/force | `requireAuth` | admin | `timesheets` | `timesheets` (BX cols) | **Yes** — WO create/complete | **Yes** | Protected path |
| `/api/workforce/timesheets/sync-pending` | POST | Bulk push approved-not-completed | `requireAuth` | admin | `timesheets` | via sync fn | **Yes** | **Yes** | Protected path |
| `/api/workforce/timesheets/:id/reject` | POST | Reject with notes | `requireAuth` | admin, supervisor | `timesheets` | `timesheets` | No | No | |
| `/api/workforce/timesheets/:id/unapprove` | POST | Reset approved → submitted | `requireAuth` | admin | `timesheets`, `timesheet_entries` | same | No (flags BX review if WO exists) | No | Admin only |
| `/api/workforce/timesheets/:id` | DELETE | Delete timesheet (admin cleanup) | `requireAuth` | admin | `timesheets` | `timesheets` | No | No | Used by write tests |
| `/api/workforce/timesheets/:id/carpentry-job` | PATCH | Attribute carpentry job | `requireAuth` | admin, supervisor | `timesheets` | `timesheets` | No | No | |
| `/api/workforce/timesheets/export.csv` | GET | CSV export | `requireAuth` | any staff | `timesheets`, entries | No | No | No | Cost col admin-only in CSV |
| `/api/projects/:id/labour` | GET | Approved labour rollup | `requireAuth` | any staff | `timesheet_entries`, `timesheets` | No | BX estimate read best-effort | No | Shared with Ops/Finance |
| `/api/projects/:id/site-tasks` | GET | List site tasks | `requireAuth` | any staff | `site_tasks` | No | No | No | W13 overlap |
| `/api/projects/:id/site-tasks` | POST | Create site task | `requireAuth` | admin, supervisor | `site_tasks` | `site_tasks` | No | No | W13 overlap |
| `/api/projects/:id/site-tasks/bulk` | POST | Bulk create tasks | `requireAuth` | admin, supervisor | `site_tasks` | `site_tasks` | No | No | |
| `/api/site-tasks/:id` | PATCH | Update site task | `requireAuth` | admin, supervisor | `site_tasks` | `site_tasks` | No | No | |
| `/api/site-tasks/:id` | DELETE | Delete site task | `requireAuth` | admin, supervisor | `site_tasks` | `site_tasks` | No | No | |
| `/api/worker/me` | GET | Worker dashboard payload | `workerAuth` | worker token or auth+employee | `timesheets`, `site_tasks`, `workforce_settings` | No | No | No | Strips pay rates |
| `/api/worker/projects` | GET | Active building projects for picker | `workerAuth` | worker | `projects`, visibility logic | No | No | No | |
| `/api/worker/jobs` | GET | Unified project+carpentry job list | `workerAuth` | worker | `projects`, `carpentry_jobs` | No | No | No | |
| `/api/worker/timesheets` | POST | Submit/create timesheet | `workerAuth` | worker own | `timesheets`, `timesheet_entries` | same | No | **Yes** | Protected path |
| `/api/worker/timesheets` | GET | List own timesheets (date range) | `workerAuth` | worker own | `timesheets` | No | No | **Yes** | Protected path |
| `/api/worker/timesheets/:date` | GET | Single day timesheet | `workerAuth` | worker own | `timesheets`, entries | No | No | **Yes** | Protected path |
| `/api/worker/timesheets/:id` | PUT | Edit own timesheet | `workerAuth` | worker own | `timesheets`, entries | same | No | No | Editable until approved |
| `/api/worker/tasks` | GET | Site tasks for selected job | `workerAuth` | worker | `site_tasks` | No | No | No | |
| `/api/worker/photos` | POST | Upload completion photo | `workerAuth` | worker | — | `site-media` storage | Supabase upload | No | via `siteMedia.mjs` |
| `/api/worker/tasks/:id/complete` | POST | Complete site task + photo | `workerAuth` | worker | `site_tasks` | `site_tasks` | Storage | No | |

**Buildxact internal (not HTTP):** `syncTimesheetToBuildexact()` — see §6.

---

## 3. Existing frontend screens

| Screen | Route | File | Current purpose |
|--------|-------|------|-----------------|
| Workforce hub | `/workforce` | `src/pages/Workforce.jsx` | Tabs: Approvals, Snapshot, Mass Fill, History |
| Team directory | `/workforce/team` | `src/pages/WorkforceTeam.jsx` | Employee CRUD, worker links, rate sync |
| Worker Today | `/worker` | `src/pages/worker/WorkerHome.jsx` | Dashboard — today's TS, tasks badge, week link |
| Log Hours | `/worker/timesheet/log` | `src/pages/worker/WorkerLogHours.jsx` | Core timesheet entry flow |
| My Week | `/worker/week` | `src/pages/worker/WorkerWeek.jsx` | Calendar — logged/missing days |
| Tasks | `/worker/tasks` | `src/pages/worker/WorkerTasks.jsx` | Site task list + complete + photo |
| Worker shell | (layout) | `src/components/worker/WorkerLayout.jsx` | Header, offline banner, PWA install hints |

**App registration:** `src/App.jsx` — `/workforce` + `/workforce/team` gated `RoleRoute` admin+supervisor; `/worker/*` public (token auth).

### Frontend screen map

| Screen | Current purpose | Current API calls | Keep / reuse / refactor / add beside | Risk | Notes |
|--------|-----------------|-------------------|--------------------------------------|------|-------|
| `Workforce.jsx` — Approvals | Review + approve/reject submitted TS | `GET pending`, `POST approve/reject`, `PATCH carpentry-job`, carpentry jobs list | **Keep** → maps to future **Approvals** | Low | P0-C3: approve UI admin-only via `can.approveTimesheets` |
| `Workforce.jsx` — Snapshot | Weekly completion grid | `GET /api/workforce/completion-snapshot` | **Keep** → future **Snapshot** | Low | Already named Snapshot |
| `Workforce.jsx` — Mass Fill | Office bulk hours entry | `POST mass-fill`, employee/project lists | **Keep** → absorbed into Planner later | Low | Do not remove in Phase 1 |
| `Workforce.jsx` — History | Past TS + BX sync status | `GET timesheets`, `POST sync`, `sync-pending`, export | **Keep** → future **History/Sync** | Low | BX sync buttons admin-only in UI |
| `WorkforceTeam.jsx` | Roster, worker links, rates | `GET/POST/PUT employees`, `POST worker-link`, cost-model sync | **Keep** → future **Team** (+ Settings split later) | Low | Worker link generation admin-only |
| `WorkerHome.jsx` | Today dashboard | `GET /api/worker/me` | **Keep** → future **Today** | Low | Optional: show allocation chip (Phase 2 UI) |
| `WorkerLogHours.jsx` | Log/submit hours | `GET me`, `GET projects`, `GET timesheets/:date`, `POST timesheets` | **Keep core** — **Protect** | **High** | Prefill-from-allocation is additive only |
| `WorkerWeek.jsx` | Month calendar | `GET /api/worker/timesheets?from&to` | **Keep** → **My Week** | Low | |
| `WorkerTasks.jsx` | Task completion | `GET jobs`, `GET me`, `GET tasks`, `POST complete`, `POST photos` | **Keep** → **Tasks** | Medium | Job picker via `workerJob.js` localStorage |
| `WorkerLayout.jsx` | Shell | — | **Keep** | Low | No bottom nav tabs today — link-based nav from Home |

**Missing screens (future):** Planner tab, dedicated Settings tab, worker bottom nav (optional UX polish — not Phase 1).

---

## 4. Existing worker app flow

```
Magic link (/worker?token=…) or logged-in staff
  → workerFetch captures token → x-worker-token header
  → WorkerHome (/worker)
       ├─ Today's timesheet summary (GET /api/worker/me)
       ├─ Log Hours → WorkerLogHours
       │     ├─ Pick project (GET /api/worker/projects or jobs)
       │     ├─ Load day (GET /api/worker/timesheets/:date)
       │     └─ Submit (POST /api/worker/timesheets)
       ├─ Site tasks badge → WorkerTasks
       │     ├─ Pick job (localStorage workerJob.js)
       │     ├─ List (GET /api/worker/tasks?jobId&jobType)
       │     └─ Complete + photo (POST complete, POST photos)
       └─ My Week → WorkerWeek (GET /api/worker/timesheets?from&to)
```

**Verified from code:** `workerFetch.js`, `WorkerHome.jsx`, `WorkerLogHours.jsx`, `WorkerTasks.jsx`, `WorkerWeek.jsx`.

**No allocation step today** — worker picks job manually each session (`workerJob.js` persists last selection).

---

## 5. Existing database tables

### Data model map

| Table | Purpose | Used by | Keep / reuse / extend | Risk | Notes |
|-------|---------|---------|----------------------|------|-------|
| `employees` | Staff roster, BX ids, worker token | Admin Team, all TS routes, workerAuth | **Keep** | Low | Do not rename; extend only if needed |
| `timesheets` | One row per employee per day | Worker PWA, Approvals, BX sync | **Keep** — **Protect** | **High** | UNIQUE(employee_id, date); carpentry_job_id from mig 065 |
| `timesheet_entries` | Task category lines | Worker log, approve cost calc | **Keep** — **Protect** | **High** | |
| `workforce_settings` | Org defaults, BX sync mode | Settings API, approve, worker/me | **Keep** | Medium | Single-row pattern |
| `site_tasks` | Operational tasks per project/carpentry | Worker tasks, Ops, W13 | **Keep** | Medium | XOR project_id / carpentry_job_id (later mig) |
| `projects` | Building projects | TS project_id, worker projects | **Keep** (read) | Low | Allocation will FK here |
| `jobs` | Tender/job spine | TS job_id, BX resolve | **Keep** (read) | Low | |
| `carpentry_jobs` | Carpentry division jobs | TS attribution, worker jobs | **Keep** (read) | Low | Allocation will FK here |
| `carpentry_job_budgets` | Labour category mapping | BX `resolveCostCategory` | **Keep** (read) | Low | |
| `buildexact_job_sync` | BX job mirror | BX job id resolve | **Keep** (read) | Low | |
| `user_profiles` | Hub roles | requireRole gates | **Keep** | Low | |

**Proposed (Phase 1 — not created yet):** see §14.

---

## 6. Existing Buildxact sync path

**Entry points (protected):**

1. `POST /api/workforce/timesheets/:id/approve` → `approveSingleTimesheet()` → if `buildexact_sync_mode === "auto"` → fire-and-forget `syncTimesheetToBuildexact()`
2. `POST /api/workforce/timesheets/:id/sync` → direct `syncTimesheetToBuildexact(ts, sb, { force })`
3. `POST /api/workforce/timesheets/sync-pending` → loop approved rows → `syncTimesheetToBuildexact()`

**Core function:** `syncTimesheetToBuildexact()` in `workforceRoutes.mjs` (exported for tests).

**Flow (verified from code):**

```
Claim row (buildexact_sync_claimed_at lease, 10 min stale reclaim)
  → Guard: needs_review, already completed, not approved
  → If WO id exists → completeWorkOrder() only (retry completion)
  → Else resolve BX job:
       carpentry_job_id → carpentry_jobs.buildexact_job_id → address fallback
       else project_id → jobs.buildexact_job_id → buildexact_job_sync → address
  → ensureBuildexactContact(employee) — once per employee
  → createPurchaseOrder({ orderType: "Work", isTaxFree: false, items[] })
  → Persist buildexact_work_order_id + buildexact_synced_at
  → Verify line items landed (else buildexact_needs_review)
  → completePurchaseOrder() if BUILDEXACT_COMPLETE_ORDERS enabled
  → Set buildexact_completed_at
  → Release claim (match claimStamp)
```

**Supporting modules:**

- `buildexactClient.mjs` — `createPurchaseOrder`, `completePurchaseOrder`, `beFetch`, contacts
- `buildexactDeepIntegration.mjs` — job sync helpers (not on hot approve path)
- Migrations: **084** sync mode, **087** work_order_id, **098** completion state machine

**Phase 1 rule:** Do not modify `syncTimesheetToBuildexact`, approve auto-feed, or sync routes. W16-REG-01 must prove byte-stable behaviour.

---

## 7. Existing role gates

| Capability | API | UI (`roles.js`) | Notes |
|------------|-----|-----------------|-------|
| Access Workforce module | inline on some routes | `can.accessWorkforce` → admin, supervisor | App.jsx RoleRoute |
| Approve timesheets | `requireRole("admin")` | `can.approveTimesheets` → admin only | P0-C3 Option B — aligned |
| Reject / mass-fill / carpentry attrib | admin, supervisor | supervisor sees actions | Aligned |
| BX manual sync | admin | admin-only buttons in History | Aligned |
| Employee CRUD / worker link | admin | admin in Team panel | Aligned |
| Settings PUT | admin, supervisor | partial — director for BX mode in UI | P2 |
| Worker PWA | `workerAuth` — token → one employee | N/A | No Hub role needed |
| Employee role (site staff) | Can hit some workforce GETs | No Workforce nav | Read-scope gap P1 |
| Client role | Blocked by RLS 111 + no routes | No access | Verified W15 tests |

**Allocation create (planned):** admin + supervisor API; employee/basic blocked — mirrors site-task pattern.

---

## 8. Existing worker token / link flow

| Step | Mechanism | File |
|------|-----------|------|
| Admin generates link | `POST /api/workforce/employees/:id/worker-link` | `workforceRoutes.mjs`, `WorkforceTeam.jsx` |
| Token stored | `employees.worker_token` (unique partial index) | mig 084 |
| URL shape | `{origin}/worker?token={token}` | WorkforceTeam |
| Client capture | URL param → `localStorage blhub_worker_token` | `workerFetch.js` |
| Standalone PWA | Token stripped from URL after capture | `workerFetch.js` |
| API auth | Header `x-worker-token` (not query on API calls) | `workerAuth` middleware |
| Fallback | Logged-in Hub user with linked `employees.user_id` | `resolveWorkerEmployee()` |
| Invalid token | 401 plain English | workerAuth |
| Regenerate | New token invalidates old link | worker-link POST |

**Protect:** `workerFetch.js` token capture/header flow — do not change in Phase 1.

---

## 9. Existing site task / photo flow

| Step | Route | Storage |
|------|-------|---------|
| Admin creates task | `POST /api/projects/:id/site-tasks` | `site_tasks` |
| Worker lists tasks | `GET /api/worker/tasks?jobId&jobType` | `site_tasks` filtered by visibility |
| Worker uploads photo | `POST /api/worker/photos` | `siteMedia.mjs` → `site-media` bucket |
| Worker completes | `POST /api/worker/tasks/:id/complete` | Updates `site_tasks` + photo path |

**W13 baseline:** worker photo path verified; portal photos remain separate (`project_photos`).

**Allocation Phase 1:** site tasks remain independent — allocation does not replace tasks.

---

## 10. What aligns with the new plan

| Future area | Current code | Alignment |
|-------------|--------------|-----------|
| **Snapshot** | Snapshot tab + `completion-snapshot` API | **Strong** — keep as-is |
| **Approvals** | Approvals tab + approve/reject/sync | **Strong** — protected |
| **Team** | `/workforce/team` + employees CRUD | **Strong** — separate route OK |
| **History / Sync** | History tab + BX sync buttons | **Strong** — protected |
| **Worker Today** | `WorkerHome` | **Strong** |
| **Worker Log Hours** | `WorkerLogHours` | **Strong** — base for optional prefill |
| **Worker My Week** | `WorkerWeek` | **Strong** |
| **Worker Tasks** | `WorkerTasks` | **Strong** |
| **Settings** | Settings API + partial Team UI | **Partial** — dedicated tab later |
| **Planner** | Mass Fill only (no calendar/crews) | **Weak** — greenfield beside existing tabs |
| **Allocations** | None | **Missing** — W16-A scope |
| **Crews** | None | **Missing** — W16-A scope |
| **RDO / calendar events** | None | **Out of Phase 1** |
| **Drag/drop Planner** | None | **Out of Phase 1** |

---

## 11. What does not align yet

| Gap | Current state | Target | Phase |
|-----|---------------|--------|-------|
| No planner board | Mass Fill is list/form only | Daily allocation grid | W16-A (minimal) / later drag-drop |
| No crew entities | Implicit "all employees" | Reusable `workforce_crews` | W16-A |
| No allocation → worker prefill | Manual job picker | Optional prefill on Log Hours | W16-A UI optional |
| Settings scattered | Team + API | Dedicated Settings tab | Phase 2 |
| Tab order | Approvals first | Planner first in vision | Phase 2 nav reorder only |
| Employee read scope on workforce GETs | Any staff | Role-scoped reads | P1 hardening — not W16-A |
| `workforce_calendar_events` | Not built | RDO/holidays | Phase 3+ |

---

## 12. Protected no-change areas (Phase 1)

Unless a **failing regression test** proves otherwise:

| Path | Reason |
|------|--------|
| `syncTimesheetToBuildexact()` | Books BX actuals — idempotent state machine |
| `POST /api/workforce/timesheets/:id/approve` | Cost compute + auto BX feed |
| `POST /api/workforce/timesheets/:id/sync` | Manual BX recovery |
| `POST /api/workforce/timesheets/sync-pending` | Bulk BX push |
| `POST /api/worker/timesheets` | Worker submit path |
| `GET /api/worker/timesheets` | Worker week/history |
| `GET /api/worker/timesheets/:date` | Worker day load |
| `WorkerLogHours.jsx` core save/submit flow | Field crews depend on it |
| `workerFetch.js` token flow | Security + iOS install behaviour |
| `POST /api/workforce/employees/:id/worker-link` | Link issuance |
| `approveSingleTimesheet()` cost bands | Finance actuals |

**Explicitly out of Phase 1:** drag/drop planner, RDO calendar, QC, voice-to-task, Buildxact schema changes, timesheet table renames, worker route renames.

---

## 13. Minimal-disturbance architecture

```
┌─────────────────────────────────────────────────────────────┐
│  EXISTING (protect)                                         │
│  timesheets / timesheet_entries / approve / BX sync         │
│  worker PWA log flow / workerFetch token                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ optional read (prefill)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  NEW (additive, W16-A)                                      │
│  workforce_crews → workforce_crew_members                   │
│  workforce_allocations (date, employee_id, job spine)       │
│  CRUD routes under /api/workforce/*                         │
│  worker read: /api/worker/allocations/today|week            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  UI (additive beside existing tabs)                         │
│  New "Planner" tab in Workforce.jsx — simple list/form      │
│  WorkerHome optional "Today's allocation" chip (Phase 1b)   │
│  WorkerLogHours optional prefill — fallback to manual pick  │
└─────────────────────────────────────────────────────────────┘
```

**Principles:**

1. **New tables, new routes** — no ALTER on `timesheets` for allocation FK in Phase 1 (allocation is advisory, not required to log hours).
2. **New tab beside Mass Fill** — do not rewrite Approvals/History/Snapshot.
3. **Same auth stack** — `requireAuth` + `requireRole` for admin routes; `workerAuth` for worker reads scoped to `req.workerEmployee.id`.
4. **Same RLS pattern** — mig 111 style deny-all + service-role API only for new tables.
5. **Tests first** — W16-API/SEC/REG before UI polish.

---

## 14. Proposed new tables (plan only — do not create yet)

### `workforce_crews`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text NOT NULL | e.g. "Frame crew A" |
| is_active | boolean DEFAULT true | |
| created_at / updated_at | timestamptz | |

### `workforce_crew_members`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| crew_id | uuid FK → workforce_crews | |
| employee_id | uuid FK → employees | UNIQUE(crew_id, employee_id) |
| sort_order | int | Optional display order |

### `workforce_allocations`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| allocation_date | date NOT NULL | Daily grain for W16-A |
| employee_id | uuid FK → employees | Who is allocated |
| crew_id | uuid FK nullable | Optional crew tag |
| project_id | uuid FK nullable | XOR with carpentry |
| carpentry_job_id | uuid FK nullable | XOR with project |
| notes | text | Site / task hint |
| created_by | uuid FK auth.users | Audit |
| created_at / updated_at | timestamptz | |

**Constraints:** CHECK exactly one of (`project_id`, `carpentry_job_id`) IS NOT NULL; UNIQUE(employee_id, allocation_date) for W16-A daily single-site rule (confirm with Sam if multi-site same day needed later).

### `workforce_calendar_events` (Phase 3+ — not W16-A)

RDO, public holidays, leave blocks — **do not implement in W16-A**.

---

## 15. Proposed new routes (plan only)

| Route | Method | Auth | Role | Purpose |
|-------|--------|------|------|---------|
| `/api/workforce/crews` | GET | requireAuth | admin, supervisor | List crews + members |
| `/api/workforce/crews` | POST | requireAuth | admin, supervisor | Create crew |
| `/api/workforce/crews/:id` | PUT | requireAuth | admin, supervisor | Update crew / members |
| `/api/workforce/allocations` | GET | requireAuth | admin, supervisor | List by date range |
| `/api/workforce/allocations` | POST | requireAuth | admin, supervisor | Create allocation |
| `/api/workforce/allocations/:id` | PUT | requireAuth | admin, supervisor | Update |
| `/api/workforce/allocations/:id` | DELETE | requireAuth | admin, supervisor | Remove |
| `/api/worker/allocations/today` | GET | workerAuth | own employee | Today + tomorrow |
| `/api/worker/allocations/week` | GET | workerAuth | own employee | Week view |

**SEC:** `POST/PUT/DELETE` allocations → **403** for employee/basic/client roles (W16-SEC-01).

**Worker read:** filter strictly `employee_id = req.workerEmployee.id` (W16-SEC-02).

---

## 16. Proposed UI changes (plan only)

| Change | Type | Phase |
|--------|------|-------|
| Add **Planner** tab to `Workforce.jsx` | Add beside existing tabs | W16-A |
| Simple date picker + employee/crew + job selector | New sub-component | W16-A |
| Reuse employee list from Team patterns | Reuse | W16-A |
| Optional `WorkerHome` allocation summary | Additive chip | W16-A optional (1b) |
| Optional `WorkerLogHours` prefill project from allocation | Additive — manual override remains | W16-A optional (1b) |
| Reorder tabs (Planner first) | Nav polish | Phase 2 |
| Dedicated Settings tab (split from Team) | Refactor | Phase 2 |
| Drag/drop planner grid | New component | Phase 3+ |
| Worker bottom nav | UX | Phase 3+ |

**Do not change:** Approvals approve buttons, History sync buttons, Team worker-link flow, WorkerLogHours submit payload shape.

---

## 17. Test strategy

### Existing regression baseline

| Suite | Command | Must stay green |
|-------|---------|-----------------|
| W15 timesheet auth | `npm run test:w15-timesheet-auth:write` | W16-REG-02 |

### W16-A test design (implement with W16-A — not in this planning pass)

| ID | Type | Assertion |
|----|------|-----------|
| W16-API-01 | api | Admin can create allocation |
| W16-API-02 | api | Supervisor can create allocation |
| W16-SEC-01 | security | Employee/basic cannot create allocation (403) |
| W16-SEC-02 | security | Worker token reads only own allocation |
| W16-API-03 | api | Allocation links to correct building project |
| W16-API-04 | api | Allocation links to correct carpentry job |
| W16-UI-01 | e2e/manual | Worker Log Hours works **without** allocation |
| W16-UI-02 | e2e/manual | Worker Log Hours **can** prefill from allocation (if 1b shipped) |
| W16-REG-01 | regression | Buildxact sync path unchanged (mock or snapshot guard on sync fn signature + approve hook) |
| W16-REG-02 | regression | W15 timesheet approval tests still pass |

### Test artifact rules

- Prefix: **`BLH TEST`** via `buildTestJobAddress({ suite: "W16", workflowId: "ALLOC", ts })`
- **Do not use:** MARK, __BATCH_A__, BATCHA, BATCH A, __E2E__, DEBUG, DEMO, DRYRUN
- After write tests: `npm run test:cleanup-artifacts` (dry-run in CI; `--confirm` only when Sam approves)

**Suggested script path:** `scripts/batch-a/w16-allocation-baseline.mjs` + `npm run test:w16-allocation-baseline:write`

---

## 18. Exact next implementation prompt

When Sam approves this plan, prompt:

```
/harden implement W16-A — Workforce allocation baseline

Scope:
- Migration: workforce_crews, workforce_crew_members, workforce_allocations (+ RLS deny-all like mig 111)
- Routes: crews CRUD + allocations CRUD + worker today/week read
- Role gates: create/update/delete admin+supervisor only; worker read own only
- UI: Planner tab in Workforce.jsx (simple form/list — no drag/drop)
- Optional: WorkerHome allocation chip + WorkerLogHours prefill (only if tests pass without allocation first)
- Tests: W16-API-01 through W16-REG-02; reuse buildTestJobAddress BLH TEST prefix
- Protect: do not modify syncTimesheetToBuildexact, approve routes, worker timesheet POST/GET, workerFetch token flow
- Run: npm run test:w16-allocation-baseline:write then npm run test:w15-timesheet-auth:write then npm run test:cleanup-artifacts (dry-run)
- Update: BUG_REGISTER, WORKFLOW_TEST_MATRIX, 30_DAY_HARDENING_TRACKER, W15 workflow doc cross-ref
```

---

## Files inspected

| File | Status |
|------|--------|
| `server/lib/workforceRoutes.mjs` | Read — 37 routes, BX sync, workerAuth |
| `server/lib/buildexactClient.mjs` | Referenced — PO create/complete |
| `server/lib/buildexactDeepIntegration.mjs` | Referenced — job sync |
| `server/lib/siteMedia.mjs` | Referenced — worker photos |
| `server/lib/dateYmd.mjs` | Referenced — AU date helpers |
| `server/dev-api.mjs` | Read — route registration |
| `src/pages/Workforce.jsx` | Read — 4 tabs |
| `src/pages/WorkforceTeam.jsx` | Read — team + worker links |
| `src/pages/worker/WorkerHome.jsx` | Read |
| `src/pages/worker/WorkerLogHours.jsx` | Grep — API calls |
| `src/pages/worker/WorkerTasks.jsx` | Read |
| `src/pages/worker/WorkerWeek.jsx` | Read |
| `src/components/worker/WorkerLayout.jsx` | Read |
| `src/lib/workerFetch.js` | Read |
| `src/lib/workerJob.js` | Referenced |
| `src/lib/workerPhoto.js` | Referenced |
| `src/lib/roles.js` | Read |
| `src/App.jsx` | Grep — routes |
| `supabase/migrations/059_workforce_timesheets.sql` | Read |
| `supabase/migrations/084_workforce_sync_mode.sql` | Read |
| `supabase/migrations/087_timesheet_work_order.sql` | Read |
| `supabase/migrations/098_timesheet_buildexact_completion.sql` | Read |
| `supabase/migrations/111_workforce_rls_lockdown.sql` | Read |
| `docs/qa/workflows/15_WORKFORCE_TIMESHEETS_BUILDXACT_WORK_ORDERS.md` | Read |
| `docs/qa/P0_C3_WORKFORCE_APPROVAL_PLAN.md` | Read |
| `docs/WORKFORCE_DEPLOY_HANDOFF_2026-06-22.md` | Read |
| `docs/sops/10_workforce/*` | Listed (3 files) |

---

## Current code alignment verdict

**Verdict: Strong foundation — additive Planner/allocations layer fits with minimal disturbance.**

- **~70% of future admin structure already exists** under different tab names (Snapshot, Approvals, Team, History/Sync).
- **100% of future worker app exists** (Today, Log Hours, My Week, Tasks) — no worker restructure required for Phase 1.
- **Buildxact sync is mature and isolated** — safe to leave untouched while adding allocations beside it.
- **Main greenfield:** crews, daily allocations, Planner tab, worker allocation read APIs.
- **W16-A can proceed** after Sam reviews this plan — no blockers except plan approval.

---

## Verification (this planning pass)

| Check | Result |
|-------|--------|
| `npm run build` | **Pass** (2026-06-22) |
| `npm run test:cleanup-artifacts` | **Dry-run pass** — 38 safe BLH TEST candidates listed; nothing deleted |

---

## Source-of-truth check

**Expected:** Timesheets + BX sync per W15 workflow and `SOURCE_OF_TRUTH.md` labour path.

**Confirmed:**

- Timesheet state → `timesheets` / `timesheet_entries`
- Approval → `approveSingleTimesheet()` in `workforceRoutes.mjs`
- BX push → `syncTimesheetToBuildexact()` + mig 084/087/098 columns
- Worker auth → `employees.worker_token` + `workerFetch.js`
- API-only access → mig 111

**Mismatch:** None for timesheet/BX path. **New SSoT (W16-A1):** `workforce_crews`, `workforce_crew_members`, `workforce_allocations` — API-only via mig 117.

---

## W16-A1 implementation log (2026-06-22)

| Item | Status |
|------|--------|
| Migration `117_workforce_allocations.sql` | **Applied** (verified 2026-06-26) |
| Routes in `workforceRoutes.mjs` | 9 new routes (crews + allocations + worker read) |
| Protected BX/timesheet paths | Untouched |
| Tests `scripts/batch-a/w16-allocation-baseline.mjs` | **14/14 pass** (`test:w16-allocation-baseline:write`) |
| W15 regression | **19/19 pass** (post W16-A1) |
| npm scripts | `test:w16-allocation-baseline`, `test:w16-allocation-baseline:write` |
| UI (Planner / worker prefill) | Not started — **W16-A2 deferred** |

**Closed:** 2026-06-26 — backend baseline verified; do not reopen unless write test regresses.

---

Next safe action:  
Switch Cursor into Workforce **plan mode** for restrained rebuild planning (W16-A2 UI design only — no implementation until approved).

Blocked by:  
none (W16-A1 closed).

Code changed:  
no (verification pass only)

Tests changed:  
no

Docs changed:  
yes
