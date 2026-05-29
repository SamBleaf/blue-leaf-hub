---
sop_version: 1.0
last_reviewed: 2026-05-30
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 04-07: Compare Quotes Side by Side

**Module:** Tender Manager → RFQ Engine → Package Detail → Trade Scope  
**SOP ID:** 04-07  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin (tender coordinators)

## 2. When to use it
After receiving 2 or more quotes for a trade scope. The comparison view shows all quotes sorted cheapest-first so you can quickly identify the best price and flag any exclusions.

## 3. What this does
Displays a side-by-side table of all received quotes for a trade, sorted by quote amount ascending (lowest first). Shows the subcontractor name, their quoted price, status, and any exclusions they noted.

## 4. Before you start
- At least 2 quotes must be recorded for the same trade scope (status = `received` or `accepted`)

## 5. How to view the comparison

1. Open the RFQ package
2. Open the trade scope with 2 or more received quotes
3. Scroll to the **Quote comparison** section — it appears automatically below the recipients list
4. The table shows all received/accepted/declined quotes sorted lowest first

The comparison appears automatically when 2 or more recipients have status `received`, `accepted`, or `declined`. There is no button to click — it appears as soon as the data is there.

## 6. What the comparison shows

| Column | Description |
|--------|-------------|
| Subcontractor | Business name of the quoting subcontractor |
| Quote amount | The ex-GST amount entered when recording the quote |
| Status | Current status badge (received / accepted / declined) |
| Exclusions | Any exclusions the subcontractor noted |

The lowest quote is listed first. There is no automatic recommendation — the decision to accept is yours.

## 7. Reading the comparison

Things to check before accepting the cheapest quote:
- **Exclusions** — does the cheapest quote exclude something significant? A $2k saving is irrelevant if rock excavation adds $15k.
- **Track record** — is this subcontractor reliable? Check their record in the Subcontractors register.
- **Status** — a quote with `clarification_required` needs follow-up before it can be accepted.

## 8. After comparing

Once you've identified the best quote, proceed to SOP 04-08 (Accept a Quote) to mark the winning subcontractor.

## 9. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Accepting cheapest without checking exclusions | Price looks great | Always read the exclusions column before accepting |
| Comparing before all quotes are in | One sub hasn't replied yet | Check whether you're still waiting on any outstanding quotes |

## 10. Troubleshooting

| Problem | Solution |
|---------|----------|
| Comparison table not appearing | You need at least 2 recipients with status `received`, `accepted`, or `declined`. Record both quotes first. |
| Only 1 recipient showing in comparison | The other recipient's status may still be `sent` — update their status first. |
| Amounts look wrong | Check amounts were entered ex-GST. If a subcontractor quotes inc-GST, divide by 1.1 before entering. |

## 11. Automation notes
- No dedicated endpoint — the comparison is computed from the package detail response: `GET /api/rfq-packages/:id`
- Frontend renders comparison when `recipients.filter(r => ["received","accepted","declined"].includes(r.status)).length > 1`
- Sorted by `quote_amount` ascending (null amounts pushed to the end)
- Comparison only visible within a trade scope panel — not at the package level

## 12. Owner of the process
Admin  
Next review: 2026-11-30

---

## 13. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] An RFQ trade scope with at least 2 recipients, both with `status = 'received'` and `quote_amount` set
- [ ] Amounts should differ (e.g. $18,400 and $22,000)

### Test cases

**TC-01 — Comparison appears with 2 quotes**
1. Open a trade scope with 2 received quotes
2. Scroll to bottom of the trade scope panel
3. Expected: "Quote comparison" heading appears
4. Expected: both subcontractors listed in the table
5. Expected: lowest quote listed first
- [ ] Pass  [ ] Fail

**TC-02 — Sort order is lowest first**
1. Record quote A = $22,000, quote B = $18,400
2. Expected: quote B ($18,400) appears in row 1 of the comparison table
3. Expected: quote A ($22,000) appears in row 2
- [ ] Pass  [ ] Fail

**TC-03 — Comparison not shown with only 1 quote**
1. Ensure a trade scope has exactly 1 received quote
2. Expected: no "Quote comparison" section visible for that trade
- [ ] Pass  [ ] Fail

**TC-04 — Exclusions shown in table**
1. Record a quote with exclusions = "Excludes rock excavation"
2. Open the comparison view
3. Expected: exclusions text visible in the comparison row for that subcontractor
- [ ] Pass  [ ] Fail

**TC-05 — Declined quotes included in comparison**
1. Record one quote as received ($18,400) and mark a second as declined (no amount)
2. Expected: comparison table shows both — the received quote with amount and the declined with no amount
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Comparison table appears with 2+ quotes
- [ ] Sort order: lowest amount first
- [ ] Exclusions visible
- [ ] Does not appear with only 1 received quote
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
