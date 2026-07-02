---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 09-04: Approve an Invoice

**Module:** Finance — Inbox / Approval Queue  
**SOP ID:** 09-04  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Staff

## 2. When to use it
After reviewing the AI extraction (SOP 09-02) and confirming the job match (SOP 09-03), approve the invoice to record it as a confirmed cost against the job.

## 3. What this does
Moves the invoice from "pending_approval" to "approved" status. Records the approved amount against the job's actual costs. The approved amount feeds into:
- Budget vs actual for the assigned trade category
- Working margin calculation in the Job Command Centre
- The job's total actual costs figure

## 4. Before you start
- Invoice has status "pending_approval"
- All extracted fields have been reviewed (SOP 09-02)
- Job is correctly assigned (SOP 09-03)
- **Trade category is assigned** — this is required. The system will not allow approval without a trade category.

## 5. Step-by-step process

### Standard approval

1. Open the invoice in Finance → Approvals
2. Confirm all fields are correct:
   - Supplier name, ABN, invoice number, date
   - Amount ex-GST, GST amount, total amount
   - Job assigned
   - **Trade category assigned** (required — green tag visible)
3. The **Approved Amount** field defaults to the extracted total amount
4. If the amount is correct, leave it as-is
5. If you need to approve a different amount (e.g. disputed line item), edit the Approved Amount field
6. Click **Approve**
7. Status changes to "approved"
8. The invoice is automatically filed to the Dropbox folder for the assigned job

### Trade category — why it is required

Trade categories link invoice costs to budget lines. Without a trade category:
- The cost cannot be compared against the budget for that trade
- Budget vs actual in the Job Command Centre will be incomplete
- Margin calculations will be understated

**Assigning a trade category:**
- If the supplier is known (ABN match with `auto_tag = true`): the trade category is pre-filled automatically (green "Auto-tagged" badge)
- If the supplier is new or unknown: a trade category dropdown is shown — select the correct category from the 37 available
- The AI may suggest a trade category with a confidence percentage — always verify this suggestion

**Trade category auto-learning:**
After 3 invoices from the same ABN are confirmed with the same trade category, the system automatically sets `auto_tag = true`. Future invoices from that supplier are pre-tagged without manual selection.

### Partial approval

If part of an invoice is disputed or incorrect:

1. Edit the **Approved Amount** to the amount you are approving
2. Click **Approve**
3. The difference between invoice total and approved amount is noted internally
4. Add a note explaining why a partial amount was approved (this is stored on the document)

## 6. What happens next

- `financial_documents.status` → "approved"
- `financial_documents.approved_amount` → set to approved amount
- Job's actual costs in `job_budgets` update automatically for the assigned trade
- Invoice is filed to Dropbox at the job's folder path
- If this supplier has reached 3 confirmed invoices with the same trade: `supplier_trade_defaults.auto_tag` → true

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Approving without trade category | Forgot to set it | The system blocks approval — trade category is a required field |
| Approving wrong amount | AI extracted a wrong digit | Always compare total amount to the original PDF before clicking Approve |
| Approving to wrong job | Job was not re-checked after extraction | Verify the job address shown matches the invoice before approving |
| Using total inc-GST as approved amount | Misread the field labels | The approved amount should be the ex-GST amount for accounting — unless the invoice has no GST |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Approve button disabled / shows "Trade category required" | Assign a trade category first |
| Approve button disabled / shows "Job required" | Assign a job first (SOP 09-03) |
| Dropbox filing fails after approval | Dropbox may be offline or the folder path may not exist — the invoice is still approved, file manually to Dropbox |
| Need to unapprove an invoice | Approved invoices cannot be unapproved through the UI — contact Admin who can update the status directly in the database |

## 9. Related modules
- [Review AI invoice extraction](finance_review_ai_extraction.md)
- [Match an invoice to a job](finance_match_invoice_to_job.md)
- [Put an invoice on hold](finance_put_invoice_on_hold.md)
- [Reject an invoice](finance_reject_invoice.md)
- [Job Command Centre — overview](finance_job_dashboard.md)

## 10. Screenshot placeholders
- [ ] Invoice detail panel showing all fields completed with green trade category tag
- [ ] Approve button enabled state vs disabled state ("Trade category required")
- [ ] "Auto-tagged" green badge on the trade category field for a known supplier
- [ ] Approved invoice in Finance → Approvals with "approved" status badge

## 11. Automation notes
- API: `POST /api/finance/documents/:id/approve` with `{ trade_category_id, approved_amount }`
- Returns 400 if `trade_category_id` is null
- On approval: triggers `updateJobBudgetActuals(jobId, tradeCategoryId, approvedAmount)`
- Dropbox auto-file: uses `DROPBOX_JOB_FOLDER_TEMPLATE` env var to construct path
- Supplier learning: increments `supplier_trade_defaults.confirmed_count`, sets `auto_tag = true` at count ≥ 3

## 12. Edge cases and limits
- Once approved, an invoice cannot be unapproved via the standard UI — Admin must update the database directly
- Dropbox filing failure does not block or reverse the approval — the invoice is approved regardless; file manually if Dropbox fails
- The approved amount can be less than the invoice total (partial approval) but cannot exceed it — the approved amount is what gets recorded as a job cost
- If a supplier reaches `confirmed_count = 3` but is later found to be mis-tagged, `auto_tag` must be reset manually in the database

## 13. Owner
Admin  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least one invoice in `pending_approval` status with job assigned
- [ ] Know the correct trade category for that invoice
- [ ] Confirm the supplier's `confirmed_count` in `supplier_trade_defaults` before the test (to verify auto-learning)

### Test cases

**TC-01 — Approval blocked without trade category**
1. Open a pending invoice that has no trade category assigned
2. Click Approve (or attempt to)
3. Expected: approval blocked with error "Trade category required"
4. Expected: document status remains `pending_approval`
- [ ] Pass  [ ] Fail

**TC-02 — Standard approval (happy path)**
1. Open a pending invoice with job and trade category both assigned
2. Verify all fields
3. Click Approve
4. Expected: status changes to "approved" on screen
5. Check DB: `SELECT status, approved_amount, trade_category_id FROM financial_documents WHERE id = '<id>'`
   - status = 'approved'
   - approved_amount = the amount shown in the UI
   - trade_category_id = not null
- [ ] Pass  [ ] Fail

**TC-03 — Approved amount records correctly**
1. Approve an invoice and note the approved amount
2. Check DB: `SELECT budget_amount, actual_amount FROM job_budgets WHERE job_id = '<job_id>' AND trade_category_id = '<trade_id>'`
3. Expected: actual costs for that trade have increased by the approved amount
4. Check Job Command Centre for that job: Actual Costs KPI should include this amount
- [ ] Pass  [ ] Fail

**TC-04 — Partial approval**
1. Open a pending invoice
2. Change the Approved Amount to a value less than the total (e.g. 80% of total)
3. Approve
4. Expected: status = 'approved', approved_amount = the reduced value
5. Check DB: `SELECT approved_amount, amount_inc_gst FROM financial_documents WHERE id = '<id>'`
   - approved_amount should be the partial amount, not the full amount
- [ ] Pass  [ ] Fail

**TC-05 — Trade category auto-learning**
1. Find a supplier with `confirmed_count = 2` in `supplier_trade_defaults`
2. Approve one more invoice from that supplier (same trade category)
3. Check DB: `SELECT confirmed_count, auto_tag FROM supplier_trade_defaults WHERE supplier_abn = '<abn>'`
4. Expected: `confirmed_count = 3`, `auto_tag = true`
5. Upload a new invoice from the same supplier
6. Expected: trade category is pre-filled automatically with "Auto-tagged" badge
- [ ] Pass  [ ] Fail  [ ] N/A (no supplier with count = 2 available)

**TC-06 — Dropbox filing on approval**
1. Approve an invoice
2. Check that a file appears in the Dropbox job folder for the assigned job
3. Expected: PDF or file appears in Dropbox within ~30 seconds
- [ ] Pass  [ ] Fail  [ ] Skip (Dropbox not configured)

### Post-test checklist
- [ ] Approval requires trade category (blocked without)
- [ ] approved_amount populates correctly on approval
- [ ] Job budget actuals update on approval
- [ ] Auto-tagging triggers at count = 3
- [ ] Update `test_status` in frontmatter after passing
