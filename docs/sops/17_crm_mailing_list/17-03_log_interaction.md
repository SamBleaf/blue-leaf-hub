---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: 1.0 — built 2026-05-29
screenshot_status: not_applicable
owner: Admin / Staff
test_status: untested
---

# SOP 17-03: Log an Interaction

**Module:** Sales → Contacts → Contact Drawer → Log Interaction  
**SOP ID:** 17-03  
**Status:** Draft (built — not yet deployed)  
**Priority:** High

---

## 1. Who uses this
Admin, Staff

## 2. When to use it
Every time you have any contact with a CRM contact — call, email, DM, meeting. Log it immediately after the interaction, while the details are fresh.

**The rule:** if it's not logged, it didn't happen. The relationship score, speed-to-lead metric, and "last contact date" all depend on logged interactions.

## 3. What this does
Creates an interaction record on the contact's timeline. Updates `last_contact_date`. Recalculates the relationship score. If the contact has been converted to a lead and this is your first outbound interaction, sets `first_replied_at` on the lead (APB speed-to-lead metric).

For converted contacts, the interaction is also indexed against the lead (via `lead_id`) so it appears in the unified **Full history** timeline in both the Contact Drawer and the Lead Detail page.

Optionally sets the next action on the contact — what to do after this interaction.

## 4. Before you start
- The contact must exist in the CRM (see SOP 17-02)
- You can log from the Contact Drawer (from either the Contacts list or the Relationship Dashboard)

## 5. Step-by-step process

**Logging an interaction:**
1. Open the contact drawer (click on the contact from Contacts list or Dashboard)
2. Click **Log Interaction**
3. Fill in:
   - **Type** — call / email / SMS / DM / meeting / site visit / note / follow-up / content sent / email campaign
   - **Direction** — outbound (you initiated) or inbound (they contacted you)
   - **Summary** — brief plain English description, e.g. "Called re: Burnside site — keen to meet this month"
   - **Detail** (optional) — longer notes, what was discussed
4. Set the **next action**:
   - Type: call / email / meeting / DM / none / waiting
   - Due date: when to follow up
   - Notes: what to discuss (optional) — e.g. "Ask about the Stirling site"
5. Click **Log Interaction**

The drawer updates immediately with the new interaction in the timeline.

**Interaction types explained:**

| Type | When to use |
|------|------------|
| Call | Phone call |
| Email | 1:1 email (not a bulk campaign send) |
| SMS | Text message |
| DM | Instagram or Facebook direct message |
| Meeting | In-person or video meeting |
| Site Visit | They visited a site or display home |
| Note | Something you want to record that wasn't direct contact (e.g. "Saw on LinkedIn they've sold their house — may be ready to build soon") |
| Follow-up | A reminder to yourself to follow up |
| Content Sent | You personally sent them a piece of content (not via mailing list — that's Email Campaign) |
| Email Campaign | Auto-logged by the system when a mailing list send reaches them |

**Setting the next action:**

After every interaction, decide: what is the next step with this person?

- **Call/Email/Meeting/DM** + due date = active action. Shows in Today's Actions when due.
- **Waiting** = you're waiting for them to respond. No due date. Won't show as overdue.
- **None** = no action needed right now (e.g. Past Client not currently active).

If you don't set a next action, the contact's existing next action stays in place.

[insert screenshot: Log Interaction form open in contact drawer]

## 6. What happens next
- Interaction appears at top of the contact's timeline
- `last_contact_date` updated to today
- Relationship score recomputed. **Score components:** calls/meetings/site visits = +3 each (capped at 15); email campaign opens = +1 each (capped at 10); recent contact (any interaction in last 30 days) = +5; referrals = +15 each (capped at 45); no contact >90 days = −10. Note: email, SMS, DM, and follow-up log types do NOT add to the "+3 personal" bucket — only call, meeting, and site visit do.
- If outbound + contact has `converted_lead_id` + lead has no `first_replied_at` → `first_replied_at` set now (speed-to-lead captured)
- For converted contacts: interaction row is back-linked to the lead (`crm_interactions.lead_id` set) so it appears in the lead's unified timeline
- Next action updates if you set one

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Forgetting to log until the end of the day | Calls happen fast | Log immediately after ending the call. It takes 30 seconds. |
| Writing vague summaries like "called, spoke" | Rushing | Write something you'd understand 6 months later. "Called re: Burnside site" is better than "called". |
| Not setting a next action | Feels like extra work | Without a next action, the contact disappears from your radar. Every interaction should end with "next I will..." |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| Summary field required error | "Summary is required" — type at least a brief description of the interaction |
| Speed-to-lead not updating | Check the contact has `converted_lead_id` set (they've been converted to a lead) and that direction = outbound. Only outbound interactions trigger this. |
| Old next action still showing after log | You didn't fill in the next action fields in the log form. Set them next time, or update the next action directly on the contact. |

## 9. Related modules
- [Add and manage contacts](17-02_contacts.md)
- [Relationship dashboard](17-01_relationship_dashboard.md)

## 10. Screenshot placeholders
[insert screenshot: Interaction timeline showing logged interactions]

## 11. Automation notes
- `POST /api/crm/contacts/:id/interact` handles all interaction logging
- After insert: updates `crm_contacts.last_contact_date = today`; recomputes relationship score from all interactions using `scoreContact()` (calls/meetings/site_visits = +3 each capped at 15; email_campaign opens = +1 capped at 10; recent contact bonus = +5; referrals = +15 capped at 45; >90d no contact = −10)
- `first_replied_at` check: only fires if `direction = 'outbound'`, `contact.converted_lead_id IS NOT NULL`, and `lead.first_replied_at IS NULL`
- `crm_interactions.lead_id`: set on new interactions for converted contacts; historical rows already back-filled at convert time

## 12. Edge cases and limits
- Interaction type `email_campaign` is auto-logged by the mailing list system when a bulk email is sent — staff should not manually log these
- Interactions cannot be deleted (audit trail). If you logged something incorrectly, add a new "Note" interaction explaining the correction.
- The system does not prevent duplicate logging — if you log the same call twice, two rows will appear in the timeline

## 13. Owner of the process
Admin / Staff  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Log in as Admin
- [ ] At least 1 crm_contact exists with `status = 'active'`

### Test cases

**TC-01 — Log interaction successfully**
1. Open a contact drawer
2. Click Log Interaction
3. Fill: Type = Call, Direction = Outbound, Summary = "Test call — discussed build timeline"
4. Set next action: Type = Email, Due = next week
5. Click Log Interaction
6. Expected result: interaction appears in the timeline immediately
7. Expected DB: `crm_interactions` row with correct fields; `crm_contacts.last_contact_date = today`
- [ ] Pass  [ ] Fail

**TC-02 — Summary required**
1. Open log form
2. Leave summary blank
3. Click Log Interaction
4. Expected result: "summary is required" error shown, no DB insert
- [ ] Pass  [ ] Fail

**TC-03 — Next action updates on contact**
1. Log interaction with nextActionType = "meeting", nextActionDueDate = next Monday
2. Close and reopen the contact drawer
3. Expected result: next action shows "Meeting · [next Monday]"
4. Expected DB: `crm_contacts.next_action_type = 'meeting'`, `next_action_due_date = next Monday`
- [ ] Pass  [ ] Fail

**TC-04 — Relationship score recalculates after personal interaction**
1. Note the contact's current relationship score
2. Log a Call (type = `call`, counts as a "personal" interaction worth +3)
3. Expected result: relationship score increases by up to +3 (unless the personal-interaction cap of 15 has already been reached via prior calls/meetings/site visits)
4. Expected DB: `crm_contacts.relationship_score` updated, `relationship_score_updated_at = now()`
5. Confirm: logging an Email or SMS type does NOT add to the +3 bucket (email/sms/dm/follow_up/content_sent are not personal for scoring purposes)
- [ ] Pass  [ ] Fail

**TC-05 — Speed to lead set on first outbound interaction**
1. Create a contact, convert to lead
2. Check `leads.first_replied_at IS NULL`
3. Log an outbound interaction on the original contact (direction = outbound)
4. Expected DB: `leads.first_replied_at` is now set to approximately now
- [ ] Pass  [ ] Fail

**TC-06 — Waiting status not overdue on dashboard**
1. Log an interaction with nextActionType = "waiting" (no due date)
2. Go to Relationship Dashboard
3. Expected result: this contact does NOT appear in Today's Actions (waiting = not overdue)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Interaction logs and appears in timeline
- [ ] Score recalculates correctly
- [ ] Speed to lead triggers correctly
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
