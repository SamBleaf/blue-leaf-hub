---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP 04-04: Manage Trade Packages

**Module:** Tender Manager → RFQ Engine (`/tender-manager/rfq-engine`) — Step 2 & Step 3
**SOP ID:** 04-04
**Status:** Draft
**Priority:** High

---

## 1. Who uses this

Admin (tender coordinators)

## 2. When to use it

After scope extraction (Step 2), before sending RFQ emails (Step 4). Use this to:
- Review and edit each trade scope (Step 2)
- Toggle which trades will be sent (Step 2)
- Assign which subcontractors receive each trade's RFQ (Step 3)

Everything in this SOP happens inside the RFQ Engine wizard at `/tender-manager/rfq-engine`. The wizard holds these as draft state — no records are written to the database until emails are sent in Step 4.

## 3. What a trade scope contains

| Field | Description |
|-------|-------------|
| Trade | Which trade (concrete, frame, electrical, etc.) |
| Scope bullet points | Items listing what is included |
| Exclusions | What is explicitly excluded |
| Questions | Specific questions for the subcontractor to answer |
| Contractor notes | Any special instructions |

The deadline (quote-by date) is set once for the whole package in Step 1 — it applies to all trades.

## 4. Step 2 — Editing trade scopes

1. Navigate to the RFQ Engine wizard at `/tender-manager/rfq-engine` and proceed to **Step 2**
2. The left column lists all detected trades — tick or untick each trade to include or exclude it from the package
3. Click a trade to expand its scope and see extracted bullet points
4. Edit the scope:
   - Add new bullet points using the text input
   - Delete items that don't belong to this trade
   - Edit existing bullet points inline
5. Add exclusions in the **Exclusions** field (e.g. "Excludes all PC items")
6. Add questions in the **Questions** field (e.g. "Please provide separate rates for suspended slab")

The trade intelligence panel (right side, if a Buildexact estimate is linked) shows the estimated cost baseline and flags trades where the scope appears thin or missing.

## 5. Manually adding a trade

If a trade was not detected by AI extraction:
1. Click **+ Add trade** on Step 2
2. Select the trade type from the list
3. Enter scope bullet points manually
4. Save — the trade appears in the list

## 6. Step 3 — Assigning recipients

1. Proceed to **Step 3** in the wizard
2. Each selected trade shows the subcontractors from the register who do that trade
3. Recipients are pre-ticked if they have a valid email address
4. Tick or untick each subcontractor for each trade
5. To add a subcontractor not in the list, they must first be added via Settings → Subcontractors

Any recipient missing an email address shows a blocked badge — their row cannot be sent until the email is added.

## 7. Send-readiness

Before sending (Step 4), each trade scope must have:
- At least 1 scope bullet point
- At least 1 recipient assigned (with a valid email address)

Blocked rows (missing email) can still be skipped — the package will be created once all non-blocked rows are sent.

## 8. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Sending scope without review | Trusting the extraction | Always read the bullet points — the AI may have duplicated items or missed key work |
| Not adding exclusions | Seemed optional | Exclusions protect you from scope disputes. Be explicit about what is excluded. |
| Including a trade but leaving it with no bullet points | Forgot to fill in manually | If a trade shows 0 bullet points, either add scope manually or untick the trade |

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| Trade scope missing after extraction | Some trades may not have been detected — add manually using + Add trade |
| Subcontractor not in the list on Step 3 | They may not be in the register — add them in Settings → Subcontractors first |
| Scope items duplicated | This can happen with multi-page PDFs — delete duplicates manually on Step 2 |

## 10. Related SOPs

- [Extract Scope with AI](04-03_scope_extraction.md) — SOP 04-03
- [Send RFQ Emails](04-05_send_rfq.md) — SOP 04-05

## 11. Screenshots

[insert screenshot: Step 2 trade list with checkboxes and trade scope edit panel]
[insert screenshot: Step 3 recipient assignment per trade]

## 12. Automation notes

- Trade scopes and recipients are held in wizard state (no DB writes until Step 4 send)
- Wizard state persisted in `localStorage` (`blhub_rfq_session`): `selectedTrades` (Set), `tradeRecipients` (map of tradeId → [subId])
- `buildOutboundRows()` in `RfqEngine.jsx` computes one draft per (trade, subcontractor) pair — called when leaving Step 3 to Step 4
- Send-readiness check: `validateRfqReadiness()` from `rfqScopePipeline.js` — scope_bullets.length > 0, at least 1 recipient with email
- Trade intelligence pre-computation: `fetchMergedTradePlan()` — merges Buildexact estimate with AI enrichment, visible in Step 2 side panel

## 13. Owner of the process

Admin
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup

- [ ] RFQ Engine wizard at Step 2 with at least 2 extracted trade scopes
- [ ] At least 2 subcontractors in the register (Settings → Subcontractors), at least 1 with a valid email

### Test cases

**TC-01 — Edit scope bullet points**
1. On Step 2, click a trade scope (e.g. Concrete)
2. Add a new bullet point: "Provide all formwork and propping"
3. Navigate to Step 3 and back to Step 2
4. Expected: the added bullet point is still present for that trade
- [ ] Pass  [ ] Fail

**TC-02 — Toggle a trade off**
1. On Step 2, untick a trade that was previously selected
2. Proceed to Step 3
3. Expected: that trade does not appear in the recipients list on Step 3
4. Expected: no outbound draft row is created for that trade on Step 4
- [ ] Pass  [ ] Fail

**TC-03 — Add trade scope manually**
1. On Step 2, click + Add trade
2. Select trade = "Electrical & Data"
3. Add 2 scope bullet points
4. Proceed to Step 4
5. Expected: Electrical & Data appears as a draft row in Step 4 for each recipient assigned in Step 3
- [ ] Pass  [ ] Fail

**TC-04 — Assign a subcontractor on Step 3**
1. On Step 3, find a trade with no recipients ticked
2. Tick a subcontractor for that trade
3. Proceed to Step 4
4. Expected: a draft row exists for that (trade, subcontractor) combination
- [ ] Pass  [ ] Fail

**TC-05 — Blocked row shown for missing email**
1. Ensure a subcontractor in the register has no email address
2. Tick that subcontractor for a trade in Step 3
3. Proceed to Step 4
4. Expected: that subcontractor appears as a blocked row with "Missing email — update in Subcontractors"
5. Expected: the blocked row cannot be sent (no Send button)
- [ ] Pass  [ ] Fail

**TC-06 — Feature case: trade intelligence panel shows estimate baseline**
1. On Step 2, if the job is linked to a Buildexact estimate, expand a trade scope
2. Expected: a side panel or inset shows the estimated cost range and coverage rating from the Buildexact data
- [ ] Pass  [ ] Fail

### Post-test checklist

- [ ] Scope editing saves in wizard state
- [ ] Trade toggle removes trade from outbound rows
- [ ] Recipients assigned in Step 3 appear as rows in Step 4
- [ ] Blocked rows flagged for missing email
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
