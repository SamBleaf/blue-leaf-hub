---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 04-06: Receive and Record Quotes

**Module:** Tender Manager → RFQ Engine → Package Detail → Trade Scope  
**SOP ID:** 04-06  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin (tender coordinators)

## 2. When to use it
When a subcontractor replies to an RFQ email with a price. Record the quote amount in the Hub immediately when it arrives — don't wait until you have all quotes back.

## 3. What this does
Records the quote amount, any noted exclusions, and optionally uploads the quote PDF against the subcontractor's recipient record. Updates the recipient status from `sent` to `received`. Automatically sets the received timestamp.

## 4. Before you start
- The RFQ must have been sent to this subcontractor (status = `sent` or `followed_up`)
- Have the quote amount ready (ex-GST)
- Have the quote PDF if the subcontractor emailed one

## 5. Step-by-step process

1. Open the RFQ package
2. Find the trade scope the quote relates to
3. Locate the subcontractor in the recipients list for that trade
4. Click the recipient row to open the **Update quote** panel
5. Set **Status** to `Quote received`
6. Enter the **Quote amount** (ex-GST, numbers only — no $ sign)
7. Enter any **Exclusions noted** from the quote (e.g. "rock excavation, dewatering")
8. Click **Save**

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

## 6. Recipient status flow

| Status | Meaning |
|--------|---------|
| `draft` | Assigned but not yet sent |
| `sent` | RFQ email sent, waiting for quote |
| `followed_up` | Follow-up email sent |
| `received` | Quote amount recorded |
| `accepted` | Quote accepted (winning subcontractor) |
| `declined` | Subcontractor declined to quote |
| `no_quote` | No response after follow-ups |
| `clarification_required` | Quote received but needs clarification |

## 7. After recording

- `rfq_recipients.status` → `'received'`, `quote_received_at` = now
- `rfq_recipients.quote_amount` = entered amount
- `rfq_trade_scopes.status` → `'received'` (propagated automatically)
- The linked `rfqs` row (legacy quote tracker) is updated: `status = 'received'`, `quote_amount` set
- Coverage score recalculated for the package

## 8. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Recording amount incl. GST | Quote PDF shows inc-GST figure | Always enter ex-GST. Divide inc-GST by 1.1 if needed. |
| Not noting exclusions | Feels optional | Exclusions matter at comparison time — "cheapest" quote may have rock excavation excluded |
| Forgetting to update after receiving email | Busy | Record quotes the same day they arrive — comparison view is useless with stale data |

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| Status field shows wrong options | Refresh the page — the status list is loaded on mount |
| Quote amount not saving | Check the amount field is a number with no special characters (no $, commas, or spaces) |
| Trade scope status still shows "sent" after update | Refresh the package — status propagation is immediate but the UI may need a reload |

## 10. Automation notes
- API: `PATCH /api/rfq-packages/:packageId/recipients/:recipientId`
- Allowed fields: `status`, `quote_amount`, `quote_exclusions`, `quote_pdf_path`, `quote_received_at`, `follow_up_due`, `follow_up_sent_at`
- Auto-sets `quote_received_at = now()` when `status = 'received'` and `quote_received_at` not explicitly provided
- Mirrors to `rfqs` table: `status`, `quote_amount`, `received_at` updated when recipient linked to an `rfq_id`
- Propagates `status = 'received'` to `rfq_trade_scopes` when recipient status updated to received

## 11. Owner of the process
Admin  
Next review: 2026-11-30

---

## 12. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] An RFQ package with at least 1 trade scope that has been sent to a recipient
- [ ] Recipient status = `sent` (email has been sent)

### Test cases

**TC-01 — Record quote amount (happy path)**
1. Open a trade scope with a sent recipient
2. Click the recipient row to open Update quote
3. Set status = `Quote received`, amount = `18400`, exclusions = `"Excludes rock excavation"`
4. Click Save
5. Expected: recipient status updates to `received` in the UI
6. Expected: quote amount `$18,400` displayed on the recipient row
7. Expected DB: `rfq_recipients.status = 'received'`, `quote_amount = 18400`, `quote_received_at` is set to now
8. Expected DB: `rfq_trade_scopes.status = 'received'`
9. Expected DB: linked `rfqs.status = 'received'`, `rfqs.quote_amount = 18400`
- [ ] Pass  [ ] Fail

**TC-02 — quote_received_at auto-set**
1. Record a quote without providing quote_received_at explicitly
2. Expected DB: `rfq_recipients.quote_received_at` is set to current timestamp (not null)
- [ ] Pass  [ ] Fail

**TC-03 — Exclusions saved**
1. Record a quote with exclusions text
2. Expected DB: `rfq_recipients.quote_exclusions` = the entered exclusions text
- [ ] Pass  [ ] Fail

**TC-04 — Mark as declined**
1. Open a sent recipient
2. Set status = `Declined`, no amount entered
3. Save
4. Expected: status shows `Declined` in UI
5. Expected DB: `rfq_recipients.status = 'declined'`, `quote_amount` is null
- [ ] Pass  [ ] Fail

**TC-05 — Quote comparison appears with 2+ quotes**
1. Record quotes from 2 different recipients on the same trade scope
2. Expected: "Quote comparison" table appears below the recipients list on that trade
3. Expected: both quotes shown, sorted lowest first
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Quote amount records correctly
- [ ] quote_received_at auto-set
- [ ] Trade scope status propagates to received
- [ ] rfqs row mirrors the update
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
