---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built 2026-05-29
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP 17-04: Manage Mailing Lists and Send Emails

**Module:** Marketing → Lists tab  
**SOP ID:** 17-04  
**Status:** Draft (built — not yet deployed)  
**Priority:** High

---

## 1. Who uses this
Admin

## 2. When to use it
When sending a marketing email to a group of contacts. When managing who is on which list. When checking delivery stats for a recent send.

**Important:** The mailing list system is subject to the Australian Spam Act 2003. You cannot send marketing emails without the recipient's recorded consent. The system enforces this.

## 3. What this does
Manages mailing lists and sends marketing emails via Resend (a dedicated email delivery service). Every list has members with recorded consent. Every email includes a legally required unsubscribe link. Unsubscribes are processed immediately.

**Two list types:**

| Type | How membership works |
|------|---------------------|
| **Smart** | Membership is computed live from a filter (e.g. "all contacts with status = active"). No manual management. |
| **Manual** | You manually add contacts with their consent details. |

**Default lists (created automatically):**

| List | Who's in it |
|------|------------|
| Active Prospects | status = new or active |
| Future Pipeline | status = future |
| Referrers & Partners | contact_type = referrer / architect / designer / agent |
| Past Clients | status = past_client |
| Full Active Database | All non-archived contacts |
| New This Month | Created this calendar month |

Smart lists are always live — membership reflects the current state of contacts when you send.

## 4. Before you start
- **RESEND_API_KEY** must be configured in Railway environment variables. Without this, sending will return an error explaining what's missing. Contact Sam to add this.
- Contacts must have email addresses to receive emails
- For manual lists: contacts must have been added with consent recorded

## 5. Step-by-step process

**Viewing mailing lists:**
1. Go to **Marketing → Lists**
2. Each list shows: name, type (Smart/Manual), active member count, total member count
3. Click any list to open it

**Sending an email to a list:**
1. Open the list you want to send to
2. Click **Send Email →**
3. Fill in:
   - **Subject** (required) — the email subject line, e.g. "5 things to ask before signing a building contract"
   - **Preview text** — optional; the short text that shows below the subject in inbox
   - **Email body (HTML)** — paste your HTML email content. The unsubscribe footer and Blue Leaf branding are added automatically — do not include them in your body.
   - **Schedule** (optional) — leave blank to send immediately, or pick a date/time to schedule
4. Review the confirmation section:
   - ✓ X active recipients
   - ✓ Unsubscribe link included
   - ✓ Sender: Blue Leaf Building
5. Click **Send to X →** (or **Schedule Send** if scheduled)

The system then:
- Creates a `email_sends` record
- Queries the active members (those who haven't unsubscribed)
- Sends via Resend
- Delivery stats update in real-time via Resend webhooks

**Checking send stats:**
1. Open the list → click **Sends** tab
2. See each send: subject, status, delivered, opened, clicked
3. Good open rate: 25%+ is above average for construction industry. Under 15% means subject lines need work.

**Adding a contact to a manual list:**
1. Open the contact drawer (Sales → Contacts → click contact)
2. Click **Add to List**
3. Select the list, select the consent source, add consent notes if needed
4. Click Add

Or from Marketing → Lists → [list name] → member table (Add member button).

**Creating a new manual list:**
1. Click **+ New List**
2. Enter name and description
3. Click Create List
4. Manually add members via the contact drawer

**Removing a member (unsubscribing them manually):**
1. In the list's member table, find the contact
2. Click **Remove**
3. They are unsubscribed (soft delete — record kept for audit trail, emails stop)

[insert screenshot: Mailing Lists main view with list cards]
[insert screenshot: Send Email modal with compliance checklist]
[insert screenshot: Sends tab with open rate stats]

## 6. What happens next
- Sent emails trigger Resend webhooks → per-recipient stats update in real time
- Bounced emails: contact is automatically removed from all lists (hard bounce = permanent)
- Spam complaints: contact automatically removed from all lists (Spam Act compliance)
- Unsubscribes (click link in email): contact unsubscribed from that list immediately, `email_unsubscribes` row created

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Sending to Full Active Database too often | Feels like "reach everyone" | Full Database is for maximum quarterly sends only. Over-emailing this list damages your reputation and increases unsubscribes. |
| Adding people to lists without consent | Mistake or oversight | The form requires you to select a consent source. If you cannot answer "how did this person consent?", they should not be added. |
| Sending before RESEND_API_KEY is configured | Premature | The system will return a clear error message. Add the key first. |
| Pasting in HTML with an unsubscribe link already | Double unsubscribe link | The footer is added automatically. Don't include your own unsubscribe link in the body. |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| "Email sending is not configured yet" error | Add RESEND_API_KEY to Railway environment variables |
| "No active recipients" error | All contacts on this list have unsubscribed or the list is empty. Check member count. |
| Smart list showing 0 members | The filter may not match any contacts. E.g. "Active Prospects" shows 0 if no contacts have status = new or active. Check the Contacts list. |
| Contact not appearing in smart list | Check their contact_type and status exactly match what the list filter expects |

## 9. Related modules
- [Add and manage contacts](17-02_contacts.md)
- [Log an interaction](17-03_log_interaction.md)

## 10. Screenshot placeholders
[insert screenshot: List detail — member table with consent dates]
[insert screenshot: Resend delivery stats per recipient]

## 11. Automation notes
- Smart list membership: computed live via `GET /api/crm/lists/:id` — never stored in DB for smart lists
- Send endpoint: `POST /api/crm/sends/:sid/send` — checks `RESEND_API_KEY`, queries members, creates `email_send_recipients`, calls Resend batch API
- Unsubscribe link: JWT token signed with `UNSUBSCRIBE_SECRET`, expires 90 days. Click → `GET /api/crm/unsubscribe?token=...` → public route, no auth required
- Resend webhook: `POST /api/webhooks/resend` handles delivered / opened / clicked / bounced / complained / unsubscribed events
- Bounce/complaint → auto-unsubscribe from all lists + `email_unsubscribes` row

## 12. Edge cases and limits
- Resend's free plan allows 100 emails/day. Paid plans for higher volume. Contact Sam for upgrade.
- Smart lists may return different counts at draft time vs send time (members' statuses can change)
- Scheduled sends are stored as `status = 'scheduled'` but the Hub does not yet auto-trigger them — this requires a cron job (Stage 12, not yet built). Current workaround: send manually at the scheduled time.
- `email_unsubscribes` rows are never deleted (Spam Act audit trail)

## 13. Owner of the process
Admin  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Log in as Admin
- [ ] At least 3 crm_contacts exist with emails
- [ ] At least 1 contact is on a manual list with consent recorded
- [ ] RESEND_API_KEY present in environment (or test the graceful error if not)

### Test cases

**TC-01 — Mailing lists page loads**
1. Go to Marketing → Lists
2. Expected result: 6 default smart lists visible with member counts
3. Expected: Active Prospects count ≥ 0 (not an error)
- [ ] Pass  [ ] Fail

**TC-02 — Smart list member count is live**
1. Note Active Prospects count
2. Create a new contact with status = active
3. Refresh the Lists page
4. Expected result: Active Prospects count increased by 1
- [ ] Pass  [ ] Fail

**TC-03 — Add member to manual list**
1. Create a manual list "Test List"
2. Open a contact drawer → Add to List → select "Test List" → consent source = in_person
3. Expected DB: `mailing_list_members` row with consent_source = 'in_person', consent_at = now(), unsubscribed_at IS NULL
- [ ] Pass  [ ] Fail

**TC-04 — Send email fails gracefully without Resend key**
1. If RESEND_API_KEY is not set: click Send Email on a list → fill form → Send
2. Expected result: "Email sending is not configured yet" error shown
3. No `email_sends` row created with status = failed (it should not be created yet or should show an informative error)
- [ ] Pass  [ ] Fail

**TC-05 — Unsubscribe link processes correctly**
1. Send a test email (requires Resend key)
2. Find the unsubscribe link in the received email
3. Click the unsubscribe link
4. Expected result: browser shows "You've been unsubscribed" page
5. Expected DB: `mailing_list_members.unsubscribed_at` set; `email_unsubscribes` row created
6. Future sends to this contact on this list: they are excluded (unsubscribed_at IS NOT NULL)
- [ ] Pass  [ ] Fail

**TC-06 — Remove member manually**
1. Open a list with at least 1 member
2. In the member table, click Remove next to a contact
3. Expected result: member shows "Unsubscribed" status
4. Expected DB: `mailing_list_members.unsubscribed_at` = now(), `unsubscribed_via = 'manual'`; `email_unsubscribes` row created
- [ ] Pass  [ ] Fail

**TC-07 — Consent source required**
1. Try to add a contact to a list without selecting a consent source
2. Expected result: "consentSource is required (Spam Act compliance)" error
3. Expected: no `mailing_list_members` row created
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Smart lists compute correctly
- [ ] Consent enforced
- [ ] Unsubscribe works end-to-end (if Resend available)
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
