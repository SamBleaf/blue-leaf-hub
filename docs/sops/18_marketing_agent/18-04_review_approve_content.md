---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: main
screenshot_status: placeholders_only
owner: Admin
test_status: tested_2026-05-29 — TC-01 PASS (all 9 review dimensions shown), TC-02 PASS (Issues to fix section appears for low identity score), TC-03 PASS (Review needed badge shown); NOTE: BANNED_PHRASES incomplete — luxurious/stunning/bespoke/curated/elevated not checked (MED-05)
---

# SOP 18-04: Review and Approve Content

**Module:** Marketing — Content Studio → Library tab  
**SOP ID:** 18-04  
**Status:** Draft  
**Priority:** High

---

## 1. Who uses this
Admin (approval), Staff (can submit for review)

## 2. When to use it
After content has been generated and saved to the Library. Before anything is published publicly, it should be in `approved` status. This SOP covers the review and approval workflow.

## 3. What this does
Moves content through the status pipeline: `draft` → `in_review` → `approved` → `published`. Each status change is deliberate. Nothing is published without an explicit `approved` status.

## 4. Before you start
- At least one content item must exist in the Library (status: draft)
- To approve, you must be Admin

## 5. The status pipeline

| Status | Meaning | Who can set it |
|--------|---------|----------------|
| `draft` | Generated but not yet reviewed | Auto-set on save; anyone can also set back to draft |
| `in_review` | Submitted for Admin review | Any Staff |
| `approved` | Cleared for publishing | Admin only |
| `published` | Has been posted externally | Admin |
| `archived` | Retired — not deleted | Admin |

## 6. Step-by-step process

**Submitting for review (Staff):**
1. Go to **Marketing → Library**
2. Find the content item (use search or channel/status filters)
3. Click to open the item
4. Review it yourself first — check the content against brand voice rules (see Section 7)
5. Change status to **In Review**
6. Optionally leave a note in the item comments/notes field
7. Click Save

**Reviewing and approving (Admin):**
1. Go to **Marketing → Library**
2. Filter by **Status: In Review** to see all items waiting for approval
3. Open each item. Check:
   - Does it not start with "Nestled in…" or "This stunning…"?
   - Does it not use: luxurious, stunning, bespoke, curated, elevated?
   - Does at least one technical detail translate into a human consequence?
   - Is it direct and technically confident — like Sam Morris on site?
   - Are the hashtags appropriate for the channel?
   - Is the alt text accurate?
   - Does the CTA match the client stage?
4. If approved: change status to **Approved** and click Save
5. If changes needed: add a note explaining what to change, set status back to **Draft**

**Marking as Published (Admin):**
1. After posting the content to the external platform (Instagram, website, etc.)
2. Open the content item in the Library
3. Change status to **Published**
4. Enter the **Publish Date**
5. Optionally enter the public URL in the **Published URL** field (if the platform provides a direct link)
6. Click Save

[insert screenshot: Library with status filter set to "In Review"]
[insert screenshot: Content item open with status dropdown showing]
[insert screenshot: Approved item with publish date and published URL fields]

## 7. Brand voice self-check (before submitting for review)

Run through this list before changing status to In Review:

- [ ] Does not start with "Nestled in…", "This stunning…", "Beautiful [anything]…"
- [ ] Does not use: luxurious / stunning / bespoke / curated / elevated
- [ ] At least one technical statement has a human translation (what it means for the person living there)
- [ ] Hook in the first 1–2 sentences — tension, curiosity, or a direct opinion
- [ ] No invented measurements, ratings, or product names (only state what is confirmed)
- [ ] Fewer than 3 sentences about how something looks
- [ ] Content reinforces at least one Blue Leaf principle: performance before appearance / weather-tightness / passive thinking / long-term thinking / craftsmanship / architect collaboration / consequence awareness

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| Can't change status to Approved | You may be logged in as Staff — only Admin can approve |
| Content item not appearing in Library | Check filters — may be filtered by a channel or status that excludes it. Clear all filters. |
| Published URL field not visible | This field appears only after status is set to Approved or Published |

## 9. Related modules
- [Generate content with AI](18-02_generate_content_ai.md)
- [Create and manage campaigns](18-05_create_manage_campaigns.md)

## 10. Screenshot placeholders
[insert screenshot: Library tab with search + filter controls visible]
[insert screenshot: Content item detail — full view with all fields]
[insert screenshot: Status dropdown open]

## 11. Automation notes
- Status changes are not currently automated — all manual
- `approved_at` timestamp is set automatically when status changes to `approved`
- `reviewed_by` is set to the current user's UUID on approval
- `published_at` (if field exists on the content item) is set when status changes to `published`

## 12. Edge cases and limits
- Content can be moved back to `draft` from any status — this does not delete it
- `archived` status hides the item from default Library view but does not delete it. Filter by "Archived" to find archived items.
- Version field (`version`) increments when major edits are made — check this if comparing drafts over time

## 13. Owner of the process
Admin  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Log in as Admin
- [ ] At least one content item in `draft` status must exist in the Library
- [ ] Also log in as Staff for the role restriction test

### Test cases

**TC-01 — Staff can submit for review**
1. Log in as Staff
2. Go to Library, open a draft content item
3. Change status to In Review, click Save
4. Expected result: status updates to `in_review`, item appears in "In Review" filter
5. Expected DB: `marketing_content_items.status = 'in_review'`
- [ ] Pass  [ ] Fail

**TC-02 — Staff cannot approve**
1. Log in as Staff
2. Open an `in_review` content item
3. Attempt to change status to Approved
4. Expected result: Approved option is absent from the status dropdown, or save returns a 403 if forced via the API
- [ ] Pass  [ ] Fail

**TC-03 — Admin approves and timestamps set correctly**
1. Log in as Admin
2. Open an `in_review` item
3. Change status to Approved, click Save
4. Expected DB: `status = 'approved'`, `approved_at` = now (within 30 seconds), `reviewed_by` = Admin's UUID
- [ ] Pass  [ ] Fail

**TC-04 — Mark as published sets publish date**
1. Open an approved item
2. Change status to Published, enter today's date as Publish Date
3. Click Save
4. Expected DB: `status = 'published'`, `publish_date` = today
- [ ] Pass  [ ] Fail

**TC-05 — Filter by status works correctly**
1. Go to Library
2. Set filter to Status: In Review
3. Expected result: only items with `status = 'in_review'` visible
4. Change filter to Status: Approved — only approved items visible
5. Clear filters — all non-archived items visible
- [ ] Pass  [ ] Fail

**TC-06 — Move back to draft is non-destructive**
1. Take an approved item
2. Change status back to Draft
3. Expected result: `status = 'draft'`; all other fields (body, title, hashtags) unchanged; `approved_at` is retained in DB (not cleared)
- [ ] Pass  [ ] Fail

**TC-07 — Archive hides item from default view**
1. Set a content item to Archived
2. Go to Library (default view, no filters)
3. Expected result: archived item not visible
4. Apply filter "Archived"
5. Expected result: item appears
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Role restrictions enforced at UI and API level
- [ ] Timestamps set correctly on approval
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
