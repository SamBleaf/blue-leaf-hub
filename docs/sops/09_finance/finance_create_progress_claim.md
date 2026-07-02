---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 09-08: Create and Send a Progress Claim

**Module:** Finance — Job Command Centre  
**SOP ID:** 09-08  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin

## 2. When to use it
When a build stage is sufficiently complete and a payment claim needs to be issued to the client. Blue Leaf uses standard APB progress claim stages.

Standard claim stages:
- **Deposit** — on contract signing
- **Slab** — on slab pour completion
- **Frame** — on frame completion
- **Lock-up** — on lock-up completion
- **Fixing** — on fixing completion
- **Practical Completion** — on handover

A **Custom** stage is available for non-standard or partial claims.

## 3. What this does
Creates a progress claim PDF (Blue Leaf branded, SA-compliant), emails it to the client via Gmail, records it in the job's claim history, and updates the Claims Issued KPI in the Job Command Centre.

## 4. Before you start
- You are in the Job Command Centre for the correct job (`/finance/jobs/:jobId`)
- The build stage is genuinely complete (do not claim a stage before the work is done)
- You know the claim amount (ex-GST)
- The client's email address is on file for the job

## 5. Steps

### Create the claim

1. Open the Job Command Centre for the job
2. Scroll to the **Progress Claims** accordion (or click "Draft progress claim" from the underclaim alert if shown)
3. Click **+ New Claim**
4. Fill in:
   - **Stage** — select from deposit / slab / frame / lock-up / fixing / practical completion / custom
   - **Description** — brief description (e.g. "Frame stage completion — 21 Folkstone Rd")
   - **Amount ex-GST** — the amount you are claiming (GST and total are calculated automatically)
   - **Issue date** — defaults to today
   - **Due date** — typically 10 business days from issue (adjust as needed)
5. Click **Save as Draft**
6. The claim appears in the Progress Claims accordion with status "draft"

### Review the claim

1. Click the claim to expand it
2. Review the amounts:
   - Amount ex-GST
   - GST (auto-calculated as 10%)
   - Total amount inc-GST
3. Confirm the cumulative claimed amount (shown below the new claim total) is correct
4. If anything is wrong, click Edit on the draft claim and correct it

### Send the claim

1. When the draft looks correct, click **Send Claim**
2. A confirmation dialog shows:
   - The PDF that will be generated
   - The recipient email address
   - The subject line
3. Confirm
4. The system:
   - Generates the progress claim PDF
   - Emails it to the client via Gmail
   - Changes claim status to "issued"
   - Sets the due date timer
5. The Claims Issued KPI in the KPI bar increases by this claim amount

## 6. What happens next

- The claim status shows as "issued" in the accordion
- If the due date passes without payment recorded, status changes to "overdue" automatically
- When payment is received, record it (see Record Payment steps below)
- Overdue claims appear in Requires Action in the Job Command Centre

### Record a payment against a claim

1. Open the Progress Claims accordion
2. Find the claim (status "issued" or "overdue")
3. Click **Record Payment**
4. Enter:
   - Payment amount (can be partial)
   - Payment date
   - Payment reference (EFT reference or bank statement line)
   - Payment method
5. Click Save
6. Status updates to "partially_paid" (if partial) or "paid" (if full)
7. Claims Paid $ KPI updates in the KPI bar

### Void a claim

If a claim was sent in error or needs to be cancelled:
1. Open the claim in the Progress Claims accordion
2. Click **Void**
3. Enter the reason for voiding
4. Confirm
5. Status → "void"
6. The voided claim is excluded from Claims Issued calculations

### Overdue claim chase

When a claim becomes overdue (past the due date with no payment):
1. The claim appears in Requires Action with a "Chase payment →" prompt
2. Click to open the claim detail
3. Use Gmail to follow up with the client (outside the Hub — the Hub records the claim, not the correspondence)
4. Record payment when received

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Claiming a stage before it is complete | Underclaim alert creates urgency | Verify with the site manager that the stage is genuinely done |
| Wrong amount on claim | Estimating instead of calculating | Always confirm with the contract schedule of values |
| Claim sent to wrong email | Client email not updated | Verify the client email on the job record before sending |
| Forgetting to record payment | Payment comes in but dashboard shows overdue | Record payment on the day it arrives or the day you see it in the bank account |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Send button greyed out | Check that client email exists on the job record |
| PDF generation fails | Try again — if persistent, check server logs; the claim is still saved as draft |
| Claim shows wrong cumulative amount | Previous claims may not all be counted — check all prior claims have correct statuses |
| Gmail send fails | Check Gmail credentials are still valid in Railway env vars |

## 9. Related modules
- [Job Command Centre — overview](finance_job_dashboard.md)
- [WIPAA review](finance_wipaa_review.md)

## 10. Screenshot placeholders
- [ ] Progress Claims accordion — showing a draft claim before sending
- [ ] Confirmation dialog (PDF preview + recipient email)
- [ ] Claim list with mixed statuses (issued, partially_paid, overdue, void)
- [ ] Record Payment form with partial payment example

## 11. Automation notes
- API: `POST /api/finance/jobs/:id/claims` → create draft
- API: `PUT /api/finance/jobs/:id/claims/:cid` → update draft fields
- API: `POST /api/finance/jobs/:id/claims/:cid/send` → generate PDF + Gmail send + status → issued
- API: `POST /api/finance/jobs/:id/claims/:cid/pay` → record payment
- API: `POST /api/finance/jobs/:id/claims/:cid/void` → void with reason
- GST calculated: `amount_ex_gst * 0.1` (generated column)
- Overdue detection: `issued_date + (due_date - issued_date)` < today → status auto-updates to 'overdue'
- Claims Issued KPI: `SUM(amount_inc_gst WHERE status NOT IN ('draft','void'))`
- Claims Paid KPI: `SUM(progress_claim_payments.payment_amount WHERE claim job_id = :jobId)`

## 12. Edge cases and limits
- Custom stage claims do not increment the standard stage counter — use Custom only for partial or non-standard claims
- A voided claim is permanently excluded from KPIs; voiding cannot be undone via the UI
- Partial payments can be recorded multiple times until total payments equal the claim amount, at which point status auto-transitions to 'paid'
- If the Gmail send fails, the claim remains as draft and must be re-sent manually
- Cumulative claimed amount includes all non-void, non-draft claims regardless of payment status

## 13. Owner
Admin  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A job with at least one approved invoice and a seeded budget exists
- [ ] The job has a client email on file
- [ ] Gmail integration is configured (GMAIL_CLIENT_ID etc. in Railway)

### Test cases

**TC-01 — Create a draft claim**
1. Open the Job Command Centre for a job
2. In Progress Claims accordion, click + New Claim
3. Select stage: "frame"
4. Enter amount ex-GST: $50,000
5. Click Save as Draft
6. Expected: claim appears in accordion with status "draft"
7. Check DB: `SELECT status, amount_ex_gst, gst_amount, amount_inc_gst FROM progress_claims WHERE job_id = '<id>' ORDER BY created_at DESC LIMIT 1`
   - status = 'draft'
   - amount_ex_gst = 50000
   - gst_amount = 5000 (auto-generated)
   - amount_inc_gst = 55000 (auto-generated)
- [ ] Pass  [ ] Fail

**TC-02 — GST auto-calculation**
1. Create a draft claim with amount_ex_gst = $100,000
2. Verify on screen: GST = $10,000, Total = $110,000
3. Check DB: `SELECT gst_amount, amount_inc_gst FROM progress_claims WHERE ...`
   - gst_amount = 10000
   - amount_inc_gst = 110000
- [ ] Pass  [ ] Fail

**TC-03 — Send claim generates PDF and emails client**
1. Create a draft claim (TC-01)
2. Click Send Claim
3. Confirm in the dialog
4. Expected: status changes to "issued" on screen
5. Expected: an email arrives at the client email address with a PDF attachment
6. Check DB: `SELECT status, issued_date, due_date, document_url FROM progress_claims WHERE id = '<id>'`
   - status = 'issued'
   - issued_date = today
   - due_date = populated
7. Expected: Claims Issued $ KPI increases by $110,000
- [ ] Pass  [ ] Fail

**TC-04 — Record payment**
1. Find an issued claim
2. Click Record Payment
3. Enter: amount = full claim amount, date = today, reference = "EFT-12345", method = "eft"
4. Expected: claim status → "paid"
5. Check DB: `SELECT status FROM progress_claims WHERE id = '<id>'` = 'paid'
6. Check DB: `SELECT SUM(payment_amount) FROM progress_claim_payments WHERE progress_claim_id = '<id>'`
7. Expected: Claims Paid $ KPI increases
- [ ] Pass  [ ] Fail

**TC-05 — Partial payment**
1. Find an issued claim for $110,000
2. Record payment for $55,000 (half)
3. Expected: status → "partially_paid"
4. Check DB: `SELECT status FROM progress_claims WHERE id = '<id>'` = 'partially_paid'
- [ ] Pass  [ ] Fail

**TC-06 — Overdue detection**
1. Find or create a claim with `due_date` in the past (or manually set in DB: `UPDATE progress_claims SET due_date = CURRENT_DATE - 5 WHERE id = '<id>'`)
2. Trigger the overdue check (reload the page or wait for the scheduled check)
3. Expected: claim status → 'overdue'
4. Expected: claim appears in Requires Action in Job Command Centre
- [ ] Pass  [ ] Fail

**TC-07 — Void a claim**
1. Create and send a test claim
2. Click Void
3. Enter reason
4. Expected: status → 'void'
5. Expected: Claims Issued $ KPI decreases (void excluded)
6. Check DB: `SELECT status FROM progress_claims WHERE id = '<id>'` = 'void'
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Draft claim creation works
- [ ] GST and total auto-calculated correctly
- [ ] Send generates PDF and emails client
- [ ] status transitions: draft → issued → paid / partially_paid / overdue / void
- [ ] Claims Issued KPI updates correctly on send
- [ ] Claims Paid KPI updates correctly on payment recorded
- [ ] Overdue claims appear in Requires Action
- [ ] Update `test_status` in frontmatter after passing
