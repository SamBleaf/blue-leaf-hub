---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built 2026-05-29
screenshot_status: not_applicable
owner: Admin / Director
test_status: untested
---

# SOP 19-08: Manage the Website Page Inventory

**Module:** Marketing — Intelligence tab → Website drill-down  
**SOP ID:** 19-08  
**Status:** Draft (built — not yet deployed)  
**Priority:** Medium

---

## 1. Who uses this
Admin, Director

## 2. When to use it
When planning new website pages, tracking which pages exist and their SEO status, or identifying stale pages that need refreshing. The website page inventory is the Hub's record of every page on the Blue Leaf website and what each one is targeting.

## 3. What this does
Maintains a list of every website page with its SEO metadata (primary keyword, target position, word count, cluster) and live GSC performance data (impressions, clicks, CTR, average position). Flags pages that are stale (not updated in 6+ months) and surfaces pages with declining performance.

## 4. Before you start
- GSC sync must be configured and running (weekly)
- No pages exist by default — you add them manually when setting up

## 5. Step-by-step process

**Adding a page to the inventory:**
1. Go to **Marketing → Intelligence → Website** (via "What should I improve on the website?" drill-down)
2. Click **+ Add Page**
3. Fill in:
   - **URL path** — the page path on the website (e.g. `/passive-design`, `/suburb/burnside`)
   - **Title** — current page title
   - **Meta description** — current meta description (copy from the live page)
   - **H1** — current page heading
   - **Page type** — Homepage / Service / Suburb / Case Study / Client Guide / FAQ / Journal / About / Process
   - **Primary keyword** — the main keyword this page should rank for (must match a keyword in `keyword_targets`)
   - **Cluster** — which content cluster this page belongs to (e.g. "Passive Design")
   - **Target word count** — how long the page content should be
   - **Status** — Planned / Live / Needs Update / Archived
   - **Last published date** — when the page was last updated on the live site
4. Click Save

**Reading the page inventory table:**

| Column | What it shows |
|--------|--------------|
| Page | URL path + title |
| Type | Page type badge |
| Primary keyword | The target keyword |
| Position | Current GSC average position (last 28 days) |
| Impressions | Monthly GSC impressions |
| CTR | Click-through rate from search results |
| Status | Live / Planned / Needs Update / Archived |
| Stale flag | 🔴 = not updated in > 6 months |
| SEO brief | ✓ = brief exists | — = generate one |

**Identifying pages that need attention:**

🔴 Stale flag: page hasn't been updated in 6+ months. Google treats fresh content as a positive signal. Click "Refresh →" to open the Create tab with a brief to update the page.

Position declining (↓ trend in keyword tracker): something changed — either the page's content weakened relative to competitors, or a competitor published something better. Generate a new SEO brief.

High impressions, low CTR: the page is showing in search results but people aren't clicking. The title and meta description need to be more compelling. The SEO brief will recommend improvements.

Low impressions, target keyword has volume: the page may not be indexed properly, or it's too new. Check Google Search Console directly for the page URL.

**Marking a page as updated:**
1. After updating the live website page, open the page record in the Hub
2. Update **Last published date** to today
3. Change **Status** to Live (if it was Needs Update)
4. Click Save — the stale flag clears automatically

[insert screenshot: Website page inventory table with stale flags and position data]
[insert screenshot: Add page form]
[insert screenshot: Page detail — GSC metrics + SEO brief section]

## 6. What happens next
- Page inventory is the source of truth for what exists on the website
- SEO briefs are generated per page (SOP 19-06)
- GSC data updates weekly from the sync job
- When a page is marked as Published with `content_item_id` set, the content item is linked to the page for attribution tracking

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Adding every page then never maintaining it | Initial enthusiasm | The inventory only has value if `last_published_date` is kept current. After each website update, update the record. Otherwise stale flags become meaningless. |
| Setting the wrong primary keyword | Optimising for the wrong thing | Each page should target ONE keyword. If you try to target three keywords on one page, you'll rank weakly for all three. |
| Ignoring Planned status pages | They feel hypothetical | Planned pages with a brief already generated are ready to write. They represent identified gaps. Treat them as a backlog, not a wish list. |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| GSC data not showing for a page | The page URL must exactly match how GSC reports it — check for trailing slashes, www vs non-www, https vs http. Use the exact URL format from GSC. |
| Page shows as stale but was just updated | Update the `last_published_date` field in the Hub record — the Hub doesn't automatically know when the live website changes |
| Stale flag not clearing after date update | Check that `last_published_date` is set to a date within the last 6 months |

## 9. Related modules
- [Keyword tracking and SEO](19-04_keyword_seo_tracking.md)
- [Generate an SEO content brief](19-06_generate_seo_brief.md)
- [Intelligence dashboard](19-01_intelligence_dashboard.md)

## 10. Screenshot placeholders
[insert screenshot: Full page inventory table sorted by stale flag]
[insert screenshot: Single page detail showing GSC metrics panel]

## 11. Automation notes
- GSC sync: writes to `search_console_snapshots`; after each sync, `website_pages.current_impressions`, `current_clicks`, `current_ctr`, `current_avg_position` are updated from the latest 28-day aggregate
- Stale flag: `needs_refresh = true` set automatically when `last_updated_at < now() - 180 days`
- No automatic linking between Hub page records and the live website — the Hub tracks the intent and performance; the live website is updated separately

## 12. Edge cases and limits
- The inventory is manually maintained — it does not automatically detect new pages added to the live website
- Archived pages remain in the inventory with GSC historical data intact — useful for reference
- If a page URL changes (redirect), update the `url_path` field in the Hub — the old URL will continue appearing in GSC for some time

## 13. Owner of the process
Admin / Director  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Log in as Admin
- [ ] GSC sync has run at least once
- [ ] At least one `keyword_targets` row exists

### Test cases

**TC-01 — Add a page to the inventory**
1. Go to Website pages → + Add Page
2. Fill in: URL = /passive-design, Type = Service, Primary keyword = "passive design builder Adelaide", Status = Live, Last published = [2 months ago]
3. Click Save
4. Expected DB: `website_pages` row with all fields, `needs_refresh = false` (updated < 6 months ago)
- [ ] Pass  [ ] Fail

**TC-02 — Stale flag triggers at 6 months**
1. Set `last_updated_at` on a page to 7 months ago (update DB directly or set `last_published_date` to 7 months ago)
2. Trigger the stale check (or wait for next sync)
3. Expected DB: `needs_refresh = true`
4. Expected UI: 🔴 stale flag visible on the page in the inventory table
- [ ] Pass  [ ] Fail

**TC-03 — GSC data populates on page**
1. After GSC sync, open a page whose URL appears in `search_console_snapshots`
2. Expected UI: `current_impressions`, `current_clicks`, `current_ctr`, `current_avg_position` all populated
3. Expected: values match the sum/average from `search_console_snapshots` for this page in the last 28 days
- [ ] Pass  [ ] Fail

**TC-04 — Stale flag clears after date update**
1. Take a page with `needs_refresh = true`
2. Update `last_published_date` to today, change status to Live
3. Save
4. Expected DB: `needs_refresh = false`
5. Expected UI: 🔴 stale flag no longer shown
- [ ] Pass  [ ] Fail

**TC-05 — Filter by status works**
1. Apply filter Status = Needs Update
2. Expected result: only pages with `status = 'needs_update'` visible
3. Apply filter Status = Live — only live pages visible
- [ ] Pass  [ ] Fail

**TC-06 — SEO brief link shows correct state**
1. For a page with no brief: expected UI shows "—" or "Generate" button in SEO brief column
2. After generating a brief (SOP 19-06): expected UI shows "✓" in SEO brief column
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Stale detection works at the 6-month boundary
- [ ] GSC data populates correctly from sync
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
