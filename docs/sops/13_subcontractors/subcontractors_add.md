---
sop_version: 1.0
last_reviewed: 2026-05-30
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
Creates a new subcontractor record in the directory. The subcontractor can then be selected when sending RFQs, issuing purchase orders, and uploading compliance documents.

## 4. Before you start
- You have the subcontractor's business name, trade type, contact name, and contact details
- Optionally: ABN, licence number, and email address
- You are logged in as Admin

## 5. Step-by-step process

1. Go to **RFQ Engine** -> **Subcontractors** tab
2. Click **+ Add Subcontractor**
3. Fill in:
   - **Business name** (required)
   - **Trade type** (required) — e.g. Concreting, Framing, Electrical, Plumbing
   - **Contact name** — the person you deal with
   - **Email address** — used for sending RFQs
   - **Phone number**
   - **ABN** — 11-digit Australian Business Number
   - **Licence number** (if applicable)
4. Click **Save**
5. The subcontractor appears in the directory and is available for selection in RFQ packages

## 6. What happens after
- A record is created in the `subcontractors` table
- The subcontractor is immediately available in all RFQ, PO, and WHS screens
- You can add them to RFQ packages and upload their compliance documents

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Duplicate entries for the same subcontractor | Two team members add the same person | Search the directory first (SOP 13-03) to check they don't already exist |
| No email address | Skipping optional fields | Without an email, you cannot send RFQs to this subcontractor through the system — add it |
| Wrong trade type | Selecting the closest option | Use the correct trade type — it affects which subcontractors appear in RFQ package selection |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Save fails with "Business name required" | Business name field is mandatory — ensure it is filled in |
| Subcontractor not appearing in RFQ selection | Check the trade type — the RFQ filter shows only matching trades |
| Duplicate subcontractor created | Use SOP 13-03 to search and merge or delete the duplicate |

## 9. Related SOPs
- [Import subcontractors from a spreadsheet](subcontractors_import_csv.md) — SOP 13-02
- [Search and manage the subcontractor directory](subcontractors_manage.md) — SOP 13-03

## 10. Automation notes
- Subcontractor CRUD exists in `module4Routes.mjs` (RFQ engine)
- API: subcontractor create (POST to the subcontractor endpoint in module4Routes)
- API: `POST /api/subcontractor/lookup` — search subcontractor directory by trade/name/ABN
- DB effects: inserts row into `subcontractors` table with `business_name`, `trade`, `contact_name`, `email`, `phone`, `abn`, `licence_number`, `created_at`

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] RFQ Engine -> Subcontractors tab accessible

### Test cases

**TC-01 — Add a subcontractor (happy path)**
1. RFQ Engine -> Subcontractors -> + Add Subcontractor
2. Enter: Business name "Smith Concreting Pty Ltd", Trade "Concreting", Email "smith@example.com", Phone "0400 000 001", ABN "12 345 678 901"
3. Click Save
4. Expected: subcontractor appears in the directory list
5. Expected DB: new row in `subcontractors` table with correct fields
- [ ] Pass  [ ] Fail

**TC-02 — Subcontractor available in RFQ selection**
1. After TC-01, create or open an RFQ package for the Concreting trade
2. Expected: "Smith Concreting Pty Ltd" appears in the subcontractor selection list
- [ ] Pass  [ ] Fail

**TC-03 — Missing business name rejected**
1. Attempt to save a subcontractor with no business name
2. Expected: HTTP 400 with plain English error "Business name required"
- [ ] Pass  [ ] Fail

**TC-04 — Subcontractor searchable by name**
1. Use `POST /api/subcontractor/lookup` with `{ query: 'Smith' }`
2. Expected: returns array including "Smith Concreting Pty Ltd"
- [ ] Pass  [ ] Fail

**TC-05 — Subcontractor searchable by trade**
1. Use lookup with `{ trade: 'Concreting' }`
2. Expected: returns only Concreting trade subcontractors including the new entry
- [ ] Pass  [ ] Fail

**TC-06 — Subcontractor with no email saves successfully**
1. Add a subcontractor with all fields except email
2. Expected: save succeeds (email is optional)
3. Expected DB: `email` is NULL on the row
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Subcontractor created and visible in directory
- [ ] Available in RFQ selection filtered by trade
- [ ] Searchable by name and trade
- [ ] Missing business name rejected
- [ ] Optional email allows save
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
