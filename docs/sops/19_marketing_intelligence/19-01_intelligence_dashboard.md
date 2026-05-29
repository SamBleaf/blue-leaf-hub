---
sop_version: 1.1
last_reviewed: 2026-05-30
app_version: 1.1 — updated 2026-05-30
screenshot_status: not_applicable
owner: Admin / Director
test_status: static_pass
---

# SOP 19-01: Use the Marketing Intelligence Dashboard

**Module:** Marketing — Intelligence tab  
**SOP ID:** 19-01  
**Status:** Draft (built — not yet deployed)  
**Priority:** High

> **Note:** This module has been built. Run Section 14 test scripts after deployment to verify.

---

## 1. Who uses this
Admin, Director

## 2. When to use it
Daily or weekly check-in on whether marketing is generating results. Opens the Marketing module and goes straight to the Intelligence tab for an at-a-glance read of performance.

## 3. What this does
Shows everything marketing-related that matters in one view, organised around seven sections:
1. How do I get more good clients? (This Month KPIs)
2. What content is working? (What's Working / Not Working)
3. What should Google show for me? (Google Opportunity)
4. Who should I follow up? (Follow Up Now)
5. What should I create next? (Create Next)
6. Which suburbs are engaging? (Suburb Engagement)
7. What's happening on the website? (Website Pages)

An AI-generated weekly summary banner appears at the top when enough data is available.

All depth is behind drill-downs. The dashboard itself is a summary only.

## 4. Before you start
- The Intelligence tab appears in Marketing alongside Create, Library, Campaigns, Media
- At minimum, some content must have been published and recorded (SOP 19-02) before performance data appears
- Follow-up signals require CRM contacts with email/website interactions logged

## 5. The five dashboard sections

**Section 1 — This Month (top strip)**

Shows four KPIs for the current calendar month:
- **Enquiries** — number of new leads whose first-touch or last-touch source is marketing
- **Qualified leads** — of those enquiries, how many passed to qualifying stage
- **Tenders** — how many reached tender stage
- **Signed** — contracts signed

> Click "View pipeline →" to open the Sales module filtered to this month's marketing-attributed leads.

**Section 2 — What's Working / What's Not (side by side)**

Left panel — top 3 content themes generating enquiries or strong engagement.
Right panel — bottom 3 content themes (high effort, low result).

Each item shows: content type / theme, number of attributed enquiries, engagement trend.

> Click any item to drill into the full Content Performance table (all content items ranked by score).

**Section 3 — Google Opportunity**

Top 2 keyword opportunities ranked by: position × impression volume × potential traffic gain.

Each shows: keyword phrase, current position, estimated monthly clicks if in top 3, action button.

> Click "Create content →" to open the Create tab with the keyword pre-loaded as the topic.
> Click "Improve page →" to open the Website Page inventory for that keyword's target page.

**Section 4 — Follow Up Now**

Top contacts who have shown high engagement signals (email opens, website visits, case study views) but have not had a personal interaction recently.

Each shows: name, role, last interaction date, what they engaged with, action button.

> Click "Call [Name] →" or "Log interaction →" to open their CRM contact panel directly.

**Section 5 — Create Next**

Three content suggestions generated from:
- What's currently converting (lean into it)
- Keyword gaps (search volume with no content)
- Questions from the Question Engine (questions asked by leads/clients that haven't been answered as content)

Each suggestion shows: suggested topic, why it was suggested, content type, action button.

> Click "Create →" on any suggestion to open the Create tab pre-loaded with that topic.

**Section 6 — Suburb Engagement**

Bar chart showing the top suburbs by enquiry count over the last 90 days. Each row shows suburb name, enquiry bar, total enquiries, and qualified count in green.

This tells you which areas your marketing is reaching and which suburbs are producing qualified prospects — useful for deciding whether to create suburb-specific content (e.g. "Custom home builder Burnside").

**Section 7 — Website Pages**

Table of all tracked website pages. Columns: URL/title, page type, status badge (Live/Planned/Needs Update), cluster, Google position, impressions, and a "Generate brief" button.

- ⚠ icon = page not updated in 6+ months — stale content that may need a refresh
- "Generate brief" calls AI (Sonnet) to produce a recommended title, H1, H2 headings, content angles, and target word count. The brief appears inline below the row.

**AI Summary banner**

When there is enough content performance data (≥ 3 published items), a Haiku-generated summary appears at the top of the dashboard as a blue banner. This is a plain-English interpretation of the week's performance — what's up, what's down, what to do about it. Refreshes weekly.

**Sync controls (top right)**

Four sync buttons:
- **Sync Social** — pulls Meta Graph API post insights for all posts published in the last 90 days
- **Sync Search Console** — pulls GSC weekly query + page data (requires `GOOGLE_SEARCH_CONSOLE_SITE_URL` in Railway)
- **Sync GA4** — pulls GA4 source/medium breakdown and top pages (requires `GA4_PROPERTY_ID` in Railway)
- **Sync Google Business** — pulls GBP calls, website clicks, direction requests, impressions (requires `GBP_LOCATION_ID` in Railway)

[insert screenshot: Full Intelligence dashboard — all seven sections visible]
[insert screenshot: Suburb Engagement bar chart]
[insert screenshot: Website Pages table with SEO brief expanded inline]
[insert screenshot: AI Summary banner at top]

## 6. What happens next
- Dashboard is read-only — no data is modified by viewing it
- Actions taken from the dashboard (Create content, Call contact, Log interaction) navigate to the relevant module

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Enquiries shows 0 | Attribution capture not set up — website enquiry form not sending UTM data to Hub | Follow P0 build steps: attribution capture endpoint must be active and website form must post to it |
| "What's Working" shows nothing | No social publishes recorded in the system | Use SOP 19-02 to record each post after publishing it manually |
| Follow Up Now shows no contacts | No CRM contacts with email interactions | The CRM must be built (MODULE 3) and contacts must have mailing list subscriptions |
| Google Opportunity shows nothing | Search Console sync not configured | Add `GOOGLE_SEARCH_CONSOLE_SITE_URL` to Railway and run the first GSC sync |
| Suburb Engagement shows nothing | No leads have a suburb field populated | Add suburb data when creating leads in Sales Manager |
| AI Summary banner not appearing | Fewer than 3 published content items tracked | Record at least 3 social publishes (SOP 19-02) and re-run the sync |
| GA4 Sync fails | `GA4_PROPERTY_ID` not configured in Railway | Add the GA4 property ID (format: `123456789`) to Railway env vars |
| Google Business Sync fails | `GBP_LOCATION_ID` not configured in Railway | Add the location ID (format: `locations/123456789`) to Railway env vars |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| Dashboard shows "No data available" for all sections | Data sync jobs have not run yet — use the sync buttons in the top-right to manually trigger |
| KPI numbers look wrong | Check that attribution events are flowing — open Attribution drill-down to verify source breakdown |
| Follow Up Now shows wrong contacts | Engagement scoring runs nightly — if a contact was recently active, wait until next morning for the list to update |
| Website Pages table is empty | No pages have been added to the `website_pages` inventory — add them via the Hub API or wait for the planned page management UI |
| Sync Google Business returns "GBP not configured" | Add `GBP_LOCATION_ID` to Railway — format must be `locations/XXXXXXX` including the `locations/` prefix |
| Sync GA4 returns "GA4 not configured" | Add `GA4_PROPERTY_ID` to Railway — numeric property ID only (no `properties/` prefix) |

## 9. Related modules
- [Record a social media publish](19-02_record_social_publish.md)
- [View content performance](19-03_content_performance.md)
- [Keyword tracking and SEO](19-04_keyword_seo_tracking.md)
- [Attribution dashboard](19-05_attribution_dashboard.md)
- [Use the Question Engine](19-07_question_engine.md)

## 10. Screenshot placeholders
[insert screenshot: Intelligence tab selected — full dashboard view]
[insert screenshot: "This Month" KPI strip]
[insert screenshot: Content drill-down table — all content ranked]

## 11. Automation notes
- Dashboard data is computed on-request — `GET /api/intelligence/dashboard` does live aggregation on load
- Social data: pulled via `POST /api/intelligence/sync/meta` (Meta Graph API; requires `META_ACCESS_TOKEN`, `META_IG_USER_ID`)
- GSC data: pulled via `POST /api/intelligence/sync/gsc` (requires `GOOGLE_SEARCH_CONSOLE_SITE_URL`)
- GA4 data: pulled via `POST /api/intelligence/sync/ga4` (requires `GA4_PROPERTY_ID`; uses GA4 Data API v1beta)
  - Pulls: sessions by source/medium, top 50 pages by sessions, engaged sessions, conversions, new users
  - Upserts to `ga4_snapshots` table
- GBP data: pulled via `POST /api/intelligence/sync/gbp` (requires `GBP_LOCATION_ID` format: `locations/XXXXXXX`)
  - Pulls: website clicks, call clicks, direction requests, impressions over last 30 days
  - Upserts to `gbp_snapshots` table
- All Google APIs (GSC, GA4, GBP) share the same OAuth credentials: `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`
- Suburb engagement: deterministic aggregation from `leads` table by `suburb` field, last 90 days — no AI
- AI Summary: Haiku model, cached in memory by ISO week key — one call per week maximum. Response field is `ai_summary` in dashboard payload.
- Follow Up Now scores (when CRM is built): `email_opens × 3 + website_visits × 5 + case_study_views × 4 + days_since_last_contact × 0.5 + relationship_score × 0.2`
- Create Next suggestions: Haiku AI, cached 14 days, recomputed when new attribution data arrives
- Website Pages: fetched live from `GET /api/intelligence/pages` (separate from dashboard endpoint)
- SEO briefs: `POST /api/intelligence/pages/:id/brief` — Haiku, cached 90 days in `seo_content_briefs` table

## 12. Edge cases and limits
- If it is the 1st of the month, "This Month" KPIs will show 0 until the first enquiry of the new month arrives
- Dashboard does not show data older than 90 days by default
- All five sections can independently show "No data" without breaking the page — each section degrades gracefully

## 13. Owner of the process
Admin / Director  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

> Run these tests after the Marketing Intelligence module has been deployed.

### Pre-test setup
- [ ] Log in as Admin
- [ ] At least 3 social publish records exist (SOP 19-02 completed ≥3 times)
- [ ] At least 1 attribution event exists (from enquiry form submission)
- [ ] At least 5 CRM contacts with email interaction data exist
- [ ] `GOOGLE_SEARCH_CONSOLE_SITE_URL` configured and first GSC sync run
- [ ] Meta Graph API sync run at least once

### Test cases

**TC-01 — Dashboard loads without error**
1. Navigate to Marketing → Intelligence tab
2. Expected result: page loads within 3 seconds; all five sections visible; no "Failed to load" or blank panels
3. Expected API: `GET /api/intelligence/dashboard` returns 200 with non-empty payload
- [ ] Pass  [ ] Fail

**TC-02 — This Month KPIs match Sales data**
1. Check "This Month → Enquiries" number on the dashboard
2. Go to Sales Manager, filter leads by created this month, source = marketing
3. Expected result: counts match (or are within 1 — timing difference acceptable)
- [ ] Pass  [ ] Fail

**TC-03 — What's Working section shows content-attributed data**
1. Confirm at least one content item has `attributed_enquiries > 0`
2. Expected result: "What's Working" panel shows that content item's theme
- [ ] Pass  [ ] Fail

**TC-04 — Google Opportunity section shows keywords**
1. Confirm GSC sync has run
2. Expected result: at least 1 keyword shown with position + impressions data
3. Expected DB: `search_console_snapshots` has rows for the current week
- [ ] Pass  [ ] Fail

**TC-05 — Follow Up Now shows contacts with engagement**
1. Confirm CRM contacts have `last_opened_at` data (email opens recorded)
2. Expected result: "Follow Up Now" section shows ≥1 contact
3. Click "Log interaction →" on a contact — expected: CRM contact panel opens for that contact
- [ ] Pass  [ ] Fail

**TC-06 — Create Next links to Create tab**
1. A suggestion exists in "Create Next"
2. Click "Create →" on a suggestion
3. Expected result: Create tab opens with the suggested topic pre-loaded in the Topic field
- [ ] Pass  [ ] Fail

**TC-07 — Dashboard degrades gracefully with no data**
1. View the dashboard on a fresh environment with no synced data
2. Expected result: each empty section shows a "No data" or empty-state message — not a JavaScript error or blank white panel
- [ ] Pass  [ ] Fail

**TC-08 — Suburb Engagement section**
1. Ensure at least 3 leads have `suburb` field populated in Sales Manager
2. Load the dashboard
3. Expected: Suburb Engagement bar chart section appears with those suburbs listed
4. Expected API: `GET /api/intelligence/dashboard` response includes `suburb_engagement` array with `{ suburb, enquiries, marketing, qualified }` objects
5. Expected: suburb with most enquiries has the longest bar
- [ ] Pass  [ ] Fail

**TC-09 — AI Summary banner**
1. Ensure at least 3 published content items exist in the system
2. Load the dashboard
3. Expected: blue banner at top with "This Week's Intelligence Summary" and a 2–3 sentence Haiku-generated summary
4. Expected API: dashboard response includes `ai_summary` field (non-null string)
5. Reload the page immediately — expected: same summary returned (cached, no second AI call)
- [ ] Pass  [ ] Fail

**TC-10 — Website Pages section**
1. Add at least one page via `POST /api/intelligence/pages` with `{ urlPath: "/test-page", title: "Test", pageType: "service", status: "live" }`
2. Load the dashboard
3. Expected: Website Pages table appears at the bottom of the page
4. Expected: table row shows url_path, type badge, status badge ("live"), cluster ("—" if none), and "Generate brief" button
5. Expected API: `GET /api/intelligence/pages` returns `{ ok: true, pages: [...] }` with the new page
- [ ] Pass  [ ] Fail

**TC-11 — Generate SEO brief inline**
1. From TC-10, click "Generate brief" on the test page
2. Expected: button shows "Generating…" while loading
3. Expected result: brief section expands inline below the row with recommended title, H1, H2 headings, content angles, word count target
4. Expected API: `POST /api/intelligence/pages/:id/brief` returns `{ ok: true, brief: { recommendedTitle, recommendedH1, recommendedH2s, ... } }`
- [ ] Pass  [ ] Fail

**TC-12 — GA4 sync**
1. Ensure `GA4_PROPERTY_ID` is set in Railway
2. Click "Sync GA4" button
3. Expected: button shows "Syncing…" then "GA4 sync complete — N updated"
4. Expected API: `POST /api/intelligence/sync/ga4` returns `{ ok: true, updated: N, snapshotDate: "YYYY-MM-DD" }`
5. Expected DB: new rows in `ga4_snapshots` with today's date
- [ ] Pass  [ ] Fail

**TC-13 — GBP sync**
1. Ensure `GBP_LOCATION_ID` is set in Railway (format: `locations/XXXXXXX`)
2. Click "Sync Google Business" button
3. Expected: button shows "Syncing…" then "Google Business sync complete — 1 updated"
4. Expected API: `POST /api/intelligence/sync/gbp` returns `{ ok: true, updated: 1, snapshotDate: "YYYY-MM-DD" }`
5. Expected DB: new row in `gbp_snapshots` with today's date and non-null `website_clicks`, `phone_calls`, `direction_requests`
- [ ] Pass  [ ] Fail

**TC-14 — Sync buttons disabled while syncing**
1. Click any sync button
2. Expected: all four sync buttons show `disabled` state (greyed out) while the active sync is in progress
3. Expected: only the active button shows "Syncing…" — other buttons remain labelled normally but are disabled
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Dashboard loads within 3 seconds
- [ ] No console errors
- [ ] All seven sections render correctly (with or without data)
- [ ] Links from dashboard to other modules navigate correctly
- [ ] Suburb Engagement shows correct suburb ordering (most enquiries first)
- [ ] AI Summary displays only when ≥ 3 content items exist
- [ ] Website Pages Generate Brief works inline without page navigation
- [ ] All four sync buttons work and show correct feedback messages
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
