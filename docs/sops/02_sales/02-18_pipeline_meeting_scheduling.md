---
sop_version: 1.0
last_reviewed: 2026-08-17
app_version: main
screenshot_status: placeholders_only
owner: Sales (Admin / Director)
test_status: untested
---

# SOP: Schedule pipeline meetings with Cal.com (setup + use)

**Module:** Sales
**SOP ID:** 02-18
**Status:** Draft
**Priority:** High

---

## 1. Who uses this
Admin (one-time Cal.com setup). Admin, Supervisor (day-to-day scheduling).

## 2. When to use it
Any time a sales-pipeline meeting needs to be booked: the **enquiry callback**, the **build conversation** (Qualify), the **designer concept meeting** (Discovery), or the **winning-offer presentation**. Also the one-time Cal.com setup that makes all of this work.

## 3. What this does
Every pipeline meeting becomes bookable two ways: the client **self-books** from a prefilled link (in an email or copied from the lead), or you **book it yourself** ("set a time yourself"). Whichever way, the meeting is stored on the lead and shown on the **Sales → Agenda** view. Cal.com sends the calendar invite; the Hub tracks the who/when/why.

## 4. Before you start (one-time setup — Admin)
1. **Apply migration 185** (`lead_meetings`) in the Supabase SQL editor.
2. **Create the Cal.com event types.** In your Cal.com dashboard create one event type per meeting, with these **exact slugs** (they must match the env slugs):

   | Meeting | Event slug | Typical length / location |
   |---|---|---|
   | Build conversation | `build-conversation` *(already exists)* | 30 min · phone/video |
   | Design meeting | `design-meeting` | 60 min · in person/site |
   | Concept presentation | `concept-presentation` | 60–90 min · in person/video |

3. **On EVERY event type, add two hidden booking questions** (Event type → Advanced → Booking questions → Add):
   - Identifier `leadId` — type "Short text", **Hidden**, not required.
   - Identifier `meetingType` — type "Short text", **Hidden**, not required.

   These let the webhook map each booking to the exact lead + meeting. (They fix a Cal.com quirk where the older `metadata` channel can be dropped.)
4. **Point one webhook** at `https://blueleafhub.com.au/api/webhooks/calcom`, subscribed to **Booking Created, Booking Rescheduled, Booking Cancelled**, and set its **secret** into `CAL_WEBHOOK_SECRET` on the API host.
5. **Set the env slugs** on the API host: `CAL_USERNAME`, `CAL_EVENT_SLUG`, `CAL_DESIGNER_SLUG`, `CAL_PRESENTATION_SLUG` (defaults already match the slugs above).
6. **Optional — book-on-behalf:** set `CAL_API_KEY` (a Cal.com API key). With it, "set a time yourself" creates a real Cal.com booking (invite goes out). Without it, that action still records the meeting in the Hub so it shows on the agenda — it just doesn't send an invite.

## 5. Step-by-step process (day-to-day)
**Client self-books (the default for client-facing meetings):**
1. Open the lead. On the stage's **meeting card** (e.g. "Designer concept meeting" on a Discovery lead), click **Copy client booking link**.
2. Paste it into an email/message to the client — or, for the designer meeting, it's already embedded in the Discovery email as a clickable link.
3. When they book, the card flips to **"✓ Scheduled"** with the time, on its own.

**You book it yourself:**
1. On the meeting card, click **Set a time yourself**.
2. Pick the date & time, optional duration + location → **Save meeting**.
3. If the Cal.com API is connected, an invite goes out; otherwise it's recorded in the Hub.

**See everyone's week:** Sales → **Agenda** tab → upcoming meetings across all leads, grouped by day. Click any row to open the lead.

[insert screenshot: the meeting card on a lead with Copy link / Set a time]

## 6. What happens next
The meeting is stored in `lead_meetings` and appears on the lead's card + the Sales Agenda. For the build conversation, the Discovery hard gate still opens as before. Reschedules/cancellations from Cal.com keep the card in sync automatically.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Booking doesn't appear on the lead | The event type is missing the hidden `leadId`/`meetingType` questions | Add both hidden questions to every event type (step 4.3). |
| Slugs don't match | Event slug typed differently from the env value | Use the exact slugs in the table; the env defaults already match. |
| "Set a time" sends no invite | `CAL_API_KEY` not set | Expected — it records a Hub meeting. Set the API key to send invites. |

## 8. Troubleshooting

| Problem the user sees | Most likely cause | Fix |
|----------------------|-------------------|-----|
| Agenda says "apply migration 185" | Migration not applied | Run `185_lead_meetings.sql` in Supabase. |
| A booking isn't captured | Webhook URL/secret wrong, or hidden questions missing | Confirm the webhook points at `/api/webhooks/calcom` with `CAL_WEBHOOK_SECRET`; confirm the event type has the hidden `leadId` + `meetingType` questions. |
| Copy-link copies the bare event URL | Lead has no name/email yet | Add the client's details; the link then prefills them + the leadId. |

## 9. Related modules
- [Send the Qualify email & book the build conversation](02-11_qualify_email_and_booking.md) → the first bookable meeting
- [Send the Discovery email](02-15_discovery_email.md) → carries the designer booking link
- [Move a lead through pipeline stages](02-02_move_lead_through_stages.md) → the gate model

## 10. Screenshot placeholders
[insert screenshot: Cal.com event type — hidden booking questions leadId + meetingType]
[insert screenshot: the meeting card on a Discovery lead]
[insert screenshot: Sales → Agenda view grouped by day]

## 11. Automation notes
- Booking link → `buildLeadBookingLink(lead, meetingType)` (`calcom.mjs`): prefills name/email + `leadId` + `meetingType` booking questions (+ `metadata[leadId]` fallback).
- Client books → `/api/webhooks/calcom` (`calcomWebhook.mjs`, HMAC-verified) upserts a `lead_meetings` row keyed `(lead_id, meeting_type)`; for the build conversation it also stamps the legacy `discovery_meeting_*` columns.
- Set a time yourself → `POST /api/sales/leads/:id/meetings/schedule`; creates a Cal.com booking when `CAL_API_KEY` is set (`calcomApi.mjs`), else records `booking_source='manual'`.
- Agenda → `GET /api/sales/meetings/upcoming?days=N` from `lead_meetings`.

## 12. Edge cases and limits
- Before migration 185, the cards + agenda show a friendly "not live yet" note and never error.
- The build conversation keeps working exactly as before (its event type doesn't need the new hidden questions until you want the richer mapping — it defaults to `build_conversation`).
- A booking whose `leadId` is missing falls back to matching the attendee email to the most-recent Qualify lead.
- Book-on-behalf availability depends on the slot being free in Cal.com; if the API rejects it, the Hub records a manual meeting instead of failing.

## 13. Owner of the process
Sales (Admin / Director).
Next review date: 2027-02-17

---

## 14. Troubleshoot Agent Test Script

> **For the troubleshoot agent only.** Requires migration 185 applied. Book-on-behalf tests require `CAL_API_KEY`; skip those if unset.

### Pre-test setup
- [ ] Log in as Admin.
- [ ] A lead at stage `discovery` with a valid (test-safe) email and a selected designer.
- [ ] Migration 185 applied; `CAL_*` slugs set.

### Test cases

**TC-01 — Happy path (self-book link)**
1. Open the Discovery lead → "Designer concept meeting" card → **Copy client booking link**.
2. Expected result: a `cal.com/blue-leaf-build/design-meeting?...` URL is copied; it contains `leadId=<the lead id>` and `meetingType=designer_meeting`.
- [ ] Pass  [ ] Fail

**TC-02 — Empty required field**
1. On the card, click **Set a time yourself** → leave date/time blank → **Save meeting**.
2. Expected result: inline error "Pick a date & time." — nothing saved.
- [ ] Pass  [ ] Fail

**TC-03 — Duplicate submission (upsert, not duplicate)**
1. **Set a time yourself**, save a time. Then set a different time and save again.
2. Expected result: the same meeting row updates (one `lead_meetings` row for `(lead, designer_meeting)`), not two.
- [ ] Pass  [ ] Fail

**TC-04 — Wrong role**
1. Call `POST /api/sales/leads/:id/meetings/schedule` with a non-staff (client) token.
2. Expected result: 403 Forbidden.
- [ ] Pass  [ ] Fail

**TC-05 — Automation verification (webhook capture)**
1. POST a signed BOOKING_CREATED payload to `/api/webhooks/calcom` with `responses.leadId.value` = the lead id and `responses.meetingType.value` = `designer_meeting`.
2. Expected result: 200; a `lead_meetings` row exists for that lead + `designer_meeting` with `status='scheduled'` and `scheduled_at` set; a `lead_activities` note is logged.
- [ ] Pass  [ ] Fail

**TC-06 — Agenda + build-conversation back-compat (feature-specific)**
1. Open Sales → **Agenda**; confirm the meeting from TC-03/TC-05 appears under the right day.
2. POST a signed BOOKING_CREATED with NO `meetingType` and a `metadata.leadId` (simulating the legacy build-conversation event) → expect it resolves to `build_conversation`, writes a `lead_meetings` row AND the legacy `discovery_meeting_booked_at`.
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors observed during testing
- [ ] No unexpected network errors
- [ ] Database records created with correct field values
- [ ] Update `test_status` in frontmatter to `passed` or `failed`
- [ ] Add an entry to SOP_CHANGELOG.md noting test date and result
