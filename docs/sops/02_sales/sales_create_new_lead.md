---
sop_version: 1.1
last_reviewed: 2026-05-29
app_version: 1.0 — built
screenshot_status: not_applicable
owner: Admin
test_status: static_pass
---

# SOP: Create a New Lead

**Module:** Sales Manager  
**SOP ID:** 02-01  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin, Directors, Project Managers.

## 2. When to use it
Every time a new enquiry or potential client comes in — phone call, email, website form, referral, or walk-in.

## 3. What this does
Adds the new enquiry to the sales pipeline so it can be tracked, followed up, and moved through the Blue Leaf sales process.

## 4. Before you start
- You need the person's name and at least one way to contact them (phone or email)
- Know which stage to start them in — most new enquiries start at **Enquiry**

## 5. Step-by-step process

1. Click **Sales Manager** in the left-hand menu
2. The pipeline page will open showing all your current leads as cards across the board
3. Click the **+ New lead** button (top right of the page)

[insert screenshot: Sales pipeline with New lead button highlighted]

4. A form will appear. Fill in:
   - **First name** and **Last name** (required)
   - **Email** address
   - **Phone** number
   - **Suburb** (where the project would be)
   - **Project type** — select from the list (New Build, Extension, Renovation, Knockdown Rebuild)
   - **Budget** (approximate — enter a number, e.g. 450000 for $450,000)
   - **Desired start** date (if known)
5. Click **Save** or **Create lead**

[insert screenshot: New lead form with all fields visible]

6. The lead will appear in the **Enquiry** column of the pipeline board

## 6. What happens next
The lead is now in the pipeline. Your next step is to qualify them — review the qualifying score and log your first conversation (see SOP 02-03: Log a call, meeting or note).

## 7. Common mistakes
- Not entering enough detail at the start — even a first name and phone number is enough to start. Add more as you learn more.
- Forgetting to add new enquiries — every call and enquiry should go into the system the same day it comes in
- Adding the same person twice — search the pipeline before creating a new lead to check if they already exist

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Can't find the + New lead button | Make sure you're on the Sales Manager page, not a different section |
| Lead not appearing on the board after saving | Refresh the page. Check which column you're looking at — it will be in Enquiry. |
| Required fields won't let you save | Fill in at least a first name and last name — all other fields are optional at this stage |

## 9. Related modules
- [Move a lead through pipeline stages](sales_move_lead_through_stages.md) — SOP 02-02
- [Log a call, meeting or note](sales_log_activity.md) — SOP 02-03
- [Review and update a qualifying score](sales_qualifying_score.md) — SOP 02-04

## 10. Screenshot placeholders
[insert screenshot: Sales pipeline board showing all stage columns]
[insert screenshot: New lead button in top right corner]
[insert screenshot: New lead creation form]
[insert screenshot: Lead card appearing in Enquiry column after saving]

## 11. Automation notes
- The lead is automatically placed in the **Enquiry** stage when created
- The system records the date the lead was created — this is used to calculate "days in stage" and flag inactive leads

## 12. Automation notes
- API: `POST /api/sales/leads` — creates lead with `stage = 'enquiry'`, `stage_entered_at = now()`, `last_activity_at = now()`
- Name fields are auto-capitalised (title case) server-side on create and update
- A `lead_activities` row with `activity_type = 'note'`, `summary = 'Lead created'` is inserted automatically on creation
- Required fields enforced by DB constraints: `first_name` is NOT NULL

## 13. Owner of the process
Admin / Director  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] Sales Manager page is accessible

### Test cases

**TC-01 — Create lead (happy path)**
1. Click Sales Manager in the sidebar
2. Click **+ New lead**
3. Fill in: First name = "Audit", Last name = "Test", Email = "auditltest@example.com", Phone = "0400000001", Suburb = "Burnside", Project type = New Build, Budget = 1500000
4. Click Save / Create lead
5. Expected result: lead card appears in the **Enquiry** column of the pipeline
6. Expected DB: `leads` row with `stage = 'enquiry'`, `stage_entered_at` = now, `last_activity_at` = now
7. Expected DB: `lead_activities` row with `activity_type = 'note'`, `summary = 'Lead created'`
- [ ] Pass  [ ] Fail

**TC-02 — First name required**
1. Open the New lead form
2. Leave First name blank, fill Last name = "Test"
3. Click Save
4. Expected result: validation error — form does not submit
- [ ] Pass  [ ] Fail

**TC-03 — Name is title-cased automatically**
1. Create a lead with first_name = "john" (lowercase)
2. Expected DB: `first_name = 'John'` (title-cased server-side)
- [ ] Pass  [ ] Fail

**TC-04 — Lead appears in correct pipeline column**
1. Create a lead
2. Navigate to Sales Manager pipeline view
3. Expected: lead appears under the "Enquiry" column header, not any other column
- [ ] Pass  [ ] Fail

**TC-05 — Minimal fields (no optional fields)**
1. Create a lead with only first_name = "Minimal" and last_name = "Lead"
2. Leave email, phone, suburb, project type, budget blank
3. Expected: lead is created successfully — all optional fields are nullable
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Lead appears in Enquiry stage
- [ ] Activity log auto-created
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
