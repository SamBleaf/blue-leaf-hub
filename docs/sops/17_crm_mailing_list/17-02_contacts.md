---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built 2026-05-29
screenshot_status: not_applicable
owner: Admin / Staff
test_status: untested
---

# SOP 17-02: Add and Manage CRM Contacts

**Module:** Sales → Contacts tab  
**SOP ID:** 17-02  
**Status:** Draft (built — not yet deployed)  
**Priority:** High

---

## 1. Who uses this
Admin, Staff

## 2. When to use it
When you meet someone who might become a client, refer a client, or who you want to keep a relationship with. Add them to the CRM before you forget.

Also used when reviewing all contacts: filtering, finding who you haven't spoken to, seeing who is overdue.

## 3. What this does
The Contacts tab is a list of every person in the CRM with their status, next action, relationship score, and last contact date. It's the source of truth for who you're in relationship with outside the formal APB sales pipeline.

**Contact statuses:**
| Status | Meaning |
|--------|---------|
| New | Just added, haven't had a real conversation yet |
| Active | In active conversation — engaged right now |
| Future | Interested but timing not right — keep touching every 30 days |
| Client | Currently building with Blue Leaf |
| Past Client | Completed build — on the raving fans program |
| Lost | Went dark or chose another builder |

## 4. Before you start
- No setup needed
- To add a contact to a mailing list, their email must be set

## 5. Step-by-step process

**Adding a new contact:**
1. Go to **Sales → Contacts**
2. Click **+ New Contact**
3. Fill in:
   - **First name** (required)
   - **Last name, email, phone** (fill as much as you have)
   - **Contact type** — Prospect / Referrer / Architect / Designer / Agent / Past Client / etc.
   - **Status** — default is `New`
   - **Suburb, budget range, interest timeline** — fill what you know
4. If the contact has consented to receive marketing emails: tick **Consent to marketing emails** and select the consent source (how they gave consent — required by Spam Act)
5. Click **Create Contact**

The system auto-sets: next action = Call, due tomorrow.

**Filtering contacts:**
- **All** — everyone not archived
- **New / Active / Future / Past Clients** — filter by status
- **Referrers** — only referrer/architect/designer/agent types
- **⚠ Actions Overdue** — contacts with a past-due action (prioritise these)
- Search bar searches name and email

**Viewing a contact:**
- Click any row to open the **Contact Drawer** (slides in from the right)
- The drawer shows: status, relationship score, next action, project interest, interactions timeline, mailing list memberships

**Converting a contact to a lead:**
1. Open the contact drawer
2. Click **Convert to Lead →**
3. The system creates a new Lead in the Sales pipeline, pre-filled from the contact's details
4. The contact's record links to the new lead — visible in the drawer as "View Lead →"
5. If you then log an outbound interaction for this contact, it automatically sets `first_replied_at` on the lead (speed-to-lead metric)

**Contact detail fields explained:**

| Field | What it means |
|-------|--------------|
| Relationship score | 0–100. Computed automatically. Higher = stronger relationship. |
| Next action | What to do next: call, email, meeting, DM, none, waiting |
| Next action due | When to do it |
| Last contact date | Set automatically when you log an interaction |
| Referral count | How many leads this contact has referred (auto-incremented) |

[insert screenshot: Contacts list with filter chips and search]
[insert screenshot: New Contact modal]

## 6. What happens next
- Contact appears in Today's Actions on the Relationship Dashboard when the due date arrives
- Converting to Lead links the two records forever — you can navigate between them
- Adding to a mailing list enables email sends via the Lists tab in Marketing

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Not adding contact type | Seems unimportant | The mailing list smart filters use contact_type. A referrer without type = "referrer" won't appear in the Referrers & Partners list. |
| Converting to a lead too early | Eager | Convert only when you've had a real conversation and they want to proceed. Converting prematurely clutters the sales pipeline. |
| Skipping the consent checkbox when adding email | Not top of mind | If you intend to send them marketing emails, you MUST have their consent. The Spam Act is not optional. |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| "Contact is already a lead" error on Convert | The contact was already converted. Click "View Lead →" to see the existing lead. |
| Contact not showing in a smart mailing list | Smart lists filter in real time. Check the contact's `status` and `contact_type` match the list filter. E.g. for Referrers & Partners, the contact_type must be referrer/architect/designer/agent. |
| Search not finding a contact | Search covers first_name, last_name, email. Try searching by email if name is unusual spelling. |

## 9. Related modules
- [Relationship dashboard](17-01_relationship_dashboard.md)
- [Log an interaction](17-03_log_interaction.md)
- [Mailing lists](17-04_mailing_lists.md)

## 10. Screenshot placeholders
[insert screenshot: Contact drawer — full view with interaction timeline]
[insert screenshot: Convert to lead confirmation]

## 11. Automation notes
- Next action auto-set on create: `call`, due = tomorrow (`now() + 1 day`)
- `last_contact_date` updated when interaction logged (`POST /api/crm/contacts/:id/interact`)
- `relationship_score` recomputed after every interaction
- `first_replied_at` on lead set on first outbound interaction if `converted_lead_id` is set

## 12. Edge cases and limits
- Archived contacts (`is_archived = true`) do not appear in any list or filter — they are hidden, not deleted
- A contact can only be converted to one lead. After conversion, the "Convert" button becomes "View Lead →"
- Relationship score is floored at 0 and capped at 100 — it cannot go negative or above 100

## 13. Owner of the process
Admin / Staff  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Log in as Admin
- [ ] No contacts in the system (clean test) OR note the existing count

### Test cases

**TC-01 — Create contact successfully**
1. Go to Sales → Contacts → + New Contact
2. Fill in: First name = "Test", Last name = "Contact", Email = "test@example.com", Contact type = Prospect, Status = New
3. Leave consent unchecked
4. Click Create Contact
5. Expected result: modal closes, contact appears in the list
6. Expected DB: `crm_contacts` row with `status = 'new'`, `next_action_type = 'call'`, `next_action_due_date = tomorrow`
- [ ] Pass  [ ] Fail

**TC-02 — Required field validation**
1. Open New Contact modal
2. Leave first name blank
3. Click Create Contact
4. Expected result: error "First name is required" shown, form stays open, no DB insert
- [ ] Pass  [ ] Fail

**TC-03 — Contact drawer opens on row click**
1. Click any contact row
2. Expected result: drawer slides in from right
3. Expected: drawer shows correct name, status, relationship score
- [ ] Pass  [ ] Fail

**TC-04 — Filter by status**
1. Click "Active" filter chip
2. Expected result: only contacts with `status = 'active'` shown
3. Click "All" — all contacts return
- [ ] Pass  [ ] Fail

**TC-05 — Convert to lead creates a lead**
1. Open a contact drawer for a contact that has NOT been converted yet
2. Click "Convert to Lead →"
3. Expected result: navigates to the new lead's detail page
4. Expected DB: `leads` row created, `crm_contacts.converted_lead_id` = new lead ID, `crm_contacts.converted_at` set
5. Go back to the contact — button now shows "View Lead →"
- [ ] Pass  [ ] Fail

**TC-06 — Consent required for mailing list membership**
1. Create a contact WITHOUT ticking consent
2. Try to add them to a manual mailing list via Add to List in the drawer
3. Expected: consent source dropdown is shown and required — cannot add without selecting one
4. Expected DB: `mailing_list_members.consent_source` is NOT NULL
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Contact creates correctly with default next action
- [ ] Status filter works
- [ ] Consent enforced
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
