---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 09-07: Job Command Centre — Overview

**Module:** Finance — Job Command Centre  
**SOP ID:** 09-07  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Director

## 2. When to use it
Use the Job Command Centre to get the full financial picture of a single job: contract value, costs to date, margin health, outstanding invoices, progress claims, variations, and WIPAA forecast. Check it weekly per active job.

## 3. What this does
The Job Command Centre is a single-page financial dashboard for one job. It aggregates all financial data in one view so you never need to cross-reference spreadsheets, Buildxact, and the approval queue simultaneously.

## 4. How to get there

**Option A — From Projects:**
1. Select a project from the project picker (top of any page)
2. Click **Finance** in the sidebar → **Job Dashboard**
3. The command centre loads for the job linked to the selected project

**Option B — Direct URL:**
Navigate to `/finance/jobs/{jobId}`

**Option C — From JobDashboardSelector:**
Navigate to Finance → Jobs (no project selected) — shows a portfolio of all jobs ranked by margin risk. Click any job to open its command centre.

## 5. Reading the Command Centre

### Job header
Shows: job address, current contract value (includes signed variations), forecast margin %, and margin health colour.

### KPI bar
Six key figures across the top:

| KPI | What it means |
|-----|--------------|
| Contract $ | Original contract + all signed variations |
| Claims Issued $ | All progress claims sent to the client (not draft, not void) |
| Claims Paid $ | Cash actually received from the client |
| Actual Costs $ | Sum of all approved invoices (trade-tagged) |
| Working Margin % | (Contract − Actual Costs) ÷ Contract |
| Forecast Margin % | (Contract − Forecast Total Cost) ÷ Contract |

### Margin health indicator
- 🟢 Green — current margin is more than 1% above target
- 🟡 Amber — within ±1% of target (watch closely)
- 🔴 Red — below target by more than 1% (action needed)
- 🔴 Critical — below floor (33%) — requires Director confirmation and documented reason

### Budget vs Actual table
Shows each trade category with:
- Budget (from Buildxact seed or manual entry)
- Actual costs (from approved invoices)
- Forecast (editable — how much do you expect to spend in total?)
- Status: 🟢 on track / 🟡 approaching budget / 🔴 over budget

### Underclaim alert
Fires when the percentage of work complete diverges from the percentage claimed by more than 10%. Example: "Build 58% complete · Claimed 42% · ~$92k underclaimed". Click to draft a progress claim.

### Requires Action
Items that need immediate attention:
- Invoices pending approval with AI trade confidence shown
- Overdue progress claims with chase prompt
- Held invoices with follow-up dates approaching

### Variations
Shows variations by status (draft / sent / signed / rejected). Signed variations are included in Contract $. Unsigned variations show an "UNSIGNED — no P&L impact" badge.

### WIPAA accordion
Work In Progress As Agreed. Shows the WIPAA calculation for the current month. Opens automatically (red border) when more than 30 days have passed since the last review. See SOP 09-11 for the review process.

### Progress Claims accordion
Lists all claims with status, issue date, due date, and payment status. Overdue claims are highlighted.

### Cashflow Forecast accordion
3-month rolling cashflow based on upcoming claims and known costs. See SOP 09-12.

## 6. What to look for in a weekly review

1. Check Working Margin vs Target — is it trending in the right direction?
2. Check Forecast Margin — does your cost forecast reflect reality?
3. Check Budget vs Actual — which trades are tracking over budget?
4. Check Requires Action — anything urgent?
5. Check WIPAA — is it up to date? (open if red)
6. Check Underclaim Alert — are you behind on issuing claims?

## 7. Editing the target margin

1. Click **Edit target margin** in the job header
2. Enter the new target % (must be above the floor of 33%)
3. If setting below 33%, Director confirmation is required — enter reason
4. Save

## 8. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Working margin looks great but forecast is poor | Recent invoices haven't been approved yet | Approve pending invoices before reading the margin figures |
| Underclaim alert firing despite claims sent | Claim is in "draft" status — drafts don't count | Send the claim to the client (SOP 09-08) to move it out of draft |
| Budget vs Actual shows 0 for a trade | Budget not seeded from Buildxact | Use "Seed from Buildxact" in the Budget vs Actual section |

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| Command centre shows no data | The job may not have a Buildxact job linked, or no invoices have been approved yet |
| Margin health badge missing | `target_margin_pct` may not be set on the job — click "Edit target margin" and enter it |
| WIPAA opens but calculation looks wrong | Check that `forecast_total_cost` is set — it defaults to 0 if never entered |
| Budget vs Actual categories missing | Budget has not been seeded — click "Seed from Buildxact" or enter budgets manually |

## 10. Related SOPs
- [Create a progress claim](finance_create_progress_claim.md) — SOP 09-08
- [Review margin risk across all jobs](finance_review_margin_risk.md) — SOP 09-09
- [Create a variation](finance_create_variation.md) — SOP 09-10
- [WIPAA review](finance_wipaa_review.md) — SOP 09-11
- [Cashflow forecast](finance_cashflow_forecast.md) — SOP 09-12

## 11. Automation notes
- All data fetched via `GET /api/finance/jobs/:id/command-centre` — single aggregate endpoint
- `getJobInsights()` from `projectInsights.mjs` provides AI insights displayed at top of page
- WIPAA overdue check: `days_since_review > 30` → accordion opens red, `requires_wipaa_review: true` in payload
- Underclaim check: `buildPct - claimsPct > 10` → `underclaim_alert` in payload
- Margin health computed: `working_margin - target_margin_pct` → green/amber/red/critical
- `POST /api/finance/jobs/:id/wipaa/review` — logs WIPAA review and resets overdue timer

## 12. Owner
Admin  
Next review: 2026-11-29

---

## 13. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least one job with approved invoices, a budget seeded, and a progress claim issued
- [ ] Job has `target_margin_pct` set
- [ ] `last_wipaa_review_date` is known (check DB: `SELECT last_wipaa_review_date FROM jobs WHERE id = '<id>'`)

### Test cases

**TC-01 — Command centre loads with data**
1. Navigate to `/finance/jobs/<jobId>` for a job with data
2. Expected: KPI bar visible with non-zero values for at least Contract $, Actual Costs $
3. Expected: no JavaScript errors in browser console
4. Expected: page loads within 3 seconds
- [ ] Pass  [ ] Fail

**TC-02 — KPI bar accuracy**
1. Note the "Actual Costs $" figure on screen
2. Check DB: `SELECT SUM(approved_amount) FROM financial_documents WHERE job_id = '<id>' AND status = 'approved'`
3. Expected: values match (within rounding)
4. Note the "Contract $" figure
5. Check DB: `SELECT original_contract_value, (SELECT COALESCE(SUM(amount_ex_gst),0) FROM job_variations WHERE job_id = '<id>' AND status = 'signed') AS signed_vars FROM jobs WHERE id = '<id>'`
6. Expected: Contract $ = original_contract_value + signed_vars
- [ ] Pass  [ ] Fail

**TC-03 — Margin health colour**
1. View the margin health indicator
2. Note the current working margin % and target margin %
3. If working_margin > target + 1%: expected 🟢 green
4. If within ±1%: expected 🟡 amber
5. If below target - 1%: expected 🔴 red
- [ ] Pass  [ ] Fail

**TC-04 — WIPAA accordion auto-opens when overdue**
1. Set `last_wipaa_review_date` to more than 30 days ago in DB: `UPDATE jobs SET last_wipaa_review_date = CURRENT_DATE - 35 WHERE id = '<id>'`
2. Reload the command centre
3. Expected: WIPAA accordion is open and has red/warning styling
4. Expected: a message indicates review is overdue
- [ ] Pass  [ ] Fail

**TC-05 — Underclaim alert fires correctly**
1. For a job where build % - claimed % > 10%, load the command centre
2. Expected: underclaim alert section visible with percentages and estimated underclaim amount
3. Expected: link/button to draft a progress claim
- [ ] Pass  [ ] Fail  [ ] N/A (no suitable job with this condition)

**TC-06 — Budget vs Actual table populated**
1. Open a job with budget seeded and at least one approved invoice
2. Expected: Budget vs Actual table shows at least one trade with non-zero budget AND non-zero actual
3. Expected: status badge (on track / approaching / over) visible
- [ ] Pass  [ ] Fail

**TC-07 — Requires Action shows pending invoices**
1. Open a job that has at least one `pending_approval` invoice assigned to it
2. Expected: that invoice appears in "Requires Action" section with trade confidence score
3. Expected: Approve / Hold / Wrong job? actions visible
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Command centre loads without errors
- [ ] KPI figures match database calculations
- [ ] Margin health colour logic is correct
- [ ] WIPAA auto-opens when overdue
- [ ] Underclaim alert fires when appropriate
- [ ] Budget vs Actual shows meaningful data
- [ ] Requires Action surface correct invoices
- [ ] Update `test_status` in frontmatter after passing
