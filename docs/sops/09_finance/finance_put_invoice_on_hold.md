---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_fail
---

# SOP 09-05: Put an Invoice on Hold

**Module:** Finance — Inbox / Approval Queue  
**SOP ID:** 09-05  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Staff

## 2. When to use it
When you cannot approve or reject an invoice immediately and need to pause it for follow-up. Common situations:
- The invoice amount doesn't match what was expected — need to check with the supplier or site manager
- The work described hasn't been completed yet
- Waiting for a variation to be signed before approving the associated cost
- Discrepancy in the scope of work — need clarification

## 3. What this does
Marks the invoice as "on_hold" with a mandatory reason and an optional follow-up date. The invoice stays visible in the Approval Queue with a hold indicator. It will not be auto-filed or affect job financials until it is approved or rejected.

## 4. Before you start
- Invoice has status "pending_approval"
- You have a clear reason for the hold (required — must enter before clicking Hold)

## 5. Steps

1. Open the invoice in Finance → Approvals
2. Click **Hold** (or the hold button in the action row)
3. A hold reason dialog appears:
   - **Reason** (required) — type why you are placing the hold. Be specific: "Amount doesn't match PO — $4,200 on invoice vs $3,800 agreed. Contacting Bone Timber."
   - **Follow-up date** (optional but recommended) — pick the date by which this needs to be resolved
4. Click **Confirm Hold**
5. Status changes to "on_hold"
6. The invoice appears in the Approval Queue with a 🔴 hold badge and the follow-up date

## 6. What happens after placing a hold

- The invoice stays in the Approval Queue — it does not disappear
- The hold reason and follow-up date are stored on the document
- The Job Command Centre Requires Action section shows held invoices with their follow-up dates
- No costs are recorded against the job until the invoice is approved
- To resolve: open the invoice, update the fields if needed, then Approve or Reject

## 7. Resolving a held invoice

Once you have the information you need:
1. Open the held invoice in Finance → Approvals
2. Update any fields that were wrong (amount, job, trade category)
3. Click **Approve** (SOP 09-04) or **Reject** (SOP 09-06)

## 8. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Vague hold reason | Quick entry under time pressure | Always write who you are checking with and what the discrepancy is |
| No follow-up date | Seems optional | Set a date — without it, held invoices can sit unresolved for weeks |
| Forgetting to resolve after getting the answer | Out of sight after placing hold | Check the Requires Action section in the Job Command Centre daily |

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| Can't find a held invoice | It's still in Finance → Approvals — filter by "On hold" status |
| Hold reason is blank | It's a required field — the system won't accept an empty reason |
| Follow-up date has passed with no action | The Requires Action section in the Job Command Centre will flag this — resolve or extend the date |

## 10. Related SOPs
- [Approve an invoice](finance_approve_invoice.md)
- [Reject an invoice](finance_reject_invoice.md)
- [Job Command Centre — overview](finance_job_dashboard.md)

## 11. Automation notes
- API: `PUT /api/financial-documents/:id/hold` with `{ hold_reason: string, follow_up_date?: date }`
- `financial_documents.status` → 'on_hold'
- `financial_documents.dispute_reason` stores the hold reason
- `financial_documents.dispute_follow_up_date` stores the follow-up date
- Requires Action in Job Command Centre queries: `WHERE status = 'on_hold' AND job_id = :jobId`

## 12. Owner
Admin  
Next review: 2026-11-29

---

## 13. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least one invoice in `pending_approval` status
- [ ] Know its current job assignment

### Test cases

**TC-01 — Hold requires a reason**
1. Open a pending invoice
2. Click Hold
3. Leave the reason field blank and try to confirm
4. Expected: system prevents hold without a reason (validation error or disabled button)
5. Expected: invoice status remains `pending_approval`
- [ ] Pass  [ ] Fail

**TC-02 — Hold with reason succeeds**
1. Open a pending invoice
2. Click Hold
3. Enter: reason = "Checking amount with supplier — invoice says $4,200, PO says $3,800"
4. Enter: follow-up date = 7 days from today
5. Click Confirm Hold
6. Expected: status changes to "on_hold" on screen
7. Check DB: `SELECT status, dispute_reason, dispute_follow_up_date FROM financial_documents WHERE id = '<id>'`
   - status = 'on_hold'
   - dispute_reason = the text entered
   - dispute_follow_up_date = the date entered
- [ ] Pass  [ ] Fail

**TC-03 — Held invoice visible in Approval Queue**
1. Place an invoice on hold (TC-02)
2. Navigate away and return to Finance → Approvals
3. Expected: invoice still visible in the queue
4. Expected: hold badge or indicator visible
5. Expected: follow-up date shown
- [ ] Pass  [ ] Fail

**TC-04 — Held invoice does not affect job actuals**
1. Place a hold on an invoice assigned to a job
2. Check DB: `SELECT actual_amount FROM job_budgets WHERE job_id = '<job_id>' AND trade_category_id = '<trade_id>'`
3. Expected: actual_amount has NOT increased (held invoices are not counted as costs)
4. Check Job Command Centre Actual Costs KPI — should not include the held amount
- [ ] Pass  [ ] Fail

**TC-05 — Resolve a held invoice via approval**
1. Open a held invoice
2. Verify reason is displayed
3. Click Approve (with trade category set)
4. Expected: status changes from 'on_hold' to 'approved'
5. Expected: approved_amount recorded, job actuals update
6. Check DB: `SELECT status, approved_amount FROM financial_documents WHERE id = '<id>'` — status = 'approved'
- [ ] Pass  [ ] Fail

**TC-06 — Held invoices appear in Job Command Centre Requires Action**
1. Hold an invoice assigned to a specific job
2. Open the Job Command Centre for that job
3. Expected: held invoice appears in "Requires Action" section
4. Expected: hold reason or follow-up date visible in that section
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Hold requires non-empty reason
- [ ] `dispute_reason` and `dispute_follow_up_date` stored correctly
- [ ] Held invoices don't affect job actuals
- [ ] Held invoices visible in Approval Queue
- [ ] Held invoices visible in Job Command Centre Requires Action
- [ ] Update `test_status` in frontmatter after passing
