---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 04-03: Extract Scope of Works with AI

**Module:** Tender Manager → RFQ Engine → Package Detail  
**SOP ID:** 04-03  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin (tender coordinators)

## 2. When to use it
After creating an RFQ package, when you have a tender document (specification, drawings, or scope PDF) to upload. The AI reads the document and extracts scope bullet points for each trade automatically, saving hours of manual work.

## 3. What this does
Uploads a PDF (or multiple PDFs) and runs them through a multi-step AI pipeline:
1. Text is extracted from the PDF
2. AI classifies each paragraph or line item to a trade
3. For each trade: scope bullet points, exclusions, and questions are extracted
4. The results populate the trade scopes in the package (one scope per detected trade)

The extraction is a starting point — always review and refine the results.

## 4. Before you start
- The PDF should be text-based (searchable), not a scanned image
- Scanned image PDFs will have poor extraction quality — OCR is not applied
- The document should contain construction scope information (specifications, drawings notes, trade inclusions lists)

## 5. Step-by-step process

1. Open the RFQ package
2. Click **Upload & Extract** or the document upload area
3. Upload the tender document (PDF)
4. Click **Extract scope**
5. Wait 10–30 seconds — the AI processes the document
6. Review the extraction results:
   - A list of detected trades appears
   - Each trade shows extracted scope bullet points, exclusions, and questions
7. For each trade scope:
   - Edit or add bullet points that the AI missed
   - Remove items that don't belong to this trade
   - Confirm the list is accurate before sending

## 6. After extraction

The extracted scopes are NOT sent to subcontractors yet. They are drafts. Your workflow after extraction:
1. Review and edit each trade scope (SOP 04-04)
2. Assign subcontractors to each trade
3. Send the emails (SOP 04-05)

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Uploading a scanned PDF (image, not text) | Not knowing the PDF type | Open the PDF on your computer and try to select text — if you can't select text, it's a scanned image |
| Sending without reviewing the extraction | Trusting AI too much | The AI may miss items or assign them to the wrong trade. Review every scope before sending. |
| Uploading the wrong document | Multiple files with similar names | Double check the filename before uploading |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Extraction returns empty scopes | The PDF may be image-based (not text). Try a different document or manually enter the scope. |
| Scope items assigned to wrong trade | The AI uses trade keywords to classify. Manually move items between trade scopes if needed. |
| Extraction takes > 1 minute | Large PDFs may take longer. Wait for it to complete. If it fails, try re-uploading. |

## 9. Automation notes
- Extraction runs through `rfqScopePipeline.mjs` — multi-step: text extraction → Claude Haiku classification → normalisation → deduplication → send-readiness checks
- Trade classification uses `rfqTradeExtractionRules.mjs` — keyword rules per trade plus Claude fallback
- Results stored in `rfq_packages.extraction_data` (raw) and split into `rfq_trade_scopes` rows per trade
- Coverage score recalculated after extraction: `reconcilePackageTradeCoverage()`

## 10. Owner of the process
Admin  
Next review: 2026-11-29

---

## 11. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A text-based PDF with construction scope content (use `test_scope_document.pdf`)
- [ ] An RFQ package already created

### Test cases

**TC-01 — Upload and extract (happy path)**
1. Open an RFQ package
2. Upload `test_scope_document.pdf`
3. Click Extract scope
4. Wait up to 30 seconds
5. Expected: trade scopes appear (at least 2 trades detected)
6. Expected: each trade scope has at least 1 scope bullet point
7. Expected DB: `rfq_trade_scopes` rows created for this package
- [ ] Pass  [ ] Fail

**TC-02 — Extraction results are trade-specific**
1. Review the extracted scopes
2. Expected: scope items are grouped under the correct trade (e.g. "Form and pour slab" under Concrete, not Electrical)
3. Expected: no obviously misclassified items visible
- [ ] Pass  [ ] Fail

**TC-03 — Coverage score updates after extraction**
1. Check the package's coverage score before extraction
2. Upload and extract
3. Expected: coverage score increases after extraction (more trades covered)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Extraction runs without error
- [ ] Trade scopes populated with relevant items
- [ ] Coverage score updated
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
