---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin / Staff
test_status: static_pass
---

# SOP 02-03: Log a Call, Meeting or Note

**Module:** Sales Manager — Lead Detail → Activity / Timeline  
**SOP ID:** 02-03  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Staff

## 2. When to use it
Every time you have contact with a lead or take any sales action — phone call, email, site visit, meeting, or even something you want to note down for later. Log it the same day, ideally immediately after.

**The rule:** if it's not logged, it didn't happen. The pipeline health report, days-in-stage calculations, and "last activity" tracking all depend on logged activities.

## 3. What this does
Creates an activity record on the lead's timeline. Updates `last_activity_at` on the lead. Optionally sets a next action (what to do after this interaction and when).

## 4. Before you start
- The lead must exist (SOP 02-01)
- Open the lead's detail page

## 5. Step-by-step process

1. Click the lead card on the pipeline board to open the lead detail
2. Go to the **Timeline** or **Activity** section of the lead detail
3. Click **Log activity** or **+ New activity**
4. Fill in:
   - **Activity type** — call / email / meeting / note / site visit / follow-up
   - **Summary** — brief plain English description (required), e.g. "Called re: Burnside site, keen to meet"
   - **Detail** (optional) — longer notes, what was discussed
   - **Next action** (optional) — what to do next and when, e.g. "Call back next Tuesday re: fee proposal"
   - **Next action date** (optional) — when to follow up
5. Click **Save** or **Log**

The activity appears at the top of the timeline. The lead's `last_activity_at` updates immediately.

## 6. Activity types

| Type | When to use |
|------|------------|
| Call | Phone call — inbound or outbound |
| Email | 1:1 email (not a bulk campaign) |
| Meeting | In-person or video meeting |
| Note | Something to record that wasn't direct contact (e.g. "Saw on LinkedIn they've sold their house") |
| Site visit | They visited a site, display home, or project under construction |
| Follow-up | A reminder to yourself with a due date |

## 7. Setting a next action

After every interaction, think: what is the next step with this person?

Enter it in the **Next action** field with a due date. This populates `leads.next_action` and `leads.next_action_date`. The pipeline scorecard and overdue tracking use this field to flag leads that have fallen off the radar.

If you don't set a next action, the existing next action stays. Always update it after any meaningful interaction.

## 8. What happens after logging

- `lead_activities` row created with the activity type, summary, detail, next action, next action date
- `leads.last_activity_at` → now
- `leads.next_action` and `leads.next_action_date` updated if you set them
- Activity appears in the timeline immediately

## 9. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Vague summaries like "called" | Rushing | Write something you'd understand in 6 months. "Called re: budget — they're at $1.2M" beats "called". |
| Logging at end of day in bulk | Busy during calls | Even a 2-word summary logged immediately is better than a detailed note logged 8 hours later. |
| Forgetting to set a next action | Feels like extra work | Without a next action, the lead falls off your radar. Set it every time. |
| Logging as "note" when it was a call | Doesn't seem to matter | The activity type affects reporting. Use the correct type. |

## 10. Troubleshooting

| Problem | Solution |
|---------|----------|
| Summary required error | The summary field is mandatory — enter at least a brief description |
| Activity not showing in timeline | Refresh the page. Check the timeline is sorted descending (newest first). |
| next_action_date not appearing in pipeline | The pipeline view shows `next_action_date` only if it's set. If the field is blank, it won't show. |

## 11. Related SOPs
- [Move a lead through stages](02-02_move_lead_through_stages.md) — SOP 02-02
- [Analyse a transcript](02-06_transcript_analysis.md) — SOP 02-06

## 12. Screenshot placeholders
[insert screenshot: Lead detail timeline with activities logged]
[insert screenshot: Log activity form with all fields]

## 13. Automation notes
- API: `POST /api/sales/leads/:id/activities` with `{ activity_type, summary, detail, next_action, next_action_date }`
- `summary` is required — returns 400 if blank
- After insert: updates `leads.last_activity_at`, `leads.next_action`, `leads.next_action_date` if those fields are provided
- No activity can be deleted (audit trail) — if logged incorrectly, add a new Note activity explaining the correction

## 14. Owner of the process
Admin / Staff  
Next review: 2026-11-29

---

## 15. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] At least 1 lead exists
- [ ] Logged in as Admin or Staff

### Test cases

**TC-01 — Log a call (happy path)**
1. Open a lead detail
2. Click Log activity
3. Fill: Type = Call, Summary = "Audit test call — discussed project timeline"
4. Set next action: "Follow up email", due = next week
5. Click Save
6. Expected result: activity appears at top of timeline
7. Expected DB: `lead_activities` row with `activity_type = 'call'`, `summary` as entered, `next_action = 'Follow up email'`
8. Expected DB: `leads.last_activity_at` = approximately now
- [ ] Pass  [ ] Fail

**TC-02 — Summary required**
1. Open log form
2. Leave summary blank
3. Click Save
4. Expected result: validation error "summary required", no insert
- [ ] Pass  [ ] Fail

**TC-03 — Next action updates on lead**
1. Log an activity with next_action = "Call back" and next_action_date = tomorrow
2. Expected DB: `leads.next_action = 'Call back'`, `leads.next_action_date = tomorrow`
3. Check the lead card on the pipeline board — next action date should be visible
- [ ] Pass  [ ] Fail

**TC-04 — Multiple activities build the timeline**
1. Log 3 separate activities on the same lead
2. Expected: timeline shows all 3 activities in reverse chronological order (newest at top)
- [ ] Pass  [ ] Fail

**TC-05 — Activity without next action doesn't clear existing next action**
1. Check current `leads.next_action` before the test
2. Log an activity with NO next action fields filled
3. Expected: `leads.next_action` and `leads.next_action_date` are unchanged
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Activity logs correctly to DB
- [ ] last_activity_at updates
- [ ] next_action fields update when provided
- [ ] Timeline displays in correct order
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
