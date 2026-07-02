---
sop_version: 1.0
last_reviewed: 2026-07-02
app_version: 1.0 — built (Batch 1A, migration 127)
screenshot_status: pending
owner: Admin / Staff
test_status: untested
---

# SOP 02-08: Classify Lead Fit & Work the Action Queue

**Module:** Sales Manager — Pipeline + Lead Detail
**SOP ID:** 02-08
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Admin, Staff (sales)

## 2. When to use it
- **Fit:** whenever you learn enough about a lead to judge how good a fit they are and how ready they are to proceed — usually after the first real conversation, and again whenever that changes.
- **Action queue:** every working day, to see which leads need action and in what order.
- **Source category:** set automatically on every new lead — you only touch it if the auto-classification is wrong.

## 3. What this does
Turns the pipeline from a passive list into a control system:
- **Fit quality × Readiness** — two independent tags describing *how good* the lead is and *how ready* they are, shown as chips and filterable.
- **Action queue** — every lead carries a current `action_type` (one of 8) and a due date, so you work a prioritised queue instead of guessing.
- **Mandatory source category** — every lead is classified by where it came from, which powers the marketing ROI report (SOP 19-09).

## 4. Before you start
- The lead must exist (SOP 02-01)
- Migration 127 must be applied (the fit/action/source columns)

## 5. Step-by-step — classify fit

1. Open the lead detail
2. Find the **Fit** panel (in Lead details, and on the mobile Summary tab)
3. Set **Fit quality**: Strong / Possible / Nurture / Poor / Price shopper
4. Set **Readiness**: Early research / Not ready yet / Ready for consult
5. The chips update immediately on the pipeline table; "Last set" shows when you last changed it

Fit is **manual only** — no AI sets or overwrites it in this build. Whoever changes it is recorded (`fit_set_by` / `fit_set_at`).

## 6. The two axes explained

| Axis | Answers | Values |
|------|---------|--------|
| Fit quality | Is this the kind of client we want? | strong, possible, nurture, poor, price_shopper |
| Readiness | How close are they to buying? | early_research, not_ready_yet, ready_for_consult |

Keep them separate: a *strong* fit can still be *early_research* (great client, not ready), and a *price_shopper* can be *ready_for_consult* (ready, but wrong fit). Architect-led tenders stay on the existing `lead_type` field — fit does not replace it.

## 7. Step-by-step — work the action queue

1. Go to the Sales Pipeline **Actions** view
2. Toggle between **Urgency** (the original scored view) and **Action type** (grouped by the 8 buckets)
3. In Action-type mode, leads are grouped by `action_type` and sorted by `action_due_at` (soonest first); snoozed leads are hidden until due
4. Work each bucket top-down
5. Use **Snooze** to defer a lead without losing it (sets `snoozed_until`)

## 8. The 8 action types

| action_type | Meaning |
|-------------|---------|
| response_due | A new/kept enquiry needs a first response |
| no_reply_follow_up | You replied, they went quiet — chase |
| plans_requested | You asked the client for plans |
| plans_received | Plans arrived — act on them |
| proposal_follow_up | Proposal sent — follow up |
| nurture_check_in | Long-game nurture cadence |
| lost_review | Review a lost lead |
| reactivation | Dormant lead worth reviving |

**Rule-based defaults:** when you move a lead to a new stage, the system sets a sensible `action_type` + due date automatically — *unless* you set one explicitly in the same change, in which case your choice wins.

## 9. Source category

Every lead must have a `lead_source_category` (website, referral, repeat, social, search, advertising, walk_in, other). It is auto-derived from the free-text lead source on create, so you rarely set it by hand. A lead cannot be created without one — if the source can't be classified, creation is blocked with a clear message (pick a source).

## 10. Common mistakes

| Mistake | How to avoid it |
|---------|-----------------|
| Using stage as a proxy for fit | Stage = where they are in the process. Fit = how good/ready they are. Set both. |
| Never snoozing, so the queue is noisy | Snooze leads that genuinely can't be actioned yet — the queue should be a real to-do list. |
| Overriding the auto source category unnecessarily | Only change it if it's actually wrong. |

## 11. Troubleshooting

| Problem | Solution |
|---------|----------|
| Fit chips don't appear | Migration 127 not applied — paste it in Supabase SQL editor |
| "lead_source_category is required" on create | The source couldn't be classified — choose a recognised source |
| Action type didn't change on stage move | You (or a prior request) set an explicit action_type — that always wins over the rule default |

## 12. Screenshot placeholders
[insert screenshot: Lead detail Fit panel with both dropdowns]
[insert screenshot: Pipeline Actions view, Action-type mode grouped by bucket]

## 13. Automation notes
- Fit: `PATCH /api/sales/leads/:id { fit_quality, readiness }` — validates against the enum, stamps `fit_set_by`/`fit_set_at`, rejects invalid values with 400.
- Action queue: on stage change, `deriveActionForStage()` sets `action_type` + `action_due_at` only when `action_type` is NOT in the same request body.
- Snooze: `PATCH /api/sales/leads/:id { snoozed_until }`.
- Source: every create path (manual `POST /api/sales/leads`, public enquiry, CRM convert) requires `lead_source_category`, derived via `normalizeLeadSourceCategory()`; a well-formed convert never blocks (falls back to 'other').

## 14. Owner of the process
Admin / Sales
Next review: 2026-12-02

---

## 15. Troubleshoot Agent Test Script

Automated: `npm run test:w1a-crm-control-spine:write` (requires migration 127 + server running). Gap-documents cleanly if 127 not applied.

### Pre-test setup
- [ ] Migration 127 applied
- [ ] Logged in as Admin

### Test cases

**TC-01 — Source category required on create**
1. `POST /api/sales/leads` with no lead_source and no lead_source_category
2. Expected: 400, error mentions lead_source_category
- [ ] Pass  [ ] Fail

**TC-02 — Source auto-derived**
1. `POST /api/sales/leads` with `lead_source: "referral"`
2. Expected: 200, `lead.lead_source_category === "referral"`
- [ ] Pass  [ ] Fail

**TC-03 — Fit set + provenance stamped**
1. `PATCH /api/sales/leads/:id { fit_quality:"strong", readiness:"ready_for_consult" }`
2. Expected: values persist, `fit_set_at` populated
3. Invalid `fit_quality` → 400
- [ ] Pass  [ ] Fail

**TC-04 — Stage change applies rule default**
1. `PATCH { stage:"qualify" }` with no action_type
2. Expected: `action_type === "response_due"`, `action_due_at` set
- [ ] Pass  [ ] Fail

**TC-05 — Explicit action_type wins**
1. `PATCH { stage:"discovery", action_type:"plans_received" }`
2. Expected: `action_type === "plans_received"` (rule default not applied)
- [ ] Pass  [ ] Fail

**TC-06 — Snooze round-trips**
1. `PATCH { snoozed_until: <+7d ISO> }`
2. Expected: value persists; lead hidden from Action-type queue until due
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All fit/action/source paths behave as specified
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
