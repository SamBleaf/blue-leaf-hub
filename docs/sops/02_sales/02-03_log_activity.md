---
sop_version: 2.0
last_reviewed: 2026-07-02
app_version: Pass 3A — Lead command centre
screenshot_status: not_applicable
owner: Admin / Staff
test_status: untested
---

# SOP 02-03: Log a Call, Meeting or Note

**Module:** Sales Manager — Lead Detail → Activity tab / timeline
**SOP ID:** 02-03
**Status:** Current
**Priority:** High

---

## 1. Who uses this
Admin, Staff

## 2. When to use it
Every time you have contact with a lead or take any sales action — phone call, email, site visit, meeting, or something you want to note down for later. Log it the same day, ideally immediately after.

**The rule:** if it is not logged, it did not happen. The pipeline health report, days-in-stage calculations, and "last activity" tracking all depend on logged activities.

## 3. What this does
Creates an activity record on the lead's unified timeline. Updates `last_activity_at` on the lead. Optionally sets or updates the next action (what to do after this interaction and when).

**Activity types:**

| Type | When to use |
|------|------------|
| Note | Something to record that was not direct client contact (e.g. "Saw on LinkedIn they've sold their house") |
| Call | Phone call — inbound or outbound |
| Email | 1:1 email sent or received (not a bulk campaign) |
| Meeting | In-person or video meeting |

> Note: the command-centre log form offers four types — Note, Call, Email, Meeting. The legacy pipeline QuickNote modal (accessible from the board via the "Note" hover button on a lead card) offers the same four types plus a slightly different layout. Both post to the same `POST /api/sales/leads/:id/activities` endpoint.

**The unified timeline:**

Below the Log Activity form is the **unified timeline** (`LeadUnifiedTimeline`). It shows:
- All logged activities (calls, emails, meetings, notes)
- Stage-change events (automatically inserted by the system when you advance the lead)
- Conversation-analysis events (inserted when you apply a transcript via the Conversations block — see SOP 02-06)

The timeline is sorted newest-first. Each entry shows the activity type icon, summary, author, and relative timestamp (e.g. "3h ago", "2d ago").

If the Supabase `lead_activity_timeline` view is missing (migration not yet applied), the timeline falls back to showing only the raw `lead_activities` rows — behaviour is the same, display format may differ slightly.

## 4. Before you start
- The lead must exist (SOP 02-01)
- Open the lead's detail page (click the lead card on the pipeline board)

**Where to find the Log Activity form:**

**Desktop:**
The **Log Activity** form lives in the main workspace (left column) under the "Conversations & activity" section heading. Scroll down past the focus panel and any earlier-stage accordion sections to reach it.

**Mobile:**
Tap the **Activity** tab in the mobile tab bar at the top of the lead detail. The Log Activity form appears at the top of that tab's content.

## 5. Step-by-step process

1. Open the lead detail page (click the card on the pipeline board).
2. **Desktop:** scroll down in the main workspace to find the "Conversations & activity" section, then the **Log Activity** card.
   **Mobile:** tap the **Activity** tab.
3. In the Log Activity card:
   a. Select the **activity type** from the dropdown: Note / Call / Email / Meeting.
   b. Type a **summary** in the text area (required) — plain English, e.g. "Called re: Burnside site, keen to meet next week".
   c. Optionally fill in the **Next action** field (what to do next, e.g. "Send fee proposal").
   d. Optionally fill in the **Next action date** field (the due date for that next step).
4. Click **Save Activity**.
5. The entry appears immediately at the top of the unified timeline below the form.

## 6. What happens next

- `lead_activities` row created with `activity_type`, `summary`, `next_action`, `next_action_date`, `created_at`, `created_by`
- `leads.last_activity_at` → now
- `leads.next_action` and `leads.next_action_date` updated if you set them
- Activity appears in the unified timeline immediately (page reloads the lead data)

**Setting a next action:**

After every interaction, think: what is the next step with this person?

Enter it in the **Next action** field with a due date. This populates `leads.next_action` and `leads.next_action_date`. The pipeline scorecard and overdue tracking use these fields to flag leads that have fallen off the radar.

The next action is also visible in:
- The **lead card** on the pipeline board (next action text + due date shown as a chip)
- The **Actions view** of the pipeline (`?view=actions`) which sorts by urgency
- The **List view** which shows a Next Action column

If you do not set a next action, the existing next action stays. Always update it after any meaningful interaction.

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Vague summaries like "called" | Rushing | Write something you would understand in 6 months. "Called re: budget — they're at $1.2M" beats "called". |
| Logging at end of day in bulk | Busy during calls | Even a 2-word summary logged immediately is better than a detailed note logged 8 hours later. |
| Forgetting to set a next action | Feels like extra work | Without a next action, the lead falls off your radar. Set it every time. |
| Logging as "note" when it was a call | Doesn't seem to matter | The activity type affects reporting. Use the correct type. |
| Scrolling past the Log Activity form | Desktop workspace is long | On desktop: the Log Activity card is in the "Conversations & activity" section — scroll past the focus panel. On mobile: use the Activity tab. |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Cannot find the Log Activity form | Desktop: scroll down in the main workspace to "Conversations & activity". Mobile: tap the Activity tab. |
| "Save Activity" button is greyed out | The summary field is required — enter at least a brief description. |
| Activity not showing in timeline | Refresh the page. Check the timeline is visible (it appears below the Log Activity form). |
| `next_action_date` not appearing on the pipeline card | The pipeline card shows `next_action_date` only if it is set. Confirm it was saved — open the lead and check the date is populated. |

## 9. Related SOPs
- [Move a lead through stages](02-02_move_lead_through_stages.md) — SOP 02-02
- [Analyse a transcript](02-06_transcript_analysis.md) — SOP 02-06
- [Blueprint Insight AI coaching](02-05_blueprint_insight.md) — SOP 02-05

## 10. Screenshot placeholders
[insert screenshot: Desktop lead command centre — "Conversations & activity" section with Log Activity card visible]
[insert screenshot: Mobile — Activity tab selected, Log Activity form at top]
[insert screenshot: Log Activity form with type dropdown, summary textarea, next action fields]
[insert screenshot: Unified timeline showing mix of activities and stage-change events]

## 11. Automation notes
- API: `POST /api/sales/leads/:id/activities` with `{ activity_type, summary, next_action, next_action_date }`
- `summary` is required — server returns 400 if blank
- After insert: updates `leads.last_activity_at`, `leads.next_action`, `leads.next_action_date` if those fields are provided in the body
- No activity can be deleted (audit trail) — if logged incorrectly, add a new Note activity explaining the correction
- The unified timeline is served from `GET /api/sales/leads/:id/timeline` — falls back to raw `lead_activities` if the `lead_activity_timeline` view is missing (viewMissing flag)

## 12. Edge cases and limits
- No activity can be deleted — the table is an audit trail. Add a correcting Note if an activity was logged incorrectly.
- The `lead_activity_timeline` view may be missing if migration has not been applied — the timeline falls back to raw `lead_activities` rows with slightly different display format.
- Activities without a next_action set do not clear the existing `leads.next_action` — the field is only updated when `next_action` is explicitly provided in the request body.

## 13. Owner of the process
Admin / Staff
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least 1 lead exists
- [ ] Logged in as Admin or Staff

### Test cases

**TC-01 — Log a call from desktop (happy path)**
1. Open a lead detail on desktop (viewport ≥ lg)
2. Scroll down the main workspace to the "Conversations & activity" section
3. In the Log Activity card: select Type = Call, enter summary = "Audit test call — discussed project timeline", set next action = "Follow up email", set next action date = next week
4. Click Save Activity
5. Expected result: the unified timeline immediately shows the new activity at the top
6. Expected DB: `lead_activities` row with `activity_type = 'call'`, `summary` as entered, `next_action = 'Follow up email'`
7. Expected DB: `leads.last_activity_at` = approximately now
- [ ] Pass  [ ] Fail

**TC-02 — Log a note from mobile Activity tab**
1. Open a lead detail on a mobile-width viewport (< lg)
2. Tap the Activity tab in the mobile tab bar
3. Enter Type = Note, summary = "Mobile audit note", no next action
4. Click Save Activity
5. Expected: timeline entry appears with type icon and summary
- [ ] Pass  [ ] Fail

**TC-03 — Summary required validation**
1. Open the Log Activity form
2. Leave the summary field blank
3. Expected result: "Save Activity" button remains disabled (grey) — no request sent
- [ ] Pass  [ ] Fail

**TC-04 — Next action updates on the lead record**
1. Log an activity with next_action = "Call back" and next_action_date = tomorrow
2. Expected DB: `leads.next_action = 'Call back'`, `leads.next_action_date = tomorrow`
3. Navigate to the pipeline board — check the lead card shows the next action chip
- [ ] Pass  [ ] Fail

**TC-05 — Activity without next action does not clear existing next action**
1. Note the current `leads.next_action` before the test
2. Log an activity with the next action fields left blank
3. Expected: `leads.next_action` and `leads.next_action_date` are unchanged
- [ ] Pass  [ ] Fail

**TC-06 — Feature case: multiple activities build the timeline in correct order**
1. Log 3 separate activities on the same lead with a brief pause between each
2. Expected: the unified timeline shows all 3 entries, newest first
3. Expected: stage-change events from earlier advances also appear in the timeline interleaved by date
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Log Activity form found in expected location (desktop main workspace + mobile Activity tab)
- [ ] Activity logs correctly to DB
- [ ] `last_activity_at` updates
- [ ] next_action fields update when provided
- [ ] Timeline displays in correct chronological order (newest first)
- [ ] Summary required validation works (button disabled, not a post-submit error)
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
