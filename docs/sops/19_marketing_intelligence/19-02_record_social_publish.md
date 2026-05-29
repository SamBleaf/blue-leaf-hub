---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built 2026-05-29
screenshot_status: not_applicable
owner: Admin / Staff
test_status: tested_2026-05-29 — TC-01 PASS (modal opens from Approved content), TC-02 PASS (Instagram pre-selected for Instagram content), TC-03 FAIL (HTTP 400 — camelCase/snake_case mismatch CRIT-01), TC-04 FAIL (same root cause)
---

# SOP 19-02: Record a Social Media Publish

**Module:** Marketing — Content Studio → Library or Intelligence  
**SOP ID:** 19-02  
**Status:** Draft (built — not yet deployed)  
**Priority:** High

> **Note:** This module has been built. Run Section 14 test scripts after deployment to verify.

---

## 1. Who uses this
Admin, Staff (whoever posts the content to the external platform)

## 2. When to use it
Immediately after you have manually posted a content item to Instagram, Facebook, LinkedIn, or any other platform. Blue Leaf posts manually — there is no auto-publish. Recording the publish here is what enables performance tracking.

## 3. What this does
Records that a content item has been published, along with the platform and the platform's post ID (or URL). The system uses this record to pull performance data (reach, engagement, link clicks) back from the Meta Graph API nightly.

**Without recording the publish, there is no performance tracking.** The system cannot know what was posted unless you tell it.

## 4. Before you start
- Content must be in `approved` status before publishing externally
- You need the platform's post ID or URL after posting (from Instagram, Facebook, etc.)
- Content item must exist in the Library

## 5. Step-by-step process

1. Post the content manually to the external platform (Instagram, Facebook, etc.) as you normally would
2. Copy the post URL or post ID from the platform (on Instagram: open the post → copy link; on Facebook: copy the post URL from the browser)
3. Go to **Marketing → Library**
4. Find the content item you just posted
5. Click **Mark as Published**
6. Fill in:
   - **Platform** — Instagram / Facebook / LinkedIn
   - **Platform Post ID / URL** — paste the post link or ID
   - **Caption used** — paste the exact caption used (it may differ slightly from the Library version — capturing the actual posted text is important for attribution accuracy)
   - **Media asset** — select the photo or video used (if a media library asset was used)
7. Click **Save**
8. Status automatically updates to `published`

> 💡 **The Platform Post ID is critical.** Without it, the nightly Meta API sync cannot find this post to pull engagement data. Always paste the post URL at minimum — the system extracts the ID from the URL.

[insert screenshot: "Mark as Published" modal on a Library content item]
[insert screenshot: Published record in Library showing platform badge and published date]

## 6. What happens next
- `social_post_publishes` row created with `content_item_id`, `platform`, `platform_post_id`, `published_at`, `caption_used`
- `marketing_content_items.status` updated to `published`, `published_at` set
- Nightly Meta Graph API sync will pick up this post and pull: reach, impressions, likes, comments, shares, saves, link clicks, engagement rate
- Pulled data stored in `social_post_snapshots` (one row per post per day)
- After data arrives: content item's `total_reach`, `total_engagements`, `total_link_clicks` updated

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Forgetting to record the publish | Posted from phone, forgot to come back to Hub | Make recording the publish part of the posting routine — post → record in Hub → done |
| Not copying the post URL | Closed the app before grabbing it | On Instagram, you can always go back to the post and copy the link from "…" → Copy Link |
| Using a different caption than what's in the Library | Editing the caption in the app at the last minute | Paste the actual caption used — this matters for attribution analysis |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| Performance data not appearing after 24 hours | Check that `META_ACCESS_TOKEN` is valid in Railway env vars — token expires every 60 days and must be refreshed |
| Platform Post ID not recognised | Paste the full post URL instead — the system extracts the ID from it |
| Can't find the content item in Library | Check status filter — may be filtered to Draft only. Clear filters. |

## 9. Related modules
- [Review and approve content](../18_marketing_agent/18-04_review_approve_content.md)
- [View content performance](19-03_content_performance.md)

## 10. Screenshot placeholders
[insert screenshot: Library item with "Mark as Published" button]
[insert screenshot: Filled publish form before saving]
[insert screenshot: Library item showing published status with platform badge]

## 11. Automation notes
- `social_post_publishes` row created on save
- Status → `published` set automatically
- Nightly cron: `POST /api/intelligence/sync/meta` — queries Meta Graph API for all `social_post_publishes` where `published_at > now() - 90 days`
- Per-post data written to `social_post_snapshots` (one snapshot per post per day, unique constraint prevents duplicates)
- Aggregate stats written back to `marketing_content_items.total_reach` etc.

## 12. Edge cases and limits
- Meta API data is usually available within 24 hours of posting — very recent posts may show 0 until the next day's sync
- Engagement data is pulled for posts published in the last 90 days — older posts are dropped from the nightly sync
- If a post is deleted from Instagram, the Meta API returns an error for that post ID — the system marks it with a `deleted` flag rather than removing the data
- LinkedIn is not yet integrated with an API sync — publishing to LinkedIn is recorded but performance data must be entered manually (field: `performance_notes`)

## 13. Owner of the process
Admin / Staff  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Log in as Admin
- [ ] An approved content item exists in the Library
- [ ] A test Instagram post URL or post ID available (can use a real post or a test post in a private account)
- [ ] `META_ACCESS_TOKEN`, `META_IG_USER_ID` configured in Railway env vars

### Test cases

**TC-01 — Happy path: record a publish**
1. Open an approved content item in the Library
2. Click Mark as Published
3. Fill in: Platform = Instagram, Platform Post URL = [valid Instagram post URL], Caption Used = [any text]
4. Click Save
5. Expected result: content item status = `published`; platform badge visible on the item card
6. Expected DB: `social_post_publishes` row with `content_item_id`, `platform = 'instagram'`, `platform_post_id` extracted from URL, `published_at` = now
7. Expected: `marketing_content_items.status = 'published'`, `published_at` set
- [ ] Pass  [ ] Fail

**TC-02 — Can't mark published without Platform Post ID**
1. Open Mark as Published modal
2. Leave Platform Post ID / URL blank
3. Click Save
4. Expected result: validation error on Platform Post ID field
- [ ] Pass  [ ] Fail

**TC-03 — Post ID extraction from URL**
1. Paste a full Instagram post URL: `https://www.instagram.com/p/[shortcode]/`
2. Expected result: `platform_post_id` in the DB contains the extracted shortcode, not the full URL
- [ ] Pass  [ ] Fail

**TC-04 — Nightly sync creates snapshot records**
1. After TC-01, manually trigger the Meta sync: `POST /api/intelligence/sync/meta`
2. Wait for the sync to complete (should take < 30 seconds)
3. Expected DB: `social_post_snapshots` row for the post with `snapshot_date = today`, `reach`, `likes`, `impressions` populated (may be 0 for a very recent post — that's acceptable)
- [ ] Pass  [ ] Fail

**TC-05 — Duplicate snapshot not created**
1. Trigger the Meta sync a second time on the same day
2. Expected DB: still only one `social_post_snapshots` row per post per date (unique constraint working)
- [ ] Pass  [ ] Fail

**TC-06 — Performance stats written back to content item**
1. After TC-04, check the content item
2. Expected DB: `marketing_content_items.total_reach` is updated from 0 to a real value (or 0 if post is very new — that's acceptable; test that the field is being set rather than NULL)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Status flow works: approved → published
- [ ] Platform Post ID extracted correctly from URL
- [ ] Meta sync creates snapshot records
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
