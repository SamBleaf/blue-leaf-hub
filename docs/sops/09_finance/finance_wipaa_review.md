---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_fail
---

# SOP 09-11: Complete a WIPAA Review

**Module:** Finance — Job Command Centre  
**SOP ID:** 09-11  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Director

## 2. When to use it
**Every first Friday of the month** for all active jobs. A WIPAA (Work In Progress As Agreed) review ensures the forecast total cost for each job is up to date, and that the projected margin is realistic. This is the most important monthly financial discipline for a building company.

When a WIPAA review is overdue (more than 30 days since the last review), the WIPAA accordion in the Job Command Centre opens automatically with a red border and warning.

## 3. What this does
Records a WIPAA snapshot for the job: contract value, cost to date, forecast total cost, percentage complete, WIPAA value, and projected margin. Stores the review in history so margin trends are traceable over time. Resets the overdue timer.

## 4. Before you start
- You have access to current site progress information (ask the site manager if unsure)
- At least one approved invoice exists for the job (so Cost to Date is non-zero)
- The job has `original_contract_value` set

### Key WIPAA concepts

| Term | Definition |
|------|-----------|
| **Forecast Total Cost** | Your best estimate of what the job will cost in total to complete. Update this whenever the expected final cost changes. |
| **Cost to Date** | Sum of all approved invoices for this job (calculated automatically). |
| **WIPAA Value** | Contract value × percentage complete − total billed to date. Represents earned but unbilled revenue. |
| **Projected Margin %** | (Contract Value − Forecast Total Cost) ÷ Contract Value × 100 |

## 5. Step-by-step process

### Monthly WIPAA review

1. Open the Job Command Centre for the job
2. The WIPAA accordion is at the bottom of the page
   - If overdue (>30 days): it is open with a red border
   - If not overdue: expand it manually
3. Review the current WIPAA calculation:
   - Contract Value (auto-calculated: original + signed variations)
   - Cost to Date (auto-calculated: sum of approved invoices)
   - Current Forecast Total Cost (last value entered — edit if needed)
   - Percentage Complete (enter your estimate: how much of the work is genuinely done?)
   - WIPAA Value (auto-calculated)
   - Projected Margin % (auto-calculated from forecast total cost)
4. **Update Forecast Total Cost** if it has changed since last review:
   - Click the Forecast Total Cost field to edit
   - Enter your updated estimate of the total cost to complete the job
   - This is the most critical number — it should reflect current site reality
5. **Update Percentage Complete**:
   - Enter the % of work that is genuinely complete (not what's been billed — what's been built)
   - This drives the underclaim alert and WIPAA value
6. Add a **Review Note** (optional but recommended — e.g. "Frame complete, locking up next week, concrete slightly over budget")
7. Click **Submit Review**
8. The review is saved to history
9. `last_wipaa_review_date` updates to today
10. The red overdue border disappears
11. The WIPAA accordion closes (or stays open if you want to keep reviewing)

### Review history

To view all past WIPAA reviews for a job:
1. In the WIPAA accordion, click **View history**
2. A table shows all past reviews with: date, reviewer, forecast cost, projected margin, and notes
3. This lets you track whether the forecast has been trending up or down over the life of the job

## 6. What happens next

### Reading the WIPAA value

**Positive WIPAA value**: You have earned more than you have billed. This is an asset — unbilled work in progress. A positive WIPAA means you are ahead of claims relative to completion — you should issue a progress claim.

**Negative WIPAA value**: You have billed more than you have earned (overbilled). This is a liability — you've received payment for work not yet complete. This is uncommon in standard residential builds but can occur if a deposit was large relative to work done.

**WIPAA ≈ 0**: Billing is in line with completion. Ideal state.

### When to flag for the Director

Escalate to the Director immediately if:
- Projected margin drops below target by more than 5% from the previous review
- Forecast Total Cost has increased significantly (>10% from last review) without a corresponding signed variation
- WIPAA value is large and positive but no claim is imminent (cash flow risk)
- The job has been at the same "percentage complete" for more than 2 reviews (stalled job)

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Not updating Forecast Total Cost | Using the default or last review's value | Always re-estimate from current site conditions — what will this job actually cost? |
| Percentage complete = percentage billed | Conflating the two | Completion % is physical progress, not billing progress |
| Skipping months | Busy site | The Hub sends reminders — WIPAA accordion opens red after 30 days |
| Optimistic forecast to avoid a bad-looking margin | Pressure to look good | An inaccurate forecast is useless — the margin will catch up to reality eventually |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| WIPAA value looks obviously wrong | Check that Cost to Date is accurate — approve any pending invoices first |
| Projected margin is negative | Forecast Total Cost exceeds Contract Value — cost overruns are expected to exceed revenue. This needs immediate action: review budget overruns, consider variations to recover cost. |
| WIPAA accordion still shows red after submitting | Refresh the page — `last_wipaa_review_date` should now be today |
| Review history is empty | First review for this job — the history starts with this submission |

## 9. Related modules
- [Job Command Centre — overview](finance_job_dashboard.md) — SOP 09-07
- [Review margin risk across all jobs](finance_review_margin_risk.md) — SOP 09-09
- [Cashflow forecast](finance_cashflow_forecast.md) — SOP 09-12

## 10. Screenshot placeholders
- [ ] WIPAA accordion open with red overdue border and warning message
- [ ] WIPAA calculation panel showing Forecast Total Cost, Cost to Date, WIPAA Value, Projected Margin %
- [ ] Review history table showing past reviews with dates and margin trends

## 11. Automation notes
- API: `GET /api/finance/jobs/:id/wipaa/current` → current WIPAA calculation
- API: `POST /api/finance/jobs/:id/wipaa/review` → save review snapshot to `wipaa_reviews`
- API: `GET /api/finance/jobs/:id/wipaa/history` → all past reviews
- API: `PATCH /api/finance/jobs/:id/financials` → update `forecast_total_cost` (also called from WIPAA form)
- First-Friday scheduler: runs `sendWipaaReminders()` as middleware hook on every `/api/finance` request on the first Friday of each month — creates tasks for all active jobs
- Overdue check: `(today - last_wipaa_review_date) > 30` → `requires_wipaa_review: true` in command-centre payload
- `wipaa_reviews` table: one row per submitted review, stores full WIPAA snapshot
- `jobs.last_wipaa_review_date` updated on each `POST .../wipaa/review`

## 12. Edge cases and limits
- The WIPAA calculation uses signed variations only — unsigned (draft/sent) variations are excluded from Contract Value
- If no WIPAA review has ever been submitted, `last_wipaa_review_date` is null — the accordion opens red immediately for new jobs
- Forecast Total Cost cannot be zero for meaningful projections; the system will accept 0 but the Projected Margin will show 100% (misleading)
- A review note is optional but highly recommended for audit trail purposes
- First-Friday reminders are middleware-based and only fire when `/api/finance` is called — if the API is not accessed on the first Friday, no reminders are sent that month

## 13. Owner
Admin  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A job with at least one approved invoice (so Cost to Date is non-zero)
- [ ] The job has `original_contract_value` set
- [ ] Know `last_wipaa_review_date` from DB: `SELECT last_wipaa_review_date FROM jobs WHERE id = '<id>'`

### Test cases

**TC-01 — WIPAA calculation is accurate**
1. Open the WIPAA accordion for a job
2. Note: Contract Value, Cost to Date, Forecast Total Cost, Projected Margin %
3. Check DB:
   - Contract value: `SELECT original_contract_value + COALESCE((SELECT SUM(amount_ex_gst) FROM job_variations WHERE job_id = '<id>' AND status = 'signed'),0) FROM jobs`
   - Cost to Date: `SELECT SUM(approved_amount) FROM financial_documents WHERE job_id = '<id>' AND status = 'approved'`
4. Expected: values on screen match DB calculations
- [ ] Pass  [ ] Fail

**TC-02 — WIPAA accordion opens red when overdue**
1. Set `last_wipaa_review_date = CURRENT_DATE - 35` in DB
2. Reload the Job Command Centre
3. Expected: WIPAA accordion is open with red/warning styling
4. Expected: overdue message visible
- [ ] Pass  [ ] Fail

**TC-03 — Submit a WIPAA review**
1. Open the WIPAA accordion
2. Set Forecast Total Cost: enter a value (e.g. $850,000)
3. Set Percentage Complete: 65
4. Add note: "Test WIPAA review TC-03"
5. Click Submit Review
6. Expected: success confirmation
7. Check DB: `SELECT * FROM wipaa_reviews WHERE job_id = '<id>' ORDER BY created_at DESC LIMIT 1`
   - review_date = today
   - forecast_total_cost = 850000
   - pct_complete = 65
   - notes = "Test WIPAA review TC-03"
8. Check DB: `SELECT last_wipaa_review_date FROM jobs WHERE id = '<id>'` = today
- [ ] Pass  [ ] Fail

**TC-04 — Overdue indicator clears after review**
1. Complete TC-02 (set overdue) then TC-03 (submit review)
2. Reload the Job Command Centre
3. Expected: WIPAA accordion no longer shows red/overdue styling
- [ ] Pass  [ ] Fail

**TC-05 — Projected margin calculation**
1. In the WIPAA accordion, set Forecast Total Cost = $900,000
2. Note the Projected Margin % shown
3. Note the Contract Value shown (e.g. $1,200,000)
4. Expected: Projected Margin % = (1,200,000 − 900,000) / 1,200,000 × 100 = 25%
5. Change Forecast Total Cost to $960,000
6. Expected: Projected Margin % updates to 20%
- [ ] Pass  [ ] Fail

**TC-06 — WIPAA history**
1. Submit two reviews for the same job (run TC-03 twice with different values)
2. Click "View history" in the WIPAA accordion
3. Expected: both reviews appear in the history table
4. Expected: most recent review at top
5. Expected: forecast_total_cost and projected margin visible per review
- [ ] Pass  [ ] Fail

**TC-07 — First-Friday reminder (if testable)**
1. Note: this is a middleware hook that fires on every /api/finance request on the first Friday of the month
2. If today is the first Friday of a month:
   - Make any request to `/api/finance` 
   - Expected: WIPAA reminder tasks created for all active jobs with WIPAA overdue
3. If not the first Friday: mark N/A
- [ ] Pass  [ ] Fail  [ ] N/A

### Post-test checklist
- [ ] WIPAA calculation matches DB figures
- [ ] Accordion opens red when > 30 days since last review
- [ ] Review submission saves to wipaa_reviews table
- [ ] `last_wipaa_review_date` updates on submission
- [ ] Projected margin % is mathematically correct
- [ ] History shows all past reviews
- [ ] Update `test_status` in frontmatter after passing
