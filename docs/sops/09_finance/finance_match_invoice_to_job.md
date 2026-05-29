---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 09-03: Match an Invoice to a Job

**Module:** Finance — Inbox / Approval Queue  
**SOP ID:** 09-03  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Staff

## 2. When to use it
After AI extraction (SOP 09-02), the system attempts to automatically match the invoice to a job. You use this SOP when:
- The AI has matched an invoice to a job and you want to verify the match
- The AI has matched the invoice to the **wrong** job and you need to correct it
- No job was matched and you need to assign one manually

## 3. What this does
Assigns an invoice to a specific job so that costs are tracked in the correct job's budget vs actual figures. Correct job matching is essential — an invoice assigned to the wrong job corrupts that job's financial reporting and the budget vs actual comparison.

## 4. Before you start
- Invoice has status "pending_approval"
- You are viewing the invoice in Finance → Approvals or Finance → Inbox

## 5. How the AI matches jobs

The system uses a 5-tier matching algorithm (deterministic first, AI last):

| Tier | Method | How it works |
|------|--------|-------------|
| 1 | Exact invoice number | Matches invoice number to a previous invoice from the same supplier |
| 2 | Supplier ABN + recent job | If this supplier invoiced a job recently, matches to that job |
| 3 | Supplier name + address | Fuzzy-matches supplier suburb to job site suburb |
| 4 | Description keyword match | Keywords in invoice description matched to job descriptions |
| 5 | Claude AI inference | AI reads the invoice and infers which job it belongs to |

The job match confidence score is shown as a percentage (e.g. "Job match: 87%"). This appears after AI extraction.

## 6. Steps — Verify an AI-matched job

1. Open the invoice in Finance → Approvals
2. On the right side, look for the **Job** field — it shows the matched job address and confidence score
3. Check: does the job address match the site mentioned on the invoice? Does the supplier work on that site?
4. If the match looks correct, proceed to SOP 09-04 (approve) or SOP 09-05 (hold)

## 7. Steps — Rematch to a different job

If the AI has matched to the wrong job:

1. Click **"Wrong job?"** or the job name field on the invoice detail panel
2. A job search appears
3. Type the street address or job number to search
4. Select the correct job from the results
5. The invoice is now re-assigned to the correct job
6. The confidence score updates to 100% (manual match)
7. Proceed to SOP 09-04 to approve

## 8. Steps — Assign a job manually (no match found)

If the AI could not match any job:

1. The Job field shows "No job matched"
2. Click the Job field or the **"Assign job"** button
3. Search for the job by address or job number
4. Select the correct job
5. Proceed to approval

## 9. What happens after correct job assignment

Once an invoice is approved with a job assigned:
- The invoice amount is added to that job's **Actual Costs** in the Job Command Centre
- The trade category's budget vs actual comparison updates automatically
- The job's working margin recalculates

## 10. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Accepting a low-confidence match | The percentage badge looks "good enough" | Always check the job address on screen against the invoice before approving |
| Assigning to a wrong job that has the same supplier | Supplier works on multiple Blue Leaf jobs simultaneously | Check the invoice date against the expected billing period for each job |
| No job assigned at approval | Skipped the job field | The system requires a job to be assigned — it will not allow approval without one |

## 11. Troubleshooting

| Problem | Solution |
|---------|----------|
| Can't find the job in search | Search by partial address (e.g. "Folkstone" not "21 Folkstone Road") |
| Job search returns no results | The job may not exist yet — check Finance → Jobs or ask Admin to create it |
| Job field greyed out | Invoice may be in a non-editable status — check the status badge |

## 12. Related SOPs
- [Review AI invoice extraction](finance_review_ai_extraction.md) — step before this
- [Approve an invoice](finance_approve_invoice.md) — step after this
- [Put an invoice on hold](finance_put_invoice_on_hold.md)

## 13. Automation notes
- 5-tier matching runs on every new document
- `ai_job_match_confidence` stored on `financial_documents.ai_job_match_confidence`
- Manual reassignment: `PUT /api/financial-documents/:id` with `{ job_id: "<uuid>" }`
- Job match confidence displayed in Requires Action section of Job Command Centre

## 14. Owner
Admin  
Next review: 2026-11-29

---

## 15. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least one invoice in `pending_approval` status, AI-matched to a job (any confidence level)
- [ ] Know the correct job for that invoice
- [ ] A second job exists in the system to test rematch

### Test cases

**TC-01 — Job match confidence score visible**
1. Open any pending invoice in Finance → Approvals
2. Expected: "Job match: X%" confidence score visible next to the matched job
3. Expected: Matched job address is shown (not just a UUID)
- [ ] Pass  [ ] Fail

**TC-02 — Correct job match accepted**
1. Open an invoice that is correctly matched
2. Verify the job address matches
3. Proceed to approval (TC is complete — the job assignment is preserved)
4. Check DB: `SELECT job_id FROM financial_documents WHERE id = '<id>'` — not null, correct job
- [ ] Pass  [ ] Fail

**TC-03 — Wrong job rematch**
1. Open any pending invoice
2. Click "Wrong job?" or the job name
3. Search for a different job
4. Select the different job
5. Expected: job field updates to new job address
6. Expected: confidence score updates or disappears (manual match)
7. Check DB: `SELECT job_id FROM financial_documents WHERE id = '<id>'` — matches newly selected job UUID
- [ ] Pass  [ ] Fail

**TC-04 — Manual job assignment (no match)**
1. Find or create an invoice where `job_id IS NULL` in `financial_documents`
2. Open it in Finance → Approvals
3. Expected: "No job matched" shown
4. Click "Assign job" and search for a job
5. Select a job
6. Expected: job field updates
7. Check DB: `SELECT job_id FROM financial_documents WHERE id = '<id>'` — now has a job UUID
- [ ] Pass  [ ] Fail

**TC-05 — Job search functionality**
1. In the job search (from rematch or assign), type a partial address (e.g. first word of a street name)
2. Expected: matching jobs appear in the dropdown
3. Type a non-existent address
4. Expected: "No results" or empty state shown
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Job field displays address not UUID
- [ ] Confidence score visible
- [ ] Rematch persists on page refresh
- [ ] Update `test_status` in frontmatter after passing
