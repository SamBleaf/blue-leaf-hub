---
sop_version: 1.0
last_reviewed: 2026-08-16
app_version: main
screenshot_status: placeholders_only
owner: Admin / Director
test_status: untested
---

# SOP: Use a test lead to walk the pipeline

**Module:** Sales
**SOP ID:** 02-13
**Status:** Draft
**Priority:** Medium

---

## 1. Who uses this
Admin (dev/testing + training).

## 2. When to use it
When you want to see or test a pipeline stage without a real client — e.g. reviewing new Sales features, training, or checking what a stage looks like. Also when a real lead was moved to the wrong stage and needs walking back.

## 3. What this does
Creates a throwaway **test lead** you can jump to any stage, in any direction, instantly — with no client emails, no reporting impact, and no gate blocking. It also lets you move a *real* lead **back** a stage to fix a mistake.

## 4. Before you start
- You're an **Admin**.
- Migrations up to **178** are applied (the test-lead flag). Without it, "＋ Test lead" errors.

## 5. Step-by-step process
1. Go to **Sales**. Click **＋ Test lead** (top-right, amber). It creates a lead named "TEST — …" with a safe email (yours) and opens it.
2. In the lead header you'll see a **TEST** badge and a fully clickable **stage stepper**. Click any stage chip (or use the dropdown on mobile) to jump straight there — forward or backward, no gate blocks you.
3. Send emails, generate documents, mark things accepted — it all works, but nothing reaches a real client (mail goes to your address) and it stays out of your reports.
4. Click **↺ Reset test lead** (header) to wipe it back to a clean Enquiry state and start again.
5. For a **real** lead in the wrong stage: click an **earlier** stage chip → confirm → it moves back.

> 💡 **Tip:** A test lead is the fastest way to eyeball a stage's screen — no need to drag a real client through the gates.

[insert screenshot: a test lead with the TEST badge + clickable stepper]

## 6. What happens next
Nothing downstream — test leads are excluded from the automatic follow-up cadences, the internal action digest, and reporting. Delete them any time (or just leave them; they never affect numbers).

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Expecting "＋ Test lead" without migration 178 | Column not applied | Apply migrations up to 178 first. |
| Using a real lead to test | Habit | Always spin up a test lead — real leads carry real consequences. |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Couldn't create a test lead" | Migration 178 not applied | Paste migration 178 in Supabase. |
| Stage chips aren't clickable | Not an admin, or not a test lead (forward chips on a real lead stay gated) | Log in as admin; forward progress on a real lead still uses "Move to …". |
| Reset says "only available for test leads" | You clicked Reset on a real lead | Reset only works on is_test leads. |

## 9. Related modules
- [Move a lead through pipeline stages](02-02_move_lead_through_stages.md) → the normal (gated) flow
- [Run the Enquiry call](02-10_enquiry_call_script.md) / [Qualify email](02-11_qualify_email_and_booking.md) → stages you'll test with it

## 10. Screenshot placeholders
[insert screenshot: the ＋ Test lead button on the Sales header]
[insert screenshot: TEST badge + clickable stepper]
[insert screenshot: Reset confirmation]

## 11. Automation notes
- ＋ Test lead → `POST /api/sales/test-lead` → a `leads` row with `is_test=true`, safe email (`TEST_LEAD_EMAIL` or your own).
- Stage jump → `PATCH /api/sales/leads/:id {stage}` — hard gates bypassed for test leads + all backward moves.
- Reset → `POST /api/sales/leads/:id/test-reset` — clears stage-progress stamps + wipes the lead's correspondence/activities.
- Test leads are filtered out of `runQualifyFollowups`, `runDiscoveryFollowups`, and the internal digest.

## 12. Edge cases and limits
- Only admins can create/reset test leads or jump stages.
- A real lead can be moved **backward** freely (corrective) but **forward** still respects the hard gates.
- Reset does not delete the lead row — it resets it. Delete it via the normal lead delete if you want it gone.

## 13. Owner of the process
Admin / Director. Next review: 2027-02-16

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Requires migration 178 applied. Log in as Admin.

### Pre-test setup
- [ ] Admin session.
- [ ] Migration 178 applied (`leads.is_test` exists).

### Test cases

**TC-01 — Happy path (create + jump)**
1. Sales → **＋ Test lead**.
2. Expected: a "TEST — …" lead opens with a TEST badge; `leads.is_test=true`.
3. Click the **Won** stage chip.
4. Expected: the lead jumps straight to Won with no gate error.
- [ ] Pass  [ ] Fail

**TC-02 — Empty/guard**
1. Call `POST /api/sales/leads/:id/test-reset` on a **non-test** lead.
2. Expected: 400 "Reset is only available for test leads." — nothing changes.
- [ ] Pass  [ ] Fail

**TC-03 — Reset**
1. On a test lead moved to Discovery, click **↺ Reset test lead** → confirm.
2. Expected: stage back to Enquiry; stamps cleared; correspondence/activities wiped.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. As a non-admin, `POST /api/sales/test-lead`.
2. Expected: 403 Forbidden; no "＋ Test lead" button in the UI.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (exclusions)**
1. Create a test lead, advance to Qualify, set `qualify_intro_sent_at` 8 days ago, enable `QUALIFY_FOLLOWUP_ENABLED`, run the cadence.
2. Expected: the test lead is **not** emailed (excluded); `qualify_followup_sent_at` stays null.
- [ ] Pass  [ ] Fail

**TC-06 — Real-lead backward move (feature-specific)**
1. On a real lead at Discovery, click the **Qualify** chip → confirm.
2. Expected: moves back to Qualify (no gate block). Clicking a forward gated stage still shows the 422.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
