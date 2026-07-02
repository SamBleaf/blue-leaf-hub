---
sop_version: 1.1
last_reviewed: 2026-07-02
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
Opens a bulk import modal where you can get a pre-formatted CSV template (as a local download or in Google Sheets), fill in your subcontractor details, then upload the completed CSV to create all records at once. A preview table shows the rows that will be imported before you confirm.

## 4. Before you start
- You have a list of subcontractors to import (spreadsheet, contact list, or similar)
- You are logged in
- Each subcontractor row must have at minimum: business name, email address, and trade type

## 5. Step-by-step process

### Step 1 — Open the import modal
1. Go to **Tender Manager** -> **Subcontractors** in the sidebar
2. Click the **+** button (top right) to open the add menu
3. Click **Import from CSV** (shown with a CSV badge)

### Step 2 — Get the CSV template
Choose one of two options:
- **Option A — Google Sheets:** Click **Open Template in Google Sheets** — the system creates a Google Sheet with the correct column headers already in place; fill in your rows there, then download it as CSV (File -> Download -> Comma-separated values)
- **Option B — Download CSV:** Click **Download CSV Template** — a file named `blue-leaf-subcontractors-template.csv` downloads with two example rows; open in Excel or Google Sheets, delete the example rows, add your data, save as CSV

The template columns are: `business_name`, `email`, `trade`, `contact`, `mobile`, `abn`, `address`, `suburb`, `state`, `postcode`

### Step 3 — Fill in the template
1. Keep the column headings exactly as provided — do not rename them
2. Fill in one row per subcontractor:
   - `business_name` (required)
   - `email` (required)
   - `trade` (required) — must match a trade in the dropdown (e.g. "plumbing", "electrical")
   - All other columns are optional — leave blank if you don't have them
3. Save the file as CSV (not XLSX)

### Step 4 — Upload and review
1. Back in the import modal, click **Upload completed CSV** and select your file
2. The system parses the file immediately — a preview table shows the valid rows
3. Rows missing business_name, email, or trade are automatically skipped and shown in an amber warning with a count ("N rows skipped because Business Name, Email or Trade was blank")
4. Check the preview — confirm the row count and that the data looks correct

### Step 5 — Import
1. Click **Import N subcontractors** (the button shows the count of valid rows)
2. Wait for the confirmation — the modal closes automatically
3. All successfully imported subcontractors appear in the directory immediately

## 6. What happens next
- All successfully imported subcontractors appear in the directory immediately
- They are available for RFQ selection, PO issuance, and compliance uploads
- Rows with missing required fields were skipped before import (shown in the amber warning at upload time — not a post-import report)
- No MX-check runs on bulk import — run one manually via the Admin MX backfill action if needed

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Saving the template as XLSX instead of CSV | Default Excel save format | When saving in Excel: File -> Save As -> choose "CSV (Comma-separated)" |
| Changing the column headings | Tidying up the template | The headings must stay exactly as provided — the system reads them by name; changed headers cause the column to be ignored |
| Blank email on some rows | Copying partial data | email is required — rows without it will be skipped and counted in the amber warning |
| Duplicate entries | Importing an updated list without checking | Search the directory first (SOP 13-03) — duplicate imports create duplicate records; no dedup guard runs at import |
| Using a trade name not in the dropdown | Typo or abbreviation | Copy the exact trade string from the dropdown (e.g. "footings / concrete / formwork" not "footings") |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| All rows skipped, "Business Name, Email or Trade was blank" | Check that the three required columns contain data for every row; empty cells or column name mismatches cause skips |
| "Missing required columns: business_name, email, trade" error | Column headers were changed or are missing — re-download the template and use it as the base |
| "CSV must include a header row and at least one subcontractor row" | The file is empty or only has a header row — add at least one data row |
| Import button greyed out / shows "Import 0 subcontractors" | No valid rows were parsed — check the file has required columns and at least one data row |
| Google Sheets option fails | Google Drive is not configured or the auth token has expired — use "Download CSV Template" instead and work locally |

## 9. Related modules
- [Add a subcontractor to the directory](subcontractors_add.md) — SOP 13-01
- [Search and manage the subcontractor directory](subcontractors_manage.md) — SOP 13-03

## 10. Screenshot placeholders
[insert screenshot: Add menu open showing "Import from CSV" option]
[insert screenshot: Bulk import modal with template buttons and file upload field]
[insert screenshot: Preview table showing parsed rows before clicking Import]

## 11. Automation notes
- The import modal is entirely client-side: CSV parsing runs in the browser via `parseCsv()` and `normaliseCsvHeader()` in `Subcontractors.jsx`
- Required columns validated client-side: `["business_name", "email", "trade"]` — missing columns shown as amber error; rows with blank required cells are filtered out with a count
- Google Sheets template: `POST /api/subcontractors/csv-template-sheet` (Admin role required) — uploads the CSV template to Google Drive and returns `{ ok: true, editUrl }` which the browser opens in a new tab; on failure it falls back to downloading the CSV locally
- Bulk insert: `supabase.from("subcontractors").insert(payload)` — inserts all valid rows in one call; optional fields with blank values are stored as NULL
- No MX-check or AI lookup runs on bulk import
- DB effects: inserts rows into `subcontractors`; columns not in the template are left at their DB defaults

## 12. Edge cases and limits
- Column name normalisation is case-insensitive and strips extra spaces and special characters — "Business Name" will match "business_name"
- Only the first 8 rows are shown in the preview table; all valid rows are still imported
- If the Supabase insert fails (e.g. network error), the full error message is shown in the modal — no partial import occurs (the insert is atomic)
- There is no import history or log stored server-side — if you need to know what was imported, check the directory immediately after
- Rows with extra columns are ignored; only the 10 template columns are read

## 13. Owner of the process
Admin  
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run these tests in order. Record pass/fail. Do not mark `test_status: passed` unless all cases pass.

### Pre-test setup
- [ ] Logged in
- [ ] Subcontractors page accessible
- [ ] Note how many subcontractors currently exist in the directory (baseline count)

### Test cases

**TC-01 — Download CSV template**
1. Tender Manager -> Subcontractors -> **+** -> **Import from CSV**
2. Click **Download CSV Template**
3. Expected: file `blue-leaf-subcontractors-template.csv` downloads
4. Expected: file has column headers: `business_name`, `email`, `trade`, `contact`, `mobile`, `abn`, `address`, `suburb`, `state`, `postcode`
5. Expected: two example rows present (Example Plumbing Co, Example Electrical)
- [ ] Pass  [ ] Fail

**TC-02 — Import a valid CSV with 3 subcontractors**
1. Create a CSV with 3 valid rows (all three required fields filled: business_name, email, trade)
2. Upload via the import modal
3. Expected: preview shows "3 subcontractors ready to import"; no amber warning
4. Click **Import 3 subcontractors**
5. Expected: modal closes; directory count increases by 3
6. Expected DB: 3 new rows in `subcontractors` with correct field values
- [ ] Pass  [ ] Fail

**TC-03 — Rows missing required fields are skipped**
1. Create a CSV with 2 valid rows and 1 row missing email
2. Upload the file
3. Expected: amber warning "1 row skipped because Business Name, Email or Trade was blank"
4. Expected: preview shows "2 subcontractors ready to import"
5. Click Import; expected: 2 rows inserted, 1 skipped
6. Expected DB: only 2 new rows added
- [ ] Pass  [ ] Fail

**TC-04 — Wrong or missing column headers rejected**
1. Create a CSV where "business_name" is renamed to "company_name" (all other columns intact)
2. Upload the file
3. Expected: amber error "Missing required columns: business_name" (the renamed column is not found)
4. Expected: Import button shows 0 rows and is disabled
- [ ] Pass  [ ] Fail

**TC-05 — Empty CSV file**
1. Create a CSV with only the header row and no data rows
2. Upload the file
3. Expected: amber error "CSV must include a header row and at least one subcontractor row"
4. Expected: Import button disabled
- [ ] Pass  [ ] Fail

**TC-06 — Imported subcontractors available in RFQ selection**
1. After TC-02, create or open an RFQ package for one of the imported trades
2. Expected: at least one of the 3 imported subcontractors appears in the subcontractor selection list for that trade
- [ ] Pass  [ ] Fail

**TC-07 — Google Sheets template (if Drive configured)**
1. Click **Open Template in Google Sheets**
2. Expected: a new browser tab opens a Google Sheet with the correct column headers
3. Expected: server call `POST /api/subcontractors/csv-template-sheet` returns `{ ok: true, editUrl }`
4. If Drive not configured: expected fallback — CSV downloads locally and a message explains the fallback
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Template downloads with correct 10 column headers
- [ ] Valid CSV imports all rows and count matches
- [ ] Missing required field causes row skip with correct warning
- [ ] Wrong column name detected and rejected
- [ ] Empty file rejected with clear error
- [ ] Imported records available in RFQ trade filter
- [ ] Google Sheets path works (or fallback fires gracefully)
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
