---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built 2026-05-29
screenshot_status: not_applicable
owner: Admin / Director
test_status: untested
---

# SOP 19-06: Generate an SEO Content Brief

**Module:** Marketing — Intelligence tab → Website Pages → SEO Brief  
**SOP ID:** 19-06  
**Status:** Draft (built — not yet deployed)  
**Priority:** Medium

---

## 1. Who uses this
Admin, Director

## 2. When to use it
When you want to improve an existing website page's Google ranking, or when creating a new page and you want to know what it needs to rank for a specific keyword. Produces a brief that a writer (or the content AI) can work from directly.

## 3. What this does
Uses Claude (Sonnet — higher quality needed for SEO work) to generate a structured content brief for a specific keyword and website page. The brief includes: recommended title, H1, meta description, H2 structure, key questions to answer, word count target, internal link suggestions, and content angles specific to Blue Leaf.

**Cached for 90 days.** Regenerating before 90 days is wasteful — SEO signals change slowly. The system will warn you if you try to regenerate before the cache expires.

## 4. Before you start
- The website page must exist in the Hub page inventory (SOP 19-08)
- A keyword must be assigned to the page in `keyword_targets`
- First-time setup: no brief exists for this page → Generate
- Existing brief: review before regenerating — only regenerate if the keyword ranking has moved > 5 positions or the page has been significantly rewritten

## 5. Step-by-step process

**Generating a brief:**
1. Go to **Marketing → Intelligence → Website** (via "Improve page →" link, or directly from the Website Pages section)
2. Find the page you want to brief
3. Click **Generate SEO Brief**
4. The system runs a brief generation using the page's primary keyword and intent
5. Wait ~10–20 seconds for the brief to generate
6. The brief appears on the page detail with the following sections:

**Brief sections:**

| Section | What it gives you |
|---------|------------------|
| Recommended title | A compelling, keyword-optimised page title (< 60 characters) |
| Recommended H1 | The main heading — may differ from the title |
| Meta description | 150–160 character description for Google search results |
| Recommended H2s | 4–6 subheading suggestions covering the key questions searchers have |
| Key questions to answer | What a person searching this keyword actually wants to know |
| Word count target | How long the page should be based on what ranks on page 1 |
| Content angles | Specific perspectives Blue Leaf should take (performance, longevity, consequence — not generic builder content) |
| Internal link suggestions | Other Hub pages or website pages this page should link to |
| Schema markup type | Recommended structured data type for this page |

**Using the brief:**
- Share the brief with whoever is writing the page content
- In the Content Studio: go to Create tab, paste the keyword as the topic, select channel = Website Copy, paste the H2s from the brief into Additional Context
- The AI will use the brief structure to generate website-appropriate content

[insert screenshot: Page detail showing the Generate SEO Brief button]
[insert screenshot: Generated brief — all sections visible]

## 6. What happens next
- Brief stored in `seo_content_briefs` with `expires_at = now() + 90 days`
- `website_pages.seo_brief_generated_at` updated
- Brief used by the content AI when generating website copy for this page

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Regenerating every week | Wanting the latest recommendations | SEO briefs are stable for 90 days. The recommendations don't meaningfully change week to week. Regenerating frequently wastes API budget. |
| Ignoring the internal link suggestions | Seems minor | Internal links are one of the most underrated ranking signals. Every page should link to related pages. The brief's suggestions are based on the content cluster structure — follow them. |
| Using the title recommendation verbatim without checking character count | Copy-paste instinct | Always check the recommended title in a character counter — if it exceeds 60 characters, Google will truncate it in search results. |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| Brief generation fails | Check Anthropic API key is valid and has sufficient quota |
| Brief recommendations seem generic | The keyword may be too broad — "builder Adelaide" produces generic output. Narrow the keyword to something Blue Leaf specifically can dominate, e.g. "passive design builder Adelaide". |
| "Brief is less than 90 days old" warning | System preventing premature regeneration — override is available for Admins if the page content has significantly changed |

## 9. Related modules
- [Keyword tracking and SEO](19-04_keyword_seo_tracking.md)
- [Manage website page inventory](19-08_website_page_inventory.md)
- [Generate content with AI](../18_marketing_agent/18-02_generate_content_ai.md)

## 10. Screenshot placeholders
[insert screenshot: Website page detail with brief visible — all sections]
[insert screenshot: Brief expiry date and "Regenerate" button with warning]

## 11. Automation notes
- SEO brief generation: `POST /api/intelligence/pages/:id/brief` → Claude Sonnet call with keyword + intent + page URL
- Brief cached in `seo_content_briefs.expires_at = now() + 90 days`
- Regeneration blocked if `generated_at > now() - 90 days` (warning shown; Admin can override)
- Brief approved by Admin: `seo_content_briefs.approved_by` and `approved_at` set
- Brief used downstream: when generating website content in Create tab with a page context set, the brief is included in the AI prompt automatically

## 12. Edge cases and limits
- Brief generation uses Sonnet (not Haiku) — higher quality, higher cost. One brief = approximately $0.05–0.10 USD in API cost.
- Briefs expire at 90 days — after expiry, a "Brief expired" badge shows and the brief can be regenerated
- If a keyword changes ranking by > 5 positions, the system automatically flags the brief as "may need review" even if not yet expired
- Competing pages analysis (what's on page 1) requires either an external API call (Ahrefs) or a manual step — initially this section will show "Not available" until integrated

## 13. Owner of the process
Admin / Director  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Log in as Admin
- [ ] At least one `website_pages` row exists with a `primary_keyword` set
- [ ] Anthropic API key valid and has quota
- [ ] The keyword has `intent` set (commercial/informational/navigational)

### Test cases

**TC-01 — Generate a brief successfully**
1. Open a website page detail that has no existing brief
2. Click Generate SEO Brief
3. Wait up to 20 seconds
4. Expected result: brief appears with all sections: recommended_title, recommended_h1, meta_description, recommended_h2s, key_questions_to_answer, word_count_target, content_angles, internal_link_suggestions, schema_markup_type
5. Expected DB: `seo_content_briefs` row with `website_page_id` set, `expires_at = now() + 90 days`, all fields non-null
- [ ] Pass  [ ] Fail

**TC-02 — Brief generation fails gracefully on API error**
1. Temporarily set an invalid API key in the environment (test only — restore immediately after)
2. Click Generate SEO Brief
3. Expected result: error message shown to user; no partial brief saved; previous brief (if any) not overwritten
- [ ] Pass  [ ] Fail

**TC-03 — Regeneration blocked before 90-day expiry**
1. After TC-01 (brief generated < 1 minute ago)
2. Click Generate SEO Brief again
3. Expected result: warning message: "Brief was generated [X days] ago and expires in [Y days]. Regenerate anyway?" — not silently regenerated
4. If Admin clicks "Regenerate anyway" — expected: brief regenerated, new `generated_at` timestamp
- [ ] Pass  [ ] Fail

**TC-04 — Expired brief shows badge and can be regenerated**
1. Manually set `seo_content_briefs.expires_at` to a past date for a brief
2. Open the website page detail
3. Expected result: "Brief expired" badge visible; Generate SEO Brief button active (not blocked)
- [ ] Pass  [ ] Fail

**TC-05 — Brief content is Blue Leaf–specific, not generic**
1. Generate a brief for keyword "passive design builder Adelaide"
2. Review the `content_angles` section
3. Expected result: content angles reference Blue Leaf's differentiators (weather-tightness, performance before appearance, Adelaide climate, thermal mass, design-stage decisions) — not generic "choose a builder who has experience" advice
- [ ] Pass  [ ] Fail (qualitative check — use judgment)

**TC-06 — Title recommendation is within character limit**
1. Check the `recommended_title` field on any generated brief
2. Expected result: character count ≤ 60 characters
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Brief generates within 20 seconds
- [ ] Caching and expiry logic works correctly
- [ ] Brief content is specific to Blue Leaf's brand (not generic SEO filler)
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
