---
sop_version: 1.0
last_reviewed: 2026-08-16
app_version: main
screenshot_status: placeholders_only
owner: Sales (Admin / Director)
test_status: untested
---

# SOP: Run the Enquiry call and decide the next step

**Module:** Sales
**SOP ID:** 02-10
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Admin, Supervisor (whoever runs first-contact calls).

## 2. When to use it
A new lead is at the **Enquiry** stage — either promoted from the CRM or a thin website enquiry that didn't capture enough to skip ahead. You're about to phone them for the first time.

## 3. What this does
Turns the first call into a short, guided script that captures the essentials (what they're building, where, ownership, budget, timing, what matters, biggest worry), scores the lead, and records a clear decision: proceed to Qualify, nurture, or mark lost. Nothing is re-typed later — every answer carries forward through the pipeline.

## 4. Before you start
- The lead exists and is at the **Enquiry** stage.
- You have the lead open in **Sales → the lead detail page**.
- You're on a call with the client (or have the details to hand).

## 5. Step-by-step process
1. Open the lead from **Sales**. The Enquiry stage shows the **"Enquiry call — complete the picture"** panel.
2. Work down the question checklist on the call — keep it tight, you're checking fit and readiness, not selling.
3. In the **Qualifying Scorecard**, set **Budget**, **Timeframe**, **Site** and **Decision maker** (each No / Unsure / Yes → 0 / 1 / 2).
4. In **Client details**, pick the best-fit dropdowns: **Do they own the site?**, **Documents on hand**, **Finance**, **What matters most**, **Biggest worry**, and type the **Partner / other decision-maker** name if there is one.
5. Under **Next step**, choose **Proceed to Qualify**, **Nurture**, or **Mark Lost**.

> 💡 **Tip:** Proceed if it fits, the budget's potentially realistic, and they're open to a structured process. Nurture (not Lost) if they only want a quick price, won't discuss budget, aren't the decision-maker, or aren't ready.

[insert screenshot: the Enquiry call-script panel with the scorecard and client-details dropdowns]

## 6. What happens next
Proceeding moves the lead to **Qualify**, where you send the introduction email and invite them to book a build conversation (SOP 02-11). Nurture parks the lead with a follow-up date. The captured answers (scores, land status, priority, concern, etc.) stay on the lead and are reused everywhere downstream.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Marking a below-5 lead "Lost" | Habit | Below 5 = Nurture, not Lost. Lost is only for a genuine dead end. |
| Skipping the client-details dropdowns | They don't affect the score | They personalise the Qualify email and feed Discovery — fill them on the call while it's fresh. |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| Client-details dropdowns don't save | Migration 174 not applied | Ask an admin to apply migration 174 in Supabase. |
| Priority/worry selection doesn't stick | lead_signals write failed | Reopen the lead; if it persists, check the browser console + the /signals request. |

## 9. Related modules
- [Send the Qualify email + book the build conversation](02-11_qualify_email_and_booking.md) → the next stage
- [Review and update a qualifying score](02-04_qualifying_score.md) → the scorecard mechanics
- [Classify fit and the action queue](02-08_classify_fit_and_action_queue.md) → nurture handling

## 10. Screenshot placeholders
[insert screenshot: Enquiry stage before starting]
[insert screenshot: scorecard + client-details filled in]
[insert screenshot: the Proceed / Nurture / Lost buttons]

## 11. Automation notes
- Priority selection → `lead_signals` row (`kind = priority`, `label` = the chosen value).
- Biggest worry → `lead_signals` row (`kind = fear`).
- Land / finance / documents / partner name → columns on `leads` (migration 174).
- Proceed → `leads.stage` = `qualify`, `stage_entered_at` bumped, a `lead_activities` stage-change row written.
- Nurture / Lost → `leads.stage` set accordingly (Lost stamps `lost_at`).

## 12. Edge cases and limits
- If migration 174 isn't applied, the scorecard + dispositions still work; only the new client-detail dropdowns can't save.
- A web enquiry that already gave a definite budget or timeframe skips Enquiry entirely and lands in Qualify pre-scored (see SOP 02-11 §confirm web score).
- Re-running the call just overwrites the same fields — no duplicate lead is created.

## 13. Owner of the process
Sales (Admin / Director).
Next review date: 2027-02-16

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Run in order, record pass/fail. Requires migration 174 applied.

### Pre-test setup
- [ ] Log in as Admin.
- [ ] A lead exists at stage `enquiry` with a valid email.
- [ ] Migration 174 is applied (leads has `land_status`, `finance_status`, `documents_on_hand`, `partner_name`).

### Test cases

**TC-01 — Happy path (standard use)**
1. Open the enquiry-stage lead in Sales.
2. Set all four scorecard components to give a total ≥ 5.
3. Set every Client-details dropdown + a partner name.
4. Click **Proceed to Qualify**.
5. Expected result: the lead moves to the Qualify stage view.
6. Expected DB: `leads.stage = 'qualify'`; `land_status`/`finance_status`/`documents_on_hand`/`partner_name` populated; a `lead_signals` row for `kind='priority'` and one for `kind='fear'`.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. On a fresh enquiry lead, leave the scorecard untouched.
2. Click **Proceed to Qualify**.
3. Expected result: the lead still advances (Enquiry is advisory — no hard block), and the scorecard shows "Not yet scored".
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission**
1. Complete TC-01.
2. Re-open the lead and change the priority dropdown to a different value.
3. Expected result: the existing `lead_signals` priority row is updated (its `label` changes) — no duplicate priority row is created.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Log in as a `worker`/`client` role (or hit `PATCH /api/sales/leads/:id` with a client token).
2. Expected result: 403 Forbidden — no stage change.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification**
1. Complete TC-01.
2. Check: `lead_activities` has a `stage_change` row "Moved from enquiry to qualify".
3. Check: `leads.qualify_score` equals the sum of the four components.
- [ ] Pass  [ ] Fail

**TC-06 — Nurture path (feature-specific)**
1. On an enquiry lead scoring below 5, click **→ Nurture**.
2. Expected result: `leads.stage = 'nurture'` (NOT `lost`), `lost_at` remains null.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
