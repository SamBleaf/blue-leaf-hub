---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built 2026-05-29
screenshot_status: not_applicable
owner: Admin / Director
test_status: tested_2026-05-29 — ALL SKIP. Requires GSC sync to have run at least once and keyword_targets rows to exist. No data in system yet. Intelligence dashboard broken (CRIT-02) so Google Opportunity section cannot be verified.
---

# SOP 19-04: Keyword Tracking and SEO Management

**Module:** Marketing — Intelligence tab → SEO drill-down  
**SOP ID:** 19-04  
**Status:** Draft (built — not yet deployed)  
**Priority:** High

---

## 1. Who uses this
Admin, Director

## 2. When to use it
Weekly review of Google Search Console data. Use this to know which keywords Blue Leaf is ranking for, which ones are close to page 1, and where to invest content effort for organic growth.

## 3. What this does
Manages a list of target keywords Blue Leaf is trying to rank for. Pulls weekly data from Google Search Console to show current position, trend, impressions, and CTR per keyword. Surfaces "opportunity" keywords — those in positions 6–15 with meaningful search volume — where a targeted content improvement could push onto page 1.

## 4. Before you start
- `GOOGLE_SEARCH_CONSOLE_SITE_URL` must be set in Railway env vars
- Google OAuth credentials must have `webmasters.readonly` scope added
- First GSC sync must have been run (or scheduled to run weekly on Sunday 3am)
- At least one `keyword_targets` row must exist (you add these manually)

## 5. Step-by-step process

**Adding a keyword target:**
1. Go to **Marketing → Intelligence → SEO** (via the "Google Opportunity" section's "See all →" link)
2. Click **+ Add Keyword**
3. Fill in:
   - **Keyword** — the exact search phrase you want to rank for (e.g. "custom home builder Adelaide")
   - **Intent** — Commercial (ready to hire) / Informational (researching) / Navigational (looking for Blue Leaf specifically)
   - **Target page URL** — which website page should rank for this keyword (e.g. `/custom-homes`)
   - **Target position** — what position you want to reach (default: 5)
   - **Cluster** — which content cluster this belongs to (e.g. "Custom Home Building Adelaide")
   - **Priority** — High / Medium / Low / Watch
4. Click Save

**Reading the keyword table:**

| Column | What it shows |
|--------|--------------|
| Keyword | The search phrase |
| Position | Current average position in Google (from GSC, last 28 days) |
| Trend | ↑ improving / ↓ declining / → stable |
| Impressions | How many times Blue Leaf appeared for this search in the last 28 days |
| CTR | Click-through rate — what % of impressions resulted in a click |
| Target page | Which page is ranking (or should be ranking) |
| Opportunity | 🔴 = position 6–15 with impressions > 100 — these are the ones to prioritise |

**Acting on opportunities:**

Position 1–5: Maintaining well. Focus on not losing position. Update page content every 6 months.

Position 6–15 with high impressions (🔴 Opportunity): This is where to focus. The page exists and Google thinks it's relevant — it just needs to be better. Actions:
- Click "Improve page →" to open the Website Page inventory for that page
- Generate a new SEO brief (SOP 19-06) to understand what the page needs
- After improving: typically 4–8 weeks before position movement is visible in GSC

Position 16–50: Building. Need either better content or more links. Create spoke pages in the relevant cluster.

Not ranking: Either no page exists for this keyword, or the page is too new. Create new content via SOP 18-02 with this keyword as the topic.

**Viewing trend data:**
1. Click on any keyword in the table
2. Keyword detail panel opens showing:
   - 12-week position trend (line chart)
   - Impressions over time
   - Top 3 pages currently ranking for this keyword
   - Competing pages (what's on page 1 now and what they cover)

[insert screenshot: Keyword table with position, trend, impressions, CTR, opportunity flag]
[insert screenshot: Keyword detail panel — 12-week position trend chart]

## 6. What happens next
- Table is read-only (data from GSC + your target settings)
- Acting on opportunities creates content (SOP 18-02) or generates SEO briefs (SOP 19-06)
- Position improvements appear 4–8 weeks after content changes

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Adding too many keywords | More = better thinking | Start with 10–15 keywords. Too many dilutes focus — you can't create strong content for 50 keywords simultaneously. Blue Leaf's target list has ~20 priority keywords. |
| Targeting only high-competition keywords | Ambition over strategy | "Custom home builder Adelaide" is very competitive. "Passive design builder Adelaide" is medium competition and far more aligned with Blue Leaf's differentiation. Target keywords that match what makes Blue Leaf different. |
| Expecting fast results | SEO takes time | Position improvements from a content change take 4–8 weeks minimum. Don't change strategy week to week — let changes compound. |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| Position shows "—" for all keywords | GSC sync has not run, or OAuth token missing `webmasters.readonly` scope |
| Keyword appears in GSC but not in my target list | Add it manually to `keyword_targets` — GSC shows everything Google has data on, but the system only tracks what you've explicitly added as a target |
| CTR very low despite high impressions | Title/meta description not compelling enough for that keyword intent. Generate a new SEO brief (SOP 19-06) to get title/description recommendations. |

## 9. Related modules
- [Generate an SEO content brief](19-06_generate_seo_brief.md)
- [Manage website page inventory](19-08_website_page_inventory.md)
- [Intelligence dashboard](19-01_intelligence_dashboard.md)

## 10. Screenshot placeholders
[insert screenshot: SEO keyword table with opportunity flags]
[insert screenshot: Add keyword form]
[insert screenshot: Keyword detail — position trend chart over 12 weeks]

## 11. Automation notes
- GSC sync: `POST /api/intelligence/sync/gsc` runs every Sunday 3am
- Pulls top 500 queries per week from GSC, stores in `search_console_snapshots`
- `keyword_targets.current_position` updated after each sync (average position from last 28 days of GSC data)
- `position_trend` computed: current_position vs 4-week-ago average → up/down/stable/new
- Opportunity flag computed: `current_position BETWEEN 6 AND 15 AND monthly_impressions > 100`

## 12. Edge cases and limits
- GSC data has a 2–3 day lag — today's ranking changes won't appear for 2–3 days
- GSC only shows data for keywords where Blue Leaf has had at least 1 impression — newly targeted keywords with no ranking at all won't appear until Google starts showing the page for those searches
- Position is an average over 28 days — a keyword that fluctuates daily will show a blended position
- Keywords are case-sensitive in the target list but GSC data is normalised to lowercase

## 13. Owner of the process
Admin / Director  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Log in as Admin
- [ ] `GOOGLE_SEARCH_CONSOLE_SITE_URL` set in Railway
- [ ] Google OAuth has `webmasters.readonly` scope
- [ ] At least one GSC sync has been run manually (`POST /api/intelligence/sync/gsc`)

### Test cases

**TC-01 — Add a keyword target**
1. Go to SEO section → + Add Keyword
2. Fill in: Keyword = "custom home builder Adelaide", Intent = Commercial, Target Page = /custom-homes, Priority = High
3. Click Save
4. Expected DB: `keyword_targets` row with all fields populated
- [ ] Pass  [ ] Fail

**TC-02 — GSC sync populates position data**
1. Trigger the GSC sync manually: `POST /api/intelligence/sync/gsc`
2. Wait for completion (~30 seconds)
3. Expected DB: `search_console_snapshots` rows created for current week; `keyword_targets.current_position` updated for keywords that appear in GSC data
4. Expected UI: position column shows a number (not "—") for keywords where GSC has data
- [ ] Pass  [ ] Fail

**TC-03 — Trend computed correctly**
1. After two GSC syncs one week apart, check a keyword's `position_trend`
2. If current position < previous position: expected `position_trend = 'up'` (lower number = better rank)
3. If current > previous: expected `position_trend = 'down'`
4. If unchanged: expected `position_trend = 'stable'`
- [ ] Pass  [ ] Fail

**TC-04 — Opportunity flag appears for position 6–15 with impressions > 100**
1. Manually set a keyword to have `current_position = 10` and `monthly_impressions = 250` in the DB (or wait for real data)
2. Expected UI: that keyword shows 🔴 Opportunity flag
3. A keyword at position 3 with 1000 impressions should NOT show the flag
- [ ] Pass  [ ] Fail

**TC-05 — Filter and sort work**
1. Filter by Priority = High
2. Expected result: only High priority keywords visible
3. Sort by Impressions descending
4. Expected result: highest impression keywords at top
- [ ] Pass  [ ] Fail

**TC-06 — Keyword detail panel loads**
1. Click a keyword that has GSC position data
2. Expected result: detail panel opens with 12-week position trend chart visible
3. Expected: no JavaScript error if trend data is sparse (< 12 weeks of data)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] GSC sync runs without error
- [ ] Position data populates correctly
- [ ] Opportunity flags show/hide based on position and impressions
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
