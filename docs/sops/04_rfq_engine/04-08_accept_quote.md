---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_fail
---

# SOP 04-08: Accept a Quote

**Module:** Tender Manager → Quote Tracker → Package Detail (`/tender-manager/rfq-packages/:packageId`)
**SOP ID:** 04-08
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin (tender coordinators)

## 2. When to use it

After comparing quotes (SOP 04-07) and deciding on the winning subcontractor for a trade. Accepting a quote marks that subcontractor as the chosen provider and records the accepted amount against the job.

This SOP covers the acceptance step inside the **Quote Tracker** at `/tender-manager/rfq-packages/:packageId` — not the RFQ Engine wizard.

## 3. What this does

Changes the recipient status from `received` to `accepted`. Mirrors the acceptance to the linked `rfqs` record. The accepted quote amount flows into the job's cost picture.

## 4. Before you start

- The quote must be recorded (status = `received`) — see SOP 04-06
- You must have compared quotes for this trade (SOP 04-07)
- Only accept when you are ready to commit — there is no auto-notification to the subcontractor (notify them separately via phone or email)

## 5. Step-by-step process

1. Navigate to **Tender Manager → Quote Tracker** or go directly to `/tender-manager/rfq-packages`
2. Open the package at `/tender-manager/rfq-packages/:packageId`
3. Expand the trade scope
4. Find the recipient (subcontractor) whose quote you want to accept
5. Click their row to open the **Update quote** panel
6. Change **Status** to `Accepted`
7. Confirm the **Quote amount** is correct (update if needed)
8. Click **Save**

The recipient status changes to `accepted`. The trade scope shows the accepted amount. The coverage score updates.

### Notifying the subcontractor

Accepting a quote in the Hub does **not** send any email to the subcontractor. After accepting:
- Call or email the subcontractor directly to inform them they have been engaged
- Issue a purchase order or subcontract separately if required

## 6. After accepting

- `rfq_recipients.status` → `'accepted'`
- The linked `rfqs.status` → `'accepted'`, `rfqs.quote_amount` confirmed
- Coverage score recalculated: the accepted trade counts toward 100% package coverage
- The accepted quote amount is visible on the trade scope and in the package overview

## 7. One accepted quote per trade

Only one recipient per trade is typically marked `accepted`. The system doesn't enforce this — you can technically mark two as accepted — but doing so will create duplicate cost entries. Mark only the winning subcontractor as `accepted`.

## 8. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Accepting without notifying the subcontractor | Assuming the system notifies | The system does not email the subcontractor on acceptance — you must contact them directly |
| Accepting before checking exclusions | Quote amount looks right | Always check quote exclusions before accepting |
| Accepting two subcontractors for one trade | Accident | Review which recipients are already `accepted` before saving |

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| Coverage score not updating after acceptance | Refresh the package page — coverage is recalculated on the server and the UI updates on reload |
| Accepted amount differs from agreed amount | Open the Update quote panel again and correct the quote_amount before or after accepting |
| Need to un-accept (change of mind) | Change the status back to `received` using the Update quote panel |

## 10. Related SOPs

- [Compare Quotes](04-07_quote_comparison.md) — SOP 04-07
- [Create and Send an Addendum](04-09_addendum.md) — SOP 04-09 (if scope changes after acceptance)

## 11. Screenshots

[insert screenshot: Update quote panel with Status = Accepted and Save button]
[insert screenshot: Trade scope showing Accepted badge and accepted amount]

## 12. Automation notes

- API: `PATCH /api/rfq-packages/:packageId/recipients/:recipientId` with `{ status: "accepted" }`
- Status change to `accepted` mirrors to `rfqs` table: `rfqs.status = 'accepted'`
- Coverage score: `recomputePackageCoverage()` called after each recipient status update
- No email notification is sent when status changes to `accepted` — acceptance is manual/off-system

## 13. Owner of the process

Admin
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup

- [ ] A package exists at `/tender-manager/rfq-packages` with at least 1 trade scope
- [ ] That trade scope has at least 1 recipient with `status = 'received'` and a `quote_amount` set
- [ ] The recipient must have an `rfq_id` set (linked to the rfqs table) — this is set automatically when the RFQ email is sent via the wizard

### Test cases

**TC-01 — Accept a quote (happy path)**
1. Navigate to `/tender-manager/rfq-packages/:packageId`
2. Expand the trade scope with a received quote
3. Click the recipient row to open the Update quote panel
4. Change status to `Accepted`
5. Click Save
6. Expected: recipient badge changes to `Accepted` in the UI
7. Expected DB: `rfq_recipients.status = 'accepted'`
8. Expected DB: `rfqs.status = 'accepted'` (if rfq_id is linked)

- [ ] Pass  [ ] Fail

**TC-02 — Coverage score updates**
1. Note the package coverage score before accepting any quotes (visible in the package header)
2. Accept a quote for one trade
3. Refresh the page
4. Expected: coverage score increases (or updates) after acceptance
- [ ] Pass  [ ] Fail

**TC-03 — Accepted quote amount persists**
1. Accept a quote with amount = $24,500
2. Reload the page
3. Expected: quote amount still shows $24,500 on the recipient row
4. Expected DB: `rfq_recipients.quote_amount = 24500`
- [ ] Pass  [ ] Fail

**TC-04 — Un-accept (status reversal)**
1. Accept a quote (status → accepted)
2. Open the Update quote panel again
3. Change status back to `received`
4. Click Save
5. Expected: status returns to `received` badge in UI
6. Expected DB: `rfq_recipients.status = 'received'`
- [ ] Pass  [ ] Fail

**TC-05 — Accepted shows in comparison table**
1. Have 2 received quotes for a trade, accept one of them
2. Check the comparison table in the trade scope panel
3. Expected: accepted recipient shows `Accepted` badge in the comparison row
4. Expected: the other recipient still shows `received` badge
- [ ] Pass  [ ] Fail

**TC-06 — Feature case: no email sent on acceptance**
1. Accept a quote
2. Check the test email inbox (sam@blueleafbuilding.com.au if used as test address)
3. Expected: NO email received by the subcontractor (acceptance is off-system)
4. Expected: only the `rfq_recipients` and `rfqs` rows updated — no correspondence row created for acceptance
- [ ] Pass  [ ] Fail

### Post-test checklist

- [ ] Acceptance recorded in rfq_recipients
- [ ] rfqs row mirrors the acceptance
- [ ] Coverage score recalculates after acceptance
- [ ] No email sent to subcontractor (by design)
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
