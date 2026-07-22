---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 09-02: Review AI Invoice Extraction

**Module:** Finance — Inbox / Approval Queue  
**SOP ID:** 09-02  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin

## 2. When to use it
After an invoice is uploaded (SOP 09-01), the AI reads the PDF and extracts key fields. You review what the AI found before approving the document.

## 3. What this does
Displays the AI-extracted fields alongside the original PDF. Lets you correct any errors before moving to approval. Fields extracted: supplier name, ABN, invoice number, invoice date, amount ex-GST, GST amount, total amount, description.

## 4. Before you start
- Invoice has been uploaded and has status "pending_approval"
- You are in Finance → Inbox or Finance → Approvals

## 5. Steps
1. Open **Finance → Inbox** or click the **Approvals** tab
2. Click the invoice you want to review
3. The document opens in a split view:
   - **Left side**: original PDF or photo
   - **Right side**: extracted fields
4. Review each extracted field against the original document:
   - **Supplier name** — should match the company name on the invoice
   - **ABN** — 11-digit number, verify against top of invoice
   - **Invoice number** — exactly as printed
   - **Invoice date** — date on the invoice (not today's date)
   - **Amount ex-GST** — the subtotal before tax
   - **GST amount** — should be exactly 10% of ex-GST amount
   - **Total amount** — ex-GST + GST
5. If any field is wrong: click the field to edit it and type the correct value
6. If the supplier is a known supplier and the ABN matches a previous invoice, the trade category may already be auto-filled (green badge: "Auto-tagged")
7. Once all fields look correct, proceed to SOP 09-03 (job matching) or SOP 09-04 (approve)

### What the confidence scores mean
The AI shows a confidence score (%) next to each extracted field:
- **Green (80–100%)** — AI is confident. Spot-check only.
- **Amber (50–79%)** — AI is uncertain. Verify carefully.
- **Red (< 50%)** — AI is guessing. Must verify against original document.

A job match confidence score also appears (e.g., "Job match: 87%"). See SOP 09-03.

## 6. What happens next
- Correct any errors → proceed to approve (SOP 09-04)
- Wrong job matched → proceed to rematch (SOP 09-03)

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Approving with wrong amount | AI misread a digit | Always compare total to original PDF |
| Accepting wrong ABN | Two suppliers have similar names | Cross-check ABN on ABN Lookup if uncertain |
| Missing GST | Supplier is not GST registered | Some suppliers don't charge GST — the 10% check doesn't apply to all invoices |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| Fields all empty / blank extraction | AI could not read the PDF — open the PDF directly and manually enter all fields |
| PDF viewer not showing | File may be corrupt — download the file and open in Preview/Acrobat |

## 9. Related modules
- [Upload an invoice](finance_upload_invoice.md)
- [Match an invoice to a job](finance_match_invoice_to_job.md)
- [Approve an invoice](finance_approve_invoice.md)

## 10. Screenshot placeholders
- [ ] Split view — original PDF on the left, extracted fields on the right
- [ ] Confidence score badges (green/amber/red) on extracted fields
- [ ] Auto-tagged trade category with "Auto-tagged" green badge

## 11. Automation notes
- Extraction cascade: regex patterns first, then Claude Haiku, then Claude Sonnet if Haiku confidence < 60%
- `ai_extraction_confidence` stored on `financial_documents` row
- Supplier ABN match → `supplier_trade_defaults` → if `auto_tag = true`, trade is pre-filled

## 12. Edge cases and limits
- **Quotes vs invoices (email inbox):** the admin address receives tender QUOTES (subcontractor RFQ replies) and account STATEMENTS as well as invoices. The email scanner classifies each PDF (`classifyInboxDoc`) and **only ingests genuine invoices/receipts** — quotes and statements are skipped (logged, not added to the inbox). Rules: an explicit "invoice"/"tax invoice"/"receipt" word keeps it; a clean "Quote / Quotation / RFQ / Estimate" signal in the filename or subject (with no invoice word) skips it. RFQ quote replies are still handled by the RFQ engine separately. A manual **Upload** can always force a document in regardless. If a real invoice is ever skipped, upload it manually.
- Photo uploads (JPEG/PNG from mobile) are lower quality than PDFs — expect more amber/red confidence fields; always verify manually
- If the PDF is password-protected, extraction will fail entirely — ask the supplier to resend without a password
- Some invoices do not include GST (supplier not GST registered) — the GST field will be 0, which is correct; do not add GST manually
- The extraction cascade escalates to Claude Sonnet only if Haiku confidence < 60% — very low quality documents may return Sonnet-level confidence scores

## 13. Owner
Admin  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least one invoice with status `pending_approval` in the system
- [ ] Invoice has a known supplier name and total amount for comparison

### Test cases

**TC-01 — Extraction fields display correctly**
1. Open any pending invoice in Finance → Approvals
2. Expected: supplier name, ABN, invoice number, date, ex-GST amount all visible
3. Expected: confidence score badges visible on extracted fields
4. Expected: original PDF renders in the left panel
- [ ] Pass  [ ] Fail

**TC-02 — Field editing works**
1. Click on the "Amount ex-GST" field
2. Change the value to a different number
3. Save the change
4. Expected: value updates and persists on page refresh
5. Check DB: `SELECT amount_ex_gst FROM financial_documents WHERE id = '<id>'` matches new value
- [ ] Pass  [ ] Fail

**TC-03 — Auto-trade-tag for known supplier**
1. Upload an invoice from a supplier whose ABN exists in `supplier_trade_defaults` with `auto_tag = true`
2. Expected: trade category field is pre-filled automatically
3. Expected: green "Auto-tagged" badge visible
4. Check DB: `SELECT trade_category_id, auto_tag FROM supplier_trade_defaults WHERE supplier_abn = '<abn>'` — auto_tag = true
- [ ] Pass  [ ] Fail  [ ] N/A (no auto-tagged suppliers yet)

**TC-04 — Low confidence fields flagged**
1. Upload a poor-quality scan (a photographed invoice with low contrast)
2. Expected: at least one field shows amber or red confidence badge
3. Expected: no automatic approval — document remains in pending_approval
- [ ] Pass  [ ] Fail

**TC-05 — Job match confidence visible**
1. Open any pending invoice matched to a job
2. Expected: "Job match: X%" confidence shown
3. Expected: matched job address displayed
- [ ] Pass  [ ] Fail

**TC-06 — Extraction cascade (Sonnet fallback)**
1. Upload a low-quality or hand-written invoice scan
2. Check server logs for extraction model used (look for `claude-sonnet` or `claude-haiku` log entries)
3. Expected: if Haiku extraction confidence < 60%, Sonnet is invoked as a fallback
4. Expected: the final extraction result appears in the UI regardless of which model was used
- [ ] Pass  [ ] Fail  [ ] Skip (cannot access server logs)

### Post-test checklist
- [ ] All extraction fields editable and saving correctly
- [ ] Confidence scores displaying
- [ ] PDF viewer functional
- [ ] Update `test_status` in frontmatter after passing
