---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 13-02: Import Subcontractors from a Spreadsheet

**Module:** RFQ Engine — Subcontractors  
**SOP ID:** 13-02  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Admin staff importing an existing subcontractor list into Blue Leaf Hub — typically done once at initial setup, or when inheriting a large list of contacts from another system.

## 2. When to use it
- When setting up the app for the first time and you have an existing list of subcontractors in a spreadsheet
- When adding a large number of new subcontractors at once (more than 5 or so — adding one by one via SOP 13-01 would take too long)

## 3. What this does
Downloads a pre-formatted CSV template from the system, lets you fill in your subcontractor details, then uploads the completed file to bulk-create all records at once.

## 4. Before you start
- You have a list of subcontractors to import (spreadsheet, contact list, or similar)
- You are logged in as Admin

## 5. Step-by-step process

### Step 1 — Download the CSV template
1. Go to **RFQ Engine** -> **Subcontractors** tab
2. Click **Import CSV** (or **Bulk Import**)
3. Click **Download Template**
4. A CSV file downloads to your computer — open it in Excel or Google Sheets

### Step 2 — Fill in the template
1. The template has column headings — do not change them
2. Fill in one row per subcontractor with:
   - `business_name` (required)
   - `trade` (required)
   - `contact_name`
   - `email`
   - `phone`
   - `abn`
   - `licence_number`
3. Leave optional fields blank if you don't have them
4. Save the file as CSV (not XLSX)

### Step 3 — Upload the completed CSV
1. Back in the app, click **Upload CSV**
2. Select your completed CSV file
3. Click **Import**
4. The system processes the file and shows a summary: how many records were created, and any rows that failed (with reasons)

### Step 4 — Review the results
1. Check the import summary — any failed rows are listed with the reason
2. Fix the failed rows and re-import just those records, or add them manually via SOP 13-01
3. Click **Done** — all successfully imported subcontractors appear in the directory

## 6. What happens after
- All successfully imported subcontractors appear in the directory immediately
- They are available for RFQ selection, PO issuance, and compliance uploads
- The import log shows which rows succeeded and which failed

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Saving the template as XLSX instead of CSV | Default Excel save format | When saving in Excel: File -> Save As -> choose "CSV (Comma-separated)" |
| Changing the column headings | Tidying up the template | The headings must stay exactly as provided — the system reads them by name |
| Blank business_name on some rows | Copying partial data | business_name is required for every row — rows without it will fail and be shown in the error summary |
| Duplicate entries | Importing an updated list without checking | Search the directory first (SOP 13-03) — duplicate imports create duplicate records |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| All rows fail on import | The file format may be wrong — ensure it is saved as CSV, not XLSX or TSV |
| "Invalid column headers" error | The column headings were changed — re-download the template and use it as the base |
| Some rows fail with "business_name required" | Those rows have a blank business_name column — fix them and re-import or add manually |
| Import button greyed out | Ensure a file is selected before clicking Import |

## 9. Related SOPs
- [Add a subcontractor to the directory](subcontractors_add.md) — SOP 13-01
- [Search and manage the subcontractor directory](subcontractors_manage.md) — SOP 13-03

## 10. Automation notes
- API: `POST /api/subcontractors/csv-template-sheet` — returns a downloadable CSV template file with the correct column headers
- Upload/import endpoint: POST to the subcontractor bulk-import endpoint in `module4Routes.mjs` (or `dev-api.mjs`)
- DB effects: bulk-inserts rows into `subcontractors` table; rows with missing required fields are skipped and reported in the response
- Response includes: `{ ok: true, created: N, failed: [{ row: N, reason: '...' }] }`

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] No existing subcontractors in the directory (or note how many exist before test)

### Test cases

**TC-01 — Download CSV template**
1. RFQ Engine -> Subcontractors -> Import CSV -> Download Template
2. Expected: CSV file downloads
3. Expected: file has column headers including at least `business_name`, `trade`, `email`
4. Expected API: `POST /api/subcontractors/csv-template-sheet` returns a file download
- [ ] Pass  [ ] Fail

**TC-02 — Import a valid CSV with 3 subcontractors**
1. Fill the template with 3 valid rows (all required fields filled)
2. Save as CSV -> Upload
3. Expected: import summary shows "3 created, 0 failed"
4. Expected DB: 3 new rows in `subcontractors` table
5. Expected: all 3 subcontractors appear in the directory
- [ ] Pass  [ ] Fail

**TC-03 — Import with one row missing business_name**
1. Create a CSV with 2 valid rows and 1 row missing business_name
2. Upload
3. Expected: summary shows "2 created, 1 failed" with reason "business_name required" for the failed row
4. Expected DB: only 2 rows inserted
- [ ] Pass  [ ] Fail

**TC-04 — Import with wrong column headers**
1. Download template, rename "business_name" to "company_name", upload
2. Expected: HTTP 400 or import fails with "Invalid column headers" error
- [ ] Pass  [ ] Fail

**TC-05 — XLSX file rejected**
1. Attempt to upload an XLSX file instead of CSV
2. Expected: HTTP 400 or front-end validation rejects the file type
- [ ] Pass  [ ] Fail

**TC-06 — Imported subcontractors available in RFQ selection**
1. After TC-02, create or open an RFQ package for one of the imported trades
2. Expected: at least one of the imported subcontractors appears in the selection list
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Template downloads with correct headers
- [ ] Valid CSV imports all rows
- [ ] Missing required field reported correctly
- [ ] Wrong headers rejected
- [ ] File type validation works
- [ ] Imported records available in RFQ
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
