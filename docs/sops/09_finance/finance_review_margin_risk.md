---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 09-09: Review Margin Risk Across All Jobs

**Module:** Finance — Job Dashboard Selector  
**SOP ID:** 09-09  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Director

## 2. When to use it
Weekly — to get a portfolio-level view of all active jobs ranked by financial risk. Use this before the monthly WIPAA review, before a Director briefing, and whenever you want to know which job needs the most financial attention right now.

## 3. What this does
Shows all active jobs in a single ranked table ordered by margin risk. Identifies which jobs are in financial trouble, which are underclaiming, which need a WIPAA review, and which are performing well. Lets you click into any job's Command Centre with one click.

## 4. How to get there

1. Click **Finance** in the left sidebar
2. Click the **Jobs** tab (or navigate to `/finance/jobs` without a project selected)
3. The Job Dashboard Selector loads — a portfolio view of all active jobs

## 5. Step-by-step process

### Reading the portfolio view

### Sort options
- **Risk** (default) — highest risk jobs at top (calculated priority score)
- **Value** — highest contract value at top
- **Alpha** — alphabetical by job address

### Priority score (risk ranking)
Each job is scored by a combination of factors:
- Is the WIPAA review overdue?
- Is there an underclaim (build% vs claim% diverging by >10%)?
- Is working margin below target or floor?
- What is the total contract value? (higher value = more important to watch)

Higher score = more urgent to review.

### Margin badge
Each job shows a coloured margin badge:
- 🟢 Green — margin is above target + 1%
- 🟡 Amber — within ±1% of target
- 🔴 Red — below target by more than 1%
- 🔴 Red with "CRITICAL" — below the 33% floor

### Warning indicators
Each job row may show warning badges:
- **WIPAA overdue** — last WIPAA review was more than 30 days ago
- **Underclaim** — build percentage is more than 10% ahead of claims percentage, with the underclaim dollar amount shown
- **Overdue claim** — a progress claim is past its due date

### Job summary data shown per row
- Job address
- Contract value
- Actual costs to date
- Working margin %
- Claims issued / claims paid
- Underclaim amount (if applicable)

### Steps — Weekly margin review

1. Navigate to Finance → Jobs (no project selected)
2. Ensure sort order is "Risk" (default)
3. Review the top 3 jobs — these are your highest-risk jobs right now
4. For each job in red or amber:
   a. Click the job to open the Job Command Centre
   b. Check: what is driving the margin issue? (Budget overruns? Missing claims? Forecast too low?)
   c. Take action: update forecast, draft a claim, approve pending invoices, or raise a flag for the Director
   d. Return to the portfolio view for the next job
5. Check for WIPAA overdue badges — complete those reviews (SOP 09-11)
6. Check for underclaim badges — draft the missing claims (SOP 09-08)

## 6. What happens next
After the weekly review, action any red or critical jobs immediately. Log Director escalation items. Return to the portfolio view next week to verify improvements.

### What to escalate to the Director

Escalate immediately if:
- Any job is below the 33% margin floor (critical badge)
- Working margin drops below target by more than 5% with no recovery plan
- A progress claim has been overdue for more than 14 days with no payment
- WIPAA review has not been completed for more than 60 days on a high-value job

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Ignoring amber jobs | Only red feels urgent | Amber jobs are approaching red — catch them before they cross |
| Reading working margin without approving pending invoices first | Pending invoices not yet counted in actuals | Approve pending invoices before doing a portfolio review |
| Not updating forecast_total_cost | Using default value of 0 or old value | WIPAA review prompts for forecast update — keep it current |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Jobs not showing in portfolio | Job may not have a linked Buildxact job_id, or may have no financial data yet |
| Margin looks wrong | Check for unapproved invoices that aren't counted yet; check forecast_total_cost is set |
| Sort order not persisting | Sort is session-based — re-select on each visit |
| WIPAA overdue badge not clearing after review | WIPAA review must be submitted through the WIPAA section (SOP 09-11) to update `last_wipaa_review_date` |

## 9. Related modules
- [Job Command Centre — overview](finance_job_dashboard.md) — SOP 09-07
- [Create a progress claim](finance_create_progress_claim.md) — SOP 09-08
- [WIPAA review](finance_wipaa_review.md) — SOP 09-11

## 10. Screenshot placeholders
- [ ] Portfolio view — list of active jobs with margin badges (green/amber/red)
- [ ] WIPAA overdue and underclaim warning badges on a job row
- [ ] Sort control showing "Risk" selected

## 11. Automation notes
- Route: `GET /api/finance/jobs/portfolio` (or derived from the Jobs tab state)
- `computeJobMetrics` function in `JobDashboardSelector.jsx` calculates the priority score client-side
- Priority score formula: `WIPAA_overdue × 30 + underclaim_amount / 1000 × 20 + margin_risk_severity × 25 + contract_value / 100000 × 5`
- Margin risk severity: 0 (green) / 10 (amber) / 20 (red) / 30 (critical)
- Portfolio aggregation uses the same `command-centre` endpoint per job, batched

## 12. Edge cases and limits
- Only 'active' jobs appear in the portfolio — won, lost, and archived jobs are excluded
- The priority score is computed client-side; refreshing may reorder jobs if data has changed on the server
- Sort order is session-based and does not persist across page reloads
- A job with no approved invoices and no contract value will still appear in the list but with empty margin badges

## 13. Owner
Admin  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least 3 active jobs with varying margin health (one green, one amber or red, one with overdue WIPAA or underclaim)
- [ ] Jobs have approved invoices so actuals are meaningful

### Test cases

**TC-01 — Portfolio view loads**
1. Navigate to Finance → Jobs (no project selected, or directly to `/finance/jobs`)
2. Expected: list of active jobs visible
3. Expected: each job shows address, contract value, margin %
4. Expected: no JavaScript console errors
- [ ] Pass  [ ] Fail

**TC-02 — Risk sort (highest risk at top)**
1. Ensure sort is set to "Risk"
2. Identify the job with the lowest working margin (most at risk)
3. Expected: that job appears at or near the top
4. If a job has a WIPAA overdue badge, it should also rank higher than a non-overdue job with similar margin
- [ ] Pass  [ ] Fail

**TC-03 — Margin badge colours are correct**
1. For each job in the list, note the margin badge colour
2. For one green job: check DB `SELECT (original_contract_value - SUM(approved_amount)) / original_contract_value * 100 AS working_margin FROM ...` — confirm it exceeds target + 1%
3. For one red job: confirm working margin < target - 1%
- [ ] Pass  [ ] Fail

**TC-04 — WIPAA overdue badge**
1. Set `last_wipaa_review_date = CURRENT_DATE - 35` on one job
2. Reload the portfolio view
3. Expected: that job shows "WIPAA overdue" badge
4. Expected: that job ranks higher in the risk sort (all else equal)
- [ ] Pass  [ ] Fail

**TC-05 — Underclaim badge**
1. Find or create a job where build completion % is more than 10% ahead of claims %
2. Load the portfolio view
3. Expected: that job shows "Underclaim: $X" badge with the dollar amount
- [ ] Pass  [ ] Fail  [ ] N/A

**TC-06 — Click-through to Job Command Centre**
1. Click any job row in the portfolio
2. Expected: navigates to `/finance/jobs/<jobId>`
3. Expected: the Job Command Centre loads for that job
- [ ] Pass  [ ] Fail

**TC-07 — Sort by value**
1. Change sort to "Value"
2. Expected: jobs re-order with the highest contract value at top
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Portfolio view loads all active jobs
- [ ] Risk sort puts highest-risk jobs first
- [ ] Margin badge colours match actual margin health
- [ ] WIPAA overdue badge appears when > 30 days
- [ ] Underclaim badge appears when build% - claim% > 10%
- [ ] Click-through to Command Centre works
- [ ] Update `test_status` in frontmatter after passing
