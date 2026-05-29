---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 09-10: Create and Send a Variation

**Module:** Finance — Job Command Centre  
**SOP ID:** 09-10  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin

## 2. When to use it
When work is required that falls outside the original contract scope. Common triggers:
- Client requests additional work (extra windows, upgraded finishes, design change)
- Unforeseen site conditions (rock excavation, drainage issues, soil conditions)
- Errors or omissions in the original plans that require additional work

**A variation must be signed by the client BEFORE the work is done.** Unsigned variations are never counted in contract value or margin calculations.

## 3. What this does
Creates a variation document priced from Buildxact recipe line items. Generates a Blue Leaf branded PDF. Emails the PDF to the client for sign-off. Tracks the variation status (draft → sent → signed / rejected). On signing, the contract value automatically increases.

## 4. Before you start
- You are in the Job Command Centre for the correct job
- You know what the variation covers (title and description)
- The relevant Buildxact estimate items exist in the job's estimate (for recipe pricing)

## 5. Steps — Create a variation

1. Open the Job Command Centre for the job
2. Click **+ New Variation** in the Variations section
3. Fill in:
   - **Title** — short description (e.g. "Additional window to living room")
   - **Description** — full scope of works
   - **Trade category** — which trade does this variation relate to?
   - **EOT (Extension of Time)** — number of additional days required (0 if none)
4. Click **Add line items** to price the variation using Buildxact recipes

### Recipe pricing

1. A panel opens showing the Buildxact estimate line items for this job
2. Select the items that apply to this variation (e.g. "Window supply and install")
3. Enter the quantity for each selected item (e.g. 1 window)
4. The system calculates: cost to builder, charge to client (markup applied), and margin
5. Review the totals:
   - **Cost to builder** (ex-GST)
   - **Charge to client** (ex-GST) — this becomes the variation amount
   - **Margin %** on this variation
6. If pricing looks correct, click **Save line items**
7. The variation amount is populated from the line item totals

### Manual pricing (no recipe items)

If Buildxact recipes don't cover this variation:
1. Skip the recipe panel
2. Enter the **Amount ex-GST** directly
3. GST and total are calculated automatically

## 6. Steps — Send variation to client

1. With the variation in "draft" status, review all fields
2. Click **Send to Client**
3. A confirmation dialog shows:
   - The PDF preview
   - The client email address
   - The email subject
4. Confirm
5. The system:
   - Generates the variation PDF (Blue Leaf branded)
   - Emails to client with a sign-off link
   - Changes status to "sent_to_client"
   - Records `sent_date`

## 7. Variation sign-off

When the client signs the variation:
- The client clicks the link in the email and signs electronically
- Status changes to "signed"
- `signed_date` is recorded
- **Contract value automatically increases** by the variation amount (ex-GST)
- The signed variation is now included in P&L calculations
- The unsigned "UNSIGNED — no P&L impact" badge disappears

If the client rejects:
- Status → "rejected"
- `rejection_reason` recorded
- Contract value does NOT change
- The variation remains visible for reference

## 8. Important rules about variations

| Rule | Why |
|------|-----|
| Unsigned variations are NEVER in P&L | Contract value only includes original + signed variations |
| Variation amount must be agreed before work starts | Never do variation work on a verbal — always get it in writing |
| Each variation gets its own number | Auto-incremented. Do not re-use variation numbers. |
| Signed variations update contract value immediately | No delay — the Job Command Centre KPI updates on signing |

## 9. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Variation work started before signing | Client verbally agreed | The Hub enforces this through workflow — always issue and receive sign-off before proceeding |
| Wrong trade category | Multiple trades involved | Pick the primary trade for the variation; add a note if secondary trades are involved |
| No EOT days entered for time-impacting variations | Easy to forget | Consider EOT before sending — agreed time extensions should be in the variation, not argued later |
| Margin too low on variation | Missed a cost item in recipe | Always review "Margin %" before sending to client |

## 10. Troubleshooting

| Problem | Solution |
|---------|----------|
| No recipe items showing in line item panel | Buildxact estimate may not be connected, or no estimate items exist for this job — price manually |
| Variation PDF fails to generate | Try again — if persistent, check server logs; the variation is still saved as draft |
| Client says they never received the sign-off email | Check the client email on file is correct; resend from the variation detail |
| Variation marked signed but contract value hasn't updated | Refresh the Job Command Centre page — contract value should update immediately on signing |

## 11. Related SOPs
- [Job Command Centre — overview](finance_job_dashboard.md) — SOP 09-07

## 12. Automation notes
- API: `POST /api/finance/jobs/:id/variations` → create draft
- API: `GET /api/finance/jobs/:id/variations/recipes` → Buildxact line items for pricing
- API: `PUT /api/finance/jobs/:id/variations/:vid` → update draft fields
- API: `POST /api/finance/jobs/:id/variations/:vid/send` → generate PDF + email + status → sent_to_client
- API: `POST /api/finance/jobs/:id/variations/:vid/sign` → status → signed + updates contract_value
- API: `POST /api/finance/jobs/:id/variations/:vid/reject` → status → rejected
- Contract value on sign: `UPDATE jobs SET original_contract_value = original_contract_value + variation_amount WHERE id = :jobId`
- Wait — contract_value is computed: `original_contract_value + SUM(job_variations.amount_ex_gst WHERE status = 'signed')`
- GST on variations: `amount_ex_gst * 0.1` (generated column)
- Unsigned variations excluded from all P&L queries by default

## 13. Owner
Admin  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A job with Buildxact estimate items exists (for recipe pricing test)
- [ ] The job has a client email on file
- [ ] Gmail integration is configured

### Test cases

**TC-01 — Create a variation draft**
1. Open the Job Command Centre for a job
2. Click + New Variation
3. Title: "Test variation — additional window"
4. Description: "Install one additional window to living room north elevation"
5. Trade category: Windows / Skylights
6. EOT: 2
7. Amount ex-GST: $3,500 (manual — no recipe)
8. Save as Draft
9. Expected: variation appears in Variations section with status "draft" and "UNSIGNED — no P&L impact" badge
10. Check DB: `SELECT status, amount_ex_gst, gst_amount, amount_inc_gst FROM job_variations WHERE job_id = '<id>' ORDER BY created_at DESC LIMIT 1`
    - status = 'draft', amount_ex_gst = 3500, gst_amount = 350, amount_inc_gst = 3850
- [ ] Pass  [ ] Fail

**TC-02 — Unsigned variation excluded from contract value**
1. Note the Contract $ KPI before creating the variation (TC-01)
2. Create draft variation for $3,500
3. Expected: Contract $ KPI does NOT change
4. Check DB: `SELECT (original_contract_value + COALESCE((SELECT SUM(amount_ex_gst) FROM job_variations WHERE job_id = jv.job_id AND status = 'signed'),0)) AS computed_contract FROM jobs WHERE id = '<id>'`
   — should not include the draft variation amount
- [ ] Pass  [ ] Fail

**TC-03 — Send variation to client**
1. With a draft variation, click Send to Client
2. Confirm in dialog
3. Expected: status → "sent_to_client"
4. Expected: an email arrives at client email with PDF attachment
5. Check DB: `SELECT status, sent_date FROM job_variations WHERE id = '<id>'`
   - status = 'sent_to_client', sent_date = today
- [ ] Pass  [ ] Fail

**TC-04 — Sign a variation updates contract value**
1. With a sent variation ($3,500 ex-GST), simulate signing:
   - Via the sign endpoint: `POST /api/finance/jobs/:id/variations/:vid/sign`
   - Or via the client sign-off link in the email
2. Expected: status → "signed"
3. Expected: Contract $ KPI INCREASES by $3,500 (ex-GST)
4. Expected: "UNSIGNED — no P&L impact" badge DISAPPEARS
5. Check DB: `SELECT status, signed_date FROM job_variations WHERE id = '<id>'`
   - status = 'signed', signed_date = today
6. Check DB: computed contract value now includes the $3,500
- [ ] Pass  [ ] Fail

**TC-05 — Reject a variation**
1. With a sent variation, click Reject (or call reject endpoint)
2. Enter reason: "Client declined additional window"
3. Expected: status → "rejected"
4. Expected: Contract $ KPI does NOT change
5. Check DB: `SELECT status, rejection_reason FROM job_variations WHERE id = '<id>'`
   - status = 'rejected', rejection_reason = text entered
- [ ] Pass  [ ] Fail

**TC-06 — Recipe pricing (if Buildxact connected)**
1. Open + New Variation on a job with Buildxact estimate items
2. Click "Add line items"
3. Expected: a panel of estimate line items loads
4. Select one item, enter quantity = 1
5. Expected: cost to builder, charge to client, and margin % all calculate
6. Save line items
7. Expected: Amount ex-GST on the variation is populated from the line item total
- [ ] Pass  [ ] Fail  [ ] Skip (Buildxact not connected)

### Post-test checklist
- [ ] Variation creation works (draft)
- [ ] GST and total auto-calculated
- [ ] Unsigned variation excluded from contract value and P&L
- [ ] Send generates PDF and emails client
- [ ] Signing updates contract value immediately
- [ ] Rejection does not affect contract value
- [ ] UNSIGNED badge appears/disappears correctly
- [ ] Update `test_status` in frontmatter after passing
