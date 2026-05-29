---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 04-04: Manage Trade Packages

**Module:** Tender Manager → RFQ Engine → Package Detail → Trade Scopes  
**SOP ID:** 04-04  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin (tender coordinators)

## 2. When to use it
After scope extraction (or manually creating trade scopes), before sending RFQ emails. Use this to review, edit, and finalise each trade scope and to assign which subcontractors will receive each trade's RFQ.

## 3. What a trade scope contains

| Field | Description |
|-------|-------------|
| Trade | Which trade (concrete, frame, electrical, etc.) |
| Scope of works | Bullet points listing what is included |
| Exclusions | What is explicitly excluded |
| Questions | Specific questions for the subcontractor to answer |
| Contractor notes | Any special instructions |
| Due date | When the quote is required by |
| Recipients | Which subcontractors are invited to quote |

## 4. Editing a trade scope

1. Open the RFQ package
2. Click on a trade scope to expand it or open its detail view
3. Edit the fields directly:
   - Add, remove, or reorder scope bullet points
   - Add exclusions (e.g. "Excludes all PC items")
   - Add questions (e.g. "Please provide separate rates for suspended slab")
4. Save changes

## 5. Adding a trade scope manually

If a trade was not picked up by AI extraction:
1. Click **+ Add trade**
2. Select the trade type
3. Enter scope bullet points manually
4. Save

## 6. Assigning subcontractors to a trade

1. In the trade scope detail, click **+ Add recipient** or **Assign subcontractors**
2. Search the subcontractor register (or type a name/email)
3. Select one or more subcontractors
4. They appear in the Recipients list for this trade scope with status `draft` (not yet sent)

## 7. Reviewing send-readiness

Before sending (SOP 04-05), each trade scope must be:
- ✅ Scope of works: at least 1 bullet point
- ✅ Recipients: at least 1 subcontractor assigned
- ✅ Due date: set

The system checks these conditions and will warn if a scope is not ready to send.

## 8. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Sending scope without review | Trusting the extraction | Always read the scope items — the AI may have duplicated items or missed key work |
| Not adding exclusions | Seemed optional | Exclusions protect you from scope disputes. Be explicit about what is excluded. |
| Assigning the same subcontractor to 10 trades | Batch adding | Only assign subcontractors who actually do that trade |

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| Trade scope missing after extraction | Some trades may not have been detected — add manually (+ Add trade) |
| Subcontractor not in the search | They may not be in the subcontractor register — add them in Settings → Subcontractors first |
| Scope items duplicated | This can happen with multi-page PDFs — delete duplicates manually |

## 10. Automation notes
- Trade scope update: `PATCH /api/rfq-packages/:packageId/scopes/:tradeId`
- Add trade scope: `POST /api/rfq-packages/:packageId/scopes`
- Recipients are stored in `rfq_recipients` table linked to the trade scope
- Send-readiness check runs server-side before email dispatch: scope_bullets length > 0, at least 1 recipient, due_date not null

## 11. Owner of the process
Admin  
Next review: 2026-11-29

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] An RFQ package with at least 1 extracted trade scope
- [ ] At least 1 subcontractor in the subcontractor register

### Test cases

**TC-01 — Edit scope bullet points**
1. Open a trade scope
2. Add a new bullet point: "Provide all formwork and propping"
3. Save
4. Expected DB: `rfq_trade_scopes.scope_bullets` array includes the new item
- [ ] Pass  [ ] Fail

**TC-02 — Add a subcontractor recipient**
1. In a trade scope, click + Add recipient
2. Search for and select a subcontractor from the register
3. Expected: subcontractor appears in the recipients list for this trade
4. Expected DB: `rfq_recipients` row with `status = 'draft'` (or 'pending')
- [ ] Pass  [ ] Fail

**TC-03 — Add trade scope manually**
1. On an RFQ package, click + Add trade
2. Select trade = "Electrical & Data"
3. Add 2 scope bullet points
4. Save
5. Expected: new trade scope appears in the package
6. Expected DB: `rfq_trade_scopes` row created for this package and trade
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Scope editing saves correctly
- [ ] Recipients can be added
- [ ] Manual trade scopes can be created
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
