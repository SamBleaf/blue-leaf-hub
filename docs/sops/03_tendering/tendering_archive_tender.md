---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.1 — audited archive API + RFQ delete guard
screenshot_status: placeholders_only
owner: Admin
test_status: static_pass
---

# SOP 03-04: Archive or Delete a Tender

**Module:** Tender Manager → Tender Board  
**SOP ID:** 03-04  
**Status:** Draft  
**Priority:** Low

---

## 1. Who uses this
Admin

## 2. When to use it
- **Archive** when a tender is finished (won or lost) and you want to remove it from the active board but keep the record.
- **Delete** only when a tender was created by mistake and must be removed entirely — for example a duplicate or a test record.

## 3. What this does
- **Archive** sets the job status to `archived` via the server API. The action is logged to `job_events` for audit. The tender is hidden from the board unless "Show archived" is on. Nothing is lost; archive is reversible.
- **Delete** permanently removes the job and all of its related records (projects, purchase orders, fee proposals, cost intelligence, unmatched quote emails). This cannot be undone. **Delete is blocked** if the job has any linked RFQ packages or individual quotes — archive instead.

## 4. Before you start
- You are an Admin
- For delete: you are certain the tender should be permanently removed — there is no undo

## 5. Step-by-step process

### Archive a tender
1. Go to **Tender Manager → Tender Board**
2. Find the tender card
3. Open the card's action menu (⋯)
4. Click **Archive**
5. Confirm at the prompt ("Archive this tender? It becomes read-only.")

The tender is archived and disappears from the active board.

### Delete a tender (permanent)
1. On the tender card, open the action menu (⋯)
2. Click **Delete**
3. Read the warning carefully — this removes the job and everything linked to it
4. Confirm the deletion

> ⚠️ **Warning:** Deletion is permanent and cascades to projects, purchase orders, fee proposals, and cost intelligence records for this job. Archive instead if you might need the record later.

## 6. What happens next

- **Archive:** `POST /api/tender/archive { jobId }` sets `jobs.status → 'archived'` and logs a `tender.archived` event to `job_events`. Reversible — use `POST /api/tender/unarchive` or re-open the board and change status.
- **Delete:** the server checks for `rfq_packages` / `rfqs` linked to the job first — if any exist, the delete is blocked (409). If none, removes in order: purchase orders (by project) → projects → fee proposals → cost intelligence → unmatched quote emails → the job itself. Irreversible.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Deleting instead of archiving | Confused the two actions | Default to Archive. Only delete genuine mistakes/duplicates. |
| Deleting a job with real history | Didn't realise the cascade | Deletion removes POs, proposals and cost data too — archive preserves all of it |
| Trying to delete a job with RFQs | The job has linked RFQ packages or quotes | You'll get a 409 error — archive the job instead |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Archived tender still showing | "Show archived" is on — untick it |
| "jobId required" (400) on delete or archive | The API call didn't include the job ID — reload the board and retry |
| Delete blocked: "This tender has linked RFQ packages or quotes" (409) | The job has RFQ data — archive it instead of deleting |
| Need an archived tender back | Use `POST /api/tender/unarchive { jobId }` or contact Admin to restore the status |

## 9. Related modules
- [Use the tender board](tendering_tender_board.md) — SOP 03-03

## 10. Screenshot placeholders
[insert screenshot: tender card action menu]
[insert screenshot: delete confirmation warning]

## 11. Automation notes
- Archive: `POST /api/tender/archive { jobId }` (requires auth; admin or supervisor role) — sets `jobs.status = 'archived'`, logs `tender.archived` event to `job_events`
- Unarchive: `POST /api/tender/unarchive { jobId }` — sets `jobs.status = 'tendering'`, logs `tender.unarchived` event
- Delete: `POST /api/tender/job-delete { jobId }` (requires auth) — first checks `rfq_packages` + `rfqs` for any linked rows; returns 409 `{ ok:false, error:"...", code:"TENDER_HAS_RFQ_DATA" }` if found
- Delete cascade order (only if no RFQ data): `purchase_orders` (by project) → `projects` → `fee_proposals` → `cost_intelligence` → `unmatched_quote_emails` → `jobs`
- Returns 400 if `jobId` missing; 409 if RFQ data exists; 502 on DB error

## 12. Edge cases and limits
- Delete is permanent — there is no soft-delete or trash for jobs
- Delete is blocked (409) if the job has any `rfq_packages` or `rfqs` rows — archive is the only option for jobs with quote data
- All projects under the job are deleted, which removes their schedules, diary, WHS, and portal data via downstream cascades
- Archive is fully reversible via `POST /api/tender/unarchive`; delete is not

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

> ⚠️ Run delete tests only against disposable test jobs. Deletion is permanent.

### Pre-test setup
- [ ] Logged in as Admin
- [ ] A disposable test job (no RFQs) with at least one project + PO + fee proposal, for the delete cascade test
- [ ] A second test job (no RFQs) for the archive test
- [ ] A third test job that **has** linked `rfqs` rows, for the delete guard test

### Test cases

**TC-01 — Archive a tender (happy path)**
1. Open a tender card action menu and click Archive, confirm
2. Expected: tender disappears from the active board
3. Expected DB: `jobs.status = 'archived'`; a `tender.archived` event row in `job_events`
- [ ] Pass  [ ] Fail

**TC-02 — Archived tender reappears with toggle**
1. Tick "Show archived"
2. Expected: the archived tender is listed again in the Archived stage group
- [ ] Pass  [ ] Fail

**TC-03 — Delete a tender (permanent cascade)**
1. On a disposable test job (no RFQs), open the menu and click Delete, confirm
2. Expected: `POST /api/tender/job-delete` returns `{ ok: true }`
3. Expected DB: the `jobs` row is gone
4. Expected DB: related `projects`, `purchase_orders`, `fee_proposals`, `cost_intelligence` rows for that job are gone
- [ ] Pass  [ ] Fail

**TC-04 — Delete without jobId rejected**
1. Trigger the delete endpoint with no `jobId`
2. Expected: HTTP 400 `{ ok: false, error: "jobId required." }`
- [ ] Pass  [ ] Fail

**TC-05 — Archive is reversible (unarchive)**
1. Call `POST /api/tender/unarchive { jobId }` for the archived job
2. Expected: `jobs.status = 'tendering'`; tender returns to the active board; `tender.unarchived` event in `job_events`
- [ ] Pass  [ ] Fail

**TC-06 — Delete blocked when RFQs exist**
1. Attempt to delete a job that has linked `rfqs` rows
2. Expected: HTTP 409 `{ ok: false, error: "This tender has linked RFQ packages or quotes. Archive it instead of deleting.", code: "TENDER_HAS_RFQ_DATA" }`
3. Expected DB: no rows deleted
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Archive hides the tender, logs to job_events, is reversible
- [ ] Delete removes the job and cascades to related records (no RFQ data)
- [ ] Delete blocked (409) when RFQ data exists
- [ ] jobId required on delete and archive
- [ ] No accidental deletion of non-test data
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
