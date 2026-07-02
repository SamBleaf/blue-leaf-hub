---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 04-07: Compare Quotes Side by Side

**Module:** Tender Manager → Quote Tracker → Package Detail (`/tender-manager/rfq-packages/:packageId`)
**SOP ID:** 04-07
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin (tender coordinators)

## 2. When to use it

After receiving 2 or more quotes for a trade scope (SOP 04-06). The comparison view shows all quotes sorted cheapest-first so you can quickly identify the best price and flag any exclusions.

This SOP covers a view inside the **Quote Tracker** at `/tender-manager/rfq-packages/:packageId` — not the RFQ Engine wizard.

## 3. What this does

Displays a table of all received quotes for a trade, sorted by quote amount ascending (lowest first). Shows the subcontractor name, their quoted price, status, and any exclusions they noted.

**What the comparison shows:**

| Column | Description |
|--------|-------------|
| Subcontractor | Business name of the quoting subcontractor |
| Quote amount | The ex-GST amount entered when recording the quote |
| Status | Current status badge (received / accepted / declined) |
| Exclusions | Any exclusions the subcontractor noted |

The lowest quote is listed first. There is no automatic recommendation — the decision to accept is yours.

**Reading the comparison:**

Things to check before accepting the cheapest quote:
- **Exclusions** — does the cheapest quote exclude something significant? A $2k saving is irrelevant if rock excavation adds $15k.
- **Track record** — is this subcontractor reliable? Check their record in Settings → Subcontractors.
- **Status** — a quote with `clarification_required` needs follow-up before it can be accepted.

## 4. Before you start

- At least 2 quotes must be recorded for the same trade scope (status = `received` or `accepted`)
- Open the package at `/tender-manager/rfq-packages/:packageId`

## 5. Step-by-step process

1. Navigate to **Tender Manager → Quote Tracker** (sidebar) or go to `/tender-manager/rfq-packages`
2. Click the package to open it at `/tender-manager/rfq-packages/:packageId`
3. Expand the trade scope with 2 or more received quotes
4. Scroll to the **Quote comparison** section — it appears automatically below the recipients list

The comparison appears automatically when 2 or more recipients have status `received`, `accepted`, or `declined`. There is no button to click — it appears as soon as the data is there.

## 6. What happens next

Once you've identified the best quote, proceed to SOP 04-08 to mark the winning subcontractor as accepted.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Accepting cheapest without checking exclusions | Price looks great | Always read the exclusions column before accepting |
| Comparing before all quotes are in | One sub hasn't replied yet | Check whether you're still waiting on any outstanding quotes |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Comparison table not appearing | You need at least 2 recipients with status `received`, `accepted`, or `declined`. Record both quotes first (SOP 04-06). |
| Only 1 recipient showing in comparison | The other recipient's status may still be `sent` — update their status first. |
| Amounts look wrong | Check amounts were entered ex-GST. If a subcontractor quotes inc-GST, divide by 1.1 before entering. |

## 9. Related SOPs

- [Receive and Record Quotes](04-06_receive_quotes.md) — SOP 04-06
- [Accept a Quote](04-08_accept_quote.md) — SOP 04-08

## 10. Screenshots

[insert screenshot: Trade scope panel showing quote comparison table with 2+ quotes sorted lowest first]

## 11. Automation notes

- No dedicated endpoint — the comparison is computed from the package detail response: `GET /api/rfq-packages/:id`
- Frontend renders comparison when `recipients.filter(r => ["received","accepted","declined"].includes(r.status)).length >= 2`
- Sorted by `quote_amount` ascending (null amounts pushed to the end)
- Comparison visible within a trade scope panel inside the package detail — not at the package list level

## 12. Edge cases and limits
- The comparison only appears with 2 or more recipients at status `received`, `accepted`, or `declined`. A single received quote does not trigger the comparison view.
- Null amounts (e.g. declined quotes with no amount entered) are pushed to the end of the sort order.
- There is no automatic recommendation — the comparison is informational only. The accept action is in SOP 04-08.

## 13. Owner of the process

Admin
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup

- [ ] A package exists at `/tender-manager/rfq-packages` with at least 1 trade scope
- [ ] That trade scope has at least 2 recipients, both with `status = 'received'` and `quote_amount` set
- [ ] Amounts should differ (e.g. $18,400 and $22,000)

### Test cases

**TC-01 — Comparison appears with 2 quotes**
1. Navigate to `/tender-manager/rfq-packages/:packageId`
2. Expand the trade scope with 2 received quotes
3. Scroll to the bottom of the trade scope panel
4. Expected: "Quote comparison" heading appears
5. Expected: both subcontractors listed in the table
6. Expected: lowest quote listed first

- [ ] Pass  [ ] Fail

**TC-02 — Sort order is lowest first**
1. Record quote A = $22,000, quote B = $18,400 for the same trade
2. Open the comparison
3. Expected: quote B ($18,400) appears in row 1
4. Expected: quote A ($22,000) appears in row 2
- [ ] Pass  [ ] Fail

**TC-03 — Comparison not shown with only 1 quote**
1. Ensure a trade scope has exactly 1 received quote
2. Open the package at `/tender-manager/rfq-packages/:packageId` and expand that trade
3. Expected: no "Quote comparison" section visible for that trade
- [ ] Pass  [ ] Fail

**TC-04 — Exclusions shown in table**
1. Record a quote with exclusions = "Excludes rock excavation"
2. Open the comparison view
3. Expected: exclusions text visible in the comparison row for that subcontractor
- [ ] Pass  [ ] Fail

**TC-05 — Declined quotes included in comparison**
1. Record one quote as received ($18,400) and mark a second as declined (no amount)
2. Open the comparison
3. Expected: both appear — the received quote with amount and the declined with no amount (or "—")
- [ ] Pass  [ ] Fail

**TC-06 — Feature case: clarification_required status shows in comparison**
1. Set one recipient status to `clarification_required` (with an amount entered)
2. Expected: that recipient appears in the comparison table with a "Clarification req." status badge
3. Expected: a staff member would know not to accept this quote without resolving the clarification first
- [ ] Pass  [ ] Fail

### Post-test checklist

- [ ] Comparison table appears with 2+ quotes
- [ ] Sort order: lowest amount first
- [ ] Exclusions visible in table
- [ ] Does not appear with only 1 received quote
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
