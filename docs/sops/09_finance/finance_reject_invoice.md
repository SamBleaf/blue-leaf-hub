---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 09-06: Reject an Invoice

**Module:** Finance — Inbox / Approval Queue  
**SOP ID:** 09-06  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Staff

## 2. When to use it
When an invoice cannot be approved and should not be paid. Use reject (not hold) when the decision is final:
- Duplicate invoice — already paid
- Invoice from the wrong supplier (sent in error)
- Work was never performed
- Invoice is fraudulent or invalid
- Invoice belongs to another business, not Blue Leaf

If you are **unsure** and need more information, use Hold (SOP 09-05) instead.

## 3. What this does
Marks the invoice as "rejected" with a mandatory reason. The invoice is permanently excluded from job financials. It remains visible in the system for audit purposes but will never be approved or filed.

## 4. Before you start
- Invoice has status "pending_approval" or "on_hold"
- The rejection decision is final — rejected invoices cannot be un-rejected through the UI
- You have a clear reason for rejection

## 5. Steps

1. Open the invoice in Finance → Approvals
2. Click **Reject**
3. A rejection reason dialog appears:
   - **Reason** (required) — type the reason clearly. Example: "Duplicate of INV-2241 already approved 12 Apr 2026" or "Invoice from wrong company — not a Blue Leaf supplier"
4. Click **Confirm Rejection**
5. Status changes to "rejected"
6. The invoice is removed from the active Approval Queue
7. It remains searchable in Finance → Inbox with "rejected" filter

## 6. What happens next

- `financial_documents.status` → 'rejected'
- The invoice is excluded from all job cost calculations permanently
- The rejection reason is stored for audit trail
- If the invoice was emailed by the supplier, consider contacting them to explain (outside the Hub)
- A rejected invoice **cannot be re-approved** through the standard UI — if a rejection was made in error, contact Admin

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Rejecting instead of holding | Uncertain about the invoice but chose reject | If there is any doubt, use Hold — you can always approve later |
| Vague rejection reason | Quick entry | Always include enough detail for an auditor: what was wrong, reference numbers if relevant |
| Rejecting a legitimate invoice from a new supplier | Supplier name or ABN not recognised | Check ABN Lookup (abr.business.gov.au) before rejecting on ABN mismatch alone |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Rejected an invoice in error | Contact Admin — status can be updated directly in the database. This is not self-service. |
| Can't find a rejected invoice | In Finance → Inbox, filter by "Rejected" status |
| Rejection reason field blank | It is required — the system will not accept an empty reason |

## 9. Related modules
- [Put an invoice on hold](finance_put_invoice_on_hold.md) — use instead when unsure
- [Approve an invoice](finance_approve_invoice.md)

## 10. Screenshot placeholders
- [ ] Rejection reason dialog with example reason
- [ ] Finance → Inbox filtered by "Rejected" showing rejected invoice
- [ ] Invoice detail panel showing "rejected" status badge and rejection reason

## 11. Automation notes
- API: `POST /api/finance/documents/:id/reject` with `{ rejection_reason: string }`
- `financial_documents.status` → 'rejected'
- Rejected documents are excluded from all job budget queries by default
- No Dropbox filing occurs for rejected invoices
- Rejected invoices do not trigger trade-learning (confirmed_count not incremented)

## 12. Edge cases and limits
- Rejection is permanent via the standard UI — a rejected invoice cannot be re-approved without direct database intervention by Admin
- A rejected invoice is visible in Finance → Inbox only when filtering by "Rejected" status — it is hidden from the default Approval Queue view
- Both `pending_approval` and `on_hold` invoices can be rejected — no need to un-hold first
- The rejection reason is stored in `dispute_reason` (shared column with hold reason) — the last written value overwrites any previous hold reason

## 13. Owner
Admin  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least one invoice in `pending_approval` status that can be used as a test rejection
- [ ] Use a real-looking but clearly test invoice (or a known duplicate) to avoid rejecting a legitimate invoice

### Test cases

**TC-01 — Rejection requires a reason**
1. Open a pending invoice
2. Click Reject
3. Leave the reason field blank and try to confirm
4. Expected: system prevents rejection without a reason
5. Expected: invoice status remains `pending_approval`
- [ ] Pass  [ ] Fail

**TC-02 — Rejection succeeds with reason**
1. Open a pending invoice (use a test/duplicate invoice)
2. Click Reject
3. Enter: "Test rejection — duplicate invoice TC-02"
4. Confirm
5. Expected: status changes to "rejected" on screen
6. Expected: invoice disappears from the main Approval Queue
7. Check DB: `SELECT status, dispute_reason FROM financial_documents WHERE id = '<id>'`
   - status = 'rejected'
   - dispute_reason = the text entered
- [ ] Pass  [ ] Fail

**TC-03 — Rejected invoice does not affect job actuals**
1. Reject an invoice that was assigned to a job
2. Check DB: `SELECT actual_amount FROM job_budgets WHERE job_id = '<job_id>' AND trade_category_id = '<trade_id>'`
3. Expected: actual_amount has NOT changed (rejected invoice excluded)
4. Check Job Command Centre Actual Costs KPI — should not include the rejected amount
- [ ] Pass  [ ] Fail

**TC-04 — Rejected invoice findable with filter**
1. Reject an invoice
2. Navigate to Finance → Inbox
3. Apply "Rejected" status filter
4. Expected: the rejected invoice appears in the filtered list
5. Expected: rejection reason is visible on the invoice detail
- [ ] Pass  [ ] Fail

**TC-05 — Cannot re-approve a rejected invoice via standard flow**
1. Find a rejected invoice
2. Expected: Approve button is disabled or not shown
3. Expected: status cannot be changed back to pending_approval through the UI
- [ ] Pass  [ ] Fail

**TC-06 — Reject from on_hold status**
1. Place an invoice on hold (SOP 09-05)
2. Confirm the invoice is in 'on_hold' status
3. Open the held invoice and click Reject
4. Enter reason: "Test — rejected directly from on_hold status"
5. Confirm
6. Expected: status → 'rejected' (no need to return to pending_approval first)
7. Check DB: `SELECT status, dispute_reason FROM financial_documents WHERE id = '<id>'`
   - status = 'rejected'
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Rejection requires non-empty reason
- [ ] `dispute_reason` stored correctly on rejection
- [ ] Rejected invoices excluded from job actuals
- [ ] Rejected invoices findable with status filter
- [ ] No re-approval path through standard UI
- [ ] Update `test_status` in frontmatter after passing
