---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: placeholders_only
owner: Admin
test_status: static_pass
---

# SOP 03-01: Create a Fee Proposal

**Module:** Tender Manager → Fee Proposals  
**SOP ID:** 03-01  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Supervisor (tender coordinators)

## 2. When to use it
When a project has a Buildexact estimate ready and you need to produce a client-facing fee proposal document. The wizard imports the estimate, lets you review and edit the structured fields, and generates a branded Blue Leaf proposal.

## 3. What this does
Turns a Buildexact estimate (XLSX export or PDF) into a branded fee proposal. The system reads the estimate, extracts the categories and totals, lets you refine them in a browser wizard, then generates an editable Google Doc (DOCX) you can finalise before sending.

## 4. Before you start
- You have a Buildexact estimate for the project — either an XLSX export or a PDF
- A DOCX fee proposal template is uploaded in **Settings → Fee Proposal Template** (a default ships with the app)
- For Google Docs editing: Google Drive integration must be configured

## 5. Step-by-step process

1. Go to **Tender Manager → Fee Proposals**
2. Click **New fee proposal** to open the wizard
3. **Import the estimate:**
   - Upload the Buildexact **XLSX** export (preferred — exact figures), or
   - Upload the estimate **PDF** (AI reads it — review carefully), or
   - Pull directly from **Buildexact** if the job is linked
4. Wait for the parse to complete — the categories, net total, markup, and estimate total populate
5. **Review the structured fields:**
   - Project address, client name, building type, date prepared
   - Category list with subtotals
   - Markup percentage and estimate total
6. Edit any field that needs correcting
7. Click **Open in Google Docs** to generate an editable DOCX (uploads to Drive, opens the edit URL)
8. Make any final wording changes in Google Docs

The proposal is now ready to send (SOP 03-02).

## 6. What happens next

- The parsed estimate is saved to `buildexact_estimates` (with a `source_hash` so re-uploading the same file returns the cached parse)
- If the job is recognised by address, `job_id` is linked and `job_budgets` are seeded from the estimate categories
- A Google Doc is created in Drive and the edit URL is returned
- No email is sent at this stage — sending is a separate step (SOP 03-02)

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Uploading a scanned PDF | Estimate was scanned, not exported | Use the XLSX export from Buildexact — it gives exact figures. PDF parsing uses AI and should be reviewed. |
| Not reviewing AI-parsed PDF figures | Trusting the parse | Always check the net total and markup against the source before generating |
| Missing template | Template never uploaded | Upload a DOCX template in Settings first — generation fails without one |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "No template available" error | Upload a DOCX template in Settings → Fee Proposal Template |
| "dataBase64 required" error | The file didn't upload — try again with a valid XLSX or PDF |
| Parse returns wrong totals | For PDFs, the AI may misread — switch to the XLSX export |
| "proposalData object required" | The wizard didn't pass the reviewed data — reload and re-import |

## 9. Related modules
- [Send a fee proposal to a client](tendering_fee_proposal_send.md) — SOP 03-02
- [Use the tender board](tendering_tender_board.md) — SOP 03-03

## 10. Screenshot placeholders
[insert screenshot: fee proposal wizard import step]
[insert screenshot: parsed categories review screen]
[insert screenshot: Open in Google Docs result]

## 11. Automation notes
- Parse XLSX: `POST /api/fee-proposal/parse-xlsx` with `{ dataBase64, filename }` → returns `{ ok, parsed, job_id, estimate_id }`
- Parse PDF: `POST /api/fee-proposal/parse-pdf` (requires `ANTHROPIC_API_KEY`)
- Generate DOCX: `POST /api/fee-proposal/generate-docx` with `{ proposalData, templateBase64?, filename? }` — auto-fetches template from Storage if not provided
- Upload to Drive: `POST /api/fee-proposal/upload-to-drive` with `{ proposalData, quoteNumber }` → returns `{ ok, fileId, editUrl }`
- Estimate stored in `buildexact_estimates`; duplicate uploads matched by `source_hash`
- On recognised job: `job_budgets` seeded from estimate categories (non-blocking)

## 12. Edge cases and limits
- Re-uploading an identical file returns the cached parse (no duplicate estimate) unless `?force` is set
- If the address doesn't match a job, `job_id` is null — budgets are not seeded
- DOCX generation uses docxtemplater with single-brace `{VAR}` syntax — a malformed template throws a 502 with the template error detail

## 13. Owner of the process
Admin  
Next review: 2026-11-30

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] A DOCX fee proposal template uploaded in Settings (or the default `/BLB_TENDER_TEMPLATE.docx` present)
- [ ] A Buildexact XLSX estimate export available for testing
- [ ] Logged in as Admin

### Test cases

**TC-01 — Parse XLSX estimate (happy path)**
1. Open the fee proposal wizard
2. Upload a Buildexact XLSX export
3. Expected: parse completes, categories + net total + estimate total populate
4. Expected DB: `buildexact_estimates` row created with `source = 'xlsx'`, `source_hash` set
5. Expected: response `{ ok: true, parsed, job_id, estimate_id }`
- [ ] Pass  [ ] Fail

**TC-02 — Empty upload rejected**
1. Trigger parse with no file / empty body
2. Expected: HTTP 400 `{ ok: false, error: "dataBase64 required." }`
3. Expected DB: no estimate row created
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate file returns cached parse**
1. Upload the same XLSX file twice
2. Expected: second response has `cached: true` and reuses the existing estimate (no duplicate row)
- [ ] Pass  [ ] Fail

**TC-04 — Generate DOCX without template**
1. Ensure no template uploaded and no default present
2. Attempt Generate DOCX
3. Expected: HTTP 400 `{ ok: false, error: "No template available — upload a DOCX template in Settings first." }`
- [ ] Pass  [ ] Fail

**TC-05 — Open in Google Docs (automation)**
1. Complete a parse, then click Open in Google Docs
2. Expected: `POST /api/fee-proposal/upload-to-drive` returns `{ ok: true, fileId, editUrl }`
3. Expected: editUrl opens an editable Google Doc
4. (SKIP if Google Drive not configured — verify 503 message instead)
- [ ] Pass  [ ] Fail

**TC-06 — Job budget seeding on recognised address**
1. Parse an estimate whose address matches an existing job
2. Expected DB: `job_budgets` rows seeded from estimate categories for that job
3. Expected: `job_id` populated on the estimate row
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] XLSX parse works and persists estimate
- [ ] Empty upload rejected
- [ ] Duplicate caching works
- [ ] DOCX generation requires a template
- [ ] Drive upload returns edit URL
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
