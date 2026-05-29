---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin / Staff
test_status: static_pass
---

# SOP 02-02: Move a Lead Through Pipeline Stages

**Module:** Sales Manager — Pipeline  
**SOP ID:** 02-02  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Staff (anyone managing the sales pipeline)

## 2. When to use it
Every time a lead progresses (or regresses) in the APB sales process. Move a lead when something meaningful has changed — they've committed to a discovery meeting, they've accepted a fee proposal, they've signed a contract.

**Do not** move leads speculatively. A lead should only be at the stage that matches where they actually are in the process.

## 3. What this does
Updates the lead's `stage` field. Records a stage-change event in the lead's activity history with a timestamp. Updates `stage_entered_at` to now (used to calculate how long a lead has been in each stage).

## 4. Before you start
- Know what the stages mean (see below)
- Have had the conversation or event that justifies the move

## 5. Pipeline stages — what each one means

| Stage | Label | What it means |
|-------|-------|---------------|
| `enquiry` | Enquiry | First contact. Know nothing about them yet. |
| `qualify` | Qualifying | Gathering basic qualification info — budget, site, timeline, decision-maker. |
| `discovery` | Discovery | Deep-dive meeting. Understanding their project in detail. |
| `winning_offer` | Winning Offer | Crafting the offer strategy. Identifying what would make them choose Blue Leaf. |
| `fee_proposal` | Fee Proposal | Fee proposal has been sent or is in progress. |
| `accepted` | Accepted | Client has accepted the fee proposal. Ready for tender. |
| `tender` | Tender | Full tender package in preparation. Contracts being drafted. |
| `won` | Won | Contract signed. Project begins. |
| `nurture` | Nurture | Off the main pipeline — not ready yet, but not lost. Keep in touch. |
| `lost` | Lost | Went elsewhere, went dark, or project fell through. |

## 6. Step-by-step process

**Moving a lead forward (drag and drop):**
1. Go to **Sales Manager**
2. The pipeline board shows all leads as cards across stage columns
3. Drag the lead card from its current column to the new column
4. Release — the lead moves and the stage updates immediately

**Moving a lead via the lead detail:**
1. Click any lead card to open the lead detail page
2. The current stage is shown at the top
3. Use the stage selector / dropdown to change the stage
4. Save — stage updates and is recorded in the activity log

**Sending to Nurture or Lost:**
- Nurture and Lost sit outside the main pipeline columns
- Access via the lead detail → stage dropdown → select Nurture or Lost
- Or use a dedicated button/action if shown in the UI (e.g. "Mark as Lost")

## 7. What happens after moving

- `leads.stage` → new stage value
- `leads.stage_entered_at` → set to now (days-in-stage clock resets)
- `leads.last_activity_at` → set to now
- A `lead_activities` row is created: `activity_type = 'stage_change'`, `summary = 'Moved from [old] to [new]'`
- The pipeline board re-renders the card in the new column

## 8. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Moving a lead without a reason | Tidying the board | Every stage move should reflect something that actually happened. If in doubt, don't move it yet. |
| Skipping stages | Excitement | The APB stages exist for a reason. If you jump from Enquiry to Won, you've missed the process. |
| Not marking lost leads as Lost | Uncomfortable | Leaving them on the board as ghost cards distorts your pipeline. Mark lost leads as Lost so the pipeline is accurate. |
| Moving to Nurture when you mean Lost | Unclear difference | Nurture = you still expect them to come back. Lost = they're gone. |

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| Drag and drop doesn't work | Try refreshing the page. Some browsers handle drag-and-drop differently on mobile. |
| Lead disappeared after moving | Check the Nurture and Lost views — it may have been accidentally moved there. |
| Stage history not showing | Stage history is in the activity log (Timeline tab on the lead detail). Look for activity_type = stage_change. |

## 10. Related SOPs
- [Create a new lead](sales_create_new_lead.md) — SOP 02-01
- [Log a call, meeting or note](02-03_log_activity.md) — SOP 02-03
- [Review qualifying score](02-04_qualifying_score.md) — SOP 02-04

## 11. Screenshot placeholders
[insert screenshot: Pipeline board showing all stage columns with lead cards]
[insert screenshot: Lead card being dragged to new column]

## 12. Automation notes
- API: `PATCH /api/sales/leads/:id` with `{ stage: 'new_stage' }` — detects stage change, sets `stage_entered_at = now()`, creates `lead_activities` record
- Stage-change detection: compares `body.stage` against current DB value — only fires the activity insert if the value actually changed
- No restrictions on backward movement — a lead can be moved from Won back to Enquiry if needed

## 13. Owner of the process
Admin / Staff  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least 2 leads exist in different stages
- [ ] Logged in as Admin or Staff

### Test cases

**TC-01 — Move lead via drag and drop**
1. On the pipeline board, drag a lead card from one column to the next column
2. Expected result: card appears in the new column immediately
3. Expected DB: `leads.stage` = new stage value, `stage_entered_at` = approximately now
4. Expected DB: `lead_activities` row created with `activity_type = 'stage_change'`, `summary` contains both old and new stage names
- [ ] Pass  [ ] Fail

**TC-02 — Move lead via lead detail**
1. Click a lead card to open the detail
2. Change the stage via dropdown or selector
3. Save
4. Expected result: stage shown on detail page updates
5. Navigate back to pipeline — lead appears in the new column
- [ ] Pass  [ ] Fail

**TC-03 — Stage change recorded in activity log**
1. Move a lead from Enquiry to Qualifying
2. Open the lead detail → Timeline / Activity tab
3. Expected: activity entry shows "Moved from enquiry to qualify" (or equivalent wording)
4. Expected: `stage_entered_at` was reset (it is not the lead's original creation date)
- [ ] Pass  [ ] Fail

**TC-04 — Move to Lost**
1. Move a lead to Lost
2. Expected: lead disappears from main pipeline columns
3. Expected DB: `stage = 'lost'`
4. Verify the lead is still accessible (not deleted) — it should appear in a Lost filter or via direct URL
- [ ] Pass  [ ] Fail

**TC-05 — Move to Nurture**
1. Move a lead to Nurture
2. Expected: lead no longer appears in the main stage columns
3. Expected DB: `stage = 'nurture'`
- [ ] Pass  [ ] Fail

**TC-06 — Backward movement allowed**
1. Move a lead from Discovery back to Enquiry
2. Expected: system allows this — no error
3. Expected DB: `stage = 'enquiry'`, `stage_entered_at` reset to now
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Stage changes update DB correctly
- [ ] Stage history recorded in activity log
- [ ] stage_entered_at resets on every stage change
- [ ] Lost and Nurture work correctly
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
