---
sop_version: 1.1
last_reviewed: 2026-07-02
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
Admin staff and estimators who need to find, review, update, or analyse subcontractor records.

## 2. When to use it
- When searching for a subcontractor before sending an RFQ
- When updating a subcontractor's contact details or trade type
- When checking whether a subcontractor already exists before adding a new one
- When reviewing the RFQ history, quote history, and performance stats for a particular subcontractor

## 3. What this does
Shows the full subcontractor directory in either a card view or a sortable spreadsheet view. You can filter by trade, search by name, email, phone, or suburb, sort by any column, click a card or row to view detailed stats and recent RFQ history, and click Edit to update any record.

## 4. Before you start
- You are logged in
- The directory has at least some subcontractors in it

## 5. Step-by-step process

### Search the directory
1. Go to **Tender Manager** -> **Subcontractors** in the sidebar
2. The directory shows all subcontractors — use the **Search** bar to type a business name, email, phone number, or suburb — results filter as you type
3. Use the **All Trades** dropdown to narrow to a specific trade (e.g. electrical, plumbing)

### Switch between Cards and Spreadsheet view
- Click **Cards** to see rich cards with colour-coded trade badges, mobile/email links, and a "missing info" badge
- Click **Spreadsheet** to see a dense sortable table with stats columns (RFQs, Uploaded, Accepted, Avg quote, Missing)

### Sort the directory
**In Cards view:** use the Sort buttons — A to Z, Z to A, Date added, or Trade (Trade groups cards by trade with section headings)

**In Spreadsheet view:** click any column heading to sort by that column — click again to reverse. Sortable columns: Business, Trade, Contact, Email, Mobile, Suburb, RFQs, Uploaded, Accepted, Avg quote, Missing.

### View a subcontractor's stats and RFQ history
**In Spreadsheet view:** click the business name in any row to open the **Subcontractor Dashboard** panel, which shows:
- Summary stats: RFQs sent, Quotes uploaded, Accepted, Response rate, Win rate, Avg quote
- Contact details: email, mobile, ABN, location
- Useful metrics: total quoted, last used, missing fields count
- Recent quotes and RFQs table (last 8): job address, trade, status, amount, PDF link, sent date

### Edit a subcontractor
1. Click the **Edit** button on a card (pencil icon) or in the Spreadsheet view row
2. The Edit modal opens with three required fields (Business Name, Email, Trade) and optional contact details
3. Update the fields as needed; click **Save changes**
4. An MX-check runs on the (possibly changed) email after save — if the domain is undeliverable, an alert appears

### Add a custom trade category
1. Click **+** -> **Add Trade Category**
2. Enter a trade name, optional description, and choose a colour badge
3. Click **Save category** — the new trade appears in the trade dropdown for all subcontractors

## 6. What happens next
- Edits to subcontractor details take effect immediately and are visible in all views
- All future RFQs and POs will use the updated contact details
- The Subcontractor Dashboard stats update in real time from the `rfqs` table

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Adding a duplicate instead of finding the existing record | Not searching first | Always search by name, email, or suburb before adding a new subcontractor |
| Editing the wrong subcontractor | Two subcontractors with similar names | Check ABN or email to confirm you have the right record before saving changes |
| Expecting a post-import summary | Importing via CSV (SOP 13-02) | The import shows skipped rows before import, not after — check the amber warning at upload time |
| Sorting by RFQ count and seeing zeros | RFQs were sent before this subcontractor record existed | The RFQ count comes from `rfqs.subcontractor_id` — legacy RFQs without a subcontractor_id won't count |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Cannot find a subcontractor by name | Check the spelling; try searching by email, mobile, or suburb instead |
| Subcontractor not appearing in the table | They may have been deleted — contact Admin to check and restore if needed |
| Edit not saving — "Business Name, Email and Trade are required" | All three required fields must be filled; check none are empty |
| RFQ history showing 0 even though RFQs were sent | The RFQs may be linked to a different or duplicate subcontractor record — check for duplicates using the search bar |
| "Undeliverable email" badge on a card | The email domain failed MX check — confirm the address with the subcontractor and edit it |
| Missing info count is high | Subcontractors imported via CSV may be missing contact, mobile, ABN, or address — edit each record to fill in the gaps |

## 9. Related modules
- [Add a subcontractor to the directory](subcontractors_add.md) — SOP 13-01
- [Import subcontractors from a spreadsheet](subcontractors_import_csv.md) — SOP 13-02

## 10. Screenshot placeholders
[insert screenshot: Subcontractors page in Cards view with trade filter dropdown and search bar]
[insert screenshot: Spreadsheet view showing sortable column headers and stats columns]
[insert screenshot: Subcontractor Dashboard panel showing stats, contact details, and recent RFQs table]

## 11. Automation notes
- All data loaded directly from Supabase (client-side): `subcontractors` table (all fields) and `rfqs` table (last 2000 rows, ordered by `created_at` descending)
- AI lookup endpoint (used by Add flow, not manage): `POST /api/subcontractor/lookup` — body `{ business_name, email, trade, suburb, state }` — AI web search returns optional fields
- MX-check on edit: `POST /api/subcontractors/:id/mx-check` — body `{ email }` — skips re-check if email unchanged and already checked (unless `force: true`)
- The sortable spreadsheet uses `SortableTableHead` component and `sheetSort` state; `sheetSortValue()` helper returns numeric or string values for each sort key
- Stats (RFQ count, quote uploads, accepted count, avg quote, win rate, response rate, last used) are computed client-side in `buildSubStats()` by filtering the loaded `rfqs` array by `subcontractor_id`
- Custom trades stored in `custom_trades` table (loaded alongside subcontractors); trade colour map merges `TRADE_COLORS` (built-in) with custom trade colours
- DB effects on edit: updates `subcontractors` row in-place via Supabase client; email MX result updated via server route

## 12. Edge cases and limits
- The spreadsheet view loads a maximum of 2000 RFQ rows — directories with very high RFQ volumes may see truncated stats
- Deleting a subcontractor is not available in the UI — contact Admin to delete directly in Supabase if needed
- `email_mx_valid` can be `true`, `false`, or `null` (null = never checked); only `false` triggers the warning badge
- Custom trade categories are per-instance — they are not pre-loaded; if the `custom_trades` table is missing, the app silently falls back to built-in trades only
- The "missing info" count tracks: contact, mobile, abn, address — postcode, suburb, and state are not counted

## 13. Owner of the process
Admin  
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run these tests in order. Record pass/fail. Do not mark `test_status: passed` unless all cases pass.

### Pre-test setup
- [ ] Logged in
- [ ] At least 5 subcontractors in the directory across at least 2 different trades
- [ ] At least 1 subcontractor has received an RFQ (has a row in `rfqs` with their `subcontractor_id`)

### Test cases

**TC-01 — Directory table and cards load**
1. Tender Manager -> Subcontractors
2. Expected: page loads with subcontractors visible in Cards view
3. Click **Spreadsheet**
4. Expected: spreadsheet table renders with column headers: Business, Trade, Contact, Email, Mobile, Suburb, RFQs, Uploaded, Accepted, Avg quote, Missing
5. Expected: summary row at top shows correct Total, Showing, Missing info, Trades counts
- [ ] Pass  [ ] Fail

**TC-02 — Search by business name**
1. Type a known subcontractor name (or partial name) into the search bar
2. Expected: only matching subcontractors appear in the view (both cards and sheet filter live as you type)
3. Clear the search
4. Expected: all subcontractors reappear
- [ ] Pass  [ ] Fail

**TC-03 — Filter by trade**
1. Select a specific trade from the "All Trades" dropdown (e.g. "electrical")
2. Expected: only subcontractors with that trade appear
3. Select "All Trades" again
4. Expected: all subcontractors reappear
- [ ] Pass  [ ] Fail

**TC-04 — Sort by business name in Spreadsheet view**
1. Switch to Spreadsheet view; click the **Business** column header
2. Expected: sorts alphabetically A-Z; header shows ▲ icon
3. Click **Business** again
4. Expected: sorts Z-A; header shows ▼ icon
5. Click **RFQs** column header
6. Expected: sorts by RFQ count ascending
- [ ] Pass  [ ] Fail

**TC-05 — Edit a subcontractor's contact details**
1. In Spreadsheet or Cards view, click **Edit** on any subcontractor
2. In the Edit modal, change the Mobile field to "0400 999 888"; click **Save changes**
3. Expected: modal closes; updated mobile appears in the view
4. Expected DB: `mobile = '0400 999 888'` on that subcontractor's row in `subcontractors`
- [ ] Pass  [ ] Fail

**TC-06 — Subcontractor Dashboard with RFQ history**
1. In Spreadsheet view, click the business name of a subcontractor who has received at least one RFQ
2. Expected: Subcontractor Dashboard panel opens
3. Expected: stats show RFQs sent ≥ 1; Recent quotes table shows at least one row with job address, status, and sent date
4. Click the backdrop to close the panel
5. Expected: panel closes; spreadsheet view is still visible
- [ ] Pass  [ ] Fail

**TC-07 — Sort by Trade in Cards view groups by trade**
1. Switch to Cards view; click the **Trade** sort button
2. Expected: cards are grouped under trade section headings; each heading shows the trade name; cards within each group are sorted alphabetically
- [ ] Pass  [ ] Fail

**TC-08 — Edit required field validation**
1. Open Edit modal for any subcontractor
2. Clear the Business Name field; click **Save changes**
3. Expected: error "Business Name, Email and Trade are required."; record not saved
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Cards and spreadsheet both load and render correctly
- [ ] Search filters live across both views
- [ ] Trade filter works and resets
- [ ] Spreadsheet column sorting works (text and numeric)
- [ ] Edit saves to DB and updates UI immediately
- [ ] Subcontractor Dashboard shows real RFQ stats and history
- [ ] Trade sort in Cards view groups correctly
- [ ] Edit validation rejects missing required field
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
