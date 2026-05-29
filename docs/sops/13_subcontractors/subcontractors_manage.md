---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 13-03: Search and Manage the Subcontractor Directory

**Module:** RFQ Engine — Subcontractors  
**SOP ID:** 13-03  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Admin staff and estimators who need to find, review, or update subcontractor records.

## 2. When to use it
- When searching for a subcontractor before sending an RFQ
- When updating a subcontractor's contact details or trade type
- When checking whether a subcontractor already exists before adding a new one
- When reviewing the RFQ history for a particular trade

## 3. What this does
Shows the full subcontractor directory as a sortable, searchable table. You can filter by trade, search by name or ABN, click a row to view and edit full details, and see how many RFQs that subcontractor has received.

## 4. Before you start
- You are logged in
- The directory has at least some subcontractors in it

## 5. Step-by-step process

### Search the directory
1. Go to **RFQ Engine** -> **Subcontractors** tab
2. The directory shows all subcontractors in a sortable table
3. Use the **search bar** to type a business name or ABN — results filter as you type
4. Use the **trade filter** dropdown to narrow to a specific trade (e.g. Electrical, Plumbing)

### Sort the table
1. Click any column heading to sort by that column — click again to reverse the sort
2. Useful sorts: by business name (alphabetical), by trade, by number of RFQs sent, or by average quote value

### View and edit a subcontractor
1. Click any row in the table to open the subcontractor's detail view
2. Review their details: contact info, ABN, licence, RFQ history
3. To edit: click **Edit** -> update the fields -> click **Save**

### View RFQ history
1. Open a subcontractor's detail view
2. Scroll to the **RFQ History** section
3. See a list of all RFQ packages they were invited to, their response status, and quote amounts

## 6. What happens after
- Edits to subcontractor details take effect immediately
- All future RFQs and POs will use the updated contact details

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Adding a duplicate instead of finding the existing record | Not searching first | Always search by name or ABN before adding a new subcontractor |
| Editing the wrong subcontractor | Two subcontractors with similar names | Check ABN or contact name to confirm you have the right record |
| Deleting a subcontractor with active RFQs | Tidying up | Check RFQ history before deleting — deleting removes their record from past RFQ views |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Cannot find a subcontractor by name | Check the spelling; try searching by ABN or phone number instead |
| Subcontractor not appearing in the table | They may have been deactivated or deleted — contact Admin to restore if needed |
| Edit not saving | Check all required fields are filled; check your internet connection |
| RFQ history showing 0 even though RFQs were sent | The RFQs may be linked to a different subcontractor record (duplicate) — check for duplicates |

## 9. Related SOPs
- [Add a subcontractor to the directory](subcontractors_add.md) — SOP 13-01
- [Import subcontractors from a spreadsheet](subcontractors_import_csv.md) — SOP 13-02

## 10. Automation notes
- API: `POST /api/subcontractor/lookup` — search by `{ query, trade, abn }` — returns matching subcontractors
- Subcontractor CRUD in `module4Routes.mjs`
- The sortable table uses the `SortableTableHead` component with `sheetSort` state
- Sort helper: `sheetSortValue()` sorts by business name, trade, RFQ count, avg_quote, missing fields
- DB effects on edit: updates `subcontractors` row; no cascade effects unless constraints are violated

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in
- [ ] At least 5 subcontractors in the directory across at least 2 different trades
- [ ] At least 1 subcontractor has received an RFQ

### Test cases

**TC-01 — Directory table loads**
1. RFQ Engine -> Subcontractors tab
2. Expected: table renders with all subcontractors visible
3. Expected: columns include business name, trade, contact, email, and RFQ count
- [ ] Pass  [ ] Fail

**TC-02 — Search by business name**
1. Type a known subcontractor name into the search bar
2. Expected: only matching subcontractors appear in the table
3. Expected: search filters as you type (or on submit)
- [ ] Pass  [ ] Fail

**TC-03 — Filter by trade**
1. Select "Electrical" from the trade filter dropdown
2. Expected: only Electrical subcontractors appear
3. Expected: subcontractors with a different trade are hidden
- [ ] Pass  [ ] Fail

**TC-04 — Sort by business name**
1. Click the "Business Name" column header
2. Expected: table sorts alphabetically A-Z
3. Click again
4. Expected: sorts Z-A
- [ ] Pass  [ ] Fail

**TC-05 — Edit a subcontractor's email**
1. Click a subcontractor row -> Edit -> change email -> Save
2. Expected: success message
3. Expected DB: `email` updated in `subcontractors` table for that record
4. Expected: new email shown in the table
- [ ] Pass  [ ] Fail

**TC-06 — RFQ history visible on a subcontractor with past RFQs**
1. Open a subcontractor who has received at least one RFQ
2. Scroll to RFQ History section
3. Expected: at least one RFQ entry shown with package name, date, and response status
- [ ] Pass  [ ] Fail

**TC-07 — Search via lookup API**
1. Call `POST /api/subcontractor/lookup` with `{ query: '[known name]' }`
2. Expected: returns array with matching subcontractor(s)
3. Expected: each result has at least `id`, `businessName`, `trade`, `email`
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Directory table loads all records
- [ ] Search and filter work correctly
- [ ] Sorting works on all sortable columns
- [ ] Edit and save persists to DB
- [ ] RFQ history visible for subcontractors with history
- [ ] Lookup API returns correct results
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
