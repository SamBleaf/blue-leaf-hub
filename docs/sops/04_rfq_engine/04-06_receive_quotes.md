---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 04-06: Receive and Record Quotes

**Module:** Tender Manager → Quote Tracker → Package Detail (`/tender-manager/rfq-packages/:packageId`)
**SOP ID:** 04-06
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin (tender coordinators)

## 2. When to use it

When a subcontractor replies to an RFQ email with a price. Record the quote amount in the Hub immediately when it arrives — don't wait until you have all quotes back.

This SOP covers post-send tracking in the **Quote Tracker**, not the RFQ Engine wizard. After the wizard sends all emails and creates the package, all quote tracking happens at `/tender-manager/rfq-packages/:packageId`.

## 3. What this does

Records the quote amount, any noted exclusions, and optionally uploads the quote PDF against the subcontractor's recipient record on the RFQ package. Updates the recipient status from `sent` to `received`. Automatically sets the received timestamp.

**Recipient status flow:**

| Status | Meaning |
|--------|---------|
| `not_sent` | Assigned but not yet sent |
| `sent` | RFQ email sent, waiting for quote |
| `followed_up` | Follow-up email sent |
| `received` | Quote amount recorded |
| `accepted` | Quote accepted (winning subcontractor) |
| `declined` | Subcontractor declined to quote |
| `no_quote` | No response after follow-ups |
| `clarification_required` | Quote received but needs clarification |

**Sending a reminder:**

If a subcontractor has not replied by the deadline:
1. Open the package at `/tender-manager/rfq-packages/:packageId`
2. Find the overdue recipient row (overdue rows are highlighted)
3. Click **Send reminder** — this sends a follow-up email using the Gmail integration
4. Recipient status changes to `followed_up`
5. The reminder is logged in the correspondence record

> Overdue quotes (past deadline, status = `sent` or `followed_up`) also appear highlighted in the package list at `/tender-manager/rfq-packages`.

## 4. Before you start

- The RFQ must have been sent to this subcontractor (the RFQ Engine wizard, Steps 1-4, must be complete)
- The package must exist at `/tender-manager/rfq-packages`
- Have the quote amount ready (ex-GST)
- Have the quote PDF if the subcontractor emailed one

## 5. Step-by-step process

1. Navigate to **Tender Manager → Quote Tracker** (sidebar) or go directly to `/tender-manager/rfq-packages`
2. Find the job and click the package to open it at `/tender-manager/rfq-packages/:packageId`
3. Find the trade scope the quote relates to — expand it
4. Locate the subcontractor in the recipients list for that trade
5. Click the recipient row to open the **Update quote** panel
6. Set **Status** to `Quote received`
7. Enter the **Quote amount** (ex-GST, numbers only — no $ sign)
8. Enter any **Exclusions noted** from the quote (e.g. "rock excavation, dewatering")
9. Click **Save**

The recipient status updates to `received`, the quote amount is displayed on the trade scope, and the timestamp is recorded automatically.

### Optional: upload the quote PDF

If the subcontractor sent a PDF quote:
1. Use the PDF upload button on the recipient row (if available)
2. The PDF is stored against this recipient record

### Marking as declined or no quote

If a subcontractor explicitly declines or doesn't respond:
1. Open the Update quote panel
2. Set Status to `Declined` or `No quote`
3. Save — no quote amount needed

## 6. What happens next

- `rfq_recipients.status` → `'received'`, `quote_received_at` = now
- `rfq_recipients.quote_amount` = entered amount
- `rfq_trade_scopes.status` → `'received'` (propagated automatically)
- The linked `rfqs` row (legacy quote tracker) is updated: `status = 'received'`, `quote_amount` set
- Coverage score recalculated for the package

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Recording amount incl. GST | Quote PDF shows inc-GST figure | Always enter ex-GST. Divide inc-GST by 1.1 if needed. |
| Not noting exclusions | Feels optional | Exclusions matter at comparison time — "cheapest" quote may have rock excavation excluded |
| Forgetting to update after receiving email | Busy | Record quotes the same day they arrive — comparison view is useless with stale data |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Cannot find the package | Navigate to `/tender-manager/rfq-packages` — the list shows all packages sorted newest-first |
| Status field shows wrong options | Refresh the page — the status list is loaded on mount |
| Quote amount not saving | Check the amount field is a number with no special characters (no $, commas, or spaces) |
| Trade scope status still shows "sent" after update | Refresh the package — status propagation is immediate but the UI may need a reload |

## 9. Related SOPs

- [Send RFQ Emails](04-05_send_rfq.md) — SOP 04-05 (how quotes get sent via the wizard)
- [Compare Quotes](04-07_quote_comparison.md) — SOP 04-07
- [Accept a Quote](04-08_accept_quote.md) — SOP 04-08

## 10. Screenshots

[insert screenshot: Package detail at /tender-manager/rfq-packages/:id showing trade scope with recipient list]
[insert screenshot: Update quote panel with status, amount, and exclusions fields]

## 11. Automation notes

- API: `PATCH /api/rfq-packages/:packageId/recipients/:recipientId`
- Allowed fields: `status`, `quote_amount`, `quote_exclusions`, `quote_pdf_path`, `quote_received_at`, `follow_up_due`, `follow_up_sent_at`
- Auto-sets `quote_received_at = now()` when `status = 'received'` and `quote_received_at` not explicitly provided
- Mirrors to `rfqs` table: `status`, `quote_amount`, `received_at` updated when recipient is linked to an `rfq_id`
- Propagates `status = 'received'` to `rfq_trade_scopes` when recipient status updated
- Reminder: `POST /api/rfq/remind-one` with `{ rfqId, signatureFooter, signatureLogoDataUrl }` — sends via Gmail OAuth

## 12. Edge cases and limits
- `quote_received_at` is auto-set to now when status changes to `received` — you do not need to supply it explicitly.
- Amounts must be entered ex-GST — the system does not convert from inc-GST automatically.
- Reminder emails only go to recipients with status `sent` or `followed_up` — accepted, declined, and received recipients are excluded.
- The unmatched quote emails feature (visible at the bottom of the package list page) allows matching inbound emails from unknown senders to the correct RFQ.

## 13. Owner of the process

Admin
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup

- [ ] A package exists at `/tender-manager/rfq-packages` with at least 1 trade scope that has a recipient with status = `sent`
- [ ] RFQ Engine wizard must have been completed (SOP 04-05) to create the package and sent recipients

### Test cases

**TC-01 — Record quote amount (happy path)**
1. Navigate to `/tender-manager/rfq-packages` and open a package
2. Expand a trade scope with a sent recipient
3. Click the recipient row to open the Update quote panel
4. Set status = `Quote received`, amount = `18400`, exclusions = `"Excludes rock excavation"`
5. Click Save
6. Expected: recipient status badge updates to `Quote received` in the UI
7. Expected: quote amount `$18,400` displayed on the recipient row
8. Expected DB: `rfq_recipients.status = 'received'`, `quote_amount = 18400`, `quote_received_at` set to now
9. Expected DB: `rfq_trade_scopes.status = 'received'`
10. Expected DB: linked `rfqs.status = 'received'`, `rfqs.quote_amount = 18400`

- [ ] Pass  [ ] Fail

**TC-02 — quote_received_at auto-set**
1. Record a quote without providing `quote_received_at` explicitly
2. Expected DB: `rfq_recipients.quote_received_at` is set to current timestamp (not null)
- [ ] Pass  [ ] Fail

**TC-03 — Exclusions saved**
1. Record a quote with exclusions text: "Excludes rock excavation"
2. Expected DB: `rfq_recipients.quote_exclusions` = the entered exclusions text
3. Expected: exclusions text visible on the recipient row in the UI
- [ ] Pass  [ ] Fail

**TC-04 — Mark as declined**
1. Open a sent recipient
2. Set status = `Declined`, no amount entered
3. Save
4. Expected: status shows `Declined` badge in UI
5. Expected DB: `rfq_recipients.status = 'declined'`, `quote_amount` is null
- [ ] Pass  [ ] Fail

**TC-05 — Send reminder to overdue recipient**
1. Find a recipient with status = `sent` and a deadline in the past (overdue)
2. Expected: recipient row is highlighted as overdue
3. Click **Send reminder**
4. Expected: follow-up email sent (check sam@blueleafbuilding.com.au if using a test subcontractor)
5. Expected DB: `rfq_recipients.status = 'followed_up'`, `follow_up_sent_at` set to now
- [ ] Pass  [ ] Fail

**TC-06 — Feature case: unmatched quote email**
1. Navigate to the bottom of the Quote Tracker package list page
2. Expected: if any unmatched quote emails exist (emails that arrived from unknown senders), they appear in the "Unmatched quotes" section
3. Click Match to job, select the correct job and RFQ, click Match
4. Expected: the unmatched row is resolved and the quote is linked to the correct RFQ
- [ ] Pass  [ ] Fail

### Post-test checklist

- [ ] Quote amount records correctly
- [ ] quote_received_at auto-set
- [ ] Trade scope status propagates to received
- [ ] rfqs row mirrors the update
- [ ] Reminder email sends and status updates to followed_up
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
