---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 09-12: View and Interpret the Cashflow Forecast

**Module:** Finance — Job Command Centre  
**SOP ID:** 09-12  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Admin, Director

## 2. When to use it
When planning upcoming cash requirements, before a monthly Director briefing, or when a progress claim is approaching and you want to understand the expected cash position over the next 3 months.

## 3. What this does
Shows a 3-month rolling cashflow projection for a single job. Combines:
- **Upcoming progress claims** (from the progress claims schedule)
- **Known upcoming costs** (from approved invoices that are not yet paid, and known upcoming trade payments)
- **Expected cash inflows** (from progress claims due for payment)

This is a forward-looking view based on what's already scheduled, not an AI prediction.

## 4. How to get there

1. Open the Job Command Centre for the job
2. Scroll to the **Cashflow Forecast** accordion
3. Click to expand

## 5. Step-by-step process

### Reading the cashflow forecast

The forecast shows a month-by-month view for the next 3 months:

| Column | What it shows |
|--------|--------------|
| Month | The calendar month |
| Inflows | Expected cash in (progress claim payments due in this month) |
| Outflows | Expected cash out (known upcoming trade payments, approved-but-unpaid invoices) |
| Net | Inflows minus outflows |
| Cumulative | Running cash position across all 3 months |

### Colour coding
- Green net/cumulative — positive cash position expected
- Red net/cumulative — cash out expected to exceed cash in (may need overdraft or bring forward a claim)

### What is and isn't included

**Included in inflows:**
- Progress claims with status "issued" or "overdue" — expected payment by due date
- Partially paid claims — remaining balance expected

**Included in outflows:**
- Approved invoices with status "approved" that have not been filed/paid (known payables)
- Progress claim payments not yet made (if tracking subcontractor payments)

**Not included:**
- Future invoices not yet received
- Variations not yet signed
- Preliminary costs not yet invoiced

### Using the forecast for decision-making

**Positive upcoming net months:** Good. Cash in exceeds cash out. Consider whether you should be pulling forward any supplier payments to build relationships.

**Negative upcoming net months:** Plan ahead. Options:
- Bring forward a progress claim if the stage is genuinely complete
- Delay non-urgent supplier payments (within agreed terms)
- Alert the Director if the cash gap is significant (>$50k or >30 days)

**Large positive WIPAA but negative cashflow forecast:** You have earned revenue but not claimed it. Issue a progress claim immediately (SOP 09-08).

## 6. What happens next
After reviewing the forecast, act on any negative months before they become a cash problem. Record payments as they arrive so the forecast stays current.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Treating the forecast as a guarantee | It's based on expected payment dates | Clients may pay late — monitor actual payments and update claim status |
| Ignoring a negative month | "It'll sort itself out" | A negative cash month needs an active plan — draft a claim now |
| Forecast shows nothing | No claims issued or invoices approved | The forecast is empty if there is nothing scheduled — use it only when data exists |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Cashflow accordion shows empty | No progress claims have been issued for this job, or no approved invoices are pending payment — this is expected on a new job |
| Inflows show 0 despite claims issued | Check claim status — only "issued" and "overdue" claims are counted. Draft claims are not. |
| Forecast shows claims from months ago | Old unpaid claims are still counted until marked paid — record any received payments (SOP 09-08) |

## 9. Related modules
- [Create and send a progress claim](finance_create_progress_claim.md) — SOP 09-08
- [WIPAA review](finance_wipaa_review.md) — SOP 09-11
- [Job Command Centre — overview](finance_job_dashboard.md) — SOP 09-07

## 10. Screenshot placeholders
- [ ] Cashflow Forecast accordion — expanded with 3 months of data visible
- [ ] Red month (outflows exceed inflows) showing red net and cumulative
- [ ] Green month (inflows exceed outflows) showing green net and cumulative
- [ ] Empty state (no claims or approved invoices)

## 11. Automation notes
- API: `GET /api/finance/jobs/:id/cashflow` → returns 3-month cashflow projection
- Cashflow computed from:
  - `progress_claims` WHERE status IN ('issued','overdue','partially_paid') → inflows by due_date month
  - `financial_documents` WHERE status = 'approved' AND paid = false → outflows by created_at month
- No AI — purely deterministic calculation
- Cashflow accordion in `JobCommandCentre.jsx` fetches from `/cashflow` endpoint on expand

## 12. Edge cases and limits
- Forecast covers exactly 3 calendar months from today — months beyond this are not shown
- Claims with future due dates outside the 3-month window are excluded
- Draft claims are excluded from inflows regardless of due date
- Partial payments reduce the inflow amount shown for that claim
- The forecast does not auto-refresh when new invoices are approved — reload or re-expand the accordion
- The forecast is job-specific only — it does not include overhead or company-level cashflow
- Client payment disputes or delayed payments cannot be reflected in the forecast automatically

## 13. Owner
Admin  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A job with at least one issued progress claim (due date in next 3 months)
- [ ] At least one approved invoice not yet paid

### Test cases

**TC-01 — Cashflow accordion loads**
1. Open the Job Command Centre for a job with at least one issued claim
2. Expand the Cashflow Forecast accordion
3. Expected: accordion loads without error
4. Expected: at least one month of data shown
- [ ] Pass  [ ] Fail

**TC-02 — Inflows include issued claims**
1. Note the amount of all issued claims with due dates in the next 3 months
2. In the cashflow forecast, check the inflows column for those months
3. Expected: inflow amounts match the outstanding claim amounts
- [ ] Pass  [ ] Fail

**TC-03 — Outflows include approved invoices**
1. Note the total approved_amount of financial_documents with status = 'approved' for this job
2. Check the outflows column in the cashflow forecast
3. Expected: outflows include these amounts in the appropriate month
- [ ] Pass  [ ] Fail

**TC-04 — Net and cumulative calculated correctly**
1. For one month in the forecast:
   - Note: Inflows, Outflows, Net, Cumulative
2. Verify: Net = Inflows − Outflows
3. Verify: Cumulative for month 2 = Cumulative from month 1 + Net for month 2
- [ ] Pass  [ ] Fail

**TC-05 — Empty state when no data**
1. Open the cashflow accordion for a job with no issued claims and no approved invoices
2. Expected: empty state message shown (not an error)
3. Expected: no console errors
- [ ] Pass  [ ] Fail

**TC-06 — Colour coding**
1. Create a situation where outflows > inflows for a month (e.g. no claims due but approved invoices exist)
2. Load the cashflow forecast
3. Expected: that month's Net shows in red
4. Create a situation where inflows > outflows
5. Expected: that month's Net shows in green
- [ ] Pass  [ ] Fail  [ ] N/A

### Post-test checklist
- [ ] Cashflow accordion loads without errors
- [ ] Inflows match issued claim amounts
- [ ] Outflows match approved invoice amounts
- [ ] Net and cumulative calculations are correct
- [ ] Empty state shows when no data
- [ ] Colour coding reflects positive/negative months
- [ ] Update `test_status` in frontmatter after passing
