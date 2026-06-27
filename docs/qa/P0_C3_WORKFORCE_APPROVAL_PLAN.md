# P0-C3 — Workforce Timesheet Approval Plan (W15-DRIFT-001)

**Date:** 2026-06-25  
**Status:** **Implemented — Option B (SAM-W15-001)**  
**Bug:** W15-DRIFT-001 — **closed**  
**Workflow:** [15_WORKFORCE_TIMESHEETS_BUILDXACT_WORK_ORDERS.md](./workflows/15_WORKFORCE_TIMESHEETS_BUILDXACT_WORK_ORDERS.md)  
**Sam decision:** [SAM-W15-001](./SAM_DECISION_LOG.md) — **Option B decided 2026-06-25**

---

## 1. Current behaviour summary

### Source of truth (approval)

| Layer | Owner | Detail |
|-------|-------|--------|
| **Approval state** | `timesheets.status` | `draft` → `submitted` → `approved` \| `rejected` |
| **Approved labour cost** | `timesheet_entries.cost_amount` | Computed on approve via `approveSingleTimesheet()` |
| **Approver audit** | `timesheets.approved_by`, `approved_at` | `approved_by` = `user_profiles.id` (auth user) |
| **Buildxact downstream** | `timesheets.buildexact_*` columns | Work Order create + complete; idempotent via `buildexact_work_order_id` + claim lease |
| **Sync mode** | `workforce_settings.buildexact_sync_mode` | `auto` (default) pushes on approve; `manual` waits for admin sync |
| **Roles** | `user_profiles.role` | `admin`, `supervisor`, `employee`, `client` — enforced in Express via `requireAuth` / `requireRole` |

**There is no separate `approved_timesheets` or `workforce_entries` table.** Deputy is **not** integrated — Hub replaces Deputy with native timesheets + Buildxact Work Orders. **Xero is not in the timesheet approval path** (Finance invoices only).

### Intended business flow (verified from code + W15 map)

1. Worker submits via PWA → `POST /api/worker/timesheets` → `status = submitted`
2. Office reviews on `/workforce` Approvals tab
3. **Director (admin) approves** → cost bands computed → optional auto Buildxact WO push
4. Supervisor may **reject**, **mass-fill**, attribute carpentry job — but **API blocks approve** today

### Confirmed mismatch (W15-DRIFT-001)

- **UI:** Approve + mass-approve buttons visible to **supervisors** (`can.accessWorkforce` → admin + supervisor)
- **API:** Approve routes require **`admin` only**
- **Result:** Supervisor clicks Approve → **403 Forbidden** (silent failure in UI unless error toast)

Reject is **aligned**: API `admin` + `supervisor`; UI shows reject to both.

---

## 2. Route map

All routes from `server/lib/workforceRoutes.mjs` (registered in `server/dev-api.mjs`). No prefix gate on `/api/workforce` — inline middleware only.

| Route | Method | Purpose | Writes DB | External side effect | Middleware | Roles allowed (API) | Roles should be allowed | Mismatch | Fix required |
|-------|--------|---------|-----------|---------------------|------------|---------------------|-------------------------|----------|--------------|
| `/api/workforce/timesheets/:id/approve` | POST | Approve one timesheet; compute costs; maybe BX sync | **Yes** — `timesheets`, `timesheet_entries` | **Yes** — Buildxact WO create/complete if `auto` | `requireAuth`, `requireRole("admin")` | **admin** | **Sam decision** (admin only OR admin+supervisor) | **Yes** vs UI | **Yes** |
| `/api/workforce/timesheets/mass-approve` | POST | Bulk approve | **Yes** (same as above) | **Yes** (per row) | `requireAuth`, `requireRole("admin")` | **admin** | Sam decision | **Yes** vs UI | **Yes** |
| `/api/workforce/timesheets/:id/reject` | POST | Reject submitted timesheet | **Yes** — `timesheets.status`, `rejection_notes` | No | `requireAuth`, `requireRole("admin","supervisor")` | admin, supervisor | admin, supervisor | No | No |
| `/api/workforce/timesheets/:id/unapprove` | POST | Reset approved → submitted | **Yes** — clears approve + BX flags; nulls entry costs | No (flags BX review if WO exists) | `requireAuth`, `requireRole("admin")` | admin | admin | No (UI admin-only) | No |
| `/api/workforce/timesheets/:id/sync` | POST | Retry Buildxact push | **Yes** — BX columns | **Yes** — WO create/complete | `requireAuth`, `requireRole("admin")` | admin | admin | No (UI admin-only) | No |
| `/api/workforce/timesheets/sync-pending` | POST | Bulk push approved-not-completed | **Yes** (via sync) | **Yes** | `requireAuth`, `requireRole("admin")` | admin | admin | No | No |
| `/api/workforce/timesheets/mass-fill` | POST | Office bulk submit hours | **Yes** — upsert timesheet + insert entries | No | `requireAuth`, `requireRole("admin","supervisor")` | admin, supervisor | admin, supervisor | No | No |
| `/api/workforce/timesheets/:id/carpentry-job` | PATCH | Attribute carpentry job | **Yes** | No | `requireAuth`, `requireRole("admin","supervisor")` | admin, supervisor | admin, supervisor | No | No |
| `/api/workforce/timesheets/pending` | GET | List submitted for approval | No | No | `requireAuth` only | **any staff** (incl. employee) | admin, supervisor (scoped?) | **Read scope gap** | P1 — not P0-C3 core |
| `/api/workforce/timesheets` | GET | List/filter timesheets | No | No | `requireAuth` only | **any staff** | role-scoped | **Read scope gap** | P1 |
| `/api/workforce/timesheets/export.csv` | GET | CSV export | No | No | `requireAuth` only | any staff; cost col admin-only in CSV | admin for $ | Partial | P1 |
| `/api/workforce/timesheets/:id` | DELETE | Admin test cleanup | **Yes** | No | `requireAuth`, `requireRole("admin")` | admin | admin | No | No |
| `/api/workforce/settings` | GET | Read workforce settings | No | No | `requireAuth` | any staff | admin, supervisor | Minor | No |
| `/api/workforce/settings` | PUT | Update settings incl. BX sync mode | **Yes** | No | `requireAuth`, `requireRole("admin","supervisor")` | admin, supervisor | admin only for BX mode? | UI admin-only for sync control | P2 |
| `/api/workforce/completion-snapshot` | GET | Weekly completion grid | No | No | `requireAuth`, `requireRole("admin","supervisor")` | admin, supervisor | admin, supervisor | No | No |
| `/api/worker/timesheets` | POST | Worker submit | **Yes** | No | `workerAuth` | worker only (own) | worker | No | No |
| `/api/worker/timesheets/:id` | PUT | Worker edit own | **Yes** | No | `workerAuth` | worker own | worker | No | No |
| `/api/projects/:id/labour` | GET | Approved labour rollup | No | No (BX estimate read best-effort) | `requireAuth` | any staff; `$` admin-only | admin for $ | Partial | P1 |

**Buildxact WO lifecycle (internal, not HTTP routes):**

- `syncTimesheetToBuildexact()` → `createPurchaseOrder({ orderType: "Work" })` → `completePurchaseOrder()` when enabled
- Idempotency: `buildexact_work_order_id`, `buildexact_completed_at`, `buildexact_sync_claimed_at`, `buildexact_needs_review`
- **No Deputy push. No Xero push from timesheet approve.**

---

## 3. UI map

| File / component | Button / action | API route | Visible to (UI) | Disabled / hidden logic | Mismatch with API |
|------------------|-----------------|-----------|-----------------|-------------------------|-------------------|
| `src/pages/Workforce.jsx` — `ApprovalsTab` | ✓ Approve one | `POST .../timesheets/:id/approve` | **admin + supervisor** (no role gate on button) | busy state only | **Yes** — supervisor gets 403 |
| `ApprovalsTab` | ✓ Approve N (bulk) | `POST .../timesheets/mass-approve` | **admin + supervisor** | selected.size > 0 | **Yes** |
| `ApprovalsTab` | ✗ Reject one / bulk | `POST .../timesheets/:id/reject` | admin + supervisor | modal | No |
| `ApprovalsTab` | Carpentry job dropdown | `PATCH .../carpentry-job` | admin + supervisor | attribBusy | No |
| `ApprovalsTab` | Cost column | — | **admin only** (`isDirector`) | hidden for supervisor | No (API also strips rates for non-admin on pending list) |
| `Workforce.jsx` — `HistoryTab` | Unapprove | `POST .../unapprove` | **admin only** | approved rows | No |
| `HistoryTab` | Retry / Force BX sync | `POST .../sync` | **admin only** (sync buttons in table) | — | No |
| `Workforce.jsx` — `BuildexactSyncControl` | auto/manual mode, sync pending | `PUT settings`, `POST sync-pending` | **admin only** (`role === "admin"`) | — | No (settings PUT allows supervisor but UI hidden) |
| `MassFillTab` | Submit all entries | `POST .../mass-fill` | admin + supervisor (via module access) | — | No |
| `SnapshotTab` | — | `GET .../completion-snapshot` | admin + supervisor | — | No |
| `src/pages/worker/WorkerLogHours.jsx` | Submit hours | `POST /api/worker/timesheets` | worker (magic link / auth) | locked if approved | No |
| `AppShell.jsx` | Workforce nav | — | `can.accessWorkforce` → admin, supervisor | employee blocked from module | N/A |

**Module access:** `src/lib/roles.js` — `can.accessWorkforce = admin | supervisor`. Employees use `/worker` PWA, not `/workforce`.

---

## 4. Table / source-of-truth map

| Table | Role in approval | Key columns |
|-------|------------------|-------------|
| `timesheets` | **Primary approval record** | `status`, `approved_by`, `approved_at`, `employee_id`, `project_id`, `job_id`, `carpentry_job_id`, `buildexact_work_order_id`, `buildexact_completed_at`, `buildexact_sync_error`, `buildexact_needs_review`, `buildexact_sync_claimed_at` |
| `timesheet_entries` | Labour lines + booked cost | `cost_amount`, `overtime_hours`, `hours`, `task_category` |
| `employees` | Worker identity + rates | `hourly_rate`, `buildexact_contact_id`, `user_id`, `worker_token` |
| `workforce_settings` | OT thresholds + BX sync mode | `overtime_threshold`, `double_time_threshold`, `buildexact_sync_mode` |
| `user_profiles` | Role gate | `role`, `is_active` |
| `projects` / `jobs` / `carpentry_jobs` | Job spine for BX resolve | `buildexact_job_id`, `address` |
| `buildexact_job_sync` | BX job mirror | `buildexact_job_id`, `job_id` |
| `carpentry_job_budgets` | BX `parentTask` category map | `workforce_task_category`, `category_name` |
| `employee_cost_rates` (via `costModelService`) | Loaded break-even rate on approve | not direct write on approve |

**Migrations:** 059 (core), 084 (`buildexact_sync_mode`, `worker_token`), 087 (`buildexact_work_order_id`), 098 (completion state machine), 111 (RLS lockdown — all workforce via service role).

---

## 5. Role mismatch findings

| Finding | Severity | Evidence |
|---------|----------|----------|
| **Supervisor sees Approve but API is admin-only** | **P0 — W15-DRIFT-001** | `Workforce.jsx` approve buttons ungated; `workforceRoutes.mjs:719,701` `requireRole("admin")` |
| Reject aligned supervisor/admin | OK | API + UI match |
| Unapprove / BX sync admin-only aligned | OK | UI `isDirector` + API admin |
| **No project/crew scope on approve** | Gap if supervisor approve enabled | `approveSingleTimesheet` does not check caller ↔ `project_id` |
| **No self-approval block** | Unconfirmed / needs testing | Admin could approve own timesheet if linked as employee |
| **Employee can read all timesheets via API** | P1 — adversarial QA | `GET /api/workforce/timesheets` — `requireAuth` only ([ADVERSARIAL_AUDIT](./ADVERSARIAL_AUDIT_2026-06-23.md)) |
| Employee cannot reach `/workforce` UI | OK | `can.accessWorkforce` |

**Role mismatch confirmed:** **Yes** — primary P0-C3 issue is supervisor approve UI vs admin-only API.

---

## 6. External side-effect findings

| Trigger | External system | Behaviour |
|---------|-----------------|-----------|
| Approve (auto mode) | **Buildxact** | Create Work Order (`orderType: Work`) + complete → actual labour cost |
| Approve (manual mode) | Buildxact | **Deferred** until admin `POST .../sync` or `sync-pending` |
| Approve | Buildxact contacts | May create `[Name] (HUB)` contact once (`ensureBuildexactContact`) |
| Approve | Deputy | **None** — replaced |
| Approve | Xero | **None** — finance module separate |
| Approve | Dropbox | **None** |
| Reject | — | DB only |
| Unapprove with existing WO | Buildxact | Sets `buildexact_needs_review`; manual BX cleanup before re-sync |

**Trust implication:** Approve is a **financial commit** (BX actuals). Current API restricts that to **admin** deliberately ([SAM-W15-001](./SAM_DECISION_LOG.md), W15 workflow §22).

---

## 7. Smallest safe implementation plan

**Do not implement until Sam resolves SAM-W15-001.**

### Option A — Align API to UI (supervisor can approve)

1. Change `requireRole("admin")` → `requireRole("admin", "supervisor")` on:
   - `POST /api/workforce/timesheets/:id/approve`
   - `POST /api/workforce/timesheets/mass-approve`
2. Add regression tests W15-SEC-02 before merge
3. **Optional follow-up:** project-scope check (no schema change) — supervisor may only approve timesheets for projects they supervise (**Unconfirmed** — no assignment model in code today)
4. Document BX trust: supervisor approve triggers same auto-sync as admin

**Risk:** Supervisors book Buildxact actuals without director review; deployment test 2026-06-16 was **NO-GO** for full team.

### Option B — Align UI to API (recommended default)

1. In `ApprovalsTab`, gate approve + mass-approve buttons: **`role === "admin"`** only
2. Add helper text for supervisors: "Reject and mass-fill available; director approval required"
3. Add regression tests W15-SEC-01 (employee 403), W15-SEC-03 (admin 200), W15-SEC-02 (supervisor approve hidden + 403 if forced)
4. No API change; preserves admin-only financial commit

**Risk:** Lowest — matches current API trust model and SAM-W15-001 option B.

### Option C — Document only

Update SOP + Approvals tab banner; no code. **Does not fix 403 UX bug.**

### Recommended for P0-C3

**Option B** unless Sam explicitly chooses Option A. Smallest safe diff: ~10 lines UI + test script `w15-timesheet-auth.mjs`.

**Out of P0-C3 scope (park):** timesheet read scoping (employee enumerate), mass-fill duplicate hours, overtime per-entry vs per-day.

---

## 8. Required tests before code (design only — not implemented)

Script target: `scripts/batch-a/w15-timesheet-auth.mjs` + `npm run test:w15-timesheet-auth:write`

| Test ID | Scenario | Expected |
|---------|----------|----------|
| **W15-SEC-01** | Employee `POST .../approve` | **403**; no `status=approved`; no BX side effect |
| **W15-SEC-01b** | Employee `POST .../mass-approve` | **403** |
| **W15-SEC-02** | Supervisor approve | **If Option A:** 200 + approved. **If Option B:** UI hidden; forced API **403** |
| **W15-SEC-03** | Admin approve submitted fixture | **200**; `timesheets.status=approved`; `approved_by` set; entries have `cost_amount` |
| **W15-API-01** | Admin approve with BX configured + auto mode | One WO path (mock or env-gated); `buildexact_work_order_id` or `buildexact_sync_error` stamped |
| **W15-API-02** | Double approve / double sync | Idempotent — no second WO (`already_pushed` / existing `buildexact_work_order_id`) |
| **W15-API-03** | Approve rejected or draft timesheet | **400/404 or no-op**; no BX push |
| **W15-API-04** | Supervisor/employee `GET .../timesheets/pending` | **200 today** — document; optional future scope restriction |
| **W15-API-05** | Supervisor `POST .../reject` | **200**; status rejected |

**Fixtures:** Use `buildTestJobAddress()` (`BLH TEST`) for any job/project created in write tests. Seed: employee + supervisor + admin via `ensureE2EUsers()` (same pattern as W12).

**BX tests:** Gate WO creation tests on `buildexactConfigured()` — skip with gap if env absent (mirror W11 pattern).

---

## 9. Cleanup handling for write tests

Per [TEST_ARTIFACT_CLEANUP_POLICY.md](./TEST_ARTIFACT_CLEANUP_POLICY.md):

- All new write fixtures: **`BLH TEST`** via `buildTestJobAddress()` — **not** `MARK` / `__BATCH_A__`
- After `test:w15-timesheet-auth:write`: run `npm run test:cleanup-artifacts` (dry-run)
- DB cleanup: delete test timesheets/entries in test `finally` (admin DELETE route exists)
- Dropbox: W15 write tests likely **no Dropbox** unless job create via `/api/jobs` — prefer project insert via service role only
- Safe canonical tier if job folders created: deletable with `--confirm` only when Sam approves

---

## 10. Risks / open decisions for Sam

| ID | Decision | Options | Recommendation |
|----|----------|---------|----------------|
| **SAM-W15-001** | Who may approve? | A) admin+supervisor API · B) admin-only + fix UI | **B** until BX parallel run green |
| **SAM-W15-002** | Deputy cutover | E2E + parallel run | Block production cutover on W15-E2E-01 |
| Supervisor project scope | Can supervisor approve any submitted timesheet? | No model in code | If Option A: default **all submitted** unless new scope rule agreed |
| Self-approval | Director linked as employee? | Unconfirmed | Add test; block if needed (P1) |
| Read scope | Employee enumerates all timesheets | Adversarial QA | Separate P1 — not P0-C3 |
| W15-DRIFT-009 adjacent | Mass-fill duplicates entries | Known | Out of scope |
| Deployment data gaps | 4/7 staff no employee record | WORKFORCE_DEPLOYMENT_TEST NO-GO | Ops/data — not P0-C3 code |

---

## 11. Exact next implementation prompt (after Sam approval)

```
/harden fix P0-C3 — implement Option B (or A if Sam chose A)

1. Read docs/qa/P0_C3_WORKFORCE_APPROVAL_PLAN.md
2. Create scripts/batch-a/w15-timesheet-auth.mjs + run script (test-first)
3. If Option B: gate ApprovalsTab approve buttons to role === "admin"
   If Option A: change approve + mass-approve routes to requireRole("admin","supervisor")
4. Run test:w15-timesheet-auth:write, test:w12-schedule-auth:write (regression), build
5. Run npm run test:cleanup-artifacts (dry-run only)
6. Update BUG_REGISTER W15-DRIFT-001, WORKFLOW_TEST_MATRIX, 30_DAY_HARDENING_TRACKER
7. Do not change BX sync logic, reject flow, worker PWA, or Deputy/Xero
```

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-25 | **P0-C3 shipped — Option B:** UI approve/bulk-approve admin-only (`can.approveTimesheets`); tests `test:w15-timesheet-auth:write`; W15-DRIFT-001 closed; W15-DECISION-FUTURE logged |
| 2026-06-25 | P0-C3 planning note created — no code |
