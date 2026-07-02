---
sop_version: 1.2
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 10-01: Workforce Overview — Timesheets, Employees, Site Tasks

**Module:** Workforce  
**SOP ID:** 10-01  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin and managers who approve timesheets and manage site workers. Site workers use the Worker PWA on their phones to log hours and check tasks.

## 2. When to use it
- At the end of each week when approving worker timesheets
- When entering timesheets in bulk (Mass Fill) for a whole crew
- When checking who is booked on site for a project
- When a worker cannot access the PWA and needs their timesheet entered manually

## 3. What this does
The **Timesheets** module (sidebar label; route `/workforce`) has these manager tabs:

**Approvals** — submitted timesheets waiting for approval.

**Snapshot** — week-at-a-glance crew hours summary.

**Mass Fill** — bulk entry for a whole crew when workers are not using the PWA.

**History** — searchable past timesheets (approved, rejected, pending).

**Team** — employee directory and worker magic-link issuance (`POST /api/workforce/employees/:id/worker-link`).

**Planner** (admin/supervisor) — crew allocation planner.

**Worker PWA** (`/worker?token=…`) — mobile interface where workers log hours and check site tasks. Workers **must open the magic link** issued from Team — there is no name-picker login on `/worker` alone.

## 4. Before you start
- Employees exist in the system (check the Team Directory tab)
- Projects are set up in Operations
- For Mass Fill: know the project, dates, and hours for each worker that week

## 5. Step-by-step process

### Approving timesheets (Approvals tab)
1. Go to **Workforce** → **Approvals**
2. Timesheets waiting for approval are listed — employee name, project, date, hours
3. Click a timesheet row to expand its detail
4. **Optional — Carpentry Job attribution:** If the work was performed on a carpentry subsidiary job, select the correct job from the **Carpentry Job** dropdown at the top of the expanded row. This links the timesheet to that carpentry job so the hours appear in the job's Labour Actual total in the Costs tab. Select "— None —" to clear the attribution.
5. Click **✓** to approve, or **✗** to reject and enter a reason
6. The worker is notified of the outcome

### Bulk entry — Mass Fill tab
1. Go to **Workforce** → **Mass Fill**
2. Select the project and week
3. A grid shows employees as rows and days as columns
4. Enter hours for each worker per day
5. Click **Submit** to save all entries at once

### Viewing history
1. Go to **Workforce** → **History**
2. Filter by employee, project, or date range
3. Click any row to view the full timesheet detail

### Worker logs hours (Worker PWA)
1. Worker opens their personal link `/worker?token=…` on their phone (sent by Admin from Workforce → Team)
2. Selects the project they are working on (identity comes from the magic-link token, not a name picker)
3. Enters start time, finish time, and break — system calculates hours
4. Submits — timesheet appears in the Approvals queue for the manager

**Leading-hand / supervisor extras (when `is_leading_hand = true` on the employee record):**
- A **+ Add task** button appears in Site Tasks so the leading hand can create new tasks on site without going through the office.
- A drag handle (⠿) appears on each task — hold and drag to reorder tasks within a group. The new order is persisted and all workers on that site see it.

## 6. What happens after
- Approved timesheets feed into payroll reporting
- Rejected timesheets are returned to the worker with the rejection reason
- All timesheets (any status) are visible in the History tab

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Approving without reviewing hours | Clicking quickly | Check hours and project before approving — incorrect timesheets affect payroll |
| Mass Fill entered for wrong week | Default date not changed | Always verify the week selector before submitting |
| Worker cannot find themselves in the PWA | Not added to the employee list | Add the worker via Settings → Team Directory first |
| Forgetting to approve timesheets before pay run | No reminder set | Check the Approvals tab every Monday morning |
| Carpentry labour shows $0 in job Costs tab | Timesheet not attributed to the carpentry job | Expand the timesheet in Approvals → select the correct carpentry job before approving |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Timesheet not appearing in Approvals | Worker may not have submitted it — check with them; or it may already be approved (check History) |
| Mass Fill submission fails | Check all required fields are filled — at least one employee and one day must have hours |
| Worker PWA not loading | Check the `/worker` URL is correct; the worker may need to clear their browser cache |
| Employee missing from Mass Fill grid | Add them to the Team Directory and link them to the project |
| "Cannot change carpentry job on an approved timesheet" error | Timesheet was already approved | Unapprove the timesheet first (Admin role), assign the carpentry job, then re-approve |

## 9. Related SOPs
- [Open a project in Operations](../05_operations/operations_open_project.md) — SOP 05-02

## 10. Automation notes
- API: `GET /api/workforce/timesheets` — list timesheets (supports `?status=submitted&project_id=&employee_id=&date_from=&date_to=`)
- API: `GET /api/workforce/timesheets/pending` — the Approvals queue (status = submitted)
- API: `POST /api/workforce/timesheets/mass-fill` — admin/supervisor bulk entry (one row per employee+task)
- API: `POST /api/worker/timesheets` — worker PWA self-log (magic-link `?token=` or logged-in worker)
- API: `POST /api/workforce/timesheets/:id/approve` — approve (admin); fires the Buildexact push in Auto mode
- API: `POST /api/workforce/timesheets/:id/reject` — reject (`{ notes }`, admin/supervisor)
- API: `POST /api/workforce/timesheets/:id/sync` — retry the Buildexact push for one timesheet (admin)
- API: `POST /api/workforce/timesheets/sync-pending` — push all approved-but-unsynced timesheets (admin; Manual mode)
- API: `DELETE /api/workforce/timesheets/:id` — delete a timesheet + its entries (admin, cleanup)
- Setting: `workforce_settings.buildexact_sync_mode` (`auto` | `manual`) — toggled from the Workforce page
- API: `POST /api/workforce/employees/:id/worker-link` — issue/rotate a worker's magic-link (admin)
- API: `GET /api/workforce/employees` — list all employees for dropdowns
- API: `GET /api/workforce/site-tasks` — site tasks assigned to workers (shown in Worker PWA)
- API: `PATCH /api/workforce/timesheets/:id/carpentry-job` — attribute a timesheet to a carpentry job (`{ carpentryJobId: "uuid" | null }`) — admin/supervisor only; timesheet must not be approved
- DB effects: writes to `timesheets` table with `employee_id`, `project_id`, `date`, `hours`, `status`, `submitted_at`, `approved_at`, `approved_by`, `carpentry_job_id`

_Version history: 1.0 — Initial draft (2026-05-30); 1.1 — Added carpentry job attribution (2026-05-30); 1.2 — §14 compliance: added Screenshots/Edge cases, fixed Worker PWA steps, noted leading-hand extras (2026-07-02)._

## 11. Screenshots

[insert screenshot: Workforce → Approvals tab with a pending timesheet expanded, showing the Carpentry Job dropdown]
[insert screenshot: Workforce → Mass Fill grid — project + week selector + hours grid]
[insert screenshot: Worker PWA home screen — project selector and Log Hours entry]
[insert screenshot: Worker PWA Site Tasks — leading-hand ⠿ drag handle and + Add task button]

## 12. Edge cases

| Situation | Behaviour |
|-----------|-----------|
| Worker opens `/worker` without a token | App shows "This worker link is no longer valid" — no timesheet form is displayed |
| Worker submits on a day already submitted | The existing timesheet is pre-filled; re-submission overwrites entries for that day |
| Mass Fill submitted with no hours entered for any worker | Submission is blocked — at least one employee + day must have hours |
| Carpentry job attribution attempted on an approved timesheet | Returns an error — unapprove first, then attribute, then re-approve |
| `buildexact_sync_mode = manual` and timesheet is approved | Buildexact push is NOT triggered automatically — use **Sync pending** action or `POST /api/workforce/timesheets/sync-pending` |
| Leading hand opens Site Tasks via their worker link | + Add task button and ⠿ drag handles are shown; regular workers see neither |
| Worker token is rotated (new link issued) | Old token is invalidated immediately; worker must use the new link and re-add to home screen |

---

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] At least 2 employees exist in the system
- [ ] At least 1 project exists
- [ ] One pending timesheet exists (submit via Worker PWA or Mass Fill before running tests)

### Test cases

**TC-01 — Approvals tab lists pending timesheets**
1. Go to Workforce → Approvals
2. Expected: pending timesheets are listed with employee name, project, date, hours
3. Expected API: `GET /api/workforce/timesheets/pending` returns array with at least one item
- [ ] Pass  [ ] Fail

**TC-02 — Approve a timesheet**
1. Click a pending timesheet → click Approve
2. Expected: timesheet disappears from Approvals queue
3. Expected DB: `SELECT status, approved_at FROM timesheets WHERE id = '[id]'` shows `status = 'approved'` and `approved_at` is set
- [ ] Pass  [ ] Fail

**TC-03 — Reject a timesheet with reason**
1. Click a pending timesheet → click Reject → enter reason "Incorrect project"
2. Expected: timesheet removed from Approvals queue
3. Expected DB: `status = 'rejected'`, `rejection_reason = 'Incorrect project'`
- [ ] Pass  [ ] Fail

**TC-04 — Mass Fill creates multiple timesheet entries**
1. Go to Mass Fill → select project and current week
2. Enter 8 hours for Employee A on Monday, 8 hours for Employee B on Tuesday
3. Click Submit
4. Expected: success message
5. Expected DB: two new rows in `timesheets` with correct `employee_id`, `project_id`, `date`, `hours`
- [ ] Pass  [ ] Fail

**TC-05 — History tab shows approved timesheets**
1. After TC-02, go to History
2. Filter by the employee whose timesheet was approved
3. Expected: the approved timesheet appears with status "Approved"
- [ ] Pass  [ ] Fail

**TC-06 — Worker PWA submits timesheet to Approvals queue**
1. Open `/worker` in browser (no login)
2. Select an employee and project, enter start/end time and break
3. Submit
4. Expected: new timesheet appears in Approvals tab with status "Pending"
5. Expected DB: new row in `timesheets` with `status = 'pending'`
- [ ] Pass  [ ] Fail

**TC-07 — Employee list loads for dropdowns**
1. Call `GET /api/workforce/employees`
2. Expected: returns array of employees with at least `id` and `name` fields
- [ ] Pass  [ ] Fail

**TC-08 — Attribute a timesheet to a carpentry job**

1. Prerequisite: at least one active carpentry job exists (status = 'active').
2. Open a pending timesheet in the Approvals tab (click to expand).
3. Expected: "Carpentry Job" dropdown is visible with "— None —" default.
4. Expected API: `GET /api/carpentry/jobs?status=active` returns the active jobs in the dropdown.
5. Select the carpentry job from the dropdown.
6. Expected: `PATCH /api/workforce/timesheets/:id/carpentry-job` called with `{ carpentryJobId: "<id>" }`, returns `{ ok: true }`.
7. "Carpentry job assigned ✓" toast shown.
8. Approve the timesheet.
9. In the Carpentry module, open that job's Costs tab → summary.
10. Expected: `labourActual` is non-zero, `timesheetCount >= 1`.
- [ ] Pass  [ ] Fail

**TC-09 — History tab shows carpentry job reference in Project column**

1. After TC-08, go to Workforce → History.
2. Find the approved timesheet for the carpentry job.
3. Expected: Project column shows the carpentry job reference (e.g. "CJB-001") and client name.
4. Expected: timesheets with a regular project_id still show the project address.
- [ ] Pass  [ ] Fail

**TC-10 — Leading-hand site tasks: add task + drag reorder**

Prerequisite: a worker token for an employee with `is_leading_hand = true`.

1. Open `/worker?token=<leading-hand-token>` → tap **Site tasks**.
2. Expected: **+ Add task** button is visible; each task row shows the ⠿ drag handle.
3. Tap **+ Add task** → enter title "LH test task" → tap **Add task**.
4. Expected: new task appears in the active list for that site; `POST /api/worker/tasks` returns `{ ok: true }`.
5. Press-and-hold the ⠿ handle on any task and drag it above or below another task.
6. Expected: order updates on screen; `POST /api/worker/tasks/reorder` is called with the new `display_order` array; reload the page — order is preserved.
7. Open `/worker?token=<regular-worker-token>` for the same site.
8. Expected: **+ Add task** button is NOT shown; drag handles are NOT shown.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Approvals queue shows pending timesheets
- [ ] Approve and reject both work and persist to DB
- [ ] Mass Fill creates correct DB rows
- [ ] History tab shows approved records
- [ ] Worker PWA submission lands in Approvals
- [ ] Carpentry job attribution dropdown visible in expanded row (TC-08)
- [ ] Attribution PATCH saves and appears in carpentry job Costs tab (TC-08)
- [ ] History shows carpentry ref in project column (TC-09)
- [ ] Leading-hand can add task and drag-reorder; regular worker cannot (TC-10)
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
