---
sop_version: 1.1
last_reviewed: 2026-07-02
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
3. Writes a **Closeout Performance** snapshot — final margin %, variance vs budget, total cost, duration days, labour hours, and cost/m² — to the `carpentry_job_performance` table for historical reporting
4. **Shows a warning banner** on the Overview tab ("edits are allowed but will not change the performance snapshot") — the Edit button and Change Status dropdown remain available, but the snapshot is frozen at close time

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
   - A "Lessons learned" text field (optional — record what went well or what you'd do differently)
5. Review the numbers. If they look wrong, click **Cancel** and fix the costs or timesheets first.
6. Click **Confirm — Close Job**
7. The job status changes to **Complete** and a blue **"✓ Job closed"** banner appears at the top of the Overview tab (editing remains available but the performance snapshot is now frozen)
8. A **Closeout Performance** card appears at the bottom of the Overview tab showing Final Margin, vs Budget, Total Cost, Duration, Labour hours, and Cost/m²

> ⚠️ **The performance snapshot is frozen at close time.** Edits to the job after closing are allowed, but the Closeout Performance card will not update. To regenerate the snapshot (e.g. after adding a missed timesheet), an admin must reopen the job via a direct DB update (`UPDATE carpentry_jobs SET status = 'active' WHERE id = '...'`), then re-close it.

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
| "Close Job" button not visible | Job is already complete or cancelled | Check the status badge. If complete, the job is already closed — the performance snapshot is at the bottom of the Overview tab. If cancelled, use the "Change Status" dropdown to revert to Active. |
| "Could not close job" error | Network or server error | Refresh the page and try again. If it persists, check the browser console and contact the developer. |
| Closeout Performance section not showing after close | Performance row not written (server error at close time) | Check server logs for a 502 at `POST /api/carpentry/jobs/:id/closeout`. Re-opening and re-closing the job will regenerate the snapshot. |

---

## 9. Related SOPs

- 15-01: Carpentry Overview
- 15-02: Create a Carpentry Job
- 15-05: Track Costs
- 10-01: Workforce — Approve a Timesheet (attribute timesheets before closing)

---

## 10. Screenshot placeholders

[insert screenshot: Overview tab showing "Close Job" button (teal, top-right) on an active job]
[insert screenshot: Closeout confirmation modal — Revenue, Total Actual Cost, Forecast Margin, vs Budget displayed; Lessons learned text field]
[insert screenshot: Overview tab after close — "✓ Job closed" banner, Closeout Performance card with Final Margin / vs Budget / Total Cost / Duration / Labour hours / Cost per m²]

---

## 11. Automation notes

- `POST /api/carpentry/jobs/:id/closeout` computes final actuals server-side (labour from approved timesheets × employee hourly_rate; materials from `carpentry_job_costs`).
- A row is upserted into `carpentry_job_performance` (conflict on `job_id`) — contains `final_revenue`, `final_labour_cost`, `final_material_cost`, `final_total_cost`, `labour_hours`, `final_margin_pct`, `budget_margin_pct`, `variance_pct`, `floor_area_m2`, `hours_per_m2`, `cost_per_m2`, `duration_days`, `timesheet_count`, `cost_entry_count`, `lessons_learned`, `closed_at`, `closed_by`.
- The `carpentry_jobs.status` is updated to `complete` and `actual_end` is set to today.
- Response: `{ ok: true, job: { ... }, performance: { ... } }`.
- No email or notification is sent on close.
- The performance snapshot is frozen at close time. Edits to timesheets or costs after close do NOT update it.

---

## 12. Edge cases and limits

- Closing an already-complete job returns HTTP 400 "Job is already closed."
- Closing a cancelled job returns HTTP 400 "Cannot close a cancelled job." Use "Change Status" to revert to Active first if needed.
- If `quoted_value` is null, `finalMarginPct` and `variancePct` are null (no division-by-zero).
- If `actual_start` and `start_date` are both null, `durationDays` is null.
- Edit and Change Status remain available after close — a "edits allowed but snapshot is frozen" banner is shown. This is intentional so minor corrections (e.g. a typo in the client name) don't require re-closing.
- To regenerate the snapshot after a post-close correction: DB update `status = 'active'`, then re-close via the UI.
- Any admin or supervisor can close a job — no additional approval required.

---

## 13. Owner of the process

Admin / Company Director  
Next review date: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### TC-01 — Close an active job

**Action:** POST `/api/carpentry/jobs/:id/closeout` with `{}` body on an active job with `quoted_value: 50000`, one cost of $10000, and an approved timesheet totalling $5000 labour.  
**Expected:** `{ ok: true, job: { status: "complete", actualEnd: "<today>" }, performance: { finalRevenue: 50000, finalTotalCost: 15000, finalMarginPct: 70.0, variancePct: <number or null> } }`.  
**Pass criteria:** `ok: true`, `job.status === "complete"`, `performance.finalTotalCost === 15000`, `performance.finalMarginPct === 70.0`.

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
