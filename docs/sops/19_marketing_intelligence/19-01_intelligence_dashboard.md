---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built 2026-05-29
screenshot_status: not_applicable
owner: Admin / Director
test_status: tested_2026-05-29 — TC-01 FAIL (This Month shows NaN×4 — wrong API URL + wrong key names CRIT-02), TC-02 SKIP, TC-03 SKIP (GSC not configured), TC-04 SKIP (social accounts not configured), TC-05 FAIL (last_refreshed always shows "unknown")
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
Shows everything marketing-related that matters in one view, organised around five questions:
1. How do I get more good clients?
2. What content is working?
3. What should I post or create next?
4. What should I improve on the website?
5. Who should I follow up?

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

[insert screenshot: Full Intelligence dashboard — all five sections visible]
[insert screenshot: "Follow Up Now" section with 3 contacts showing engagement details]
[insert screenshot: "Create Next" section with three suggestions]

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

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| Dashboard shows "No data available" for all sections | Data sync jobs have not run yet — trigger manually from Settings → Marketing Intelligence → Sync Now |
| KPI numbers look wrong | Check that attribution events are flowing — open Attribution drill-down to verify source breakdown |
| Follow Up Now shows wrong contacts | Engagement scoring runs nightly — if a contact was recently active, wait until next morning for the list to update |

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
- Dashboard data is pre-computed nightly — not live-queried on page load (prevents slow loads)
- `GET /api/intelligence/dashboard` returns a pre-computed summary payload
- Social data: pulled nightly from Meta Graph API by the sync cron job
- Google data: pulled weekly (Sunday 3am) from GSC and GA4
- GBP data: pulled monthly (1st of each month)
- Follow Up Now scores: recomputed nightly using the deterministic algorithm:
  `email_opens × 3 + website_visits × 5 + case_study_views × 4 + days_since_last_contact × 0.5 + relationship_score × 0.2`
- Create Next suggestions: Haiku AI job, cached 14 days, recomputed when new attribution data arrives

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

### Post-test checklist
- [ ] All test cases passed
- [ ] Dashboard loads within 3 seconds
- [ ] No console errors
- [ ] All five sections render correctly (with or without data)
- [ ] Links from dashboard to other modules navigate correctly
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
