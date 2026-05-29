---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: tested_2026-05-29 — TC-01 PASS (campaign created with name/goal/audience/duration), TC-02 FAIL (no validation feedback when goal not selected), TC-03 FAIL (Generate content for this week opens generic Create with no campaign context — MED-03), TC-04 SKIP (no posting days set)
---

# SOP 18-05: Create and Manage Campaigns

**Module:** Marketing — Content Studio → Campaigns tab  
**SOP ID:** 18-05  
**Status:** Draft  
**Priority:** Medium

---

## 1. Who uses this
Admin

## 2. When to use it
When you want to group content around a focused push — a project launch, a seasonal theme, an architect audience campaign, a website SEO cluster. A campaign gives a collection of content pieces a shared purpose and measurable goal.

## 3. What this does
Creates a campaign record that content items can be linked to. Sets the goal, channels, tone, content mix targets, and audience for a group of content. When Marketing Intelligence is built, campaigns will also track attributed enquiries and performance.

## 4. Before you start
- No content items are required before creating a campaign — you can create the campaign first, then create content linked to it

## 5. Step-by-step process

**Create a campaign:**

1. Go to **Marketing → Campaigns**
2. Click **+ New Campaign**
3. Fill in:
   - **Campaign Name** — specific and descriptive. "Q3 2026 — Passive Design" not "Campaign 5".
   - **Objective** — plain English description of what this campaign is trying to achieve
   - **Channels** — check all that apply: Instagram / Facebook / Website / Email / etc.
   - **Start Date / End Date** — the active window for this campaign
   - **Goal** — select from: Brand Awareness / Generate Enquiries / Educate / Build Authority / SEO
   - **Audience** — who this content is targeting (e.g. "Architects — Adelaide Hills", "Dual-income couples, $1.5M budget")
   - **Tone** — Professional / Educational / Premium / Technical / Friendly
   - **Content Mix** — set percentage targets for each content mode (Educate / Showcase / Behind the Scenes / Opinion / Authority). Defaults: Educate 35% / Showcase 25% / Behind the Scenes 15% / Opinion 15% / Authority 10%.
   - **Approval Mode** — how content in this campaign is approved: Manual All / Manual High Risk / Auto Low Risk
4. Click **Save**

**Link content items to a campaign:**

Option A (from Campaigns tab):
1. Open the campaign
2. Click **Add Content**
3. Search the Library for content to link to this campaign
4. Select items and confirm

Option B (from Create tab):
1. When generating new content, select the Campaign from the Campaign dropdown in the form
2. Content is automatically linked to that campaign when saved

Option C (from Library):
1. Open a content item
2. Set the **Campaign** field to the relevant campaign
3. Save

**Manage a campaign:**

1. Open the campaign from the Campaigns list
2. The campaign detail shows:
   - Content items linked to it (with status breakdown)
   - Content mix actual vs target (are you hitting the 35% Educate target?)
   - Schedule slots (when items are assigned to specific calendar dates)
3. Use **+ Assign to Schedule** to put a piece of content on a specific date in the campaign calendar
4. Change campaign status: Active → Paused → Complete → Archived

[insert screenshot: New Campaign form fully filled in]
[insert screenshot: Campaign detail — content list + content mix chart]
[insert screenshot: Schedule calendar view with assigned content]

## 6. What happens next
- Campaign is stored in `marketing_campaigns`
- Content items linked to the campaign have `campaign_id` set
- Schedule slots created in `campaign_schedule_slots` when items are assigned to dates
- When Marketing Intelligence is built: campaign performance data (attributed enquiries, reach, engagement) will populate automatically from the Intelligence sync jobs

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| One campaign for all content | Convenience | Campaigns are meant to be focused. If everything is in one campaign, the goal and audience become meaningless. Create a new campaign for each distinct push. |
| Content mix targets ignored | Set and forgotten | Check the content mix chart weekly — if you're generating 80% Showcase posts, the educational and authority content gaps will hurt SEO and audience trust. |
| Leaving campaigns as "Active" indefinitely | Forgetting to close | Set an end date when creating. Mark as Complete after the end date passes. |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| Content mix chart showing 0% | No content items linked to the campaign yet — link at least one item |
| Can't find a content item to link | The item may be archived. Check Library with status filter = Archived. |
| Schedule slot not appearing | Refresh the campaign calendar — slot assignment may take a moment to reflect |

## 9. Related modules
- [Generate content with AI](18-02_generate_content_ai.md)
- [Review and approve content](18-04_review_approve_content.md)
- [Intelligence dashboard](../19_marketing_intelligence/19-01_intelligence_dashboard.md)

## 10. Screenshot placeholders
[insert screenshot: Campaigns list view — showing multiple campaigns with status]
[insert screenshot: Campaign detail — overview section with goal/audience/tone]
[insert screenshot: Content mix doughnut chart showing actual vs target percentages]

## 11. Automation notes
- No automations currently triggered on campaign creation
- `updated_at` on `marketing_campaigns` is updated on any field change
- When Marketing Intelligence is built: `attributed_enquiries` and `attributed_lead_value` on campaigns will be computed from `enquiry_attribution` table nightly

## 12. Edge cases and limits
- Approval Mode = "Auto Low Risk" is planned but not yet operational — all content requires manual approval regardless of this setting
- A content item can only be linked to one campaign — re-linking it changes the `campaign_id`
- Deleting a campaign does not delete linked content items — they remain in the Library with `campaign_id = NULL`
- Campaign start/end dates are advisory — they do not lock the campaign automatically

## 13. Owner of the process
Admin  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Log in as Admin
- [ ] No pre-conditions on existing content

### Test cases

**TC-01 — Create a campaign**
1. Go to Marketing → Campaigns → + New Campaign
2. Fill in all fields: name, channels (Instagram + Facebook), start/end date, goal = Brand Awareness, audience = "Architects", tone = Professional
3. Leave content mix at defaults
4. Click Save
5. Expected result: campaign appears in the Campaigns list
6. Expected DB: `marketing_campaigns` row with all fields populated, `status = 'active'`, `content_mix = {"educational":35,"showcase":25,"behind_scenes":15,"opinion":15,"authority":10}`
- [ ] Pass  [ ] Fail

**TC-02 — Link content to campaign from Library**
1. Open an existing content item in the Library
2. Set Campaign = the campaign created in TC-01
3. Save
4. Expected result: item now appears in the campaign's content list
5. Expected DB: `marketing_content_items.campaign_id` = campaign UUID from TC-01
- [ ] Pass  [ ] Fail

**TC-03 — Content mix chart updates when content is linked**
1. Open the campaign created in TC-01
2. Expected result: content mix chart shows the linked item's content mode reflected in the actual percentage
- [ ] Pass  [ ] Fail

**TC-04 — Campaign status changes**
1. Open campaign from TC-01
2. Change status to Paused, save
3. Expected DB: `status = 'paused'`
4. Change to Complete, save — `status = 'complete'`
5. Change to Archived — campaign is hidden from default Campaigns list
- [ ] Pass  [ ] Fail

**TC-05 — Assign content to a schedule slot**
1. Open campaign from TC-01 (ensure status = active)
2. Click to assign a content item to a specific date
3. Expected DB: `campaign_schedule_slots` row created with `campaign_id`, `slot_date`, `content_item_id`, `status = 'assigned'`
- [ ] Pass  [ ] Fail

**TC-06 — Generate content with campaign pre-selected**
1. Go to Create tab
2. Select the campaign from TC-01 in the Campaign dropdown
3. Generate and save content
4. Expected DB: new `marketing_content_items` row with `campaign_id` = TC-01 campaign UUID
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Campaign list view loads without errors
- [ ] Content links correctly between Library and Campaign
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
