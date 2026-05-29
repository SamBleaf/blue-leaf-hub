---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: placeholders_only
owner: Admin
test_status: static_pass
---

# SOP 05-02: Open a Project in Operations

**Module:** Operations Manager → Project Detail  
**SOP ID:** 05-02  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
All staff (Admin, Supervisor)

## 2. When to use it
When you need to work on a single project — review its trades and purchase orders, set the commencement date, record trade responses, and action supervisor tasks.

## 3. What this does
Opens one project's operational hub. Shows every trade (purchase order) with its communication status, accepted trades that don't yet have a PO, the project's commencement details, and the supervisor task list. From here you also reach the schedule, site diary, and WHS for the project.

## 4. Before you start
- The project exists and is visible on the Operations dashboard
- You are logged in

## 5. Step-by-step process

1. From the Operations dashboard, click a project card
2. The project detail opens. Review:
   - **Trades / POs** — each issued PO with its subcontractor, status, and contact log
   - **Awaiting PO** — accepted RFQ trades that don't have a PO issued yet
   - **Supervisor tasks** — outstanding tasks (e.g. "find backup trade")
3. **Set the commencement date:** enter the date and mark the contract signed if applicable, then save
4. **Record a trade response:** for a PO, record whether the subcontractor responded, is unsure, ghosted, or is unavailable
5. **Action a supervisor task:** mark it in progress or done
6. Use the in-page links to open the project's **Schedule**, **Site Diary**, or **WHS**

## 6. What happens next

- Commencement save updates `projects.commencement_date` and (if signed) `contract_signed_at`
- A trade response records `response_received_at` + `last_contact_at` on the PO and inserts a `trade_communication_log` row
- If a trade is marked **ghosted** or **unavailable**, the system auto-creates a `find_backup_trade` supervisor task (due +2 days) and emails an availability-conflict notice to the subcontractor
- Marking a supervisor task **done** sets `completed_at`

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Not recording trade responses | Tracked verbally | Record every response — it drives backup-trade tasks and the contact log |
| Forgetting commencement date | Skipped | Set it as soon as the contract is signed — schedules and notifications depend on it |
| Ignoring "awaiting PO" trades | Out of sight | Accepted trades without a PO won't be engaged — issue the PO (SOP 05-03) |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "purchase_order_id and response_status required" (400) | Both fields must be sent when recording a response |
| "Invalid response_status" (400) | response_status must be one of: responded, unsure, ghosted, unavailable |
| Backup task not created | Backup tasks only auto-create on `ghosted` or `unavailable` responses |
| Trade missing from the list | It may have no PO and no accepted RFQ — check the RFQ Engine |

## 9. Related modules
- [Issue a purchase order to a trade](operations_issue_purchase_order.md) — SOP 05-03
- [Create a project schedule](../06_scheduling/06-01_schedule_overview.md) — SOP 06-01

## 10. Screenshot placeholders
[insert screenshot: project detail trades list]
[insert screenshot: record trade response control]
[insert screenshot: supervisor tasks panel]

## 11. Automation notes
- Trades: `GET /api/projects/:id/trades` — POs with subcontractor + comms log; also returns accepted RFQs with no PO
- Commencement: `PATCH /api/projects/:id/commencement` with `{ commencement_date?, contract_signed? }`
- Trade response: `POST /api/trade-communication/respond` with `{ purchase_order_id, response_status, notes? }` — `response_status` ∈ {responded, unsure, ghosted, unavailable}
- Supervisor tasks: `GET /api/projects/:id/supervisor-tasks?status=pending`; `PATCH /api/supervisor-tasks/:id` with `{ status?, due_date?, description? }`
- Ghosted/unavailable → auto `find_backup_trade` task (due +2 days) + availability-conflict email to subcontractor
- Task status `done` → sets `completed_at`

## 12. Edge cases and limits
- Recording a response on an already-responded PO updates the timestamps again and logs another event
- The availability-conflict email only sends if the subcontractor has an email on file
- Supervisor task list defaults to `status = pending` unless a different status query is passed

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in
- [ ] A project with at least one issued PO and one accepted RFQ without a PO
- [ ] The PO's subcontractor has an email on file (use sam@blueleafbuilding.com.au for the conflict-email test)

### Test cases

**TC-01 — Project detail loads (happy path)**
1. Open a project from the dashboard
2. Expected: trades/POs list, awaiting-PO list, and supervisor tasks render
3. Expected: `GET /api/projects/:id/trades` returns POs + `noPo` accepted RFQs
- [ ] Pass  [ ] Fail

**TC-02 — Set commencement date**
1. Enter a commencement date, mark contract signed, save
2. Expected DB: `projects.commencement_date` set; `contract_signed_at` set to now
- [ ] Pass  [ ] Fail

**TC-03 — Record a normal trade response**
1. Record response_status = `responded` on a PO with a note
2. Expected: `{ ok: true }`
3. Expected DB: PO `response_received_at` + `last_contact_at` updated; `trade_communication_log` row inserted
- [ ] Pass  [ ] Fail

**TC-04 — Missing fields rejected**
1. Call respond with no `response_status`
2. Expected: HTTP 400 "purchase_order_id and response_status required"
3. Call with `response_status = "maybe"`
4. Expected: HTTP 400 "Invalid response_status"
- [ ] Pass  [ ] Fail

**TC-05 — Ghosted response triggers backup task + email (automation)**
1. Record response_status = `ghosted` on a PO whose subcontractor email = sam@blueleafbuilding.com.au
2. Expected DB: a `supervisor_tasks` row of type `find_backup_trade`, due in 2 days
3. Expected: availability-conflict email arrives at sam@blueleafbuilding.com.au
- [ ] Pass  [ ] Fail

**TC-06 — Complete a supervisor task**
1. PATCH a supervisor task to `status = done`
2. Expected DB: `status = 'done'`, `completed_at` set
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Project detail loads trades + tasks
- [ ] Commencement saves
- [ ] Trade response logs correctly
- [ ] Ghosted triggers backup task + email
- [ ] Supervisor task completion works
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
