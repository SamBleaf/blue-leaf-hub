---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 04-02: Create an RFQ Package

**Module:** Tender Manager → RFQ Engine (`/tender-manager/rfq-engine`)
**SOP ID:** 04-02
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin (tender coordinators)

## 2. When to use it

When a project is progressing toward tender and you need to request prices from subcontractors. One RFQ package is created per project tender.

The RFQ Engine is a **4-step wizard** that takes you from project details through to sending emails. The package is created automatically when all emails in Step 4 have been dispatched — there is no separate "Create package" button.

## 3. What this does

Starts a new session in the RFQ Engine wizard. The wizard captures project details, runs AI scope extraction on the uploaded documents, lets you review trade scopes and recipients, and then sends one email per subcontractor per trade. At the point the last email is sent, a package record is written to the database and you are navigated to it.

## 4. Before you start

- Know the project address, tender deadline date, and architect or client name
- Have at least one tender document (PDF) ready to upload (optional — you can enter scope manually)
- Subcontractors must be in the register (Settings → Subcontractors) before sending

## 5. Step-by-step process

1. Navigate to **Tender Manager → RFQ Engine** (`/tender-manager/rfq-engine`)
2. If the wizard shows a previous session, click **Start new job** (top right) to clear it
3. The wizard starts on **Step 1 — Documents**:
   - Enter the **Project address** (required)
   - Enter **Project type** (new build / renovation / extension)
   - Enter **Architect / client name**
   - Set the **Tender deadline** (quote-by date)
   - Upload the tender document PDF(s) — drag and drop or click the upload area
4. Click **Next** to proceed to Step 2 — scope extraction runs automatically on upload
5. Review and edit the extracted trade scopes (SOP 04-03 and SOP 04-04 cover this in detail)
6. Click **Next** to Step 3 — assign recipients to each trade
7. Click **Next** to Step 4 — review drafts and send

When all emails in Step 4 are sent, the package record is created and the wizard navigates you to the new package at `/tender-manager/rfq-packages/:packageId`.

> The wizard session auto-saves in `localStorage` so you can leave and return without losing your progress. The furthest step reached is remembered.

## 6. What happens when the package is created

- `rfq_packages` row created with `status = 'active'`
- One `rfqs` row per sent email (trade + subcontractor combination)
- Trade intelligence pre-computed from Buildexact estimate if the job is linked — `estimate_baseline`, `trade_coverage` fields populated
- Session cleared and wizard reset

## 7. Starting from a lead (prefill)

If you open the RFQ Engine via a lead at the Tendering stage, the wizard pre-fills the project address, project type, client name, and suggested trades from the lead data. Upload a PDF to refine the scope further, or enter scope items manually.

## 8. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Not uploading a PDF | Didn't have it ready | You can still enter scope manually in Step 2 — PDFs are optional |
| Navigating away before all emails are sent | Distraction | The session saves, so you can return. No package is created until the last email is sent. |
| Setting tender deadline in the past | Copied wrong date | Verify the deadline is a future date — subcontractors won't know how long they have |

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| Wizard shows a previous session | Click "Start new job" at the top right — this clears the saved session |
| Step 4 shows blocked rows | A recipient is missing an email address. Update it in Settings → Subcontractors, then return. |
| Package not created after sending all emails | All non-blocked rows must be sent. Check for any row still showing "Send this RFQ". |

## 10. Related SOPs

- [Extract Scope with AI](04-03_scope_extraction.md) — SOP 04-03
- [Manage Trade Packages](04-04_trade_packages.md) — SOP 04-04
- [Send RFQ Emails](04-05_send_rfq.md) — SOP 04-05

## 11. Screenshots

[insert screenshot: RFQ Engine wizard Step 1 — document upload and project details]
[insert screenshot: Wizard completed — navigated to package at /tender-manager/rfq-packages/:id]

## 12. Automation notes

- Wizard session: `localStorage` key `blhub_rfq_session` (version 3), carries step, extraction, trades, recipients, deadline, outbound drafts
- Package is created by `POST /api/rfq-packages` triggered from the frontend once the last email in Step 4 sends successfully
- `job_id` is set on the package: a job row is created (or found) from the project address during Step 4 send
- `status` defaults to `'active'`

## 13. Owner of the process

Admin
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup

- [ ] Logged in as Admin
- [ ] At least 1 subcontractor with a valid email in the register
- [ ] A text-based PDF with construction scope content ready to upload

### Test cases

**TC-01 — Start a fresh session (happy path)**
1. Navigate to `/tender-manager/rfq-engine`
2. If a previous session exists, click Start new job and confirm
3. Expected: wizard shows Step 1 with all fields blank

- [ ] Pass  [ ] Fail

**TC-02 — Project details pre-fill from lead**
1. Open a lead at the Tendering stage and click the "Start tender" / RFQ Engine link
2. Expected: wizard opens at Step 1 with project address, project type, and client name pre-filled from the lead
3. Expected: a green banner confirms the pre-fill source
- [ ] Pass  [ ] Fail

**TC-03 — Session persists across navigate-away**
1. Enter a project address and deadline in Step 1
2. Navigate to a different page (e.g. Sales)
3. Return to `/tender-manager/rfq-engine`
4. Expected: wizard lands on the same step with the address and deadline intact
- [ ] Pass  [ ] Fail

**TC-04 — Package created when last email sends**
1. Complete the full wizard (Steps 1-4) with at least 1 trade and 1 subcontractor with a valid test email (sam@blueleafbuilding.com.au)
2. Send all emails in Step 4
3. Expected: wizard navigates to `/tender-manager/rfq-packages/:id` (the new package)
4. Expected: `rfq_packages` row in DB with `status = 'active'` and the correct project address
5. Expected: `rfqs` row(s) with `status = 'sent'` for each sent email
- [ ] Pass  [ ] Fail

**TC-05 — Blocked row does not prevent package creation**
1. Set up Step 4 with one valid recipient and one blocked recipient (missing email)
2. Send the valid recipient's email
3. Expected: blocked row is skipped; package is created once the non-blocked rows are all sent
- [ ] Pass  [ ] Fail

**TC-06 — Feature case: resume via ?resume= query param**
1. After a session has been saved (partially through Step 4), navigate to the package detail and click "Resume RFQ Engine"
2. Expected: wizard opens at Step 4 (or Step 3 if no drafts) with the saved scope, trades, and sent rows already marked ✓ Sent
- [ ] Pass  [ ] Fail

### Post-test checklist

- [ ] Session saves and restores correctly
- [ ] Package created in DB after last email sent
- [ ] rfqs rows created per sent email
- [ ] Wizard resets after package creation
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
