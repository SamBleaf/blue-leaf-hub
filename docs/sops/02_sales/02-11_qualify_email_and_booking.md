---
sop_version: 1.0
last_reviewed: 2026-08-16
app_version: main
screenshot_status: placeholders_only
owner: Sales (Admin / Director)
test_status: untested
---

# SOP: Send the Qualify email and book the build conversation

**Module:** Sales
**SOP ID:** 02-11
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Admin, Supervisor.

## 2. When to use it
A lead has reached the **Qualify** stage — either you proceeded from the Enquiry call (SOP 02-10) or a website enquiry landed here pre-scored. You want to send them our process, invite them to book a build conversation, and get them qualified enough to advance to Discovery.

## 3. What this does
Sends a warm, on-brand introduction email (built from our real "build conversation" process language, company profile attached), then a 7-day follow-up if they don't respond. When the client books via the emailed link, the meeting is marked automatically. The lead can only advance to Discovery once it scores ≥ 5 **and** a build conversation is booked.

## 4. Before you start
- The lead is at the **Qualify** stage with a valid email.
- Migrations 174–177 are applied.
- These env values are set on the API host: `QUALIFY_EMAIL_ENABLED=true` to send; a company-profile PDF at `QUALIFY_COMPANY_PROFILE_PATH` (in the `templates` bucket); `CAL_USERNAME`/`CAL_EVENT_SLUG` for the booking link; `CAL_WEBHOOK_SECRET` + the cal.com webhook pointed at `/api/webhooks/calcom`.
- The two email templates read fine in **Settings → General → Qualify emails** (edit them there in your own voice).

## 5. Step-by-step process
1. Open the Qualify-stage lead. If it came from the website it shows a **"confirm web score"** banner — review the scorecard + client details, then click **Confirm web score**.
2. In **Qualify — next step**, click **Preview & send qualify email**.
3. Read the assembled preview (subject, body, booking link). Company profile attaches on send.
4. Click **Send email**.
5. The client receives the email and books a **build conversation** via the link. When they do, the panel flips to **"✓ Build conversation booked"** on its own.
6. Once the score is ≥ 5 and the meeting is booked, use **Move to Discovery →**.

> 💡 **Tip:** You don't book the meeting for them — the client books via the link in the email, and the webhook marks it. If they go quiet, the 7-day follow-up sends automatically (when enabled).

[insert screenshot: the Qualify action panel with Preview & send + booking status]

## 6. What happens next
The intro email is logged to the lead's mailbox/timeline. If no reply/booking in 7 days, the follow-up email sends (once per lead). When the client books, the discovery-meeting fields are stamped and the Discovery hard gate opens. Advancing to Discovery is then a single click.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Trying to advance to Discovery too early | Score ≥ 5 but no meeting | Both are required — send the email so they book. |
| Editing the email to add client's raw words | Wanting it personal | Keep it template-driven; personal touches belong in a mailbox reply, not the templated intro. |
| Sending returns "turned off" | `QUALIFY_EMAIL_ENABLED` not set | Preview always works; set the flag on the API host to send. |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "Qualify email sending is turned off" | `QUALIFY_EMAIL_ENABLED` unset | Set it to `true` in Railway; redeploy. |
| No company profile attached | `QUALIFY_COMPANY_PROFILE_PATH` unset/wrong | Upload the PDF to the `templates` bucket and set the path. |
| Booking didn't mark the meeting | Webhook secret/URL wrong, or leadId not forwarded | Check the cal.com webhook points at `/api/webhooks/calcom` with `CAL_WEBHOOK_SECRET`; confirm the booking carried `metadata[leadId]`. |
| Can't advance to Discovery | No booked meeting | The 422 tells you what's missing — send the email so they book. |

## 9. Related modules
- [Run the Enquiry call](02-10_enquiry_call_script.md) → the prior stage
- [The lead mailbox](02-12_lead_mailbox.md) → two-way email with the client
- [Move a lead through pipeline stages](02-02_move_lead_through_stages.md) → the gate model

## 10. Screenshot placeholders
[insert screenshot: confirm-web-score banner]
[insert screenshot: qualify email preview modal]
[insert screenshot: "Build conversation booked" status]

## 11. Automation notes
- Send intro → email via SMTP (mirrors to Sent); `leads.qualify_intro_sent_at` + `qualify_email_sent_at` stamped; an outbound `correspondence` row (lead_id) + a `lead_activities` "email" row.
- 7-day follow-up (when `QUALIFY_FOLLOWUP_ENABLED=true`) → one email if still `qualify` / not booked / no reply; `leads.qualify_followup_sent_at` stamped (never sends twice).
- Client books → `/api/webhooks/calcom` sets `discovery_meeting_at`, `discovery_meeting_booked_at`, `calcom_*` fields; logs an activity. No manual tick.
- Advance to Discovery → blocked (HTTP 422 `GATE_BLOCKED`) unless score ≥ 5 AND meeting booked.

## 12. Edge cases and limits
- Preview works even with sending disabled, so you can review copy before go-live.
- Reschedule/cancel from cal.com keeps the lead in sync (cancel clears the booked flag → the gate closes again).
- Before migration 174 the hard gate is advisory (won't block); after 174 it enforces.
- A booking whose `metadata[leadId]` is missing falls back to matching the attendee email to the most-recent qualify lead.

## 13. Owner of the process
Sales (Admin / Director).
Next review date: 2027-02-16

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Requires migrations 174–177 applied and `QUALIFY_EMAIL_ENABLED=true`.

### Pre-test setup
- [ ] Log in as Admin.
- [ ] A lead at stage `qualify` with a valid (test-safe) email.
- [ ] `QUALIFY_EMAIL_ENABLED=true`; SMTP configured; `CAL_USERNAME`/`CAL_EVENT_SLUG` set.

### Test cases

**TC-01 — Happy path (preview + send)**
1. Open the qualify lead → **Preview & send qualify email** → read preview → **Send email**.
2. Expected result: success message; panel shows "Qualify email sent …".
3. Expected DB: `leads.qualify_intro_sent_at` set; an outbound `correspondence` row with `lead_id`, `direction='outbound'`, a `message_id`.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. In Settings → Qualify emails, clear the intro subject and Save.
2. Expected result: validation error "Both templates need a subject and a message." — not saved.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission**
1. Complete TC-01, then click Send again.
2. Expected result: a second email sends (re-send is allowed) and a second outbound `correspondence` row is logged. `qualify_intro_sent_at` is refreshed. (No crash / no duplicate lead.)
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Call `POST /api/sales/leads/:id/qualify-email/send` with a non-staff (client) token.
2. Expected result: 403 Forbidden.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (hard gate + webhook)**
1. On a lead scoring ≥ 5 but with NO booked meeting, try **Move to Discovery**.
2. Expected result: blocked — 422 `GATE_BLOCKED`, message names "a booked build conversation".
3. POST a signed BOOKING_CREATED payload to `/api/webhooks/calcom` with `metadata.leadId` = the lead.
4. Expected result: 200; `leads.discovery_meeting_booked_at` set; advancing to Discovery now succeeds.
- [ ] Pass  [ ] Fail

**TC-06 — Follow-up cadence (feature-specific)**
1. With `QUALIFY_FOLLOWUP_ENABLED=true`, set `qualify_intro_sent_at` to 8 days ago on a qualify lead with no booking/reply, then POST `/api/cron/lead-replies` is not this one — run the follow-up tick (or call `runQualifyFollowups`).
2. Expected result: one follow-up email; `leads.qualify_followup_sent_at` set. Running again does NOT resend.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
