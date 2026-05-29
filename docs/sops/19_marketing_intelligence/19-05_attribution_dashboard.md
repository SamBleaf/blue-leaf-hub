---
sop_version: 1.0
last_reviewed: 2026-05-29
app_version: 1.0 — built 2026-05-29
screenshot_status: not_applicable
owner: Admin / Director
test_status: tested_2026-05-29 — ALL SKIP. Requires attribution_events data from live website tracking, social publishes (blocked by CRIT-01), and working intelligence dashboard (blocked by CRIT-02).
---

# SOP 19-05: Use the Attribution Dashboard

**Module:** Marketing — Intelligence tab → Attribution drill-down  
**SOP ID:** 19-05  
**Status:** Draft (built — not yet deployed)  
**Priority:** High

---

## 1. Who uses this
Admin, Director

## 2. When to use it
Monthly — to understand which sources, campaigns, and pieces of content are actually generating enquiries. Answers the question: "Is marketing working, and where specifically?"

## 3. What this does
Shows the source and journey of every enquiry — where the person first discovered Blue Leaf (first touch), what they engaged with along the way (assisted content), and what triggered them to finally enquire (last touch). Allows you to measure the real return on marketing investment.

**Attribution model used:**
- **First touch** — the first source that brought the person to the Blue Leaf website
- **Last touch** — the source that was active when the enquiry was submitted
- **Assisted** — every piece of content touched between first and last touch

Blue Leaf uses first touch + last touch (not weighted multi-touch) to keep the analysis simple and actionable. Both are shown — because first touch reveals what's building awareness, and last touch reveals what converts.

## 4. Before you start
- Attribution capture (P0) must be set up: website enquiry form posts UTM params to `POST /api/public/attribution`
- At least some enquiries must have arrived since attribution was set up
- Older enquiries (before P0 setup) will show "Direct / Unknown" as source — this is expected

## 5. Step-by-step process

**Opening the Attribution dashboard:**
1. Go to **Marketing → Intelligence**
2. In the "This Month" section, click any KPI number or click through to the Attribution drill-down
3. The Attribution page opens

**Source breakdown view:**
Shows total enquiries split by first-touch source, in descending order:

| Source | Count | % of total | Avg pipeline value |
|--------|-------|------------|-------------------|
| Organic search | 5 | 42% | $1.4M |
| Instagram | 3 | 25% | $1.1M |
| Direct | 2 | 17% | $0.9M |
| Referral | 2 | 16% | $1.6M |

> Referral typically shows the highest avg pipeline value — referrals have pre-qualified trust. This table helps you see where your best leads come from, not just where the most leads come from.

**Journey examples:**
Below the source breakdown, 3–5 example attribution journeys for recent leads are shown:

```
Mark Tanner — $1.8M project (Brighton)
First touch:    Instagram (passive design post) — 3 months ago
Assisted:       Viewed /passive-design page twice, opened 3 emails
Last touch:     Clicked "How We Build" link in email — submitted form
Days from first to enquiry: 94
```

Click any lead name to open their Lead detail in Sales Manager.

**Content attribution table:**
Shows every piece of content that appears in at least one assisted or last-touch attribution journey:

| Content | First-touch count | Last-touch count | Assisted count | Total attributed leads |
|---------|------------------|-----------------|----------------|----------------------|
| [Post title] | 2 | 1 | 5 | 8 |

> A piece of content with a high "Assisted count" but low "Last-touch count" is building trust and awareness — it's working, just not the closer. Don't cut it.

[insert screenshot: Source breakdown bar chart]
[insert screenshot: Attribution journey example cards]
[insert screenshot: Content attribution table]

## 6. What happens next
- Attribution data is read-only
- Use it to decide which sources to invest in, which content pieces to create more of, and which sources are underperforming relative to their effort
- High-referral, high-value leads → invest in SOP 17-xx (Referrers & Partners mailing list and CRM relationship maintenance)

## 7. Common mistakes
| Mistake | Why it happens | How to avoid it |
|---------|---------------|-----------------|
| Reading last-touch only | It's the most intuitive | Instagram might show 0 last-touch conversions but 15 first-touch — it's doing the top-of-funnel work. Cutting Instagram because "it doesn't convert" would be wrong. |
| Acting on small samples | Early in the attribution rollout, n = 3 or 4 | Don't make strategy changes based on less than 10 attributed enquiries. Build up 3 months of data first. |
| Ignoring "Direct / Unknown" | Seems like a gap | Direct often means word-of-mouth — people who heard about Blue Leaf through a conversation and typed the URL directly. High direct = strong brand awareness. |

## 8. Troubleshooting
| Problem | Solution |
|---------|----------|
| All leads show "Direct / Unknown" | UTM parameters are not being captured — check the website enquiry form is posting to `/api/public/attribution` with utm fields |
| Journey examples show leads with no attribution chain | The lead was created in the Hub manually (not via the website form) — Hub-created leads don't have website attribution events |
| Source breakdown shows "Other" for a large %" | utm_source values coming from external links aren't matching the known sources list — check utm tagging on social bios and link in bio tools |

## 9. Related modules
- [Content performance](19-03_content_performance.md)
- [Intelligence dashboard](19-01_intelligence_dashboard.md)

## 10. Screenshot placeholders
[insert screenshot: Full attribution dashboard — source breakdown + journey examples]
[insert screenshot: Content attribution table with first/last/assisted columns]

## 11. Automation notes
- `attribution_events` rows created by `POST /api/public/attribution` (no auth — public endpoint called by website JS)
- `enquiry_attribution` row created when enquiry form submits: computes first-touch, last-touch, assisted content list from the visitor's `session_id` chain in `attribution_events`
- Source breakdown: computed in code from `enquiry_attribution.first_touch_source` grouped and counted — no AI
- Journey examples: last 5 entries from `enquiry_attribution` joined with `leads` for display
- Content attribution: computed from `enquiry_attribution.first_touch_content_item_id`, `last_touch_content_item_id`, `assisted_content_item_ids` — no AI

## 12. Edge cases and limits
- Attribution window: only tracks sessions within 90 days before enquiry. If someone first visited 91+ days ago, that first touch is lost.
- Cookie-based visitor ID: if visitor clears cookies between first touch and enquiry, the session chain breaks — first touch lost, last touch retained
- Incognito / private browsing breaks the session chain — this affects ~10–20% of users
- Enquiries from countries outside Australia may trigger attribution events but show unusual source data

## 13. Owner of the process
Admin / Director  
Next review: 2026-11-29

---

## 14. Troubleshoot Agent Test Script

### Pre-test setup
- [ ] Log in as Admin
- [ ] P0 setup complete: `POST /api/public/attribution` endpoint active, website form posts to it
- [ ] At least 3 test attribution events created (simulate by POSTing to the endpoint with UTM params)
- [ ] At least 1 test enquiry submitted via website form after triggering attribution events

### Test cases

**TC-01 — Attribution event captured from website visit**
1. Simulate a website visit by posting to `POST /api/public/attribution`:
   `{ session_id: "test-session-1", event_type: "page_view", page_url: "/passive-design", utm_source: "instagram", utm_medium: "social" }`
2. Expected DB: `attribution_events` row created with all fields
- [ ] Pass  [ ] Fail

**TC-02 — Enquiry submission creates attribution summary**
1. Simulate a form submission: `POST /api/public/enquiry` with `session_id = "test-session-1"` and lead data
2. Expected DB: `leads` row created; `enquiry_attribution` row created with `lead_id`, `first_touch_source = 'instagram'`, `last_touch_source = 'instagram'`
3. Expected: `leads.first_touch_source = 'instagram'`, `leads.first_touch_medium = 'social'`
- [ ] Pass  [ ] Fail

**TC-03 — Multi-touch journey captured correctly**
1. Create 3 attribution events for `session_id = "test-session-2"`:
   - Visit 1: `utm_source = "instagram"`, `utm_medium = "social"`, `content_item_id = [item A]`
   - Visit 2: `utm_source = "google"`, `utm_medium = "organic"`, `page_url = "/passive-design"`
   - Visit 3: `utm_source = "email"`, `utm_medium = "email"`, `content_item_id = [item B]`
2. Submit enquiry with `session_id = "test-session-2"`
3. Expected DB in `enquiry_attribution`: `first_touch_source = 'instagram'`, `last_touch_source = 'email'`, `assisted_content_item_ids` contains both item A and B UUID, `total_sessions = 3`
- [ ] Pass  [ ] Fail

**TC-04 — Attribution dashboard source breakdown is accurate**
1. Go to Marketing → Intelligence → Attribution drill-down
2. Expected result: source breakdown matches the count of `enquiry_attribution.first_touch_source` values in DB
3. Verify the count for "instagram" in the UI matches the count of rows in `enquiry_attribution` where `first_touch_source = 'instagram'`
- [ ] Pass  [ ] Fail

**TC-05 — Journey examples render correctly**
1. Expected result: 3–5 example journeys shown with first touch, assisted content count, last touch, days to enquiry
2. Click a lead name — expected: navigates to that lead's detail in Sales Manager
- [ ] Pass  [ ] Fail

**TC-06 — Old lead with no attribution shows "Unknown"**
1. Manually create a lead in Sales Manager (not via website form)
2. Go to Attribution dashboard
3. Expected result: this lead does not appear in attribution data (no `enquiry_attribution` row created for manually entered leads)
- [ ] Pass  [ ] Fail

### Post-test checklist
- [ ] All test cases passed
- [ ] Attribution events captured correctly
- [ ] Multi-touch journey tracked correctly
- [ ] Source breakdown matches raw DB counts
- [ ] Update `test_status` in frontmatter
- [ ] Add entry to SOP_CHANGELOG.md
