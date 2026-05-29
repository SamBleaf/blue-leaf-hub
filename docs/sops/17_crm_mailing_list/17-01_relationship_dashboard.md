---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built 2026-05-29
screenshot_status: not_applicable
owner: Admin / Staff
test_status: untested
---

# SOP 17-01: Use the Relationship Dashboard

**Module:** Sales → Relationships tab  
**SOP ID:** 17-01  
**Status:** Draft (built — not yet deployed)  
**Priority:** High

---

## 1. Who uses this
Admin, Staff (sales role)

## 2. When to use it
Every morning. Open the Relationship Dashboard before anything else. It tells you exactly who to contact today — no guessing.

## 3. What this does
Shows all contacts with actions due today, overdue, or due this week. Shows your top relationships by score. Shows pipeline health: active prospects, future pipeline, speed to lead.

The key metric: **speed to lead** — average hours between a lead being created and the first outbound contact logged. APB target is under 1 hour. The dashboard shows the current average with a warning if it exceeds 4 hours.

## 4. Before you start
- No setup needed — dashboard loads from existing contact data
- Contacts must exist in the system (see SOP 17-02 to add contacts)
- Interactions must be logged for "last contact" dates to be current

## 5. Step-by-step process

**Reading the action list:**
1. Go to **Sales → Relationships**
2. Today's Actions panel shows contacts with actions due today, overdue (red), or this week
3. 🔴 Red = overdue action. Take action immediately.
4. 🟡 Yellow = due today.
5. ⚪ White = due this week.
6. Click **Log →** next to any contact to open their contact drawer and log the interaction inline

**Reading the stats row:**
- **Overdue actions** — how many contacts have a past-due action. Target: 0.
- **No contact >90d** — contacts with no logged interaction in 90+ days. These are relationship at risk.
- **New this month** — contacts created this calendar month.
- **Avg speed to lead** — if this shows a warning (⚠), discuss with the team. It means leads are being left waiting too long.

**Top Relationships panel:**
- Lists your highest-scoring contacts in order
- Score is 0–100, computed automatically from interactions, referrals, email opens
- Click any name to open their contact drawer

**Navigating to full contact list:**
- Click **See all contacts →** or navigate to **Sales → Contacts**

## 6. What happens next
- Logging an interaction updates the contact's `last_contact_date` and recalculates their relationship score
- Setting a next action clears the contact from the overdue list once the new due date is in the future

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Not opening the dashboard daily | Feels optional | Make it the first tab you open each morning. It will have things to do. |
| Seeing "No contact >90 days: 12" and ignoring it | Feels overwhelming | Pick the top 3 by relationship score and call them. Don't try to fix all 12 at once. |
| Speed to lead showing 8+ hours | Lead emails going unread | Check email and lead notifications. Respond within the hour even if just to acknowledge. |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| Dashboard shows no actions | Either all actions are up to date (good!) or no next_action_due_date has been set on contacts. Check Contacts list and ensure each active contact has a next action. |
| Relationship score not updating | Score updates when an interaction is logged. If you made a call but didn't log it, the score won't change. Always log interactions. |

## 9. Related modules
- [Add and manage contacts](17-02_contacts.md)
- [Log an interaction](17-03_log_interaction.md)
- [Mailing lists](17-04_mailing_lists.md)

## 10. Screenshot placeholders
[insert screenshot: Relationship Dashboard — full view with action list and stats]

## 11. Automation notes
- Dashboard loads via `GET /api/crm/dashboard` — no AI, all deterministic
- Speed to lead: computed from `leads.first_replied_at - leads.created_at` for leads in last 30 days where `first_replied_at IS NOT NULL`
- `first_replied_at` is set automatically when the first outbound interaction is logged for a converted contact

## 12. Edge cases and limits
- The dashboard shows at most 20 action contacts (the most urgent ones)
- Speed to lead only includes leads that have had at least one outbound interaction — if all leads are waiting, the metric shows null (—)
- Contacts with `next_action_type = 'none'` or `'waiting'` do not appear in the action list

## 13. Owner of the process
Admin / Staff  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Log in as Admin
- [ ] At least 5 crm_contacts exist
- [ ] At least 1 contact has `next_action_due_date` in the past
- [ ] At least 1 contact has `next_action_due_date` = today
- [ ] At least 1 lead exists with both `created_at` and `first_replied_at` set

### Test cases

**TC-01 — Dashboard loads without error**
1. Navigate to Sales → Relationships
2. Expected result: page loads, no error state, action list appears
3. Expected: stats row shows numbers (not null/NaN)
- [ ] Pass  [ ] Fail

**TC-02 — Overdue contacts appear in red**
1. Ensure a contact has `next_action_due_date` set to yesterday
2. Open dashboard
3. Expected result: that contact appears in the action list with red styling
4. Expected: "Overdue actions" stat ≥ 1
- [ ] Pass  [ ] Fail

**TC-03 — Due today contacts appear in yellow**
1. Ensure a contact has `next_action_due_date` = today's date
2. Open dashboard
3. Expected result: that contact appears with yellow/amber styling
- [ ] Pass  [ ] Fail

**TC-04 — Speed to lead calculates correctly**
1. Find a lead with `first_replied_at` and `created_at` in the DB
2. Compute expected hours: `(first_replied_at - created_at) / 3600000`
3. Open dashboard
4. Expected result: speed to lead metric matches (approximately — it's an average)
- [ ] Pass  [ ] Fail

**TC-05 — Log button opens contact drawer**
1. Click [Log →] next to any contact
2. Expected result: ContactDrawer opens on the right, showing that contact's details
3. Expected: Log Interaction form is accessible inside the drawer
- [ ] Pass  [ ] Fail

**TC-06 — Top Relationships sorted by score**
1. Ensure multiple contacts with different relationship scores exist
2. Open dashboard
3. Expected result: Top Relationships panel shows contacts sorted high-to-low by score
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Dashboard loads under 2 seconds
- [ ] Red/yellow/white colour coding correct
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
