---
sop_version: 2.0
last_reviewed: 2026-07-02
app_version: Pass 3A — Lead command centre
screenshot_status: not_applicable
owner: Admin / Staff
test_status: untested
---

# SOP 02-02: Move a Lead Through Pipeline Stages

**Module:** Sales Manager — Lead Detail (command centre)
**SOP ID:** 02-02
**Status:** Current
**Priority:** High

---

## 1. Who uses this
Admin, Staff (anyone managing the sales pipeline)

## 2. When to use it
Every time a lead progresses (or regresses) in the APB sales process. Move a lead when something meaningful has changed — they have committed to a discovery meeting, they have accepted a fee proposal, they have signed a contract.

Do not move leads speculatively. A lead should only be at the stage that matches where they actually are in the process.

## 3. What this does
Updates the lead's `stage` field. Resets `stage_entered_at` to now (the days-in-stage clock restarts). Creates a `lead_activities` row with `activity_type = 'stage_change'`. Updates `last_activity_at`. The stage stepper in the header and the "Do this now" focus panel both update immediately.

**Pipeline stages — what each one means:**

| Stage | Label | What it means |
|-------|-------|---------------|
| `enquiry` | Enquiry | First contact. Know nothing about them yet. |
| `qualify` | Qualify | Gathering basic qualification info — budget, site, timeline, decision-maker. |
| `discovery` | Discovery | Deep-dive meeting. Understanding their project in detail. |
| `winning_offer` | Winning Offer | Crafting the offer strategy. Identifying what would make them choose Blue Leaf. |
| `fee_proposal` | Fee Proposal | Fee proposal has been sent or is in progress. |
| `accepted` | Accepted | Client has accepted the fee proposal. Ready for tender. |
| `tender` | Tender | Full tender package in preparation. Contracts being drafted. |
| `won` | Won | Contract signed. Project begins. |
| `nurture` | Nurture | Off the main pipeline — not ready yet, but not lost. Keep in touch. |
| `lost` | Lost | Went elsewhere, went dark, or project fell through. |

**Lead command centre layout:**

When you open a lead (click a card on the pipeline board), you land on the **Lead command centre**:

- **Desktop (lg+):** Two-column layout. Left = main workspace (scrolls). Right = sticky rail showing the next-action card, lead summary, trust/context, Blueprint Insight, notes, and documents.
- **Mobile / tablet:** Five tabs — **Summary**, **Action**, **Activity**, **Files**, **Notes** — toggled with `LeadMobileTabs`.

The **stage stepper** sits in the sticky header at the top of the page. It shows all 8 pipeline stages as a breadcrumb row (current stage = filled primary pill; past stages = accent tint; future = muted). On mobile the stepper collapses to "Stage N/8 — Name".

**Stage-specific focus panels:**

When a lead is at a given stage, the **"Do this now"** panel (desktop: main workspace top; mobile: Action tab) shows the relevant work for that stage:

| Stage | Focus panel shown |
|---|---|
| Enquiry / Qualify | Qualifying Scorecard |
| Discovery | Discovery notes + Conversations block |
| Winning Offer | Winning Offer preparation workspace |
| Fee Proposal | Pre-Tender Service Agreement (PTSA) block |
| Tender | RFQ Engine launch block |
| Accepted / Won / Nurture / Lost | No focus panel (won shows hand-off card) |

Earlier completed stages are collapsed into **"Earlier stages"** accordion sections below the focus panel so you can review them without them dominating the workspace.

## 4. Before you start
- The lead must exist (SOP 02-01)
- Open the lead's detail page (click the lead card on the pipeline board)

## 5. Step-by-step process

### Moving a lead forward via the stage stepper header

The stage stepper is visual-only and does not accept direct clicks. Use the **"Move to [Next Stage] →"** button to advance.

1. Open a lead from the pipeline board (Sales Manager).
2. Look at the **stage stepper** in the sticky header to confirm the current stage.
3. On desktop: find the **Advance to [Next Stage]** card in the **sticky right rail**.
   On mobile: tap the **Action** tab — the advance card appears in the action workspace.
4. Check the gate requirements listed in the advance card (green tick = met, red cross = not met).
5. When all gates are green, click **Move to [Next Stage] →**.
6. The header stepper updates immediately and the "Do this now" focus panel switches to the new stage's workspace.

### Advisory gates (requirements before advancing)

The system checks gate requirements before enabling the advance button. Gates by target stage:

| Advancing to | Gate requirements |
|---|---|
| Qualify | None |
| Discovery | Qualifying score ≥ 5/8 |
| Winning Offer | Discovery notes filled · Design stage set · Desired start date set |
| Fee Proposal | Pre-construction fee set |
| Accepted | None |
| Tender | Site address set · Job created from this lead |
| Won | None |

If a gate is not met, the "Move to [Stage] →" button is disabled and the unmet requirement is shown in red.

### Sending to Nurture or Lost

These are available directly from the **sticky header action buttons** (top right of the page, visible on all screen sizes):

- **→ Nurture** button: moves the lead to nurture stage immediately. The lead disappears from the main pipeline columns but remains accessible.
- **Mark Lost** button (red border): moves to lost and returns you to the Sales Pipeline.

### Moving via the pipeline board (board view)

From **Sales Manager → Board view** (desktop only):
1. Find the lead card in its current stage column.
2. Drag it to the target stage column.
3. Drop — the stage updates immediately in the DB and the card repositions.

The board view does not enforce advisory gates — gates are only checked in the lead detail advance card. This means a drag-and-drop move will always succeed even if requirements are unmet.

## 6. What happens next

- `leads.stage` → new stage value
- `leads.stage_entered_at` → set to now (days-in-stage clock resets)
- `leads.last_activity_at` → set to now
- `lead_activities` row inserted: `activity_type = 'stage_change'`, `summary = 'Moved from [old] to [new]'`
- Stage stepper in the header re-renders
- "Do this now" focus panel switches to the new stage workspace
- Blueprint Insight (right rail) refreshes automatically with advice for the new stage

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Moving a lead without a reason | Tidying the board | Every stage move should reflect something that actually happened. If in doubt, do not move it yet. |
| Skipping stages via drag-and-drop | Board allows it | The advisory gates exist for a reason. If you drag past a stage, immediately check whether the gate requirements were actually met. |
| Not marking lost leads as Lost | Uncomfortable | Leaving them on the board as ghost cards distorts your pipeline. Mark lost leads as Lost so the pipeline is accurate. |
| Moving to Nurture when you mean Lost | Unclear difference | Nurture = you still expect them to come back. Lost = they are gone. |
| Confused by the gate-disabled button | Gates can block advance | Read the red-cross requirements shown in the advance card. Meet them, then the button enables. |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Move to [Stage] →" button is grey/disabled | One or more gate requirements are unmet. Read the red-cross items in the advance card and complete them first. |
| Lead disappeared after moving | Check the Nurture and Lost sections of the pipeline (the board shows them as collapsed rows at the bottom of the board). Or open the lead directly via its URL. |
| Stage history not showing | Stage history appears in the unified timeline (Activity tab / timeline in the command centre). Look for `activity_type = stage_change`. |
| Drag-and-drop not working on mobile | Board view is desktop-only. On mobile, use the Action tab → advance card. |
| Site address warning banner appears after PTSA signed | The PTSA was signed but no site address was set, so no job was created. Add a site address on the lead — the banner will clear and you can advance to Tender. |

## 9. Related SOPs
- [Create a new lead](sales_create_new_lead.md) — SOP 02-01
- [Log a call, meeting or note](02-03_log_activity.md) — SOP 02-03
- [Review qualifying score](02-04_qualifying_score.md) — SOP 02-04

## 10. Screenshot placeholders
[insert screenshot: Lead command centre desktop — stage stepper in header, advance card in right rail]
[insert screenshot: Stage stepper showing current stage highlighted in primary, past stages in accent tint]
[insert screenshot: Advance card with gate requirements — some green ticks, some red crosses]
[insert screenshot: Mobile Action tab showing focus panel and advance button]

## 11. Automation notes
- API: `PATCH /api/sales/leads/:id` with `{ stage: 'new_stage' }` — server detects stage change, sets `stage_entered_at = now()`, inserts `lead_activities` record
- Stage-change detection: compares `body.stage` against current DB value — only fires the activity insert if the value actually changed
- No server-side gate enforcement on stage changes — gates are advisory in the UI only
- Blueprint Insight auto-refreshes after a stage move: `bpFetchedFor.current` is cleared, triggering a new `/api/blueprint/chat` call with the new stage as context
- `nextStage()` helper in `LeadDetail.jsx` returns the next stage in `STAGE_ORDER` — nurture/lost are not in `STAGE_ORDER` (they are accessed via the header buttons only)

## 12. Edge cases and limits
- The board drag-and-drop does not enforce advisory gates — a drag will always succeed even if gate requirements are unmet. Verify gate requirements manually after a drag move.
- Nurture and Lost stages are not in `STAGE_ORDER` — they cannot be targeted by the advance card button, only by the header action buttons.

## 13. Owner of the process
Admin / Staff
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least 2 leads exist in different stages
- [ ] Logged in as Admin or Staff

### Test cases

**TC-01 — Move lead forward via advance card (happy path)**
1. Open a lead at Enquiry stage
2. On desktop: check the right rail advance card. On mobile: tap Action tab.
3. Gates for Qualify: none required. Click "Move to Qualify →".
4. Expected result: stage stepper header updates to show Qualify highlighted
5. Expected DB: `leads.stage = 'qualify'`, `stage_entered_at` = approximately now
6. Expected DB: `lead_activities` row with `activity_type = 'stage_change'`, summary contains both stage names
- [ ] Pass  [ ] Fail

**TC-02 — Gate blocks advance to Discovery**
1. Open a lead at Qualify stage with qualifying score less than 5
2. Check the advance card — should show "Qualifying score ≥ 5" with a red cross
3. Expected: "Move to Discovery →" button is disabled
4. Set qualifying score to 5 or above (update the scorecard on the same page)
5. Expected: advance button becomes enabled
- [ ] Pass  [ ] Fail

**TC-03 — Move to Nurture via header button**
1. Open any active lead
2. Click "→ Nurture" in the header action buttons
3. Expected: stage updates to nurture, lead disappears from main pipeline columns
4. Expected DB: `leads.stage = 'nurture'`
- [ ] Pass  [ ] Fail

**TC-04 — Mark Lost via header button**
1. Open any active lead
2. Click "Mark Lost" (red border button in header)
3. Expected: you are redirected to the Sales Pipeline page
4. Expected DB: `leads.stage = 'lost'`
5. Verify the lead is still accessible via direct URL — it has not been deleted
- [ ] Pass  [ ] Fail

**TC-05 — Move via pipeline board drag-and-drop (desktop)**
1. On the Sales Manager board view (desktop), drag a lead card from one column to the next
2. Expected: card appears in the new column immediately
3. Expected DB: `leads.stage` = new stage, `stage_entered_at` = approximately now
4. Expected DB: `lead_activities` row with `activity_type = 'stage_change'`
- [ ] Pass  [ ] Fail

**TC-06 — Stage stepper reflects current stage on page load**
1. Open a lead known to be at Discovery stage
2. Expected: stage stepper shows Enquiry and Qualify in accent tint (past), Discovery in filled primary, future stages in muted
- [ ] Pass  [ ] Fail

**TC-07 — Blueprint Insight refreshes after stage advance**
1. Open a lead at Enquiry — note the Blueprint Insight content in the right rail
2. Advance to Qualify
3. Expected: Blueprint Insight shows a loading state briefly, then new advice referencing the Qualify stage
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Stage changes update DB correctly (stage, stage_entered_at, last_activity_at)
- [ ] Stage history recorded in activity log
- [ ] Gate requirements work (block button when unmet, enable when met)
- [ ] Nurture and Lost work via header buttons
- [ ] Stage stepper visually reflects the current stage
- [ ] Blueprint Insight refreshes after advance
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
