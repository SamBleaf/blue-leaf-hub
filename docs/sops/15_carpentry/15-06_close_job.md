---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Close a Carpentry Job

**Module:** Carpentry  
**SOP ID:** 15-06  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this

Admin, Supervisor

---

## 2. When to use it

When a carpentry job reaches practical completion and all costs and timesheets have been entered. Closing a job locks editing, records a final performance snapshot, and moves the job to the **Complete** filter in the dashboard.

---

## 3. What this does

The Close Job action:
1. Sets the job status to **Complete**
2. Records today as the **Actual End** date (if not already set)
3. Writes a **Closeout Performance** snapshot — final margin %, variance vs budget, total cost, and duration in days — to the job record for future reference in the Historical Performance view (Sprint 4)
4. **Locks editing** — the Edit button and Change Status dropdown are hidden once a job is closed. Contact an admin to reopen a job if a correction is needed.

---

## 4. Before you start

- All material costs should be entered in the Costs tab
- All timesheets for this job should be approved and attributed to this carpentry job ID in the Workforce module
- The job's **Quoted Value** should be set (otherwise the margin calculation shows "—")

---

## 5. Step-by-step process

1. Open the carpentry job (click its row in the Carpentry dashboard)
2. Click the **Overview** tab if not already on it
3. Click the teal **Close Job** button in the top-right of the job header
4. A confirmation modal appears showing:
   - Revenue (quoted value)
   - Total Actual Cost (labour + materials to date)
   - Forecast Margin %
   - Variance vs budget
5. Review the numbers. If they look wrong, click **Cancel** and fix the costs or timesheets first.
6. Click **Confirm — Close Job**
7. The job status changes to **Complete** and the blue **✓ Job Closed** badge replaces the action buttons
8. A **Closeout Performance** section appears at the bottom of the Overview tab with the locked snapshot

> ⚠️ **There is no undo button.** A closed job can only be reopened by an admin via a support request or direct database change.

[insert screenshot: Close Job modal showing Revenue / Total Actual / Forecast Margin / Variance]

---

## 6. What happens next

- The job appears under the **Complete** status filter in the Carpentry dashboard
- The Closeout Performance card on the Overview tab shows the final margin and duration
- In Sprint 4, the Historical Performance view will aggregate closed jobs to show average margin %, average days per project type, and cost per m²

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Closed with $0 labour cost | Timesheets not attributed to this carpentry job | Attribute timesheets in the Workforce Approvals tab before closing |
| Forecast Margin shows "—" in the modal | No Quoted Value set on the job | Go to Overview → Edit → set Quoted Value before closing |
| Closed the wrong job | Rushed workflow | Always check the job reference (CJB-NNN) and client name in the modal header |

---

## 8. Troubleshooting

| Problem | Most likely cause | Fix |
|---------|------------------|-----|
| "Close Job" button not visible | Job is already complete or cancelled | Check the status badge. If cancelled, a support request is needed to reopen it. |
| "Could not close job" error | Network or server error | Refresh the page and try again. If it persists, check the browser console and contact the developer. |
| Closeout Performance section not showing after close | Job's closeout_data is null (pre-migration data) | Only jobs closed after migration 065 runs have this snapshot. |

---

## 9. Related SOPs

- 15-01: Carpentry Overview
- 15-02: Create a Carpentry Job
- 15-05: Track Costs
- 10-01: Workforce — Approve a Timesheet (attribute timesheets before closing)

---

## 10. Approval and sign-off

Not required — any admin or supervisor can close a job.

---

## 11. Version history

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-05-30 | Claude | Initial draft — Sprint 3 closeout feature |

---

## 12. Screenshots required

- [ ] Overview tab showing "Close Job" button (active job)
- [ ] Closeout confirmation modal with summary stats
- [ ] Overview tab after close showing "✓ Job Closed" badge and Closeout Performance card

---

## 13. Notes for trainers

The Close Job flow calls `POST /api/carpentry/jobs/:id/closeout` which computes the final summary server-side from live data (timesheets + costs) and writes it to `carpentry_jobs.closeout_data` (JSONB). This snapshot is permanent — it will not update if timesheets are added or changed after close. This is intentional: the snapshot represents the state at time of close.

If a mistake is made (e.g., a timesheet is added after close), an admin can unapprove the timesheet, reopen the job via a direct DB update (`UPDATE carpentry_jobs SET status = 'active' WHERE id = '...'`), then re-close it to regenerate the snapshot.

---

## 14. Troubleshoot Agent Test Script

### TC-01 — Close an active job

**Action:** POST `/api/carpentry/jobs/:id/closeout` with `{}` body on an active job with `quoted_value: 50000`, one cost of $10000, and an approved timesheet totalling $5000 labour.  
**Expected:** `{ ok: true, job: { status: "complete", actualEnd: "<today>" }, closeout: { revenue: 50000, totalActual: 15000, forecastMarginPct: 70.0 } }`.  
**Pass criteria:** `ok: true`, `status === "complete"`, `totalActual === 15000`, `forecastMarginPct === 70.0`.

---

### TC-02 — Cannot close an already-complete job

**Action:** POST `/api/carpentry/jobs/:id/closeout` on a job with `status: "complete"`.  
**Expected:** HTTP 400, `{ ok: false, error: "Job is already closed." }`.  
**Pass criteria:** 400 status, appropriate error message.

---

### TC-03 — Cannot close a cancelled job

**Action:** POST `/api/carpentry/jobs/:id/closeout` on a job with `status: "cancelled"`.  
**Expected:** HTTP 400, `{ ok: false, error: "Cannot close a cancelled job." }`.  
**Pass criteria:** 400 status.

---

### TC-04 — Closeout with no quoted value

**Action:** Close a job where `quoted_value` is null.  
**Expected:** `closeout.forecastMarginPct === null` (no division-by-zero), `ok: true`.  
**Pass criteria:** 200 status, `forecastMarginPct` is null not an error.

---

### TC-05 — UI: Close Job button hidden after close

**Action:** Open a completed job in the browser. Check the top-right header area.  
**Expected:** "Close Job", "Change Status", and "Edit" buttons are absent. "✓ Job Closed" badge is shown.  
**Pass criteria:** No action buttons visible; locked badge present.

---

### TC-06 — UI: Close Job button triggers modal with summary

**Action:** Open an active job in the browser. Click "Close Job".  
**Expected:** Modal appears with Revenue, Total Actual Cost, Forecast Margin, and Variance fields populated.  
**Pass criteria:** Modal renders. Numbers match what the Costs tab shows.

---

### TC-07 — UI: Closeout Performance card shown after close

**Action:** After closing a job (TC-01 or UI flow), reload the job detail page.  
**Expected:** The blue "Closeout Performance" section appears at the bottom of the Overview tab with Final Margin, vs Budget, Total Cost, and Duration fields.  
**Pass criteria:** Section visible with correct values from `closeout_data`.

---

### TC-08 — Duration days calculation

**Action:** Close a job where `actual_start = "2026-05-01"` and `actual_end = "2026-05-30"`.  
**Expected:** `closeout.durationDays === 29`.  
**Pass criteria:** Duration is correct (end - start in calendar days).
