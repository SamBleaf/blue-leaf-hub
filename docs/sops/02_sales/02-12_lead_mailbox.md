---
sop_version: 1.0
last_reviewed: 2026-08-16
app_version: main
screenshot_status: placeholders_only
owner: Sales (Admin / Director)
test_status: untested
---

# SOP: Use the lead mailbox (two-way email)

**Module:** Sales
**SOP ID:** 02-12
**Status:** Draft
**Priority:** Medium

---

## 1. Who uses this
Admin, Supervisor.

## 2. When to use it
Any time you want to email a lead from inside the Hub, or read their reply, without leaving the lead. All correspondence for a lead lands in one thread.

## 3. What this does
Shows a Mail-app-style thread of every email sent to and received from the lead, and lets you compose or reply in place. Sent mail goes out over your real mail server (so it also appears in your Sent folder), and client replies are matched back to the lead and threaded automatically.

## 4. Before you start
- The lead has a valid email.
- Migrations 175–177 are applied (the mailbox reads degrade softly before that).
- To SEND: `LEAD_MAILBOX_ENABLED=true` on the API host. To RECEIVE: IMAP configured (`IMAP_HOST`/`IMAP_USER`/`IMAP_PASS`) so the poller can match replies.

## 5. Step-by-step process
1. Open the lead (Enquiry or Qualify stage) → the **Mailbox** panel.
2. Read the thread — **Sent** messages are tinted, **Received** are plain.
3. To reply, click **Reply** on a message (it prefills "Re: …" and threads to that message). To start fresh, just type a **Subject** + message.
4. Click **Send**. Your signature is appended automatically.

> 💡 **Tip:** Replies from the client show up here on their own within ~10 minutes (the mailbox poller). You don't need to forward anything.

[insert screenshot: the lead mailbox thread + compose box]

## 6. What happens next
The sent email is logged as an outbound message and appears in the thread + the lead timeline. When the client replies, the poller inserts an inbound message and (if they were mid-Qualify) suppresses the 7-day follow-up.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| "Sending is turned off" | `LEAD_MAILBOX_ENABLED` unset | Set it on the API host to enable compose/reply. |
| Expecting replies instantly | Poller runs on an interval | Give it ~10 minutes, or trigger `/api/cron/lead-replies`. |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| "activates once migration 175 is applied" | Migration 175 not applied | Apply it in Supabase. |
| Reply didn't appear | IMAP not configured, or matched no lead | Confirm IMAP env is set; the reply must be from the lead's email or be a reply to a Hub-sent message. |
| Send fails | No valid lead email, or transport down | Check the lead's email; check SMTP. |

## 9. Related modules
- [Send the Qualify email + book the build conversation](02-11_qualify_email_and_booking.md) → the intro email lands in this thread
- [Trust rail and timeline](02-09_trust_rail_and_timeline.md) → correspondence also shows on the timeline

## 10. Screenshot placeholders
[insert screenshot: mailbox with a sent + received message]
[insert screenshot: reply compose prefilled with "Re:"]

## 11. Automation notes
- Send → SMTP via `sendPlainMail` (mirrors to Sent) with a generated `Message-ID` and `In-Reply-To`; an outbound `correspondence` row (lead_id) + a `lead_activities` "email" row.
- Receive → `leadInboundMatch` polls IMAP, matches by `In-Reply-To` → stored `message_id`, else sender email → most-recent active lead; inserts an inbound `correspondence` row; bumps `leads.last_activity_at`.
- Dedup → a message is never inserted twice (checked by `message_id`).

## 12. Edge cases and limits
- Before migration 175 the thread shows a soft "activates once migration 175 is applied" note.
- An inbound email that matches no lead is left alone (not attached anywhere).
- Body is stored up to ~20,000 characters.
- Outbound + inbound both remain visible in the real mailbox (nothing is moved or deleted).

## 13. Owner of the process
Sales (Admin / Director).
Next review date: 2027-02-16

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Requires migrations 175–177 applied; `LEAD_MAILBOX_ENABLED=true`; IMAP configured.

### Pre-test setup
- [ ] Log in as Admin.
- [ ] A lead with a valid, test-controlled email address.
- [ ] `LEAD_MAILBOX_ENABLED=true`; SMTP + IMAP configured.

### Test cases

**TC-01 — Happy path (send)**
1. Open the lead → Mailbox → type a subject + message → **Send**.
2. Expected result: "Sent."; the message appears as a **Sent** bubble.
3. Expected DB: an outbound `correspondence` row with `lead_id`, `direction='outbound'`, a `message_id`.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. Leave the subject blank → **Send** is disabled; if forced via API, expected 400 "Subject and message are both required."
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate inbound**
1. Run the poller twice over the same inbound reply (`POST /api/cron/lead-replies`).
2. Expected result: only ONE inbound `correspondence` row exists (dedup by `message_id`).
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Call `POST /api/sales/leads/:id/email` with a client token.
2. Expected result: 403 Forbidden.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (inbound match)**
1. Reply from the lead's email to the Hub-sent message.
2. Run `POST /api/cron/lead-replies`.
3. Expected result: an inbound `correspondence` row for the lead; the thread shows a **Received** bubble; `leads.last_activity_at` bumped.
- [ ] Pass  [ ] Fail

**TC-06 — Send disabled (feature-specific)**
1. Set `LEAD_MAILBOX_ENABLED` unset/false; try to send.
2. Expected result: 503 "Lead mailbox sending is turned off." — no `correspondence` row.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
