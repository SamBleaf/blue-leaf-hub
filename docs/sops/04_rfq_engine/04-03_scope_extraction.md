---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 04-03: Extract Scope of Works with AI

**Module:** Tender Manager → RFQ Engine (`/tender-manager/rfq-engine`) — Step 1 & Step 2
**SOP ID:** 04-03
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin (tender coordinators)

## 2. When to use it

During Step 1 of the RFQ Engine wizard, when you have a tender document (specification, drawings, or scope PDF) to upload. The AI reads the document and extracts scope bullet points for each trade automatically, saving hours of manual work.

This SOP covers Step 1 (upload) and Step 2 (review extraction results) of the wizard. The wizard is at `/tender-manager/rfq-engine`.

## 3. What this does

Uploads a PDF (or multiple PDFs) and runs them through a multi-step AI pipeline:
1. Text is extracted from the PDF
2. AI classifies each paragraph or line item to a trade
3. For each trade: scope bullet points, exclusions, and questions are extracted
4. The results populate the extraction fields (one scope per detected trade), which feed Step 2 of the wizard

The extraction is a starting point — always review and refine the results before moving to Step 3.

## 4. Before you start

- The PDF should be text-based (searchable), not a scanned image
- Scanned image PDFs will have poor extraction quality — OCR is not applied
- The document should contain construction scope information (specifications, drawings notes, trade inclusion lists)
- You must be in the RFQ Engine wizard at Step 1

## 5. Step-by-step process

1. Navigate to **Tender Manager → RFQ Engine** (`/tender-manager/rfq-engine`)
2. In **Step 1 — Documents**, click the upload area or drag and drop PDF file(s) onto it
3. Optionally set the document type for each PDF (Architectural, Structural, Specification, etc.)
4. Click **Extract scope** (or proceed to Step 2 — extraction runs automatically)
5. Wait 10–30 seconds per document — progress messages rotate while the AI processes
6. Review the extraction results on **Step 2**:
   - A list of detected trades appears in the left column
   - Each trade shows extracted scope bullet points, exclusions, and questions
7. For each trade scope:
   - Add bullet points the AI missed
   - Remove items that don't belong to this trade
   - Edit bullet point wording if needed
8. Confirm the extraction is accurate before clicking **Next** to Step 3

## 6. Multiple documents

You can upload multiple PDFs at once (e.g. architectural + structural drawings). Extraction processes them sequentially and merges results trade-by-trade. The progress indicator shows `(1 of N)` while processing.

## 7. After extraction

The extracted scopes are **not sent to subcontractors yet** — they are drafts on the wizard. Your workflow after extraction:

1. Review and edit each trade scope (SOP 04-04)
2. Assign subcontractors to each trade (Step 3)
3. Send the emails (SOP 04-05, Step 4)

## 8. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Uploading a scanned PDF (image, not text) | Not knowing the PDF type | Open the PDF on your computer and try to select text — if you can't select text, it's a scanned image |
| Sending without reviewing the extraction | Trusting AI too much | The AI may miss items or assign them to the wrong trade. Review every scope before sending. |
| Uploading the wrong document | Multiple files with similar names | Double-check the filename before uploading |

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| Extraction returns empty scopes | The PDF may be image-based (not text). Try a different document or manually enter the scope. |
| Scope items assigned to wrong trade | The AI uses trade keywords to classify. Manually move items between trade scopes in Step 2. |
| Extraction takes > 1 minute | Large PDFs may take longer. Wait for it to complete. If it fails, try re-uploading. |
| Dropbox online-only file fails to upload | File must be downloaded locally first — open in Dropbox to force a local copy, then try again. |

## 10. Related SOPs

- [Create an RFQ Package](04-02_create_rfq_package.md) — SOP 04-02
- [Manage Trade Packages](04-04_trade_packages.md) — SOP 04-04

## 11. Screenshots

[insert screenshot: Step 1 PDF upload area with document type selector]
[insert screenshot: Step 2 extraction results with trade scopes and bullet points]

## 12. Automation notes

- Extraction runs through the `/api/rfq/extract` endpoint (NDJSON stream)
- Pipeline: text extraction → Claude classification → normalisation → deduplication → send-readiness checks
- Trade classification uses `rfqTradeExtractionRules.mjs` — keyword rules per trade plus Claude fallback
- Results stored in wizard state (`extraction.trade_notes`); persisted to `localStorage` (`blhub_rfq_session`)
- PDFs are stored in IndexedDB (`rfq-engine-pdfs` scope) so the session can be restored after page reload
- Extraction supports rate-limit back-off: if the API returns `event: rate_limit`, the UI shows a countdown and retries

## 13. Owner of the process

Admin
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup

- [ ] A text-based (searchable) PDF with construction scope content
- [ ] Logged in as Admin
- [ ] RFQ Engine wizard at Step 1 (fresh session or at least the document step)

### Test cases

**TC-01 — Upload and extract (happy path)**
1. Navigate to `/tender-manager/rfq-engine`
2. Drag a construction PDF onto the upload area in Step 1
3. Click Extract scope (or proceed to Step 2)
4. Wait up to 30 seconds
5. Expected: Step 2 shows trade scopes — at least 2 trades detected
6. Expected: each trade scope has at least 1 scope bullet point
7. Expected: `localStorage['blhub_rfq_session']` extraction field is populated

- [ ] Pass  [ ] Fail

**TC-02 — Extraction results are trade-specific**
1. Review the extracted scopes on Step 2
2. Expected: scope items grouped under the correct trade (e.g. "Form and pour slab" under Concrete, not Electrical)
3. Expected: no obviously misclassified items visible
- [ ] Pass  [ ] Fail

**TC-03 — Editing scope bullet points persists**
1. On Step 2, add a new bullet point to any trade scope: "Allow for rock breaking"
2. Navigate to Step 3 and back to Step 2
3. Expected: the added bullet point is still present
- [ ] Pass  [ ] Fail

**TC-04 — Multiple PDFs merge results**
1. Upload 2 PDFs (e.g. architectural + structural)
2. Expected: extraction progress shows "(1 of 2)" then "(2 of 2)"
3. Expected: final scopes contain items from both documents (no duplicate bullets)
- [ ] Pass  [ ] Fail

**TC-05 — Session restores after page reload**
1. Complete extraction so Step 2 shows trades
2. Reload the page (Cmd-R)
3. Expected: wizard lands on the same step with the extracted scopes intact
4. Expected: PDFs are restored from IndexedDB (names visible in the file list)
- [ ] Pass  [ ] Fail

**TC-06 — Feature case: document type tag affects prompt**
1. Upload a PDF and change its document type from "Other" to "Structural"
2. Run extraction
3. Expected: structural-specific items (e.g. footing reinforcement details) appear in concrete/footings trade scope rather than being missed
- [ ] Pass  [ ] Fail

### Post-test checklist

- [ ] Extraction runs without error
- [ ] Trade scopes populated with relevant items
- [ ] Scopes persist in session after navigation
- [ ] Multiple PDFs merge correctly
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
