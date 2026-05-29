---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built 2026-05-29
screenshot_status: not_applicable
owner: Admin / Director
test_status: tested_2026-05-29 — ALL SKIP. Requires published social data (blocked by CRIT-01) and intelligence queries on mode/content_pillar columns that do not exist (CRIT-05). Cannot be tested until both are fixed.
---

# SOP 19-03: View Content Performance

**Module:** Marketing — Intelligence tab → Content Performance drill-down  
**SOP ID:** 19-03  
**Status:** Draft (built — not yet deployed)  
**Priority:** High

---

## 1. Who uses this
Admin, Director

## 2. When to use it
Weekly — to understand which content is actually driving enquiries and engagement. Use this before deciding what to create next.

## 3. What this does
Shows every published content item ranked by a composite performance score. The score is deterministic — calculated from attributed enquiries, engagement rate, and link clicks. No AI guesswork.

**Performance Score formula (deterministic):**
`(attributed_enquiries × 40) + (engagement_rate × 100 × 30) + (total_link_clicks × 30)`

Higher weight on attributed enquiries because that's the outcome that matters. Reach and likes are vanity metrics — not included.

## 4. Before you start
- At least some content must be published and recorded (SOP 19-02)
- Attribution data requires the website enquiry form to be connected (P0 setup)
- Social engagement data requires the nightly Meta sync to have run at least once

## 5. Step-by-step process

**Opening the Content Performance table:**
1. Go to **Marketing → Intelligence**
2. In the "What's Working" panel, click any content theme or click **"See all content performance →"**
3. The Content Performance table opens showing all published content items

**Reading the table:**

| Column | What it shows |
|--------|--------------|
| Content | Title, channel badge, content mode, published date |
| Score | Composite performance score (see formula above) |
| Attributed enquiries | Number of enquiries where this content was the first or last touch |
| Reach | Total people who saw the post (social only) |
| Engagement rate | (likes+comments+shares+saves) ÷ reach |
| Link clicks | Clicks on the link in the post or email |
| Published | Date first published |

**Filtering and sorting:**
- Sort by any column — default is Score (descending)
- Filter by Channel, Content Mode, Campaign, Date Range
- Toggle between "All time" and "Last 30 days" / "Last 90 days"

**Understanding what the data means:**

High score, few posts: Your authority and educational content is working. Create more of it.

High reach, low attributed enquiries: Content is getting seen but not converting — check if the CTA matches the audience stage.

Low reach, high attributed enquiries: Content is reaching exactly the right people. Invest more in this theme.

High engagement, low link clicks: People like the post but aren't clicking through. If the goal was brand awareness, this is fine. If the goal was traffic, the CTA needs strengthening.

**Identifying underperformers:**
- Sort by Score ascending to see lowest-performing content
- Look for patterns: is it a specific channel? A specific content mode? A specific topic area?
- Underperformers with high effort (long-form) are the first to cut

[insert screenshot: Content Performance table sorted by Score]
[insert screenshot: Filter controls — channel, mode, campaign, date range]

## 6. What happens next
- Table is read-only
- Use findings to inform what to create next (SOP 19-07 Question Engine, or directly in Create tab)
- Low-performing content can be archived from the Library

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Optimising for reach instead of attributed enquiries | Reach is the most visible metric | A post with 5,000 reach and 0 enquiries is worth less than a post with 200 reach and 1 enquiry. Focus on the Score column. |
| Acting on one week of data | Recency bias | Use "Last 90 days" as the default view — individual weekly results can be misleading |
| Ignoring content mode patterns | Only looking at individual posts | Group by content mode to see whether Educate, Authority, or Behind the Scenes consistently outperforms |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| Attributed enquiries showing 0 for all content | Attribution capture (P0 build) not complete — website form not sending UTM data |
| Reach/engagement data missing for recent posts | Meta sync hasn't run yet or ran before the post was recorded — wait 24 hours |
| Performance score identical for all items | All fields are 0 — no sync data yet. Score formula returns 0 when all inputs are 0. |

## 9. Related modules
- [Record a social media publish](19-02_record_social_publish.md)
- [Use the Question Engine](19-07_question_engine.md)
- [Attribution dashboard](19-05_attribution_dashboard.md)

## 10. Screenshot placeholders
[insert screenshot: Full content performance table with populated data]
[insert screenshot: Sorted by attributed enquiries — top performers highlighted]

## 11. Automation notes
- Performance score computed in code (not AI) — recalculated on each dashboard refresh from live values
- Social stats: pulled from `social_post_snapshots` latest snapshot per post
- `attributed_enquiries` and `attributed_lead_value` on `marketing_content_items` updated nightly from `enquiry_attribution` table
- Email performance (for email channel content): pulled from `email_send_recipients` open/click data via Resend webhooks

## 12. Edge cases and limits
- Content items without a `social_post_publishes` record have reach = 0 and engagement = 0 — their Score is based only on attributed enquiries
- LinkedIn performance data is manual (not API-synced yet) — LinkedIn items will show 0 for social metrics
- The table shows up to 200 items; use date filters to narrow the view for high-volume content libraries

## 13. Owner of the process
Admin / Director  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Log in as Admin
- [ ] ≥5 published content items with `social_post_publishes` records
- [ ] Meta sync has run at least once (some items have `total_reach > 0`)
- [ ] At least 1 item has `attributed_enquiries > 0` (attribution capture working)

### Test cases

**TC-01 — Table loads all published content**
1. Go to Marketing → Intelligence → "See all content performance →"
2. Expected result: table loads; all published content items visible
3. Expected: items without publish records also show (with 0 score)
- [ ] Pass  [ ] Fail

**TC-02 — Performance score calculated correctly**
1. Find an item with known values: e.g. attributed_enquiries = 1, engagement_rate = 0.05, link_clicks = 10
2. Expected score: (1 × 40) + (0.05 × 100 × 30) + (10 × 30) = 40 + 150 + 300 = 490
3. Verify the score shown in the table matches this calculation
- [ ] Pass  [ ] Fail

**TC-03 — Sort by column works**
1. Click "Attributed enquiries" column header
2. Expected result: items re-sort with highest attributed enquiries at top
3. Click again — expected: reverses to ascending order
- [ ] Pass  [ ] Fail

**TC-04 — Filter by channel works**
1. Apply Channel = Instagram filter
2. Expected result: only Instagram content items visible
3. Apply Channel = Email — only email items visible
4. Clear filters — all items visible again
- [ ] Pass  [ ] Fail

**TC-05 — "Last 30 days" filter excludes older items**
1. Apply date range = Last 30 days
2. Expected result: only items with `published_at` within the last 30 days visible
3. Items older than 30 days should not appear
- [ ] Pass  [ ] Fail

**TC-06 — Zero-data items don't crash the table**
1. Ensure at least one published content item has no sync data (no `social_post_publishes` record)
2. Expected result: item appears in table with Score = 0, all metric columns showing "—" or "0"
3. No JavaScript error in console
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Score formula calculation verified manually
- [ ] Sort and filter controls work correctly
- [ ] No console errors
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
