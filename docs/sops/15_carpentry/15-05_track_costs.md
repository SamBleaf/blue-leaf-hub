---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: untested
---

# SOP: Track Carpentry Job Costs

**Module:** Carpentry  
**SOP ID:** 15-05  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this

Admin, Supervisor

---

## 2. When to use it

When you need to enter material purchases, subcontract invoices, or other costs against a carpentry job. Also use it to monitor the Budget vs Actual dashboard to check whether the job is tracking on or off margin.

---

## 3. What this does

The Costs tab of a carpentry job tracks two categories of actual cost:
1. **Labour** — automatically sourced from approved timesheets that have been assigned this job's `carpentry_job_id` (see Workforce module)
2. **Materials, subcontracts, and other costs** — manually entered here

The tab shows a Budget vs Actual summary card with Revenue, Total Actual Cost, Forecast Margin %, and Variance from budgeted margin. All amounts are ex-GST.

---

## 4. Before you start

- The carpentry job must have a **Quoted Value** set (so margin can be calculated)
- Material costs must be entered manually until Xero integration is live
- Labour costs come from approved timesheets — see SOP 10-01 (Workforce)

---

## 5. Step-by-step process

**Add a material or other cost:**

1. Open the carpentry job
2. Click the **Costs** tab
3. Click **+ Add Cost**
4. Fill in the cost form:
   - **Type** — Material / Subcontract / Other
   - **Amount (ex GST)** — dollar amount before GST
   - **Description** — what was purchased (e.g. "LVL beams — Bowens invoice #1234")
   - **Date** — defaults to today
5. Click **Add Cost**
6. The cost appears in the table, and the Budget vs Actual card updates immediately

**Read the Budget vs Actual card:**

| Field | Meaning |
|---|---|
| Revenue | Quoted value (what you charged the builder) |
| Total Actual Cost | Labour actuals + all material/subcontract costs entered |
| Forecast Margin | (Revenue − Total Actual Cost) / Revenue × 100 |
| Budget Margin | The margin percentage from the original Buildexact estimate |
| Variance | Forecast Margin − Budget Margin (positive = tracking better than budget) |

**Delete a cost entry:**

1. Find the cost in the table
2. Click **Delete** at the right end of the row
3. Confirm the deletion
4. The cost is removed and the summary card updates

> 💡 **Tip:** Enter costs as soon as invoices arrive — don't wait. An accurate running cost record is more useful than a perfect end-of-job reconciliation.

[insert screenshot: Costs tab showing Budget vs Actual card, Labour breakdown, and cost entries table]

---

## 6. What happens next

As costs are added, the Forecast Margin updates in real time. A negative Forecast Margin (red text) means the job is running at a loss. A positive Variance (green) means you're tracking better than your original budget.

---

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Labour costs show $0 | Timesheets not assigned to this carpentry job | Assign timesheets via the Workforce module (Approvals tab) |
| Forecast Margin shows "—" | Quoted value not set on the job | Go to Overview tab → Edit → set Quoted Value |
| Costs entered inc. GST | User enters the total-inc-GST amount | Always enter ex-GST amounts |

---

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|---|---|---|
| "amount must be a non-negative number" | Amount field is empty or negative | Enter a positive dollar amount |
| Labour shows $0 despite approved timesheets | Timesheets not linked to this carpentry job's ID | In Workforce, re-approve the timesheet and assign carpentry_job_id |

---

## 9. Related SOPs

- 15-01: Carpentry Overview
- 15-02: Create a Carpentry Job
- 10-01: Workforce — Approve a Timesheet (for labour cost attribution)

---

## 10. Screenshot placeholders

[insert screenshot: Costs tab — Budget vs Actual summary card showing Revenue, Total Actual Cost, Forecast Margin, Budget Margin, and Variance]
[insert screenshot: "+ Add Cost" form expanded — Type, Amount, Description, Date fields]
[insert screenshot: Cost entries table with Type, Description, Amount columns and Delete button on each row]

---

## 11. Automation notes

- Labour costs are NOT entered here — they are computed from `timesheets` rows where `carpentry_job_id` matches and `status = 'approved'`. The Costs tab shows this as a read-only line.
- `GET /api/carpentry/jobs/:id/summary` calculates `labourActual` (from timesheets), `otherActual` (from `carpentry_job_costs`), `totalActual`, and `forecastMarginPct` server-side on each request.
- Forecast Margin = (revenue − totalActual) / revenue × 100. Returns `null` if `quoted_value` is null.
- No email or notification is sent on cost entry.
- Cost entries are stored in `carpentry_job_costs` table.

---

## 12. Edge cases and limits

- Labour costs from timesheets are read-only on this tab — they must be corrected via the Workforce module.
- If `quoted_value` is null on the job, Forecast Margin shows "—" (no division-by-zero error).
- There is no limit on the number of cost entries per job.
- Cost entries cannot be edited after creation — delete and re-enter if an amount is wrong.
- All amounts must be entered ex-GST. Entering an inc-GST amount will overstate the cost and understate the margin.
- Negative amounts are rejected (HTTP 400).

---

## 13. Owner of the process

Admin / Supervisor  
Next review date: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### TC-01 — Add a material cost

**Action:** POST `/api/carpentry/jobs/:id/costs` with `{ costType: "material", description: "LVL beams", amount: 3500, costDate: "2026-06-01" }`.  
**Expected:** `{ ok: true, cost: { id, jobId, costType: "material", description: "LVL beams", amount: 3500, costDate: "2026-06-01" } }` — camelCase.  
**Pass criteria:** `ok: true`, `costType: "material"`, `amount: 3500`.

---

### TC-02 — List costs for job

**Action:** GET `/api/carpentry/jobs/:id/costs`.  
**Expected:** `{ ok: true, costs: [ { costType, description, amount, costDate } ] }` — most recent first.  
**Pass criteria:** Array returned, camelCase keys.

---

### TC-03 — Delete a cost

**Action:** DELETE `/api/carpentry/costs/:cid`.  
**Expected:** `{ ok: true }`. Verify: GET costs list — deleted entry absent.  
**Pass criteria:** 200, `ok: true`, entry removed from list.

---

### TC-04 — Invalid cost type rejected

**Action:** POST costs with `{ costType: "labour", description: "X", amount: 100 }`.  
**Expected:** HTTP 400, error message containing "costType must be one of".  
**Pass criteria:** 400 status, validation error.

---

### TC-05 — Negative amount rejected

**Action:** POST costs with `{ costType: "material", description: "X", amount: -500 }`.  
**Expected:** HTTP 400, `{ ok: false, error: "amount must be a non-negative number." }`.  
**Pass criteria:** 400 status.

---

### TC-06 — Summary endpoint returns correct totals

**Action:** Job with quotedValue: 100000. Add 2 costs: $5000 and $3000. GET `/api/carpentry/jobs/:id/summary`.  
**Expected:**
```json
{
  "summary": {
    "revenue": 100000,
    "otherActual": 8000,
    "labourActual": 0,
    "totalActual": 8000,
    "forecastMarginPct": 92.0,
    "costEntryCount": 2
  }
}
```
**Pass criteria:** `otherActual === 8000`, `totalActual === 8000`, `forecastMarginPct === 92.0`.

---

### TC-07 — Summary with labour from timesheets

**Action:** Create an approved timesheet with `carpentry_job_id` set to this job's ID. Employee hourly_rate = $50, timesheet entry hours = 8.  
**Expected:** GET summary → `labourActual === 400`, `timesheetCount === 1`.  
**Pass criteria:** Labour costs correctly aggregated from timesheets table.

---

### TC-08 — Forecast margin is null when quotedValue is 0

**Action:** Job with no quotedValue (null). GET summary.  
**Expected:** `forecastMarginPct === null`.  
**Pass criteria:** No division-by-zero error, `forecastMarginPct` is null.
