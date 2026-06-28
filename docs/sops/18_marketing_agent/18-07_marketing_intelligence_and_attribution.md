---
sop_version: 1.0
last_reviewed: 2026-06-28
app_version: marketing-run-a
screenshot_status: placeholders_only
owner: Admin / Director
test_status: untested
---

# SOP 18-07: Marketing Intelligence and Attribution

**Module:** Marketing — Intelligence + Attribution
**SOP ID:** 18-07
**Status:** Draft (Batch 3 — runtime verification pending staging)
**Priority:** Medium

---

## 1. Who uses this
Admin (Sam) and Director to understand content pipeline health and where leads are coming from.

## 2. When to use it
- Weekly marketing review — check the pipeline and see if there are backlogs
- Monthly reporting — understand lead sources and campaign attribution
- When preparing the next week's plan — check next actions from the Intelligence dashboard

## 3. What this does
**Intelligence** (`/marketing/intelligence`) — Shows a read-only snapshot of the content pipeline: how many items are at each status, platform mix, media stats, campaign activity, and recent publishes. Also surfaces automated next actions (e.g. "3 items in review — Josh needs to approve").

**Attribution** (`/marketing/attribution`) — Shows where marketing leads appear to be coming from: source breakdown (Instagram, Facebook, Google, referral, direct, unknown), recent enquiries with source, and data capture recommendations.

Both dashboards are **read-only**. No leads or content items are created or changed here.

## 4. Before you start
- Logged in as Admin.
- For real data: staging DB available with migration 122 applied (Intelligence) and existing leads with `lead_source` or `first_touch_source` set (Attribution).
- Without staging: both dashboards show clearly-labelled demo data.

## 5. How to use Intelligence

**Step 1 — Open Intelligence**
Marketing → **Intelligence** (`/marketing/intelligence`).

**Step 2 — Read next actions**
The top section shows automated recommendations based on current pipeline counts, e.g.:
- "2 packages in review — Josh needs to approve or request changes"
- "1 approved item not yet scheduled — open the Calendar"

Act on these first before continuing the weekly planning session.

**Step 3 — Review the pipeline tiles**
Five tiles: Drafting / In Review / Approved / Scheduled / Published.
- High **In Review** count = Approval Queue backlog
- High **Drafting** count = Josh is actively creating
- Low **Published** count = check the Calendar for scheduled items

**Step 4 — Check platform mix**
Confirm a mix of Instagram and Facebook posts. If all content is one channel, diversify.

**Step 5 — Check media stats**
"With analysis" should be close to "Total assets". Gap means unanalysed photos — open the Media Vault to view them.

**Step 6 — Review campaign activity**
"Templates available" confirms migration 122 seeding. "Slots filled this week" shows how full the week's plan is.

## 6. How to use Attribution

**Step 1 — Open Attribution**
Marketing → **Attribution** (`/marketing/attribution`).

**Step 2 — Choose a time window**
Click 30 / 90 / 180 days. The source breakdown and recent leads update.

**Step 3 — Read source breakdown**
The bar chart shows which sources are sending leads. Good targets:
- Instagram / Facebook should appear once the social content loop is running
- A high "unknown" count means data capture gaps

**Step 4 — Check data capture recommendations**
The "Data capture recommendations" section tells you exactly what to fix (e.g. "Add UTM parameters to Instagram bio links").

**Step 5 — Review recent enquiries**
See the last 5 leads with their source and pipeline stage. For full lead detail, follow the link to the Sales Pipeline.

## 7. Screenshot placeholders
[insert screenshot: Intelligence dashboard — pipeline tiles + next actions]
[insert screenshot: Intelligence — platform mix + media stats]
[insert screenshot: Attribution — source breakdown bar chart]
[insert screenshot: Attribution — recent enquiries list]

## 8. Troubleshooting
| Problem | Solution |
|---|---|
| Intelligence shows demo data | No staging DB or API unreachable — see SOP 18-08 |
| Attribution shows demo data | Same as above |
| Unknown sources very high | Leads are missing `lead_source` — update the Sales Pipeline; add UTM params to links |
| Pipeline all in "Drafting" | Josh is creating but not submitting packages — check Content Studio |
| Media "With analysis" far below total | Some assets not yet analysed — check AI credentials in `.env` |

## 9. Related SOPs
- [Weekly Marketing Planning](18-02_weekly_marketing_planning.md)
- [Content package review](18-04_content_package_review_and_approval.md)
- [Calendar and publishing](18-05_calendar_scheduling_and_manual_publishing.md)

## 10. Automation notes
- Both Intelligence and Attribution are read-only; no writes happen on these pages.
- Attribution data is more complete when `first_touch_source` is populated on leads (requires the website attribution script firing `POST /api/public/attribution` before the enquiry submission).
- The existing full Marketing Intelligence dashboard (SEO, content performance, keyword tracking) is at `/marketing/intelligence` in the legacy tab — this is the advanced SEO-focused module, distinct from the content pipeline health view at `/marketing/intelligence` (new route).

## 11. Edge cases and limits
- The Intelligence dashboard falls back to demo data on any API error — it never crashes.
- The Attribution `?days=` parameter accepts 30, 90, or 180 only (enforced by the UI — not validated server-side).
- Attribution does not pull data from paid ads APIs (Google Ads, Meta Ads).

## 12. Owner of the process
Admin / Director
Next review: after staging runtime verification

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Logged in as Admin
- [ ] Staging DB available; migration 122 applied
- [ ] At least 5 leads in the DB with `lead_source` or `first_touch_source` set
- [ ] At least 3 `marketing_content_items` with various statuses

### Test cases

**TC-01 — Intelligence dashboard loads with real data**
1. Open `/marketing/intelligence`
2. Expected: pipeline tiles show real counts; no demo banner
- [ ] Pass  [ ] Fail

**TC-02 — Next actions reflect real pipeline state**
1. Set one content item to `in_review`; ensure `approved` count is 0
2. Reload Intelligence
3. Expected: "1 package in review — Josh needs to approve..." appears in next actions
- [ ] Pass  [ ] Fail

**TC-03 — Attribution dashboard loads**
1. Open `/marketing/attribution`
2. Expected: source breakdown renders; total leads count matches DB for the last 90 days
- [ ] Pass  [ ] Fail

**TC-04 — Time window filter changes data**
1. On Attribution, click "30 days"
2. Expected: total leads count decreases vs 90-day window (if data spans more than 30 days)
- [ ] Pass  [ ] Fail

**TC-05 — Unknown source bucket appears**
1. Ensure at least one lead has no `lead_source` and no `first_touch_source`
2. Reload Attribution
3. Expected: "unknown" appears in source breakdown with correct count
- [ ] Pass  [ ] Fail

**TC-06 — Demo fallback on both dashboards**
1. Remove DB connection; open both dashboards
2. Expected: demo banner on both; no crash; no empty white screen
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] No console errors
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
