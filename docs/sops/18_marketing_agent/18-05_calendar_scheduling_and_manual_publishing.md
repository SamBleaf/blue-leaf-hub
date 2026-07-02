---
sop_version: 1.1
last_reviewed: 2026-07-02
app_version: marketing-run-a
screenshot_status: placeholders_only
owner: Admin / Marketing Operator
test_status: untested
---

# SOP 18-05: Calendar Scheduling and Manual Publishing

**Module:** Marketing — Calendar
**SOP ID:** 18-05
**Status:** Draft (Run A — runtime verification pending staging)
**Priority:** High

---

## 1. Who uses this
Admin (Sam) and marketing operator (Josh) to see what is scheduled for the week and to log posts as published after posting manually on the platform.

## 2. When to use it
- At the start of each day to check what is due to post today
- After manually posting on Instagram or Facebook to log it as published in the Hub
- To reschedule a post to a different day

## 3. What this does
The Marketing Calendar shows all content items that have a `scheduled_at` date in the selected week, alongside any campaign slot markers. After you post manually on the platform, click **Mark as posted** in the Calendar to record it. The Hub never auto-posts — all publishing is manual.

## 4. Before you start
- Logged in as Admin.
- At least one package has been approved (SOP 18-04). Approved items appear as schedule-candidates.
- Migration 122 applied (`social_post_publishes.publish_mode` column). Without it, the publish log endpoint will not work.

## 5. How to schedule and log a post

**Step 1 — Open the Calendar**
Marketing → **Calendar** (`/marketing/calendar`).

**Step 2 — Navigate to the correct week**
Use **← Prev** and **Next →** to move weeks.

**Step 3 — See what is scheduled**
Content items with `scheduled_at` in the current week appear as cards on their day.
Approved items without a `scheduled_at` appear in the "Unscheduled" section.

**Step 4 — Schedule an approved item**
From the unscheduled list, click the item, choose a date/time, and confirm. This calls `POST /api/marketing/schedule` which sets `content_items.scheduled_at`.

**Step 5 — Post manually on the platform**
Go to Instagram or Facebook and post the content. Do not use any auto-publishing feature in the Hub.

**Step 6 — Mark as posted in the Hub**
Return to the Calendar, find the item, click **Mark as posted**. The Hub:
- Creates a record in `social_post_publishes` with `publish_mode = manual`, `publish_status = logged`
- Sets `marketing_content_items.status = published`

**Step 7 — Confirm the log**
The item moves to the "Published" section. A green tick appears on the card.

## 6. What the Calendar shows

| Section | Content |
|---|---|
| Scheduled | Items with `scheduled_at` in the current week |
| Campaign slots | Empty or filled slots from the Weekly Planner |
| Published | Items logged as posted this week |

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Forgetting to log a post in the Hub after posting externally | Posting on IG then moving on | Return to the Calendar immediately after posting and click "Mark as posted" — the log is how the Hub knows it was published |
| Scheduling an item that is still in draft | Not checking status | Only approved items should be scheduled. Check the item's status in the Library before assigning a `scheduled_at` date. |
| Logging a split post as one entry | Convenience | If a piece of content was posted on both IG and FB on different days, log each separately in the Calendar |

## 8. Troubleshooting
| Problem | Solution |
|---|---|
| Calendar shows demo data | Migration 122 not applied or no staging DB — see SOP 18-08 |
| "Mark as posted" button missing | Item is not in `approved` or `scheduled` status — check the Approval Queue |
| Published log not updating | API error — check console; retry |
| Item not appearing on the correct day | Check `scheduled_at` — it may be in a different week |

## 9. Related modules
- [Content package review](18-04_content_package_review_and_approval.md)
- [Evergreen Library](18-06_evergreen_library.md)

## 10. Screenshot placeholders
[insert screenshot: Calendar week view with scheduled cards]
[insert screenshot: "Mark as posted" button on a scheduled card]
[insert screenshot: Published item with green tick]

## 11. Automation notes
- The Hub does **not** auto-post to Instagram or Facebook. All posting is manual.
- `publish_mode = manual` is always set when using the Calendar's Mark as posted button.
- `social_post_publishes` stores the log entry. `marketing_content_items.status = published` is updated atomically.

## 12. Edge cases and limits
- An item can only be marked as posted once per channel. Re-clicking does a duplicate check.
- If you post on IG but not FB (a split post), log them separately.
- The Calendar does not pull live engagement data — that comes from the Meta sync in Marketing Intelligence.

## 13. Owner of the process
Admin / Marketing Operator
Next review: after staging runtime verification

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Migration 122 applied
- [ ] At least one `marketing_content_items` row with `status = approved` and a `scheduled_at` in the test week
- [ ] Logged in as Admin
- [ ] Staging DB available

### Test cases

**TC-01 — Calendar loads for the current week**
1. Open `/marketing/calendar`
2. Expected: current week rendered; no JS error; demo banner absent if DB is available
- [ ] Pass  [ ] Fail

**TC-02 — Week navigation works**
1. Click **← Prev** and **Next →**
2. Expected: week label updates; content for that week loads
- [ ] Pass  [ ] Fail

**TC-03 — Scheduled items appear on the correct day**
1. Set `scheduled_at` on a content item to this Tuesday
2. Open Calendar for current week
3. Expected: item card appears under Tuesday
- [ ] Pass  [ ] Fail

**TC-04 — Mark as posted creates a publish log**
1. Click **Mark as posted** on an approved/scheduled item
2. Expected: `social_post_publishes` gets a new row with `publish_mode = manual`; item's `status = published`
- [ ] Pass  [ ] Fail

**TC-05 — Demo fallback shows without real data**
1. Open `/marketing/calendar` with no staging DB
2. Expected: demo content shown; "Mark as posted" calls are no-ops; no crash
- [ ] Pass  [ ] Fail

**TC-06 — Approval Queue link works from Calendar**
1. Find the Approval Queue link in the Calendar header
2. Expected: navigates to `/marketing/approval`
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
