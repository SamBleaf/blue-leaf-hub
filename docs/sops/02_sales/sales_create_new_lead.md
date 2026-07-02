---
sop_version: 2.0
last_reviewed: 2026-07-02
app_version: Pass 3A — Lead command centre
screenshot_status: not_applicable
owner: Admin
test_status: untested
---

# SOP: Create a New Lead

**Module:** Sales Manager
**SOP ID:** 02-01
**Status:** Current
**Priority:** High

---

## 1. Who uses this
Admin, Directors, Project Managers

## 2. When to use it
Every time a new enquiry or potential client comes in — phone call, email, website form, referral, or walk-in. Log the enquiry the same day it arrives.

## 3. What this does
Adds the new enquiry to the sales pipeline at the Enquiry stage so it can be tracked, followed up, and moved through the Blue Leaf APB sales process.

**Architect Tender path:**

For leads that come in via an architect-issued tender (where the client has already been pre-qualified by the architect), use the separate **Architect Tender** button in the pipeline header instead of "+ New Lead".

The Architect Tender drawer requires:
- Client first name
- Site address

And it creates the lead directly at the **Accepted** stage, skipping qualifying and fee proposal steps.

## 4. Before you start
- You need the person's first name (required) — everything else can be added later
- Know the lead source (required — see §5 for details)

**Lead source field:**

Lead source is **required** in the Add Lead drawer. The form will not submit without it, and will show the error: "Lead source is required — it's how we track which marketing produces good leads."

This field tracks where the lead came from (e.g. referral, website, Instagram, Google). It is mandatory because attribution data is the foundation of the marketing intelligence system — without it, you cannot tell which channels produce the best leads.

Select the most accurate source from the dropdown. If unsure, select the closest match — you can update it later from the Lead details section in the command centre.

For leads that arrive via the website contact form, `lead_source` is set automatically from the form submission and does not need to be entered manually.

See SOP 02-08 for the full lead source / fit classification workflow.

## 5. Step-by-step process

1. Click **Sales Manager** in the left-hand navigation menu.
2. The pipeline page opens showing all current leads as cards across the stage columns.
3. Click the **+ New Lead** button (top right of the pipeline header).

[insert screenshot: Sales pipeline header with "+ New Lead" button highlighted]

4. A slide-in drawer appears from the right. Fill in the fields:

   **Required:**
   - **First name** — required; the form will not submit without it
   - **Lead source** — required (see §4 above)

   **Optional but recommended at creation:**
   - Last name
   - Email address
   - Phone number
   - Suburb (where the project would be)
   - Project type — New Build / Extension / Renovation / Knockdown Rebuild
   - Estimated value ($) — approximate, e.g. 650000 for $650,000

5. Click **Add Lead**.
6. The drawer closes and the lead card appears in the **Enquiry** column of the pipeline board.

[insert screenshot: New lead drawer showing all fields including the required Lead source dropdown]

## 6. What happens next

The lead is now in the pipeline at Enquiry stage. Your next step is to qualify them:
- Review the qualifying score in the lead detail command centre — SOP 02-04
- Log your first conversation or call — SOP 02-03
- Add a meeting transcript if you have one — SOP 02-06

## 7. Common mistakes

| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Leaving lead source blank | Looks optional | Lead source is required — the form will not submit without it |
| Not entering enough detail at the start | Rushing | Even first name + phone is enough to start. Add more as you learn more. |
| Forgetting to add new enquiries | Busy | Every call and enquiry goes into the system the same day it comes in. |
| Adding the same person twice | Did not check | Search or scroll the pipeline before creating a new lead to check if they already exist. |

## 8. Troubleshooting

| Problem | Solution |
|---------|----------|
| Cannot find the "+ New Lead" button | Make sure you are on the Sales Manager page (not a different module). The button is in the pipeline page header — top right. |
| Lead not appearing on the board after saving | Refresh the page. It will be in the Enquiry column. |
| "Lead source is required" error | Select a lead source from the dropdown before clicking Add Lead. |
| "First name is required" error | Enter at least a first name. All other fields except lead_source are optional. |

## 9. Related SOPs
- [Move a lead through pipeline stages](02-02_move_lead_through_stages.md) — SOP 02-02
- [Log a call, meeting or note](02-03_log_activity.md) — SOP 02-03
- [Review and update a qualifying score](02-04_qualifying_score.md) — SOP 02-04
- [Lead fit classification and trust rail](02-08_lead_fit_classification.md) — SOP 02-08

## 10. Screenshot placeholders
[insert screenshot: Sales pipeline board showing "+ New Lead" and "Architect Tender" buttons in the header]
[insert screenshot: Add Lead drawer — all fields visible, lead source dropdown open showing options]
[insert screenshot: Lead card appearing in Enquiry column after saving]

## 11. Automation notes
- API: `POST /api/sales/leads` — creates lead with `stage = 'enquiry'`, `stage_entered_at = now()`, `last_activity_at = now()`
- Required fields: `first_name` (NOT NULL, enforced server-side) and `lead_source` (enforced in the UI — server does not hard-reject a missing lead_source but the UI prevents submission)
- Name fields are auto-capitalised (title case) server-side on create and update
- A `lead_activities` row with `activity_type = 'note'`, `summary = 'Lead created'` is inserted automatically on creation
- Website enquiry path: `lead_source` and UTM attribution fields are stamped automatically from the enquiry form submission — manual creation in the drawer is for phone/walk-in/referral leads

## 12. Edge cases and limits
- The Architect Tender path creates the lead at Accepted stage directly — it bypasses the qualify, discovery, winning offer, and fee proposal stages. Use it only for genuine architect-tendered leads.
- `lead_source` is UI-required but not server-enforced (no NOT NULL at DB level) — the server will accept a lead without it if submitted directly via API, but the UI always prevents this.
- Names are auto-capitalised server-side — do not rely on the UI to do this.

## 13. Owner of the process
Admin / Director
Next review: 2027-01-02

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] Sales Manager page is accessible

### Test cases

**TC-01 — Create lead (happy path)**
1. Click Sales Manager in the sidebar
2. Click **+ New Lead**
3. Fill in: First name = "Audit", Last name = "Test", Email = "auditltest@example.com", Phone = "0400000001", Suburb = "Burnside", Project type = New Build, Estimated value = 1500000, Lead source = Referral
4. Click Add Lead
5. Expected result: lead card appears in the **Enquiry** column of the pipeline
6. Expected DB: `leads` row with `stage = 'enquiry'`, `stage_entered_at` = now, `last_activity_at` = now, `lead_source = 'referral'`
7. Expected DB: `lead_activities` row with `activity_type = 'note'`, `summary = 'Lead created'`
- [ ] Pass  [ ] Fail

**TC-02 — First name required**
1. Open the Add Lead drawer
2. Leave First name blank, fill in Last name = "Test", Lead source = Referral
3. Click Add Lead
4. Expected result: validation error "First name is required." — form does not submit
- [ ] Pass  [ ] Fail

**TC-03 — Lead source required**
1. Open the Add Lead drawer
2. Fill in First name = "Test", leave Lead source blank
3. Click Add Lead
4. Expected result: validation error "Lead source is required — it's how we track which marketing produces good leads." — form does not submit
- [ ] Pass  [ ] Fail

**TC-04 — Name is title-cased automatically**
1. Create a lead with first_name = "john" (all lowercase), lead_source = any value
2. Expected DB: `first_name = 'John'` (title-cased server-side)
- [ ] Pass  [ ] Fail

**TC-05 — Lead appears in Enquiry column**
1. Create a lead (TC-01 steps)
2. Navigate to Sales Manager pipeline view
3. Expected: lead appears under the "Enquiry" column header, not any other column
- [ ] Pass  [ ] Fail

**TC-06 — Feature case: minimal fields (first name + lead source only)**
1. Create a lead with only first_name = "Minimal" and lead_source = "website"
2. Leave all other fields blank
3. Expected: lead is created successfully — all optional fields are nullable
4. Expected: lead card in Enquiry shows the name and blank/dashes for other fields
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] Add Lead drawer opens from the pipeline header button
- [ ] First name required validation works
- [ ] Lead source required validation works
- [ ] Lead appears in Enquiry stage
- [ ] lead_source is persisted to the DB
- [ ] Activity log auto-created on lead creation
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
