---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin / Staff
test_status: static_fail
---

# SOP 02-04: Review and Update a Qualifying Score

**Module:** Sales Manager — Lead Detail → Qualifying Score tab  
**SOP ID:** 02-04  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Staff (anyone qualifying leads)

## 2. When to use it
After every meaningful conversation with a lead. The qualifying score tells you objectively how serious and ready a client is. Update it as you learn more about them — it starts with defaults and gets more accurate over time.

## 3. What this does
Updates four qualifying fields (budget, timeframe, site, decision-maker) against the APB qualification framework. The pipeline board shows the weighted qualifying score as a percentage. Low-scoring leads are de-prioritised; high-scoring leads are prioritised for director attention.

## 4. The four qualifying fields

These are the APB qualification criteria. Each is scored 0, 1, or 2:

### Budget (`qualify_budget`)
| Score | Meaning |
|-------|---------|
| 0 | No budget / can't afford a custom home |
| 1 | Unsure / vague about budget |
| 2 | Yes — clear budget that matches the project type |

### Timeframe (`qualify_timeframe`)
| Score | Meaning |
|-------|---------|
| 0 | 18+ months away — just researching |
| 1 | 6–18 months — planning ahead |
| 2 | Under 6 months — ready to go |

### Site (`qualify_site`)
| Score | Meaning |
|-------|---------|
| 0 | No site and no plan to buy one |
| 1 | Under contract or actively searching |
| 2 | Already owns the site |

### Decision-maker (`qualify_decision_maker`)
| Score | Meaning |
|-------|---------|
| 0 | Not the decision-maker |
| 1 | One of two decision-makers (e.g. one of a couple) |
| 2 | Sole decision-maker |

## 5. Step-by-step process

1. Open the lead detail page (click the lead card on the pipeline board)
2. Click the **Qualifying Score** tab
3. Review the four fields
4. For each field, select the score that matches what you know:
   - Use 0 if you genuinely don't know — it's a signal to find out
   - Update upward as you get clarity through conversations
5. The score updates automatically as you change the fields

## 6. How the score is calculated

The four scores are averaged (0–2 each, total 0–8) and expressed as a percentage (0–100%). A score of 8/8 = 100% (fully qualified).

In practice:
- **0–25%** — Unqualified. Early research. Focus on education, not selling.
- **26–50%** — Partially qualified. Some unknowns. Keep qualifying.
- **51–75%** — Well qualified. Ready for Discovery.
- **76–100%** — Highly qualified. Prioritise and move fast.

## 7. What the scorecard dashboard shows

Sales Manager → Scorecard tab shows:
- Total pipeline value and weighted pipeline value (weighted by qualifying score)
- Active lead count
- Per-stage breakdown of leads, values, and conversion rates

The **weighted pipeline value** is the most useful metric: it applies the qualifying probability multiplier to each lead so you're not over-counting unqualified leads in your forecast.

## 8. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Leaving all scores at 0 | Didn't update after conversations | Update after every qualifying conversation — it takes 30 seconds |
| Scoring 2 for budget when the budget is vague | Optimism | If they said "around a million" with no clarity, that's a 1, not a 2. Score what you know. |
| Not updating when timeframe changes | Forgot | If they tell you they've bought a site and are ready, update the score immediately |
| Over-scoring to make the pipeline look better | Pressure | An inflated score gives a false forecast. Score honestly. |

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| Qualifying score fields not saving | Check your network connection; the fields should auto-save on blur |
| Score shows as 0% after filling in fields | Verify the PATCH request succeeded — check browser network tab for errors |
| Scorecard dashboard not showing the lead | Scorecard shows leads with stage not equal to Lost or archived — check the lead's stage |

## 10. Related SOPs
- [Log a call, meeting or note](02-03_log_activity.md) — SOP 02-03
- [Blueprint Insight AI coaching](02-05_blueprint_insight.md) — SOP 02-05

## 11. Screenshot placeholders
[insert screenshot: Qualifying Score tab with all four fields visible]
[insert screenshot: Scorecard dashboard with weighted pipeline]

## 12. Automation notes
- API: `PATCH /api/sales/leads/:id` with `{ qualify_budget, qualify_timeframe, qualify_site, qualify_decision_maker }`
- Score is computed client-side as `(sum of 4 fields) / 8 * 100`
- Scorecard endpoint: `GET /api/sales/scorecard` — aggregates all active leads with weighted values
- Weighted value formula (server-side): `estimated_value * stage_probability_multiplier` where multiplier per stage is: enquiry=0.05, qualify=0.10, discovery=0.20, winning_offer=0.35, fee_proposal=0.50, accepted=0.65, tender=0.80, won=1.00

## 13. Owner of the process
Admin / Staff  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least 1 lead exists
- [ ] Logged in as Admin

### Test cases

**TC-01 — Update qualifying scores**
1. Open a lead detail → Qualifying Score tab
2. Set: qualify_budget = 2, qualify_timeframe = 1, qualify_site = 1, qualify_decision_maker = 2
3. Save / auto-save
4. Expected result: score displays as (2+1+1+2)/8 × 100 = 75%
5. Expected DB: `leads` row shows all four qualify fields with correct values
- [ ] Pass  [ ] Fail

**TC-02 — Score affects pipeline display**
1. Set a lead's qualifying score to 0/0/0/0 (score = 0%)
2. Check the pipeline board — the score should be visible on the card (if shown)
3. Set to 2/2/2/2 (score = 100%)
4. Expected: visual indicator changes (colour, percentage shown)
- [ ] Pass  [ ] Fail

**TC-03 — Scorecard dashboard reflects changes**
1. Update a lead's qualifying fields
2. Navigate to Sales Manager → Scorecard
3. Expected: the lead's weighted value in the scorecard reflects the updated qualifying score
4. Expected: `weighted_pipeline_value` changes when qualifying score changes significantly
- [ ] Pass  [ ] Fail

**TC-04 — Score survives page reload**
1. Update qualifying fields
2. Reload the page
3. Expected: qualifying fields show the values that were saved (not defaults)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All four qualifying fields save to DB
- [ ] Score calculation is correct (sum/8 × 100)
- [ ] Scorecard reflects updated scores
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
