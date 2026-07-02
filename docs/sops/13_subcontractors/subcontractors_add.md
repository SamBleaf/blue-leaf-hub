---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 13-01: Add a Subcontractor to the Directory

**Module:** RFQ Engine — Subcontractors  
**SOP ID:** 13-01  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin staff and estimators who manage the subcontractor register.

## 2. When to use it
When a new subcontractor makes contact, when you find a new trade supplier you want to keep on record, or when preparing to send an RFQ to a trade who is not yet in the system.

## 3. What this does
Creates a new subcontractor record in the directory. The subcontractor can then be selected when sending RFQs, issuing purchase orders, and uploading compliance documents. The system uses AI to look up additional details (contact name, mobile, ABN, address) from the web before saving.

## 4. Before you start
- You have the subcontractor's business name, email address, and trade type
- You are logged in

## 5. Step-by-step process

1. Go to **Tender Manager** -> **Subcontractors** in the sidebar
2. Click the **+** button (top right) to open the add menu
3. Click **Add Subcontractor**
4. Fill in the **Required Fields** section:
   - **Business Name** (required) — the full trading name, e.g. "Andrew Evans Plumbing"
   - **Email** (required) — the address used to send RFQs; must be valid
   - **Trade** (required) — select from the dropdown, e.g. plumbing, electrical, painting
5. Optionally fill in the **Optional** section: Contact Name, Mobile, ABN, Address, Suburb, Postcode, State — or leave blank and let AI find them
6. Click **Find Details with AI** — the system searches the web for the contact name, mobile, ABN, and address
7. Review the **Confirm Details** screen — AI-suggested fields are highlighted in green; fields the AI could not find are marked amber
8. Click **Edit before saving** if you need to correct anything, or click **Looks good — Save** to create the record
9. The subcontractor appears in the directory immediately

> The email domain is automatically MX-checked after save. If the domain cannot receive email, a warning alert appears — update the email address before sending RFQs.

## 6. What happens next
- A record is created in the `subcontractors` table with fields: `business_name`, `email`, `trade`, `contact`, `mobile`, `abn`, `address`, `suburb`, `state`, `postcode`, `created_at`
- An MX-check runs on the email domain; result stored in `email_mx_valid` and `email_mx_checked_at`
- The subcontractor is immediately available in all RFQ, PO, and WHS screens
- If `email_mx_valid = false`, a red "Undeliverable email" badge appears on the card and in the spreadsheet view

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Duplicate entries for the same subcontractor | Two team members add the same person | Search the directory first (SOP 13-03) to check they don't already exist |
| No email address | Treating email as optional | Email is required — without it you cannot send RFQs or trigger the AI lookup |
| Wrong trade type | Selecting the closest option | Use the correct trade type — it affects which subcontractors appear in RFQ package selection |
| Skipping the AI lookup step | Clicking Save prematurely | Click "Find Details with AI" before saving so the system can fill in the contact and ABN automatically |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Save fails with "Business Name, Email and Trade are required" | All three required fields must be filled before saving |
| "Find Details with AI" button is greyed out | Business Name and Email must both be filled first |
| AI lookup fails or finds nothing | Check your internet connection; fill in optional fields manually and save |
| Subcontractor not appearing in RFQ selection | Check the trade type — the RFQ filter shows only matching trades |
| Duplicate subcontractor created | Use SOP 13-03 to search and merge or delete the duplicate |
| "Undeliverable email" warning after save | The email domain failed MX check — confirm the address with the subcontractor before sending RFQs |

## 9. Related modules
- [Import subcontractors from a spreadsheet](subcontractors_import_csv.md) — SOP 13-02
- [Search and manage the subcontractor directory](subcontractors_manage.md) — SOP 13-03

## 10. Screenshot placeholders
[insert screenshot: Subcontractors page with the + button and add menu visible]
[insert screenshot: Add Subcontractor modal — Required Fields section with Business Name, Email, and Trade filled]
[insert screenshot: Confirm Details screen showing AI-suggested fields highlighted in green]

## 11. Automation notes
- Subcontractor CRUD stored directly via Supabase client (not through an Express route): `supabase.from("subcontractors").insert(payload)`
- AI lookup: `POST /api/subcontractor/lookup` — body `{ business_name, email, trade, suburb, state }` — calls Claude with web_search tool; returns `{ contact, mobile, abn, address, suburb, postcode, state, could_not_find[] }`
- MX check: `POST /api/subcontractors/:id/mx-check` — body `{ email }` — runs DNS MX lookup; updates `email_mx_valid` and `email_mx_checked_at` on the row
- DB effects: inserts row into `subcontractors` table; `email_mx_valid` updated asynchronously after save (never blocks save)
- No email or notification is sent on create

## 12. Edge cases and limits
- If the AI cannot find any optional details, the "could not find" amber badges appear — the record can still be saved with only the three required fields
- If the user fills in optional fields manually before clicking "Find Details with AI", their entries take priority over AI suggestions
- Saving with a blank optional field stores NULL in the database — optional fields can always be added later via Edit (SOP 13-03)
- If the same business name already exists, no duplicate guard is enforced at the DB level — staff must check manually first (SOP 13-03)
- The trade dropdown combines the built-in trade list (BASE_TRADES) and any custom trade categories added via "Add Trade Category"

## 13. Owner of the process
Admin  
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run these tests in order. Record pass/fail. Do not mark `test_status: passed` unless all cases pass.

### Pre-test setup
- [ ] Logged in (any role)
- [ ] Subcontractors page accessible via Tender Manager -> Subcontractors
- [ ] At least one trade exists in the trade dropdown (baseline trades are hard-coded)

### Test cases

**TC-01 — Add a subcontractor via AI lookup (happy path)**
1. Tender Manager -> Subcontractors -> click **+** -> **Add Subcontractor**
2. Enter: Business Name "Smith Plumbing Pty Ltd", Email "admin@smithplumbing.com.au", Trade "plumbing"
3. Click **Find Details with AI**
4. Expected: Confirm Details screen appears; required fields show the entered values; AI-suggested optional fields show green highlights (or amber "could not find" if AI could not locate them)
5. Click **Looks good — Save**
6. Expected: modal closes; subcontractor appears in the directory
7. Expected DB: new row in `subcontractors` with `business_name = 'Smith Plumbing Pty Ltd'`, `email = 'admin@smithplumbing.com.au'`, `trade = 'plumbing'`
- [ ] Pass  [ ] Fail

**TC-02 — Missing required field rejected**
1. Open Add Subcontractor modal
2. Enter Business Name only; leave Email and Trade blank
3. Click **Find Details with AI**
4. Expected: error "Please fill in Business Name and Email first" (Email is also required for lookup)
5. Fill Email but not Trade; click **Find Details with AI** -> proceeds to confirm step
6. Click **Looks good — Save**
7. Expected: error "Business Name, Email and Trade are required before saving" and step reverts to form
8. Expected DB: no new row created
- [ ] Pass  [ ] Fail

**TC-03 — AI lookup with no internet / API key missing**
1. (Simulate by using a gibberish business name unlikely to appear online)
2. Open Add Subcontractor; fill required fields; click **Find Details with AI**
3. Expected: Confirm Details screen shows amber "Could not find" on optional fields; no crash
4. Expected: user can still click **Looks good — Save** and record saves successfully
- [ ] Pass  [ ] Fail

**TC-04 — MX check on save**
1. Add a subcontractor with a known-invalid email domain (e.g. "test@thisdoesnotexist-blhsop.com.au")
2. Save the record
3. Expected: a browser alert appears: "Saved. This email domain can't receive mail — double-check the address before sending RFQs to it."
4. Expected DB: `email_mx_valid = false` on the new row
5. Expected UI: "Undeliverable email" badge visible on the subcontractor card
- [ ] Pass  [ ] Fail

**TC-05 — Subcontractor immediately available in RFQ selection**
1. After TC-01, open RFQ Engine and create or open an RFQ package for the plumbing trade
2. Expected: "Smith Plumbing Pty Ltd" appears in the subcontractor selection list for that trade
- [ ] Pass  [ ] Fail

**TC-06 — Edit before saving on confirm screen**
1. Open Add Subcontractor modal; fill required fields; click **Find Details with AI**
2. On Confirm Details screen, click **Edit before saving**
3. Expected: form step is shown again with original values preserved
4. Update the Contact Name manually; click **Find Details with AI** again
5. Expected: Confirm Details shows the manually entered Contact Name (not overwritten by AI)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Record created and visible in directory
- [ ] Required field validation works on both lookup and save
- [ ] AI failure gracefully shows amber badges and still allows save
- [ ] MX check triggers after save and badge shows on card
- [ ] Record available in RFQ trade filter immediately after add
- [ ] Edit before saving preserves manually entered values
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
