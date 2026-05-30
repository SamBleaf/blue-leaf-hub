---
sop_version: 1.1
last_reviewed: 2026-05-30
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
The Workforce module has three tabs for managers and a separate mobile PWA for workers:

**Approvals tab** — lists all submitted timesheets waiting for manager approval. Review each entry, approve or reject.

**Mass Fill tab** — lets a manager enter a week of timesheets for multiple workers at once. Useful when workers do not have phones or prefer not to use the app.

**History tab** — a searchable record of all past timesheets (approved, rejected, and pending) filtered by employee, project, or date range.

**Worker PWA** (`/worker`) — the mobile interface where workers log their own hours and check their assigned site tasks for the day. No login required beyond the site link.

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
1. Worker opens the link `/worker` on their phone
2. Selects their name and project
3. Enters start time, finish time, and break — system calculates hours
4. Submits — timesheet appears in the Approvals queue for the manager

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
- API: `GET /api/workforce/timesheets` — list timesheets (supports `?status=pending&projectId=&employeeId=`)
- API: `POST /api/workforce/timesheets` — create timesheet entry (from worker PWA or Mass Fill)
- API: `PATCH /api/workforce/timesheets/:id` — approve or reject (`{ status: 'approved' | 'rejected', rejectionReason? }`)
- API: `GET /api/workforce/employees` — list all employees for dropdowns
- API: `GET /api/workforce/site-tasks` — site tasks assigned to workers (shown in Worker PWA)
- API: `PATCH /api/workforce/timesheets/:id/carpentry-job` — attribute a timesheet to a carpentry job (`{ carpentryJobId: "uuid" | null }`) — admin/supervisor only; timesheet must not be approved
- DB effects: writes to `timesheets` table with `employee_id`, `project_id`, `date`, `hours`, `status`, `submitted_at`, `approved_at`, `approved_by`, `carpentry_job_id`

## 10a. Version history

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-05-30 | Claude | Initial draft |
| 1.1 | 2026-05-30 | Claude | Added carpentry job attribution — Approvals expanded row dropdown + PATCH endpoint docs |

---

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] At least 2 employees exist in the system
- [ ] At least 1 project exists
- [ ] One pending timesheet exists (submit via Worker PWA or Mass Fill before running tests)

### Test cases

**TC-01 — Approvals tab lists pending timesheets**
1. Go to Workforce → Approvals
2. Expected: pending timesheets are listed with employee name, project, date, hours
3. Expected API: `GET /api/workforce/timesheets?status=pending` returns array with at least one item
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

### Post-test checklist
- [ ] Approvals queue shows pending timesheets
- [ ] Approve and reject both work and persist to DB
- [ ] Mass Fill creates correct DB rows
- [ ] History tab shows approved records
- [ ] Worker PWA submission lands in Approvals
- [ ] Carpentry job attribution dropdown visible in expanded row (TC-08)
- [ ] Attribution PATCH saves and appears in carpentry job Costs tab (TC-08)
- [ ] History shows carpentry ref in project column (TC-09)
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
