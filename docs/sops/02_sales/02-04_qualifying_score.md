---
sop_version: 2.0
last_reviewed: 2026-07-02
app_version: Pass 3A — Lead command centre
screenshot_status: not_applicable
owner: Admin / Staff
test_status: untested
---

# SOP 02-04: Review and Update a Qualifying Score

**Module:** Sales Manager — Lead Detail → Qualifying Scorecard (in command centre)
**SOP ID:** 02-04
**Status:** Current
**Priority:** High

---

## 1. Who uses this
Admin, Staff (anyone qualifying leads)

## 2. When to use it
After every meaningful conversation with a lead. The qualifying score tells you objectively how serious and ready a client is. Update it as you learn more about them — it starts with defaults and gets more accurate over time.

## 3. What this does
Updates four qualifying fields (budget, timeframe, site, decision-maker) against the APB qualification framework. The pipeline board shows the weighted qualifying score as a fraction out of 8 on each lead card. A score of 5 or above is required before the lead can advance to Discovery.

**How the score is calculated:**

The four scores are added (0–2 each, max 8) and displayed as `X/8`. There is no percentage in this view — the pipeline board shows the raw fraction.

In practice:
- **0–2/8** — Unqualified. Early research. Focus on education, not selling.
- **3–4/8** — Partially qualified. Keep qualifying. Move to Nurture if they stay here.
- **5–6/8** — Well qualified. Ready to advance to Discovery.
- **7–8/8** — Highly qualified. Prioritise and move fast.

**Relationship to transcript analysis:**

The transcript analysis feature (SOP 02-06) can extract qualifying scores automatically from a meeting transcript. When Blueprint AI analyses a transcript, it may suggest values for all four qualifying fields. You review these suggestions and apply or skip each one individually. Applied suggestions update the same qualifying fields documented here. See SOP 02-06 for the transcript analysis workflow.

**The Scorecard view (pipeline-wide):**

The **Sales Manager → Scorecard view** (`?view=scorecard`) shows a pipeline-wide summary:
- Total pipeline value and weighted pipeline value (weighted by stage probability multiplier)
- Active lead count
- Per-stage breakdown of leads, values, and conversion rates

The **weighted pipeline value** is the most useful metric: it applies a stage-probability multiplier to each lead so you are not over-counting unqualified leads in your forecast. Qualifying score itself does not appear directly in the scorecard view — it gates the Discovery advance and is visible per-lead in the lead detail.

## 4. Before you start

**Where to find the Qualifying Scorecard in the command centre:**

The Qualifying Scorecard is **not a separate tab** in Pass 3A. It is embedded directly in the **"Do this now"** focus panel at the top of the main workspace.

- **Enquiry stage:** the focus panel shows the Qualifying Scorecard immediately — it is the primary work for this stage.
- **Qualify stage:** same as above.
- **Discovery and later stages:** the scorecard moves to a collapsed **"Earlier stages"** accordion section titled "Qualifying" (shows the current score as a summary, e.g. "5/8"). Expand the accordion to view or edit.

**Desktop:** The focus panel is at the top of the left (main) workspace column.
**Mobile:** Tap the **Action** tab — the Qualifying Scorecard focus panel is the first content block.

The **score is also shown** in the header key-facts bar: "Qualifying — X/8" in green (7–8), amber (5–6), or red (0–4).

## 5. Step-by-step process

**The four qualifying fields:**

These are the APB qualification criteria. Each is scored using a three-button selector (0, 1, or 2):

### Budget (`qualify_budget`)
| Score | Button label | Meaning |
|-------|-------------|---------|
| 0 | No | No budget / can't afford a custom home |
| 1 | Unsure | Unsure / vague about budget |
| 2 | Yes | Clear budget that matches the project type |

### Timeframe (`qualify_timeframe`)
| Score | Button label | Meaning |
|-------|-------------|---------|
| 0 | 18+ months | Just researching — 18+ months away |
| 1 | 6–18 months | Planning ahead — 6 to 18 months |
| 2 | < 6 months | Ready to go — under 6 months |

### Site (`qualify_site`)
| Score | Button label | Meaning |
|-------|-------------|---------|
| 0 | No site | No site and no plan to buy one |
| 1 | Under contract | Under contract or actively searching |
| 2 | Owns site | Already owns the site |

### Decision-maker (`qualify_decision_maker`)
| Score | Button label | Meaning |
|-------|-------------|---------|
| 0 | No | Not the decision-maker |
| 1 | One of two | One of two decision-makers (e.g. one of a couple) |
| 2 | Yes | Sole decision-maker |

**To update the scorecard:**

1. Open the lead detail page (click the lead card on the pipeline board).
2. **Enquiry / Qualify stages:** the Qualifying Scorecard is the focus panel — it is visible immediately at the top of the main workspace (desktop) or the Action tab (mobile).
   **Later stages:** scroll down to the "Earlier stages" accordion and expand "Qualifying".
3. For each of the four criteria, click the button that best matches what you know:
   - The currently selected button is filled/highlighted (primary colour)
   - Click a different button to change the score — the change saves immediately (no Save button required)
   - If you genuinely do not know, score 0 — it is a signal to find out
4. The total score (sum/8) is shown in the scorecard header and in the header key-facts bar.
5. If the score is below 5, a warning note appears: "Score X/8 — a score of 5+ is required to advance to Discovery. APB recommends nurturing leads that stay under 5 rather than investing discovery time."

## 6. What happens next
- `PATCH /api/sales/leads/:id` is called on each button click with the updated field value
- `qualify_score` is a generated column (sum of the four fields) — it updates automatically
- The header key-facts bar re-renders with the new score colour (green / amber / red)
- The Discovery advance gate re-evaluates immediately

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Leaving all scores at 0 | Did not update after conversations | Update after every qualifying conversation — it takes 30 seconds |
| Scoring 2 for budget when the budget is vague | Optimism | If they said "around a million" with no clarity, that is a 1, not a 2. Score what you know. |
| Not updating when timeframe changes | Forgot | If they tell you they have bought a site and are ready, update the score immediately |
| Over-scoring to make the pipeline look better | Pressure | An inflated score gives a false forecast. Score honestly. |
| Not finding the scorecard at later stages | Looking for a separate tab | At Discovery and beyond, the scorecard moves to the collapsed "Earlier stages" accordion. |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Cannot find the Qualifying Scorecard | At Enquiry/Qualify: it is the focus panel (Action tab on mobile). At later stages: expand the "Qualifying" accordion under "Earlier stages". |
| Score changes not saving | The ScoreGate buttons save on click via `PATCH /api/sales/leads/:id`. Check your network connection. Reload the page and verify the score. |
| Advance to Discovery is blocked at 4/8 | Score must be 5 or above. Update at least one field. |
| Score shows as 0/8 after filling in fields | Verify the PATCH request succeeded — check the browser network tab for 4xx errors. |

## 9. Related SOPs
- [Log a call, meeting or note](02-03_log_activity.md) — SOP 02-03
- [Analyse a meeting transcript](02-06_transcript_analysis.md) — SOP 02-06
- [Blueprint Insight AI coaching](02-05_blueprint_insight.md) — SOP 02-05

## 10. Screenshot placeholders
[insert screenshot: Qualifying Scorecard in the focus panel — Enquiry stage — four ScoreGate button rows]
[insert screenshot: Header key-facts bar showing qualifying score in amber at 4/8]
[insert screenshot: "Earlier stages" accordion with Qualifying collapsed, showing "5/8" summary]

## 11. Automation notes
- `PATCH /api/sales/leads/:id` with any of `{ qualify_budget, qualify_timeframe, qualify_site, qualify_decision_maker }` (each 0, 1, or 2)
- Score is a generated column in Postgres: `qualify_score = qualify_budget + qualify_timeframe + qualify_site + qualify_decision_maker` (not stored separately, derived)
- Gate check in `LeadDetail.jsx`: `GATE_REQUIREMENTS['discovery'] = [{ field: "qualify_score", check: l => (l.qualify_score || 0) >= 5 }]`
- Scorecard endpoint: `GET /api/sales/scorecard` — aggregates all active leads with weighted values
- Weighted value formula (server-side): `estimated_value * stage_probability_multiplier` where multiplier per stage is: enquiry=0.05, qualify=0.10, discovery=0.20, winning_offer=0.35, fee_proposal=0.50, accepted=0.65, tender=0.80, won=1.00

## 12. Edge cases and limits
- `qualify_score` is a Postgres generated column — it cannot be written directly; update the four individual fields.
- Scores save on click with no Save button — there is no undo. If you click the wrong button, click the correct one immediately.
- Transcript analysis (SOP 02-06) can auto-suggest qualifying field values; those suggestions must be individually approved before they update the lead record.

## 13. Owner of the process
Admin / Staff
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least 1 lead exists at Enquiry or Qualify stage
- [ ] Logged in as Admin or Staff

### Test cases

**TC-01 — Update qualifying scores via the focus panel (Enquiry stage)**
1. Open a lead at Enquiry stage — the Qualifying Scorecard should be the first content block on desktop or the Action tab on mobile
2. Click the ScoreGate buttons: Budget = Yes (2), Timeframe = 6–18 months (1), Site = Under contract (1), Decision maker = One of two (1)
3. Expected result: score shows 5/8 in the scorecard header and the header key-facts bar
4. Expected DB: `leads` row shows `qualify_budget=2`, `qualify_timeframe=1`, `qualify_site=1`, `qualify_decision_maker=1`, `qualify_score=5`
- [ ] Pass  [ ] Fail

**TC-02 — Score gates advance to Discovery**
1. Open a lead at Qualify with qualify_score = 4
2. Check the advance card — "Qualifying score ≥ 5" shows with a red cross
3. Expected: "Move to Discovery →" is disabled
4. Update one field to increase the score to 5
5. Expected: advance button becomes enabled
- [ ] Pass  [ ] Fail

**TC-03 — Score survives page reload**
1. Update qualifying fields on a lead
2. Reload the page
3. Expected: qualifying ScoreGate buttons show the values that were saved (not 0 defaults)
- [ ] Pass  [ ] Fail

**TC-04 — Qualifying scorecard visible in "Earlier stages" accordion at Discovery**
1. Open a lead that has advanced to Discovery stage
2. Scroll down in the main workspace to "Earlier stages"
3. Expected: "Qualifying" accordion entry shows the current score as a summary (e.g. "5/8")
4. Expand the accordion — expected: the full ScoreGate fields are visible and editable
- [ ] Pass  [ ] Fail

**TC-05 — Feature case: low score advisory message**
1. Open a lead at Qualify with all four scores set to 0
2. Expected: the scorecard shows a warning "Score 0/8 — a score of 5+ is required to advance to Discovery. APB recommends nurturing leads that stay under 5 rather than investing discovery time."
3. Set scores to 7/8 total
4. Expected: warning message disappears
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Qualifying Scorecard found in expected location (focus panel at Enquiry/Qualify, earlier-stages accordion at later stages)
- [ ] All four qualifying fields save to DB on click
- [ ] Score calculation correct (sum of four fields)
- [ ] Gate enforcement working (score < 5 blocks Discovery advance)
- [ ] Score survives page reload
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
